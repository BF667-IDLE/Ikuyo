/**
 * ═══════════════════════════════════════════════════════
 *  JadiBot Plugin - User-facing Commands
 *  For Ikuyo WhatsApp Bot
 * ═══════════════════════════════════════════════════════
 *
 * Commands:
 *   .jadibot          - Minta kode pairing untuk jadi bot
 *   .jadibot stop     - Stop jadibot yang sedang berjalan
 *   .jadibot private  - Set mode private (hanya owner)
 *   .jadibot public   - Set mode public (semua orang)
 *   .listjadi         - Lihat daftar jadibot aktif
 *   .banjadi <nomor>  - Ban jadibot (OWNER ONLY)
 *   .unban <nomor>    - Unban jadibot (OWNER ONLY)
 */

import moment from 'moment-timezone';

// ═══════════════════════════════════════
// Owner Check
// ═══════════════════════════════════════

const JADIBOT_OWNER = '6283150958207';

const isJadibotOwner = (sender) => {
    const num = sender.replace(/[^0-9]/g, '');
    return num === JADIBOT_OWNER;
};

// ═══════════════════════════════════════
// Pending Confirmation Map
// ═══════════════════════════════════════

const pendingConfirm = {};

const setPending = (id, action, label) => {
    if (pendingConfirm[id]) clearTimeout(pendingConfirm[id].timer);
    pendingConfirm[id] = {
        action,
        label,
        timer: setTimeout(() => {
            delete pendingConfirm[id];
        }, 60000),
    };
};

const checkPending = (id) => {
    const p = pendingConfirm[id];
    if (!p) return null;
    clearTimeout(p.timer);
    delete pendingConfirm[id];
    return p;
};

// ═══════════════════════════════════════
// Plugin Definition
// ═══════════════════════════════════════

