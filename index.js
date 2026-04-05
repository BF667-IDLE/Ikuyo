"use strict";

// ============================================================
//  Ikuyo Bot - Core Engine (index.js)
//  Improved version with rate limiting, anti-delete, welcome/leave,
//  uptime tracking, command stats, better serialization & more.
// ============================================================

// ─── Core Modules ───
const fs   = require('fs');
const path = require('path');
const util = require('util');

// ─── External Modules ───
const pino = require('pino');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');

// ─── Baileys Modules ───
const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');

// ─── Local Modules ───
require('./config.js');
const caseHandler = require('./lib/case.js');
const btnHelper = require('./lib/button.js');
const thumbnail = require('./lib/thumbnail');
const jadibot = require('./lib/jadibot');
const hfdb = require('./lib/hfdb');

// ─── Inisialisasi Global Button Handlers ───
global._buttonHandlers = {};

// ============================================================
//  GLOBALS & CONSTANTS
// ============================================================

const currentFile  = __filename;
const pluginFolder = path.join(__dirname, 'plugins');
const pluginFilter = (filename) => path.extname(filename).toLowerCase() === '.mjs';

global.plugins = {};

// ─── Uptime Tracking ───
global.startTime = Date.now();

/**
 * Mengembalikan uptime bot dalam format yang mudah dibaca
 * @returns {string} Contoh: "2 hari 3 jam 15 menit 42 detik"
 */
global.uptime = function () {
    const diff = Date.now() - global.startTime;
    const days    = Math.floor(diff / 86400000);
    const hours   = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${days} hari ${hours} jam ${minutes} menit ${seconds} detik`;
};

// ─── Command Stats ───
global.stats = {
    commands: 0,
    startTime: global.startTime
};

// ============================================================
//  RATE LIMITER (In-Memory per-user)
// ============================================================

/**
 * Simple sliding-window rate limiter.
 * Max 5 commands per 15 detik per user.
 */
const rateLimitMap = new Map();
const RATE_LIMIT_MAX   = 5;
const RATE_LIMIT_WINDOW = 15000; // ms

/**
 * Cek apakah user sudah melebihi rate limit.
 * @param {string} sender - JID pengirim
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
function checkRateLimit(sender) {
    const now = Date.now();
    let entry = rateLimitMap.get(sender);

    if (!entry || (now - entry.firstHit) > RATE_LIMIT_WINDOW) {
        // Jendela baru
        entry = { count: 1, firstHit: now };
        rateLimitMap.set(sender, entry);
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW };
    }

    entry.count++;
    const resetIn = RATE_LIMIT_WINDOW - (now - entry.firstHit);
    const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count);

    if (entry.count > RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0, resetIn };
    }

    return { allowed: true, remaining, resetIn };
}

/**
 * Bersihkan rate limit entries yang sudah expired (dipanggil periodik)
 */
function cleanupRateLimits() {
    const now = Date.now();
    for (const [sender, entry] of rateLimitMap) {
        if ((now - entry.firstHit) > RATE_LIMIT_WINDOW) {
            rateLimitMap.delete(sender);
        }
    }
}
// Bersihkan setiap 30 detik
setInterval(cleanupRateLimits, 30000);

// ============================================================
//  ANTI-DELETE MESSAGES (In-Memory dengan TTL)
// ============================================================

/**
 * Menyimpan pesan terbaru untuk mendeteksi pesan yang dihapus.
 * TTL 60 detik per pesan.
 */
const deletedMessages = new Map();
const ANTI_DELETE_TTL = 60000;
const antiDeleteStore = new Map(); // key -> { message, timestamp, chat }

/**
 * Simpan pesan masuk ke anti-delete store
 */
function storeForAntiDelete(message) {
    const key = message.key.id;
    if (!key || message.key.fromMe) return;
    antiDeleteStore.set(key, {
        message: message,
        timestamp: Date.now(),
        chat: message.key.remoteJid
    });
}

/**
 * Bersihkan anti-delete store yang sudah expired
 */
function cleanupAntiDelete() {
    const now = Date.now();
    for (const [key, entry] of antiDeleteStore) {
        if ((now - entry.timestamp) > ANTI_DELETE_TTL) {
            antiDeleteStore.delete(key);
        }
    }
}
setInterval(cleanupAntiDelete, 30000);

// ============================================================
//  TIMESTAMPED LOGGING HELPER
// ============================================================

function logError(label, error) {
    const ts = chalk.gray(`[${new Date().toLocaleString()}]`);
    console.error(`${ts} ${chalk.red.bold(label)}`, error.message || error);
    if (error.stack) {
        console.error(chalk.red.dim(error.stack));
    }
}

function logInfo(label, msg) {
    const ts = chalk.gray(`[${new Date().toLocaleString()}]`);
    console.log(`${ts} ${chalk.cyan.bold(label)} ${msg}`);
}

function logSuccess(label, msg) {
    const ts = chalk.gray(`[${new Date().toLocaleString()}]`);
    console.log(`${ts} ${chalk.green.bold(label)} ${msg}`);
}

function logWarn(label, msg) {
    const ts = chalk.gray(`[${new Date().toLocaleString()}]`);
    console.warn(`${ts} ${chalk.yellow.bold(label)} ${msg}`);
}

// ============================================================
//  PLUGIN MANAGEMENT
// ============================================================

/**
 * Memuat semua plugin dari folder plugins/ (file .mjs)
 */
async function loadPlugins() {
    if (!fs.existsSync(pluginFolder)) {
        fs.mkdirSync(pluginFolder, { recursive: true });
    }

    const files = fs.readdirSync(pluginFolder).filter(pluginFilter);

    // Urutkan alphabetically
    files.sort((a, b) => a.localeCompare(b));

    logInfo('[ PLUGIN ]', `Menemukan ${files.length} plugin...`);

    for (const file of files) {
        await loadPluginFile(file);
    }

    logSuccess('[ PLUGIN ]', `${Object.keys(global.plugins).length} plugin berhasil dimuat.`);
}

/**
 * Memuat atau reload satu file plugin
 */
async function loadPluginFile(filename) {
    try {
        const filePath = path.join(pluginFolder, filename);
        const module = await import(`file://${filePath}?update=${Date.now()}`);
        global.plugins[filename] = module.default || module;
        logInfo('[ PLUGIN ]', `Loaded: ${filename}`);
    } catch (error) {
        logError(`[ PLUGIN ] Gagal memuat ${filename}`, error);
    }
}

