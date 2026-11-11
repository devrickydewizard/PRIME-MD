const { cmd, getExtensionFromMime, isTextContent } = require("../lib");
const axios = require("axios");
const fs = require("fs").promises;
const { sendButtons } = require("gifted-btns");
const FormData = require("form-data");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

cmd({
    pattern: "remini",
    category: "tools",
    react: "🖼️",
    aliases: ["hd", "enhance"],
    description: "Enhance image to HD. Reply to image",
    limit: true
}, async (from, sock, conText) => {
    const { mek, reply, react, botName } = conText;

    try {
        const msg = mek.message;
        const quoted = msg?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imageMsg = quoted?.imageMessage || msg?.imageMessage;

        if (!imageMsg) {
            await react("🙅‍♂️");
            return reply(`⚠️ *Usage:*\nReply to an image with .hd`);
        }

        await react("⏳");

        const stream = await downloadContentFromMessage(imageMsg, "image");
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const form = new FormData();
        form.append("method", "1");
        form.append("is_pro_version", "false");
        form.append("is_enhancing_more", "false");
        form.append("max_image_size", "high");
        form.append("file", buffer, { filename: "image.jpg", contentType: "image/jpeg" });

        const response = await axios.post("https://ihancer.com/api/enhance", form, {
            headers: form.getHeaders(),
            responseType: "arraybuffer",
            timeout: 120000
        });

        const result = Buffer.from(response.data);
        await react("✅");

        await sock.sendMessage(from, {
            image: result,
            caption: `*HD Success* ✅\n\nImage enhanced successfully\n> *Powered By ${botName}*`
        });

    } catch (err) {
        console.error("[HD ERROR]", err?.response?.data || err.message);
        await react("🙅‍♂️");
        const errorMsg = err?.response?.status === 429 ? "API is busy. Try again in 1 minute" : "Failed to enhance image";
        return reply(`⚠️ ${errorMsg}`);
    }
});

cmd(
  {
    pattern: "fetch",
    react: "🌐",
    aliases: ["get", "testapi", "curl"],
    category: "tools",
    description: "Fetch and display content from a URL",
  },
  async (from, sock, conText) => {
    const { reply, mek, q, formatAudio, formatVideo } = conText;

    if (!q) return reply("🙅‍♂️ Provide a valid URL to fetch.");

    try {
      const axios = require("axios");
      const response = await axios.get(q, {
        responseType: "arraybuffer",
        validateStatus: () => true,
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024,
      });

      const contentType =
        response.headers["content-type"] || "application/octet-stream";

      const buffer = Buffer.from(response.data);

      const urlParts = q.split("?")[0].split("/");
      let filename = urlParts.pop() || "file";
      if (filename.length > 100) filename = filename.substring(0, 100);

      if (!filename.includes(".") || filename.startsWith(".")) {
        const ext = getExtensionFromMime(contentType);
        filename = filename.replace(/^\.+/, "") || "file";
        filename += ext;
      }

      if (contentType.includes("image/")) {
        return sock.sendMessage(
          from,
          { image: buffer, caption: q },
          { quoted: mek },
        );
      }

      if (contentType.includes("video/")) {
        const formattedVideo = await formatVideo(buffer);
        return sock.sendMessage(
          from,
          { video: formattedVideo, caption: q },
          { quoted: mek },
        );
      }

      if (contentType.includes("audio/")) {
        try {
          const formattedAudio = await formatAudio(buffer);
          return sock.sendMessage(
            from,
            {
              audio: formattedAudio,
              mimetype: "audio/mpeg",
              fileName: filename,
            },
            { quoted: mek },
          );
        } catch {
          return sock.sendMessage(
            from,
            {
              audio: buffer,
              mimetype: contentType.split(";")[0],
              fileName: filename,
            },
            { quoted: mek },
          );
        }
      }

      if (isTextContent(contentType)) {
        const textContent = buffer.toString("utf-8");

        if (contentType.includes("json")) {
          try {
            const json = JSON.parse(textContent);
            const formatted = JSON.stringify(json, null, 2);
            return reply("```json\n" + formatted + "\n```");
          } catch {
            return reply(textContent);
          }
        }

        const lang = contentType.includes("javascript")
          ? "javascript"
          : contentType.includes("css")
            ? "css"
            : contentType.includes("xml")
              ? "xml"
              : contentType.includes("sql")
                ? "sql"
                : contentType.includes("yaml")
                  ? "yaml"
                  : "";
        if (lang) {
          return reply("```" + lang + "\n" + textContent + "\n```");
        }
        return reply(textContent);
      }

      return sock.sendMessage(
        from,
        {
          document: buffer,
          mimetype: contentType.split(";")[0] || "application/octet-stream",
          fileName: filename,
        },
        { quoted: mek },
      );
    } catch (err) {
      console.error("fetch error:", err);
      return reply("🙅‍♂️ Failed to fetch: " + (err.message || "Unknown error"));
    }
  },
);