export default {
    name: 'JadiBot',
    category: 'JadiBot',
    command: ['jadibot', 'listjadi', 'banjadi', 'unban'],

    description: 'Fitur JadiBot - Jadikan nomor WhatsApp kamu sebagai bot',

    run: async (m, sock, { text, prefix, command, args, fullArgs, from, isGroup, sender }) => {
        const jadibot = require('../lib/jadibot');

        try {
            switch (command) {
                // ═══════════════════════════════════════
                // 1. JADIBOT - Buat / Kelola JadiBot
                // ═══════════════════════════════════════
                case 'jadibot': {
                    const subCmd = args[0]?.toLowerCase();

                    // ── .jadibot stop ──
                    if (subCmd === 'stop') {
                        const result = jadibot.stop(sender.replace(/[^0-9]/g, ''));
                        return m.reply(result.message);
                    }

                    // ── .jadibot private ──
                    if (subCmd === 'private') {
                        const result = jadibot.setMode(sender.replace(/[^0-9]/g, ''), 'private');
                        return m.reply(result.message);
                    }

                    // ── .jadibot public ──
                    if (subCmd === 'public') {
                        const result = jadibot.setMode(sender.replace(/[^0-9]/g, ''), 'public');
                        return m.reply(result.message);
                    }

                    // ── .jadibot (tanpa argumen) = buat jadibot baru ──
                    // Owner only check
                    if (!isJadibotOwner(sender) && !m.isOwner) {
                        return m.reply('❌ Fitur JadiBot saat ini hanya tersedia untuk *owner bot*!\n\n' +
                            `📱 Owner: wa.me/${JADIBOT_OWNER}`);
                    }

                    // Cek apakah user sudah accept TOS
                    if (!jadibot.hasAcceptedTos(sender)) {
                        // Cek apakah ada pending TOS
                        if (jadibot.hasPendingTos(sender)) {
                            return m.reply(
                                `⏳ Kamu sudah menerima TOS!\n\n` +
                                `Ketik *${prefix}jadibot* lagi untuk memulai pembuatan jadibot.\n\n` +
                                `⚠️ Jika kamu tidak ingin melanjutkan, abaikan pesan ini.`
                            );
                        }

                        // Kirim TOS
                        const tosText = jadibot.getTosText();
                        await m.reply(tosText);

                        await m.reply(
                            `\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                            `Ketik *${prefix}jadibot accept* untuk menyetujui TOS di atas.\n` +
                            `Ketik *${prefix}jadibot decline* untuk menolak.\n\n` +
                            `⏰ Tautan TOS akan kadaluarsa dalam 10 menit.`
                        );

                        jadibot.setPendingTos(sender);
                        return;
                    }

                    // Cek "accept" / "decline"
                    if (subCmd === 'accept') {
                        if (!jadibot.hasPendingTos(sender)) {
                            return m.reply('ℹ️ Tidak ada TOS yang menunggu persetujuan.\n\nKetik *.jadibot* untuk memulai.');
                        }

                        jadibot.acceptTos(sender);
                        jadibot.clearPendingTos(sender);

                        return m.reply(
                            `✅ *TOS Diterima!*\n\n` +
                            `Kamu telah menyetujui Syarat & Ketentuan JadiBot.\n\n` +
                            `Ketik *${prefix}jadibot* untuk memulai pembuatan jadibot.`
                        );
                    }

                    if (subCmd === 'decline') {
                        jadibot.clearPendingTos(sender);
                        return m.reply('❌ TOS ditolak. Kamu tidak bisa menggunakan fitur JadiBot.');
                    }

                    // ── Validasi: apakah ada nomor target? ──
                    // Default: pakai nomor sender itu sendiri
                    const targetNumber = args[0] && !['accept', 'decline', 'stop', 'private', 'public'].includes(subCmd)
                        ? args[0].replace(/[^0-9]/g, '')
                        : sender.replace(/[^0-9]/g, '');

                    if (!targetNumber || targetNumber.length < 10) {
                        return m.reply(
                            `❌ Nomor tidak valid!\n\n` +
                            `*Penggunaan:*\n` +
                            `${prefix}jadibot\n` +
                            `${prefix}jadibot <nomor>\n\n` +
                            `*Contoh:*\n` +
                            `${prefix}jadibot 6281234567890`
                        );
                    }

                    // ── Buat jadibot ──
                    await m.reply('⏳ Membuat JadiBot...\n\nMohon tunggu, sedang mempersiapkan koneksi.');

                    const result = await jadibot.create(targetNumber, sender, 'private');

                    if (result.mentions) {
                        await sock.sendMessage(from, {
                            text: result.message,
                            mentions: result.mentions,
                        }, { quoted: m.key });
                    } else {
                        await m.reply(result.message);
                    }

                    return;
                }

                // ═══════════════════════════════════════
                // 2. LISTJADI - Daftar JadiBot Aktif
                // ═══════════════════════════════════════
                case 'listjadi': {
                    const list = jadibot.list();

                    if (list.length === 0) {
                        return m.reply(
                            `📋 *Daftar JadiBot Aktif*\n\n` +
                            `Tidak ada jadibot yang sedang berjalan saat ini.\n\n` +
                            `💡 Owner bisa membuat jadibot dengan:\n${prefix}jadibot <nomor>`
                        );
                    }

                    let replyText = `📋 *Daftar JadiBot Aktif*\n` +
                        `Total: *${list.length}* jadibot\n` +
                        `Maksimal: *${10}* jadibot\n\n`;

                    replyText += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                    list.forEach((bot, index) => {
                        const ownerNum = bot.owner.replace(/[^0-9]/g, '');
                        const statusIcon = bot.state === 'connected' ? '🟢' : bot.state === 'pairing' ? '🟡' : '🔴';
                        const modeIcon = bot.mode === 'private' ? '🔒' : '🌐';
                        const uptimeStr = jadibot.formatUptime(bot.uptime);
                        const startTimeStr = moment(bot.startTime).tz('Asia/Jakarta').format('DD/MM HH:mm');

                        replyText += `${statusIcon} *JadiBot #${index + 1}*\n` +
                            `  📱 Nomor: ${bot.number}\n` +
                            `  👤 Owner: @${ownerNum}\n` +
                            `  ${modeIcon} Mode: ${bot.mode === 'private' ? 'Private' : 'Public'}\n` +
                            `  ⏱ Uptime: ${uptimeStr}\n` +
                            `  📅 Mulai: ${startTimeStr} WIB\n\n`;
                    });

                    replyText += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                    replyText += `💡 *Commands:*\n`;
                    replyText += `  ${prefix}jadibot - Buat jadibot baru\n`;
                    replyText += `  ${prefix}jadibot stop - Stop jadibot\n`;
                    replyText += `  ${prefix}jadibot private - Mode private\n`;
                    replyText += `  ${prefix}jadibot public - Mode public\n`;

                    if (m.isOwner || isJadibotOwner(sender)) {
                        replyText += `  ${prefix}banjadi <nomor> - Ban jadibot\n`;
                        replyText += `  ${prefix}unban <nomor> - Unban jadibot\n`;
                    }

                    // Collect all owner JIDs for mention
                    const mentions = list.map(b => b.owner).filter(Boolean);

                    await sock.sendMessage(from, {
                        text: replyText,
                        mentions,
                    }, { quoted: m.key });

                    return;
                }

                // ═══════════════════════════════════════
                // 3. BANJADI - Ban JadiBot (OWNER ONLY)
                // ═══════════════════════════════════════
                case 'banjadi': {
                    if (!isJadibotOwner(sender) && !m.isOwner) {
                        return m.reply('❌ Command ini khusus *owner bot* saja!');
                    }

                    const targetNum = args[0] ? args[0].replace(/[^0-9]/g, '') : null;

                    if (!targetNum) {
                        return m.reply(
                            `❌ Nomor tidak diberikan!\n\n` +
                            `*Penggunaan:*\n${prefix}banjadi <nomor>\n\n` +
                            `*Contoh:*\n${prefix}banjadi 6281234567890\n\n` +
                            `💡 Nomor yang dibanned tidak bisa membuat jadibot lagi.`
                        );
                    }

                    // Jangan banned owner sendiri
                    if (targetNum === JADIBOT_OWNER) {
                        return m.reply('❌ Tidak bisa banned owner sendiri! 🤦');
                    }

                    // Confirmation
                    const confirmId = `${sender}_banjadi_${targetNum}`;
                    const pending = checkPending(confirmId);

                    if (pending) {
                        // Confirmed - execute ban
                        const result = jadibot.ban(targetNum);
                        return m.reply(result.message);
                    }

                    // Ask confirmation
                    setPending(confirmId, 'banjadi');
                    return m.reply(
                        `⚠️ *KONFIRMASI BAN JADIBOT*\n\n` +
                        `Nomor: *${targetNum}*\n\n` +
                        `⚠️ Efek banned:\n` +
                        `• Jika ada jadibot aktif → akan dihentikan\n` +
                        `• Session jadibot → dihapus\n` +
                        `• Nomor → tidak bisa membuat jadibot lagi\n\n` +
                        `Ketik *${prefix}banjadi ${targetNum}* lagi dalam 60 detik untuk konfirmasi.`
                    );
                }

                // ═══════════════════════════════════════
                // 4. UNBAN - Unban JadiBot (OWNER ONLY)
                // ═══════════════════════════════════════
                case 'unban': {
                    if (!isJadibotOwner(sender) && !m.isOwner) {
                        return m.reply('❌ Command ini khusus *owner bot* saja!');
                    }

                    const targetNum = args[0] ? args[0].replace(/[^0-9]/g, '') : null;

                    if (!targetNum) {
                        return m.reply(
                            `❌ Nomor tidak diberikan!\n\n` +
                            `*Penggunaan:*\n${prefix}unban <nomor>\n\n` +
                            `*Contoh:*\n${prefix}unban 6281234567890\n\n` +
                            `💡 Gunakan ${prefix}listjadi untuk melihat status.`
                        );
                    }

                    const result = jadibot.unban(targetNum);
                    return m.reply(result.message);
                }

                default:
                    break;
            }
        } catch (error) {
            console.error('[ JADIBOT PLUGIN ] Error:', error);
            return m.reply(
                `❌ Terjadi kesalahan pada command *${command}*\n\n` +
                `\`\`\`${error.message}\`\`\``
            );
        }
    },
};
