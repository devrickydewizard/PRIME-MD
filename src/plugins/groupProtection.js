const { cmd } = require("../lib");

const {
  getSetting,
  setSetting,
} = require("../lib/database/settings");

const {
  getGroupSetting,
  setGroupSetting,
  getBadWords,
  addBadWord,
  removeBadWord,
  clearBadWords,
  initializeDefaultBadWords,
  getWarningCount,
  addWarning,
  removeWarning,
  resetWarning,
  getAllWarnings,
} = require("../lib/database/groupSettings");

const { getLidMapping } = require("../lib/connection/groupCache");

// Small shared helper to resolve @lid -> real jid (mirrors gmdHelpers.js pattern)
async function _resolveSenderJid(sock, jid) {
  if (!jid || !jid.endsWith("@lid")) return jid;
  const cached = getLidMapping(jid);
  if (cached) return cached;
  try {
    const resolved = await sock.getJidFromLid(jid);
    if (resolved) return resolved;
  } catch (e) {}
  return jid;
}

// Same fallback logic as lib/gmdHelpers.js::_getEnvWarnFallback —
// keeps every panel's displayed default in sync with WARN= in .env
function _envWarnFallback() {
  const envLimit = parseInt(process.env.WARN);
  return (!isNaN(envLimit) && envLimit > 0) ? String(envLimit) : "3";
}

// ━━━━━━━━━━━━━━━
// ANTI STICKER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antisticker",
    react: "🛡️",
    aliases: ["antistiker", "nosticker", "antist", "stickerblock"],
    category: "protection",
    description: "Manage anti-sticker system",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;

    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();
    const modeMap = { on: "null", delete: "delete", warn: "warn", kick: "kick", null: "null", off: "off", false: "off" };

    if (!input) {
      const current = await getGroupSetting(from, "ANTISTICKER");
      const status =!current || current === "off"? "OFF" : `ON - ${current.toUpperCase()}`;
      return await sock.sendMessage(from, {
        text: `🎭 *ANTI STICKER PROTECTION*
📊 *CURRENT STATUS:* \`${status}\`

*USAGE:*
> *${botPrefix}antisticker on - Delete stickers*
> *${botPrefix}antisticker warn - Warn users*
> *${botPrefix}antisticker kick - Kick instantly*
> *${botPrefix}antisticker null - Silent delete*
> *${botPrefix}antisticker off - Disable*

*OPTIONS:*
> \`on/delete\` *- Auto delete stickers*
> \`warn\` *- Warn user for sending stickers*
> \`kick\` *- Remove user instantly*
> \`null\` *- Silent delete, no warning*
> \`off\` *- Disable protection*`
      });
    }

    const mode = modeMap[input];
    if (!mode) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID MODE*\n*USE:* `on / warn / kick / null / off`" });

    try {
      await setGroupSetting(from, "ANTISTICKER", mode);
      if (mode === "off") return await sock.sendMessage(from, { text: "✅ *ANTI STICKER DISABLED*\n*INFO:* Protection is now OFF" });

      const messages = {
        delete: `✅ *ANTI STICKER ENABLED*\n*MODE:* \`DELETE\`\n*INFO:* Stickers will be auto deleted`,
        warn: `✅ *ANTI STICKER ENABLED*\n*MODE:* \`WARN\`\n*INFO:* Users will be warned for stickers`,
        kick: `✅ *ANTI STICKER ENABLED*\n*MODE:* \`KICK\`\n*INFO:* Sticker senders removed instantly`,
        null: `✅ *ANTI STICKER ENABLED*\n*MODE:* \`NULL\`\n*INFO:* Stickers deleted silently`,
      };
      return await sock.sendMessage(from, { text: messages[mode] });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANTI STICKER WARN COUNT
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antistickerwarn",
    aliases: ["stickerwarncount", "antistickerwarncount", "setstickerwarn"],
    react: "⚙️",
    category: "protection",
    description: "Set anti-sticker warning count before kick",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const current = (await getGroupSetting(from, "ANTISTICKER_WARN_COUNT")) || _envWarnFallback();

    if (!q) {
      return await sock.sendMessage(from, {
        text: `⚙️ *ANTI STICKER WARN COUNT*
📊 *CURRENT VALUE:* \`${current}\`

*USAGE:*
> *${botPrefix}antistickerwarn 3*

*INFO:*
> \`1-10\` *- Number of warnings before kick*`
      });
    }

    const count = parseInt(q);
    if (isNaN(count) || count < 1 || count > 10) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID NUMBER*\n*USE:* Number between 1-10" });
    if (current === count.toString()) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*COUNT:* Warn count is already ${count}` });

    try {
      await setGroupSetting(from, "ANTISTICKER_WARN_COUNT", count.toString());
      return await sock.sendMessage(from, { text: `✅ *WARN COUNT UPDATED*\n*COUNT:* \`${count}\`\n*INFO:* Users kicked after ${count} warnings` });
    } catch (error) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━
