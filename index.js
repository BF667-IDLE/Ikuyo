"use strict";
const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    downloadContentFromMessage
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
    // Catatan: Untuk index.js, perubahan biasanya butuh restart manual jika tidak menggunakan pm2/nodemon
    // Namun snippet di atas tetap dijalankan untuk konsistensi.
});

// Plugin Loader untuk ESM
const pluginFolder = path.join(__dirname, 'plugins');
const pluginFilter = (filename) => path.extname(filename).toLowerCase() === '.mjs';

global.plugins = {}; // Inisialisasi global plugins

async function loadPlugins() {
    if (!fs.existsSync(pluginFolder)) fs.mkdirSync(pluginFolder);
    
    const files = fs.readdirSync(pluginFolder).filter(pluginFilter);
    
    for (const file of files) {
        try {
            // Menggunakan dynamic import untuk ESM (.mjs)
            const filePath = path.join(pluginFolder, file);
            const module = await import(`file://${filePath}?update=${Date.now()}`); // Cache busting
            
            global.plugins[file] = module.default || module;
            console.log(chalk.cyan(`[ PLUGIN ] Loaded: ${file}`));
        } catch (e) {
            console.error(chalk.red(`[ ERROR ] Gagal load plugin ${file}:`), e);
        }
    }
}

async function startIkuyo() {
    // Load Plugins saat startup
    await loadPlugins();

    // Auth State
    const { state, saveCreds } = await useMultiFileAuthState(global.config.sessionName);
    
    // Socket Configuration
    const sock = makeWASocket({
        version: (await fetchLatestBaileysVersion()).version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Ikuyo (Mod)', 'Chrome', '1.0.0']
    });

    // Event Connection Update
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log(chalk.yellow('Scan QR Code di atas...'));
            // Optional: tampilin QR di terminal jika printQRInTerminal false
        }
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(chalk.red('Koneksi terputus, reason:', reason));
            
            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('Device Logged Out, hapus session dan scan ulang.'));
            } else {
                startIkuyo(); // Reconnect
            }
        } else if (connection === 'open') {
            console.log(chalk.green('✓ Bot Ikuyo berhasil terhubung!'));
        }
    });

    // Save Creds
    sock.ev.on('creds.update', saveCreds);

    // Event Messages Upsert
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message) return;
            
            // Serialize Message Helper (Sederhana)
            const serialize = (msg) => {
                // Karena ini base sederhana, kita buat helper dasar di sini
                // Anda bisa memindahkan ini ke library helper terpisah
                const types = Object.keys(msg.message);
                const type = types[0];
                const text = type === 'conversation' ? msg.message.conversation : 
                             type === 'extendedTextMessage' ? msg.message.extendedTextMessage.text : '';
                             
                return {
                    type,
                    text,
                    key: msg.key,
                    pushName: msg.pushName,
                    message: msg.message,
                    reply: async (teks) => {
                        await sock.sendMessage(msg.key.remoteJid, { text: teks }, { quoted: msg });
                    }
                };
            };
            
            const msg = serialize(m);
            const { text, type } = msg;
            
            // Check Prefix
            const prefix = global.config.prefix;
            const isCmd = text.startsWith(prefix);
            const command = isCmd ? text.slice(1).trim().split(/ +/).shift().toLowerCase() : null;
            const args = text.trim().split(/ +/).slice(1);
            
            // Context untuk plugin/case
            const ctx = { text, prefix, command, args, msg, sock };

            // 1. Jalankan Case Handler
            if (typeof caseHandler === 'function') {
                await caseHandler(msg, sock, ctx);
            }

            // 2. Jalankan Plugins (ESM)
            if (isCmd && global.plugins) {
                for (const name in global.plugins) {
                    const plugin = global.plugins[name];
                    // Cek apakah plugin punya command yang cocok
                    if (plugin.command && plugin.command.includes(command)) {
                        try {
                            await plugin.run(msg, sock, ctx);
                        } catch (e) {
                            console.error(chalk.red(`Error plugin ${name}:`), e);
                            msg.reply(`Terjadi error di plugin *${name}*`);
                        }
                    }
                }
            }

        } catch (err) {
            console.error(chalk.red('Error di messages.upsert:'), err);
        }
    });
    
    // Watcher untuk Plugins (Auto Reload Plugin)
    fs.watch(pluginFolder, async (event, filename) => {
        if (filename && pluginFilter(filename)) {
            console.log(chalk.magenta(`[ PLUGIN ] Perubahan terdeteksi: ${filename}`));
            // Hapus dari cache jika ada (untuk ESM import dinamis bisa langsung load ulang)
            const filePath = path.join(pluginFolder, filename);
            try {
                const module = await import(`file://${filePath}?update=${Date.now()}`);
                global.plugins[filename] = module.default || module;
                console.log(chalk.green(`[ PLUGIN ] Reloaded: ${filename}`));
            } catch (e) {
                console.error(chalk.red(`[ ERROR ] Gagal reload ${filename}`), e);
            }
        }
    });
}

startIkuyo();
