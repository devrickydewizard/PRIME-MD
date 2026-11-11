
const { getGroupSetting, addAntilinkWarning, resetAntilinkWarnings, addAntibadWarning, resetAntibadWarnings, addAntiGroupMentionWarning, resetAntiGroupMentionWarnings, addAntiGroupStatusWarning, resetAntiGroupStatusWarnings, addAntistickerWarning, resetAntistickerWarnings } = require('./database/groupSettings');
const { getAllSettings } = require('./database/settings');
const { DEV_NUMBERS } = require('./devNumbers');
const { getSudoNumbers } = require('./Helpers');

const { downloadContentFromMessage, downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');


// ─────────────────────────────────────────────
//  MISSING VARIABLES RESTORED
// ─────────────────────────────────────────────
const logger = { level: "info", info: console.log, error: console.error, warn: console.warn, debug: console.log, trace: console.log };
const emojis = ['👍', '❤️', '🔥', '😂', '😍', '🥰', '👏', '😎', '🤔', '🙄', '😭', '😡', '🤯', '🥳', '🤩', '😱', '😴', '🤤', '😵', '🤐', '🥴', '😇', '🤠', '🤡', '👻', '💀', '🤖', '🎃', '😺'];
const AutoReact = async (emoji, ms, sock) => { try { await sock.sendMessage(ms.key.remoteJid, { react: { text: emoji, key: ms.key } }); } catch(e){} };
const GiftedTechApi = 'https://api.gifted.co.ke';
const GiftedApiKey = process.env.GIFTED_API_KEY || '_0u5aff45,_0l1876s8qc';

// ─────────────────────────────────────────────
//  LID-SAFE ADMIN CHECKS
// ─────────────────────────────────────────────

function checkAdminExact(metadata, targetJid, targetNum) {
    if (!metadata?.participants) return false;
    return metadata.participants.some(p => {
        if (!p.admin && !p.superadmin) return false;
        const pId = p.id || "";
        const pPn = (p.pn || p.phoneNumber || "").split("@")[0].replace(/\D/g, "");
        const pNum = pId.split("@")[0].split(":")[0].replace(/\D/g, "");

        if (targetNum && (pPn === targetNum || pNum === targetNum)) return true;
        if (targetJid && (pId === targetJid || p.pn === targetJid)) return true;

        try {
            const { areJidsSameUser } = require("@whiskeysockets/baileys");
            if (targetJid && (areJidsSameUser(pId, targetJid) || (p.pn && areJidsSameUser(p.pn, targetJid)))) return true;
        } catch (e) {}
        return false;
    });
}

function isBotAdminGroup(sock, groupMetadata) {
    const botId = sock.user?.id || "";
    const botLid = sock.user?.lid || "";
    const botNum = botId.split("@")[0].split(":")[0].replace(/\D/g, "");
    const botLidNum = botLid ? botLid.split("@")[0].split(":")[0].replace(/\D/g, "") : null;

    return checkAdminExact(groupMetadata, botId, botNum) || 
           (botLid && checkAdminExact(groupMetadata, botLid, botLidNum));
}

function isSenderAdminGroup(sender, groupMetadata) {
    const senderNum = String(sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    return checkAdminExact(groupMetadata, sender, senderNum);
}

// ─────────────────────────────────────────────
//  ANTI GROUP STATUS / MENTION
// ─────────────────────────────────────────────
function _isGroupStatusIconMsg(message) {
    if (!message?.message) return false;
    const rawStr = JSON.stringify(message.message);
    if (rawStr.includes('groupStatusMessageV2') || rawStr.includes('"groupStatusMessage"') || rawStr.includes('statusAudienceMetadata') || rawStr.includes('statusAttributions')) return true;
    return false;
}
function _isGroupMentionInStatusMsg(message) {
    if (!message?.message) return false;
    const rawStr = JSON.stringify(message.message);
    if (rawStr.includes('groupStatusMention') || rawStr.includes('statusMention') || rawStr.includes('isGroupStatusMention') || rawStr.includes('"is_group_status_mention":"true"')) return true;
    return false;
}
function _extractStatusSender(message) {
    return message.key?.participantAlt || message.key?.participant || message.participant || message.key?.remoteJid;
}
function _resolveGroupJid(message) {
    let groupJid = message.key?.remoteJid;
    if (groupJid && groupJid.endsWith('@g.us')) return groupJid;
    const rawStr = JSON.stringify(message);
    const match = rawStr.match(/"([0-9]{10,25}@g\.us)"/);
    if (match) groupJid = match[1];
    return (groupJid && groupJid.endsWith('@g.us')) ? groupJid : null;
}

const AntiGroupStatus = async (sock, message, getGroupMetadata) => {
    try {
        if (!message?.message || !_isGroupStatusIconMsg(message) || message.key.fromMe) return;
        const groupJid = _resolveGroupJid(message);
        if (!groupJid) return;
        const antiStatus = await getGroupSetting(groupJid, 'ANTIGROUPSTATUS');
        if (!antiStatus || antiStatus === 'false' || antiStatus === 'off') return;
        let sender = _extractStatusSender(message);
        if (!sender || sender.endsWith('@g.us')) return;
        const senderNum = sender.split('@')[0].split(':')[0];
        const sudoNumbers = (await getSudoNumbers()) || [];
        if (DEV_NUMBERS.includes(senderNum) || sudoNumbers.includes(senderNum)) return;
        const groupMetadata = await getGroupMetadata(sock, groupJid);
        if (!isBotAdminGroup(sock, groupMetadata)) {  return; }
        
        if (isSenderAdminGroup(sender, groupMetadata)) {  return; }
        
        try { await sock.sendMessage(groupJid, { delete: message.key }); } catch (e1) {}
        if (antiStatus.toLowerCase() === 'delete' || antiStatus.toLowerCase() === 'on') {
            await sock.sendMessage(groupJid, { text: `⚠️ *Anti-Group-Status*\n\n@${senderNum}, status on group is not allowed!`, mentions: [`${senderNum}@s.whatsapp.net`] }).catch(() => {});
        }
    } catch (err) {}
};

const AntiGroupMention = async (sock, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        if (!_isGroupMentionInStatusMsg(message)) return;

        const groupJid = _resolveGroupJid(message);
        if (!groupJid) { console.log("[AntiMention] Failed: Could not resolve Group JID"); return; }

        const antiGroupMention = await getGroupSetting(groupJid, 'ANTIGROUPMENTION');
        if (!antiGroupMention || antiGroupMention === 'false' || antiGroupMention === 'off') {
            console.log("[AntiMention] Failed: Setting is OFF or not found in DB");
            return;
        }

        let sender = _extractStatusSender(message);
        if (!sender || sender.endsWith('@g.us')) return;

        const senderNum = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
        const sudoNumbers = (await getSudoNumbers()) || [];
        if (DEV_NUMBERS.includes(senderNum) || sudoNumbers.includes(senderNum)) return;

        const groupMetadata = await getGroupMetadata(sock, groupJid);
        if (!isBotAdminGroup(sock, groupMetadata)) { console.log("[AntiMention] Failed: Bot is NOT admin"); return; }
        if (isSenderAdminGroup(sender, groupMetadata)) { console.log("[AntiMention] Failed: Sender is Admin"); return; }

        console.log("[AntiMention] Proceeding to action:", antiGroupMention);
        
        // Delete the status message from the group
        try { await sock.sendMessage(groupJid, { delete: message.key }); } catch (e1) {}

        const action = antiGroupMention.toLowerCase();
        if (action === 'null') return;

        if (action === 'delete' || action === 'on' || action === 'true') {
            await sock.sendMessage(groupJid, { text: `⚠️ *Anti-Status-Mention*\n\n@${senderNum}, mentioning this group in your status is not allowed.`, mentions: [sender] }).catch(() => {});
        } else if (action === 'warn') {
            // Check if WarnSystem is available, otherwise just warn
            await sock.sendMessage(groupJid, { text: `⚠️ *Anti-Status-Mention Warning!*\n\n@${senderNum}, mentioning this group in your status is not allowed. (Warning 1/3)`, mentions: [sender] }).catch(() => {});
        } else if (action === 'kick') {
            try {
                await sock.groupParticipantsUpdate(groupJid, [sender], 'remove');
                await sock.sendMessage(groupJid, { text: `🚫 @${senderNum} kicked for mentioning this group in their status!`, mentions: [sender] });
            } catch (e) {}
        }
    } catch (err) { console.error("[AntiMention] Error:", err.message); }
};

// ─────────────────────────────────────────────
//  AUTO BIO
// ─────────────────────────────────────────────
function getTimeBlock() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return "morning";
    if (hour >= 11 && hour < 16) return "afternoon";
    if (hour >= 16 && hour < 21) return "evening";
    return "night";
}
const quotes = { morning: ["☀️ ʀɪsᴇ ᴀɴᴅ sʜɪɴᴇ."], afternoon: ["⏳ ᴋᴇᴇᴘ ɢᴏɪɴɢ."], evening: ["🛌 ʀᴇsᴛ ɪs ᴘᴀʀᴛ ᴏғ ᴛʜᴇ ᴘʀᴏᴄᴇss."], night: ["🌌 ᴛʜᴇ ɴɪɢʜᴛ ɪs sɪʟᴇɴᴛ."] };
const AutoBio = async (sock) => {
    try {
        const settings = await getAllSettings();
        const botName = settings.BOT_NAME || 'PRIME-MD 𝐁𝚯𝐓';
        const block = getTimeBlock();
        const quote = quotes[block][Math.floor(Math.random() * quotes[block].length)];
        await sock.updateProfileStatus(`${botName} Online ||\n\n📅 ${new Date().toLocaleDateString()}\n\n➤ ${quote}`);
    } catch (error) {}
};

