"use strict";
const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore
} = require('wileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');

// Load Config Global
require('./config.js');

// Load Case Handler
const caseHandler = require('./lib/case.js');

// Auto Reload for Index
const currentFile = __filename;
fs.watchFile(currentFile, () => {
    fs.unwatchFile(currentFile);
    console.log(chalk.green(`✓ ${path.basename(currentFile)} updated! Reloading...`));
    delete require.cache[require.resolve(currentFile)];
});

// Plugin Loader untuk ESM
const pluginFolder = path.join(__dirname, 'plugins');
const pluginFilter = (filename) => path.extname(filename).toLowerCase() === '.mjs';

global.plugins = {};

async function loadPlugins() {
    if (!fs.existsSync(pluginFolder)) fs.mkdirSync(pluginFolder);
    const files = fs.readdirSync(pluginFolder).filter(pluginFilter);
    
    for (const file of files) {
        try {
            const filePath = path.join(pluginFolder, file);
            const module = await import(`file://${filePath}?update=${Date.now()}`);
            global.plugins[file] = module.default || module;
            console.log(chalk.cyan(`[ PLUGIN ] Loaded: ${file}`));
        } catch (e) {
            console.error(chalk.red(`[ ERROR ] Gagal load plugin ${file}:`), e);
        }
    }
}

