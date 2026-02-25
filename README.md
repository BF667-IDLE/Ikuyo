
<h1 align="center">Ikuyo Bot - Base WhatsApp</h1>
<p align="center">
    <img src="https://img.shields.io/badge/Nodejs-v18%2B-green?style=for-the-badge&logo=node.js" alt="NodeJS">
    <img src="https://img.shields.io/badge/Library-Wileys-blue?style=for-the-badge" alt="Wileys">
    <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License">
</p>

<p align="center">
    Base Bot WhatsApp NodeJS menggunakan library <b>Wileys (Mod)</b> dengan fitur Case, Plugin ESM, Auto Reload, dan Support Pairing Code.
</p>

---

## 📝 Deskripsi
**Ikuyo** adalah base bot WhatsApp yang dibangun menggunakan NodeJS dengan library [Wileys](https://www.npmjs.com/package/wileys). Base ini dirancang untuk developer yang menginginkan struktur kode yang rapi dengan pemisahan antara logic `case` dan `plugin`.

Base ini mendukung **ESM (ECMAScript Modules)** untuk sistem plugin, mendukung **Pairing Code** (custom code) atau **QR Code**, serta **Auto Reload** pada file inti dan plugin tanpa perlu restart bot secara manual.

## 🚀 Fitur Utama
-   **Support Pairing Code**: Login via kode pairing (customizable) tanpa scan QR.
-   **Support QR Code**: Bisa switch ke mode QR Code kapan saja.
-   **Library Wileys**: Menggunakan versi mod dari Baileys.
-   **Dual System**: Mendukung sistem `case` (untuk command dasar) dan `plugin` (untuk fitur kompleks).
-   **ESM Plugins**: Plugin menggunakan ekstensi `.mjs` (ES Modules) agar lebih modern.
-   **Auto Reload (Hot Reload)**:
    -   Edit file `lib/case.js` -> Otomatis ter-update.
    -   Tambah/Edit file di folder `plugins` -> Otomatis ter-load ulang.
    -   Edit file `config.js` -> Otomatis ter-update.
-   **Global Config**: Konfigurasi mudah diakses di semua file melalui `global.config`.

## 📂 Struktur Folder
```text
Ikuyo/
├── lib/
│   └── case.js          # Logic command switch case
├── plugins/             # Folder plugin ESM (.mjs)
│   └── example.mjs      # Contoh plugin
├── session/             # Folder session (auto generate)
├── config.js            # Config global bot
├── index.js             # File utama/entry point
├── package.json
└── README.md
```

## ⚙️ Instalasi

### 1. Prasyarat
-   NodeJS v18+
-   FFMPEG (untuk sticker/converter)

### 2. Clone & Install
```bash
git clone https://github.com/BF667-IDLE/Ikuyo.git
cd Ikuyo
npm install
```

### 3. Konfigurasi
Edit file `config.js`:

```javascript
global.config = {
    name: "Ikuyo",
    owner: "628xxxxxxx",
    prefix: "/",
    sessionName: "session",
    repo: "https://github.com/BF667-IDLE/Ikuyo.git",
    pairing: {
        is_pairing: true,       // Ubah ke false jika ingin pakai QR Code
        pairing_code: "12345678" // Kode pairing yang diinginkan
    }
};
```

### 4. Jalankan Bot
```bash
npm start
```

-   Jika `is_pairing: true`: Masukkan nomor bot, lalu masukkan kode yang ada di console (contoh: 12345678).
-   Jika `is_pairing: false`: Scan QR Code yang muncul di terminal.

## 🛠️ Membuat Plugin
Buat file `.mjs` di folder `plugins`.

```javascript
// plugins/info.mjs
export default {
    name: "Info",
    command: ["botinfo"],
    run: async (m, sock, { prefix }) => {
        await m.reply(`Bot ${global.config.name} aktif!`);
    }
};
```

## 📌 Lisensi
MIT License. Repo: [https://github.com/BF667-IDLE/Ikuyo.git](https://github.com/BF667-IDLE/Ikuyo.git)
