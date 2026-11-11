const { cmd } = require("../lib");
const { getGroupSetting, setGroupSetting } = require("../lib/database/groupSettings");

function _fallback() {
  const n = parseInt(process.env.WARN);
  return (!isNaN(n) && n > 0)? String(n) : "3";
}

cmd(
  {
    pattern: "antibot",
    aliases: ["antibots", "antibotprotection"],
    react: "🤖",
    category: "protection",
    description: "Block other bots in group",
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
      const curr = await getGroupSetting(from, "ANTIBOT");
      const status =!curr || curr === "off"? "OFF" : `ON - ${curr.toUpperCase()}`;
      return sock.sendMessage(from, {
        text: `🤖 *ANTI BOT SYSTEM*
📊 *CURRENT:* \`${status}\`

*USAGE:*
> *${botPrefix}antibot on* - Delete bot msgs
> *${botPrefix}antibot warn* - Warn bot owners
> *${botPrefix}antibot kick* - Kick bot instantly
> *${botPrefix}antibot null* - Silent delete
> *${botPrefix}antibot off* - Disable

*DETECTS:*
> Other MD bots
> Auto reply bots`
      });
    }

    const mode = map[q.toLowerCase().trim()];
    if (!mode) return reply("🙅‍♂️ Use: `on / warn / kick / null / off`");

    await setGroupSetting(from, "ANTIBOT", mode);
    if (mode === "off") return sock.sendMessage(from, { text: "✅ *ANTIBOT DISABLED*" });

    const msgs = {
      delete: "✅ *ANTIBOT ENABLED*\nMODE: `DELETE`\n> Other bot messages will be deleted",
      warn: "✅ *ANTIBOT ENABLED*\nMODE: `WARN`\n> Bot owners will be warned",
      kick: "✅ *ANTIBOT ENABLED*\nMODE: `KICK`\n> Bots will be kicked instantly",
      null: "✅ *ANTIBOT ENABLED*\nMODE: `NULL`\n> Silent delete",
    };
    return sock.sendMessage(from, { text: msgs[mode] });
  }
);

cmd(
  {
    pattern: "antibotwarn",
    aliases: ["abwarn"],
    react: "⚙️",
    category: "protection",
    description: "Set antibot warn limit",
  },
  async (from, sock, conText) => {
    const { q, isGroup, isAdmin, isSuperUser, botPrefix } = conText;
    if (!isGroup) return;
    if (!isAdmin &&!isSuperUser) return;

    const curr = (await getGroupSetting(from, "ANTIBOT_WARN_COUNT")) || _fallback();
    if (!q) return sock.sendMessage(from, { text: `⚙️ *ANTIBOT WARN*\nCurrent: \`${curr}\`\nUsage: ${botPrefix}antibotwarn 3` });

    const n = parseInt(q);
    if (isNaN(n) || n < 1 || n > 10) return sock.sendMessage(from, { text: "Use 1-10" });
    await setGroupSetting(from, "ANTIBOT_WARN_COUNT", n.toString());
    return sock.sendMessage(from, { text: `✅ Warn count set to ${n}` });
  }
);
