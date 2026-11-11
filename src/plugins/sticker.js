const { cmd } = require("../lib");
const { getSetting } = require("../lib/database/settings");
const config = require("../config");
const stickerLib = require("../lib/sticker");
const path = require("path");
const fs = require("fs");
const {
    downloadContentFromMessage,
    prepareWAMessageMedia,
    generateWAMessageFromContent
} = require("@whiskeysockets/baileys");

cmd({
    pattern: "aisticker",
    aliases: ["ais", "aipremium"],
    category: "sticker",
    react: "🤖",
    description: "Convert sticker to AI Sticker"
}, async (from, sock, conText) => {

    const { quoted, quotedMsg, reply } = conText;

    try {

        if (!quotedMsg) {
            return reply("🤖 Please reply to a sticker.");
        }

        const stickerMsg =
            quoted?.stickerMessage ||
            quoted?.message?.stickerMessage;

        if (!stickerMsg) {
            return reply("🙅‍♂️ The quoted message is not a sticker.");
        }

        let stream = await downloadContentFromMessage(
            stickerMsg,
            "sticker"
        );

        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        function buildExif(metadata) {
            const json = Buffer.from(
                JSON.stringify(metadata),
                "utf8"
            );

            const exif = Buffer.concat([
                Buffer.from([
                    0x49,0x49,0x2A,0x00,
                    0x08,0x00,0x00,0x00,
                    0x01,0x00,
                    0x41,0x57,0x07,0x00
                ]),
                Buffer.alloc(4),
                Buffer.from([0x16,0x00,0x00,0x00]),
                json
            ]);

            exif.writeUInt32LE(json.length, 14);

            return exif;
        }

        function makeChunk(type, data) {
            const typeBuffer = Buffer.from(type);

            const sizeBuffer = Buffer.alloc(4);
            sizeBuffer.writeUInt32LE(data.length, 0);

            const padding =
                data.length % 2
                   ? Buffer.from([0])
                    : Buffer.alloc(0);

            return Buffer.concat([
                typeBuffer,
                sizeBuffer,
                data,
                padding
            ]);
        }

        function addExif(webpBuffer, metadata) {
            const chunks = [];
            let offset = 12;

            while (offset + 8 <= webpBuffer.length) {

                const type = webpBuffer
                   .slice(offset, offset + 4)
                   .toString();

                const size =
                    webpBuffer.readUInt32LE(offset + 4);

                const start = offset;

                const end =
                    offset +
                    8 +
                    size +
                    (size % 2);

                if (end > webpBuffer.length) break;

                if (type!== "EXIF") {
                    chunks.push(
                        webpBuffer.slice(start, end)
                    );
                }

                offset = end;
            }

            const exifChunk = makeChunk(
                "EXIF",
                buildExif(metadata)
            );

            const body = Buffer.concat([
               ...chunks,
                exifChunk
            ]);

            const header = Buffer.alloc(12);

            header.write("RIFF", 0);
            header.writeUInt32LE(body.length + 4, 4);
            header.write("WEBP", 8);

            return Buffer.concat([
                header,
                body
            ]);
        }

        const rawPack =
            (await getSetting("PACK_NAME")) ||
            config.PACK_NAME ||
            "PRIME-MD,AI-STICKER";

        let packname = rawPack;
        let packauthor = "";

        if (rawPack.includes(",")) {
            [packname, packauthor] = rawPack.split(",");
        } else if (rawPack.includes("|")) {
            [packname, packauthor] = rawPack.split("|");
        } else if (rawPack.includes("#")) {
            [packname, packauthor] = rawPack.split("#");
        }

        packname = packname?.trim();
        packauthor = packauthor?.trim();

        const metadata = {
            "sticker-pack-id":
                "2be7e369-b5ce-4706-a3d4-f78805a20328",

            "sticker-pack-name": packname,
            "sticker-pack-publisher": packauthor,

            emojis: ["🤖"],

            premium: 1,

            "is-ai-sticker": 1,
            "is-avatar-sticker": 1,
            "avatar-sticker-template-id": "whatsapp",
            "avatar-sticker-style": "whatsapp",
            "avatar-sticker-revision-id": "2026",
            "origin-pack-id": "whatsapp",
            "sticker-maker-source-type": 4,
            "is-from-sticker-maker": 1,
            "is-from-user-created-pack": 1
        };

        const finalSticker = addExif(
            buffer,
            metadata
        );

        const media = await prepareWAMessageMedia(
            { sticker: finalSticker },
            { upload: sock.waUploadToServer }
        );

        const msg = generateWAMessageFromContent(
            from,
            {
                stickerMessage: {
                   ...media.stickerMessage,

                    isAnimated:
                        stickerMsg.isAnimated || false,

                    isAvatar: true,
                    isAiSticker: true,
                    isLottie: false,
                    premium: 1
                }
            },
            {
                userJid:
                    sock.user?.id ||
                    sock.user?.jid
            }
        );

        await sock.relayMessage(
            from,
            msg.message,
            {
                messageId: msg.key.id
            }
        );

    } catch (e) {
        console.error("AI Sticker Error:", e);
        reply("🙅‍♂️ " + e.message);
    }
});

