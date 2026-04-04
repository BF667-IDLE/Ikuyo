/**
 * ═══════════════════════════════════════════════════════════════
 *  JadiBot Engine - Core System
 *  For Ikuyo WhatsApp Bot
 * ═══════════════════════════════════════════════════════════════
 *
 *  Sistem JadiBot memungkinkan pengguna menjadikan nomor
 *  WhatsApp mereka sendiri sebagai bot. Sistem ini membuat
 *  koneksi Baileys/Wileys baru untuk setiap user.
 *
 *  Fitur:
 *    - Multi-connection Baileys (beberapa jadibot bersamaan)
 *    - Pairing code otomatis untuk setiap jadibot
 *    - Mode Private (hanya owner jadibot yang bisa pakai)
 *    - Mode Public (semua orang bisa pakai)
 *    - Ban/Unban jadibot yang melanggar TOS
 *    - TOS warning sebelum jadibot aktif
 *    - Auto-reconnect pada disconnect
 *    - Resource limit (maks concurrent jadibot)
 *
 *  Usage:
 *    const jadibot = require('./lib/jadibot');
 *
 *    // Inisialisasi
 *    jadibot.init(mainSock);
 *
 *    // Buat jadibot baru
 *    await jadibot.create(number, ownerJid, 'private');
 *
 *    // Stop jadibot
 *    jadibot.stop(number);
 *
 *    // List jadibot aktif
 *    const list = jadibot.list();
 */

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const chalk = require('chalk');
const moment = require('moment-timezone');
const hfdb = require('./hfdb');

// Baileys / Wileys modules
const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('wileys');

// ============================================================
//  CONSTANTS & CONFIGURATION
// ============================================================

const JADIBOT_SESSION_DIR = path.join(__dirname, '..', 'jadibot_sessions');
const MAX_CONCURRENT = 10; // Maksimal jadibot bersamaan
const RECONNECT_DELAY = 5000; // 5 detik delay reconnect
const MAX_RECONNECT = 5; // Maksimal reconnect attempt

// Pastikan folder session ada
if (!fs.existsSync(JADIBOT_SESSION_DIR)) {
    fs.mkdirSync(JADIBOT_SESSION_DIR, { recursive: true });
}

// ============================================================
//  TOS (Terms of Service)
// ============================================================

const TOS_TEXT = `⚖️ *SYARAT & KETENTUAN JADIBOT*

Sebelum menggunakan fitur JadiBot, kamu harus menyetujui ketentuan berikut:

*1. 🚫 Dilarang Keras*
   • Menggunakan bot untuk spam, flood, atau promosi
   • Menggunakan bot untuk kegiatan ilegal atau melanggar hukum
   • Mengirim konten SARA, pornografi, atau kekerasan
   • Menjual atau memperjualbelikan akses jadibot
   • Menggunakan bot untuk merusak atau mengeksploitasi sistem

*2. ⚠️ Batasan*
   • Owner berhak mematikan jadibot kapan saja
   • Owner berhak banned permanen tanpa pemberitahuan
   • Jika jadibot melanggar TOS, akan di-banned
   • Session jadibot akan dihapus saat banned
   • Fitur jadibot bisa dihentikan sewaktu-waktu

*3. 📋 Resiko*
   • Nomor WhatsApp kamu bisa di-banned oleh WhatsApp
   • Data session disimpan di server (owner bertanggung jawab)
   • Owner tidak bertanggung jawab atas banned dari WhatsApp
   • Gunakan nomor sekunder, bukan nomor utama

*4. ✅ Ketentuan Teknis*
   • Maksimal 1 jadibot per nomor
   • Jadibot akan otomatis mati jika server restart
   • Resource server terbatas, jadibot bisa dimatikan jika overload

Dengan menggunakan fitur ini, kamu dianggap telah membaca dan menyetujui seluruh ketentuan di atas.

*© ${new Date().getFullYear()} Ikuyo Bot - BF667-IDLE*`;

// ============================================================
//  JADIBOT MANAGER CLASS
// ============================================================

