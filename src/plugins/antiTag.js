const { cmd } = require("../lib");
const { getGroupSetting, setGroupSetting } = require("../lib/database/groupSettings");

function _fallback() {
  const n = parseInt(process.env.WARN);
  return (!isNaN(n) && n > 0)? String(n) : "3";
}

cmd(
  {
    pattern: "antitag",
    aliases: ["antimention", "antitagall", "antihidetag"],
    react: "🚫",
    category: "protection",
    description: "Block tagall / hidetag spam",
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
      const curr = await getGroupSetting(from, "ANTITAG");
      const status = !curr || curr === "off" ? "OFF" : `ON - ${curr.toUpperCase()}`;
      return sock.sendMessage(from, {
        text: `🚫 *ANTI TAG / MENTION*
📊 *CURRENT:* \`${status}\`

*USAGE:*
> *${botPrefix}antitag on* - Delete tag msgs
> *${botPrefix}antitag warn* - Warn user
> *${botPrefix}antitag kick* - Kick instantly
> *${botPrefix}antitag null* - Silent delete
> *${botPrefix}antitag off* - Disable

*DETECTS:*
> @all / @everyone / @members
> hidetag (mentions > 5)
> Tag spam`
      });
    }

    const mode = map[q.toLowerCase().trim()];
    if (!mode) return reply("🙅‍♂️ Use: `on / warn / kick / null / off`");

    await setGroupSetting(from, "ANTITAG", mode);
    if (mode === "off") return sock.sendMessage(from, { text: "✅ *ANTITAG DISABLED*" });

    const msgs = {
      delete: "✅ *ENABLED* MODE: `DELETE`\n> Tagall/Hidetag will be deleted",
      warn: "✅ *ENABLED* MODE: `WARN`\n> User warned for tagging",
      kick: "✅ *ENABLED* MODE: `KICK`\n> User kicked for mass tag",
      null: "✅ *ENABLED* MODE: `NULL`\n> Silent delete",
    };
    return sock.sendMessage(from, { text: msgs[mode] });
  }
);

cmd(
  {
    pattern: "antitagwarn",
    aliases: ["antitagcount", "atwarn"],
    react: "⚙️",
    category: "protection",
    description: "Set antitag warn limit",
  },
  async (from, sock, conText) => {
    const { q, isGroup, isAdmin, isSuperUser, botPrefix } = conText;
    if (!isGroup) return;
    if (!isAdmin && !isSuperUser) return;

    const curr = (await getGroupSetting(from, "ANTITAG_WARN_COUNT")) || _fallback();
    if (!q) return sock.sendMessage(from, { text: `⚙️ *ANTITAG WARN*\nCurrent: \`${curr}\`\nUsage: ${botPrefix}antitagwarn 3` });

    const n = parseInt(q);
    if (isNaN(n) || n < 1 || n > 10) return sock.sendMessage(from, { text: "Use 1-10" });
    await setGroupSetting(from, "ANTITAG_WARN_COUNT", n.toString());
    return sock.sendMessage(from, { text: `✅ Warn count set to ${n}` });
  }
);
