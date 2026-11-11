const { cmd, getSetting } = require("../lib");
const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");

// ─────────────────────────────────────────────
//  CRM2 HELPERS
// ─────────────────────────────────────────────

const STRUCT_KEYS = [
  "ephemeralMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension",
  "documentWithCaptionMessage", "editedMessage", "deviceSentMessage",
  "futureProofMessage", "commentMessage", "botInvokeMessage",
  "botForwardedMessage", "associatedChildMessage",
];

const unwrap = (msg) => {
  let cur = msg, guard = 0;
  while (cur && guard < 25) {
    const k = STRUCT_KEYS.find((key) => cur[key]);
    if (!k) break;
    cur = cur[k].message || cur[k];
    guard++;
  }
  return cur;
};

const encode = (val) => {
  if (val === null || val === undefined) return val;
  if (Buffer.isBuffer(val)) return { b64: val.toString("base64") };
  if (val instanceof Uint8Array) return { b64: Buffer.from(val).toString("base64") };
  if (val && typeof val === "object") {
    if (val.type === "Buffer" && Array.isArray(val.data))
      return { b64: Buffer.from(val.data).toString("base64") };
    if (val.constructor?.name === "Long")
      return val.toNumber?.() ?? val.low ?? 0;
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = encode(v);
    return out;
  }
  return val;
};

const getRealMessage = (message) => {
  if (!message) return null;
  if (message.ephemeralMessage) return getRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return getRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return getRealMessage(message.viewOnceMessageV2.message);
  return message;
};

const findContextInfo = (message) => {
  if (!message) return null;
  const real = getRealMessage(message);
  if (!real) return null;
  for (const key of Object.keys(real)) {
    if (real[key] && typeof real[key] === 'object' && real[key].contextInfo) {
      return real[key].contextInfo;
    }
  }
  return null;
};

const deepGetMessage = (m) => {
  const contextInfo = findContextInfo(m.message);
  return contextInfo?.quotedMessage || null;
};

// ─────────────────────────────────────────────
//  CRM2 COMMAND
// ─────────────────────────────────────────────

cmd(
  {
    pattern: "crm3",
    react: "📋",
    category: "owner",
    dontAddCommandList: true,
    description: "Compile replied message as richResponse code snippet",
  },
  async (from, sock, conText) => {
    const { mek, reply, react, isSuperUser } = conText;
    if (!isSuperUser) return;
    await react("⌛");

    const contextInfo = findContextInfo(mek.message);
    if (!contextInfo?.stanzaId) {
      await react("🙅‍♂️");
      return reply("🙅‍♂️ Reply to a message first!");
    }

    const raw = deepGetMessage(mek);
    if (!raw) {
      await react("🙅‍♂️");
      return reply("🙅‍♂️ Could not read that message.");
    }

    const core = unwrap(raw) || raw;
    const msgType = Object.keys(core)[0];
    const encoded = encode(core);
    const encodedCtx = encode(contextInfo);

    // Build relay code string
    const relayCode = `await (async () => {
const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");
const revive = x => {
  if (x === null || x === undefined) return x;
  if (Array.isArray(x)) return x.map(revive);
  if (typeof x === 'object') {
    if (typeof x.b64 === 'string') return Buffer.from(x.b64, 'base64');
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, revive(v)]));
  }
  return x;
};
const msg = revive(${JSON.stringify(encoded)});
const ctx = revive(${JSON.stringify(encodedCtx)});
if (ctx && msg[Object.keys(msg)[0]]) msg[Object.keys(msg)[0]].contextInfo = ctx;
const waMsg = await generateWAMessageFromContent(m.chat, msg, { quoted: m });
await bot.relayMessage(m.chat, waMsg.message, { messageId: waMsg.key.id });
return 'Sent ✅';
})()`;

    // Build codeBlocks for richResponse
    const codeBlocks = [
      { highlightType: 0, codeContent: relayCode }
    ];

    const senderNum = (mek.key.participant || mek.key.remoteJid || '').split('@')[0];
    const chatJid = from;
    const msgId = contextInfo.stanzaId || '';

    const richMsg = {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: "",
          richResponseSourcesMetadata: {}
        }
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [
              {
                messageType: 2,
                messageText: "# ⚡ Relay Snippet"
              },
              {
                messageType: 2,
                messageText: `• Type   : ${msgType}\n• Chat   : ${chatJid.slice(0, 10)}.....\n• ID     : ${msgId.slice(0, 8)}.....\n• Sender : ${senderNum}`
              },
              {
                messageType: 5,
                codeMetadata: {
                  codeLanguage: "javascript",
                  codeBlocks
                }
              }
            ],
            unifiedResponse: {
              data: Buffer.from(JSON.stringify({
                response_id: require("crypto").randomUUID(),
                sections: [
                  {
                    view_model: {
                      primitive: {
                        text: "# ⚡ Relay Snippet",
                        __typename: "GenAIMarkdownTextUXPrimitive"
                      },
                      __typename: "GenAISingleLayoutViewModel"
                    }
                  },
                  {
                    view_model: {
                      primitive: {
                        text: `• Type   : ${msgType}\n• Chat   : ${chatJid.slice(0,10)}.....\n• ID     : ${msgId.slice(0,8)}.....\n• Sender : ${senderNum}`,
                        __typename: "GenAIMetadataTextPrimitive"
                      },
                      __typename: "GenAISingleLayoutViewModel"
                    }
                  },
                  {
                    view_model: {
                      primitive: {
                        language: "javascript",
                        code_blocks: [{ content: relayCode, type: "DEFAULT" }],
                        __typename: "GenAICodeUXPrimitive"
                      },
                      __typename: "GenAISingleLayoutViewModel"
                    }
                  }
                ]
              })).toString('base64')
            },
            contextInfo: {
              stanzaId: contextInfo.stanzaId,
              participant: contextInfo.participant,
              quotedMessage: contextInfo.quotedMessage,
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: { botJid: "0@bot" },
              forwardOrigin: 4,
              quotedType: 0
            }
          }
        }
      }
    };

    try {
      const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");
      const waMsg = await generateWAMessageFromContent(from, richMsg, { quoted: mek });
      await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
      await react("✅");
    } catch (e) {
      console.error("[CRM] error:", e.message);
      await react("🙅‍♂️");
      await reply("🙅‍♂️ Failed: " + e.message);
    }
  }
);
