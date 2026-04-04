/**
 * ═══════════════════════════════════════════════════════
 *  Thumbnail & Image Helper
 *  For Ikuyo WhatsApp Bot
 * ═══════════════════════════════════════════════════════
 *
 * Helper utility untuk mengatasi bug Baileys
 * dalam load gambar. Library Baileys sering gagal saat
 * mengirim gambar via { url: path }, terutama untuk:
 *   - Template buttons (header image)
 *   - Interactive list (catalog image)
 *   - Document thumbnails
 *   - Profile pictures
 *
 * Solusi: Konversi semua gambar ke Buffer sebelum dikirim.
 * Menggunakan JIMP (pure JS) untuk kompatibilitas Android.
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
const Jimp = require('jimp');
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
    // Cleanup jika cache terlalu besar
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
//  HELPER: Buffer to JPEG via JIMP
// ============================================================

/**
 * Convert buffer gambar apapun ke JPEG buffer menggunakan JIMP
 * @param {Buffer} inputBuffer - Input gambar (JPEG, PNG, WebP, dll)
 * @param {object} [opts]
 * @param {number} [opts.quality=85] - JPEG quality (0-100)
 * @returns {Promise<Buffer>}
 */
async function toJpegBuffer(inputBuffer, opts = {}) {
    const { quality = 85 } = opts;
    const image = await Jimp.read(inputBuffer);
    image.quality(quality);
    return image.getBufferAsync(Jimp.MIME_JPEG);
}

// ============================================================
//  CORE: LOAD & CONVERT
// ============================================================

/**
 * Load gambar dari file path, convert ke Buffer.
 * Mengatasi bug Baileys yang gagal baca local file.
 *
 * @param {string} filePath - Path file gambar (absolute/relative)
 * @returns {Promise<Buffer>} Buffer gambar yang sudah di-convert ke JPEG
 */
async function loadFromFile(filePath) {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File tidak ditemukan: ${resolvedPath}`);
    }

    // Cek cache
    const cacheKey = `file:${resolvedPath}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    // Baca file dan convert ke JPEG buffer via JIMP
    const inputBuffer = fs.readFileSync(resolvedPath);
    const outputBuffer = await toJpegBuffer(inputBuffer, { quality: 85 });

    setCache(cacheKey, outputBuffer);
    return outputBuffer;
}

/**
 * Load gambar dari URL, download dan convert ke Buffer.
 * Mengatasi bug Baileys yang gagal load URL gambar tertentu.
 *
 * @param {string} url - URL gambar
 * @param {object} [options]
 * @param {number} [options.timeout=15000] - Timeout download (ms)
 * @param {number} [options.maxSize=5242880] - Maks ukuran file (5MB)
 * @param {boolean} [options.useCache=true] - Gunakan cache
 * @returns {Promise<Buffer>} Buffer gambar JPEG
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

    // Convert ke JPEG buffer via JIMP
    const outputBuffer = await toJpegBuffer(Buffer.from(response.data), { quality: 85 });

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
    // Jika sudah Buffer, langsung convert via JIMP
    if (Buffer.isBuffer(source)) {
        return toJpegBuffer(source, { quality: 85 });
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
 * Menggunakan JIMP untuk kompatibilitas cross-platform (termasuk Android).
 *
 * @param {Buffer|string} source - Buffer gambar, path, atau URL
 * @param {number} width - Lebar target
 * @param {number} [height] - Tinggi target (default = width, jadi square)
 * @param {object} [options]
 * @param {string} [options.fit='cover'] - Mode resize: cover, contain, fill, inside
 * @returns {Promise<Buffer>}
 */
