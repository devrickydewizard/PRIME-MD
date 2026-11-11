const { DATABASE } = require("./database");
const { DataTypes } = require("sequelize");

const GroupSettingsDB = DATABASE.define(
    "GroupSettings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        groupJid: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: false,
        },
        key: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: false,
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        tableName: "group_settings",
        timestamps: true,
    },
);

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 GLOBAL WARN LIMIT
// One shared limit used as the fallback for EVERY warn-based module
// (antilink, antibad, antisticker, antigroupmention, manual .warn) unless a
// group has explicitly overridden that specific module's own *_WARN_COUNT.
//
// ENV (config.js / .env):
//   WARN=3        <- any number, e.g. WARN=5
//
// Priority order used by getWarnLimit() below:
//   1. Group-specific setting value (e.g. ANTILINK_WARN_COUNT, WARN_LIMIT)
//      if it has been explicitly set/changed by an admin command
//   2. process.env.WARN (global env config)
//   3. Hardcoded fallback of 3
//
// Since GROUP_SETTING_DEFAULTS below is seeded FROM process.env.WARN at
// boot time, a group that never customized its warn count automatically
// inherits whatever WARN= is set to in .env — one knob, every module.
// ─────────────────────────────────────────────────────────────────────────────

const GLOBAL_WARN_LIMIT_DEFAULT = process.env.WARN && !isNaN(parseInt(process.env.WARN)) && parseInt(process.env.WARN) > 0
    ? String(parseInt(process.env.WARN))
    : "3";

const GROUP_SETTING_DEFAULTS = {
    WELCOME_MESSAGE: "false",
    GOODBYE_MESSAGE: "false",
    GROUP_EVENTS: "false",
    ANTILINK: "false",
    ANTISTICKER: "false",
    ANTIPORN: "false",
    ANTIPORN_WARN_COUNT: GLOBAL_WARN_LIMIT_DEFAULT,
    ANTILINK_WARN_COUNT: GLOBAL_WARN_LIMIT_DEFAULT,
    WELCOME_MESSAGE_TEXT: "",
    GOODBYE_MESSAGE_TEXT: "",
    ANTIBAD: "false",
    ANTIBAD_WARN_COUNT: GLOBAL_WARN_LIMIT_DEFAULT,
    ANTIGROUPMENTION: "false",
    ANTILINK_ALLOWED: "0",
    ANTILINK_DISALLOWED: "0",
    AKICK_LIST: "0",
    ANTIGROUPMENTION_WARN_COUNT: GLOBAL_WARN_LIMIT_DEFAULT,
    ANTISTICKER_WARN_COUNT: GLOBAL_WARN_LIMIT_DEFAULT,
    ANTIGROUPSTATUS: "false", // <-- ye missing tha
    ANTIGROUPSTATUS_WARN_COUNT: GLOBAL_WARN_LIMIT_DEFAULT, // <-- ye missing tha
    WARN_LIMIT: GLOBAL_WARN_LIMIT_DEFAULT,
    ANTIPROMOTE: "false",
    ANTIDEMOTE: "false",
};

/**
 * Resolves the effective warn limit for a given module in a given group.
 * Falls back to process.env.WARN, then 3, if nothing is set.
 *
 * @param {string} groupJid
 * @param {string} settingKey - e.g. "ANTILINK_WARN_COUNT", "WARN_LIMIT"
 * @returns {Promise<number>}
 */
async function getWarnLimit(groupJid, settingKey = "WARN_LIMIT") {
    const raw = await getGroupSetting(groupJid, settingKey);
    const parsed = parseInt(raw);
    if (!isNaN(parsed) && parsed > 0) return parsed;

    const envLimit = parseInt(process.env.WARN);
    if (!isNaN(envLimit) && envLimit > 0) return envLimit;

    return 3;
}

const AntilinkWarningsDB = DATABASE.define(
    "AntilinkWarnings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        groupJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        userJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        warnCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    },
    {
        tableName: "antilink_warnings",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["groupJid", "userJid"],
            },
        ],
    },
);

