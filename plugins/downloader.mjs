/**
 * ═══════════════════════════════════════════
 *  YouTube & TikTok Downloader Plugin
 *  For Ikuyo WhatsApp Bot
 * ═══════════════════════════════════════════
 *
 * Commands:
 *   /play <query>     — Search YouTube & send interactive list (plays on selection)
 *   /playbtn <query>  — Alias for /play (button-based selection)
 *   /ytmp3 <url>      — Download YouTube audio as MP3 (with confirmation buttons)
 *   /ytmp4 <url>      — Download YouTube video as MP4 (with confirmation buttons)
 *   /ytsearch <query> — Search YouTube, show results + action buttons
 *   /tiktok <url>     — Download TikTok video
 *
 * Exports:
 *   handleButtonResponse(sock, opts)  — Route button clicks
 *   handleListResponse(sock, opts)    — Route list-row selections
 */

import yts from 'yt-search';
import ytdl from 'ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Paths & Temp Directory ────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '..', 'temp');
fs.ensureDirSync(TEMP_DIR);

// ─── Constants ─────────────────────────────────────────────────────

const MAX_VIDEO_SIZE = 16 * 1024 * 1024; // 16 MB — WhatsApp media limit
const FFMPEG_AUDIO_BITRATE = 128;
const YT_SEARCH_LIMIT = 5;   // results shown alongside /play
const YT_RESULTS_LIMIT = 10; // results shown by /ytsearch
const SEARCH_STORE_TTL = 10 * 60 * 1000; // 10 minutes

// ─── In-Memory Search Results Store ────────────────────────────────
// Keyed by sender JID.  Entries are pruned every 2 minutes.

const searchStore = new Map();

/** Store search results for a sender */
function storeSearchResults(senderJid, data) {
    searchStore.set(senderJid, { ...data, timestamp: Date.now() });
}

/** Retrieve (and keep) search results for a sender. Returns null if expired/missing. */
function getSearchResults(senderJid) {
    const entry = searchStore.get(senderJid);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > SEARCH_STORE_TTL) {
        searchStore.delete(senderJid);
        return null;
    }
    return entry;
}

/** Periodic cleanup — runs every 2 minutes */
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of searchStore) {
        if (now - entry.timestamp > SEARCH_STORE_TTL) {
            searchStore.delete(key);
        }
    }
}, 2 * 60 * 1000);

// ─── Utility Helpers ───────────────────────────────────────────────

function isYouTubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)/.test(url);
}

function extractUrl(text) {
    const match = text?.match(/(https?:\/\/[^\s]+)/);
    return match ? match[1] : null;
}

