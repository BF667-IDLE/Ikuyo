/**
 * Text Utilities Plugin for Ikuyo Bot
 * 
 * Provides text manipulation, styling, encoding, hashing,
 * QR generation, and image/sticker creation commands.
 */

import axios from 'axios';
import crypto from 'crypto';

// ============================================
//  UNICODE FONT MAPPING ENGINE
// ============================================

/**
 * Double-struck uppercase codepoints (non-contiguous due to legacy Letterlike Symbols).
 * Index 0 = 'A', Index 25 = 'Z'.
 * Letters C, H, N, P, Q, R, Z live in the Letterlike Symbols block (U+2000–U+2BFF).
 */
const DOUBLE_STRUCK_UPPER = [
    0x1D538, 0x1D539, 0x2102, 0x1D53B, 0x1D53C, 0x1D53D, 0x1D53E, 0x210D, // A-H
    0x1D540, 0x1D541, 0x1D542, 0x1D543, 0x1D544, 0x2115, 0x1D546, 0x2119, // I-P
    0x211A, 0x211D, 0x1D54A, 0x1D54B, 0x1D54C, 0x1D54D, 0x1D54E, 0x1D54F, // Q-X
    0x1D550, 0x2124  // Y-Z
];

/**
 * Create a character mapper function for a Unicode mathematical font style.
 *
 * @param {number|null} lowerBase - Base codepoint for a-z (26 contiguous codepoints)
 * @param {number|null} upperBase - Base codepoint for A-Z (26 contiguous codepoints)
 * @param {number|null} digitBase - Base codepoint for 0-9 (10 contiguous codepoints)
 * @param {number[]|null} upperMap - Explicit codepoint array for A-Z (overrides upperBase)
 * @returns {(char: string) => string}
 */
function createMapper(lowerBase = null, upperBase = null, digitBase = null, upperMap = null) {
    return (char) => {
        const code = char.charCodeAt(0);

        if (lowerBase && code >= 97 && code <= 122) {
            return String.fromCodePoint(lowerBase + (code - 97));
        }

        if (code >= 65 && code <= 90) {
            if (upperMap) return String.fromCodePoint(upperMap[code - 65]);
            if (upperBase) return String.fromCodePoint(upperBase + (code - 65));
        }

        if (digitBase && code >= 48 && code <= 57) {
            return String.fromCodePoint(digitBase + (code - 48));
        }

        return char;
    };
}

/**
 * Apply a mapper function to every code-point in the string.
 * Uses spread to correctly handle surrogate pairs.
 */
function transform(text, mapper) {
    return [...text].map(mapper).join('');
}

// ============================================
//  FONT STYLE DEFINITIONS
// ============================================

const FONT_STYLES = [
    {
        label: 'Fancy (Double-Struck)',
        mapper: createMapper(0x1D552, null, 0x1D7D8, DOUBLE_STRUCK_UPPER),
    },
    {
        label: 'Alchemical (Script)',
        mapper: createMapper(0x1D4B6, 0x1D49C),
    },
    {
        label: 'Bold Fraktur',
        mapper: createMapper(0x1D586, 0x1D56C),
    },
    {
        label: 'Monospace',
        mapper: createMapper(0x1D68A, 0x1D670, 0x1D7F6),
    },
    {
        label: 'Bold Script',
        mapper: createMapper(0x1D4EA, 0x1D4D0),
    },
    {
        label: 'Gothic (Sans Bold)',
        mapper: createMapper(0x1D5EE, 0x1D5D4),
    },
    {
        label: 'Bubble (Circled)',
        // Filled circles (ⓐ-ⓩ) for both cases
        mapper: createMapper(0x24D0, 0x24D0),
    },
    {
        label: 'Squares',
        // Squared Latin Capital Letters only exist as uppercase; reuse for lowercase too
        mapper: createMapper(0x1F130, 0x1F130),
    },
];

// ============================================
//  UTILITY HELPERS
// ============================================

