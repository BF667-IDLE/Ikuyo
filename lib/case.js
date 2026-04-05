const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const moment = require('moment-timezone');
const btnHelper = require('./button');
const thumbnail = require('./thumbnail');

// ========================================
// Utility Functions
// ========================================

/**
 * Cek apakah sender adalah owner
 */
const isOwner = (sender) => {
    const owners = global.config.ownerNumber || [global.config.owner];
    const num = sender.replace(/[^0-9]/g, '');
    return owners.some(o => o === num);
};

/**
 * Format bytes ke ukuran yang mudah dibaca
 */
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Format uptime dari milidetik ke string yang mudah dibaca (Indonesia)
 */
const formatUptime = (ms) => {
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
};

/**
 * Hitung latency dan kirim reply
 */
const withLatency = async (m, generateReply) => {
    const start = Date.now();
    const reply = typeof generateReply === 'string' ? generateReply : await generateReply();
    const latency = Date.now() - start;
    return { reply, latency };
};

/**
 * Ambil semua command dari plugins yang ter-load
 */
const getPluginCommands = () => {
    const commands = {};
    if (!global.plugins) return commands;
    for (const [name, plugin] of Object.entries(global.plugins)) {
        if (plugin.command && Array.isArray(plugin.command)) {
            const category = plugin.category || 'Lainnya';
            if (!commands[category]) commands[category] = [];
            for (const cmd of plugin.command) {
                commands[category].push({ cmd, name: plugin.name || name });
            }
        }
    }
    return commands;
};

// ========================================
// Menu Button Response Handler
// ========================================

/**
 * Handle button/list response dari menu interaktif.
 * Dipanggil via global._buttonHandlers.menu
 */
