// PRIME plugin: Convert.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const axios = require('axios');

const fs = require('fs/promises');

const ffmpeg = require('fluent-ffmpeg');

const { exec } = require('child_process');

async function toPtt(buffer, tempFilePath) {
  const outputPath = tempFilePath + ".ogg";

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(tempFilePath)
      .audioCodec('libopus')
      .audioBitrate(24)
      .audioChannels(1)
      .audioFrequency(16000)
      .toFormat('ogg')
      .on('error', reject)
      .on('end', async () => {
        try {
          const converted = await fs.readFile(outputPath);
          resolve(converted);
          await fs.unlink(outputPath).catch(() => {});
        } catch (err) {
          reject(err);
        }
      })
      .save(outputPath);
  });
}

pcmd({
  pattern: "toptt",
  aliases: ["tovoice", "tovn", "tovoicenote"],
  category: "converter",
  description: "Convert audio to WhatsApp voice note"
}, async (from, client, conText) => {
  const { mek, reply, quoted, quotedMsg } = conText;

  if (!quotedMsg) {
    return reply("Please reply to an audio message");
  }

  const quotedAudio = quoted?.audioMessage || quoted?.message?.audioMessage;
  if (!quotedAudio) {
    return reply("The quoted message doesn't contain any audio");
  }

  let tempFilePath;
  try {
    tempFilePath = await client.downloadAndSaveMediaMessage(quotedAudio, 'temp_media');
    const buffer = await fs.readFile(tempFilePath);
    const convertedBuffer = await toPtt(buffer, tempFilePath);

    await client.sendMessage(from, {
      audio: convertedBuffer,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true
    }, { quoted: mek });

  } catch (err) {
    console.error("Error in toptt command:", err);
    await reply("Failed to convert to voice note");
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath).catch(console.error);
    }
  }
});

pcmd({
  pattern: "toptv",
  aliases: ["ptv", "toptvnote", "toptvmsg"],
  category: "converter",
  description: "Convert quoted video to WhatsApp portrait video (PTV)"
}, async (from, client, conText) => {
  const { mek, reply, quoted, quotedMsg } = conText;

  if (!quotedMsg) {
    return reply("Please reply to a video message");
  }

  const quotedVideo = quoted?.videoMessage || quoted?.message?.videoMessage;
  if (!quotedVideo) {
    return reply("The quoted message doesn't contain any video");
  }

  let tempFilePath;
  try {
    tempFilePath = await client.downloadAndSaveMediaMessage(quotedVideo, 'temp_media');
    const buffer = await fs.readFile(tempFilePath);

    await client.sendMessage(from, {
      video: buffer,
      mimetype: "video/mp4",
      ptv: true
    }, { quoted: mek });

  } catch (err) {
    console.error("Error in topvt command:", err);
    await reply("❌ Failed to convert to portrait video bubble");
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath).catch(console.error);
    }
  }
});

pcmd({
  pattern: "togif",
  aliases: ["gifplay", "gifconvert", "gifnote"],
  category: "converter",
  description: "Convert quoted video to WhatsApp GIF"
}, async (from, client, conText) => {
  const { mek, reply, quoted, quotedMsg } = conText;

  if (!quotedMsg) {
    return reply("Please reply to a video message");
  }

  const quotedVideo = quoted?.videoMessage || quoted?.message?.videoMessage;
  if (!quotedVideo) {
    return reply("The quoted message doesn't contain any video");
  }

  let tempFilePath;
  try {
    tempFilePath = await client.downloadAndSaveMediaMessage(quotedVideo, 'temp_media');
    const buffer = await fs.readFile(tempFilePath);

    await client.sendMessage(from, {
      video: buffer,
      mimetype: "video/mp4",
      gifPlayback: true
    }, { quoted: mek });

  } catch (err) {
    console.error("Error in togif command:", err);
    await reply("❌ Failed to convert to GIF");
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath).catch(console.error);
    }
  }
});