/** Validate whether a string looks like proper Base64. */
function isValidBase64(str) {
    if (!str || str.trim().length === 0) return false;
    const cleaned = str.replace(/\s/g, '');
    if (cleaned.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/]+={0,2}$/.test(cleaned);
}

/** Download a URL as a Buffer with a timeout. */
async function downloadBuffer(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15_000 });
    return Buffer.from(res.data);
}

// ============================================
//  COMMAND HANDLERS
// ============================================

const handlers = {

    // ── 1. /style ────────────────────────────
    style: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}style <teks>\n\n` +
                `Contoh: ${prefix}style halo dunia\n\n` +
                `Maksimal 1000 karakter.`
            );
        }

        if (fullArgs.length > 1000) {
            return m.reply('❌ Teks terlalu panjang! Maksimal 1000 karakter.');
        }

        let result = `✨ *Teks Style Generator*\n`;
        result += `📝 Original: ${fullArgs}\n`;
        result += `━━━━━━━━━━━━━━━━━━\n\n`;

        FONT_STYLES.forEach((style, i) => {
            const styled = transform(fullArgs, style.mapper);
            result += `${i + 1}. *${style.label}:*\n${styled}\n\n`;
        });

        result += `💡 Salin teks yang kamu suka!`;

        await m.reply(result);
    },

    // ── 2. /uppercase ────────────────────────
    uppercase: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}uppercase <teks>\n\n` +
                `Contoh: ${prefix}uppercase halo dunia`
            );
        }

        await m.reply(`🔠 *UPPERCASE:*\n\n${fullArgs.toUpperCase()}`);
    },

    // ── 3. /lowercase ────────────────────────
    lowercase: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}lowercase <teks>\n\n` +
                `Contoh: ${prefix}lowercase HALO DUNIA`
            );
        }

        await m.reply(`🔡 *lowercase:*\n\n${fullArgs.toLowerCase()}`);
    },

    // ── 4. /reverse ──────────────────────────
    reverse: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}reverse <teks>\n\n` +
                `Contoh: ${prefix}reverse halo dunia`
            );
        }

        const reversed = [...fullArgs].reverse().join('');
        await m.reply(`🔄 *Reverse:*\n\n${reversed}`);
    },

    // ── 5. /repeat ───────────────────────────
    repeat: async (m, sock, { args, prefix }) => {
        if (args.length < 2) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}repeat <teks> <jumlah>\n\n` +
                `Contoh: ${prefix}repeat halo 5\n\n` +
                `Maksimal pengulangan: 50x`
            );
        }

        const count = parseInt(args[args.length - 1], 10);
        if (isNaN(count) || count < 1) {
            return m.reply('❌ Jumlah pengulangan harus berupa angka positif!');
        }
        if (count > 50) {
            return m.reply('❌ Maksimal pengulangan adalah 50 kali!');
        }

        const text = args.slice(0, -1).join(' ');
        const result = text.repeat(count);

        if (result.length > 10_000) {
            return m.reply('❌ Hasil terlalu panjang! Kurangi jumlah pengulangan atau panjang teks.');
        }

        await m.reply(`🔁 *Repeat (${count}x):*\n\n${result}`);
    },

    // ── 6. /count ────────────────────────────
    count: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}count <teks>\n\n` +
                `Contoh: ${prefix}count halo dunia`
            );
        }

        const chars = [...fullArgs].length;
        const charsNoSpace = [...fullArgs].filter((c) => c !== ' ' && c !== '\n').length;
        const words = fullArgs.trim().split(/\s+/).filter(Boolean).length;
        const lines = fullArgs.split('\n').length;

        let result = `📊 *Hasil Penghitungan*\n`;
        result += `━━━━━━━━━━━━━━━━━━\n`;
        result += `📝 Total Karakter: *${chars}*\n`;
        result += `🔤 Tanpa Spasi: *${charsNoSpace}*\n`;
        result += `📄 Jumlah Kata: *${words}*\n`;
        result += `📃 Jumlah Baris: *${lines}*\n`;
        result += `━━━━━━━━━━━━━━━━━━\n`;
        result += `💬 Teks: ${fullArgs.length > 500 ? fullArgs.slice(0, 500) + '…' : fullArgs}`;

        await m.reply(result);
    },

    // ── 7. /hash ─────────────────────────────
    hash: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}hash <teks>\n\n` +
                `Contoh: ${prefix}hash halo dunia`
            );
        }

        const md5    = crypto.createHash('md5').update(fullArgs).digest('hex');
        const sha1   = crypto.createHash('sha1').update(fullArgs).digest('hex');
        const sha256 = crypto.createHash('sha256').update(fullArgs).digest('hex');
        const sha512 = crypto.createHash('sha512').update(fullArgs).digest('hex');

        let result = `🔐 *Hash Generator*\n`;
        result += `━━━━━━━━━━━━━━━━━━\n\n`;
        result += `📝 *MD5:*\n\`${md5}\`\n\n`;
        result += `📝 *SHA-1:*\n\`${sha1}\`\n\n`;
        result += `📝 *SHA-256:*\n\`${sha256}\`\n\n`;
        result += `📝 *SHA-512:*\n\`${sha512}\`\n\n`;
        result += `💬 Original: ${fullArgs.length > 200 ? fullArgs.slice(0, 200) + '…' : fullArgs}`;

        await m.reply(result);
    },

    // ── 8. /encode ───────────────────────────
    encode: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}encode <teks>\n\n` +
                `Contoh: ${prefix}encode halo dunia`
            );
        }

        const encoded = Buffer.from(fullArgs, 'utf-8').toString('base64');

        let result = `📦 *Base64 Encode*\n`;
        result += `━━━━━━━━━━━━━━━━━━\n\n`;
        result += `💬 Original: ${fullArgs.length > 500 ? fullArgs.slice(0, 500) + '…' : fullArgs}\n\n`;
        result += `🔐 Encoded:\n\`${encoded}\``;

        await m.reply(result);
    },

    // ── 9. /decode ───────────────────────────
    decode: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}decode <base64>\n\n` +
                `Contoh: ${prefix}decode aGFsbyBkdW5pYQ==`
            );
        }

        if (!isValidBase64(fullArgs)) {
            return m.reply('❌ Input bukan Base64 yang valid!\nPastikan hanya berisi karakter A-Z, a-z, 0-9, +, / dan =');
        }

        try {
            const decoded = Buffer.from(fullArgs, 'base64').toString('utf-8');

            let result = `📦 *Base64 Decode*\n`;
            result += `━━━━━━━━━━━━━━━━━━\n\n`;
            result += `🔐 Encoded: ${fullArgs.length > 500 ? fullArgs.slice(0, 500) + '…' : fullArgs}\n\n`;
            result += `💬 Decoded: ${decoded.length > 1000 ? decoded.slice(0, 1000) + '…' : decoded}`;

            await m.reply(result);
        } catch {
            await m.reply('❌ Gagal mendekode! Pastikan input adalah Base64 yang valid.');
        }
    },

    // ── 10. /spoiler ─────────────────────────
    spoiler: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}spoiler <teks>\n\n` +
                `Contoh: ${prefix}spoiler ini adalah rahasia`
            );
        }

        const spoilered = `▓▓▓ ${fullArgs} ▓▓▓`;

        let result = `🔒 *Spoiler*\n`;
        result += `━━━━━━━━━━━━━━━━━━\n\n`;
        result += spoilered;

        await m.reply(result);
    },

    // ── 11. /qr ──────────────────────────────
    qr: async (m, sock, { fullArgs, prefix, from }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}qr <teks / url>\n\n` +
                `Contoh: ${prefix}qr https://example.com\n\n` +
                `Maksimal 2000 karakter.`
            );
        }

        if (fullArgs.length > 2000) {
            return m.reply('❌ Teks terlalu panjang untuk QR code! Maksimal 2000 karakter.');
        }

        try {
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullArgs)}`;
            const buffer = await downloadBuffer(url);

            await sock.sendMessage(
                from,
                {
                    image: buffer,
                    caption: `📱 *QR Code*\n\n💬 Data: ${fullArgs.length > 300 ? fullArgs.slice(0, 300) + '…' : fullArgs}`,
                },
                { quoted: m.key }
            );
        } catch (err) {
            console.error('[text/qr]', err.message);
            await m.reply('❌ Gagal membuat QR code! Mungkin API sedang down, silakan coba lagi nanti.');
        }
    },

    // ── 12. /readmore ────────────────────────
    readmore: async (m, sock, { fullArgs, prefix }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}readmore <teks1> | <teks2>\n\n` +
                `Contoh: ${prefix}readmore halo | dunia\n\n` +
                `Pisahkan kedua bagian dengan tanda |`
            );
        }

        const parts = fullArgs.split('|');
        if (parts.length < 2) {
            return m.reply('❌ Format salah! Gunakan: teks1 | teks2\nPisahkan kedua bagian dengan tanda `|`');
        }

        const text1 = parts[0].trim();
        const text2 = parts.slice(1).join('|').trim();

        if (!text1 || !text2) {
            return m.reply('❌ Kedua bagian teks tidak boleh kosong!');
        }

        // Invisible LEFT-TO-RIGHT MARK characters create a collapsible gap
        // that triggers WhatsApp's "Read more" in chat view.
        const divider = '\u200E'.repeat(5000);
        const result = `${text1}\n${divider}\n${text2}`;

        await m.reply(result);
    },

    // ── 13. /ttp ─────────────────────────────
    ttp: async (m, sock, { fullArgs, prefix, from }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}ttp <teks>\n\n` +
                `Contoh: ${prefix}ttp halo\n\n` +
                `Maksimal 100 karakter.`
            );
        }

        if (fullArgs.length > 100) {
            return m.reply('❌ Teks terlalu panjang! Maksimal 100 karakter untuk TTP.');
        }

        try {
            const url = `https://api.popcat.xyz/ttp?text=${encodeURIComponent(fullArgs)}`;
            const buffer = await downloadBuffer(url);

            await sock.sendMessage(
                from,
                {
                    image: buffer,
                    caption: `🖼️ *Text to Picture*\n\n💬 "${fullArgs}"`,
                },
                { quoted: m.key }
            );
        } catch (err) {
            console.error('[text/ttp]', err.message);
            await m.reply('❌ Gagal membuat gambar teks! Mungkin API sedang down, silakan coba lagi nanti.');
        }
    },

    // ── 14. /attp ────────────────────────────
    attp: async (m, sock, { fullArgs, prefix, from }) => {
        if (!fullArgs) {
            return m.reply(
                `ℹ️ *Penggunaan:*\n${prefix}attp <teks>\n\n` +
                `Contoh: ${prefix}attp halo\n\n` +
                `Maksimal 50 karakter.`
            );
        }

        if (fullArgs.length > 50) {
            return m.reply('❌ Teks terlalu panjang! Maksimal 50 karakter untuk stiker animasi.');
        }

        try {
            const url = `https://api.popcat.xyz/attp?text=${encodeURIComponent(fullArgs)}`;
            const buffer = await downloadBuffer(url);

            await sock.sendMessage(
                from,
                { sticker: buffer },
                { quoted: m.key }
            );
        } catch (err) {
            console.error('[text/attp]', err.message);
            await m.reply('❌ Gagal membuat stiker animasi! Mungkin API sedang down, silakan coba lagi nanti.');
        }
    },
};

// ============================================
//  PLUGIN EXPORT
// ============================================

export default {
    name: 'Text Utilities',
    command: [
        'style',
        'uppercase',
        'lowercase',
        'reverse',
        'repeat',
        'count',
        'hash',
        'encode',
        'decode',
        'spoiler',
        'qr',
        'readmore',
        'ttp',
        'attp',
    ],

    run: async (m, sock, ctx) => {
        const handler = handlers[ctx.command];
        if (handler) {
            await handler(m, sock, ctx);
        }
    },
};