/**
 * Watch plugins directory untuk auto-reload saat ada perubahan
 */
function watchPlugins() {
    fs.watch(pluginFolder, async (event, filename) => {
        if (filename && pluginFilter(filename)) {
            logInfo('[ PLUGIN ]', `Perubahan terdeteksi: ${filename}`);
            await loadPluginFile(filename);
            logSuccess('[ PLUGIN ]', `Reloaded: ${filename}`);
        }
    });
}

// ============================================================
//  MESSAGE SERIALIZATION (Enhanced)
// ============================================================

/**
 * Ambil metadata grup jika pesan berasal dari grup
 * @param {object} sock - Baileys socket
 * @param {string} groupJid - JID grup
 * @returns {object|null}
 */
async function fetchGroupMetadata(sock, groupJid) {
    try {
        return await sock.groupMetadata(groupJid);
    } catch {
        return null;
    }
}

/**
 * Ambil teks dari quoted message
 */
function extractQuotedText(message) {
    const ext = message.message?.extendedTextMessage;
    if (ext?.contextInfo?.quotedMessage) {
        const qMsg = ext.contextInfo.quotedMessage;
        if (qMsg.conversation) return qMsg.conversation;
        if (qMsg.extendedTextMessage?.text) return qMsg.extendedTextMessage.text;
        if (qMsg.imageMessage?.caption) return qMsg.imageMessage.caption;
        if (qMsg.videoMessage?.caption) return qMsg.videoMessage.caption;
    }
    return null;
}

/**
 * Normalize owner number untuk perbandingan (strip '+' dan '@')
 * @param {string} ownerNum - Nomor owner dari config
 * @returns {string} Nomor yang sudah dinormalisasi
 */
function normalizeNumber(ownerNum) {
    return ownerNum.replace(/[^0-9]/g, '');
}

/**
 * Serialize pesan masuk menjadi objek yang mudah digunakan.
 *
 * Fields tambahan:
 *   - body          : teks lengkap pesan
 *   - quotedMessage : teks pesan yang di-quote
 *   - isOwner       : boolean, apakah pengirim adalah owner
 *   - isCmd         : boolean, apakah pesan adalah command
 *   - args          : array argumen setelah command
 *   - q             : query lengkap setelah command
 *   - prefix        : prefix yang digunakan
 *   - command       : nama command (tanpa prefix)
 *   - groupMetadata : metadata grup (null jika bukan grup)
 *
 * Helpers:
 *   - reply()       : balas pesan (text, image, video, sticker)
 *   - sendText()    : kirim teks biasa
 *   - sendImage()   : kirim gambar
 *   - sendSticker() : kirim stiker
 */
