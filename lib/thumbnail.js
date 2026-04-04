/**
 * ═══════════════════════════════════════════════════════
 *  Thumbnail & Image Helper
 *  For Ikuyo WhatsApp Bot
 * ═══════════════════════════════════════════════════════
 *
 * Helper utility untuk mengatasi bug Wileys/Baileys
 * dalam load gambar. Library Wileys sering gagal saat
 * mengirim gambar via { url: path }, terutama untuk:
 *   - Template buttons (header image)
 *   - Interactive list (catalog image)
 *   - Document thumbnails
 *   - Profile pictures
 *
 * Solusi: Konversi semua gambar ke Buffer sebelum dikirim.
 *
 * Fitur:
 *   - loadFromFile(path)     → Buffer
 *   - loadFromUrl(url)       → Buffer
 *   - resize(buffer, w, h)   → Buffer
 *   - toJpeg(buffer)         → Buffer (fix format)
 *   - generateThumbnail(text, w, h) → Buffer (buat gambar dari teks)
 *   - getDefaultThumbnail()  → Buffer (gambar default bot)
 *   - Caching otomatis untuk gambar yang sering dipakai
 *
 * Usage:
 *   const thumb = require('./lib/thumbnail');
 *
 *   // Load gambar default
 *   const buf = thumb.getDefaultThumbnail();
 *
 *   // Load dari URL (YouTube thumbnail, dll)
 *   const ytThumb = await thumb.loadFromUrl('https://i.ytimg.com/vi/xxx/hqdefault.jpg');
 *
 *   // Kirim gambar yang sudah di-fix formatnya
 *   await sock.sendMessage(jid, { image: buf, caption: '...' });
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');
const chalk = require('chalk');

// ============================================================
//  PATHS & DEFAULTS
// ============================================================

const MEDIA_DIR = path.join(__dirname, '..', 'media');
const DEFAULT_THUMB = path.join(MEDIA_DIR, 'thumbnail.jpg');
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Pastikan folder ada
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ============================================================
//  MEMORY CACHE
// ============================================================

/**
 * Cache sederhana untuk gambar yang sering dipakai.
 * Format: Map<string, { buffer: Buffer, timestamp: number }>
 * TTL: 30 menit
 */
const _cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 menit

function getCache(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        _cache.delete(key);
        return null;
    }
    return entry.buffer;
}

function setCache(key, buffer) {
    _cache.set(key, { buffer, timestamp: Date.now() });
    // Cleanup jika cache terlalu besar (>50MB)
    if (_cache.size > 100) {
        const now = Date.now();
        for (const [k, v] of _cache) {
            if (now - v.timestamp > CACHE_TTL) _cache.delete(k);
        }
    }
}

// Cleanup cache setiap 10 menit
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _cache) {
        if (now - v.timestamp > CACHE_TTL) _cache.delete(k);
    }
}, 10 * 60 * 1000);

// ============================================================
//  CORE: LOAD & CONVERT
// ============================================================

/**
 * Load gambar dari file path, convert ke Buffer.
 * Mengatasi bug Wileys yang gagal baca local file.
 *
 * @param {string} filePath - Path file gambar (absolute/relative)
 * @returns {Promise<Buffer>} Buffer gambar yang sudah di-convert ke JPEG
 *
 * @example
 *   const buf = await loadFromFile('./media/thumbnail.jpg');
 *   await sock.sendMessage(jid, { image: buf, caption: 'Hello!' });
 */
async function loadFromFile(filePath) {
    // Resolve path
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File tidak ditemukan: ${resolvedPath}`);
    }

    // Cek cache
    const cacheKey = `file:${resolvedPath}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    // Baca file dan pastikan format valid
    const inputBuffer = fs.readFileSync(resolvedPath);

    // Gunakan sharp untuk validasi dan convert ke buffer standar
    const outputBuffer = await sharp(inputBuffer)
        .jpeg({ quality: 85 })
        .toBuffer();

    setCache(cacheKey, outputBuffer);
    return outputBuffer;
}

