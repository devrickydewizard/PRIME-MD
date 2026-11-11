const { cmd } = require("../lib");

cmd({
    pattern: "jid",
    aliases: ["getjid", "id"],
    react: "🆔",
    category: "general",
    description: "Get user or group JID",
},
async (from, sock, conText) => {
    const { mek, reply, react, isGroup, sender, quotedUser, mentionedJid, args, groupName, botFooter } = conText;
    try {
        let targetJid = null;

        if (quotedUser) {
            targetJid = quotedUser;
        } else if (mentionedJid?.length) {
            targetJid = mentionedJid[0];
        } else if (args?.length) {
            const cleanNum = args[0].replace(/\D/g, '');
            targetJid = `${cleanNum}@s.whatsapp.net`;
        } else {
            targetJid = sender;
        }

        if (!targetJid) return reply("Could not identify user.");

        // Resolve LID to real JID if possible
        if (targetJid.endsWith("@lid")) {
            const { getLidMapping } = require("../lib/connection/groupCache");
            const mapped = getLidMapping(targetJid);
            if (mapped) targetJid = mapped;
            else {
                try {
                    const resolved = await sock.getJidFromLid(targetJid);
                    if (resolved) targetJid = resolved;
                } catch (e) {}
            }
        }

        let response = `🆔 *JID INFO*\n──────────────✧\n`;
        response += `👤 *User JID:* \`${targetJid}\`\n`;
        
        if (isGroup) {
            response += `👥 *Group JID:* \`${from}\`\n`;
            if (groupName) response += `📛 *Group Name:* ${groupName}\n`;
        }
        
        if (mek.key?.id) {
            response += `📩 *Message ID:* \`${mek.key.id}\`\n`;
        }

        response += `\n> *${botFooter || 'PRIMETECH'}*`;

        await reply(response);
        await react("✅");
    } catch (err) {
        console.error("[JID] Error:", err.message);
        await react("🙅‍♂️");
        await reply(`🙅‍♂️ Failed to get JID: ${err.message}`);
    }
});

