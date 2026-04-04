# ⚖️ Syarat & Ketentuan JadiBot - Ikuyo Bot

> **Versi:** 1.0
> **Berlaku sejak:** 5 April 2026
> **Terakhir diperbarui:** 5 April 2026

---

## 📖 Pendahuluan

Selamat datang di fitur **JadiBot** Ikuyo Bot. Dengan fitur ini, kamu dapat menjadikan nomor WhatsApp kamu sendiri sebagai bot yang berjalan di server Ikuyo Bot. Fitur JadiBot memungkinkan kamu memiliki bot WhatsApp pribadi tanpa perlu meng-hosting server sendiri.

Sebelum menggunakan fitur ini, harap membaca dan memahami seluruh Syarat & Ketentuan (TOS) yang tercantum di bawah ini. Dengan menggunakan fitur JadiBot, kamu dianggap telah membaca, memahami, dan menyetujui seluruh ketentuan yang berlaku.

---

## 1. 🚫 Hal yang Dilarang Keras

Penggunaan JadiBot untuk tujuan berikut **secara tegas dilarang** dan akan mengakibatkan **banned permanen** tanpa peringatan:

- **Spam, Flood & Promosi** — Menggunakan bot untuk mengirim pesan massal, spam, flood ke chat pribadi maupun grup, atau mempromosikan produk/jasa secara berlebihan.
- **Kegiatan Ilegal** — Menggunakan bot untuk kegiatan yang melanggar hukum negara Republik Indonesia maupun hukum internasional, termasuk namun tidak terbatas pada penipuan, phishing, carding, dan kegiatan cybercrime lainnya.
- **Konten Berbahaya** — Mengirim atau menyebarkan konten SARA (Suku, Agama, Ras, Antargolongan), pornografi, kekerasan, ujaran kebencian, atau konten yang melanggar norma kesusilaan dan hukum.
- **Jual Beli Akses** — Menjual, memperjualbelikan, atau memperdagangkan akses JadiBot dalam bentuk apapun, baik secara langsung maupun tidak langsung.
- **Eksploitasi Sistem** — Mencoba mengeksploitasi, merusak, membobol, atau mengganggu sistem server Ikuyo Bot, termasuk mencari celah keamanan, DDoS, atau brute force.
- **Penyalahgunaan Data** — Mengumpulkan, menyimpan, atau menyebarkan data pribadi pengguna lain tanpa izin.
- **Reverse Engineering** — Mencoba melakukan reverse engineering, dekompilasi, atau modifikasi kode bot tanpa izin dari developer.

---

## 2. ⚠️ Batasan & Kewenangan Owner

Owner bot memiliki kewenangan penuh atas sistem JadiBot, termasuk namun tidak terbatas pada:

- **Pemutusan Akses** — Owner berhak mematikan (stop) JadiBot kapan saja tanpa pemberitahuan sebelumnya, dengan atau tanpa alasan.
- **Banned Permanen** — Owner berhak memberikan banned permanen kepada pengguna yang melanggar TOS, tanpa pemberitahuan terlebih dahulu.
- **Penolakan Akses** — Owner berhak menolak permintaan pembuatan JadiBot tanpa memberikan alasan.
- **Penghapusan Session** — Jika JadiBot di-banned, session dan seluruh data terkait akan dihapus secara permanen dari server.
- **Penghentian Fitur** — Fitur JadiBot dapat dihentikan secara keseluruhan sewaktu-waktu tanpa pemberitahuan.
- **Perubahan TOS** — Owner berhak mengubah Syarat & Ketentuan ini kapan saja. Perubahan berlaku sejak dipublikasikan.

---

## 3. 📋 Resiko Penggunaan

Pengguna wajib memahami dan menerima resiko berikut sebelum menggunakan fitur JadiBot:

- **Banned WhatsApp** — Nomor WhatsApp yang digunakan sebagai JadiBot **berisiko di-banned oleh pihak WhatsApp/Meta**. Hal ini karena penggunaan bot pihak ketiga melanggar Terms of Service WhatsApp. Owner Ikuyo Bot **tidak bertanggung jawab** atas banned yang diterima oleh nomor pengguna.
- **Data Session** — Data session autentikasi JadiBot disimpan di server owner. Meskipun owner berusaha menjaga keamanan data, owner tidak bertanggung jawab atas kebocoran data yang terjadi di luar kendali (serangan server, dll).
- **Gunakan Nomor Sekunder** — **Sangat disarankan** untuk menggunakan nomor WhatsApp sekunder (bukan nomor utama) sebagai JadiBot, untuk menghindari kehilangan akses ke nomor utama jika terjadi banned.
- **Kehilangan Data** — Session JadiBot bersifat sementara dan dapat dihapus kapan saja. Jangan menyimpan data penting dalam session JadiBot.
- **Downtime** — Server mungkin mengalami downtime, maintenance, atau gangguan teknis yang menyebabkan JadiBot tidak dapat digunakan sementara.

