// PRIME plugin: Gpt.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const _convFile = require('path').join(process.cwd(), 'lib', 'session', 'gpt_history.json');
const _fsx = require('fs');
function _loadConv() { try { return JSON.parse(_fsx.readFileSync(_convFile, 'utf8')); } catch { return {}; } }
function _saveConv(d) { try { _fsx.mkdirSync(require('path').dirname(_convFile), { recursive: true }); _fsx.writeFileSync(_convFile, JSON.stringify(d)); } catch (e) { console.error('[gpt history]', e.message); } }
async function saveConversation(userId, user, ai) { const d = _loadConv(); (d[userId] ??= []).push({ user, ai, time: Date.now() }); d[userId] = d[userId].slice(-50); _saveConv(d); return true; }
async function getLastConversation(userId) { const l = _loadConv()[userId]; return l && l.length ? l[l.length - 1] : null; }
async function getConversationHistory(userId, limit = 5) { const l = _loadConv()[userId] || []; return l.slice(-limit).reverse(); }
async function clearConversationHistory(userId) { const d = _loadConv(); const had = !!d[userId]?.length; delete d[userId]; _saveConv(d); return had; }

const axios = require('axios');

const fs = require("fs");

const FormData = require("form-data");

const crypto = require('crypto');

const path = require('path');

const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const photoEditorConfig = {
  createUrl: "https://api.photoeditorai.io/pe/photo-editor/create-job",
  jobUrl: "https://api.photoeditorai.io/pe/photo-editor/get-job/",
  creditsUrl: "https://api.photoeditorai.io/api/wl/credit/get-credits"
};

const photoEditorHeaders = {
  "product-serial": "94177bd5f370f2b4e54dd44668d58c35",
  "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
  "origin": "https://photoeditorai.io",
  "referer": "https://photoeditorai.io/",
  "accept": "application/json, text/plain, */*",
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8"
};

async function getCredits() {
  const { data } = await axios.post(photoEditorConfig.creditsUrl, {}, { headers: photoEditorHeaders });
  if (data.code !== 100000) {
    throw new Error(`Failed to get credits: ${data.message}`);
  }
  return data.result;
}

async function pollJobResult(jobId) {
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const { data } = await axios.get(`${photoEditorConfig.jobUrl}${jobId}`, { headers: photoEditorHeaders });

    if (data.code !== 100000) {
      throw new Error(data.message || "Job status error");
    }

    if (data.result.error) {
      throw new Error(data.result.error);
    }

    if (data.result.status === 2 && data.result.output?.length > 0) {
      return data.result.output[0];
    }
  }
  throw new Error("Timeout: Image processing took too long (5 minutes)");
}

async function processImage(imageBuffer, prompt) {
  const credits = await getCredits();
  if (credits.free_credits <= 0 && credits.credits <= 0) {
    throw new Error("No credits available. Please get more credits.");
  }

  const form = new FormData();
  form.append("model_name", "photoeditor_4.0");
  form.append("target_images", imageBuffer, {
    filename: "image.jpg",
    contentType: "image/jpeg"
  });
  form.append("prompt", prompt);
  form.append("ratio", "4:3");
  form.append("image_resolution", "1K");

  const { data: createData } = await axios.post(photoEditorConfig.createUrl, form, {
    headers: { ...photoEditorHeaders, ...form.getHeaders() }
  });

  if (createData.code !== 100000) {
    throw new Error(`Failed to create job: ${createData.message || "Unknown error"}`);
  }

  const jobId = createData.result.job_id;
  const resultUrl = await pollJobResult(jobId);

  const resultRes = await axios.get(resultUrl, { responseType: "arraybuffer" });
  return Buffer.from(resultRes.data);
}

const MUSIC_API = "https://remusic.ai/api/v1/ai-music/music";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0";