// ANTI STATUS MENTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antistatusmention",
    react: "🛡️",
    aliases: ["antigroupmention", "antigcmention", "agm", "statusmention"],
    category: "protection",
    description: "Protect group from status mentions",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;

    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();
    const modeMap = { on: "null", warn: "warn", delete: "delete", kick: "kick", null: "null", off: "off", false: "off" };

    if (!input) {
      const current = await getGroupSetting(from, "ANTIGROUPMENTION");
      const status =!current || current === "off"? "OFF" : `ON - ${current.toUpperCase()}`;
      return await sock.sendMessage(from, {
        text: `📢 *ANTI STATUS MENTION*
📊 *CURRENT STATUS:* \`${status}\`

*USAGE:*
> *${botPrefix}antistatusmention on - Warn users*
> *${botPrefix}antistatusmention delete - Delete mentions*
> *${botPrefix}antistatusmention kick - Kick instantly*
> *${botPrefix}antistatusmention null - Silent delete*
> *${botPrefix}antistatusmention off - Disable*

*OPTIONS:*
> \`on/warn\` *- Warn user for status mentions*
> \`delete\` *- Auto delete status mentions*
> \`kick\` *- Remove user instantly*
> \`null\` *- Silent delete, no warning*
> \`off\` *- Disable protection*`
      });
    }

    const mode = modeMap[input];
    if (!mode) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID MODE*\n*USE:* `on / warn / delete / kick / null / off`" });

    try {
      await setGroupSetting(from, "ANTIGROUPMENTION", mode);
      if (mode === "off") return await sock.sendMessage(from, { text: "✅ *ANTI STATUS MENTION DISABLED*\n*INFO:* Protection is now OFF" });

      const messages = {
        warn: `✅ *ANTI STATUS MENTION ENABLED*\n*MODE:* \`WARN\`\n*INFO:* Users warned for status mentions`,
        delete: `✅ *ANTI STATUS MENTION ENABLED*\n*MODE:* \`DELETE\`\n*INFO:* Status mentions auto deleted`,
        kick: `✅ *ANTI STATUS MENTION ENABLED*\n*MODE:* \`KICK\`\n*INFO:* Users removed for status mentions`,
        null: `✅ *ANTI STATUS MENTION ENABLED*\n*MODE:* \`NULL\`\n*INFO:* Mentions deleted silently`,
      };
      return await sock.sendMessage(from, { text: messages[mode] });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANTI STATUS MENTION WARN COUNT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antigroupmentionwarn",
    aliases: ["agmwarn", "statusmentionwarn", "antigcmentionwarn"],
    react: "⚙️",
    category: "protection",
    description: "Set anti-status-mention warning count before kick",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const current = (await getGroupSetting(from, "ANTIGROUPMENTION_WARN_COUNT")) || _envWarnFallback();

    if (!q) {
      return await sock.sendMessage(from, {
        text: `⚙️ *ANTI STATUS MENTION WARN COUNT*
📊 *CURRENT VALUE:* \`${current}\`

*USAGE:*
> *${botPrefix}antigroupmentionwarn 3*

*INFO:*
> \`1-10\` *- Number of warnings before kick*`
      });
    }

    const count = parseInt(q);
    if (isNaN(count) || count < 1 || count > 10) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID NUMBER*\n*USE:* Number between 1-10" });
    if (current === count.toString()) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*COUNT:* Warn count is already ${count}` });

    try {
      await setGroupSetting(from, "ANTIGROUPMENTION_WARN_COUNT", count.toString());
      return await sock.sendMessage(from, { text: `✅ *WARN COUNT UPDATED*\n*COUNT:* \`${count}\`\n*INFO:* Users kicked after ${count} warnings` });
    } catch (error) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━
// ANTI LINK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antilink",
    react: "🛡️",
    aliases: ["setantilink", "linkblock", "antilinks"],
    category: "protection",
    description: "Manage anti-link protection",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;

    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    let input = (q || "").toLowerCase().trim();
    // Alternate argument forms
    const _alias = { enable: "on", true: "on", disable: "off", false: "off", remove: "kick" };
    if (_alias[input]) input = _alias[input];
    const modeMap = { on: "warn", delete: "delete", warn: "warn", kick: "kick", null: "null", off: "off" };

    if (/^limit\s+\d+$/.test(input)) {
      const n = parseInt(input.split(/\s+/)[1], 10);
      if (n < 1 || n > 10) return reply("❌ Limit must be between 1 and 10.");
      await setGroupSetting(from, "ANTILINK_WARN_COUNT", String(n));
      return reply(`✅ Anti-link warn limit set to *${n}*`);
    }

    if (!input) {
      const current = await getGroupSetting(from, "ANTILINK");
      const status =!current || current === "off"? "OFF" : `ON - ${current.toUpperCase()}`;
      const warnCount = (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || parseInt(_envWarnFallback());
      return await sock.sendMessage(from, {
        text: `🔗 *ANTI LINK PROTECTION*
📊 *CURRENT STATUS:* \`${status}\`
⚠️ *WARN LIMIT:* \`${warnCount}\`

*USAGE:*
> *${botPrefix}antilink on - Warn on links*
> *${botPrefix}antilink delete - Delete links*
> *${botPrefix}antilink kick - Kick instantly*
> *${botPrefix}antilink null - Silent delete*
> *${botPrefix}antilink off - Disable*

*OPTIONS:*
> \`on/warn\` *- Warn user before kick*
> \`delete\` *- Auto delete links*
> \`kick\` *- Remove user instantly*
> \`null\` *- Silent delete*
> \`off\` *- Disable protection*

*WHITELIST/BLACKLIST:*
> \`${botPrefix}antilink allowed youtube.com\` *- Allow domains*
> \`${botPrefix}antilink disallowed t.me\` *- Block domains*
> \`${botPrefix}antilink reset\` *- Clear lists*
> \`${botPrefix}antilink status\` *- Show full status*`
      });
    }

    if (input.startsWith("allowed") || input.startsWith("whitelist")) {
      const rest = input.replace(/^(allowed|whitelist)\s*/, "").trim();
      if (!rest) {
        const raw = await getGroupSetting(from, "ANTILINK_ALLOWED");
        const list = raw && raw!== "0"? raw.split(",").map(d => d.trim()).filter(Boolean) : [];
        return await sock.sendMessage(from, { text: list.length? `✅ *WHITELIST (${list.length})*\n${list.map(d => `> \`${d}\``).join("\n")}` : "📭 *WHITELIST EMPTY*" });
      }
      const incoming = rest.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
      const raw = await getGroupSetting(from, "ANTILINK_ALLOWED");
      const existing = raw && raw!== "0"? raw.split(",").map(d => d.trim()).filter(Boolean) : [];
      const merged = [...new Set([...existing,...incoming])];
      await setGroupSetting(from, "ANTILINK_ALLOWED", merged.join(","));
      return await sock.sendMessage(from, { text: `✅ *WHITELIST UPDATED*\n*TOTAL:* \`${merged.length}\` *domains*\n\n${merged.map(d => `> \`${d}\``).join("\n")}` });
    }

    if (input.startsWith("disallowed") || input.startsWith("blacklist")) {
      const rest = input.replace(/^(disallowed|blacklist)\s*/, "").trim();
      if (!rest) {
        const raw = await getGroupSetting(from, "ANTILINK_DISALLOWED");
        const list = raw && raw!== "0"? raw.split(",").map(d => d.trim()).filter(Boolean) : [];
        return await sock.sendMessage(from, { text: list.length? `🙅‍♂️ *BLACKLIST (${list.length})*\n${list.map(d => `> \`${d}\``).join("\n")}` : "📭 *BLACKLIST EMPTY*" });
      }
      const incoming = rest.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
      const raw = await getGroupSetting(from, "ANTILINK_DISALLOWED");
      const existing = raw && raw!== "0"? raw.split(",").map(d => d.trim()).filter(Boolean) : [];
      const merged = [...new Set([...existing,...incoming])];
      await setGroupSetting(from, "ANTILINK_DISALLOWED", merged.join(","));
      return await sock.sendMessage(from, { text: `✅ *BLACKLIST UPDATED*\n*TOTAL:* \`${merged.length}\` *domains*\n\n${merged.map(d => `> \`${d}\``).join("\n")}` });
    }

    if (input === "reset" || input === "clear") {
      await setGroupSetting(from, "ANTILINK_ALLOWED", "0");
      await setGroupSetting(from, "ANTILINK_DISALLOWED", "0");
      return await sock.sendMessage(from, { text: "✅ *LISTS CLEARED*\n*INFO:* Whitelist and blacklist reset" });
    }

    if (input === "status") {
      const mode = (await getGroupSetting(from, "ANTILINK")) || "off";
      const warnCount = (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || parseInt(_envWarnFallback());
      const allowedRaw = await getGroupSetting(from, "ANTILINK_ALLOWED");
      const blockedRaw = await getGroupSetting(from, "ANTILINK_DISALLOWED");
      const allowed = allowedRaw && allowedRaw!== "0"? allowedRaw.split(",").map(d => d.trim()).filter(Boolean) : [];
      const blocked = blockedRaw && blockedRaw!== "0"? blockedRaw.split(",").map(d => d.trim()).filter(Boolean) : [];
      return await sock.sendMessage(from, {
        text: `🔗 *ANTI LINK STATUS*