async function startIkuyo() {
    await loadPlugins();
    const { state, saveCreds } = await useMultiFileAuthState(global.config.sessionName);
    
    // Cek mode koneksi
    const usePairing = global.config.pairing.is_pairing;
    const pairCode = global.config.pairing.pairing_code;

    const sock = makeWASocket({
        version: (await fetchLatestBaileysVersion()).version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !usePairing, // Jika pairing true, QR mati. Jika false, QR nyala.
        auth: state,
        browser: ['Ikuyo (Mod)', 'Chrome', '1.0.0']
    });

    let pairingRequested = false; // Flag untuk mencegah multiple request

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // QR Code Mode
        if (qr && !usePairing) {
            console.log(chalk.yellow('[ QR MODE ] Scan QR Code di bawah ini:'));
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(chalk.red('Koneksi terputus, reason:', reason));
            pairingRequested = false; // Reset flag untuk reconnect
            
            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('Device Logged Out, hapus session dan scan ulang.'));
                process.exit(1); // Keluar dari proses karena perlu login ulang
            } else {
                console.log(chalk.yellow('Mencoba reconnect dalam 5 detik...'));
                setTimeout(() => {
                    startIkuyo(); // Reconnect
                }, 5000);
            }
        } else if (connection === 'open') {
            console.log(chalk.green('✓ Bot Ikuyo berhasil terhubung!'));
            
            // Pairing Code Mode: hanya jika perangkat belum terdaftar dan belum diminta sebelumnya
            if (usePairing && !sock.authState.creds.registered && !pairingRequested) {
                try {
                    pairingRequested = true;
                    console.log(chalk.yellow('[ PAIRING ] Meminta kode pairing...'));
                    
                    // Pastikan format nomor HP benar (kode negara tanpa + atau spasi)
                    const formattedCode = pairCode.replace(/[^0-9]/g, ''); // Hanya angka
                    const requestedCode = await sock.requestPairingCode(formattedCode);
                    
                    console.log(chalk.green(`[ PAIRING ] Kode Pairing Anda: ${requestedCode}`));
                    console.log(chalk.cyan('Masukkan kode di atas di WhatsApp Anda: Settings > Linked Devices > Link Device'));
                } catch (err) {
                    console.error(chalk.red('[ PAIRING ] Gagal meminta kode pairing:'), err.message);
                    pairingRequested = false; // Reset agar bisa coba lagi nanti
                    
                    // Jika gagal karena koneksi, coba lagi
                    if (err.message.includes('Connection')) {
                        console.log(chalk.yellow('Mencoba ulang permintaan pairing dalam 3 detik...'));
                        setTimeout(() => {
                            pairingRequested = false;
                        }, 3000);
                    }
                }
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message) return;
            
            // Skip jika pesan dari sendiri
            if (m.key.fromMe) return;
            
            const serialize = (msg) => {
                const types = Object.keys(msg.message);
                const type = types[0];
                
                // Fungsi untuk mendapatkan teks dari berbagai tipe pesan
                const getText = () => {
                    if (type === 'conversation') return msg.message.conversation;
                    if (type === 'extendedTextMessage') return msg.message.extendedTextMessage.text;
                    if (type === 'imageMessage') return msg.message.imageMessage.caption;
                    if (type === 'videoMessage') return msg.message.videoMessage.caption;
                    if (type === 'documentMessage') return msg.message.documentMessage.caption;
                    return '';
                };
                
                const text = getText();
                
                return {
                    type,
                    text,
                    key: msg.key,
                    pushName: msg.pushName,
                    message: msg.message,
                    from: msg.key.remoteJid,
                    sender: msg.key.participant || msg.key.remoteJid,
                    isGroup: msg.key.remoteJid.endsWith('@g.us'),
                    reply: async (teks, options = {}) => {
                        await sock.sendMessage(msg.key.remoteJid, { text: teks }, { quoted: msg, ...options });
                    }
                };
            };
            
            const msg = serialize(m);
            const { text, type, from, isGroup, sender } = msg;
            
            // Hanya proses jika ada teks
            if (!text) return;
            
            const prefix = global.config.prefix || '.';
            const isCmd = text.startsWith(prefix);
            const command = isCmd ? text.slice(1).trim().split(/ +/).shift().toLowerCase() : null;
            const args = text.trim().split(/ +/).slice(1);
            const fullArgs = text.trim().slice(command.length + 1).trim();
            
            const ctx = { 
                text, 
                prefix, 
                command, 
                args, 
                fullArgs,
                msg, 
                sock,
                from,
                isGroup,
                sender
            };

            // Case Handler (jika ada)
            if (typeof caseHandler === 'function') {
                await caseHandler(msg, sock, ctx);
            }

            // Plugin Handler
            if (isCmd && global.plugins) {
                for (const name in global.plugins) {
                    const plugin = global.plugins[name];
                    
                    // Cek command
                    if (plugin.command && Array.isArray(plugin.command) && plugin.command.includes(command)) {
                        try {
                            console.log(chalk.blue(`[ EXEC ] Plugin: ${name} | Command: ${command}`));
                            await plugin.run(msg, sock, ctx);
                        } catch (e) {
                            console.error(chalk.red(`Error plugin ${name}:`), e);
                            await msg.reply(`❌ Terjadi error di plugin *${name}*\n\`\`\`${e.message}\`\`\``);
                        }
                    }
                }
            }

        } catch (err) {
            console.error(chalk.red('Error di messages.upsert:'), err);
        }
    });
    
    // Watcher untuk Plugins
    fs.watch(pluginFolder, async (event, filename) => {
        if (filename && pluginFilter(filename)) {
            console.log(chalk.magenta(`[ PLUGIN ] Perubahan terdeteksi: ${filename}`));
            const filePath = path.join(pluginFolder, filename);
            try {
                // Hapus dari cache
                const moduleUrl = `file://${filePath}?update=${Date.now()}`;
                const module = await import(moduleUrl);
                global.plugins[filename] = module.default || module;
                console.log(chalk.green(`[ PLUGIN ] Reloaded: ${filename}`));
            } catch (e) {
                console.error(chalk.red(`[ ERROR ] Gagal reload ${filename}`), e);
            }
        }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
        console.error(chalk.red('[ FATAL ] Uncaught Exception:'), err);
    });

    process.on('unhandledRejection', (err) => {
        console.error(chalk.red('[ FATAL ] Unhandled Rejection:'), err);
    });
}

// Start bot
startIkuyo().catch(err => {
    console.error(chalk.red('[ FATAL ] Gagal start bot:'), err);
    process.exit(1);
});
