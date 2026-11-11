const fs = require("fs-extra");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const logger = require('pino')({ level: 'silent' }).child({});
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const {
    getGroupSetting,
    setGroupSetting,
    addAntipornWarning,
    resetAntipornWarnings,
} = require("./database/groupSettings");
const { getSudoNumbers } = require("./database/sudo");
const { getLidMapping } = require("./connection/groupCache");
const { WarnSystem } = require("./Functions2");

const { DEV_NUMBERS } = require('./devNumbers');

function _getEnvWarnFallback() {
    const envLimit = parseInt(process.env.WARN);
    return (!isNaN(envLimit) && envLimit > 0) ? envLimit : 3;
}

async function resolveSenderJid(sock, jid) {
    if (!jid || !jid.endsWith("@lid")) return jid;
    const cached = getLidMapping(jid);
    if (cached) return cached;
    try { const r = await sock.getJidFromLid(jid); if (r) return r; } catch (e) {}
    return jid;
}

// Unwraps one level of ephemeral/viewOnce wrapper — enough for normal chat media
function unwrapMessage(msgObj) {
    if (!msgObj) return msgObj;
    if (msgObj.ephemeralMessage) return msgObj.ephemeralMessage.message;
    if (msgObj.viewOnceMessage) return msgObj.viewOnceMessage.message;
    if (msgObj.viewOnceMessageV2) return msgObj.viewOnceMessageV2.message;
    if (msgObj.viewOnceMessageV2Extension) return msgObj.viewOnceMessageV2Extension.message;
    return msgObj;
}

// ── Sightengine nudity check ──────────────────────────────────
// Requires Node 18+ for global fetch/FormData/Blob.
async function checkNudity(imageBuffer, filename = "image.jpg") {
    const apiUser = process.env.SIGHTENGINE_USER;
    const apiSecret = process.env.SIGHTENGINE_SECRET;
    if (!apiUser || !apiSecret) {
        throw new Error("SIGHTENGINE_USER / SIGHTENGINE_SECRET not configured");
    }

    const form = new FormData();
    form.append("media", new Blob([imageBuffer]), filename);
    form.append("models", "nudity-2.1");
    form.append("api_user", apiUser);
    form.append("api_secret", apiSecret);

    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
        method: "POST",
        body: form,
    });
    const data = await res.json();

    if (data.status !== "success") {
        throw new Error(`Sightengine error: ${JSON.stringify(data)}`);
    }

    const n = data.nudity || {};
    // Same scoring as the reference implementation: sum of the three explicit-content classes
    const score = (n.sexual_activity || 0) + (n.sexual_display || 0) + (n.erotica || 0);
    return { score, raw: data };
}

// Extracts the first frame of a video buffer as a jpg buffer via ffmpeg
async function extractVideoFrame(videoBuffer) {
    const tempDir = path.join(__dirname, "temp");
    await fs.ensureDir(tempDir);
    const inPath = path.join(tempDir, `antiporn_in_${Date.now()}.mp4`);
    const outPath = path.join(tempDir, `antiporn_frame_${Date.now()}.jpg`);

    await fs.writeFile(inPath, videoBuffer);
    try {
        await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-frames:v", "1", "-q:v", "2", outPath]);
        return await fs.readFile(outPath);
    } finally {
        fs.unlink(inPath).catch(() => {});
        fs.unlink(outPath).catch(() => {});
    }
}

// ─────────────────────────────────────────────
//  ANTI PORN
//  Setting: ANTIPORN (group) — off | delete | warn | kick | null
//  Setting: ANTIPORN_THRESHOLD (group) — 0.1 (strict) .. 0.9 (lenient), default 0.5
//  Setting: ANTIPORN_WARN_COUNT (group) — warn-mode kick threshold
// ─────────────────────────────────────────────

