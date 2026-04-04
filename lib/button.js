/**
 * ═══════════════════════════════════════════
 *  Button & Interactive Message Helper
 *  For Ikuyo WhatsApp Bot
 * ═══════════════════════════════════════════
 *
 * Menyediakan utility function untuk membuat
 * pesan interaktif WhatsApp:
 *   - Quick Reply Buttons (1-3 tombol)
 *   - Interactive List Messages (menu bergulir)
 *   - Template Buttons dengan gambar
 *
 * Usage (di plugin atau case.js):
 *   const btn = require('./lib/button');
 *   await btn.sendButtons(sock, jid, {
 *       text: 'Pilih salah satu:',
 *       buttons: [
 *           { id: 'opt_1', text: 'Opsi 1' },
 *           { id: 'opt_2', text: 'Opsi 2' },
 *       ],
 *       footer: 'Bot Ikuyo',
 *   }, { quoted: msgKey });
 */

const chalk = require('chalk');
const thumbnail = require('./thumbnail');

// ============================================================
//  INTERNAL: Fix media for Wileys
// ============================================================

/**
 * Fix media object untuk Wileys.
 * Wileys sering gagal jika media dikirim sebagai { url: path }.
 * Solusi: convert ke Buffer menggunakan thumbnail helper.
 *
 * @param {string|Buffer} media - URL, path, atau Buffer
 * @param {string} type - 'image' | 'video' | 'document'
 * @returns {Promise<Buffer|string>} Buffer untuk image, string untuk url video
 */
async function fixMedia(media, type) {
    if (!media) return undefined;
    // Jika sudah Buffer, langsung return (sudah di-fix)
    if (Buffer.isBuffer(media)) return media;
    // Untuk image, convert ke Buffer (fix Wileys bug)
    if (type === 'image') {
        try {
            return await thumbnail.load(media);
        } catch (err) {
            console.error(chalk.yellow('[BUTTON] Gagal load image, fallback ke url:'), err.message);
            return media; // fallback ke url
        }
    }
    // Untuk video/document, kirim url as-is
    return media;
}

// ============================================================
//  HELPER: Quick Reply Buttons (maksimal 3 tombol)
// ============================================================

/**
 * Kirim pesan dengan quick reply buttons.
 *
 * @param {object} sock   - Baileys socket
 * @param {string} jid    - Chat JID (remoteJid)
 * @param {object} opts
 * @param {string} opts.text      - Isi pesan
 * @param {Array}  opts.buttons   - [{ id: string, text: string }] (maks 3)
 * @param {string} [opts.footer]  - Footer text
 * @param {string} [opts.headerType=1] - 1=text, 2=image, 3=document, 4=video
 * @param {object} [opts.header]  - { type: 'image'|'video'|'document', media: Buffer|url }
 * @param {object} [sendOpts]    - Opsi tambahan (quoted, dll)
 *
 * @returns {Promise<object>} WA message response
 *
 * @example
 *   await sendButtons(sock, '628xxx@s.whatsapp.net', {
 *       text: 'Pilih format download:',
 *       footer: 'Ikuyo Bot',
 *       buttons: [
 *           { id: 'dl_mp3', text: '🎵 Audio (MP3)' },
 *           { id: 'dl_mp4', text: '🎬 Video (MP4)' },
 *           { id: 'cancel', text: '❌ Batal' },
 *       ],
 *   }, { quoted: msg.key });
 */