/**
 * Load gambar dari URL, download dan convert ke Buffer.
 * Mengatasi bug Wileys yang gagal load URL gambar tertentu.
 *
 * @param {string} url - URL gambar
 * @param {object} [options]
 * @param {number} [options.timeout=15000] - Timeout download (ms)
 * @param {number} [options.maxSize=5242880] - Maks ukuran file (5MB)
 * @param {boolean} [options.useCache=true] - Gunakan cache
 * @returns {Promise<Buffer>} Buffer gambar JPEG
 *
 * @example
 *   const thumb = await loadFromUrl('https://i.ytimg.com/vi/xxx/hqdefault.jpg');
 */
async function loadFromUrl(url, options = {}) {
    const { timeout = 15000, maxSize = 5 * 1024 * 1024, useCache = true } = options;

    if (!url || typeof url !== 'string') {
        throw new Error('URL gambar tidak valid');
    }

    // Cek cache
    if (useCache) {
        const cached = getCache(`url:${url}`);
        if (cached) return cached;
    }

    // Download gambar
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout,
        maxRedirects: 5,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/*,*/*',
        },
    });

    if (!response.data || response.data.length < 100) {
        throw new Error(`Gagal download gambar dari URL (size: ${response.data?.length || 0} bytes)`);
    }

    if (response.data.length > maxSize) {
        throw new Error(`Ukuran gambar terlalu besar: ${(response.data.length / 1024 / 1024).toFixed(1)}MB (maks ${maxSize / 1024 / 1024}MB)`);
    }

    // Convert ke JPEG buffer via sharp (fix format issues)
    const outputBuffer = await sharp(Buffer.from(response.data))
        .jpeg({ quality: 85 })
        .toBuffer();

    if (useCache) {
        setCache(`url:${url}`, outputBuffer);
    }

    return outputBuffer;
}

/**
 * Load gambar dari path ATAU URL secara otomatis.
 * Jika string dimulai dengan http/https → loadFromUrl,
 * jika tidak → loadFromFile.
 *
 * @param {string|Buffer} source - File path, URL, atau Buffer
 * @param {object} [options] - Opsi untuk loadFromUrl
 * @returns {Promise<Buffer>}
 */
async function load(source, options = {}) {
    // Jika sudah Buffer, langsung convert via sharp
    if (Buffer.isBuffer(source)) {
        return sharp(source).jpeg({ quality: 85 }).toBuffer();
    }

    if (typeof source === 'string') {
        if (source.startsWith('http://') || source.startsWith('https://')) {
            return loadFromUrl(source, options);
        }
        return loadFromFile(source);
    }

    throw new Error('Source harus berupa string (path/url) atau Buffer');
}

// ============================================================
//  RESIZE & TRANSFORM
// ============================================================

/**
 * Resize gambar ke dimensi tertentu.
 * Menggunakan sharp untuk kualitas terbaik.
 *
 * @param {Buffer|string} source - Buffer gambar, path, atau URL
 * @param {number} width - Lebar target
 * @param {number} [height] - Tinggi target (default = width, jadi square)
 * @param {object} [options]
 * @param {string} [options.fit='cover'] - Mode resize: cover, contain, fill, inside, outside
 * @param {string|object} [options.background] - Background color untuk fit='contain'
 * @returns {Promise<Buffer>}
 *
 * @example
 *   // Resize ke 300x300 (square)
 *   const thumb = await resize(imageBuf, 300);
 *
 *   // Resize ke 640x360 (landscape 16:9)
 *   const thumb = await resize(imageBuf, 640, 360);
 *
 *   // Resize dengan background transparan
 *   const thumb = await resize(imageBuf, 512, 512, { fit: 'contain', background: '#000000' });
 */
