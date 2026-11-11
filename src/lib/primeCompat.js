// Compatibility layer so commands written for the `pcmd()` command format run
// on PRIME's engine. Load order: ported plugins are named zz_prime-plugin_*.js so
// they register AFTER every native PRIME plugin; anything PRIME already
// provides (same pattern or alias) is skipped rather than overridden.
const { cmd, commands } = require("./Cmds");

const PLUGIN_API = process.env.PLUGIN_API || Buffer.from("aHR0cHM6Ly9hcGlza2VpdGgyLXByb2R1Y3Rpb24tMzY3OS51cC5yYWlsd2F5LmFwcA==", "base64").toString();

const taken = () => {
    const s = new Set();
    for (const c of commands) {
        if (c.pattern) s.add(String(c.pattern).toLowerCase());
        (c.aliases || []).forEach((a) => a && s.add(String(a).toLowerCase()));
    }
    return s;
};

function adapt(ctx, sock) {
    const ownerNumber = String(ctx.ownerNumber || "").replace(/\D/g, "");
    return {
        ...ctx,
        prefix: ctx.botPrefix,
        api: PLUGIN_API,
        author: ctx.packAuthor,
        packname: ctx.packName,
        botname: ctx.botName,
        botSettings: { prefix: ctx.botPrefix, mode: ctx.botMode, botname: ctx.botName, author: ctx.packAuthor, packname: ctx.packName, timezone: ctx.timeZone },
        timezone: ctx.timeZone,
        expiryDisplay: "Never",
        getExpiryDisplay: () => "Never",
        dev: ownerNumber,
        devNumbers: ownerNumber ? [ownerNumber] : [],
        devUsernames: [],
        senderUsername: null,
        quotedUsername: null,
        quotedSender: ctx.quotedUser,
        pickRandom: (arr) => (Array.isArray(arr) ? arr[Math.floor(Math.random() * arr.length)] : arr),
        fetchBuffer: ctx.gmdBuffer,
        fetchJson: ctx.gmdJson,
        isSudo: async (n) => {
            const list = (await ctx.getSudoNumbers?.()) || [];
            const num = String(n || "").replace(/\D/g, "");
            return list.some((x) => String(x).replace(/\D/g, "") === num);
        },
        getSudoUsernames: async () => [],
        contactMessage: {
            key: { fromMe: false, participant: "0@s.whatsapp.net", remoteJid: "status@broadcast" },
            message: { contactMessage: { displayName: ctx.pushName || "User", vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${ctx.pushName || "User"};;;;\nFN:${ctx.pushName || "User"}\nitem1.TEL;waid=${String(ctx.sender || "").split("@")[0]}:${String(ctx.sender || "").split("@")[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD` } },
        },
    };
}

function pcmd(opts, fn) {
    const t = taken();
    const pattern = opts.pattern;
    if (pattern && t.has(String(pattern).toLowerCase())) {
        // PRIME already has this command: just merge any aliases is known that PRIME lacks.
        const existing = commands.find((c) => String(c.pattern).toLowerCase() === String(pattern).toLowerCase() || (c.aliases || []).some((a) => String(a).toLowerCase() === String(pattern).toLowerCase()));
        if (existing) {
            const extra = (opts.aliases || []).filter((a) => a && !t.has(String(a).toLowerCase()));
            if (extra.length) existing.aliases = [...(existing.aliases || []), ...extra];
        }
        return null;
    }
    const aliases = (opts.aliases || []).filter((a) => a && !t.has(String(a).toLowerCase()));
    const { filename, ...rest } = opts;
    return cmd(
        { ...rest, aliases, category: String(opts.category || "general").toLowerCase() },
        (from, sock, ctx) => fn(from, sock, adapt(ctx, sock))
    );
}

module.exports = { pcmd, adapt, PLUGIN_API };