function serializeMessage(message, sock) {
    const msgTypes = Object.keys(message.message || {});
    const type = msgTypes[0];

    // ── Ambil teks pesan ──
    const getText = () => {
        if (type === 'conversation') return message.message.conversation || '';
        if (type === 'extendedTextMessage') return message.message.extendedTextMessage.text || '';
        if (type === 'imageMessage') return message.message.imageMessage.caption || '';
        if (type === 'videoMessage') return message.message.videoMessage.caption || '';
        if (type === 'documentMessage') return message.message.documentMessage.caption || '';
        if (type === 'audioMessage') return message.message.audioMessage.caption || '';
        return '';
    };

    const body = getText();
    const quotedMessage = extractQuotedText(message);

    // ── Prefix & Command parsing ──
    const prefix = global.config.prefix || '/';
    const isCmd  = body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : null;
    const args    = body.trim().split(/ +/).slice(1);
    const q       = args.join(' ');

    // ── Sender info ──
    const sender = message.key.participant || message.key.remoteJid;
    const from   = message.key.remoteJid;
    const isGroup = from.endsWith('@g.us');

    const ownerNumber = normalizeNumber(global.config.owner || '');
    const senderNumber = normalizeNumber(sender.split('@')[0]);
    const isOwner = senderNumber === ownerNumber;

    // ── Helpers ──

    /**
     * Balas pesan (mendukung text, image, video, sticker)
     * @param {string} content - teks, URL, atau buffer
     * @param {object} [options={}]
     *   - type: 'text' | 'image' | 'video' | 'sticker'
     *   - caption: string (untuk image/video)
     *   - mimetype: string
     *   - quoted: message (default: message ini)
     */
    const reply = async (content, options = {}) => {
        try {
            const msgType = options.type || 'text';
            const sendOpts = { quoted: message, ...options };

            switch (msgType) {
                case 'image':
                    // Support Buffer dan URL
                    if (Buffer.isBuffer(content)) {
                        await sock.sendMessage(from, {
                            image: content,
                            caption: options.caption || '',
                            mimetype: options.mimetype || 'image/jpeg',
                            ...sendOpts
                        });
                    } else {
                        await sock.sendMessage(from, {
                            image: { url: content },
                            caption: options.caption || '',
                            mimetype: options.mimetype || 'image/jpeg',
                            ...sendOpts
                        });
                    }
                    break;
                case 'video':
                    await sock.sendMessage(from, {
                        video: { url: content },
                        caption: options.caption || '',
                        mimetype: options.mimetype || 'video/mp4',
                        ...sendOpts
                    });
                    break;
                case 'sticker':
                    await sock.sendMessage(from, {
                        sticker: { url: content },
                        ...sendOpts
                    });
                    break;
                case 'text':
                default:
                    await sock.sendMessage(from, { text: content }, { quoted: message, ...options });
                    break;
            }
        } catch (err) {
            logError('[ REPLY ]', err);
        }
    };

    /**
     * Kirim teks biasa tanpa quote
     */
    const sendText = async (text) => {
        try {
            await sock.sendMessage(from, { text });
        } catch (err) {
            logError('[ SEND_TEXT ]', err);
        }
    };

    /**
     * Kirim gambar
     * @param {string|Buffer} source - URL atau buffer gambar
     * @param {string} [caption] - Caption gambar
     */
    const sendImage = async (source, caption = '') => {
        try {
            const img = typeof source === 'string' ? { url: source } : source;
            await sock.sendMessage(from, {
                image: img,
                caption,
                mimetype: 'image/jpeg'
            });
        } catch (err) {
            logError('[ SEND_IMAGE ]', err);
        }
    };

    /**
     * Kirim stiker
     * @param {string|Buffer} source - URL atau buffer stiker
     */
    const sendSticker = async (source) => {
        try {
            const sticker = typeof source === 'string' ? { url: source } : source;
            await sock.sendMessage(from, { sticker });
        } catch (err) {
            logError('[ SEND_STICKER ]', err);
        }
    };

    return {
        type,
        body,
        text: body,
        key: message.key,
        pushName: message.pushName,
        message: message.message,
        from,
        sender,
        isGroup,
        isOwner,
        isCmd,
        prefix,
        command,
        args,
        q,
        quotedMessage,
        groupMetadata: null, // akan diisi nanti jika grup
        reply,
        sendText,
        sendImage,
        sendSticker
    };
}

// ============================================================
//  PAIRING CODE MANAGEMENT
// ============================================================

/**
 * Request pairing code untuk device linking
 */
