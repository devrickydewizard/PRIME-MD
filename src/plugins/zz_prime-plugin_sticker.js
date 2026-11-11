// PRIME plugin: Sticker.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const axios = require('axios');

const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const { Sticker, StickerTypes } = require('wa-sticker-formatter');

const fs = require('fs');

const { execSync } = require('child_process');

const os = require('os');

const path = require('path');

const sharp = require('sharp');

let ffmpegPath;

try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = 'ffmpeg';
}

const TG_API = "https://api.telegram.org/bot8313451751:AAHN_5RniuG3iGKIiDJ9_DsOaiVxmejzTcE";

const makeVideoSticker = async (inputBuffer, pushName, author) => {
  const id = Date.now();
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `tg_video_${id}.mp4`);
  const processedPath = path.join(tmpDir, `tg_stk_${id}.mp4`);
  
  fs.writeFileSync(inputPath, inputBuffer);
  
  try {
    execSync(
      `"${ffmpegPath}" -y -i "${inputPath}" -t 6 ` +
      `-vf "scale=512:512:force_original_aspect_ratio=increase,fps=10,` +
      `crop=min(iw\\,ih):min(iw\\,ih),scale=512:512" ` +
      `-an -c:v libx264 -crf 28 -preset ultrafast "${processedPath}"`,
      { timeout: 30000, stdio: 'pipe' }
    );
    
    const sticker = new Sticker(fs.readFileSync(processedPath), {
      pack: pushName || "Telegram",
      author: author || "Bot",
      type: StickerTypes.FULL,
      quality: 40,
    });
    
    const buf = await sticker.toBuffer();
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(processedPath); } catch {}
    return buf;
    
  } catch (err) {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(processedPath); } catch {}
    throw err;
  }
};

const makeImageSticker = async (inputBuffer, pushName, author) => {
  const sticker = new Sticker(inputBuffer, {
    pack: pushName || "Telegram",
    author: author || "Bot",
    type: StickerTypes.FULL,
    quality: 80
  });
  return await sticker.toBuffer();
};

const makeAnimatedSticker = async (inputBuffer, pushName, author) => {
  try {
    return await makeVideoSticker(inputBuffer, pushName, author);
  } catch (err) {
    console.error("Animated sticker conversion failed:", err.message);
    throw err;
  }
};

function isAnimatedWebp(buffer) {
  if (!buffer || buffer.length < 50) return false;
  const header = buffer.toString('hex', 0, 200);
  return header.includes('414e494d') || header.includes('616e696d');
}

