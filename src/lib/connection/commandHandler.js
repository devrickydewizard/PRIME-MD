const fs = require('fs-extra');
const path = require('path');
const { evt, commands } = require('../Cmds');
const { standardizeJid } = require('./serializer');
const {
    getGroupMetadata,
    getLidMapping,
    getBotNums,
    learnBotIdentity,
    participantNums,
    isAdminRole,
    refreshGroupMetadata,
    idNum,
} = require('./groupCache');

const _compileAsJs = function (module, filename) {
    const content = fs.readFileSync(filename, 'utf8');
    module._compile(content, filename);
};
require.extensions['.gmd'] = _compileAsJs;
require.extensions['.cmd'] = _compileAsJs;
require.extensions['.amd'] = _compileAsJs;
require.extensions['.bot'] = _compileAsJs;
require.extensions['.ke']  = _compileAsJs;

const _pluginExts = new Set(['.js', '.gmd', '.cmd', '.amd', '.bot', '.ke']);

const loadPlugins = (pluginsPath) => {
    try {
        fs.readdirSync(pluginsPath).forEach((fileName) => {
            const ext = path.extname(fileName).toLowerCase();
            if (_pluginExts.has(ext)) {
                try {
                    require(path.join(pluginsPath, fileName));
                } catch (e) {
                    console.error(`Failed to load ${fileName}: ${e.message}`);
                }
            }
        });
    } catch (error) {
        console.error('Error reading plugins folder:', error.message);
    }
};

const findCommand = (cmd) => {
    if (!Array.isArray(evt.commands)) return null;
    return evt.commands.find((c) => (
        c?.pattern === cmd ||
        (Array.isArray(c?.aliases) && c.aliases.includes(cmd))
    ));
};

const findBodyCommand = (body) => {
    if (!Array.isArray(evt.commands) || !body) return null;
    return evt.commands.find((c) => {
        if (c?.on === 'body') {
            if (typeof c.pattern === 'string') {
                return body.toLowerCase().includes(c.pattern.toLowerCase());
            }
            if (c.pattern instanceof RegExp) {
                return c.pattern.test(body);
            }
        }
        return false;
    });
};

