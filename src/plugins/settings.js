const { cmd, commands } = require("../lib/Cmds");
const {
  getSetting,
  setSetting,
  getAllSettings,
  resetSetting,
  resetAllSettings,
} = require("../lib/database/settings");
const {
  getGroupSetting,
  setGroupSetting,
  getEnabledGroupSettings,
  resetAllGroupSettings,
  getAllGroupSettings,
} = require("../lib/database/groupSettings");
const { getSudoNumbers, clearAllSudo } = require("../lib/database/sudo");
const {
  getAllUsersNotes,
  deleteNoteById,
  updateNoteById,
  deleteAllNotes,
  NotesDB,
} = require("../lib/database/notes");

function parseBooleanInput(input) {
  if (!input) return null;
  const val = input.toLowerCase().trim();
  if (val === "on") return "true";
  if (val === "off") return "false";
  return val;
}

function formatBoolDisplay(val) {
  return val === "true" ? "ENABLED" : "DISABLED";
}

function isSettingEnabled(val) {
  if (!val) return false;
  const v = String(val).toLowerCase().trim();
  return (
    v === "true" ||
    v === "on" ||
    v === "1" ||
    v === "yes" ||
    v === "warn" ||
    v === "kick" ||
    v === "delete"
  );
}

async function formatGroupsWithNames(jids, sock) {
  if (!jids || jids.length === 0) return "> None";
  const groupInfos = await Promise.all(
    jids.map(async (jid) => {
      try {
        const metadata = await sock.groupMetadata(jid);
        const name = metadata?.subject || "Unknown";
        return `> • ${name}`;
      } catch (e) {
        return `> • ${jid}`;
      }
    }),
  );
  return groupInfos.join("\n");
}

