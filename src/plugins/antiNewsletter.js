const { cmd } = require("../lib");
const { getGroupSetting, setGroupSetting } = require("../lib/database/groupSettings");

function _envFallback() {
  const n = parseInt(process.env.WARN);
  return (!isNaN(n) && n > 0)? String(n) : "3";
}

cmd(
  {
    pattern: "antinewsletter",
    aliases: ["antichannel", "antinc", "anl"],
    react: "🛡️",
    category: "protection",
    description: "Block newsletter/channel forwarded messages",
  },
  async (from, sock, conText) => {
    const { q, isGroup, isAdmin, isSuperAdmin, isSuperUser, isBotAdmin, botPrefix, reply } = conText;

    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");
    
    const map = {
      on: "delete", delete: "delete",
      warn: "warn", kick: "kick",
      null: "null", off: "off", false: "off",
    };

    if (!q) {
      const curr = await getGroupSetting(from, "ANTINEWSLETTER");
      const status =!curr || curr === "off"? "OFF" : `ON - ${curr.toUpperCase()}`;
      return await sock.sendMessage(from, {
        text: `🛡️ *ANTI NEWSLETTER / CHANNEL*
📊 *CURRENT:* \`${status}\`

*USAGE:*
> *${botPrefix}antinewsletter on* - Delete only
> *${botPrefix}antinewsletter warn* - Warn + Delete
> *${botPrefix}antinewsletter kick* - Kick instantly
> *${botPrefix}antinewsletter null* - Silent delete
> *${botPrefix}antinewsletter off* - Disable

*Detects:*
> Newsletter / Channel forwarded msgs
> 120...@newsletter jid
> contextInfo forwarded from channel`
      });
    }

    const mode = map[q.toLowerCase().trim()];
    if (!mode) return reply("🙅‍♂️ Invalid mode! Use: `on / warn / kick / null / off`");

    await setGroupSetting(from, "ANTINEWSLETTER", mode);
    if (mode === "off") return sock.sendMessage(from, { text: "✅ *ANTI NEWSLETTER OFF*" });

    const msgs = {
      delete: "✅ *ENABLED* MODE: `DELETE`\n> Channel/Newsletter msgs will be deleted",
      warn: "✅ *ENABLED* MODE: `WARN`\n> User will get warning",
      kick: "✅ *ENABLED* MODE: `KICK`\n> User kicked for sending newsletter",
      null: "✅ *ENABLED* MODE: `NULL`\n> Silent delete",
    };
    return sock.sendMessage(from, { text: msgs[mode] });
  }
);

// Warn Count
cmd(
  {
    pattern: "antinewsletterwarn",
    aliases: ["antincwarn", "anlwarn"],
    react: "⚙️",
    category: "protection",
    description: "Set anti-newsletter warn limit",
  },
  async (from, sock, conText) => {
    const { q, isGroup, isAdmin, isSuperUser, botPrefix } = conText;
    if (!isGroup) return;
    if (!isAdmin &&!isSuperUser) return;

    const curr = (await getGroupSetting(from, "ANTINEWSLETTER_WARN_COUNT")) || _envFallback();
    if (!q) {
      return sock.sendMessage(from, { text: `⚙️ *ANTI NEWSLETTER WARN*\nCurrent: \`${curr}\`\nUsage: ${botPrefix}antinewsletterwarn 3` });
    }
    const n = parseInt(q);
    if (isNaN(n) || n < 1 || n > 10) return sock.sendMessage(from, { text: "Use number 1-10" });
    await setGroupSetting(from, "ANTINEWSLETTER_WARN_COUNT", n.toString());
    return sock.sendMessage(from, { text: `✅ Warn count set to ${n}` });
  }
);
