const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Metadata Bot
global.config = {
    name: "Ikuyo", // Nama Bot Default
    owner: "628xxxxxxx", // Nomor Owner
    prefix: "/", // Prefix bot
    sessionName: "session",
    repo: "https://github.com/BF667-IDLE/Ikuyo.git",
    // Pengaturan Pairing Code
    pairing: {
        is_pairing: true, // true = gunakan pairing code, false = gunakan QR Code
        pairing_code: "12345678" // Kode pairing default (akan request ini jika state baru)
    }
};

// Fitur Auto Reload untuk Config
const currentFile = __filename;
fs.watchFile(currentFile, () => {
    fs.unwatchFile(currentFile);
    console.log(chalk.green(`✓ ${path.basename(currentFile)} updated! Reloading...`));
    delete require.cache[require.resolve(currentFile)];
});