async function getAntilinkWarnings(groupJid, userJid) {
    const record = await AntilinkWarningsDB.findOne({
        where: { groupJid, userJid },
    });
    return record ? record.warnCount : 0;
}

async function addAntilinkWarning(groupJid, userJid) {
    const [record, created] = await AntilinkWarningsDB.findOrCreate({
        where: { groupJid, userJid },
        defaults: { groupJid, userJid, warnCount: 1 },
    });

    if (!created) {
        record.warnCount += 1;
        await record.save();
    }

    return record.warnCount;
}

async function resetAntilinkWarnings(groupJid, userJid) {
    await AntilinkWarningsDB.destroy({
        where: { groupJid, userJid },
    });
}

const AntibadWarningsDB = DATABASE.define(
    "AntibadWarnings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        groupJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        userJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        warnCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    },
    {
        tableName: "antibad_warnings",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["groupJid", "userJid"],
            },
        ],
    },
);

const BadWordsDB = DATABASE.define(
    "BadWords",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        groupJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        word: {
            type: DataTypes.STRING,
            allowNull: false,
        },
    },
    {
        tableName: "bad_words",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["groupJid", "word"],
            },
        ],
    },
);

async function getAntibadWarnings(groupJid, userJid) {
    const record = await AntibadWarningsDB.findOne({
        where: { groupJid, userJid },
    });
    return record ? record.warnCount : 0;
}

async function addAntibadWarning(groupJid, userJid) {
    const [record, created] = await AntibadWarningsDB.findOrCreate({
        where: { groupJid, userJid },
        defaults: { groupJid, userJid, warnCount: 1 },
    });

    if (!created) {
        record.warnCount += 1;
        await record.save();
    }

    return record.warnCount;
}

async function resetAntibadWarnings(groupJid, userJid) {
    await AntibadWarningsDB.destroy({
        where: { groupJid, userJid },
    });
}

const AntiGroupMentionWarningsDB = DATABASE.define(
    "AntiGroupMentionWarnings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        groupJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        userJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        warnCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    },
    {
        tableName: "antigroupmention_warnings",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["groupJid", "userJid"],
            },
        ],
    },
);

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 ANTI-GROUP-STATUS WARNINGS (Green Ring Icon)
// ─────────────────────────────────────────────────────────────────────────────
const AntiGroupStatusWarningsDB = DATABASE.define(
    "AntiGroupStatusWarnings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        groupJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        userJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        warnCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    },
    {
        tableName: "antigroupstatus_warnings",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["groupJid", "userJid"],
            },
        ],
    },
);

async function getAntiGroupStatusWarnings(groupJid, userJid) {
    const record = await AntiGroupStatusWarningsDB.findOne({
        where: { groupJid, userJid },
    });
    return record ? record.warnCount : 0;
}

async function addAntiGroupStatusWarning(groupJid, userJid) {
    const [record, created] = await AntiGroupStatusWarningsDB.findOrCreate({
        where: { groupJid, userJid },
        defaults: { groupJid, userJid, warnCount: 1 },
    });
    if (!created) {
        record.warnCount += 1;
        await record.save();
    }
    return record.warnCount;
}

async function resetAntiGroupStatusWarnings(groupJid, userJid) {
    await AntiGroupStatusWarningsDB.destroy({
        where: { groupJid, userJid },
    });
}

async function getAntiGroupMentionWarnings(groupJid, userJid) {
    const record = await AntiGroupMentionWarningsDB.findOne({
        where: { groupJid, userJid },
    });
    return record ? record.warnCount : 0;
}

async function addAntiGroupMentionWarning(groupJid, userJid) {
    const [record, created] = await AntiGroupMentionWarningsDB.findOrCreate({
        where: { groupJid, userJid },
        defaults: { groupJid, userJid, warnCount: 1 },
    });

    if (!created) {
        record.warnCount += 1;
        await record.save();
    }

    return record.warnCount;
}