async function handleMenuResponse(sock, opts) {
    const { from, sender, buttonId, rowId, key } = opts;
    const id = buttonId || rowId;
    const prefix = global.config.prefix || '/';

    const replyText = {
        'open_menubtn': `Ketik *${prefix}menubtn* untuk membuka menu interaktif dengan navigasi button!`,
        'open_menu_list': `Ketik *${prefix}menubtn* untuk membuka menu interaktif dengan gambar thumbnail! 🎨`,
        'menu_info':   `📊 *Status Bot*

Ketik *${prefix}status* untuk melihat status lengkap bot (memory, CPU, uptime, dll).

Ketik *${prefix}ping* untuk tes kecepatan.`,
        'menu_speed':  `📶 *Speedtest*

Ketik *${prefix}speedtest* untuk menjalankan tes kecepatan bot.

Ketik *${prefix}ping* untuk ping sederhana.`,
        'menu_owner':  `👑 *Owner Bot*

📞 Owner: wa.me/${global.config.owner}

Ketik *${prefix}owner* untuk tag owner di chat.`,
        'menu_script': `📜 *Script Info*

🤖 Bot: ${global.config.name}
📦 Repo: https://github.com/BF667-IDLE/Ikuyo
👤 Owner: BF667-IDLE (Rico Ardiansyah)
📄 License: MIT`,
        'menu_donasi': `💰 *Donasi*

Terima kasih sudah mau donasi! 🙏

📱 Pulsa: ${global.config.owner}
📞 Owner: wa.me/${global.config.owner}

Hubungi owner untuk metode pembayaran lainnya.`,
        'dl_play':    `🎵 *Play YouTube*

Ketik:
*${prefix}play <judul lagu>*

Contoh:
${prefix}play lalisa blackpink

Bot akan mencari dan menampilkan hasil dalam bentuk list interaktif.`,
        'dl_mp3':     `📥 *YouTube MP3*

Ketik:
*${prefix}ytmp3 <url YouTube>*

Contoh:
${prefix}ytmp3 https://youtube.com/watch?v=xxxxx`,
        'dl_mp4':     `🎬 *YouTube MP4*

Ketik:
*${prefix}ytmp4 <url YouTube>*

Contoh:
${prefix}ytmp4 https://youtube.com/watch?v=xxxxx`,
        'dl_search':  `🔍 *YouTube Search*

Ketik:
*${prefix}ytsearch <kata kunci>*

Contoh:
${prefix}ytsearch blackpink`,
        'dl_tiktok':  `📱 *TikTok Download*

Ketik:
*${prefix}tiktok <url TikTok>*

Contoh:
${prefix}tiktok https://vt.tiktok.com/xxxxx`,
        'cv_sticker': `🖼️ *Sticker Maker*

1. Kirim gambar ke chat
2. Quote/Reply gambar tersebut
3. Ketik *${prefix}sticker*

Untuk video ke GIF sticker:
${prefix}stickergif`,
        'cv_sgif':    `🎞️ *Sticker GIF*

1. Kirim video (maks 10 detik)
2. Quote/Reply video tersebut
3. Ketik *${prefix}stickergif*`,
        'cv_toimg':   `🖼️ *Sticker to Image*

1. Kirim sticker ke chat
2. Quote/Reply sticker tersebut
3. Ketik *${prefix}take* atau *${prefix}toimg*`,
        'grp_info':   `📋 *Group Info*

Ketik *${prefix}groupinfo* untuk melihat info lengkap grup (nama, deskripsi, member, admin, dll).`,
        'grp_admin':  `👑 *List Admin*

Ketik *${prefix}listadmin* untuk melihat daftar admin grup.`,
        'grp_tag':    `📢 *Tag All*

Ketik:
*${prefix}tagall <pesan opsional>*

Contoh:
${prefix}tagall Rapat jam 8 malam`,
        'grp_link':   `🔗 *Group Link*

Ketik *${prefix}linkgroup* untuk mendapatkan link invite grup.\n\n⚠️ Butuh bot sebagai admin.`,
        'ai_chat':    `💬 *AI Chat*

Ketik:
*${prefix}ai <pesan>*

Contoh:
${prefix}ai jelaskan tentang black hole

⚠️ Perlu API key Gemini. Set di config.js`,
        'ai_img':     `🎨 *AI Image Generator*

Ketik:
*${prefix}img <prompt gambar>*

Contoh:
${prefix}img a cute cat in garden

 gratis, tidak perlu API key!`,
        'tx_style':   `✏️ *Font Style*

Ketik:
*${prefix}style <teks>*

Contoh:
${prefix}style hello world

Bot akan menampilkan teks dalam 8+ gaya font berbeda.`,
        'tx_translate': `🌐 *Translate*

Ketik:
*${prefix}translate <teks>*

Default: Indonesia → English

Kustom: *${prefix}translate en|id Good morning*`,
        'fun_quote':  `💭 *Quote*

Ketik *${prefix}quote* untuk mendapatkan quote inspiratif random.`,
        'fun_joke':   `😂 *Joke*

Ketik *${prefix}joke* untuk mendapatkan lelucon random.`,
        'fun_tod':    `🎯 *Truth or Dare*

Ketik *${prefix}truth* untuk pertanyaan truth.
Ketik *${prefix}dare* untuk tantangan dare.`,
        'fun_roll':   `🎲 *Roll Dice*

Ketik *${prefix}roll* untuk lempar dadu (1-6).
Ketik *${prefix}roll 100* untuk angka random 1-100.`,
        'fun_math':   `🧮 *Math*

Ketik:
*${prefix}math <ekspresi>*

Contoh:
${prefix}math 2+2*3
${prefix}math sqrt(144)`,
        'jb_create':   `🚀 *Buat JadiBot*

Ketik:
*${prefix}jadibot*

Nomor kamu akan otomatis dijadikan bot.
Pastikan sudah baca dan setujui TOS terlebih dahulu.

⚠️ Hanya untuk owner bot.`,
        'jb_stop':    `🛑 *Stop JadiBot*

Ketik:
*${prefix}jadibot stop*

Menghentikan jadibot yang sedang berjalan.
Session akan dihapus.`,
        'jb_private': `🔒 *Mode Private*

Ketik:
*${prefix}jadibot private*

Hanya kamu (owner jadibot) yang bisa menggunakan bot.

 Cocok untuk penggunaan pribadi.`,
        'jb_public':  `🌐 *Mode Public*

Ketik:
*${prefix}jadibot public*

Semua orang bisa menggunakan jadibot kamu.

⚠️ Berhati-hati, kamu bertanggung jawab atas aktivitas jadibot.`,
        'jb_list':     `📋 *List JadiBot*

Ketik:
*${prefix}listjadi*

Melihat daftar semua jadibot yang sedang aktif,
beserta mode, uptime, dan owner-nya.`,
    };

    const response = replyText[id];
    if (response) {
        await sock.sendMessage(from, { text: response }, { quoted: key });
    }
}

