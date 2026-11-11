// PRIME plugin: Fancy.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const axios = require('axios');

const fs = require('fs-extra');

const path = require('path');

pcmd({
  pattern: "vcard",
  aliases: ["contact", "card"],
  category: "General",
  description: "Create and send a vCard contact",
  filename: __filename
}, async (from, client, { mek, reply, q }) => {
  if (!q) {
    return reply("📌 Usage: .vcard <name> <number>\nExample: .vcard John 254757047860");
  }

  const args = q.trim().split(/\s+/);
  if (args.length < 2) {
    return reply("❌ Please provide both a name and a number.\nExample: .vcard John 254757047860");
  }

  // Extract number and name
  const possibleNumber = args.find(part => /^\d+$/.test(part));
  if (!possibleNumber || possibleNumber.length < 5) {
    return reply("❌ Please provide a valid phone number (at least 5 digits).");
  }
  const targetNumber = possibleNumber;
  const targetName = args.filter(part => part !== possibleNumber).join(" ").trim();

  if (!targetName) {
    return reply("❌ Please provide a name along with the number.");
  }

  // Build vCard
  const vcard =
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    `FN:${targetName}\n` +
    'ORG:;\n' +
    `TEL;type=CELL;type=VOICE;waid=${targetNumber}:+${targetNumber}\n` +
    'END:VCARD';

  // Send contact
  try {
    await client.sendMessage(from, {
      contacts: {
        displayName: targetName,
        contacts: [{ vcard }],
      },
    }, { quoted: mek });
  } catch (error) {
    console.error("Error sending vCard:", error);
    reply("❌ Failed to send contact card.");
  }
});

pcmd({
  pattern: "sharephone",
  aliases: ["sharecontact", "spn", "sharenumber"],
  category: "tools",
  description: "Share your phone number in chat"
}, async (from, client, conText) => {
  const { q } = conText;

  try {
    // Default to current chat if no JID provided
    const jid = q && q.includes("@s.whatsapp.net") ? q : from;

    await client.sendMessage(jid, {
      sharePhoneNumber: {}
    });

  } catch (err) {
    console.error("sharephone error:", err);
  }
});

pcmd({
  pattern: "onwhatsapp",
  aliases: ["checkwa", "waexists", "wa"],
  category: "tools",
  description: "Check if a number exists on WhatsApp"
}, async (from, client, conText) => {
  const { reply, q } = conText;

  if (!q) {
    return reply("📌 Usage: .onwhatsapp <number>\n\nExample:\n.onwhatsapp 254757047860");
  }

  try {
    // Normalize number into WhatsApp JID
    const jid = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    const [result] = await client.onWhatsApp(jid);

    if (result?.exists) {
      return reply(`✅ ${q} exists on WhatsApp\nJID: ${result.jid}`);
    } else {
      return reply(`❌ ${q} does not exist on WhatsApp`);
    }
  } catch (err) {
    console.error("onwhatsapp error:", err);
    return reply("❌ Failed to check WhatsApp number.");
  }
});

pcmd({
  pattern: "gitclone",
  aliases: ["zip", "repozip"],
  description: "Clone GitHub/GitLab repo and return as zip",
  category: "General",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, q, reply } = conText;

  if (!q) {
    return reply("📌 Provide a repo URL.\nExamples:\n.gitclone https://github.com/owner/repository\n.gitclone https://gitlab.com/owner/repository");
  }

  try {
    let repoUrl = q.trim();
    let zipUrl, fileName;

    if (repoUrl.startsWith("https://github.com/")) {
      // GitHub
      const parts = repoUrl.replace("https://github.com/", "").split("/");
      if (parts.length < 2) return reply("❌ Invalid GitHub repo URL format.");
      const owner = parts[0];
      const repo = parts[1];
      zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`;
      fileName = `${repo}-main.zip`;
    } else if (repoUrl.startsWith("https://gitlab.com/")) {
      // GitLab
      const parts = repoUrl.replace("https://gitlab.com/", "").split("/");
      if (parts.length < 2) return reply("❌ Invalid GitLab repo URL format.");
      const owner = parts[0];
      const repo = parts[1];
      // Default branch = main
      zipUrl = `https://gitlab.com/${owner}/${repo}/-/archive/main/${repo}-main.zip?ref_type=heads`;
      fileName = `${repo}-main.zip`;
    } else {
      return reply("❌ Only GitHub or GitLab repo URLs are supported.");
    }

    // Download zip
    const tmpDir = path.join(__dirname, "..", "tmp");
    await fs.ensureDir(tmpDir);
    const filePath = path.join(tmpDir, fileName);

    const response = await axios.get(zipUrl, { responseType: "arraybuffer" });
    await fs.writeFile(filePath, response.data);

    // Send zip as document
    await client.sendMessage(from, {
      document: { url: filePath },
      mimetype: "application/zip",
      fileName
    }, { quoted: mek });

    // Cleanup
    try { fs.unlinkSync(filePath); } catch {}

  } catch (err) {
    console.error("gitclone error:", err);
    await reply("❌ Failed to clone repo. Error: " + err.message);
  }
});