async function resetAntiGroupMentionWarnings(groupJid, userJid) {
    await AntiGroupMentionWarningsDB.destroy({
        where: { groupJid, userJid },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 ANTI-STICKER WARNINGS
// Was referenced by lib/gmdHelpers.js (addAntistickerWarning /
// resetAntistickerWarnings) but the table + functions never existed in this
// file before. Added here following the exact same pattern as the other
// per-module warning tables above.
// ─────────────────────────────────────────────────────────────────────────────



const AntistickerWarningsDB = DATABASE.define(
    "AntistickerWarnings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        groupJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        userJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        warnCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    },
    {
        tableName: "antisticker_warnings",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["groupJid", "userJid"],
            },
        ],
    },
);

async function getAntistickerWarnings(groupJid, userJid) {
    const record = await AntistickerWarningsDB.findOne({
        where: { groupJid, userJid },
    });
    return record ? record.warnCount : 0;
}

async function addAntistickerWarning(groupJid, userJid) {
    const [record, created] = await AntistickerWarningsDB.findOrCreate({
        where: { groupJid, userJid },
        defaults: { groupJid, userJid, warnCount: 1 },
    });

    if (!created) {
        record.warnCount += 1;
        await record.save();
    }

    return record.warnCount;
}

async function resetAntistickerWarnings(groupJid, userJid) {
    await AntistickerWarningsDB.destroy({
        where: { groupJid, userJid },
    });
}
const AntipornWarningsDB = DATABASE.define("AntipornWarnings", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  groupJid: { type: DataTypes.STRING, allowNull: false },
  userJid: { type: DataTypes.STRING, allowNull: false },
  warnCount: { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  tableName: "antiporn_warnings",
  timestamps: true,
  indexes: [{ unique: true, fields: ["groupJid", "userJid"] }],
});
async function getAntipornWarnings(g,u){ const r=await AntipornWarningsDB.findOne({where:{groupJid:g,userJid:u}}); return r?r.warnCount:0; }
async function addAntipornWarning(g,u){ const [r,c]=await AntipornWarningsDB.findOrCreate({where:{groupJid:g,userJid:u},defaults:{groupJid:g,userJid:u,warnCount:1}}); if(!c){r.warnCount+=1;await r.save();} return r.warnCount; }
async function resetAntipornWarnings(g,u){ await AntipornWarningsDB.destroy({where:{groupJid:g,userJid:u}}); }

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 GENERIC WARNING SYSTEM
// Backs the manual .warn / .unwarn / .getwarn / .resetwarn commands.
// Unlike the per-module tables above (antilink_warnings, antibad_warnings...)
// this is a single, type-agnostic table keyed only by (groupJid, userJid),
// with an optional "reason" column so .getwarn / future audit commands can
// show *why* the last warning was issued.
// ─────────────────────────────────────────────────────────────────────────────

const WarningsDB = DATABASE.define(
    "Warnings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        groupJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        userJid: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        warnCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        lastReason: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        tableName: "warnings",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["groupJid", "userJid"],
            },
        ],
    },
);

/**
 * Increment a user's generic warning count by 1.
 * @returns {Promise<number>} new warn count
 */
async function addWarning(groupJid, userJid, reason = "") {
    const [record, created] = await WarningsDB.findOrCreate({
        where: { groupJid, userJid },
        defaults: { groupJid, userJid, warnCount: 1, lastReason: reason || null },
    });

    if (!created) {
        record.warnCount += 1;
        if (reason) record.lastReason = reason;
        await record.save();
    }

    return record.warnCount;
}

/**
 * Decrement a user's generic warning count by 1 (floor 0).
 * @returns {Promise<number>} new warn count
 */
async function removeWarning(groupJid, userJid) {
    const record = await WarningsDB.findOne({ where: { groupJid, userJid } });
    if (!record) return 0;

    record.warnCount = Math.max(record.warnCount - 1, 0);
    await record.save();
    return record.warnCount;
}

/**
 * Reset (delete) a user's generic warning record entirely.
 */
async function resetWarning(groupJid, userJid) {
    await WarningsDB.destroy({ where: { groupJid, userJid } });
}

/**
 * Directly set a user's generic warning count (used internally / admin tools).
 * @returns {Promise<number>} new warn count
 */
