import fs from 'fs';
import fse from 'fs-extra';
import os from 'os';
import { exec, execSync } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════

/**
 * Check if sender is bot owner
 */
const isOwner = (sender) => {
    const owners = global.config.ownerNumber || [global.config.owner];
    return owners.includes(sender.replace('@s.whatsapp.net', ''));
};

/**
 * Extract mentioned user JID from message
 */
const getMentionedUser = (m) => {
    try {
        const mentioned =
            m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (mentioned && mentioned.length > 0) return mentioned[0];
    } catch {}
    return null;
};

/**
 * Extract user JID from mention or raw number in args
 */
const extractUser = (m, args) => {
    const mentioned = getMentionedUser(m);
    if (mentioned) return mentioned;
    if (args && args.length > 0) {
        const num = args[0].replace(/[^0-9]/g, '');
        return num ? `${num}@s.whatsapp.net` : null;
    }
    return null;
};

/**
 * Get full message body (everything after command)
 */
const getMessageBody = (text, command, prefix) => {
    const cmdLen = prefix.length + command.length;
    return text.slice(cmdLen).trim();
};

/**
 * Format bytes to human-readable
 */
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Format milliseconds to uptime string
 */
const formatUptime = (ms) => {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${d > 0 ? d + ' hari, ' : ''}${h > 0 ? h + ' jam, ' : ''}${m > 0 ? m + ' menit, ' : ''}${s} detik`;
};

// ═══════════════════════════════════════
// Confirmation System for Destructive Commands
// ═══════════════════════════════════════
const pendingConfirm = {};

/**
 * Set a pending confirmation with 60s timeout
 */
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

/**
 * Check and consume a pending confirmation
 */
const checkPending = (id) => {
    const p = pendingConfirm[id];
    if (!p) return null;
    clearTimeout(p.timer);
    delete pendingConfirm[id];
    return p;
};

// ═══════════════════════════════════════
// Initialize Stats if not present
// ═══════════════════════════════════════
if (!global.stats) {
    global.stats = { messages: 0, commands: 0 };
}

// ═══════════════════════════════════════
// Plugin Definition
// ═══════════════════════════════════════
export default {
    name: 'Owner Commands',
    command: [
        'broadcast',
        'bcgroup',
        'setprefix',
        'setname',
        'setstatus',
        'block',
        'unblock',
        'clearsession',
        'getsession',
        'listblock',
        'join',
        'leaveall',
        'shutdown',
        'restart',
        'ping',
        'eval',
        'exec',
    ],

    run: async (m, sock, { text, prefix, command, args, fullArgs, from, isGroup, sender }) => {
        // ── Owner Gate ──
        if (!isOwner(sender)) {
            return m.reply('❌ Command ini khusus owner!');
        }

        // Increment command stats
        if (global.stats) global.stats.commands = (global.stats.commands || 0) + 1;

        try {
            switch (command) {
                // ───────────────────────────────
                // 1. BROADCAST - semua chat
                // ───────────────────────────────
                case 'broadcast': {
                    const body = getMessageBody(text, command, prefix);
                    if (!body) return m.reply('❌ Teks broadcast belum diberikan!\n\n*Penggunaan:* /broadcast <teks>');

                    let chats = [];
                    // Try store first, then fallback to groups
                    if (sock.store?.chats) {
                        chats = Object.keys(sock.store.chats)
                            .filter((jid) => !jid.includes('broadcast') && !jid.includes('status'));
                    }
                    // Fallback: fetch groups if store is empty
                    if (chats.length === 0) {
                        const groups = await sock.groupFetchAllParticipating();
                        chats = Object.keys(groups);
                    }

                    if (chats.length === 0) return m.reply('❌ Tidak ada chat yang tersedia untuk broadcast.');

                    await m.reply(`📤 Broadcasting ke *${chats.length}* chats...\n\n⏳ Mohon tunggu, ini mungkin memakan waktu.`);

                    let success = 0;
                    let failed = 0;
                    for (const jid of chats) {
                        try {
                            await sock.sendMessage(jid, {
                                text: `📢 *BROADCAST FROM OWNER*\n\n${body}`,
                            });
                            success++;
                        } catch {
                            failed++;
                        }
                    }

                    return m.reply(
                        `✅ Broadcast selesai!\n\n` +
                            `📬 Berhasil dikirim: *${success}* chat\n` +
                            `❌ Gagal: *${failed}* chat`
                    );
                }

                // ───────────────────────────────
                // 2. BCGROUP - broadcast ke grup
                // ───────────────────────────────
                case 'bcgroup': {
                    const body = getMessageBody(text, command, prefix);
                    if (!body) return m.reply('❌ Teks broadcast belum diberikan!\n\n*Penggunaan:* /bcgroup <teks>');

                    const groups = await sock.groupFetchAllParticipating();
                    const groupJids = Object.keys(groups);

                    if (groupJids.length === 0) return m.reply('❌ Bot tidak berada di grup manapun.');

                    await m.reply(`📤 Broadcasting ke *${groupJids.length}* grup...\n\n⏳ Mohon tunggu.`);

                    let success = 0;
                    let failed = 0;
                    for (const jid of groupJids) {
                        try {
                            await sock.sendMessage(jid, {
                                text: `📢 *BROADCAST FROM OWNER*\n\n${body}`,
                            });
                            success++;
                        } catch {
                            failed++;
                        }
                    }

                    return m.reply(
                        `✅ Broadcast grup selesai!\n\n` +
                            `📬 Berhasil dikirim: *${success}* grup\n` +
                            `❌ Gagal: *${failed}* grup`
                    );
                }

                // ───────────────────────────────
                // 3. SETPREFIX - ubah prefix bot
                // ───────────────────────────────
                case 'setprefix': {
                    const newPrefix = args[0];
                    if (!newPrefix) return m.reply('❌ Prefix baru belum diberikan!\n\n*Penggunaan:* /setprefix <prefix>');

                    global.config.prefix = newPrefix;
                    return m.reply(`✅ Prefix berhasil diubah ke \`${newPrefix}\``);
                }

                // ───────────────────────────────
                // 4. SETNAME - ubah nama bot
                // ───────────────────────────────
                case 'setname': {
                    const newName = getMessageBody(text, command, prefix);
                    if (!newName) return m.reply('❌ Nama baru belum diberikan!\n\n*Penggunaan:* /setname <nama>');

                    global.config.name = newName;
                    // Also update WhatsApp profile name if possible
                    try {
                        await sock.updateProfileName(newName);
                    } catch {}

                    return m.reply(`✅ Nama bot berhasil diubah ke \`${newName}\``);
                }

                // ───────────────────────────────
                // 5. SETSTATUS - ubah status WhatsApp
                // ───────────────────────────────
                case 'setstatus': {
                    const newStatus = getMessageBody(text, command, prefix);
                    if (!newStatus) return m.reply('❌ Status baru belum diberikan!\n\n*Penggunaan:* /setstatus <teks>');

                    try {
                        await sock.updateProfileStatus(newStatus);
                        return m.reply(`✅ Status WhatsApp berhasil diubah!\n\n*Status baru:*\n${newStatus}`);
                    } catch (err) {
                        return m.reply(`❌ Gagal mengubah status!\n\n${err.message}`);
                    }
                }

                // ───────────────────────────────
                // 6. BLOCK - blokir pengguna
                // ───────────────────────────────
                case 'block': {
                    const user = extractUser(m, args);
                    if (!user) return m.reply('❌ Tag pengguna atau berikan nomor!\n\n*Penggunaan:* /block @user atau /block 628xxx');

                    try {
                        await sock.updateBlockStatus(user, 'block');
                        return m.reply(`✅ Berhasil memblokir @${user.split('@')[0]}`, {
                            mentions: [user],
                        });
                    } catch (err) {
                        return m.reply(`❌ Gagal memblokir pengguna!\n\n${err.message}`);
                    }
                }

                // ───────────────────────────────
                // 7. UNBLOCK - buka blokir pengguna
                // ───────────────────────────────
                case 'unblock': {
                    const user = extractUser(m, args);
                    if (!user) return m.reply('❌ Tag pengguna atau berikan nomor!\n\n*Penggunaan:* /unblock @user atau /unblock 628xxx');

                    try {
                        await sock.updateBlockStatus(user, 'unblock');
                        return m.reply(`✅ Berhasil membuka blokir @${user.split('@')[0]}`, {
                            mentions: [user],
                        });
                    } catch (err) {
                        return m.reply(`❌ Gagal membuka blokir pengguna!\n\n${err.message}`);
                    }
                }

                // ───────────────────────────────
                // 8. CLEARSESSION - hapus session
                // ───────────────────────────────
                case 'clearsession': {
                    const confirmId = `${sender}_clearsession`;
                    const pending = checkPending(confirmId);

                    if (pending) {
                        // Second call — confirmed
                        const sessionDir = path.join(process.cwd(), global.config.sessionName || 'session');

                        try {
                            if (fs.existsSync(sessionDir)) {
                                await fse.emptyDir(sessionDir);
                                await m.reply('✅ Session berhasil dihapus!\n⏳ Bot akan restart dalam 3 detik...');
                            } else {
                                await m.reply('✅ Folder session tidak ditemukan, tidak ada yang dihapus.\n⏳ Bot akan restart dalam 3 detik...');
                            }
                        } catch (err) {
                            return m.reply(`❌ Gagal menghapus session!\n\n${err.message}`);
                        }

                        setTimeout(() => process.exit(1), 3000);
                        return;
                    }

                    // First call — ask confirmation
                    setPending(confirmId, 'clearsession');
                    return m.reply(
                        `⚠️ *KONFIRMASI CLEAR SESSION*\n\n` +
                            `Perintah ini akan menghapus **SEMUA data session** bot.\n` +
                            `Bot akan logout dan perlu scan ulang QR/pairing code.\n\n` +
                            `Ketik \`${prefix}clearsession\` lagi dalam 60 detik untuk konfirmasi.`
                    );
                }

                // ───────────────────────────────
                // 9. GETSESSION - kirim session file
                // ───────────────────────────────
                case 'getsession': {
                    const sessionDir = path.join(process.cwd(), global.config.sessionName || 'session');

                    if (!fs.existsSync(sessionDir)) {
                        return m.reply('❌ Folder session tidak ditemukan!');
                    }

                    await m.reply('📦 Mempersiapkan file session...\n⏳ Mohon tunggu.');

                    try {
                        // Collect all JSON files from session directory
                        const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith('.json'));

                        if (files.length === 0) {
                            return m.reply('❌ Tidak ada file session yang ditemukan.');
                        }

                        // Try to create a zip archive using system zip command
                        const zipPath = path.join(process.cwd(), 'session_backup.zip');

                        try {
                            execSync(`zip -r "${zipPath}" "${sessionDir}" -x "*.lock" 2>/dev/null`, {
                                timeout: 30000,
                                stdio: 'pipe',
                            });

                            if (fs.existsSync(zipPath)) {
                                const ownerJid = `${global.config.owner}@s.whatsapp.net`;
                                await sock.sendMessage(ownerJid, {
                                    document: fs.readFileSync(zipPath),
                                    mimetype: 'application/zip',
                                    fileName: `ikuyo-session-${Date.now()}.zip`,
                                    caption: '📦 *Session File Backup*\n\n⚠️ File ini sensitif, jaga kerahasiaannya!',
                                });

                                // Cleanup
                                fs.unlinkSync(zipPath);
                                return m.reply('✅ File session berhasil dikirim ke chat pribadi owner!');
                            }
                        } catch {
                            // zip command not available or failed, send creds.json directly
                        }

                        // Fallback: send the most important file (creds.json)
                        const credsPath = path.join(sessionDir, 'creds.json');
                        if (fs.existsSync(credsPath)) {
                            const ownerJid = `${global.config.owner}@s.whatsapp.net`;
                            await sock.sendMessage(ownerJid, {
                                document: fs.readFileSync(credsPath),
                                mimetype: 'application/json',
                                fileName: `ikuyo-creds-${Date.now()}.json`,
                                caption: '📦 *Credentials File*\n\n⚠️ File ini sangat sensitif, jaga kerahasiaannya!',
                            });
                            return m.reply('✅ File creds.json berhasil dikirim ke chat pribadi owner!');
                        }

                        return m.reply('❌ Gagal membuat backup session.');
                    } catch (err) {
                        return m.reply(`❌ Terjadi kesalahan saat memproses session!\n\n${err.message}`);
                    }
                }

                // ───────────────────────────────
                // 10. LISTBLOCK - daftar user diblokir
                // ───────────────────────────────
                case 'listblock': {
                    try {
                        const blocklist = await sock.fetchBlocklist();

                        if (!blocklist || blocklist.length === 0) {
                            return m.reply('📋 Tidak ada pengguna yang diblokir.');
                        }

                        const formatted = blocklist.map((jid, i) => `${i + 1}. @${jid.split('@')[0]}`).join('\n');

                        return m.reply(
                            `📋 *Daftar Pengguna Diblokir*\n` +
                                `Total: *${blocklist.length}* pengguna\n\n` +
                                formatted,
                            { mentions: blocklist }
                        );
                    } catch (err) {
                        return m.reply(`❌ Gagal mengambil daftar blokir!\n\n${err.message}`);
                    }
                }

                // ───────────────────────────────
                // 11. JOIN - gabung grup via link
                // ───────────────────────────────
                case 'join': {
                    const link = args[0];
                    if (!link) return m.reply('❌ Link undangan grup belum diberikan!\n\n*Penggunaan:* /join <link_grup>');

                    // Extract invite code from various link formats
                    const inviteCode = link.replace(/(?:https?:\/\/)?chat\.whatsapp\.com\//, '').replace(/\s/g, '');

                    if (!inviteCode || inviteCode === link) {
                        return m.reply('❌ Format link tidak valid!\n\nContoh: https://chat.whatsapp.com/XXXXXXXXXXXX');
                    }

                    try {
                        await m.reply('⏳ Mencoba bergabung ke grup...');
                        const groupId = await sock.groupAcceptInvite(inviteCode);
                        return m.reply(`✅ Berhasil bergabung ke grup!\n\n📋 Group ID: \`${groupId}\``);
                    } catch (err) {
                        return m.reply(`❌ Gagal bergabung ke grup!\n\n*Possible reasons:*\n- Link tidak valid atau sudah kadaluarsa\n- Bot dikeluarkan dari grup sebelumnya\n- Grup sudah penuh\n\nDetail: ${err.message}`);
                    }
                }

                // ───────────────────────────────
                // 12. LEAVEALL - keluar dari semua grup
                // ───────────────────────────────
                case 'leaveall': {
                    const confirmId = `${sender}_leaveall`;
                    const pending = checkPending(confirmId);

                    if (pending) {
                        // Second call — confirmed, execute
                        await m.reply('⏳ Keluar dari semua grup...\n\nMohon tunggu.');

                        try {
                            const groups = await sock.groupFetchAllParticipating();
                            const groupJids = Object.keys(groups);

                            if (groupJids.length === 0) {
                                return m.reply('ℹ️ Bot tidak berada di grup manapun.');
                            }

                            let success = 0;
                            let failed = 0;
                            for (const jid of groupJids) {
                                try {
                                    // Optionally skip owner's groups
                                    const groupMeta = groups[jid];
                                    const ownerJid = `${global.config.owner}@s.whatsapp.net`;
                                    if (
                                        groupMeta.owner === ownerJid ||
                                        groupMeta.participants?.some(
                                            (p) => p.id === ownerJid && (p.admin === 'admin' || p.admin === 'superadmin')
                                        )
                                    ) {
                                        continue; // Skip owner's groups
                                    }
                                    await sock.groupLeave(jid);
                                    success++;
                                } catch {
                                    failed++;
                                }
                            }

                            return m.reply(
                                `✅ Selesai keluar dari grup!\n\n` +
                                    `🚪 Keluar dari: *${success}* grup\n` +
                                    `❌ Gagal: *${failed}* grup\n` +
                                    `⏭️ Lewati (grup owner): *${groupJids.length - success - failed}* grup`
                            );
                        } catch (err) {
                            return m.reply(`❌ Gagal mendapatkan daftar grup!\n\n${err.message}`);
                        }
                    }

                    // First call — ask confirmation
                    setPending(confirmId, 'leaveall');
                    return m.reply(
                        `⚠️ *KONFIRMASI LEAVE ALL GROUPS*\n\n` +
                            `Perintah ini akan membuat bot **keluar dari semua grup** (kecuali grup owner).\n\n` +
                            `Ketik \`${prefix}leaveall\` lagi dalam 60 detik untuk konfirmasi.`
                    );
                }

                // ───────────────────────────────
                // 13. SHUTDOWN - matikan bot
                // ───────────────────────────────
                case 'shutdown': {
                    const confirmId = `${sender}_shutdown`;
                    const pending = checkPending(confirmId);

                    if (pending) {
                        // Second call — confirmed
                        await m.reply('⏳ Bot dimatikan...');
                        setTimeout(() => process.exit(0), 1000);
                        return;
                    }

                    // First call — ask confirmation
                    setPending(confirmId, 'shutdown');
                    return m.reply(
                        `⚠️ *KONFIRMASI SHUTDOWN*\n\n` +
                            `Perintah ini akan **mematikan bot** secara total.\nBot tidak akan berjalan lagi sampai dihidupkan manual.\n\n` +
                            `Ketik \`${prefix}shutdown\` lagi dalam 60 detik untuk konfirmasi.`
                    );
                }

                // ───────────────────────────────
                // 14. RESTART - restart bot
                // ───────────────────────────────
                case 'restart': {
                    await m.reply('⏳ Restarting bot...');
                    setTimeout(() => process.exit(1), 2000);
                    // Note: exit code 1 triggers reconnect in the main index.js handler
                    // If using PM2, it will auto-restart. Otherwise use: npm start
                    return;
                }

                // ───────────────────────────────
                // 15. PING - info sistem detail
                // ───────────────────────────────
                case 'ping': {
                    const startTime = Date.now();

                    // System info
                    const totalMem = os.totalmem();
                    const freeMem = os.freemem();
                    const usedMem = totalMem - freeMem;
                    const memPercent = ((usedMem / totalMem) * 100).toFixed(1);
                    const cpus = os.cpus();
                    const cpuModel = cpus[0]?.model || 'Unknown';
                    const cpuCores = cpus.length;

                    // CPU usage calculation (average load)
                    const loadAvg = os.loadavg();
                    const cpuUsagePercent = ((loadAvg[0] / cpuCores) * 100).toFixed(1);

                    // Uptime
                    const uptimeMs = process.uptime() * 1000;
                    const uptimeStr = formatUptime(uptimeMs);
                    const osUptimeStr = formatUptime(os.uptime() * 1000);

                    // Network latency
                    const endLatency = Date.now() - startTime;

                    // Stats
                    const totalMessages = global.stats?.messages || 0;
                    const totalCommands = global.stats?.commands || 0;

                    const info =
                        `📡 *${global.config.name || 'Bot'} - System Info*\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🖥️ *Sistem*\n` +
                        `  • OS: ${os.type()} ${os.release()} (${os.arch()})\n` +
                        `  • Hostname: ${os.hostname()}\n` +
                        `  • Node.js: ${process.version}\n\n` +
                        `💾 *Memory (RAM)*\n` +
                        `  • Total: ${formatBytes(totalMem)}\n` +
                        `  • Digunakan: ${formatBytes(usedMem)} (${memPercent}%)\n` +
                        `  • Bebas: ${formatBytes(freeMem)}\n\n` +
                        `⚙️ *CPU*\n` +
                        `  • Model: ${cpuModel}\n` +
                        `  • Core: ${cpuCores} core(s)\n` +
                        `  • Load: ${cpuUsagePercent}% (1m), ${((loadAvg[1] / cpuCores) * 100).toFixed(1)}% (5m), ${((loadAvg[2] / cpuCores) * 100).toFixed(1)}% (15m)\n\n` +
                        `⏱️ *Uptime*\n` +
                        `  • Bot: ${uptimeStr}\n` +
                        `  • Sistem: ${osUptimeStr}\n\n` +
                        `📊 *Statistik*\n` +
                        `  • Pesan diproses: ${totalMessages}\n` +
                        `  • Command dieksekusi: ${totalCommands}\n\n` +
                        `📡 *Latensi: ${endLatency}ms*`;

                    return m.reply(info);
                }

                // ───────────────────────────────
                // 16. EVAL - evaluate JS code
                // ───────────────────────────────
                case 'eval': {
                    const code = getMessageBody(text, command, prefix);
                    if (!code) return m.reply('❌ Kode JavaScript belum diberikan!\n\n*Penggunaan:* /eval <kode>');

                    try {
                        // Use Function constructor for slightly safer evaluation
                        const result = await new Function('m', 'sock', 'global', 'process', 'require', 'exports', 'module', 'args', 'from', 'sender', `
                            "use strict";
                            return (async () => { return await eval(\`${code.replace(/`/g, '\\`').replace(/\\/g, '\\\\')}\`) })();
                        `)(m, sock, global, process, require, {}, {}, args, from, sender);

                        const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);

                        return m.reply(
                            `📦 *Eval Result*\n\n` +
                                `\`\`\`\n${output.slice(0, 4000)}${output.length > 4000 ? '\n... (dipotong)' : ''}\n\`\`\``
                        );
                    } catch (err) {
                        return m.reply(
                            `❌ *Eval Error*\n\n` +
                                `\`\`\`\n${err.stack || err.message}\n\`\`\``
                        );
                    }
                }

                // ───────────────────────────────
                // 17. EXEC - execute shell command
                // ───────────────────────────────
                case 'exec': {
                    const cmd = getMessageBody(text, command, prefix);
                    if (!cmd) return m.reply('❌ Perintah shell belum diberikan!\n\n*Penggunaan:* /exec <perintah>');

                    try {
                        await m.reply('⏳ Menjalankan perintah...');

                        const { stdout, stderr } = await execAsync(cmd, {
                            timeout: 30000,
                            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                        });

                        let output = '';
                        if (stdout && stdout.trim()) output += `*stdout:*\n${stdout.trim()}`;
                        if (stderr && stderr.trim()) output += `${output ? '\n\n' : ''}*stderr:*\n${stderr.trim()}`;
                        if (!output) output = '(Tidak ada output)';

                        // Truncate very long output
                        if (output.length > 4000) {
                            output = output.slice(0, 4000) + '\n... (output dipotong karena terlalu panjang)';
                        }

                        return m.reply(`sh \`${cmd}\`\n\n\`\`\`\n${output}\n\`\`\``);
                    } catch (err) {
                        let errorOutput = err.message || String(err);
                        if (err.stdout) errorOutput += `\n\nstdout:\n${err.stdout}`;
                        if (err.stderr) errorOutput += `\n\nstderr:\n${err.stderr}`;
                        if (err.killed) errorOutput += '\n\n⏱️ Timeout: Perintah melebihi batas 30 detik.';

                        if (errorOutput.length > 4000) {
                            errorOutput = errorOutput.slice(0, 4000) + '\n... (dipotong)';
                        }

                        return m.reply(`❌ *Exec Error*\n\n\`\`\`\n${errorOutput}\n\`\`\``);
                    }
                }

                default:
                    break;
            }
        } catch (error) {
            console.error('[ OWNER PLUGIN ] Error:', error);
            return m.reply(`❌ Terjadi kesalahan pada command *${command}*\n\n\`\`\`${error.message}\`\`\``);
        }
    },
};