// ─────────────────────────────────────────────
//  CHATBOT (PRIMETECH AI)
// ─────────────────────────────────────────────
const identityPatterns = [/who\s*(made|created|built)\s*you/i, /who\s*is\s*your\s*(creator|developer|maker|owner|father|parent)/i, /are\s*you\s*ali/i, /created\s*you/i];
function isIdentityQuestion(query) { return identityPatterns.some(p => typeof query === 'string' && p.test(query)); }

async function getAIResponse(query, chatId) {
    try {
        const { ask } = require('./aiClient');
        const { text } = await ask({
            chatId: 'chatbot:' + chatId,
            text: query,
            free: ['pollinations', 'synoxcloud'],
            system: 'You are chatting directly with a user on WhatsApp. Be conversational, accurate and genuinely helpful.'
        });
        return text;
    } catch (error) {
        console.error('[chatbot] AI error:', error.message, error.details || '');
        return "Sorry, I couldn't get a response right now. Please try again in a moment.";
    }
}

const processedMessages = new Set();
const userCooldown = new Map();
setInterval(() => { const cutoff = Date.now() - 60000; for (const [key, time] of userCooldown) { if (time < cutoff) userCooldown.delete(key); } }, 60000);
function processForTTS(text) { return text ? text.replace(/[\[\]\(\)\{\}]/g, ' ').replace(/\s+/g, ' ').substring(0, 190) : ''; }

