const { cmd, commands, monospace, formatBytes } = require("../lib");
const { getSetting, getAllSettings, setSetting } = require("../lib/database/settings");
const { sendInteractiveMessage, sendButtons } = require("gifted-btns");
const fancy = require("../lib/fancy");
const { totalmem: totalMemoryBytes, freemem: freeMemoryBytes } = require("os");
const axios = require("axios");

const more = String.fromCharCode(8206);
const readmore = more.repeat(4001);
const BOT_START_TIME = Date.now();

function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds %= 24 * 60 * 60;
    const hours = Math.floor(seconds / (60 * 60));
    seconds %= 60 * 60;
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function applyFont(text, fontIndex) {
    if (fontIndex === null || fontIndex === undefined) return text;
    const map = fancy[fontIndex];
    if (!map || typeof map !== "object") return text;
    return fancy.apply(map, text);
}

async function getValidFont() {
    const fontRaw = await getSetting("MENU_FONTS");
    const fontIndex = fontRaw ? parseInt(fontRaw) : null;
    return (fontIndex !== null && !isNaN(fontIndex) && fontIndex >= 0 && fancy[fontIndex] && typeof fancy[fontIndex] === "object") ? fontIndex : null;
}

async function sendMedia(sock, from, picUrl, caption) {
    const isVideo = picUrl && (picUrl.endsWith(".mp4") || picUrl.endsWith(".mkv") || picUrl.endsWith(".mov") || picUrl.includes("video"));
    if (isVideo) {
        await sock.sendMessage(from, { video: { url: picUrl }, mimetype: "video/mp4", caption, gifPlayback: false });
    } else {
        await sock.sendMessage(from, { image: { url: picUrl }, caption });
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MENU FONT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "menufont", aliases: ["setmenufont", "menufonts"], react: "🎨", category: "owner", description: "Set menu font style (0-43)" },
    async (from, sock, conText) => {
        const { q, reply, react, isSuperUser, botPrefix } = conText;
        if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

        const current = (await getSetting("MENU_FONTS")) || "None";

        if (!q) {
            const sampleText = "PRIME-MD";
            let preview = `📊 Current Font: *${current}*\n\n📌 Usage: ${botPrefix}menufont 1\n\n🎨 *Font Previews:*\n• off → ${sampleText}\n`;
            for (let i = 0; i <= 43; i++) {
                const map = fancy[i];
                if (!map || typeof map !== "object") continue;
                try { preview += `• ${i} → ${fancy.apply(map, sampleText)}\n`; } catch (_) { preview += `• ${i} → (special font)\n`; }
            }
            return reply(preview);
        }

        if (q.toLowerCase() === "off" || q === "0") {
            await setSetting("MENU_FONTS", "");
            
            return reply("✅ Menu font *Disabled*");
        }

        const num = parseInt(q);
        if (isNaN(num) || num < 0) return reply("🙅‍♂️ Please provide a valid number\n\nUse .menufont to see all previews");
        if (!fancy[num] || typeof fancy[num] !== "object") return reply(`🙅‍♂️ Font ${num} is not available`);

        await setSetting("MENU_FONTS", num.toString());
        
        const sample = fancy.apply(fancy[num], "PRIME-MD MENU");
        return reply(`✅ Menu font set to *${num}*\n\nPreview: ${sample}\n\nUse .menu to see the effect`);
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MENU2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "menu", aliases: ["help", "men", "allmenu"], category: "general", description: "Fetch bot main menu" },
    async (from, sock, conText) => {
        const { sender, react, pushName, botPic, botMode, botVersion, botName, botFooter, timeZone, botPrefix, reply } = conText;
        try {
            const validFont = await getValidFont();
            const F = (text) => validFont !== null ? fancy.apply(fancy[validFont], text) : text;

            const menuVideo = await getSetting("MENU_VIDEO");
            const mediaSrc = (menuVideo && (menuVideo.startsWith("http://") || menuVideo.startsWith("https://"))) ? menuVideo : botPic;

            const now = new Date();
            const date = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
            const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(now);
            const uptime = formatUptime(process.uptime());
            const ram = `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} GB`;

            const regularCmds = commands.filter(c => c.pattern && !c.on && !c.dontAddCommandList);
            const bodyCmds = commands.filter(c => c.pattern && c.on === "body" && !c.dontAddCommandList);
            const totalCommands = regularCmds.length + bodyCmds.length;

            const categorized = commands.reduce((menu, g) => {
                if (g.pattern && !g.dontAddCommandList) {
                    if (!menu[g.category]) menu[g.category] = [];
                    menu[g.category].push({ pattern: g.pattern, isBody: g.on === "body" });
                }
                return menu;
            }, {});
            const sortedCategories = Object.keys(categorized).sort((a, b) => a.localeCompare(b));
            for (const cat of sortedCategories) categorized[cat].sort((a, b) => a.pattern.localeCompare(b.pattern));

            const header =
    `╭┈──〔 *${monospace(F(botName))}* 〕┈──⊷\n` +
    `│ *⿻ ᴍᴏᴅᴇ :* ${monospace(botMode)}\n` +
    `│ *⿻ ᴘʀᴇꜰɪx :* ${monospace(botPrefix)}\n` +
    `│ *⿻ ᴜꜱᴇʀ :* ${monospace(pushName)}\n` +
    `│ *⿻ ᴅᴀᴛᴇ :* ${monospace(date)}\n` +
    `│ *⿻ ᴛɪᴍᴇ :* ${monospace(time)}\n` +
    `│ *⿻ ᴜᴘᴛɪᴍᴇ :* ${monospace(uptime)}\n` +
    `│ *⿻ ᴘʟᴜɢɪɴꜱ :* ${monospace(totalCommands.toString())}\n` +
    `│ *⿻ ᴠᴇʀꜱɪᴏɴ :* ${monospace(botVersion)}\n` +
    `│ *⿻ ᴛɪᴍᴇ ᴢᴏɴᴇ :* ${monospace(timeZone)}\n` +
    `│ *⿻ ꜱᴇʀᴠᴇʀ :* ${monospace(ram)}\n` +
    `╰───────────────────⊷\n${readmore}`;

const formatCategory = (category, gmds) => {
    const body = gmds
        .map(g => `*┊ ⬡ ${monospace(F(g.pattern.toLowerCase()))}*`)
        .join("\n");

    return `\n『 \`${F(category.toUpperCase())}\` 』
╭───────────────────⳹
${body}
╰───────────────────⳹`;
};

            let menu = header;
            for (const cat of sortedCategories) menu += formatCategory(cat, categorized[cat]);

            await sendMedia(sock, from, mediaSrc, `${menu.trim()}\n\n> *${botFooter}*`);
        } catch (e) { console.error("menu2 error:", e); reply(`🙅‍♂️ ${e}`); }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RUNTIME
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "runtime", aliases: ["alive"], react: "⏳", category: "general", description: "Check bot uptime status" },
    async (from, sock, conText) => {
        const { react } = conText;
        const s = await getAllSettings();
        const startTime = Number(s.BOT_START_TIME || Date.now());
        const uptimeMs = Date.now() - startTime;
        const seconds = Math.floor((uptimeMs / 1000) % 60);
        const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
        const hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
        const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
        await sock.sendMessage(from, { text: `*Runtime: ${days} days, ${hours} hours, ${minutes} minutes, and ${seconds} seconds.*` });
        
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
  {
    pattern: "ping",
    aliases: ["speed", "pong"],
    react: "⚡",
    category: "general",
    description: "Check bot response speed",
  },
  async (from, sock, { reply, edit }) => {
    const start = Date.now();
    const msg = await reply("*𝆺𝅥 running 𝆺𝅥*");

    // Internet ping
    let ping = "Failed";
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");

      const run = promisify(exec);
      const { stdout } = await run(
        'curl -s -o /dev/null -w "%{time_total}" https://speed.cloudflare.com/__down'
      );

      const ms = (parseFloat(stdout.trim()) * 1000).toFixed(0);
      ping = isNaN(ms) ? "Timeout" : `${ms}`;
    } catch {}

    const text = `*☇ ꜱᴩᷨᴇͦᴇͭᴅ 🫯*
> \`${ping}ᴍꜱ\``;

    await edit(text, msg);
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  REPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "report", aliases: ["request"], react: "💫", description: "Request New Features.", category: "owner" },
    async (from, sock, conText) => {
        const { mek, q, sender, botPrefix, isSuperUser, reply } = conText;
        const reportedMessages = {};
        const devlopernumber = "254757047860";
        try {
            if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");
            if (!q) return reply(`Example: ${botPrefix}request hi dev downloader commands are not working`);
            const messageId = mek.key.id;
            if (reportedMessages[messageId]) return reply("Already forwarded. Please wait.");
            reportedMessages[messageId] = true;
            await sock.sendMessage(devlopernumber + "@s.whatsapp.net", { text: `*| REQUEST/REPORT |*\n\n*User*: @${sender.split("@")[0]}\n*Request:* ${q}`, mentions: [sender] });
            reply("Tʜᴀɴᴋ ʏᴏᴜ ꜰᴏʀ ʏᴏᴜʀ ʀᴇᴘᴏʀᴛ. Iᴛ ʜᴀs ʙᴇᴇɴ ꜰᴏʀᴡᴀʀᴅᴇᴅ ᴛᴏ ᴛʜᴇ ᴏᴡɴᴇʀ.");
        } catch (e) { reply(e); console.log(e); }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MENUS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "menus", aliases: ["mainmenu", "mainmens"], description: "Display Bot Stats", react: "📜", category: "general" },
    async (from, sock, conText) => {
        const { sender, react, pushName, botPic, botMode, botVersion, botName, botFooter, timeZone, botPrefix, reply, ownerNumber } = conText;
        try {
            const now = new Date();
            const date = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
            const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(now);
            const uptime = formatUptime(process.uptime());
            const ram = `${formatBytes(freeMemoryBytes())}/${formatBytes(totalMemoryBytes())}`;

            const menus =
                `*🦄 Uᴘᴛɪᴍᴇ :* ${monospace(uptime)}\n` +
                `*🍁 Dᴀᴛᴇ Tᴏᴅᴀʏ:* ${monospace(date)}\n` +
                `*🎗 Tɪᴍᴇ Nᴏᴡ:* ${monospace(time)}\n\n` +
                `➮Fᴏᴜɴᴅᴇʀ - RICKYDEWIZARD\n➮Usᴇʀ - ${monospace(pushName)}\n➮Nᴜᴍ - ${monospace(ownerNumber)}\n➮Mᴇᴍᴏʀʏ - ${monospace(ram)}\n\n` +
                `*🧑‍💻 :* ${monospace(botName)} Iꜱ Aᴠᴀɪʟᴀʙʟᴇ\n\n` +
                `╭──❰ *ALL MENU* ❱\n│🏮 Lɪꜱᴛ\n│🏮 Cᴀᴛᴇɢᴏʀʏ\n│🏮 Hᴇʟᴘ\n│🏮 Aʟɪᴠᴇ\n│🏮 Uᴘᴛɪᴍᴇ\n│🏮 Wᴇᴀᴛʜᴇʀ\n│🏮 Lɪɴᴋ\n│🏮 Cᴘᴜ\n│🏮 Rᴇᴘᴏꜱɪᴛᴏʀʏ\n╰─────────────⦁`;

            await sendMedia(sock, from, botPic, menus.trim());
        } catch (e) { console.error(e); reply(`${e}`); }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LIST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "list", aliases: ["listmenu", "listmen"], description: "Show All Commands", react: "📜", category: "general" },
    async (from, sock, conText) => {
        const { sender, react, pushName, botPic, botMode, botVersion, botName, botFooter, timeZone, botPrefix, reply } = conText;
        try {
            const now = new Date();
            const date = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
            const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(now);
            const uptime = formatUptime(process.uptime());
            const ram = `${formatBytes(freeMemoryBytes())}/${formatBytes(totalMemoryBytes())}`;
            const totalCommands = commands.filter(c => c.pattern && !c.dontAddCommandList).length;

            let listText =
                `╭┈──〘 *${monospace(botName)}* 〙┈──⊷\n` +
                `│ ✦ *Mᴏᴅᴇ* : ${monospace(botMode)}\n│ ✦ *Pʀᴇғɪx* : [ ${monospace(botPrefix)} ]\n` +
                `│ ✦ *Usᴇʀ* : ${monospace(pushName)}\n│ ✦ *Pʟᴜɢɪɴs* : ${monospace(totalCommands.toString())}\n` +
                `│ ✦ *Vᴇʀsɪᴏɴ* : ${monospace(botVersion)}\n│ ✦ *Uᴘᴛɪᴍᴇ* : ${monospace(uptime)}\n` +
                `│ ✦ *Tɪᴍᴇ Nᴏᴡ* : ${monospace(time)}\n│ ✦ *Dᴀᴛᴇ Tᴏᴅᴀʏ* : ${monospace(date)}\n` +
                `│ ✦ *Tɪᴍᴇ Zᴏɴᴇ* : ${monospace(timeZone)}\n│ ✦ *Sᴇʀᴠᴇʀ Rᴀᴍ* : ${monospace(ram)}\n` +
                `╰──────────────────⊷${readmore}\n`;

            const filtered = commands.filter(cmd => cmd.pattern && cmd.description && !cmd.dontAddCommandList);
            filtered.forEach((g, index) => { listText += `⭔${index + 1} .${g.pattern}\n⭔ ${g.description}\n\n`; });

            await sendMedia(sock, from, botPic, listText.trim());
        } catch (e) { console.error(e); reply(`${e}`); }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RETURN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "return", aliases: ["details", "det", "ret"], react: "⚡", category: "owner", description: "Displays full quoted message (raw JSON)" },
    async (from, sock, conText) => {
        const { reply, react, quotedMsg, isSuperUser, botFooter, newsletterUrl } = conText;
        if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");
        if (!quotedMsg) return reply("Please reply to a message");
        try {
            const jsonString = JSON.stringify(quotedMsg, null, 2);
            const chunks = jsonString.match(/[\s\S]{1,3000}/g) || [];
            await react("⚡");
            for (const chunk of chunks) {
                const formattedMessage = "```" + chunk + "```";
                await sendButtons(sock, from, {
                    title: "", text: formattedMessage, footer: `> *${botFooter}*`,
                    buttons: [
                        { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: "Copy", copy_code: formattedMessage }) },
                        { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: "WaChannel", url: newsletterUrl }) },
                    ],
                });
            }
        } catch (error) { console.error("Error:", error); return reply("🙅‍♂️ Failed to process quoted message"); }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UPTIME
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "uptime", react: "⏳", category: "general", description: "Check bot uptime status." },
    async (from, sock, conText) => {
        const { react } = conText;
        const uptimeMs = Date.now() - BOT_START_TIME;
        const seconds = Math.floor((uptimeMs / 1000) % 60);
        const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
        const hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
        const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
        await sock.sendMessage(from, { text: `*Uptime: ${days} days, ${hours} hours, ${minutes} minutes, and ${seconds} seconds.*` });
        
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  REPO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "repo", aliases: ["sc", "rep", "script"], react: "⛲", category: "general", description: "Fetch bot script." },
    async (from, sock, conText) => {
        const { reply, react, botPic, botName, botFooter, giftedRepo, isSuperUser, botPrefix } = conText;

        if (!giftedRepo || !giftedRepo.trim()) {
            return reply(
                isSuperUser
                    ? `⚠️ No repository is set yet.\n\nSet one with:\n> ${botPrefix}setbotrepo owner/repo\n\nExample: ${botPrefix}setbotrepo devrickydewizard/PRIME-MD`
                    : `⚠️ No repository has been set for this bot yet. Ask the owner to set one with \`${botPrefix}setbotrepo\`.`
            );
        }

        try {
            const response = await axios.get(`https://api.github.com/repos/${giftedRepo}`, { timeout: 15000 });
            const repoData = response.data;
            const owner = repoData.owner;
            const { name, forks_count, stargazers_count, created_at, updated_at } = repoData;

            const messageText =
                `*– ( BOT REPO INFO )*\n──────────────✧\n` +
                `*⟡ Name:* ${name}\n*⟡ Stars:* ${stargazers_count}\n*⟡ Forks:* ${forks_count}\n` +
                `*⟡ Watchers:* ${repoData.watchers_count}\n*⟡ Language:* ${repoData.language || "Unknown"}\n` +
                `*⟡ Created On:* ${new Date(created_at).toLocaleDateString()}\n` +
                `*⟡ Last Updated:* ${new Date(updated_at).toLocaleDateString()}\n*⟡ Repo Link:* https://github.com/${giftedRepo}\n\n> *${botFooter}*`;

            await sendMedia(sock, from, botPic, messageText);
            
        } catch (err) {
            console.error("[repo] fetch failed:", err?.response?.status, err?.message);
            await react("🙅‍♂️");
            const detail = err?.response?.status === 404
                ? `repository "${giftedRepo}" not found - check it's spelled exactly as "owner/repo" and is public`
                : (err?.response ? `HTTP ${err.response.status}` : err.message);
            await sock.sendMessage(from, { text: `🙅‍♂️ Could not fetch repository info (${detail}).` });
        }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SAVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { pattern: "save", react: "⚡", category: "owner", description: "Save messages (images, videos, audio, stickers, text)." },
    async (from, sock, conText) => {
        const { mek, reply, react, sender, isSuperUser, getMediaBuffer } = conText;
        if (!isSuperUser) return reply(`*This area is reserved for the bot owner only.* 🕷️`);
        const quotedMsg = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg) return reply(`⚠️ Please reply to/quote a message.`);
        try {
            let mediaData;
            if (quotedMsg.imageMessage) {
                const buffer = await getMediaBuffer(quotedMsg.imageMessage, "image");
                mediaData = { image: buffer, caption: quotedMsg.imageMessage.caption || "" };
            } else if (quotedMsg.videoMessage) {
                const buffer = await getMediaBuffer(quotedMsg.videoMessage, "video");
                mediaData = { video: buffer, caption: quotedMsg.videoMessage.caption || "" };
            } else if (quotedMsg.audioMessage) {
                const buffer = await getMediaBuffer(quotedMsg.audioMessage, "audio");
                mediaData = { audio: buffer, mimetype: "audio/mp4" };
            } else if (quotedMsg.stickerMessage) {
                const buffer = await getMediaBuffer(quotedMsg.stickerMessage, "sticker");
                mediaData = { sticker: buffer };
            } else if (quotedMsg.documentMessage || quotedMsg.documentWithCaptionMessage?.message?.documentMessage) {
                const docMsg = quotedMsg.documentMessage || quotedMsg.documentWithCaptionMessage.message.documentMessage;
                const buffer = await getMediaBuffer(docMsg, "document");
                mediaData = { document: buffer, fileName: docMsg.fileName || "document", mimetype: docMsg.mimetype || "application/octet-stream" };
            } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage?.text) {
                mediaData = { text: quotedMsg.conversation || quotedMsg.extendedTextMessage.text };
            } else {
                return reply(`🙅‍♂️ Unsupported message type.`);
            }
            await sock.sendMessage(sender, mediaData);
            
        } catch (error) { console.error("Save Error:", error); await reply(`🙅‍♂️ Failed: ${error.message}`); }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHJID
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd({
    pattern: "chjid", 
    aliases: ["channeljid", "chinfo", "channelinfo", "newsletterjid", "newsjid", "newsletterinfo"], 
    react: "📢", 
    category: "general", 
    description: "Get WhatsApp Channel/Newsletter Info" 
},
async (from, sock, conText) => {
    const { q, reply, react, botFooter, botPrefix } = conText;
    const input = q?.trim();
    if (!input) return reply(`🙅‍♂️ Provide a channel link.\nUsage: *${botPrefix}chjid* https://whatsapp.com/channel/KEY`);

    const channelMatch = input.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
    if (!channelMatch) { await react("🙅‍♂️"); return reply("🙅‍♂️ Invalid channel link."); }

    await react("🔍");
    const inviteKey = channelMatch[1];

    try {
        const meta = await sock.newsletterMetadata("invite", inviteKey);
        if (!meta?.id) { await react("🙅‍♂️"); return reply("🙅‍♂️ Could not fetch channel info."); }

        const channelJid = meta.id;
        const tm = meta.thread_metadata || {};
        const name = tm.name?.text || "Unknown Channel";
        const rawDesc = tm.description?.text || "";
        const isVerified = (tm.verification || "") === "VERIFIED";
        const isActive = (meta.state?.type || "") === "ACTIVE";
        const subCount = parseInt(tm.subscribers_count || "0", 10);
        
        const followers = subCount >= 1_000_000 ? `${(subCount / 1_000_000).toFixed(1)}M` : subCount >= 1_000 ? `${(subCount / 1_000).toFixed(1)}K` : subCount > 0 ? subCount.toLocaleString() : "N/A";

        let descSection = "";
        if (rawDesc) {
            const trimmed = rawDesc.trim();
            descSection = trimmed.length > 200 ? `\n\n📄 *Description:*\n${trimmed.slice(0, 200)}...` : `\n\n📄 *Description:*\n${trimmed}`;
        }

        const text =
            `*– ( CHANNEL INFO ) –*\n──────────────✧\n🔖 *Name:* ${name}\n🟢 *Status:* ${isActive ? "Active" : "Unknown"}\n` +
            `${isVerified ? "✅ *Verified:* Yes\n" : "🙅‍♂️ *Verified:* No\n"}` +
            `👥 *Followers:* ${followers}\n🆔 *JID:* \`${channelJid}\`` + descSection;

        await reply(text);
        await react("✅");
    } catch (err) {
        console.error("[CHJID] Error:", err.message);
        await react("🙅‍♂️");
        await reply("🙅‍♂️ Failed to fetch channel info. Ensure the link is valid.");
    }
});