const STYLES = {
    genre: ["Pop", "Rock", "Hip-Hop", "R&B", "Jazz", "Classical", "Electronic", "EDM", "Lo-fi", "Ambient", "Reggae", "Country", "Folk", "Metal", "Blues", "Funk", "Soul", "Disco", "House", "Techno", "Trap", "Drum and Bass", "K-Pop", "J-Pop", "Latin", "Afrobeat", "Cinematic", "Orchestral", "Acoustic", "Punk", "Gospel", "Indie", "Synthwave", "Bossa Nova"],
    mood: ["Calm", "Happy", "Sad", "Energetic", "Romantic", "Epic", "Dark", "Dreamy", "Uplifting", "Melancholic", "Chill", "Aggressive", "Peaceful", "Nostalgic", "Mysterious", "Hopeful", "Sensual", "Playful", "Angry", "Triumphant"],
    vocal: ["Male Vocal", "Female Vocal", "Duet", "Choir", "Soft Vocal", "Powerful Vocal", "Rap", "Whisper"],
    tempo: ["Slow", "Mid-tempo", "Upbeat", "Fast"]
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const freshGa = () => `GA1.1.${Math.floor(Math.random() * 9e9 + 1e9)}.${Math.floor(Date.now() / 1000)}`;

const randIP = () => Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 254)).join(".");

function musicHeaders() {
    return {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json",
        "origin": "https://remusic.ai",
        "referer": "https://remusic.ai/ai-music-generator",
        "user-agent": UA,
        "cookie": `_ga=${freshGa()}; anonymous_user_id=${crypto.randomUUID()}`,
        "x-forwarded-for": randIP()
    };
}

function pick(row) {
    return {
        id: row.song_id,
        title: row.title || null,
        status: row.status,
        audio: row.audio_url || null,
        image: row.image_url || row.cover_url || null,
        duration: row.duration || null,
        tags: row.tags || null,
        lyrics: row.lyrics || null,
        description: row.description || null
    };
}

async function createJob(body, maxRetries) {
    let last = "create failed";
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await axios.post(MUSIC_API, body, { headers: musicHeaders(), timeout: 30000 });
            const json = res.data;
            if (json && json.code === 100000 && Array.isArray(json.data) && json.data.length) return json.data;
            last = json ? `${json.code}: ${json.message}` : `http ${res.status}`;
        } catch (e) {
            last = e.message;
        }
        await sleep(600);
    }
    throw new Error(last);
}

async function pollJob(id, onProgress) {
    for (let i = 0; i < 70; i++) {
        await sleep(5000);
        try {
            const res = await axios.get(`${MUSIC_API}/${id}`, { headers: musicHeaders(), timeout: 15000 });
            const json = res.data;
            const row = Array.isArray(json?.data) ? json.data[0] : json?.data;
            if (!row) continue;
            if (onProgress) onProgress(row.percentage ?? 0, row.status);
            if (row.status === "success" && row.audio_url) return row;
            if (["failed", "error", "fail"].includes(row.status)) throw new Error("Generation failed");
        } catch (e) {
            if (e.message === "Generation failed") throw e;
        }
    }
    throw new Error("Generation timeout");
}

async function generateMusic(prompt, options = {}) {
    const {
        styles = [],
        title = null,
        lyrics = null,
        mv = "v4",
        supplier = 10,
        maxRetries = 6,
        onProgress = null
    } = options;

    const tags = (Array.isArray(styles) ? styles : [styles]).filter(Boolean).join(", ");
    const custom = !!(title || lyrics);

    const body = custom
        ? { mode: 2, supplier, mv, is_instrumental: false, is_public: true, prompt: String(prompt || tags || title), title: title || "", tags, lyrics: lyrics || "" }
        : { mode: 1, supplier, mv, is_instrumental: false, is_public: true, prompt: tags ? `${prompt}, ${tags}` : String(prompt) };

    const jobs = await createJob(body, maxRetries);
    const songs = await Promise.all(jobs.map(j => pollJob(j.song_id, onProgress).then(pick).catch(() => ({ id: j.song_id, status: "failed", audio: null }))));

    return {
        ok: songs.some(s => s.audio),
        prompt: String(prompt || ""),
        styles: tags || null,
        mode: custom ? "custom" : "simple",
        count: songs.length,
        songs
    };
}