async function requestPairingCode(sock, phoneNumber) {
    try {
        const formattedCode = phoneNumber.replace(/[^0-9]/g, '');
        const pairingCode = await sock.requestPairingCode(formattedCode);

        logSuccess('[ PAIRING ]', `Kode pairing: ${pairingCode}`);
        console.log(chalk.cyan('Masukkan kode ini di WhatsApp: Settings > Linked Devices > Link Device'));

        return pairingCode;
    } catch (error) {
        logError('[ PAIRING ] Gagal request pairing code', error);
        throw error;
    }
}

// ============================================================
//  CONNECTION HANDLERS (Enhanced with exponential backoff)
// ============================================================

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30 detik maksimal

/**
 * Hitung delay reconnection dengan exponential backoff
 * @returns {number} delay dalam ms
 */
function getReconnectDelay() {
    const baseDelay = 2000;
    const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttempts), MAX_RECONNECT_DELAY);
    reconnectAttempts++;
    return Math.floor(delay);
}

/**
 * Reset reconnect counter
 */
function resetReconnectCounter() {
    reconnectAttempts = 0;
}

/**
 * Handle koneksi update (QR, pairing, reconnect, dll)
 */
function setupConnectionHandlers(sock, usePairing) {
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // ── QR Code ──
        if (qr && !usePairing) {
            console.log(chalk.yellow('[ QR MODE ] Scan QR code di bawah:'));
            qrcode.generate(qr, { small: true });
        }

        // ── Koneksi terputus ──
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            const reasonMsg = lastDisconnect?.error?.message || 'Unknown';
            logError('[ CONN ]', new Error(`Koneksi ditutup. Kode: ${reason} | ${reasonMsg}`));

            if (reason === DisconnectReason.loggedOut || reason === 401) {
                logWarn('[ CONN ]', 'Session invalid / logged out. Menghapus session & restart...');

                // Stop all jadibots on main bot logout
                try {
                    const stopped = jadibot.stopAll();
                    if (stopped > 0) logInfo('[ CONN ]', `Stopped ${stopped} jadibot(s)`);
                } catch {}

                // Save data to HF before reset
                if (hfdb.enabled) {
                    try {
                        logInfo('[ CONN ]', 'Saving data to HuggingFace...');
                        await hfdb.syncJadibot('push');
                    } catch {}
                }

                // Hapus folder session agar pairing code bisa di-request ulang
                const sessionDir = global.config.sessionName || 'session';
                try {
                    const sessionPath = path.join(__dirname, sessionDir);
                    if (fs.existsSync(sessionPath)) {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                        logSuccess('[ CONN ]', `Session folder "${sessionDir}" berhasil dihapus.`);
                    }
                } catch (err) {
                    logError('[ CONN ]', new Error('Gagal hapus session: ' + err.message));
                }

                // Restart bot (dengan session kosong → pairing code akan muncul)
                logInfo('[ CONN ]', 'Restarting bot dalam 3 detik...');
                resetReconnectCounter();
                setTimeout(() => startIkuyo(), 3000);
            } else {
                const delay = getReconnectDelay();
                logWarn('[ CONN ]', `Mencoba reconnect dalam ${delay / 1000}s (attempt #${reconnectAttempts})...`);
                setTimeout(() => startIkuyo(), delay);
            }
        }

        // ── Koneksi terbuka ──
        else if (connection === 'open') {
            resetReconnectCounter();
            logSuccess('[ CONN ]', `Bot ${global.config.name} berhasil terhubung! ✅`);
            logInfo('[ UPTIME ]', `Bot aktif sejak: ${new Date(global.startTime).toLocaleString()}`);
        }

        // ── Koneksi sedang menghubungkan ──
        else if (connection === 'connecting') {
            logInfo('[ CONN ]', 'Menghubungkan...');
        }
    });
}

/**
 * Handle credential update (simpan session)
 */
function setupCredentialHandlers(sock, saveCreds) {
    sock.ev.on('creds.update', saveCreds);
}

// ============================================================
//  WELCOME & LEAVE MESSAGES (Group Events)
// ============================================================

/**
 * Handle peserta grup yang join/leave
 */
