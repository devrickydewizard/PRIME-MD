// PRIME plugin: Utility.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const fs = require('fs');

const { execSync } = require('child_process');

const axios = require('axios');

const path = require('path');

const os = require('os');

const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const sharp = require('sharp');

const PDFDocument = require("pdfkit");

const Jimp = require("jimp");

const QrCode = require("qrcode-reader");

async function decodeQR(filePath) {
  const image = await Jimp.read(filePath);
  const qr = new QrCode();

  return new Promise((resolve, reject) => {
    qr.callback = (err, value) => {
      if (err) return reject(err);
      resolve(value?.result || null);
    };
    qr.decode(image.bitmap);
  });
}

pcmd({
  pattern: "scan",
  aliases: ["readqr", "scanqr"],
  description: "Read QR code from quoted image",
  category: "Tools",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg || !quoted?.imageMessage) {
    return reply("📌 Reply to an *image* containing a QR code.");
  }

  try {
    const filePath = await client.downloadAndSaveMediaMessage(quoted.imageMessage);
    const result = await decodeQR(filePath);

    if (!result) {
      return reply("❌ No QR code detected in the image.");
    }

    // Reply only with the decoded QR content
    await reply(result);
  } catch (err) {
    console.error("qrread command error:", err);
    reply("❌ Failed to read QR code. Try again.");
  }
});

pcmd({
  pattern: "walink",
  aliases: ["waurl", "whatsappurl"],
  description: "Generate WhatsApp short link with message | number",
  category: "Tools",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, api } = conText;


  if (!q || !q.includes("|")) {
    return reply("📌 Usage: .walink <message> | <number>\nExample: .walink Hey | 254757047860");
  }

  try {
    const [message, number] = q.split("|").map(s => s.trim());

    if (!message || !number) return reply("❌ Provide both message and number.");
    if (!/^\d+$/.test(number)) {
      return reply("❌ Number must be digits and start with a valid country code.");
    }

    const { data } = await axios.get(
      `${api}/tools/walink?q=${encodeURIComponent(message)}&number=${number}`
    );

    if (!data?.status || !data?.result?.shortUrl) {
      return reply("❌ Failed to generate WhatsApp link.");
    }

    
    await reply(data.result.shortUrl);
  } catch (err) {
    console.error("walink command error:", err);
    reply("❌ Error generating WhatsApp link. Try again.");
  }
});

pcmd({
  pattern: "qrgenerator",
  aliases: ["qrgen", "makeqr", "qr"],
  description: "Generate QR code from text",
  category: "Tools",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply, q, api } = conText;

  // Expect input like: .qrgenerator hello world
  if (!q) return reply("📌 Usage: .qrgenerator <text>");

  try {
    const { data } = await axios.get(
      `${api}/tools/qrgenerator?q=${encodeURIComponent(q)}`
    );

    if (!data?.status || !data?.result) {
      return reply("❌ Failed to generate QR code.");
    }

    // Reply with QR code image only
    await client.sendMessage(from, {
      image: { url: data.result }
    }, { quoted: mek });
  } catch (err) {
    console.error("qrgenerator command error:", err);
    reply("❌ Error generating QR code. Try again.");
  }
});

