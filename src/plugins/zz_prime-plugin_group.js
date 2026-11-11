// PRIME plugin: Group.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { findParticipant } = require("../lib/groupTarget");
const { pcmd } = require('../lib/primeCompat');
const { getBinaryNodeChild, getBinaryNodeChildren, S_WHATSAPP_NET } = require("@whiskeysockets/baileys");

const axios = require('axios');

const fs = require('fs');

const { sendButtons } = require('gifted-btns');

pcmd({
  pattern: "channeljid",
  aliases: ["channelinfo", "newsletterjid", "cjid"],
  category: "channel",
  description: "Fetch WhatsApp channel metadata from URL"
},
async (from, client, conText) => {
  const { q, mek, reply, botname } = conText;

  if (!q) return reply("📌 Provide a WhatsApp channel URL.");

  try {
    // Extract invite code from URL
    const match = q.match(/channel\/([A-Za-z0-9]+)/);
    if (!match) return reply("❌ Invalid channel URL format.");
    const inviteCode = match[1];

    // Fetch metadata
    const meta = await client.newsletterMetadata("invite", inviteCode);

    if (!meta || !meta.thread_metadata) {
      return reply("❌ Failed to fetch channel metadata.");
    }

    const { name, description, subscribers_count, verification } = meta.thread_metadata;

    // Build caption with Unicode box styling
    let caption = `╭━━━━━━━━━━━━━━━╮\n`;
    caption += `│ 📢 *Channel Info*\n`;
    caption += `│ 🆔 ID: ${meta.id}\n`;
    caption += `│ 📛 Name: ${name?.text || "N/A"}\n`;
    caption += `│ 📝 Description: ${description?.text || "N/A"}\n`;
    caption += `│ 👥 Subscribers: ${subscribers_count || "0"}\n`;
    caption += `│ ✔️ Status: ${verification || "Unverified"}\n`;
    caption += `╰━━━━━━━━━━━━━━━╯`;

    // Send with copy button for channel ID
    await sendButtons(client, from, {
      title: "",
      text: caption,
      footer: `> *${botname}*`,
      buttons: [
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Copy Channel ID",
            id: "copy_channel_id",
            copy_code: meta.id
          })
        }
      ]
    }, { quoted: mek });

  } catch (err) {
    console.error("channeljid error:", err);
    reply(`❌ Error fetching channel metadata.\n${err.message}`);
  }
});

pcmd({
  pattern: "channelunmute",
  aliases: ["unmutec", "newsletterunmute"],
  category: "channel",
  description: "Unmute a WhatsApp channel"
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  // Ensure command is run inside a channel
  if (!mek.key.remoteJid.endsWith("@newsletter")) {
    return reply("❌ This command only works in WhatsApp channels!");
  }

  try {
    // Unmute the channel
    await client.newsletterUnmute(mek.key.remoteJid);

    await reply("🔔 Channel unmuted successfully");
  } catch (err) {
    console.error("Channel unmute error:", err);
  }
});

pcmd({
  pattern: "channelmute",
  aliases: ["mutec", "newslettermute"],
  category: "channel",
  description: "Mute a WhatsApp channel"
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  // Ensure command is run inside a channel
  if (!mek.key.remoteJid.endsWith("@newsletter")) {
    return reply("❌ This command only works in WhatsApp channels!");
  }

  try {
    // Mute the channel
    await client.newsletterMute(mek.key.remoteJid);

    await reply("🔇 Channel muted successfully");
  } catch (err) {
    console.error("Channel mute error:", err);
  }
});

pcmd({
  pattern: "channeldescription",
  aliases: ["setdescription", "updatedescription", "chdesc"],
  category: "channel",
  description: "Update WhatsApp channel description"
}, async (from, client, conText) => {
  const { mek, q, reply } = conText;

  // Ensure command is run inside a channel
  if (!mek.key.remoteJid.endsWith("@newsletter")) {
    return reply("❌ This command only works in WhatsApp channels!");
  }

  // Validate description input
  if (!q) {
    return reply("✏️ Please provide a new description for the channel!\nExample: channeldescription Your new description here");
  }

  const newDescription = q.trim();

  // Validate description length
  if (newDescription.length > 500) {
    return reply("❌ Description must be 500 characters or less");
  }

  try {
    // Update the description
    await client.newsletterUpdateDescription(mek.key.remoteJid, newDescription);

    await reply("✅ Channel description updated successfully");
  } catch (err) {
    console.error("Channel description error:", err);
  }
});

pcmd({
  pattern: "channelname",
  aliases: ["channame", "setchannelname", "updatenewsletter"],
  category: "channel",
  description: "Update WhatsApp channel name"
}, async (from, client, conText) => {
  const { mek, q, reply } = conText;

  // Ensure command is run inside a channel
  if (!mek.key.remoteJid.endsWith("@newsletter")) {
    return reply("❌ This command only works in WhatsApp channels!");
  }

  // Validate new name input
  if (!q) {
    return reply("✏️ Please provide a new name for the channel!\nExample: channelname New Channel Name");
  }

  const newName = q.trim();

  // Validate name length
  if (newName.length > 100) {
    return reply("❌ Channel name must be 100 characters or less");
  }

  try {
    // Update the channel name
    await client.newsletterUpdateName(mek.key.remoteJid, newName);

    await reply(`✅ Channel name successfully updated to: "${newName}"`);
  } catch (err) {
    console.error("Channel name update error:", err);
  }
});

pcmd({
  pattern: "channeljid2",
  aliases: ["newsletterjid2", "getchannelid"],
  category: "channel",
  description: "Show only the JID of the current channel"
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  try {
    const jid = mek.key.remoteJid;

    if (!jid.endsWith("@newsletter")) {
      return reply("❌ This command only works inside a WhatsApp channel.");
    }

    await reply(`${jid}`);

  } catch (err) {
    console.error("Channel JID error:", err);
  }
});

pcmd({
  pattern: "channelcreate",
  aliases: ["createchannel", "newchannel"],
  category: "channel",
  description: "Create a new WhatsApp channel"
}, async (from, client, conText) => {
  const { q, reply } = conText;

  if (!q) {
    return reply("❌ Please provide a name for the channel.\nExample: channelcreate MyAwesomeChannel");
  }

  try {
    await client.newsletterCreate(q.trim());
    await reply("✅ Channel created successfully");
  } catch (err) {
    console.error("Channel create error:", err);
  }
});