async function sendButtons(sock, jid, opts, sendOpts = {}) {
    const { text, buttons = [], footer = '', headerType = 1, header } = opts;

    if (!buttons.length) {
        throw new Error('Minimal 1 button diperlukan');
    }
    if (buttons.length > 3) {
        console.warn(chalk.yellow('[BUTTON] WhatsApp membatasi maksimal 3 tombol. Hanya 3 pertama yang digunakan.'));
    }

    // Build WhatsApp button format
    const waButtons = buttons.slice(0, 3).map(btn => ({
        buttonId: btn.id,
        buttonText: { displayText: btn.text },
        type: 1,
    }));

    const msg = {
        text: text || '',
        footer: footer,
        buttons: waButtons,
        headerType: headerType,
    };

    // Tambahkan header media jika ada (fix Wileys image bug)
    if (header) {
        const fixedMedia = await fixMedia(header.media, header.type);
        switch (header.type) {
            case 'image':
                // Wileys butuh Buffer untuk image, bukan { url }
                msg.image = fixedMedia;
                msg.headerType = 2;
                break;
            case 'video':
                msg.video = Buffer.isBuffer(fixedMedia) ? fixedMedia : { url: fixedMedia };
                msg.headerType = 4;
                break;
            case 'document':
                msg.document = Buffer.isBuffer(fixedMedia) ? fixedMedia : { url: fixedMedia };
                msg.headerType = 3;
                break;
        }
    }

    try {
        return await sock.sendMessage(jid, msg, sendOpts);
    } catch (err) {
        console.error(chalk.red('[BUTTON] Gagal mengirim buttons:'), err.message);
        throw err;
    }
}

// ============================================================
//  HELPER: Interactive List Message
// ============================================================

/**
 * Kirim pesan dengan interactive list (menu bergulir).
 *
 * @param {object} sock   - Baileys socket
 * @param {string} jid    - Chat JID
 * @param {object} opts
 * @param {string} opts.text       - Isi pesan / deskripsi
 * @param {string} opts.title      - Nama list yang tampil di tombol
 * @param {string} [opts.footer]   - Footer text
 * @param {string} [opts.buttonText] - Teks tombol (default: title)
 * @param {Array}  opts.sections   - [{ title, rows: [{ id, title, description? }] }]
 * @param {object} [sendOpts]      - Opsi tambahan (quoted, dll)
 *
 * @returns {Promise<object>} WA message response
 *
 * @example
 *   await sendList(sock, jid, {
 *       text: 'Pilih kategori menu:',
 *       buttonText: '☰ Buka Menu',
 *       footer: 'Ikuyo Bot',
 *       sections: [
 *           {
 *               title: '🔰 General',
 *               rows: [
 *                   { id: 'menu_general', title: 'Menu General', description: 'Ping, uptime, status' },
 *                   { id: 'menu_info', title: 'Info Bot', description: 'Owner, script, donasi' },
 *               ],
 *           },
 *           {
 *               title: '📥 Downloader',
 *               rows: [
 *                   { id: 'menu_downloader', title: 'YouTube & TikTok', description: 'Play, ytmp3, ytmp4' },
 *               ],
 *           },
 *       ],
 *   }, { quoted: msg.key });
 */
async function sendList(sock, jid, opts, sendOpts = {}) {
    const { text, footer = '', buttonText, sections = [] } = opts;

    if (!sections.length) {
        throw new Error('Minimal 1 section diperlukan');
    }

    // Validasi rows per section (maks 10 per section)
    for (const section of sections) {
        if (section.rows && section.rows.length > 10) {
            console.warn(chalk.yellow(
                `[LIST] Section "${section.title}" punya ${section.rows.length} rows. ` +
                `WhatsApp membatasi 10 per section. Hanya 10 pertama digunakan.`
            ));
            section.rows = section.rows.slice(0, 10);
        }
    }

    const msg = {
        text: text || '',
        footer: footer,
        buttonText: buttonText || '☰ Pilih',
        sections: sections.map(section => ({
            title: section.title || '',
            rows: (section.rows || []).map(row => ({
                title: row.title || '',
                rowId: row.id || row.rowId || row.title || '',
                description: row.description || '',
            })),
        })),
    };

    try {
        return await sock.sendMessage(jid, msg, sendOpts);
    } catch (err) {
        console.error(chalk.red('[LIST] Gagal mengirim list:'), err.message);
        throw err;
    }
}