pcmd({
    pattern: "aimusic",
    aliases: ["songgen", "genmusic", "aimusicgen"],
    category: "Ai",
    description: "Generate AI music from text prompt"
}, async (from, client, conText) => {
    const { q, reply, mek, isSuperUser } = conText;

    if (!isSuperUser) return reply("❌ Owner only!");

    if (!q) {
        return reply(`📌 *AI Music Generator*

Generate music using AI from text description.

*Usage:*
.aimusic sad piano music

*With styles:*
.aimusic calm jazz | Jazz,Calm,Chill

*Examples:*
.aimusic epic orchestral
.aimusic romantic love song | Romantic,Slow,Vocal

*Styles:*
🎵 Genre: Pop, Rock, Hip-Hop, Jazz, Classical, Electronic, EDM, Lo-fi, Ambient, Reggae, Country, Metal, Blues, Soul, Disco, House, Techno, Trap, K-Pop, Latin, Afrobeat, Cinematic, Orchestral, Acoustic, Punk, Gospel, Indie, Synthwave, Bossa Nova

😊 Mood: Calm, Happy, Sad, Energetic, Romantic, Epic, Dark, Dreamy, Uplifting, Melancholic, Chill, Peaceful, Mysterious, Hopeful, Sensual, Playful

🎤 Vocal: Male Vocal, Female Vocal, Duet, Choir, Soft Vocal, Powerful Vocal, Rap, Whisper

⏱️ Tempo: Slow, Mid-tempo, Upbeat, Fast`);
    }

    await reply(`🎵 Generating AI music for: "${q}"...\n⏳ This may take 1-2 minutes.`);

    try {
        let prompt = q;
        let styles = [];

        if (q.includes('|')) {
            const parts = q.split('|').map(s => s.trim());
            prompt = parts[0];
            if (parts[1]) {
                styles = parts[1].split(',').map(s => s.trim());
            }
        }

        const result = await generateMusic(prompt, {
            styles: styles,
            onProgress: (percent, status) => {
                console.log(`⏳ Progress: ${percent}% - ${status}`);
            }
        });

        if (!result.ok) {
            return reply("❌ Failed to generate music. Please try again with different prompt.");
        }

        const song = result.songs.find(s => s.audio);
        if (!song) {
            return reply("❌ No audio generated. Please try again.");
        }

        await client.sendMessage(from, {
            audio: { url: song.audio },
            mimetype: 'audio/mpeg',
            ptt: false,
        }, { quoted: mek });

        const totalSongs = result.songs.filter(s => s.audio).length;
        if (totalSongs > 1) {
            await reply(`✅ Generated ${totalSongs} songs. Check the audio above!`);
        }

    } catch (err) {
        console.error("aimusic error:", err);
        await reply(`❌ Error: ${err.message}`);
    }
});

const qwenHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6',
  'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"',
  'origin': 'https://prithivmlmods-qwen-image-edit-object-manipulator.hf.space',
  'referer': 'https://prithivmlmods-qwen-image-edit-object-manipulator.hf.space/',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty'
};

async function uploadImageBuffer(buffer) {
  const uploadId = crypto.randomBytes(5).toString('hex');
  const form = new FormData();
  form.append('files', buffer, {
    filename: `image_${Date.now()}.jpg`,
    contentType: 'image/jpeg'
  });

  const r = await axios.post(`https://prithivmlmods-qwen-image-edit-object-manipulator.hf.space/gradio_api/upload?upload_id=${uploadId}`, form, {
    headers: { ...qwenHeaders, ...form.getHeaders(), 'accept': '*/*' }
  });

  return r.data[0];
}

