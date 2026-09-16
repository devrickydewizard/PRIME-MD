const { cmd } = require("../lib");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const os = require("os");

function extractStatusPayload(quoted, quotedMsg, m) {
  const candidates = [
    quoted,
    quotedMsg,
    m?.message?.extendedTextMessage?.contextInfo?.quotedMessage,
    m?.message,
  ].filter(Boolean);

  for (const msg of candidates) {
    if (!msg || typeof msg !== "object") continue;
    let inner = msg;
    if (msg.ephemeralMessage?.message) inner = msg.ephemeralMessage.message;
    if (msg.viewOnceMessage?.message) inner = msg.viewOnceMessage.message;
    if (msg.viewOnceMessageV2?.message) inner = msg.viewOnceMessageV2.message;
    if (msg.documentWithCaptionMessage?.message)
      inner = msg.documentWithCaptionMessage.message;

    if (inner.imageMessage)
      return { type: "image", content: inner.imageMessage };
    if (inner.videoMessage)
      return { type: "video", content: inner.videoMessage };
    if (inner.audioMessage)
      return { type: "audio", content: inner.audioMessage };
    if (inner.stickerMessage)
      return { type: "sticker", content: inner.stickerMessage };
    if (inner.documentMessage)
      return { type: "document", content: inner.documentMessage };
    if (inner.extendedTextMessage || inner.conversation) {
      const text = inner.extendedTextMessage?.text || inner.conversation || "";
      if (text) return { type: "text", content: text };
    }
  }
  return null;
}

function quotedMsgHasMedia(quoted) {
  if (!quoted) return false;
  return !!(
    quoted.imageMessage ||
    quoted.videoMessage ||
    quoted.audioMessage ||
    quoted.stickerMessage ||
    quoted.documentMessage
  );
}

function isStatusContext(m, quoted) {
  const ctx =
    m?.message?.extendedTextMessage?.contextInfo ||
    m?.message?.imageMessage?.contextInfo ||
    m?.message?.videoMessage?.contextInfo ||
    null;
  if (ctx?.remoteJid === "status@broadcast") return true;
  if (quotedMsgHasMedia(quoted)) return true;
  return false;
}

/** Always deliver to the user's private DM with the bot — never group, never owner. */
function privateDmJid(from, sender) {
  if (sender && typeof sender === "string" && sender.includes("@") && !sender.endsWith("@g.us")) {
    return sender;
  }
  if (from && !String(from).endsWith("@g.us")) return from;
  if (sender) return sender;
  return from;
}

async function downloadToTemp(sock, ms, mediaNode, type) {
  const tmpDir = path.join(os.tmpdir(), "PRIME-MD-status");
  fs.mkdirSync(tmpDir, { recursive: true });
  const ext =
    type === "video" ? "mp4" :
    type === "audio" ? "ogg" :
    type === "sticker" ? "webp" :
    type === "document" ? "bin" : "jpg";
  const file = path.join(
    tmpDir,
    `st_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  );
  const buffer = await downloadMediaMessage(
    { key: ms.key, message: { [`${type}Message`]: mediaNode } },
    "buffer",
    {},
    { logger: console, reuploadRequest: sock.updateMediaMessage }
  );
  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error("Download failed");
  fs.writeFileSync(file, buffer);
  return file;
}

async function sendSaved(sock, targetChat, ms, payload) {
  if (payload.type === "text") {
    await sock.sendMessage(
      targetChat,
      { text: `📌 *Saved status*\n\n${payload.content}` },
      { quoted: ms }
    );
    return;
  }
  const file = await downloadToTemp(sock, ms, payload.content, payload.type);
  const caption = payload.content.caption
    ? `📌 *Saved status*\n\n${payload.content.caption}`
    : "📌 *Saved status*";
  try {
    if (payload.type === "image") {
      await sock.sendMessage(targetChat, { image: { url: file }, caption }, { quoted: ms });
    } else if (payload.type === "video") {
      await sock.sendMessage(targetChat, { video: { url: file }, caption }, { quoted: ms });
    } else if (payload.type === "audio") {
      await sock.sendMessage(
        targetChat,
        {
          audio: { url: file },
          mimetype: payload.content.mimetype || "audio/ogg; codecs=opus",
          ptt: true,
        },
        { quoted: ms }
      );
    } else if (payload.type === "sticker") {
      await sock.sendMessage(targetChat, { sticker: { url: file } }, { quoted: ms });
    } else if (payload.type === "document") {
      await sock.sendMessage(
        targetChat,
        {
          document: { url: file },
          mimetype: payload.content.mimetype || "application/octet-stream",
          fileName: payload.content.fileName || "status",
          caption,
        },
        { quoted: ms }
      );
    }
  } finally {
    try { fs.unlinkSync(file); } catch {}
  }
}

cmd(
  {
    pattern: "savestatus",
    aliases: ["ss", "save", "getstatus", "svstatus"],
    react: "📥",
    category: "general",
    description:
      "Save status to your private DM with the bot. Forward status or reply with emoji.",
  },
  async (from, sock, conText) => {
    const { reply, quoted, quotedMsg, m, mek, react, sender } = conText;
    const ms = m || mek;
    // Private DM of the user who asked — never group, never owner
    const targetChat = privateDmJid(from, sender);

    if (!ms || !ms.key) return reply("❌ Message object missing.");

    const payload = extractStatusPayload(quoted, quotedMsg, ms);
    if (!payload) {
      return reply(
        `📥 *Save Status*\n\n` +
          `1. Forward a status to this bot\n` +
          `2. Reply with any emoji/text or \`.savestatus\`\n\n` +
          `Saved file goes to *your private chat with the bot* only.`
      );
    }

    try {
      try { await react("⏳"); } catch {}
      await sendSaved(sock, targetChat, ms, payload);
      if (String(from).endsWith("@g.us")) {
        await reply("✅ Saved — check your *private chat* with the bot.");
      }
      try { await react("✅"); } catch {}
    } catch (e) {
      console.error("[savestatus]", e);
      await reply(`❌ Failed to save status: ${e.message}`);
    }
  }
);

// Auto on reply (emoji/text) to status/media
cmd(
  {
    pattern: /.*/,
    on: "body",
    dontAddCommandList: true,
    category: "general",
  },
  async (from, sock, conText) => {
    const { quoted, quotedMsg, m, mek, body, isCmd, sender } = conText;
    const ms = m || mek;
    if (!ms || !ms.key || isCmd) return;

    const b = (body || "").trim();
    if (!b || /^(savestatus|ss|save|getstatus|svstatus)\b/i.test(b)) return;

    const payload = extractStatusPayload(quoted, quotedMsg, ms);
    if (!payload || payload.type === "text") return;
    if (!isStatusContext(ms, quoted) && !quotedMsgHasMedia(quoted)) return;

    const targetChat = privateDmJid(from, sender);

    try {
      await sendSaved(sock, targetChat, ms, payload);
      try {
        await sock.sendMessage(from, { react: { text: "✅", key: ms.key } });
      } catch {}
      if (String(from).endsWith("@g.us")) {
        try {
          await sock.sendMessage(from, {
            text: "✅ Saved to your private chat with the bot.",
          }, { quoted: ms });
        } catch {}
      }
    } catch (e) {
      console.error("[savestatus-auto]", e?.message || e);
    }
  }
);