cmd({
    pattern: "premium",
    category: "sticker",
    react: "✨",
    description: "Add premium exif to sticker"
}, async (from, sock, conText) => {

    const { quoted, quotedMsg, mek, reply } = conText;

    try {

        if (!quotedMsg) {
            return reply("🪄 Please reply to a sticker to make it premium.");
        }

        const stickerMsg =
            quoted?.stickerMessage ||
            quoted?.message?.stickerMessage;

        if (!stickerMsg) {
            return reply("🙅‍♂️ The quoted message is not a sticker.");
        }

        let stream = await downloadContentFromMessage(
            stickerMsg,
            "sticker"
        );

        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        function buildExif(metadata) {
            const json = Buffer.from(
                JSON.stringify(metadata),
                "utf8"
            );

            const exif = Buffer.concat([
                Buffer.from([
                    0x49,0x49,0x2A,0x00,
                    0x08,0x00,0x00,0x00,
                    0x01,0x00,
                    0x41,0x57,0x07,0x00
                ]),
                Buffer.alloc(4),
                Buffer.from([0x16,0x00,0x00,0x00]),
                json
            ]);

            exif.writeUInt32LE(json.length, 14);

            return exif;
        }

        function makeChunk(type, data) {
            const typeBuffer = Buffer.from(type);

            const sizeBuffer = Buffer.alloc(4);
            sizeBuffer.writeUInt32LE(data.length, 0);

            const padding =
                data.length % 2
                   ? Buffer.from([0])
                    : Buffer.alloc(0);

            return Buffer.concat([
                typeBuffer,
                sizeBuffer,
                data,
                padding
            ]);
        }

        function addExif(webpBuffer, metadata) {
            const chunks = [];

            let offset = 12;

            while (offset + 8 <= webpBuffer.length) {

                const type =
                    webpBuffer
                       .slice(offset, offset + 4)
                       .toString();

                const size =
                    webpBuffer.readUInt32LE(offset + 4);

                const start = offset;

                const end =
                    offset +
                    8 +
                    size +
                    (size % 2);

                if (end > webpBuffer.length) break;

                if (type!== "EXIF") {
                    chunks.push(
                        webpBuffer.slice(start, end)
                    );
                }

                offset = end;
            }

            const exifChunk = makeChunk(
                "EXIF",
                buildExif(metadata)
            );

            const body = Buffer.concat([
               ...chunks,
                exifChunk
            ]);

            const header = Buffer.alloc(12);

            header.write("RIFF", 0);
            header.writeUInt32LE(body.length + 4, 4);
            header.write("WEBP", 8);

            return Buffer.concat([
                header,
                body
            ]);
        }

        const rawPack =
    (await getSetting("PACK_NAME")) ||
    config.PACK_NAME ||
    "PRIME-MD,PREMIUM-STICKER";

let packname = rawPack;
let packauthor = "";

if (rawPack.includes(",")) {
    [packname, packauthor] = rawPack.split(",");
} else if (rawPack.includes("|")) {
    [packname, packauthor] = rawPack.split("|");
} else if (rawPack.includes("#")) {
    [packname, packauthor] = rawPack.split("#");
}

packname = packname?.trim();
packauthor = packauthor?.trim();

        const metadata = {
            "sticker-pack-id": "2be7e369-b5ce-4706-a3d4-f78805a20328",
            "sticker-pack-name": packname,
            "sticker-pack-publisher": packauthor,
            emojis: ["🦸","😴","😌"],
            premium: 1
        };

        const finalSticker = addExif(
            buffer,
            metadata
        );

        await sock.sendMessage(from, {
    sticker: finalSticker
});

    } catch (e) {
        console.error(e);
        reply("🙅‍♂️ " + e.message);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOMP4
// ━━━━━━━━━━━━━━━━━━━━━━━

// (removed duplicate "tomp4" command)

// ━━━━━━━━━━━━━━━
// EXIF
// ━━━━━━━━━━━━━━━

// (removed duplicate "exif" command)
