const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Metadata Bot
global.config = {
    name: "Ikuyo", // Nama Bot Default
    owner: "628xxxxxxx", // Nomor Owner
    prefix: "/", // Prefix bot
    sessionName: "session",
    repo: "https://github.com/BF667-IDLE/Ikuyo.git"
};

// Fitur Auto Reload untuk Config
const currentFile = __filename;
fs.watchFile(currentFile, () => {
    fs.unwatchFile(currentFile);
    console.log(chalk.green(`✓ ${path.basename(currentFile)} updated! Reloading...`));
    delete require.cache[require.resolve(currentFile)];
});
