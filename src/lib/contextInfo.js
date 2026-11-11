const { getSetting } = require("./database/settings");

async function getContextInfo(mentionedJid = []) {
    const [botName, channelJid] = await Promise.all([
        getSetting("BOT_NAME"),
        getSetting("NEWSLETTER_JID")
    ]);

    return {
        mentionedJid,
        forwardingScore: 1,
        isForwarded: false,
        forwardedNewsletterMessageInfo: {
            newsletterJid: channelJid || "120363425343959199@newsletter",
            newsletterName: botName || "PRIME-MD",
            serverMessageId: -1
        }
    };
}

module.exports = { getContextInfo };
