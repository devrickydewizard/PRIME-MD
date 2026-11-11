const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { cmd } = require("../lib");

const MIME = {
  vn: 'audio/mpeg',
  vid: 'video/mp4',
  img: 'image/jpeg',
};

const TYPE_MAP = {
  audioMessage: 'vn',
  videoMessage: 'vid',
  imageMessage: 'img',
  documentMessage: 'doc',
  extendedTextMessage: 'txt',
  conversation: 'txt',
};

// ── Unwrap ephemeral/view-once/document-with-caption wrappers ──────────────
function getRealMessage(message) {
  if (!message) return null;
  if (message.ephemeralMessage) return getRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return getRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return getRealMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension) return getRealMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage) return getRealMessage(message.documentWithCaptionMessage.message);
  return message;
}

function randomDelayMs(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Resolve a usable JID from a participant object (handles both string & object shapes) ──
function getParticipantJid(p) {
  if (!p) return null;
  if (typeof p === 'string') return p;
  return p.id || p.jid || p.pn || p.phoneNumber || null;
}

// ── Discover every group the bot is currently participating in ─────────────
async function fetchAllParticipatingGroups(sock) {
  let allGroups = {};

  try {
    const { groupCache } = require("../lib/connection/groupCache");
    if (groupCache) {
      if (typeof groupCache.keys === 'function') {
        for (const key of groupCache.keys()) {
          if (key.endsWith('@g.us')) allGroups[key] = groupCache.get(key) || { id: key };
        }
      } else if (typeof groupCache === 'object') {
        for (const key in groupCache) {
          if (key.endsWith('@g.us')) allGroups[key] = groupCache[key] || { id: key };
        }
      }
    }
  } catch (e) {
    console.error('[BROADCAST] Failed to load groupCache:', e.message);
  }

  try {
    const fetched = await sock.groupFetchAllParticipating();
    if (fetched) allGroups = { ...allGroups, ...fetched };
  } catch (err) {
    console.error('[BROADCAST] groupFetchAllParticipating failed:', err.message);
  }

  if (Object.keys(allGroups).length === 0 && sock.chats) {
    for (const key of Object.keys(sock.chats)) {
      if (key.endsWith('@g.us')) allGroups[key] = sock.chats[key] || { id: key };
    }
  }

  return allGroups;
}

// ── Build the message payload once (download media, apply size/document fallback) ──
async function buildBroadcastPayload({ realQuoted, mtype, type, captionText, MAX_MEDIA_SIZE }) {
  const doc = {};

  if (type === 'txt') {
    doc.text = captionText || '(empty)';
    return doc;
  }

  const contextInfo = {};
  const mediaMsg = { message: { [mtype]: realQuoted[mtype] } };

  let buffer = await downloadMediaMessage(
    mediaMsg,
    'buffer',
    {},
    { logger: console }
  );

  if (!buffer || buffer.length === 0) {
    throw new Error('Downloaded media is empty');
  }

  if (type === 'vn') {
    doc.audio = buffer;
    doc.mimetype = MIME.vn;
    doc.ptt = !!realQuoted.audioMessage?.ptt;
  } else if (type === 'vid') {
    if (MAX_MEDIA_SIZE && buffer.length > MAX_MEDIA_SIZE) {
      doc.document = buffer;
      doc.mimetype = 'video/mp4';
      doc.fileName = 'broadcast_video.mp4';
      if (captionText) doc.caption = captionText;
    } else {
      doc.video = buffer;
      doc.mimetype = MIME.vid;
      if (captionText) doc.caption = captionText;
    }
  } else if (type === 'img') {
    if (MAX_MEDIA_SIZE && buffer.length > MAX_MEDIA_SIZE) {
      doc.document = buffer;
      doc.mimetype = 'image/jpeg';
      doc.fileName = 'broadcast_image.jpg';
      if (captionText) doc.caption = captionText;
    } else {
      doc.image = buffer;
      doc.mimetype = MIME.img;
      if (captionText) doc.caption = captionText;
    }
  } else if (type === 'doc') {
    doc.document = buffer;
    doc.mimetype = realQuoted.documentMessage?.mimetype || 'application/octet-stream';
    doc.fileName = realQuoted.documentMessage?.fileName || 'file';
    if (captionText) doc.caption = captionText;
  }

  return doc;
}

const HELP_TEXT = (botPrefix, cmdName) =>
`📢 *${cmdName.toUpperCase()}*
🙅‍♂️ *NO MEDIA/TEXT PROVIDED*

*USAGE:*
> ${botPrefix}${cmdName} Hello everyone!
> ${botPrefix}${cmdName} - (reply to an image/video/audio/document)*

*INFO:*
> Sends to every group the bot is currently in
> Supports: text, image, video, audio, document
> A safe randomized delay is used between groups`;

let broadcastRunning = false;

async function runBroadcast({ from, sock, conText, isSmart }) {
  const { q, reply, react, isSuperUser, mek, quotedMsg, botPrefix, MAX_MEDIA_SIZE } = conText;
  const cmdName = isSmart ? 'smartbroadcast' : 'broadcast';

  if (!isSuperUser) {
    await react("🙅‍♂️");
    return reply("*This area is reserved for the bot owner only.* 🕷️");
  }

  if (broadcastRunning) {
    await react("⏳");
    return reply("⏳ *BROADCAST IN PROGRESS*\n*INFO:* Wait for the current broadcast to finish before starting a new one.");
  }

  const realQuoted = quotedMsg ? getRealMessage(quotedMsg) : null;
  const mtype = realQuoted ? Object.keys(realQuoted).find((k) => TYPE_MAP[k]) : null;
  const type = realQuoted ? TYPE_MAP[mtype] : 'txt';

  if (!realQuoted && !q) {
    await react("🙅‍♂️");
    return reply(HELP_TEXT(botPrefix, cmdName));
  }

  if (realQuoted && !type) {
    await react("🙅‍♂️");
    return reply("🙅‍♂️ *INVALID MEDIA*\n*INFO:* Unsupported message type replied to.");
  }

  let captionText = '';
  if (realQuoted) {
    captionText = q || realQuoted.conversation ||
      realQuoted.extendedTextMessage?.text ||
      realQuoted[mtype]?.caption ||
      '';
  } else {
    captionText = q;
  }

  let basePayload;
  try {
    await react("⏳");
    basePayload = await buildBroadcastPayload({ realQuoted, mtype, type, captionText, MAX_MEDIA_SIZE });
  } catch (err) {
    console.error(`[${cmdName.toUpperCase()}] Failed to prepare payload:`, err);
    await react("🙅‍♂️");
    return reply(`🙅‍♂️ *ERROR:* Failed to prepare content for broadcast.\n*INFO:* ${err.message}`);
  }

  let allGroups;
  try {
    allGroups = await fetchAllParticipatingGroups(sock);
  } catch (err) {
    await react("🙅‍♂️");
    return reply(`🙅‍♂️ *ERROR:* Failed to fetch group list.\n*INFO:* ${err.message}`);
  }

  const groupIds = Object.keys(allGroups || {}).filter((jid) => jid.endsWith('@g.us'));

  if (!groupIds.length) {
    await react("🙅‍♂️");
    return reply("🙅‍♂️ *NO GROUPS*\n*INFO:* Bot is not in any groups, or the group list hasn't finished syncing yet. Try again shortly.");
  }

  broadcastRunning = true;
  await react("📢");
  await reply(
`*– ( BROADCAST )*
──────────────𔓕
> 📊 *Target:* \`${groupIds.length}\` *group(s)*
> ⏱️ *Estimated:* ~${Math.ceil((groupIds.length * 6.5) / 60)} minute(s)
> \`Please wait...\``
  );
  

  let sent = 0;
  let failed = 0;
  const failedGroups = [];
  const startedAt = Date.now();

  try {
    for (let idx = 0; idx < groupIds.length; idx++) {
      const gid = groupIds[idx];
      const groupLabel = allGroups[gid]?.subject || gid;

      try {
        const payload = { ...basePayload };

        if (isSmart) {
          let participants = allGroups[gid]?.participants;
          if (!participants || !participants.length) {
            try {
              const meta = await sock.groupMetadata(gid);
              participants = meta?.participants || [];
            } catch (metaErr) {
              participants = [];
            }
          }
          const mentionJids = participants.map(getParticipantJid).filter(Boolean);
          if (mentionJids.length) payload.mentions = mentionJids;
        }

        await sock.sendMessage(gid, payload);
        sent++;
      } catch (sendErr) {
        console.error(`[${cmdName.toUpperCase()}] Failed for "${groupLabel}" (${gid}):`, sendErr.message);
        failed++;
        failedGroups.push({ label: groupLabel, reason: sendErr.message });
      }

      const isLast = idx === groupIds.length - 1;
      if (isLast) break;

      if ((idx + 1) % 5 === 0) {
        await sleep(randomDelayMs(20000, 35000));
      } else {
        await sleep(randomDelayMs(4000, 9000));
      }
    }
  } finally {
    broadcastRunning = false;
  }

  const totalElapsed = Math.round((Date.now() - startedAt) / 1000);

  let summary = `*– ( BROADCAST )*
──────────────𔓕
> 📊 *Sent:* ${sent}/${groupIds.length}
> 🙅‍♂️ *Failed:* ${failed}
> ⏱️ *Elapsed:* ${totalElapsed}s`;

  await react("✅");
  return reply(summary);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BROADCAST — send to all groups
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "broadcast",
    aliases: ["broadc", "broadcastall"],
    react: "📢",
    category: "utility",
    description: "Broadcast text/image/video/audio/document to all groups (owner only)",
  },
  async (from, sock, conText) => {
    return runBroadcast({ from, sock, conText, isSmart: false });
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SMARTBROADCAST — same, with silent tag-all per group
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "smartbroadcast",
    aliases: ["sbc", "tagbroadcast"],
    react: "📢",
    category: "utility",
    description: "Broadcast text/image/video/audio/document to all groups with a silent tag-all (owner only)",
  },
  async (from, sock, conText) => {
    return runBroadcast({ from, sock, conText, isSmart: true });
  }
);