📊 *STATUS:* \`${mode === "off"? "OFF" : mode.toUpperCase()}\`
⚠️ *WARN LIMIT:* \`${warnCount}\`

✅ *WHITELIST (${allowed.length}):*
${allowed.length? allowed.map(d => `> \`${d}\``).join("\n") : "> None"}

🙅‍♂️ *BLACKLIST (${blocked.length}):*
${blocked.length? blocked.map(d => `> \`${d}\``).join("\n") : "> None"}`
      });
    }

    const mode = modeMap[input];
    if (!mode) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID MODE*\n*USE:* `on / warn / kick / null / off`" });

    try {
      await setGroupSetting(from, "ANTILINK", mode);
      if (mode === "off") return await sock.sendMessage(from, { text: "✅ *ANTI LINK DISABLED*\n*INFO:* Protection is now OFF" });

      const warnCount = (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || parseInt(_envWarnFallback());
      const messages = {
        delete: `✅ *ANTI LINK ENABLED*\n*MODE:* \`DELETE\`\n*INFO:* Links will be auto deleted`,
        warn: `✅ *ANTI LINK ENABLED*\n*MODE:* \`WARN\`\n*INFO:* Kick after \`${warnCount}\` warnings`,
        kick: `✅ *ANTI LINK ENABLED*\n*MODE:* \`KICK\`\n*INFO:* Link senders removed instantly`,
        null: `✅ *ANTI LINK ENABLED*\n*MODE:* \`NULL\`\n*INFO:* Links deleted silently`,
      };
      return await sock.sendMessage(from, { text: messages[mode] });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANTI BADWORDS
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antibad",
    react: "🛡️",
    aliases: ["setantibad", "badwordfilter", "antibadwords"],
    category: "protection",
    description: "Manage anti-badwords protection",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;

    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();
    const modeMap = { on: "delete", delete: "delete", warn: "warn", kick: "kick", null: "null", off: "off", false: "off" };
    const action = (args[0] || "").toLowerCase();
    const wordArgs = args.slice(1);

    if (["add", "remove", "del", "delete", "list", "clear", "reset", "default", "defaults"].includes(action)) {
      try {
        if (action === "add") {
          if (!wordArgs.length) return await sock.sendMessage(from, { text: `🙅‍♂️ *MISSING WORDS*\n*USAGE:* \`${botPrefix}antibad add word1 word2\`` });
          let added = 0;
          for (const word of wordArgs) { if (word.length >= 2) { await addBadWord(from, word); added++; } }
          return await sock.sendMessage(from, { text: `✅ *WORDS ADDED*\n*COUNT:* \`${added}\` *words added to filter*` });
        }

        if (["remove", "del", "delete"].includes(action)) {
          if (!wordArgs.length) return await sock.sendMessage(from, { text: `🙅‍♂️ *MISSING WORDS*\n*USAGE:* \`${botPrefix}antibad remove word1\`` });
          let removed = 0;
          for (const word of wordArgs) { const ok = await removeBadWord(from, word); if (ok) removed++; }
          return await sock.sendMessage(from, { text: `✅ *WORDS REMOVED*\n*COUNT:* \`${removed}\` *words removed from filter*` });
        }

        if (action === "list") {
          const badWords = await getBadWords(from);
          if (!badWords.length) return await sock.sendMessage(from, { text: `📭 *NO BAD WORDS*\n*INFO:* Use \`${botPrefix}antibad add <word>\` to add` });
          const chunks = [];
          for (let i = 0; i < badWords.length; i += 20) chunks.push(badWords.slice(i, i + 20));
          for (let i = 0; i < chunks.length; i++) {
            const startIdx = i * 20;
            let msg = `🚫 *BAD WORDS LIST (${badWords.length} TOTAL)*\n\n`;
            msg += chunks[i].map((w, idx) => `> \`${startIdx + idx + 1}.\` ${w}`).join("\n");
            await sock.sendMessage(from, { text: msg });
          }
          return;
        }

        if (["clear", "reset"].includes(action)) {
          await clearBadWords(from);
          return await sock.sendMessage(from, { text: "✅ *FILTER CLEARED*\n*INFO:* All bad words removed" });
        }

        if (["default", "defaults"].includes(action)) {
          const added = await initializeDefaultBadWords(from);
          const total = await getBadWords(from);
          return await sock.sendMessage(from, { text: `✅ *DEFAULTS LOADED*\n*ADDED:* \`${added}\` *new words*\n*TOTAL:* \`${total.length}\` *words*` });
        }
      } catch (error) {
        return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
      }
    }

    if (!input ||!modeMap[input]) {
      const current = await getGroupSetting(from, "ANTIBAD");
      const status =!current || current === "off"? "OFF" : `ON - ${current.toUpperCase()}`;
      const warnCount = (await getGroupSetting(from, "ANTIBAD_WARN_COUNT")) || parseInt(_envWarnFallback());
      const badWords = await getBadWords(from);
      return await sock.sendMessage(from, {
        text: `🤬 *ANTI BADWORDS PROTECTION*
📊 *CURRENT STATUS:* \`${status}\`
⚠️ *WARN LIMIT:* \`${warnCount}\`
🚫 *BAD WORDS:* \`${badWords.length}\`

*USAGE:*
> *${botPrefix}antibad on - Delete bad words*
> *${botPrefix}antibad warn - Warn users*
> *${botPrefix}antibad kick - Kick instantly*
> *${botPrefix}antibad null - Silent delete*
> *${botPrefix}antibad off - Disable*

*WORD MANAGEMENT:*
> \`${botPrefix}antibad add <word>\` *- Add words*
> \`${botPrefix}antibad remove <word>\` *- Remove words*
> \`${botPrefix}antibad list\` *- Show all words*
> \`${botPrefix}antibad clear\` *- Clear all*
> \`${botPrefix}antibad default\` *- Load defaults*`
      });
    }

    const mode = modeMap[input];
    try {
      await setGroupSetting(from, "ANTIBAD", mode);
      if (mode === "off") return await sock.sendMessage(from, { text: "✅ *ANTI BADWORDS DISABLED*\n*INFO:* Protection is now OFF" });

      const warnCount = (await getGroupSetting(from, "ANTIBAD_WARN_COUNT")) || parseInt(_envWarnFallback());
      const messages = {
        delete: `✅ *ANTI BADWORDS ENABLED*\n*MODE:* \`DELETE\`\n*INFO:* Bad words auto deleted`,
        warn: `✅ *ANTI BADWORDS ENABLED*\n*MODE:* \`WARN\`\n*INFO:* Kick after \`${warnCount}\` warnings`,
        kick: `✅ *ANTI BADWORDS ENABLED*\n*MODE:* \`KICK\`\n*INFO:* Users removed instantly`,
        null: `✅ *ANTI BADWORDS ENABLED*\n*MODE:* \`NULL\`\n*INFO:* Bad words deleted silently`,
      };
      return await sock.sendMessage(from, { text: messages[mode] });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━
// ANTI DELETE - OWNER ONLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setantidelete",
    aliases: ["antidelete", "antidel", "deletedetect", "deleteset", "antideletesetting"],
    react: "🛡️",
    category: "protection",
    description: "Manage anti-delete settings",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("❌ Owner Only Command!");

    const args = (q || "").trim().split(/\s+/).filter(Boolean);
    const sub = (args[0] || "").toLowerCase();
    const value = args.slice(1).join(" ").trim();
    const onOff = (v) => (["on", "true", "enable"].includes(v) ? true : ["off", "false", "disable"].includes(v) ? false : null);
    const flag = (v) => (v === "false" ? "❌ OFF" : "✅ ON");

    const modeMap = { on: "indm", true: "indm", off: "off", false: "off", pm: "indm", inbox: "indm", indm: "indm", chats: "chats", chat: "chats", inchat: "inchat" };
    const modeName = { indm: "Owner inbox", inchat: "Same chat", chats: "Same chat + owner inbox" };

    const showStatus = async () => {
      const mode = (await getSetting("ANTIDELETE")) || "off";
      const note = (await getSetting("ANTIDELETE_NOTIFICATION")) || "*𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙴𝚂𝚂𝙰𝙶𝙴 𝚂𝚈𝚂𝚃𝙴𝙼*";
      const gi = (await getSetting("ANTIDELETE_GROUPINFO")) || "true";
      const media = (await getSetting("ANTIDELETE_MEDIA")) || "true";
      const enabled = mode !== "off" && mode !== "false";
      return reply(
        `*👿 Anti-Delete Settings*\n\n` +
        `🔹 *Status:* ${enabled ? "✅ ON" : "❌ OFF"}\n` +
        `🔹 *Destination:* ${enabled ? modeName[mode] || mode : "-"}\n` +
        `🔹 *Notification Text:* ${note}\n` +
        `🔹 *Include Group Info:* ${flag(gi)}\n` +
        `🔹 *Include Media Content:* ${flag(media)}\n\n` +
        `*🛠 Usage:*\n` +
        `▸ ${botPrefix}antidelete on/off\n` +
        `▸ ${botPrefix}antidelete inbox|inchat|chats\n` +
        `▸ ${botPrefix}antidelete <jid>\n` +
        `▸ ${botPrefix}antidelete notification <text>\n` +
        `▸ ${botPrefix}antidelete groupinfo on/off\n` +
        `▸ ${botPrefix}antidelete media on/off\n` +
        `▸ ${botPrefix}antidelete inbox on/off`
      );
    };

    try {
      if (!sub || sub === "status") return await showStatus();

      if (sub === "notification") {
        if (!value) return reply("❌ Provide a notification text.");
        await setSetting("ANTIDELETE_NOTIFICATION", value);
        return reply(`✅ Notification updated:\n\n"${value}"`);
      }

      if (sub === "groupinfo" || sub === "media") {
        const v = onOff(value.toLowerCase());
        if (v === null) return reply('❌ Use "on" or "off".');
        const key = sub === "groupinfo" ? "ANTIDELETE_GROUPINFO" : "ANTIDELETE_MEDIA";
        await setSetting(key, v ? "true" : "false");
        return reply(`✅ ${sub === "groupinfo" ? "Group info inclusion" : "Media content inclusion"} ${v ? "enabled" : "disabled"}.`);
      }

      // "inbox on/off": on -> owner inbox, off -> reappear in same chat
      if (sub === "inbox" && value) {
        const v = onOff(value.toLowerCase());
        if (v === null) return reply('❌ Use "on" or "off".');
        await setSetting("ANTIDELETE", v ? "indm" : "inchat");
        return reply(`✅ Send to owner inbox ${v ? "enabled" : "disabled (deleted messages reappear in the same chat)"}.`);
      }

      let mode;
      if (modeMap[sub] !== undefined) mode = modeMap[sub];
      else if (sub.endsWith("@s.whatsapp.net") || sub.endsWith("@g.us")) mode = sub;
      else {
        return reply("❌ Invalid subcommand. Send " + botPrefix + "antidelete to see the options.");
      }

      const current = await getSetting("ANTIDELETE");
      if (current === mode) return reply(`⚠️ Anti-delete is already ${mode === "off" ? "disabled" : "set to " + (modeName[mode] || mode)}.`);
      await setSetting("ANTIDELETE", mode);
      if (mode === "off") return reply("✅ Anti-delete has been disabled.");
      return reply(`✅ Anti-delete enabled.\n🔹 *Destination:* ${modeName[mode] || mode}`);
    } catch (e) {
      console.error("[antidelete cmd]", e);
      return reply(`🙅‍♂️ *ERROR:* ${e.message}`);
    }
  }
);