// ============================================================
//  HELPER: Template Button (dengan gambar/video/dokumen)
// ============================================================

/**
 * Kirim template button dengan media header.
 * Mendukung: image, video, document + 3 tombol + call + url.
 *
 * @param {object} sock   - Baileys socket
 * @param {string} jid    - Chat JID
 * @param {object} opts
 * @param {string} opts.text       - Isi pesan
 * @param {string} [opts.footer]   - Footer
 * @param {string}  opts.mediaType - 'image' | 'video' | 'document'
 * @param {string|Buffer} opts.media - URL atau Buffer media
 * @param {string} [opts.fileName] - Nama file (untuk document)
 * @param {string} [opts.mimetype] - MIME type
 * @param {Array}  [opts.buttons]  - [{ id, text }] quick reply (maks 3)
 * @param {object} [opts.urlButton]     - { text: 'Buka Web', url: 'https://...' }
 * @param {object} [opts.callButton]    - { text: 'Hubungi', phoneNumber: '+628...' }
 * @param {object} [sendOpts]  - Opsi tambahan
 */
async function sendTemplateButton(sock, jid, opts, sendOpts = {}) {
    const { text, footer = '', mediaType, media, fileName, mimetype } = opts;

    const msg = {
        caption: text || '',
        footer: footer,
        templateButtons: [],
    };

    // Media header (fix Wileys image bug)
    if (mediaType && media) {
        const fixedMedia = await fixMedia(media, mediaType);
        switch (mediaType) {
            case 'image':
                // Wileys butuh Buffer langsung, bukan { url }
                msg.image = fixedMedia;
                break;
            case 'video':
                msg.video = Buffer.isBuffer(fixedMedia) ? fixedMedia : { url: fixedMedia };
                break;
            case 'document':
                msg.document = Buffer.isBuffer(fixedMedia) ? fixedMedia : { url: fixedMedia };
                if (fileName) msg.fileName = fileName;
                if (mimetype) msg.mimetype = mimetype;
                break;
        }
    }

    // Quick reply buttons
    if (opts.buttons) {
        for (const btn of opts.buttons.slice(0, 3)) {
            msg.templateButtons.push({
                index: msg.templateButtons.length,
                quickReplyButton: {
                    displayText: btn.text,
                    id: btn.id,
                },
            });
        }
    }

    // URL button
    if (opts.urlButton) {
        msg.templateButtons.push({
            index: msg.templateButtons.length,
            urlButton: {
                displayText: opts.urlButton.text,
                url: opts.urlButton.url,
            },
        });
    }

    // Call button
    if (opts.callButton) {
        msg.templateButtons.push({
            index: msg.templateButtons.length,
            callButton: {
                displayText: opts.callButton.text,
                phoneNumber: opts.callButton.phoneNumber,
            },
        });
    }

    try {
        return await sock.sendMessage(jid, msg, sendOpts);
    } catch (err) {
        console.error(chalk.red('[TEMPLATE BUTTON] Gagal mengirim:'), err.message);
        throw err;
    }
}

// ============================================================
//  HELPER: Konfirmasi Dialog (Ya / Tidak)
// ============================================================

/**
 * Kirim dialog konfirmasi dengan 2 tombol (Ya/Tidak).
 *
 * @param {object} sock   - Baileys socket
 * @param {string} jid    - Chat JID
 * @param {string} text   - Pesan konfirmasi
 * @param {string} confirmId - Button ID jika Ya
 * @param {string} [cancelId='cancel'] - Button ID jika Tidak
 * @param {object} [sendOpts]
 *
 * @example
 *   await sendConfirm(sock, jid, 'Yakin mau hapus?', 'delete_confirm', 'delete_cancel', { quoted: key });
 */
async function sendConfirm(sock, jid, text, confirmId, cancelId = 'cancel', sendOpts = {}) {
    return sendButtons(sock, jid, {
        text,
        footer: 'Konfirmasi',
        buttons: [
            { id: confirmId, text: '✅ Ya' },
            { id: cancelId, text: '❌ Tidak' },
        ],
    }, sendOpts);
}

