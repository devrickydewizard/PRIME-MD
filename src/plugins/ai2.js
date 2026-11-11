// PRIME plugin: Ai.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const axios = require('axios');

const fs = require('fs-extra');

const path = require('path');

const FormData = require('form-data');

const mime = require('mime-types');

const https = require('https');

const aiModels = [
  "mistral", "wormgpt", "claudeai", "bard", "perplexity", "venice"
];

for (const pattern of aiModels) {
  pcmd({
    pattern: pattern,
    category: "Ai",
    description: `Query via ${pattern} API`
  }, async (from, client, conText) => {
    const { q, reply, api } = conText;
    if (!q) return reply("❌ Provide a query");

    // 1) primary provider
    try {
      const res = await axios.get(`${api}/ai/${pattern}?q=${encodeURIComponent(q)}`, { timeout: 45000 });
      let out = res.data?.status ? res.data.result : null;
      if (out && typeof out === "object") out = out.text || out.answer || out.response || JSON.stringify(out);
      // The provider sometimes returns its own upstream error as a "successful" text reply
      const looksLikeError = (t) =>
        typeof t !== "string" || !t.trim() ||
        /^data:\s*[{\[]/.test(t.trim()) ||
        /"error"\s*:|"code"\s*:\s*[45]\d\d|client version|refresh the page|\[DONE\]|"detail"\s*:/i.test(t);
      if (looksLikeError(out)) throw new Error(res.data?.error?.detail || "provider returned an error reply");
      return reply(out);
    } catch (err) {
      console.error(`${pattern} primary failed:`, err?.response?.data?.error?.detail || err.message);
    }

    // 2) fallback: PRIME's own AI backend (used by .unlimitedai)
    try {
      const session = String(conText.sender || from).replace(/[^a-zA-Z0-9]/g, "");
      const { data } = await axios.get("https://api.synoxcloud.xyz/ai-chat/unlimited-ai", {
        params: { prompt: q, session },
        timeout: 60000,
      });
      const text = data?.result?.answer;
      if (!data?.status || !text) throw new Error("empty fallback response");
      return reply(text);
    } catch (err) {
      console.error(`${pattern} fallback failed:`, err.message);
      return reply("⚠️ The AI service is unavailable right now. Please try again later.");
    }
  });
}

function genSerial() {
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

async function upscaleImage(buffer) {
  const serial = genSerial();

  const form = new FormData();
  form.append("original_image_file", buffer, "image.jpg");
  form.append("upscale_type", "8");

  // Create job
  const createRes = await axios.post(
    "https://api.imgupscaler.ai/api/image-upscaler/v2/upscale/create-job",
    form,
    {
      headers: {
        ...form.getHeaders(),
        "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
        "product-serial": serial,
        timezone: "Asia/Jakarta",
        origin: "https://imgupscaler.ai",
        referer: "https://imgupscaler.ai/"
      }
    }
  );

  const create = createRes.data;
  if (create.code !== 100000) throw new Error("❌ Failed to create upscale job");

  const jobId = create.result.job_id;

  // Poll until job completes
  while (true) {
    await new Promise(r => setTimeout(r, 3000));

    const res = await axios.get(
      `https://api.imgupscaler.ai/api/image-upscaler/v1/universal_upscale/get-job/${jobId}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
          "product-serial": serial,
          origin: "https://imgupscaler.ai",
          referer: "https://imgupscaler.ai/"
        }
      }
    );

    const json = res.data;
    if (
      json.code === 100000 &&
      json.message?.en === "Image generated successfully."
    ) {
      return json.result.output_url;
    }
  }
}

pcmd({
  pattern: "hd",
  aliases: ["upscale", "enhance", "hdimage", "superres"],
  description: "Upscale quoted image to HD",
  category: "Ai",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Reply to an image message to upscale it.");
  if (!quoted?.imageMessage) return reply("❌ Only image messages are supported.");

  let filePath;
  try {
    // Save quoted image locally
    filePath = await client.downloadAndSaveMediaMessage(quoted.imageMessage);
    const buffer = await fs.readFile(filePath);

    // Upscale
    const upscaledUrl = await upscaleImage(buffer);

    // Send back upscaled image
    await client.sendMessage(from, { image: { url: upscaledUrl }, caption: "🔼 HD Upscaled" }, { quoted: mek });

  } catch (err) {
    console.error("HD Upscale error:", err);
    await reply("❌ Failed to upscale image. Try again.");
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
});

pcmd({
  pattern: "speechwriter",
  aliases: ["speech", "writer"],
  category: "education",
  description: "Generate a speech using the Speechwriter API"
},
async (from, client, conText) => {
  const { q, reply, api } = conText;

  if (!q) {
    return reply("❌ Provide a topic, e.g. .speechwriter how to pass exam");
  }

  try {
    // Defaults
    const length = "short";
    const type = "dedication";
    const tone = "serious";

    // Build API URL with defaults
    const url = `${api}/ai/speechwriter?topic=${encodeURIComponent(q)}&length=${length}&type=${type}&tone=${tone}`;

    // Call API
    const res = await axios.get(url, { timeout: 30000 });

    const r = res.data?.result;
    const speech =
      (typeof r === "string" && r) ||
      r?.data?.data?.speech ||
      r?.data?.speech ||
      r?.speech ||
      null;

    if (res.data?.status && speech) {
      return reply(speech);
    }
    console.error("speechwriter: unexpected response shape ->", JSON.stringify(res.data).slice(0, 500));
    throw new Error("empty/invalid response from primary API");
  } catch (err) {
    console.error("speechwriter primary failed:", err?.response?.status, err?.response?.data || err.message);
  }

  // Fallback: ask the same general-purpose AI backend used by claudeai/mistral/etc.
  try {
    const session = String(conText.sender || from).replace(/[^a-zA-Z0-9]/g, "");
    const prompt = `Write a short, serious speech of dedication on the topic: "${q}". Return only the speech text, no preamble.`;
    const { data } = await axios.get("https://api.synoxcloud.xyz/ai-chat/unlimited-ai", {
      params: { prompt, session },
      timeout: 45000,
    });
    const text = data?.result?.answer;
    if (!data?.status || !text) throw new Error("empty fallback response");
    return reply(text);
  } catch (err) {
    console.error("speechwriter fallback failed:", err.message);
    const detail = err?.response ? `HTTP ${err.response.status}` : (err.code === "ECONNABORTED" ? "timed out" : err.message);
    return reply(`❌ Failed to generate a speech (${detail}). Try again later.`);
  }
});

pcmd({
  pattern: "muslimai",
  aliases: ["muslim", "quranai"],
  category: "Religion",
  description: "Query MuslimAI API for Qur'anic references"
},
async (from, client, conText) => {
  const { q, reply, api } = conText;

  if (!q) return reply("❌ Provide a query, e.g. .muslimai who is Allah");

  try {
    // Call MuslimAI API
    const res = await axios.get(`${api}/ai/muslim?q=${encodeURIComponent(q)}`);

    if (!res.data || !res.data.status || !res.data.result) {
      return reply("❌ MuslimAI API returned an invalid response.");
    }

    const results = res.data.result.results;

    if (!results || results.length === 0) {
      return reply("ℹ️ No relevant verses found.");
    }

    // Format top 3 results
    let output = `📖 *MuslimAI Results for:* ${res.data.result.query}\n\n`;
    results.slice(0, 3).forEach((r, i) => {
      output += `*${i + 1}. Surah ${r.surah_title}*\n${r.content.trim()}\n🔗 ${r.surah_url}\n\n`;
    });

    reply(output.trim());
  } catch (err) {
    console.error("muslimai Error:", err);
    reply("❌ Failed to fetch MuslimAI response: " + err.message);
  }
});

pcmd({
  pattern: "bibleai",
  aliases: ["aibible", "scripture"],
  description: "Ask Bible-based questions and get answers with references",
  category: "Religion",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("📖 Ask a Bible question.\n\nExample: bibleai what is faith");

  try {
    const res = await axios.get(`${api}/ai/bible?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !data.result?.results?.data?.answer) {
      return reply("❌ No Bible answer found.");
    }

    const answer = data.result.results.data.answer;
    const sources = data.result.results.data.sources;

    const caption = `📖 *${q}*\n\n${answer}\n\n📌 *Sources:* Reply with a number to view\n` +
      sources.map((src, i) => {
        if (src.type === "verse") return `${i + 1}. 📜 ${src.text}`;
        if (src.type === "article") return `${i + 1}. 📘 ${src.title}`;
      }).join("\n");

    const sent = await client.sendMessage(from, { text: caption }, { quoted: mek });
    const messageId = sent.key.id;

    client.ev.on("messages.upsert", async (update) => {
      const msg = update.messages[0];
      if (!msg.message) return;

      const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
      const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
      const chatId = msg.key.remoteJid;

      if (!isReply) return;

      const index = parseInt(responseText.trim()) - 1;
      const selected = sources[index];

      if (!selected) {
        return client.sendMessage(chatId, {
          text: "❌ Invalid number. Reply with a valid source number.",
          quoted: msg
        });
      }

      await client.sendMessage(chatId, { react: { text: "📖", key: msg.key } });

      if (selected.type === "verse") {
        const ref = selected.bcv.referenceLong.replace(/\s+/g, "").replace(":", ":");
        try {
          const verseRes = await axios.get(`${api}/search/bible?q=${encodeURIComponent(ref)}`);
          const verseData = verseRes.data;

          if (!verseData.status || !verseData.result?.verses) {
            return client.sendMessage(chatId, {
              text: `❌ Couldn't fetch verse: ${selected.text}`,
              quoted: msg
            });
          }

          const verses = verseData.result.verses.map(v =>
            `📖 *${v.book} ${v.chapter}:${v.verse}*\n${v.text}`
          ).join("\n\n");

          await client.sendMessage(chatId, { text: verses }, { quoted: msg });
        } catch (err) {
          console.error("Verse fetch error:", err);
          await client.sendMessage(chatId, {
            text: "❌ Error fetching verse text.",
            quoted: msg
          });
        }
      } else if (selected.type === "article") {
        await client.sendMessage(chatId, {
          image: { url: selected.image },
          caption: `📘 *${selected.title}*\n\n${selected.text}\n\n🔗 ${selected.url}`
        }, { quoted: msg });
      }
    });
  } catch (err) {
    console.error("bibleai error:", err);
    reply("❌ Error fetching Bible answer: " + err.message);
  }
});

function getMediaType(quoted) {
  if (quoted.imageMessage) return "image";
  if (quoted.videoMessage) return "video";
  if (quoted.stickerMessage) return "sticker";
  if (quoted.audioMessage) return "audio";
  if (quoted.documentMessage) return "document";
  return "unknown";
}

async function saveMediaToTemp(client, quotedMedia, type) {
  const tmpDir = path.join(__dirname, "..", "tmp");
  await fs.ensureDir(tmpDir);
  const fileName = `${type}-${Date.now()}`;
  const filePath = path.join(tmpDir, fileName);
  const savedPath = await client.downloadAndSaveMediaMessage(quotedMedia, filePath);
  return savedPath;
}

async function uploadToUguu(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: mimeType
  });

  const response = await axios.post('https://uguu.se/upload.php', form, {
    headers: {
      ...form.getHeaders(),
      'origin': 'https://uguu.se',
      'referer': 'https://uguu.se/',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    }
  });

  const result = response.data;
  if (result.success && result.files?.[0]?.url) {
    return result.files[0].url;
  } else {
    throw new Error("Uguu upload failed or malformed response");
  }
}

