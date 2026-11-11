const { cmd } = require('../lib');
const { getSetting } = require('../lib/database/settings');
const {
    downloadMediaMessage,
    downloadContentFromMessage,
    generateWAMessageFromContent
} = require("@whiskeysockets/baileys");
const { getMediaKeys } = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const JSZip = require('jszip'); // ✅ NEW — replaces python3 zipfile usage

// ─────────────────────────────────────────────
//  BAILEYS CUSTOM MEDIA TYPES
// ─────────────────────────────────────────────
const defaults = require("@whiskeysockets/baileys");
if (defaults.MEDIA_PATH_MAP) {
    defaults.MEDIA_PATH_MAP['sticker-pack'] = '/mms/sticker-pack';
    defaults.MEDIA_HKDF_KEY_MAPPING['sticker-pack'] = 'Sticker Pack';
    defaults.MEDIA_PATH_MAP['thumbnail-sticker-pack'] = '/mms/document';
    defaults.MEDIA_HKDF_KEY_MAPPING['thumbnail-sticker-pack'] = 'Sticker Pack Thumbnail';
}

// ─────────────────────────────────────────────
//  HELPERS
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
    return { cipherKey, iv, macKey, encFile: finalEncFile, fileSha256, fileEncSha256 };
}

function getRealMsg(msg) {
    if (!msg) return null;
    if (msg.viewOnceMessageV2) return msg.viewOnceMessageV2.message;
    if (msg.viewOnceMessage) return msg.viewOnceMessage.message;
    if (msg.documentWithCaptionMessage) return msg.documentWithCaptionMessage.message;
    return msg;
}

function reconstructBuffers(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) return Buffer.from(obj.data);
    if (Array.isArray(obj)) return obj.map(reconstructBuffers);
    const res = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            res[key] = reconstructBuffers(obj[key]);
        }
    }
    return res;
}

const CACHE_FILE = path.join(__dirname, '../data/sticker_pack_cache.json');
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
            const data = JSON.parse(raw);
            global.lastStickerPacks = new Map(
                (data.lastStickerPacks || []).map(([k, v]) => [k, reconstructBuffers(v)])
            );
            global.stickerPacksByName = new Map(
                (data.stickerPacksByName || []).map(([k, v]) => [k, reconstructBuffers(v)])
            );
        } else {
            global.lastStickerPacks = new Map();
            global.stickerPacksByName = new Map();
        }
    } catch {
        global.lastStickerPacks = new Map();
        global.stickerPacksByName = new Map();
    }
}

function saveCache() {
    try {
        const dir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            lastStickerPacks: Array.from(global.lastStickerPacks.entries()),
            stickerPacksByName: Array.from(global.stickerPacksByName.entries())
        }, null, 2), 'utf-8');
    } catch (err) {
        console.error('[SPACK] saveCache error:', err.message);
    }
}

function cleanupDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    fs.readdirSync(dirPath).forEach(file => {
        const cur = path.join(dirPath, file);
        if (fs.lstatSync(cur).isDirectory()) cleanupDir(cur);
        else fs.unlinkSync(cur);
    });
    fs.rmdirSync(dirPath);
}

// ─────────────────────────────────────────────
//  NEW: PURE-JS ZIP HELPERS (replaces python3 zipfile calls)
// ─────────────────────────────────────────────

// Extracts a zip buffer to a directory (flat — matches the old python extractall behavior)
async function extractZipBuffer(zipBuffer, extractDir) {
    if (!zipBuffer || zipBuffer.length === 0) {
        throw new Error('Downloaded sticker pack is empty (0 bytes) — media may have expired or failed to download.');
    }
    let zip;
    try {
        zip = await JSZip.loadAsync(zipBuffer);
    } catch (e) {
        throw new Error(`Not a valid zip (${e.message})`);
    }
    if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });
    const entries = Object.keys(zip.files);
    if (entries.length === 0) {
        throw new Error('Zip has no entries — pack is corrupted or was never fully uploaded.');
    }
    for (const relPath of entries) {
        const entry = zip.files[relPath];
        if (entry.dir) continue;
        const content = await entry.async('nodebuffer');
        const outPath = path.join(extractDir, relPath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, content);
    }
    // Sanity check — the sticker pack format always needs contents.json at root
    if (!fs.existsSync(path.join(extractDir, 'contents.json'))) {
        throw new Error(`contents.json missing after extraction (zip had: ${entries.join(', ') || 'nothing'})`);
    }
}