const createHelpers = (sock, ms, from) => {
    const reply = (text) => sock.sendMessage(from, { text });

    const react = async (emoji) => {
        if (typeof emoji !== 'string') return;
        try {
            await sock.sendMessage(from, { react: { key: ms.key, text: emoji } });
        } catch (err) {
            console.error('Reaction error:', err);
        }
    };

    const edit = async (text, message) => {
        if (typeof text !== 'string') return;
        try {
            await sock.sendMessage(from, { text, edit: message.key });
        } catch (err) {
            console.error('Edit error:', err);
        }
    };

    const del = async (message) => {
        if (!message?.key) return;
        try {
            await sock.sendMessage(from, { delete: message.key });
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    return { reply, react, edit, del };
};

// ─────────────────────────────────────────────────────────────────────────────
// Multi-format ID normalization: strip session suffixes (":4") and the
// "@..." tail from any JID/LID string.
// ─────────────────────────────────────────────────────────────────────────────
const bareNum = (jid) => {
    if (!jid) return '';
    return String(jid).split('@')[0].split(':')[0];
};

// All identity forms a participant exposes, as a Set of bare numbers.
const participantForms = (p) => {
    const out = new Set();
    const push = (v) => { const n = bareNum(v); if (n) out.add(n); };
    push(p?.id);
    push(p?.lid);
    push(p?.pn);
    push(p?.phoneNumber);
    push(p?.jid);
    return out;
};

const overlaps = (a, b) => {
    for (const n of a) if (b.has(n)) return true;
    return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// getGroupInfo — same signature, same return shape, multi-format admin check
// ─────────────────────────────────────────────────────────────────────────────
const getGroupInfo = async (sock, from, botId, sender) => {
    const isGroup = from.endsWith('@g.us');

    if (!isGroup) {
        return {
            groupInfo: null,
            groupName: '',
            participants: [],
            groupAdmins: [],
            groupSuperAdmins: [],
            isBotAdmin: false,
            isAdmin: false,
            isSuperAdmin: false,
            sender,
        };
    }

    const groupInfo = await getGroupMetadata(sock, from);
    if (!groupInfo || !groupInfo.participants) {
        return {
            groupInfo: null,
            groupName: '',
            participants: [],
            groupAdmins: [],
            groupSuperAdmins: [],
            isBotAdmin: false,
            isAdmin: false,
            isSuperAdmin: false,
            sender,
        };
    }

    // Warm the bot's known IDs (this may populate sock.user.lid-derived forms).
    await learnBotIdentity(sock);

    const botNums = getBotNums(sock);          // Set<bareNumber>
    const botIdNum = idNum(botId);
    if (botIdNum) botNums.add(botIdNum);

    // Add the bot's LID/phone forms coming from sock.user directly.
    for (const v of [sock?.user?.id, sock?.user?.lid,
                     sock?.authState?.creds?.me?.id,
                     sock?.authState?.creds?.me?.lid]) {
        const n = bareNum(v);
        if (n) botNums.add(n);
    }

    const senderLid = standardizeJid(sender);

    // ── The core check: multi-format, LID-safe ─────────────
    const compute = (meta) => {
        const parts = meta.participants || [];

        // 1) Teach botNums the bot's LID form by finding a participant whose
        //    phone form matches one of our known bot numbers.
        //    This is what fixes the "bot is admin but botNums only has phone"
        //    case when the group lists members by @lid.
        for (const p of parts) {
            const forms = participantForms(p);
            if (overlaps(forms, botNums)) {
                for (const v of [p.id, p.lid, p.pn, p.phoneNumber, p.jid]) {
                    const n = bareNum(v);
                    if (n) botNums.add(n);
                }
            }
        }

        // 2) Locate the sender's participant entry using ANY matching form.
        const found = parts.find((p) => {
            for (const v of [p.id, p.lid, p.pn, p.phoneNumber, p.jid]) {
                if (!v) continue;
                // Compare against the full sender (with or without suffix/@)
                if (standardizeJid(v) === senderLid) return true;
                if (bareNum(v) === bareNum(sender)) return true;
            }
            return false;
        });

        // 3) Build the sender's number set.
        let resolvedSender =
            found?.pn ||
            found?.phoneNumber ||
            (found?.id && !String(found.id).endsWith('@lid') ? found.id : null) ||
            sender;

        if (String(resolvedSender).endsWith('@lid')) {
            const mapped = getLidMapping(resolvedSender);
            if (mapped) resolvedSender = mapped;
        }

        const senderForms = new Set();
        for (const v of [sender, resolvedSender, senderLid]) {
            const n = bareNum(v);
            if (n) senderForms.add(n);
        }
        if (found) for (const n of participantForms(found)) senderForms.add(n);

        // 4) Bot-admin: any participant with an admin role whose forms overlap botNums.
        const isBotAdmin = parts.some(
            (p) => isAdminRole(p) && overlaps(participantForms(p), botNums)
        );

        // 5) Sender is the paired bot account?
        const senderIsBot = overlaps(senderForms, botNums);

        // 6) Sender-admin / superadmin.
        let isAdmin = parts.some(
            (p) => isAdminRole(p) && overlaps(participantForms(p), senderForms)
        );

        let isSuperAdmin = parts.some(
            (p) => p.admin === 'superadmin' && overlaps(participantForms(p), senderForms)
        );

        // If the sender IS the paired account, they can't be a lower role than the bot.
        if (senderIsBot) {
            isAdmin = isAdmin || isBotAdmin;
            isSuperAdmin =
                isSuperAdmin ||
                parts.some(
                    (p) => p.admin === 'superadmin' && overlaps(participantForms(p), botNums)
                );
        }

        return { resolvedSender, isBotAdmin, isAdmin, isSuperAdmin, senderIsBot };
    };

    let meta = groupInfo;
    let flags = compute(meta);

    // If we came up "not admin" / "not bot admin", the cached metadata may be
    // stale (rights granted after it was cached). Re-fetch once.
    if (!flags.isBotAdmin || (!flags.isAdmin && !flags.senderIsBot)) {
        const fresh = await refreshGroupMetadata(sock, from);
        if (fresh?.participants) {
            meta = fresh;
            flags = compute(meta);
        }
    }

    if (!flags.isBotAdmin && process.env.ADMIN_DEBUG === 'true') {
        console.log(
            '[admin-debug] bot ids:', [...botNums].join(','),
            '| admins:',
            JSON.stringify(
                meta.participants.filter(isAdminRole).map((p) => ({
                    id: p.id,
                    lid: p.lid,
                    pn: p.pn,
                    phoneNumber: p.phoneNumber,
                    admin: p.admin,
                }))
            )
        );
    }

    const mapJid = (p) => p.pn || p.phoneNumber || p.id;
    const participants = meta.participants.map(mapJid);
    const groupAdmins = meta.participants.filter((p) => p.admin === 'admin').map(mapJid);
    const groupSuperAdmins = meta.participants.filter((p) => p.admin === 'superadmin').map(mapJid);

    return {
        groupInfo: meta,
        groupName: meta.subject || '',
        participants,
        groupAdmins,
        groupSuperAdmins,
        isBotAdmin: flags.isBotAdmin,
        isAdmin: flags.isAdmin,
        isSuperAdmin: flags.isSuperAdmin,
        sender: flags.resolvedSender,
    };
};

const buildSuperUsers = async (settings, getSudoNumbers, botId, ownerNumber) => {
    const devNumbers = require('../devNumbers').DEV_NUMBERS;

    const sudoNumbersFromFile = (await getSudoNumbers()) || [];
    const sudoNumbersSetting = settings.SUDO_NUMBERS || '';
    const sudoNumbers = (sudoNumbersSetting ? sudoNumbersSetting.split(',') : [])
        .map((num) => num.trim().replace(/\D/g, ''))
        .filter((num) => num.length > 5);

    const botJid = standardizeJid(botId);
    const ownerJid = standardizeJid(ownerNumber.replace(/\D/g, ''));

    const superUser = [
        ownerJid,
        botJid,
        ...(sudoNumbers || []).map((num) => `${num}@s.whatsapp.net`),
        ...(devNumbers || []).map((num) => `${num}@s.whatsapp.net`),
        ...(sudoNumbersFromFile || []).map((num) => `${num}@s.whatsapp.net`),
    ]
        .map((jid) => standardizeJid(jid))
        .filter(Boolean);

    return Array.from(new Set(superUser));
};

module.exports = {
    loadPlugins,
    findCommand,
    findBodyCommand,
    createHelpers,
    getGroupInfo,
    buildSuperUsers,
};