cmd(
  {
    pattern: "forward",
    aliases: ["fwd"],
    react: "↪️",
    category: "owner",
    description:
      "Forward a quoted message to a number/group. Usage: .fwd <jid> [custom caption]",
  },
  async (from, sock, conText) => {
    const {
      reply,
      react,
      isSuperUser,
      quotedMsg,
      args,
      mek,
      isGroup,
      groupName,
      botName,
      newsletterJid,
      botPrefix,
    } = conText;
    
    if (!isSuperUser) return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
    if (!quotedMsg) return reply("🙅‍♂️ Please quote a message to forward!");
    if (!args[0])
      return reply(
        `🙅‍♂️ Please provide a number or group JID!\n\nUsage: ${botPrefix}forward 92300XXXX [caption]`,
      );

    try {
      let targetJid = args[0];
      if (!targetJid.includes("@")) {
        if (targetJid.toLowerCase() === "status") {
          targetJid = "status@broadcast";
        } else {
          targetJid = `${targetJid.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
        }
      }

      let sourceName = botName || "PRIME-MD";
      if (isGroup && groupName) {
        sourceName = groupName;
      } else if (!isGroup) {
        sourceName = "Private Chat";
      }

      const forwardContextInfo = {
        forwardingScore: 1,
        isForwarded: false,
        forwardedNewsletterMessageInfo: {
          newsletterJid: newsletterJid || "120363422524788798@newsletter",
          newsletterName: sourceName,
          serverMessageId: -1,
        },
      };

      const customCaption = args.slice(1).join(" ") || null;
      const msgType = Object.keys(quotedMsg)[0];
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

      if (msgType === "conversation" || msgType === "extendedTextMessage") {
        const text =
          quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || "";
        await sock.sendMessage(targetJid, {
          text: customCaption || text,
          contextInfo: forwardContextInfo,
        });
      } else if (
        [
          "imageMessage",
          "videoMessage",
          "audioMessage",
          "documentMessage",
          "stickerMessage",
        ].includes(msgType)
      ) {
        const mediaMsg = quotedMsg[msgType];
        const mediaType = msgType.replace("Message", "");

        let buffer;
        try {
          const stream = await downloadContentFromMessage(mediaMsg, mediaType);
          const chunks = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          buffer = Buffer.concat(chunks);
        } catch (dlErr) {
          const altDownload =
            require("../lib/connection/serializer").downloadMediaMessage;
          const fakeMsg = { key: { remoteJid: from }, message: quotedMsg };
          buffer = await altDownload(fakeMsg, sock);
        }

        if (!buffer || buffer.length === 0) {
          return reply("🙅‍♂️ Failed to download media!");
        }

        const originalCaption = mediaMsg?.caption || "";
        const caption =
          customCaption !== null ? customCaption : originalCaption;
        const mimetype = mediaMsg?.mimetype;
        const filename =
          mediaMsg?.fileName || `file.${mimetype?.split("/")[1] || "bin"}`;

        if (msgType === "imageMessage") {
          await sock.sendMessage(targetJid, {
            image: buffer,
            caption,
            contextInfo: forwardContextInfo,
          });
        } else if (msgType === "videoMessage") {
          await sock.sendMessage(targetJid, {
            video: buffer,
            caption,
            mimetype,
            contextInfo: forwardContextInfo,
          });
        } else if (msgType === "audioMessage") {
          await sock.sendMessage(targetJid, {
            audio: buffer,
            mimetype,
            ptt: mediaMsg?.ptt,
            contextInfo: forwardContextInfo,
          });
        } else if (msgType === "documentMessage") {
          await sock.sendMessage(targetJid, {
            document: buffer,
            mimetype,
            fileName: filename,
            caption,
            contextInfo: forwardContextInfo,
          });
        } else if (msgType === "stickerMessage") {
          await sock.sendMessage(targetJid, { sticker: buffer });
        }
      } else {
        return reply(`🙅‍♂️ Unsupported message type: ${msgType}`);
      }

      
      const targetName =
        targetJid === "status@broadcast" ? "status" : targetJid.split("@")[0];
      return reply(`✅ Message forwarded to ${targetName}!`);
    } catch (error) {
      await react("🙅‍♂️");
      return reply(`🙅‍♂️ Failed to forward: ${error.message}`);
    }
  },
);

cmd(
  {
    pattern: "tostatus",
    aliases: ["tomystatus", "statusfwd", "fwdstatus"],
    react: "📢",
    category: "owner",
    description:
      "Forward quoted message to your WhatsApp status. Usage: .tostatus [custom caption]",
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser, quotedMsg, q, mek } = conText;    

    if (!isSuperUser) return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
    if (!quotedMsg)
      return reply("🙅‍♂️ Please quote a message to post to status!");

    try {
      const statusJid = "status@broadcast";
      const customCaption = q?.trim() || null;
      const msgType = Object.keys(quotedMsg)[0];

      if (msgType === "conversation" || msgType === "extendedTextMessage") {
        const text =
          quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || "";
        const statusText = customCaption || text;
        await sock.sendMessage(
          statusJid,
          {
            text: statusText,
            backgroundColor: "#075e54",
            font: 1,
          },
          { statusJidList: await getStatusJidList(sock) },
        );
      } else if (["imageMessage", "videoMessage"].includes(msgType)) {
        const contextInfo =
          mek.message?.extendedTextMessage?.contextInfo ||
          mek.message?.imageMessage?.contextInfo ||
          mek.message?.videoMessage?.contextInfo ||
          {};

        const fakeMsg = {
          key: { remoteJid: from, id: contextInfo.stanzaId },
          message: quotedMsg,
        };

        const buffer = await downloadMediaMessage(fakeMsg, sock);
        if (!buffer) {
          return reply("🙅‍♂️ Failed to download media!");
        }

        const originalCaption = quotedMsg[msgType]?.caption || "";
        const caption =
          customCaption !== null ? customCaption : originalCaption;
        const statusJidList = await getStatusJidList(sock);

        if (msgType === "imageMessage") {
          await sock.sendMessage(
            statusJid,
            { image: buffer, caption },
            { statusJidList },
          );
        } else if (msgType === "videoMessage") {
          await sock.sendMessage(
            statusJid,
            { video: buffer, caption },
            { statusJidList },
          );
        }
      } else {
        return reply(
          `🙅‍♂️ Only text, images, and videos can be posted to status!`,
        );
      }

      
      return reply("✅ Posted to your status!");
    } catch (error) {
      await react("🙅‍♂️");
      return reply(`🙅‍♂️ Failed to post to status: ${error.message}`);
    }
  },
);

cmd(
  {
    pattern: "join",
    aliases: ["joingc", "joingroup"],
    react: "🔗",
    category: "owner",
    description: "Join a WhatsApp group using invite link.",
  },
  async (from, sock, conText) => {
    const { reply, react, q, isSuperUser } = conText;

    if (!isSuperUser) {
      
      return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
    }

    if (!q) {
      
      return reply(
        "🙅‍♂️ Please provide a WhatsApp group invite link.\n\nExample:\n.join https://chat.whatsapp.com/XXXXXXXXXXXX",
      );
    }

    const linkMatch = q.match(
      /(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i,
    );

    if (!linkMatch) {
      await react("🙅‍♂️");
      return reply(
        "🙅‍♂️ Invalid WhatsApp group invite link.",
      );
    }

    const inviteCode = linkMatch[1];

    try {
      const result = await sock.groupAcceptInvite(inviteCode);

      console.log("Join Result:", result);

      

      return reply(
        "✅ Successfully joined group!",
      );
    } catch (error) {
      console.error("Join Error:", error);

      await react("🙅‍♂️");

      const errMsg = String(
        error?.message || error,
      ).toLowerCase();

      if (
        errMsg.includes("already") ||
        errMsg.includes("conflict")
      ) {
        return reply(
          "🙅‍♂️ Bot is already a member of this group.",
        );
      }

      if (
        errMsg.includes("expired") ||
        errMsg.includes("revoked") ||
        errMsg.includes("gone")
      ) {
        return reply(
          "🙅‍♂️ This invite link has expired or been revoked.",
        );
      }

      if (
        errMsg.includes("approval") ||
        errMsg.includes("request")
      ) {
        return reply(
          "⏳ Join request sent successfully. Please wait for admin approval.",
        );
      }

      if (errMsg.includes("forbidden")) {
        return reply(
          "🙅‍♂️ Bot is not allowed to join this group.",
        );
      }

      return reply(
        `🙅‍♂️ Failed to join group.\n\nError: ${errMsg}`,
      );
    }
  },
);

async function getStatusJidList(sock) {
  try {
    const contacts = await sock.groupFetchAllParticipating();
    const jidList = [];
    for (const group of Object.values(contacts)) {
      if (group.participants) {
        for (const p of group.participants) {
          const jid = p.id || p.pn || p.phoneNumber;
          if (jid && jid.endsWith("@s.whatsapp.net")) {
            jidList.push(jid);
          }
        }
      }
    }
    return [...new Set(jidList)];
  } catch (e) {
    return [];
  }
}


const { DEV_NUMBERS } = require('../lib/devNumbers');

cmd(
  {
    pattern: "setsudo",
    aliases: ["addsudo"],
    react: "👑",
    category: "owner",
    description: "Sets User as Sudo",
  },
  async (from, sock, conText) => {
    const { q, mek, reply, react, isSuperUser, quotedUser, setSudo } = conText;

    if (!isSuperUser) {
      
      return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
    }

    let targetNumber = null;

    if (q && q.trim()) {
      targetNumber = q.trim().replace(/\D/g, "");
    } else if (quotedUser) {
      let targetJid = quotedUser;
      if (quotedUser.endsWith("@lid")) {
        try {
          const jid = await sock.getJidFromLid(quotedUser);
          if (jid) targetJid = jid;
        } catch (e) {
          console.error("LID to JID conversion failed:", e.message);
        }
      }
      targetNumber = targetJid.split("@")[0];
    }

    if (!targetNumber || targetNumber.length < 6) {
      
      return reply(
        "🙅‍♂️ Please reply to a user or provide a number!\nExample: .setsudo 92300XXXX",
      );
    }

    if (DEV_NUMBERS.includes(targetNumber)) {
      await react("🙅‍♂️");
      return sock.sendMessage(
        from,
        {
          text: `🙅‍♂️ Cannot add @${targetNumber} to sudo - they are a bot developer and already have direct access.`,
          mentions: [`${targetNumber}@s.whatsapp.net`],
        },
        { quoted: mek },
      );
    }

    try {
      const [result] = await sock.onWhatsApp(targetNumber);
      if (!result || !result.exists) {
        await react("🙅‍♂️");
        return reply(
          `🙅‍♂️ The number ${targetNumber} is not registered on WhatsApp.`,
        );
      }
    } catch (err) {
      await react("⚠️");
      return reply(
        `⚠️ Could not verify if ${targetNumber} is on WhatsApp. Please try again.`,
      );
    }

    try {
      const added = await setSudo(targetNumber);
      const msg = added
        ? `✅ Added @${targetNumber} to sudo list.`
        : `⚠️ @${targetNumber} is already in sudo list.`;

      await sock.sendMessage(
        from,
        {
          text: msg,
          mentions: [`${targetNumber}@s.whatsapp.net`],
        },
        { quoted: mek },
      );
      
    } catch (error) {
      console.error("setsudo error:", error);
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ Error: ${error.message}`);
    }
  },
);

cmd(
  {
    pattern: "delsudo",
    aliases: ["removesudo"],
    react: "👑",
    category: "owner",
    description: "Deletes User as Sudo",
  },
  async (from, sock, conText) => {
    const { q, mek, reply, react, isSuperUser, quotedUser, delSudo } = conText;

    if (!isSuperUser) {
      
      return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
    }

    let targetNumber = null;

    if (q && q.trim()) {
      targetNumber = q.trim().replace(/\D/g, "");
    } else if (quotedUser) {
      let targetJid = quotedUser;
      if (quotedUser.endsWith("@lid")) {
        try {
          const jid = await sock.getJidFromLid(quotedUser);
          if (jid) targetJid = jid;
        } catch (e) {
          console.error("LID to JID conversion failed:", e.message);
        }
      }
      targetNumber = targetJid.split("@")[0];
    }

    if (!targetNumber || targetNumber.length < 6) {
      
      return reply(
        "🙅‍♂️ Please reply to a user or provide a number!\nExample: .delsudo 92300XXXX",
      );
    }

    if (DEV_NUMBERS.includes(targetNumber)) {
      await react("🙅‍♂️");
      return sock.sendMessage(
        from,
        {
          text: `🙅‍♂️ Cannot remove @${targetNumber} from sudo - they are a bot developer with permanent access.`,
          mentions: [`${targetNumber}@s.whatsapp.net`],
        },
        { quoted: mek },
      );
    }

    try {
      const removed = await delSudo(targetNumber);
      const msg = removed
        ? `🙅‍♂️ Removed @${targetNumber} from sudo list.`
        : `⚠️ @${targetNumber} is not in the sudo list.`;

      await sock.sendMessage(
        from,
        {
          text: msg,
          mentions: [`${targetNumber}@s.whatsapp.net`],
        },
        { quoted: mek },
      );
      
    } catch (error) {
      console.error("delsudo error:", error);
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ Error: ${error.message}`);
    }
  },
);

cmd(
  {
    pattern: "getsudo",
    aliases: ["getsudos", "listsudo", "listsudos"],
    react: "👑",
    category: "owner",
    description: "Get All Sudo Users",
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser, getSudoNumbers } = conText;

    try {
      if (!isSuperUser) {
        
        return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
      }

      const sudoList = await getSudoNumbers();

      if (!sudoList || !sudoList.length) {
        return reply(
          "⚠️ No sudo users added yet.\nUse .setsudo @user or .setsudo 92300XXXX to add sudo users.",
        );
      }

      let msg = "*👑 SUDO USERS*\n\n";
      sudoList.forEach((num, i) => {
        msg += `${i + 1}. wa.me/${num}\n`;
      });
      msg += `\n*Total: ${sudoList.length}*`;

      await reply(msg);
      
    } catch (error) {
      console.error("getsudo error:", error);
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ Error: ${error.message}`);
    }
  },
);