pcmd({
  pattern: "pdf",
  aliases: ["makepdf", "textpdf"],
  description: "Convert quoted text or media into a PDF file",
  category: "Tools",
  filename: __filename
}, async (from, client, conText) => {
  const { q, quoted, quotedMsg, reply, mek } = conText;

  if (!quotedMsg) {
    return reply("📌 Reply to a text, image, or document with `.pdf <filename>`");
  }

  if (!q) {
    return reply("❌ Provide a filename. Example: `.pdf notes`");
  }

  try {
    const filename = `${q.trim()}.pdf`;

    // Case 1: Quoted text → PDF
    if (quoted?.conversation || quoted?.extendedTextMessage?.text) {
      const text = quoted.conversation || quoted.extendedTextMessage.text;
      const doc = new PDFDocument();
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", async () => {
        const buffer = Buffer.concat(chunks);
        await client.sendMessage(from, {
          document: buffer,
          mimetype: "application/pdf",
          fileName: filename
        }, { quoted: mek });
      });
      doc.fontSize(12).text(text, { align: "left" });
      doc.end();
      return;
    }

    // Case 2: Quoted image → PDF (with caption if present)
    if (quoted?.imageMessage) {
      const filePathImg = await client.downloadAndSaveMediaMessage(quoted.imageMessage);
      const caption = quoted.imageMessage.caption || "";

      const doc = new PDFDocument();
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", async () => {
        const buffer = Buffer.concat(chunks);
        await client.sendMessage(from, {
          document: buffer,
          mimetype: "application/pdf",
          fileName: filename
        }, { quoted: mek });
      });

      doc.image(filePathImg, { fit: [500, 700], align: "center", valign: "center" });
      if (caption) {
        doc.moveDown();
        doc.fontSize(12).text(caption, { align: "left" });
      }
      doc.end();
      return;
    }

    // Case 3: Quoted document → wrap into PDF
    if (quoted?.documentMessage) {
      const filePathDoc = await client.downloadAndSaveMediaMessage(quoted.documentMessage);
      const doc = new PDFDocument();
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", async () => {
        const buffer = Buffer.concat(chunks);
        await client.sendMessage(from, {
          document: buffer,
          mimetype: "application/pdf",
          fileName: filename
        }, { quoted: mek });
      });
      doc.fontSize(12).text(`Attached file: ${filePathDoc}`, { align: "left" });
      doc.end();
      return;
    }

    return reply("❌ Unsupported quoted type for PDF conversion.");

  } catch (err) {
    console.error("pdf command error:", err);
    return reply(`❌ Failed to generate PDF: ${err.message}`);
  }
});

let ffmpegPath;

try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = 'ffmpeg';
}

async function downloadMediaBuffer(client, mediaMsg, type) {
  return await downloadMediaMessage(
    { message: { [type + 'Message']: mediaMsg } },
    'buffer',
    {},
    {
      reuploadRequest: client.updateMediaMessage,
      logger: console
    }
  );
}