cmd(
  {
    pattern: "photoeditor",
    aliases: ["photoedit", "editpic", "editphoto", "phototedit"],
    react: "🎨",
    category: "tools",
    description: "Edit photos with AI using a prompt",
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
      GiftedTechApi,
      GiftedApiKey,
      uploadToImgBB,
      botPrefix,
    } = conText;

    let imageUrl = null;
    let prompt = q?.trim() || "";

    if (quotedMsg) {
      const quotedImage = quoted?.imageMessage || quoted?.message?.imageMessage;
      if (quotedImage) {
        try {
          const tempPath = await sock.downloadAndSaveMediaMessage(
            quotedImage,
            "temp_photo",
          );
          const buffer = await fs.readFile(tempPath);
          const upload = await uploadToImgBB(buffer, "image.jpg");
          imageUrl = upload.url;
          await fs.unlink(tempPath).catch(() => {});
        } catch (e) {
          await react("🙅‍♂️");
          return reply("Failed to process the quoted image");
        }
      }
    }

    if (!imageUrl && q) {
      const parts = q.split(" ");
      if (parts[0]?.startsWith("http")) {
        imageUrl = parts[0];
        prompt = parts.slice(1).join(" ");
      }
    }

    if (!imageUrl) {
      
      return reply(
        `Please provide an image URL or quote an image with a prompt\n\nUsage: ${botPrefix}photoeditor <url> <prompt>\nOr quote an image with: ${botPrefix}photoeditor <prompt>`,
      );
    }

    if (!prompt) {
      
      return reply(
        "Please provide an editing prompt\n\nExample: .photoeditor <url> Change his shirt color to blue",
      );
    }

    await react("⏳");

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/photoeditor`, {
        params: { apikey: GiftedApiKey, url: imageUrl, prompt: prompt },
      });

      if (!res.data?.success || !res.data?.result) {
        await react("🙅‍♂️");
        return reply("Failed to edit the photo");
      }

      await sock.sendMessage(
        from,
        {
          image: { url: res.data.result },
          caption: `*PHOTO EDITOR*\n\n✨ Prompt: ${prompt}`,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("Photo editor error:", e);
      await react("🙅‍♂️");
      return reply("Failed to edit the photo: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "createpdf",
    aliases: ["topdf", "makepdf", "pdf"],
    react: "📄",
    category: "tools",
    description: "Create a PDF from text or image",
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
      GiftedTechApi,
      GiftedApiKey,
      uploadToImgBB,
      botPrefix,
    } = conText;

    const input = q?.trim() || "";
    const parts = input.split(/\s+/);
    const pdfName = parts[0] || "";
    const restContent = parts.slice(1).join(" ");

    let content = restContent;

    if (!content && quotedMsg) {
      if (quoted?.conversation || quoted?.extendedTextMessage?.text) {
        content = quoted?.conversation || quoted?.extendedTextMessage?.text;
      } else {
        const quotedImage =
          quoted?.imageMessage || quoted?.message?.imageMessage;
        if (quotedImage) {
          try {
            const tempPath = await sock.downloadAndSaveMediaMessage(
              quotedImage,
              "temp_img",
            );
            const buffer = await fs.readFile(tempPath);
            const upload = await uploadToImgBB(buffer, "image.jpg");
            content = upload.url;
            await fs.unlink(tempPath).catch(() => {});
          } catch (e) {
            await react("🙅‍♂️");
            return reply("Failed to process the quoted image");
          }
        }
      }
    }

    if (!pdfName) {
      
      return reply(
        `Please provide a PDF name and content\n\n*Usage:*\n${botPrefix}pdf <name> <text>\n${botPrefix}pdf <name> <image_url>\n${botPrefix}pdf <name> (quote a message/image)`,
      );
    }

    if (!content) {
      
      return reply(
        `Please provide content for the PDF\n\n*Usage:*\n${botPrefix}pdf <name> <text>\n${botPrefix}pdf <name> <image_url>\n${botPrefix}pdf <name> (quote a message/image)`,
      );
    }

    await react("⏳");

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/topdf`, {
        params: { apikey: GiftedApiKey, query: content },
        responseType: "arraybuffer",
      });

      const fileName = pdfName.endsWith(".pdf") ? pdfName : `${pdfName}.pdf`;

      await sock.sendMessage(
        from,
        {
          document: Buffer.from(res.data),
          mimetype: "application/pdf",
          fileName: fileName,
          caption: `> *${botFooter}*`,
        },
        { quoted: mek },
      );

      
    } catch (e) {
      console.error("Create PDF error:", e);
      await react("🙅‍♂️");
      return reply("Failed to create PDF: " + e.message);
    }
  },
);

