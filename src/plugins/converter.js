const { cmd, toAudio, toVideo, toPtt, stickerToImage, gmdFancy, gmdRandom, runFFmpeg, getVideoDuration, gmdSticker } = require("../lib");
const fs = require("fs").promises;
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const { StickerTypes } = require("wa-sticker-formatter");
const {
  getSetting,
  setSetting,
} = require("../lib/database/settings");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED HELPER — pack/author resolution
// Priority: typed in q > conText.packName/Author > DB (PACK_NAME/PACK_AUTHOR)
// > PACKNAME env var > hardcoded default
//
// Separator rules:
// - Explicit "," "|" "#" ALWAYS wins → split pack | author, regardless of lines
// - No explicit separator + exactly 2 lines → line1 = pack, line2 = author
// - No explicit separator + 3+ lines → ALL lines = pack name (multi-line pack,
//   author untouched) so multi-line pack text doesn't get cut into an author
// ━━━━━━━━━━━━━━━

function splitPackString(str = "") {
    str = str.replace(/--crop|-c/gi, "");

    // ✅ Explicit separators always win (comma, pipe, hash)
    const explicitIdx = Math.max(
        str.lastIndexOf(","),
        str.lastIndexOf("|"),
        str.lastIndexOf("#")
    );

    if (explicitIdx !== -1) {
        return [
            str.slice(0, explicitIdx).trim(),
            str.slice(explicitIdx + 1).trim()
        ];
    }

    // No explicit separator → split by newlines
    const lines = str.split("\n").map(l => l.trim()).filter(Boolean);

    if (lines.length <= 1) {
        return [str.trim()];
    }

    // ✅ 2 or more lines → Line 1 is Pack Name, Line 2+ is Author
    return [lines[0], lines.slice(1).join(" ")];
}

// ✅ FIXED — empty/whitespace-only q will no longer override pack
async function resolvePackInfo(q, fallbackPack, fallbackAuthor) {
    const rawQ = (q || "").replace(/--crop|-c/gi, "").trim();

    if (rawQ) {
        const qParts = splitPackString(rawQ);
        console.log(`[PackInfo][DEBUG] source: q | pack: ${qParts[0]} | author: ${qParts[1] || ""}`);
        return { packName: qParts[0], packAuthor: qParts[1] || "" };
    }

    if (fallbackPack) {
        console.log(`[PackInfo][DEBUG] source: conText | pack: ${fallbackPack} | author: ${fallbackAuthor || ""}`);
        return { packName: fallbackPack, packAuthor: fallbackAuthor || "" };
    }

    try {
        const dbPack = await getSetting("PACK_NAME");
        const dbAuthor = await getSetting("PACK_AUTHOR");
        if (dbPack || dbAuthor) {
            console.log(`[PackInfo][DEBUG] source: DB | pack: ${dbPack || ""} | author: ${dbAuthor || ""}`);
            return { packName: dbPack || "", packAuthor: dbAuthor || "" };
        }
    } catch (e) {
        console.error(`[PackInfo][DEBUG] DB read failed: ${e.message}`);
    }

    const envParts = splitPackString(process.env.PACKNAME || "PRIME-MD");
    console.log(`[PackInfo][DEBUG] source: env/default | pack: ${envParts[0] || "PRIME-MD"} | author: ${envParts[1] || ""}`);
    return { packName: envParts[0] || "PRIME-MD", packAuthor: envParts[1] || "" };
}

