const { cmd } = require("../lib");
const { getGroupSetting, setGroupSetting } = require("../lib/database/groupSettings");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANTI GROUP STATUS (Green Ring Icon)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
  {
    pattern: "antigroupstatus",
    react: "🛡️",
    aliases: ["antigstatus", "ags", "antigroupicon", "antistatusicon"],
    category: "protection",
    description: "Manage anti-group-status system (green ring)",
  },
  async (from, sock, conText) => {
    const { q, isGroup, isAdmin, isSuperAdmin, isSuperUser, isBotAdmin, botPrefix, reply } = conText;

    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();

    // Admin sub-toggle: .antigroupstatus -admin on/off
    if (input.startsWith("-admin")) {
      const adminArg = input.replace("-admin", "").trim();
      const adminModeMap = { on: "on", true: "on", "1": "on", off: "off", false: "off", null: "off", "0": "off" };

      if (!adminArg) {
        const currentAdmin = await getGroupSetting(from, "ANTIGROUPSTATUS_ADMIN");
        const adminStatus = currentAdmin === "on" ? "ON" : "OFF";
        return await sock.sendMessage(from, {
          text: `🛡️ *ANTI GROUP STATUS - ADMIN MODE*
📊 *CURRENT STATUS:* \`${adminStatus}\`

*USAGE:*
> *${botPrefix}antigroupstatus -admin on*
> *${botPrefix}antigroupstatus -admin off*

*INFO:*
> \`on\` *- Group admins will also be detected/actioned*
> \`off\` *- Group admins bypass (default)*`
        });
      }

      const adminMode = adminModeMap[adminArg];
      if (!adminMode) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID MODE*\n*USE:* `-admin on / off`" });

      await setGroupSetting(from, "ANTIGROUPSTATUS_ADMIN", adminMode);
      return await sock.sendMessage(from, {
        text: adminMode === "on"
          ? "✅ *ADMIN DETECTION ENABLED*\n*INFO:* Group admins will now be detected/actioned on status change"
          : "✅ *ADMIN DETECTION DISABLED*\n*INFO:* Group admins will bypass (default)"
      });
    }

    const modeMap = {
      on: "warn", delete: "delete",
      warn: "warn", kick: "kick",
      null: "null", off: "off", false: "off",
    };

    if (!input) {
      const current = await getGroupSetting(from, "ANTIGROUPSTATUS");
      const currentAdmin = await getGroupSetting(from, "ANTIGROUPSTATUS_ADMIN");
      const status = !current || current === "off" ? "OFF" : `ON - ${current.toUpperCase()}`;
      const adminStatus = currentAdmin === "on" ? "ON" : "OFF";
      return await sock.sendMessage(from, {
        text: `🛡️ *ANTI GROUP STATUS ICON*
📊 *CURRENT STATUS:* \`${status}\`
📊 *ADMIN DETECTION:* \`${adminStatus}\`

*USAGE:*
> *${botPrefix}antigroupstatus on - Delete status*
> *${botPrefix}antigroupstatus warn - Warn users*
> *${botPrefix}antigroupstatus kick - Kick instantly*
> *${botPrefix}antigroupstatus null - Silent delete*
> *${botPrefix}antigroupstatus off - Disable*
> *${botPrefix}antigroupstatus -admin on/off - Include admins*

*OPTIONS:*
> \`on/delete\` *- Auto delete group icon changes (green ring)*
> \`warn\` *- Warn user for changing group status*
> \`kick\` *- Remove user instantly*
> \`null\` *- Silent delete, no warning message*
> \`off\` *- Disable protection*`
      });
    }

    const mode = modeMap[input];
    if (!mode) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID MODE*\n*USE:* `on / warn / kick / null / off`" });

    try {
      await setGroupSetting(from, "ANTIGROUPSTATUS", mode);

      if (mode === "off") {
        return await sock.sendMessage(from, { text: "✅ *ANTI GROUP STATUS DISABLED*\n*INFO:* Protection is now OFF" });
      }

      const messages = {
        delete: `✅ *ANTI GROUP STATUS ENABLED*\n*MODE:* \`DELETE\`\n*INFO:* Group icon status will be auto deleted`,
        warn: `✅ *ANTI GROUP STATUS ENABLED*\n*MODE:* \`WARN\`\n*INFO:* Users will be warned for changing group icon`,
        kick: `✅ *ANTI GROUP STATUS ENABLED*\n*MODE:* \`KICK\`\n*INFO:* Users removed for putting status on group icon`,
        null: `✅ *ANTI GROUP STATUS ENABLED*\n*MODE:* \`NULL\`\n*INFO:* Status deleted silently`,
      };
      return await sock.sendMessage(from, { text: messages[mode] });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);