function setupGroupHandlers(sock) {
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { id: groupJid, participants, action } = update;

            // Ambil metadata grup
            let groupMeta;
            try {
                groupMeta = await sock.groupMetadata(groupJid);
            } catch {
                groupMeta = null;
            }

            const groupName = groupMeta?.subject || 'Unknown Group';
            const groupDesc = groupMeta?.desc || '';
            const groupMembers = groupMeta?.participants?.length || 0;

            for (const participant of participants) {
                const tag = `@${participant.split('@')[0]}`;

                // ── Welcome (member join) ──
                if (action === 'add') {
                    let welcomeMsg = global.config.welcome_msg;
                    if (welcomeMsg === false || welcomeMsg === 'false') continue; // disabled

                    // Default welcome message
                    if (!welcomeMsg) {
                        welcomeMsg = `Halo @user! 👋\nSelamat datang di grup *{groupName}*\nJangan lupa baca deskripsi grup ya!\n\n📋 Total member: {memberCount}`;
                    }

                    welcomeMsg = welcomeMsg
                        .replace(/@user/gi, tag)
                        .replace(/{groupName}/gi, groupName)
                        .replace(/{memberCount}/gi, String(groupMembers))
                        .replace(/{groupDesc}/gi, groupDesc || 'Tidak ada deskripsi');

                    await sock.sendMessage(groupJid, {
                        text: welcomeMsg,
                        mentions: [participant]
                    });

                    logInfo('[ GROUP ]', `Welcome: ${participant} joined ${groupName}`);
                }

                // ── Leave (member keluar) ──
                else if (action === 'remove') {
                    let leaveMsg = global.config.leave_msg;
                    if (leaveMsg === false || leaveMsg === 'false') continue; // disabled

                    // Default leave message
                    if (!leaveMsg) {
                        leaveMsg = `@user telah keluar dari grup *{groupName}* 🫡\n\n📋 Total member: {memberCount}`;
                    }

                    leaveMsg = leaveMsg
                        .replace(/@user/gi, tag)
                        .replace(/{groupName}/gi, groupName)
                        .replace(/{memberCount}/gi, String(groupMembers))
                        .replace(/{groupDesc}/gi, groupDesc || 'Tidak ada deskripsi');

                    await sock.sendMessage(groupJid, {
                        text: leaveMsg,
                        mentions: [participant]
                    });

                    logInfo('[ GROUP ]', `Leave: ${participant} left ${groupName}`);
                }

                // ── Promote ──
                else if (action === 'promote') {
                    logInfo('[ GROUP ]', `Promote: ${participant} promoted in ${groupName}`);
                }

                // ── Demote ──
                else if (action === 'demote') {
                    logInfo('[ GROUP ]', `Demote: ${participant} demoted in ${groupName}`);
                }
            }
        } catch (error) {
            logError('[ GROUP EVENT ]', error);
        }
    });
}

// ============================================================
//  ANTI-DELETE HANDLER
// ============================================================

/**
 * Tangani pesan yang dihapus di grup dan kirim ulang
 */
function setupAntiDeleteHandler(sock) {
    sock.ev.on('messages.delete', async (deleteEvent) => {
        try {
            const { keys } = deleteEvent;
            if (!keys || !keys.length) return;

            for (const key of keys) {
                const stored = antiDeleteStore.get(key.id);
                if (!stored) continue;

                // Hanya proses pesan yang sudah lebih dari 3 detik (hindari false positive)
                if ((Date.now() - stored.timestamp) < 3000) continue;

                const chat = stored.chat;
                if (!chat.endsWith('@g.us')) continue; // hanya grup

                const deletedMsg = stored.message;
                const sender = deletedMsg.key.participant || deletedMsg.key.remoteJid;
                const senderTag = `@${sender.split('@')[0]}`;

                // Coba ambil teks pesan yang dihapus
                const msgContent = deletedMsg.message;
                let deletedText = '';

                if (msgContent?.conversation) {
                    deletedText = msgContent.conversation;
                } else if (msgContent?.extendedTextMessage?.text) {
                    deletedText = msgContent.extendedTextMessage.text;
                } else if (msgContent?.imageMessage?.caption) {
                    deletedText = `*[Gambar]* ${msgContent.imageMessage.caption}`;
                } else if (msgContent?.videoMessage?.caption) {
                    deletedText = `*[Video]* ${msgContent.videoMessage.caption}`;
                } else if (msgContent?.stickerMessage) {
                    deletedText = '*[Stiker]*';
                } else if (msgContent?.audioMessage) {
                    deletedText = '*[Audio]*';
                } else if (msgContent?.documentMessage) {
                    deletedText = `*[Dokumen]* ${msgContent.documentMessage.fileName || ''}`;
                } else {
                    deletedText = '*[Media tidak diketahui]*';
                }

                await sock.sendMessage(chat, {
                    text: `⚠️ *Anti-Delete Terdeteksi!*\n\n🧑 Pengirim: ${senderTag}\n📝 Pesan yang dihapus:\n> ${deletedText}`,
                    mentions: [sender]
                });

                logInfo('[ ANTI-DELETE ]', `Pesan dari ${sender} di ${chat} di-recover`);

                // Hapus dari store setelah di-recover
                antiDeleteStore.delete(key.id);
            }
        } catch (error) {
            logError('[ ANTI-DELETE ]', error);
        }
    });
}

// ============================================================
//  MESSAGE HANDLER (Enhanced)
// ============================================================