pcmd({
  pattern: "vision",
  aliases: ["imgai", "analyze", "geminivision"],
  description: "Analyze quoted image using Gemini Vision AI",
  category: "Ai",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply, q, api } = conText;

  if (!quotedMsg) return reply("📌 Reply to an image message to analyze it");
  if (!q || typeof q !== "string") return reply("❌ Missing query. Use q='your question'");

  const type = getMediaType(quotedMsg);
  if (type !== "image") return reply("❌ Only image messages are supported");

  const mediaNode = quoted?.imageMessage;
  if (!mediaNode) return reply("❌ Could not extract image content");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type);
    const imageUrl = await uploadToUguu(filePath);

    const { data: result } = await axios.get(`${api}/ai/vision?image=${encodeURIComponent(imageUrl)}&q=${encodeURIComponent(q)}`);
    if (!result?.status || !result?.result) return reply("❌ No response from Vision AI");

    await client.sendMessage(from, { text: result.result }, { quoted: mek });

  } catch (err) {
    console.error("Vision AI error:", err);
    await reply("❌ Failed to analyze image. Try a different one.");
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
});

pcmd({
  pattern: "vocalremover",
  aliases: ["removevocal", "aivocal", "extractvocal"],
  description: "Extract vocals from quoted audio or video",
  category: "Ai",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply, botname, botPic, api } = conText;

  if (!quotedMsg) return reply("📌 Reply to an audio or video message to extract vocals");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type");

  const mediaNode = quoted?.[`${type}Message`];
  if (!mediaNode) return reply("❌ Could not extract media content");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type);
    const mediaUrl = await uploadToUguu(filePath);

    const { data: result } = await axios.get(`${api}/ai/vocalremover?url=${mediaUrl}`);
    if (!result?.status || !result?.result?.vocal) return reply("❌ No vocal track found");

    const vocalUrl = result.result.vocal;

    await client.sendMessage(from, {
      audio: { url: vocalUrl },
      mimetype: "audio/mpeg",
      fileName: "vocal.mp3",
      ptt: false
    }, { quoted: mek });

  } catch (err) {
    console.error("VocalRemover error:", err);
    await reply("❌ Failed to extract vocals. Try with a shorter or fresh clip.");
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
});