async function setWarningCount(groupJid, userJid, count) {
    const safeCount = Math.max(parseInt(count) || 0, 0);
    const [record, created] = await WarningsDB.findOrCreate({
        where: { groupJid, userJid },
        defaults: { groupJid, userJid, warnCount: safeCount },
    });

    if (!created) {
        record.warnCount = safeCount;
        await record.save();
    }

    return record.warnCount;
}

/**
 * Get a user's current generic warning count.
 * @returns {Promise<number>}
 */
async function getWarningCount(groupJid, userJid) {
    const record = await WarningsDB.findOne({ where: { groupJid, userJid } });
    return record ? record.warnCount : 0;
}

/**
 * Get every user's generic warning count in a group.
 * @returns {Promise<Record<string, number>>} { [userJid]: warnCount, ... }
 */
async function getAllWarnings(groupJid) {
    const records = await WarningsDB.findAll({ where: { groupJid } });
    const result = {};
    for (const r of records) {
        result[r.userJid] = r.warnCount;
    }
    return result;
}

const DEFAULT_BAD_WORDS = [
    'fuck', 'shit', 'bitch', 'ass', 'asshole', 'bastard', 'damn', 'dick', 'pussy', 'lun', 'lan', 
    'cunt', 'whore', 'slut', 'fag', 'nigga', 'nigger', 'retard', 'motherfucker',
    'cock', 'prick', 'bullshit', 'jackass', 'dumbass', 'idiot', 'stupid',
    'malaya', 'mkundu', 'matako', 'kumamako', 'sexy', 'boobs', 'mjinga', 'sex'
];

async function getBadWords(groupJid) {
    const records = await BadWordsDB.findAll({
        where: { groupJid },
    });
    return records.map(r => r.word.toLowerCase());
}

async function initializeDefaultBadWords(groupJid) {
    let added = 0;
    for (const word of DEFAULT_BAD_WORDS) {
        try {
            const [record, created] = await BadWordsDB.findOrCreate({
                where: { groupJid, word: word.toLowerCase() },
                defaults: { groupJid, word: word.toLowerCase() },
            });
            if (created) added++;
        } catch (e) {}
    }
    return added;
}

async function addBadWord(groupJid, word) {
    const normalizedWord = word.toLowerCase().trim();
    try {
        await BadWordsDB.findOrCreate({
            where: { groupJid, word: normalizedWord },
            defaults: { groupJid, word: normalizedWord },
        });
        return true;
    } catch (e) {
        return false;
    }
}

async function removeBadWord(groupJid, word) {
    const normalizedWord = word.toLowerCase().trim();
    const deleted = await BadWordsDB.destroy({
        where: { groupJid, word: normalizedWord },
    });
    return deleted > 0;
}

async function clearBadWords(groupJid) {
    await BadWordsDB.destroy({
        where: { groupJid },
    });
}

async function initializeGroupSettings() {
    try {
        await GroupSettingsDB.sync({ alter: true });
        await AntilinkWarningsDB.sync({ alter: true });
        await AntibadWarningsDB.sync({ alter: true });
        await AntiGroupMentionWarningsDB.sync({ alter: true });
        await AntiGroupStatusWarningsDB.sync({ alter: true }); // <-- naya
        await AntipornWarningsDB.sync({ alter: true });
        await AntistickerWarningsDB.sync({ alter: true });
        await WarningsDB.sync({ alter: true });
        await BadWordsDB.sync({ alter: true });
        console.log("[✅] GROUP SETTINGS INITIALIZED.");
    } catch (error) {
        if (error.original?.code === 'SQLITE_ERROR' && error.original?.message?.includes('already exists')) {
            console.log("[✅] GROUP SETTINGS INITIALIZED.");
        } else {
            throw error;
        }
    }
}

async function getGroupSetting(groupJid, key) {
    const record = await GroupSettingsDB.findOne({
        where: { groupJid, key },
    });

    if (record) {
        return record.value;
    }

    return GROUP_SETTING_DEFAULTS[key] || "false";
}

async function setGroupSetting(groupJid, key, value) {
    try {
        const existing = await GroupSettingsDB.findOne({ where: { groupJid, key } });
        
        if (existing) {
            existing.value = value;
            await existing.save();
        } else {
            await GroupSettingsDB.create({ groupJid, key, value });
        }
        
        return true;
    } catch (error) {
        console.error(`[setGroupSetting] Error: ${error.message}`);
        throw error;
    }
}