// ━━━━━━━━━━━━━━━
// ANTI EDIT - OWNER ONLY
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setantiedit",
    aliases: ["antiedit", "editdetect", "noedit"],
    react: "🛡️",
    category: "protection",
    description: "Manage anti-edit system",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isSuperUser) return await sock.sendMessage(from, { text: "🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!" });

    const input = (q || "").trim().toLowerCase();
    const modeMap = { on: "pm", off: "off", false: "off", pm: "indm", inbox: "indm", indm: "indm", chats: "chats", chat: "chats", inchat: "inchat" };

    let value;
    if (modeMap[input]!== undefined) {
      value = modeMap[input];
    } else if (input.endsWith("@s.whatsapp.net") || input.endsWith("@g.us")) {
      value = input;
    } else {
      const current = await getSetting("ANTI_EDIT");
      return await sock.sendMessage(from, {
        text: `✏️ *ANTI EDIT SYSTEM*
📊 *CURRENT STATUS:* \`${current || "OFF"}\`

*USAGE:*
> *${botPrefix}antiedit on - Enable*
> *${botPrefix}antiedit off - Disable*
> *${botPrefix}antiedit pm - Owner DM*
> *${botPrefix}antiedit chats - Group + DM*
> *${botPrefix}antiedit <jid> - Custom target*

*MODES:*
> \`on\` *- Enable protection*
> \`pm/inbox\` *- Forward edited msgs to owner DM*
> \`chats/chat\` *- Show in group + owner DM*
> \`inchat\` *- Show edited msg in same chat*
> \`off\` *- Disable protection*
> \`<jid>\` *- Send to custom chat*`
      });
    }

    try {
      const current = await getSetting("ANTI_EDIT");
      if (current === value) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*STATUS:* Anti-Edit is already ${value.toUpperCase()}` });

      await setSetting("ANTI_EDIT", value);
      if (value === "off") return await sock.sendMessage(from, { text: "✅ *ANTI EDIT DISABLED*\n*INFO:* Protection is now OFF" });

      const messages = {
        indm: `✅ *ANTI EDIT ENABLED*\n*MODE:* \`OWNER DM\`\n*INFO:* Edited messages forwarded to inbox`,
        inchat: `✅ *ANTI EDIT ENABLED*\n*MODE:* \`SAME CHAT\`\n*INFO:* Edited messages shown in same chat`,
        chats: `✅ *ANTI EDIT ENABLED*\n*MODE:* \`GROUP + DM\`\n*INFO:* Shown in both places`,
      };
      return await sock.sendMessage(from, { text: messages[value] || `✅ *ANTI EDIT ENABLED*\n*MODE:* \`CUSTOM CHAT\`\n*TARGET:* \`${value}\`` });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━