// Zips every file in a directory (flat, basenames only) — matches old os.walk python script
async function createZipFromDir(dirPath, outZipPath) {
    const zip = new JSZip();
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        if (fs.lstatSync(filePath).isDirectory()) continue;
        zip.file(file, fs.readFileSync(filePath));
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    fs.writeFileSync(outZipPath, buffer);
}

// Zips a specific { entryNameInZip: filePathOnDisk } map — matches old create-new-pack python script
async function createZipFromFileMap(outZipPath, fileMap) {
    const zip = new JSZip();
    for (const [entryName, filePath] of Object.entries(fileMap)) {
        zip.file(entryName, fs.readFileSync(filePath));
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    fs.writeFileSync(outZipPath, buffer);
}

// ─────────────────────────────────────────────
//  NEW: ANTI-COLONG WEBP EXIF INJECTOR
//  (sanixel-style — is-ai-sticker / is-avatar-sticker waghera)
// ─────────────────────────────────────────────
function buildAcExif(metadata) {
    const json = Buffer.from(JSON.stringify(metadata), 'utf-8');
    const exif = Buffer.concat([
        Buffer.from([
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
            0x07, 0x00,
        ]),
        Buffer.alloc(4),
        Buffer.from([0x16, 0x00, 0x00, 0x00]),
        json,
    ]);
    exif.writeUInt32LE(json.length, 14);
    return exif;
}

function makeAcChunk(type, data) {
    const typeBuffer = Buffer.from(type);
    const sizeBuffer = Buffer.alloc(4);
    sizeBuffer.writeUInt32LE(data.length, 0);
    const padding = data.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
    return Buffer.concat([typeBuffer, sizeBuffer, data, padding]);
}

function setAcWebpExif(webpBuffer, metadata) {
    if (
        webpBuffer.slice(0, 4).toString() !== 'RIFF' ||
        webpBuffer.slice(8, 12).toString() !== 'WEBP'
    ) {
        throw new Error('Buffer valid WEBP nahi (anti-colong inject fail)');
    }

    const chunks = [];
    let offset = 12;

    while (offset + 8 <= webpBuffer.length) {
        const type = webpBuffer.slice(offset, offset + 4).toString();
        const size = webpBuffer.readUInt32LE(offset + 4);
        const chunkStart = offset;
        const chunkEnd = offset + 8 + size + (size % 2);

        if (chunkEnd > webpBuffer.length) break;
        if (type !== 'EXIF') chunks.push(webpBuffer.slice(chunkStart, chunkEnd));
        offset = chunkEnd;
    }

    const exifPayload = buildAcExif(metadata);
    const exifChunk = makeAcChunk('EXIF', exifPayload);
    const body = Buffer.concat([...chunks, exifChunk]);

    const header = Buffer.alloc(12);
    header.write('RIFF', 0);
    header.writeUInt32LE(body.length + 4, 4);
    header.write('WEBP', 8);

    return Buffer.concat([header, body]);
}

// packId/packName/publisher/emojis ke sath anti-colong flags inject karta hai.
// Fail ho to original webp bina protection ke return (sticker lost nahi hoga).
function applyAntiColong(webpBuffer, packId, packName, packPublisher, emojis, index) {
    try {
        const metadata = {
            'sticker-pack-id': packId,
            'sticker-pack-name': packName,
            'sticker-pack-publisher': packPublisher || '',
            'accessibility-text': packName,
            'android-app-store-link': 'https://whatsapp.com',
            'ios-app-store-link': 'https://whatsapp.com/ios',
            emojis: emojis && emojis.length ? emojis : [''],
            'is-from-sticker-maker': 0,
            'is-avatar-sticker': 1,
            'avatar-sticker-template-id': 'whatsapp',
            'is-ai-sticker': 1,
            'is-avatar-country-sticker': 1,
            'is-avatar-instant-sticker': 1,
            'sticker-maker-source-type': 4,
            'is-avatar-social-sticker': 1,
            'avatar-sticker-style': 'whatsapp',
            'avatar-sticker-revision-id': '2026',
            'is-from-user-created-pack': 1,
            'origin-pack-id': 'whatsapp',
            'is-text-sticker': 1,
        };
        const protectedBuf = setAcWebpExif(webpBuffer, metadata);
        console.log(`[SPACK-AC][DEBUG] sticker#${index} anti-colong EXIF injected`);
        return protectedBuf;
    } catch (e) {
        console.error(`[SPACK-AC][DEBUG] sticker#${index} anti-colong inject FAILED (${e.message}) → original bina protection`);
        return webpBuffer;
    }
}

// ─────────────────────────────────────────────
//  SPACK COMMAND
// ─────────────────────────────────────────────
cmd(
    {
        pattern: "spack",
        aliases: ["stkpack"],
        react: "📦",
        category: "converter",
        description: "Create/manage WhatsApp sticker packs",
    },    
    async (from, sock, conText) => {
    const { reply, react, mek, quotedMsg, args, botPrefix, pushName, isSuperUser } = conText;

    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

        loadCache();
        global.lastStickerPacks = global.lastStickerPacks || new Map();
        global.stickerPacksByName = global.stickerPacksByName || new Map();

        const rawArgs = args.join(' ').trim();
        const cmd = (args[0] || '').toLowerCase();

        // ── HELP ─────────────────────────────────────────
        if (cmd === 'help' || cmd === '-h') {
            return reply(
`📦 *STICKER PACK HELP*

*Create new pack:*
\`${botPrefix}spack [Name | Author]\`
Reply to image/sticker

*Add sticker to last pack:*
\`${botPrefix}spack add [Name | Author]\`

*Add to specific pack:*
Reply a sticker pack message + \`${botPrefix}spack [Name | Author]\`

*Anti-Colong (protect existing pack):*
Reply a sticker pack message (no image/sticker) + \`${botPrefix}spack\`
→ Resends the same sticker pack with Anti-Colong protection.

*Delete sticker from pack:*
\`${botPrefix}spack delete\`
Reply to sticker pack + reply sticker to remove

*Examples:*
\`${botPrefix}spack My Pack | Ali\`
\`${botPrefix}spack add\`
\`${botPrefix}spack delete 2\``
            );
        }

        const isAdd = cmd === 'add';
        const isDelete = ['delete', 'remove', 'del'].includes(cmd);

        // Parse name | author
        let argsText = isAdd || isDelete ? args.slice(1).join(' ').trim() : rawArgs;
        let customName = '', customPublisher = '';
        if (argsText) {
            if (argsText.includes('|')) {
                const parts = argsText.split('|').map(p => p.trim());
                customName = parts[0] || '';
                customPublisher = parts.slice(1).join(' ').trim() || '';
            } else {
                customName = argsText;
            }
        }

        // Unwrap quoted
        const realMsg = getRealMsg(mek.message);
        const quotedMsgRaw = realMsg?.extendedTextMessage?.contextInfo?.quotedMessage || quotedMsg;
        const realQuotedMsg = getRealMsg(quotedMsgRaw);

        const imageMessage = realMsg?.imageMessage || realQuotedMsg?.imageMessage;
        const stickerMessage = realMsg?.stickerMessage || realQuotedMsg?.stickerMessage;
        const quotedPack = realQuotedMsg?.stickerPackMessage;

        const tempBase = path.join(TEMP_DIR, `spack_${Date.now()}`);

        // ── NEW: ANTI-COLONG RESEND MODE ──────────────────
        // Sirf sticker-pack message reply kiya ho (koi image/sticker attach nahi)
        // aur delete bhi nahi mangi → us pack ko anti-colong protection ke sath
        // dobara build karke bhejo (naya packId, sab stickers protected).
        if (quotedPack && !imageMessage && !stickerMessage && !isDelete) {
            await react('🛡️');
            const acTempBase = `${tempBase}_ac`;
            try {
                const stream = await downloadContentFromMessage({
                    mediaKey: quotedPack.mediaKey,
                    directPath: quotedPack.directPath,
                    url: quotedPack.url
                }, 'sticker-pack');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const oldZipBuffer = Buffer.concat(chunks);

                const extractDir = `${acTempBase}_extracted`;

                try {
                    await extractZipBuffer(oldZipBuffer, extractDir);
                } catch {
                    await react('🙅‍♂️');
                    return reply('🙅‍♂️ Failed to extract sticker pack.');
                }

                const contentsPath = path.join(extractDir, 'contents.json');
                const contentsJson = JSON.parse(fs.readFileSync(contentsPath, 'utf-8'));

                const newPackId = crypto.randomUUID();
                const newPackName =
    customName ||
    (await getSetting("PACK_NAME")) ||
    quotedPack.name;

const newPackPublisher =
    customPublisher ||
    (await getSetting("PACK_AUTHOR")) ||
    quotedPack.publisher;

                // Har webp me anti-colong EXIF inject karo
                let protectedCount = 0;
                for (let i = 0; i < contentsJson.stickers.length; i++) {
                    const s = contentsJson.stickers[i];
                    const webpPath = path.join(extractDir, s.image_file);
                    if (!fs.existsSync(webpPath)) continue;
                    const rawWebp = fs.readFileSync(webpPath);
                    const protectedWebp = applyAntiColong(
                        rawWebp, newPackId, newPackName, newPackPublisher, s.emojis, i
                    );
                    fs.writeFileSync(webpPath, protectedWebp);
                    protectedCount++;
                }

                contentsJson.identifier = newPackId;
                contentsJson.name = newPackName;
                contentsJson.publisher = newPackPublisher;
                fs.writeFileSync(contentsPath, JSON.stringify(contentsJson));

                const trayPngBuffer = fs.readFileSync(path.join(extractDir, quotedPack.trayIconFileName));

                const tempZipPath = `${acTempBase}.wastickers`;
                try {
                    await createZipFromDir(extractDir, tempZipPath);
                } catch {
                    await react('🙅‍♂️');
                    return reply('🙅‍♂️ Failed to repack sticker pack.');
                }

                cleanupDir(extractDir);

                const zipBuffer = fs.readFileSync(tempZipPath);
                if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

                const zipMediaKey = crypto.randomBytes(32);
                const zipEnc = await encryptMedia(zipBuffer, zipMediaKey, 'sticker-pack');
                const tempEncZip = `${acTempBase}_zip_enc.tmp`;
                fs.writeFileSync(tempEncZip, zipEnc.encFile);
                let zipUpload;
                try {
                    zipUpload = await sock.waUploadToServer(tempEncZip, {
                        mediaType: 'sticker-pack',
                        fileEncSha256B64: zipEnc.fileEncSha256.toString('base64')
                    });
                } finally { if (fs.existsSync(tempEncZip)) fs.unlinkSync(tempEncZip); }

                const thumbEnc = await encryptMedia(trayPngBuffer, zipMediaKey, 'thumbnail-sticker-pack');
                const tempEncThumb = `${acTempBase}_thumb_enc.tmp`;
                fs.writeFileSync(tempEncThumb, thumbEnc.encFile);
                let thumbUpload;
                try {
                    thumbUpload = await sock.waUploadToServer(tempEncThumb, {
                        mediaType: 'document',
                        fileEncSha256B64: thumbEnc.fileEncSha256.toString('base64')
                    });
                } finally { if (fs.existsSync(tempEncThumb)) fs.unlinkSync(tempEncThumb); }

                // Original per-sticker metadata reuse karo, sirf fileName same rehta hai
                const finalStickersMetadata = quotedPack.stickers.map(s => ({ ...s }));

                const msgContent = {
                    messageContextInfo: {
                        // Anti-Colong core — forward/save/re-share restrict karta hai
                        limitSharingV2: {
                            sharingLimited: true,
                            trigger: "CHAT_SETTING",
                            limitSharingSettingTimestamp: Date.now().toString(),
                            initiatedByMe: true,
                        },
                    },
                    stickerPackMessage: {
                        stickerPackId: newPackId,
                        name: newPackName,
                        publisher: newPackPublisher,
                        stickers: finalStickersMetadata,
                        trayIconFileName: quotedPack.trayIconFileName,
                        fileSha256: zipEnc.fileSha256,
                        fileEncSha256: zipEnc.fileEncSha256,
                        mediaKey: zipMediaKey,
                        fileLength: zipEnc.encFile.length,
                        directPath: zipUpload.directPath,
                        stickerPackSize: zipBuffer.length,
                        stickerPackOrigin: 2,
                        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
                        imageDataHash: quotedPack.imageDataHash,
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

                global.lastStickerPacks.set(from, msgContent.stickerPackMessage);
                global.stickerPacksByName.set(`${from}_${newPackName.toLowerCase()}`, msgContent.stickerPackMessage);
                saveCache();

                await react('✅');

return sock.sendMessage(from, {
    text: "🛡️ *Anti-Colong pack sent!*"
});
            } catch (err) {
                console.error('[SPACK-AC] Error:', err.message);
                await react('🙅‍♂️');
                return reply(`🙅‍♂️ Anti-colong error: ${err.message}`);
            }
        }

        // ── CREATE / ADD MODE ──────────────────────────────
        if (!imageMessage && !stickerMessage) {
            return reply(
`📦 *STICKER PACK*

Reply an image or sticker with:
\`${botPrefix}spack [Name | Author]\`

Add to last pack:
\`${botPrefix}spack add\`

Help: \`${botPrefix}spack help\``
            );
        }

        // Find existing pack to append to
        let targetPack = quotedPack;
        let shouldAppend = !!quotedPack;

        if (!shouldAppend && customName) {
            const existing = global.stickerPacksByName.get(`${from}_${customName.toLowerCase()}`);
            if (existing) { targetPack = existing; shouldAppend = true; }
        }
        if (!shouldAppend && isAdd) {
            const last = global.lastStickerPacks.get(from);
            if (last) { targetPack = last; shouldAppend = true; }
            else await reply('⚠️ No last pack found — creating new pack.');
        }

        await react('⏳');

        // Download media
        let buffer;
        if (imageMessage) {
            const mediaMsg = imageMessage === realMsg?.imageMessage
                ? { ...mek, message: { imageMessage: realMsg.imageMessage } }
                : { ...mek, message: { imageMessage: realQuotedMsg?.imageMessage } };
            buffer = await downloadMediaMessage(mediaMsg, 'buffer', {});
        } else if (stickerMessage) {
            const mediaMsg = stickerMessage === realMsg?.stickerMessage
                ? { ...mek, message: { stickerMessage: realMsg.stickerMessage } }
                : { ...mek, message: { stickerMessage: realQuotedMsg?.stickerMessage } };
            try {
                const stream = await downloadContentFromMessage(mediaMsg.message.stickerMessage, 'sticker');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                buffer = Buffer.concat(chunks);
            } catch {
                buffer = await downloadMediaMessage(mediaMsg, 'buffer', {});
            }
        }

        // Convert to WebP
        let webpBuffer = buffer;
        if (imageMessage) {
            webpBuffer = await sharp(buffer)
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 50 })
                .toBuffer();
        } else if (stickerMessage && buffer.length > 400000 && !stickerMessage.isAnimated) {
            try {
                webpBuffer = await sharp(buffer)
                    .resize(512, 512, { fit: 'inside' })
                    .webp({ quality: 60 })
                    .toBuffer();
            } catch {}
        }

        let packId, packName, packPublisher, trayName, trayPngBuffer;
        let finalStickersMetadata = [];
        const tempZipPath = `${tempBase}.wastickers`;

        if (shouldAppend) {
            packId = targetPack.stickerPackId;
            packName = customName || targetPack.name;
            packPublisher = customPublisher || targetPack.publisher;
            trayName = targetPack.trayIconFileName;

            // ✅ NEW — is naye sticker ko bhi AI badge + anti-theft protection do
            webpBuffer = applyAntiColong(webpBuffer, packId, packName, packPublisher, [''], 0);

            const webpHashBase64 = crypto.createHash('sha256').update(webpBuffer).digest('base64')
                .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
            const webpName = `${webpHashBase64}.webp`;

            let oldZipBuffer;
            try {
                const stream = await downloadContentFromMessage({
                    mediaKey: targetPack.mediaKey,
                    directPath: targetPack.directPath,
                    url: targetPack.url
                }, 'sticker-pack');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                oldZipBuffer = Buffer.concat(chunks);
            } catch { return reply('🙅‍♂️ Failed to download existing pack.'); }

            const extractDir = `${tempBase}_extracted`;

            try {
                await extractZipBuffer(oldZipBuffer, extractDir);
            } catch {
                return reply('🙅‍♂️ Failed to extract pack.');
            }

            const contentsPath = path.join(extractDir, 'contents.json');
            const contentsJson = JSON.parse(fs.readFileSync(contentsPath, 'utf-8'));

            fs.writeFileSync(path.join(extractDir, webpName), webpBuffer);
            if (!contentsJson.stickers.some(s => s.image_file === webpName)) {
                contentsJson.stickers.push({ image_file: webpName, emojis: [''] });
            }

            trayPngBuffer = fs.readFileSync(path.join(extractDir, trayName));
            contentsJson.name = packName;
            contentsJson.publisher = packPublisher;
            fs.writeFileSync(contentsPath, JSON.stringify(contentsJson));

            try {
                await createZipFromDir(extractDir, tempZipPath);
            } catch {
                return reply('🙅‍♂️ Failed to repack.');
            }

            cleanupDir(extractDir);

            const isLottie = stickerMessage?.mimetype === 'application/was';
            const stickersMap = new Map(targetPack.stickers.map(s => [s.fileName, s]));
            for (const item of contentsJson.stickers) {
                finalStickersMetadata.push(stickersMap.get(item.image_file) || {
                    fileName: item.image_file,
                    mimetype: isLottie ? 'application/was' : 'image/webp',
                    isAnimated: stickerMessage?.isAnimated || false,
                    accessibilityLabel: '',
                    isLottie,
                    emojis: ['']
                });
            }

        } else {
            packId = crypto.randomUUID();
            // ✅ NEW — /setpackname se set kiya hua naam/author default use hoga
            packName = customName || (await getSetting('PACK_NAME')) || 'PRIME-MD';
            packPublisher = customPublisher || (await getSetting('PACK_AUTHOR')) || '';
            trayName = `${packId}.png`;

            // ✅ NEW — AI badge + anti-theft (anti-colong) sticker me hi bake ho jaye
            webpBuffer = applyAntiColong(webpBuffer, packId, packName, packPublisher, [''], 0);

            const webpHashBase64 = crypto.createHash('sha256').update(webpBuffer).digest('base64')
                .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
            const webpName = `${webpHashBase64}.webp`;

            trayPngBuffer = await sharp(buffer)
                .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            const contentsJson = {
                android_play_store_link: '', ios_app_store_link: '',
                publisher_email: '', publisher_website: '',
                privacy_policy_website: '', license_agreement_website: '',
                image_data_version: '1', avoid_cache: false,
                animated_sticker_pack: stickerMessage?.isAnimated || false,
                identifier: packId, name: packName, publisher: packPublisher,
                tray_image_file: trayName,
                stickers: [{ image_file: webpName, emojis: [''] }]
            };

            const tempContents = `${tempBase}_contents.json`;
            const tempTray = `${tempBase}_tray.png`;
            const tempWebp = `${tempBase}_1.webp`;

            fs.writeFileSync(tempContents, JSON.stringify(contentsJson));
            fs.writeFileSync(tempTray, trayPngBuffer);
            fs.writeFileSync(tempWebp, webpBuffer);

            try {
                await createZipFromFileMap(tempZipPath, {
                    'contents.json': tempContents,
                    [trayName]: tempTray,
                    [webpName]: tempWebp
                });
            } catch {
                return reply('🙅‍♂️ Failed to create sticker pack zip.');
            } finally {
                [tempContents, tempTray, tempWebp].forEach(f => {
                    if (fs.existsSync(f)) fs.unlinkSync(f);
                });
            }

            const isLottie = stickerMessage?.mimetype === 'application/was';
            finalStickersMetadata.push({
                fileName: webpName,
                mimetype: isLottie ? 'application/was' : 'image/webp',
                isAnimated: stickerMessage?.isAnimated || false,
                accessibilityLabel: '',
                isLottie,
                emojis: ['']
            });
        }

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

        const imageDataHash = crypto.createHash('sha256').update(webpBuffer).digest('base64');

        const msgContent = {
            // ✅ NEW — anti-colong core, forward/save restrict karta hai
            messageContextInfo: {
                limitSharingV2: {
                    sharingLimited: true,
                    trigger: "CHAT_SETTING",
                    limitSharingSettingTimestamp: Date.now().toString(),
                    initiatedByMe: true,
                },
            },
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
                imageDataHash,
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

        global.lastStickerPacks.set(from, msgContent.stickerPackMessage);
        global.stickerPacksByName.set(`${from}_${packName.toLowerCase()}`, msgContent.stickerPackMessage);
        saveCache();

        await react('✅');
    }
);