---

## 4. ✅ Ketentuan Teknis

### 4.1 Kuota & Limitasi

| Ketentuan | Detail |
|-----------|--------|
| Maksimal JadiBot per nomor | 1 (satu) jadibot per nomor WhatsApp |
| Maksimal JadiBot bersamaan | 10 jadibot aktif secara bersamaan di server |
| Maksimal percobaan reconnect | 5 kali, setelah itu session dihapus |
| Batas waktu pairing | 60 detik, setelah itu permintaan dibatalkan |

### 4.2 Mode Akses

JadiBot mendukung dua mode akses:

- **🔒 Private** — Hanya owner JadiBot (pembuat) yang dapat menggunakan command. Mode ini adalah **default** dan sangat disarankan untuk penggunaan pribadi.
- **🌐 Public** — Semua orang yang mengirim pesan ke nomor JadiBot dapat menggunakan command. Mode ini memiliki resiko lebih tinggi karena owner JadiBot bertanggung jawab atas semua aktivitas yang dilakukan melalui botnya.

> ⚠️ Jika menggunakan mode **Public**, owner JadiBot tetap bertanggung jawab penuh atas segala aktivitas yang dilakukan melalui JadiBot-nya, termasuk pelanggaran TOS yang dilakukan oleh pengguna lain.

### 4.3 Ketentuan Server

- JadiBot akan **otomatis mati** jika server di-restart, diperbarui, atau mengalami gangguan.
- Resource server **terbatas**. Owner bot berhak mematikan JadiBot yang menggunakan terlalu banyak resource.
- JadiBot tidak mendukung fitur tertentu dari bot utama (seperti command `.jadibot` itu sendiri di dalam JadiBot).
- Auto-reconnect akan berusaha menyambungkan kembali hingga 5 kali jika koneksi terputus.

### 4.4 Durasi Session

- Session JadiBot bersifat **sementara** (tidak permanen).
- Session akan dihapus jika: JadiBot di-stop, di-banned, server restart, atau owner bot memutuskan untuk menghapusnya.
- Tidak ada jaminan session akan bertahan dalam jangka waktu tertentu.

---

## 5. 🚫 Sanksi Pelanggaran

Pelanggaran terhadap TOS ini akan dikenakan sanksi sebagai berikut:

| Tingkat Pelanggaran | Sanksi |
|---------------------|--------|
| Pelanggaran ringan (pertama kali) | Peringatan lisan atau penghentian JadiBot sementara |
| Pelanggaran sedang | Penghentian JadiBot permanen + banned 30 hari |
| Pelanggaran berat | Banned permanen tanpa penghapusan |
| Eksploitasi sistem | Banned permanen + pelaporan ke pihak berwenang |

Tingkat pelanggaran ditentukan sepenuhnya oleh owner bot dan bersifat final.

---

## 6. 📞 Kontak & Bantuan

Jika kamu memiliki pertanyaan, keluhan, atau ingin mengajukan banding atas banned:

- **WhatsApp Owner:** wa.me/6283150958207
- **GitHub Issues:** [https://github.com/BF667-IDLE/Ikuyo/issues](https://github.com/BF667-IDLE/Ikuyo/issues)

---

## 7. 📜 Perubahan TOS

Owner berhak mengubah TOS ini kapan saja tanpa pemberitahuan terlebih dahulu. Perubahan akan berlaku sejak dipublikasikan di repository GitHub.

Pengguna disarankan untuk mengecek TOS secara berkala di:

> **[https://github.com/BF667-IDLE/Ikuyo/blob/main/TOS_jadibot.md](https://github.com/BF667-IDLE/Ikuyo/blob/main/TOS_jadibot.md)**

---

## ✅ Pernyataan Persetujuan

Dengan mengetik `.jadibot accept` setelah membaca TOS ini, kamu menyatakan bahwa:

1. Kamu telah **membaca** seluruh Syarat & Ketentuan di atas.
2. Kamu telah **memahami** resiko penggunaan JadiBot, termasuk resiko banned WhatsApp.
3. Kamu bersedia **mematuhi** seluruh ketentuan yang berlaku.
4. Kamu **bertanggung jawab** atas segala aktivitas yang dilakukan melalui JadiBot milikmu.
5. Kamu **membebaskan** owner Ikuyo Bot dari segala tuntutan hukum yang timbul akibat penggunaan JadiBot.
6. Kamu mengerti bahwa owner berhak **mematikan atau mem-banned** JadiBot kamu kapan saja.

---

*© 2026 Ikuyo Bot — BF667-IDLE*
*Repository: [https://github.com/BF667-IDLE/Ikuyo](https://github.com/BF667-IDLE/Ikuyo)*
