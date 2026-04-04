
<h1 align="center">Ikuyo Bot - WhatsApp Multi-Device</h1>
<p align="center">
    <img src="https://img.shields.io/badge/Nodejs-v18%2B-green?style=for-the-badge&logo=node.js" alt="NodeJS">
    <img src="https://img.shields.io/badge/Library-Wileys-blue?style=for-the-badge" alt="Wileys">
    <img src="https://img.shields.io/badge/Commands-76%2B-orange?style=for-the-badge" alt="Commands">
    <img src="https://img.shields.io/badge/Plugins-7-purple?style=for-the-badge" alt="Plugins">
    <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License">
</p>

<p align="center">
    Bot WhatsApp canggih berbasis NodeJS dengan library <b>Wileys (Baileys Mod)</b>.
    Dilengkapi 76+ command, 7 plugin, interactive button menu, downloader, AI chat, group management, dan banyak lagi.
</p>

---

## 📝 Deskripsi

**Ikuyo** adalah bot WhatsApp yang dibangun menggunakan NodeJS dengan library [Wileys](https://www.npmjs.com/package/wileys) (modifikasi dari Baileys). Bot ini dirancang dengan arsitektur yang rapi menggunakan sistem **dual-layer** (case handler + plugin ESM) yang memudahkan pengembangan fitur baru.

Bot mendukung **Pairing Code** maupun **QR Code** untuk koneksi, dilengkapi **Auto Reload** (hot reload) agar perubahan kode langsung aktif tanpa restart, serta memiliki sistem **Interactive Button** untuk pengalaman pengguna yang modern.

## 🚀 Fitur Utama

### Core Engine
- **Pairing Code / QR Code** — Login fleksibel, bisa pakai kode pairing atau scan QR
- **Dual System** — Case handler untuk command dasar + plugin ESM untuk fitur kompleks
- **Auto Reload (Hot Reload)** — Edit case.js, plugin, atau config → langsung aktif tanpa restart
- **Rate Limiting** — Anti-spam (5 command / 15 detik per user, bisa dikonfigurasi)
- **Anti-Delete Messages** — Deteksi dan resend pesan yang dihapus di grup
- **Welcome & Leave Messages** — Pesan otomatis saat member join/leave grup (bisa dikustomisasi)
- **Exponential Backoff** — Reconnect otomatis dengan delay bertahap saat koneksi putus
- **Plugin Timeout Protection** — Batas 30 detik per plugin agar tidak mengganggu command lain
- **Enhanced Message Serialization** — Akses mudah ke quotedMessage, isOwner, isCmd, body, args, helpers
- **Auto-Update Detection** — Cek pembaruan dari git remote saat startup
- **Global Config** — Konfigurasi terpusat dan bisa diakses dari semua file via `global.config`
- **Timestamped Logging** — Log berwarna dengan timestamp untuk debugging mudah

### Interactive Button System
- **Quick Reply Buttons** — Tombol respons cepat (maks 3 per pesan)
- **Interactive List Messages** — Menu bergulir dengan sections dan rows
- **Template Buttons** — Tombol dengan media header (gambar/video/dokumen)
- **Confirm Dialogs** — Dialog Ya/Tidak untuk konfirmasi aksi
- **Plugin Handler Registry** — Plugin bisa mendaftarkan handler button sendiri via `global._buttonHandlers`

## 📋 Daftar Command

### 🔰 General

| Command | Deskripsi |
|---------|-----------|
| `/menu` | Menu bot lengkap (text) + quick button |
| `/menubtn` | Menu interaktif dengan navigasi button (6 sections) |
| `/ping` | Cek kecepatan respon bot (latency) |
| `/uptime` | Lihat uptime bot dalam format yang mudah dibaca |
| `/runtime` | Sama seperti uptime |
| `/speedtest` | Speedtest bot (5 ronde, rata-rata/min/max) |
| `/status` | Status lengkap bot (memory, CPU, uptime, platform) |

### 🛡️ Info

| Command | Deskripsi |
|---------|-----------|
| `/owner` | Info owner bot (dengan mention) |
| `/script` atau `/sc` | Link repository & info bot |
| `/donasi` atau `/donate` | Informasi donasi |

### 👑 Owner Only

| Command | Deskripsi |
|---------|-----------|
| `/shutdown` | Matikan bot |
| `/setprefix <prefix>` | Ubah prefix bot on-the-fly |
| `/setname <nama>` | Ubah nama bot |
| `/cleartemp` | Hapus semua file di folder temp |

> Fitur owner lengkap tersedia di plugin `owner.mjs`: broadcast, block/unblock, eval, exec, join/leave, clearsession, dll.

### 👥 Group Management

| Command | Deskripsi |
|---------|-----------|
| `/kick @user` | Kick member dari grup |
| `/add <nomor>` | Tambah member ke grup |
| `/promote @user` | Jadikan member sebagai admin |
| `/demote @user` | Turunkan admin menjadi member |
| `/linkgroup` atau `/gclink` | Ambil link invite grup |
| `/revoke` | Revoke link invite grup |
| `/setname <teks>` | Ubah nama grup |
| `/setdesc <teks>` | Ubah deskripsi grup |
| `/tagall <pesan>` | Tag semua member (chunk 50) |
| `/hidetag <pesan>` | Tag semua member tanpa tampil @ |
| `/groupinfo` | Info lengkap grup |
| `/listadmin` | Daftar semua admin |
| `/antilink on/off` | Toggle anti-link WhatsApp |
| `/welcome on/off` | Toggle pesan welcome/leave |

### 📥 Downloader (Interactive Button)

| Command | Deskripsi |
|---------|-----------|
| `/play <query>` | Cari YouTube & pilih lagu via interactive list |
| `/ytmp3 <url>` | Download YouTube audio MP3 (dengan confirm button) |
| `/ytmp4 <url>` | Download YouTube video MP4 (dengan confirm button) |
| `/ytsearch <query>` | Cari YouTube, tampil 10 hasil + action buttons |
| `/tiktok <url>` | Download video TikTok |

### 🔄 Converter

| Command | Deskripsi |
|---------|-----------|
| `/sticker` atau `/s` | Gambar/video → sticker (512x512, WebP) |
| `/stickergif` atau `/sgif` | Video → sticker animasi (maks 10 detik) |
| `/take` | Sticker → gambar (exif-free) |
| `/toimg` | Sama seperti take |

### 🤖 AI & Text

| Command | Deskripsi |
|---------|-----------|
| `/ai <pesan>` | Chat dengan AI (Google Gemini 2.0 Flash) |
| `/img <prompt>` | Generate gambar AI (Pollinations, gratis) |
| `/translate <teks>` | Terjemahkan teks (default ID → EN) |
| `/define <kata>` | Cari definisi kata (English) |

### 🎮 Fun & Games

| Command | Deskripsi |
|---------|-----------|
| `/quote` | Quote inspiratif random |
| `/fact` | Fakta random |
| `/joke` | Lelucon random |
| `/truth` | Pertanyaan Truth (Truth or Dare) |
| `/dare` | Tantangan Dare (Truth or Dare) |
| `/roll [n]` | Lempar dadu (default 1-6, custom max) |
| `/flip` | Lempar koin (kepala/ekor) |
| `/pick a, b, c` | Pilih random dari opsi |
| `/rate <teks>` | Rate sesuatu 1-100 dengan komentar |
| `/compare a vs b` | Perbandingan random dua hal |
| `/trivia` | Pertanyaan trivia dengan 4 opsi |
| `/simi <pesan>` | Chatbot SimSimi-style |
| `/couple` | Ship dua member random (grup) |
| `/math <ekspresi>` | Hitung ekspresi matematika |
| `/timer <detik>` | Timer countdown (1-3600 detik) |

### ✏️ Text Utilities

| Command | Deskripsi |
|---------|-----------|
| `/style <teks>` | Tampilkan teks dalam 8 gaya font Unicode |
| `/uppercase <teks>` | Ubah ke HURUF BESAR |
| `/lowercase <teks>` | Ubah ke huruf kecil |
| `/reverse <teks>` | Balik teks |
| `/repeat <teks> <n>` | Ulangi teks n kali |
| `/count <teks>` | Hitung karakter, kata, baris |
| `/hash <teks>` | Generate hash (MD5, SHA1, SHA256, SHA512) |
| `/encode <teks>` | Encode ke Base64 |
| `/decode <base64>` | Decode dari Base64 |
| `/qr <teks>` | Buat QR Code dari teks |
| `/ttp <teks>` | Text to picture |
| `/attp <teks>` | Animated text to sticker |

## 📂 Struktur Folder

```text
Ikuyo/
├── lib/
│   ├── button.js           # Button & interactive message helper
│   └── case.js             # Logic command switch case + menu handler
├── plugins/                # Folder plugin ESM (.mjs)
│   ├── ai.mjs              # AI chat, image gen, translate, define
│   ├── downloader.mjs      # YouTube play/download, TikTok
│   ├── fun.mjs             # Quote, joke, truth/dare, games
│   ├── group.mjs           # Group management & moderation
│   ├── owner.mjs           # Owner-only commands
│   ├── sticker.mjs         # Sticker maker & converter
│   └── text.mjs            # Text utilities & font style
├── session/                # Folder session (auto-generate, di-gitignore)
├── temp/                   # File sementara (di-gitignore)
├── config.js               # Konfigurasi global bot
├── index.js                # File utama / entry point
├── package.json
├── .gitignore
└── README.md
```

## ⚙️ Instalasi

### 1. Prasyarat
-   **NodeJS** v18+ ([Download](https://nodejs.org))
-   **FFmpeg** (untuk sticker converter, audio/video processing)
    - Ubuntu/Debian: `sudo apt install ffmpeg`
    - Windows: [Download FFmpeg](https://ffmpeg.org/download.html)

### 2. Clone & Install
```bash
git clone https://github.com/BF667-IDLE/Ikuyo.git
cd Ikuyo
npm install
```

### 3. Konfigurasi

Edit file `config.js` sesuai kebutuhan:

```javascript
global.config = {
    name: "Ikuyo",                    // Nama bot
    owner: "628xxxxxxx",              // Nomor owner
    ownerNumber: ["628xxxxxxx"],      // Array nomor owner (bisa >1)
    prefix: "/",                      // Prefix command
    sessionName: "session",           // Nama folder session
    repo: "https://github.com/BF667-IDLE/Ikuyo.git",

    pairing: {
        is_pairing: true,             // true = pairing code, false = QR code
        pairing_code: "628xxxxxxx"    // Nomor untuk pairing
    },

    group: {
        welcome: true,                // Aktifkan welcome message
        leave: true,                  // Aktifkan leave message
        welcome_msg: "Halo @user! Selamat datang di *{groupName}*",
        leave_msg: "@user telah keluar dari *{groupName}*",
        anti_delete: false,           // Anti-delete pesan
        anti_link: false              // Anti-link grup WhatsApp
    },

    ratelimit: {
        enabled: true,                // Aktifkan rate limiting
        max_commands: 5,              // Maks command per window
        cooldown: 15                  // Window waktu (detik)
    },

    ai: {
        enabled: false,               // Aktifkan fitur AI
        provider: "gemini",           // Provider: gemini
        api_key: ""                   // API key dari Google AI Studio
    },

    debug: false                      // Debug logging
};
```

### 4. Jalankan Bot
```bash
npm start        # Production
npm run dev      # Development (dengan nodemon)
```

-   **Pairing Code**: Jika `is_pairing: true`, masukkan kode pairing yang tampil di console ke WhatsApp → Settings → Linked Devices
-   **QR Code**: Jika `is_pairing: false`, scan QR code yang muncul di terminal

### 5. Fitur AI (Opsional)

Untuk mengaktifkan fitur `/ai` (chat dengan AI):
1. Kunjungi [Google AI Studio](https://aistudio.google.com/apikey)
2. Buat API key gratis
3. Set `ai.api_key` di `config.js`
4. Set `ai.enabled` ke `true`

> Fitur `/img`, `/translate`, dan `/define` bisa digunakan **tanpa API key** (gratis).

## 🛠️ Membuat Plugin

Buat file `.mjs` di folder `plugins/`:

```javascript
// plugins/halo.mjs
export default {
    name: "Halo Plugin",              // Nama plugin
    category: "General",              // Kategori untuk menu
    command: ["halo", "hai"],         // Array command trigger

    run: async (m, sock, { text, prefix, command, args, fullArgs }) => {
        await m.reply(`Halo! Saya ${global.config.name} 👋`);
    }
};
```

### Plugin dengan Button Support

Plugin bisa mendaftarkan handler untuk merespon button click dan list selection:

```javascript
// plugins/contoh-button.mjs

// Handler untuk button/list response
async function handleButton(sock, opts) {
    const { from, buttonId, key } = opts;
    if (buttonId === 'pilihan_1') {
        await sock.sendMessage(from, { text: 'Kamu memilih opsi 1!' }, { quoted: key });
    }
}

// Daftarkan handler
if (typeof globalThis !== 'undefined') {
    if (!globalThis._buttonHandlers) globalThis._buttonHandlers = {};
    globalThis._buttonHandlers.contoh = {
        handleButtonResponse: handleButton,
        handleListResponse: handleButton,
    };
}

export default {
    name: "Contoh Button",
    command: ["tombol"],
    run: async (m, sock, { prefix }) => {
        // Gunakan button helper dari lib/button.js
        const btn = require('../lib/button');
        await btn.sendButtons(sock, m.from, {
            text: 'Silakan pilih:',
            footer: 'Contoh Plugin',
            buttons: [
                { id: 'pilihan_1', text: '✅ Opsi 1' },
                { id: 'pilihan_2', text: '❌ Opsi 2' },
            ],
        }, { quoted: m.key });
    }
};
```

### Button Helper API

```javascript
const btn = require('./lib/button');

// Quick Reply Buttons (maks 3 tombol)
await btn.sendButtons(sock, jid, { text, buttons, footer }, { quoted });

// Interactive List Message
await btn.sendList(sock, jid, { text, buttonText, sections, footer }, { quoted });

// Template Button dengan media
await btn.sendTemplateButton(sock, jid, { text, mediaType: 'image', media, buttons });

// Dialog konfirmasi
await btn.sendConfirm(sock, jid, 'Yakin?', 'confirm_id', 'cancel_id');

// Paginated list
const sections = btn.paginateList(items, 5, 'Hasil {start}-{end}');
```

## 📊 Tech Stack

| Teknologi | Kegunaan |
|-----------|----------|
| Node.js | Runtime environment |
| Wileys (Baileys Mod) | WhatsApp Web API library |
| sharp | Image processing (sticker) |
| fluent-ffmpeg | Audio/video processing |
| ytdl-core + yt-search | YouTube downloader |
| axios | HTTP client |
| node-cache | In-memory caching |
| moment-timezone | Date/time formatting |
| chalk | Console coloring |

## 📌 Lisensi

MIT License — [BF667-IDLE](https://github.com/BF667-IDLE)

Repo: [https://github.com/BF667-IDLE/Ikuyo.git](https://github.com/BF667-IDLE/Ikuyo.git)