// ANTI VIEWONCE - OWNER ONLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "setantiviewonce",
    aliases: ["antiviewonce", "antiview", "noviewonce"],
    react: "👁️",
    category: "protection",
    description: "Manage anti-view-once system",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isSuperUser) return await sock.sendMessage(from, { text: "🙅‍♂️ *OWNER ONLY*\n*INFO:* This command is for bot owner only!" });

    const input = (q || "").trim().toLowerCase();
    const modeMap = { on: "inbox", off: "off", false: "off", inbox: "inbox", pm: "inbox", indm: "inbox", inchat: "inchat", chats: "chats" };

    let value;
    if (modeMap[input]!== undefined) {
      value = modeMap[input];
    } else if (input.endsWith("@s.whatsapp.net") || input.endsWith("@g.us")) {
      value = input;
    } else {
      const current = await getSetting("ANTIVIEWONCE");
      return await sock.sendMessage(from, {
        text: `👁️ *ANTI VIEWONCE SYSTEM*
📊 *CURRENT STATUS:* \`${current || "INBOX"}\`

*USAGE:*
> *${botPrefix}antiviewonce on - Owner DM*
> *${botPrefix}antiviewonce inbox - Owner DM*
> *${botPrefix}antiviewonce inchat - Same chat*
> *${botPrefix}antiviewonce chats - Both*
> *${botPrefix}antiviewonce off - Disable*
> *${botPrefix}antiviewonce <jid> - Custom target*

*MODES:*
> \`on/inbox/pm\` *- Forward to owner DM*
> \`inchat\` *- Reveal in same chat*
> \`chats\` *- Both DM + same chat*
> \`off\` *- Disable protection*
> \`<jid>\` *- Send to custom chat*`
      });
    }

    try {
      const current = await getSetting("ANTIVIEWONCE");
      if (current === value) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*STATUS:* Anti-ViewOnce is already ${value.toUpperCase()}` });

      await setSetting("ANTIVIEWONCE", value);
      if (value === "off") return await sock.sendMessage(from, { text: "✅ *ANTI VIEWONCE DISABLED*\n*INFO:* Protection is now OFF" });

      const messages = {
        inbox: `✅ *ANTI VIEWONCE ENABLED*\n*MODE:* \`OWNER DM\`\n*INFO:* View-once media forwarded to inbox`,
        inchat: `✅ *ANTI VIEWONCE ENABLED*\n*MODE:* \`SAME CHAT\`\n*INFO:* View-once revealed in same chat`,
        chats: `✅ *ANTI VIEWONCE ENABLED*\n*MODE:* \`GLOBAL\`\n*INFO:* Revealed in both DM + same chat`,
      };
      return await sock.sendMessage(from, { text: messages[value] || `✅ *ANTI VIEWONCE ENABLED*\n*MODE:* \`CUSTOM CHAT\`\n*TARGET:* \`${value}\`` });
    } catch (e) {
      console.error(e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━
// BAD WORDS LIST MANAGER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "badwords",
    aliases: ["setbadwords", "badword", "profanity"],
    react: "🚫",
    category: "protection",
    description: "Manage bad words list",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    
    const action = (args[0] || "").toLowerCase();
    const words = args.slice(1);
    const validActions = ["add", "remove", "del", "delete", "list", "clear", "reset", "default", "defaults"];

    if (!action ||!validActions.includes(action)) {
      const badWords = await getBadWords(from);
      let listPreview = "_No bad words set_";
      if (badWords.length > 0) {
        listPreview = badWords.slice(0, 15).map((w, i) => `> \`${i + 1}.\` ${w}`).join("\n");
        if (badWords.length > 15) listPreview += `\n>... *and ${badWords.length - 15} more*`;
      }

      return await sock.sendMessage(from, {
        text: `🚫 *BAD WORDS MANAGER*
📊 *TOTAL WORDS:* \`${badWords.length}\`

*USAGE:*
> *${botPrefix}badwords add <word> - Add words*
> *${botPrefix}badwords remove <word> - Remove words*
> *${botPrefix}badwords list - Show all words
> *${botPrefix}badwords clear - Clear all*
> *${botPrefix}badwords default - Load defaults*

*CURRENT LIST:*
${listPreview}`
      });
    }

    try {
      if (action === "add") {
        if (!words.length) return await sock.sendMessage(from, { text: `🙅‍♂️ *MISSING WORDS*\n*USAGE:* \`${botPrefix}badwords add word1 word2\`` });
        let added = 0;
        for (const word of words) { if (word.length >= 2) { await addBadWord(from, word); added++; } }
        return await sock.sendMessage(from, { text: `✅ *WORDS ADDED*\n*COUNT:* \`${added}\` *words added to filter*` });
      }

      if (["remove", "del", "delete"].includes(action)) {
        if (!words.length) return await sock.sendMessage(from, { text: `🙅‍♂️ *MISSING WORDS*\n*USAGE:* \`${botPrefix}badwords remove word1\`` });
        let removed = 0;
        for (const word of words) { const ok = await removeBadWord(from, word); if (ok) removed++; }
        return await sock.sendMessage(from, { text: `✅ *WORDS REMOVED*\n*COUNT:* \`${removed}\` *words removed from filter*` });
      }

      if (action === "list") {
        const badWords = await getBadWords(from);
        if (!badWords.length) return await sock.sendMessage(from, { text: `📭 *NO BAD WORDS*\n*INFO:* Use \`${botPrefix}badwords add <word>\` to add` });
        const chunks = [];
        for (let i = 0; i < badWords.length; i += 20) chunks.push(badWords.slice(i, i + 20));
        for (let i = 0; i < chunks.length; i++) {
          const startIdx = i * 20;
          let msg = `🚫 *BAD WORDS LIST (${badWords.length} TOTAL)*\n\n`;
          msg += chunks[i].map((w, idx) => `> \`${startIdx + idx + 1}.\` ${w}`).join("\n");
          await sock.sendMessage(from, { text: msg });
        }
        return;
      }

      if (["clear", "reset"].includes(action)) {
        await clearBadWords(from);
        return await sock.sendMessage(from, { text: "✅ *FILTER CLEARED*\n*INFO:* All bad words removed for this group" });
      }

      if (["default", "defaults"].includes(action)) {
        const added = await initializeDefaultBadWords(from);
        const total = await getBadWords(from);
        return await sock.sendMessage(from, { text: `✅ *DEFAULTS LOADED*\n*ADDED:* \`${added}\` *new words*\n*TOTAL:* \`${total.length}\` *words*` });
      }
    } catch (error) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━
// ANTILINK WARN COUNT
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antilinkwarn",
    aliases: ["setwarncount", "warncount", "antilinkwarncount", "warnlimit"],
    react: "⚙️",
    category: "protection",
    description: "Set antilink warning count before kick",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const current = (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || _envWarnFallback();

    if (!q) {
      return await sock.sendMessage(from, {
        text: `⚙️ *ANTI LINK WARN COUNT*
📊 *CURRENT VALUE:* \`${current}\`

*USAGE:*
> *${botPrefix}antilinkwarn 3*

*INFO:*
> \`1-10\` *- Number of warnings before kick*`
      });
    }

    const count = parseInt(q);
    if (isNaN(count) || count < 1 || count > 10) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID NUMBER*\n*USE:* Number between 1-10" });
    if (current === count.toString()) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*COUNT:* Warn count is already ${count}` });

    try {
      await setGroupSetting(from, "ANTILINK_WARN_COUNT", count.toString());
      return await sock.sendMessage(from, { text: `✅ *WARN COUNT UPDATED*\n*COUNT:* \`${count}\`\n*INFO:* Users kicked after ${count} warnings` });
    } catch (error) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━