async function resize(source, width, height, options = {}) {
    const {
        fit = 'cover',
        background = { r: 0, g: 0, b: 0, alpha: 0 },
        format = 'jpeg',
        quality = 85,
    } = options;

    const h = height || width;
    const input = await load(source);

    return sharp(input)
        .resize(width, h, { fit, background })
        [format]({ quality })
        .toBuffer();
}

/**
 * Convert gambar ke format tertentu.
 *
 * @param {Buffer|string} source - Buffer, path, atau URL
 * @param {string} format - 'jpeg', 'png', 'webp'
 * @param {object} [options] - Opsi sharp
 * @returns {Promise<Buffer>}
 */
async function convert(source, format = 'jpeg', options = {}) {
    const input = await load(source);
    return sharp(input)[format](options).toBuffer();
}

/**
 * Ambil metadata gambar (ukuran, format, dll).
 *
 * @param {Buffer|string} source
 * @returns {Promise<{ format, width, height, size, channels }>}
 */
async function getMetadata(source) {
    const input = await load(source);
    const metadata = await sharp(input).metadata();
    return {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        size: metadata.size,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
    };
}

// ============================================================
//  GENERATE: Buat gambar dari teks (SVG)
// ============================================================

/**
 * Generate gambar thumbnail dari teks (SVG).
 * Berguna untuk fallback ketika tidak ada gambar.
 *
 * @param {string} text - Teks yang ditampilkan
 * @param {number} [width=600] - Lebar gambar
 * @param {number} [height=400] - Tinggi gambar
 * @param {object} [options]
 * @param {string} [options.bgColor='#1a1a2e'] - Background color
 * @param {string} [options.textColor='#ffffff'] - Text color
 * @param {number} [options.fontSize=40] - Ukuran font
 * @param {string} [options.subtext] - Sub-teks di bawah
 * @returns {Promise<Buffer>}
 *
 * @example
 *   const buf = await generateThumbnail('Ikuyo Bot', 600, 400);
 */
async function generateThumbnail(text, width = 600, height = 400, options = {}) {
    const {
        bgColor = '#1a1a2e',
        textColor = '#ffffff',
        fontSize = 40,
        subtext,
    } = options;

    // Escape XML special characters
    const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const escapedSub = subtext
        ? subtext.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        : '';

    // Split teks panjang jadi multiple lines
    const maxCharsPerLine = Math.floor(width / (fontSize * 0.55));
    const lines = [];
    let remaining = escapedText;
    while (remaining.length > 0) {
        if (remaining.length <= maxCharsPerLine) {
            lines.push(remaining);
            break;
        }
        // Cari spasi terdekat
        let breakIdx = remaining.lastIndexOf(' ', maxCharsPerLine);
        if (breakIdx === -1) breakIdx = maxCharsPerLine;
        lines.push(remaining.substring(0, breakIdx));
        remaining = remaining.substring(breakIdx).trim();
    }

    const lineHeight = fontSize * 1.4;
    const totalTextHeight = lines.length * lineHeight + (escapedSub ? fontSize + 10 : 0);
    const startY = (height - totalTextHeight) / 2 + fontSize;

    // Build SVG
    let textElements = '';
    lines.forEach((line, i) => {
        const y = startY + (i * lineHeight);
        textElements += `<text x="${width / 2}" y="${y}" text-anchor="middle" fill="${textColor}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold">${line}</text>\n`;
    });

    if (escapedSub) {
        const subY = startY + (lines.length * lineHeight) + 15;
        textElements += `<text x="${width / 2}" y="${subY}" text-anchor="middle" fill="${textColor}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.floor(fontSize * 0.6)}" opacity="0.7">${escapedSub}</text>\n`;
    }

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}" rx="12" ry="12"/>
  ${textElements}