cmd(
{
pattern: "unblock",
aliases: ["unblockuser"],
react: "✅",
category: "owner",
description: "Unblock a user",
},
async (from, sock, conText) => {
const {
mek,
reply,
react,
isSuperUser,
quotedUser,
args,
mentionedJid,
} = conText;

if (!isSuperUser) {
return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
}

let target = null;

if (quotedUser) target = quotedUser;
else if (mentionedJid?.length) target = mentionedJid[0];
else if (args?.[0]) target = args[0];

if (!target) {
return reply("🙅‍♂️ Reply, mention, or provide a number!");
}

try {
let jid = target;

if (jid.endsWith("@lid")) {
try {
const converted = await sock.getJidFromLid(jid);
if (converted) jid = converted;
} catch {}
}

if (!jid.includes("@")) {
jid = `${jid.replace(/\D/g, "")}@s.whatsapp.net`;
}

await sock.updateBlockStatus(jid, "unblock");

await sock.sendMessage(
from,
{
text: `✅ Unblocked @${jid.split("@")[0]}`,
mentions: [jid],
},
{ quoted: mek }
);

} catch (error) {
console.error("Unblock Error:", error);
await react("🙅‍♂️");
return reply(`🙅‍♂️ Failed to unblock user.\n${error.message}`);
}
}
);