async function qwenImageEdit(buffer, prompt, model) {
  const sessionHash = crypto.randomBytes(5).toString('hex');
  const filePath = await uploadImageBuffer(buffer);
  const origName = path.basename(filePath);
  const fileurl = `https://prithivmlmods-qwen-image-edit-object-manipulator.hf.space/gradio_api/file=${filePath}`;

  const { data: { event_id } } = await axios.post('https://prithivmlmods-qwen-image-edit-object-manipulator.hf.space/gradio_api/queue/join', {
    data: [
      [{ image: { path: filePath, url: fileurl, size: null, orig_name: origName, mime_type: 'image/jpeg', is_stream: false, meta: { _type: 'gradio.FileData' } }, caption: null }],
      prompt,
      model,
      0,
      true,
      1,
      4
    ],
    fn_index: 1,
    trigger_id: 8,
    session_hash: sessionHash
  }, {
    headers: { ...qwenHeaders, 'content-type': 'application/json', 'x-gradio-user': 'app', 'accept': '*/*' }
  });

  return new Promise((resolve, reject) => {
    let buf = '';

    axios.get(`https://prithivmlmods-qwen-image-edit-object-manipulator.hf.space/gradio_api/queue/data?session_hash=${sessionHash}`, {
      headers: { ...qwenHeaders, 'accept': 'text/event-stream', 'content-type': 'application/json' },
      responseType: 'stream'
    }).then(res => {
      res.data.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(line.slice(6));
            if (j.msg === 'process_completed' && j.event_id === event_id) {
              const out = j.output?.data?.[0];
              resolve({ url: out?.url, orig_name: out?.orig_name });
            }
          } catch {}
        }
      });

      res.data.on('end', () => reject(new Error('stream ended without result')));
      res.data.on('error', reject);
    }).catch(reject);
  });
}

pcmd({
  pattern: "imageedit",
  aliases: ["qwenedit", "qwenimage", "qwenai"],
  description: "Edit image using Qwen AI (add/remove objects)",
  category: "Ai",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quotedMsg, reply, q, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner only!");

  if (!quotedMsg) {
    return reply(`📌 *Qwen Image Editor*

Edit images using AI - add or remove objects.

*Usage:*
Reply to an image with: .qwen remove the tree
.qwen add a hat

*Models:*
1. Qwen-Image-Edit-2511-Object-Adder
2. Qwen-Image-Edit-2511-Object-Remover
3. QIE-2511-Object-Remover-v2
4. Zoom-Master
5. Extract-Outfit
6. Outfit-Design-Layout

*Examples:*
.qwen remove the person
.qwen add sunglasses | Qwen-Image-Edit-2511-Object-Adder`);
  }

  if (!q) {
    return reply("❌ Provide a prompt!\nExample: .qwen remove the background");
  }

  const imageMsg = quotedMsg.imageMessage;
  if (!imageMsg) {
    return reply("❌ Please reply to an image.");
  }

  let prompt = q;
  let model = "Qwen-Image-Edit-2511-Object-Adder";

  if (q.includes('|')) {
    const parts = q.split('|').map(s => s.trim());
    prompt = parts[0];
    if (parts[1]) model = parts[1];
  }

  try {
    const imageBuffer = await downloadMediaMessage(
      { message: { imageMessage: imageMsg } },
      'buffer',
      {},
      { reuploadRequest: client.updateMediaMessage, logger: console }
    );

    const result = await qwenImageEdit(imageBuffer, prompt, model);

    await client.sendMessage(from, {
      image: { url: result.url },
      caption: `✅ *Image Edited with Qwen AI*\n📝 *Prompt:* ${prompt}\n🤖 *Model:* ${model}`
    }, { quoted: mek });

  } catch (err) {
    console.error("qwen error:", err);
    await reply(`❌ Error: ${err.message}`);
  }
});

const _cfg = {
  base: "https://deepfakemaker.io",
  api: "https://apiv1.deepfakemaker.io/api",
  solve: "https://cf.kanaa.eu.cc/solve",
  siteKey: "0x4AAAAAAB6PHmfUkQvGufDI",
  model: "nano-banana-2",
}

