const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Metadata Bot
global.config = {
    name: "Ikuyo", // Nama Bot Default
    owner: "6283150958207", // Nomor Owner
    ownerNumber: ["6283150958207"], // Array nomor owner (bisa lebih dari 1)
    prefix: "/", // Prefix bot
    sessionName: "session",
    repo: "https://github.com/BF667-IDLE/Ikuyo.git",

    // Pengaturan Pairing Code
    pairing: {
        is_pairing: true, // true = gunakan pairing code, false = gunakan QR Code
        pairing_code: "6285124252139" // Kode pairing default (akan request ini jika state baru)
    },

    // Pengaturan Rate Limiting
    rate_limit: {
        max_commands: 5,  // Maksimal command per jendela waktu
        window_ms: 15000, // Jendela waktu dalam ms (15 detik)
        enabled: true     // true = aktifkan rate limiting
    },

    // Pengaturan Grup
    group: {
        welcome: true,           // Aktifkan welcome message
        leave: true,             // Aktifkan leave message
        welcome_msg: "Halo @user! 👋\nSelamat datang di grup *{groupName}*\n\n📋 Total member: {memberCount}",
        leave_msg: "@user telah keluar dari grup *{groupName}* 🫡\n\n📋 Total member: {memberCount}",
        anti_delete: false,      // Anti-delete pesan (resend pesan yang dihapus)
        anti_link: false,        // Anti-link grup WhatsApp
    },

    // Pesan Welcome & Leave (legacy, dipindah ke group.)
    // Tersedia placeholder: @user, {groupName}, {memberCount}, {groupDesc}
    welcome_msg: "Halo @user! 👋\nSelamat datang di grup *{groupName}*\n\n📋 Total member: {memberCount}",
    leave_msg: "@user telah keluar dari grup *{groupName}* 🫡\n\n📋 Total member: {memberCount}",

    // Anti-Delete Messages
    anti_delete: {
        enabled: false,      // true = aktifkan anti-delete
        ttl_ms: 60000       // Berapa lama pesan disimpan (60 detik)
    },

    // Bot Status Settings
    status: {
        online: true,
        read_messages: false,    // Auto-read messages
        typing_indicator: true,  // Tampilkan typing indicator
    },

    // Pengaturan AI
    ai: {
        enabled: false,           // Aktifkan fitur AI
        provider: "gemini",       // Provider: gemini atau openai
        api_key: "",              // API Key (isi dengan key kamu)
        // Untuk Gemini, daftar di: https://aistudio.google.com/apikey
        // Untuk OpenAI, isi dengan OpenAI API key
    },

    // Pengaturan Downloader
    downloader: {
        yt_max_quality: "720p",   // Kualitas maksimum YouTube download
    },

    // Auto-Update Check
    auto_update_check: true,      // Cek update git saat startup

    // Debug Mode
    debug: false,                 // Aktifkan logging debug
};

// Fitur Auto Reload untuk Config
const currentFile = __filename;
fs.watchFile(currentFile, () => {
    fs.unwatchFile(currentFile);
    console.log(chalk.green(`✓ ${path.basename(currentFile)} updated! Reloading...`));
    delete require.cache[require.resolve(currentFile)];
});
