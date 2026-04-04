import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { fileTypeFromBuffer } from 'file-type';

// ===============================
// Constants & Configuration
// ===============================

const TEMP_DIR = path.join(process.cwd(), 'temp');

// ===============================
// Utility Functions
// ===============================

/**
 * Ensure the temporary directory exists
 */
function ensureTempDir() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
}

/**
 * Generate a unique temp file path
 */
function tempFile(ext) {
    ensureTempDir();
    return path.join(TEMP_DIR, `stk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

/**
 * Safely remove one or more files, ignoring errors
 */
function cleanup(...filePaths) {
    for (const fp of filePaths) {
        try {
            if (fp && fs.existsSync(fp)) {
                fs.unlinkSync(fp);
            }
        } catch {
            // silently ignore cleanup errors
        }
    }
}

/**
 * Build a baileys-compatible message object for media download.
 * For quoted messages, reconstructs the key from contextInfo.
 */
function buildDownloadObj(m, quotedMsg, quotedCtx) {
    if (quotedMsg && quotedCtx) {
        return {
            key: {
                remoteJid: m.from,
                id: quotedCtx.stanzaId,
                participant: quotedCtx.participant || undefined,
            },
            message: quotedMsg,
        };
    }
    return { key: m.key, message: m.message };
}

/**
 * Detect what media is available in the current or quoted message.
 * Returns { mediaType, isQuoted, quotedMsg, quotedCtx } or null.
 */
function detectMedia(m) {
    const msg = m.message;

    // Direct media attached to this message
    if (msg.imageMessage) return { mediaType: 'image', isQuoted: false };
    if (msg.videoMessage) return { mediaType: 'video', isQuoted: false };
    if (msg.stickerMessage) return { mediaType: 'sticker', isQuoted: false };

    // Quoted media
    const ctx = msg.extendedTextMessage?.contextInfo;
    if (!ctx) return null;
    const qm = ctx.quotedMessage;
    if (qm?.imageMessage) return { mediaType: 'image', isQuoted: true, quotedMsg: qm, quotedCtx: ctx };
    if (qm?.videoMessage) return { mediaType: 'video', isQuoted: true, quotedMsg: qm, quotedCtx: ctx };
    if (qm?.stickerMessage) return { mediaType: 'sticker', isQuoted: true, quotedMsg: qm, quotedCtx: ctx };

    return null;
}

/**
 * Download media from the current or quoted message as a Buffer.
 */
async function downloadMedia(sock, m, quotedMsg, quotedCtx) {
    const obj = buildDownloadObj(m, quotedMsg, quotedCtx);
    return await sock.downloadMediaMessage(obj, 'buffer');
}

// ===============================
// Sticker Helper Functions (ffmpeg-based, no native deps)
// ===============================

/**
 * Create a static WebP sticker (512x512) with transparent padding.
 * Uses ffmpeg for resize + webp conversion (works on Android).
 *
 * @param {Buffer} imageBuffer - Input image buffer (JPEG, PNG, WebP, etc.)
 * @returns {Promise<Buffer>} WebP sticker buffer
 */
async function createSticker(imageBuffer) {
    const imgPath = tempFile('png');
    const outPath = tempFile('webp');

    try {
        fs.writeFileSync(imgPath, imageBuffer);

        await new Promise((resolve, reject) => {
            ffmpeg(imgPath)
                .complexFilter([
                    'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease',
                    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=transparent',
                ])
                .outputOptions([
                    '-y',
                    '-vcodec', 'libwebp',
                    '-lossless', '0',
                    '-compression_level', '6',
                    '-q:v', '80',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                ])
                .output(outPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        return fs.readFileSync(outPath);
    } finally {
        cleanup(imgPath, outPath);
    }
}

/**
 * Extract the first frame from a video file and return it as a PNG buffer.
 */
async function extractFirstFrame(videoPath) {
    const outPath = tempFile('png');

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .inputOptions(['-ss', '0'])
            .frames(1)
            .output(outPath)
            .on('end', () => {
                try {
                    const buf = fs.readFileSync(outPath);
                    cleanup(outPath);
                    resolve(buf);
                } catch (err) {
                    cleanup(outPath);
                    reject(err);
                }
            })
            .on('error', (err) => {
                cleanup(outPath);
                reject(err);
            })
            .run();
    });
}

/**
 * Convert a video file to an animated WebP sticker (max 10 seconds, 512x512).
 * Requires ffmpeg compiled with libwebp support.
 */
async function createAnimatedSticker(videoPath) {
    const outPath = tempFile('webp');

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .inputOptions(['-t', '10', '-ss', '0'])
            .complexFilter([
                'fps=15,scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=transparent',
            ])
            .outputOptions([
                '-vcodec', 'libwebp',
                '-lossless', '0',
                '-compression_level', '6',
                '-q:v', '70',
                '-loop', '0',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
            ])
            .output(outPath)
            .on('end', () => {
                try {
                    const buf = fs.readFileSync(outPath);
                    cleanup(outPath);
                    resolve(buf);
                } catch (err) {
                    cleanup(outPath);
                    reject(err);
                }
            })
            .on('error', (err) => {
                cleanup(outPath);
                reject(err);
            })
            .run();
    });
}

// ===============================
// Command Handlers
// ===============================

/**
 * /sticker or /s — Convert an image or video (first frame) to a static sticker.
 */
async function handleSticker(m, sock, prefix) {
    const media = detectMedia(m);
    const p = prefix || '/';

    if (!media || (media.mediaType !== 'image' && media.mediaType !== 'video')) {
        await m.reply(
            `*❌ Tidak ada media ditemukan!*\n\n` +
            `Cara penggunaan:\n` +
            `• Kirim gambar/video dengan caption ${p}sticker\n` +
            `• Atau reply gambar/video dengan ${p}sticker\n` +
            `• Atau reply gambar/video dengan ${p}s`
        );
        return;
    }

    await m.reply('⏳ Sedang membuat sticker...');

    try {
        const buffer = await downloadMedia(sock, m, media.quotedMsg, media.quotedCtx);
        if (!buffer) throw new Error('Gagal mengunduh media.');

        let imageBuffer;

        if (media.mediaType === 'video') {
            // Save video to temp file, extract first frame
            const videoPath = tempFile('mp4');
            fs.writeFileSync(videoPath, buffer);
            try {
                imageBuffer = await extractFirstFrame(videoPath);
            } finally {
                cleanup(videoPath);
            }
        } else {
            imageBuffer = buffer;
        }

        const stickerBuffer = await createSticker(imageBuffer);
        await sock.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m.key });
    } catch (err) {
        console.error('[ sticker ] Error:', err);
        await m.reply(`❌ Gagal membuat sticker: *${err.message}*`);
    }
}

/**
 * /take or /toimg — Convert a sticker back to an image (exif-free).
 * Uses ffmpeg to convert WebP → PNG (strips all metadata).
 */
async function handleToImage(m, sock, prefix) {
    const media = detectMedia(m);
    const p = prefix || '/';

    if (!media || media.mediaType !== 'sticker') {
        await m.reply(
            `*❌ Tidak ada sticker ditemukan!*\n\n` +
            `Cara penggunaan:\n` +
            `• Reply sticker dengan ${p}take\n` +
            `• Atau reply sticker dengan ${p}toimg`
        );
        return;
    }

    await m.reply('⏳ Sedang mengkonversi sticker ke gambar...');

    try {
        const buffer = await downloadMedia(sock, m, media.quotedMsg, media.quotedCtx);
        if (!buffer) throw new Error('Gagal mengunduh sticker.');

        // Convert WebP to PNG via ffmpeg (strips all EXIF metadata)
        const imgPath = tempFile('webp');
        const outPath = tempFile('png');

        try {
            fs.writeFileSync(imgPath, buffer);

            await new Promise((resolve, reject) => {
                ffmpeg(imgPath)
                    .outputOptions(['-y'])
                    .output(outPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });

            const imageBuffer = fs.readFileSync(outPath);

            await sock.sendMessage(
                m.from,
                { image: imageBuffer, mimetype: 'image/png' },
                { quoted: m.key }
            );
        } finally {
            cleanup(imgPath, outPath);
        }
    } catch (err) {
        console.error('[ take ] Error:', err);
        await m.reply(`❌ Gagal mengkonversi sticker: *${err.message}*`);
    }
}

/**
 * /stickergif or /sgif — Convert a video to an animated WebP sticker (max 10s).
 */
async function handleStickerGif(m, sock, prefix) {
    const media = detectMedia(m);
    const p = prefix || '/';

    if (!media || media.mediaType !== 'video') {
        await m.reply(
            `*❌ Tidak ada video ditemukan!*\n\n` +
            `Cara penggunaan:\n` +
            `• Kirim video dengan caption ${p}stickergif\n` +
            `• Atau reply video dengan ${p}stickergif\n` +
            `• Atau reply video dengan ${p}sgif\n\n` +
            `*Catatan:* Video maksimal 10 detik.`
        );
        return;
    }

    await m.reply('⏳ Sedang membuat sticker animasi... (mungkin membutuhkan beberapa detik)');

    try {
        const buffer = await downloadMedia(sock, m, media.quotedMsg, media.quotedCtx);
        if (!buffer) throw new Error('Gagal mengunduh video.');

        // Detect actual mime to choose correct file extension
        const ft = await fileTypeFromBuffer(buffer);
        const ext = ft?.ext || 'mp4';

        const videoPath = tempFile(ext);
        fs.writeFileSync(videoPath, buffer);

        try {
            const stickerBuffer = await createAnimatedSticker(videoPath);
            await sock.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m.key });
        } finally {
            cleanup(videoPath);
        }
    } catch (err) {
        console.error('[ stickergif ] Error:', err);
        await m.reply(`❌ Gagal membuat sticker animasi: *${err.message}*\n\nPastikan ffmpeg terinstall dengan dukungan libwebp.`);
    }
}

// ===============================
// Plugin Definition
// ===============================

export default {
    name: 'Sticker Maker',
    command: ['sticker', 's', 'take', 'toimg', 'stickergif', 'sgif'],

    run: async (m, sock, { text, prefix, command, args }) => {
        try {
            switch (command) {
                case 'sticker':
                case 's':
                    await handleSticker(m, sock, prefix);
                    break;

                case 'take':
                case 'toimg':
                    await handleToImage(m, sock, prefix);
                    break;

                case 'stickergif':
                case 'sgif':
                    await handleStickerGif(m, sock, prefix);
                    break;
            }
        } catch (err) {
            console.error(`[ sticker plugin ] Unhandled error (${command}):`, err);
            await m.reply(`❌ Terjadi kesalahan pada plugin sticker: *${err.message}*`);
        }
    },
};
