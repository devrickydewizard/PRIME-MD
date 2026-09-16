const { cmd } = require("../lib");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const os = require("os");

function extractStatusPayload(quoted, quotedMsg, msg) {
  const candidates = [
    quoted,
    quotedMsg,
    msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage,
    msg?.message,
  ].filter(Boolean);

  for (const m of candidates) {
    if (!m || typeof m !== "object") continue;

    let inner = m;
    if (m.ephemeralMessage?.message) inner = m.ephemeralMessage.message;
    if (m.viewOnceMessage?.message) inner = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2?.message) inner = m.viewOnceMessageV2.message;
    if (m.documentWithCaptionMessage?.message)
      inner = m.documentWithCaptionMessage.message;

    if (inner.imageMessage)
      return { type: "image", content: inner.imageMessage, raw: inner };
    if (inner.videoMessage)
      return { type: "video", content: inner.videoMessage, raw: inner };
    if (inner.audioMessage)
      return { type: "audio", content: inner.audioMessage, raw: inner };
    if (inner.stickerMessage)
      return { type: "sticker", content: inner.stickerMessage, raw: inner };
    if (inner.documentMessage)
      return { type: "document", content: inner.documentMessage, raw: inner };
    if (inner.extendedTextMessage || inner.conversation) {
      const text = inner.extendedTextMessage?.text || inner.conversation || "";
      if (text) return { type: "text", content: text, raw: inner };
    }
  }
  return null;
}

async function downloadToTemp(sock, msg, mediaNode, type) {
  const tmpDir = path.join(os.tmpdir(), "PRIME-MD-status");
  fs.mkdirSync(tmpDir, { recursive: true });
  const ext =
    type === "video"
      ? "mp4"
      : type === "audio"
        ? "ogg"
        : type === "sticker"
          ? "webp"
          : type === "document"
            ? "bin"
            : "jpg";
  const file = path.join(
    tmpDir,
    `st_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  );

  const buffer = await downloadMediaMessage(
    { key: msg.key, message: { [`${type}Message`]: mediaNode } },
    "buffer",
    {},
    { logger: console, reuploadRequest: sock.updateMediaMessage }
  );

  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error("Download failed");
  fs.writeFileSync(file, buffer);
  return file;
}

cmd(
  {
    pattern: "savestatus",
    aliases: ["ss", "save", "getstatus", "svstatus"],
    react: "📥",
    category: "general",
    description:
      "Save a status — forward a status to the bot or reply with .savestatus (all users)",
  },
  async (from, sock, conText) => {
    const { reply, quoted, quotedMsg, msg } = conText;

    const payload = extractStatusPayload(quoted, quotedMsg, msg);

    if (!payload) {
      return reply(
        `📥 *Save Status*\n\n` +
          `*How to use (anyone can use this):*\n` +
          `1. Open the status\n` +
          `2. Tap Share / Forward → send it to this bot\n` +
          `3. Or reply to the forwarded status with \`.savestatus\`\n\n` +
          `The bot sends the media back to *you*.`
      );
    }

    try {
      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      const target = from;

      if (payload.type === "text") {
        await sock.sendMessage(
          target,
          { text: `📌 *Saved status*\n\n${payload.content}` },
          { quoted: msg }
        );
      } else {
        const file = await downloadToTemp(
          sock,
          msg,
          payload.content,
          payload.type
        );
        const caption = payload.content.caption
          ? `📌 *Saved status*\n\n${payload.content.caption}`
          : "📌 *Saved status*";

        try {
          if (payload.type === "image") {
            await sock.sendMessage(
              target,
              { image: { url: file }, caption },
              { quoted: msg }
            );
          } else if (payload.type === "video") {
            await sock.sendMessage(
              target,
              { video: { url: file }, caption },
              { quoted: msg }
            );
          } else if (payload.type === "audio") {
            await sock.sendMessage(
              target,
              {
                audio: { url: file },
                mimetype: payload.content.mimetype || "audio/ogg; codecs=opus",
                ptt: true,
              },
              { quoted: msg }
            );
          } else if (payload.type === "sticker") {
            await sock.sendMessage(
              target,
              { sticker: { url: file } },
              { quoted: msg }
            );
          } else if (payload.type === "document") {
            await sock.sendMessage(
              target,
              {
                document: { url: file },
                mimetype:
                  payload.content.mimetype || "application/octet-stream",
                fileName: payload.content.fileName || "status",
                caption,
              },
              { quoted: msg }
            );
          }
        } finally {
          try {
            fs.unlinkSync(file);
          } catch {}
        }
      }

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
    } catch (e) {
      console.error("[savestatus]", e);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await reply(`❌ Failed to save status: ${e.message}`);
    }
  }
);