async function toPtt(buffer) {
  const id = Date.now();
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `ptt_in_${id}.tmp`);
  const outputPath = path.join(tmpDir, `ptt_out_${id}.ogg`);

  fs.writeFileSync(inputPath, buffer);

  const cleanup = () => {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  };

  try {
    execSync(
      `"${ffmpegPath}" -y -i "${inputPath}" -c:a libopus -b:a 64k -ar 48000 -ac 1 -f ogg "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' }
    );
    const out = fs.readFileSync(outputPath);
    cleanup();
    return out;
  } catch (err) {
    cleanup();
    throw err;
  }
}

pcmd({
  pattern: "loop",
  aliases: ["repeat"],
  description: "Loop audio or video N times",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { q, quotedMsg, mek, reply, pickRandom } = conText;

  let loops = 2;
  if (q && !isNaN(parseInt(q))) loops = Math.min(parseInt(q), 10);

  const media = quotedMsg?.videoMessage || quotedMsg?.audioMessage;
  if (!media) return reply("📌 Reply to an audio or video to loop it.\nUsage: .loop 3");

  const isVideo = !!quotedMsg.videoMessage;
  const type = isVideo ? 'video' : 'audio';
  const ext = isVideo ? '.mp4' : '.mp3';
  const id = Date.now();
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `loop_in_${id}${ext}`);
  const outputPath = path.join(tmpDir, `loop_out_${id}${ext}`);

  try {
    const buffer = await downloadMediaBuffer(client, media, type);
    fs.writeFileSync(inputPath, buffer);

    execSync(
      `"${ffmpegPath}" -y -stream_loop ${loops - 1} -i "${inputPath}" -c copy "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' }
    );

    const outputBuffer = fs.readFileSync(outputPath);
    const message = isVideo
      ? { video: outputBuffer, mimetype: "video/mp4" }
      : { audio: outputBuffer, mimetype: "audio/mpeg" };

    await client.sendMessage(from, message, { quoted: mek });
  } catch (error) {
    reply(`❌ Error: ${error.message}`);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

pcmd({
  pattern: "slideshow",
  aliases: ["imgewaudio", "imagewithaudio", "imgaudio"],
  description: "Convert quoted image to video with audio (provide audio URL)",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { q, quotedMsg, mek, reply, pickRandom } = conText;

  if (!quotedMsg?.imageMessage) return reply("📌 Reply to an *image* and provide an audio URL.\nExample: .slideshow https://example.com/song.mp3");
  if (!q || !q.startsWith('http')) return reply("🎵 Please provide a valid audio URL.");

  const id = Date.now();
  const tmpDir = os.tmpdir();
  const rawImagePath = path.join(tmpDir, `slide_raw_${id}.jpg`);
  const resizedImagePath = path.join(tmpDir, `slide_img_${id}.jpg`);
  const audioPath = path.join(tmpDir, `slide_audio_${id}.mp3`);
  const outputPath = path.join(tmpDir, `slide_out_${id}.mp4`);

  const cleanup = () => {
    for (const p of [rawImagePath, resizedImagePath, audioPath, outputPath]) {
      try { fs.unlinkSync(p); } catch {}
    }
  };

  try {
    await reply("🎬 Processing...");

    // Download + resize image using sharp
    const imageBuffer = await downloadMediaBuffer(client, quotedMsg.imageMessage, 'image');
    const resizedBuffer = await sharp(imageBuffer)
      .resize({ width: 640, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    fs.writeFileSync(resizedImagePath, resizedBuffer);

    // Download audio
    const audioResponse = await axios.get(q.trim(), { responseType: 'arraybuffer', timeout: 60000 });
    fs.writeFileSync(audioPath, Buffer.from(audioResponse.data));

    // Build video
    execSync(
      `"${ffmpegPath}" -y -loop 1 -i "${resizedImagePath}" -i "${audioPath}" ` +
      `-c:v libx264 -c:a aac -vf "format=yuv420p" -shortest -preset ultrafast -crf 30 -movflags +faststart "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' }
    );

    const videoBuffer = fs.readFileSync(outputPath);
    await client.sendMessage(from, {
      video: videoBuffer,
      mimetype: "video/mp4",
      caption: "🎬 Slideshow created!"
    }, { quoted: mek });

  } catch (error) {
    console.error("slideshow error:", error);
    await reply(`❌ Error: ${error.message}`);
  } finally {
    cleanup();
  }
});

pcmd({
  pattern: "toptt",
  aliases: ['tovoice', 'tovn', 'tovoicenote'],
  category: "Converter",
  description: "Convert audio to WhatsApp voice note"
}, async (from, client, conText) => {
  const { mek, reply, quoted, quotedMsg } = conText;

  if (!quotedMsg) return reply("Please reply to an audio message");

  const quotedAudio = quoted?.audioMessage || quoted?.message?.audioMessage;
  if (!quotedAudio) return reply("The quoted message doesn't contain any audio");

  try {
    const buffer = await downloadMediaBuffer(client, quotedAudio, 'audio');
    const convertedBuffer = await toPtt(buffer);

    await client.sendMessage(from, {
      audio: convertedBuffer,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true
    }, { quoted: mek });

  } catch (e) {
    console.error("toptt error:", e);
    await reply("❌ Failed to convert to voice note");
  }
});

pcmd({
  pattern: "tts",
  aliases: ["say"],
  category: "tools",
  description: "Convert text or quoted message to PTT audio"
}, async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let text;
  if (q) {
    text = q;
  } else if (quotedMsg) {
    text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) return reply("❌ Could not extract quoted text.");
  } else {
    return reply("📌 Reply to a message or provide text.");
  }

  try {
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=id&client=tw-ob`;
    await client.sendMessage(from, {
      audio: { url: ttsUrl },
      mimetype: "audio/mpeg",
      ptt: false
    }, { quoted: mek });
  } catch (error) {
    console.error("TTS error:", error);
    reply("⚠️ An error occurred while generating speech.");
  }
});

pcmd({
  pattern: "tom4a",
  aliases: ["audiom4a"],
  description: "Send quoted audio or video as M4A",
  category: "Converter",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, mek, reply } = conText;

  let mediaType = null, mediaTypeName = null;
  if (quotedMsg?.videoMessage) { mediaType = quotedMsg.videoMessage; mediaTypeName = 'video'; }
  else if (quotedMsg?.audioMessage) { mediaType = quotedMsg.audioMessage; mediaTypeName = 'audio'; }
  if (!mediaType) return reply("❌ Quote an audio or video.");

  try {
    const buffer = await downloadMediaBuffer(client, mediaType, mediaTypeName);
    await client.sendMessage(from, { audio: buffer, mimetype: "audio/mp4" }, { quoted: mek });
  } catch (error) {
    console.error("tom4a error:", error);
    await reply("❌ An error occurred.");
  }
});

pcmd({
  pattern: "tomp3",
  description: "Convert quoted audio or video to MP3",
  category: "Converter",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, mek, reply } = conText;

  let mediaType = null, mediaTypeName = null;
  if (quotedMsg?.videoMessage) { mediaType = quotedMsg.videoMessage; mediaTypeName = 'video'; }
  else if (quotedMsg?.audioMessage) { mediaType = quotedMsg.audioMessage; mediaTypeName = 'audio'; }
  if (!mediaType) return reply("❌ Quote an audio or video.");

  const id = Date.now();
  const tmpDir = os.tmpdir();
  const inputExt = mediaTypeName === 'video' ? '.mp4' : '.tmp';
  const inputPath = path.join(tmpDir, `tomp3_in_${id}${inputExt}`);
  const outputPath = path.join(tmpDir, `tomp3_out_${id}.mp3`);

  try {
    const buffer = await downloadMediaBuffer(client, mediaType, mediaTypeName);
    fs.writeFileSync(inputPath, buffer);

    execSync(
      `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a libmp3lame -q:a 4 "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' }
    );

    const outputBuffer = fs.readFileSync(outputPath);
    await client.sendMessage(from, { audio: outputBuffer, mimetype: "audio/mpeg" }, { quoted: mek });
  } catch (error) {
    console.error("tomp3 error:", error);
    await reply("❌ An error occurred while converting.");
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

pcmd({
  pattern: "imgsize",
  aliases: ["imagesize", "dimension"],
  description: "Get dimensions (width×height) of quoted image",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, quoted, quotedMsg } = conText;

  if (!quotedMsg || !quoted?.imageMessage) return reply("📌 Reply to an *image*.");

  try {
    const buffer = await downloadMediaBuffer(client, quoted.imageMessage, 'image');
    const { width, height } = await sharp(buffer).metadata();
    await reply(`🖼️ Image dimensions: ${width}×${height}`);
  } catch (err) {
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "resize",
  aliases: ["imgresize"],
  description: "Resize quoted image (e.g., .resize 300×250)",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, quoted, quotedMsg } = conText;

  if (!quotedMsg || !quoted?.imageMessage) return reply("📌 Reply to an *image*.\nExample: .resize 300×250");
  if (!q || !q.match(/^\d+[x×]\d+$/i)) return reply("📌 Use format: width×height (e.g., 300×250)");

  const [width, height] = q.split(/[x×]/i).map(Number);
  if (width <= 0 || height <= 0 || width > 5000 || height > 5000) return reply("❌ Use values between 1 and 5000.");

  try {
    const buffer = await downloadMediaBuffer(client, quoted.imageMessage, 'image');
    const resized = await sharp(buffer)
      .resize(width, height, { fit: 'fill' })
      .jpeg({ quality: 90 })
      .toBuffer();

    await client.sendMessage(from, {
      image: resized,
      caption: `✅ Resized to ${width}×${height}`
    }, { quoted: mek });
  } catch (err) {
    reply(`❌ Error: ${err.message}`);
  }
});

const namedColors = {
  black: "000000", white: "ffffff", red: "ff0000", blue: "0000ff", green: "00ff00",
  yellow: "ffff00", pink: "ffc0cb", purple: "800080", orange: "ffa500", gray: "808080",
  cyan: "00ffff", magenta: "ff00ff", gold: "ffd700", silver: "c0c0c0"
};

pcmd({
  pattern: "watermark",
  aliases: ["wm", "addwatermark"],
  description: "Add text watermark to quoted image",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, quoted, quotedMsg } = conText;

  if (!quotedMsg || !quoted?.imageMessage) {
    return reply("📌 Reply to an *image*.\nExample: .watermark MyBrand |red,60");
  }

  const id = Date.now();
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `wm_in_${id}.jpg`);
  const outputPath = path.join(tmpDir, `wm_out_${id}.jpg`);

  try {
    const baseImageBuffer = await downloadMediaBuffer(client, quoted.imageMessage, 'image');

    if (q) {
      // Text watermark
      let [textPart, options] = q.split("|");
      const watermarkText = textPart.trim().substring(0, 20);
      let fontColor = "white", fontSize = 48;

      if (options) {
        const parts = options.split(",").map(p => p.trim().toLowerCase());
        if (parts[0]) fontColor = namedColors[parts[0]] ? `#${namedColors[parts[0]]}` : parts[0];
        if (parts[1]) fontSize = parseInt(parts[1]) || 48;
      }

      // Use sharp to write base image then ffmpeg for text overlay
      fs.writeFileSync(inputPath, baseImageBuffer);

      execSync(
        `"${ffmpegPath}" -y -i "${inputPath}" ` +
        `-vf "drawtext=text='${watermarkText.replace(/'/g, "\\'")}':` +
        `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf:` +
        `fontcolor=${fontColor}:fontsize=${fontSize}:` +
        `box=1:boxcolor=black@0.5:boxborderw=5:` +
        `x=(w-text_w)/2:y=(h-text_h)/2" "${outputPath}"`,
        { timeout: 60000, stdio: 'pipe' }
      );

      const imageBuffer = fs.readFileSync(outputPath);
      await client.sendMessage(from, {
        image: imageBuffer,
        caption: `✅ Watermark: "${watermarkText}" (${fontColor}, size ${fontSize})`
      }, { quoted: mek });

    } else {
      // Image watermark: overlay using sharp composite
      if (!quotedMsg.quoted?.imageMessage) {
        return reply("📌 For image watermark, quote the main image and attach a watermark image.");
      }

      const wmBuffer = await downloadMediaBuffer(client, quotedMsg.quoted.imageMessage, 'image');
      const { width, height } = await sharp(baseImageBuffer).metadata();

      const wmResized = await sharp(wmBuffer)
        .resize(Math.floor(width / 4), Math.floor(height / 4))
        .toBuffer();

      const composited = await sharp(baseImageBuffer)
        .composite([{ input: wmResized, gravity: 'southeast' }])
        .jpeg({ quality: 90 })
        .toBuffer();

      await client.sendMessage(from, {
        image: composited,
        caption: "✅ Image watermark added (bottom-right)"
      }, { quoted: mek });
    }
  } catch (err) {
    reply(`❌ Error: ${err.message}`);
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

pcmd({
  pattern: "trim",
  description: "Trim quoted audio or video (e.g., .trim 0:10 0:30)",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, q, mek, reply } = conText;

  if (!quotedMsg) return reply("❌ Reply to an audio or video.\nExample: .trim 0:10 0:30");

  const parts = (q || '').split(" ").map(t => t.trim()).filter(Boolean);
  if (parts.length < 2) return reply("⚠️ Invalid format.\nExample: .trim 0:10 0:30");
  const [startTime, endTime] = parts;

  let mediaType = null, mediaTypeName = null;
  if (quotedMsg.audioMessage) { mediaType = quotedMsg.audioMessage; mediaTypeName = 'audio'; }
  else if (quotedMsg.videoMessage) { mediaType = quotedMsg.videoMessage; mediaTypeName = 'video'; }
  if (!mediaType) return reply("❌ Unsupported media type.");

  const isAudio = mediaTypeName === 'audio';
  const ext = isAudio ? '.mp3' : '.mp4';
  const id = Date.now();
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `trim_in_${id}${ext}`);
  const outputPath = path.join(tmpDir, `trim_out_${id}${ext}`);

  try {
    const buffer = await downloadMediaBuffer(client, mediaType, mediaTypeName);
    fs.writeFileSync(inputPath, buffer);

    execSync(
      `"${ffmpegPath}" -y -i "${inputPath}" -ss ${startTime} -to ${endTime} -c copy "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' }
    );

    const outputBuffer = fs.readFileSync(outputPath);
    const message = isAudio
      ? { audio: outputBuffer, mimetype: "audio/mpeg" }
      : { video: outputBuffer, mimetype: "video/mp4" };

    await client.sendMessage(from, message, { quoted: mek });
  } catch (error) {
    console.error("trim error:", error);
    await reply("❌ Trimming failed.");
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

pcmd({
  pattern: "volume",
  description: "Adjust volume of quoted audio or video (e.g., .volume 1.5)",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, q, mek, reply } = conText;

  if (!q) return reply("⚠️ Example: .volume 1.5");

  let mediaType = null, mediaTypeName = null;
  if (quotedMsg?.audioMessage) { mediaType = quotedMsg.audioMessage; mediaTypeName = 'audio'; }
  else if (quotedMsg?.videoMessage) { mediaType = quotedMsg.videoMessage; mediaTypeName = 'video'; }
  if (!mediaType) return reply("❌ Quote an audio or video.");

  const isAudio = mediaTypeName === 'audio';
  const ext = isAudio ? '.mp3' : '.mp4';
  const id = Date.now();
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `vol_in_${id}${ext}`);
  const outputPath = path.join(tmpDir, `vol_out_${id}${ext}`);

  try {
    const buffer = await downloadMediaBuffer(client, mediaType, mediaTypeName);
    fs.writeFileSync(inputPath, buffer);

    execSync(
      `"${ffmpegPath}" -y -i "${inputPath}" -filter:a "volume=${q}" "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' }
    );

    const outputBuffer = fs.readFileSync(outputPath);
    const message = isAudio
      ? { audio: outputBuffer, mimetype: "audio/mpeg" }
      : { video: outputBuffer, mimetype: "video/mp4" };

    await client.sendMessage(from, message, { quoted: mek });
  } catch (error) {
    console.error("volume error:", error);
    await reply("❌ Volume adjustment failed.");
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

pcmd({
  pattern: "toaudio",
  description: "Extract audio from quoted video or resend audio",
  category: "Converter",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, mek, reply } = conText;

  let mediaType = null, mediaTypeName = null;
  if (quotedMsg?.videoMessage) { mediaType = quotedMsg.videoMessage; mediaTypeName = 'video'; }
  else if (quotedMsg?.audioMessage) { mediaType = quotedMsg.audioMessage; mediaTypeName = 'audio'; }
  if (!mediaType) return reply("❌ Quote an audio or video.");

  const id = Date.now();
  const tmpDir = os.tmpdir();
  const inputExt = mediaTypeName === 'video' ? '.mp4' : '.tmp';
  const inputPath = path.join(tmpDir, `toaudio_in_${id}${inputExt}`);
  const outputPath = path.join(tmpDir, `toaudio_out_${id}.mp3`);

  try {
    const buffer = await downloadMediaBuffer(client, mediaType, mediaTypeName);
    fs.writeFileSync(inputPath, buffer);

    execSync(
      `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a libmp3lame -q:a 4 "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' }
    );

    const outputBuffer = fs.readFileSync(outputPath);
    await client.sendMessage(from, { audio: outputBuffer, mimetype: "audio/mpeg" }, { quoted: mek });
  } catch (error) {
    console.error("toaudio error:", error);
    await reply("❌ An error occurred while extracting audio.");
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

pcmd({
  pattern: "toimg",
  aliases: ["sticker2img", "webp2png"],
  description: "Convert quoted sticker to image or video if animated",
  category: "Converter",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, mek, reply } = conText;

  if (!quotedMsg?.stickerMessage) return reply("❌ Quote a sticker to convert.");

  try {
    const buffer = await downloadMediaBuffer(client, quotedMsg.stickerMessage, 'sticker');
    const isAnimated = quotedMsg.stickerMessage.isAnimated || quotedMsg.stickerMessage.isAnimatedSticker;

    if (isAnimated) {
      // Extract frames with sharp, rebuild as mp4 with ffmpeg-static
      const metadata = await sharp(buffer, { animated: true }).metadata();
      const pages = metadata.pages || 1;

      const id = Date.now();
      const tmpDir = os.tmpdir();
      const framesDir = path.join(tmpDir, `frames_${id}`);
      const outputPath = path.join(tmpDir, `toimg_out_${id}.mp4`);
      fs.mkdirSync(framesDir, { recursive: true });

      for (let i = 0; i < pages; i++) {
        const frameBuf = await sharp(buffer, { animated: false, page: i }).png().toBuffer();
        fs.writeFileSync(path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`), frameBuf);
      }

      execSync(
        `"${ffmpegPath}" -y -framerate 15 -i "${framesDir}/frame_%04d.png" ` +
        `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p -movflags faststart "${outputPath}"`,
        { timeout: 60000, stdio: 'pipe' }
      );

      const videoBuffer = fs.readFileSync(outputPath);
      await client.sendMessage(from, {
        video: videoBuffer,
        mimetype: "video/mp4",
        caption: "🎞️ Converted from animated sticker"
      }, { quoted: mek });

      try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
    } else {
      // Static sticker → PNG via sharp
      const pngBuffer = await sharp(buffer).png().toBuffer();
      await client.sendMessage(from, {
        image: pngBuffer,
        caption: "🖼️ Converted from sticker"
      }, { quoted: mek });
    }
  } catch (e) {
    console.error("toimg error:", e);
    await reply("❌ Unable to convert the sticker. " + e.message);
  }
});

pcmd({
  pattern: "amplify",
  aliases: ["replaceaudio", "mergeaudio"],
  description: "Replace quoted video's audio with a new audio URL",
  category: "Utility",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, q, mek, reply } = conText;

  if (!quotedMsg?.videoMessage) return reply("❌ Reply to a video file with an audio URL.");
  if (!q) return reply("❌ Provide an audio URL.");

  const id = Date.now();
  const tmpDir = os.tmpdir();
  const videoPath = path.join(tmpDir, `amp_vid_${id}.mp4`);
  const ext = (q.trim().split('.').pop().split('?')[0].toLowerCase()) || 'mp3';
  const audioPath = path.join(tmpDir, `amp_audio_${id}.${ext}`);
  const outputPath = path.join(tmpDir, `amp_out_${id}.mp4`);

  try {
    const videoBuffer = await downloadMediaBuffer(client, quotedMsg.videoMessage, 'video');
    fs.writeFileSync(videoPath, videoBuffer);

    const response = await axios.get(q.trim(), { responseType: 'arraybuffer', timeout: 60000 });
    fs.writeFileSync(audioPath, Buffer.from(response.data));

    execSync(
      `"${ffmpegPath}" -y -i "${videoPath}" -i "${audioPath}" ` +
      `-c:v copy -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`,
      { timeout: 120000, stdio: 'pipe' }
    );

    const videoBufferOut = fs.readFileSync(outputPath);
    await client.sendMessage(from, {
      video: videoBufferOut,
      mimetype: "video/mp4"
    }, { quoted: mek });

  } catch (error) {
    console.error("amplify error:", error);
    await reply("❌ An error occurred while processing the media.");
  } finally {
    try { fs.unlinkSync(videoPath); } catch {}
    try { fs.unlinkSync(audioPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

