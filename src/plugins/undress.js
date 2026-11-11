const { cmd } = require("../lib");
const axios = require("axios");
const crypto = require("crypto");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const aesEncrypt = (data, key, iv) => {
  const cipher = crypto.createCipheriv("aes-128-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"));
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
};

const genRandom = (len) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomBytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) result += chars[randomBytes[i] % chars.length];
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
  "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  origin: "https://deepfakemaker.io",
  referer: "https://deepfakemaker.io/ai-clothes-remover/",
});

const VALID_PROMPTS = ["nude","bikini","topless","underwear","naked","swimsuit","lingerie"];
const PROMPT_EMOJIS = { nude:"🔞", bikini:"👙", topless:"🔥", underwear:"🩲", naked:"🍑", swimsuit:"🏊", lingerie:"💋" };

cmd(
  {
    pattern: "undress",
    aliases: ["undressai","clothesremover","remclothes"],
    react: "⏳",
    category: "owner",
    description: "AI clothes remover (reply to an image). Owner only.",
  },
  async (from, sock, conText) => {
    const { reply, quoted, isSuperUser, q, msg, m } = conText;
    const currentMsg = msg || m;

    if (!isSuperUser) return reply("❌ This command is only available for the owner!");

    const contextInfo =
      currentMsg?.message?.extendedTextMessage?.contextInfo ||
      currentMsg?.message?.imageMessage?.contextInfo ||
      currentMsg?.message?.videoMessage?.contextInfo || {};

    const quotedMsg = quoted || contextInfo.quotedMessage;
    if (!quotedMsg || !quotedMsg.imageMessage) return reply("📷 Reply to an image with `.undress`");

    try {
      if (currentMsg?.key) {
        await sock.sendMessage(from, { react: { text: "⏳", key: currentMsg.key } });
      }

      const initialMsg = await sock.sendMessage(from,
        { text: "🔄 *Processing your image...*\n_Uploading & analyzing..._" },
        { quoted: currentMsg }
      );

      const mediaMessage = {
        key: {
          remoteJid: from,
          id: contextInfo.stanzaId || currentMsg?.key?.id,
          fromMe: false,
          participant: contextInfo.participant || undefined,
        },
        message: quotedMsg,
      };

      const buffer = await downloadMediaMessage(mediaMessage, "buffer", {}, {
        logger: console,
        reuploadRequest: sock.updateMediaMessage,
      });

      if (!buffer || buffer.length < 100) throw new Error("Failed to download image (empty buffer)");

      let prompt = (q || "nude").toLowerCase().trim();
      if (!VALID_PROMPTS.includes(prompt)) prompt = "nude";
      const promptEmoji = PROMPT_EMOJIS[prompt] || "🎨";

      const t = Math.floor(Date.now() / 1000).toString();
      const nonce = crypto.randomUUID();
      const tempAesKey = genRandom(16);
      if (!tempAesKey || tempAesKey.length !== 16) throw new Error("Failed to generate AES key");

      const secret_key = crypto.publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(tempAesKey, "utf8")
      ).toString("base64");

      const userId = genRandom(64).toLowerCase();
      // Fixed sign formula — no backslash escapes in template literal
      const signData = `ai_df:NHGNy5YFz7HeFb:${t}:${nonce}:${secret_key}`;
      const sign = aesEncrypt(signData, tempAesKey, tempAesKey);

      const instance = axios.create({
        baseURL: "https://apiv1.deepfakemaker.io/api",
        params: { app_id: "ai_df", t, nonce, secret_key, sign },
        headers: getBrowserHeaders(),
        timeout: 30000,
      });

      const FormData = require("form-data");
      const form = new FormData();
      form.append("user_id", userId);
      form.append("task_type", prompt);
      form.append("file", buffer, { filename: "image.jpg", contentType: "image/jpeg" });

      // Try v1 /image/task endpoint first; fall back to /upload
      let taskId = null;
      try {
        const r1 = await instance.post("/image/task", form, {
          headers: { ...getBrowserHeaders(), ...form.getHeaders() }
        });
        taskId = r1?.data?.data?.task_id || r1?.data?.task_id;
      } catch (e1) {
        if (e1?.response?.status !== 404) throw e1;
        // fallback to /upload
        const r2 = await instance.post("/upload", form, {
          headers: { ...getBrowserHeaders(), ...form.getHeaders() }
        });
        taskId = r2?.data?.data?.task_id || r2?.data?.task_id;
      }
      if (!taskId) throw new Error("Upload failed — no task_id returned");

      let resultUrl = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const statusRes = await instance.get("/task/status", {
            params: { task_id: taskId, user_id: userId }
          });
          const status = statusRes?.data?.data?.status;
          const url = statusRes?.data?.data?.image_url;
          if (status === "success" && url) { resultUrl = url; break; }
          if (status === "failed") throw new Error("Task failed on server");
          const statusMsg = ["🎨 working on it...","⚙️ processing...","🌀 almost there..."][i % 3];
          await sock.sendMessage(from, { edit: initialMsg.key, text: statusMsg });
        } catch (pollErr) {
          if (pollErr.message.includes("Task failed")) throw pollErr;
        }
      }

      if (!resultUrl) throw new Error("Timeout — result not ready after 90s");

      const imgRes = await axios.get(resultUrl, { responseType: "arraybuffer" });
      const resultBuffer = Buffer.from(imgRes.data);

      await sock.sendMessage(from, {
        image: resultBuffer,
        caption: `${promptEmoji} *Result — ${prompt}*\n_Powered by DeepFakeMaker AI_`,
      }, { quoted: currentMsg });

      await sock.sendMessage(from, { edit: initialMsg.key, text: `✅ Done! ${promptEmoji}` });

    } catch (err) {
      await reply(`❌ Error: ${err.message}`);
    }
  }
);