async function getToken() {
  try {
    const { data } = await axios.post(
      _cfg.solve,
      {
        url: "https://deepfakemaker.io/ai-clothes-remover/",
        siteKey: _cfg.siteKey,
        mode: "turnstile-min"
      }
    );

    return data.token || data;
  } catch (e) {
    throw e.response?.data || e.message;
  }
}

// (removed)

const deepaiAgent = "Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36";

const SALT = "fuck_you_deepai_keith_is_here";

const md5 = s => crypto.createHash("md5").update(s).digest("hex");

const reverse = s => s.split("").reverse().join("");

const generateRandomIP = () => Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 254)).join(".");

function genKEY() {
    const r = String(Math.floor(Math.random() * 1e11));
    const h1 = reverse(md5(deepaiAgent + r + SALT));
    const h2 = reverse(md5(deepaiAgent + h1));
    const h3 = reverse(md5(deepaiAgent + h2));
    return `tryit-${r}-${h3}`;
}

async function editImage(buffer, prompt) {
    let lastError = "request failed";

    for (let i = 0; i < 6; i++) {
        const form = new FormData();
        form.append("image", buffer, { filename: "image.jpg", contentType: "image/jpeg" });
        form.append("text", prompt);
        form.append("image_generator_version", "standard");

        try {
            const response = await axios.post("https://api.deepai.org/api/image-editor", form, {
                headers: {
                    ...form.getHeaders(),
                    'accept': '*/*',
                    'origin': 'https://deepai.org',
                    'referer': 'https://deepai.org/',
                    'user-agent': deepaiAgent,
                    'api-key': genKEY(),
                    'x-forwarded-for': generateRandomIP()
                },
                timeout: 60000
            });

            const json = response.data;
            if (json?.output_url) {
                const imageResponse = await axios.get(json.output_url, { responseType: 'arraybuffer' });
                return {
                    success: true,
                    buffer: Buffer.from(imageResponse.data),
                    url: json.output_url,
                    id: json.id
                };
            }
            lastError = json?.status || `HTTP ${response.status}`;
        } catch (e) {
            lastError = e.message;
        }
    }
    return { success: false, error: lastError };
}

pcmd({
    pattern: "imageedit2",
    aliases: ["deepai", "dimage", "editai"],
    category: "Ai",
    description: "Edit image using DeepAI (remove objects, add elements)"
}, async (from, client, conText) => {
    const { q, mek, quoted, quotedMsg, reply, isSuperUser } = conText;

    if (!isSuperUser) return reply("❌ Owner Only Command!");

    if (!quotedMsg || !quoted?.imageMessage) {
        return reply(`📌 *DeepAI Image Editor*

Edit images using AI - remove objects, add elements, or change style.

*Usage:*
Reply to an image with: .deepedit remove the person
.deepedit make it look like a painting

*Examples:*
.deepedit remove the background
.deepedit add a sunset
.deepedit make it cartoon style`);
    }

    if (!q) {
        return reply("❌ Provide a prompt!\nExample: .deepedit remove the person");
    }

    let tempFilePath = null;

    try {
        tempFilePath = await client.downloadAndSaveMediaMessage(quoted.imageMessage);
        const buffer = fs.readFileSync(tempFilePath);

        if (buffer.length > 10 * 1024 * 1024) {
            return reply("❌ Image too large! Max 10MB.");
        }

        const result = await editImage(buffer, q);

        if (!result.success) {
            return reply(`❌ Error: ${result.error}`);
        }

        await client.sendMessage(from, {
            image: result.buffer,
        }, { quoted: mek });

    } catch (err) {
        console.error("deepedit error:", err);
        await reply(`❌ Error: ${err.message}`);
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch {}
        }
    }
});

// (removed duplicate "rc" command)