class JadibotManager {
    constructor() {
        /** @type {Map<string, { sock, owner, mode, startTime, number, reconnectCount, state, saveCreds }>} */
        this.bots = new Map();

        /** @type {Set<string>} Set of banned numbers */
        this.bannedList = new Set();

        /** @type {Set<string>} Set of numbers yang sudah accept TOS */
        this.tosAccepted = new Set();

        /** @type {object|null} Main bot socket reference */
        this.mainSock = null;

        /** @type {Set<string>} Pending TOS confirmation (sender -> timeout) */
        this.pendingTos = new Map();

        /** @type {Set<string>} Numbers yang sedang proses pairing */
        this.pairingInProgress = new Set();

        // Load ban list dari file
        this._loadBanList();
        this._loadTosAccepted();
    }

    // ============================================================
    //  INITIALIZATION
    // ============================================================

    /**
     * Inisialisasi jadibot manager dengan reference ke main socket
     * @param {object} mainSock - Main bot Baileys socket
     */
    init(mainSock) {
        this.mainSock = mainSock;
        console.log(chalk.green('[ JADIBOT ] Manager initialized'));

        // Cleanup pending TOS setiap 5 menit
        setInterval(() => this._cleanupPendingTos(), 5 * 60 * 1000);

        // Auto-reconnect checker setiap 30 detik
        setInterval(() => this._checkReconnections(), 30000);
    }

    // ============================================================
    //  CORE: CREATE JADIBOT
    // ============================================================

    /**
     * Buat jadibot baru untuk nomor tertentu.
     * Menghasilkan pairing code yang dikirim ke owner.
     *
     * @param {string} number - Nomor WhatsApp (tanpa @, tanpa +)
     * @param {string} ownerJid - JID pemilik jadibot
     * @param {'private'|'public'} mode - Mode akses jadibot
     * @returns {Promise<{ success: boolean, code?: string, message: string }>}
     */
    async create(number, ownerJid, mode = 'private') {
        const cleanNumber = number.replace(/[^0-9]/g, '');

        // ── Validasi ──
        if (!cleanNumber || cleanNumber.length < 10) {
            return { success: false, message: '❌ Nomor tidak valid!' };
        }

        // Cek banned
        if (this.isBanned(cleanNumber)) {
            return { success: false, message: '❌ Nomor kamu telah di-*BANNED* dari menggunakan jadibot!\n\nHubungi owner jika merasa ini salah.' };
        }

        // Cek sudah ada jadibot aktif dengan nomor ini
        if (this.bots.has(cleanNumber)) {
            return { success: false, message: `❌ Nomor ${cleanNumber} sudah memiliki jadibot yang aktif!\n\nKetik *.jadibot stop* untuk menghentikan terlebih dahulu.` };
        }

        // Cek sedang proses pairing
        if (this.pairingInProgress.has(cleanNumber)) {
            return { success: false, message: '⏳ Proses pairing sedang berjalan untuk nomor ini...\n\nMohon tunggu beberapa saat.' };
        }

        // Cek limit concurrent jadibot
        if (this.bots.size >= MAX_CONCURRENT) {
            return { success: false, message: `❌ Jumlah jadibot sudah mencapai batas maksimal (*${MAX_CONCURRENT}* jadibot).\n\nMohon tunggu sampai ada slot kosong atau hubungi owner.` };
        }

        // Cek TOS diterima
        if (!this.tosAccepted.has(cleanNumber)) {
            return { success: false, message: 'TOS_REQUIRED' };
        }

        this.pairingInProgress.add(cleanNumber);

        try {
            const sessionPath = path.join(JADIBOT_SESSION_DIR, cleanNumber);

            // Setup auth state untuk session jadibot
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

            // Buat socket Baileys baru
            const jadiSock = makeWASocket({
                version: (await fetchLatestBaileysVersion()).version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: state,
                browser: ['Ikuyo JadiBot', 'Chrome', '2.0.0'],
                // Mark as jadibot to differentiate from main bot
            });

            // Setup connection handler
            const pairingCode = await this._setupConnection(jadiSock, cleanNumber, ownerJid, mode, state, saveCreds);

            // Tandai pairing selesai
            this.pairingInProgress.delete(cleanNumber);

            // Simpan ke active bots
            this.bots.set(cleanNumber, {
                sock: jadiSock,
                owner: ownerJid,
                mode: mode,
                startTime: Date.now(),
                number: cleanNumber,
                reconnectCount: 0,
                state: 'pairing', // states: pairing, connected, disconnected
                saveCreds,
            });

            console.log(chalk.green(`[ JADIBOT ] Created for ${cleanNumber} (mode: ${mode})`));

            return {
                success: true,
                code: pairingCode,
                message: `✅ *JadiBot Berhasil Dibuat!*\n\n` +
                    `📱 *Nomor:* ${cleanNumber}\n` +
                    `👤 *Owner:* @${ownerJid.split('@')[0]}\n` +
                    `🔒 *Mode:* ${mode === 'private' ? 'Private (hanya kamu)' : 'Public (semua orang)'}\n\n` +
                    `📱 *Kode Pairing:*\n\`\`\`${pairingCode}\`\`\`\n\n` +
                    `📋 *Cara Menghubungkan:*\n` +
                    `1. Buka WhatsApp di HP\n` +
                    `2. Ketuk titik tiga (⋮) di atas kanan\n` +
                    `3. Pilih *Perangkat tertaut*\n` +
                    `4. Ketuk *Tautkan perangkat*\n` +
                    `5. Masukkan kode di atas\n\n` +
                    `⏳ *Status:* Menunggu koneksi...\n\n` +
                    `💡 Ketik *.jadibot stop* untuk menghentikan jadibot.`,
                mentions: [ownerJid],
            };

        } catch (error) {
            this.pairingInProgress.delete(cleanNumber);

            // Hapus session folder jika gagal
            const sessionPath = path.join(JADIBOT_SESSION_DIR, cleanNumber);
            if (fs.existsSync(sessionPath)) {
                try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch {}
            }

            console.error(chalk.red(`[ JADIBOT ] Gagal create for ${cleanNumber}:`), error.message);

            return {
                success: false,
                message: `❌ Gagal membuat jadibot!\n\n*Error:* ${error.message}\n\nPastikan nomor valid dan terdaftar di WhatsApp.`,
            };
        }
    }