pcmd({
  pattern: "tgs2",
  aliases: ["telesticker2"],
  description: "Import Telegram sticker set (individual stickers)",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, pushName, author, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("Owner only!");
  if (!q) return reply("Usage: .tgs2 https://t.me/addstickers/Name");

  if (!q.includes('/addstickers/')) {
    return reply("Invalid link. Use: https://t.me/addstickers/Name");
  }

  const name = q.split('/addstickers/')[1];
  
  try {
    await reply(`Fetching ${name}...`);

    const res = await axios.get(`${TG_API}/getStickerSet?name=${encodeURIComponent(name)}`);
    const set = res.data.result;

    if (!set?.stickers?.length) return reply("No stickers found.");

    let sent = 0;
    let skipped = 0;

    for (const item of set.stickers) {
      try {
        const fileRes = await axios.get(`${TG_API}/getFile?file_id=${item.file_id}`);
        const filePath = fileRes.data.result.file_path;
        const extension = path.extname(filePath).toLowerCase();

        const bufferRes = await axios({
          method: 'GET',
          url: `https://api.telegram.org/file/bot${TG_API.split('/bot')[1]}/${filePath}`,
          responseType: 'arraybuffer'
        });

        let stickerBuffer;
        
        if (extension === '.mp4' || extension === '.webm' || item.is_video) {
          try {
            stickerBuffer = await makeVideoSticker(bufferRes.data, pushName, author);
          } catch (err) {
            console.error("Video sticker conversion failed:", err.message);
            skipped++;
            continue;
          }
        } else if (extension === '.tgs' || item.is_animated) {
          skipped++;
          continue;
        } else {
          stickerBuffer = await makeImageSticker(bufferRes.data, pushName, author);
        }

        await client.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });
        sent++;
        await new Promise(r => setTimeout(r, 300));
        
      } catch (err) {
        console.error("Error on sticker:", err.message);
        skipped++;
      }
    }

    let replyMsg = `Sent ${sent} stickers from ${set.title || name}!`;
    if (skipped > 0) {
      replyMsg += `\nSkipped ${skipped} animated/TGS stickers (not supported)`;
    }
    await reply(replyMsg);

  } catch (err) {
    console.error("tgs2 error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "tgs",
  aliases: ["telesticker", "spack", "stickerpack"],
  description: "Import Telegram sticker set as a sticker pack",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, pushName, author, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("Owner only!");
  if (!q) return reply("Usage: .tgs https://t.me/addstickers/Name");

  if (!q.includes('/addstickers/')) {
    return reply("Invalid link. Use: https://t.me/addstickers/Name");
  }

  const name = q.split('/addstickers/')[1];
  
  try {
    await reply(`Fetching ${name}...`);

    const res = await axios.get(`${TG_API}/getStickerSet?name=${encodeURIComponent(name)}`);
    const set = res.data.result;

    if (!set?.stickers?.length) return reply("No stickers found.");

    const stickerBuffers = [];
    let failed = 0;
    let coverBuffer = null;
    const MAX_STICKERS = 60;

    const stickersToProcess = set.stickers.slice(0, MAX_STICKERS);

    for (let i = 0; i < stickersToProcess.length; i++) {
      const item = stickersToProcess[i];
      try {
        const fileRes = await axios.get(`${TG_API}/getFile?file_id=${item.file_id}`);
        const filePath = fileRes.data.result.file_path;
        const extension = path.extname(filePath).toLowerCase();

        const bufferRes = await axios({
          method: 'GET',
          url: `https://api.telegram.org/file/bot${TG_API.split('/bot')[1]}/${filePath}`,
          responseType: 'arraybuffer'
        });

        let stickerBuffer;
        
        if (extension === '.mp4' || extension === '.webm' || item.is_video) {
          try {
            stickerBuffer = await makeVideoSticker(bufferRes.data, pushName, author);
          } catch (err) {
            console.error("Video sticker conversion failed:", err.message);
            failed++;
            continue;
          }
        } else if (extension === '.tgs' || item.is_animated) {
          try {
            stickerBuffer = await makeAnimatedSticker(bufferRes.data, pushName, author);
          } catch (err) {
            console.error("Animated sticker conversion failed:", err.message);
            failed++;
            continue;
          }
        } else {
          stickerBuffer = await makeImageSticker(bufferRes.data, pushName, author);
        }

        if (stickerBuffer && stickerBuffer.length > 0) {
          stickerBuffers.push(stickerBuffer);
          if (i === 0 && !coverBuffer) {
            coverBuffer = stickerBuffer;
          }
        }
        
      } catch (err) {
        console.error("Error on sticker:", err.message);
        failed++;
      }
    }

    if (stickerBuffers.length === 0) {
      return reply("Failed to convert any stickers.");
    }

    if (!coverBuffer) {
      coverBuffer = await sharp({
        create: {
          width: 512,
          height: 512,
          channels: 4,
          background: { r: 100, g: 150, b: 255, alpha: 1 }
        }
      })
      .png()
      .toBuffer();
    }

    const packName = set.title || name;
    const stickers = stickerBuffers.map((buffer) => ({
      sticker: buffer,
      emojis: [""]
    }));

    await client.sendMessage(from, {
      stickerPack: {
        name: packName,
        publisher: pushName || "Telegram Pack",
        description: `${stickerBuffers.length} stickers`,
        cover: coverBuffer,
        stickers: stickers
      }
    }, { quoted: mek });

    let replyMsg = `Sticker pack "${packName}" sent! (${stickerBuffers.length} stickers)`;
    if (failed > 0) {
      replyMsg += `\nSkipped ${failed} stickers that couldn't be converted.`;
    }
    if (set.stickers.length > MAX_STICKERS) {
      replyMsg += `\n⚠️ Only first ${MAX_STICKERS} stickers processed.`;
    }
    //await reply(replyMsg);

  } catch (err) {
    console.error("tgs error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "stickersearch2",
  aliases: ["ssearch2"],
  description: "Search Tenor stickers (individual)",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, pushName, author, mek, api } = conText;

  if (!q) return reply("Where is the request?\n\nExample: stickersearch2 happy dance");

  try {
    const response = await axios.get(`${api}/search/sticker?q=${encodeURIComponent(q)}`);
    const data = response.data;

    if (!data.status || !data.result?.results?.length) {
      return reply("No stickers found for that query.");
    }

    const results = data.result.results.slice(0, 10);
    let sent = 0;

    for (const item of results) {
      const gifUrl = item.media?.gif || item.media?.webp || item.url;
      if (!gifUrl) continue;

      try {
        const sticker = new Sticker(gifUrl, {
          pack: pushName || "Sticker Search",
          author: author || "WhatsApp Bot",
          type: StickerTypes.FULL,
          categories: ["🤩", "🎉"],
          id: `search-${Date.now()}-${sent}`,
          quality: 60,
          background: "transparent"
        });

        const buffer = await sticker.toBuffer();
        await client.sendMessage(from, { sticker: buffer }, { quoted: mek });
        sent++;
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error("Sticker conversion error:", err.message);
      }
    }

    if (sent === 0) {
      return reply("Failed to convert any stickers. Try a different query.");
    }

  } catch (err) {
    console.error("stickersearch2 error:", err);
    reply("Error while searching for stickers.");
  }
});

pcmd({
  pattern: "stickersearch",
  aliases: ["ssearch", "stickerpacksearch"],
  description: "Search Tenor stickers and send as sticker pack",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, pushName, author, mek, api } = conText;

  if (!q) return reply("Where is the request?\n\nExample: stickersearch happy dance");

  try {
    const response = await axios.get(`${api}/search/sticker?q=${encodeURIComponent(q)}`);
    const data = response.data;

    if (!data.status || !data.result?.results?.length) {
      return reply("No stickers found for that query.");
    }

    const results = data.result.results.slice(0, 10);
    const stickerBuffers = [];
    let coverBuffer = null;

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const gifUrl = item.media?.gif || item.media?.webp || item.url;
      if (!gifUrl) continue;

      try {
        const sticker = new Sticker(gifUrl, {
          pack: pushName || "Sticker Search",
          author: author || "WhatsApp Bot",
          type: StickerTypes.FULL,
          categories: ["🤩", "🎉"],
          id: `search-${Date.now()}-${i}`,
          quality: 60,
          background: "transparent"
        });

        const buffer = await sticker.toBuffer();
        if (buffer && buffer.length > 0) {
          stickerBuffers.push(buffer);
          if (i === 0 && !coverBuffer) {
            coverBuffer = buffer;
          }
        }
      } catch (err) {
        console.error("Sticker conversion error:", err.message);
      }
    }

    if (stickerBuffers.length === 0) {
      return reply("Failed to convert any stickers. Try a different query.");
    }

    if (!coverBuffer) {
      coverBuffer = await sharp({
        create: {
          width: 512,
          height: 512,
          channels: 4,
          background: { r: 100, g: 150, b: 255, alpha: 1 }
        }
      })
      .png()
      .toBuffer();
    }

    const stickers = stickerBuffers.map((buffer) => ({
      sticker: buffer,
      emojis: [""]
    }));

    await client.sendMessage(from, {
      stickerPack: {
        name: data.result.query || "Sticker Pack",
        publisher: pushName || "Sticker Search",
        description: `${stickerBuffers.length} stickers found`,
        cover: coverBuffer,
        stickers: stickers
      }
    }, { quoted: mek });

 //   await reply(`Sticker pack "${data.result.query}" sent! (${stickerBuffers.length} stickers)`);

  } catch (err) {
    console.error("stickersearch error:", err);
    reply("Error while searching for stickers.");
  }
});

