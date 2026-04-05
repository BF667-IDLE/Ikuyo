import axios from "axios";
import NodeCache from "node-cache";

// ─── Caches ───────────────────────────────────────────────────────────────────
const chatHistory = new NodeCache({ stdTTL: 1800 }); // 30 min TTL
const rateLimit   = new NodeCache({ stdTTL: 5 });     // 5 s cooldown

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getHistory(sender) {
    const key = `history:${sender}`;
    if (!chatHistory.has(key)) {
        chatHistory.set(key, [
            {
                role: "user",
                parts: [{ text: "Kamu adalah asisten AI yang ramah. Jawab dalam bahasa yang sama dengan pengguna. Jaga respons tetap ringkas dan membantu." }],
            },
            {
                role: "model",
                parts: [{ text: "Baik, saya mengerti. Siap membantu! Ada yang bisa saya bantu?" }],
            },
        ]);
    }
    return chatHistory.get(key);
}

function trimHistory(history, max = 10) {
    // Keep system prompt (index 0) then trim to max alternating pairs
    if (history.length <= max + 1) return history;
    return [history[0], ...history.slice(-(max))];
}

function sanitize(text) {
    return text
        .replace(/<think[\s\S]*?<\/think>/gi, "")
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/\n/g, " "))
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/#{1,6}\s/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
}

function cleanGeminiText(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, "*$1*")
        .replace(/__(.*?)__/g, "_$1_")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => `_${code.trim()}_`)
        .trim();
}

function getApiKey() {
    return global.config?.ai?.api_key || "";
}

async function sendImage(sock, jid, imageBuffer, caption, quoted) {
    await sock.sendMessage(
        jid,
        { image: imageBuffer, caption: caption || "" },
        { quoted }
    );
}

// ─── Command: /ai ─────────────────────────────────────────────────────────────

async function aiCommand(m, sock, { fullArgs }) {
    if (!fullArgs.trim()) {
        return m.reply("⚠️ *Penggunaan:*\n/ai <pesan>\n\nContoh: /ai Jelaskan tentang fotosintesis");
    }

    const sender = m.sender;
    const rlKey  = `rl:${sender}`;
    if (rateLimit.has(rlKey)) {
        const remaining = Math.ceil(rateLimit.getTtl(rlKey) / 1000);
        return m.reply(`⏳ Mohon tunggu *${remaining} detik* lagi sebelum mengirim permintaan baru.`);
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        return m.reply(
            "❌ *API Key belum dikonfigurasi!*\n\n" +
            "Untuk menggunakan fitur AI, tambahkan API key Gemini di konfigurasi:\n\n" +
            "```json\n{\n  \"ai\": {\n    \"api_key\": \"YOUR_GEMINI_API_KEY\"\n  }\n}\n```\n\n" +
            "📝 Dapatkan API key gratis di:\nhttps://aistudio.google.com/apikey"
        );
    }

    rateLimit.set(rlKey, true);

    await m.reply("🤖 Thinking...");

    const history = getHistory(sender);
    const userMsg = fullArgs.trim();

    // Build request body using Gemini format
    const contents = trimHistory(history).map((item) => ({
        role: item.role === "model" ? "model" : "user",
        parts: item.parts,
    }));
    contents.push({ role: "user", parts: [{ text: userMsg }] });

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const { data } = await axios.post(
            url,
            {
                contents,
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.8,
                },
            },
            { timeout: 30000 }
        );

        const replyText =
            data?.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak bisa menghasilkan respons saat ini.";

        // Update history
        const updated = trimHistory([...history, { role: "user", parts: [{ text: userMsg }] }, { role: "model", parts: [{ text: replyText }] }]);
        chatHistory.set(`history:${sender}`, updated);

        const cleaned = cleanGeminiText(replyText);
        await m.reply(cleaned);
    } catch (err) {
        const status = err.response?.status;
        if (status === 429) {
            await m.reply("⚠️ Rate limit tercapai. Coba lagi dalam beberapa saat.");
        } else if (status === 403) {
            await m.reply("❌ API key tidak valid atau tidak memiliki akses. Silakan periksa konfigurasi.");
        } else {
            console.error("[AI Plugin Error]", err.message);
            await m.reply("❌ Terjadi kesalahan saat menghubungi AI. Silakan coba lagi nanti.");
        }
    }
}

// ─── Command: /img ────────────────────────────────────────────────────────────

async function imgCommand(m, sock, { fullArgs }) {
    if (!fullArgs.trim()) {
        return m.reply("⚠️ *Penggunaan:*\n/img <prompt gambar>\n\nContoh: /img A beautiful sunset over mountains");
    }

    await m.reply("🎨 Generating image...");

    const prompt  = encodeURIComponent(fullArgs.trim());
    const imgUrl  = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;

    try {
        const response = await axios.get(imgUrl, { responseType: "arraybuffer", timeout: 60000 });
        const buffer   = Buffer.from(response.data, "binary");

        await sendImage(sock, m.from, buffer, `✅ Berhasil! Prompt: ${fullArgs.trim()}`, m.message);
    } catch (err) {
        console.error("[IMG Plugin Error]", err.message);
        await m.reply("❌ Gagal membuat gambar. Silakan coba lagi nanti.");
    }
}

// ─── Command: /translate ──────────────────────────────────────────────────────

