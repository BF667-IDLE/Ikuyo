"use strict";

// Core Modules
const fs = require('fs');
const path = require('path');

// External Modules
const pino = require('pino');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');

// Baileys Modules
const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore
} = require('wileys');

// Local Modules
require('./config.js');
const caseHandler = require('./lib/case.js');

// ===============================
// Constants & Configuration
// ===============================
const currentFile = __filename;
const pluginFolder = path.join(__dirname, 'plugins');
const pluginFilter = (filename) => path.extname(filename).toLowerCase() === '.mjs';

global.plugins = {};

// ===============================
// Plugin Management
// ===============================

/**
 * Load all plugins from plugins directory
 */
async function loadPlugins() {
    if (!fs.existsSync(pluginFolder)) {
        fs.mkdirSync(pluginFolder);
    }

    const files = fs.readdirSync(pluginFolder).filter(pluginFilter);
    
    for (const file of files) {
        await loadPluginFile(file);
    }
}

/**
 * Load or reload a specific plugin file
 */
async function loadPluginFile(filename) {
    try {
        const filePath = path.join(pluginFolder, filename);
        const module = await import(`file://${filePath}?update=${Date.now()}`);
        global.plugins[filename] = module.default || module;
        console.log(chalk.cyan(`[ PLUGIN ] Loaded: ${filename}`));
    } catch (error) {
        console.error(chalk.red(`[ ERROR ] Failed to load plugin ${filename}:`), error);
    }
}

/**
 * Watch plugins directory for changes and auto-reload
 */
function watchPlugins() {
    fs.watch(pluginFolder, async (event, filename) => {
        if (filename && pluginFilter(filename)) {
            console.log(chalk.magenta(`[ PLUGIN ] Changes detected: ${filename}`));
            await loadPluginFile(filename);
            console.log(chalk.green(`[ PLUGIN ] Reloaded: ${filename}`));
        }
    });
}

// ===============================
// Message Serialization
// ===============================

/**
 * Serialize incoming message for easier handling
 */
function serializeMessage(message, sock) {
    const types = Object.keys(message.message);
    const type = types[0];
    
    const getText = () => {
        if (type === 'conversation') return message.message.conversation;
        if (type === 'extendedTextMessage') return message.message.extendedTextMessage.text;
        if (type === 'imageMessage') return message.message.imageMessage.caption;
        if (type === 'videoMessage') return message.message.videoMessage.caption;
        if (type === 'documentMessage') return message.message.documentMessage.caption;
        return '';
    };
    
    const text = getText();
    
    return {
        type,
        text,
        key: message.key,
        pushName: message.pushName,
        message: message.message,
        from: message.key.remoteJid,
        sender: message.key.participant || message.key.remoteJid,
        isGroup: message.key.remoteJid.endsWith('@g.us'),
        reply: async (teks, options = {}) => {
            await sock.sendMessage(message.key.remoteJid, { text: teks }, { quoted: message, ...options });
        }
    };
}

// ===============================
// Pairing Code Management
// ===============================

/**
 * Request pairing code for device linking
 */
async function requestPairingCode(sock, phoneNumber) {
    try {
        const formattedCode = phoneNumber.replace(/[^0-9]/g, '');
        const pairingCode = await sock.requestPairingCode(formattedCode);
        
        console.log(chalk.green(`[ PAIRING ] Your pairing code: ${pairingCode}`));
        console.log(chalk.cyan('Enter this code in WhatsApp: Settings > Linked Devices > Link Device'));
        
        return pairingCode;
    } catch (error) {
        console.error(chalk.red('[ PAIRING ] Failed to request pairing code:'), error.message);
        throw error;
    }
}

// ===============================
// Connection Handlers
// ===============================

/**
 * Handle connection updates (QR, pairing, reconnect)
 */
