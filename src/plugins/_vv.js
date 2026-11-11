const { cmd } = require("../lib");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

// ✅ FIX: __dirname-based path resolve environment mein corrupt/looped ho
// raha tha (symlink/packaging issue → ENOENT). os.tmpdir() based absolute
// path kisi bhi environment mein reliable hai.
const TEMP_DIR = path.join(os.tmpdir(), "PRIME-MD-temp");

async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

cmd(
  {
    pattern: "vv",
    aliases: ["‎2", "reveal2"],
    react: "🙄",
    category: "owner",
    description: "Reveal View Once Media",
  },
  async (from, sock, conText) => {
    const { reply, quoted, isSuperUser } = conText;

    if (!quoted) return reply(`Please reply to/quote a ViewOnce message`);
    if (!isSuperUser) return reply(`*This area is reserved for the bot owner only.* 🕷️`);

    let viewOnceContent, mediaType;

    if (
      quoted.imageMessage?.viewOnce ||
      quoted.videoMessage?.viewOnce ||
      quoted.audioMessage?.viewOnce
    ) {
      mediaType = Object.keys(quoted).find(
        (key) =>
          key.endsWith("Message") &&
          ["image", "video", "audio"].some((t) => key.includes(t)),
      );
      viewOnceContent = { [mediaType]: quoted[mediaType] };
    } else if (quoted.viewOnceMessage) {
      viewOnceContent = quoted.viewOnceMessage.message;
      mediaType = Object.keys(viewOnceContent).find(
        (key) =>
          key.endsWith("Message") &&
          ["image", "video", "audio"].some((t) => key.includes(t)),
      );
    } else {
      return reply("Please reply to a view once media message.");
    }

    if (!mediaType) return reply("Unsupported ViewOnce message type.");

    let msg;
    let tempFilePath = null;

    try {
      // ✅ FIX: temp folder guaranteed exist ho, __dirname wale broken path ki jagah
      await ensureTempDir();

      const mediaMessage = {
        ...viewOnceContent[mediaType],
        viewOnce: false,
      };

      const tempFileName = `vv2_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      tempFilePath = await sock.downloadAndSaveMediaMessage(
        mediaMessage,
        path.join(TEMP_DIR, tempFileName),
      );

      const originalCaption = mediaMessage.caption || "";
      const caption = originalCaption || "";
      const mime = mediaMessage.mimetype || "";

      if (mediaType.includes("image")) {
        msg = { image: { url: tempFilePath }, caption, mimetype: mime };
      } else if (mediaType.includes("video")) {
        msg = { video: { url: tempFilePath }, caption, mimetype: mime };
      } else if (mediaType.includes("audio")) {
        msg = { audio: { url: tempFilePath }, ptt: true, mimetype: mime || "audio/mp4" };
      }

      await sock.sendMessage(from, msg);

    } catch (e) {
      console.error("Error in vv2 command:", e);
      reply(`Error: ${e.message}`);
    } finally {
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          console.error("Failed to clean up temp file:", cleanupError);
        }
      }
    }
  },
);

cmd(
  {
    pattern: "vv2",
    aliases: ["‎👀", "reveal"],
    react: "🙄",
    category: "owner",
    description: "Reveal View Once Media",
  },
  async (from, sock, conText) => {
    const { reply, quoted, isSuperUser, sender } = conText;

    if (!quoted) return reply(`Please reply to/quote a ViewOnce message`);
    if (!isSuperUser) return reply(`*This area is reserved for the bot owner only.* 🕷️`);

    let viewOnceContent, mediaType;

    if (
      quoted.imageMessage?.viewOnce ||
      quoted.videoMessage?.viewOnce ||
      quoted.audioMessage?.viewOnce
    ) {
      mediaType = Object.keys(quoted).find(
        (key) =>
          key.endsWith("Message") &&
          ["image", "video", "audio"].some((t) => key.includes(t)),
      );
      viewOnceContent = { [mediaType]: quoted[mediaType] };
    } else if (quoted.viewOnceMessage) {
      viewOnceContent = quoted.viewOnceMessage.message;
      mediaType = Object.keys(viewOnceContent).find(
        (key) =>
          key.endsWith("Message") &&
          ["image", "video", "audio"].some((t) => key.includes(t)),
      );
    } else {
      return reply("Please reply to a view once media message.");
    }

    if (!mediaType) return reply("Unsupported ViewOnce message type.");

    let msg;
    let tempFilePath = null;

    try {
      await ensureTempDir();

      const mediaMessage = {
        ...viewOnceContent[mediaType],
        viewOnce: false,
      };

      const tempFileName = `vv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      tempFilePath = await sock.downloadAndSaveMediaMessage(
        mediaMessage,
        path.join(TEMP_DIR, tempFileName),
      );

      const originalCaption = mediaMessage.caption || "";
      const caption = originalCaption || "";
      const mime = mediaMessage.mimetype || "";

      if (mediaType.includes("image")) {
        msg = { image: { url: tempFilePath }, caption, mimetype: mime };
      } else if (mediaType.includes("video")) {
        msg = { video: { url: tempFilePath }, caption, mimetype: mime };
      } else if (mediaType.includes("audio")) {
        msg = { audio: { url: tempFilePath }, ptt: true, mimetype: mime || "audio/mp4" };
      }

      await sock.sendMessage(sender, msg);

    } catch (e) {
      console.error("Error in vv command:", e);
      reply(`Error: ${e.message}`);
    } finally {
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          console.error("Failed to clean up temp file:", cleanupError);
        }
      }
    }
  },
);
