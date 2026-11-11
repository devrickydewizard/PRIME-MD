const { DATABASE } = require("./database");
const { DataTypes } = require("sequelize");
const path = require("path");
const config = require("../../config");

const packageJson = require("../../package.json");

const SettingsDB = DATABASE.define(
    "BotSettings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        key: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        tableName: "bot_settings",
        timestamps: true,
    },
);

const DEFAULT_SETTINGS = {
    PREFIX: config.PREFIX || ".",

    OWNER_NAME: config.OWNER_NAME || "ᬊ͜͡RICKYDEWIZARD",
    OWNER_NUMBER: config.OWNER_NUMBER || "254757047860",

    BOT_NAME: config.BOT_NAME || "PRIME-MD",
    VERSION: packageJson?.version ?? "10.0.0",

    FOOTER: config.FOOTER || "If you're weak, let fear be upon you against me 💀",
    CAPTION: config.CAPTION || "I have no limitations",

    BOT_PIC: config.BOT_PIC || "https://files.catbox.moe/oldb9c.jpeg",
    BOT_REPO: config.BOT_REPO || "devrickydewizard/PRIME-MD",

    MODE: config.MODE || "public",
    BOT_START_TIME: config.BOT_START_TIME || "",
    TIME_ZONE: config.TIME_ZONE || "Africa/Nairobi",
    PRESENCE: config.PRESENCE || "offline",

    WARN_COUNT: config.WARN_COUNT || "3",
    
    WARN_LIMIT: config.WARN_LIMIT || "3",

    CHATBOT: config.CHATBOT || "false",
    CHATBOT_MODE: config.CHATBOT_MODE || "inbox",

    STARTING_MESSAGE: config.STARTING_MESSAGE || "true",

    ANTIDELETE: config.ANTIDELETE || "indm",
    ANTI_EDIT: config.ANTI_EDIT || "indm",
    ANTI_VIEWONCE: config.ANTI_VIEWONCE || "indm",
    ANTICALL: config.ANTICALL || "false",

    MENU_FONTS: config.MENU_FONTS || "28",

    ANTICALL_MSG:
        config.ANTICALL_MSG ||
        "*📵 Auto Call Reject Enabled.*\n*Calls are not allowed.*",

    AUTO_LIKE_STATUS: config.AUTO_LIKE_STATUS || "true",
    AUTO_READ_STATUS: config.AUTO_READ_STATUS || "true",
    STATUS_LIKE_EMOJIS:
        config.STATUS_LIKE_EMOJIS || "💛,❤️,💜,🤍,💙",

    AUTO_REPLY_STATUS: config.AUTO_REPLY_STATUS || "false",

    STATUS_REPLY_TEXT:
        config.STATUS_REPLY_TEXT ||
        "*✅ Your status has been viewed successfully.*",

    AUTO_REACT: config.AUTO_REACT || "off",
    AUTO_REPLY: config.AUTO_REPLY || "false",
    AUTO_READ_MESSAGES: config.AUTO_READ_MESSAGES || "off",
    AUTO_BIO: config.AUTO_BIO || "false",
    AUTO_BLOCK: config.AUTO_BLOCK || "",
    CMD_REACTION: config.CMD_REACTION || "off",

    EVENT_REACT: config.EVENT_REACT || "off",

    EVENT_REACT_EMOJI: config.EVENT_REACT_EMOJI || "👀",

    YT: config.YT || "youtube.com/@devrickydewizard",

    NEWSLETTER_JID:
        config.NEWSLETTER_JID ||
        "120363318387454868@newsletter",

    NEWSLETTER_URL:
        config.NEWSLETTER_URL ||
        "https://whatsapp.com/channel/0029VbBAYvx7Noa7ntl68T3g",

    GC_JID: config.GC_JID || "Hw5Am0eSXMZDubYHLzO4JZ",

    PACK_NAME: config.PACK_NAME || "",

    PACK_AUTHOR:
        config.PACK_AUTHOR ||
        "ᬊ͜͡PRIME-MD 𝐁𝚯𝐓",

    SUDO_NUMBERS: config.SUDO_NUMBERS || "",

    PM_PERMIT: config.PM_PERMIT || "false",
};

let initialized = false;

const GROUP_ONLY_SETTINGS = [
    "WELCOME_MESSAGE",
    "GOODBYE_MESSAGE",
    "GROUP_EVENTS",
    "ANTILINK",
];

async function initializeSettings() {
    if (initialized) return;

    await SettingsDB.sync();

    await SettingsDB.destroy({
        where: { key: GROUP_ONLY_SETTINGS },
    });

    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        await SettingsDB.findOrCreate({
            where: { key },
            defaults: { key, value: defaultValue },
        });
    }

    initialized = true;
    console.log("[✅] BOT SETTINGS INITIALIZED");
}

async function getSetting(key) {
    if (!initialized) await initializeSettings();

    const record = await SettingsDB.findOne({ where: { key } });
    if (record) {
        return record.value;
    }

    return DEFAULT_SETTINGS[key] || null;
}

async function setSetting(key, value) {
    if (!initialized) await initializeSettings();

    const [record, created] = await SettingsDB.findOrCreate({
        where: { key },
        defaults: { key, value },
    });

    if (!created) {
        record.value = value;
        await record.save();
    }

    return true;
}

async function getAllSettings() {
    if (!initialized) await initializeSettings();

    const records = await SettingsDB.findAll();
    const settings = {};
    for (const record of records) {
        settings[record.key] = record.value;
    }
    return settings;
}

async function resetSetting(key) {
    if (!initialized) await initializeSettings();

    const defaultValue = DEFAULT_SETTINGS[key];
    if (defaultValue !== undefined) {
        await setSetting(key, defaultValue);
        return defaultValue;
    }
    return null;
}

async function resetAllSettings() {
    if (!initialized) await initializeSettings();

    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        await setSetting(key, defaultValue);
    }
    return true;
}

module.exports = {
    SettingsDB,
    DEFAULT_SETTINGS,
    initializeSettings,
    getSetting,
    setSetting,
    getAllSettings,
    resetSetting,
    resetAllSettings,
};