async function resize(source, width, height, options = {}) {
    const { fit = 'cover', quality = 85 } = options;
    const h = height || width;
    const input = await load(source);
    const image = await Jimp.read(input);

    switch (fit) {
        case 'contain':
            // Fit within bounds, keep aspect ratio
            image.scaleToFit(width, h);
            break;
        case 'cover':
            // Cover entire area, crop overflow
            const ratio = Math.max(width / image.bitmap.width, h / image.bitmap.height);
            image.resize(Math.round(image.bitmap.width * ratio), Math.round(image.bitmap.height * ratio));
            // Crop to exact size from center
            const cropX = Math.round((image.bitmap.width - width) / 2);
            const cropY = Math.round((image.bitmap.height - h) / 2);
            image.crop(cropX, cropY, width, h);
            break;
        case 'inside':
            // Shrink only if larger than target
            if (image.bitmap.width > width || image.bitmap.height > h) {
                image.scaleToFit(width, h);
            }
            break;
        default:
            // fill / default: stretch to exact size
            image.resize(width, h);
            break;
    }

    image.quality(quality);
    return image.getBufferAsync(Jimp.MIME_JPEG);
}

/**
 * Convert gambar ke format tertentu.
 *
 * @param {Buffer|string} source - Buffer, path, atau URL
 * @param {string} format - 'jpeg', 'png'
 * @param {object} [options] - { quality: 85 }
 * @returns {Promise<Buffer>}
 */
async function convert(source, format = 'jpeg', options = {}) {
    const { quality = 85 } = options;
    const input = await load(source);
    const image = await Jimp.read(input);

    const mime = format === 'png' ? Jimp.MIME_PNG : Jimp.MIME_JPEG;
    if (format !== 'png') {
        image.quality(quality);
    }

    return image.getBufferAsync(mime);
}

/**
 * Ambil metadata gambar (ukuran, format, dll).
 *
 * @param {Buffer|string} source
 * @returns {Promise<{ width, height }>}
 */
async function getMetadata(source) {
    const input = await load(source);
    const image = await Jimp.read(input);
    return {
        width: image.bitmap.width,
        height: image.bitmap.height,
    };
}

// ============================================================
//  GENERATE: Buat gambar dari teks (JIMP Canvas)
// ============================================================

/**
 * Parse hex color ke RGB components.
 * @param {string} hex - Color hex (#RRGGBB)
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return {
        r: parseInt(clean.substring(0, 2), 16),
        g: parseInt(clean.substring(2, 4), 16),
        b: parseInt(clean.substring(4, 6), 16),
    };
}

/**
 * Generate gambar thumbnail dari teks menggunakan JIMP canvas.
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
 */