cmd(
  {
    pattern: "domaincheck",
    aliases: ["domainstatus", "domain"],
    react: "🌐",
    category: "tools",
    description: "Check domain WHOIS information",
  },
  async (from, sock, conText) => {
    const { reply, react, q, botFooter, botName, botPrefix, GiftedTechApi, GiftedApiKey } =
      conText;

    const domain = q?.trim();
    if (!domain) {
      
      return reply(
        `Please provide a domain\n\nUsage: ${botPrefix}domaincheck example.com`,
      );
    }

    await react("⏳");

    try {
      const res = await axios.get(`${GiftedTechApi}/api/tools/whois`, {
        params: { apikey: GiftedApiKey, domain: domain },
      });

      if (!res.data?.success || !res.data?.result) {
        await react("🙅‍♂️");
        return reply("Failed to fetch domain info");
      }

      const r = res.data.result;
      let txt = `*DOMAIN CHECK*\n\n`;
      txt += `🌐 *Domain:* ${r.domainName || domain}\n`;
      txt += `📅 *Created:* ${r.creationDate ? new Date(r.creationDate * 1000).toLocaleDateString() : "N/A"}\n`;
      txt += `📅 *Expires:* ${r.expirationDate ? new Date(r.expirationDate * 1000).toLocaleDateString() : "N/A"}\n`;
      txt += `📅 *Updated:* ${r.updatedDate ? new Date(r.updatedDate * 1000).toLocaleDateString() : "N/A"}\n`;
      txt += `🏢 *Registrar:* ${r.registrar || "N/A"}\n`;
      txt += `🔒 *DNSSEC:* ${r.dnssec || "N/A"}\n`;
      if (r.nameServers?.length)
        txt += `🖥️ *Nameservers:* ${r.nameServers.join(", ")}\n`;
      if (r.states?.length) txt += `📊 *States:* ${r.states.join(", ")}\n`;
      txt += `\n> *${botFooter}*`;

      await reply(txt);
      
    } catch (e) {
      console.error("Domain check error:", e);
      await react("🙅‍♂️");
      return reply("Failed to check domain: " + e.message);
    }
  },
);

// (removed duplicate "remini" command)

cmd(
  {
    pattern: "ebinary",
    aliases: ["tobinary", "textbinary"],
    react: "🔢",
    category: "tools",
    description: "Encrypt text to binary",
  },
  async (from, sock, conText) => {
    const { reply, react, q, botFooter, botName, botPrefix } = conText;

    const text = q?.trim();
    if (!text) {
      
      return reply(`Please provide text to convert\n\nUsage: ${botPrefix}ebinary Hello`);
    }

    const binary = text
      .split("")
      .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
      .join(" ");

    await sendButtons(sock, from, {
      title: `BINARY ENCODER`,
      text: `📝 *Input:* ${text}\n\n🔢 *Binary:*\n${binary}`,
      footer: botFooter,
      buttons: [
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Copy Binary",
            copy_code: binary,
          }),
        },
      ],
    });

    
  },
);