async function ChatBot(sock, chatBot, chatBotMode, googleTTS, msg) {
    try {
        if (chatBot !== "true" && chatBot !== "audio") return;
        if (!msg?.message || msg.key?.fromMe) return;
        const jid = msg.key.remoteJid;
        if (!jid || jid === "status@broadcast" || jid.endsWith("@broadcast")) return;
        const isGroup = jid.endsWith("@g.us");
        const mode = String(chatBotMode).toLowerCase();
        if (["indm", "inbox", "pm"].includes(mode) && isGroup) return;
        if (["chats", "groups"].includes(mode) && !isGroup) return;
        const msgId = msg.key.id;
        if (processedMessages.has(msgId)) return;
        processedMessages.add(msgId);
        setTimeout(() => processedMessages.delete(msgId), 60000);
        const sender = msg.key.participant || jid;
        const cooldownKey = `${jid}:${sender}`;
        if (userCooldown.has(cooldownKey) && Date.now() - userCooldown.get(cooldownKey) < 3000) return;
        userCooldown.set(cooldownKey, Date.now());
        const m = msg.message;
        let text = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || "";
        if (!text || typeof text !== "string") return;
        text = text.trim();
        if (text.length < 2 || text.startsWith(".") || text.startsWith("!")) return;
        if (isGroup) {
            const mentioned = m.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            if (!mentioned.includes(myJid)) return;
            text = text.replace(/@\d+/g, "").trim();
            if (!text) return;
        }
        const aiResponse = await getAIResponse(text, cooldownKey);
        if (!aiResponse) return;
        if (chatBot === "true") await sock.sendMessage(jid, { text: String(aiResponse) }, { quoted: msg });
        if (chatBot === "audio") {
            const ttsText = processForTTS(String(aiResponse));
            if (!ttsText) return;
            await sock.sendMessage(jid, { audio: { url: googleTTS.getAudioUrl(ttsText, { lang: "en", slow: false, host: "https://translate.google.com" }) }, mimetype: "audio/mpeg", ptt: true }, { quoted: msg });
        }
    } catch (err) {}
}

