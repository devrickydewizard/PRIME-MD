const { cmd } = require("../lib");
const axios = require("axios");
const fs = require("fs").promises;
const { sendButtons } = require("gifted-btns");
const path = require("path");

cmd(
  {
    pattern: "ssphone",
    aliases: ["ssmobile", "phoness"],
    react: "📱",
    category: "tools",
    description: "Take a screenshot of a website (mobile view)",
  },
  async (from, sock, conText) => {
    const {
      mek,
      reply,
      react,
      q,
      botFooter,
      botName,
      GiftedTechApi,
      GiftedApiKey,
    } = conText;

    const url = q?.trim();
    if (!url) {
      
      return reply(
        "Please provide a URL\n\nUsage: .ssphone https://google.com",
      );
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/ssphone`, {
        params: { apikey: GiftedApiKey, url: url },
        responseType: "arraybuffer",
      });

      await sock.sendMessage(
        from,
        {
          image: Buffer.from(res.data),
          caption: `*${botName} SCREENSHOT*\n\n🌐 ${url}\n📱 Mobile View*`,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("Screenshot error:", e);
      await react("🙅‍♂️");
      return reply("Failed to capture screenshot: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "sstab",
    aliases: ["sstablet", "tabletss"],
    react: "📱",
    category: "tools",
    description: "Take a screenshot of a website (tablet view)",
  },
  async (from, sock, conText) => {
    const {
      mek,
      reply,
      react,
      q,
      botFooter,
      botName,
      GiftedTechApi,
      GiftedApiKey,
    } = conText;

    const url = q?.trim();
    if (!url) {
      
      return reply("Please provide a URL\n\nUsage: .sstab https://google.com");
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/sstab`, {
        params: { apikey: GiftedApiKey, url: url },
        responseType: "arraybuffer",
      });

      await sock.sendMessage(
        from,
        {
          image: Buffer.from(res.data),
          caption: `*${botName} SCREENSHOT*\n\n🌐 ${url}\n📱 Tablet View*`,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("Screenshot error:", e);
      await react("🙅‍♂️");
      return reply("Failed to capture screenshot: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "sspc",
    aliases: ["pcss", "desktopss"],
    react: "🖥️",
    category: "tools",
    description: "Take a screenshot of a website (PC view)",
  },
  async (from, sock, conText) => {
    const {
      mek,
      reply,
      react,
      q,
      botFooter,
      botName,
      GiftedTechApi,
      GiftedApiKey,
    } = conText;

    const url = q?.trim();
    if (!url) {
      
      return reply("Please provide a URL\n\nUsage: .sspc https://google.com");
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/sspc`, {
        params: { apikey: GiftedApiKey, url: url },
        responseType: "arraybuffer",
      });

      await sock.sendMessage(
        from,
        {
          image: Buffer.from(res.data),
          caption: `*${botName} SCREENSHOT*\n\n🌐 ${url}\n🖥️ Desktop View*`,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("Screenshot error:", e);
      await react("🙅‍♂️");
      return reply("Failed to capture screenshot: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "createqr",
    aliases: ["toqr", "qrcode", "makeqr"],
    react: "📱",
    category: "tools",
    description: "Create a QR code from text or link",
  },
  async (from, sock, conText) => {
    const {
      mek,
      reply,
      react,
      q,
      quoted,
      quotedMsg,
      botFooter,
      botName,
      botPrefix,
      GiftedTechApi,
      GiftedApiKey,
    } = conText;

    let content = q?.trim();

    if (!content && quotedMsg) {
      content = quoted?.conversation || quoted?.extendedTextMessage?.text;
    }

    if (!content) {
      
      return reply(
        `Please provide text or a link\n\nUsage: ${botPrefix}createqr Hello World\nOr quote a message`,
      );
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/createqr`, {
        params: { apikey: GiftedApiKey, query: content },
        responseType: "arraybuffer",
      });

      await sock.sendMessage(
        from,
        {
          image: Buffer.from(res.data),
          caption: `*${botName} QR CODE*\n\n📝 Content: ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}*`,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("Create QR error:", e);
      await react("🙅‍♂️");
      return reply("Failed to create QR code: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "readqr",
    aliases: ["decodeqr", "scanqr"],
    react: "📱",
    category: "tools",
    description: "Read/decode a QR code from an image",
  },
  async (from, sock, conText) => {
    const {
      reply,
      react,
      q,
      quoted,
      quotedMsg,
      botFooter,
      botName,
      botPrefix,
      GiftedTechApi,
      GiftedApiKey,
      uploadToImgBB,
    } = conText;

    let imageUrl = q?.trim();

    if (!imageUrl && quotedMsg) {
      const quotedImage = quoted?.imageMessage || quoted?.message?.imageMessage;
      if (quotedImage) {
        try {
          const tempPath = await sock.downloadAndSaveMediaMessage(
            quotedImage,
            "temp_qr",
          );
          const buffer = await fs.readFile(tempPath);
          const upload = await uploadToImgBB(buffer, "qr.jpg");
          imageUrl = upload.url;
          await fs.unlink(tempPath).catch(() => {});
        } catch (e) {
          await react("🙅‍♂️");
          return reply("Failed to process the quoted image");
        }
      }
    }

    if (!imageUrl) {
      
      return reply(
        `Please provide a QR code image URL or quote an image\n\nUsage: ${botPrefix}readqr <url>\nOr quote an image`,
      );
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/readqr`, {
        params: { apikey: GiftedApiKey, url: imageUrl },
      });

      if (!res.data?.success) {
        await react("🙅‍♂️");
        return reply("Failed to read QR code or no QR code found in image");
      }

      const rawResult = res.data.result || res.data.data;
      const qrContent = typeof rawResult === 'object' ? (rawResult.qrcode_data || rawResult.data || JSON.stringify(rawResult)) : rawResult;

      await sendButtons(sock, from, {
        title: `${botName} QR READER`,
        text: `📱 *QR Code Content:*\n\n${qrContent}`,
        footer: botFooter,
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "📋 Copy Content",
              copy_code: qrContent,
            }),
          },
        ],
      });

      
    } catch (e) {
      console.error("Read QR error:", e);
      await react("🙅‍♂️");
      return reply("Failed to read QR code: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "ttp",
    aliases: ["textpic", "texttoimage"],
    react: "🎨",
    category: "tools",
    description: "Convert text to picture sticker",
  },
  async (from, sock, conText) => {
    const {
      mek,
      reply,
      react,
      q,
      botName,
      botPrefix,
      GiftedTechApi,
      GiftedApiKey,
      packName,
      packAuthor,
    } = conText;

    const text = q?.trim();
    if (!text) {
      
      return reply(`Please provide text\n\nUsage: ${botPrefix}ttp Hello World`);
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/ttp`, {
        params: { apikey: GiftedApiKey, query: text },
      });

      if (!res.data?.success || !res.data?.image_url) {
        await react("🙅‍♂️");
        return reply("Failed to create text image");
      }

      const imgRes = await axios.get(res.data.image_url, {
        responseType: "arraybuffer",
      });

      await sock.sendMessage(
        from,
        {
          sticker: Buffer.from(imgRes.data),
          packname: packName || botName,
          author: packAuthor || botName,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("TTP error:", e);
      await react("🙅‍♂️");
      return reply("Failed to create sticker: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "define",
    aliases: ["meaning", "urban", "dictionary"],
    react: "📖",
    category: "tools",
    description: "Get the meaning/definition of a word",
  },
  async (from, sock, conText) => {
    const { reply, react, q, botFooter, botName, botPrefix, GiftedTechApi, GiftedApiKey } =
      conText;

    const term = q?.trim();
    if (!term) {
      
      return reply(`Please provide a word to define\n\nUsage: ${botPrefix}define hello`);
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/define`, {
        params: { apikey: GiftedApiKey, term: term },
      });

      if (!res.data?.success || !res.data?.results?.length) {
        await react("🙅‍♂️");
        return reply("No definitions found for: " + term);
      }

      const definitions = res.data.results.slice(0, 5);

      let txt = `*${botName} DICTIONARY*\n\n`;
      txt += `📖 *Word:* ${term}\n\n`;

      definitions.forEach((def, i) => {
        const cleanDef = def.definition.replace(/\[([^\]]+)\]/g, "$1");
        const cleanExample = def.example?.replace(/\[([^\]]+)\]/g, "$1");
        txt += `*${i + 1}. ${def.word}*\n`;
        txt += `📝 ${cleanDef}\n`;
        if (cleanExample) txt += `💬 _"${cleanExample}"_\n`;
        txt += `👤 by ${def.author}\n\n`;
      });

      txt += `> *${botFooter}*`;

      await reply(txt);
      
    } catch (e) {
      console.error("Define error:", e);
      await react("🙅‍♂️");
      return reply("Failed to get definition: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "web2zip",
    aliases: ["webtozip", "webdl", "dlweb", "downloadweb"],
    react: "📦",
    category: "tools",
    description: "Download a website as a ZIP file",
  },
  async (from, sock, conText) => {
    const {
      mek,
      reply,
      react,
      q,
      botFooter,
      botName,
      botPrefix,
      GiftedTechApi,
      GiftedApiKey,
    } = conText;

    const url = q?.trim();
    if (!url) {
      
      return reply(
        `Please provide a URL\n\nUsage: ${botPrefix}web2zip https://example.com`,
      );
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/web2zip`, {
        params: { apikey: GiftedApiKey, url: url },
        responseType: "arraybuffer",
      });

      let domain;
      try {
        domain = new URL(url).hostname.replace(/[^a-z0-9]/gi, "_");
      } catch {
        domain = "website";
      }

      await sock.sendMessage(
        from,
        {
          document: Buffer.from(res.data),
          mimetype: "application/zip",
          fileName: `${domain}.zip`,
          caption: `*${botName} WEB2ZIP*\n\n🌐 ${url}*`,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("Web2zip error:", e);
      await react("🙅‍♂️");
      return reply("Failed to download website: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "emojimix",
    aliases: ["emomix", "mixemoji"],
    react: "😀",
    category: "tools",
    description: "Mix two emojis together",
  },
  async (from, sock, conText) => {
    const {
      mek,
      reply,
      react,
      q,
      botFooter,
      botName,
      botPrefix,
      GiftedTechApi,
      GiftedApiKey,
    } = conText;

    const input = q?.trim();
    if (!input) {
      
      return reply(
        `Please provide two emojis\n\nUsage: ${botPrefix}emojimix 😂:🙄\nOr: ${botPrefix}emojimix 😂🙄`,
      );
    }

    let emoji1, emoji2;

    if (input.includes(":")) {
      const parts = input.split(":");
      emoji1 = parts[0].trim();
      emoji2 = parts[1].trim();
    } else {
      const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu;
      const emojis = input.match(emojiRegex);
      if (emojis && emojis.length >= 2) {
        emoji1 = emojis[0];
        emoji2 = emojis[1];
      }
    }

    if (!emoji1 || !emoji2) {
      
      return reply(`Please provide two valid emojis\n\nUsage: ${botPrefix}emojimix 😂:🙄`);
    }

    

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/emojimix`, {
        params: { apikey: GiftedApiKey, emoji1: emoji1, emoji2: emoji2 },
        responseType: "arraybuffer",
      });

      await sock.sendMessage(
        from,
        {
          image: Buffer.from(res.data),
          caption: `*${botName} EMOJI MIX*\n\n${emoji1} + ${emoji2}*`,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("Emoji mix error:", e);
      await react("🙅‍♂️");
      return reply(
        "Failed to mix emojis. Make sure both emojis are valid and supported.",
      );
    }
  },
);

cmd(
  {
    pattern: "rename",
    aliases: ["newname", "renamefile", "rn"],
    react: "📝",
    category: "tools",
    description: "Rename a quoted document/file with a new name",
  },
  async (from, sock, conText) => {
    const {
      mek,
      reply,
      react,
      q,
      quoted,
      quotedMsg,
      getMediaBuffer,
      getFileContentType,
      botPrefix,
    } = conText;

    if (!quotedMsg) {
      
      return reply(`Please quote/reply to a document or media file\n\nUsage: ${botPrefix}rename <new filename>`);
    }

    const newName = q?.trim();
    if (!newName) {
      
      return reply(`Please provide a new filename\n\nUsage: ${botPrefix}rename <new filename>\nExample: ${botPrefix}rename my_video.mp4`);
    }

    

    try {
      let mediaMsg = null;
      let mediaType = null;
      let originalMime = null;
      let originalExt = "";

      if (quotedMsg.documentMessage || quotedMsg.documentWithCaptionMessage?.message?.documentMessage) {
        mediaMsg = quotedMsg.documentMessage || quotedMsg.documentWithCaptionMessage.message.documentMessage;
        mediaType = "document";
        originalMime = mediaMsg.mimetype || "application/octet-stream";
        if (mediaMsg.fileName) {
          const parts = mediaMsg.fileName.split(".");
          if (parts.length > 1) originalExt = "." + parts.pop();
        }
      } else if (quotedMsg.imageMessage) {
        mediaMsg = quotedMsg.imageMessage;
        mediaType = "image";
        originalMime = mediaMsg.mimetype || "image/jpeg";
        originalExt = originalMime.includes("png") ? ".png" : originalMime.includes("gif") ? ".gif" : originalMime.includes("webp") ? ".webp" : ".jpg";
      } else if (quotedMsg.videoMessage) {
        mediaMsg = quotedMsg.videoMessage;
        mediaType = "video";
        originalMime = mediaMsg.mimetype || "video/mp4";
        originalExt = ".mp4";
      } else if (quotedMsg.audioMessage) {
        mediaMsg = quotedMsg.audioMessage;
        mediaType = "audio";
        originalMime = mediaMsg.mimetype || "audio/mpeg";
        originalExt = originalMime.includes("ogg") ? ".ogg" : originalMime.includes("wav") ? ".wav" : ".mp3";
      } else if (quotedMsg.stickerMessage) {
        mediaMsg = quotedMsg.stickerMessage;
        mediaType = "sticker";
        originalMime = "image/webp";
        originalExt = ".webp";
      } else {
        await react("🙅‍♂️");
        return reply("🙅‍♂️ Please quote a document, image, video, audio, or sticker file.");
      }

      const buffer = await getMediaBuffer(mediaMsg, mediaType);

      let finalName = newName;
      if (!finalName.includes(".") && originalExt) {
        finalName = newName + originalExt;
      }

      await sock.sendMessage(
        from,
        {
          document: buffer,
          fileName: finalName,
          mimetype: originalMime,
        },
        { quoted: mek }
      );

      
    } catch (e) {
      console.error("Rename error:", e);
      await react("🙅‍♂️");
      return reply("Failed to rename file: " + e.message);
    }
  },
);