// ━━━━━━━━━━━━━━━
// SETPACKNAME — multi-line q (pack + author) support
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
  {
    pattern: "setpackname",
    aliases: ["packname", "stickerpack", "stickername"],
    react: "⚙️",
    category: "owner",
    description: "Set sticker pack name & author",
  },
  async (from, sock, conText) => {
    const { q, reply, react, isSuperUser, botPrefix } = conText;

    if (!isSuperUser) return reply("🙅‍♂️ Owner Only Command!");

    if (!q) {
      return reply(
`📦 *STICKER PACK SETTINGS*

*Set pack name:*
\`${botPrefix}setpackname PRIME-MD\`

*Set pack name & author:*
\`${botPrefix}setpackname PRIME-MD | BOT\`

*Set author only:*
\`${botPrefix}setpackname | ALI\`

*Multi-line (2 lines = pack + author):*
\`${botPrefix}setpackname\`
\`PRIME-MD\`
\`BOT\`

*Multi-line pack name (3+ lines, no separator = all pack, no author):*
\`${botPrefix}setpackname\`
\`PRIME-MD\`
\`Premium Edition\`
\`2026\``
      );
    }

    try {
      const parts = splitPackString(q);
      const hasAuthorField = parts.length > 1;

      let newPack = parts[0]?.trim() || "";
      let newAuthor = hasAuthorField ? (parts[1]?.trim() || "") : "";

      // ✅ Only save what you set, reset the rest
      if (!hasAuthorField) {
        await setSetting("PACK_NAME", newPack);
        await setSetting("PACK_AUTHOR", "");
        await react("✅");
        return reply(`✅ *Pack name updated!*\n📦 Pack: ${newPack}`);
      }

      await setSetting("PACK_NAME", newPack);
      await setSetting("PACK_AUTHOR", newAuthor);

      await react("✅");
      return reply(`✅ *Pack name updated!*\n\n📦 Pack: ${newPack}\n👤 Author: ${newAuthor}`);

    } catch (error) {
      console.error("[SetPackName] Error:", error.message);
      return reply(`🙅‍♂️ Error: ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAKE — re-tag with custom pack/author (multi-line q support)
// ━━━━━━━━━━━━━━━━━━━━━━━

cmd({
    pattern: "take",
    aliases: ["retag"],
    category: "converter",
    react: "🏷️",
    description: "Re-tag image/video/sticker with custom pack name & author.",
}, async (from, sock, conText) => {
    const { q, mek, reply, react, quoted } = conText;

    try {
        if (!quoted) {
            await react("🙅‍♂️");
            return reply("Please reply to an image, video or sticker\nExample:\n.take ALI\n.take ALI,MD");
        }

        const quotedImg = quoted?.imageMessage || quoted?.message?.imageMessage;
        const quotedSticker = quoted?.stickerMessage || quoted?.message?.stickerMessage;
        const quotedVideo = quoted?.videoMessage || quoted?.message?.videoMessage;

        if (!quotedImg &&!quotedSticker &&!quotedVideo) {
            await react("🙅‍♂️");
            return reply("That quoted message is not an image, video or sticker");
        }

        const { packName: finalPack, packAuthor: finalAuthor } = await resolvePackInfo(q, null, "");
        console.log(`[Take][DEBUG] pack: ${finalPack} | author: ${finalAuthor}`);

        let tempFilePath;
        try {
            if (quotedImg || quotedVideo) {
                tempFilePath = await sock.downloadAndSaveMediaMessage(
                    quotedImg || quotedVideo,
                    "temp_media"
                );

                let fileExt = quotedImg? ".jpg" : ".mp4";
                let mediaFile = gmdRandom(fileExt);
                const data = await fs.readFile(tempFilePath);
                await fs.writeFile(mediaFile, data);

                if (quotedVideo) {
                    const compressedFile = gmdRandom(".webp");
                    let duration = 8;

                    try {
                        duration = await getVideoDuration(mediaFile);
                        if (duration > 10) duration = 10;
                    } catch (e) {
                        console.error("[Take][DEBUG] duration fetch failed, using default:", e.message);
                    }

                    await runFFmpeg(mediaFile, compressedFile, 320, 15, duration);
                    await fs.unlink(mediaFile).catch(() => {});
                    mediaFile = compressedFile;
                }

                const stickerBuffer = await gmdSticker(mediaFile, {
                    pack: finalPack,
                    author: finalAuthor,
                    type: (q || "").includes("--crop") || (q || "").includes("-c")? StickerTypes.CROPPED : StickerTypes.FULL,
                    categories: ["🤩", "🎉"],
                    id: "12345",
                    quality: 75,
                    background: "transparent"
                });

                await fs.unlink(mediaFile).catch(() => {});
                await react("✅");
                console.log(`[Take][DEBUG] ✅ sent`);
                return sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });

            } else if (quotedSticker) {
                tempFilePath = await sock.downloadAndSaveMediaMessage(quotedSticker, "temp_media");
                const stickerData = await fs.readFile(tempFilePath);
                const stickerFile = gmdRandom(".webp");
                await fs.writeFile(stickerFile, stickerData);

                const newStickerBuffer = await gmdSticker(stickerFile, {
                    pack: finalPack,
                    author: finalAuthor,
                    type: (q || "").includes("--crop") || (q || "").includes("-c")? StickerTypes.CROPPED : StickerTypes.FULL,
                    categories: ["🤩", "🎉"],
                    id: "12345",
                    quality: 75,
                    background: "transparent"
                });

                await fs.unlink(stickerFile).catch(() => {});
                await react("✅");
                console.log(`[Take][DEBUG] ✅ sent`);
                return sock.sendMessage(from, { sticker: newStickerBuffer }, { quoted: mek });
            }
        } finally {
            if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
        }
    } catch (e) {
        console.error("[Take][DEBUG] handler error:", e);
        await react("🙅‍♂️");
        await reply("Failed to re-tag sticker");
    }
});

cmd({
    pattern: "sticker",
    aliases: ["st", "s"],
    category: "converter",
    react: "🔄️",
    description: "Convert image/video/sticker to sticker.",
}, async (from, sock, conText) => {
    const { q, mek, reply, react, quoted } = conText;

    try {
    const defaultPack = await getSetting("PACK_NAME");
const defaultAuthor = await getSetting("PACK_AUTHOR");

const { packName: finalPack, packAuthor: finalAuthor } =
    await resolvePackInfo(q, defaultPack, defaultAuthor);
        if (!quoted) {
            await react("🙅‍♂️");
            return reply("Please reply to an image, video or sticker");
        }

        const quotedImg = quoted?.imageMessage || quoted?.message?.imageMessage;
        const quotedSticker = quoted?.stickerMessage || quoted?.message?.stickerMessage;
        const quotedVideo = quoted?.videoMessage || quoted?.message?.videoMessage;

        if (!quotedImg &&!quotedSticker &&!quotedVideo) {
            await react("🙅‍♂️");
            return reply("That quoted message is not an image, video or sticker");
        }

        let tempFilePath;
        try {
            if (quotedImg || quotedVideo) {
                tempFilePath = await sock.downloadAndSaveMediaMessage(
                    quotedImg || quotedVideo,
                    "temp_media"
                );

                let fileExt = quotedImg? ".jpg" : ".mp4";
                let mediaFile = gmdRandom(fileExt);
                const data = await fs.readFile(tempFilePath);
                await fs.writeFile(mediaFile, data);

                // 🔥 If video → convert to webp
                if (quotedVideo) {
                    const compressedFile = gmdRandom(".webp");
                    let duration = 8; // default duration

                    try {
                        duration = await getVideoDuration(mediaFile);
                        if (duration > 10) duration = 10; // trim to first 10 seconds
                    } catch (e) {
                        console.error("Using default duration due to error:", e);
                    }

                    await runFFmpeg(mediaFile, compressedFile, 320, 15, duration);
                    await fs.unlink(mediaFile).catch(() => {});
                    mediaFile = compressedFile;
                }

                const stickerBuffer = await gmdSticker(mediaFile, {
                    pack: finalPack,
                    author: finalAuthor,
                    type: q.includes("--crop") || q.includes("-c")? StickerTypes.CROPPED : StickerTypes.FULL,
                    categories: ["🤩", "🎉"],
                    id: "12345",
                    quality: 75,
                    background: "transparent"
                });

                await fs.unlink(mediaFile).catch(() => {});
                await react("✅");
                return sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });

            } else if (quotedSticker) {
                // Sticker → Sticker (recompress if too big)
                tempFilePath = await sock.downloadAndSaveMediaMessage(quotedSticker, "temp_media");
                const stickerData = await fs.readFile(tempFilePath);
                const stickerFile = gmdRandom(".webp");
                await fs.writeFile(stickerFile, stickerData);

                const newStickerBuffer = await gmdSticker(stickerFile, {
                    pack: finalPack,
                    author: finalAuthor,
                    type: q.includes("--crop") || q.includes("-c")? StickerTypes.CROPPED : StickerTypes.FULL,
                    categories: ["🤩", "🎉"],
                    id: "12345",
                    quality: 75,
                    background: "transparent"
                });

                await fs.unlink(stickerFile).catch(() => {});
                await react("✅");
                return sock.sendMessage(from, { sticker: newStickerBuffer }, { quoted: mek });
            }
        } finally {
            if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
        }
    } catch (e) {
        console.error("Error in sticker command:", e);
        await react("🙅‍♂️");
        await reply("Failed to convert to sticker");
    }
});
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOMP4 — sticker → video (mp4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd({
    pattern: "tomp4",
    aliases: ["s2video", "sticker2video"],
    category: "converter",
    react: "🎬",
    description: "Convert sticker to MP4 video.",
}, async (from, sock, conText) => {
    const { mek, reply, react, quoted } = conText;

    try {
        if (!quoted) {
            await react("🙅‍♂️");
            return reply("Please reply to/quote a sticker");
        }

        const quotedSticker = quoted?.stickerMessage || quoted?.message?.stickerMessage;
        if (!quotedSticker) {
            await react("🙅‍♂️");
            return reply("That quoted message is not a sticker");
        }
        console.log(`[Tomp4][DEBUG] triggered`);

        await react("⏳");

        let tempFilePath, webpFile, mp4File;
        try {
            tempFilePath = await sock.downloadAndSaveMediaMessage(quotedSticker, "temp_media");
            const stickerData = await fs.readFile(tempFilePath);
            webpFile = gmdRandom(".webp");
            await fs.writeFile(webpFile, stickerData);
            console.log(`[Tomp4][DEBUG] sticker saved: ${webpFile}`);

            mp4File = gmdRandom(".mp4");

            // ✅ ffmpeg direct call — webp (static or animated) → mp4
            // pad to even dimensions (libx264 requires even width/height) & yuv420p for compatibility
            const ffArgs = [
                "-i", webpFile,
                "-vcodec", "libx264",
                "-pix_fmt", "yuv420p",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-movflags", "+faststart",
                "-y",
                mp4File
            ];
            console.log(`[Tomp4][DEBUG] running ffmpeg: ffmpeg ${ffArgs.join(' ')}`);

            await execFileAsync("ffmpeg", ffArgs);
            console.log(`[Tomp4][DEBUG] conversion complete: ${mp4File}`);

            const videoBuffer = await fs.readFile(mp4File);
            console.log(`[Tomp4][DEBUG] video size: ${videoBuffer.length} bytes`);

            await sock.sendMessage(
                from,
                { video: videoBuffer, mimetype: "video/mp4", caption: "*Here is your MP4*" },
                { quoted: mek }
            );

            await react("✅");
            console.log(`[Tomp4][DEBUG] ✅ sent`);
        } catch (ffErr) {
            console.error("[Tomp4][DEBUG] conversion/send failed:", ffErr.message);
            await react("🙅‍♂️");
            await reply("⚠️ Failed to convert sticker to MP4 (this sticker format may not be supported).");
        } finally {
            if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
            if (webpFile) await fs.unlink(webpFile).catch(() => {});
            if (mp4File) await fs.unlink(mp4File).catch(() => {});
            console.log(`[Tomp4][DEBUG] temp files cleaned up`);
        }
    } catch (e) {
        console.error("[Tomp4][DEBUG] handler error:", e.message);
        console.error(e.stack);
        await react("🙅‍♂️");
        await reply("Failed to convert sticker to MP4");
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  EXIF — show sticker metadata
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd({
    pattern: "exif",
    aliases: ["stickerinfo"],
    category: "converter",
    react: "📝",
    description: "Show sticker EXIF metadata.",
}, async (from, sock, conText) => {
    const { reply, react, quoted } = conText;

    try {
        const quotedSticker = quoted?.stickerMessage || quoted?.message?.stickerMessage;
        if (!quotedSticker) {
            await react("🙅‍♂️");
            return reply("Please reply to/quote a sticker to see its EXIF data");
        }
        console.log(`[Exif][DEBUG] triggered`);

        await react("⏳");

        let tempFilePath;
        try {
            tempFilePath = await sock.downloadAndSaveMediaMessage(quotedSticker, "temp_media");
            const buffer = await fs.readFile(tempFilePath);
            console.log(`[Exif][DEBUG] downloaded | size: ${buffer.length} bytes`);

            let detailedExif = "N/A";
            try {
                const webp = require("node-webpmux");
                const img = new webp.Image();
                await img.load(buffer);

                if (img.exif) {
                    const json = JSON.parse(img.exif.slice(22).toString());
                    console.log(`[Exif][DEBUG] parsed exif keys: ${Object.keys(json).join(',')}`);
                    detailedExif =
                        `\n▸ *Pack ID:* ${json["sticker-pack-id"]?.substring(0, 8) || "N/A"}...` +
                        `\n▸ *Pack Name:* ${json["sticker-pack-name"] || "N/A"}` +
                        `\n▸ *Publisher:* ${json["sticker-pack-publisher"] || "N/A"}` +
                        `\n▸ *Emojis:* ${json.emojis?.join(" ") || "N/A"}`;
                } else {
                    console.log(`[Exif][DEBUG] no exif chunk found in sticker`);
                }
            } catch (parseErr) {
                console.error("[Exif][DEBUG] parse failed:", parseErr.message);
                await react("🙅‍♂️");
                return reply("🙅‍♂️ Could not parse sticker EXIF data!");
            }

            await react("✅");
            console.log(`[Exif][DEBUG] ✅ sent`);
            return await sock.sendMessage(from, { text: `📝 *Sticker EXIF Data:*${detailedExif}` });
        } finally {
            if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
        }
    } catch (e) {
        console.error("[Exif][DEBUG] handler error:", e.message);
        console.error(e.stack);
        await react("🙅‍♂️");
        await reply("🙅‍♂️ Failed to read sticker EXIF.");
    }
});

cmd({
    pattern: "toimg",
    aliases: ["s2img"],
    category: "converter",
    react: "🔄️",
    description: "Convert Sticker to Image.",
}, async (from, sock, conText) => {
    const { mek, reply, sender, botName, react, quoted, botFooter, quotedMsg, newsletterJid } = conText;

    try {
        if (!quotedMsg) {
            
            return reply("Please reply to/quote a sticker");
        }
        
        const quotedSticker = quoted?.stickerMessage || quoted?.message?.stickerMessage;
        if (!quotedSticker) {
            await react("🙅‍♂️");
            return reply("That quoted message is not a sticker");
        }
        
        let tempFilePath;
        try {
            tempFilePath = await sock.downloadAndSaveMediaMessage(quotedSticker, 'temp_media');
            const stickerBuffer = await fs.readFile(tempFilePath);
            const imageBuffer = await stickerToImage(stickerBuffer);  
        await sock.sendMessage(
  from,
  {
    image: imageBuffer,
    caption: `*Here is your image*`,
  }
);


        } finally {
            if (tempFilePath) await fs.unlink(tempFilePath).catch(console.error);
        }
    } catch (e) {
        console.error("Error in toimg command:", e);
        await react("🙅‍♂️");
        await reply("Failed to convert sticker to image");
    }
});


cmd({
    pattern: "toaudio",
    aliases: ['tomp3'],
    category: "converter",
    react: "🔄️",
    description: "Convert video to audio"
  },
  async (from, sock, conText) => {
    const { mek, reply, react, botPic, quoted, quotedMsg, newsletterUrl } = conText;

    if (!quotedMsg) {
      
      return reply("Please reply to a video message");
    }

    const quotedVideo = quoted?.videoMessage || quoted?.message?.videoMessage || quoted?.pvtMessage || quoted?.message?.pvtMessage;
    
    if (!quotedVideo) {
      await react("🙅‍♂️");
      return reply("The quoted message doesn't contain any video");
    }

    let tempFilePath;
    try {
      tempFilePath = await sock.downloadAndSaveMediaMessage(quotedVideo, 'temp_media');
      const buffer = await fs.readFile(tempFilePath);
      const convertedBuffer = await toAudio(buffer);
      
      await sock.sendMessage(from, {
        audio: convertedBuffer,
        mimetype: "audio/mpeg",
        externalAdReply: {
          title: 'Converted Audio',
          body: 'Video to Audio',
          mediaType: 1,
          thumbnailUrl: botPic,
          sourceUrl: newsletterUrl,
          renderLargerThumbnail: false,
          showAdAttribution: true,
        }
      }, { quoted: mek });
      
      
    } catch (e) {
      console.error("Error in toaudio command:", e);
      await react("🙅‍♂️");
      const errMsg = e.message || String(e);
      if (errMsg.includes('no audio')) {
        await reply("This video has no audio track to extract.");
      } else {
        await reply("Failed to convert video to audio");
      }
    } finally {
      if (tempFilePath) await fs.unlink(tempFilePath).catch(console.error);
    }
  }
);


cmd({
    pattern: "toptt",
    aliases: ['tovoice', 'tovn', 'tovoicenote'],
    category: "converter",
    react: "🎙️",
    description: "Convert audio to WhatsApp voice note"
  },
  async (from, sock, conText) => {
    const { mek, reply, react, botPic, quoted, quotedMsg } = conText;

    if (!quotedMsg) {
      
      return reply("Please reply to an audio message");
    }

    const quotedAudio = quoted?.audioMessage || quoted?.message?.audioMessage;
    
    if (!quotedAudio) {
      await react("🙅‍♂️");
      return reply("The quoted message doesn't contain any audio");
    }

    let tempFilePath;
    try {
      tempFilePath = await sock.downloadAndSaveMediaMessage(quotedAudio, 'temp_media');
      const buffer = await fs.readFile(tempFilePath);
      const convertedBuffer = await toPtt(buffer);
      
      await sock.sendMessage(from, {
        audio: convertedBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
      }, { quoted: mek });
      
      
    } catch (e) {
      console.error("Error in toptt command:", e);
      await react("🙅‍♂️");
      await reply("Failed to convert to voice note");
    } finally {
      if (tempFilePath) await fs.unlink(tempFilePath).catch(console.error);
    }
  }
);


cmd({
    pattern: "tovideo",
    aliases: ['tovid', 'toblackscreen', 'blackscreen'],
    category: "converter",
    react: "🎥",
    description: "Convert audio to video with black screen"
  },
  async (from, sock, conText) => {
    const { mek, reply, react, botPic, quoted, quotedMsg } = conText;

    if (!quotedMsg) {
      
      return reply("Please reply to an audio message");
    }

    const quotedAudio = quoted?.audioMessage || quoted?.message?.audioMessage;
    
    if (!quotedAudio) {
      await react("🙅‍♂️");
      return reply("The quoted message doesn't contain any audio");
    }

    let tempFilePath;
    try {
      tempFilePath = await sock.downloadAndSaveMediaMessage(quotedAudio, 'temp_media');
      const buffer = await fs.readFile(tempFilePath);
      const convertedBuffer = await toVideo(buffer);
      
      await sock.sendMessage(from, {
        video: convertedBuffer,
        mimetype: "video/mp4",
        caption: 'Converted Video',
      }, { quoted: mek });
      
      
    } catch (e) {
      console.error("Error in tovideo command:", e);
      await react("🙅‍♂️");
      await reply("Failed to convert audio to video");
    } finally {
      if (tempFilePath) await fs.unlink(tempFilePath).catch(console.error);
    }
  }
);
