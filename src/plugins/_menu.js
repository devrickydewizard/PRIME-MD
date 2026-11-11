const { cmd, commands, monospace, formatBytes } = require("../lib");
const { getSetting, getAllSettings, setSetting } = require("../lib/database/settings");
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

// ── Location Button Bubble (ported from .rich loc) ──
// Sends a native buttons+location message with a Menu / Owner
// quick-action pair, thumbnailed with the bot's own picture.
async function sendMenuLocationButtons(sock, from, botPic, botName, menuText) {
    let thumb = Buffer.alloc(0);
    try {
        const sharp = require("sharp");
        const res = await fetch(botPic);
        const buf = Buffer.from(await res.arrayBuffer());
        thumb = await sharp(buf).resize({ width: 300 }).jpeg({ quality: 80 }).toBuffer();
    } catch (e) {
        console.error("[Menu Loc] thumbnail error:", e.message);
    }

    await sock.relayMessage(
        from,
        {
            buttonsMessage: {
                buttons: [
                    { buttonId: ".owner", buttonText: { displayText: "👑 Owner" }, type: 1 },
                    { buttonId: ".ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
                ],
                contentText: menuText,
                footerText: "If you're weak, let fear be upon you against me 💀",
                contextInfo: { mentionedJid: [], groupMentions: [], statusAttributions: [] },
                headerType: 6,
                locationMessage: {
                    degreesLatitude: 0,
                    degreesLongitude: 0,
                    name: `Online • 08.39 WIB `,
                    address: "JP¥ 999,990",
                    jpegThumbnail: thumb,
                },
                viewOnce: true,
            },
        },
        {
            additionalNodes: [
                {
                    tag: "biz",
                    attrs: {},
                    content: [
                        {
                            tag: "interactive",
                            attrs: { type: "native_flow", v: "1" },
                            content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
                        },
                    ],
                },
            ],
        }
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MENU2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    { 
    pattern: "menu2", 
    aliases: ["btnmenu"], 
    category: "general", 
    description: "Fetch bot main menu" 
    },async (from, sock, conText) => {
        const { sender, react, pushName, botPic, botMode, botVersion, botName, botFooter, timeZone, botPrefix, reply } = conText;
        
        const menuImage =
    botPic && /^https?:\/\//.test(botPic)
        ? botPic
        : "https://files.catbox.moe/oldb9c.jpeg";
        
        try {
            const validFont = await getValidFont();
            const F = (text) => validFont !== null ? fancy.apply(fancy[validFont], text) : text;

            const menuVideo = await getSetting("MENU_VIDEO");
            const mediaSrc = (menuVideo && (menuVideo.startsWith("http://") || menuVideo.startsWith("https://"))) ? menuVideo : botPic;

            const now = new Date();
            const date = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
            const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(now);
            const uptime = formatUptime(process.uptime());
            const ram = `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`;

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

            // ── Quick-action location/buttons bubble (full menu inside) ──
            try {
                await sendMenuLocationButtons(sock, from, menuImage, botName, `${menu.trim()}`);
                await sock.sendMessage(from, {
        audio: {
            url: "https://cdn.jsdelivr.net/gh/mauricegift/ghbcdn@main/audio/fC_audio.mp3"
        },
        mimetype: "audio/ogg; codecs=opus",
        ptt: true
    });
            } catch (e) {
                console.error("[Menu Loc] send error:", e.message);
            }
        } catch (e) { console.error("menu2 error:", e); reply(`🙅‍♂️ ${e}`); }
    }
);
