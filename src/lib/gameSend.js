// Sends one HTML mini game as a rich WhatsApp message (single tab).
// Shared by the individual game plugins (snake, flappy, piano, ...).
'use strict';

const { AIRich, Toolkit, richSupported } = require('./airich');

const BRAND = 'RickyDeWizard';
const SOURCE_URL = 'https://nixel.dev';
const TRUSTED_SOURCES = ['nixel.dev'];

function attachScreen(msg, tabName, html, extraTrusted = []) {
    const unified = msg?.message?.botForwardedMessage?.message?.richResponseMessage?.unifiedResponse;
    if (!unified || !unified.data) throw new Error('rich response has no unified data');

    const json = JSON.parse(Buffer.from(unified.data, 'base64').toString('utf8'));
    json.embedded_screens = [{
        title: 'Preview',
        content: [{
            __typename: 'FOAIDNixelButtonSheets',
            tabs: [{
                id: 'tab_0',
                tab_header: tabName,
                sections: [{
                    __typename: 'GenAIUnifiedResponseSection',
                    view_model: {
                        __typename: 'GenAISingleLayoutViewModel',
                        primitive: {
                            __typename: 'GenAIaeacdsnwHtmlPrimitive',
                            payload: html,
                            url: SOURCE_URL,
                            trusted_sources: [...new Set([...TRUSTED_SOURCES, ...extraTrusted])]
                        }
                    }
                }],
                step_entries: []
            }]
        }]
    }];
    unified.data = Buffer.from(Toolkit.stringifyEscaped(json));
    return msg;
}

/**
 * Sends one HTML game.
 *   inline (default): the game is shown directly inside the message - no "See details" button.
 *   tabs            : the game is inside a "See details" sheet (set GAME_VIEW=tabs to use this everywhere).
 * @param sock   the Baileys socket
 * @param from   chat jid
 * @param mek    the incoming message (quoted)
 * @param opts   { title, html, trusted?, mode? }
 */
async function sendHtmlGame(sock, from, mek, { title, html, trusted = [], mode }) {
    if (!richSupported()) {
        throw new Error('This Baileys build does not support rich messages');
    }

    const view = String(mode || process.env.GAME_VIEW || 'inline').toLowerCase();
    const rich = new AIRich(sock).setTitle(BRAND + ' Games');
    let msg;

    if (view === 'tabs') {
        rich.addText('> 🎮 *' + title + '*');
        msg = attachScreen(await rich.build(from, { quoted: mek }), title, html, trusted);
    } else {
        // inline: the HTML primitive is a normal section of the message
        rich._addContent(
            AIRich.newLayout('Single', {
                __typename: 'GenAIaeacdsnwHtmlPrimitive',
                payload: html,
                trusted_sources: [...new Set([...TRUSTED_SOURCES, ...trusted])]
            }),
            [{ messageType: 2, messageText: title + ' 🎮' }]
        );
        msg = await rich.build(from, { quoted: mek });
    }

    await sock.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id });
    // Follow-up edit (same as AIRich.send) so WhatsApp renders the game instead of a download prompt.
    await rich.sendEdit(from, msg.key.id, { msg: msg.message });
    return msg;
}

module.exports = { sendHtmlGame, attachScreen };
