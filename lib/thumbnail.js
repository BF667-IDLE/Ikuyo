/**
 * ═══════════════════════════════════════════════════════
 *  Thumbnail & Image Helper (Android Compatible)
 *  For Ikuyo WhatsApp Bot
 * ═══════════════════════════════════════════════════════
 *
 * Helper utility untuk load & convert gambar.
 * Tidak menggunakan native module (sharp/jimp) agar
 * kompatibel dengan Android ARM64.
 *
 * Menggunakan:
 *   - axios untuk download gambar
 *   - ffmpeg (fluent-ffmpeg) untuk resize & convert
 *   - Raw buffer pass-through untuk kasus sederhana
 *
 * Fitur:
 *   - loadFromFile(path)     → Buffer
 *   - loadFromUrl(url)       → Buffer
 *   - resize(buffer, w, h)   → Buffer
 *   - generateThumbnail(text, w, h) → Buffer
 *   - getDefaultThumbnail()  → Buffer
 *   - Caching otomatis
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
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
//  HELPER: ffmpeg promises
// ============================================================

function tempFile(ext) {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    return path.join(TEMP_DIR, `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

function cleanupTemp(...filePaths) {
    for (const fp of filePaths) {
        try {
            if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch {}
    }
}

/**
 * Resize/convert image buffer via ffmpeg
 * @param {Buffer} inputBuffer
 * @param {number} width
 * @param {number} height
 * @param {object} [opts]
 * @returns {Promise<Buffer>}
 */
async function ffmpegProcessImage(inputBuffer, width, height, opts = {}) {
    const { quality = 85, format = 'jpeg' } = opts;
    const inputPath = tempFile('bin');
    const outputPath = tempFile(format === 'png' ? 'png' : 'jpg');

    try {
        fs.writeFileSync(inputPath, inputBuffer);

        await new Promise((resolve, reject) => {
            const cmd = ffmpeg(inputPath)
                .inputOptions(['-y'])
                .complexFilter([
                    `scale=${width}:${height}:flags=lanczos:force_original_aspect_ratio=decrease`,
                    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
                ])
                .outputOptions([
                    '-q:v', String(Math.round((100 - quality) / 100 * 31)), // map quality to ffmpeg scale
                ]);

            if (format === 'png') {
                cmd.outputFormat('png');
            } else {
                cmd.outputFormat('mjpeg');
            }

            cmd.output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        return fs.readFileSync(outputPath);
    } finally {
        cleanupTemp(inputPath, outputPath);
    }
}

/**
 * Resize with fit=contain (no padding, just fit within bounds)
 */
async function ffmpegFitImage(inputBuffer, maxWidth, maxHeight, opts = {}) {
    const { quality = 85 } = opts;
    const inputPath = tempFile('bin');
    const outputPath = tempFile('jpg');

    try {
        fs.writeFileSync(inputPath, inputBuffer);

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .inputOptions(['-y'])
                .complexFilter([
                    `scale=${maxWidth}:${maxHeight}:flags=lanczos:force_original_aspect_ratio=decrease`,
                ])
                .outputOptions(['-q:v', String(Math.round((100 - quality) / 100 * 31))])
                .outputFormat('mjpeg')
                .output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        return fs.readFileSync(outputPath);
    } finally {
        cleanupTemp(inputPath, outputPath);
    }
}

// ============================================================
//  CORE: LOAD & CONVERT
// ============================================================

/**
 * Load gambar dari file path, return Buffer.
 */
async function loadFromFile(filePath) {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File tidak ditemukan: ${resolvedPath}`);
    }

    const cacheKey = `file:${resolvedPath}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const buffer = fs.readFileSync(resolvedPath);
    setCache(cacheKey, buffer);
    return buffer;
}

/**
 * Load gambar dari URL, download dan return Buffer.
 */
async function loadFromUrl(url, options = {}) {
    const { timeout = 15000, maxSize = 5 * 1024 * 1024, useCache = true } = options;

    if (!url || typeof url !== 'string') {
        throw new Error('URL gambar tidak valid');
    }

    if (useCache) {
        const cached = getCache(`url:${url}`);
        if (cached) return cached;
    }

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout,
        maxRedirects: 5,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/*,*/*',
        },
    });

    if (!response.data || response.data.length < 100) {
        throw new Error(`Gagal download gambar dari URL (size: ${response.data?.length || 0} bytes)`);
    }

    if (response.data.length > maxSize) {
        throw new Error(`Ukuran gambar terlalu besar: ${(response.data.length / 1024 / 1024).toFixed(1)}MB`);
    }

    const buffer = Buffer.from(response.data);

    if (useCache) {
        setCache(`url:${url}`, buffer);
    }

    return buffer;
}