async function getAllGroupSettings(groupJid) {
    const records = await GroupSettingsDB.findAll({
        where: { groupJid },
    });

    const settings = { ...GROUP_SETTING_DEFAULTS };
    for (const record of records) {
        settings[record.key] = record.value;
    }
    return settings;
}

async function resetGroupSetting(groupJid, key) {
    const defaultValue = GROUP_SETTING_DEFAULTS[key];
    if (defaultValue !== undefined) {
        await setGroupSetting(groupJid, key, defaultValue);
        return defaultValue;
    }
    return null;
}

async function getGroupsWithSettingEnabled(key) {
    const records = await GroupSettingsDB.findAll({
        where: { key, value: "true" },
    });
    return records.map((record) => record.groupJid);
}

async function getEnabledGroupSettings() {
    const result = {
        WELCOME_MESSAGE: [],
        GOODBYE_MESSAGE: [],
        GROUP_EVENTS: [],
        ANTILINK: [],
        ANTIBAD: [],
        ANTIGROUPMENTION: [],
        ANTIPROMOTE: [],
        ANTIDEMOTE: [],
    };

    const records = await GroupSettingsDB.findAll();

    for (const record of records) {
        if (result[record.key] !== undefined) {
            if (record.value && record.value !== 'false' && record.value !== 'off') {
                result[record.key].push(`${record.groupJid} (${record.value})`);
            }
        }
    }

    return result;
}

async function resetAllGroupSettings(groupJid) {
    try {
        await GroupSettingsDB.destroy({ where: { groupJid } });
        await AntilinkWarningsDB.destroy({ where: { groupJid } });
        await AntibadWarningsDB.destroy({ where: { groupJid } });
        await AntiGroupMentionWarningsDB.destroy({ where: { groupJid } });
        await AntiGroupStatusWarningsDB.destroy({ where: { groupJid } }); // <-- naya
        await AntipornWarningsDB.destroy({ where: { groupJid } });
        await AntistickerWarningsDB.destroy({ where: { groupJid } });
        await WarningsDB.destroy({ where: { groupJid } });
        await BadWordsDB.destroy({ where: { groupJid } });
        return true;
    } catch (error) {
        console.error("[GROUP_SETTINGS][RESET_ALL_ERROR]:", error);
        return false;
    }
}

module.exports = {
    GroupSettingsDB,
    AntilinkWarningsDB,
    AntibadWarningsDB,
    AntiGroupMentionWarningsDB,
    AntistickerWarningsDB,
    WarningsDB,
    BadWordsDB,
    GROUP_SETTING_DEFAULTS,
    GLOBAL_WARN_LIMIT_DEFAULT,
    initializeGroupSettings,
    getGroupSetting,
    setGroupSetting,
    getAllGroupSettings,
    resetGroupSetting,
    getGroupsWithSettingEnabled,
    getEnabledGroupSettings,
    getWarnLimit,

    getAntilinkWarnings,
    addAntilinkWarning,
    resetAntilinkWarnings,
    getAntibadWarnings,
    addAntibadWarning,
    resetAntibadWarnings,
    getAntiGroupMentionWarnings,
    addAntiGroupMentionWarning,
    resetAntiGroupMentionWarnings,
    AntiGroupStatusWarningsDB,
    AntipornWarningsDB,
    getAntipornWarnings,
    addAntipornWarning,
    resetAntipornWarnings,
    getAntiGroupStatusWarnings, // <-- naya
    addAntiGroupStatusWarning, // <-- naya
    resetAntiGroupStatusWarnings, // <-- naya

    getAntistickerWarnings,
    addAntistickerWarning,
    resetAntistickerWarnings,

    addWarning,
    removeWarning,
    resetWarning,
    setWarningCount,
    getWarningCount,
    getAllWarnings,

    getBadWords,
    addBadWord,
    removeBadWord,
    clearBadWords,
    initializeDefaultBadWords,
    DEFAULT_BAD_WORDS,
    resetAllGroupSettings,
};