pcmd({
  pattern: "sticker",
  aliases: ["stik", "s", "stikpack"],
  description: "Create sticker from quoted image or video",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, pushName, author, mek, reply } = conText;

  if (!quotedMsg) return reply("Quote an image or a short video.");

  let media;
  let isVideo = false;

  if (quotedMsg.imageMessage) {
    media = quotedMsg.imageMessage;
  } else if (quotedMsg.videoMessage) {
    media = quotedMsg.videoMessage;
    isVideo = true;
  } else {
    return reply("That is neither an image nor a short video.");
  }

  if (isVideo) {
    const sizeMB = (media.fileLength || 0) / (1024 * 1024);
    const seconds = media.seconds || 0;
    if (sizeMB > 8) return reply(`Video too large (${sizeMB.toFixed(1)} MB). Max is 8 MB.`);
    if (seconds > 10) return reply(`Video too long (${seconds}s). Max is 10 seconds.`);
  }

  try {
    let mediaType = isVideo ? 'videoMessage' : 'imageMessage';
    const buffer = await downloadMediaMessage(
      { message: { [mediaType]: media } },
      'buffer',
      {},
      { reuploadRequest: client.updateMediaMessage, logger: console }
    );

    let stickerBuffer;

    if (isVideo) {
      const makeVideoSticker = async (inputBuffer, fps, quality) => {
        const id = Date.now();
        const tmpDir = os.tmpdir();
        const inputPath = path.join(tmpDir, `stk_video_${id}.mp4`);
        const processedPath = path.join(tmpDir, `stk_${id}_${fps}fps.mp4`);
        
        fs.writeFileSync(inputPath, inputBuffer);
        
        try {
          execSync(
            `"${ffmpegPath}" -y -i "${inputPath}" -t 6 ` +
            `-vf "scale=512:512:force_original_aspect_ratio=increase,fps=${fps},` +
            `crop=min(iw\\,ih):min(iw\\,ih),scale=512:512" ` +
            `-an -c:v libx264 -crf 28 -preset ultrafast "${processedPath}"`,
            { timeout: 30000, stdio: 'pipe' }
          );
        } catch (e) {
          fs.copyFileSync(inputPath, processedPath);
        }
        
        const sticker = new Sticker(fs.readFileSync(processedPath), {
          pack: pushName || "Sticker",
          author: author || "Bot",
          type: StickerTypes.FULL,
          quality: quality,
        });
        
        const buf = await sticker.toBuffer();
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(processedPath); } catch {}
        return buf;
      };

      try {
        stickerBuffer = await makeVideoSticker(buffer, 10, 40);
        if (!stickerBuffer || stickerBuffer.length < 500) throw new Error('Output buffer empty');

        if (stickerBuffer.length > 950 * 1024) {
          const retryBuf = await makeVideoSticker(buffer, 5, 25);
          if (retryBuf && retryBuf.length >= 500) stickerBuffer = retryBuf;
        }

        if (stickerBuffer.length > 1024 * 1024) {
          return reply(`Sticker too large. Try a shorter clip.`);
        }
      } catch (videoErr) {
        return reply(`Video sticker failed.\n${videoErr.message}`);
      }
    } else {
      const metadata = await sharp(buffer).metadata();
      const { width, height } = metadata;
      
      let resizeOptions;
      if (width === height) {
        resizeOptions = { width: 512, height: 512, fit: 'cover' };
      } else {
        resizeOptions = { width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } };
      }
      
      const webpBuffer = await sharp(buffer)
        .resize(512, 512, resizeOptions)
        .webp({ quality: 85 })
        .toBuffer();

      const sticker = new Sticker(webpBuffer, {
        pack: pushName || "Sticker",
        author: author || "Bot",
        type: StickerTypes.FULL,
        categories: ["🤩", "🎉"],
        quality: 85,
        background: "transparent"
      });

      stickerBuffer = await sticker.toBuffer();
    }

    await client.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });
    
  } catch (err) {
    console.error("sticker error:", err);
    await reply(`Failed: ${err.message}`);
  }
});