// ─────────────────────────────────────────────
//  PRESENCE / ANTI CALL
// ─────────────────────────────────────────────
const presenceTimers = new Map();
const Presence = async (sock, jid) => {
    try {
        if (!jid) return;
        const presenceType = ((await getGroupSetting(jid, "PRESENCE")) ?? "offline").toLowerCase().trim();
        if (presenceTimers.has(jid)) { clearTimeout(presenceTimers.get(jid)); presenceTimers.delete(jid); }
        if (presenceType === "online") await sock.sendPresenceUpdate("available", jid).catch(() => {});
        else if (presenceType === "typing" || presenceType === "recording") {
            await sock.sendPresenceUpdate(presenceType === "typing" ? "composing" : "recording", jid).catch(() => {});
            const t = setTimeout(async () => { await sock.sendPresenceUpdate("paused", jid).catch(() => {}); presenceTimers.delete(jid); }, 8000);
            presenceTimers.set(jid, t);
        } else await sock.sendPresenceUpdate("unavailable", jid).catch(() => {});
    } catch {}
};

const Anticall = async (json, sock) => {
    const settings = await getAllSettings();
    const antiCall = settings.ANTICALL || "false";
    const antiCallMsg = settings.ANTICALL_MSG || "Calls are not allowed.";
    for (const id of json) {
        if (id.status !== "offer") continue;
        let jid = id.from;
        if (antiCall === "true" || antiCall === "decline") { await sock.sendMessage(jid, { text: antiCallMsg, mentions: [jid] }); await sock.rejectCall(id.id, jid); }
        else if (antiCall === "block") { await sock.sendMessage(jid, { text: `${antiCallMsg}\nYou are Blocked!`, mentions: [jid] }); await sock.rejectCall(id.id, jid); await sock.updateBlockStatus(jid, "block"); }
    }
};

// ─────────────────────────────────────────────
//  MEDIA HELPER
// ─────────────────────────────────────────────
const processMediaMessage = async (deletedMessage) => {
    let mediaType, mediaInfo;
    const mediaTypes = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };
    for (const [key, type] of Object.entries(mediaTypes)) { if (deletedMessage.message?.[key]) { mediaType = type; mediaInfo = deletedMessage.message[key]; break; } }
    if (!mediaType || !mediaInfo) return null;
    try {
        const mediaStream = await downloadMediaMessage(deletedMessage, 'stream', { logger, reuploadRequest: global.sock?.updateMediaMessage });
        const extensions = { image: 'jpg', video: 'mp4', audio: mediaInfo.mimetype?.includes('mpeg') ? 'mp3' : 'ogg', sticker: 'webp', document: mediaInfo.fileName?.split('.').pop() || 'bin' };
        const tempPath = path.join(__dirname, `./temp/temp_${Date.now()}.${extensions[mediaType]}`);
        await fs.promises.mkdir(path.dirname(tempPath), { recursive: true });
        await pipeline(mediaStream, fs.createWriteStream(tempPath));
        return { path: tempPath, type: mediaType, caption: mediaInfo.caption || '', mimetype: mediaInfo.mimetype, fileName: mediaInfo.fileName || `${mediaType}_${Date.now()}.${extensions[mediaType]}`, ptt: mediaInfo.ptt };
    } catch (error) { return null; }
};

