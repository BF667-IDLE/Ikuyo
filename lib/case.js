const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Logic Case Utama
module.exports = async (m, sock, { text, prefix, command }) => {
    // Switch Case Command
    switch (command) {
        case 'menu':
            m.reply(`Halo! Saya ${global.config.name}.\nPrefix: ${prefix}\nRepo: ${global.config.repo}`);
            break;
            
        case 'ping':
            m.reply('Pong! 🏓');
            break;

        // Tambahkan case lain di sini
        default:
            if (text.startsWith(prefix)) {
                m.reply(`Command *${command}* tidak ditemukan!`);
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