/**
 * Load gambar dari path ATAU URL secara otomatis.
 * @param {string|Buffer} source
 * @returns {Promise<Buffer>}
 */
async function load(source, options = {}) {
    if (Buffer.isBuffer(source)) return source;

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
 * Resize gambar ke dimensi tertentu via ffmpeg.
 * @param {Buffer|string} source
 * @param {number} width
 * @param {number} [height]
 * @param {object} [options]
 * @returns {Promise<Buffer>}
 */
async function resize(source, width, height, options = {}) {
    const { fit = 'cover', quality = 85 } = options;
    const h = height || width;
    const input = await load(source);

    if (fit === 'contain' || fit === 'inside') {
        return ffmpegFitImage(input, width, h, { quality });
    }

    // cover / fill
    return ffmpegProcessImage(input, width, h, { quality });
}

/**
 * Convert gambar ke format tertentu via ffmpeg.
 */
async function convert(source, format = 'jpeg', options = {}) {
    const { quality = 85 } = options;
    const input = await load(source);
    return ffmpegFitImage(input, 1280, 1280, { quality, format });
}

/**
 * Ambil metadata gambar (sederhana, via ffmpeg).
 */
async function getMetadata(source) {
    const input = await load(source);
    const inputPath = tempFile('bin');

    try {
        fs.writeFileSync(inputPath, input);

        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(inputPath, (err, metadata) => {
                cleanupTemp(inputPath);
                if (err) {
                    resolve({ width: 0, height: 0 });
                    return;
                }
                const stream = metadata?.streams?.[0] || {};
                resolve({
                    width: stream.width || 0,
                    height: stream.height || 0,
                });
            });
        });
    } catch {
        cleanupTemp(inputPath);
        return { width: 0, height: 0 };
    }
}

// ============================================================
//  GENERATE: Buat gambar dari teks (ffmpeg)
// ============================================================

/**
 * Generate gambar thumbnail dari teks menggunakan ffmpeg drawtext.
 */