function formatViews(n) {
    if (!n) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatFileSize(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

/** Strip characters that are illegal in filenames */
function sanitizeFilename(name) {
    return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').substring(0, 200).trim() || 'audio';
}

/** Remove temp files (swallow errors) */
async function cleanup(...files) {
    for (const f of files) {
        try { if (f) await fs.remove(f); } catch { /* ignore */ }
    }
}

/** Check whether ffmpeg is reachable */
async function isFfmpegAvailable() {
    return new Promise((resolve) => {
        ffmpeg.getAvailableFormats((err) => resolve(!err));
    });
}

/**
 * Extract bare sender number from a JID
 * @param {string} jid  e.g. "628xxx@s.whatsapp.net"
 * @returns {string}    e.g. "628xxx"
 */
function senderNumber(jid) {
    return (jid || '').split('@')[0];
}

/**
 * Truncate a string to maxLen, appending "…" if truncated
 */
function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

// ─── Download Helpers ──────────────────────────────────────────────

/**
 * Download audio from a YouTube URL and convert to MP3 via ffmpeg.
 * @param {string}  url         YouTube URL
 * @param {string}  outputPath  Destination file path (.mp3)
 * @returns {Promise<string>}   Resolves with outputPath
 */
function downloadAudioAsMp3(url, outputPath) {
    return new Promise((resolve, reject) => {
        const stream = ytdl(url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25, // 32 MB internal buffer
        });

        ffmpeg(stream)
            .audioBitrate(FFMPEG_AUDIO_BITRATE)
            .format('mp3')
            .on('error', (err) => {
                console.error('[FFMPEG audio]', err.message);
                reject(err);
            })
            .on('end', () => resolve(outputPath))
            .save(outputPath);
    });
}

/**
 * Download video from YouTube (format 18 — 360p MP4 with audio).
 * This format is pre-muxed, so no ffmpeg re-encode is needed.
 * @param {string}  url         YouTube URL
 * @param {string}  outputPath  Destination file path (.mp4)
 * @returns {Promise<string>}   Resolves with outputPath
 */
function downloadVideoMp4(url, outputPath) {
    return new Promise((resolve, reject) => {
        const stream = ytdl(url, {
            quality: '18',
            highWaterMark: 1 << 25,
        });

        const writer = fs.createWriteStream(outputPath);
        stream.pipe(writer);

        stream.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', () => resolve(outputPath));
    });
}

// ════════════════════════════════════════════════════════════════════
//  SEND HELPERS — List Messages & Action Buttons
// ════════════════════════════════════════════════════════════════════

/**
 * Send an interactive list message with search results.
 * Falls back to plain text on failure.
 */
async function sendSearchList(sock, m, query, videos) {
    const top = videos.slice(0, YT_SEARCH_LIMIT);

    try {
        await sock.sendMessage(m.from, {
            text: `🎵 *Hasil pencarian: ${query}*\n\nPilih lagu yang ingin diputar:`,
            footer: `Ikuyo Bot · ${top.length} hasil`,
            buttonText: '☰ Pilih Lagu',
            sections: [
                {
                    title: '🎵 Hasil Pencarian',
                    rows: top.map((v, i) => ({
                        title: `${i + 1}. ${truncate(v.title, 50)}`,
                        rowId: `yt_play_${i}`,
                        description: `⏱ ${v.timestamp || '-'} │ 👁 ${formatViews(v.views)} │ ${v.author?.name || '-'}`,
                    })),
                },
                {
                    title: '⚙️ Opsi',
                    rows: [
                        { title: '❌ Batal', rowId: 'yt_cancel', description: 'Batalkan pemilihan' },
                    ],
                },
            ],
        }, { quoted: m.key });
    } catch (err) {
        console.error('[PLAY LIST]', err.message);
        // Fallback: send plain text
        let text = `📋 *Hasil Pencarian:*\n\n`;
        top.forEach((v, i) => {
            text += `${i + 1}. *${v.title}*\n`;
            text += `   ⏱ ${v.timestamp || '-'} │ 👁 ${formatViews(v.views)} │ 📡 ${v.author?.name || '-'}\n\n`;
        });
        text += '───────────────────\n';
        text += '💡 Ketik nomor lagu untuk diputar, atau kirim ulang */play query* untuk langsung memutar #1.';
        await m.reply(text);
    }
}

/**
 * Send quick-reply action buttons after ytsearch text results.
 */
async function sendActionButtons(sock, m, prefix, videos) {
    try {
        await sock.sendMessage(m.from, {
            text: `📌 Ketik *${prefix}play <nomor>* atau gunakan button di bawah:`,
            footer: 'Ikuyo Bot · YouTube Downloader',
            buttons: [
                { buttonId: 'yt_play_0', buttonText: { displayText: '🎵 Play #1' }, type: 1 },
                { buttonId: 'yt_mp3_0', buttonText: { displayText: '📥 MP3 #1' }, type: 1 },
                { buttonId: 'yt_mp4_0', buttonText: { displayText: '🎬 MP4 #1' }, type: 1 },
            ],
            headerType: 1,
        }, { quoted: m.key });
    } catch (err) {
        console.error('[ACTION BUTTONS]', err.message);
        // Fallback: silent — text results are already shown
    }
}

/**
 * Send confirmation buttons before downloading a URL.
 */
async function sendConfirmButtons(sock, m, title, mode) {
    const isMp3 = mode === 'mp3';
    try {
        await sock.sendMessage(m.from, {
            text: `🎵 *${title}*\n\nKonfirmasi download:`,
            footer: 'Ikuyo Bot · YouTube Downloader',
            buttons: [
                {
                    buttonId: 'yt_confirm_download',
                    buttonText: { displayText: `✅ Download ${isMp3 ? 'MP3' : 'MP4'}` },
                    type: 1,
                },
                {
                    buttonId: isMp3 ? 'yt_switch_mp4' : 'yt_switch_mp3',
                    buttonText: { displayText: isMp3 ? '🔄 Switch to MP4' : '🔄 Switch to MP3' },
                    type: 1,
                },
                {
                    buttonId: 'yt_cancel',
                    buttonText: { displayText: '❌ Batal' },
                    type: 1,
                },
            ],
            headerType: 1,
        }, { quoted: m.key });
    } catch (err) {
        console.error('[CONFIRM BUTTONS]', err.message);
    }
}

// ════════════════════════════════════════════════════════════════════
//  EXECUTE HELPERS — Play / MP3 / MP4 from a video object or URL
// ════════════════════════════════════════════════════════════════════

/**
 * Play a video's audio in chat (as audio message).
 * @param {object} sock   Baileys socket
 * @param {object} m      Serialized message
 * @param {object} video  yt-search video object
 */
async function executePlay(sock, m, video) {
    await m.reply(`⏳ Mengunduh audio *${truncate(video.title, 60)}*...`);

    const id = Date.now();
    const mp3Path = path.join(TEMP_DIR, `${id}.mp3`);

    try {
        await downloadAudioAsMp3(video.url, mp3Path);
        const stats = await fs.stat(mp3Path);

        await sock.sendMessage(m.from, {
            audio: { url: mp3Path },
            mimetype: 'audio/mpeg',
            fileName: `${sanitizeFilename(video.title)}.mp3`,
            ptt: false,
        }, { quoted: m.key });

        await m.reply(
            `🎵 *${video.title}*\n\n` +
            `⏱ Durasi  : ${video.timestamp || '-'}\n` +
            `👁 Views   : ${formatViews(video.views)}\n` +
            `📡 Channel : ${video.author?.name || '-'}\n` +
            `📦 Ukuran  : ${formatFileSize(stats.size)}\n` +
            `🔗 ${video.url}`
        );
    } catch (err) {
        console.error('[PLAY]', err);
        await m.reply(`❌ Gagal mengunduh audio!\n\n\`\`\`${err.message}\`\`\``);
    } finally {
        await cleanup(mp3Path);
    }
}

/**
 * Download and send a video's audio as MP3 document.
 * @param {object} sock   Baileys socket
 * @param {object} m      Serialized message
 * @param {object} video  yt-search video object  OR  { url, title, ... }
 */
async function executeMp3Download(sock, m, video) {
    const title = video.title || 'Unknown';

    await m.reply(`⏳ Mengunduh MP3 *${truncate(title, 60)}*...`);

    const id = Date.now();
    const mp3Path = path.join(TEMP_DIR, `${id}.mp3`);

    try {
        await downloadAudioAsMp3(video.url, mp3Path);
        const stats = await fs.stat(mp3Path);

        await sock.sendMessage(m.from, {
            document: { url: mp3Path },
            mimetype: 'audio/mpeg',
            fileName: `${sanitizeFilename(title)}.mp3`,
            caption:
                `🎵 *${title}*\n\n` +
                `⏱ Durasi  : ${video.timestamp || formatDuration(video.seconds) || '-'}\n` +
                `👁 Views   : ${formatViews(video.views)}\n` +
                `📡 Channel : ${video.author?.name || video.channel || '-'}\n` +
                `📦 Ukuran  : ${formatFileSize(stats.size)}`,
        }, { quoted: m.key });
    } catch (err) {
        console.error('[MP3 DL]', err);
        await m.reply(`❌ Gagal mengunduh MP3!\n\n\`\`\`${err.message}\`\`\``);
    } finally {
        await cleanup(mp3Path);
    }
}

/**
 * Download and send a video as MP4.
 * @param {object} sock   Baileys socket
 * @param {object} m      Serialized message
 * @param {object} video  yt-search video object  OR  { url, title, ... }
 */
async function executeMp4Download(sock, m, video) {
    const title = video.title || 'Unknown';

    await m.reply(`⏳ Mengunduh video *${truncate(title, 60)}*...\n⏳ Proses ini mungkin memakan waktu beberapa saat.`);

    const id = Date.now();
    const mp4Path = path.join(TEMP_DIR, `${id}.mp4`);

    try {
        await downloadVideoMp4(video.url, mp4Path);
        const stats = await fs.stat(mp4Path);

        if (stats.size > MAX_VIDEO_SIZE) {
            await m.reply(
                `⚠️ Ukuran video (*${formatFileSize(stats.size)}*) melebihi batas WhatsApp (~16 MB).\n` +
                `Video tetap akan dikirim, namun mungkin gagal diterima.`
            );
        }

        await sock.sendMessage(m.from, {
            video: { url: mp4Path },
            mimetype: 'video/mp4',
            caption:
                `🎬 *${title}*\n\n` +
                `⏱ Durasi  : ${video.timestamp || formatDuration(video.seconds) || '-'}\n` +
                `👁 Views   : ${formatViews(video.views)}\n` +
                `📡 Channel : ${video.author?.name || video.channel || '-'}\n` +
                `📦 Ukuran  : ${formatFileSize(stats.size)}\n` +
                `🔗 ${video.url}`,
        }, { quoted: m.key });
    } catch (err) {
        console.error('[MP4 DL]', err);
        await m.reply(`❌ Gagal mengunduh video!\n\n\`\`\`${err.message}\`\`\``);
    } finally {
        await cleanup(mp4Path);
    }
}

// ════════════════════════════════════════════════════════════════════
//  COMMAND HANDLERS
// ════════════════════════════════════════════════════════════════════

// ─── /play <query>  &  /playbtn <query> ────────────────────────────

async function handlePlay(m, sock, query) {
    if (!query) {
        return m.reply(
            '⚠️ Masukkan judul lagu!\n\n' +
            '📌 Contoh:\n' +
            '  *.play lalisa blackpink*\n' +
            '  *.play nostalgic pop indonesia*'
        );
    }

    // If the user pastes a YouTube URL, delegate to ytmp3
    const directUrl = extractUrl(query);
    if (directUrl && isYouTubeUrl(directUrl)) {
        return handleYtmp3(m, sock, query);
    }

    await m.reply(`⏳ Mencari *${query}*...`);

    // Search YouTube
    let search;
    try {
        search = await yts(query);
    } catch (err) {
        return m.reply(`❌ Gagal mencari: ${err.message}`);
    }

    if (!search.videos || search.videos.length === 0) {
        return m.reply('❌ Tidak ditemukan hasil untuk pencarian tersebut.\nCoba gunakan kata kunci yang berbeda.');
    }

    const videos = search.videos;

    // Store results for button callbacks (TTL 10 min)
    storeSearchResults(m.sender, {
        type: 'search',
        videos,
        query,
    });

    // ── Primary: send interactive list ──
    await sendSearchList(sock, m, query, videos);
}

// ─── /ytmp3 <url> ──────────────────────────────────────────────────

async function handleYtmp3(m, sock, fullArgs) {
    const url = extractUrl(fullArgs);

    if (!url) {
        return m.reply(
            '⚠️ Masukkan URL YouTube!\n\n' +
            '📌 Contoh:\n' +
            '  *.ytmp3 https://youtube.com/watch?v=xxxxx*'
        );
    }
    if (!isYouTubeUrl(url)) {
        return m.reply('❌ URL YouTube tidak valid!\nPastikan URL dimulai dengan *https://youtube.com/* atau *https://youtu.be/*');
    }
    if (!ytdl.validateURL(url)) {
        return m.reply('❌ URL YouTube tidak valid atau video tidak dapat diakses.');
    }

    await m.reply('⏳ Mendapatkan informasi video...');

    // Fetch video metadata
    let info;
    try {
        info = await ytdl.getBasicInfo(url);
    } catch (err) {
        return m.reply(`❌ Gagal mendapatkan info video: ${err.message}`);
    }

    const details = info.videoDetails;
    const title = details?.title || 'Unknown';
    const duration = details?.lengthSeconds;
    const views = details?.viewCount;
    const channel = details?.ownerChannelName || 'Unknown';

    // Store URL info for button callbacks
    storeSearchResults(m.sender, {
        type: 'url_download',
        url,
        mode: 'mp3',
        title,
        duration,
        views,
        channel,
    });

    // Send info card
    await m.reply(
        `🎵 *${title}*\n\n` +
        `⏱ Durasi  : ${formatDuration(duration)}\n` +
        `👁 Views   : ${formatViews(views)}\n` +
        `📡 Channel : ${channel}\n` +
        `🔗 ${url}`
    );

    // ── Primary: send confirmation buttons ──
    await sendConfirmButtons(sock, m, title, 'mp3');

    // NOTE: Download happens only when user clicks "✅ Download" button.
    // The handleButtonResponse function will pick it up.
}

// ─── /ytmp4 <url> ──────────────────────────────────────────────────

async function handleYtmp4(m, sock, fullArgs) {
    const url = extractUrl(fullArgs);

    if (!url) {
        return m.reply(
            '⚠️ Masukkan URL YouTube!\n\n' +
            '📌 Contoh:\n' +
            '  *.ytmp4 https://youtube.com/watch?v=xxxxx*'
        );
    }
    if (!isYouTubeUrl(url)) {
        return m.reply('❌ URL YouTube tidak valid!');
    }
    if (!ytdl.validateURL(url)) {
        return m.reply('❌ URL YouTube tidak valid atau video tidak dapat diakses.');
    }

    await m.reply('⏳ Mendapatkan informasi video...');

    let info;
    try {
        info = await ytdl.getBasicInfo(url);
    } catch (err) {
        return m.reply(`❌ Gagal mendapatkan info video: ${err.message}`);
    }

    const details = info.videoDetails;
    const title = details?.title || 'Unknown';
    const duration = details?.lengthSeconds;
    const views = details?.viewCount;
    const channel = details?.ownerChannelName || 'Unknown';

    // Store URL info for button callbacks
    storeSearchResults(m.sender, {
        type: 'url_download',
        url,
        mode: 'mp4',
        title,
        duration,
        views,
        channel,
    });

    // Send info card
    await m.reply(
        `🎬 *${title}*\n\n` +
        `⏱ Durasi  : ${formatDuration(duration)}\n` +
        `👁 Views   : ${formatViews(views)}\n` +
        `📡 Channel : ${channel}\n` +
        `🔗 ${url}`
    );

    // ── Primary: send confirmation buttons ──
    await sendConfirmButtons(sock, m, title, 'mp4');

    // NOTE: Download happens only when user clicks "✅ Download" button.
}

// ─── /ytsearch <query> ─────────────────────────────────────────────

async function handleYtsearch(m, sock, query) {
    if (!query) {
        return m.reply(
            '⚠️ Masukkan kata kunci pencarian!\n\n' +
            '📌 Contoh:\n' +
            '  *.ytsearch blackpink*'
        );
    }

    await m.reply(`⏳ Mencari *${query}*...`);

    let search;
    try {
        search = await yts(query);
    } catch (err) {
        return m.reply(`❌ Gagal mencari: ${err.message}`);
    }

    if (!search.videos || search.videos.length === 0) {
        return m.reply('❌ Tidak ditemukan hasil untuk pencarian tersebut.');
    }

    const videos = search.videos.slice(0, YT_RESULTS_LIMIT);

    // Store results for button callbacks
    storeSearchResults(m.sender, {
        type: 'search',
        videos: search.videos,
        query,
    });

    // Build results text (existing behaviour)
    let text = `🔍 *Hasil Pencarian YouTube:*\n`;
    text += `📦 "${query}" — ${videos.length} hasil ditemukan\n\n`;

    videos.forEach((v, i) => {
        text += `${i + 1}. *${v.title}*\n`;
        text += `   ⏱ ${v.timestamp || '-'} │ 👁 ${formatViews(v.views)} │ 📡 ${v.author?.name || '-'}\n`;
        text += `   🔗 ${v.url}\n\n`;
    });

    text += '───────────────────\n';
    text += '💡 Gunakan *.play <judul>* untuk memutar lagu';
    text += ' atau *.ytmp3 <url>* untuk download audio.';

    // WhatsApp text limit is ~4096 characters — split if needed
    if (text.length > 4000) {
        const parts = [];
        let current = '';
        for (const line of text.split('\n')) {
            if ((current + line + '\n').length > 4000) {
                parts.push(current.trimEnd());
                current = line + '\n';
            } else {
                current += line + '\n';
            }
        }
        if (current.trim()) parts.push(current.trimEnd());

        for (const part of parts) {
            await m.reply(part);
        }
    } else {
        await m.reply(text);
    }

    // ── New: send action buttons ──
    const prefix = m.prefix || '/';
    await sendActionButtons(sock, m, prefix, search.videos);
}

// ─── /tiktok <url> ─────────────────────────────────────────────────

async function handleTiktok(m, sock, fullArgs) {
    const url = extractUrl(fullArgs);

    if (!url) {
        return m.reply(
            '⚠️ Masukkan URL TikTok!\n\n' +
            '📌 Contoh:\n' +
            '  *.tiktok https://vt.tiktok.com/xxxxx*'
        );
    }

    if (!url.includes('tiktok.com')) {
        return m.reply('❌ URL TikTok tidak valid!\nPastikan URL berisi *tiktok.com*');
    }

    await m.reply('⏳ Mengunduh video TikTok...');

    const id = Date.now();
    const filePath = path.join(TEMP_DIR, `${id}_tiktok.mp4`);

    try {
        // Use tiklydown API to fetch video download URL
        const { data } = await axios.get(
            `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
            { timeout: 15000 }
        );

        // Try multiple video URL fields the API might return
        const videoUrl = data?.data?.video
            || data?.data?.hdplay
            || data?.data?.wmplay
            || data?.data?.play;

        if (!videoUrl) {
            throw new Error('Gagal mendapatkan link video dari API');
        }

        // Stream download to file
        const writer = fs.createWriteStream(filePath);
        const response = await axios.get(videoUrl, { responseType: 'stream', timeout: 30000 });
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const stats = await fs.stat(filePath);

        const caption = [
            `🎬 *Video TikTok*`,
            data?.data?.title ? `\n${data.data.title}` : '',
            `\n📦 Ukuran: ${formatFileSize(stats.size)}`,
        ].join('');

        await sock.sendMessage(m.from, {
            video: { url: filePath },
            mimetype: 'video/mp4',
            caption: caption.trim(),
        }, { quoted: m.key });

    } catch (err) {
        console.error('[TIKTOK]', err);
        await m.reply(
            `❌ Gagal mengunduh video TikTok!\n\n` +
            `\`\`\`${err.message}\`\`\`\n\n` +
            `API mungkin sedang tidak tersedia. Coba lagi nanti.`
        );
    } finally {
        await cleanup(filePath);
    }
}

// ════════════════════════════════════════════════════════════════════
//  BUTTON / LIST RESPONSE HANDLERS
// ════════════════════════════════════════════════════════════════════

/**
 * Parse a button/row ID like "yt_play_0", "yt_mp3_2", "yt_cancel", etc.
 * @param {string} id
 * @returns {{ action: string, index: number|null } | null}
 */
function parseButtonId(id) {
    if (!id || typeof id !== 'string') return null;
    const match = id.match(/^yt_(play|mp3|mp4|confirm_download|switch_mp3|switch_mp4|cancel)(?:_(\d+))?$/);
    if (!match) return null;
    return { action: match[1], index: match[2] ? parseInt(match[2], 10) : null };
}

/**
 * Shared action executor for both button clicks and list-row selections.
 *
 * @param {object}  sock            Baileys socket
 * @param {object}  opts
 * @param {string}  opts.from       Chat JID
 * @param {string}  opts.sender     Sender JID
 * @param {string}  opts.id         buttonId or rowId
 * @param {object}  opts.key        Message key (for quoting replies)
 * @param {string}  [opts.displayText]  Display text of the selected item (list rows)
 */
async function processAction(sock, opts) {
    const { from, sender, id, key, displayText } = opts;
    const parsed = parseButtonId(id);

    if (!parsed) return; // Not a downloader button — ignore

    // Build a minimal "m"-like reply helper
    const replyFn = async (text) => {
        try {
            await sock.sendMessage(from, { text }, { quoted: key });
        } catch { /* ignore */ }
    };

    const m = { from, sender, key, reply: replyFn };

    // ── Cancel ──
    if (parsed.action === 'cancel') {
        return replyFn('❌ Pemilihan dibatalkan.');
    }

    // ── Fetch stored search data ──
    const stored = getSearchResults(sender);
    if (!stored) {
        return replyFn('⚠️ Sesi pencarian sudah expired.\nSilakan cari ulang dengan */play <query>* atau */ytsearch <query>*.');
    }

    // ── URL download actions (from ytmp3/ytmp4 confirmation) ──
    if (stored.type === 'url_download') {
        if (parsed.action === 'confirm_download') {
            const videoObj = {
                url: stored.url,
                title: stored.title,
                seconds: stored.duration,
                views: stored.views,
                channel: stored.channel,
            };
            if (stored.mode === 'mp3') {
                return executeMp3Download(sock, m, videoObj);
            } else {
                return executeMp4Download(sock, m, videoObj);
            }
        }

        if (parsed.action === 'switch_mp3') {
            // Store mode change and re-send confirmation
            stored.mode = 'mp3';
            storeSearchResults(sender, stored);
            return sendConfirmButtons(sock, m, stored.title, 'mp3');
        }

        if (parsed.action === 'switch_mp4') {
            stored.mode = 'mp4';
            storeSearchResults(sender, stored);
            return sendConfirmButtons(sock, m, stored.title, 'mp4');
        }

        return replyFn('⚠️ Aksi tidak valid untuk download URL.');
    }

    // ── Search-result actions (from /play or /ytsearch) ──
    if (stored.type === 'search') {
        const videos = stored.videos;
        const idx = parsed.index;

        if (idx === null || idx < 0 || idx >= videos.length) {
            return replyFn(`⚠️ Nomor lagu tidak valid. Pilih antara 1-${videos.length}.`);
        }

        const video = videos[idx];

        switch (parsed.action) {
            case 'play':
                return executePlay(sock, m, video);
            case 'mp3':
                return executeMp3Download(sock, m, video);
            case 'mp4':
                return executeMp4Download(sock, m, video);
            default:
                return replyFn('⚠️ Aksi tidak dikenali.');
        }
    }

    return replyFn('⚠️ Tidak ada sesi aktif.');
}

/**
 * Handle a list-row selection (from /play list message).
 *
 * Called by the main bot when it receives a `listResponseMessage`.
 *
 * @param {object} sock   Baileys socket
 * @param {object} opts
 * @param {string} opts.from         Chat JID
 * @param {string} opts.sender       Sender JID
 * @param {string} opts.rowId        The selected row ID (e.g. "yt_play_0")
 * @param {string} [opts.title]      The display title of the selected row
 * @param {object} opts.key          Message key for quoting
 */
export async function handleListResponse(sock, opts) {
    try {
        await processAction(sock, {
            from: opts.from,
            sender: opts.sender,
            id: opts.rowId,
            key: opts.key,
            displayText: opts.title,
        });
    } catch (err) {
        console.error('[DOWNLOADER LIST]', err);
        try {
            await sock.sendMessage(opts.from, {
                text: `❌ Terjadi error: ${err.message}`,
            }, { quoted: opts.key });
        } catch { /* ignore */ }
    }
}

/**
 * Handle a button click (from action buttons or confirmation buttons).
 *
 * Called by the main bot when it receives a `buttonsResponseMessage`.
 *
 * @param {object} sock   Baileys socket
 * @param {object} opts
 * @param {string} opts.from          Chat JID
 * @param {string} opts.sender        Sender JID
 * @param {string} opts.buttonId      The clicked button ID (e.g. "yt_play_0")
 * @param {string} [opts.displayText] Display text of the clicked button
 * @param {object} opts.key           Message key for quoting
 */
export async function handleButtonResponse(sock, opts) {
    try {
        await processAction(sock, {
            from: opts.from,
            sender: opts.sender,
            id: opts.buttonId,
            key: opts.key,
            displayText: opts.displayText,
        });
    } catch (err) {
        console.error('[DOWNLOADER BUTTON]', err);
        try {
            await sock.sendMessage(opts.from, {
                text: `❌ Terjadi error: ${err.message}`,
            }, { quoted: opts.key });
        } catch { /* ignore */ }
    }
}

// ════════════════════════════════════════════════════════════════════
//  GLOBAL REGISTRATION
//  The main bot (index.js) can call these via global._buttonHandlers.downloader.*
// ════════════════════════════════════════════════════════════════════

if (typeof globalThis !== 'undefined') {
    if (!globalThis._buttonHandlers) globalThis._buttonHandlers = {};
    globalThis._buttonHandlers.downloader = {
        handleButtonResponse,
        handleListResponse,
    };
}

// ════════════════════════════════════════════════════════════════════
//  PLUGIN EXPORT
// ════════════════════════════════════════════════════════════════════

export default {
    name: 'Downloader',
    category: 'Downloader',
    command: ['play', 'playbtn', 'ytmp3', 'ytmp4', 'ytsearch', 'tiktok'],

    run: async (m, sock, { command, fullArgs }) => {
        switch (command) {
            case 'play':
            case 'playbtn':
                return handlePlay(m, sock, fullArgs);
            case 'ytmp3':
                return handleYtmp3(m, sock, fullArgs);
            case 'ytmp4':
                return handleYtmp4(m, sock, fullArgs);
            case 'ytsearch':
                return handleYtsearch(m, sock, fullArgs);
            case 'tiktok':
                return handleTiktok(m, sock, fullArgs);
            default:
                return m.reply('❌ Command tidak dikenali.');
        }
    },
};
