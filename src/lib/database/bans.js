const { DATABASE } = require("./database");
const { DataTypes } = require("sequelize");

const BannedUserDB = DATABASE.define(
    "BannedUser",
    {
        jid: { type: DataTypes.STRING, allowNull: false, unique: true },
        reason: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "banned_users", timestamps: true }
);

const BannedGroupDB = DATABASE.define(
    "BannedGroup",
    {
        jid: { type: DataTypes.STRING, allowNull: false, unique: true },
        reason: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "banned_groups", timestamps: true }
);

let synced = false;
async function ensureSync() {
    if (synced) return;
    await BannedUserDB.sync();
    await BannedGroupDB.sync();
    synced = true;
}

// ── USER BANS ──────────────────────────────────────────────
async function banUser(jid, reason = "") {
    await ensureSync();
    const [record, created] = await BannedUserDB.findOrCreate({ where: { jid }, defaults: { jid, reason } });
    if (!created) {
        record.reason = reason || record.reason;
        await record.save();
    }
    return true;
}

async function unbanUser(jid) {
    await ensureSync();
    const count = await BannedUserDB.destroy({ where: { jid } });
    return count > 0;
}

async function isUserBanned(jid) {
    if (!jid) return false;
    await ensureSync();
    const record = await BannedUserDB.findOne({ where: { jid } });
    return !!record;
}

async function getAllBannedUsers() {
    await ensureSync();
    const records = await BannedUserDB.findAll();
    return records.map(r => ({ jid: r.jid, reason: r.reason }));
}

// ── GROUP BANS ─────────────────────────────────────────────
async function banGroup(jid, reason = "") {
    await ensureSync();
    const [record, created] = await BannedGroupDB.findOrCreate({ where: { jid }, defaults: { jid, reason } });
    if (!created) {
        record.reason = reason || record.reason;
        await record.save();
    }
    return true;
}

async function unbanGroup(jid) {
    await ensureSync();
    const count = await BannedGroupDB.destroy({ where: { jid } });
    return count > 0;
}

async function isGroupBanned(jid) {
    if (!jid) return false;
    await ensureSync();
    const record = await BannedGroupDB.findOne({ where: { jid } });
    return !!record;
}

async function getAllBannedGroups() {
    await ensureSync();
    const records = await BannedGroupDB.findAll();
    return records.map(r => ({ jid: r.jid, reason: r.reason }));
}

// ── SHARED GATE ────────────────────────────────────────────
// Call from any listener that already knows isSuperUser (e.g. setupCommandHandler).
// Superusers are NEVER blocked — same bypass behaviour as private-mode.
async function isBanBlocked({ sender, from, isGroup, isSuperUser }) {
    if (isSuperUser) return false;
    if (sender && await isUserBanned(sender)) return true;
    if (isGroup && from && await isGroupBanned(from)) return true;
    return false;
}

module.exports = {
    banUser, unbanUser, isUserBanned, getAllBannedUsers,
    banGroup, unbanGroup, isGroupBanned, getAllBannedGroups,
    isBanBlocked,
};
