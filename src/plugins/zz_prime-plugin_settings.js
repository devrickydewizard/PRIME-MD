// PRIME-plugin settings: alias table + a few commands mapped onto PRIME's own settings.
const { cmd, commands } = require("../lib");
const { getSetting, setSetting } = require("../lib/database/settings");

// extra aliases that PRIME lacked -> attach them to the equivalent PRIME command.
const ALIAS_PAIRS = [["antibot", "antib"], ["antibot", "nobot"], ["botsettings", "configlist"], ["botsettings", "settingslist"], ["antispam", "spamguard"], ["antispam", "nospam"], ["anticall", "callblock"], ["anticall", "blockcalls"], ["autoblock", "blockwords"], ["autoblock", "autoban"], ["antibad", "filter"], ["antibad", "antiprofanity"], ["antitag", "antiment"], ["antitag", "notag"], ["antisticker", "antistick"], ["antisticker", "antis"], ["chatbot", "chatai"], ["chatbot", "bot"], ["events", "gevents"], ["antistatusmention", "antistatus"], ["antistatusmention", "statusguard"], ["antilink", "linkguard"], ["listnote", "shownotes"], ["clearnotes", "resetnotes"], ["botpic", "boturl"], ["botpic", "botprofile"], ["autoread", "setread"], ["autobio", "setbio"], ["uptime", "up"], ["ping", "latency"], ["resetdb", "cleardb"], ["resetdb", "refreshdb"], ["restart", "startbot"], ["update", "upgrade"], ["warn", "warning"], ["warn", "strike"], ["antidemote", "antidem"], ["antidemote", "nodemote"], ["antipromote", "antiprom"], ["antipromote", "nopromote"]];
(function mergeAliases() {
  const taken = new Set();
  commands.forEach((c) => { [c.pattern, ...(c.aliases || [])].filter(Boolean).forEach((n) => taken.add(String(n).toLowerCase())); });
  for (const [pattern, alias] of ALIAS_PAIRS) {
    const target = commands.find((c) => c.pattern === pattern || (c.aliases || []).includes(pattern));
    if (!target || taken.has(alias.toLowerCase())) continue;
    target.aliases = [...(target.aliases || []), alias];
    taken.add(alias.toLowerCase());
  }
})();

cmd(
  {
    pattern: "presence",
    aliases: ["setpresence", "mypresence"],
    react: "🔄",
    category: "owner",
    description: "Set bot presence: off / online / typing / recording",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("❌ Owner Only Command!");
    const input = (q || "").trim().toLowerCase().split(/\s+/).pop();
    const map = { off: "offline", offline: "offline", online: "online", typing: "typing", recording: "recording" };
    if (!input || !map[input]) {
      const cur = (await getSetting("PRESENCE")) || "offline";
      return reply(`*🔄 Presence Settings*\n\n🔹 *Current:* ${cur}\n\n*🛠 Usage:*\n▸ ${botPrefix}presence off\n▸ ${botPrefix}presence online\n▸ ${botPrefix}presence typing\n▸ ${botPrefix}presence recording`);
    }
    await setSetting("PRESENCE", map[input]);
    return reply(`✅ Presence set to *${map[input]}*`);
  }
);

cmd(
  {
    pattern: "author",
    aliases: ["setauthor", "packauthor"],
    react: "✍️",
    category: "owner",
    description: "Set sticker pack author",
  },
  async (from, sock, conText) => {
    const { q, reply, isSuperUser, botPrefix } = conText;
    if (!isSuperUser) return reply("❌ Owner Only Command!");
    const value = (q || "").trim();
    if (!value) return reply(`*✍️ Pack Author*\n\n🔹 *Current:* ${(await getSetting("PACK_AUTHOR")) || "-"}\n\n▸ ${botPrefix}author <name>`);
    await setSetting("PACK_AUTHOR", value);
    return reply(`✅ Pack author set to *${value}*`);
  }
);

cmd(
  {
    pattern: "note",
    aliases: ["quicknote"],
    react: "📝",
    category: "notes",
    description: "Save a note (same as addnote)",
  },
  async (from, sock, conText) => {
    const target = commands.find((c) => c.pattern === "addnote");
    if (!target) return conText.reply("❌ Notes are unavailable.");
    return target.function(from, sock, conText);
  }
);