pcmd({
  pattern: "gpt",
  aliases: ['ai', 'ask'],
  category: "gpt",
  description: "Chat with GPT AI",
}, async (from, client, conText) => {
  const { mek, reply, api, react, arg, sender, pushName } = conText;

  if (!arg || arg.length === 0) {
    await react("❓");
    return reply(`🤖 *PRIME AI*\n\nAsk me anything!\n\nExample: gpt What is JavaScript?`);
  }

  try {
    const question = arg.join(' ');

    const lastConv = await getLastConversation(sender);
    let context = '';

    if (lastConv) {
      context = `Previous conversation:\nYou: ${lastConv.user}\nAI: ${lastConv.ai}\n\nCurrent question: ${question}`;
    }

    const apiUrl = `${api}/ai/gpt?q=${encodeURIComponent(context || question)}`;
    const response = await axios.get(apiUrl);

    if (response.data.status && response.data.result) {
      const aiResponse = response.data.result;

      await saveConversation(sender, question, aiResponse);

      await reply(`${aiResponse}`);
    } else {
      await reply("❌ Sorry, I couldn't process your request at the moment.");
    }

  } catch (error) {
    console.error("gpt error:", error);
    await reply(`❌ Error: ${error.message}`);
  }
});

pcmd({
  pattern: "gpthistory",
  aliases: ['aihistory', 'chathistory'],
  category: "gpt",
  description: "View GPT conversation history",
}, async (from, client, conText) => {
  const { reply, react, sender, pushName } = conText;

  try {
    await react("📚");

    const history = await getConversationHistory(sender, 5);

    if (!history.length) {
      return reply(`📚 *Chat History*\n\nNo previous conversations found. Start chatting with *gpt <question>*`);
    }

    let historyMsg = `📚 *Chat History for ${pushName}*\n\n`;

    history.forEach((conv, index) => {
      const shortUser = conv.user.length > 30 ? conv.user.substring(0, 30) + '...' : conv.user;
      const shortAI = conv.ai.length > 30 ? conv.ai.substring(0, 30) + '...' : conv.ai;

      historyMsg += `*${index + 1}. You:* ${shortUser}\n   *AI:* ${shortAI}\n\n`;
    });

    historyMsg += `_Total conversations: ${history.length}_`;

    await reply(historyMsg);

  } catch (error) {
    console.error("gpt history error:", error);
    await react("❌");
    await reply(`❌ Error: ${error.message}`);
  }
});

pcmd({
  pattern: "lastchat",
  aliases: ['last conversation', 'previous chat'],
  react: "🕒",
  category: "gpt",
  description: "Get last GPT conversation",
}, async (from, client, conText) => {
  const { reply, react, sender, pushName } = conText;

  try {
    const lastConv = await getLastConversation(sender);

    if (!lastConv) {
      return reply(`🕒 *Last Conversation*\n\nNo previous conversation found. Start chatting with *gpt <question>*`);
    }

    const lastChatMsg = `🕒 *Last Conversation*\n\n💬 *You:* ${lastConv.user}\n\n🤖 *AI:* ${lastConv.ai}`;

    await reply(lastChatMsg);

  } catch (error) {
    console.error("lastchat error:", error);
    await reply(`❌ Error: ${error.message}`);
  }
});

pcmd({
  pattern: "clearai",
  aliases: ['cleargpt', 'clearchat', 'deletehistory'],
  category: "gpt",
  description: "Clear GPT conversation history",
}, async (from, client, conText) => {
  const { reply, react, sender, pushName } = conText;

  try {
    await react("🗑️");

    let cleared = await clearConversationHistory(sender);
    // also reset the in-memory .gpt5 / chatbot conversation memory
    try {
      const ai = require('../lib/aiClient');
      const a = ai.clearMemory(`gpt5:${sender || from}`);
      const b = ai.clearMemory(`chatbot:${from}:${sender || from}`);
      cleared = cleared || a || b;
    } catch {}

    if (cleared) {
      await reply(`🗑️ *Chat History Cleared*\n\nAll your conversation history with GPT has been deleted successfully.`);
    } else {
      await reply(`ℹ️ *No History Found*\n\nYou don't have any conversation history to clear.`);
    }

  } catch (error) {
    console.error("clearai error:", error);
    await react("❌");
    await reply(`❌ Error: ${error.message}`);
  }
});

