const { cmd } = require("../lib");
const { getGroupSetting, setGroupSetting } = require("../lib/database/groupSettings");

function _fallback() {
  const n = parseInt(process.env.WARN);
  return (!isNaN(n) && n > 0)? String(n) : "3";
}


cmd(
  {
    pattern: "antispam",
    react: "🌊",
    aliases: ["antiflood"],
    category: "protection",
    description: "Manage anti-flood/spam system",
  },
  async (from, sock, conText) => {
    const { q, isGroup, isAdmin, isSuperAdmin, isSuperUser, isBotAdmin, botPrefix, reply } = conText;

    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();

    // Admin sub-toggle: .antispam -admin on/off
    if (input.startsWith("-admin")) {
      const adminArg = input.replace("-admin", "").trim();
      const adminModeMap = { on: "on", true: "on", "1": "on", off: "off", false: "off", null: "off", "0": "off" };

      if (!adminArg) {
        const currentAdmin = await getGroupSetting(from, "ANTIFLOOD_ADMIN");
        const adminStatus = currentAdmin === "on" ? "ON" : "OFF";
        return await sock.sendMessage(from, {
          text: `🌊 *ANTI SPAM - ADMIN MODE*
📊 *CURRENT STATUS:* \`${adminStatus}\`

*USAGE:*
> *${botPrefix}antispam -admin on*
> *${botPrefix}antispam -admin off*

*INFO:*
> \`on\` *- Group admins will also be detected/actioned*
> \`off\` *- Group admins bypass (default)*`
        });
      }

      const adminMode = adminModeMap[adminArg];
      if (!adminMode) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID MODE*\n*USE:* `-admin on / off`" });

      await setGroupSetting(from, "ANTIFLOOD_ADMIN", adminMode);
      return await sock.sendMessage(from, {
        text: adminMode === "on"
          ? "✅ *ADMIN DETECTION ENABLED*\n*INFO:* Group admins will now be detected/actioned for flooding"
          : "✅ *ADMIN DETECTION DISABLED*\n*INFO:* Group admins will bypass (default)"
      });
    }

    // Limit sub-command: .antispam -limit 5
    if (input.startsWith("-limit")) {
      const val = parseInt(input.replace("-limit", "").trim());
      if (!val || val < 2) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID VALUE*\n*USE:* `-limit <number>` (min 2)" });
      await setGroupSetting(from, "ANTIFLOOD_LIMIT", String(val));
      return await sock.sendMessage(from, { text: `✅ *SPAM LIMIT SET*\n*INFO:* Max \`${val}\` messages allowed per window` });
    }

    // Window sub-command: .antispam -window 5  (seconds)
    if (input.startsWith("-window")) {
      const val = parseInt(input.replace("-window", "").trim());
      if (!val || val < 2) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID VALUE*\n*USE:* `-window <seconds>` (min 2)" });
      await setGroupSetting(from, "ANTIFLOOD_WINDOW", String(val));
      return await sock.sendMessage(from, { text: `✅ *SPAM WINDOW SET*\n*INFO:* Tracking window is now \`${val}s\`` });
    }

    const modeMap = {
      on: "delete", delete: "delete",
      warn: "warn", kick: "kick",
      null: "null", off: "off", false: "off",
    };

    if (!input) {
      const current = await getGroupSetting(from, "ANTIFLOOD");
      const currentAdmin = await getGroupSetting(from, "ANTIFLOOD_ADMIN");
      const limit = await getGroupSetting(from, "ANTIFLOOD_LIMIT") || "5";
      const window = await getGroupSetting(from, "ANTIFLOOD_WINDOW") || "5";
      const status = !current || current === "off" ? "OFF" : `ON - ${current.toUpperCase()}`;
      const adminStatus = currentAdmin === "on" ? "ON" : "OFF";
      return await sock.sendMessage(from, {
        text: `🌊 *ANTI SPAM / SPAM*
📊 *CURRENT STATUS:* \`${status}\`
📊 *ADMIN DETECTION:* \`${adminStatus}\`
📊 *LIMIT:* \`${limit} msgs / ${window}s\`

*USAGE:*
> *${botPrefix}antispam on - Delete flood messages*
> *${botPrefix}antispam warn - Warn users*
> *${botPrefix}antispam kick - Kick instantly*
> *${botPrefix}antispam null - Silent delete*
> *${botPrefix}antispam off - Disable*
> *${botPrefix}antispam -admin on/off - Include admins*
> *${botPrefix}antispam -limit <num> - Set message limit*
> *${botPrefix}antispam -window <sec> - Set time window*

*OPTIONS:*
> \`on/delete\` *- Auto delete flood messages*
> \`warn\` *- Warn user for spamming*
> \`kick\` *- Remove user instantly*
> \`null\` *- Silent delete, no warning message*
> \`off\` *- Disable protection*`
      });
    }

    const mode = modeMap[input];
    if (!mode) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID MODE*\n*USE:* `on / warn / kick / null / off`" });

    try {
      await setGroupSetting(from, "ANTIFLOOD", mode);

      if (mode === "off") {
        return await sock.sendMessage(from, { text: "✅ *ANTI SPAM DISABLED*\n*INFO:* Protection is now OFF" });
      }

      const messages = {
        delete: `✅ *ANTI SPAM ENABLED*\n*MODE:* \`DELETE\`\n*INFO:* Flood messages will be auto deleted`,
        warn: `✅ *ANTI SPAM ENABLED*\n*MODE:* \`WARN\`\n*INFO:* Users will be warned for spamming`,
        kick: `✅ *ANTI SPAM ENABLED*\n*MODE:* \`KICK\`\n*INFO:* Users removed for flooding`,
        null: `✅ *ANTI SPAM ENABLED*\n*MODE:* \`NULL\`\n*INFO:* Flood messages deleted silently`,
      };
      return await sock.sendMessage(from, { text: messages[mode] });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);