// ━━━━━━━━━━━━━━━
// VIEW ALL BOT SETTINGS - OWNER ONLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "settings",
    aliases: ["botsettings", "setting", "botsetting", "allsettings"],
    react: "⚙️",
    category: "owner",
    description: "View all bot settings",
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    try {
      const settings = await getAllSettings();
      const sudoList = await getSudoNumbers();
      const enabledGroupSettings = await getEnabledGroupSettings();

      let msg = `⚙️ *BOT SETTINGS*\n\n`;

      const keys = Object.keys(settings).sort();
      for (const key of keys) {
        const val = settings[key] || "Not Set";
        const displayVal = val.length > 40 ? val.substring(0, 40) + "..." : val;
        msg += `> \`${key}:\` ${displayVal}\n`;
      }

      msg += `> \`SUDO_USERS:\` ${sudoList.length > 0 ? sudoList.join(", ") : "None"}\n`;

      msg += `\n📋 *GROUP SETTINGS*\n\n`;

      const [
        welcomeGroups,
        goodbyeGroups,
        eventsGroups,
        antilinkGroups,
        antibadGroups,
        antigroupmentionGroups,
      ] = await Promise.all([
        formatGroupsWithNames(enabledGroupSettings.WELCOME_MESSAGE, sock),
        formatGroupsWithNames(enabledGroupSettings.GOODBYE_MESSAGE, sock),
        formatGroupsWithNames(enabledGroupSettings.GROUP_EVENTS, sock),
        formatGroupsWithNames(enabledGroupSettings.ANTILINK, sock),
        formatGroupsWithNames(enabledGroupSettings.ANTIBAD, sock),
        formatGroupsWithNames(enabledGroupSettings.ANTIGROUPMENTION, sock),
      ]);

      msg += `🎉 *WELCOME MESSAGE:*\n${welcomeGroups}\n\n`;
      msg += `👋 *GOODBYE MESSAGE:*\n${goodbyeGroups}\n\n`;
      msg += `📢 *GROUP EVENTS:*\n${eventsGroups}\n\n`;
      msg += `🔗 *ANTILINK:*\n${antilinkGroups}\n\n`;
      msg += `🚫 *ANTIBAD:*\n${antibadGroups}\n\n`;
      msg += `🛡️ *ANTI-GROUP-MENTION:*\n${antigroupmentionGroups}`;

      await reply(msg);
    } catch (error) {
      console.error("settings error:", error);
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━
// EVENT REACT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "eventreact",
    aliases: ["eventreacts", "ereact"],
    react: "📸",
    category: "owner",
    description: "Toggle or set emoji for group events react",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const currentStatus = (await getSetting("EVENT_REACT")) || "off";
    const currentEmoji = (await getSetting("EVENT_REACT_EMOJI")) || "📸";
    const input = (q || "").trim();

    if (!input) {
      return reply(
`📸 *EVENT REACT SETTINGS*
📊 *STATUS:* \`${currentStatus.toUpperCase()}\`
📊 *EMOJI:* \`${currentEmoji}\`

*USAGE:*
> ${botPrefix}eventreact on - Enable react on events
> ${botPrefix}eventreact off - Disable react
> ${botPrefix}eventreact 👀 - Set single emoji
> ${botPrefix}eventreact 🎀,🌸 - Set multiple random emojis*

*INFO:*
> \`on/off\` *- Toggle event react*
> \`emoji\` *- Set single or comma separated emojis*
> Events = Join, Leave, Name change, Admin etc.`
      );
    }

    const lower = input.toLowerCase();

    try {
      if (lower === "on" || lower === "off") {
        if (currentStatus === lower) return reply(`⚠️ *ALREADY SET*\n*STATUS:* Event React is already ${lower.toUpperCase()}`);
        await setSetting("EVENT_REACT", lower);
        return reply(`✅ *EVENT REACT ${lower.toUpperCase()}*\n*INFO:* Event reactions turned ${lower.toUpperCase()}`);
      }

      await setSetting("EVENT_REACT_EMOJI", input);
      return reply(`✅ *EMOJI UPDATED*\n*EMOJI:* \`${input}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET PREFIX
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setprefix",
    aliases: ["prefix", "botprefix", "changeprefix", "mprefix"],
    react: "⚙️",
    category: "owner",
    description: "Set bot prefix. Single | Emoji | null | Multiple",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const rawCurrent = (await getSetting("PREFIX")) ?? ".";
    const currentShow = rawCurrent === "" ? "No Prefix" : `\`${rawCurrent}\``;
    const input = (q || "").trim();

    if (!input) {
      return reply(
`⚙️ *PREFIX SETTINGS*
📊 *CURRENT:* ${currentShow}

*USAGE:*
> ${botPrefix}setprefix ! - Set single prefix
> ${botPrefix}setprefix 🍉 - Set emoji prefix
> ${botPrefix}setprefix null - Remove prefix
> ${botPrefix}setprefix . , ! ? - - Set multiple prefixes*

*INFO:*
> Multiple prefixes separated by space, max 5
> Regex format used internally: \`^[.,!,?,-]\``
      );
    }

    if (input.toLowerCase() === "null" || input.toLowerCase() === "off") {
      try {
        if (rawCurrent === "") return reply(`⚠️ *ALREADY SET*\n*STATUS:* Prefix is already set to No Prefix`);
        await setSetting("PREFIX", "");
        return reply(`✅ *PREFIX REMOVED*\n*INFO:* Commands can now be used without a prefix, e.g. menu, ping`);
      } catch (e) {
        return reply(`🙅‍♂️ *ERROR:* ${e.message}`);
      }
    }

    const parts = input.split(/\s+/).filter(Boolean);

    if (parts.length > 1) {
      if (parts.length > 5) return reply(`🙅‍♂️ *TOO MANY PREFIXES*\n*INFO:* Maximum 5 prefixes allowed`);

      const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const regexPrefix = `^[${escaped.join("")}]`;

      try {
        await setSetting("PREFIX", regexPrefix);
        return reply(`✅ *MULTIPLE PREFIXES SET*\n*PREFIXES:* \`${parts.join(" ")}\`\n*INFO:* Usable as ${parts[0]}menu, ${parts[1]}menu etc`);
      } catch (e) {
        return reply(`🙅‍♂️ *ERROR:* ${e.message}`);
      }
    }

    const chars = [...input];
    if (chars.length !== 1) {
      return reply(`🙅‍♂️ *INVALID PREFIX*\n*INFO:* Use only 1 character, 1 emoji, or multiple separated with space`);
    }

    try {
      if (rawCurrent === input) return reply(`⚠️ *ALREADY SET*\n*PREFIX:* Already set to \`${input}\``);
      await setSetting("PREFIX", input);
      return reply(`✅ *PREFIX UPDATED*\n*PREFIX:* \`${input}\`\n*INFO:* Usable as ${input}menu`);
    } catch (e) {
      return reply(`🙅‍♂️ *ERROR:* ${e.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET BOT NAME
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setbotname",
    aliases: ["botname", "namebot", "changename"],
    react: "⚙️",
    category: "owner",
    description: "Set bot name",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("BOT_NAME")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *BOT NAME*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setbotname PRIME-MD*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*NAME:* Already set to \`${q.trim()}\``);
      await setSetting("BOT_NAME", q.trim());
      return reply(`✅ *BOT NAME UPDATED*\n*NAME:* \`${q.trim()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CMD REACTION
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "cmdreaction",
    aliases: ["commandreaction", "cmdreact"],
    react: "⚙️",
    category: "owner",
    description: "Enable or disable command reactions",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("CMD_REACTION")) || "off";

    if (!q) {
      return reply(
`⚙️ *CMD REACTION*
📊 *CURRENT:* \`${current.toUpperCase()}\`

*USAGE:*
> ${botPrefix}cmdreaction on
> ${botPrefix}cmdreaction off*`
      );
    }

    const value = q.toLowerCase().trim();

    if (!["on", "off"].includes(value)) {
      return reply(`🙅‍♂️ *INVALID OPTION*\n*USE:* \`on / off\``);
    }

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*STATUS:* CMD Reaction is already ${value.toUpperCase()}`);
      await setSetting("CMD_REACTION", value);
      return reply(value === "on" ? "✅ *COMMAND REACTIONS ENABLED*" : "✅ *COMMAND REACTIONS DISABLED*");
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET OWNER NAME
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setownername",
    aliases: ["ownername", "myname"],
    react: "⚙️",
    category: "owner",
    description: "Set owner name",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("OWNER_NAME")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *OWNER NAME*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setownername Ali*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*NAME:* Already set to \`${q.trim()}\``);
      await setSetting("OWNER_NAME", q.trim());
      return reply(`✅ *OWNER NAME UPDATED*\n*NAME:* \`${q.trim()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET OWNER NUMBER
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setownernumber",
    aliases: ["ownernumber", "ownernum", "mynumber"],
    react: "⚙️",
    category: "owner",
    description: "Set owner number",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("OWNER_NUMBER")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *OWNER NUMBER*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setownernumber 923001234567*`
      );
    }

    try {
      const num = q.replace(/\D/g, "");
      if (current === num) return reply(`⚠️ *ALREADY SET*\n*NUMBER:* Already set to \`${num}\``);
      await setSetting("OWNER_NUMBER", num);
      return reply(`✅ *OWNER NUMBER UPDATED*\n*NUMBER:* \`${num}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET FOOTER
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setfooter",
    aliases: ["footer", "botfooter"],
    react: "⚙️",
    category: "owner",
    description: "Set bot footer",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("FOOTER")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *BOT FOOTER*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setfooter © PRIME-MD 🚩*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*INFO:* Footer already set to this value`);
      await setSetting("FOOTER", q.trim());
      return reply(`✅ *FOOTER UPDATED*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET CAPTION
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setcaption",
    aliases: ["caption", "botcaption"],
    react: "⚙️",
    category: "owner",
    description: "Set bot caption",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("CAPTION")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *BOT CAPTION*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setcaption Powered by PRIME-MD 🚩*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*INFO:* Caption already set to this value`);
      await setSetting("CAPTION", q.trim());
      return reply(`✅ *CAPTION UPDATED*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET BOT PIC
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setbotpic",
    aliases: ["botpic", "botimage", "setbotimage"],
    react: "⚙️",
    category: "owner",
    description: "Set bot picture URL",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("BOT_PIC")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *BOT PICTURE*
📊 *CURRENT:* \`${current.length > 50 ? current.substring(0, 50) + "..." : current}\`

*USAGE:*
> ${botPrefix}setbotpic https://i.imgur.com/xxx.jpg*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*INFO:* Bot picture already set to this value`);
      await setSetting("BOT_PIC", q.trim());
      return reply(`✅ *BOT PICTURE UPDATED*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET MODE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setmode",
    aliases: ["mode", "botmode", "changemode"],
    react: "⚙️",
    category: "owner",
    description: "Set bot mode (public/private/groups)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const mode = q?.toLowerCase();
    const current = (await getSetting("MODE")) || "public";

    if (!mode || !["public", "private", "groups"].includes(mode)) {
      return reply(
`⚙️ *BOT MODE*
📊 *CURRENT:* \`${current.toUpperCase()}\`

*USAGE:*
> ${botPrefix}setmode public
> ${botPrefix}setmode private
> ${botPrefix}setmode groups*

*OPTIONS:*
> \`public\` *- Everyone can use bot*
> \`private\` *- Only owner/sudo*
> \`groups\` *- Only group chats*`
      );
    }

    try {
      if (current === mode) return reply(`⚠️ *ALREADY SET*\n*MODE:* Already set to ${mode.toUpperCase()}`);
      await setSetting("MODE", mode);
      return reply(`✅ *MODE UPDATED*\n*MODE:* \`${mode.toUpperCase()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET TIMEZONE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "settimezone",
    aliases: ["timezone", "tz", "settz"],
    react: "⚙️",
    category: "owner",
    description: "Set bot timezone",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("TIME_ZONE")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *TIMEZONE*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}settimezone Asia/Karachi*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*TIMEZONE:* Already set to \`${q.trim()}\``);
      await setSetting("TIME_ZONE", q.trim());
      return reply(`✅ *TIMEZONE UPDATED*\n*TIMEZONE:* \`${q.trim()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET CHATBOT
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setchatbot",
    aliases: ["chatbot", "ai", "setai"],
    react: "⚙️",
    category: "owner",
    description: "Set chatbot (on/off/audio)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("CHATBOT")) || "false";
    const currentDisplay = current === "true" ? "ENABLED" : current === "false" ? "DISABLED" : current.toUpperCase();
    const valid = ["true", "false", "audio"];
    const value = parseBooleanInput(q);

    if (!value || !valid.includes(value)) {
      return reply(
`⚙️ *CHATBOT*
📊 *CURRENT:* \`${currentDisplay}\`

*USAGE:*
> ${botPrefix}setchatbot on
> ${botPrefix}setchatbot audio
> ${botPrefix}setchatbot off*

*OPTIONS:*
> \`on\` *- Text replies*
> \`audio\` *- Voice replies*
> \`off\` *- Disabled*`
      );
    }

    try {
      if (current === value) {
        const d = value === "true" ? "ENABLED" : value === "false" ? "DISABLED" : value.toUpperCase();
        return reply(`⚠️ *ALREADY SET*\n*STATUS:* Chatbot is already ${d}`);
      }
      await setSetting("CHATBOT", value);
      const d = value === "true" ? "ENABLED" : value === "false" ? "DISABLED" : value.toUpperCase();
      return reply(`✅ *CHATBOT ${d}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET CHATBOT MODE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setchatbotmode",
    aliases: ["chatbotmode", "aimode"],
    react: "⚙️",
    category: "owner",
    description: "Set chatbot mode (inbox/groups/allchats)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("CHATBOT_MODE")) || "allchats";
    const valid = ["inbox", "groups", "allchats"];

    if (!q || !valid.includes(q.toLowerCase())) {
      return reply(
`⚙️ *CHATBOT MODE*
📊 *CURRENT:* \`${current.toUpperCase()}\`

*USAGE:*
> ${botPrefix}setchatbotmode inbox
> ${botPrefix}setchatbotmode groups
> ${botPrefix}setchatbotmode allchats*

*OPTIONS:*
> \`inbox\` *- DMs only*
> \`groups\` *- Groups only*
> \`allchats\` *- Everywhere*`
      );
    }

    try {
      if (current === q.toLowerCase()) return reply(`⚠️ *ALREADY SET*\n*MODE:* Already set to ${q.toLowerCase().toUpperCase()}`);
      await setSetting("CHATBOT_MODE", q.toLowerCase());
      return reply(`✅ *CHATBOT MODE UPDATED*\n*MODE:* \`${q.toLowerCase().toUpperCase()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET START MESSAGE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setstartmsg",
    aliases: ["startmsg", "startingmessage", "startmessage"],
    react: "⚙️",
    category: "owner",
    description: "Set starting message (on/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("STARTING_MESSAGE")) || "false";
    const valid = ["true", "false"];
    const value = parseBooleanInput(q);

    if (!value || !valid.includes(value)) {
      return reply(
`⚙️ *STARTING MESSAGE*
📊 *STATUS:* \`${formatBoolDisplay(current)}\`

*USAGE:*
> ${botPrefix}setstartmsg on
> ${botPrefix}setstartmsg off*`
      );
    }

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*STATUS:* Starting message is already ${formatBoolDisplay(value)}`);
      await setSetting("STARTING_MESSAGE", value);
      return reply(`✅ *STARTING MESSAGE ${formatBoolDisplay(value)}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET ANTICALL
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setanticall",
    aliases: ["anticall", "blockcall"],
    react: "⚙️",
    category: "owner",
    description: "Set anticall (on/off/block/decline)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("ANTICALL")) || "false";
    const currentDisplay = current === "true" ? "ENABLED" : current === "false" ? "DISABLED" : current.toUpperCase();
    const valid = ["true", "block", "false", "decline"];
    const value = parseBooleanInput(q);

    if (!value || !valid.includes(value)) {
      return reply(
`⚙️ *ANTICALL*
📊 *CURRENT:* \`${currentDisplay}\`

*USAGE:*
> ${botPrefix}setanticall on
> ${botPrefix}setanticall block
> ${botPrefix}setanticall decline
> ${botPrefix}setanticall off*

*OPTIONS:*
> \`on\` *- Reject calls*
> \`block\` *- Reject + block caller*
> \`decline\` *- Decline silently*
> \`off\` *- Allow all calls*`
      );
    }

    try {
      if (current === value) {
        const d = value === "true" ? "ENABLED" : value === "false" ? "DISABLED" : value.toUpperCase();
        return reply(`⚠️ *ALREADY SET*\n*STATUS:* Anticall is already ${d}`);
      }
      await setSetting("ANTICALL", value);
      const d = value === "true" ? "ENABLED" : value === "false" ? "DISABLED" : value.toUpperCase();
      return reply(`✅ *ANTICALL ${d}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET AUTO LIKE STATUS
// ━━━━━━━━━━━━━━━
// Shared handler: on/off/true/false/status
function makeStatusToggle({ pattern, aliases, key, title, icon, description, extra }) {
  cmd(
    { pattern, aliases, react: "⚙️", category: "owner", description },
    async (from, sock, conText) => {
      const { q, reply, isSuperUser, botPrefix } = conText;
      if (!isSuperUser) return reply("❌ Owner Only Command!");

      const args = (q || "").trim().split(/\s+/).filter(Boolean);
      const sub = (args[0] || "").toLowerCase();
      const current = (await getSetting(key)) || "false";

      if (!sub || sub === "status") {
        let text = `*${icon} ${title}*\n\n🔹 *Enabled:* ${current}\n`;
        if (extra) text += await extra.status();
        text += `\n*🛠 Usage:*\n▸ ${botPrefix}${pattern} true/false\n▸ ${botPrefix}${pattern} on/off\n`;
        if (extra) text += extra.usage(botPrefix);
        text += `▸ ${botPrefix}${pattern} status`;
        return reply(text);
      }

      if (extra && extra.handle) {
        const handled = await extra.handle(sub, args, reply);
        if (handled) return;
      }

      const value = parseBooleanInput(sub);
      if (!["true", "false"].includes(value)) {
        return reply("❌ Invalid input. Use `" + botPrefix + pattern + " status` to view usage.");
      }
      try {
        await setSetting(key, value);
        return reply(`✅ ${title} set to *${value}*`);
      } catch (error) {
        return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
      }
    }
  );
}

makeStatusToggle({
  pattern: "autolikestatus",
  aliases: ["setautolikestatus", "autostatuslike", "statuslike", "likestatus", "autolike", "asr", "statusreact"],
  key: "AUTO_LIKE_STATUS",
  title: "Auto Like Status",
  icon: "💖",
  description: "Configure auto-like (react) for incoming statuses",
  extra: {
    status: async () => `🔹 *Emojis:* ${(await getSetting("STATUS_LIKE_EMOJIS")) || "💛,❤️,💜,🤍,💙"}\n`,
    usage: (p) => `▸ ${p}autolikestatus emojis 💚 💔 💥\n`,
    handle: async (sub, args, reply) => {
      if (sub !== "emojis") return false;
      const cleaned = args.slice(1).join(" ").replace(/,/g, " ").split(/\s+/).filter(Boolean).join(",");
      if (!cleaned) { await reply("❌ Provide emojis after 'emojis'"); return true; }
      await setSetting("STATUS_LIKE_EMOJIS", cleaned);
      await reply(`✅ Auto-like emojis updated to: ${cleaned.split(",").join(" ")}`);
      return true;
    },
  },
});

makeStatusToggle({
  pattern: "autoviewstatus",
  aliases: ["setautoreadstatus", "autostatusview", "statusview", "viewstatus", "autoview", "asv"],
  key: "AUTO_READ_STATUS",
  title: "Auto View Status",
  icon: "👁️",
  description: "Configure auto-view for incoming statuses",
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET STATUS EMOJIS
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setstatusemojis",
    aliases: ["statusemojis", "statusreaction", "ase"],
    react: "⚙️",
    category: "owner",
    description: "Set status like emojis (comma separated)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("STATUS_LIKE_EMOJIS")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *STATUS EMOJIS*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setstatusemojis 💛,❤️,💜*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*EMOJIS:* Already set to \`${q.trim()}\``);
      await setSetting("STATUS_LIKE_EMOJIS", q.trim());
      return reply(`✅ *STATUS EMOJIS UPDATED*\n*EMOJIS:* \`${q.trim()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET STATUS REPLY TEXT
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setstatusreplytext",
    aliases: ["statusreplytext", "statusreply"],
    react: "⚙️",
    category: "owner",
    description: "Set status reply text",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("STATUS_REPLY_TEXT")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *STATUS REPLY TEXT*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setstatusreplytext Nice status! 🔥*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*INFO:* Status reply text already set to this value`);
      await setSetting("STATUS_REPLY_TEXT", q.trim());
      return reply(`✅ *STATUS REPLY TEXT UPDATED*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET AUTO REACT
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setautoreact",
    aliases: ["autoreact", "areact"],
    react: "⚙️",
    category: "owner",
    description: "Set auto react mode (on/all/dm/groups/commands/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("AUTO_REACT")) || "off";
    const input = (q || "").toLowerCase().trim();
    const validModes = ["on", "all", "dm", "groups", "commands", "off"];

    if (!input || !validModes.includes(input)) {
      return reply(
`⚙️ *AUTO REACT*
📊 *CURRENT:* \`${current.toUpperCase()}\`

*USAGE:*
> ${botPrefix}setautoreact on
> ${botPrefix}setautoreact dm
> ${botPrefix}setautoreact groups
> ${botPrefix}setautoreact commands
> ${botPrefix}setautoreact off*

*OPTIONS:*
> \`on/all\` *- All messages*
> \`dm\` *- DMs only*
> \`groups\` *- Groups only*
> \`commands\` *- Bot commands only*
> \`off\` *- Disabled*`
      );
    }

    const value = input === "on" ? "all" : input;

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*MODE:* Already set to ${value.toUpperCase()}`);
      await setSetting("AUTO_REACT", value);
      return reply(`✅ *AUTO REACT UPDATED*\n*MODE:* \`${value.toUpperCase()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET AUTO TYPING
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "autotyping",
    aliases: ["settyping"],
    react: "⌨️",
    category: "owner",
    description: "Show 'typing...' before the bot replies (on/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("PRESENCE")) || "offline";
    const input = (q || "").toLowerCase().trim();

    if (!["on", "off"].includes(input)) {
      return reply(
`⌨️ *AUTO TYPING*
📊 *CURRENT PRESENCE:* \`${current}\`

Shows "typing..." to whoever messages the bot, before it replies.
Note: only one presence mode is active at a time (typing / recording / online / offline).

*USAGE:*
> ${botPrefix}autotyping on
> ${botPrefix}autotyping off*`
      );
    }

    try {
      const value = input === "on" ? "typing" : "offline";
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*PRESENCE:* Already \`${value}\``);
      await setSetting("PRESENCE", value);
      return reply(`✅ *AUTO TYPING ${input === "on" ? "ON" : "OFF"}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET STATUS AUTOSAVE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "statusautosave",
    aliases: ["autosavestatus"],
    react: "📌",
    category: "owner",
    description: "Save a status to your DM whenever you react to it or reply to it (on/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("STATUS_AUTOSAVE")) || "true";
    const input = (q || "").toLowerCase().trim();

    if (!["on", "off"].includes(input)) {
      return reply(
`📌 *STATUS AUTOSAVE*
📊 *CURRENT:* \`${current === "false" ? "OFF" : "ON"}\`

When you react to or reply to someone's status, that status gets saved to your own DM automatically.

*USAGE:*
> ${botPrefix}statusautosave on
> ${botPrefix}statusautosave off*`
      );
    }

    const value = input === "on" ? "true" : "false";

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*STATUS AUTOSAVE:* Already ${value === "true" ? "ON" : "OFF"}`);
      await setSetting("STATUS_AUTOSAVE", value);
      return reply(`✅ *STATUS AUTOSAVE ${value === "true" ? "ON" : "OFF"}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET AUTO RECORDING
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "autorecording",
    aliases: ["setrecording"],
    react: "🎙️",
    category: "owner",
    description: "Show 'recording audio...' before the bot replies (on/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("PRESENCE")) || "offline";
    const input = (q || "").toLowerCase().trim();

    if (!["on", "off"].includes(input)) {
      return reply(
`🎙️ *AUTO RECORDING*
📊 *CURRENT PRESENCE:* \`${current}\`

Shows "recording audio..." to whoever messages the bot, before it replies.
Note: only one presence mode is active at a time (typing / recording / online / offline).

*USAGE:*
> ${botPrefix}autorecording on
> ${botPrefix}autorecording off*`
      );
    }

    try {
      const value = input === "on" ? "recording" : "offline";
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*PRESENCE:* Already \`${value}\``);
      await setSetting("PRESENCE", value);
      return reply(`✅ *AUTO RECORDING ${input === "on" ? "ON" : "OFF"}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);
cmd(
  {
    pattern: "setautoreply",
    aliases: ["autoreply"],
    react: "⚙️",
    category: "owner",
    description: "Set auto reply (on/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("AUTO_REPLY")) || "false";
    const valid = ["true", "false"];
    const value = parseBooleanInput(q);

    if (!value || !valid.includes(value)) {
      return reply(
`⚙️ *AUTO REPLY*
📊 *STATUS:* \`${formatBoolDisplay(current)}\`

*USAGE:*
> ${botPrefix}setautoreply on
> ${botPrefix}setautoreply off*`
      );
    }

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*STATUS:* Auto reply is already ${formatBoolDisplay(value)}`);
      await setSetting("AUTO_REPLY", value);
      return reply(`✅ *AUTO REPLY ${formatBoolDisplay(value)}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET AUTO BIO
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setautobio",
    aliases: ["autobio", "bio"],
    react: "⚙️",
    category: "owner",
    description: "Set auto bio (on/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("AUTO_BIO")) || "false";
    const valid = ["true", "false"];
    const value = parseBooleanInput(q);

    if (!value || !valid.includes(value)) {
      return reply(
`⚙️ *AUTO BIO*
📊 *STATUS:* \`${formatBoolDisplay(current)}\`

*USAGE:*
> ${botPrefix}setautobio on
> ${botPrefix}setautobio off*`
      );
    }

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*STATUS:* Auto bio is already ${formatBoolDisplay(value)}`);
      await setSetting("AUTO_BIO", value);
      return reply(`✅ *AUTO BIO ${formatBoolDisplay(value)}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET AUTO BLOCK
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setautoblock",
    aliases: ["autoblock", "blockcountry"],
    react: "⚙️",
    category: "owner",
    description: "Set auto block country codes",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("AUTO_BLOCK")) || "";

    if (q === undefined || q === null) {
      return reply(
`⚙️ *AUTO BLOCK*
📊 *CURRENT:* \`${current || "DISABLED"}\`

*USAGE:*
> ${botPrefix}setautoblock 91,1,44 - Block by country code
> ${botPrefix}setautoblock - Send empty to disable*`
      );
    }

    try {
      const value = q ? q.trim() : "";
      if (current === value) {
        return value
          ? reply(`⚠️ *ALREADY SET*\n*CODES:* Already set to \`${value}\``)
          : reply(`⚠️ *ALREADY DISABLED*`);
      }
      await setSetting("AUTO_BLOCK", value);
      return reply(
        value
          ? `✅ *AUTO BLOCK ENABLED*\n*CODES:* \`${value}\``
          : `✅ *AUTO BLOCK DISABLED*`
      );
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET AUTO READ MESSAGES
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setautoread",
    aliases: ["autoread", "readmessages"],
    react: "⚙️",
    category: "owner",
    description: "Set auto read messages mode",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("AUTO_READ_MESSAGES")) || "off";
    const input = (q || "").toLowerCase().trim();
    const validModes = ["on", "all", "dm", "groups", "commands", "off"];

    if (!input || !validModes.includes(input)) {
      return reply(
`⚙️ *AUTO READ*
📊 *CURRENT:* \`${current.toUpperCase()}\`

*USAGE:*
> ${botPrefix}setautoread on
> ${botPrefix}setautoread dm
> ${botPrefix}setautoread groups
> ${botPrefix}setautoread commands
> ${botPrefix}setautoread off*

*OPTIONS:*
> \`on/all\` *- All messages*
> \`dm\` *- DMs only*
> \`groups\` *- Groups only*
> \`commands\` *- Commands only*
> \`off\` *- Disabled*`
      );
    }

    const value = input === "on" ? "all" : input;

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*MODE:* Already set to ${value.toUpperCase()}`);
      await setSetting("AUTO_READ_MESSAGES", value);
      return reply(`✅ *AUTO READ UPDATED*\n*MODE:* \`${value.toUpperCase()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET NEWSLETTER JID
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setnewsletterjid",
    aliases: ["setchannelid", "setchanneljid"],
    react: "⚙️",
    category: "owner",
    description: "Set newsletter JID",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("NEWSLETTER_JID")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *NEWSLETTER JID*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setnewsletterjid 12345678@newsletter*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*INFO:* Newsletter JID already set to this value`);
      await setSetting("NEWSLETTER_JID", q.trim());
      return reply(`✅ *NEWSLETTER JID UPDATED*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET GC JID
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setgcjid",
    aliases: ["gcjid", "groupjid", "supportgc"],
    react: "⚙️",
    category: "owner",
    description: "Set group chat JID/invite code",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("GC_JID")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *GROUP JID*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setgcjid 1234567890@g.us*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*INFO:* Group JID already set to this value`);
      await setSetting("GC_JID", q.trim());
      return reply(`✅ *GROUP JID UPDATED*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET NEWSLETTER URL
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setnewsletterurl",
    aliases: ["newsletterurl", "channelurl"],
    react: "⚙️",
    category: "owner",
    description: "Set newsletter URL",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("NEWSLETTER_URL")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *NEWSLETTER URL*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setnewsletterurl https://whatsapp.com/channel/...*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*INFO:* Newsletter URL already set to this value`);
      await setSetting("NEWSLETTER_URL", q.trim());
      return reply(`✅ *NEWSLETTER URL UPDATED*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET BOT REPO
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setbotrepo",
    aliases: ["botrepo", "setrepo"],
    react: "⚙️",
    category: "owner",
    description: "Set bot repository",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("BOT_REPO")) || "Not Set";

    if (!q) {
      return reply(
`⚙️ *BOT REPO*
📊 *CURRENT:* \`${current}\`

*USAGE:*
> ${botPrefix}setbotrepo https://github.com/user/repo*`
      );
    }

    try {
      if (current === q.trim()) return reply(`⚠️ *ALREADY SET*\n*REPO:* Already set to \`${q.trim()}\``);
      await setSetting("BOT_REPO", q.trim());
      return reply(`✅ *BOT REPO UPDATED*\n*REPO:* \`${q.trim()}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET SETTING
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "getsetting",
    aliases: ["getconfig", "viewsetting"],
    react: "⚙️",
    category: "owner",
    description: "Get a specific setting value",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");
    if (!q) return reply(`🙅‍♂️ *MISSING KEY*\n*USAGE:* \`${botPrefix}getsetting PREFIX\``);

    try {
      const value = await getSetting(q.toUpperCase().trim());
      return reply(`⚙️ *${q.toUpperCase()}:* \`${value || "Not Set"}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET SETTING
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setsetting",
    aliases: ["setconfig", "config"],
    react: "⚙️",
    category: "owner",
    description: "Set any setting (key value)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");
    if (!q || !q.includes(" ")) {
      return reply(`🙅‍♂️ *MISSING VALUE*\n*USAGE:* \`${botPrefix}setsetting PREFIX !\``);
    }

    try {
      const parts = q.split(" ");
      const key = parts[0].toUpperCase();
      const value = parts.slice(1).join(" ");
      const current = await getSetting(key);
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*${key}:* Already \`${value}\``);
      await setSetting(key, value);
      return reply(`✅ *${key} UPDATED*\n*VALUE:* \`${value}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESET SETTING
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "resetsetting",
    aliases: ["resetconfig", "defaultsetting"],
    react: "⚙️",
    category: "owner",
    description: "Reset a setting to default",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");
    if (!q) return reply(`🙅‍♂️ *MISSING KEY*\n*USAGE:* \`${botPrefix}resetsetting PREFIX\``);

    try {
      const defaultValue = await resetSetting(q.toUpperCase().trim());
      return reply(`✅ *${q.toUpperCase()} RESET*\n*DEFAULT:* \`${defaultValue || "Not Set"}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESET ALL SETTINGS
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "resetallsettings",
    aliases: ["resetsettings", "resetall", "defaultsettings"],
    react: "⚙️",
    category: "owner",
    description: "Reset all settings to defaults",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    try {
      await resetAllSettings();
      return reply(`✅ *ALL SETTINGS RESET*\n*INFO:* Restored to default values`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET AUTO REPLY STATUS
// ━━━━━━━━━━━━━━━
makeStatusToggle({
  pattern: "autoreplystatus",
  aliases: ["setautoreplystatus", "replystatusauto", "replystatus"],
  key: "AUTO_REPLY_STATUS",
  title: "Auto Reply Status",
  icon: "💬",
  description: "Configure auto-reply for viewed statuses",
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SET PM PERMIT
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setpmpermit",
    aliases: ["pmpermit"],
    react: "⚙️",
    category: "owner",
    description: "Set PM permit (on/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    const current = (await getSetting("PM_PERMIT")) || "false";
    const valid = ["true", "false"];
    const value = parseBooleanInput(q);

    if (!value || !valid.includes(value)) {
      return reply(
`⚙️ *PM PERMIT*
📊 *STATUS:* \`${formatBoolDisplay(current)}\`

*USAGE:*
> ${botPrefix}setpmpermit on
> ${botPrefix}setpmpermit off*`
      );
    }

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*STATUS:* PM Permit is already ${formatBoolDisplay(value)}`);
      await setSetting("PM_PERMIT", value);
      return reply(`✅ *PM PERMIT ${formatBoolDisplay(value)}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP EVENTS (PDM)
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "pdm",
    aliases: ["groupevents", "gcevents", "setgcevents", "events"],
    react: "⚙️",
    category: "group",
    description: "Set group events notifications for this group (on/off)",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, isGroup, isAdmin, isSuperAdmin, botPrefix } = conText;
    if (!isGroup) return reply("🙅‍♂️ *GROUP ONLY*\n*INFO:* This command works in groups only!");
    if (!isSuperUser && !isAdmin && !isSuperAdmin) return reply("🙅‍♂️ *ADMIN ONLY*\n*INFO:* You must be a group admin!");

    const current = (await getGroupSetting(from, "GROUP_EVENTS")) || "false";
    const valid = ["true", "false"];
    const value = parseBooleanInput(q);

    if (!value || !valid.includes(value)) {
      return reply(
`⚙️ *GROUP EVENTS*
📊 *STATUS:* \`${formatBoolDisplay(current)}\`

*USAGE:*
> ${botPrefix}pdm on
> ${botPrefix}pdm off*

*INFO:*
> Notifies promotes/demotes in this group`
      );
    }

    try {
      if (current === value) return reply(`⚠️ *ALREADY SET*\n*STATUS:* Group events are already ${formatBoolDisplay(value)}`);
      await setGroupSetting(from, "GROUP_EVENTS", value);
      return reply(`✅ *Promote/Demote Detection ${formatBoolDisplay(value)}*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESET SUDO
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "resetsudo",
    aliases: ["deleteallsudos", "resetsudos", "clearsudo", "clearsudos"],
    react: "🗑️",
    category: "owner",
    description: "Remove all sudo numbers from database",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    try {
      const sudoList = await getSudoNumbers();
      if (sudoList.length === 0) return reply(`⚠️ *NOTHING TO REMOVE*\n*INFO:* No sudo numbers found`);
      const count = await clearAllSudo();
      return reply(`✅ *SUDO NUMBERS CLEARED*\n*COUNT:* \`${count}\` *removed*`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP SETTINGS PANEL
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "groupsettings",
    aliases: ["gcsettings", "gcset", "groupset", "gsettings"],
    react: "⚙️",
    category: "group",
    description: "View all settings for this group",
  },
  async (from, sock, conText) => {
    const { reply, isAdmin, isSuperAdmin, isSuperUser, isGroup, groupName, botPrefix } = conText;
    if (!isGroup) return reply("🙅‍♂️ *GROUP ONLY*\n*INFO:* This command works in groups only!");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("🙅‍♂️ *ADMIN ONLY*\n*INFO:* You must be a group admin!");

    try {
      const { getBadWords, DEFAULT_BAD_WORDS } = require("../lib/database/groupSettings");
      const settings = await getAllGroupSettings(from);

      const welcomeStatus = isSettingEnabled(settings.WELCOME_MESSAGE) ? "ENABLED" : "DISABLED";
      const goodbyeStatus = isSettingEnabled(settings.GOODBYE_MESSAGE) ? "ENABLED" : "DISABLED";
      const eventsStatus = isSettingEnabled(settings.GROUP_EVENTS) ? "ENABLED" : "DISABLED";
      const antilinkStatus = isSettingEnabled(settings.ANTILINK) ? "ENABLED" : "DISABLED";
      const antibadStatus = isSettingEnabled(settings.ANTIBAD) ? "ENABLED" : "DISABLED";

      const antiGcMentionRaw = settings.ANTIGROUPMENTION || "off";
      let antiGcMentionStatus = "DISABLED";
      let antiGcMentionAction = "";
      if (isSettingEnabled(antiGcMentionRaw)) {
        antiGcMentionStatus = "ENABLED";
        antiGcMentionAction = antiGcMentionRaw === "kick" ? "kick" : "warn";
      }

      const badWords = await getBadWords(from);
      const defaultBadWordsSet = new Set(DEFAULT_BAD_WORDS.map((w) => w.toLowerCase()));
      const isUsingDefault =
        badWords.length === DEFAULT_BAD_WORDS.length &&
        badWords.every((w) => defaultBadWordsSet.has(w.toLowerCase()));
      let badWordsDisplay = "None";
      if (badWords.length > 0) {
        if (isUsingDefault) {
          badWordsDisplay = "Default list";
        } else {
          const displayWords = badWords.slice(0, 5).join(", ");
          badWordsDisplay = badWords.length > 5 ? `${displayWords}... (+${badWords.length - 5} more)` : displayWords;
        }
      }

      const welcomeText = settings.WELCOME_MESSAGE_TEXT || "Default";
      const goodbyeText = settings.GOODBYE_MESSAGE_TEXT || "Default";

      const antilinkRaw = settings.ANTILINK || "off";
      let antilinkAction = "delete";
      if (antilinkRaw === "warn") antilinkAction = "warn";
      else if (antilinkRaw === "kick") antilinkAction = "kick";

      let msg = `⚙️ *GROUP SETTINGS*\n`;
      msg += `📍 *GROUP:* \`${groupName || "This Group"}\`\n\n`;

      msg += `*💬 MESSAGES:*\n`;
      msg += `> \`Welcome:\` ${welcomeStatus}\n`;
      msg += `> \`Goodbye:\` ${goodbyeStatus}\n`;
      msg += `> \`Events:\` ${eventsStatus}\n\n`;

      msg += `*🛡️ PROTECTION:*\n`;
      msg += `> \`Antilink:\` ${antilinkStatus}\n`;
      if (antilinkStatus === "ENABLED") {
        msg += `> └ Action: ${antilinkAction}\n`;
        if (antilinkAction === "warn") msg += `> └ Warns: ${settings.ANTILINK_WARN_COUNT}\n`;
      }
      msg += `> \`Antibad:\` ${antibadStatus}\n`;
      msg += `> └ Warns: ${settings.ANTIBAD_WARN_COUNT}\n`;
      msg += `> └ Words: ${badWordsDisplay}\n`;
      msg += `> \`Anti-Status-Mention:\` ${antiGcMentionStatus}\n`;
      if (antiGcMentionStatus === "ENABLED") {
        msg += `> └ Action: ${antiGcMentionAction}\n`;
        if (antiGcMentionAction === "warn") msg += `> └ Warn Limit: ${settings.ANTIGROUPMENTION_WARN_COUNT || 3}\n`;
      }
      msg += `\n`;

      msg += `*📝 WELCOME MSG:*\n> ${welcomeText.length > 50 ? welcomeText.substring(0, 50) + "..." : welcomeText}\n\n`;
      msg += `*📝 GOODBYE MSG:*\n> ${goodbyeText.length > 50 ? goodbyeText.substring(0, 50) + "..." : goodbyeText}\n\n`;

      msg += `*INFO:*\n> Use \`${botPrefix}setwelcome\`, \`${botPrefix}setgoodbye\`, \`${botPrefix}antilink\` etc to modify`;

      return reply(msg);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESET GROUP SETTINGS
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "resetgroup",
    aliases: ["resetgroupsettings", "cleargroupsettings", "resetgc", "cleargc"],
    react: "🗑️",
    category: "group",
    description: "Reset all settings for this group",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, isGroup } = conText;
    if (!isGroup) return reply("🙅‍♂️ *GROUP ONLY*\n*INFO:* This command works in groups only!");
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    try {
      await resetAllGroupSettings(from);
      return reply(
`✅ *GROUP SETTINGS RESET*
*CLEARED:*
> Welcome message
> Goodbye message
> Group events
> Antilink
> Antilink warnings`
      );
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESET DATABASE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "resetdb",
    aliases: ["resetdatabase", "wipedatabase", "wipedb", "factoryreset", "flushdb", "flushdatabase"],
    react: "⚠️",
    category: "owner",
    description: "Reset entire database to defaults",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    if (q !== "confirm") {
      return reply(
`⚠️ *WARNING: FULL RESET*
*INFO:* This will reset EVERYTHING!

*WILL BE CLEARED:*
> All bot settings
> All sudo numbers
> All group settings
> All antilink warnings

*CONFIRM:*
> ${botPrefix}resetdb confirm*`
      );
    }

    try {
      await resetAllSettings();
      await clearAllSudo();
      const { GroupSettingsDB, AntilinkWarningsDB } = require("../lib/database/groupSettings");
      await GroupSettingsDB.destroy({ where: {} });
      await AntilinkWarningsDB.destroy({ where: {} });
      return reply(`✅ *DATABASE RESET*\n*INFO:* All settings, sudo numbers and group configurations cleared`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ALL NOTES - OWNER ONLY
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "allnotes",
    aliases: ["usernotes", "allnotesdb"],
    react: "📋",
    category: "owner",
    description: "View all users' notes (owner only)",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");

    try {
      const allNotes = await getAllUsersNotes();

      if (allNotes.length === 0) return reply(`📭 *NO NOTES*\n*INFO:* Database is empty`);

      const groupedByUser = {};
      for (const note of allNotes) {
        if (!groupedByUser[note.userJid]) groupedByUser[note.userJid] = [];
        groupedByUser[note.userJid].push(note);
      }

      let text = `📋 *ALL USER NOTES*\n`;
      text += `📊 *TOTAL:* \`${allNotes.length}\` *notes from* \`${Object.keys(groupedByUser).length}\` *users*\n\n`;

      for (const [userJid, notes] of Object.entries(groupedByUser)) {
        const userName = userJid.split("@")[0];
        text += `👤 *@${userName}* (${notes.length} notes)\n`;
        for (const note of notes) {
          const preview = note.content.length > 30 ? note.content.substring(0, 30) + "..." : note.content;
          text += `> ID:${note.id} #${note.noteNumber} - ${preview}\n`;
        }
        text += `\n`;
      }

      text += `*INFO:*\n`;
      text += `> \`${botPrefix}admindelnote <id>\` *- Delete a note*\n`;
      text += `> \`${botPrefix}adminupdatenote <id> <text>\` *- Update a note*\n`;
      text += `> \`${botPrefix}adminclearnotes <number>\` *- Clear user notes*`;

      return reply(text);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN DELETE NOTE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "admindelnote",
    aliases: ["deletenotebyid", "rmnotebyid", "admindeletenote"],
    react: "🗑️",
    category: "owner",
    description: "Delete any note by ID (owner only)",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, q, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");
    if (!q || isNaN(parseInt(q))) return reply(`🙅‍♂️ *MISSING ID*\n*USAGE:* \`${botPrefix}admindelnote <id>\``);

    try {
      const noteId = parseInt(q);
      const deleted = await deleteNoteById(noteId);
      if (!deleted) return reply(`🙅‍♂️ *NOT FOUND*\n*INFO:* Note with ID ${noteId} not found`);
      return reply(`✅ *NOTE DELETED*\n*ID:* \`${noteId}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN UPDATE NOTE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "adminupdatenote",
    aliases: ["editnotebyid", "updatenotebyid", "admineditnote"],
    react: "✏️",
    category: "owner",
    description: "Update any note by ID (owner only)",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, q, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");
    if (!q || q.trim() === "") return reply(`🙅‍♂️ *MISSING DATA*\n*USAGE:* \`${botPrefix}adminupdatenote <id> <new text>\``);

    try {
      const parts = q.trim().split(/\s+/);
      const noteId = parseInt(parts[0]);
      if (isNaN(noteId)) return reply(`🙅‍♂️ *INVALID ID*\n*USAGE:* \`${botPrefix}adminupdatenote <id> <new text>\``);
      const newContent = parts.slice(1).join(" ");
      if (!newContent) return reply(`🙅‍♂️ *MISSING CONTENT*\n*USAGE:* \`${botPrefix}adminupdatenote <id> <new text>\``);
      const note = await updateNoteById(noteId, newContent);
      if (!note) return reply(`🙅‍♂️ *NOT FOUND*\n*INFO:* Note with ID ${noteId} not found`);
      return reply(`✅ *NOTE UPDATED*\n*ID:* \`${noteId}\`\n*CONTENT:* "${note.content}"`);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADMIN CLEAR NOTES
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "adminclearnotes",
    aliases: ["clearusernotes", "deleteusernotes", "adminrmallnotes"],
    react: "🗑️",
    category: "owner",
    description: "Delete all notes for a specific user (owner only)",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, q, botPrefix } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!");
    if (!q || q.trim() === "") return reply(`🙅‍♂️ *MISSING NUMBER*\n*USAGE:* \`${botPrefix}adminclearnotes <number>\``);

    try {
      const userNumber = q.trim().replace(/[^0-9]/g, "");
      const userJid = userNumber + "@s.whatsapp.net";
      const count = await deleteAllNotes(userJid);
      if (count === 0) return reply(`📭 *NO NOTES FOUND*\n*NUMBER:* \`${userNumber}\``);
      return reply(`✅ *NOTES CLEARED*\n*COUNT:* \`${count}\` *note${count > 1 ? "s" : ""} for* \`${userNumber}\``);
    } catch (error) {
      return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
    }
  },
);

module.exports = {};