const AntiPorn = async (sock, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        if (!from?.endsWith("@g.us")) return;

        const mode = (await getGroupSetting(from, "ANTIPORN") || "off").toLowerCase();
        if (mode === "off" || mode === "false" || !mode) return;

        if (!process.env.SIGHTENGINE_USER || !process.env.SIGHTENGINE_SECRET) return;

        const msgObj = unwrapMessage(message.message);

        let mediaType = null;
        if (msgObj.imageMessage) mediaType = "image";
        else if (msgObj.stickerMessage) mediaType = "sticker";
        else if (msgObj.videoMessage) mediaType = "video";
        if (!mediaType) return;

        let sender = message.key.participantAlt || message.key.participant || message.participant;
        if (!sender || sender.endsWith("@g.us")) return;
        sender = await resolveSenderJid(sock, sender);
        const senderNum = sender.split("@")[0];

        const sudoNumbers = (await getSudoNumbers().catch(() => [])) || [];
        const isSuperUser = DEV_NUMBERS.includes(senderNum) || sudoNumbers.includes(senderNum);
        if (isSuperUser) return;

        const groupMetadata = await getGroupMetadata(sock, from);
        if (!groupMetadata?.participants) return;

        const botJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
        const botAdmin = groupMetadata.participants.find(p => {
            const pNum = (p.pn || p.phoneNumber || p.id || "").split("@")[0];
            return pNum === botJid.split("@")[0] && p.admin;
        });
        if (!botAdmin) return;

        const groupAdmins = groupMetadata.participants
            .filter(m => m.admin)
            .map(a => a.pn || a.phoneNumber || a.id);
        const isAdmin = groupAdmins.some(a => (a || "").split("@")[0] === senderNum || a === sender);
        if (isAdmin) return;

        // ── download media ────────────────────────────────────
        let imageBuffer;
        try {
            if (mediaType === "video") {
                const videoBuffer = await downloadMediaMessage(message, "buffer", { logger });
                imageBuffer = await extractVideoFrame(videoBuffer);
            } else {
                imageBuffer = await downloadMediaMessage(message, "buffer", { logger });
            }
        } catch (e) {
            console.error("[AntiPorn] download failed:", e.message);
            return;
        }

        // ── check with sightengine ─────────────────────────────
        let result;
        try {
            result = await checkNudity(imageBuffer, mediaType === "sticker" ? "image.webp" : "image.jpg");
        } catch (e) {
            console.error("[AntiPorn] nudity check failed:", e.message);
            return;
        }

        const threshold = parseFloat(await getGroupSetting(from, "ANTIPORN_THRESHOLD")) || 0.5;
        if (result.score < threshold) return;

        console.log(`[AntiPorn] flagged ${mediaType} from ${senderNum} | score: ${result.score.toFixed(2)} | mode: ${mode}`);

        try { await sock.sendMessage(from, { delete: message.key }); } catch (e) {
            console.error("[AntiPorn] delete failed:", e.message);
        }

        if (mode === "null") return;

        if (mode === "delete") {
            await sock.sendMessage(from, {
                text: `🔞 *Anti-Porn*\nExplicit content detected and removed @${senderNum}!`,
                mentions: [sender],
            });
        } else if (mode === "warn") {
            const warnLimit = parseInt(await getGroupSetting(from, "ANTIPORN_WARN_COUNT")) || _getEnvWarnFallback();
            await WarnSystem(sock, from, sender, "Explicit content", addAntipornWarning, resetAntipornWarnings, warnLimit);
        } else if (mode === "kick") {
            try {
                await sock.groupParticipantsUpdate(from, [sender], "remove");
                await sock.sendMessage(from, {
                    text: `🔞 @${senderNum} kicked for sending explicit content!`,
                    mentions: [sender],
                });
            } catch (e) {
                console.error("[AntiPorn] kick failed:", e.message);
                await sock.sendMessage(from, {
                    text: `⚠️ Explicit content detected from @${senderNum}! Could not remove user.`,
                    mentions: [sender],
                });
            }
        }
    } catch (err) {
        console.error("[AntiPorn] unhandled error:", err);
    }
};

module.exports = { AntiPorn, checkNudity };