async function generateThumbnail(text, width = 600, height = 400, options = {}) {
    const {
        bgColor = '#1a1a2e',
        textColor = '#ffffff',
        subtext,
    } = options;

    const outputPath = tempFile('jpg');

    try {
        // Escape special characters for ffmpeg drawtext
        const safeText = text
            .replace(/'/g, "\\'")
            .replace(/:/g, '\\:')
            .replace(/%/g, '%%');

        let filterComplex = `color=c=${bgColor}:s=${width}x${height},drawtext=text='${safeText}':fontsize=36:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2`;

        if (subtext) {
            const safeSub = subtext
                .replace(/'/g, "\\'")
                .replace(/:/g, '\\:')
                .replace(/%/g, '%%');
            filterComplex += `,drawtext=text='${safeSub}':fontsize=20:fontcolor=${textColor}@0.7:x=(w-text_w)/2:y=h-text_h-30`;
        }

        await new Promise((resolve, reject) => {
            ffmpeg()
                .inputOptions(['-f', 'lavfi', '-i', `color=c=${bgColor}:s=${width}x${height}:d=0.1`])
                .complexFilter([filterComplex])
                .outputOptions(['-frames:v', '1', '-y', '-q:v', '5'])
                .outputFormat('mjpeg')
                .output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        return fs.readFileSync(outputPath);
    } catch (err) {
        console.error(chalk.yellow('[THUMB] generateThumbnail ffmpeg error:'), err.message);
        // Fallback: create a simple solid color JPEG using raw bytes
        // Minimal valid JPEG (1x1 pixel, will be stretched)
        return Buffer.from(
            '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
            'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
            'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
            'AhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQE' +
            'AAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=',
            'base64'
        );
    } finally {
        cleanupTemp(outputPath);
    }
}

// ============================================================
//  DEFAULT THUMBNAIL
// ============================================================

let _defaultThumbnailBuffer = null;

async function getDefaultThumbnail() {
    if (_defaultThumbnailBuffer) return _defaultThumbnailBuffer;

    if (fs.existsSync(DEFAULT_THUMB)) {
        try {
            _defaultThumbnailBuffer = fs.readFileSync(DEFAULT_THUMB);
            return _defaultThumbnailBuffer;
        } catch (err) {
            console.error(chalk.yellow('[THUMB] Gagal load default thumbnail, generating...'), err.message);
        }
    }

    const botName = global.config?.name || 'Ikuyo';
    _defaultThumbnailBuffer = await generateThumbnail(
        `IKUYO BOT`,
        600,
        400,
        {
            bgColor: '#16213e',
            subtext: 'WhatsApp Bot',
        }
    );

    try {
        fs.writeFileSync(DEFAULT_THUMB, _defaultThumbnailBuffer);
        console.log(chalk.green('[THUMB] Default thumbnail generated & saved'));
    } catch (err) {
        console.error(chalk.yellow('[THUMB] Gagal save default thumbnail:'), err.message);
    }

    return _defaultThumbnailBuffer;
}

async function preloadDefaultThumbnail() {
    try {
        await getDefaultThumbnail();
        console.log(chalk.green('[THUMB] Default thumbnail preloaded'));
    } catch (err) {
        console.error(chalk.red('[THUMB] Gagal preload default thumbnail:'), err.message);
    }
}

// ============================================================
//  THUMBNAIL CARDS
// ============================================================

async function generateCard(opts) {
    const { title, subtitle, emoji, width = 640, height = 360 } = opts;
    const text = emoji ? `${emoji}  ${title}` : title;

    return generateThumbnail(text, width, height, {
        bgColor: '#0f3460',
        subtext: subtitle,
    });
}

async function generateYouTubeThumbnail(videoObj, options = {}) {
    const { width = 480, height = 360 } = options;
    const thumbUrl = videoObj?.thumbnail || videoObj?.image;

    if (thumbUrl) {
        try {
            return await resize(thumbUrl, width, height, { fit: 'cover' });
        } catch (err) {
            console.error(chalk.yellow('[THUMB] Gagal load YT thumbnail, generating card:'), err.message);
        }
    }

    return generateThumbnail(
        `Music`,
        width,
        height,
        {
            bgColor: '#1a1a2e',
            subtext: videoObj?.author?.name || '',
        }
    );
}

// ============================================================
//  FIX: Baileys Image Sending Helper
// ============================================================

/**
 * Fix gambar untuk dikirim via Baileys.
 * Resize jika terlalu besar, return JPEG buffer.
 */
async function fixImage(image, options = {}) {
    const { maxWidth = 1280, maxHeight = 1280, quality = 85 } = options;

    let buffer;
    if (Buffer.isBuffer(image)) {
        buffer = image;
    } else {
        buffer = await load(image);
    }

    // Resize jika terlalu besar
    try {
        buffer = await ffmpegFitImage(buffer, maxWidth, maxHeight, { quality });
    } catch {
        // Jika ffmpeg gagal, return raw buffer
    }

    return buffer;
}

async function sendImage(sock, jid, image, options = {}) {
    const { caption = '', mimetype = 'image/jpeg', quoted, maxWidth = 1280, maxHeight = 1280 } = options;

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
    loadFromFile,
    loadFromUrl,
    load,
    fixImage,
    resize,
    convert,
    getMetadata,
    generateThumbnail,
    generateCard,
    generateYouTubeThumbnail,
    getDefaultThumbnail,
    preloadDefaultThumbnail,
    sendImage,
    MEDIA_DIR,
    DEFAULT_THUMB,
};
