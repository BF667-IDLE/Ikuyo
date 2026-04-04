import moment from 'moment-timezone';

// ============================================================
// Helper Functions
// ============================================================

const isOwner = (sender) => {
    const owners = global.config.ownerNumber || (global.config.owner ? [global.config.owner] : []);
    return owners.includes(sender.replace('@s.whatsapp.net', ''));
};

const isBotAdmin = async (sock, from) => {
    try {
        const groupMetadata = await sock.groupMetadata(from);
        const botId = sock.user.id;
        return groupMetadata.participants.find(p => p.id === botId)?.admin;
    } catch {
        return false;
    }
};

const isAdmin = async (sock, from, sender) => {
    try {
        const groupMetadata = await sock.groupMetadata(from);
        return groupMetadata.participants.find(p => p.id === sender)?.admin;
    } catch {
        return false;
    }
};

/**
 * Extract mentioned users and quoted user from a message.
 * Returns an array of JIDs.
 */
const extractUsers = (m) => {
    const users = [];
    const msg = m.message;
    const ctx = msg?.extendedTextMessage?.contextInfo || msg?.contextInfo;

    if (ctx?.mentionedJid?.length) {
        users.push(...ctx.mentionedJid);
    }

    if (ctx?.participant && !users.includes(ctx.participant)) {
        users.push(ctx.participant);
    }

    return users;
};

/**
 * Check if sender is admin or owner (combined permission).
 */
const isAdminOrOwner = async (sock, from, sender) => {
    if (isOwner(sender)) return true;
    return await isAdmin(sock, from, sender);
};

// ============================================================
// Anti-Link & Welcome Data
// ============================================================

const antilinkGroups = new Map();

// Exported event handlers — the main bot handler can call these on
// every incoming message and every group-participants update.
export const groupEvents = {
    /**
     * Called on every incoming message to enforce anti-link.
     */
    async onMessage(m, sock) {
        if (!m.isGroup) return;
        const chatId = m.from;
        if (!antilinkGroups.get(chatId)) return;

        const senderAdmin = await isAdmin(sock, chatId, m.sender);
        if (senderAdmin) return;

        const msg = m.message;
        const textContent =
            msg?.conversation ||
            msg?.extendedTextMessage?.text ||
            '';
        const isBot = m.key.fromMe;

        if (!isBot && /chat\.whatsapp\.com\/[A-Za-z0-9]/i.test(textContent)) {
            try {
                await sock.sendMessage(chatId, { delete: m.key });
                await sock.sendMessage(
                    chatId,
                    {
                        text: `⚠️ @${m.sender.split('@')[0]}, dilarang mengirim link grup WhatsApp di sini!`,
                        mentions: [m.sender],
                    },
                    { quoted: m },
                );
            } catch {
                // ignore delete failures (e.g. already deleted)
            }
        }
    },

    /**
     * Called on group-participants.update events for welcome / leave messages.
     */
    async onGroupParticipantsUpdate({ id, participants, action }, sock) {
        if (!global.config?.group?.welcome) return;

        const chatId = id;
        let groupName;
        try {
            const metadata = await sock.groupMetadata(chatId);
            groupName = metadata.subject || 'Grup';
        } catch {
            groupName = 'Grup';
        }

        for (const participant of participants) {
            const tag = `@${participant.split('@')[0]}`;
            try {
                if (action === 'add') {
                    await sock.sendMessage(chatId, {
                        text:
                            `✨ *Selamat Datang* ✨\n\n` +
                            `Hai ${tag}! Selamat bergabung di *${groupName}*\n` +
                            `Semoga betah dan jangan lupa baca deskripsi grup ya~ 🎉`,
                        mentions: [participant],
                    });
                } else if (action === 'remove') {
                    await sock.sendMessage(chatId, {
                        text:
                            `👋 *Member Keluar*\n\n` +
                            `${tag} telah meninggalkan grup *${groupName}*.\n` +
                            `Sampai jumpa lagi~`,
                        mentions: [participant],
                    });
                } else if (action === 'promote') {
                    await sock.sendMessage(chatId, {
                        text: `👑 ${tag} telah menjadi *admin* grup!`,
                        mentions: [participant],
                    });
                } else if (action === 'demote') {
                    await sock.sendMessage(chatId, {
                        text: `📉 ${tag} telah diberhentikan sebagai *admin* grup.`,
                        mentions: [participant],
                    });
                }
            } catch {
                // ignore errors
            }
        }
    },
};