function setupConnectionHandlers(sock, usePairing, pairCode) {
    let pairingRequested = false;
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Handle QR Code display
        if (qr && !usePairing) {
            console.log(chalk.yellow('[ QR MODE ] Scan the QR code below:'));
            qrcode.generate(qr, { small: true });
        }
        
        // Handle connection close
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(chalk.red(`Connection closed, reason: ${reason}`));
            pairingRequested = false;
            
            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('Device logged out. Please delete session and scan again.'));
                process.exit(1);
            } else {
                console.log(chalk.yellow('Attempting to reconnect in 5 seconds...'));
                setTimeout(() => startIkuyo(), 5000);
            }
        } 
        // Handle successful connection
        else if (connection === 'open') {
            console.log(chalk.green('✓ Bot Ikuyo successfully connected!'));
            
            // Request pairing code if enabled and not registered
            if (usePairing && !sock.authState.creds.registered && !pairingRequested) {
                pairingRequested = true;
                await requestPairingCode(sock, pairCode).catch(() => {
                    pairingRequested = false;
                });
            }
        }
    });
}

/**
 * Handle credential updates
 */
function setupCredentialHandlers(sock, saveCreds) {
    sock.ev.on('creds.update', saveCreds);
}

// ===============================
// Message Handler
// ===============================

/**
 * Handle incoming messages
 */
function setupMessageHandlers(sock) {
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const message = chatUpdate.messages[0];
            if (!message.message || message.key.fromMe) return;
            
            const msg = serializeMessage(message, sock);
            const { text, from, isGroup, sender } = msg;
            
            // Only process messages with text
            if (!text) return;
            
            const prefix = global.config.prefix || '.';
            const isCommand = text.startsWith(prefix);
            const command = isCommand ? text.slice(1).trim().split(/ +/).shift().toLowerCase() : null;
            const args = text.trim().split(/ +/).slice(1);
            const fullArgs = text.trim().slice(command?.length + 1).trim();
            
            const context = { 
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
            
            // Execute case handler if available
            if (typeof caseHandler === 'function') {
                await caseHandler(msg, sock, context);
            }
            
            // Execute plugin handlers
            if (isCommand && global.plugins) {
                await executePlugins(command, msg, sock, context);
            }
            
        } catch (error) {
            console.error(chalk.red('Error in messages.upsert:'), error);
        }
    });
}

/**
 * Execute matching plugins for a command
 */
async function executePlugins(command, msg, sock, context) {
    for (const [name, plugin] of Object.entries(global.plugins)) {
        if (plugin.command && Array.isArray(plugin.command) && plugin.command.includes(command)) {
            try {
                console.log(chalk.blue(`[ EXEC ] Plugin: ${name} | Command: ${command}`));
                await plugin.run(msg, sock, context);
            } catch (error) {
                console.error(chalk.red(`Error in plugin ${name}:`), error);
                await msg.reply(`❌ Error in plugin *${name}*\n\`\`\`${error.message}\`\`\``);
            }
        }
    }
}

// ===============================
// Process Error Handlers
// ===============================

/**
 * Setup global error handlers
 */
function setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
        console.error(chalk.red('[ FATAL ] Uncaught Exception:'), error);
    });
    
    process.on('unhandledRejection', (error) => {
        console.error(chalk.red('[ FATAL ] Unhandled Rejection:'), error);
    });
}

// ===============================
// Auto Reload
// ===============================

/**
 * Setup auto-reload for main file
 */
function setupAutoReload() {
    fs.watchFile(currentFile, () => {
        fs.unwatchFile(currentFile);
        console.log(chalk.green(`✓ ${path.basename(currentFile)} updated! Reloading...`));
        delete require.cache[require.resolve(currentFile)];
    });
}

// ===============================
// Bot Initialization
// ===============================

/**
 * Initialize and start the bot
 */
async function startIkuyo() {
    await loadPlugins();
    
    const { state, saveCreds } = await useMultiFileAuthState(global.config.sessionName);
    
    const usePairing = global.config.pairing.is_pairing;
    const pairCode = global.config.pairing.pairing_code;
    
    const sock = makeWASocket({
        version: (await fetchLatestBaileysVersion()).version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: !usePairing,
        auth: state,
        browser: ['Ikuyo (Mod)', 'Chrome', '1.0.0']
    });
    
    // Setup all handlers
    setupConnectionHandlers(sock, usePairing, pairCode);
    setupCredentialHandlers(sock, saveCreds);
    setupMessageHandlers(sock);
    watchPlugins();
}

// ===============================
// Application Entry Point
// ===============================

// Setup error handlers
setupErrorHandlers();

// Setup auto-reload
setupAutoReload();

// Start the bot
startIkuyo().catch(error => {
    console.error(chalk.red('[ FATAL ] Failed to start bot:'), error);
    process.exit(1);
});
