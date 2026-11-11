// Resolves "who is the user I replied to / tagged" in a group, for both addressing modes:
//   - LID groups : participants are listed as <lid>@lid  (with .phoneNumber when known)
//   - PN groups  : participants are listed as <number>@s.whatsapp.net (with .lid when known)
// Used by kick / promote / demote so they work no matter which form WhatsApp gives us.
'use strict';

const { getLidMapping } = require('./connection/groupCache');

const clean = (j) => {
    if (!j) return j;
    const [user, server] = String(j).split('@');
    return server ? user.split(':')[0] + '@' + server : user.split(':')[0];
};
const bare = (j) => String(j || '').split('@')[0].split(':')[0];
const isLid = (j) => String(j || '').endsWith('@lid');
const toPnJid = (j) => (j ? (String(j).includes('@') ? clean(j) : bare(j) + '@s.whatsapp.net') : null);

const formsOf = (p) => [p?.id, p?.lid, p?.phoneNumber, p?.pn, p?.jid].filter(Boolean).map(clean);

async function participantsOf(sock, groupJid, metadata) {
    if (metadata?.participants?.length) return metadata.participants;
    try { return (await sock.groupMetadata(groupJid))?.participants || []; } catch { return []; }
}

async function lidToPn(sock, lid) {
    const cached = getLidMapping(lid);
    if (cached) return cached;
    try {
        const r = await sock.signalRepository?.lidMapping?.getPNForLID?.(lid);
        if (r) return toPnJid(r);
    } catch {}
    return null;
}

async function pnToLid(sock, pn) {
    try {
        const r = await sock.signalRepository?.lidMapping?.getLIDForPN?.(pn);
        if (r) return clean(r);
    } catch {}
    return null;
}

/** Find the group participant that matches `jid` in any of its forms (LID or phone number). */
async function findParticipant(sock, jid, metadata, groupJid) {
    if (!jid) return null;
    const target = clean(jid);
    const parts = await participantsOf(sock, groupJid, metadata);
    const match = (t) => parts.find((p) => formsOf(p).includes(t));

    let p = match(target);
    if (p) return p;

    if (isLid(target)) {
        const pn = await lidToPn(sock, target);
        if (pn) p = match(clean(pn));
    } else {
        const lid = await pnToLid(sock, target);
        if (lid) p = match(lid);
    }
    return p || null;
}

/** Phone-number jid for `jid` if we can work it out, otherwise the original jid. */
async function toPn(sock, jid, metadata, groupJid) {
    if (!jid || !isLid(jid)) return jid;
    const p = await findParticipant(sock, jid, metadata, groupJid);
    if (p) {
        const pn = p.phoneNumber || p.pn || (p.id && !isLid(p.id) ? p.id : null);
        if (pn) return toPnJid(pn);
    }
    return (await lidToPn(sock, clean(jid))) || jid;
}

/** The exact id the group lists this member under - the safest id to pass to groupParticipantsUpdate. */
async function updateId(sock, groupJid, jid, metadata) {
    const p = await findParticipant(sock, jid, metadata, groupJid);
    return p?.id || jid;
}

/** Is this jid the bot itself (phone number or LID form)? */
function isSelf(sock, jid) {
    const me = [sock?.user?.id, sock?.user?.lid, sock?.user?.phoneNumber].filter(Boolean).map(bare);
    return !!jid && me.includes(bare(jid));
}

module.exports = { findParticipant, toPn, updateId, isSelf, clean, bare, isLid };
