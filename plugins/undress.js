const { cmd } = require("../lib");
const axios = require("axios");
const crypto = require("crypto");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

// ── Encryption helpers ──────────────────────────────────────────────────────
const aesEncrypt = (data, key, iv) => {
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
};

const genRandom = (len) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomBytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
};

const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDa2oPxMZe71V4dw2r8rHWt59gH
W5INRmlhepe6GUanrHykqKdlIB4kcJiu8dHC/FJeppOXVoKz82pvwZCmSUrF/1yr
rnmUDjqUefDu8myjhcbio6CnG5TtQfwN2pz3g6yHkLgp8cFfyPSWwyOCMMMsTU9s
snOjvdDb4wiZI8x3UwIDAQAB
-----END PUBLIC KEY-----`;

const getBrowserHeaders = () => ({
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
});

const statusMessages = [
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

cmd(
  {
    pattern: "undress",
    aliases: ["undressai", "clothesremover", "remclothes"],
    react: "⏳",
    category: "owner",
    description: "AI clothes remover (reply to an image). Owner only.",
  },
  async (from, sock, conText) => {
    const { reply, quoted, isSuperUser, q, msg } = conText;

    if (!isSuperUser) {
      return reply("❌ This command is only available for the owner!");
    }

    const quotedMsg =
      quoted ||
      msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quotedMsg || !quotedMsg.imageMessage) {
      return reply("📷 Reply to an image with `.undress`");
    }

    try {
      await sock.sendMessage(from, {
        react: { text: "⏳", key: msg.key },
      });

      const initialMsg = await sock.sendMessage(
        from,
        {
          text: "🔄 *Processing your image...*\n_Uploading & analyzing..._",
        },
        { quoted: msg }
      );

      // Download image
      const buffer = await downloadMediaMessage(
        { key: msg.key, message: quotedMsg },
        "buffer",
        {},
        { logger: console }
      );

      let prompt = (q || "nude").toLowerCase().trim();
      if (!VALID_PROMPTS.includes(prompt)) prompt = "nude";
      const promptEmoji = PROMPT_EMOJIS[prompt] || "🎨";

      // Encryption params
      const t = Math.floor(Date.now() / 1000).toString();
      const nonce = crypto.randomUUID();
      const tempAesKey = genRandom(16);
      if (!tempAesKey || tempAesKey.length !== 16) {
        throw new Error("Failed to generate encryption key");
      }

      const tempAesKeyBuffer = Buffer.from(tempAesKey, "utf8");
      const secret_key = crypto
        .publicEncrypt(
          {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PADDING,
          },
          tempAesKeyBuffer
        )
        .toString("base64");

      const userId = genRandom(64).toLowerCase();
      const signData = `ai_df:NHGNy5YFz7HeFb:${t}:${nonce}:${secret_key}`;
      const sign = aesEncrypt(signData, tempAesKey, tempAesKey);

      const instance = axios.create({
        baseURL: "https://apiv1.deepfakemaker.io/api",
        params: { app_id: "ai_df", t, nonce, secret_key, sign },
        headers: getBrowserHeaders(),
        timeout: 30000,
      });

      // Step 1 – upload URL
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const filename = genRandom(32) + "_" + Date.now() + ".jpg";
      const uploadResponse = await instance.post("/user/v2/upload-sign", {
        filename,
        hash,
        user_id: userId,
      });
      if (!uploadResponse.data?.data?.url) {
        throw new Error("Upload URL failed");
      }

      // Step 2 – upload image
      await axios.put(uploadResponse.data.data.url, buffer, {
        headers: {
          "content-type": "image/jpeg",
          "content-length": buffer.length.toString(),
        },
        timeout: 30000,
      });

      // Step 3 – create task
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
        throw new Error("Task creation failed");
      }

      const taskId = taskResponse.data.data.task_id;
      await sock.sendMessage(from, {
        text: `✅ *Task ready!*\n🔥 Style: ${promptEmoji} ${prompt}\n🆔 ID: \`${taskId.slice(0, 8)}\`\n_✨ started the task ..._`,
        edit: initialMsg.key,
      });

      // Poll
      let attempts = 0;
      const maxAttempts = 40;
      let lastUpdateMsg = null;
      let lastStatusIndex = -1;

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 2500));

        const checkResponse = await instance.get(
          "/img/v2/free/clothes/remover/task",
          {
            params: { user_id: userId, task_id: taskId },
          }
        );

        if (
          checkResponse.data?.msg === "success" &&
          checkResponse.data?.data?.generate_url
        ) {
          const timeTaken = (attempts * 2.5).toFixed(1);
          await sock.sendMessage(
            from,
            {
              image: { url: checkResponse.data.data.generate_url },
              caption: `🖼️ *AI Processed Image*\n🎨 Style: ${promptEmoji} ${prompt}\n⏱️ *Time:* ${timeTaken}s\n\n📌 *Powered by PRIME-MD*`,
            },
            { quoted: msg }
          );
          await sock.sendMessage(from, {
            react: { text: "✅", key: msg.key },
          });
          if (lastUpdateMsg) {
            await sock.sendMessage(from, { delete: lastUpdateMsg.key });
          }
          return;
        }

        if (attempts % 5 === 0 && attempts < maxAttempts) {
          let msgIndex;
          do {
            msgIndex = Math.floor(Math.random() * statusMessages.length);
          } while (msgIndex === lastStatusIndex);
          lastStatusIndex = msgIndex;
          const coolMsg = `${statusMessages[msgIndex]} (${Math.round(
            attempts * 2.5
          )}s)`;
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
        }
      }

      throw new Error("⏰ Processing timeout – please try again later.");
    } catch (error) {
      console.error("undress Error:", error);
      await sock.sendMessage(from, {
        react: { text: "❌", key: msg.key },
      });

      let errorMsg = error.message;
      if (error.response?.status === 401)
        errorMsg = "🔐 Authentication failed – API might be down.";
      else if (error.response?.status === 500)
        errorMsg = "💥 Server error – please retry in a few minutes.";
      else if (error.response?.data?.msg) errorMsg = error.response.data.msg;

      await sock.sendMessage(
        from,
        { text: `❌ *Error:* ${errorMsg}` },
        { quoted: msg }
      );
    }
  }
);