pcmd({
  pattern: "fancy",
  aliases: ["fancytext", "font", "style", "fancystyle"],
  category: "tools",
  description: "Generate fancy text styles and select by number"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply, api } = conText;

  let text;
  if (q) {
    text = q;
  } else if (quotedMsg) {
    text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) return reply("❌ Could not extract quoted text.");
  } else {
    return reply("📌 Provide text or reply to a message.");
  }

  try {
    // First API: get all styles
    const apiUrl = `${api}/fancytext/styles?q=${encodeURIComponent(text)}`;
    const { data } = await axios.get(apiUrl, { timeout: 60000 });

    if (!data || !Array.isArray(data.styles)) {
      return reply("❌ Failed to fetch fancy styles.");
    }

    // Build numbered list showing actual fancy results (fallback to name if blank)
    let caption = `✨ Fancy styles for: *${data.input}*\n\n`;
    data.styles.forEach((style, i) => {
      caption += `${i + 1}. ${style.result || style.name}\n`;
    });
    caption += `\n📌 Reply with the style number to get the fancy text.`;

    const sent = await client.sendMessage(from, { text: caption }, { quoted: mek });
    const messageId = sent.key.id;

    // Listen for reply with number
    client.ev.on("messages.upsert", async (update) => {
      const msg = update.messages[0];
      if (!msg.message) return;

      const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
      const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
      const chatId = msg.key.remoteJid;

      if (!isReply) return;

      const num = parseInt(responseText.trim(), 10);
      if (isNaN(num) || num < 1 || num > data.styles.length) {
        return client.sendMessage(chatId, {
          text: `❌ Invalid style number. Reply with a number between 1 and ${data.styles.length}.`,
          quoted: msg
        });
      }

      try {
        // Second API: fix off-by-one by subtracting 1
        const index = num - 1;
        const styleUrl = `${api}/fancytext?q=${encodeURIComponent(text)}&style=${index}`;
        const res = await axios.get(styleUrl, { timeout: 60000 });
        const styled = res.data?.result;

        if (!styled) {
          return client.sendMessage(chatId, {
            text: "❌ Failed to generate fancy text.",
            quoted: msg
          });
        }

        await client.sendMessage(chatId, { text: styled }, { quoted: msg });
      } catch (err) {
        console.error("Fancy error:", err);
        await client.sendMessage(chatId, {
          text: `❌ Error generating fancy text: ${err.message}`,
          quoted: msg
        });
      }
    });

  } catch (error) {
    console.error("Fancy text error:", error);
    reply("⚠️ An error occurred while fetching fancy styles.");
  }
});

pcmd({
  pattern: "langcodes",
  aliases: ["langcode", "langs"],
  category: "tools",
  description: "List available language codes for translation"
},
async (from, client, conText) => {
  const { reply } = conText;

  try {
    const langs = [
      ["af","Afrikaans"],["sq","Albanian"],["am","Amharic"],["ar","Arabic"],["hy","Armenian"],["az","Azerbaijani"],["eu","Basque"],["be","Belarusian"],["bn","Bengali"],["bs","Bosnian"],["bg","Bulgarian"],["ca","Catalan"],["zh","Chinese"],["hr","Croatian"],["cs","Czech"],["da","Danish"],["nl","Dutch"],["en","English"],["eo","Esperanto"],["et","Estonian"],["fi","Finnish"],["fr","French"],["gl","Galician"],["ka","Georgian"],["de","German"],["el","Greek"],["gu","Gujarati"],["ha","Hausa"],["he","Hebrew"],["hi","Hindi"],["hu","Hungarian"],["is","Icelandic"],["ig","Igbo"],["id","Indonesian"],["ga","Irish"],["it","Italian"],["ja","Japanese"],["jv","Javanese"],["kn","Kannada"],["kk","Kazakh"],["km","Khmer"],["ko","Korean"],["ku","Kurdish"],["lo","Lao"],["lv","Latvian"],["lt","Lithuanian"],["mk","Macedonian"],["mg","Malagasy"],["ms","Malay"],["ml","Malayalam"],["mt","Maltese"],["mr","Marathi"],["mn","Mongolian"],["my","Myanmar"],["ne","Nepali"],["no","Norwegian"],["fa","Persian"],["pl","Polish"],["pt","Portuguese"],["pa","Punjabi"],["ro","Romanian"],["ru","Russian"],["sr","Serbian"],["sn","Shona"],["sd","Sindhi"],["si","Sinhala"],["sk","Slovak"],["sl","Slovenian"],["so","Somali"],["es","Spanish"],["su","Sundanese"],["sw","Swahili"],["sv","Swedish"],["tl","Filipino"],["ta","Tamil"],["te","Telugu"],["th","Thai"],["tr","Turkish"],["uk","Ukrainian"],["ur","Urdu"],["uz","Uzbek"],["vi","Vietnamese"],["cy","Welsh"],["xh","Xhosa"],["yo","Yoruba"],["zu","Zulu"]
    ].map(([code, name]) => ({ code, name }));
    if (langs.length === 0) {
      return reply("❌ No language codes found.");
    }

    // Build list: code → name
    const list = langs.map(l => `${l.code} → ${l.name}`).join("\n");

    reply(`🌐 Available Language Codes:\n\n${list}`);
  } catch (err) {
    console.error("Langcodes error:", err);
    reply("❌ Failed to fetch language codes.");
  }
});

pcmd({
  pattern: "translate",
  aliases: ["trt", "tl"],
  category: "tools",
  description: "Translate quoted text into target language"
},
async (from, client, conText) => {
  const { q, quotedMsg, reply, api } = conText;

  if (!quotedMsg) {
    return reply("📌 Reply to a message with `.translate <langcode>`");
  }

  if (!q || typeof q !== "string") {
    return reply("❌ Missing target language code. Example: `.translate en`");
  }

  try {
    // Extract text from quoted message
    const text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) {
      return reply("❌ Could not extract quoted text.");
    }

    // Call translate API
    const apiUrl = `${api}/translate?text=${encodeURIComponent(text)}&to=${encodeURIComponent(q)}`;
    const { data } = await axios.get(apiUrl, { timeout: 100000 });

    const result = data?.result;
    if (!result?.translatedText) {
      return reply("❌ Translation failed.");
    }

    // Reply with translated text only
    reply(result.translatedText);
  } catch (err) {
    console.error("Translate error:", err);
    reply("❌ Error translating text.");
  }
});

