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

    // Logic Pairing Code
    if (usePairing && !sock.authState.creds.registered) {
        const requestedCode = await sock.requestPairingCode(pairCode);
        console.log(chalk.green(`[ PAIRING ] Kode Pairing: ${requestedCode}`));
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Jika mode QR dan QR tersedia
        if (qr && !usePairing) {
            console.log(chalk.yellow('[ QR MODE ] Scan QR Code di bawah ini:'));
            qrcode.generate(qr, { small: true });
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

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message) return;
            
            const serialize = (msg) => {
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
            const prefix = global.config.prefix;
            const isCmd = text.startsWith(prefix);
            const command = isCmd ? text.slice(1).trim().split(/ +/).shift().toLowerCase() : null;
            const args = text.trim().split(/ +/).slice(1);
            
            const ctx = { text, prefix, command, args, msg, sock };

            if (typeof caseHandler === 'function') {
                await caseHandler(msg, sock, ctx);
            }

            if (isCmd && global.plugins) {
                for (const name in global.plugins) {
                    const plugin = global.plugins[name];
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
    
    // Watcher untuk Plugins
    fs.watch(pluginFolder, async (event, filename) => {
        if (filename && pluginFilter(filename)) {
            console.log(chalk.magenta(`[ PLUGIN ] Perubahan terdeteksi: ${filename}`));
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