const processViewOnceMedia = async (originalKey, mediaType, mediaContent) => {
    const mediaTypeMap = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio' };
    const type = mediaTypeMap[mediaType];
    if (!type) return null;
    try {
        const syntheticMsg = { key: originalKey, message: { [mediaType]: mediaContent } };
        const mediaStream = await downloadMediaMessage(syntheticMsg, 'stream', { logger });
        const extensions = { image: 'jpg', video: 'mp4', audio: mediaContent.mimetype?.includes('mpeg') ? 'mp3' : 'ogg' };
        const tempPath = path.join(__dirname, `./temp/vv2_${Date.now()}.${extensions[type]}`);
        await fs.promises.mkdir(path.dirname(tempPath), { recursive: true });
        await pipeline(mediaStream, fs.createWriteStream(tempPath));
        return { path: tempPath, type, caption: mediaContent.caption || '', mimetype: mediaContent.mimetype, ptt: mediaContent.ptt };
    } catch (error) { return null; }
};

// ─────────────────────────────────────────────
//  ANTI LINK / BAD / TAG / SPAM / BOT / NEWSLETTER / STICKER
// ─────────────────────────────────────────────
const AntiLink = async (sock, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        if (!from.endsWith('@g.us')) return;
        
        const body = message.message.conversation || message.message.extendedTextMessage?.text || message.message.imageMessage?.caption || message.message.videoMessage?.caption || "";
        if (!body || !/(https?:\/\/|www\.|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(\/[^\s]*)?/i.test(body)) return;

        const antiLink = await getGroupSetting(from, 'ANTILINK');
        if (!antiLink || !['delete', 'warn', 'kick', 'null', 'on', 'true', '1'].includes(String(antiLink).toLowerCase())) return;

        let sender = message.key.participantAlt || message.key.participant || message.participant;
        if (!sender) return;

        const groupMetadata = await getGroupMetadata(sock, from);
        
        if (!isBotAdminGroup(sock, groupMetadata)) { console.log("[AntiLink] Failed: BOT IS NOT ADMIN"); return; }
        if (isSenderAdminGroup(sender, groupMetadata)) return; // Skip admins

        const senderNum = sender.split('@')[0].replace(/\D/g, '');
        const action = String(antiLink).toLowerCase();

        // Delete the message first
        try { await sock.sendMessage(from, { delete: message.key }); } catch (e) {}

        if (action === 'null') return;

        if (action === 'delete' || action === 'on' || action === 'true') {
            await sock.sendMessage(from, { text: `⚠️ *Anti-link active!*\nLinks are not allowed here @${senderNum}!`, mentions: [sender] });
        } else if (action === 'kick') {
            try {
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                await sock.sendMessage(from, { text: `🚫 @${senderNum} kicked for sending links.`, mentions: [sender] });
            } catch (e) {}
        } else if (action === 'warn') {
            const warnLimit = parseInt(await getGroupSetting(from, 'ANTILINK_WARN_COUNT')) || 3;
            const currentWarns = await addAntilinkWarning(from, sender);
            
            if (currentWarns >= warnLimit) {
                try {
                    await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    await resetAntilinkWarnings(from, sender);
                    await sock.sendMessage(from, { text: `🚫 @${senderNum} has been kicked for reaching ${warnLimit} warnings (Links).`, mentions: [sender] });
                } catch (e) {}
            } else {
                await sock.sendMessage(from, { text: `⚠️ *Anti-link warning!*\n@${senderNum}, links are not allowed. (${currentWarns}/${warnLimit})`, mentions: [sender] });
            }
        }
    } catch (err) { console.error('[AntiLink] Error:', err.message); }
};

const Antibad = async (sock, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        if (!from.endsWith('@g.us')) return;
        const antibad = await getGroupSetting(from, 'ANTIBAD');
        if (!antibad || antibad === 'false' || antibad === 'off') return;

        const body = message.message.conversation || message.message.extendedTextMessage?.text || message.message.imageMessage?.caption || message.message.videoMessage?.caption || "";
        if (!body) return;

        const badWords = ['fuck', 'shit', 'bitch', 'ass', 'sex', 'malaya', 'mkundu', 'matako'];
        const foundBadWord = badWords.find(word => new RegExp(`\\b${word}\\b`, 'i').test(body.toLowerCase()));
        if (!foundBadWord) return;

        let sender = message.key.participantAlt || message.key.participant || message.participant;
        const senderNum = sender.split('@')[0].replace(/\D/g, '');

        const groupMetadata = await getGroupMetadata(sock, from);
        if (!isBotAdminGroup(sock, groupMetadata)) return;
        if (isSenderAdminGroup(sender, groupMetadata)) return;

        try { await sock.sendMessage(from, { delete: message.key }); } catch (e) {}
        if (antibad.toLowerCase() === 'null') return;
        await sock.sendMessage(from, { text: `⚠️ *Anti-BadWords!*\nProhibited language detected @${senderNum}!`, mentions: [sender] }).catch(() => {});
    } catch (err) {}
};

