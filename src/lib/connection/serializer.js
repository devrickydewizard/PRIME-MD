const { getContentType, downloadContentFromMessage, downloadMediaMessage } = require("@whiskeysockets/baileys");
const { getLidMapping } = require('./groupCache');
const config = require("../../config");

const standardizeJid = (jid) => {
    if (!jid) return '';
    try {
        jid = typeof jid === 'string'? jid :
            (jid.decodeJid? jid.decodeJid() : String(jid));
        jid = jid.split(':')[0].split('/')[0];
        if (!jid.includes('@')) {
            jid += '@s.whatsapp.net';
        } else if (jid.endsWith('@lid')) {
            return jid.toLowerCase();
        }
        return jid.toLowerCase();
    } catch (e) {
        console.error('JID standardization error:', e);
        return '';
    }
};

const convertLidToJid = (lid) => {
    if (!lid) return '';
    if (!lid.endsWith('@lid')) return lid;
    const cached = getLidMapping(lid);
    if (cached) return cached;
    return lid;
};

const serializeMessage = async (ms, sock, settings = {}) => {
    if (!ms?.message ||!ms?.key) return null;

    const botId = standardizeJid(sock.user?.id);
    const type = getContentType(ms.message);

    const hasEntryPointContext =
        ms.message?.extendedTextMessage?.contextInfo?.entryPointConversionApp === 'whatsapp' ||
        ms.message?.imageMessage?.contextInfo?.entryPointConversionApp === 'whatsapp' ||
        ms.message?.videoMessage?.contextInfo?.entryPointConversionApp === 'whatsapp' ||
        ms.message?.documentMessage?.contextInfo?.entryPointConversionApp === 'whatsapp' ||
        ms.message?.audioMessage?.contextInfo?.entryPointConversionApp === 'whatsapp';

    const isMessageYourself =
        hasEntryPointContext &&
        ms.key.remoteJid?.endsWith('@lid') &&
        ms.key.fromMe;

    const from = isMessageYourself
       ? botId
        : standardizeJid(ms.key.remoteJid);

    const isGroup = from.endsWith('@g.us');

    // ✅ LID resolve karo
    // ✅ FIX: operator precedence — `A + B || C` always evaluated `+` first,
    // so if sock.user?.id was falsy, string concat with undefined produced a
    // truthy garbage string and the `|| sock.user?.id` fallback never ran.
    const rawSendr = ms.key.fromMe
        ? (sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : sock.user?.id)
        : (ms.key.participantAlt ||
           ms.key.remoteJidAlt ||
           ms.key.remoteJid ||
           ms.key.participant);

    const sendr = convertLidToJid(rawSendr);

    // =========================
    // BODY EXTRACTION
    // =========================
    let body = '';
    let isButtonResponse = false;
    let buttonId = null;

    if (ms.message?.interactiveResponseMessage) {
        isButtonResponse = true;

        try {
            const paramsJson = ms.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson;
            if (paramsJson) {
                buttonId = JSON.parse(paramsJson)?.id || null;
            }
        } catch {}

        if (!buttonId) {
            buttonId = ms.message.interactiveResponseMessage.buttonId || null;
        }

        body = buttonId || ms.message.interactiveResponseMessage?.body?.text || '';
    }

    else if (ms.message?.buttonsResponseMessage?.selectedButtonId) {
        isButtonResponse = true;
        buttonId = ms.message.buttonsResponseMessage.selectedButtonId;
        body = buttonId;
    }

    else if (ms.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        isButtonResponse = true;
        buttonId = ms.message.listResponseMessage.singleSelectReply.selectedRowId;
        body = buttonId;
    }

    else if (ms.message?.templateButtonReplyMessage?.selectedId) {
        isButtonResponse = true;
        buttonId = ms.message.templateButtonReplyMessage.selectedId;
        body = buttonId;
    }

    else if (type === 'conversation') {
        body = ms.message.conversation;
    }

    else if (type === 'extendedTextMessage') {
        body = ms.message.extendedTextMessage?.text || '';
    }

    else if (type === 'imageMessage') {
        body = ms.message.imageMessage?.caption || '';
    }

    else if (type === 'videoMessage') {
        body = ms.message.videoMessage?.caption || '';
    }

    // =========================
    // PREFIX SYSTEM
    // =========================

    const rawPrefix = settings.PREFIX?? config?.PREFIX?? '.';
    const botPrefix = (rawPrefix === 'null' || rawPrefix === '')? '' : rawPrefix;

    let isCommand = false;
    let command = "";
    let args = [];
    let usedPrefix = "";
    let q = ""; // ✅ multi-line-safe raw text

    const text = typeof body === 'string'? body.trim() : '';

    // ✅ sirf command (pehla word) whitespace se split hota hai.
    // Baaki poora text 'rest' me RAW rehta hai (internal newlines/multi-line preserved).
    // 'args' sirf word-based usage ke liye array hai, lekin q ke liye 'rest' use hoga
    // taake ".take"/".setpackname" jaisi multi-line pack/author values na toote.
    const parse = (t) => {
        const m = t.match(/^(\S+)([\s\S]*)$/);
        if (!m) return { command: "", args: [], rest: "" };

        const command = m[1].toLowerCase();
        const rest = m[2].replace(/^\s+/, ''); // sirf leading whitespace trim, internal \n intact
        const args = rest.length? rest.split(/\s+/) : [];

        return { command, args, rest };
    };

    // NULL MODE = No Prefix Mode
    if (botPrefix === '') {
        isCommand = true;

        const res = parse(text);
        command = res.command;
        args = res.args;
        q = res.rest;
        usedPrefix = '';
    }

    // REGEX MODE (multi prefix)
    else if (typeof botPrefix === "string" && botPrefix.startsWith("^")) {

        const regex = new RegExp(botPrefix);
        const match = text.match(regex);

        if (match) {
            isCommand = true;

            usedPrefix = match[0];

            const withoutPrefix = text.slice(usedPrefix.length).trim();
            const res = parse(withoutPrefix);

            command = res.command;
            args = res.args;
            q = res.rest;
        }
    }

    // SINGLE PREFIX MODE
    else if (typeof botPrefix === "string") {

        if (text.startsWith(botPrefix)) {
            isCommand = true;

            usedPrefix = botPrefix;

            const withoutPrefix = text.slice(botPrefix.length).trim();
            const res = parse(withoutPrefix);

            command = res.command;
            args = res.args;
            q = res.rest;
        }
    }

    // =========================
    // QUOTED / CONTEXT INFO
    // =========================

    const repliedMessage = ms.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;

    const quoted =
        type == 'extendedTextMessage' &&
        ms.message.extendedTextMessage?.contextInfo!= null
           ? ms.message.extendedTextMessage.contextInfo.quotedMessage || []
            : [];

    const contextInfo =
        ms.message?.extendedTextMessage?.contextInfo ||
        ms.message?.imageMessage?.contextInfo ||
        ms.message?.videoMessage?.contextInfo ||
        ms.message?.audioMessage?.contextInfo ||
        ms.message?.documentMessage?.contextInfo ||
        ms.message?.stickerMessage?.contextInfo ||
        null;

    // ✅ FIX: mentionedJid ab sirf extendedTextMessage tak mehdood nahi —
    // shared `contextInfo` (jo sab message-types cover karta hai) se aata hai,
    // taake image/video caption ke mentions bhi capture hon
    const mentionedJid = (contextInfo?.mentionedJid || [])
       .map(standardizeJid);

    // ✅ FIX: `ms.mtype` is-codebase mein exist hi nahi karta (kabhi set nahi
    // hota), isliye ye condition hamesha false thi aur `tagged` hamesha []
    // return karta tha. Ab computed `type` variable use kar rahe hain, aur
    // shared `contextInfo` se — jaisa `mentionedJid` ke sath kiya.
    const tagged =
        contextInfo?.mentionedJid || [];

    const quotedMsg = contextInfo?.quotedMessage || null;
    const rawQuotedUser = contextInfo?.participant || contextInfo?.remoteJid;

    const quotedUser = convertLidToJid(standardizeJid(rawQuotedUser));
    const repliedMessageAuthor = convertLidToJid(standardizeJid(contextInfo?.participant));

    const quotedStanzaId = contextInfo?.stanzaId || null;

    // ✅ FIX: use resolved `quotedUser` (LID already converted to real JID)
    // instead of raw `rawQuotedUser` — previously fromMe/participant checks
    // could silently fail or carry an unresolved @lid when the quoted
    // sender's key was in LID format
    const quotedKey = quotedStanzaId
       ? {
              remoteJid: from,
              fromMe: quotedUser === botId,
              id: quotedStanzaId,
              participant: isGroup? quotedUser : undefined
          }
        : null;

    let messageAuthor = isGroup
       ? standardizeJid(ms.key.participant || ms.participant || from)
        : from;

    if (ms.key.fromMe) messageAuthor = botId;

    const user =
        mentionedJid.length > 0
           ? mentionedJid[0]
            : repliedMessage
           ? repliedMessageAuthor
            : '';
    ms.chat = from;

    // =========================
    // RETURN
    // =========================

    return {
        ms,
        mek: ms,
        type,
        from,
        isGroup,
        sender: sendr,
        botId,

        body,

        isCommand,
        command,
        args,
        q, // ✅ multi-line intact rahega

        usedPrefix,
        prefix: botPrefix,

        pushName:
            ms.pushName ||
            (ms.key.fromMe? sock.user?.name : null) ||
            'User',

        quoted,
        repliedMessage,
        mentionedJid,
        tagged,
        quotedMsg,
        quotedKey,
        quotedUser,
        repliedMessageAuthor,
        messageAuthor,
        user,

        isButtonResponse,
        buttonId
    };
};

module.exports = {
    standardizeJid,
    convertLidToJid,
    serializeMessage,
    downloadMediaMessage
};