// ============================================================
//  HELPER: Pagination List (untuk hasil pencarian panjang)
// ============================================================

/**
 * Buat sections dari array items dengan pagination.
 * Berguna untuk menampilkan hasil pencarian YouTube, dll.
 *
 * @param {Array}  items       - Array item [{ title, description, id }]
 * @param {number} perSection  - Jumlah item per section (default 5)
 * @param {string} sectionTitle - Template judul section (gunakan {start}-{end})
 *
 * @returns {Array} sections untuk sendList()
 *
 * @example
 *   const sections = paginateList(videos.map((v, i) => ({
 *       id: `play_${i}`,
 *       title: `${i+1}. ${v.title}`,
 *       description: `${v.timestamp} | ${v.views}`,
 *   })), 5, 'Hasil {start}-{end}');
 */
function paginateList(items, perSection = 5, sectionTitle = 'Hasil {start}-{end}') {
    const sections = [];
    for (let i = 0; i < items.length; i += perSection) {
        const chunk = items.slice(i, i + perSection);
        const start = i + 1;
        const end = i + chunk.length;
        sections.push({
            title: sectionTitle.replace('{start}', start).replace('{end}', end),
            rows: chunk,
        });
    }
    return sections;
}

// ============================================================
//  GLOBAL BUTTON HANDLER REGISTRY
// ============================================================

/**
 * Registry global untuk button/list response handlers.
 * Plugin bisa mendaftarkan handler mereka di sini.
 *
 * Format:
 *   global._buttonHandlers = {
 *       pluginName: {
 *           handleButtonResponse(sock, opts)  -> opts: { from, sender, buttonId, displayText, key }
 *           handleListResponse(sock, opts)     -> opts: { from, sender, rowId, title, key }
 *       }
 *   }
 */
function registerButtonHandler(pluginName, handlers) {
    if (!global._buttonHandlers) {
        global._buttonHandlers = {};
    }
    global._buttonHandlers[pluginName] = handlers;
    console.log(chalk.green(`[BUTTON] Handler terdaftar: ${pluginName}`));
}

/**
 * Route button response ke handler yang sesuai.
 * Dipanggil oleh index.js saat menerima buttonsResponseMessage.
 */
async function routeButtonResponse(sock, opts) {
    const { from, sender, buttonId, displayText, key } = opts;

    if (!global._buttonHandlers) return false;

    // Coba semua handler yang terdaftar
    for (const [name, handler] of Object.entries(global._buttonHandlers)) {
        if (typeof handler.handleButtonResponse === 'function') {
            try {
                await handler.handleButtonResponse(sock, { from, sender, buttonId, displayText, key });
                return true; // Handler menangani button ini
            } catch (err) {
                console.error(chalk.red(`[BUTTON:${name}] Error:`), err.message);
            }
        }
    }

    return false; // Tidak ada handler yang menangani
}

/**
 * Route list response ke handler yang sesuai.
 * Dipanggil oleh index.js saat menerima listResponseMessage.
 */
async function routeListResponse(sock, opts) {
    const { from, sender, rowId, title, key } = opts;

    if (!global._buttonHandlers) return false;

    for (const [name, handler] of Object.entries(global._buttonHandlers)) {
        if (typeof handler.handleListResponse === 'function') {
            try {
                await handler.handleListResponse(sock, { from, sender, rowId, title, key });
                return true;
            } catch (err) {
                console.error(chalk.red(`[LIST:${name}] Error:`), err.message);
            }
        }
    }

    return false;
}

// ============================================================
//  EXPORTS
// ============================================================

module.exports = {
    sendButtons,
    sendList,
    sendTemplateButton,
    sendConfirm,
    paginateList,
    registerButtonHandler,
    routeButtonResponse,
    routeListResponse,
};
