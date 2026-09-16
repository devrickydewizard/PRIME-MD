const { cmd } = require("../lib");
const axios = require("axios");
const crypto = require("crypto");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Encryption helpers ──────────────────────────────────────────────────────
function aesEncrypt(data, key, iv) {
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function genRandom(len) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomBytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDa2oPxMZe71V4dw2r8rHWt59gH
W5INRmlhepe6GUanrHykqKdlIB4kcJiu8dHC/FJeppOXVoKz82pvwZCmSUrF/1yr
rnmUDjqUefDu8myjhcbio6CnG5TtQfwN2pz3g6yHkLgp8cFfyPSWwyOCMMMsTU9s
snOjvdDb4wiZI8x3UwIDAQAB
-----END PUBLIC KEY-----`;

function getBrowserHeaders() {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "sec-ch-ua":
      '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    origin: "https://deepfakemaker.io",
    referer: "https://deepfakemaker.io/ai-clothes-remover/",
  };
}

const STATUS_MSGS = [
  "🎨 working on it...",
  "⚙️ processing...",
  "🌀 almost there...",
];

const VALID_PROMPTS = [
  "nude",
  "bikini",
  "topless",
  "underwear",
  "naked",
  "swimsuit",
  "lingerie",
];

const PROMPT_EMOJIS = {
  nude: "🔞",
  bikini: "👙",
  topless: "🔥",
  underwear: "🩲",
  naked: "🍑",
  swimsuit: "🏊",
  lingerie: "💋",
};

/**
 * Extract imageMessage from various quoted shapes used by Baileys / this bot.
 */
function extractImageMessage(quoted, quotedMsg, ms) {
  // Preferred: serializer quoted object
  if (quoted?.imageMessage) return quoted.imageMessage;
  if (quotedMsg?.imageMessage) return quotedMsg.imageMessage;

  // Raw contextInfo path
  const ctx =
    ms?.message?.extendedTextMessage?.contextInfo ||
    ms?.message?.imageMessage?.contextInfo ||
    null;
  const qm = ctx?.quotedMessage;
  if (qm?.imageMessage) return qm.imageMessage;
  if (qm?.viewOnceMessage?.message?.imageMessage)
    return qm.viewOnceMessage.message.imageMessage;
  if (qm?.viewOnceMessageV2?.message?.imageMessage)
    return qm.viewOnceMessageV2.message.imageMessage;
  if (qm?.ephemeralMessage?.message?.imageMessage)
    return qm.ephemeralMessage.message.imageMessage;

  // Direct image (user sent image with caption .undress)
  if (ms?.message?.imageMessage) return ms.message.imageMessage;

  return null;
}

cmd(
  {
    pattern: "undress",
    aliases: ["undressai", "clothesremover", "remclothes"],
    react: "⏳",
    category: "owner",
    description: "AI clothes remover — reply to an image. Owner only.",
  },
  async (from, sock, conText) => {
    const {
      reply,
      quoted,
      quotedMsg,
      isSuperUser,
      q,
      msg,
      sender,
    } = conText;

    if (!isSuperUser) {
      return reply("❌ This command is only available for the owner!");
    }

    const imageMsg = extractImageMessage(quoted, quotedMsg, msg);
    if (!imageMsg) {
      return reply(
        "📷 *Reply to an image* with `.undress`\n\n*Styles:* nude, bikini, topless, underwear, naked, swimsuit, lingerie\n*Example:* `.undress bikini`"
      );
    }

    let tempPath = null;

    try {
      await sock.sendMessage(from, {
        react: { text: "⏳", key: msg.key },
      });

      const initialMsg = await sock.sendMessage(
        from,
        { text: "🔄 *Processing your image...*\n_Uploading & analyzing..._" },
        { quoted: msg }
      );

      // Download via Baileys
      const buffer = await downloadMediaMessage(
        {
          key: msg.key,
          message: { imageMessage: imageMsg },
        },
        "buffer",
        {},
        { logger: console, reuploadRequest: sock.updateMediaMessage }
      );

      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 100) {
        throw new Error("Failed to download image");
      }

      let prompt = (q || "nude").toLowerCase().trim().split(/\s+/)[0];
      if (!VALID_PROMPTS.includes(prompt)) prompt = "nude";
      const promptEmoji = PROMPT_EMOJIS[prompt] || "🎨";

      const t = Math.floor(Date.now() / 1000).toString();
      const nonce = crypto.randomUUID();
      const tempAesKey = genRandom(16);

      const secret_key = crypto
        .publicEncrypt(
          {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PADDING,
          },
          Buffer.from(tempAesKey, "utf8")
        )
        .toString("base64");

      const userId = genRandom(64).toLowerCase();
      const signData = `ai_df:NHGNy5YFz7HeFb:${t}:${nonce}:${secret_key}`;
      const sign = aesEncrypt(signData, tempAesKey, tempAesKey);

      const instance = axios.create({
        baseURL: "https://apiv1.deepfakemaker.io/api",
        params: { app_id: "ai_df", t, nonce, secret_key, sign },
        headers: getBrowserHeaders(),
        timeout: 45000,
      });

      // Upload sign
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const filename = genRandom(32) + "_" + Date.now() + ".jpg";
      const uploadResponse = await instance.post("/user/v2/upload-sign", {
        filename,
        hash,
        user_id: userId,
      });

      if (!uploadResponse.data?.data?.url) {
        throw new Error(
          "Upload URL failed: " +
            (uploadResponse.data?.msg || JSON.stringify(uploadResponse.data))
        );
      }

      await axios.put(uploadResponse.data.data.url, buffer, {
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(buffer.length),
        },
        timeout: 45000,
        maxBodyLength: Infinity,
      });

      const taskResponse = await instance.post(
        "/img/v2/free/clothes/remover/task",
        {
          prompt,
          image:
            "https://cdn.deepfakemaker.io/" +
            uploadResponse.data.data.object_name,
          platform: "clothes_remover",
          user_id: userId,
        }
      );

      if (!taskResponse.data?.data?.task_id) {
        throw new Error(
          "Task creation failed: " +
            (taskResponse.data?.msg || JSON.stringify(taskResponse.data))
        );
      }

      const taskId = taskResponse.data.data.task_id;
      try {
        await sock.sendMessage(from, {
          text: `✅ *Task ready!*\n🔥 Style: ${promptEmoji} ${prompt}\n🆔 ID: \`${taskId.slice(0, 8)}\`\n_✨ processing..._`,
          edit: initialMsg.key,
        });
      } catch {
        // edit may fail on some clients
      }

      let attempts = 0;
      const maxAttempts = 48;
      let lastUpdateMsg = null;
      let lastStatusIndex = -1;

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 2500));

        let checkResponse;
        try {
          checkResponse = await instance.get(
            "/img/v2/free/clothes/remover/task",
            { params: { user_id: userId, task_id: taskId } }
          );
        } catch (pollErr) {
          console.warn("[undress] poll error:", pollErr?.message);
          continue;
        }

        const data = checkResponse.data;
        if (data?.msg === "success" && data?.data?.generate_url) {
          const timeTaken = (attempts * 2.5).toFixed(1);
          await sock.sendMessage(
            from,
            {
              image: { url: data.data.generate_url },
              caption: `🖼️ *AI Processed Image*\n🎨 Style: ${promptEmoji} ${prompt}\n⏱️ *Time:* ${timeTaken}s\n\n📌 *Powered by PRIME-MD*`,
            },
            { quoted: msg }
          );
          await sock.sendMessage(from, {
            react: { text: "✅", key: msg.key },
          });
          if (lastUpdateMsg) {
            try {
              await sock.sendMessage(from, { delete: lastUpdateMsg.key });
            } catch {}
          }
          return;
        }

        // failed state from API
        if (
          data?.data?.status === "failed" ||
          data?.msg === "failed" ||
          data?.code === 500
        ) {
          throw new Error(data?.msg || "API reported task failed");
        }

        if (attempts % 5 === 0 && attempts < maxAttempts) {
          let msgIndex;
          do {
            msgIndex = Math.floor(Math.random() * STATUS_MSGS.length);
          } while (msgIndex === lastStatusIndex && STATUS_MSGS.length > 1);
          lastStatusIndex = msgIndex;
          const coolMsg = `${STATUS_MSGS[msgIndex]} (${Math.round(
            attempts * 2.5
          )}s)`;
          try {
            if (lastUpdateMsg) {
              await sock.sendMessage(from, {
                text: coolMsg,
                edit: lastUpdateMsg.key,
              });
            } else {
              lastUpdateMsg = await sock.sendMessage(
                from,
                { text: coolMsg },
                { quoted: msg }
              );
            }
          } catch {}
        }
      }

      throw new Error("⏰ Processing timeout – please try again later.");
    } catch (error) {
      console.error("undress Error:", error?.response?.data || error);
      try {
        await sock.sendMessage(from, {
          react: { text: "❌", key: msg.key },
        });
      } catch {}

      let errorMsg = error.message || String(error);
      if (error.response?.status === 401)
        errorMsg = "🔐 Authentication failed – API might be down.";
      else if (error.response?.status === 500)
        errorMsg = "💥 Server error – please retry in a few minutes.";
      else if (error.response?.data?.msg) errorMsg = error.response.data.msg;

      await reply(`❌ *Error:* ${errorMsg}`);
    } finally {
      if (tempPath) {
        try {
          fs.unlinkSync(tempPath);
        } catch {}
      }
    }
  }
);