pcmd({
  pattern: "bizaddress",
  aliases: ["setaddress", "bizaddr"],
  category: "wa-business",
  description: "Set business address",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("Owner only!");

  if (!q) {
    return reply(`📌 *Set Business Address*
    
Set your business address.

*Usage:*
.bizaddress 123 Main St, City, Country

*Example:*
.bizaddress 123 Main Street, Nairobi, Kenya`);
  }

  try {
    await reply("Updating business address...");
    await client.updateBussinesProfile({ address: q.trim() });
    await reply(`✅ Business address updated to: ${q.trim()}`);
  } catch (err) {
    console.error("bizaddress error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "bizemail",
  aliases: ["setemail", "bizmail"],
  category: "wa-business",
  description: "Set business email",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("Owner only!");

  if (!q) {
    return reply(`📌 *Set Business Email*
    
Set your business email address.

*Usage:*
.bizemail business@example.com

*Example:*
.bizemail info@mycompany.com`);
  }

  // Basic email validation
  if (!q.includes('@') || !q.includes('.')) {
    return reply("Invalid email format. Please provide a valid email address.");
  }

  try {
    await reply("Updating business email...");
    await client.updateBussinesProfile({ email: q.trim() });
    await reply(`✅ Business email updated to: ${q.trim()}`);
  } catch (err) {
    console.error("bizemail error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "bizdesc",
  aliases: ["setdescription", "bizdescription", "bizbio"],
  category: "wa-business",
  description: "Set business description",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("Owner only!");

  if (!q) {
    return reply(`📌 *Set Business Description*
    
Set your business description.

*Usage:*
.bizdesc We sell amazing products...

*Example:*
.bizdesc Premium quality products delivered worldwide`);
  }

  if (q.length > 500) {
    return reply("Description too long. Maximum 500 characters.");
  }

  try {
    await reply("Updating business description...");
    await client.updateBussinesProfile({ description: q.trim() });
    await reply(`✅ Business description updated!`);
  } catch (err) {
    console.error("bizdesc error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "bizwebsite",
  aliases: ["setwebsite", "bizurl", "bizsite"],
  category: "wa-business",
  description: "Set business website",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("Owner only!");

  if (!q) {
    return reply(`📌 *Set Business Website*
    
Set your business website URL.

*Usage:*
.bizwebsite https://example.com

*Example:*
.bizwebsite https://mycompany.com`);
  }

  if (!q.startsWith('http://') && !q.startsWith('https://')) {
    return reply("Invalid URL. Please include http:// or https://");
  }

  try {
    await reply("Updating business website...");
    await client.updateBussinesProfile({ websites: [q.trim()] });
    await reply(`✅ Business website updated to: ${q.trim()}`);
  } catch (err) {
    console.error("bizwebsite error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "bizhours",
  aliases: ["biztime", "businesshours", "sethours"],
  category: "wa-business",
  description: "Set business hours",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("Owner only!");

  if (!q) {
    return reply(`📌 *Set Business Hours*
    
Set your business opening hours.

*Usage:*
.bizhours monday | 09:00 | 17:00
.bizhours sunday | closed

*Examples:*
.bizhours monday | 09:00 | 17:00
.bizhours tuesday | 09:00 | 17:00
.bizhours wednesday | 09:00 | 17:00
.bizhours sunday | closed

*Set all at once using JSON:*
.bizhours json | {"timezone":"America/New_York","days":[{"day":"monday","mode":"specific_hours","openTimeInMinutes":540,"closeTimeInMinutes":1020}]}`);
  }

  try {
    let hoursData;

    if (q.toLowerCase().startsWith('json')) {
      const jsonStr = q.replace(/^json\s*\|?\s*/, '');
      hoursData = JSON.parse(jsonStr);
    } else {
      const parts = q.split('|').map(s => s.trim());
      
      if (parts.length < 2) {
        return reply("Invalid format. Use: .bizhours day | open | close");
      }

      const dayMap = {
        'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
        'friday': 4, 'saturday': 5, 'sunday': 6
      };
      
      const day = parts[0].toLowerCase();
      
      if (dayMap[day] === undefined) {
        return reply(`Invalid day: ${day}\nAvailable: monday, tuesday, wednesday, thursday, friday, saturday, sunday`);
      }

      const open = parts[1];
      const close = parts[2];

      if (open.toLowerCase() === 'closed') {
        hoursData = {
          timezone: 'America/New_York',
          days: [{ day: day, mode: 'appointment_only' }]
        };
      } else if (!close) {
        return reply("Please provide both open and close time.\nExample: .bizhours monday | 09:00 | 17:00");
      } else {
        const [openHour, openMin] = open.split(':').map(Number);
        const [closeHour, closeMin] = close.split(':').map(Number);
        
        if (isNaN(openHour) || isNaN(openMin) || isNaN(closeHour) || isNaN(closeMin)) {
          return reply("Invalid time format. Use HH:MM (e.g., 09:00)");
        }
        
        const openMinutes = openHour * 60 + openMin;
        const closeMinutes = closeHour * 60 + closeMin;

        hoursData = {
          timezone: 'America/New_York',
          days: [{ 
            day: day, 
            mode: 'specific_hours', 
            openTimeInMinutes: openMinutes, 
            closeTimeInMinutes: closeMinutes 
          }]
        };
      }
    }

    await client.updateBussinesProfile({ hours: hoursData });
    await reply("✅ Business hours updated successfully!");

  } catch (err) {
    console.error("bizhours error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "bizview",
  aliases: ["viewbiz", "bizinfo", "bizprofile"],
  category: "wa-business",
  description: "View business profile information",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("Owner only!");

  try {
    await reply("Fetching business profile...");
    
    // Note: You may need to fetch the profile differently depending on your Baileys version
    // This is a placeholder - adjust based on available methods
    const profile = await client.getBusinessProfile(client.user.id);
    
    if (!profile) {
      return reply("No business profile found.");
    }

    let text = `📊 *Business Profile*\n\n`;
    text += `📍 *Address:* ${profile.address || 'Not set'}\n`;
    text += `📧 *Email:* ${profile.email || 'Not set'}\n`;
    text += `📝 *Description:* ${profile.description || 'Not set'}\n`;
    text += `🌐 *Website:* ${profile.websites?.[0] || 'Not set'}\n`;
    text += `⏰ *Hours:* ${profile.hours ? 'Configured' : 'Not set'}\n`;
    text += `🖼️ *Cover Photo:* ${profile.coverPhoto ? '✅ Set' : 'Not set'}`;

    await client.sendMessage(from, { text }, { quoted: mek });

  } catch (err) {
    console.error("bizview error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "bizcover",
  aliases: ["coverphoto", "updatecover", "bizcoverphoto"],
  category: "wa-business",
  description: "Update business cover photo",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser, quotedMsg } = conText;

  if (!isSuperUser) return reply("Owner only!");

  if (!quotedMsg?.imageMessage) {
    return reply("Reply to an image with .bizcover to set as business cover photo");
  }

  try {
    await reply("Updating cover photo...");

    const filePath = await client.downloadAndSaveMediaMessage(quotedMsg.imageMessage);
    const coverId = await client.updateCoverPhoto({ url: filePath });
    
    fs.unlinkSync(filePath);
    
    await reply(`✅ Cover photo updated successfully!\n🆔 Cover ID: ${coverId}`);

  } catch (err) {
    console.error("bizcover error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "removecover",
  aliases: ["deletecover", "removebizcover"],
  category: "wa-business",
  description: "Remove business cover photo",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("Owner only!");

  if (!q) {
    return reply("Provide the cover ID to remove.\n\nUsage: .removecover <cover_id>");
  }

  try {
    await reply("Removing cover photo...");
    await client.removeCoverPhoto(q.trim());
    await reply("✅ Cover photo removed successfully!");

  } catch (err) {
    console.error("removecover error:", err);
    reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communitycreate",
  aliases: ["createcommunity", "newcommunity"],
  category: "Community",
  description: "Create a new WhatsApp Community",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!q) return reply("📌 Usage: .communitycreate <name> | <description>\nExample: .communitycreate My Community | A place for everyone");

  const [subject, ...rest] = q.split("|");
  const body = rest.join("|").trim();

  if (!subject.trim()) return reply("❌ Please provide a community name.");

  try {
    const result = await client.communityCreate(subject.trim(), body);
    if (!result) return reply("❌ Failed to create community.");

    await client.sendMessage(from, {
      text: `✅ Community created!\n\n*Name:* ${subject.trim()}\n${body ? `*Description:* ${body}\n` : ''}*JID:* ${result.id || 'unknown'}`
    }, { quoted: mek });
  } catch (err) {
    console.error("communitycreate error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communityinfo",
  aliases: ["communitymetadata", "cinfo"],
  category: "Community",
  description: "Show metadata for the current community",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");

  try {
    const meta = await client.communityMetadata(from);
    if (!meta) return reply("❌ Could not fetch community metadata. Is this actually a community?");

    const info = [
      `*🏘️ Community Info*`,
      ``,
      `*Name:* ${meta.subject}`,
      `*JID:* ${meta.id}`,
      `*Owner:* ${meta.owner ? `wa.me/${meta.owner.split('@')[0]}` : 'unknown'}`,
      `*Members:* ${meta.size ?? 'unknown'}`,
      `*Description:* ${meta.desc || 'None'}`,
      `*Join approval required:* ${meta.joinApprovalMode ? 'Yes' : 'No'}`,
      `*Member add mode (all members):* ${meta.memberAddMode ? 'Yes' : 'No (admins only)'}`
    ].join("\n");

    await client.sendMessage(from, { text: info }, { quoted: mek });
  } catch (err) {
    console.error("communityinfo error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communitylist",
  aliases: ["mycommunities", "communities"],
  category: "Community",
  description: "List all communities the bot is participating in",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  try {
    const all = await client.communityFetchAllParticipating();
    const list = Object.values(all || {});

    if (!list.length) return reply("⚠️ Bot is not in any communities.");

    let msg = `*🏘️ My Communities (${list.length})*\n\n`;
    list.forEach((c, i) => {
      msg += `${i + 1}. *${c.subject || 'Unnamed'}*\n   🆔 ${c.id}\n   👥 ${c.size ?? '?'} members\n\n`;
    });

    await client.sendMessage(from, { text: msg.trim() }, { quoted: mek });
  } catch (err) {
    console.error("communitylist error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communitylink",
  aliases: ["linkgroup", "attachgroup"],
  category: "Community",
  description: "Link a group to the current community",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");
  if (!q) return reply("📌 Usage: .communitylink <groupJid>\nExample: .communitylink 12345-6789@g.us");

  const groupJid = q.trim().includes('@g.us') ? q.trim() : `${q.trim()}@g.us`;

  try {
    await client.communityLinkGroup(groupJid, from);
    await client.sendMessage(from, { text: `✅ Linked group ${groupJid} to this community.` }, { quoted: mek });
  } catch (err) {
    console.error("communitylink error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communityunlink",
  aliases: ["unlinkgroup", "detachgroup"],
  category: "Community",
  description: "Unlink a group from the current community",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");
  if (!q) return reply("📌 Usage: .communityunlink <groupJid>\nExample: .communityunlink 12345-6789@g.us");

  const groupJid = q.trim().includes('@g.us') ? q.trim() : `${q.trim()}@g.us`;

  try {
    await client.communityUnlinkGroup(groupJid, from);
    await client.sendMessage(from, { text: `✅ Unlinked group ${groupJid} from this community.` }, { quoted: mek });
  } catch (err) {
    console.error("communityunlink error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communitylinkedgroups",
  aliases: ["subgroups", "clinked"],
  category: "Community",
  description: "List all groups linked to this community",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community (or a linked group) chat.");

  try {
    const result = await client.communityFetchLinkedGroups(from);
    const groups = result?.linkedGroups || [];

    if (!groups.length) return reply("⚠️ No linked groups found.");

    let msg = `*🔗 Linked Groups (${groups.length})*\n\n`;
    groups.forEach((g, i) => {
      msg += `${i + 1}. *${g.subject || 'Unnamed'}*\n   🆔 ${g.id}\n   👥 ${g.size ?? '?'} members\n\n`;
    });

    await client.sendMessage(from, { text: msg.trim() }, { quoted: mek });
  } catch (err) {
    console.error("communitylinkedgroups error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communitysubject",
  aliases: ["communityname", "csubject"],
  category: "Community",
  description: "Update the community's name",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");
  if (!q) return reply("📌 Usage: .communitysubject <new name>");

  try {
    await client.communityUpdateSubject(from, q.trim());
    await client.sendMessage(from, { text: `✅ Community name updated to: *${q.trim()}*` }, { quoted: mek });
  } catch (err) {
    console.error("communitysubject error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communitydesc",
  aliases: ["communitydescription", "cdesc"],
  category: "Community",
  description: "Update the community's description",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");
  if (!q) return reply("📌 Usage: .communitydesc <new description>");

  try {
    await client.communityUpdateDescription(from, q.trim());
    await client.sendMessage(from, { text: `✅ Community description updated.` }, { quoted: mek });
  } catch (err) {
    console.error("communitydesc error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communityinvite",
  aliases: ["communitylink2", "cinvite"],
  category: "Community",
  description: "Get the community's invite link",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");

  try {
    const code = await client.communityInviteCode(from);
    if (!code) return reply("❌ Failed to fetch invite code.");

    await client.sendMessage(from, {
      text: `🔗 Community invite link:\nhttps://chat.whatsapp.com/${code}`
    }, { quoted: mek });
  } catch (err) {
    console.error("communityinvite error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communityrevoke",
  aliases: ["crevoke", "resetcommunitylink"],
  category: "Community",
  description: "Revoke and regenerate the community's invite link",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");

  try {
    const code = await client.communityRevokeInvite(from);
    if (!code) return reply("❌ Failed to revoke invite code.");

    await client.sendMessage(from, {
      text: `✅ Invite link reset.\n🔗 New link:\nhttps://chat.whatsapp.com/${code}`
    }, { quoted: mek });
  } catch (err) {
    console.error("communityrevoke error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communityjoin",
  aliases: ["joincommunity", "cjoin"],
  category: "Community",
  description: "Join a community via invite code or link",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!q) return reply("📌 Usage: .communityjoin <code or link>\nExample: .communityjoin https://chat.whatsapp.com/ABC123");

  const code = q.trim().split('/').pop();

  try {
    const jid = await client.communityAcceptInvite(code);
    if (!jid) return reply("❌ Failed to join community. Check the invite link/code.");

    await client.sendMessage(from, { text: `✅ Joined community: ${jid}` }, { quoted: mek });
  } catch (err) {
    console.error("communityjoin error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communityleave",
  aliases: ["leavecommunity", "cleave"],
  category: "Community",
  description: "Leave the current community",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");

  try {
    await client.communityLeave(from);
    await reply("✅ Left the community.");
  } catch (err) {
    console.error("communityleave error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communityaddmode",
  aliases: ["caddmode"],
  category: "Community",
  description: "Set who can add members: all members or admins only",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");
  if (!q) return reply("📌 Usage: .communityaddmode <all|admin>");

  const value = q.trim().toLowerCase();
  if (!['all', 'admin'].includes(value)) {
    return reply("❌ Invalid value.\nAvailable options: all, admin");
  }

  try {
    // Baileys' communityMemberAddMode expects the raw mode string sent to WhatsApp servers.
    const mode = value === 'all' ? 'all_member_add' : 'admin_add';
    await client.communityMemberAddMode(from, mode);
    await client.sendMessage(from, {
      text: `✅ Member add mode set to: *${value === 'all' ? 'All members' : 'Admins only'}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("communityaddmode error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "communityapproval",
  aliases: ["cjoinapproval"],
  category: "Community",
  description: "Toggle whether new members need admin approval to join",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ Run this inside the community chat.");
  if (!q) return reply("📌 Usage: .communityapproval <on|off>");

  const value = q.trim().toLowerCase();
  if (!['on', 'off'].includes(value)) {
    return reply("❌ Invalid value.\nAvailable options: on, off");
  }

  try {
    await client.communityJoinApprovalMode(from, value === 'on' ? 'on' : 'off');
    await client.sendMessage(from, {
      text: `✅ Join approval mode turned *${value.toUpperCase()}*`
    }, { quoted: mek });
  } catch (err) {
    console.error("communityapproval error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "addmetaai",
  aliases: ["addmeta", "metaaidd"],
  category: "Group",
  description: "Add Meta AI bot to the group"
}, async (from, client, conText) => {
  const { reply, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner only command!");
  if (!isGroup) return reply("❌ This command only works in groups!");

  try {
    const result = await client.groupParticipantsUpdate(
      from,
      ['867051314767696@bot'],
      'add'
    );

    console.log(result);
    reply("✅ Meta AI added to the group!");
  } catch (err) {
    console.error("addmetaai error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "removemetaai",
  aliases: ["delmetaai", "removemeta", "delmeta"],
  category: "Group",
  description: "Remove Meta AI bot from the group"
}, async (from, client, conText) => {
  const { reply, isSuperUser, isGroup, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner only command!");
  if (!isGroup) return reply("❌ This command only works in groups!");

  try {
    const result = await client.groupParticipantsUpdate(
      from,
      ['867051314767696@bot'],
      'remove'
    );

    console.log(result);
    reply("✅ Meta AI removed from the group!");
  } catch (err) {
    console.error("removemetaai error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
    pattern: "listonline",
    aliases: ["listactive", "activeusers", "online", "topactive"],
    category: "Group",
    description: "Show most active users in the group by message count"
}, async (from, client, conText) => {
    const { reply, isGroup, isAdmin, isBotAdmin, groupInfo, activeUsers, sender, isSuperUser, mek } = conText;

    if (!isGroup) {
        return reply("❌ This command only works in groups!");
    }

    if (!isSuperUser) {
        return reply("👑 Only group admins can use this command!");
    }

    try {
        
        const users = activeUsers ? activeUsers(from, 30) : [];
        
        if (!users || users.length === 0) {
            return reply(`📊 *No active users found yet!*

Members need to send messages first for tracking to build up.

💡 *Tip:* Active users are tracked based on message count.`);
        }

        const groupName = groupInfo?.subject || 'This Group';
        const totalParticipants = groupInfo?.participants?.length || 0;
        
        let message = `📊 *ACTIVE USERS — ${groupName}*\n`;
        message += `👥 *Total Members:* ${totalParticipants}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        let medalEmojis = ['🥇', '🥈', '🥉'];
        let mentions = [];

        for (let i = 0; i < users.length; i++) {
            const { jid, count } = users[i];
            const medal = i < 3 ? medalEmojis[i] : '🔹';
            
            
            const participant = groupInfo?.participants?.find(p => p.id === jid);
            let displayName;
            
            if (participant?.pn) {
                displayName = participant.pn;
            } else if (participant?.name) {
                displayName = participant.name;
            } else {
                displayName = jid.split('@')[0];
            }
            
            message += `${medal} ${i + 1}. @${displayName} — *${count} messages*\n`;
            mentions.push(jid);
        }

        message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
        message += `📈 *Total Active users:* ${users.length}`;

        await client.sendMessage(from, {
            text: message,
            mentions: mentions
        }, { quoted: mek });

    } catch (err) {
        console.error("listonline error:", err);
        await reply(`❌ Error: ${err.message}`);
    }
});

pcmd({
  pattern: "rejectall",
  aliases: ["declineall", "reject"],
  category: "group",
  description: "Reject all pending join requests"
},
async (from, client, conText) => {
  const { reply, isGroup, isBotAdmin } = conText;

  if (!isGroup) return reply("This command is meant for groups");
  if (!isBotAdmin) return reply("I need admin privileges");

  const responseList = await client.groupRequestParticipantsList(from);

  if (!responseList.length) return reply("There are no pending join requests at this time.");

  
  if (responseList.length > 100) {
  }

  if (responseList.length > 50) {
  }

  let rejected = 0;
  let failed = 0;
  let rateLimitHit = false;

  for (let i = 0; i < responseList.length; i++) {
    const participant = responseList[i];
    
    try {
      await client.groupRequestParticipantsUpdate(from, [participant.jid], "reject");
      rejected++;
      
      
      if (rejected % 10 === 0) {
      }
      
      
      const delayTime = rateLimitHit ? 3000 : 1500;
      await new Promise(resolve => setTimeout(resolve, delayTime));
      rateLimitHit = false; 
      
    } catch (error) {
      if (error.message?.includes("rate") || error.message?.includes("too many") || error.message?.includes("429")) {
        rateLimitHit = true;
        await new Promise(resolve => setTimeout(resolve, 5000)); 
        i--; 
      } else {
        failed++;
        console.error(`Failed to reject ${participant.jid}:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

});

pcmd({
  pattern: "togroupstatus2",
  aliases: ["gs2", "groupstatus2"],
  category: "group",
  description: "Send quoted text or media to any group status by JID",
  filename: __filename
}, async (from, client, conText) => {
  const { q, quoted, quotedMsg, mek, reply, isSuperUser } = conText;

  
  if (!isSuperUser) return reply("❌ Owner Only Command!");

  
  const args = q ? q.trim().split(/\s+/) : [];
  let targetGroupJid = args[0];
  let contentText = args.slice(1).join(' ');

  
  if (!targetGroupJid && from.endsWith('@g.us')) {
    targetGroupJid = from;
    contentText = q; 
  }
  
  
  if (targetGroupJid && targetGroupJid.endsWith('@g.us')) {
    
    if (!contentText && !quotedMsg) {
      return reply(
        "📌 Usage:\n" +
        "• .togroupstatus2 <groupJID> <text>\n" +
        "• Reply to an image/video with .togroupstatus2 <groupJID> <caption>\n" +
        "• Or just .togroupstatus2 <groupJID> to forward quoted media without caption"
      );
    }
  } else {
    
    targetGroupJid = null;
    contentText = q;
    
    if (!contentText && !quotedMsg) {
      return reply(
        "❌ Please provide a valid group JID or use this command in a group!\n\n" +
        "📌 Usage:\n" +
        "• .togroupstatus2 120363425281814502@g.us <text>\n" +
        "• Reply to media with .togroupstatus2 120363425281814502@g.us <caption>\n" +
        "• Or use in target group without JID"
      );
    }
    
    
    if (!from.endsWith('@g.us')) {
      return reply("❌ Please provide a group JID or use this command inside a group!");
    }
    
    targetGroupJid = from;
  }

  if (!targetGroupJid || !targetGroupJid.endsWith('@g.us')) {
    return reply("❌ Invalid group JID! Must end with @g.us");
  }

  try {
    let payload = { groupStatusMessage: {} };

    if (quotedMsg) {
      
      if (quoted?.imageMessage) {
        const caption = contentText || quoted.imageMessage.caption || "";
        const filePath = await client.downloadAndSaveMediaMessage(quoted.imageMessage);
        payload.groupStatusMessage.image = { url: filePath };
        if (caption) payload.groupStatusMessage.caption = caption;
      } else if (quoted?.videoMessage) {
        const caption = contentText || quoted.videoMessage.caption || "";
        const filePath = await client.downloadAndSaveMediaMessage(quoted.videoMessage);
        payload.groupStatusMessage.video = { url: filePath };
        if (caption) payload.groupStatusMessage.caption = caption;
      } else if (quoted?.audioMessage) {
        const filePath = await client.downloadAndSaveMediaMessage(quoted.audioMessage);
        payload.groupStatusMessage.audio = { url: filePath };
      } else if (quoted?.documentMessage) {
        const filePath = await client.downloadAndSaveMediaMessage(quoted.documentMessage);
        payload.groupStatusMessage.document = { url: filePath };
      } else if (quoted?.stickerMessage) {
        const filePath = await client.downloadAndSaveMediaMessage(quoted.stickerMessage);
        payload.groupStatusMessage.sticker = { url: filePath };
      } else if (quoted?.conversation || quoted?.extendedTextMessage?.text) {
        payload.groupStatusMessage.text =
          quoted.conversation || quoted.extendedTextMessage.text;
      }

      // If user supplied caption with quoted media
      if (contentText && !payload.groupStatusMessage.caption) {
        payload.groupStatusMessage.caption = contentText;
      }
    } else {
      // Plain text status
      if (!contentText) {
        return reply("❌ Please provide text content or quote a message!");
      }
      payload.groupStatusMessage.text = contentText;
    }

    await client.sendMessage(targetGroupJid, payload, { quoted: mek });
    await reply(`✅ Group status sent to: ${targetGroupJid}`);
  } catch (err) {
    console.error("togroupstatus2 error:", err);
    await reply(`❌ Error sending group status: ${err.message}`);
  }
});

pcmd({
  pattern: "ckick",
  aliases: ["countrykick"],
  category: "group",
  description: "Kick all members with numbers starting with given country code",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, q, isGroup, isBotAdmin, isSuperUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ This command only works in groups!");
  if (!isBotAdmin) return reply("❌ Bot must be admin to perform kicks!");

  if (!q || !/^\d+$/.test(q)) {
    return reply("📌 Usage: `.ckick <country_code>`\nExample: `.ckick 254`");
  }

  try {
    const metadata = await client.groupMetadata(from);
    const targets = [];

    for (const p of metadata.participants) {
      let jid = p.id || "";
      // Convert @lid to proper JID if needed
      if (jid.includes("@lid")) {
        jid = await client.getJidFromLid(jid);
      }
      const num = jid.split("@")[0];
      if (num.startsWith(q)) {
        targets.push(jid);
      }
    }

    if (targets.length === 0) {
      return reply(`✅ No members found with country code ${q}`);
    }

    await client.groupParticipantsUpdate(from, targets, "remove");

    await reply(`🚫 Removed total ${targets.length} members with code ${q}`);

  } catch (error) {
    console.error("CountryKick Error:", error);
    await reply(`❌ Failed to perform country kick: ${error.message}`);
  }
});

pcmd({
  pattern: "hidetag",
  aliases: ["htag", "hidden", "hidtag"],
  category: "group",
  description: "Send a message that secretly tags everyone",
  filename: __filename
}, async (from, client, conText) => {
  const {
    reply,
    isGroup,
    mek,
    isSuperUser,
    q,
    participants,
    quotedMsg
  } = conText;
  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!isGroup) {
    return reply("can only be used in groups!");
  }

  let text = q;
  if (!text && quotedMsg) {
    text =
      quotedMsg.conversation ||
      quotedMsg.extendedTextMessage?.text ||
      quotedMsg.imageMessage?.caption ||
      quotedMsg.videoMessage?.caption ||
      "";
  }

  if (!text) {
    return reply(
      " Please provide a message or reply to one.\n\n*Usage:* .hidetag Your message here",
    );
  }

  const mentionedJids = participants
    .map((p) => {
      const jid =
        typeof p === "string"
          ? p
          : p.id || p.jid || p.pn || p.phoneNumber || "";
      if (!jid) return null;
      return jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    })
    .filter(Boolean);

  try {
    await client.sendMessage(
      from,
      {
        text: text,
        contextInfo: {
          mentionedJid: mentionedJids
        },
      },
    //  { quoted: mek },
    );
  } catch (error) {
    console.error("Hidetag error:", error);
    return reply(`❌ Failed to send hidden tag: ${error.message}`);
  }
});

pcmd({
  pattern: "all",
  aliases: ["tag", "everyone", "mention"],
  category: "group",
  description: "Tag everyone in the group with custom message",
  filename: __filename
}, async (from, client, conText) => {
  const {
    reply,
    isGroup,
    mek,
    isSuperUser,
    q,
    participants
  } = conText;
  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!isGroup) {
    return reply("❌ This command can only be used in groups!");
  }

  if (!participants || participants.length === 0) {
    return reply(" No members found in this group.");
  }

  const subject = q && q.trim().length > 0 ? q : "everyone";

  const mentionedJids = participants
    .map((p) => {
      const jid =
        typeof p === "string"
          ? p
          : p.id || p.jid || p.pn || p.phoneNumber || "";
      if (!jid) return null;
      return jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    })
    .filter(Boolean);

  try {
    await client.sendMessage(
      from,
      {
        text: `@${from}`,
        contextInfo: {
          mentionedJid: mentionedJids,
          groupMentions: [
            {
              groupJid: from,
              groupSubject: subject,
            },
          ]
        },
      },
      { quoted: mek },
    );
  } catch (error) {
    console.error("Tag everyone error:", error);
    return reply(`❌ Failed to tag everyone: ${error.message}`);
  }
});

pcmd({
  pattern: "kickall2",
  aliases: ["terminate2", "endgroup2", "kill2"],
  category: "group",
  description: "Terminate a group by link: remove all participants and leave"
},
async (from, client, conText) => {
  const { reply, q, isSuperUser, isBotAdmin, isAdmin, isSuperAdmin, botname } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!q) return reply("❌ Provide a valid WhatsApp group link!");

  try {
    
    const inviteCode = q.split("https://chat.whatsapp.com/")[1];
    if (!inviteCode) return reply("❌ Invalid group link format!");

    
    const groupInfo = await client.groupGetInviteInfo(inviteCode);
    const groupId = groupInfo.id;

    
    const metadata = await client.groupMetadata(groupId);

    
    await client.groupSettingUpdate(groupId, "announcement");

    
    await client.groupUpdateSubject(groupId, `᧯fucked by ${botname} ᭛💀`);
    await client.groupUpdateDescription(groupId, `᧯fucked by ${botname} ᭛💀`);

    
    await client.removeProfilePicture(groupId);

    
    await client.groupRevokeInvite(groupId);

    
    const participants = metadata.participants;

    
    const membersToRemove = participants
      .filter(p => p.id !== from) 
      .map(p => p.id);

    if (membersToRemove.length > 0) {
      await client.groupParticipantsUpdate(groupId, membersToRemove, "remove");
    }

    

    await reply(`✅ Successfully terminated group *${metadata.subject}* by ${botname}.`);
  } catch (error) {
    console.error("[Kill2] Error:", error);
  }
});

pcmd({
  pattern: "kickall",
  aliases: ["terminate", "endgroup", "kill"],
  category: "group",
  description: "Remove all participants from a group and leave"
},
async (from, client, conText) => {
  const { reply, mek, sender, isGroup, isSuperUser, isBotAdmin, isAdmin, isSuperAdmin, botname } = conText;

  if (!isGroup) return reply("❌ This command only works in groups!");
  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isBotAdmin) return reply("❌ Bot is not an admin in this group!");
  

  try {
    const metadata = await client.groupMetadata(from);
    const groupId = metadata.id;

    
    await client.groupSettingUpdate(groupId, "announcement");

    
    await client.groupUpdateSubject(groupId, `᧯fucked by ${botname} ᭛💀`);
    await client.groupUpdateDescription(groupId, `᧯fucked by ${botname} ᭛💀`);

    
    await client.removeProfilePicture(groupId);

    
    await client.groupRevokeInvite(groupId);

    
    const participants = metadata.participants;

    
    const membersToRemove = participants
      .filter(p => p.id !== sender)
      .map(p => p.id);

    if (membersToRemove.length > 0) {
      await client.groupParticipantsUpdate(groupId, membersToRemove, "remove");
    }

    
   
    await reply(`✅ Successfully terminated this group by ${client.user?.name || "the bot"}.`);
  } catch (error) {
    console.error("[Kill] Error:", error);
    await reply(`❌ Failed to terminate group: ${error.message}`);
  }
});

pcmd({
  pattern: "rgpp",
  aliases: ["removegpp", "deletegpp", "cleargpp"],
  category: "group",
  description: "Remove group profile picture"
},
async (from, client, conText) => {
  const { reply, isSuperUser, isGroup } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ This command can only be used in a group!");

  try {
    
    const metadata = await client.groupMetadata(from);
    const groupId = metadata.id;

    
    await client.removeProfilePicture(groupId);

    reply("🗑️ Group profile picture removed successfully!");
  } catch (err) {
    console.error("rgpp error:", err);
    reply(`❌ Failed to remove group profile picture.\nError: ${err.message}`);
  }
});

pcmd({
  pattern: "togroupstatus",
  aliases: ["groupstatus", "statusgroup"],
  category: "group",
  description: "Send quoted text or media to group status",
  filename: __filename
}, async (from, client, conText) => {
  const { q, quoted, quotedMsg, mek, reply, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q && !quotedMsg) {
    return reply(
      "📌 Usage:\n" +
      "• togroupstatus <text>\n" +
      "• Reply to an image/video/audio/document/sticker with togroupstatus <caption>\n"
    );
  }

  try {
    let messageContent = {};

    if (quotedMsg) {
      let mediaType = null;
      let mediaObj = null;
      if (quoted?.imageMessage) { mediaType = "image"; mediaObj = quoted.imageMessage; }
      else if (quoted?.videoMessage) { mediaType = "video"; mediaObj = quoted.videoMessage; }
      else if (quoted?.audioMessage) { mediaType = "audio"; mediaObj = quoted.audioMessage; }
      else if (quoted?.documentMessage) { mediaType = "document"; mediaObj = quoted.documentMessage; }
      else if (quoted?.stickerMessage) { mediaType = "sticker"; mediaObj = quoted.stickerMessage; }
      else if (quoted?.conversation || quoted?.extendedTextMessage?.text) {
        messageContent = { conversation: q || quoted.conversation || quoted.extendedTextMessage.text };
      }

      if (mediaType && mediaObj) {
        const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
        const stream = await downloadContentFromMessage(mediaObj, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        messageContent = {
          [mediaType + "Message"]: {
             url: buffer,
             mimetype: mediaObj.mimetype || (mediaType === 'image' ? 'image/jpeg' : undefined),
          },
          caption: q || mediaObj.caption || ""
        };
      }
    } else {
      messageContent = { conversation: q };
    }

    const payload = {
      groupStatusMessage: {
        message: messageContent
      }
    };

    await client.sendMessage(from, payload, { quoted: mek });
    await reply("✅ Group status posted successfully!");
  } catch (err) {
    console.error("togroupstatus error:", err);
    await reply(`❌ Error sending group status: ${err.message}`);
  }
});

pcmd({
  pattern: "creategc",
  aliases: ["creategroup"],
  category: "group",
  description: "Create a new WhatsApp group with optional participants"
},
async (from, client, conText) => {
  const { reply, q, isSuperUser, sender } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!q) return reply(`✏️ Usage: .creategc GroupName\nOr: .creategc GroupName 1234567890,9876543210`);

  try {
    let groupName = q;
    let participants = [sender]; 
    
    
    const parts = q.split(/\s+/);
    if (parts.length > 1 && parts[parts.length - 1].match(/\d{10,}/)) {
      
      groupName = parts.slice(0, -1).join(' ');
      const numbers = parts[parts.length - 1].split(',');
      
      
      for (const num of numbers) {
        const cleanNum = num.replace(/[^0-9]/g, '');
        if (cleanNum.length >= 10) {
          participants.push(cleanNum + '@s.whatsapp.net');
        }
      }
    }
    
    
    const group = await client.groupCreate(groupName, participants);
    
    
    const inviteCode = await client.groupInviteCode(group.id);
    
    
    const memberCount = participants.length;
    const teks = `✅ *Group Created!*\n\n` +
                `*Name*: ${groupName}\n` +
                `*Members*: ${memberCount}\n` +
                `*Link*: https://chat.whatsapp.com/${inviteCode}\n\n` +
                `The group has been created with you as the admin.`;

    
    await reply(teks);

  } catch (err) {
    console.error("CreateGC Error:", err);
    reply(`❌ Failed to create group: ${err.message}`);
  }
});

pcmd({
  pattern: "join",
  aliases: ["joingroup"],
  category: "group",
  description: "Join a WhatsApp group using invite link"
},
async (from, client, conText) => {
  const { reply, q, quotedMsg, isSuperUser } = conText;
  if (!isSuperUser) return reply("❌ Owner Only Command!");

  if (!q && !quotedMsg) {
    return reply("❌ Please provide a WhatsApp group invite link!\n\nExample: .join https://chat.whatsapp.com/IxMbtAN4lhVEhmbb6BfAsk\nOr quote a message containing the link");
  }

  try {
    let inviteLink;
    
    
    if (quotedMsg) {
      const text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
      if (!text) {
        return reply("❌ Quoted message doesn't contain text with a link!");
      }
      inviteLink = text.trim();
    }
    
    else if (q) {
      inviteLink = q.trim();
    }

    
    let inviteCode;
    
    if (inviteLink.includes("chat.whatsapp.com/")) {
      
      inviteCode = inviteLink.split("chat.whatsapp.com/")[1].split("?")[0].split("/")[0];
    } else if (inviteLink.match(/^[A-Za-z0-9]{22}$/)) {
      
      inviteCode = inviteLink;
    } else {
      return reply("❌ Invalid WhatsApp group link format!\n\nProvide a link like: https://chat.whatsapp.com/IxMbtAN4lhVEhmbb6BfAsk\nOr just the code: IxMbtAN4lhVEhmbb6BfAsk");
    }

    
    if (inviteCode.length !== 22) {
      return reply("❌ Invalid invite code length! WhatsApp codes should be 22 characters.");
    }

    
    await reply(`⏳ Joining group...`);

    
    await client.groupAcceptInvite(inviteCode);

    
    const groupInfo = await client.groupGetInviteInfo(inviteCode);
    const groupName = groupInfo.subject || "Unknown Group";

    
    await reply(`✅ Successfully joined the group:\n\n*${groupName}*`);

  } catch (err) {
    console.error("Join Error:", err);
    
    
    if (err.message.includes("invite") || err.message.includes("expired")) {
      reply("❌ The invite link is invalid or has expired!");
    } else if (err.message.includes("already")) {
      reply("⚠️ Bot is already in that group!");
    } else if (err.message.includes("admin")) {
      reply("❌ Bot needs to be added by an admin in some cases!");
    } else {
      reply("❌ Failed to join group: " + err.message);
    }
  }
});

pcmd({
  pattern: "left",
  aliases: ["leave", "exit", "bye"],
  category: "group",
  description: "Make the bot leave the current group"
},
async (from, client, conText) => {
  const { reply, isSuperUser, isGroup } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ This command only works in groups!");

  try {
    
    await reply("👋 Goodbye everyone! Bot is leaving the group...");
    
    
    await client.groupLeave(from);
    
  } catch (err) {
    console.error("Left Error:", err);
    reply("❌ Failed to leave group: " + err.message);
  }
});

pcmd({
  pattern: "demote",
  aliases: ['removeadmin', 'd'],
  category: "group",
  description: "Demote an admin to regular member (reply or tag)"
}, async (from, client, conText) => {
  const { reply, sender, quotedUser, q, participants, superUser, isSuperAdmin, isAdmin, isSuperUser, isGroup, isBotAdmin, mek } = conText;
  
  if (!isSuperUser) {
    return reply("❌ Owner Only Command!");
  }

  if (!isGroup) {
    return reply("This command only works in groups!");
  }

  if (!isBotAdmin) {
    return reply("This bot is not an admin");
  }

  let targetUser;

  
  if (quotedUser) {
    targetUser = quotedUser;
  }
  
  else if (q && q.includes('@')) {
    const mentionedJids = mek?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    if (mentionedJids.length > 0) {
      targetUser = mentionedJids[0];
    } else {
      return reply("Please reply to a user or tag someone to demote!");
    }
  }
  else {
    return reply("Please reply to a user or tag someone to demote!");
  }

  if (!targetUser || !targetUser.includes('@')) {
    return reply("Invalid user ID");
  }

  
  const metadata = await client.groupMetadata(from);
  const userInGroup = await findParticipant(client, targetUser, metadata, from);
  
  if (!userInGroup || (userInGroup.admin !== 'admin' && userInGroup.admin !== 'superadmin')) {
    await client.sendMessage(from, {
      text: `@${targetUser.split('@')[0]} is not an admin`,
      mentions: [targetUser]
    }, { quoted: mek });
    return;
  }

  try {
    await client.groupParticipantsUpdate(from, [userInGroup.id], 'demote'); 
    await client.sendMessage(from, {
      text: `@${targetUser.split('@')[0]} is no longer an admin. 👎`,
      mentions: [targetUser]
    }, { quoted: mek });
    
  } catch (error) {
    console.error("Demotion Error:", error);
    await reply(`❌ Failed to demote: ${error.message}`);
  }
});

pcmd({
  pattern: "promote",
  aliases: ['toadmin', 'p'],
  category: "group",
  description: "Promote a user to admin (reply or tag)"
}, async (from, client, conText) => {
  const { reply, sender, quotedUser, q, participants, superUser, isSuperAdmin, isAdmin, isSuperUser, isGroup, isBotAdmin, mek } = conText;
  
  if (!isSuperUser) {
    return reply("❌ Owner Only Command!");
  }

  if (!isGroup) {
    return reply("This command only works in groups!");
  }

  if (!isBotAdmin) {
    return reply("This bot is not an admin");
  }

  let targetUser;

  
  if (quotedUser) {
    targetUser = quotedUser;
  }
  
  else if (q && q.includes('@')) {
    const mentionedJids = mek?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    if (mentionedJids.length > 0) {
      targetUser = mentionedJids[0];
    } else {
      return reply("Please reply to a user or tag someone to promote!");
    }
  }
  else {
    return reply("Please reply to a user or tag someone to promote!");
  }

  if (!targetUser || !targetUser.includes('@')) {
    return reply("Invalid user ID");
  }

  
  const metadata = await client.groupMetadata(from);
  const userInGroup = await findParticipant(client, targetUser, metadata, from);
  
  if (userInGroup && (userInGroup.admin === 'admin' || userInGroup.admin === 'superadmin')) {
    await client.sendMessage(from, {
      text: `@${targetUser.split('@')[0]} is already an admin`,
      mentions: [targetUser]
    }, { quoted: mek });
    return;
  }

  try {
    await client.groupParticipantsUpdate(from, [userInGroup.id], 'promote'); 
    await client.sendMessage(from, {
      text: `@${targetUser.split('@')[0]} is now an admin. 👑`,
      mentions: [targetUser]
    }, { quoted: mek });
    
  } catch (error) {
    console.error("Promotion Error:", error);
    await reply(`❌ Failed to promote: ${error.message}`);
  }
});

pcmd({
  pattern: "kick",
  aliases: ["remove", "out", "bye"],
  category: "group",
  description: "Remove a user from the group (reply or tag)"
},
async (from, client, conText) => {
  const { reply, sender, quotedUser, q, participants, isSuperUser, isGroup, isAdmin, isBotAdmin, isSuperAdmin, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("This command only works in groups!");

  if (!isBotAdmin) {
    const userNumber = sender.split('@')[0];
    return client.sendMessage(from, {
      text: `@${userNumber} This bot is not an admin`,
      mentions: [sender]
    }, { quoted: mek });
  }

  let targetUser;

  
  if (quotedUser) {
    targetUser = quotedUser;
  }
  
  else if (q && q.includes('@')) {
    const mentionedJids = mek?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    
    if (mentionedJids.length > 0) {
      targetUser = mentionedJids[0];
    } else {
      return reply("Please reply to a user or tag someone to kick!");
    }
  }
  else {
    return reply("Please reply to a user or tag someone to kick!");
  }

  if (!targetUser || !targetUser.includes('@')) {
    return reply("Invalid user ID");
  }

  
  const metadata = await client.groupMetadata(from);
  const userInGroup = await findParticipant(client, targetUser, metadata, from);
  
  if (!userInGroup) {
    await client.sendMessage(from, {
      text: `@${targetUser.split('@')[0]} is not in this group`,
      mentions: [targetUser]
    }, { quoted: mek });
    return;
  }

  
  if (targetUser === isSuperAdmin) {
    await client.sendMessage(from, {
      text: `@${targetUser.split('@')[0]} is a super admin and cannot be removed`,
      mentions: [targetUser]
    }, { quoted: mek });
    return;
  }

  try {
    await client.groupParticipantsUpdate(from, [userInGroup.id], 'remove');
    await client.sendMessage(from, {
      text: `@${targetUser.split('@')[0]} has been removed from the group. 👋`,
      mentions: [targetUser]
    }, { quoted: mek });
  } catch (error) {
    console.error("Kick Error:", error);
    await reply(`❌ Failed to remove: ${error.message}`);
  }
});

pcmd({
  pattern: "groupjid",
  aliases: ["gjid", "gid"],
  category: "group",
  description: "Get the current group's JID (unique ID)",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, isGroup } = conText;

  try {
    if (!isGroup) {
      return reply("❌ This command can only be used inside a group.");
    }

    const metadata = await client.groupMetadata(from);
    const groupId = metadata.id;

    
    await client.sendMessage(from, { text: groupId });
  } catch (err) {
    console.error("groupjid error:", err);
    reply("❌ Failed to fetch group JID. Try again.");
  }
});

pcmd({
  pattern: "gcdesc",
  aliases: ["setdesc", "groupdesc", "gcdescription"],
  category: "group",
  description: "Update group description"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, isGroup, isBotAdmin } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ This command only works in groups!");
  if (!isBotAdmin) return reply("❌ Bot must be admin to update group description.");
  if (!q) return reply("✏️ Provide a new description text after the command.");

  try {
    await client.groupUpdateDescription(from, q.trim());
    reply(`✅ Group description updated to:\n${q.trim()}`);
  } catch (err) {
    console.error("gcdesc Error:", err);
    reply("❌ Failed to update group description: " + err.message);
  }
});

pcmd({
  pattern: "groupname",
  aliases: ["setsubject", "groupsubject"],
  category: "group",
  description: "Update group subject/title"
},
async (from, client, conText) => {
  const { q, reply, isSuperUser, isGroup, isBotAdmin } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ This command only works in groups!");
  if (!isBotAdmin) return reply("❌ Bot must be admin to update group subject.");

  try {
    const newSubject = q ? q.trim() : "";
    await client.groupUpdateSubject(from, newSubject);
    reply(newSubject ? `✅ Group subject updated to: *${newSubject}*` : "✅ Group name has been removed.");
  } catch (err) {
    console.error("gcsubject Error:", err);
    reply("❌ Failed to update group subject: " + err.message);
  }
});

pcmd({
  pattern: "demoteall",
  aliases: ["demoteadmins", "stripadmins"],
  category: "group",
  description: "Demote all group admins"
},
async (from, client, conText) => {
  const { reply, isSuperUser, isGroup, isBotAdmin, isSuperAdmin, superUser, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("❌ This command only works in groups!");
  if (!isBotAdmin) return reply("❌ Bot must be admin to demote others.");

  try {
    
    const metadata = await client.groupMetadata(from);

    
    const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

    
    const demoteIds = admins
      .map(a => a.id)
      .filter(id =>
        id !== isSuperAdmin &&                
        !id.includes(client.user.id) &&       
        !(Array.isArray(superUser) && superUser.includes(id)) 
      );

    if (demoteIds.length === 0) {
      return reply("ℹ️ No admins found to demote.");
    }

    
    await client.groupParticipantsUpdate(from, demoteIds, 'demote');

    
    await client.sendMessage(from, {
      text: `🔻 All admins have been demoted (${demoteIds.length}).`,
      mentions: demoteIds
    }, { quoted: mek });

  } catch (err) {
    console.error("DemoteAll Error:", err);
    reply("❌ Failed to demote admins: " + err.message);
  }
});

pcmd({
  pattern: "gpp",
  aliases: ["gprofile", "groupinfo"],
  category: "group",
  description: "Show group or user profile info"
},
async (from, client, conText) => {
  const { reply, isGroup, quoted, sender } = conText;

  try {
    let profileInfo;

    if (isGroup) {
      const metadata = await client.groupMetadata(from);
      const participants = metadata.participants || [];

      let ppUrl;
      try {
        ppUrl = await client.profilePictureUrl(from, 'image');
      } catch {
        ppUrl = "https://telegra.ph/file/95680cd03e012bb08b9e6.jpg";
      }

      profileInfo = {
        image: { url: ppUrl },
        caption: `👥 *Group Information*\n\n` +
                 `🔖 *Name:* ${metadata.subject}\n` +
                 `📝 *Description:* ${metadata.desc || 'No description'}\n` +
                 `📅 *Created:* ${new Date(metadata.creation * 1000).toLocaleDateString()}\n` +
                 `👤 *Members:* ${participants.length}\n` +
                 `👑 *Admins:* ${participants.filter(p => p.admin).length}\n` +
                 `🔒 *Restricted:* ${metadata.restrict ? 'Yes' : 'No'}\n` +
                 `🆔 *ID:* ${metadata.id}`
      };
    } else {
      const target = quoted?.sender || sender;
      const contact = await client.getContact(target, 'full');
      const name = contact.notify || contact.name || target.split('@')[0];

      let ppUrl;
      try {
        ppUrl = await client.profilePictureUrl(target, 'image');
      } catch {
        ppUrl = "https://telegra.ph/file/95680cd03e012bb08b9e6.jpg";
      }

      let status;
      try {
        status = await client.fetchStatus(target);
      } catch {
        status = { status: "🔒 Private (status not available)" };
      }

      profileInfo = {
        image: { url: ppUrl },
        caption: `👤 *User Profile*\n\n` +
                 `🔖 *Name:* ${name}\n` +
                 `📝 *About:* ${status.status}\n` +
                 `📱 *Number:* ${target.split('@')[0]}\n` +
                 `🆔 *ID:* ${target}`,
        mentions: [target]
      };
    }

    await client.sendMessage(from, profileInfo);

  } catch (err) {
    console.error('gpp error:', err);
    reply("❌ Failed to fetch profile info. Try again.");
  }
});

pcmd({
  pattern: "tagall",
  aliases: ["all", "everyone", "mentionall"],
  category: "group",
  description: "Mention all group members with numbered list"
},
async (from, client, conText) => {
  const { reply, q, isGroup, isBotAdmin, isSuperUser } = conText;
  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("This command only works in groups!");

  const metadata = await client.groupMetadata(from);
  const members = metadata.participants.map(p => p.id);
  const tags = members.map((id, i) => `${i + 1} @${id.split('@')[0]}`).join('\n');

  await client.sendMessage(from, {
    text: `${q ? q + '\n\n' : ''}${tags}`,
    mentions: members
  });
});

pcmd({
  pattern: "opentime",
  aliases: ["timeopen", "delayopen", "unlockafter"],
  category: "group",
  description: "Set a timer to unmute the group after a delay (in seconds)"
},
async (from, client, conText) => {
  const { reply, q, isAdmin, isGroup, isBotAdmin, isSuperUser, mek, sender } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("Groups Only Command only");

  

  if (!isBotAdmin) {
    const userNumber = sender.split('@')[0];
    return client.sendMessage(from, {
      text: `@${userNumber} This bot is not an admin`,
      mentions: [`${userNumber}@s.whatsapp.net`]
    }, { quoted: mek });
  }

  if (!q || isNaN(q)) return reply("⏱️ Provide a valid time in seconds. Example: .opentime 10");

  const delay = Number(q);
  reply(`⏳ Group will be unmuted in ${delay} seconds...`);

  if (delay > 3) {
    setTimeout(() => {
      reply("⚠️ Group will be unmuted in 3 seconds...");
    }, (delay - 3) * 1000);
  }

  setTimeout(async () => {
    await client.groupSettingUpdate(from, 'not_announcement');
    reply(`🔓 Group has been opened successfully after ${delay} seconds.`);
  }, delay * 1000);
});

pcmd({
  pattern: "closetime",
  aliases: ["timemute", "delayclose", "lockafter"],
  category: "group",
  description: "Set a timer to mute the group after a delay (in seconds)"
},
async (from, client, conText) => {
  const { reply, q, isAdmin, isGroup, isBotAdmin, isSuperUser, mek, sender } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return reply("Groups Only Command only");

  if (!isBotAdmin) {
    const userNumber = sender.split('@')[0];
    return client.sendMessage(from, {
      text: `@${userNumber} This bot is not an admin`,
      mentions: [`${userNumber}@s.whatsapp.net`]
    }, { quoted: mek });
  }

  if (!q || isNaN(q)) return reply("⏱️ Provide a valid time in seconds. Example: .closetime 10");

  const delay = Number(q);
  reply(`⏳ Group will be muted in ${delay} seconds...`);

  if (delay > 3) {
    setTimeout(() => {
      reply("⚠️ Group will be muted in 3 seconds...");
    }, (delay - 3) * 1000);
  }

  setTimeout(async () => {
    await client.groupSettingUpdate(from, 'announcement');
    reply(`🔒 Group has been closed successfully after ${delay} seconds.`);
  }, delay * 1000);
});

pcmd({
  pattern: "disap-off",
  aliases: ["disapoff", "ephemeraloff", "disappearoff"],
  category: "group",
  description: "Turn off disappearing messages in the group"
},
async (from, client, conText) => {
  const { reply, isGroup, isBotAdmin } = conText;

  if (!isGroup) return reply("This command only works in groups!");
  if (!isBotAdmin) return reply("Bot is not an admin");

  await client.groupToggleEphemeral(from, 0);
  reply("🧼 Disappearing messages have been turned off.");
});

pcmd({
  pattern: "disap1",
  aliases: ["disap24h", "ephemeral1", "disappear1"],
  category: "group",
  description: "Enable disappearing messages for 24 hours"
},
async (from, client, conText) => {
  const { reply, isGroup, isBotAdmin } = conText;

  if (!isGroup) return reply("This command only works in groups!");
  if (!isBotAdmin) return reply("Bot is not an admin");

  await client.groupToggleEphemeral(from, 86400);
  reply("🕒 Disappearing messages set to 24 hours.");
});

pcmd({
  pattern: "disap7",
  aliases: ["disap7d", "ephemeral7", "disappear7"],
  category: "group",
  description: "Enable disappearing messages for 7 days"
},
async (from, client, conText) => {
  const { reply, isGroup, isBotAdmin } = conText;

  if (!isGroup) return reply("This command only works in groups!");
  if (!isBotAdmin) return reply("Bot is not an admin");

  await client.groupToggleEphemeral(from, 604800);
  reply("📆 Disappearing messages set to 7 days.");
});

pcmd({
  pattern: "disap90",
  aliases: ["disap3mo", "ephemeral90", "disappear90"],
  category: "group",
  description: "Enable disappearing messages for 90 days"
},
async (from, client, conText) => {
  const { reply, isGroup, isBotAdmin } = conText;

  if (!isGroup) return reply("This command only works in groups!");
  if (!isBotAdmin) return reply("Bot is not an admin");

  await client.groupToggleEphemeral(from, 7776000);
  reply("📆 Disappearing messages set to 90 days.");
});

pcmd({
  pattern: "revoke",
  aliases: ["resetlink"],
  category: "group",
  description: "Revoke and regenerate the group invite link"
},
async (from, client, conText) => {
  const { reply, isGroup, isBotAdmin } = conText;

  if (!isGroup) return reply("This command only works in groups!");
  if (!isBotAdmin) return reply("Bot is not an admin");

  await client.groupRevokeInvite(from);
  const newCode = await client.groupInviteCode(from);

  reply(`🔄 Group link has been reset:\nhttps://chat.whatsapp.com/${newCode}`);
});

pcmd({
  pattern: "grouplink",
  aliases: ["link"],
  category: "group",
  description: "Get the group invite link"
},
async (from, client, conText) => {
  const { reply, isGroup, isBotAdmin } = conText;

  if (!isGroup) return reply("This command only works in groups!");
  if (!isBotAdmin) return reply("Bot is not an admin");

  const code = await client.groupInviteCode(from);
  reply(`🔗 Group Link:\nhttps://chat.whatsapp.com/${code}`);
});

pcmd({
  pattern: "approveall",
  aliases: ["acceptall", "approve"],
  category: "group",
  description: "Approve all pending join requests"
},
async (from, client, conText) => {
  const { reply, isGroup, isBotAdmin } = conText;

  if (!isGroup) return reply("This command is meant for groups");
  if (!isBotAdmin) return reply("I need admin privileges");

  const responseList = await client.groupRequestParticipantsList(from);

  if (!responseList.length) return reply("There are no pending join requests at this time.");

  
  if (responseList.length > 100) {
  }

  if (responseList.length > 50) {
  }

  let approved = 0;
  let failed = 0;
  let rateLimitHit = false;

  for (let i = 0; i < responseList.length; i++) {
    const participant = responseList[i];
    
    try {
      await client.groupRequestParticipantsUpdate(from, [participant.jid], "approve");
      approved++;
      
      
      if (approved % 10 === 0) {
      }
      
      
      const delayTime = rateLimitHit ? 3000 : 1500;
      await new Promise(resolve => setTimeout(resolve, delayTime));
      rateLimitHit = false; 
      
    } catch (error) {
      if (error.message?.includes("rate") || error.message?.includes("too many")) {
        rateLimitHit = true;
        await new Promise(resolve => setTimeout(resolve, 5000)); 
        i--; 
      } else {
        failed++;
        console.error(`Failed: ${participant.jid}`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

});

pcmd({
  pattern: "add",
  aliases: ["invite", "adduser"],
  category: "Group",
  description: "Invite a user to current group"
}, async (from, client, conText) => {
  const { reply, q, isSuperUser, isGroup, isBotAdmin, mek } = conText;

  if (!isSuperUser) return reply("❌ Owner only!");
  if (!isGroup) return reply("❌ This command only works in groups!");
  if (!isBotAdmin) return reply("❌ Bot needs to be an admin!");

  if (!q) {
    return reply(`📌 *Invite User to Group*
    
*Usage:*
.add 254757047860`);
  }

  try {
    const phoneMatch = q.match(/(\d{10,15})/);
    if (!phoneMatch) return reply("❌ Invalid phone number!");
    
    const userJid = phoneMatch[1] + '@s.whatsapp.net';
    const metadata = await client.groupMetadata(from);
    const groupName = metadata.subject;

    
    await client.groupParticipantsUpdate(from, [userJid], "add");

    await reply(`✅ *${phoneMatch[1]}* joined *${groupName}*!`);

  } catch (err) {
    
    
    try {
      const inviteCode = await client.groupInviteCode(from);
      const metadata = await client.groupMetadata(from);
      const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
      
      await client.sendMessage(from, {
        groupInvite: {
          jid: from,
          name: metadata.subject,
          caption: `Invite link for ${q}`,
          code: inviteCode,
          expiration: 86400
        }
      });
      
      await reply(`📱 Cannot add directly. Invite link sent to group for *${q}*`);
      
    } catch (err2) {
      await reply(`❌ Failed to invite user: ${err.message}`);
    }
  }
});

pcmd({
  pattern: "delete",
  aliases: ['del'],
  category: "group", 
  description: "Delete bot's message (deletes both quoted message and the delete command)",
}, async (from, client, conText) => {
  const { reply, mek, quotedMsg, isSuperUser, quotedKey, quotedSender } = conText;

  if (!isSuperUser) return reply("owner only!");
  if (!quotedMsg) return reply("did you quote a message?");

  try {

    const deletePromises = [];

    
    deletePromises.push(
      client.sendMessage(from, {
        delete: {
          remoteJid: from,
          fromMe: false,
          id: quotedKey,
          participant: quotedSender
        }
      })
    );

    if (mek?.key) {
      deletePromises.push(
        client.sendMessage(from, {
          delete: {
            remoteJid: from,
            fromMe: true,
            id: mek.key.id,
            participant: mek.key.participant || client.user.id
          }
        })
      );
    }

    await Promise.all(deletePromises);

  } catch (err) {
    console.error("Delete Error:", err);
  }
});

pcmd({
  pattern: "poll",
  aliases: ["vote", "question"],
  category: "group",
  description: "Create a poll in the group"
},
async (from, client, conText) => {
  const { q, reply, isGroup } = conText;

  if (!isGroup) return reply("Polls can only be created in groups.");
  if (!q || !q.includes('|')) return reply("Use format: .poll Question | Option 1 | Option 2");

  const parts = q.split('|').map(p => p.trim());
  const title = parts[0];
  const options = parts.slice(1);

  if (options.length < 2 || options.length > 12) return reply("Poll must have 2–12 options.");

  try {
    await client.sendMessage(from, {
      poll: {
        name: title,
        values: options,
        selectableCount: 1,
        toAnnouncementGroup: false
      }
    });
  } catch (err) {
    console.error("Poll Error:", err);
    reply(`❌ Failed to send poll: ${err.message}`);
  }
});

pcmd({
  pattern: "open",
  aliases: ["unmute", "groupopen", "gcopen", "adminonly", "adminsonly"],
  category: "group",
  description: "Open Group Chat"
},
async (from, client, conText) => {
  const { reply, isAdmin, isGroup, isBotAdmin, isSuperUser, mek, sender } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return client.sendMessage(from, { text: "Groups Only Command only" });

  

  if (!isBotAdmin) {
    const userNumber = sender.split('@')[0];
    return client.sendMessage(from, {
      text: `@${userNumber} This bot is not an admin`,
      mentions: [`${userNumber}@s.whatsapp.net`]
    }, { quoted: mek });
  }

  await client.groupSettingUpdate(from, 'not_announcement');

  const userNumber = sender.split('@')[0];
  return client.sendMessage(from, {
    text: `@${userNumber} Group successfully unmuted as you wished!`,
    mentions: [`${userNumber}@s.whatsapp.net`]
  }, { quoted: mek });
});

pcmd({
  pattern: "close",
  aliases: ["mute", "groupmute", "gcmute", "gcclose"],
  category: "group",
  description: "Close Group Chat"
},
async (from, client, conText) => {
  const { reply, isAdmin, isGroup, isBotAdmin, isSuperUser, mek, sender } = conText;

  if (!isSuperUser) return reply("❌ Owner Only Command!");
  if (!isGroup) return client.sendMessage(from, { text: "Groups Only Command only" });

  

  if (!isBotAdmin) {
    const userNumber = sender.split('@')[0];
    return client.sendMessage(from, {
      text: `@${userNumber} This bot is not an admin`,
      mentions: [`${userNumber}@s.whatsapp.net`]
    }, { quoted: mek });
  }

  await client.groupSettingUpdate(from, 'announcement');

  const userNumber = sender.split('@')[0];
  return client.sendMessage(from, {
    text: `@${userNumber} Group successfully muted as you wished!`,
    mentions: [`${userNumber}@s.whatsapp.net`]
  }, { quoted: mek });
});