pcmd({
  pattern: "transcribe",
  aliases: ["speech", "audio2text", "whisper"],
  description: "Transcribe quoted audio or video to text",
  category: "Ai",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply, api } = conText;

  if (!quotedMsg) return reply("📌 Reply to an audio or video message to transcribe it");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type");

  const mediaNode = quoted?.[`${type}Message`];
  if (!mediaNode) return reply("❌ Could not extract media content");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type);
    const mediaUrl = await uploadToUguu(filePath);

    const { data: result } = await axios.get(`${api}/ai/transcribe?q=${encodeURIComponent(mediaUrl)}`);
    if (!result?.status || !result?.result?.text) return reply("❌ No transcription found");

    await client.sendMessage(from, { text: result.result.text }, { quoted: mek });

  } catch (err) {
    console.error("Transcription error:", err);
    await reply("❌ Failed to transcribe. Try a shorter or clearer clip.");
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
});

pcmd({
  pattern: "shazam",
  aliases: ["identify", "whatmusic", "whatsong"],
  description: "Identify music from quoted audio or video",
  category: "Ai",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply, botname, api } = conText;

  if (!quotedMsg) return reply("📌 Reply to an audio or video message to identify music");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type");

  const mediaNode = quoted?.[`${type}Message`];
  if (!mediaNode) return reply("❌ Could not extract media content");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type);
    const mediaUrl = await uploadToUguu(filePath);

    const { data: result } = await axios.get(`${api}/ai/shazam?url=${mediaUrl}`);
    if (!result?.status || !result?.result?.title) return reply("❌ No music info found");

    const { title, artists, album, release_date } = result.result;

    let txt = `*${botname} Music ID*\n\n`;
    txt += `*Title:* ${title}\n`;
    if (artists?.length) txt += `*Artists:* ${artists.join(', ')}\n`;
    if (album) txt += `*Album:* ${album}\n`;
    if (release_date) txt += `*Release Date:* ${release_date}`;

    await client.sendMessage(from, { text: txt }, { quoted: mek });

  } catch (err) {
    console.error("Shazam error:", err);
    await reply("❌ Failed to identify music. Try with a shorter or fresh clip.");
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
});