/**
 * Tangani pesan masuk
 */
function setupMessageHandlers(sock) {
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const message = chatUpdate.messages[0];
            if (!message.message || message.key.fromMe) return;

            // Simpan ke anti-delete store
            storeForAntiDelete(message);

            // ═════════════════════════════════════════
            //  1. HANDLE BUTTON & LIST RESPONSES
            // ═════════════════════════════════════════
            const msgContent = message.message;
            const from = message.key.remoteJid;
            const sender = message.key.participant || from;

            // --- Quick Reply Button Response ---
            if (msgContent.buttonsResponseMessage) {
                const btnResp = msgContent.buttonsResponseMessage;
                logInfo('[ BUTTON ]', `Click: ${btnResp.selectedDisplayText} (${btnResp.selectedButtonId}) dari ${sender}`);
                const handled = await btnHelper.routeButtonResponse(sock, {
                    from,
                    sender,
                    buttonId: btnResp.selectedButtonId,
                    displayText: btnResp.selectedDisplayText,
                    key: message.key,
                });
                if (handled) return;
                // Jika tidak ada handler, fallback ke command processing
            }

            // --- Interactive List Response ---
            if (msgContent.listResponseMessage) {
                const listResp = msgContent.listResponseMessage;
                logInfo('[ LIST ]', `Select: ${listResp.title} (${listResp.rowId}) dari ${sender}`);
                const handled = await btnHelper.routeListResponse(sock, {
                    from,
                    sender,
                    rowId: listResp.rowId,
                    title: listResp.title,
                    key: message.key,
                });
                if (handled) return;
            }

            // --- Template Button Response (Hydrated) ---
            if (msgContent.templateButtonReplyMessage) {
                const tmplResp = msgContent.templateButtonReplyMessage;
                logInfo('[ TEMPLATE_BTN ]', `Click: ${tmplResp.selectedDisplayText} (${tmplResp.selectedId}) dari ${sender}`);
                const handled = await btnHelper.routeButtonResponse(sock, {
                    from,
                    sender,
                    buttonId: tmplResp.selectedId,
                    displayText: tmplResp.selectedDisplayText,
                    key: message.key,
                });
                if (handled) return;
            }

            // ═════════════════════════════════════════
            //  2. HANDLE NORMAL TEXT / COMMAND MESSAGES
            // ═════════════════════════════════════════

            // Serialize pesan
            const msg = serializeMessage(message, sock);
            const { text, isGroup, isCmd, command, body, args, q, prefix } = msg;

            // Hanya proses pesan yang punya teks
            if (!body) return;

            // ── Rate Limiting ──
            if (isCmd) {
                const rate = checkRateLimit(sender);
                if (!rate.allowed) {
                    const cooldownSec = Math.ceil(rate.resetIn / 1000);
                    await msg.reply(
                        `⏳ *Cooldown*\nKamu terlalu cepat mengirim command!\nTunggu *${cooldownSec} detik* sebelum mencoba lagi.`,
                        { type: 'text' }
                    );
                    logWarn('[ RATE-LIMIT ]', `${sender} melebihi batas rate limit`);
                    return;
                }
            }

            // ── Fetch group metadata jika pesan dari grup ──
            if (isGroup) {
                msg.groupMetadata = await fetchGroupMetadata(sock, from);
            }

            // ── Context object untuk case handler & plugins ──
            const context = {
                text: body,
                prefix,
                command,
                args,
                fullArgs: q,
                msg,
                sock,
                from,
                isGroup,
                sender
            };

            // ── Increment command stats ──
            if (isCmd) {
                global.stats.commands++;
            }

            // ── Execute case handler ──
            if (typeof caseHandler === 'function') {
                try {
                    await caseHandler(msg, sock, context);
                } catch (err) {
                    logError('[ CASE-HANDLER ]', err);
                    await msg.reply(`❌ Error di case handler:\n\`\`\`${err.message}\`\`\``).catch(() => {});
                }
            }

            // ── Execute plugin handlers ──
            if (isCmd && global.plugins) {
                await executePlugins(command, msg, sock, context);
            }

        } catch (error) {
            logError('[ MSG-HANDLER ]', error);
        }
    });
}

// ============================================================
//  PLUGIN EXECUTION (Enhanced with timeout & sorting)
// ============================================================

const PLUGIN_TIMEOUT = 30000; // 30 detik timeout per plugin

/**
 * Eksekusi plugin yang cocok dengan command, dengan timeout protection
 * @param {string} command - Nama command
 * @param {object} msg - Serialized message
 * @param {object} sock - Baileys socket
 * @param {object} context - Context object
 */