pcmd({
  pattern: "tovideo",
  aliases: ["tomp4", "tovid", "mp4", "stickertomp4"],
  description: "Convert animated sticker to video",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, quotedMsg, mek, isSuperUser } = conText;

  if (!quotedMsg) {
    return reply("Reply to an animated sticker with .tovideo\nAliases: .tomp4, .tovid, .stickertomp4");
  }

  const stickerMsg = quotedMsg.stickerMessage;
  if (!stickerMsg) {
    return reply("Reply to a sticker!");
  }

  try {
    const buffer = await downloadMediaMessage(
      { message: { stickerMessage: stickerMsg } },
      'buffer',
      {},
      { reuploadRequest: client.updateMediaMessage, logger: console }
    );

    const isAnimated = isAnimatedWebp(buffer);

    if (!isAnimated) {
      const pngBuffer = await sharp(buffer).png().toBuffer();
      await client.sendMessage(from, {
        image: pngBuffer,
        caption: "Static sticker converted to image!"
      }, { quoted: mek });
      return;
    }

    const metadata = await sharp(buffer, { animated: true }).metadata();
    const pages = metadata.pages || 1;

    const id = Date.now();
    const tmpDir = os.tmpdir();
    const framesDir = path.join(tmpDir, `frames_${id}`);
    const outputPath = path.join(tmpDir, `video_${id}.mp4`);
    
    fs.mkdirSync(framesDir, { recursive: true });

    for (let i = 0; i < pages; i++) {
      const frameBuf = await sharp(buffer, { animated: false, page: i })
        .png()
        .toBuffer();
      const framePath = path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`);
      fs.writeFileSync(framePath, frameBuf);
    }

    execSync(
      `"${ffmpegPath}" -y -framerate 15 -i "${framesDir}/frame_%04d.png" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p -movflags faststart "${outputPath}"`,
      { timeout: 60000, stdio: 'pipe' }
    );

    if (!fs.existsSync(outputPath)) {
      return reply('Output file not created');
    }

    const videoBuffer = fs.readFileSync(outputPath);
    await client.sendMessage(from, { video: videoBuffer }, { quoted: mek });

    try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}

  } catch (err) {
    console.error("tovideo error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "attp2",
  aliases: ["textgif", "tenorsticker"],
  description: "Create animated text sticker using Tenor API",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, mek, reply, pushName, author } = conText;

  if (!q) {
    return reply(`ATTp2 - Tenor Animated Text Sticker
    
Usage: .attp2 text | style
Styles: neon, rainbow, fire, ice, shadow
Example: .attp2 prime | neon`);
  }

  let text = q;
  let style = "258698638";
  
  if (q.includes('|')) {
    const parts = q.split('|');
    text = parts[0].trim();
    const styleName = parts[1].trim().toLowerCase();
    
    const styleMap = {
      neon: "258698638",
      rainbow: "258698639",
      fire: "258698640",
      ice: "258698641",
      shadow: "258698642"
    };
    
    style = styleMap[styleName] || "258698638";
  }

  const encodedText = encodeURIComponent(text);
  const apiUrl = `https://tenor.googleapis.com/v2/render_dynamic_text?client_key=waffles&key=AIzaSyCbDgY_wZO9guZMktW6MnOGo-nKVFXqaUE&%24alt=proto&text=${encodedText}&id=${style}`;

  try {
    const response = await axios.get(apiUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.data || response.data.byteLength < 500) {
      return reply("Failed to generate animated sticker! Try different text.");
    }

    const sticker = new Sticker(response.data, {
      pack: pushName || "ATTp2 Pack",
      author: author || "WhatsApp Bot",
      type: StickerTypes.FULL,
      categories: ["✨", "📝", "🎨"],
      id: `attp2-${Date.now()}`,
      quality: 90,
      background: "#FFFFFF"
    });

    const stickerBuffer = await sticker.toBuffer();
    
    await client.sendMessage(from, { 
      sticker: stickerBuffer 
    }, { quoted: mek });

  } catch (err) {
    console.error("attp2 error:", err);
    
    let errorMsg = "Failed to generate animated sticker!";
    
    if (err.code === 'ECONNABORTED') {
      errorMsg = "Request timeout! Please try again with shorter text.";
    } else if (err.response?.status === 403) {
      errorMsg = "API key expired or invalid! Please use another method.";
    } else if (err.response?.status === 404) {
      errorMsg = "Style not found! Using default style.";
    }
    
    await reply(errorMsg);
  }
});

pcmd({
  pattern: "attp",
  aliases: ["texttosticker", "txtsticker"],
  description: "Convert text to animated sticker (ATTp)",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, mek, reply, pushName, author } = conText;

  if (!q) {
    return reply(`ATTp - Any Text To Sticker
    
Usage: .attp text
Example: .attp Hello World`);
  }

  const encodedText = encodeURIComponent(q);
  const apiUrl = `https://api.deline.web.id/maker/attp?text=${encodedText}`;

  try {
    const response = await axios.get(apiUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    if (!response.data || response.data.byteLength < 100) {
      return reply("Failed to generate sticker! Try different text.");
    }

    const sticker = new Sticker(response.data, {
      pack: pushName || "ATTp Pack",
      author: author || "WhatsApp Bot",
      type: StickerTypes.FULL,
      categories: ["✨", "📝", "🎨"],
      id: `attp-${Date.now()}`,
      quality: 85,
      background: "#FFFFFF"
    });

    const stickerBuffer = await sticker.toBuffer();
    
    await client.sendMessage(from, { 
      sticker: stickerBuffer 
    }, { quoted: mek });

  } catch (err) {
    console.error("attp error:", err);
    await reply("Failed to generate sticker! Please try again.");
  }
});

pcmd({
  pattern: "egif",
  aliases: ["emojisticker", "emojigif", "emosticker"],
  description: "Convert emoji to animated sticker (GIF)",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, mek, reply, pushName, author } = conText;

  if (!q) {
    return reply("Provide an emoji!\nExample: .egif 😂");
  }

  const emojiMatch = q.match(/([\p{Emoji_Presentation}|\p{Extended_Pictographic}])/u);
  if (!emojiMatch) {
    return reply("Please provide a valid emoji!");
  }

  const emoji = emojiMatch[0];
  const emojiCode = emoji.codePointAt(0).toString(16);
  const gifUrl = `https://fonts.gstatic.com/s/e/notoemoji/latest/${emojiCode}/512.gif`;

  try {
    const response = await axios.get(gifUrl, {
      responseType: 'arraybuffer'
    });

    if (!response.data) {
      return reply("Failed to fetch emoji GIF!");
    }

    const sticker = new Sticker(response.data, {
      pack: pushName || "Emoji Sticker",
      author: author || "WhatsApp Bot",
      type: StickerTypes.FULL,
      categories: ["✨", "🎨"],
      id: `emoji-${emojiCode}`,
      quality: 80,
      background: "transparent"
    });

    const stickerBuffer = await sticker.toBuffer();
    
    await client.sendMessage(from, { 
      sticker: stickerBuffer 
    }, { quoted: mek });

  } catch (err) {
    console.error("egif error:", err);
    await reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "emomix",
  aliases: ["emojimix", "emix"],
  description: "Mix two emojis into a custom sticker",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, mek, reply, pushName, author } = conText;

  if (!q) {
    return reply("Provide two emojis separated by +\nExample: .emomix 😹+😹");
  }

  try {
    const res = await axios.get(`https://levanter.onrender.com/emix?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !data.result) {
      return reply("Failed to generate emoji mix.");
    }

    const sticker = new Sticker(data.result, {
      pack: pushName || "EmojiMix",
      type: StickerTypes.FULL,
      categories: ["✨", "🔥"],
      id: "emomix-001",
      quality: 70,
      background: "transparent"
    });

    const buffer = await sticker.toBuffer();
    await client.sendMessage(from, { sticker: buffer }, { quoted: mek });

  } catch (err) {
    console.error("emomix error:", err);
    await reply("Error generating emoji mix: " + err.message);
  }
});

pcmd({
  pattern: "take",
  aliases: ["restick", "grabsticker"],
  description: "Quote a sticker and resend it with your packname and author",
  category: "Sticker",
  filename: __filename
}, async (from, client, conText) => {
  const { quotedMsg, pushName, author, mek, reply } = conText;

  if (!quotedMsg?.stickerMessage) {
    return reply("Quote a sticker to restick.");
  }

  try {
    const media = quotedMsg.stickerMessage;
    const result = await client.downloadAndSaveMediaMessage(media);

    const sticker = new Sticker(result, {
      pack: pushName,
      type: StickerTypes.FULL,
      categories: ["🤩", "🎉"],
      id: "restick-123",
      quality: 70,
      background: "transparent"
    });

    const buffer = await sticker.toBuffer();
    await client.sendMessage(from, { sticker: buffer }, { quoted: mek });
  } catch (err) {
    console.error("take error:", err);
    await reply("Failed to restick the quoted sticker.");
  }
});