// Daftarkan menu button handler secara global
if (typeof globalThis !== 'undefined') {
    if (!globalThis._buttonHandlers) globalThis._buttonHandlers = {};
    globalThis._buttonHandlers.menu = {
        handleButtonResponse: handleMenuResponse,
        handleListResponse: handleMenuResponse,
    };
}

// ========================================
// Case Handler Utama
// ========================================

module.exports = async (m, sock, { text, prefix, command, args, fullArgs, from, isGroup, sender }) => {
    // Inisialisasi stats jika belum ada
    if (!global.botStats) {
        global.botStats = { commandsExecuted: 0 };
    }

    switch (command) {
        // ==================
        // GENERAL
        // ==================
        case 'menu': {
            const now = moment().tz('Asia/Jakarta').format('dddd, DD MMMM YYYY · HH:mm:ss');
            const uptime = formatUptime(Date.now() - (global.startTime || Date.now()));
            const pluginCmds = getPluginCommands();

            let menuText = `╭━━━━━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *${global.config.name}* Bot  
┃  📅 ${now} WIB
┃  ⏱ Uptime: ${uptime}
╰━━━━━━━━━━━━━━━━━━━━━━━╯\n`;

            // Category: General
            menuText += `╭─── 🔰 *General* ───╮
┃ ${prefix}menu       - Menu bot
┃ ${prefix}ping       - Cek kecepatan bot
┃ ${prefix}uptime     - Uptime bot
┃ ${prefix}runtime    - Uptime bot
┃ ${prefix}speedtest  - Speedtest bot
┃ ${prefix}status     - Status bot lengkap
╰─────────────────────╯\n`;

            // Category: Info
            menuText += `╭─── 🛡️ *Info* ───╮
┃ ${prefix}owner      - Info owner
┃ ${prefix}script     - Link repository
┃ ${prefix}donasi     - Donasi
╰─────────────────────╯\n`;

            // Category: Owner (hanya tampil jika owner)
            if (m.isOwner || isOwner(sender)) {
                menuText += `╭─── 👑 *Owner* ───╮
┃ ${prefix}shutdown    - Matikan bot
┃ ${prefix}setprefix   - Ubah prefix
┃ ${prefix}setname     - Ubah nama bot
┃ ${prefix}pair        - Setting pairing
┃ ${prefix}cleartemp   - Bersihkan temp
┃ ${prefix}join        - Join grup
┃ ${prefix}leave       - Keluar grup
╰─────────────────────╯\n`;
            }

            // Category: Group
            if (isGroup) {
                menuText += `╭─── 👥 *Group* ───╮
┃ ${prefix}kick        - Kick member
┃ ${prefix}add         - Tambah member
┃ ${prefix}promote     - Jadikan admin
┃ ${prefix}demote      - Turunkan admin
┃ ${prefix}linkgroup   - Link grup
┃ ${prefix}revoke      - Revoke link
┃ ${prefix}setname     - Ubah nama grup
┃ ${prefix}setdesc     - Ubah deskripsi
┃ ${prefix}tagall      - Tag semua
┃ ${prefix}hidetag     - Tag semua (hidden)
┃ ${prefix}groupinfo   - Info grup
┃ ${prefix}listadmin   - Daftar admin
┃ ${prefix}antilink    - Anti link
┃ ${prefix}welcome     - Toggle welcome
╰─────────────────────╯\n`;
            } else {
                menuText += `╭─── 👥 *Group* ───╮
┃  *(Masuk grup untuk melihat)*
╰─────────────────────╯\n`;
            }

            // Category: Downloader
            menuText += `╭─── 📥 *Downloader* ───╮
┃ ${prefix}play        - Play YouTube
┃ ${prefix}ytmp3       - Download YouTube MP3
┃ ${prefix}ytmp4       - Download YouTube MP4
┃ ${prefix}ytsearch    - Cari YouTube
┃ ${prefix}tiktok      - Download TikTok
╰─────────────────────╯\n`;

            // Category: Converter
            menuText += `╭─── 🔄 *Converter* ───╮
┃ ${prefix}sticker     - Gambar ke sticker
┃ ${prefix}stickergif  - Video ke sticker
┃ ${prefix}take        - Sticker ke gambar
┃ ${prefix}toimg       - Sticker ke gambar
╰─────────────────────╯\n`;

            // Category: Fun
            menuText += `╭─── 🎮 *Fun* ───╮
┃ ${prefix}quote       - Quote inspiratif
┃ ${prefix}fact        - Fakta random
┃ ${prefix}joke        - Lelucon random
┃ ${prefix}truth       - Truth or Dare
┃ ${prefix}dare        - Truth or Dare
┃ ${prefix}roll        - Lempar dadu
┃ ${prefix}flip        - Lempar koin
┃ ${prefix}pick        - Pilihan random
┃ ${prefix}rate        - Rate sesuatu
┃ ${prefix}math        - Hitung matematika
┃ ${prefix}timer       - Timer
┃ ${prefix}couple      - Ship couple
╰─────────────────────╯\n`;

            // Category: Text Utilities
            menuText += `╭─── ✏️ *Text* ───╮
┃ ${prefix}style       - Font fancy
┃ ${prefix}uppercase   - HURUF BESAR
┃ ${prefix}lowercase   - huruf kecil
┃ ${prefix}reverse     - Balik teks
┃ ${prefix}hash        - Hash teks
┃ ${prefix}encode      - Base64 encode
┃ ${prefix}decode      - Base64 decode
┃ ${prefix}qr          - Buat QR Code
┃ ${prefix}ttp         - Text to picture
╰─────────────────────╯\n`;

            // Category: AI
            menuText += `╭─── 🤖 *AI* ───╮
┃ ${prefix}ai          - Chat AI
┃ ${prefix}img         - Generate gambar AI
┃ ${prefix}translate   - Terjemahkan
┃ ${prefix}define      - Definisi kata
╰─────────────────────╯\n`;

            // Category: JadiBot (hanya tampil jika owner)
            if (m.isOwner || isOwner(sender)) {
                menuText += `╭─── 🤖 *JadiBot* ───╮
┃ ${prefix}jadibot     - Buat jadibot
┃ ${prefix}jadibot stop- Stop jadibot
┃ ${prefix}jadibot private
┃ ${prefix}jadibot public
┃ ${prefix}listjadi    - Daftar jadibot
┃ ${prefix}banjadi     - Ban jadibot
┃ ${prefix}unban       - Unban jadibot
╰─────────────────────╯\n`;
            }

            // Footer
            const totalPlugins = Object.keys(global.plugins || {}).length;
            const totalCmds = totalPlugins + 12; // plugins + built-in commands
            menuText += `\n╭━━━━━━━━━━━━━━━━━━━━━━━╮
┃  Prefix: *${prefix}*
┃  Plugins: ${totalPlugins} aktif
┃  Total Commands: ~${totalCmds}
┃  📎 ${global.config.repo}
╰━━━━━━━━━━━━━━━━━━━━━━━╯`;

            global.botStats.commandsExecuted++;
            await m.reply(menuText);

            // Kirim quick button untuk switch ke menu button + thumbnail gambar
            try {
                const thumbBuf = await thumbnail.getDefaultThumbnail();
                await btnHelper.sendButtons(sock, from, {
                    text: `💡 Ingin menu yang lebih interaktif?

Ketik *${prefix}menubtn* untuk menu button ✨`,
                    footer: 'Ikuyo Bot',
                    buttons: [
                        { id: 'open_menubtn', text: '☰ Menu Button' },
                    ],
                    header: {
                        type: 'image',
                        media: thumbBuf,
                    },
                }, { quoted: m.key });
            } catch (err) {
                // Silent fail - text menu sudah dikirim
            }
            break;
        }

        case 'ping': {
            const { reply, latency } = await withLatency(m, () => 'Pong!');
            global.botStats.commandsExecuted++;
            await m.reply(
                `🏓 *Pong!*\n\n` +
                `⚡ Speed: *${latency}ms*\n` +
                `⏱ Uptime: ${formatUptime(Date.now() - (global.startTime || Date.now()))}\n` +
                `🕐 Time: ${moment().tz('Asia/Jakarta').format('HH:mm:ss')} WIB\n` +
                `📊 Commands: ${global.botStats.commandsExecuted}`
            );
            break;
        }

        case 'uptime':
        case 'runtime': {
            const uptimeMs = Date.now() - (global.startTime || Date.now());
            const uptimeStr = formatUptime(uptimeMs);
            const startTimeStr = global.startTime ? moment(global.startTime).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss') : 'Unknown';
            global.botStats.commandsExecuted++;
            await m.reply(
                `⏱️ *Uptime Bot*\n\n` +
                `⏰ Uptime: *${uptimeStr}*\n` +
                `📅 Mulai: ${startTimeStr} WIB\n` +
                `📊 Commands: ${global.botStats.commandsExecuted}`
            );
            break;
        }

        case 'speedtest': {
            const rounds = 5;
            const latencies = [];
            for (let i = 0; i < rounds; i++) {
                const start = Date.now();
                await sock.chatRead(m.from, undefined).catch(() => {});
                latencies.push(Date.now() - start);
            }
            const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1);
            const min = Math.min(...latencies);
            const max = Math.max(...latencies);
            const health = avg < 50 ? '🟢 Sangat Cepat' : avg < 150 ? '🟡 Normal' : avg < 500 ? '🟠 Lambat' : '🔴 Sangat Lambat';
            global.botStats.commandsExecuted++;
            await m.reply(
                `📶 *Speed Test*\n\n` +
                `📊 Rata-rata: *${avg}ms*\n` +
                `🟢 Tercepat: ${min}ms\n` +
                `🔴 Terlambat: ${max}ms\n` +
                `🔄 Rounds: ${rounds}x\n` +
                `💪 Kesehatan: ${health}\n` +
                `📈 Detail: ${latencies.join(', ')}ms`
            );
            break;
        }

        case 'status': {
            const memUsage = process.memoryUsage();
            const uptimeMs = Date.now() - (global.startTime || Date.now());
            global.botStats.commandsExecuted++;
            await m.reply(
                `🤖 *Status Bot ${global.config.name}*\n\n` +
                `⏱ Uptime: ${formatUptime(uptimeMs)}\n` +
                `📥 Total Commands: ${global.botStats.commandsExecuted}\n` +
                `🔌 Active Plugins: ${Object.keys(global.plugins || {}).length}\n\n` +
                `💾 *Memory Usage*\n` +
                `  RSS: ${formatBytes(memUsage.rss)}\n` +
                `  Heap Used: ${formatBytes(memUsage.heapUsed)}\n` +
                `  Heap Total: ${formatBytes(memUsage.heapTotal)}\n` +
                `  External: ${formatBytes(memUsage.external)}\n\n` +
                `🖥 *System*\n` +
                `  CPU Cores: ${os.cpus().length}\n` +
                `  Platform: ${os.platform()} ${os.arch()}\n` +
                `  Node.js: ${process.version}\n` +
                `  Hostname: ${os.hostname()}`
            );
            break;
        }

        // ==================
        // INFO
        // ==================
        case 'owner': {
            const ownerNum = global.config.owner;
            global.botStats.commandsExecuted++;
            await m.reply(
                `👑 *Owner Bot*\n\n` +
                `🤖 Bot: ${global.config.name}\n` +
                `📞 Owner: @${ownerNum}\n` +
                `🔗 wa.me/${ownerNum}`,
                { mentions: [`${ownerNum}@s.whatsapp.net`] }
            );
            break;
        }

        case 'script':
        case 'sc': {
            global.botStats.commandsExecuted++;
            await m.reply(
                `📜 *Script Info*\n\n` +
                `🤖 Bot: ${global.config.name}\n` +
                `📦 Repo: https://github.com/BF667-IDLE/Ikuyo\n` +
                `👤 Owner: BF667-IDLE (Rico Ardiansyah)\n` +
                `📄 License: MIT\n\n` +
                `Jangan lupa kasih ⭐ di repo! 🌟`
            );
            break;
        }

        case 'donasi':
        case 'donate': {
            global.botStats.commandsExecuted++;
            await m.reply(
                `💰 *Donasi ${global.config.name}*\n\n` +
                `Terima kasih sudah mau donasi! 🙏\n\n` +
                `📱 *Pulsa/Tsel:* ${global.config.owner}\n` +
                `🏦 *Dana/OVO/Gopay:* (Hub owner)\n` +
                `₿ *Trakteer/Ko-fi:* (Hub owner)\n\n` +
                `Setiap donasi sangat berarti untuk\n` +
                `pengembangan bot ini! ❤️\n\n` +
                `📞 Owner: wa.me/${global.config.owner}`
            );
            break;
        }

        // ==================
        // OWNER ONLY
        // ==================
        case 'shutdown': {
            if (!isOwner(sender)) {
                await m.reply('❌ Command ini khusus owner!');
                break;
            }
            global.botStats.commandsExecuted++;
            await m.reply('⏳ Bot dimatikan oleh owner...');
            setTimeout(() => process.exit(0), 2000);
            break;
        }

        case 'setprefix': {
            if (!isOwner(sender)) {
                await m.reply('❌ Command ini khusus owner!');
                break;
            }
            const newPrefix = args[0];
            if (!newPrefix) {
                await m.reply(`❌ Masukkan prefix baru!\n\nContoh: ${prefix}setprefix .`);
                break;
            }
            global.config.prefix = newPrefix;
            global.botStats.commandsExecuted++;
            await m.reply(`✅ Prefix berhasil diubah ke *${newPrefix}*`);
            break;
        }

        case 'setname': {
            if (!isOwner(sender)) {
                await m.reply('❌ Command ini khusus owner!');
                break;
            }
            const newName = args.join(' ');
            if (!newName) {
                await m.reply(`❌ Masukkan nama baru!\n\nContoh: ${prefix}setname MyBot`);
                break;
            }
            global.config.name = newName;
            global.botStats.commandsExecuted++;
            await m.reply(`✅ Nama bot berhasil diubah ke *${newName}*`);
            break;
        }

        case 'cleartemp': {
            if (!isOwner(sender)) {
                await m.reply('❌ Command ini khusus owner!');
                break;
            }
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
                await m.reply('📁 Folder temp tidak ditemukan.');
                break;
            }
            const files = fs.readdirSync(tempDir);
            for (const file of files) {
                fs.unlinkSync(path.join(tempDir, file));
            }
            global.botStats.commandsExecuted++;
            await m.reply(`✅ Berhasil menghapus ${files.length} file dari folder temp.`);
            break;
        }

        case 'join': {
            if (!isOwner(sender)) {
                await m.reply('❌ Command ini khusus owner!');
                break;
            }
            const inviteCode = args[0];
            if (!inviteCode) {
                await m.reply(`❌ Masukkan link/kode invite grup!\n\nContoh: ${prefix}join https://chat.whatsapp.com/XXXXX`);
                break;
            }
            try {
                const code = inviteCode.replace('https://chat.whatsapp.com/', '').trim();
                await sock.groupAcceptInvite(code);
                global.botStats.commandsExecuted++;
                await m.reply('✅ Berhasil bergabung ke grup!');
            } catch (err) {
                await m.reply(`❌ Gagal join grup: ${err.message}`);
            }
            break;
        }

        case 'leave': {
            if (!isOwner(sender)) {
                await m.reply('❌ Command ini khusus owner!');
                break;
            }
            if (!isGroup) {
                await m.reply('❌ Command ini hanya untuk grup!');
                break;
            }
            try {
                await sock.groupLeave(m.from);
            } catch (err) {
                await m.reply(`❌ Gagal keluar grup: ${err.message}`);
            }
            break;
        }

        case 'pair': {
            if (!isOwner(sender)) {
                await m.reply('❌ Command ini khusus owner!');
                break;
            }
            const newPhone = args[0];
            if (!newPhone) {
                const currentPhone = (global.config.pairing?.phone_number || global.config.pairing?.pairing_code || global.config.owner || '').replace(/[^0-9]/g, '');
                const currentMode = global.config.pairing?.enabled !== undefined ? (global.config.pairing.enabled ? 'Pairing Code' : 'QR Code') : (global.config.pairing?.is_pairing ? 'Pairing Code' : 'QR Code');
                await m.reply(
                    `🔗 *Pairing Settings*\n\n` +
                    `📱 Mode: *${currentMode}*\n` +
                    `📞 Nomor: *${currentPhone}*\n\n` +
                    `*Usage:*\n` +
                    `${prefix}pair <nomor> — Set nomor pairing\n` +
                    `${prefix}pair mode code — Mode pairing code\n` +
                    `${prefix}pair mode qr — Mode QR code\n\n` +
                    `⚠️ Kode pairing di-generate random oleh WhatsApp.\n` +
                    `Yang bisa di-custom hanya *nomor telepon* penerima.`
                );
                break;
            }

            if (newPhone === 'mode') {
                const mode = (args[1] || '').toLowerCase();
                if (mode === 'code') {
                    global.config.pairing.enabled = true;
                    global.config.pairing.is_pairing = true;
                    await m.reply('✅ Mode diubah ke *Pairing Code*.\n\n🔄 Restart diperlukan untuk menerapkan perubahan.');
                } else if (mode === 'qr') {
                    global.config.pairing.enabled = false;
                    global.config.pairing.is_pairing = false;
                    await m.reply('✅ Mode diubah ke *QR Code*.\n\n🔄 Restart diperlukan untuk menerapkan perubahan.');
                } else {
                    await m.reply(`❌ Mode tidak valid!\n\nGunakan: ${prefix}pair mode code / ${prefix}pair mode qr`);
                }
                break;
            }

            // Set phone number
            const formatted = newPhone.replace(/[^0-9]/g, '');
            if (!formatted || formatted.length < 10) {
                await m.reply(`❌ Nomor tidak valid!\n\nContoh: ${prefix}pair 6281234567890`);
                break;
            }
            global.config.pairing.phone_number = formatted;
            global.botStats.commandsExecuted++;
            await m.reply(
                `✅ Nomor pairing berhasil diubah!\n\n` +
                `📱 Nomor Baru: *${formatted}*\n` +
                `🔔 Mode: ${global.config.pairing.enabled ? 'Pairing Code' : 'QR Code'}\n\n` +
                `🔄 Restart diperlukan untuk menerapkan perubahan.\n` +
                `Gunakan *${prefix}restart* atau jalankan ulang bot.`
            );
            break;
        }

        // ==================
        // MENU BUTTON (INTERACTIVE LIST)
        // ==================
        case 'menubtn': {
            const now = moment().tz('Asia/Jakarta').format('dddd, DD MMMM YYYY · HH:mm:ss');
            const uptime = formatUptime(Date.now() - (global.startTime || Date.now()));
            const totalPlugins = Object.keys(global.plugins || {}).length;

            try {
                // Kirim gambar thumbnail + tombol menu
                const thumbBuf = await thumbnail.getDefaultThumbnail();
                await btnHelper.sendButtons(sock, from, {
                    text: `🤖 *${global.config.name} Bot*

📅 ${now} WIB
⏱ Uptime: ${uptime}
🔌 Plugins: ${totalPlugins} aktif

_Silakan tekan tombol di bawah untuk membuka menu lengkap._`,
                    footer: `Prefix: ${prefix} │ © BF667-IDLE`,
                    buttons: [
                        { id: 'open_menu_list', text: '📋 Buka Menu' },
                    ],
                    header: {
                        type: 'image',
                        media: thumbBuf,
                    },
                }, { quoted: m.key });

                // Kirim interactive list
                await btnHelper.sendList(sock, from, {
                    text: `📋 *Menu ${global.config.name}*
_Pilih kategori di bawah:_
`,
                    buttonText: '☰ Pilih Kategori',
                    footer: 'Prefix: ' + prefix + ' │ Total: ~76 commands',
                    sections: [
                        {
                            title: '🔰 General',
                            rows: [
                                { id: 'menu_info', title: '📊 Status Bot', description: 'Ping, uptime, memory, CPU' },
                                { id: 'menu_speed', title: '📶 Speedtest', description: 'Tes kecepatan respon bot' },
                                { id: 'menu_owner', title: '👑 Info Owner', description: 'Kontak owner bot' },
                                { id: 'menu_script', title: '📜 Script & Repo', description: 'Link repository & info' },
                                { id: 'menu_donasi', title: '💰 Donasi', description: 'Bantu support bot' },
                            ],
                        },
                        {
                            title: '📥 Downloader',
                            rows: [
                                { id: 'dl_play', title: '🎵 Play YouTube', description: 'Ketik ' + prefix + 'play <judul lagu>' },
                                { id: 'dl_mp3', title: '📥 YouTube MP3', description: 'Ketik ' + prefix + 'ytmp3 <url>' },
                                { id: 'dl_mp4', title: '🎬 YouTube MP4', description: 'Ketik ' + prefix + 'ytmp4 <url>' },
                                { id: 'dl_search', title: '🔍 YouTube Search', description: 'Ketik ' + prefix + 'ytsearch <query>' },
                                { id: 'dl_tiktok', title: '📱 TikTok Download', description: 'Ketik ' + prefix + 'tiktok <url>' },
                            ],
                        },
                        {
                            title: '🔄 Converter',
                            rows: [
                                { id: 'cv_sticker', title: '🖼️ Sticker Maker', description: 'Kirim gambar + ' + prefix + 'sticker' },
                                { id: 'cv_sgif', title: '🎞️ Sticker GIF', description: 'Kirim video + ' + prefix + 'stickergif' },
                                { id: 'cv_toimg', title: '🖼️ Sticker to Image', description: 'Quote sticker + ' + prefix + 'take' },
                            ],
                        },
                        {
                            title: '👥 Group Management',
                            rows: [
                                { id: 'grp_info', title: '📋 Group Info', description: 'Ketik ' + prefix + 'groupinfo' },
                                { id: 'grp_admin', title: '👑 List Admin', description: 'Ketik ' + prefix + 'listadmin' },
                                { id: 'grp_tag', title: '📢 Tag All', description: 'Ketik ' + prefix + 'tagall <pesan>' },
                                { id: 'grp_link', title: '🔗 Group Link', description: 'Ketik ' + prefix + 'linkgroup' },
                            ],
                        },
                        {
                            title: '🤖 AI & Text',
                            rows: [
                                { id: 'ai_chat', title: '💬 AI Chat', description: 'Ketik ' + prefix + 'ai <pesan>' },
                                { id: 'ai_img', title: '🎨 AI Image', description: 'Ketik ' + prefix + 'img <prompt>' },
                                { id: 'tx_style', title: '✏️ Font Style', description: 'Ketik ' + prefix + 'style <teks>' },
                                { id: 'tx_translate', title: '🌐 Translate', description: 'Ketik ' + prefix + 'translate <teks>' },
                            ],
                        },
                        {
                            title: '🎮 Fun & Games',
                            rows: [
                                { id: 'fun_quote', title: '💭 Quote', description: 'Ketik ' + prefix + 'quote' },
                                { id: 'fun_joke', title: '😂 Joke', description: 'Ketik ' + prefix + 'joke' },
                                { id: 'fun_tod', title: '🎯 Truth or Dare', description: 'Ketik ' + prefix + 'truth atau ' + prefix + 'dare' },
                                { id: 'fun_roll', title: '🎲 Roll Dice', description: 'Ketik ' + prefix + 'roll' },
                                { id: 'fun_math', title: '🧮 Math', description: 'Ketik ' + prefix + 'math <ekspresi>' },
                            ],
                        },
                        {
                            title: '🤖 JadiBot',
                            rows: [
                                { id: 'jb_create', title: '🚀 Buat JadiBot', description: 'Ketik ' + prefix + 'jadibot' },
                                { id: 'jb_stop', title: '🛑 Stop JadiBot', description: 'Ketik ' + prefix + 'jadibot stop' },
                                { id: 'jb_private', title: '🔒 Mode Private', description: 'Ketik ' + prefix + 'jadibot private' },
                                { id: 'jb_public', title: '🌐 Mode Public', description: 'Ketik ' + prefix + 'jadibot public' },
                                { id: 'jb_list', title: '📋 List JadiBot', description: 'Ketik ' + prefix + 'listjadi' },
                            ],
                        },
                    ],
                }, { quoted: m.key });
                global.botStats.commandsExecuted++;
            } catch (err) {
                // Fallback ke text menu jika list gagal
                console.error('[MENUBTN]', err.message);
                await m.reply('❌ Gagal menampilkan menu button. Gunakan */menu* untuk menu text biasa.');
            }
            break;
        }

        // ==================
        // DEFAULT
        // ==================
        default: {
            // Jangan kirim "command tidak ditemukan" jika plugin sudah menangani
            const pluginHandled = Object.values(global.plugins || {}).some(
                p => p.command && Array.isArray(p.command) && p.command.includes(command)
            );
            if (text.startsWith(prefix) && !pluginHandled) {
                await m.reply(`❌ Command *${command}* tidak ditemukan!\n\nKetik *${prefix}menu* untuk melihat daftar command.`);
            }
            break;
        }
    }
};

// Fitur Auto Reload untuk Case
const currentFile = __filename;
fs.watchFile(currentFile, () => {
    fs.unwatchFile(currentFile);
    console.log(chalk.green(`✓ ${path.basename(currentFile)} updated! Reloading...`));
    delete require.cache[require.resolve(currentFile)];
});