// ANTIBAD WARN COUNT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antibadwarn",
    aliases: ["badwarncount", "antibadwarncount", "setbadwarn"],
    react: "⚙️",
    category: "protection",
    description: "Set anti-badwords warning count before kick",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const current = (await getGroupSetting(from, "ANTIBAD_WARN_COUNT")) || _envWarnFallback();

    if (!q) {
      return await sock.sendMessage(from, {
        text: `⚙️ *ANTI BADWORDS WARN COUNT*
📊 *CURRENT VALUE:* \`${current}\`

*USAGE:*
> *${botPrefix}antibadwarn 3*

*INFO:*
> \`1-10\` *- Number of warnings before kick*`
      });
    }

    const count = parseInt(q);
    if (isNaN(count) || count < 1 || count > 10) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID NUMBER*\n*USE:* Number between 1-10" });
    if (current === count.toString()) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*COUNT:* Warn count is already ${count}` });

    try {
      await setGroupSetting(from, "ANTIBAD_WARN_COUNT", count.toString());
      return await sock.sendMessage(from, { text: `✅ *WARN COUNT UPDATED*\n*COUNT:* \`${count}\`\n*INFO:* Users kicked after ${count} warnings` });
    } catch (error) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━
// ANTI PROMOTE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antipromote",
    react: "🛡️",
    category: "protection",
    description: "Toggle anti-promote protection",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isBotAdmin) return await sock.sendMessage(from, { text: "🙅‍♂️ *BOT NOT ADMIN*\n*INFO:* Please make bot an admin first!" });
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const action = (args[0] || "").toLowerCase();
    const rawCurrent = await getGroupSetting(from, "ANTIPROMOTE");
    const current = rawCurrent === "true"? "true" : "false";

    if (!action ||!["on", "off"].includes(action)) {
      return await sock.sendMessage(from, {
        text: `🛡️ *ANTI PROMOTE PROTECTION*
📊 *CURRENT STATUS:* \`${current === "true"? "ON" : "OFF"}\`

*USAGE:*
> *${botPrefix}antipromote on - Enable*
> *${botPrefix}antipromote off - Disable*

*INFO:*
> When enabled, if someone promotes a user both will be demoted instantly`
      });
    }

    const value = action === "on"? "true" : "false";
    if (current === value) return await sock.sendMessage(from, { text: `⚠️ *ALREADY ${action.toUpperCase()}*\n*STATUS:* Anti-Promote is already ${action === "on"? "Enabled" : "Disabled"}` });

    await setGroupSetting(from, "ANTIPROMOTE", value);
    return await sock.sendMessage(from, { text: `✅ *ANTI PROMOTE ${action === "on"? "ENABLED" : "DISABLED"}*\n*INFO:* Protection is now ${action === "on"? "ON" : "OFF"}` });
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANTI DEMOTE
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "antidemote",
    react: "🛡️",
    category: "protection",
    description: "Toggle anti-demote protection",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isBotAdmin) return await sock.sendMessage(from, { text: "🙅‍♂️ *BOT NOT ADMIN*\n*INFO:* Please make bot an admin first!" });
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const action = (args[0] || "").toLowerCase();
    const rawCurrent = await getGroupSetting(from, "ANTIDEMOTE");
    const current = rawCurrent === "true"? "true" : "false";

    if (!action ||!["on", "off"].includes(action)) {
      return await sock.sendMessage(from, {
        text: `🛡️ *ANTI DEMOTE PROTECTION*
📊 *CURRENT STATUS:* \`${current === "true"? "ON" : "OFF"}\`

*USAGE:*
> *${botPrefix}antidemote on - Enable*
> *${botPrefix}antidemote off - Disable*

*INFO:*
> When enabled, if someone demotes an admin they get demoted and the admin is re-promoted`
      });
    }

    const value = action === "on"? "true" : "false";
    if (current === value) return await sock.sendMessage(from, { text: `⚠️ *ALREADY ${action.toUpperCase()}*\n*STATUS:* Anti-Demote is already ${action === "on"? "Enabled" : "Disabled"}` });

    await setGroupSetting(from, "ANTIDEMOTE", value);
    return await sock.sendMessage(from, { text: `✅ *ANTI DEMOTE ${action === "on"? "ENABLED" : "DISABLED"}*\n*INFO:* Protection is now ${action === "on"? "ON" : "OFF"}` });
  }
);

