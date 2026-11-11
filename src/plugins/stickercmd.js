const { cmd, commands } = require("../lib");
const { getSetting, setSetting } = require("../lib/database/settings");

const SKEY = "STICKER_CMDS";

async function getStickerCmds() {
  try {
    const raw = await getSetting(SKEY);
    if (!raw) return {};
    return typeof raw === "object" ? raw : JSON.parse(raw);
  } catch (e) {
    console.error(`[StickerCmd][DEBUG] getStickerCmds failed:`, e.message);
    return {};
  }
}

async function setStickerCmds(map) {
  await setSetting(SKEY, JSON.stringify(map));
}

function findCmd(name) {
  return (
    commands.find((c) => c.pattern === name) ||
    commands.find((c) => Array.isArray(c.aliases) && c.aliases.includes(name))
  );
}

// .SETCMD

cmd(
  {
    pattern: "setcmd",
    aliases: [],
    react: "🍀",
    category: "owner",
    description: "Reply to a sticker to bind it to a command. Usage: .setcmd ping",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, q, mek, quotedMsg } = conText;

    if (!isSuperUser) return reply("📛 *Only Bot Owner can use this command!*");

    const cmdName = (q || "").trim().toLowerCase();
    if (!cmdName) return reply("🙅‍♂️ Which command? Example: *.setcmd ping*");

    const PROTECTED = ["setcmd", "dltcmd", "getcmd"];
    if (PROTECTED.includes(cmdName)) return reply("🙅‍♂️ *You cannot bind this command to itself!*");

    if (!findCmd(cmdName)) return reply(`🙅‍♂️ *Command not found:* \`${cmdName}\``);

    const rawQuoted =
      mek?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
      mek?.message?.viewOnceMessage?.message ||
      quotedMsg ||
      null;

    const stickerMsg =
      rawQuoted?.stickerMessage ||
      rawQuoted?.viewOnceMessage?.message?.stickerMessage ||
      null;

    console.log(`[SetCmd][DEBUG] cmdName: ${cmdName} | stickerMsg found: ${!!stickerMsg} | hasSha256: ${!!stickerMsg?.fileSha256}`);

    if (!stickerMsg?.fileSha256) {
      return reply("🙅‍♂️ *Reply to a sticker* with `.setcmd <command>`");
    }

    const sha256 = Buffer.from(stickerMsg.fileSha256).toString("hex");
    console.log(`[SetCmd][DEBUG] sha256: ${sha256}`);

    const map = await getStickerCmds();

    const existing = Object.entries(map).find(([, v]) => v === sha256);
    if (existing) return reply(`⚠️ *Already bound to:* .${existing[0]}`);

    map[cmdName] = sha256;
    await setStickerCmds(map);
    console.log(`[SetCmd][DEBUG] ✅ bound ${cmdName} → ${sha256}`);

    return reply(`✅ *Bound:* sticker → *.${cmdName}*`);
  }
);

// .DLTCMD

cmd(
  {
    pattern: "dltcmd",
    aliases: ["delcmd"],
    react: "💥",
    category: "owner",
    description: "Remove a sticker command binding. Usage: .dltcmd ping",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser, q } = conText;

    if (!isSuperUser) return reply("📛 *Only Bot Owner can use this command!*");

    const cmdName = (q || "").trim().toLowerCase();
    if (!cmdName) return reply("🙅‍♂️ Which command? Example: *.dltcmd ping*");

    const map = await getStickerCmds();
    console.log(`[DltCmd][DEBUG] removing: ${cmdName} | exists: ${!!map[cmdName]}`);
    if (!map[cmdName]) return reply(`⚠️ *Not found:* \`${cmdName}\``);

    delete map[cmdName];
    await setStickerCmds(map);

    return reply(`🗑️ *Removed:* .${cmdName}`);
  }
);

// .GETCMD

cmd(
  {
    pattern: "getcmd",
    aliases: ["listcmd"],
    react: "📋",
    category: "owner",
    description: "List all sticker command bindings.",
  },
  async (from, sock, conText) => {
    const { reply, isSuperUser } = conText;

    if (!isSuperUser) return reply("📛 *Only Bot Owner can use this command!*");

    const map = await getStickerCmds();
    const keys = Object.keys(map);
    console.log(`[GetCmd][DEBUG] total bindings: ${keys.length}`);

    if (!keys.length) return reply("_No sticker commands bound yet._\n\nUse *.setcmd <command>* while replying to a sticker.");

    const list = keys.map((k, i) => `${i + 1}. *.${k}*`).join("\n");
    return reply(`📋 *Sticker Commands (${keys.length}):*\n\n${list}`);
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TRIGGER — ye function index.js se call honi zaroori hai,
//  warna sticker bhejne par kabhi check hi nahi hoga.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function stickerCmdTrigger(from, sock, conText) {
  try {
    const { mek, isSuperUser, botPrefix } = conText;
    console.log(`[StickerCmdTrigger][DEBUG] called | isSuperUser: ${isSuperUser}`);

    if (!isSuperUser) {
      console.log(`[StickerCmdTrigger][DEBUG] not superuser — skipping`);
      return;
    }

    const stickerMsg = mek?.message?.stickerMessage;
    if (!stickerMsg?.fileSha256) {
      console.log(`[StickerCmdTrigger][DEBUG] no sticker in message — skipping`);
      return;
    }

    const incomingSha256 = Buffer.from(stickerMsg.fileSha256).toString("hex");
    console.log(`[StickerCmdTrigger][DEBUG] incoming sha256: ${incomingSha256}`);

    const map = await getStickerCmds();
    const matchedCmd = Object.keys(map).find((k) => map[k] === incomingSha256);

    if (!matchedCmd) {
      console.log(`[StickerCmdTrigger][DEBUG] no binding matched this sticker`);
      return;
    }

    console.log(`[StickerCmdTrigger][DEBUG] ✅ matched sticker → ${botPrefix}${matchedCmd}`);

    const cmdDef = findCmd(matchedCmd);
    if (!cmdDef || typeof cmdDef.function !== "function") {
      console.warn(`[StickerCmdTrigger][DEBUG] no handler function found for: ${matchedCmd}`);
      return;
    }

    const triggeredContext = {
      ...conText,
      q: "",
      args: [],
      body: `${botPrefix}${matchedCmd}`,
      isSuperUser: true,
    };

    await cmdDef.function(from, sock, triggeredContext);
    console.log(`[StickerCmdTrigger][DEBUG] ✅ executed ${matchedCmd}`);
  } catch (err) {
    console.error("[StickerCmdTrigger][DEBUG] error:", err.message);
    console.error(err.stack);
  }
}

module.exports = { stickerCmdTrigger };