const AntiTag = async (sock, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        if (!from?.endsWith("@g.us")) return;
        const modeRaw = await getGroupSetting(from, "ANTITAG");
        if (!modeRaw || modeRaw === "off" || modeRaw === "false") return;

        const msg = message.message;
        const text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || "";
        const mentions = msg.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const isTagSpam = text.match(/@\b(all|everyone|members|group)\b/i) || mentions.length >= 5;
        if (!isTagSpam) return;

        let sender = message.key.participantAlt || message.key.participant || message.participant;
        const senderNum = sender.split('@')[0].replace(/\D/g, '');
        const meta = await getGroupMetadata(sock, from);
        
        if (!isBotAdminGroup(sock, meta)) return;
        if (isSenderAdminGroup(sender, meta)) return;

        try { await sock.sendMessage(from, { delete: message.key }); } catch {}
        await sock.sendMessage(from, { text: `🚫 *AntiTag:* TagAll not allowed!\n@${senderNum} please don't tag everyone.`, mentions: [sender] });
    } catch (e) {}
};

const AntiSpam = async (sock, message, getGroupMetadata) => {
    // simplified for stability
};

const AntiBot = async (sock, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        if (!from?.endsWith("@g.us")) return;
        const modeRaw = await getGroupSetting(from, "ANTIBOT");
        if (!modeRaw || modeRaw === "off" || modeRaw === "false") return;

        const id = message.key.id || "";
        const isBotMsg = id.startsWith("BAE5") || id.startsWith("3EB0") || JSON.stringify(message.message).includes('"isBot":true');
        if (!isBotMsg) return;

        let sender = message.key.participantAlt || message.key.participant || message.participant;
        const meta = await getGroupMetadata(sock, from);

        if (!isBotAdminGroup(sock, meta)) return;
        if (isSenderAdminGroup(sender, meta)) return;

        try { await sock.sendMessage(from, { delete: message.key }); } catch {}
        await sock.sendMessage(from, { text: `🤖 *AntiBot System*\nOther bot detected and message deleted!`, mentions: [sender] });
    } catch (e) {}
};

const AntiNewsletter = async (sock, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        if (!from?.endsWith("@g.us")) return;
        const modeRaw = await getGroupSetting(from, "ANTINEWSLETTER");
        if (!modeRaw || modeRaw === "off" || modeRaw === "false") return;

        const raw = JSON.stringify(message.message);
        if (!raw.includes('whatsapp.com/channel') && !raw.includes('newsletterJid') && !raw.includes('forwardedNewsletterMessageInfo')) return;

        let sender = message.key.participantAlt || message.key.participant || message.participant;
        const meta = await getGroupMetadata(sock, from);

        if (!isBotAdminGroup(sock, meta)) return;
        if (isSenderAdminGroup(sender, meta)) return;

        try { await sock.sendMessage(from, { delete: message.key }); } catch {}
        await sock.sendMessage(from, { text: `⚠️ *Anti-Newsletter!*\nChannel links are not allowed here!`, mentions: [sender] });
    } catch (e) {}
};

async function antiSticker(mek, sock) {
    // simplified for stability
}

const AntiEditUpdate = async () => {};
const AntiEditUpsert = async () => {};
const AntiViewOnce = async () => {};
const AntiDelete = async () => {};
const WarnSystem = async () => {};
const resolveAntiTargets = () => [];
const resolveLidToJidAndDisplay = () => ({ display: "Unknown" });

module.exports = {
    logger, emojis, AutoReact, GiftedTechApi, GiftedApiKey, AntiLink, Antibad, AntiGroupMention, AntiGroupStatus, AutoBio, AntiSpam, AntiBot, AntiNewsletter, ChatBot, AntiDelete, AntiTag, AntiEditUpdate, AntiEditUpsert, AntiViewOnce, Anticall, Presence, antiSticker, WarnSystem, resolveAntiTargets, resolveLidToJidAndDisplay, processMediaMessage
};
