const { cmd } = require("../lib");
const {
  banUser, unbanUser, isUserBanned, getAllBannedUsers,
  banGroup, unbanGroup, isGroupBanned, getAllBannedGroups,
} = require("../lib/database/bans");
const { getLidMapping } = require("../lib/connection/groupCache");

async function _resolveJid(sock, jid) {
  if (!jid ||!jid.endsWith("@lid")) return jid;
  const cached = getLidMapping(jid);
  if (cached) return cached;
  try {
    const r = await sock.getJidFromLid(jid);
    if (r) return r;
  } catch (e) {}
  return jid;
}

function _normalizeUserJid(raw) {
  if (!raw) return null;
  raw = raw.trim();
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/[^0-9]/g, "");
  return digits? `${digits}@s.whatsapp.net` : null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BAN USER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "ban",
    react: "🚫",
    aliases: ["banuser"],
    category: "protection",
    description: "Ban a user from using the bot anywhere",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, mentionedJid, quotedUser, args, botPrefix } = conText;
    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

    let target = (mentionedJid && mentionedJid[0]) || quotedUser || _normalizeUserJid(args[0]);
    if (!target) {
      return await sock.sendMessage(from, {
        text: `🚫 *USER BAN*
*USAGE:*
> ${botPrefix}ban @user - Ban by mention
> ${botPrefix}ban - Reply + command
> ${botPrefix}ban 923001234567 - Ban by number
> ${botPrefix}ban 923001234567@s.whatsapp.net reason - Ban with reason

*INFO:* Bans user from using any bot commands`
      });
    }

    target = await _resolveJid(sock, target);
    const senderNum = target.split("@")[0];
    const reason = args.filter(a =>!a.startsWith("@") &&!a.includes(senderNum)).join(" ").trim() || "No reason provided";

    if (await isUserBanned(target)) return await sock.sendMessage(from, { text: `⚠️ *ALREADY BANNED*\n*USER:* @${senderNum}`, mentions: [target] });

    try {
      await banUser(target, reason);
      await sock.sendMessage(from, {
        text: `🚫 *USER BANNED*\n📊 *USER:* @${senderNum}\n📝 *REASON:* ${reason}\n*INFO:* This user can no longer use any bot commands.`,
        mentions: [target],
      });
    } catch (e) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

cmd(
  {
    pattern: "unban",
    react: "✅",
    aliases: ["unbanuser"],
    category: "protection",
    description: "Unban a user",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, mentionedJid, quotedUser, args, botPrefix } = conText;
    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

    let target = (mentionedJid && mentionedJid[0]) || quotedUser || _normalizeUserJid(args[0]);
    if (!target) {
      return await sock.sendMessage(from, { text: `✅ *UNBAN* \n*USAGE:*.${botPrefix}unban @user` });
    }

    target = await _resolveJid(sock, target);
    const senderNum = target.split("@")[0];

    const wasBanned = await isUserBanned(target);
    if (!wasBanned) return await sock.sendMessage(from, { text: `⚠️ *NOT BANNED*\n*USER:* @${senderNum} is not banned.`, mentions: [target] });

    try {
      await unbanUser(target);
      await sock.sendMessage(from, {
        text: `✅ *USER UNBANNED*\n📊 *USER:* @${senderNum}\n*INFO:* This user can use the bot again.`,
        mentions: [target],
      });
    } catch (e) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BAN GROUP
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "bangroup",
    react: "🚫",
    aliases: ["bangc", "banthisgroup"],
    category: "protection",
    description: "Ban a group — bot stops working there entirely",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, isGroup, args, botPrefix } = conText;
    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

    const jidArg = args.find(a => a.endsWith("@g.us"));
    const target = jidArg || (isGroup? from : null);

    if (!target) {
      return await sock.sendMessage(from, {
        text: `🚫 *BAN GROUP*
*USAGE:*
> ${botPrefix}bangroup - Ban current group
> ${botPrefix}bangroup 1203xxxx@g.us reason - Ban specific group`
      });
    }

    if (await isGroupBanned(target)) return await sock.sendMessage(from, { text: "⚠️ *ALREADY BANNED*\n*INFO:* This group is already banned." });

    const reason = args.filter(a => a!== jidArg).join(" ").trim() || "No reason provided";

    try {
      await banGroup(target, reason);
      await sock.sendMessage(target, {
        text: `🚫 *GROUP BANNED*\n📝 *REASON:* ${reason}\n*INFO:* The bot will no longer respond in this group except for owner/sudo.`,
      });
      if (target!== from) await sock.sendMessage(from, { text: `✅ *SUCCESS*\n*GROUP:* ${target} has been banned.` });
    } catch (e) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

cmd(
  {
    pattern: "unbangroup",
    react: "✅",
    aliases: ["unbangc"],
    category: "protection",
    description: "Unban a group",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, isGroup, args, botPrefix } = conText;
    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

    const jidArg = args.find(a => a.endsWith("@g.us"));
    const target = jidArg || (isGroup? from : null);

    if (!target) {
      return await sock.sendMessage(from, {
        text: `✅ *UNBAN GROUP*
*USAGE:*
> ${botPrefix}unbangroup - Unban current group
> ${botPrefix}unbangroup 1203xxxx@g.us - Unban specific group`
      });
    }

    if (!(await isGroupBanned(target))) return await sock.sendMessage(from, { text: "⚠️ *NOT BANNED*\n*INFO:* This group is not banned." });

    try {
      await unbanGroup(target);
      await sock.sendMessage(target, { text: "✅ *GROUP UNBANNED*\n*INFO:* The bot is active again in this group." });
      if (target!== from) await sock.sendMessage(from, { text: `✅ *SUCCESS*\n*GROUP:* ${target} has been unbanned.` });
    } catch (e) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET BAN LIST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "getban",
    react: "📋",
    aliases: ["banlist", "listbans"],
    category: "protection",
    description: "List all banned users and groups",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser } = conText;
    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

    try {
      const [users, groups] = await Promise.all([getAllBannedUsers(), getAllBannedGroups()]);

      const userLines = users.length
       ? users.map((u, i) => `${i + 1}. @${u.jid.split("@")[0]} — ${u.reason || "No reason"}`).join("\n")
        : "_None_";

      const groupLines = groups.length
       ? groups.map((g, i) => `${i + 1}. ${g.jid} — ${g.reason || "No reason"}`).join("\n")
        : "_None_";

      const allMentions = users.map(u => u.jid);

      await sock.sendMessage(from, {
        text: `📋 *BAN LIST*
📊 *TOTAL:* ${users.length} Users | ${groups.length} Groups

🚫 *BANNED USERS (${users.length}):*
${userLines}

🚫 *BANNED GROUPS (${groups.length}):*
${groupLines}`,
        mentions: allMentions,
      });
    } catch (e) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);