async function executePlugins(command, msg, sock, context) {
    // Sort plugin names alphabetically untuk urutan eksekusi yang konsisten
    const sortedEntries = Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b));

    for (const [name, plugin] of sortedEntries) {
        if (
            plugin.command &&
            (Array.isArray(plugin.command) ? plugin.command : [plugin.command]).includes(command)
        ) {
            try {
                logInfo('[ EXEC ]', `Plugin: ${name} | Command: ${command}`);

                // Timeout wrapper untuk mencegah plugin hang
                await Promise.race([
                    plugin.run(msg, sock, context),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error(`Plugin ${name} timeout setelah ${PLUGIN_TIMEOUT / 1000}s`)),
                            PLUGIN_TIMEOUT
                        )
                    )
                ]);

                // Jika plugin berhasil, stop (satu plugin per command)
                return;

            } catch (error) {
                logError(`[ PLUGIN: ${name} ]`, error);

                let userMessage;
                if (error.message.includes('timeout')) {
                    userMessage = `⏱️ Plugin *${name}* tidak merespon dalam waktu ${PLUGIN_TIMEOUT / 1000} detik.\n_Silakan coba lagi nanti._`;
                } else {
                    userMessage = `❌ Error di plugin *${name}*\n\`\`\`${error.message}\`\`\``;
                }

                try {
                    await msg.reply(userMessage);
                } catch {
                    // Gagal reply, abaikan
                }
            }
        }
    }
}

// ============================================================
//  AUTO-UPDATE DETECTION
// ============================================================

/**
 * Cek apakah ada commit baru di git remote
 */
async function checkForUpdates() {
    try {
        const { execSync } = require('child_process');
        const isGitRepo = fs.existsSync(path.join(__dirname, '.git'));

        if (!isGitRepo) {
            logInfo('[ UPDATE ]', 'Bukan git repository, skip update check.');
            return;
        }

        logInfo('[ UPDATE ]', 'Memeriksa pembaruan...');

        // Fetch remote info tanpa merge
        execSync('git fetch --dry-run 2>&1 || true', { cwd: __dirname, timeout: 10000 });

        // Bandingkan local HEAD dengan remote
        const localHead = execSync('git rev-parse HEAD 2>/dev/null || echo unknown', {
            cwd: __dirname,
            timeout: 5000,
            encoding: 'utf8'
        }).trim();

        const remoteHead = execSync('git rev-parse origin/main HEAD 2>/dev/null || echo unknown', {
            cwd: __dirname,
            timeout: 5000,
            encoding: 'utf8'
        }).trim().split('\n')[0];

        if (localHead !== remoteHead && remoteHead !== 'unknown') {
            logWarn('[ UPDATE ]', `Tersedia pembaruan! Local: ${localHead.slice(0, 7)} → Remote: ${remoteHead.slice(0, 7)}`);
            logInfo('[ UPDATE ]', 'Jalankan `git pull` untuk memperbarui bot.');
        } else {
            logSuccess('[ UPDATE ]', `Bot sudah versi terbaru (${localHead.slice(0, 7)}).`);
        }
    } catch (error) {
        // Update check gagal, bukan error fatal
        logWarn('[ UPDATE ]', `Gagal mengecek update: ${error.message}`);
    }
}

// ============================================================
//  PROCESS ERROR HANDLERS
// ============================================================

function setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
        logError('[ FATAL ] Uncaught Exception', error);
    });

    process.on('unhandledRejection', (reason) => {
        logError('[ FATAL ] Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)));
    });

    process.on('SIGINT', () => {
        logWarn('[ SHUTDOWN ]', `Bot dimatikan. Uptime: ${global.uptime()} | Total command: ${global.stats.commands}`);
        process.exit(0);
    });
}

// ============================================================
//  AUTO RELOAD (Main File)
// ============================================================

function setupAutoReload() {
    fs.watchFile(currentFile, () => {
        fs.unwatchFile(currentFile);
        logSuccess('[ RELOAD ]', `${path.basename(currentFile)} diperbarui! Me-reload...`);
        delete require.cache[require.resolve(currentFile)];
    });
}

// ============================================================
//  BANNER / STARTUP INFO
// ============================================================

