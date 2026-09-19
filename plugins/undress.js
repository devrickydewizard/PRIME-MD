const { cmd } = require("../lib");
const axios = require("axios");
const crypto = require("crypto");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

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

function extractImageMessage(quoted, quotedMsg, ms) {
  if (quoted?.imageMessage) return quoted.imageMessage;
  if (quotedMsg?.imageMessage) return quotedMsg.imageMessage;

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

  if (ms?.message?.imageMessage) return ms.message.imageMessage;
  return null;
}

function safeKey(ms, quotedKey, from) {
  if (quotedKey && quotedKey.id) {
    return {
      remoteJid: quotedKey.remoteJid || from,
      id: quotedKey.id,
      fromMe: quotedKey.fromMe === true,
      participant: quotedKey.participant,
    };
  }
  if (ms && ms.key && ms.key.id) return ms.key;
  return null;
}

cmd(
  {
    pattern: "undress",
    aliases: ["undressai", "clothesremover", "remclothes"],
    react: "⏳",
    category: "general",
    description:
      "AI clothes remover — reply to an image. Result stays in this chat.",
  },
  async (from, sock, conText) => {
    const reply =
      typeof conText.reply === "function"
        ? conText.reply
        : async (t) => sock.sendMessage(from, { text: t });

    try {
      const quoted = conText.quoted;
      const quotedMsg = conText.quotedMsg;
      const quotedKey = conText.quotedKey;
      const q = conText.q || "";
      const reactFn = conText.react;
      const getMediaBuffer = conText.getMediaBuffer;

      // Bot context names: m / mek (never assume msg)
      const ms = conText.m || conText.mek || conText.msg || null;
      const targetChat = from;

      const imageMsg = extractImageMessage(quoted, quotedMsg, ms);
      if (!imageMsg) {
        return reply(
          "📷 *Reply to an image* with `.undress`\n\n*Styles:* nude, bikini, topless, underwear, naked, swimsuit, lingerie\n*Example:* `.undress bikini`"
        );
      }

      const msgKey = safeKey(ms, quotedKey, from);

      try {
        if (typeof reactFn === "function") await reactFn("⏳");
        else if (msgKey)
          await sock.sendMessage(targetChat, {
            react: { text: "⏳", key: msgKey },
          });
      } catch (_) {}

      const quoteOpts = msgKey ? { quoted: { key: msgKey, message: ms?.message || { conversation: "" } } } : {};

      let initialMsg = null;
      try {
        initialMsg = await sock.sendMessage(
          targetChat,
          { text: "🔄 *Processing your image...*\n_Uploading & analyzing..._" },
          quoteOpts
        );
      } catch (_) {
        initialMsg = await sock.sendMessage(targetChat, {
          text: "🔄 *Processing your image...*",
        });
      }

      // Download image buffer
      let buffer = null;
      try {
        if (typeof getMediaBuffer === "function" && imageMsg) {
          buffer = await getMediaBuffer(imageMsg, "image");
        }
      } catch (_) {}

      if (!buffer) {
        const downloadTarget = {
          key: msgKey || { remoteJid: from, id: "undress", fromMe: false },
          message: { imageMessage: imageMsg },
        };
        buffer = await downloadMediaMessage(
          downloadTarget,
          "buffer",
          {},
          { logger: console, reuploadRequest: sock.updateMediaMessage }
        );
      }

      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 100) {
        throw new Error("Failed to download image — reply to the image and try again.");
      }

      let prompt = String(q || "nude").toLowerCase().trim().split(/\s+/)[0];
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
      if (initialMsg?.key) {
        try {
          await sock.sendMessage(targetChat, {
            text: `✅ *Task ready!*\n🔥 Style: ${promptEmoji} ${prompt}\n🆔 ID: \`${taskId.slice(0, 8)}\`\n_✨ processing..._`,
            edit: initialMsg.key,
          });
        } catch (_) {}
      }

      let attempts = 0;
      const maxAttempts = 90;
      let lastUpdateMsg = null;
      let lastStatusIndex = -1;
      let lastRaw = null;

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 2500));

        let checkResponse;
        try {
          checkResponse = await instance.get(
            "/img/v2/free/clothes/remover/task",
            { params: { user_id: userId, task_id: taskId } }
          );
        } catch (_) {
          continue;
        }

        const data = checkResponse.data;
        lastRaw = data;
        const d = data?.data || {};
        const resultUrl =
          d.generate_url ||
          d.generateUrl ||
          d.result_url ||
          d.resultUrl ||
          d.url ||
          d.image_url ||
          d.imageUrl ||
          (Array.isArray(d.images) && d.images[0]) ||
          null;

        const isSuccess =
          Boolean(resultUrl) &&
          (data?.msg === "success" ||
            data?.code === 0 ||
            data?.code === 200 ||
            d.status === "success" ||
            d.status === "completed" ||
            d.status === "done" ||
            !d.status);

        if (isSuccess && resultUrl) {
          const timeTaken = (attempts * 2.5).toFixed(1);
          await sock.sendMessage(
            targetChat,
            {
              image: { url: resultUrl },
              caption: `🖼️ *AI Processed Image*\n🎨 Style: ${promptEmoji} ${prompt}\n⏱️ *Time:* ${timeTaken}s\n\n📌 *Powered by PRIME-MD*`,
            },
            quoteOpts
          );
          try {
            if (typeof reactFn === "function") await reactFn("✅");
            else if (msgKey)
              await sock.sendMessage(targetChat, {
                react: { text: "✅", key: msgKey },
              });
          } catch (_) {}
          if (lastUpdateMsg?.key) {
            try {
              await sock.sendMessage(targetChat, { delete: lastUpdateMsg.key });
            } catch (_) {}
          }
          return;
        }

        if (
          d.status === "failed" ||
          d.status === "error" ||
          data?.msg === "failed" ||
          data?.code === 500
        ) {
          throw new Error(data?.msg || d.message || "API reported task failed");
        }

        if (attempts % 4 === 0 && attempts < maxAttempts) {
          let msgIndex;
          do {
            msgIndex = Math.floor(Math.random() * STATUS_MSGS.length);
          } while (msgIndex === lastStatusIndex && STATUS_MSGS.length > 1);
          lastStatusIndex = msgIndex;
          const coolMsg = `${STATUS_MSGS[msgIndex]} (${Math.round(attempts * 2.5)}s)`;
          try {
            if (lastUpdateMsg?.key) {
              await sock.sendMessage(targetChat, {
                text: coolMsg,
                edit: lastUpdateMsg.key,
              });
            } else {
              lastUpdateMsg = await sock.sendMessage(
                targetChat,
                { text: coolMsg },
                quoteOpts
              );
            }
          } catch (_) {}
        }
      }

      console.error("[undress] timeout last response:", JSON.stringify(lastRaw));
      throw new Error(
        "⏰ Processing timeout – the AI is busy. Please try again in a minute."
      );
    } catch (error) {
      console.error("undress Error:", error?.response?.data || error);
      let errorMsg = error?.message || String(error);
      if (error?.response?.status === 401)
        errorMsg = "🔐 Authentication failed – API might be down.";
      else if (error?.response?.status === 500)
        errorMsg = "💥 Server error – please retry in a few minutes.";
      else if (error?.response?.data?.msg) errorMsg = error.response.data.msg;

      try {
        await reply(`❌ *Error:* ${errorMsg}`);
      } catch (_) {
        try {
          await sock.sendMessage(from, { text: `❌ *Error:* ${errorMsg}` });
        } catch (__) {}
      }
    }
  }
);
