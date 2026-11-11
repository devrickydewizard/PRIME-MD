const { cmd } = require("../lib");
const { getGroupSetting, setGroupSetting } = require("../lib/database/groupSettings");

function _envWarnFallback() {
  const envLimit = parseInt(process.env.WARN);
  return (!isNaN(envLimit) && envLimit > 0)? String(envLimit) : "3";
}

cmd(
  {
    pattern: "antiporn",
    react: "🔞",
    aliases: ["antinudity", "pornblock", "nsfwblock"],
    category: "protection",
    description: "Detect and remove explicit images/videos/stickers",
  },
  async (from, sock, conText) => {
    const { q, reply, isGroup, isAdmin, isSuperUser, isSuperAdmin, isBotAdmin, botPrefix } = conText;

    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();
    const modeMap = {
      on: "delete", delete: "delete",
      warn: "warn", kick: "kick",
      null: "null", off: "off", false: "off",
    };

    if (!input) {
      const current = await getGroupSetting(from, "ANTIPORN");
      const status =!current || current === "off"? "OFF" : `ON - ${current.toUpperCase()}`;
      const threshold = (await getGroupSetting(from, "ANTIPORN_THRESHOLD")) || "0.5";
      const hasCreds =!!(process.env.SIGHTENGINE_USER && process.env.SIGHTENGINE_SECRET);

      return await sock.sendMessage(from, {
        text: `🔞 *ANTI PORN PROTECTION*
📊 *CURRENT STATUS:* \`${status}\`
🎯 *SENSITIVITY:* \`${threshold}\`
🔑 *API STATUS:* \`${hasCreds? "CONFIGURED" : "NOT SET"}\`

*USAGE:*
> *${botPrefix}antiporn on - Delete explicit media*
> *${botPrefix}antiporn warn - Warn then kick*
> *${botPrefix}antiporn kick - Kick instantly
> *${botPrefix}antiporn null - Silent delete*
> *${botPrefix}antiporn off - Disable protection*

*OPTIONS:*
> \`on/delete\` *- Auto delete explicit images/videos/stickers*
> \`warn\` *- Warn user before kicking*
> \`kick\` *- Remove user instantly*
> \`null\` *- Silent delete, no warning*
> \`off\` *- Disable protection*

*SETTINGS:*
> \`antipornsensitivity 0.1-0.9\` *- Detection strictness*
> \`antipornwarn 1-10\` *- Warnings before kick*`
      });
    }

    if (modeMap[input] === undefined) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID MODE*\n*USE:* `on / warn / kick / null / off`" });

    const mode = modeMap[input];

    if (["delete", "warn", "kick"].includes(mode)) {
      if (!process.env.SIGHTENGINE_USER ||!process.env.SIGHTENGINE_SECRET) {
        return await sock.sendMessage(from, { text: "🙅‍♂️ *API NOT CONFIGURED*\n*INFO:* Set SIGHTENGINE_USER and SIGHTENGINE_SECRET first" });
      }
    }

    try {
      const current = await getGroupSetting(from, "ANTIPORN");
      if (current === mode) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*STATUS:* Anti-Porn is already ${mode === "off"? "OFF" : mode.toUpperCase()}` });

      await setGroupSetting(from, "ANTIPORN", mode);

      if (mode === "off") {
        return await sock.sendMessage(from, { text: "✅ *ANTI PORN DISABLED*\n*INFO:* Protection is now OFF" });
      }

      const messages = {
        delete: `✅ *ANTI PORN ENABLED*\n*MODE:* \`DELETE\`\n*INFO:* Explicit media will be auto deleted`,
        warn: `✅ *ANTI PORN ENABLED*\n*MODE:* \`WARN\`\n*INFO:* Users warned before kick`,
        kick: `✅ *ANTI PORN ENABLED*\n*MODE:* \`KICK\`\n*INFO:* Users removed instantly`,
        null: `✅ *ANTI PORN ENABLED*\n*MODE:* \`NULL\`\n*INFO:* Explicit media deleted silently`,
      };
      return await sock.sendMessage(from, { text: messages[mode] });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

cmd(
  {
    pattern: "antipornwarn",
    aliases: ["pornwarncount", "antipornwarncount"],
    react: "⚙️",
    category: "protection",
    description: "Set anti-porn warning count before kick",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, isGroup, isAdmin, isBotAdmin, isSuperAdmin, botPrefix } = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    const current = (await getGroupSetting(from, "ANTIPORN_WARN_COUNT")) || _envWarnFallback();

    if (!q) {
      return await sock.sendMessage(from, {
        text: `⚙️ *ANTI PORN WARN COUNT*
📊 *CURRENT VALUE:* \`${current}\`

*USAGE:*
> *${botPrefix}antipornwarn 3

*INFO:*
> \`1-10\` *- Number of warnings before kick*`
      });
    }

    const count = parseInt(q);
    if (isNaN(count) || count < 1 || count > 10) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID NUMBER*\n*USE:* Number between 1-10" });
    if (current === count.toString()) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*COUNT:* Warn count is already ${count}` });

    try {
      await setGroupSetting(from, "ANTIPORN_WARN_COUNT", count.toString());
      return await sock.sendMessage(from, { text: `✅ *WARN COUNT UPDATED*\n*COUNT:* \`${count}\`\n*INFO:* Users will be kicked after ${count} warnings` });
    } catch (error) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
    }
  }
);

cmd(
  {
    pattern: "antipornsensitivity",
    aliases: ["pornthreshold", "antipornthreshold"],
    react: "🎯",
    category: "protection",
    description: "Set anti-porn detection sensitivity (0.1 - 0.9)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, isGroup, isAdmin, isSuperAdmin, botPrefix } = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const current = (await getGroupSetting(from, "ANTIPORN_THRESHOLD")) || "0.5";

    if (!q) {
      return await sock.sendMessage(from, {
        text: `🎯 *ANTI PORN SENSITIVITY*
📊 *CURRENT VALUE:* \`${current}\`

*USAGE:*
> *${botPrefix}antipornsensitivity 0.5*

*INFO:*
> \`0.1\` *- Very strict detection*
> \`0.9\` *- Very lenient detection*`
      });
    }

    const value = parseFloat(q);
    if (isNaN(value) || value < 0.1 || value > 0.9) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID VALUE*\n*USE:* Number between 0.1 and 0.9" });

    try {
      await setGroupSetting(from, "ANTIPORN_THRESHOLD", value.toString());
      return await sock.sendMessage(from, { text: `✅ *SENSITIVITY UPDATED*\n*VALUE:* \`${value}\`\n*INFO:* Detection level changed successfully` });
    } catch (error) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
    }
  }
);