    // ============================================================
    //  CONNECTION SETUP & HANDLERS
    // ============================================================

    /**
     * Setup connection handler untuk jadibot socket
     * @private
     */
    async _setupConnection(sock, number, ownerJid, mode, state, saveCreds) {
        return new Promise((resolve, reject) => {
            let resolved = false;
            let reconnectTimer = null;

            // Timeout 60 detik untuk pairing
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error('Timeout: Tidak berhasil request pairing code dalam 60 detik'));
                }
            }, 60000);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                    }

                    // Update status
                    const bot = this.bots.get(number);
                    if (bot) {
                        bot.state = 'connected';
                        bot.reconnectCount = 0;
                    }

                    console.log(chalk.green(`[ JADIBOT ] ${number} CONNECTED ✅`));

                    // Notify owner
                    try {
                        await this.mainSock.sendMessage(ownerJid, {
                            text: `✅ *JadiBot ${number} Terhubung!*\n\n` +
                                `🔒 Mode: ${mode === 'private' ? 'Private' : 'Public'}\n` +
                                `⏱ Waktu: ${moment().tz('Asia/Jakarta').format('HH:mm:ss')} WIB\n\n` +
                                `Bot siap digunakan! 🎉`,
                            mentions: [ownerJid],
                        });
                    } catch (err) {
                        console.error(chalk.yellow(`[ JADIBOT ] Gagal notify owner ${number}:`), err.message);
                    }

                    // Setup message handler untuk jadibot
                    this._setupMessageHandler(sock, number, ownerJid, mode);
                }

                if (connection === 'close') {
                    const reason = lastDisconnect?.error?.output?.statusCode;
                    const reasonMsg = lastDisconnect?.error?.message || 'Unknown';

                    console.log(chalk.yellow(`[ JADIBOT ] ${number} DISCONNECTED (code: ${reason})`));

                    const bot = this.bots.get(number);
                    if (!bot) return;

                    if (reason === DisconnectReason.loggedOut) {
                        // User logout dari jadibot
                        console.log(chalk.red(`[ JADIBOT ] ${number} LOGGED OUT`));
                        this._removeBot(number);

                        try {
                            await this.mainSock.sendMessage(ownerJid, {
                                text: `🛑 *JadiBot ${number} Logout*\n\n` +
                                    `Pengguna telah logout dari sesi jadibot.\n` +
                                    `Session telah dihapus.\n\n` +
                                    `Ketik *.jadibot* untuk membuat jadibot baru.`,
                                mentions: [ownerJid],
                            });
                        } catch {}
                    } else {
                        // Reconnect attempt
                        bot.state = 'disconnected';
                        bot.reconnectCount++;

                        if (bot.reconnectCount <= MAX_RECONNECT) {
                            console.log(chalk.yellow(`[ JADIBOT ] ${number} Reconnecting... (attempt ${bot.reconnectCount}/${MAX_RECONNECT})`));

                            const delay = RECONNECT_DELAY * bot.reconnectCount;

                            try {
                                await this.mainSock.sendMessage(ownerJid, {
                                    text: `⚠️ *JadiBot ${number} Terputus*\n\n` +
                                        `Mencoba reconnect...\n` +
                                        `Attempt: ${bot.reconnectCount}/${MAX_RECONNECT}\n` +
                                        `Delay: ${delay / 1000}s`,
                                    mentions: [ownerJid],
                                });
                            } catch {}

                            setTimeout(async () => {
                                try {
                                    const sessionPath = path.join(JADIBOT_SESSION_DIR, number);
                                    const { state: newState, saveCreds: newSaveCreds } = await useMultiFileAuthState(sessionPath);

                                    const newSock = makeWASocket({
                                        version: (await fetchLatestBaileysVersion()).version,
                                        logger: pino({ level: 'silent' }),
                                        printQRInTerminal: false,
                                        auth: newState,
                                        browser: ['Ikuyo JadiBot', 'Chrome', '2.0.0'],
                                    });

                                    await this._setupConnection(newSock, number, ownerJid, mode, newState, newSaveCreds);

                                    // Update bot reference
                                    bot.sock = newSock;
                                    bot.saveCreds = newSaveCreds;
                                } catch (err) {
                                    console.error(chalk.red(`[ JADIBOT ] ${number} Reconnect failed:`), err.message);
                                }
                            }, delay);
                        } else {
                            // Max reconnect exceeded
                            console.log(chalk.red(`[ JADIBOT ] ${number} Max reconnect exceeded, removing...`));
                            this._removeBot(number);

                            try {
                                await this.mainSock.sendMessage(ownerJid, {
                                    text: `❌ *JadiBot ${number} Gagal Reconnect*\n\n` +
                                        `Sudah mencoba ${MAX_RECONNECT} kali namun gagal.\n` +
                                        `Session dihapus.\n\n` +
                                        `Ketik *.jadibot* untuk membuat jadibot baru.`,
                                    mentions: [ownerJid],
                                });
                            } catch {}
                        }
                    }
                }
            });

            // Handle credential save
            sock.ev.on('creds.update', saveCreds);

            // Request pairing code
            sock.ev.on('connection.update', async (update) => {
                // Check if registered or if we can request pairing code
                if (update.qr) {
                    // If QR mode happens, try to request pairing instead
                    try {
                        const code = await sock.requestPairingCode(number);
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            resolve(code);
                        }
                    } catch (err) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            reject(err);
                        }
                    }
                }
            });

            // Also directly try requesting pairing code
            setTimeout(async () => {
                if (!resolved) {
                    try {
                        const code = await sock.requestPairingCode(number);
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            resolve(code);
                        }
                    } catch (err) {
                        // Might need to wait for connection to be ready
                        // The QR event handler above will handle it
                    }
                }
            }, 2000);
        });
    }

    // ============================================================
    //  MESSAGE HANDLER FOR JADIBOT
    // ============================================================

    /**
     * Setup message handler untuk jadibot socket
     * @private
     */
    _setupMessageHandler(sock, botNumber, ownerJid, mode) {
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const message = chatUpdate.messages[0];
                if (!message.message || message.key.fromMe) return;

                const from = message.key.remoteJid;
                const sender = message.key.participant || from;

                // ── Mode Check ──
                if (mode === 'private') {
                    const senderNum = sender.replace(/[^0-9]/g, '');
                    const ownerNum = ownerJid.replace(/[^0-9]/g, '');
                    if (senderNum !== ownerNum) {
                        // Private mode - hanya owner yang bisa pakai
                        return; // Ignore silently or send warning
                    }
                }

                // ── Serialize Message ──
                const body = this._extractText(message);
                if (!body) return;

                const prefix = global.config?.prefix || '/';
                const isCmd = body.startsWith(prefix);
                const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : null;
                const args = body.trim().split(/ +/).slice(1);
                const q = args.join(' ');
                const isGroup = from.endsWith('@g.us');

                if (!isCmd) return;

                // ── Block jadibot command di dalam jadibot ──
                if (['jadibot'].includes(command)) {
                    await sock.sendMessage(from, {
                        text: '❌ Command ini tidak bisa digunakan di dalam jadibot!\n\nGunakan di bot utama.',
                    }, { quoted: message });
                    return;
                }

                // ── Create minimal msg object for compatibility ──
                const msg = {
                    body,
                    text: body,
                    key: message.key,
                    pushName: message.pushName,
                    message: message.message,
                    from,
                    sender,
                    isGroup,
                    isOwner: sender.replace(/[^0-9]/g, '') === (global.config?.owner || '').replace(/[^0-9]/g, ''),
                    isCmd,
                    prefix,
                    command,
                    args,
                    q,
                    quotedMessage: this._extractQuotedText(message),
                    groupMetadata: null,
                    reply: async (content, options = {}) => {
                        try {
                            await sock.sendMessage(from, { text: content }, { quoted: message, ...options });
                        } catch (err) {
                            console.error(chalk.red(`[ JADIBOT:${botNumber} ] Reply error:`), err.message);
                        }
                    },
                    sendText: async (text) => {
                        try {
                            await sock.sendMessage(from, { text });
                        } catch (err) {
                            console.error(chalk.red(`[ JADIBOT:${botNumber} ] Send error:`), err.message);
                        }
                    },
                    sendImage: async (source, caption = '') => {
                        try {
                            const img = typeof source === 'string' ? { url: source } : source;
                            await sock.sendMessage(from, { image: img, caption, mimetype: 'image/jpeg' });
                        } catch (err) {
                            console.error(chalk.red(`[ JADIBOT:${botNumber} ] SendImage error:`), err.message);
                        }
                    },
                    sendSticker: async (source) => {
                        try {
                            const sticker = typeof source === 'string' ? { url: source } : source;
                            await sock.sendMessage(from, { sticker });
                        } catch (err) {
                            console.error(chalk.red(`[ JADIBOT:${botNumber} ] SendSticker error:`), err.message);
                        }
                    },
                };

                // ── Fetch group metadata ──
                if (isGroup) {
                    try {
                        msg.groupMetadata = await sock.groupMetadata(from);
                    } catch {}
                }

                // ── Context for plugins ──
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
                    sender,
                };

                // ── Execute case handler (from main bot) ──
                try {
                    const caseHandler = require('./case');
                    if (typeof caseHandler === 'function') {
                        await caseHandler(msg, sock, context);
                    }
                } catch (err) {
                    console.error(chalk.yellow(`[ JADIBOT:${botNumber} ] Case handler error:`), err.message);
                }

                // ── Execute plugins ──
                if (isCmd && global.plugins) {
                    const sortedEntries = Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b));

                    for (const [name, plugin] of sortedEntries) {
                        if (
                            plugin.command &&
                            (Array.isArray(plugin.command) ? plugin.command : [plugin.command]).includes(command)
                        ) {
                            // Skip jadibot plugin in jadibot sessions
                            if (['jadibot', 'listjadi', 'banjadi', 'unban'].includes(command)) {
                                await sock.sendMessage(from, {
                                    text: '❌ Command ini tidak bisa digunakan di dalam jadibot!',
                                }, { quoted: message });
                                break;
                            }

                            try {
                                await plugin.run(msg, sock, context);
                            } catch (error) {
                                console.error(chalk.red(`[ JADIBOT:${botNumber} ] Plugin ${name} error:`), error.message);
                                try {
                                    await sock.sendMessage(from, {
                                        text: `❌ Error di plugin *${name}*\n\`\`\`${error.message}\`\`\``,
                                    }, { quoted: message });
                                } catch {}
                            }
                            break; // Satu plugin per command
                        }
                    }
                }

            } catch (error) {
                console.error(chalk.red(`[ JADIBOT:${botNumber} ] Message handler error:`), error.message);
            }
        });
    }

    // ============================================================
    //  TEXT EXTRACTION HELPERS
    // ============================================================

    /**
     * @private Extract text from message
     */
    _extractText(message) {
        const msg = message.message;
        if (!msg) return '';
        if (msg.conversation) return msg.conversation;
        if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
        if (msg.imageMessage?.caption) return msg.imageMessage.caption;
        if (msg.videoMessage?.caption) return msg.videoMessage.caption;
        if (msg.documentMessage?.caption) return msg.documentMessage.caption;
        if (msg.audioMessage?.caption) return msg.audioMessage.caption;
        return '';
    }

    /**
     * @private Extract quoted text from message
     */
    _extractQuotedText(message) {
        try {
            const ext = message.message?.extendedTextMessage;
            if (ext?.contextInfo?.quotedMessage) {
                const qMsg = ext.contextInfo.quotedMessage;
                if (qMsg.conversation) return qMsg.conversation;
                if (qMsg.extendedTextMessage?.text) return qMsg.extendedTextMessage.text;
                if (qMsg.imageMessage?.caption) return qMsg.imageMessage.caption;
                if (qMsg.videoMessage?.caption) return qMsg.videoMessage.caption;
            }
        } catch {}
        return null;
    }

    // ============================================================
    //  CORE: STOP JADIBOT
    // ============================================================

    /**
     * Hentikan jadibot berdasarkan nomor
     * @param {string} number - Nomor jadibot
     * @returns {{ success: boolean, message: string }}
     */
    stop(number) {
        const cleanNumber = number.replace(/[^0-9]/g, '');

        if (!cleanNumber) {
            return { success: false, message: '❌ Nomor tidak valid!' };
        }

        if (!this.bots.has(cleanNumber)) {
            return { success: false, message: `❌ Tidak ada jadibot aktif untuk nomor ${cleanNumber}!` };
        }

        return this._removeBot(cleanNumber, true);
    }

    /**
     * Stop semua jadibot yang dimiliki oleh owner tertentu
     * @param {string} ownerJid - JID owner
     * @returns {number} Jumlah jadibot yang distop
     */
    stopByOwner(ownerJid) {
        let count = 0;
        for (const [number, bot] of this.bots) {
            if (bot.owner === ownerJid) {
                this._removeBot(number, false);
                count++;
            }
        }
        return count;
    }

    /**
     * Stop semua jadibot yang sedang berjalan
     * @returns {number} Jumlah jadibot yang distop
     */
    stopAll() {
        const count = this.bots.size;
        for (const [number] of this.bots) {
            this._removeBot(number, false);
        }
        return count;
    }

    /**
     * @private Remove bot dari list dan cleanup resources
     */
    _removeBot(number, sendNotification = false) {
        const bot = this.bots.get(number);
        if (!bot) return { success: false, message: 'Bot tidak ditemukan' };

        // Close socket gracefully
        try {
            bot.sock?.end?.();
        } catch {}

        // Remove from list
        this.bots.delete(number);
        this.pairingInProgress.delete(number);

        // Delete session folder
        const sessionPath = path.join(JADIBOT_SESSION_DIR, number);
        try {
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        } catch (err) {
            console.error(chalk.yellow(`[ JADIBOT ] Gagal hapus session ${number}:`), err.message);
        }

        console.log(chalk.yellow(`[ JADIBOT ] Removed ${number}`));

        if (sendNotification && this.mainSock) {
            try {
                this.mainSock.sendMessage(bot.owner, {
                    text: `🛑 *JadiBot ${number} Dihentikan*\n\n` +
                        `Session telah dihapus.\nKetik *.jadibot* untuk membuat jadibot baru.`,
                }).catch(() => {});
            } catch {}
        }

        return { success: true, message: `✅ JadiBot ${number} berhasil dihentikan!` };
    }

    // ============================================================
    //  CORE: SET MODE
    // ============================================================

    /**
     * Set mode jadibot (private/public)
     * @param {string} number - Nomor jadibot
     * @param {'private'|'public'} mode - Mode baru
     * @returns {{ success: boolean, message: string }}
     */
    setMode(number, mode) {
        const cleanNumber = number.replace(/[^0-9]/g, '');

        if (!this.bots.has(cleanNumber)) {
            return { success: false, message: `❌ Tidak ada jadibot aktif untuk nomor ${cleanNumber}!` };
        }

        const bot = this.bots.get(cleanNumber);
        bot.mode = mode;

        console.log(chalk.cyan(`[ JADIBOT ] ${cleanNumber} mode changed to ${mode}`));

        return {
            success: true,
            message: `✅ Mode jadibot *${cleanNumber}* berhasil diubah ke *${mode.toUpperCase()}*!\n\n` +
                `🔒 *Private:* Hanya kamu (owner) yang bisa pakai\n` +
                `🌐 *Public:* Semua orang bisa pakai`,
        };
    }

    // ============================================================
    //  CORE: LIST JADIBOT
    // ============================================================

    /**
     * List semua jadibot yang aktif
     * @returns {Array<{ number, owner, mode, startTime, state, uptime }>}
     */
    list() {
        const result = [];
        for (const [number, bot] of this.bots) {
            result.push({
                number,
                owner: bot.owner,
                mode: bot.mode,
                startTime: bot.startTime,
                state: bot.state,
                uptime: Date.now() - bot.startTime,
            });
        }
        return result;
    }

    // ============================================================
    //  CORE: BAN / UNBAN
    // ============================================================

    /**
     * Ban nomor dari menggunakan jadibot
     * @param {string} number - Nomor yang dibanned
     * @returns {{ success: boolean, message: string }}
     */
    ban(number) {
        const cleanNumber = number.replace(/[^0-9]/g, '');

        if (!cleanNumber) {
            return { success: false, message: '❌ Nomor tidak valid!' };
        }

        // Tambah ke ban list
        this.bannedList.add(cleanNumber);
        this._saveBanList();

        // Stop jadibot aktif jika ada
        if (this.bots.has(cleanNumber)) {
            this._removeBot(cleanNumber, true);
        }

        // Hapus dari TOS accepted
        this.tosAccepted.delete(cleanNumber);
        this._saveTosAccepted();

        console.log(chalk.red(`[ JADIBOT ] Banned ${cleanNumber}`));

        return {
            success: true,
            message: `✅ Nomor *${cleanNumber}* berhasil di-*BANNED*!\n\n` +
                `• Jika sedang ada jadibot aktif, akan dihentikan\n` +
                `• Session jadibot telah dihapus\n` +
                `• Nomor tidak bisa membuat jadibot lagi\n\n` +
                `💡 Gunakan *.unban ${cleanNumber}* untuk membuka banned.`,
        };
    }

    /**
     * Unban nomor dari jadibot
     * @param {string} number - Nomor yang di-unban
     * @returns {{ success: boolean, message: string }}
     */
    unban(number) {
        const cleanNumber = number.replace(/[^0-9]/g, '');

        if (!cleanNumber) {
            return { success: false, message: '❌ Nomor tidak valid!' };
        }

        if (!this.bannedList.has(cleanNumber)) {
            return { success: false, message: `❌ Nomor *${cleanNumber}* tidak ada di daftar banned!` };
        }

        this.bannedList.delete(cleanNumber);
        this._saveBanList();

        console.log(chalk.green(`[ JADIBOT ] Unbanned ${cleanNumber}`));

        return {
            success: true,
            message: `✅ Nomor *${cleanNumber}* berhasil di-*UNBANNED*!\n\n` +
                `Nomor sudah bisa membuat jadibot lagi.\n` +
                `Ketik *.jadibot* untuk membuat jadibot baru.`,
        };
    }

    /**
     * Cek apakah nomor sudah dibanned
     * @param {string} number
     * @returns {boolean}
     */
    isBanned(number) {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        return this.bannedList.has(cleanNumber);
    }

    /**
     * Dapatkan daftar nomor yang banned
     * @returns {string[]}
     */
    getBannedList() {
        return Array.from(this.bannedList);
    }

    // ============================================================
    //  TOS MANAGEMENT
    // ============================================================

    /**
     * Cek apakah nomor sudah accept TOS
     * @param {string} number
     * @returns {boolean}
     */
    hasAcceptedTos(number) {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        return this.tosAccepted.has(cleanNumber);
    }

    /**
     * Accept TOS untuk nomor
     * @param {string} number
     */
    acceptTos(number) {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        this.tosAccepted.add(cleanNumber);
        this._saveTosAccepted();
    }

    /**
     * Reject/remove TOS acceptance
     * @param {string} number
     */
    rejectTos(number) {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        this.tosAccepted.delete(cleanNumber);
        this._saveTosAccepted();
    }

    /**
     * Set pending TOS confirmation
     * @param {string} sender - Sender identifier
     * @returns {boolean}
     */
    setPendingTos(sender) {
        if (this.pendingTos.has(sender)) return false;
        this.pendingTos.set(sender, Date.now());
        return true;
    }

    /**
     * Check if TOS is pending for sender
     * @param {string} sender
     * @returns {boolean}
     */
    hasPendingTos(sender) {
        return this.pendingTos.has(sender);
    }

    /**
     * Clear pending TOS for sender
     * @param {string} sender
     */
    clearPendingTos(sender) {
        this.pendingTos.delete(sender);
    }

    /**
     * @private Cleanup expired pending TOS (10 menit timeout)
     */
    _cleanupPendingTos() {
        const now = Date.now();
        const TIMEOUT = 10 * 60 * 1000;
        for (const [sender, timestamp] of this.pendingTos) {
            if (now - timestamp > TIMEOUT) {
                this.pendingTos.delete(sender);
            }
        }
    }

    // ============================================================
    //  PERSISTENCE (Save/Load Ban List & TOS)
    // ============================================================

    /** @private */
    _loadBanList() {
        try {
            const filePath = path.join(JADIBOT_SESSION_DIR, 'banlist.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.bannedList = new Set(data || []);
                console.log(chalk.gray(`[ JADIBOT ] Loaded ${this.bannedList.size} banned numbers`));
            }
        } catch (err) {
            console.error(chalk.yellow('[ JADIBOT ] Gagal load ban list:'), err.message);
        }
    }

    /** @private */
    _saveBanList() {
        try {
            const filePath = path.join(JADIBOT_SESSION_DIR, 'banlist.json');
            fs.writeFileSync(filePath, JSON.stringify(Array.from(this.bannedList), null, 2));
        } catch (err) {
            console.error(chalk.yellow('[ JADIBOT ] Gagal save ban list:'), err.message);
        }
        // Auto-push to HuggingFace if enabled
        if (hfdb.enabled) {
            hfdb.uploadFile('jadibot/banlist.json', Array.from(this.bannedList)).catch(() => {});
        }
    }

    /** @private */
    _loadTosAccepted() {
        try {
            const filePath = path.join(JADIBOT_SESSION_DIR, 'tos_accepted.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.tosAccepted = new Set(data || []);
                console.log(chalk.gray(`[ JADIBOT ] Loaded ${this.tosAccepted.size} TOS accepted`));
            }
        } catch (err) {
            console.error(chalk.yellow('[ JADIBOT ] Gagal load TOS accepted:'), err.message);
        }
    }

    /** @private */
    _saveTosAccepted() {
        try {
            const filePath = path.join(JADIBOT_SESSION_DIR, 'tos_accepted.json');
            fs.writeFileSync(filePath, JSON.stringify(Array.from(this.tosAccepted), null, 2));
        } catch (err) {
            console.error(chalk.yellow('[ JADIBOT ] Gagal save TOS accepted:'), err.message);
        }
        // Auto-push to HuggingFace if enabled
        if (hfdb.enabled) {
            hfdb.uploadFile('jadibot/tos_accepted.json', Array.from(this.tosAccepted)).catch(() => {});
        }
    }

    // ============================================================
    //  RECONNECTION CHECKER
    // ============================================================

    /**
     * @private Periodik check untuk reconnect jadibot yang terputus
     */
    _checkReconnections() {
        // Currently handled per-bot in connection update
        // This can be expanded for global checks
    }

    // ============================================================
    //  UTILITY: FORMAT UPTIME
    // ============================================================

    /**
     * Format uptime dari milidetik
     * @param {number} ms
     * @returns {string}
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        const parts = [];
        if (days > 0) parts.push(`${days} hari`);
        if (hours > 0) parts.push(`${hours} jam`);
        if (minutes > 0) parts.push(`${minutes} menit`);
        if (secs > 0) parts.push(`${secs} detik`);
        return parts.length > 0 ? parts.join(', ') : 'baru saja';
    }

    // ============================================================
    //  GET TOS TEXT
    // ============================================================

    /**
     * Get TOS text
     * @returns {string}
     */
    getTosText() {
        return TOS_TEXT;
    }
}

// ============================================================
//  EXPORTS
// ============================================================

module.exports = new JadibotManager();