cmd(
  {
    pattern: "debinary",
    aliases: ["dbinary", "binarytext", "frombinary"],
    react: "🔢",
    category: "tools",
    description: "Decrypt binary to text",
  },
  async (from, sock, conText) => {
    const { reply, react, q, botFooter, botName, botPrefix } = conText;

    const binary = q?.trim();
    if (!binary) {
      
      return reply(
        `Please provide binary to convert\n\nUsage: ${botPrefix}debinary 01001000 01100101 01101100 01101100 01101111`,
      );
    }

    try {
      const text = binary
        .split(" ")
        .map((b) => String.fromCharCode(parseInt(b, 2)))
        .join("");

      await sendButtons(sock, from, {
        title: `BINARY DECODER`,
        text: `🔢 *Binary:* ${binary.substring(0, 100)}${binary.length > 100 ? "..." : ""}\n\n📝 *Text:*\n${text}`,
        footer: botFooter,
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "📋 Copy Text",
              copy_code: text,
            }),
          },
        ],
      });

      
    } catch (e) {
      await react("🙅‍♂️");
      return reply("Invalid binary format");
    }
  },
);

cmd(
  {
    pattern: "ebase",
    aliases: ["tobase64", "base64encode", "ebase64"],
    react: "🔐",
    category: "tools",
    description: "Encrypt text to Base64",
  },
  async (from, sock, conText) => {
    const { reply, react, q, botFooter, botName, botPrefix } = conText;

    const text = q?.trim();
    if (!text) {
      
      return reply(
        `Please provide text to convert\n\nUsage: ${botPrefix}ebase Hello World`,
      );
    }

    const base64 = Buffer.from(text).toString("base64");

    await sendButtons(sock, from, {
      title: `BASE64 ENCODER`,
      text: `📝 *Input:* ${text}\n\n🔐 *Base64:*\n${base64}`,
      footer: botFooter,
      buttons: [
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Copy Base64",
            copy_code: base64,
          }),
        },
      ],
    });

    
  },
);

cmd(
  {
    pattern: "dbase",
    aliases: ["debase", "debase64", "base64decode", "frombase64"],
    react: "🔐",
    category: "tools",
    description: "Decrypt Base64 to text",
  },
  async (from, sock, conText) => {
    const { reply, react, q, botFooter, botName, botPrefix } = conText;

    const base64 = q?.trim();
    if (!base64) {
      
      return reply(
        `Please provide Base64 to decode\n\nUsage: ${botPrefix}dbase SGVsbG8gV29ybGQ=`,
      );
    }

    try {
      const text = Buffer.from(base64, "base64").toString("utf8");

      await sendButtons(sock, from, {
        title: `BASE64 DECODER`,
        text: `🔐 *Base64:* ${base64.substring(0, 50)}${base64.length > 50 ? "..." : ""}\n\n📝 *Text:*\n${text}`,
        footer: botFooter,
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "📋 Copy Text",
              copy_code: text,
            }),
          },
        ],
      });

      
    } catch (e) {
      await react("🙅‍♂️");
      return reply("Invalid Base64 format");
    }
  },
);

cmd(
  {
    pattern: "ssweb",
    aliases: ["fullssweb", "screenshot", "ss"],
    react: "📸",
    category: "tools",
    description: "Take a screenshot of a website",
  },
  async (from, sock, conText) => {
    const { mek, reply, react, q, botFooter, botPrefix } = conText;
    let url = q?.trim();

    if (!url) {
        return reply(`Please provide a valid URL.\n\nUsage: ${botPrefix}ssweb https://google.com`);
    }

    // Auto-add https:// if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    await react("⏳");

    // Using 11ty.dev (Free, no API key, highly reliable)
    const encodedUrl = encodeURIComponent(url);
    const apiUrl = `https://v1.screenshot.11ty.dev/${encodedUrl}/large/1:1/`;

    try {
        await sock.sendMessage(from, {
            image: { url: apiUrl },
            caption: `📸 *Screenshot:* ${url}\n\n> *${botFooter || 'PRIMETECH'}*`
        }, { quoted: mek });
        await react("✅");
    } catch (err) {
        console.error("[SSWEB] Error:", err.message);
        await react("🙅‍♂️");
        await reply(`❌ Failed to generate screenshot. Make sure the URL is valid and public.`);
    }
  }
);

