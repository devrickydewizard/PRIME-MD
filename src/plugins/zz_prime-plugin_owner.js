// PRIME plugin: Owner.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const { S_WHATSAPP_NET, downloadMediaMessage } = require("@whiskeysockets/baileys");

const Jimp = require('jimp');

const moment = require('moment-timezone');

const fs = require('fs/promises');

const { exec } = require("child_process");

const axios = require('axios');

const util = require('util');

const { sendInteractiveMessage } = require('gifted-btns');

pcmd({
  pattern: "whoami",
  aliases: ["myid", "debugid"],
  category: "Owner",
  description: "Debug: show sender/quoted jid + username info",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, isSuperUser, sender, senderUsername, quotedUser, quotedUsername, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  const lines = [
    "*🔎 Identity Debug*",
    "",
    `sender jid: ${sender || '(none)'}`,
    `senderUsername: ${senderUsername || '(none resolved)'}`,
    "",
    `quotedUser jid: ${quotedUser || '(no quoted message)'}`,
    `quotedUsername: ${quotedUsername || '(none resolved)'}`,
    "",
    `key.participantUsername: ${mek?.key?.participantUsername || '(undefined)'}`,
    `key.remoteJidUsername: ${mek?.key?.remoteJidUsername || '(undefined)'}`
  ];

  await reply(lines.join("\n"));
});

pcmd({
  pattern: "mygroups",
  aliases: ["groups", "botgroups", "glist"],
  category: "Owner",
  description: "List all groups the bot is in (interactive)",
  filename: __filename
}, async (from, client, { reply, isSuperUser }) => {
  if (!isSuperUser) return reply("❌ Owner Only Command!");

  try {
    const allGroups = await client.groupFetchAllParticipating();
    const groupList = Object.values(allGroups);

    if (!groupList.length) return reply("⚠️ Bot is not in any groups.");

    // Build interactive rows including JID
    const rows = groupList.map(g => ({
      header: "📛",
      title: g.subject || "Unnamed Group",
      description: `👥 Members: ${g.participants?.length || 0}\n🆔 JID: ${g.id}`,
      id: `group_${g.id}`
    }));

    await sendInteractiveMessage(client, from, {
      text: `*📋 My Groups*\n\nBot is in ${groupList.length} groups.\nSelect one to view metadata:`,
      interactiveButtons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: 'Groups',
            sections: [
              {
                title: 'Available Groups',
                rows
              }
            ]
          })
        }
      ]
    });

  } catch (err) {
    console.error("mygroups error:", err);
    reply("❌ Error while accessing bot groups.\n\n" + err.message);
  }
});