pcmd({
  pattern: "toaudiodoc",
  aliases: ["audiodoc", "audfile", "sendaudiodoc"],
  category: "converter",
  description: "Send quoted audio as a document"
}, async (from, client, conText) => {
  const { mek, reply, quoted, quotedMsg } = conText;

  if (!quotedMsg) {
    return reply("Please reply to an audio message");
  }

  const quotedAudio = quoted?.audioMessage || quoted?.message?.audioMessage;
  if (!quotedAudio) {
    return reply("The quoted message doesn't contain any audio");
  }

  let tempFilePath;
  try {
    tempFilePath = await client.downloadAndSaveMediaMessage(quotedAudio, 'temp_media');
    const buffer = await fs.readFile(tempFilePath);

    await client.sendMessage(from, {
      document: buffer,
      mimetype: "audio/mpeg",
      fileName: "audio.mp3"
    }, { quoted: mek });

  } catch (err) {
    console.error("Error in toaudiodoc command:", err);
    await reply("❌ Failed to send audio as document");
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath).catch(console.error);
    }
  }
});

function parseConversionQuery(q) {
  const match = q.trim().match(/^(\d+(?:\.\d+)?)([a-zA-Z]+)\s+to\s+([a-zA-Z]+)$/i);
  if (!match) throw new Error("❌ Invalid format. Use like: 10ksh to Tsh");

  const amount = parseFloat(match[1]);
  const base = match[2].toUpperCase();
  const target = match[3].toUpperCase();

  return { amount, base, target };
}

async function getExchangeRate(base, target) {
  const url = `https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(base)}`;
  const { data } = await axios.get(url);

  if (!data.rates || !data.rates[target]) {
    throw new Error(`Target currency "${target}" not found.`);
  }

  return data.rates[target];
}

pcmd({
  pattern: "currency",
  description: "Convert currency (e.g., 10KES to TZS)",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek } = conText;

  if (!q) return reply("📌 Provide a query like: 10KES to TZS");

  try {
    const { amount, base, target } = parseConversionQuery(q);
    const rate = await getExchangeRate(base, target);
    const converted = amount * rate;

    await client.sendMessage(from, {
      text: `${amount} ${base} = ${converted.toFixed(2)} ${target}`
    }, { quoted: mek });

  } catch (err) {
    console.error("Currency error:", err);
    reply("❌ Failed to convert currency. " + err.message);
  }
});

pcmd({
  pattern: "bitly",
  description: "Shorten a URL using Bitly API",
  category: "Shortener",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, q, reply, api } = conText;

  if (!q) {
    return reply("📌 Provide a URL to shorten.\nExample: .bitly https://example.com");
  }

  try {
    // Call your API
    const apiUrl = `${api}/shortener/bitly?url=${encodeURIComponent(q)}`;
    const { data } = await axios.get(apiUrl, { timeout: 10000 });

    if (!data?.status || !data?.result?.shortened) {
      return reply("❌ Failed to shorten URL.");
    }

    const shortUrl = data.result.shortened;

    
    await reply(`${shortUrl}`);

  } catch (err) {
    console.error("Bitly error:", err);
    await reply("❌ Error: " + err.message);
  }
});

pcmd({
  pattern: "tinube",
  aliases: ["tinu", "customurl"],
  category: "shortener",
  description: "Shorten a link using Tinube with a custom name"
},
async (from, client, conText) => {
  const { q, reply, api } = conText;

  // Expect input like: .tinube https://example.com custom123
  const parts = q?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    return reply("❌ Provide both a URL and a custom name.\nExample: .tinube https://example.com custom123");
  }

  const url = parts[0];
  const name = parts[1];

  if (!url.startsWith("http")) {
    return reply("❌ Invalid URL. Must start with http/https.");
  }

  try {
    const apiUrl = `${api}/shortener/tinube?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
    const response = await axios.get(apiUrl, { timeout: 100000 });

    const result = response.data?.result;
    if (!result) {
      return reply("❌ Failed to shorten the URL.");
    }

    reply(result);
  } catch (error) {
    console.error("Tinube error:", error);
    reply("❌ Error shortening URL.");
  }
});

pcmd({
  pattern: "tinyurl",
  aliases: ["shorturl", "shorten"],
  category: "shortener",
  description: "Shorten a link using TinyURL"
},
async (from, client, conText) => {
  const { q, reply, api } = conText;

  if (!q || !q.startsWith("http")) {
    return reply("❌ Provide a valid URL to shorten, e.g. .tinyurl https://example.com");
  }

  try {
    const apiUrl = `${api}/shortener/tinyurl?url=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 100000 });

    const result = response.data?.result;
    if (!result) {
      return reply("❌ Failed to shorten the URL.");
    }

    reply(result);
  } catch (error) {
    console.error("TinyURL error:", error);
    reply("❌ Error shortening URL.");
  }
});