function printBanner() {
    const banner = chalk.cyan(`
  ╔══════════════════════════════════════╗
  ║          🤖 IKUYO BOT v2.0          ║
  ║       WhatsApp Multi-Device Bot      ║
  ╚══════════════════════════════════════╝
    `);

    console.log(banner);
    console.log(chalk.gray(`  ${'─'.repeat(40)}`));
    console.log(chalk.white(`  📌 Bot Name    : ${chalk.bold.green(global.config.name)}`));
    console.log(chalk.white(`  📌 Owner       : ${chalk.bold.green(global.config.owner)}`));
    console.log(chalk.white(`  📌 Prefix      : ${chalk.bold.green(global.config.prefix)}`));
    console.log(chalk.white(`  📌 Pairing     : ${chalk.bold.green(global.config.pairing?.is_pairing ? 'ON' : 'OFF (QR)')}`));
    console.log(chalk.white(`  📌 Session     : ${chalk.bold.green(global.config.sessionName)}`));
    console.log(chalk.white(`  📌 Started At  : ${chalk.bold.green(new Date(global.startTime).toLocaleString())}`));
    console.log(chalk.gray(`  ${'─'.repeat(40)}`));
    console.log();
}

// ============================================================
//  BOT INITIALIZATION
// ============================================================

/**
 * Inisialisasi dan jalankan bot
 */
async function startIkuyo() {
    // ── Load semua plugin ──
    await loadPlugins();

    // ── Setup auth state ──
    const { state, saveCreds } = await useMultiFileAuthState(
        global.config.sessionName || 'session'
    );

    const usePairing = global.config.pairing?.is_pairing || false;
    const pairCode   = global.config.pairing?.pairing_code || '';

    // ── Buat socket ──
    const sock = makeWASocket({
        version: (await fetchLatestBaileysVersion()).version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !usePairing,
        auth: state,
        browser: ['Ikuyo (Mod)', 'Chrome', '2.0.0']
    });

    // ── Setup semua handler ──
    setupConnectionHandlers(sock, usePairing);
    setupCredentialHandlers(sock, saveCreds);
    setupMessageHandlers(sock);
    setupGroupHandlers(sock);
    setupAntiDeleteHandler(sock);
    watchPlugins();

    // ── Simpan sock ke global untuk akses dari plugin/case ──
    global.sock = sock;

    // ── Request pairing code SECELANG setelah socket dibuat ──
    if (usePairing && !state.creds?.registered) {
        const formattedCode = pairCode.replace(/[^0-9]/g, '');
        if (formattedCode) {
            try {
                logInfo('[ PAIRING ]', 'Merequest pairing code...');
                const code = await sock.requestPairingCode(formattedCode);
                console.log(chalk.green.bold('╔══════════════════════════════════════╗'));
                console.log(chalk.green.bold('║         KODE PAIRING BOT            ║'));
                console.log(chalk.green.bold('╚══════════════════════════════════════╝'));
                console.log(chalk.cyan(`\n  ➤ Kode: ${chalk.bold.white.bgRed(' ' + code + ' ')}\n`));
                console.log(chalk.yellow('  Masukkan kode ini di WhatsApp:'));
                console.log(chalk.yellow('  Settings > Linked Devices > Link Device\n'));
                logSuccess('[ PAIRING ]', `Kode pairing: ${code}`);
            } catch (err) {
                logError('[ PAIRING ]', new Error('Gagal request pairing code: ' + err.message));
            }
        } else {
            logWarn('[ PAIRING ]', 'pairing_code kosong di config.js! Isi dengan nomor WA kamu.');
        }
    } else if (!usePairing && !state.creds?.registered) {
        logInfo('[ QR ]', 'Scan QR code untuk menghubungkan bot...');
    }

    // ── Initialize JadiBot Manager ──
    jadibot.init(sock);
    logInfo('[ JADIBOT ]', `JadiBot manager initialized (owner: ${global.config.jadibot?.owner || global.config.owner})`);

    // ── Initialize HuggingFace Database ──
    hfdb.init();
    if (hfdb.enabled) {
        try {
            const pullResult = await hfdb.syncJadibot('pull');
            if (pullResult.success > 0) {
                logSuccess('[ HFDB ]', `Loaded ${pullResult.success} file(s) from HuggingFace`);
            }
        } catch (err) {
            logWarn('[ HFDB ]', `Gagal pull data dari HF: ${err.message}`);
        }
    }
}

// ============================================================
//  APPLICATION ENTRY POINT
// ============================================================

// ── Print banner ──
printBanner();

// ── Setup error handlers ──
setupErrorHandlers();

// ── Setup auto-reload ──
setupAutoReload();

// ── Cek update ──
checkForUpdates().then(async () => {
    // ── Preload default thumbnail ──
    try {
        await thumbnail.preloadDefaultThumbnail();
    } catch (err) {
        logWarn('[ STARTUP ]', 'Gagal preload thumbnail: ' + err.message);
    }

    // ── Start bot ──
    return startIkuyo();
}).catch(error => {
    logError('[ FATAL ] Gagal memulai bot', error);
    process.exit(1);
});
