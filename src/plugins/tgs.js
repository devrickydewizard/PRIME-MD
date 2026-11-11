const { cmd } = require('../lib');
const { getSetting } = require('../lib/database/settings');
const {
    downloadMediaMessage,
    downloadContentFromMessage,
    generateWAMessageFromContent
} = require("@whiskeysockets/baileys");
const { getMediaKeys } = require("@whiskeysockets/baileys");
const axios = require('axios');
const config = require('../config');
const stickerLib = require('../lib/sticker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const AdmZip = require("adm-zip");

const sleep = ms => new Promise(r => setTimeout(r, ms));

const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─────────────────────────────────────────────
//  ENCRYPT HELPER (from spack)
// ─────────────────────────────────────────────
async function encryptMedia(buffer, mediaKey, mediaType) {
    const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, mediaType);
    const aes = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
    const hmac = crypto.createHmac('sha256', macKey).update(iv);
    const enc1 = aes.update(buffer);
    const enc2 = aes.final();
    const encFile = Buffer.concat([enc1, enc2]);
    hmac.update(encFile);
    const mac = hmac.digest().slice(0, 10);
    const finalEncFile = Buffer.concat([encFile, mac]);
    const fileSha256 = crypto.createHash('sha256').update(buffer).digest();
    const fileEncSha256 = crypto.createHash('sha256').update(finalEncFile).digest();
    return { encFile: finalEncFile, fileSha256, fileEncSha256 };
}

function pyExec(cmd) {
    const { execSync } = require('child_process');
    execSync(cmd);
}

// ─────────────────────────────────────────────
//  NEW: robust static-image → webp normalizer
//  sharp fail hone par stickerLib fallback, phir bhi
//  fail ho to null return (us sticker ko skip karo)
// ─────────────────────────────────────────────
async function normalizeToWebp(mediaBuffer, index, exifData) {
    // ✅ FIXED — pehle hamesha stickerLib se banao (isi se EXIF/packname/author embed hota hai,
    // jaisa 1-by-1 mode me hota hai). Sharp sirf tab use hoga jab stickerLib fail ho (no EXIF fallback).
    try {
        const buf = await stickerLib.toSticker('image', mediaBuffer, exifData);
        console.log(`[TGS-PACK][DEBUG] sticker#${index} stickerLib+EXIF OK (pack="${exifData?.packname}" author="${exifData?.author}")`);
        return buf;
    } catch (libErr) {
        console.error(`[TGS-PACK][DEBUG] sticker#${index} stickerLib failed (${libErr.message}) → trying sharp fallback (NO EXIF)`);
        try {
            const meta = await sharp(mediaBuffer).metadata();
            console.log(`[TGS-PACK][DEBUG] sticker#${index} sharp fallback format=${meta.format} size=${meta.width}x${meta.height}`);
            return await sharp(mediaBuffer)
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 80 })
                .toBuffer();
        } catch (sharpErr) {
            console.error(`[TGS-PACK][DEBUG] sticker#${index} sharp fallback also FAILED (${sharpErr.message}) → skipping this sticker`);
            return null;
        }
    }
}