pcmd({
  pattern: "pp",
  aliases: ["setpp", "setprofile"],
  category: "Owner",
  description: "Set profile picture"
},
async (from, client, conText) => {
  const { reply, quoted, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  const quotedImg = quoted?.imageMessage || quoted?.message?.imageMessage;
  if (!quotedImg) return reply("📸 Reply to an image to set as profile picture.");

  try {
    const filePath = await client.downloadAndSaveMediaMessage(quotedImg);
    await client.updateProfilePicture(client.user.id, { url: filePath });
    await reply(" Profile picture updated successfully!");
  } catch (err) {
    console.error("pp error:", err);
    reply(`Failed: ${err.message}`);
  }
});

pcmd({
  pattern: "createcall",
  aliases: ["videocall", "createcallink"],
  category: "Owner",
  description: "Create WhatsApp video call link"
}, async (from, client, conText) => {
  const { reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner only!");

  try {
    const token = await client.createCallLink('video');
    if (!token) return reply("❌ Failed to create call link.");
    
    const link = `https://call.whatsapp.com/video/${token}`;
    await client.sendMessage(from, { text: link, linkPreview: true }, { quoted: mek });
    
  } catch (err) {
    await reply(`❌ ${err.message}`);
  }
});

pcmd({
  pattern: "disappearing",
  aliases: ["updatedisappearing", "ephemeral"],
  category: "Privacy",
  description: "Update your WhatsApp default disappearing messages duration"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q) {
    return reply("📌 Usage: .disappearing <0|86400|604800|7776000>\n\nValues:\n0 = Remove\n86400 = 24h\n604800 = 7d\n7776000 = 90d");
  }

  const value = parseInt(q.trim(), 10);
  const validValues = [0, 86400, 604800, 7776000];

  if (!validValues.includes(value)) {
    return reply("❌ Invalid value.\nAvailable options: 0, 86400, 604800, 7776000");
  }

  try {
    await client.updateDefaultDisappearingMode(value);

    // Map seconds to human-readable label
    const labels = {
      0: "Removed (No disappearing messages)",
      86400: "24 hours",
      604800: "7 days",
      7776000: "90 days"
    };

    await client.sendMessage(from, {
      text: `✅ Default disappearing messages updated to: *${labels[value]}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("disappearing error:", err);
    reply(`❌ Error updating disappearing messages.\n${err.message}`);
  }
});

pcmd({
  pattern: "groupprivacy",
  aliases: ["updategroupprivacy"],
  category: "Privacy",
  description: "Update your WhatsApp Group Add privacy setting"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q) {
    return reply("📌 Usage: .groupprivacy <all|contacts|contact_blacklist>");
  }

  const value = q.trim().toLowerCase();
  const validValues = ["all", "contacts", "contact_blacklist"];

  if (!validValues.includes(value)) {
    return reply(`❌ Invalid value.\nAvailable options: ${validValues.join(", ")}`);
  }

  try {
    await client.updateGroupsAddPrivacy(value);

    await client.sendMessage(from, {
      text: `✅ Group Add privacy updated to: *${value}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("groupprivacy error:", err);
    reply(`❌ Error updating Group Add privacy.\n${err.message}`);
  }
});

pcmd({
  pattern: "readreceipts",
  aliases: ["updatereadreceipts"],
  category: "Privacy",
  description: "Update your WhatsApp Read Receipts privacy setting"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q) {
    return reply("📌 Usage: .readreceipts <all|none>");
  }

  const value = q.trim().toLowerCase();
  const validValues = ["all", "none"];

  if (!validValues.includes(value)) {
    return reply(`❌ Invalid value.\nAvailable options: ${validValues.join(", ")}`);
  }

  try {
    await client.updateReadReceiptsPrivacy(value);

    await client.sendMessage(from, {
      text: `✅ Read Receipts privacy updated to: *${value}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("readreceipts privacy error:", err);
    reply(`❌ Error updating Read Receipts privacy.\n${err.message}`);
  }
});

pcmd({
  pattern: "statusprivacy",
  aliases: ["updatestatusprivacy"],
  category: "Privacy",
  description: "Update your WhatsApp Status privacy setting"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q) {
    return reply("📌 Usage: .statusprivacy <all|contacts|contact_blacklist|none>");
  }

  const value = q.trim().toLowerCase();
  const validValues = ["all", "contacts", "contact_blacklist", "none"];

  if (!validValues.includes(value)) {
    return reply(`❌ Invalid value.\nAvailable options: ${validValues.join(", ")}`);
  }

  try {
    await client.updateStatusPrivacy(value);

    await client.sendMessage(from, {
      text: `✅ Status privacy updated to: *${value}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("statusprivacy error:", err);
    reply(`❌ Error updating Status privacy.\n${err.message}`);
  }
});

pcmd({
  pattern: "profileprivacy",
  aliases: ["updateprofileprivacy"],
  category: "Privacy",
  description: "Update your WhatsApp Profile Picture privacy setting"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q) {
    return reply("📌 Usage: .profileprivacy <all|contacts|contact_blacklist|none>");
  }

  const value = q.trim().toLowerCase();
  const validValues = ["all", "contacts", "contact_blacklist", "none"];

  if (!validValues.includes(value)) {
    return reply(`❌ Invalid value.\nAvailable options: ${validValues.join(", ")}`);
  }

  try {
    await client.updateProfilePicturePrivacy(value);

    await client.sendMessage(from, {
      text: `✅ Profile Picture privacy updated to: *${value}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("profileprivacy error:", err);
    reply(`❌ Error updating Profile Picture privacy.\n${err.message}`);
  }
});

pcmd({
  pattern: "updateonline",
  aliases: ["online"],
  category: "Privacy",
  description: "Update your WhatsApp Online privacy setting"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q) {
    return reply("📌 Usage: .online <all|match_last_seen>");
  }

  const value = q.trim().toLowerCase();
  const validValues = ["all", "match_last_seen"];

  if (!validValues.includes(value)) {
    return reply(`❌ Invalid value.\nAvailable options: ${validValues.join(", ")}`);
  }

  try {
    await client.updateOnlinePrivacy(value);

    await client.sendMessage(from, {
      text: `✅ Online privacy updated to: *${value}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("online privacy error:", err);
    reply(`❌ Error updating Online privacy.\n${err.message}`);
  }
});

pcmd({
  pattern: "lastseen",
  aliases: ["updatelastseen"],
  category: "Privacy",
  description: "Update your WhatsApp Last Seen privacy setting"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q) {
    return reply("📌 Usage: .lastseen <all|contacts|contact_blacklist|none>");
  }

  const value = q.trim().toLowerCase();
  const validValues = ["all", "contacts", "contact_blacklist", "none"];

  if (!validValues.includes(value)) {
    return reply(`❌ Invalid value.\nAvailable options: ${validValues.join(", ")}`);
  }

  try {
    await client.updateLastSeenPrivacy(value);

    await client.sendMessage(from, {
      text: `✅ Last Seen privacy updated to: *${value}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("lastseen error:", err);
    reply(`❌ Error updating Last Seen privacy.\n${err.message}`);
  }
});

pcmd({
  pattern: "privacy",
  aliases: ["fetchprivacy", "ownersettings"],
  category: "Privacy",
  description: "Show your WhatsApp privacy settings"
},
async (from, client, conText) => {
  const { reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  try {
    const settings = await client.fetchPrivacySettings(true);

    if (!settings) {
      return reply("❌ Failed to fetch privacy settings.");
    }

    // Build caption with Unicode box styling
    let caption = `╭━━━━━━━━━━━━━━━╮\n`;
    caption += `│ 🔒 *Privacy Settings*\n`;
    caption += `├━━━━━━━━━━━━━━━┤\n`;
    caption += `│ 📞 Call Add: ${settings.calladd}\n`;
    caption += `│ 🛡️ Defense: ${settings.defense}\n`;
    caption += `│ 👥 Group Add: ${settings.groupadd}\n`;
    caption += `│ 💬 Messages: ${settings.messages}\n`;
    caption += `│ 🌐 Online: ${settings.online}\n`;
    caption += `│ ⏳ Last Seen: ${settings.last}\n`;
    caption += `│ 🖼️ Profile: ${settings.profile}\n`;
    caption += `│ 👁️ Read Receipts: ${settings.readreceipts}\n`;
    caption += `│ 📢 Status: ${settings.status}\n`;
    caption += `│ 🎭 Stickers: ${settings.stickers}\n`;
    caption += `╰━━━━━━━━━━━━━━━╯`;

    await client.sendMessage(from, { text: caption }, { quoted: mek });

  } catch (err) {
    console.error("privacy error:", err);
    reply(`❌ Error fetching privacy settings.\n${err.message}`);
  }
});

pcmd({
  pattern: "blocklist",
  category: "Privacy",
  aliases: ["listblock", "blacklist"],
  description: "Show list of blocked members and allow unblock by reply"
},
async (from, client, conText) => {
  const { reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  try {
    const blocked = await client.fetchBlocklist();

    if (!blocked || blocked.length === 0) {
      return reply("✅ You have not blocked any members.");
    }

    // Build message with @tags
    let message = `🚫 You have blocked ${blocked.length} members:\n\n`;
    message += blocked.map((jid, i) => `${i + 1}. @${jid.split('@')[0]}`).join("\n");
    message += `\n📌 Reply with the number to unblock that member.`;

    const sent = await client.sendMessage(from, {
      text: message,
      mentions: blocked
    }, { quoted: mek });

    const messageId = sent.key.id;

    // Listen for reply with number
    client.ev.on("messages.upsert", async (update) => {
      const msg = update.messages[0];
      if (!msg.message) return;

      const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
      const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
      const chatId = msg.key.remoteJid;

      if (!isReply) return;

      const num = parseInt(responseText.trim(), 10);
      if (isNaN(num) || num < 1 || num > blocked.length) {
        return client.sendMessage(chatId, {
          text: `❌ Invalid number. Reply with a number between 1 and ${blocked.length}.`,
          quoted: msg
        });
      }

      try {
        const jidToUnblock = blocked[num - 1];
        await client.updateBlockStatus(jidToUnblock, "unblock");

        await client.sendMessage(chatId, {
          text: `✅ Unblocked @${jidToUnblock.split('@')[0]}`,
          mentions: [jidToUnblock],
          quoted: msg
        });
      } catch (err) {
        console.error("Unblock error:", err);
        await client.sendMessage(chatId, {
          text: `❌ Failed to unblock.\nError: ${err.message}`,
          quoted: msg
        });
      }
    });

  } catch (err) {
    console.error("blocklist error:", err);
    reply(`❌ Failed to fetch blocklist.\nError: ${err.message}`);
  }
});

pcmd({
  pattern: "rpp",
  aliases: ["removepic", "deletepp", "clearpp"],
  category: "Owner",
  description: "Remove your own profile picture"
},
async (from, client, conText) => {
  const { reply, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  try {
    // ✅ Proper IQ node for removal: include <picture> with empty content
    const iqNode = {
      tag: "iq",
      attrs: {
        to: S_WHATSAPP_NET,
        type: "set",
        xmlns: "w:profile:picture"
      },
      content: [
        {
          tag: "picture",
          attrs: { type: "image" },
          content: [] // empty signals removal
        }
      ]
    };

    await client.query(iqNode);
    reply("🗑️ Profile picture removed successfully!");
  } catch (err) {
    console.error("rpp error:", err);
    reply(`❌ Failed to remove profile picture.\nError: ${err.message}`);
  }
});

pcmd({
  pattern: "setgpp",
  aliases: ["gcpic", "groupfullpp", "gupdateprofile", "gfullpp"],
  category: "group",
  description: "Set group profile picture (raw upload, no resizing)"
},
async (from, client, conText) => {
  const { reply, quoted, isSuperUser, isGroup } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ This command can only be used in a group!");

  let tempFilePath;
  try {
    const quotedImg = quoted?.imageMessage || quoted?.message?.imageMessage;
    if (!quotedImg) return reply("📸 Quote an image to set as group profile picture.");

    // Download quoted image directly
    tempFilePath = await client.downloadAndSaveMediaMessage(quotedImg, 'temp_media');

    // Get group metadata
    const metadata = await client.groupMetadata(from);
    const groupId = metadata.id;

    // ✅ Upload image as-is (no resizing)
    if (client.updateProfilePicture) {
      await client.updateProfilePicture(groupId, { url: tempFilePath });
      await fs.unlink(tempFilePath);
      return reply("✅ Group profile picture updated successfully");
    }

    reply("❌ updateProfilePicture method not available in this Baileys version.");

  } catch (err) {
    console.error("gpp error:", err);
    if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
    reply(`❌ Failed to update group profile picture.\nError: ${err.message}`);
  }
});

pcmd({
  pattern: "logout",
  aliases: ["exit"],
  category: "Owner",
  description: "Log the bot out of WhatsApp"
},
async (from, client, conText) => {
  const { isSuperUser } = conText;

  if (!isSuperUser) return;

  await client.logout();
});

pcmd({
  pattern: "fetch",
  aliases: ["get", "curl"],
  description: "Fetch and display content from a URL",
  category: "Owner",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek } = conText;
  if (!q) return reply("❌ Provide a valid URL to fetch.");

  try {
    const response = await axios.get(q, { responseType: 'arraybuffer' });
    const contentType = response.headers['content-type'];

    if (!contentType) return reply("❌ Server did not return a content-type.");
    console.log("Content-Type:", contentType);

    const buffer = Buffer.from(response.data);
    const filename = q.split('/').pop() || "file";

    if (contentType.includes('application/json')) {
      const json = JSON.parse(buffer.toString());
      return reply("```json\n" + JSON.stringify(json, null, 2).slice(0, 4000) + "\n```");
    }

    if (contentType.includes('text/html')) {
      const html = buffer.toString();
      return reply(html.slice(0, 4000));
    }

    if (contentType.includes('image')) {
      return client.sendMessage(from, { image: buffer, caption: q }, { quoted: mek });
    }

    if (contentType.includes('video')) {
      return client.sendMessage(from, { video: buffer, caption: q }, { quoted: mek });
    }

    if (contentType.includes('audio')) {
      return client.sendMessage(from, {
        audio: buffer,
        mimetype: "audio/mpeg",
        fileName: filename
      }, { quoted: mek });
    }

    if (contentType.includes('application/pdf')) {
      return client.sendMessage(from, {
        document: buffer,
        mimetype: "application/pdf",
        fileName: filename
      }, { quoted: mek });
    }

    if (contentType.includes('application')) {
      return client.sendMessage(from, {
        document: buffer,
        mimetype: contentType,
        fileName: filename
      }, { quoted: mek });
    }

    if (contentType.includes('text/')) {
      return reply(buffer.toString().slice(0, 4000));
    }

    return reply("❌ Unsupported or unknown content type.");
  } catch (err) {
    console.error("fetch error:", err);
    return reply("❌ Failed to fetch the URL.");
  }
});

pcmd({
  pattern: "chunk",
  aliases: ["details", "det", "ret"],
  description: "Displays raw quoted message in JSON format",
  category: "Owner",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, react, quotedMsg, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Superuser only command.");
  if (!quotedMsg) return reply("❌ Please reply to a message to inspect it.");

  try {
    const json = JSON.stringify(quotedMsg, null, 2);
    const chunks = json.match(/[\s\S]{1,100000}/g) || [];

    for (const chunk of chunks) {
      const formatted = "```json\n" + chunk + "\n```";
      await client.sendMessage(from, { text: formatted }, { quoted: mek });
      //await react("✅");
    }
  } catch (err) {
    console.error("Error dumping message:", err);
  }
});

pcmd({
  pattern: "save",
  aliases: ["savestatus", "statussave"],
  description: "Retrieve quoted media (image, video, audio) including group status",
  category: "Owner",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Reply to a status message to save.");

  try {
    // Check for direct media messages
    if (quoted?.imageMessage) {
      const caption = quoted.imageMessage.caption || "";
      const buffer = await downloadMediaMessage(
        { message: { imageMessage: quoted.imageMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(from, { image: buffer, caption }, { quoted: mek });
      return;
    }

    if (quoted?.videoMessage) {
      const caption = quoted.videoMessage.caption || "";
      const buffer = await downloadMediaMessage(
        { message: { videoMessage: quoted.videoMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(from, { video: buffer, caption }, { quoted: mek });
      return;
    }

    if (quoted?.audioMessage) {
      const buffer = await downloadMediaMessage(
        { message: { audioMessage: quoted.audioMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(from, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: mek });
      return;
    }

    // Check for groupStatusMessageV2 (status messages with media)
    if (quoted?.groupStatusMessageV2?.message) {
      const statusMsg = quoted.groupStatusMessageV2.message;
      
      // Check for video in status
      if (statusMsg.videoMessage) {
        const caption = statusMsg.videoMessage.caption || "";
        const buffer = await downloadMediaMessage(
          { message: { videoMessage: statusMsg.videoMessage } },
          'buffer',
          {},
          { reuploadRequest: client.updateMediaMessage, logger: console }
        );
        await client.sendMessage(from, { video: buffer, caption }, { quoted: mek });
        return;
      }
      
      // Check for image in status
      if (statusMsg.imageMessage) {
        const caption = statusMsg.imageMessage.caption || "";
        const buffer = await downloadMediaMessage(
          { message: { imageMessage: statusMsg.imageMessage } },
          'buffer',
          {},
          { reuploadRequest: client.updateMediaMessage, logger: console }
        );
        await client.sendMessage(from, { image: buffer, caption }, { quoted: mek });
        return;
      }
      
      // Check for audio in status
      if (statusMsg.audioMessage) {
        const buffer = await downloadMediaMessage(
          { message: { audioMessage: statusMsg.audioMessage } },
          'buffer',
          {},
          { reuploadRequest: client.updateMediaMessage, logger: console }
        );
        await client.sendMessage(from, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: mek });
        return;
      }
      
      // Check for document in status
      if (statusMsg.documentMessage) {
        const buffer = await downloadMediaMessage(
          { message: { documentMessage: statusMsg.documentMessage } },
          'buffer',
          {},
          { reuploadRequest: client.updateMediaMessage, logger: console }
        );
        await client.sendMessage(from, { 
          document: buffer, 
          fileName: statusMsg.documentMessage.fileName || 'document',
          mimetype: statusMsg.documentMessage.mimetype 
        }, { quoted: mek });
        return;
      }
    }

    // Check for nested message in status (some versions wrap it differently)
    if (quoted?.groupStatusMessageV2?.message?.message) {
      const innerMsg = quoted.groupStatusMessageV2.message.message;
      
      if (innerMsg.videoMessage) {
        const caption = innerMsg.videoMessage.caption || "";
        const buffer = await downloadMediaMessage(
          { message: { videoMessage: innerMsg.videoMessage } },
          'buffer',
          {},
          { reuploadRequest: client.updateMediaMessage, logger: console }
        );
        await client.sendMessage(from, { video: buffer, caption }, { quoted: mek });
        return;
      }
      
      if (innerMsg.imageMessage) {
        const caption = innerMsg.imageMessage.caption || "";
        const buffer = await downloadMediaMessage(
          { message: { imageMessage: innerMsg.imageMessage } },
          'buffer',
          {},
          { reuploadRequest: client.updateMediaMessage, logger: console }
        );
        await client.sendMessage(from, { image: buffer, caption }, { quoted: mek });
        return;
      }
      
      if (innerMsg.audioMessage) {
        const buffer = await downloadMediaMessage(
          { message: { audioMessage: innerMsg.audioMessage } },
          'buffer',
          {},
          { reuploadRequest: client.updateMediaMessage, logger: console }
        );
        await client.sendMessage(from, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: mek });
        return;
      }
    }

    // If no media found
    reply("❌ No media found in the quoted message.");

  } catch (err) {
    console.error("save command error:", err);
    reply("❌ Failed to retrieve media. Try again.");
  }
});

pcmd({
  pattern: "vv2",
  aliases: ["amazing", "lovely", "beautiful", "😍", "😘"],
  description: "Retrieve quoted media and send privately to sender",
  category: "Owner",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply, sender } = conText;
  if (!quotedMsg) return reply("📌 Reply to a media message to retrieve it.");
  try {
    if (quoted?.imageMessage) {
      const caption = quoted.imageMessage.caption || "";
      const buffer = await downloadMediaMessage(
        { message: { imageMessage: quoted.imageMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(sender, { image: buffer, caption }, { quoted: mek });
    }
    if (quoted?.videoMessage) {
      const caption = quoted.videoMessage.caption || "";
      const buffer = await downloadMediaMessage(
        { message: { videoMessage: quoted.videoMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(sender, { video: buffer, caption }, { quoted: mek });
    }
    if (quoted?.audioMessage) {
      const buffer = await downloadMediaMessage(
        { message: { audioMessage: quoted.audioMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(sender, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: mek });
    }
  } catch (err) {
    console.error("vv2 command error:", err);
    reply("❌ Failed to retrieve media. Try again.");
  }
});

pcmd({
  pattern: "vv",
  aliases: ["wow", "retrieve"],
  description: "Retrieve quoted media (image, video, audio)",
  category: "Owner",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Reply to a media message to retrieve it.");

  try {
    if (quoted?.imageMessage) {
      const caption = quoted.imageMessage.caption || "";
      const buffer = await downloadMediaMessage(
        { message: { imageMessage: quoted.imageMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(from, { image: buffer, caption }, { quoted: mek });
    }

    if (quoted?.videoMessage) {
      const caption = quoted.videoMessage.caption || "";
      const buffer = await downloadMediaMessage(
        { message: { videoMessage: quoted.videoMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(from, { video: buffer, caption }, { quoted: mek });
    }

    if (quoted?.audioMessage) {
      const buffer = await downloadMediaMessage(
        { message: { audioMessage: quoted.audioMessage } },
        'buffer',
        {},
        { reuploadRequest: client.updateMediaMessage, logger: console }
      );
      await client.sendMessage(from, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: mek });
    }

  } catch (err) {
    console.error("vv command error:", err);
    reply("❌ Failed to retrieve media. Try again.");
  }
});

pcmd({
  pattern: "profile",
  aliases: ["getpp"],
  category: "Owner",
  description: "Get someone's full profile info",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, quoted, quotedUser, quotedMsg, q, isGroup, timeZone, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  let target;

  // Case 1: quoted user
  if (quotedMsg && quotedUser) {
    target = quotedUser;
    if (isGroup && !target.endsWith('@s.whatsapp.net')) {
      try {
        const jid = await client.getJidFromLid(target);
        if (jid) target = jid;
      } catch {}
    }
  }

  // Case 2: direct number in args
  if (!target && q) {
    const possibleNumber = q.trim().split(/\s+/).find(part => /^\d+$/.test(part));
    if (!possibleNumber || possibleNumber.length < 5) {
      return reply("❌ Please provide a valid phone number (at least 5 digits).");
    }
    target = `${possibleNumber}@s.whatsapp.net`;
  }

  if (!target) {
    return reply("📛 Reply to a user or provide a phone number.\nExample: .profile 254757047860");
  }

  let statusText = "Not Found";
  let setAt = "Not Available";

  try {
    let ppUrl;
    try {
      ppUrl = await client.profilePictureUrl(target, 'image');
    } catch {
      ppUrl = "https://telegra.ph/file/9521e9ee2fdbd0d6f4f1c.jpg";
    }

    try {
      const status = await client.fetchStatus(target);
      if (status?.length && status[0]?.status) {
        statusText = status[0].status.status || "Not Found";
        setAt = status[0].status.setAt || "Not Available";
      }
    } catch {}

    let formatted = "Not Available";
    if (setAt !== "Not Available") {
      try {
        formatted = moment(setAt).tz(timeZone).format('dddd, MMMM Do YYYY, h:mm A z');
      } catch {}
    }

    const number = target.replace(/@s\.whatsapp\.net$/, "");

    await client.sendMessage(from, {
      image: { url: ppUrl },
      caption: `*👤 User Profile*\n\n` +
               `*• Name:* @${number}\n` +
               `*• Number:* ${number}\n` +
               `*• About:* ${statusText}\n` +
               `*• Last Updated:* ${formatted}`,
      mentions: [target]
    }, { quoted: mek });

  } catch (err) {
    console.error("profile error:", err);
    reply(`❌ Failed to fetch profile info.\nError: ${err.message}`);
  }
});

pcmd({
  pattern: "fullpp",
  aliases: ["setfullpp"],
  category: "Owner",
  description: "Set full profile picture without cropping"
},
async (from, client, conText) => {
  const { reply, quoted, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  let tempFilePath;

  try {
    const quotedImg = quoted?.imageMessage || quoted?.message?.imageMessage;
    if (!quotedImg) return reply("📸 Quote an image to set as profile picture.");

    tempFilePath = await client.downloadAndSaveMediaMessage(quotedImg, 'temp_media');

    const image = await Jimp.read(tempFilePath);
    const resized = await image.scaleToFit(720, 720);
    const buffer = await resized.getBufferAsync(Jimp.MIME_JPEG);

    const iqNode = {
      tag: "iq",
      attrs: { to: S_WHATSAPP_NET, type: "set", xmlns: "w:profile:picture" },
      content: [{ tag: "picture", attrs: { type: "image" }, content: buffer }]
    };

    await client.query(iqNode);
    await fs.unlink(tempFilePath);
    reply("✅ Profile picture updated successfully (full image).");

  } catch (err) {
    console.error("fullpp error:", err);
    if (tempFilePath) await fs.unlink(tempFilePath).catch(() => {});
    reply(`❌ Failed to update profile picture.\nError: ${err.message}`);
  }
});

pcmd({
  pattern: "jid",
  category: "Owner",
  description: "Get User/Group JID"
},
async (from, client, conText) => {
  const { q, mek, reply, isGroup, isSuperUser, quotedUser } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  try {
    let result;

    if (quotedUser) {
      if (quotedUser.startsWith('@') && quotedUser.includes('@lid')) {
        result = quotedUser.replace('@', '') + '@lid';
      } else {
        result = quotedUser;
      }
    } else if (isGroup) {
      result = from;
    } else {
      result = from || mek.key.remoteJid;
    }

    let finalResult = result;
    if (result && result.includes('@lid')) {
      finalResult = await client.getJidFromLid(result);
    }

    reply(`${finalResult}`);

  } catch (error) {
    console.error("jid error:", error);
    reply(`❌ Error: ${error.message}`);
  }
});

pcmd({
  pattern: "setsudo",
  aliases: ['sudo', 'sudoadd', 'addsudo'],
  category: "Owner",
  description: "Sets User as Sudo",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply, isSuperUser, quotedUser, quotedUsername, quotedMsg, q, setSudo } = conText;

  if (!isSuperUser) {
    return reply("❌ Owner Only Command!");
  }

  let targetNumber;
  let targetUsername;

  // Case 1: quoted user - check username first, fall back to jid exactly like before
  if (quotedMsg && (quotedUsername || quotedUser)) {
    if (quotedUsername) {
      targetUsername = quotedUsername;
    }

    if (quotedUser) {
      let result = quotedUser;
      if (quotedUser.startsWith('@') && quotedUser.includes('@lid')) {
        result = quotedUser.replace('@', '') + '@lid';
      }
      let finalResult = result;
      if (result.includes('@lid')) {
        finalResult = await client.getJidFromLid(result);
      }
      targetNumber = finalResult.split("@")[0];
    }
  }

  // Case 2: direct number or @username in args
  if (!targetNumber && !targetUsername && q) {
    const parts = q.trim().split(/\s+/);
    const possibleUsername = parts.find(part => part.startsWith('@') && !/^\d+$/.test(part.slice(1)));
    const possibleNumber = parts.find(part => /^\d+$/.test(part));

    if (possibleUsername) targetUsername = possibleUsername.replace('@', '').toLowerCase();
    if (possibleNumber && possibleNumber.length >= 5) targetNumber = possibleNumber;

    if (!targetNumber && !targetUsername) {
      return reply("❌ Please provide a valid phone number (at least 5 digits) or @username.");
    }
  }

  if (!targetNumber && !targetUsername) {
    return reply("❌ Please reply to a user or provide a phone number/username.\nExample: .setsudo 254757047860\nExample: .setsudo @veske_rs");
  }

  // A username alone with no known jid still needs a jid to satisfy the DB - if we truly
  // only have a username, store it as both jid and username so lookups by username work.
  const jidToStore = targetNumber || targetUsername;

  try {
    const added = await setSudo(jidToStore, targetUsername);
    const label = targetUsername ? `@${targetUsername}` : `@${targetNumber}`;
    const msg = added
      ? `✅ Added ${label} to sudo list.`
      : `⚠️ ${label} is already in sudo list.`;

    await client.sendMessage(from, {
      text: msg,
      mentions: quotedUser ? [quotedUser] : []
    }, { quoted: mek });

  } catch (error) {
    console.error("setsudo error:", error);
    await reply(`❌ Error: ${error.message}`);
  }
});

pcmd({
  pattern: "delsudo",
  aliases: ['removesudo'],
  category: "Owner",
  description: "Deletes User as Sudo",
  filename: __filename
}, async (from, client, { mek, reply, isSuperUser, quotedUser, quotedUsername, quotedMsg, q, delSudo }) => {
  if (!isSuperUser) {
    return reply("❌ Owner Only Command!");
  }

  let targetIdentifier;
  let targetLabel;

  // Case 1: quoted user - check username first, fall back to jid exactly like before
  if (quotedMsg && (quotedUsername || quotedUser)) {
    if (quotedUsername) {
      targetIdentifier = quotedUsername;
      targetLabel = quotedUsername;
    } else {
      let result = quotedUser;
      if (quotedUser.startsWith('@') && quotedUser.includes('@lid')) {
        result = quotedUser.replace('@', '') + '@lid';
      }
      let finalResult = result;
      if (result.includes('@lid')) {
        finalResult = await client.getJidFromLid(result);
      }
      targetIdentifier = finalResult.split("@")[0];
      targetLabel = targetIdentifier;
    }
  }

  // Case 2: direct number or @username in args
  if (!targetIdentifier && q) {
    const parts = q.trim().split(/\s+/);
    const possibleUsername = parts.find(part => part.startsWith('@') && !/^\d+$/.test(part.slice(1)));
    const possibleNumber = parts.find(part => /^\d+$/.test(part));

    if (possibleUsername) {
      targetIdentifier = possibleUsername.replace('@', '').toLowerCase();
      targetLabel = targetIdentifier;
    } else if (possibleNumber && possibleNumber.length >= 5) {
      targetIdentifier = possibleNumber;
      targetLabel = possibleNumber;
    }
  }

  if (!targetIdentifier) {
    return reply("❌ Please reply to a user or provide a phone number/username.\nExample: .delsudo 254757047860\nExample: .delsudo @veske_rs");
  }

  try {
    const removed = await delSudo(targetIdentifier);
    const msg = removed
      ? `❌ Removed @${targetLabel} from sudo list.`
      : `⚠️ @${targetLabel} is not in the sudo list.`;

    await client.sendMessage(from, {
      text: msg,
      mentions: quotedUser ? [quotedUser] : []
    }, { quoted: mek });

  } catch (error) {
    console.error("delsudo error:", error);
    await reply(`❌ Error: ${error.message}`);
  }
});

pcmd({
  pattern: "issudo",
  aliases: ['checksudo'],
  category: "Owner",
  description: "Check if user is sudo",
  filename: __filename
}, async (from, client, { mek, reply, isSuperUser, quotedUser, quotedUsername, quotedMsg, q, isSudo }) => {
  if (!isSuperUser) {
    return reply("❌ Owner Only Command!");
  }

  let targetIdentifier;
  let targetLabel;

  // Case 1: quoted user - check username first, fall back to jid exactly like before
  if (quotedMsg && (quotedUsername || quotedUser)) {
    if (quotedUsername) {
      targetIdentifier = quotedUsername;
      targetLabel = quotedUsername;
    } else {
      let result = quotedUser;
      if (quotedUser.startsWith('@') && quotedUser.includes('@lid')) {
        result = quotedUser.replace('@', '') + '@lid';
      }
      let finalResult = result;
      if (result.includes('@lid')) {
        finalResult = await client.getJidFromLid(result);
      }
      targetIdentifier = finalResult.split("@")[0];
      targetLabel = targetIdentifier;
    }
  }

  // Case 2: direct number or @username in args
  if (!targetIdentifier && q) {
    const parts = q.trim().split(/\s+/);
    const possibleUsername = parts.find(part => part.startsWith('@') && !/^\d+$/.test(part.slice(1)));
    const possibleNumber = parts.find(part => /^\d+$/.test(part));

    if (possibleUsername) {
      targetIdentifier = possibleUsername.replace('@', '').toLowerCase();
      targetLabel = targetIdentifier;
    } else if (possibleNumber && possibleNumber.length >= 5) {
      targetIdentifier = possibleNumber;
      targetLabel = possibleNumber;
    }
  }

  if (!targetIdentifier) {
    return reply("❌ Please reply to a user or provide a phone number/username.\nExample: .issudo 254757047860\nExample: .issudo @veske_rs");
  }

  try {
    const isUserSudo = await isSudo(targetIdentifier);
    const msg = isUserSudo
      ? `✅ @${targetLabel} is a sudo user.`
      : `❌ @${targetLabel} is not a sudo user.`;

    await client.sendMessage(from, {
      text: msg,
      mentions: quotedUser ? [quotedUser] : []
    }, { quoted: mek });

  } catch (error) {
    console.error("issudo error:", error);
    await reply(`❌ Error: ${error.message}`);
  }
});

pcmd({
  pattern: "getsudo",
  aliases: ['getsudos', 'listsudo', 'listsudos'],
  //react: "👑",
  category: "Owner",
  description: "Get All Sudo Users",
}, async (from, client, conText) => {
  const { mek, reply, react, isSuperUser, getSudoNumbers, getSudoUsernames, dev, devNumbers, devUsernames } = conText;

  try {
    if (!isSuperUser) {
      await react("❌");
      return reply("❌ Owner Only Command!");
    }

    // Get sudo numbers/usernames from database
    const sudoFromDB = await getSudoNumbers() || [];
    const sudoUsernamesFromDB = (typeof getSudoUsernames === 'function')
      ? (await getSudoUsernames() || [])
      : [];

    // Current dev from settings
    const currentDev = dev ? [dev.replace(/\D/g, '')] : [];

    // Combine all sudo users
    const allSudos = [...new Set([...sudoFromDB, ...devNumbers, ...currentDev])];
    const allSudoUsernames = [...new Set([...sudoUsernamesFromDB, ...(devUsernames || [])])];

    if (!allSudos.length && !allSudoUsernames.length) {
      return reply("⚠️ No sudo users found.");
    }

    let msg = "*👑 ALL SUDO USERS*\n\n";
    
    // Database sudo users
    if (sudoFromDB.length > 0) {
      msg += `*Database Sudo Users (${sudoFromDB.length}):*\n`;
      sudoFromDB.forEach((num, i) => {
        msg += `${i + 1}. wa.me/${num}\n`;
      });
      msg += '\n';
    }

    // Sudo usernames (db + hardcoded devUsernames)
    if (allSudoUsernames.length > 0) {
      msg += `*Sudo Usernames (${allSudoUsernames.length}):*\n`;
      allSudoUsernames.forEach((uname, i) => {
        msg += `${i + 1}. @${uname}\n`;
      });
      msg += '\n';
    }

    // Hardcoded dev numbers from context
    if (devNumbers && devNumbers.length > 0) {
      msg += `*Hardcoded Dev Numbers (${devNumbers.length}):*\n`;
      devNumbers.forEach((num, i) => {
        msg += `${i + 1}. wa.me/${num}\n`;
      });
      msg += '\n';
    }

    // Current dev from settings
    if (currentDev.length > 0) {
      msg += `*Current Dev (${currentDev.length}):*\n`;
      currentDev.forEach((num, i) => {
        msg += `${i + 1}. wa.me/${num}\n`;
      });
      msg += '\n';
    }

    msg += `*Total Sudo Users: ${allSudos.length + allSudoUsernames.length}*`;
    
    await reply(msg);
    await react("✅");

  } catch (error) {
    console.error("getsudo error:", error);
    await react("❌");
    await reply(`❌ Error: ${error.message}`);
  }
});

