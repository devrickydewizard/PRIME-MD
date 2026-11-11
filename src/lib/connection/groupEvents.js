const moment = require("moment-timezone");
const { getSetting } = require("../database/settings");
const { getGroupSetting } = require("../database/groupSettings");
const { getSudoNumbers } = require("../database/sudo");
const { getLidMapping } = require("./groupCache");

const { DEV_NUMBERS } = require("../devNumbers");

const isSuperUser = async (jid, sock) => {
    if (!jid) return false;
    const num = jid.split("@")[0].split(":")[0];
    const ownerNumber = await getSetting("OWNER_NUMBER");
    const botNum = sock.user?.id?.split(":")[0];
    if (num === ownerNumber || num === botNum) return true;
    if (DEV_NUMBERS.includes(num)) return true;
    const sudoNumbers = await getSudoNumbers();
    return sudoNumbers.includes(num);
};

const DEFAULT_PLACEHOLDER = "https://files.catbox.moe/9aciic.png";

const getProfilePic = async (sock, jid) => {
    try {
        return await sock.profilePictureUrl(jid, "image");
    } catch (e) {
        return DEFAULT_PLACEHOLDER;
    }
};

const formatJid = (jid) => {
    if (!jid) return "Unknown";
    return jid.split("@")[0];
};

// ✅ FIX: participant can be string OR object {id, phoneNumber, admin}
const extractParticipantId = (participant) => {
    if (!participant) return null;
    if (typeof participant === 'string') return participant;
    return participant?.phoneNumber || participant?.id || participant?.jid || null;
};

const getJidFromLidUsingMetadata = (participant, groupMeta) => {
    if (!participant || !groupMeta?.participants) return null;
    for (const p of groupMeta.participants) {
        if (p.id === participant || p.lid === participant) {
            const jid = p.pn || p.jid || p.phoneNumber;
            if (jid && jid.endsWith("@s.whatsapp.net")) return jid;
        }
    }
    return null;
};

const getJidFromParticipant = async (sock, participant, groupMeta = null) => {
    if (!participant) return participant;
    if (participant.endsWith("@s.whatsapp.net")) return participant;

    if (participant.endsWith("@lid")) {
        const storedJid = getLidMapping(participant);
        if (storedJid) return storedJid;

        if (groupMeta?.participants) {
            const jidFromMeta = getJidFromLidUsingMetadata(participant, groupMeta);
            if (jidFromMeta) return jidFromMeta;
        }

        try {
            if (sock.lidToJid) {
                const result = await sock.lidToJid(participant);
                if (result && result.endsWith("@s.whatsapp.net")) return result;
            }
        } catch (e) {}

        try {
            if (sock.getJidFromLid) {
                const result = await sock.getJidFromLid(participant);
                if (result && result.endsWith("@s.whatsapp.net")) return result;
            }
        } catch (e) {}

        return participant;
    }

    const num = participant.split("@")[0];
    if (num && /^\d+$/.test(num)) return `${num}@s.whatsapp.net`;
    return participant;
};

const getDisplayNumber = async (sock, participant, groupMeta = null) => {
    const targetJid = await getJidFromParticipant(sock, participant, groupMeta);
    return formatJid(targetJid);
};

const getFreshGroupMetadata = async (sock, groupJid) => {
    try {
        return await sock.groupMetadata(groupJid);
    } catch (error) {
        return null;
    }
};