async function generateThumbnail(text, width = 600, height = 400, options = {}) {
    const {
        bgColor = '#1a1a2e',
        textColor = '#ffffff',
        fontSize = 40,
        subtext,
    } = options;

    // Create image with background
    const bgRgb = hexToRgb(bgColor);
    const image = new Jimp(width, height, Jimp.rgbaToInt(bgRgb.r, bgRgb.g, bgRgb.b, 255));

    // Use Jimp's built-in font (scaled to approximate fontSize)
    // Jimp fonts available: 8x8 (SANS), 16px (SANS16) or load from file
    // We'll use SANS_16 and scale the image as a workaround,
    // or use Jimp.loadFont for better control

    let font;
    try {
        // Try loading bundled bitmap font scaled to our needs
        font = Jimp.FONT_SANS_32_BLACK; // 32px built-in font
    } catch {
        font = Jimp.FONT_SANS_16_BLACK; // 16px fallback
    }

    // Split teks panjang jadi multiple lines
    const fontHeight = font === Jimp.FONT_SANS_32_BLACK ? 32 : 16;
    const maxCharsPerLine = Math.floor((width - 40) / (fontHeight * 0.5));
    const lines = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxCharsPerLine) {
            lines.push(remaining);
            break;
        }
        let breakIdx = remaining.lastIndexOf(' ', maxCharsPerLine);
        if (breakIdx === -1) breakIdx = maxCharsPerLine;
        lines.push(remaining.substring(0, breakIdx));
        remaining = remaining.substring(breakIdx).trim();
    }

    const lineHeight = fontHeight + 8;
    const totalTextHeight = lines.length * lineHeight + (subtext ? fontHeight + 15 : 0);
    let startY = Math.floor((height - totalTextHeight) / 2);

    // Calculate hex to int for text color
    const textRgb = hexToRgb(textColor);
    const textColorInt = Jimp.rgbaToInt(textRgb.r, textRgb.g, textRgb.b, 255);

    // If we have the 32px font, use it directly
    // Otherwise, scale approach: create a larger canvas and scale down
    if (fontSize >= 24 && font === Jimp.FONT_SANS_32_BLACK) {
        // Draw text lines
        for (let i = 0; i < lines.length; i++) {
            const y = startY + (i * lineHeight);
            const textWidth = font === Jimp.FONT_SANS_32_BLACK
                ? lines[i].length * 16 // approximate width for 32px font
                : lines[i].length * 8;
            const x = Math.floor((width - textWidth) / 2);
            image.print(font, Math.max(x, 10), y, lines[i], width - 20);
        }

        // Draw subtext
        if (subtext) {
            const subY = startY + (lines.length * lineHeight) + 10;
            try {
                const subFont = Jimp.FONT_SANS_16_BLACK;
                const subWidth = subtext.length * 8;
                const subX = Math.floor((width - subWidth) / 2);
                image.print(subFont, Math.max(subX, 10), subY, subtext, width - 20);
            } catch {
                // Skip subtext if font not available
            }
        }
    } else {
        // Fallback: use smaller font
        try {
            const smallFont = Jimp.FONT_SANS_16_BLACK;
            const smallLineHeight = 24;
            const smallMaxChars = Math.floor((width - 40) / 8);
            const smallLines = [];
            let rem = text;
            while (rem.length > 0) {
                if (rem.length <= smallMaxChars) {
                    smallLines.push(rem);
                    break;
                }
                let bi = rem.lastIndexOf(' ', smallMaxChars);
                if (bi === -1) bi = smallMaxChars;
                smallLines.push(rem.substring(0, bi));
                rem = rem.substring(bi).trim();
            }
            const totalH = smallLines.length * smallLineHeight + (subtext ? 24 : 0);
            let sY = Math.floor((height - totalH) / 2);
            for (let i = 0; i < smallLines.length; i++) {
                const tw = smallLines[i].length * 8;
                const tx = Math.floor((width - tw) / 2);
                image.print(smallFont, Math.max(tx, 10), sY + (i * smallLineHeight), smallLines[i], width - 20);
            }
            if (subtext) {
                const subW = subtext.length * 8;
                const subX = Math.floor((width - subW) / 2);
                image.print(smallFont, Math.max(subX, 10), sY + (smallLines.length * smallLineHeight), subtext, width - 20);
            }
        } catch {
            // If all font loading fails, just return the solid color image
        }
    }

    image.quality(90);
    return image.getBufferAsync(Jimp.MIME_JPEG);
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
//  FIX: Baileys Image Sending Helper
// ============================================================

/**
 * Fix gambar untuk dikirim via Baileys.
 * Baileys memerlukan gambar dalam format Buffer tertentu.
 * Helper ini memastikan gambar siap dikirim.
 *
 * @param {string|Buffer} image - Path, URL, atau Buffer gambar
 * @param {object} [options]
 * @param {number} [options.maxWidth=1280] - Maks lebar (resize jika lebih besar)
 * @param {number} [options.maxHeight=1280] - Maks tinggi
 * @param {number} [options.quality=85] - Kualitas JPEG
 * @returns {Promise<Buffer>} Buffer yang siap dikirim
 */
async function fixImage(image, options = {}) {
    const {
        maxWidth = 1280,
        maxHeight = 1280,
        quality = 85,
    } = options;

    // Jika sudah Buffer, langsung proses
    if (Buffer.isBuffer(image)) {
        const img = await Jimp.read(image);
        // Only resize if larger than max dimensions
        if (img.bitmap.width > maxWidth || img.bitmap.height > maxHeight) {
            img.scaleToFit(maxWidth, maxHeight);
        }
        img.quality(quality);
        return img.getBufferAsync(Jimp.MIME_JPEG);
    }

    // Jika string, load dulu
    const buf = await load(image);
    const img = await Jimp.read(buf);
    if (img.bitmap.width > maxWidth || img.bitmap.height > maxHeight) {
        img.scaleToFit(maxWidth, maxHeight);
    }
    img.quality(quality);
    return img.getBufferAsync(Jimp.MIME_JPEG);
}

/**
 * Kirim gambar yang sudah di-fix formatnya via Baileys socket.
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