// ─────────────────────────────────────────────
//  NEW: safe tray icon generator with fallback
//  webpBuffers[0] corrupt ho sakta hai isliye
//  har buffer try karo, sab fail ho to blank tray
// ─────────────────────────────────────────────
async function generateTrayIcon(webpBuffers) {
    for (let i = 0; i < webpBuffers.length; i++) {
        try {
            const tray = await sharp(webpBuffers[i])
                .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();
            console.log(`[TGS-PACK][DEBUG] tray icon generated from sticker#${i}`);
            return tray;
        } catch (e) {
            console.error(`[TGS-PACK][DEBUG] tray gen failed on sticker#${i}: ${e.message}`);
        }
    }
    console.error('[TGS-PACK][DEBUG] ALL stickers failed tray gen → using blank fallback tray');
    return await sharp({
        create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).png().toBuffer();
}

// ─────────────────────────────────────────────
//  BUILD WHATSAPP STICKER PACK
// ─────────────────────────────────────────────
async function buildAndSendStickerPack(sock, from, mek, webpBuffers, packName, packPublisher, packId) {
    console.log(`[TGS-PACK][DEBUG] Building pack "${packName}" by "${packPublisher}" id=${packId} stickers=${webpBuffers.length}`);

    const tempBase = path.join(TEMP_DIR, `tgspack_${Date.now()}_${packId}`);
    const trayName = `${packId}.png`;
    const tempZipPath = `${tempBase}.wastickers`;

    // Generate tray icon (now safe/fallback-proof)
    const trayPngBuffer = await generateTrayIcon(webpBuffers);

    const stickersForJson = [];
    const finalStickersMetadata = [];

    // Write all webp files
    const webpPaths = [];
    for (let i = 0; i < webpBuffers.length; i++) {
        const hash = crypto.createHash('sha256').update(webpBuffers[i]).digest('base64')
            .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
        const webpName = `${hash}.webp`;
        const webpPath = `${tempBase}_${i}.webp`;
        fs.writeFileSync(webpPath, webpBuffers[i]);
        webpPaths.push({ webpPath, webpName });
        console.log(`[TGS-PACK][DEBUG] sticker#${i} → ${webpName}`);
        stickersForJson.push({ image_file: webpName, emojis: [''] });
        finalStickersMetadata.push({
            fileName: webpName,
            mimetype: 'image/webp',
            isAnimated: false,
            accessibilityLabel: '',
            isLottie: false,
            emojis: ['']
        });
    }

    const contentsJson = {
        android_play_store_link: '', ios_app_store_link: '',
        publisher_email: '', publisher_website: '',
        privacy_policy_website: '', license_agreement_website: '',
        image_data_version: '1', avoid_cache: false,
        animated_sticker_pack: false,
        identifier: packId,
        name: packName,
        publisher: packPublisher,
        tray_image_file: trayName,
        stickers: stickersForJson
    };

    const tempContents = `${tempBase}_contents.json`;
    const tempTray = `${tempBase}_tray.png`;
    fs.writeFileSync(tempContents, JSON.stringify(contentsJson));
    fs.writeFileSync(tempTray, trayPngBuffer);

   const zip = new AdmZip();

zip.addFile("contents.json", fs.readFileSync(tempContents));
zip.addFile(trayName, fs.readFileSync(tempTray));

for (const { webpPath, webpName } of webpPaths) {
    zip.addFile(webpName, fs.readFileSync(webpPath));
}

zip.writeZip(tempZipPath);

// Cleanup
if (fs.existsSync(tempContents)) fs.unlinkSync(tempContents);
if (fs.existsSync(tempTray)) fs.unlinkSync(tempTray);

webpPaths.forEach(({ webpPath }) => {
    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
});

    const zipBuffer = fs.readFileSync(tempZipPath);
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

    const zipMediaKey = crypto.randomBytes(32);
    const zipEnc = await encryptMedia(zipBuffer, zipMediaKey, 'sticker-pack');

    const tempEncZip = `${tempBase}_zip_enc.tmp`;
    fs.writeFileSync(tempEncZip, zipEnc.encFile);
    let zipUpload;
    try {
        zipUpload = await sock.waUploadToServer(tempEncZip, {
            mediaType: 'sticker-pack',
            fileEncSha256B64: zipEnc.fileEncSha256.toString('base64')
        });
    } finally { if (fs.existsSync(tempEncZip)) fs.unlinkSync(tempEncZip); }

    const thumbEnc = await encryptMedia(trayPngBuffer, zipMediaKey, 'thumbnail-sticker-pack');
    const tempEncThumb = `${tempBase}_thumb_enc.tmp`;
    fs.writeFileSync(tempEncThumb, thumbEnc.encFile);
    let thumbUpload;
    try {
        thumbUpload = await sock.waUploadToServer(tempEncThumb, {
            mediaType: 'document',
            fileEncSha256B64: thumbEnc.fileEncSha256.toString('base64')
        });
    } finally { if (fs.existsSync(tempEncThumb)) fs.unlinkSync(tempEncThumb); }

    const msgContent = {
        stickerPackMessage: {
            stickerPackId: packId,
            name: packName,
            publisher: packPublisher,
            stickers: finalStickersMetadata,
            trayIconFileName: trayName,
            fileSha256: zipEnc.fileSha256,
            fileEncSha256: zipEnc.fileEncSha256,
            mediaKey: zipMediaKey,
            fileLength: zipEnc.encFile.length,
            directPath: zipUpload.directPath,
            stickerPackSize: zipBuffer.length,
            stickerPackOrigin: 2,
            mediaKeyTimestamp: Math.floor(Date.now() / 1000),
            imageDataHash: crypto.createHash('sha256').update(webpBuffers[0]).digest('base64'),
            thumbnailDirectPath: thumbUpload.directPath,
            thumbnailSha256: thumbEnc.fileSha256,
            thumbnailEncSha256: thumbEnc.fileEncSha256,
            thumbnailHeight: 96,
            thumbnailWidth: 96
        }
    };

    const waMsg = await generateWAMessageFromContent(from, msgContent, {
        userJid: sock.user.id
    });
    await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
}

// ─────────────────────────────────────────────
//  COMMAND
// ─────────────────────────────────────────────
cmd(
    {
        pattern: "tgsticker",
        aliases: ["tgs", "tg"],
        react: "🎴",
        category: "downloader",
        description: "Download Telegram sticker pack",
    },
    async (from, sock, conText) => {
        const { reply, react, isSuperUser, args, mek, botPrefix } = conText;

        if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

        // Detect -pack flag
        const isPackMode = args.includes('-pack');
        const cleanArgs = args.filter(a => a !== '-pack');
        const link = cleanArgs.join(' ').trim();

        if (!link) {
            return reply(
`🎴 *Telegram Sticker Downloader*

*Mode 1 — Send 1 by 1:*
\`${botPrefix}tgs https://t.me/addstickers/PackName\`

*Mode 2 — WhatsApp Sticker Pack:*
\`${botPrefix}tgs -pack https://t.me/addstickers/PackName\`

• Max 120 stickers (1 by 1 mode)
• WhatsApp allows 60 per pack — auto splits into multiple packs
• Supports static + animated (.webm)`
            );
        }

        const packId = link.split('/addstickers/')[1]?.split('/')[0]?.trim();
        if (!packId) {
            await react('🙅‍♂️');
            return reply('🙅‍♂️ Invalid Telegram link!\nExample: https://t.me/addstickers/PackName');
        }

        try {
            await react('⏳');

            const packRes = await axios.get(
                `https://api.telegram.org/bot${config.TGTOKEN}/getStickerSet`,
                { params: { name: packId } }
            );

            if (!packRes.data.ok) {
                await react('🙅‍♂️');
                return reply('🙅‍♂️ Pack not found. Check the link.');
            }

            const pack = packRes.data.result;
            console.log(`[TGS][DEBUG] pack.title="${pack.title}" packId="${packId}" total=${pack.stickers.length} is_video=${pack.is_video} is_animated=${pack.is_animated}`);

            if (pack.is_animated) {
                await react('🙅‍♂️');
                return reply('⚠️ Lottie (.tgs) animated stickers not supported.\nStatic and .webm video stickers work.');
            }

            const isVideo = pack.is_video;
            const MAX = isPackMode ? pack.stickers.length : 120;
            const stickers = pack.stickers.slice(0, MAX);

            await sock.sendMessage(from, {
    text: `*– ( STICKERS FOUND )*
──────────────𔓕
📌 *Name:* ${pack.title}
🎴 *Type:* ${isVideo ? 'Animated (.webm)' : 'Static (.webp)'}
📊 *Total:* ${stickers.length} stickers
📦 *Mode:* ${isPackMode ? 'WhatsApp Pack' : 'Sending 1 by 1'}
${isPackMode && stickers.length > 60 ? `📂 *Packs:* ${Math.ceil(stickers.length / 60)} (60 per pack)` : ''}

> _Downloading Stickers..._`
});
            
            const packname =
    (await getSetting("PACK_NAME")) ||
    config.PACK_NAME ||
    "PRIME-MD";

const packauthor =
    (await getSetting("PACK_AUTHOR")) ||
    config.PACK_AUTHOR ||
    "";

const exifData = {
    packname,
    author: packauthor,
    categories: ["💖"]
};

            // ── MODE 1: 1 by 1 ──────────────────────────────
            if (!isPackMode) {
                let sent = 0, failed = 0;

                for (const s of stickers) {
                    try {
                        const fileRes = await axios.get(
                            `https://api.telegram.org/bot${config.TGTOKEN}/getFile`,
                            { params: { file_id: s.file_id } }
                        );
                        if (!fileRes.data?.result?.file_path) { failed++; continue; }

                        const { data } = await axios({
                            url: `https://api.telegram.org/file/bot${config.TGTOKEN}/${fileRes.data.result.file_path}`,
                            method: 'GET', responseType: 'arraybuffer',
                        });

                        const mediaBuffer = Buffer.from(data);
                        const stickerBuffer = await stickerLib.toSticker(
                            isVideo ? 'video' : 'image', mediaBuffer, exifData
                        );

                        await sock.sendMessage(from, { sticker: stickerBuffer });
                        sent++;
                    } catch (err) {
                        failed++;
                        console.error(`[TGS] #${sent + failed} failed:`, err.message);
                    }
                    await sleep(3500);
                }

                await react('✅');
                
                return sock.sendMessage(from, {
    text: `✅ *Successfully Done!*
✔️ Stickers: *${sent}* | 🙅‍♂️ Failed: *${failed}*`
});
            }

            // ── MODE 2: WhatsApp Pack ────────────────────────
            const WA_MAX = 60;
            const totalPacks = Math.ceil(stickers.length / WA_MAX);

            let totalSent = 0, totalFailed = 0;

            for (let packNum = 0; packNum < totalPacks; packNum++) {
                const chunk = stickers.slice(packNum * WA_MAX, (packNum + 1) * WA_MAX);
                const chunkPackId = crypto.randomUUID();
                const chunkPackName = totalPacks > 1
                    ? `${pack.title} (${packNum + 1}/${totalPacks})`
                    : pack.title;
                               
                const webpBuffers = [];

                for (let i = 0; i < chunk.length; i++) {
                    const s = chunk[i];
                    try {
                        console.log(`[TGS-PACK][DEBUG] sticker#${i} file_id=${s.file_id} emoji=${s.emoji || ''}`);

                        const fileRes = await axios.get(
                            `https://api.telegram.org/bot${config.TGTOKEN}/getFile`,
                            { params: { file_id: s.file_id } }
                        );
                        if (!fileRes.data?.result?.file_path) {
                            console.error(`[TGS-PACK][DEBUG] sticker#${i} no file_path from telegram → skipping`);
                            totalFailed++; continue;
                        }

                        const { data } = await axios({
                            url: `https://api.telegram.org/file/bot${config.TGTOKEN}/${fileRes.data.result.file_path}`,
                            method: 'GET', responseType: 'arraybuffer',
                        });

                        const mediaBuffer = Buffer.from(data);

                        // ✅ FIXED — exifData pass karo taake pack ke stickers me bhi
                        // packname/author metadata embed ho (1-by-1 mode jaisa)
                        let webpBuf;
                        if (isVideo) {
                            webpBuf = await stickerLib.toSticker('video', mediaBuffer, exifData);
                        } else {
                            webpBuf = await normalizeToWebp(mediaBuffer, i, exifData);
                        }

                        if (!webpBuf) {
                            console.error(`[TGS-PACK][DEBUG] sticker#${i} could not be converted → skipping (not counted as pack corruption)`);
                            totalFailed++;
                            continue;
                        }

                        webpBuffers.push(webpBuf);
                        totalSent++;
                    } catch (err) {
                        totalFailed++;
                        console.error(`[TGS-PACK] Pack ${packNum + 1} sticker ${i + 1} failed:`, err.message);
                    }

                    // Small delay between downloads
                    if (i < chunk.length - 1) await sleep(800);
                }

                if (!webpBuffers.length) {
                    await reply(`⚠️ Pack ${packNum + 1} — all stickers failed, skipping.`);
                    continue;
                }

                try {
    await buildAndSendStickerPack(
    sock,
    from,
    mek,
    webpBuffers,
    packname,      // ← DB Pack Name
    packauthor,    // ← DB Author
    chunkPackId
);
                    
                } catch (err) {
                    console.error(`[TGS-PACK] buildAndSend failed:`, err.message);
                    await reply(`🙅‍♂️ Pack ${packNum + 1} failed: ${err.message}`);
                }

                // Delay between packs
                if (packNum < totalPacks - 1) await sleep(3000);
            }

            await react('✅');
            return sock.sendMessage(from, {
    text: `✅ *Successfully Done!*
✔️ Stickers: *${totalSent}* | 🙅‍♂️ Failed: *${totalFailed}*`
});

        } catch (err) {
            console.error('[TGS] ERROR:', err.message);
            await react('🙅‍♂️');
            return reply(`🙅‍♂️ Error: ${err.message}`);
        }
    }
);