// ============================================================
// Plugin Definition
// ============================================================

export default {
    name: 'Group Management',
    command: [
        'kick',
        'add',
        'promote',
        'demote',
        'linkgroup',
        'gclink',
        'revoke',
        'setname',
        'setdesc',
        'tagall',
        'everyone',
        'hidetag',
        'groupinfo',
        'listadmin',
        'leave',
        'antilink',
        'welcome',
    ],

    run: async (m, sock, { text, prefix, command, args, fullArgs, from, isGroup, sender }) => {
        // ── Every command requires a group context ──
        if (!isGroup) {
            return m.reply('❌ Command ini hanya untuk grup!');
        }

        // ============================================================
        // 1. /kick @user  —  Kick member(s)
        // ============================================================
        if (command === 'kick') {
            const botAdmin = await isBotAdmin(sock, from);
            if (!botAdmin) return m.reply('❌ Bot harus menjadi admin untuk menggunakan command ini!');

            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            const users = extractUsers(m);
            if (!users.length) {
                return m.reply(
                    '❌ Tag atau reply pesan member yang ingin di-kick!\n' +
                    `Contoh: ${prefix}kick @user atau reply pesan member`,
                );
            }

            const kicked = [];
            const failed = [];

            for (const user of users) {
                if (user === sock.user.id) {
                    failed.push(`${user.split('@')[0]} (bot)`);
                    continue;
                }
                try {
                    await sock.groupParticipantsUpdate(from, [user], 'remove');
                    kicked.push(`@${user.split('@')[0]}`);
                } catch {
                    failed.push(`@${user.split('@')[0]}`);
                }
            }

            let replyMsg = '🚫 *Kick Member*\n\n';
            if (kicked.length) replyMsg += `✅ Berhasil di-kick:\n${kicked.join('\n')}\n\n`;
            if (failed.length) replyMsg += `❌ Gagal di-kick:\n${failed.join('\n')}`;

            return m.reply(replyMsg.trim(), { mentions: users });
        }

        // ============================================================
        // 2. /add number  —  Add member
        // ============================================================
        if (command === 'add') {
            const botAdmin = await isBotAdmin(sock, from);
            if (!botAdmin) return m.reply('❌ Bot harus menjadi admin untuk menggunakan command ini!');

            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            if (!fullArgs) {
                return m.reply(
                    '❌ Masukkan nomor yang ingin ditambahkan!\n' +
                    `Contoh: ${prefix}add 6281234567890`,
                );
            }

            const numbers = fullArgs.split(/[\s,]+/).filter(Boolean);

            const added = [];
            const invited = [];
            const failed = [];

            for (let num of numbers) {
                num = num.replace(/[^0-9]/g, '');
                if (!num) continue;
                if (!num.includes('@')) num += '@s.whatsapp.net';

                try {
                    await sock.groupParticipantsUpdate(from, [num], 'add');
                    added.push(num.split('@')[0]);
                } catch {
                    try {
                        // Send invite link if can't add directly
                        const code = await sock.groupInviteCode(from);
                        const inviteLink = `https://chat.whatsapp.com/${code}`;
                        await sock.sendMessage(num, {
                            text: `📥 Anda diundang ke grup!\n\nLink: ${inviteLink}`,
                        });
                        invited.push(num.split('@')[0]);
                    } catch {
                        failed.push(num.split('@')[0]);
                    }
                }
            }

            let replyMsg = '📥 *Add Member*\n\n';
            if (added.length) replyMsg += `✅ Ditambahkan:\n${added.join('\n')}\n\n`;
            if (invited.length) replyMsg += `📨 Link undangan dikirim ke:\n${invited.join('\n')}\n\n`;
            if (failed.length) replyMsg += `❌ Gagal:\n${failed.join('\n')}`;

            return m.reply(replyMsg.trim());
        }

        // ============================================================
        // 3. /promote @user  —  Promote to admin
        // ============================================================
        if (command === 'promote') {
            const botAdmin = await isBotAdmin(sock, from);
            if (!botAdmin) return m.reply('❌ Bot harus menjadi admin untuk menggunakan command ini!');

            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            const users = extractUsers(m);
            if (!users.length) {
                return m.reply(
                    '❌ Tag atau reply pesan member yang ingin di-promote!\n' +
                    `Contoh: ${prefix}promote @user`,
                );
            }

            const promoted = [];
            const failed = [];

            for (const user of users) {
                if (user === sock.user.id) {
                    failed.push(`${user.split('@')[0]} (bot)`);
                    continue;
                }
                try {
                    await sock.groupParticipantsUpdate(from, [user], 'promote');
                    promoted.push(`@${user.split('@')[0]}`);
                } catch {
                    failed.push(`@${user.split('@')[0]}`);
                }
            }

            let replyMsg = '👑 *Promote Admin*\n\n';
            if (promoted.length) replyMsg += `✅ Berhasil di-promote:\n${promoted.join('\n')}\n\n`;
            if (failed.length) replyMsg += `❌ Gagal:\n${failed.join('\n')}`;

            return m.reply(replyMsg.trim(), { mentions: users });
        }

        // ============================================================
        // 4. /demote @user  —  Demote admin
        // ============================================================
        if (command === 'demote') {
            const botAdmin = await isBotAdmin(sock, from);
            if (!botAdmin) return m.reply('❌ Bot harus menjadi admin untuk menggunakan command ini!');

            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            const users = extractUsers(m);
            if (!users.length) {
                return m.reply(
                    '❌ Tag atau reply pesan admin yang ingin di-demote!\n' +
                    `Contoh: ${prefix}demote @user`,
                );
            }

            const demoted = [];
            const failed = [];

            for (const user of users) {
                if (user === sock.user.id) {
                    failed.push(`${user.split('@')[0]} (bot)`);
                    continue;
                }
                try {
                    await sock.groupParticipantsUpdate(from, [user], 'demote');
                    demoted.push(`@${user.split('@')[0]}`);
                } catch {
                    failed.push(`@${user.split('@')[0]}`);
                }
            }

            let replyMsg = '📉 *Demote Admin*\n\n';
            if (demoted.length) replyMsg += `✅ Berhasil di-demote:\n${demoted.join('\n')}\n\n`;
            if (failed.length) replyMsg += `❌ Gagal:\n${failed.join('\n')}`;

            return m.reply(replyMsg.trim(), { mentions: users });
        }

        // ============================================================
        // 5. /linkgroup or /gclink  —  Get (new) group invite link
        // ============================================================
        if (command === 'linkgroup' || command === 'gclink') {
            const botAdmin = await isBotAdmin(sock, from);
            if (!botAdmin) return m.reply('❌ Bot harus menjadi admin untuk menggunakan command ini!');

            try {
                const code = await sock.groupInviteCode(from);
                return m.reply(`🔗 *Link Grup*\n\nhttps://chat.whatsapp.com/${code}`);
            } catch {
                return m.reply('❌ Gagal mendapatkan link grup!');
            }
        }

        // ============================================================
        // 6. /revoke  —  Revoke group invite link
        // ============================================================
        if (command === 'revoke') {
            const botAdmin = await isBotAdmin(sock, from);
            if (!botAdmin) return m.reply('❌ Bot harus menjadi admin untuk menggunakan command ini!');

            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            try {
                await sock.groupRevokeInvite(from);
                const newCode = await sock.groupInviteCode(from);
                return m.reply(
                    '🔄 *Link grup telah di-revoke!*\n\n' +
                    `🔗 Link baru: https://chat.whatsapp.com/${newCode}`,
                );
            } catch {
                return m.reply('❌ Gagal me-revoke link grup!');
            }
        }

        // ============================================================
        // 7. /setname text  —  Change group name
        // ============================================================
        if (command === 'setname') {
            const botAdmin = await isBotAdmin(sock, from);
            if (!botAdmin) return m.reply('❌ Bot harus menjadi admin untuk menggunakan command ini!');

            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            if (!fullArgs) {
                return m.reply(`❌ Masukkan nama grup yang baru!\nContoh: ${prefix}setname Nama Grup Baru`);
            }

            try {
                await sock.groupUpdateSubject(from, fullArgs);
                return m.reply(`✅ Nama grup berhasil diubah menjadi *${fullArgs}*`);
            } catch {
                return m.reply('❌ Gagal mengubah nama grup!');
            }
        }

        // ============================================================
        // 8. /setdesc text  —  Change group description
        // ============================================================
        if (command === 'setdesc') {
            const botAdmin = await isBotAdmin(sock, from);
            if (!botAdmin) return m.reply('❌ Bot harus menjadi admin untuk menggunakan command ini!');

            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            if (!fullArgs) {
                return m.reply(`❌ Masukkan deskripsi grup yang baru!\nContoh: ${prefix}setdesc Deskripsi baru`);
            }

            try {
                await sock.groupUpdateDescription(from, fullArgs);
                return m.reply('✅ Deskripsi grup berhasil diubah!');
            } catch {
                return m.reply('❌ Gagal mengubah deskripsi grup!');
            }
        }

        // ============================================================
        // 9. /tagall or /everyone text  —  Tag all members
        // ============================================================
        if (command === 'tagall' || command === 'everyone') {
            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            let metadata;
            try {
                metadata = await sock.groupMetadata(from);
            } catch {
                return m.reply('❌ Gagal mendapatkan info grup!');
            }

            const participants = metadata.participants.map(p => p.id);
            if (!participants.length) return m.reply('❌ Tidak ada member di grup!');

            const groupName = metadata.subject || 'Grup';
            const senderName = m.pushName || sender.split('@')[0];
            const customMsg = fullArgs ? `\n\n💬 *Pesan:* ${fullArgs}` : '';
            const headerText = `📢 *Tag All — ${groupName}*\n\nDari: ${senderName}${customMsg}\n\n`;

            // Split into chunks of 50
            const CHUNK_SIZE = 50;
            const chunks = [];
            for (let i = 0; i < participants.length; i += CHUNK_SIZE) {
                chunks.push(participants.slice(i, i + CHUNK_SIZE));
            }

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const mentionText = chunk.map(jid => `@${jid.split('@')[0]}`).join('\n');
                const partText = i === 0
                    ? headerText + mentionText
                    : mentionText;

                try {
                    await sock.sendMessage(from, {
                        text: partText,
                        mentions: chunk,
                    });
                } catch {
                    // ignore
                }
            }
            return;
        }

        // ============================================================
        // 10. /hidetag text  —  Tag all without showing @
        // ============================================================
        if (command === 'hidetag') {
            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            let metadata;
            try {
                metadata = await sock.groupMetadata(from);
            } catch {
                return m.reply('❌ Gagal mendapatkan info grup!');
            }

            const participants = metadata.participants.map(p => p.id);
            if (!participants.length) return m.reply('❌ Tidak ada member di grup!');

            const displayText = fullArgs || '👥';

            try {
                await sock.sendMessage(from, {
                    text: displayText,
                    mentions: participants,
                });
            } catch {
                return m.reply('❌ Gagal mengirim hidetag!');
            }
            return;
        }

        // ============================================================
        // 11. /groupinfo  —  Show group info
        // ============================================================
        if (command === 'groupinfo') {
            let metadata;
            try {
                metadata = await sock.groupMetadata(from);
            } catch {
                return m.reply('❌ Gagal mendapatkan info grup!');
            }

            const groupName = metadata.subject || 'Tidak ada nama';
            const groupDesc = metadata.desc || 'Tidak ada deskripsi';
            const memberCount = metadata.participants.length;
            const creationDate = metadata.creation
                ? moment(metadata.creation * 1000).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss')
                : 'Tidak diketahui';
            const createdBy = metadata.owner || 'Tidak diketahui';

            const admins = metadata.participants.filter(p => p.admin).map(p => {
                const role = p.admin === 'superadmin' ? '👑 Super Admin' : '⭐ Admin';
                return `${role}: @${p.id.split('@')[0]}`;
            });

            let replyMsg =
                `📋 *Info Grup*\n\n` +
                `📝 *Nama:* ${groupName}\n` +
                `📄 *Deskripsi:*\n${groupDesc}\n\n` +
                `👥 *Total Member:* ${memberCount}\n` +
                `🛡️ *Jumlah Admin:* ${admins.length}\n` +
                `📅 *Dibuat:* ${creationDate}\n` +
                `👤 *Pembuat:* @${typeof createdBy === 'string' ? createdBy.replace('@s.whatsapp.net', '') : 'Tidak diketahui'}\n\n`;

            if (admins.length) {
                replyMsg += `*Daftar Admin:*\n${admins.join('\n')}`;
            }

            const mentions = metadata.participants.filter(p => p.admin).map(p => p.id);
            if (typeof createdBy === 'string' && createdBy.includes('@')) {
                mentions.push(createdBy);
            }

            return m.reply(replyMsg.trim(), { mentions });
        }

        // ============================================================
        // 12. /listadmin  —  List all admins
        // ============================================================
        if (command === 'listadmin') {
            let metadata;
            try {
                metadata = await sock.groupMetadata(from);
            } catch {
                return m.reply('❌ Gagal mendapatkan info grup!');
            }

            const admins = metadata.participants.filter(p => p.admin);
            if (!admins.length) return m.reply('❌ Tidak ada admin di grup!');

            const list = admins.map((p, i) => {
                const role = p.admin === 'superadmin' ? '👑' : '⭐';
                return `${i + 1}. ${role} @${p.id.split('@')[0]}`;
            });

            const mentions = admins.map(p => p.id);
            const groupName = metadata.subject || 'Grup';

            return m.reply(
                `🛡️ *Daftar Admin — ${groupName}*\n` +
                `Total: ${admins.length} admin\n\n` +
                list.join('\n'),
                { mentions },
            );
        }

        // ============================================================
        // 13. /leave  —  Bot leaves group (owner only)
        // ============================================================
        if (command === 'leave') {
            if (!isOwner(sender)) {
                return m.reply('❌ Hanya owner bot yang bisa menggunakan command ini!');
            }

            try {
                await m.reply('👋 Oke, bot akan keluar dari grup ini...');
                await sock.groupLeave(from);
            } catch {
                return m.reply('❌ Gagal keluar dari grup!');
            }
            return;
        }

        // ============================================================
        // 14. /antilink on/off  —  Toggle anti-link
        // ============================================================
        if (command === 'antilink') {
            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            const arg = (args[0] || '').toLowerCase();

            if (arg === 'on') {
                antilinkGroups.set(from, true);
                return m.reply(
                    '✅ *Anti-Link telah diaktifkan!*\n\n' +
                    'Pesan yang mengandung link grup WhatsApp akan otomatis dihapus.\n' +
                    '⚠️ Admin tidak akan terkena anti-link.',
                );
            }

            if (arg === 'off') {
                antilinkGroups.set(from, false);
                return m.reply('❌ *Anti-Link telah dinonaktifkan!*');
            }

            const status = antilinkGroups.get(from) ? '🟢 *Aktif*' : '🔴 *Nonaktif*';
            return m.reply(
                `⚙️ *Status Anti-Link*\n\n` +
                `${status}\n\n` +
                `Gunakan:\n` +
                `${prefix}antilink on — aktifkan\n` +
                `${prefix}antilink off — nonaktifkan`,
            );
        }

        // ============================================================
        // 15. /welcome on/off  —  Toggle welcome messages
        // ============================================================
        if (command === 'welcome') {
            const senderAuth = await isAdminOrOwner(sock, from, sender);
            if (!senderAuth) return m.reply('❌ Hanya admin atau owner yang bisa menggunakan command ini!');

            const arg = (args[0] || '').toLowerCase();

            if (arg === 'on') {
                if (!global.config.group) global.config.group = {};
                global.config.group.welcome = true;
                return m.reply(
                    '✅ *Welcome Message telah diaktifkan!*\n\n' +
                    'Bot akan mengirim pesan selamat datang kepada member baru.',
                );
            }

            if (arg === 'off') {
                if (!global.config.group) global.config.group = {};
                global.config.group.welcome = false;
                return m.reply('❌ *Welcome Message telah dinonaktifkan!*');
            }

            const status = global.config?.group?.welcome ? '🟢 *Aktif*' : '🔴 *Nonaktif*';
            return m.reply(
                `⚙️ *Status Welcome Message*\n\n` +
                `${status}\n\n` +
                `Gunakan:\n` +
                `${prefix}welcome on — aktifkan\n` +
                `${prefix}welcome off — nonaktifkan`,
            );
        }
    },
};