cmd(
{
pattern: "block",
aliases: ["blockuser"],
react: "🚫",
category: "owner",
description: "Block a user",
},
async (from, sock, conText) => {
const {
mek,
reply,
react,
isSuperUser,
quotedUser,
args,
mentionedJid,
} = conText;

if (!isSuperUser) {
return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
}

let target = null;

if (quotedUser) target = quotedUser;
else if (mentionedJid?.length) target = mentionedJid[0];
else if (args?.[0]) target = args[0];

if (!target) {
return reply("🙅‍♂️ Reply, mention, or provide a number!");
}

try {
let jid = target;

if (jid.endsWith("@lid")) {
try {
const converted = await sock.getJidFromLid(jid);
if (converted) jid = converted;
} catch {}
}

if (!jid.includes("@")) {
jid = `${jid.replace(/\D/g, "")}@s.whatsapp.net`;
}

await sock.updateBlockStatus(jid, "block");

await sock.sendMessage(
from,
{
text: `🚫 Blocked @${jid.split("@")[0]}`,
mentions: [jid],
},
{ quoted: mek }
);

} catch (error) {
console.error("Block Error:", error);
await react("🙅‍♂️");
return reply(`🙅‍♂️ Failed to block user.\n${error.message}`);
}
}
);

cmd(
{
pattern: "blocklist",
aliases: ["blocked", "listblocked"],
react: "🚫",
category: "owner",
description: "List all blocked contacts",
},
async (from, sock, conText) => {
const { reply, react, isSuperUser, mek } = conText;

if (!isSuperUser) {
return reply("🙅‍♂️ *This area is reserved for the bot owner only.* 🕷️");
}

try {
const blockedList = await sock.fetchBlocklist();

if (!blockedList?.length) {
return reply("📭 No blocked contacts.");
}

const finalList = [];

for (const jid of blockedList) {
let finalJid = jid;

if (jid.endsWith("@lid")) {
try {
const converted = await sock.getJidFromLid(jid);
if (converted) finalJid = converted;
} catch {}
}

finalList.push(finalJid);
}

let message = `🚫 *BLOCKED CONTACTS* (${finalList.length})\n\n`;

finalList.forEach((jid, index) => {
message += `${index + 1}. @${jid.split("@")[0]}\n`;
});

await sock.sendMessage(
from,
{
text: message,
mentions: finalList,
},
{ quoted: mek }
);

} catch (error) {
await react("🙅‍♂️");
return reply(`🙅‍♂️ Failed to fetch blocklist: ${error.message}`);
}
}
);