</svg>`;

    return sharp(Buffer.from(svg))
        .jpeg({ quality: 90 })
        .toBuffer();
}

// ============================================================
//  DEFAULT THUMBNAIL
// ============================================================

/** Cached default thumbnail buffer */
let _defaultThumbnailBuffer = null;

/**
 * Ambil gambar thumbnail default bot.
 * Jika file media/thumbnail.jpg ada, pakai itu.
 * Jika tidak ada, generate dari teks nama bot.
 *
 * @returns {Promise<Buffer>}
 */
async function getDefaultThumbnail() {
    // Return cached jika sudah ada
    if (_defaultThumbnailBuffer) return _defaultThumbnailBuffer;

    // Cek apakah file default ada
    if (fs.existsSync(DEFAULT_THUMB)) {
        try {
            _defaultThumbnailBuffer = await loadFromFile(DEFAULT_THUMB);
            return _defaultThumbnailBuffer;
        } catch (err) {
            console.error(chalk.yellow('[THUMB] Gagal load default thumbnail, generating...'), err.message);
        }
    }

    // Generate dari nama bot
    const botName = global.config?.name || 'Ikuyo';
    _defaultThumbnailBuffer = await generateThumbnail(
        `🤖 ${botName}`,
        600,
        400,
        {
            bgColor: '#16213e',
            subtext: 'WhatsApp Bot',
        }
    );

    // Simpan ke file untuk cache permanen
    try {
        fs.writeFileSync(DEFAULT_THUMB, _defaultThumbnailBuffer);
        console.log(chalk.green('[THUMB] Default thumbnail generated & saved'));
    } catch (err) {
        console.error(chalk.yellow('[THUMB] Gagal save default thumbnail:'), err.message);
    }

    return _defaultThumbnailBuffer;
}

/**
 * Pre-load default thumbnail ke cache.
 * Dipanggil saat bot startup.
 */
async function preloadDefaultThumbnail() {
    try {
        await getDefaultThumbnail();
        console.log(chalk.green('[THUMB] Default thumbnail preloaded'));
    } catch (err) {
        console.error(chalk.red('[THUMB] Gagal preload default thumbnail:'), err.message);
    }
}

// ============================================================
//  THUMBNAIL CARDS: Buat gambar card estetik
// ============================================================

/**
 * Generate gambar card untuk menu/list item.
 *
 * @param {object} opts
 * @param {string} opts.title - Judul card
 * @param {string} [opts.subtitle] - Subtitle
 * @param {string} [opts.emoji] - Emoji di atas judul
 * @param {number} [opts.width=640] - Lebar
 * @param {number} [opts.height=360] - Tinggi
 * @param {string} [opts.gradient='linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)']
 * @returns {Promise<Buffer>}
 */
async function generateCard(opts) {
    const {
        title,
        subtitle,
        emoji,
        width = 640,
        height = 360,
    } = opts;

    const text = emoji ? `${emoji}  ${title}` : title;

    return generateThumbnail(text, width, height, {
        bgColor: '#0f3460',
        subtext: subtitle,
        fontSize: 48,
    });
}

/**
 * Generate gambar untuk hasil YouTube search.
 * Download thumbnail video, fallback ke generated card.
 *
 * @param {object} videoObj - Objek video dari yt-search
 * @param {object} [options]
 * @param {number} [options.width=480] - Lebar
 * @param {number} [options.height=360] - Tinggi
 * @returns {Promise<Buffer>}
 */
async function generateYouTubeThumbnail(videoObj, options = {}) {
    const { width = 480, height = 360 } = options;

    // Coba download thumbnail dari YouTube
    const thumbUrl = videoObj?.thumbnail || videoObj?.image;

    if (thumbUrl) {
        try {
            return await resize(thumbUrl, width, height, { fit: 'cover' });
        } catch (err) {
            console.error(chalk.yellow('[THUMB] Gagal load YT thumbnail, generating card:'), err.message);
        }
    }

    // Fallback: generate card dari judul
    return generateThumbnail(
        `🎵 ${videoObj?.title || 'Unknown'}`,
        width,
        height,
        {
            bgColor: '#1a1a2e',
            subtext: videoObj?.author?.name || '',
            fontSize: 32,
        }
    );
}

// ============================================================
//  FIX: Wileys Image Sending Helper
// ============================================================

/**
 * Fix gambar untuk dikirim via Wileys.
 * Wileys punya bug dimana gambar harus dalam format Buffer tertentu.
 * Helper ini memastikan gambar siap dikirim.
 *
 * @param {string|Buffer} image - Path, URL, atau Buffer gambar
 * @param {object} [options]
 * @param {number} [options.maxWidth=1280] - Maks lebar (resize jika lebih besar)
 * @param {number} [options.maxHeight=1280] - Maks tinggi
 * @param {number} [options.quality=85] - Kualitas JPEG
 * @returns {Promise<Buffer>} Buffer yang siap dikirim
 *
 * @example
 *   // Fix gambar sebelum kirim
 *   const fixed = await fixImage('./gambar.jpg');
 *   await sock.sendMessage(jid, { image: fixed, caption: 'Hello!' });
 *
 *   // Fix gambar dari URL
 *   const fixed = await fixImage('https://example.com/pic.jpg');
 *   await sock.sendMessage(jid, { image: fixed });
 */
async function fixImage(image, options = {}) {
    const {
        maxWidth = 1280,
        maxHeight = 1280,
        quality = 85,
    } = options;

    // Jika sudah Buffer, langsung proses
    if (Buffer.isBuffer(image)) {
        return sharp(image)
            .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality })
            .toBuffer();
    }

    // Jika string, load dulu
    const buf = await load(image);
    return sharp(buf)
        .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
}

/**
 * Kirim gambar yang sudah di-fix formatnya via Wileys socket.
 * Wrapper aman yang otomatis fix gambar sebelum kirim.
 *
 * @param {object} sock - Baileys socket
 * @param {string} jid - Chat JID
 * @param {string|Buffer} image - Gambar (path, URL, Buffer)
 * @param {object} [options]
 * @param {string} [options.caption] - Caption gambar
 * @param {string} [options.mimetype='image/jpeg'] - MIME type
 * @param {object} [options.quoted] - Message key untuk quote
 * @param {number} [options.maxWidth=1280] - Resize maks lebar
 * @param {number} [options.maxHeight=1280] - Resize maks tinggi
 * @returns {Promise<object>}
 *
 * @example
 *   // Kirim gambar dari file
 *   await sendImage(sock, jid, './media/thumbnail.jpg', {
 *       caption: 'Ini gambar bot',
 *       quoted: msg.key,
 *   });
 *
 *   // Kirim gambar dari URL
 *   await sendImage(sock, jid, 'https://i.ytimg.com/vi/xxx/hqdefault.jpg', {
 *       caption: 'YouTube Thumbnail',
 *   });
 */
async function sendImage(sock, jid, image, options = {}) {
    const {
        caption = '',
        mimetype = 'image/jpeg',
        quoted,
        maxWidth = 1280,
        maxHeight = 1280,
    } = options;

    const sendOpts = {};
    if (quoted) sendOpts.quoted = quoted;

    try {
        const fixedBuffer = await fixImage(image, { maxWidth, maxHeight });

        return await sock.sendMessage(jid, {
            image: fixedBuffer,
            caption,
            mimetype,
        }, sendOpts);
    } catch (err) {
        console.error(chalk.red('[THUMB] Gagal mengirim gambar:'), err.message);
        throw err;
    }
}

// ============================================================
//  EXPORTS
// ============================================================

module.exports = {
    // Core load
    loadFromFile,
    loadFromUrl,
    load,
    fixImage,

    // Transform
    resize,
    convert,
    getMetadata,

    // Generate
    generateThumbnail,
    generateCard,
    generateYouTubeThumbnail,

    // Default
    getDefaultThumbnail,
    preloadDefaultThumbnail,

    // Send helper
    sendImage,

    // Constants
    MEDIA_DIR,
    DEFAULT_THUMB,
};