// ━━━━━━━━━━━━━━━
// WARN SYSTEM
// ━━━━━━━━━━━━━━━
cmd(
  {
    pattern: "warn",
    react: "⚠️",
    category: "protection",
    description: "Manually warn a group member",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

    let target = (mentionedJid && mentionedJid[0]) || quotedUser || null;
    if (!target) return await sock.sendMessage(from, { text: `🙅‍♂️ *MISSING TARGET*\n*USAGE:* \`${botPrefix}warn @user [reason]\`` });
    target = await _resolveSenderJid(sock, target);
    const senderNum = target.split("@")[0];
    const reason = args.filter(a =>!a.startsWith("@")).join(" ").trim() || "No reason provided";

    try {
      const warnLimit = parseInt(await getGroupSetting(from, "WARN_LIMIT")) || parseInt(_envWarnFallback());
      const currentWarns = await addWarning(from, target, reason);

      if (currentWarns >= warnLimit) {
        try {
          await sock.groupParticipantsUpdate(from, [target], "remove");
          await resetWarning(from, target);
          return await sock.sendMessage(from, {
            text: `🚫 *USER KICKED*\n*USER:* @${senderNum}\n*REASON:* Reached ${warnLimit} warnings\n*LAST REASON:* ${reason}`,
            mentions: [target]
          });
        } catch {
          return await sock.sendMessage(from, {
            text: `⚠️ *KICK FAILED*\n*USER:* @${senderNum}\n*STATUS:* Reached ${currentWarns}/${warnLimit} warnings but could not be kicked`,
            mentions: [target]
          });
        }
      }

      const remaining = warnLimit - currentWarns;
      return await sock.sendMessage(from, {
        text: `⚠️ *USER WARNED*\n*USER:* @${senderNum}\n*WARNINGS:* ${currentWarns}/${warnLimit}\n*REMAINING:* ${remaining}\n*REASON:* ${reason}`,
        mentions: [target]
      });
    } catch (e) {
      console.error("warn command error:", e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

cmd(
  {
    pattern: "unwarn",
    react: "♻️",
    aliases: ["removewarn", "delwarn"],
    category: "protection",
    description: "Remove one warning from a group member",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    let target = (mentionedJid && mentionedJid[0]) || quotedUser || null;
    if (!target) return await sock.sendMessage(from, { text: `🙅‍♂️ *MISSING TARGET*\n*USAGE:* \`${botPrefix}unwarn @user\`` });
    target = await _resolveSenderJid(sock, target);
    const senderNum = target.split("@")[0];

    try {
      const newCount = await removeWarning(from, target);
      return await sock.sendMessage(from, {
        text: `✅ *WARNING REMOVED*\n*USER:* @${senderNum}\n*CURRENT WARNINGS:* \`${newCount}\``,
        mentions: [target]
      });
    } catch (e) {
      console.error("unwarn command error:", e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

cmd(
  {
    pattern: "getwarn",
    react: "📋",
    aliases: ["warnings", "checkwarn", "mywarn"],
    category: "protection",
    description: "Check a group member's warning count",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");

    let target = (mentionedJid && mentionedJid[0]) || quotedUser || sender;
    target = await _resolveSenderJid(sock, target);
    const senderNum = target.split("@")[0];

    try {
      const warnLimit = parseInt(await getGroupSetting(from, "WARN_LIMIT")) || parseInt(_envWarnFallback());
      const count = await getWarningCount(from, target);
      return await sock.sendMessage(from, {
        text: `📋 *WARNING STATUS*\n*USER:* @${senderNum}\n*WARNINGS:* \`${count}/${warnLimit}\`\n*REMAINING:* \`${Math.max(warnLimit - count, 0)}\``,
        mentions: [target]
      });
    } catch (e) {
      console.error("getwarn command error:", e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

cmd(
  {
    pattern: "resetwarn",
    react: "🔄",
    aliases: ["clearwarn", "warnreset"],
    category: "protection",
    description: "Reset warnings for a user or the whole group",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const input = (args[0] || "").toLowerCase();

    if (input === "all" || input === "everyone") {
      try {
        const all = await getAllWarnings(from);
        const targets = Object.keys(all || {});
        for (const jid of targets) await resetWarning(from, jid);
        return await sock.sendMessage(from, { text: `✅ *ALL WARNINGS RESET*\n*COUNT:* \`${targets.length}\` *users cleared*` });
      } catch (e) {
        return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
      }
    }

    let target = (mentionedJid && mentionedJid[0]) || quotedUser || null;
    if (!target) return await sock.sendMessage(from, { text: `🙅‍♂️ *MISSING TARGET*\n*USAGE:* \`${botPrefix}resetwarn @user\`\n\`${botPrefix}resetwarn all\`` });
    target = await _resolveSenderJid(sock, target);
    const senderNum = target.split("@")[0];

    try {
      await resetWarning(from, target);
      return await sock.sendMessage(from, {
        text: `✅ *WARNINGS RESET*\n*USER:* @${senderNum}`,
        mentions: [target]
      });
    } catch (e) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  🆕 WARN LIMIT — set how many manual .warn's before auto-kick
//  Usage: .warnlimit 3
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
  {
    pattern: "setwarnlimit",
    aliases: ["warnlimitset"],
    react: "⚙️",
    category: "protection",
    description: "Set manual-warn kick threshold for this group",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");

    const current = (await getGroupSetting(from, "WARN_LIMIT")) || _envWarnFallback();

    if (!q) {
      return await sock.sendMessage(from, {
        text: `⚙️ *SETWARNLIMIT* 
📊 *CURRENT LIMIT:* \`${current}\`

*USAGE:*
> *${botPrefix}setwarnlimit 3 - Set manual warn kick threshold*

*INFO:*
> \`1-10\` *- Range for warning limit*
> *NOTE:* Applies to .warn / .getwarn only
> *NOTE:* Antilink/Antibad have their own limits`
      });
    }

    const count = parseInt(q);
    if (isNaN(count) || count < 1 || count > 10) return await sock.sendMessage(from, { text: "🙅‍♂️ *INVALID NUMBER*\n*USE:* Number between 1-10" });
    if (current === count.toString()) return await sock.sendMessage(from, { text: `⚠️ *ALREADY SET*\n*LIMIT:* Warn limit is already ${count}` });

    try {
      await setGroupSetting(from, "WARN_LIMIT", count.toString());
      return await sock.sendMessage(from, { text: `✅ *LIMIT UPDATED*\n*VALUE:* \`${count}\`\n*INFO:* Users will be kicked after ${count} manual warnings` });
    } catch (error) {
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${error.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  🆕 SET WARN MESSAGE — customize the global WARN_MESSAGE template
//  Used by GiftedWarnSystem() in lib/gmdHelpers.js for ALL modules
//  (antilink, antibad, antisticker, antigroupmention, manual .warn)
//
//  Placeholders: &mention &warn &limit &remaining &reason
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
  {
    pattern: "setwarnmsg",
    aliases: ["warnmsg", "warnmessage", "setwarnmessage"],
    react: "📝",
    category: "protection",
    description: "Customize the warning message template",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

    if (!q) {
      const current = await getSetting("WARN_MESSAGE");
      return await sock.sendMessage(from, {
        text: `📝 *SETWARNMSG* 
📊 *CURRENT TEMPLATE:* \`${current || "DEFAULT"}\`

*USAGE:*
> *${botPrefix}setwarnmsg text - Set custom warn message*
> *${botPrefix}setwarnmsg - Show current template + placeholders*
> *${botPrefix}setwarnmsg reset - Restore default template*

*PLACEHOLDERS:*
> \`&mention\` *- @user being warned*
> \`&warn\` *- Current warn count*
> \`&limit\` *- Max warn limit*
> \`&remaining\` *- Warnings left before kick*
> \`&reason\` *- Reason for warning*

*EXAMPLE:*
> *${botPrefix}setwarnmsg ⚠️ *WARNING*
> *User:* &mention
> *Warn:* &warn/&limit
> *Remaining:* &remaining
> *Reason:* &reason`
      });
    }

    if (q.trim().toLowerCase() === "reset") {
      await setSetting("WARN_MESSAGE", "");
      return await sock.sendMessage(from, { text: "✅ *RESET SUCCESSFUL*\n*INFO:* Warn message reset to default template" });
    }

    if (!q.includes("&mention")) {
      return await sock.sendMessage(from, { text: "⚠️ *WARNING*\n*INFO:* Template should include `&mention` to ping user. Re-run with same text to confirm save." });
    }

    try {
      await setSetting("WARN_MESSAGE", q);
      const preview = q
        .replace(/&mention/g, "@user")
        .replace(/&warn/g, "2")
        .replace(/&limit/g, "3")
        .replace(/&remaining/g, "1")
        .replace(/&reason/g, "Link");
      return await sock.sendMessage(from, { 
        text: `✅ *TEMPLATE UPDATED*\n*INFO:* Warn message updated successfully\n\n🛡️ *PREVIEW:*\n${preview}` 
      });
    } catch (e) {
      console.error("setwarnmsg error:", e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  🆕 SET KICK MESSAGE — customize the global KICK_MESSAGE template
//  Used by GiftedWarnSystem() when a user hits the warn limit
//
//  Placeholders: &mention &warn &limit &reason
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
  {
    pattern: "setkickmsg",
    aliases: ["kickmsg", "kickmessage", "setkickmessage"],
    react: "📝",
    category: "protection",
    description: "Customize the auto-kick message template",
  },
  async (from, sock, conText) => {
    const {
  q,
  args,
  reply,
  sender,
  fromMe,
  pushName,
  mentionedJid,
  quotedUser,
  isGroup,
  isAdmin,
  isSuperAdmin,
  isSuperUser,
  isBotAdmin,
  botPrefix,
} = conText;
    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

    if (!q) {
      const current = await getSetting("KICK_MESSAGE");
      return await sock.sendMessage(from, {
        text: `📝 *SETKICKMSG* 
📊 *CURRENT TEMPLATE:* \`${current || "DEFAULT"}\`

*USAGE:*
> *${botPrefix}setkickmsg text - Set custom kick message*
> *${botPrefix}setkickmsg - Show current template + placeholders*
> *${botPrefix}setkickmsg reset - Restore default template*

*PLACEHOLDERS:*
> \`&mention\` *- @user being kicked*
> \`&warn\` *- Final warn count*
> \`&limit\` *- Max warn limit*
> \`&reason\` *- Reason for kick*

*EXAMPLE:*
> *${botPrefix}setkickmsg 🚫 *KICKED*
> *User:* &mention
> *Reason:* &reason
> Reached &limit warnings and has been removed.`
      });
    }

    if (q.trim().toLowerCase() === "reset") {
      await setSetting("KICK_MESSAGE", "");
      return await sock.sendMessage(from, { text: "✅ *RESET SUCCESSFUL*\n*INFO:* Kick message reset to default template" });
    }

    try {
      await setSetting("KICK_MESSAGE", q);
      const preview = q
        .replace(/&mention/g, "@user")
        .replace(/&warn/g, "3")
        .replace(/&limit/g, "3")
        .replace(/&reason/g, "Link");
      return await sock.sendMessage(from, { 
        text: `✅ *TEMPLATE UPDATED*\n*INFO:* Kick message updated successfully\n\n🛡️ *PREVIEW:*\n${preview}` 
      });
    } catch (e) {
      console.error("setkickmsg error:", e);
      return await sock.sendMessage(from, { text: `🙅‍♂️ *ERROR:* ${e.message}` });
    }
  }
);