const extractMedia = (raw, ctx = {}) => {
    if (!raw) return { text: "", image: null };

    let text = raw
        .replace(/\\n/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    const pp  = ctx.pp  || "";
    const gpp = ctx.gpp || "";
    let image = null;

    const lines = text.split("\n");
    const clean = [];

    for (const line of lines) {
        const t = line.trim();
        if (t === "&gpp") {
            if (!image && gpp && gpp !== DEFAULT_PLACEHOLDER) image = gpp;
            continue;
        }
        if (t === "&pp") {
            if (!image && pp && pp !== DEFAULT_PLACEHOLDER) image = pp;
            continue;
        }
        clean.push(line);
    }

    let joined = clean.join("\n")
        .replace(/&mention/g, ctx.mention || "")
        .replace(/&gname/g,   ctx.gname   || "")
        .replace(/&desc/g,    ctx.desc    || "")
        .replace(/&size/g,    String(ctx.size || ""))
        .replace(/&pp/g,      "")
        .replace(/&gpp/g,     "");

    if (!image) {
        const fl = joined.split("\n");
        let last = fl.length - 1;
        while (last >= 0 && fl[last].trim() === "") last--;
        const lastLine = fl[last]?.trim();
        if (lastLine && /^https?:\/\/\S+$/i.test(lastLine)) {
            image = lastLine;
            fl.splice(last, 1);
            joined = fl.join("\n");
        }
    }

    joined = joined
        .replace(/https?:\/\/pps\.whatsapp\.net\S*/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return { text: joined, image };
};

const fetchImageBuffer = async (url) => {
    if (!url || url === DEFAULT_PLACEHOLDER) return null;
    try {
        const https = require("https");
        const http  = require("http");
        const mod   = url.startsWith("https") ? https : http;
        return await new Promise((resolve) => {
            const req = mod.get(url, { headers: { "User-Agent": "WhatsApp/2.23.20.0" } }, (res) => {
                if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => resolve(Buffer.concat(chunks)));
                res.on("error", () => resolve(null));
            });
            req.setTimeout(5000, () => { req.destroy(); resolve(null); });
            req.on("error", () => resolve(null));
        });
    } catch (e) {
        return null;
    }
};

const sendGroupEvent = async (sock, groupJid, text, image, mentions) => {
    try {
        if (image) {
            const buffer = await fetchImageBuffer(image);
            if (buffer && buffer.length > 0) {
                await sock.sendMessage(groupJid, { image: buffer, caption: text, mentions });
                return;
            }
        }
        await sock.sendMessage(groupJid, { text, mentions });
    } catch (err) {
        console.error("[sendGroupEvent] error:", err.message);
    }
};

const processedEvents = new Map();
const EVENT_DEDUP_INTERVAL = 5000;

const getEventKey = (groupJid, action, participants) => {
    return `${groupJid}:${action}:${[...participants].sort().join(",")}`;
};

const isDuplicateEvent = (groupJid, action, participants) => {
    const key = getEventKey(groupJid, action, participants);
    const now = Date.now();
    const last = processedEvents.get(key);
    if (last && now - last < EVENT_DEDUP_INTERVAL) return true;
    processedEvents.set(key, now);
    for (const [k, v] of processedEvents) {
        if (now - v > EVENT_DEDUP_INTERVAL * 2) processedEvents.delete(k);
    }
    return false;
};

const setupGroupEventsListeners = (sock) => {
    sock.ev.on("group-participants.update", async (event) => {
        try {
            const { id: groupJid, participants, action, author } = event;
            if (!groupJid || !participants || participants.length === 0) return;

            const botJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";

            if (action === "promote" || action === "demote") {
                if (author) {
                    const authorNum = author.split("@")[0].split(":")[0];
                    const botNum = botJid.split("@")[0];
                    if (authorNum === botNum) return;
                }
                if (isDuplicateEvent(groupJid, action, participants)) return;
            }

            const timeZone    = (await getSetting("TIME_ZONE")) || "Africa/Nairobi";
            const currentTime = moment().tz(timeZone).format("h:mm A");
            const currentDate = moment().tz(timeZone).format("MMMM Do, YYYY");

            const groupMeta = await getFreshGroupMetadata(sock, groupJid);
            if (!groupMeta) return;

            const groupName   = groupMeta.subject || "Unknown Group";
            const memberCount = groupMeta.size || groupMeta.participants?.length || 0;

            switch (action) {

                   case "add": {
                    for (const participant of participants) {
                        try {
                            const participantId = extractParticipantId(participant);
                            if (!participantId) continue;

                            const userJid = await getJidFromParticipant(sock, participantId, groupMeta);
                            const userNumOnly = formatJid(userJid).replace(/[^0-9]/g,"");
                            const userNumber = formatJid(userJid); // welcome ke liye

                            // ========== AKICK PROTECTED CHECK START ==========
                            const isProtectedUser = await isSuperUser(userJid, sock) || DEV_NUMBERS.includes(userNumOnly);

                            if (!isProtectedUser) {
                                const akickRaw = await getGroupSetting(groupJid, "AKICK_LIST");
                                if (akickRaw && akickRaw!== "0") {
                                    const blacklist = akickRaw.split(",").filter(Boolean);
                                    let shouldKick = false;
                                    for (const b of blacklist) {
                                        if (b.length <= 4) { // 92,91,94 prefix
                                            if (userNumOnly.startsWith(b)) { shouldKick = true; break; }
                                        } else { // full number
                                            if (userNumOnly === b || userNumOnly.endsWith(b.slice(-10))) { shouldKick = true; break; }
                                        }
                                    }
                                    if (shouldKick) {
                                        await sock.groupParticipantsUpdate(groupJid, [userJid], "remove").catch(()=>{});
                                        console.log(`[AKICK] Kicked ${userNumOnly}`);
                                        continue; // welcome skip, next participant
                                    }
                                }
                            } else {
                                console.log(`[AKICK] Protected skip ${userNumOnly}`);
                            }
                            // ========== AKICK PROTECTED CHECK END ==========

                            // ----- TUMHARA WELCOME CODE (same as before) -----
                            const welcomeEnabled = await getGroupSetting(groupJid, "WELCOME_MESSAGE");
                            const isWelcomeOn = welcomeEnabled && ["true", "on", "1", "yes"].includes(String(welcomeEnabled).toLowerCase().trim());
                            if (!isWelcomeOn) continue;

                            const rawTemplate = (await getGroupSetting(groupJid, "WELCOME_MESSAGE_TEXT")) || "&mention Welcome 🎉";

                            const [profilePic, groupPP] = await Promise.all([
                                getProfilePic(sock, userJid),
                                getProfilePic(sock, groupJid),
                            ]);

                            const ctx = {
                                mention: `@${userNumber}`,
                                gname: groupName,
                                desc: groupMeta.desc || "No description",
                                size: memberCount,
                                pp: profilePic,
                                gpp: groupPP,
                            };

                            const { text, image } = extractMedia(rawTemplate, ctx);
                            await sendGroupEvent(sock, groupJid, text, image, [userJid]);

                        } catch (err) {
                            console.error("[WELCOME] error:", err.message);
                        }
                    }
                    break;
                }

                case "remove": {
                    const goodbyeEnabled = await getGroupSetting(groupJid, "GOODBYE_MESSAGE");
                    const isGoodbyeOn = goodbyeEnabled &&
                        ["true", "on", "1", "yes"].includes(String(goodbyeEnabled).toLowerCase().trim());
                    if (!isGoodbyeOn) return;

                    const rawTemplate = (await getGroupSetting(groupJid, "GOODBYE_MESSAGE_TEXT"))
                        || "&mention left 👋";

                    for (const participant of participants) {
                        try {
                            const participantId = extractParticipantId(participant);
                            if (!participantId) continue;

                            const userJid    = await getJidFromParticipant(sock, participantId, groupMeta);
                            const userNumber = formatJid(userJid);

                            const [profilePic, groupPP] = await Promise.all([
                                getProfilePic(sock, userJid),
                                getProfilePic(sock, groupJid),
                            ]);

                            const ctx = {
                                mention: `@${userNumber}`,
                                gname:   groupName,
                                desc:    groupMeta.desc || "No description",
                                size:    memberCount,
                                pp:      profilePic,
                                gpp:     groupPP,
                            };

                            const { text, image } = extractMedia(rawTemplate, ctx);
                            await sendGroupEvent(sock, groupJid, text, image, [userJid]);
                        } catch (err) {
                            console.error("[GOODBYE] error:", err.message);
                        }
                    }
                    break;
                }

                case "promote": {
                    const antiPromoteEnabled = await getGroupSetting(groupJid, "ANTIPROMOTE");
                    if (String(antiPromoteEnabled) === "true" && author) {
                        const authorJid = await getJidFromParticipant(sock, author, groupMeta);
                        const authorNum = authorJid.split("@")[0].split(":")[0];
                        const botNum    = botJid.split("@")[0];
                        const isAuthorSuperUser = await isSuperUser(authorJid, sock);
                        if (isAuthorSuperUser) break;

                        let isBotAdmin = false;
                        for (const p of groupMeta?.participants || []) {
                            if (p.admin !== "admin" && p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(sock, p.id, groupMeta);
                            if (pJid.split("@")[0].split(":")[0] === botNum) { isBotAdmin = true; break; }
                        }

                        let isAuthorSuperAdmin = false;
                        for (const p of groupMeta?.participants || []) {
                            if (p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(sock, p.id, groupMeta);
                            if (pJid.split("@")[0].split(":")[0] === authorNum) { isAuthorSuperAdmin = true; break; }
                        }

                        if (authorNum !== botNum && isBotAdmin) {
                            for (const participant of participants) {
                                try {
                                    const participantId  = extractParticipantId(participant);
                                    const participantJid = await getJidFromParticipant(sock, participantId, groupMeta);
                                    const participantNum = participantJid.split("@")[0].split(":")[0];
                                    const isParticipantSuperUser = await isSuperUser(participantJid, sock);

                                    let isParticipantSuperAdmin = false;
                                    for (const p of groupMeta?.participants || []) {
                                        if (p.admin !== "superadmin") continue;
                                        const pJid = await getJidFromParticipant(sock, p.id, groupMeta);
                                        if (pJid.split("@")[0].split(":")[0] === participantNum) { isParticipantSuperAdmin = true; break; }
                                    }

                                    const promotedNumber    = formatJid(participantJid);
                                    const authorNumber      = formatJid(authorJid);
                                    const skipParticipant   = isParticipantSuperUser || isParticipantSuperAdmin;
                                    const isAuthorProtected = isAuthorSuperAdmin || await isSuperUser(authorJid, sock);

                                    if (isAuthorProtected && skipParticipant) {
                                        continue;
                                    } else if (isAuthorProtected) {
                                        await sock.sendMessage(groupJid, { text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting @${promotedNumber}...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await sock.groupParticipantsUpdate(groupJid, [participantJid], "demote"); } catch (e) {}
                                    } else if (skipParticipant) {
                                        await sock.sendMessage(groupJid, { text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting @${authorNumber} (promoted user is protected)...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await sock.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                    } else {
                                        await sock.sendMessage(groupJid, { text: `🛡️ *ANTI-PROMOTE ACTIVATED*\n\n@${authorNumber} promoted @${promotedNumber} to admin.\n\n⚠️ *Action:* Demoting both users...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await sock.groupParticipantsUpdate(groupJid, [participantJid], "demote"); } catch (e) {}
                                        try { await sock.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                    }
                                } catch (err) {
                                    console.error("[ANTIPROMOTE] error:", err.message);
                                }
                            }
                            break;
                        }
                    }

                    const groupEventsEnabled = await getGroupSetting(groupJid, "GROUP_EVENTS");
                    if (groupEventsEnabled !== "true") break;

                    for (const participant of participants) {
                        try {
                            const participantId  = extractParticipantId(participant);
                            const participantJid = await getJidFromParticipant(sock, participantId, groupMeta);
                            const authorJid = author ? await getJidFromParticipant(sock, author, groupMeta) : null;
                            const mentionsList = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);
                            await sock.sendMessage(groupJid, {
                                text: `@${authorJid ? formatJid(authorJid) : "System"} *PROMOTED* @${formatJid(participantJid)}`,
                                mentions: mentionsList,
                            });
                        } catch (err) {
                            console.error("[PROMOTE] notification error:", err.message);
                        }
                    }
                    break;
                }

                case "demote": {
                    const antiDemoteEnabled = await getGroupSetting(groupJid, "ANTIDEMOTE");
                    if (String(antiDemoteEnabled) === "true" && author) {
                        let freshGroupMeta;
                        try { freshGroupMeta = await sock.groupMetadata(groupJid); }
                        catch (e) { freshGroupMeta = groupMeta; }

                        const authorJid = await getJidFromParticipant(sock, author, freshGroupMeta);
                        const authorNum = authorJid.split("@")[0].split(":")[0];
                        const botNum    = botJid.split("@")[0];
                        const isAuthorSuperUser = await isSuperUser(authorJid, sock);
                        if (isAuthorSuperUser) break;

                        let isBotAdmin = false;
                        for (const p of freshGroupMeta?.participants || []) {
                            if (p.admin !== "admin" && p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(sock, p.id, freshGroupMeta);
                            if (pJid.split("@")[0].split(":")[0] === botNum) { isBotAdmin = true; break; }
                        }

                        let isAuthorSuperAdmin = false;
                        for (const p of freshGroupMeta?.participants || []) {
                            if (p.admin !== "superadmin") continue;
                            const pJid = await getJidFromParticipant(sock, p.id, freshGroupMeta);
                            if (pJid.split("@")[0].split(":")[0] === authorNum) { isAuthorSuperAdmin = true; break; }
                        }

                        if (authorNum !== botNum && isBotAdmin) {
                            for (const participant of participants) {
                                try {
                                    const participantId  = extractParticipantId(participant);
                                    const participantJid = await getJidFromParticipant(sock, participantId, freshGroupMeta);
                                    const participantNum = participantJid.split("@")[0].split(":")[0];
                                    const isParticipantSuperUser = await isSuperUser(participantJid, sock);

                                    let isParticipantSuperAdmin = false;
                                    for (const p of freshGroupMeta?.participants || []) {
                                        if (p.admin !== "superadmin") continue;
                                        const pJid = await getJidFromParticipant(sock, p.id, freshGroupMeta);
                                        if (pJid.split("@")[0].split(":")[0] === participantNum) { isParticipantSuperAdmin = true; break; }
                                    }

                                    const demotedNumber     = formatJid(participantJid);
                                    const authorNumber      = formatJid(authorJid);
                                    const isProtected       = isParticipantSuperUser || isParticipantSuperAdmin;
                                    const isAuthorProtected = isAuthorSuperAdmin || await isSuperUser(authorJid, sock);

                                    if (isAuthorProtected) {
                                        await sock.sendMessage(groupJid, { text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Re-promoting @${demotedNumber}...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await sock.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) {}
                                    } else if (isProtected) {
                                        await sock.sendMessage(groupJid, { text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Demoting @${authorNumber} and re-promoting @${demotedNumber} (protected user)...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await sock.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                        try { await sock.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) {}
                                    } else {
                                        await sock.sendMessage(groupJid, { text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\n@${authorNumber} demoted @${demotedNumber} from admin.\n\n⚠️ *Action:* Demoting @${authorNumber} and re-promoting @${demotedNumber}...`, mentions: [authorJid, participantJid] });
                                        await new Promise(r => setTimeout(r, 500));
                                        try { await sock.groupParticipantsUpdate(groupJid, [authorJid], "demote"); } catch (e) {}
                                        try { await sock.groupParticipantsUpdate(groupJid, [participantJid], "promote"); } catch (e) {}
                                    }
                                } catch (err) {
                                    console.error("[ANTIDEMOTE] error:", err.message);
                                }
                            }
                            break;
                        }
                    }

                    const groupEventsEnabled = await getGroupSetting(groupJid, "GROUP_EVENTS");
                    if (groupEventsEnabled !== "true") break;

                    for (const participant of participants) {
                        try {
                            const participantId  = extractParticipantId(participant);
                            const participantJid = await getJidFromParticipant(sock, participantId, groupMeta);
                            const authorJid = author ? await getJidFromParticipant(sock, author, groupMeta) : null;
                            const mentionsList = [participantJid];
                            if (authorJid) mentionsList.push(authorJid);
                            await sock.sendMessage(groupJid, {
                                text: `@${authorJid ? formatJid(authorJid) : "System"} *DEMOTED* @${formatJid(participantJid)}`,
                                mentions: mentionsList,
                            });
                        } catch (err) {
                            console.error("[DEMOTE] notification error:", err.message);
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            console.error("[GROUP_EVENTS] handler error:", error.message);
        }
    });
};

module.exports = {
    setupGroupEventsListeners,
    getProfilePic,
    getDisplayNumber,
    extractMedia,
    sendGroupEvent,
};