pcmd({
  pattern: "dictionary",
  aliases: ["define", "meaning"],
  description: "Look up word definitions and phonetics",
  category: "Education",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("📚 Type a word to define.\n\nExample: dictionary cat");

  try {
    const res = await axios.get(`${api}/education/dictionary?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !data.result?.meanings) {
      return reply("❌ No definition found.");
    }

    const { word, phonetics, meanings, sourceUrls } = data.result;

    const phoneticText = phonetics.map(p => p.text).filter(Boolean).join(", ");
    const audio = phonetics.find(p => p.audio)?.audio;

    const defs = meanings.map(m => {
      const defs = m.definitions.map((d, i) => `  ${i + 1}. ${d.definition}`).join("\n");
      return `📌 *${m.partOfSpeech}*\n${defs}`;
    }).join("\n\n");

    const caption = `📚 *${word}*\n🔊 Phonetics: ${phoneticText || "—"}\n\n${defs}\n\n🔗 Source: ${sourceUrls[0]}`;

    if (audio) {
      await client.sendMessage(from, {
        audio: { url: audio },
        mimetype: 'audio/mp4',
        ptt: false
      }, { quoted: mek });
    }

    await client.sendMessage(from, { text: caption }, { quoted: mek });
  } catch (err) {
    console.error("dictionary error:", err);
    reply("❌ Error fetching definition: " + err.message);
  }
});

const reso = {
  portrait: { width: 768, height: 1344 },
  landscape: { width: 1344, height: 768 },
  square: { width: 1024, height: 1024 },
  ultra: { width: 1536, height: 1536 },
  tall: { width: 832, height: 1344 },
  wide: { width: 1344, height: 832 }
};

pcmd({
  pattern: "bing",
  aliases: ["text2image", "text2img", "aiimage", "imggen"],
  category: "ai",
  description: "Generate AI image from text prompt"
}, async (from, client, conText) => {
  const { q, reply, mek } = conText;

  if (!q) {
    return reply(
      "Please provide a prompt and optional resolution.\n" +
      "Example:\n" +
      "• text2img cute cat\n" +
      "• text2img cute cat|square\n" +
      "• text2img cute cat|landscape\n" +
      "• text2img cute cat|tall\n" +
      "• text2img cute cat|ultra"
    );
  }

  // Parse arguments
  const queryParts = q.split("|");
  const prompt = queryParts[0].trim();
  const resolution = queryParts[1]?.trim().toLowerCase() || "portrait";
  const upscale = 2;

  if (!reso[resolution]) {
    const validResolutions = Object.keys(reso).join(", ");
    return reply(`Invalid resolution. Available options: ${validResolutions}`);
  }

  try {
    await reply(`🔄 Generating image for: *"${prompt}"* (${resolution})...`);

    const { width, height } = reso[resolution];

    const form = new FormData();
    form.append("Prompt", prompt);
    form.append("Language", "eng_Latn");
    form.append("Size", `${width}x${height}`);
    form.append("Upscale", upscale.toString());
    form.append("Batch_Index", "0");

    const agent = new https.Agent({ rejectUnauthorized: false });

    const response = await axios.post(
      "https://api.zonerai.com/zoner-ai/txt2img",
      form,
      {
        httpsAgent: agent,
        headers: {
          ...form.getHeaders(),
          Origin: "https://zonerai.com",
          Referer: "https://zonerai.com/",
          "User-Agent": "Mozilla/5.0"
        },
        responseType: "arraybuffer"
      }
    );

    const buffer = Buffer.from(response.data);
    const caption = `🎨 AI Generated Image\n\n*Prompt:* ${prompt}\n*Resolution:* ${resolution} (${width}x${height})`;

    await client.sendMessage(from, {
      image: buffer,
      caption,
      mimetype: "image/jpeg"
    }, { quoted: mek });

  } catch (err) {
    console.error("Error generating image:", err);
    await reply(`❌ Failed to generate image. Error: ${err.message}`);
  }
});

