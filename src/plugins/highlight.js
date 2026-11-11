const { cmd } = require("../lib");
const { prepareWAMessageMedia, generateWAMessageFromContent, proto } = require("@whiskeysockets/baileys");
const crypto = require('crypto');


cmd(
  {
    pattern: "paired",
    desc: "Send paired image+video status",
    category: "owner",
    react: "🔗",
    use: ".paired <img_url> | <vid_url> | <caption>",
    dontAddCommandList: false
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser, args } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ Owner only");
    
    await react("⏳");
    try {
      let [imageUrl, videoUrl, caption] = args.join(" ").split("|").map(v => v.trim());
      
      // Default if no args
      imageUrl = imageUrl || 'https://cdn.ornzora.eu.cc/a6a1e8f4-b83d-4694-9bba-0f22a58bfd4f-FIORA.jpg';
      videoUrl = videoUrl || 'https://cdn.ornzora.eu.cc/ed7ebb66-9bf4-44b6-858a-b6b7405e53c5-FIORA.mp4';
      caption = caption || '*FIORA* ✨';

      const [image, video] = await Promise.all([
        prepareWAMessageMedia({ image: { url: imageUrl } }, { upload: sock.waUploadToServer }),
        prepareWAMessageMedia({ video: { url: videoUrl } }, { upload: sock.waUploadToServer })
      ]);

      const msg1 = generateWAMessageFromContent(from, {
        imageMessage: { ...image.imageMessage, caption, contextInfo: { pairedMediaType: 5, statusSourceType: 0 } }
      }, { userJid: sock.user.id });

      await sock.relayMessage(from, msg1.message, { messageId: msg1.key.id });
      await new Promise(r => setTimeout(r, 1000));

      const msg2 = generateWAMessageFromContent(from, {
        videoMessage: { ...video.videoMessage, caption, contextInfo: { pairedMediaType: 6, statusSourceType: 0 } },
        messageContextInfo: { messageAssociation: { associationType: 12, parentMessageKey: msg1.key } }
      }, { userJid: sock.user.id });

      await sock.relayMessage(from, msg2.message, { messageId: msg2.key.id });
      await react("✅");
      await reply("✅ Paired status sent");
    } catch (e) {
      console.error(e);
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ Error: ${e.message}`);
    }
  }
);

cmd(
  {
    pattern: "highlight",
    aliases: ["hl"],
    desc: "Send yellow AI highlight text",
    category: "owner",
    react: "🟨",
    use: ".highlight <text> or .highlight <jid> <text>",
    dontAddCommandList: false
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser, args } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ Owner only");

    if (!args.length) return reply("🙅‍♂️ Text do!\nExample:\n.highlight Hello World\n.highlight 120363@g.us Hello World");

    // ── JID detect karo ──────────────────────────────────────
    let targetJid = from;
    let textArgs = args;

    const firstArg = args[0] || '';
    if (firstArg.endsWith('@g.us') || firstArg.endsWith('@s.whatsapp.net')) {
      targetJid = firstArg;
      textArgs = args.slice(1);
    }

    const rawText = textArgs.join(' ').trim();
    if (!rawText) return reply("🙅‍♂️ Text do!");

    const text = `=={ ${rawText} }==`;

    await react("⏳");
    try {
      const { randomUUID } = require('crypto');

      const sections = [{
        view_model: {
          primitive: {
            text,
            __typename: "GenAIMarkdownTextUXPrimitive"
          },
          __typename: "GenAISingleLayoutViewModel"
        }
      }];

      const payload = {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
          botMetadata: {
            messageDisclaimerText: "",
            richResponseSourcesMetadata: { sources: [] }
          }
        },
        botForwardedMessage: {
          message: {
            richResponseMessage: {
              messageType: 1,
              submessages: [{ messageType: 2, messageText: text }],
              unifiedResponse: {
                data: Buffer.from(JSON.stringify({
                  response_id: randomUUID(),
                  sections
                })).toString('base64')
              },
              contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedAiBotMessageInfo: { botJid: "0@bot" },
                forwardOrigin: 4
              }
            }
          }
        }
      };

      await sock.relayMessage(targetJid, payload, {});
      await react("✅");

      // Confirm agar alag group mein bheja
      if (targetJid !== from) {
        await reply(`✅ Highlight sent to *${targetJid}*`);
      }
    } catch (e) {
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ Error: ${e.message}`);
    }
  }
);

cmd(
  {
    pattern: "event",
    desc: "Create fake WhatsApp event",
    category: "owner",
    react: "📅",
    use: ".event <name> | <desc> | <hours_from_now>",
    dontAddCommandList: false
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser, isGroup, args } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ Owner only");
    if (!isGroup) return reply("🙅‍♂️ Only works in groups");
    
    await react("⏳");
    try {
      let [name, desc, hours] = args.join(" ").split("|").map(v => v.trim());
      name = name || "Test Event";
      desc = desc || "Event description";
      hours = parseInt(hours) || 1;
      
      const startTime = Math.floor(Date.now() / 1000) + (hours * 3600);
      
      await sock.relayMessage(from, {
        senderKeyDistributionMessage: {
          groupId: from,
          axolotlSenderKeyDistributionMessage: crypto.randomBytes(20).toString('base64')
        },
        messageContextInfo: {
          messageSecret: crypto.randomBytes(24).toString('base64')
        },
        eventMessage: {
          contextInfo: { expiration: 86400, disappearingMode: { initiator: 0, trigger: 0 } },
          isCanceled: false,
          name: name,
          description: desc,
          startTime: startTime,
          extraGuestsAllowed: true,
          isScheduleCall: false,
          hasReminder: true,
          reminderOffsetSec: 1800
        }
      }, {
        additionalNodes: [{ tag: "meta", attrs: { event_type: "creation" } }]
      });
      
      await react("✅");
      await reply(`✅ Event "${name}" created for ${hours}h from now`);
    } catch (e) {
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ Error: ${e.message}`);
    }
  }
);

cmd(
  {
    pattern: "reqnum",
    alias: ["getnumber"],
    desc: "Request user phone number",
    category: "owner",
    react: "📱",
    dontAddCommandList: false
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser, isGroup } = conText;
    if (!isSuperUser) return reply("🙅‍♂️ Owner only");
    
    await react("⏳");
    try {
      await sock.relayMessage(from, {
        protocolMessage: {
          type: proto.Message.ProtocolMessage.Type.SHARE_PHONE_NUMBER
        }
      }, {});
      await react("✅");
    } catch (e) {
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ Error: ${e.message}`);
    }
  }
);