async function translateCommand(m, sock, { fullArgs }) {
    if (!fullArgs.trim()) {
        return m.reply(
            "⚠️ *Penggunaan:*\n/translate <teks>\n/translate id|en <teks>\n\n" +
            "Contoh:\n/translate Selamat pagi\n/translate en|id Good morning\n\n" +
            "Kode bahasa: id (Indonesia), en (English), ja (Japanese), ko (Korean), zh (Chinese), dll."
        );
    }

    let langPair = "id|en"; // default: Indonesian → English
    let text     = fullArgs.trim();

    // Check if first "token" looks like a langpair (e.g. "id|en" or "en|id")
    const langMatch = fullArgs.trim().match(/^([a-z]{2})\|([a-z]{2})\s+(.+)$/i);
    if (langMatch) {
        langPair = `${langMatch[1].toLowerCase()}|${langMatch[2].toLowerCase()}`;
        text     = langMatch[3].trim();
    }

    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
        const { data } = await axios.get(url, { timeout: 15000 });

        if (data.responseStatus === 200) {
            const translated = data.responseData.translatedText;
            await m.reply(
                `🌐 *Terjemahan* [${langPair}]\n\n` +
                `📝 *Original:* ${text}\n` +
                `✅ *Translated:* ${translated}`
            );
        } else {
            await m.reply("❌ Gagal menerjemahkan teks. Pastikan teks dan kode bahasa valid.");
        }
    } catch (err) {
        console.error("[Translate Plugin Error]", err.message);
        await m.reply("❌ Terjadi kesalahan saat menerjemahkan. Silakan coba lagi.");
    }
}

// ─── Command: /define ─────────────────────────────────────────────────────────

async function defineCommand(m, sock, { fullArgs }) {
    if (!fullArgs.trim()) {
        return m.reply("⚠️ *Penggunaan:*\n/define <kata>\n\nContoh: /define serendipity");
    }

    const word = fullArgs.trim().replace(/[^a-zA-Z\s-]/g, "").trim().split(/\s+/)[0]; // take first word only

    if (!word) {
        return m.reply("❌ Masukkan kata yang valid (hanya huruf).");
    }

    await m.reply("📖 Looking up definition...");

    try {
        const url     = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`;
        const { data } = await axios.get(url, { timeout: 15000 });

        const entry = Array.isArray(data) ? data[0] : data;

        // Extract data
        const wordTitle = entry.word || word;
        const phonetics = entry.phonetics || [];
        const phoneticText =
            phonetics.find((p) => p.text)?.text ||
            phonetics.find((p) => p.phonetic)?.phonetic ||
            "";

        const meanings  = entry.meanings || [];
        let body        = `📖 *${wordTitle.toUpperCase()}* ${phoneticText ? `(${phoneticText})` : ""}\n`;

        for (const meaning of meanings) {
            const partOfSpeech = meaning.partOfSpeech;
            const definitions  = (meaning.definitions || []).slice(0, 3); // max 3 per part

            body += `\n🏷️ *${partOfSpeech}*\n`;

            definitions.forEach((def, i) => {
                body += `  ${i + 1}. ${def.definition}\n`;
                if (def.example) {
                    body += `     💬 _"${def.example}"_\n`;
                }
            });

            // Synonyms
            const syns = (meaning.synonyms || []).slice(0, 5);
            if (syns.length) {
                body += `  🔗 Synonyms: ${syns.join(", ")}\n`;
            }

            // Antonyms
            const ants = (meaning.antonyms || []).slice(0, 5);
            if (ants.length) {
                body += `  ↔️ Antonyms: ${ants.join(", ")}\n`;
            }
        }

        // Audio URL
        const audioUrl = phonetics.find((p) => p.audio && p.audio.length > 0)?.audio;
        if (audioUrl) {
            body += `\n🔊 Audio: ${audioUrl}`;
        }

        // Source URL
        const sourceUrl = entry.sourceUrls?.[0];
        if (sourceUrl) {
            body += `\n🔗 ${sourceUrl}`;
        }

        // Truncate if too long
        if (body.length > 4096) {
            body = body.substring(0, 4000) + "\n\n... ( respons dipotong karena terlalu panjang)";
        }

        await m.reply(body);
    } catch (err) {
        if (err.response?.status === 404) {
            await m.reply(`❌ Maaf, definisi untuk kata *"${word}"* tidak ditemukan di kamus.`);
        } else {
            console.error("[Define Plugin Error]", err.message);
            await m.reply("❌ Terjadi kesalahan saat mencari definisi. Silakan coba lagi.");
        }
    }
}

// ─── Plugin Export ────────────────────────────────────────────────────────────

export default {
    name: "AI Plugin",
    command: ["ai", "img", "translate", "define"],

    run: async (m, sock, { text, prefix, command, args, fullArgs }) => {
        switch (command) {
            case "ai":
                return aiCommand(m, sock, { text, prefix, command, args, fullArgs });
            case "img":
                return imgCommand(m, sock, { text, prefix, command, args, fullArgs });
            case "translate":
                return translateCommand(m, sock, { text, prefix, command, args, fullArgs });
            case "define":
                return defineCommand(m, sock, { text, prefix, command, args, fullArgs });
            default:
                return m.reply("❌ Command tidak dikenali.");
        }
    },
};
