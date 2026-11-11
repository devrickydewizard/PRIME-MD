// PRIME plugin: General.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const { commands } = require('../lib');
const fs = require("fs");

const axios = require('axios');

const path = require('path');

const more = String.fromCharCode(8206);

const readmore = more.repeat(4001);

pcmd({
  pattern: "checkbotexpiry",
  aliases: ["expirydate", "botexpiry"],
  category: "General",
  description: "Check bot expiry date",
  filename: __filename
}, async (from, client, conText) => {
  const { reply, expiryDisplay } = conText;

  await reply(`📅 Bot expires on ${expiryDisplay}`);
});

pcmd({
  pattern: "owner",
  aliases: ["master", "creator"],
  category: "General",
  description: "Send owner contact card",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply, dev, author } = conText;

  
  const vcard =
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    `FN:${author}\n` +
    'ORG:Owner;\n' +
    `TEL;type=CELL;type=VOICE;waid=${dev}:${dev}\n` +
    'END:VCARD';

  await client.sendMessage(from, {
    contacts: {
      displayName: author,
      contacts: [{ vcard }]
    }
  }, { quoted: mek });
});

pcmd({
  pattern: "developer",
  aliases: ["developers", "dev", "devs"],
  category: "General",
  description: "Send all developer contacts in one card",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  const devContacts = [
    { name: 'Developer', number: '254757047860' },
    { name: 'Developer 2', number: '254738884657' }
  ];

  

  // Build vCards for all developers
  const vcards = devContacts.map(contact =>
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    `FN:${contact.name}\n` +
    'ORG:Developer;\n' +
    `TEL;type=CELL;type=VOICE;waid=${contact.number}:${contact.number}\n` +
    'END:VCARD'
  );

  // Send them all in one message
  await client.sendMessage(from, {
    contacts: {
      displayName: 'Developers',
      contacts: vcards.map(vcard => ({ vcard }))
    }
  }, { quoted: mek });
});

pcmd({
  pattern: "ip",
  aliases: ["ipinfo", "iplookup"],
  category: "Tools",
  description: "Get IP address information and location",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, q, reply } = conText;

  if (!q) {
    return reply("📌 Usage: `.ip <ip_address>`\nExample: `.ip 8.8.8.8`");
  }

  try {
    const response = await axios.get(`http://ip-api.com/json/${encodeURIComponent(q)}`, { timeout: 15000 });
    const data = response.data;

    if (data.status === "fail") {
      return reply(`❌ Invalid IP: ${data.message || "Unknown error"}`);
    }

    let text = `╭━━━━━━━━━━━━━━━━━━╮\n`;
    text += `┃  *IP INFO*  ┃\n`;
    text += `╰━━━━━━━━━━━━━━━━━━╯\n\n`;
    text += ` *IP:* ${data.query}\n`;
    text += ` *Location:*\n`;
    text += ` • Country: ${data.country} (${data.countryCode})\n`;
    text += ` • Region: ${data.regionName}\n`;
    text += ` • City: ${data.city}\n`;
    text += ` • ZIP: ${data.zip || "N/A"}\n`;
    text += ` • Coordinates: ${data.lat}, ${data.lon}\n\n`;
    text += ` *Network:*\n`;
    text += ` • ISP: ${data.isp}\n`;
    text += ` • Org: ${data.org}\n`;
    text += ` • AS: ${data.as}\n\n`;
    text += ` *Timezone:* ${data.timezone}`;

    // Send info text
    await client.sendMessage(from, { text }, { quoted: mek });

    // Send location pin
    await client.sendMessage(from, {
      location: {
        degreesLatitude: data.lat,
        degreesLongitude: data.lon,
        name: `${data.city}, ${data.country}`
      }
    }, { quoted: mek });

  } catch (err) {
    console.error("IP lookup error:", err);
    await reply(`❌ Failed to fetch IP info: ${err.message}`);
  }
});

pcmd({
  pattern: "readmore",
  aliases: ["rm", "collapse", "hide"],
  category: "general",
  description: "Create custom read-more text using | separators, supports \\n line breaks"
}, async (from, client, conText) => {
  const { reply, q } = conText;

  if (!q || !q.includes("|")) {
    return reply("📌 Usage: .readmore <part1> | <part2> | <part3> ...");
  }

  try {
    // Split by | and trim each part
    const parts = q.split("|").map(s => s.trim());

    // Join with readmore marker, but ensure line breaks are preserved
    const text = parts.join(`${readmore}\n`);

    await reply(text);
  } catch (err) {
    console.error("readmore command error:", err);
    reply("❌ Failed to generate read-more text.");
  }
});

pcmd({
  pattern: "screenshot",
  aliases: ["ss", "webshot"],
  description: "Take a screenshot of a given URL",
  category: "General",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, q, reply } = conText;

  if (!q) {
    return reply("📌 Provide a URL to screenshot.\nExample: .screenshot https://example.com");
  }

  try {
    // Build screenshot URL using Thum.io
    const shotUrl = `https://image.thum.io/get/fullpage/${q}`;

    // Send screenshot image with caption
    await client.sendMessage(from, {
      image: { url: shotUrl },
      caption: `Screenshot of ${q}`
    }, { quoted: mek });

  } catch (err) {
    console.error("Screenshot error:", err);
    await reply("❌ Failed to capture screenshot. Error: " + err.message);
  }
});

pcmd({
  pattern: "groupanon",
  aliases: ["ganon", "grouptext"],
  description: "Send custom text or quoted media anonymously to one or more groups",
  category: "Anonymous",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, arg, quoted, quotedMsg, reply, superUser, prefix } = conText;

  if (!superUser) return reply("You are not authorised to use this command !!!");

  if (!arg[0] && !quotedMsg) {
    return reply(
      `Usage:\n${prefix}groupanon <message> | <groupJid[,groupJid,...]>\n${prefix}groupanon <groupJid[,groupJid,...]> (with quoted media)`
    );
  }

  // Join args back into one string
  const text = arg.join(" ");
  const parts = text.split("|");

  let message = "";
  let groups = [];

  if (parts.length === 1) {
    // Either ".groupanon <groupJid>" or ".groupanon <message>"
    if (quotedMsg) {
      groups = parts[0].split(",").map(x => x.trim()).filter(x => x !== "");
    } else {
      return reply("❌ Please provide a group JID after '|'");
    }
  } else {
    message = parts[0].trim();
    groups = parts[1].split(",").map(x => x.trim()).filter(x => x !== "");
  }

  if (groups.length === 0) return reply("❌ Please provide at least one group JID");

  reply(`⏳ Sending to groups: ${groups.join(", ")}`);

  try {
    for (const group of groups) {
      const jid = group.endsWith("@g.us") ? group : group + "@g.us";

      if (quotedMsg) {
        if (quoted?.imageMessage) {
          const caption = message || quoted.imageMessage.caption || "";
          const filePath = await client.downloadAndSaveMediaMessage(quoted.imageMessage);
          await client.sendMessage(jid, { image: { url: filePath }, caption });
        } else if (quoted?.videoMessage) {
          const caption = message || quoted.videoMessage.caption || "";
          const filePath = await client.downloadAndSaveMediaMessage(quoted.videoMessage);
          await client.sendMessage(jid, { video: { url: filePath }, caption });
        } else if (quoted?.audioMessage) {
          const filePath = await client.downloadAndSaveMediaMessage(quoted.audioMessage);
          await client.sendMessage(jid, { audio: { url: filePath }, mimetype: "audio/mpeg", ptt: true });
        } else if (quoted?.stickerMessage) {
          const filePath = await client.downloadAndSaveMediaMessage(quoted.stickerMessage);
          await client.sendMessage(jid, { sticker: { url: filePath } });
        } else {
          const body = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || message;
          await client.sendMessage(jid, { text: body });
        }
      } else {
        // No quoted message, just send text
        await client.sendMessage(jid, { text: message });
      }
    }

    reply(`✅ Message sent to groups: ${groups.join(", ")}`);
  } catch (err) {
    console.error("groupanon command error:", err);
    reply("❌ Failed to send your message.");
  }
});

pcmd({
  pattern: "text",
  aliases: ["anonymous", "anon", "textmess"],
  description: "Send custom text or quoted media anonymously to one or more numbers",
  category: "Anonymous",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, arg, quoted, quotedMsg, reply, superUser, prefix } = conText;

  if (!superUser) return reply("You are not authorised to use this command !!!");

  if (!arg[0] && !quotedMsg) {
    return reply(
      `Usage:\n${prefix}text <message> | <number[,number,...]>\n${prefix}text <number[,number,...]> (with quoted media)`
    );
  }

  // Join args back into one string
  const text = arg.join(" ");
  const parts = text.split("|");

  let message = "";
  let numbers = [];

  if (parts.length === 1) {
    // Either ".anon <number>" or ".anon <message>"
    if (quotedMsg) {
      numbers = parts[0].split(",").map(x => x.trim()).filter(x => x !== "");
    } else {
      return reply("❌ Please provide a target number after '|'");
    }
  } else {
    message = parts[0].trim();
    numbers = parts[1].split(",").map(x => x.trim()).filter(x => x !== "");
  }

  if (numbers.length === 0) return reply("❌ Please provide at least one target number");

//  reply(`⏳ Sending to ${numbers.join(", ")}`);

  try {
    for (const number of numbers) {
      const jid = number.includes("@s.whatsapp.net") ? number : number + "@s.whatsapp.net";

      if (quotedMsg) {
        if (quoted?.imageMessage) {
          const caption = message || quoted.imageMessage.caption || "";
          const filePath = await client.downloadAndSaveMediaMessage(quoted.imageMessage);
          await client.sendMessage(jid, { image: { url: filePath }, caption });
        } else if (quoted?.videoMessage) {
          const caption = message || quoted.videoMessage.caption || "";
          const filePath = await client.downloadAndSaveMediaMessage(quoted.videoMessage);
          await client.sendMessage(jid, { video: { url: filePath }, caption });
        } else if (quoted?.audioMessage) {
          const filePath = await client.downloadAndSaveMediaMessage(quoted.audioMessage);
          await client.sendMessage(jid, { audio: { url: filePath }, mimetype: "audio/mpeg" });
        } else if (quoted?.stickerMessage) {
          const filePath = await client.downloadAndSaveMediaMessage(quoted.stickerMessage);
          await client.sendMessage(jid, { sticker: { url: filePath } });
        } else {
          const body = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || message;
          await client.sendMessage(jid, { text: body });
        }
      } else {
        // No quoted message, just send text
        await client.sendMessage(jid, { text: message });
      }
    }

    reply(`✅ Message sent to ${numbers.join(", ")}`);
  } catch (err) {
    console.error("anon command error:", err);
    reply("❌ Failed to send your message.");
  }
});

pcmd({
  pattern: "toviewonce",
  aliases: ["tovo", "tovv"],
  description: "Send quoted media (image/video/audio) as view-once message",
  category: "Converter",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) {
    return reply("❌ Reply to an image, video, or audio message to make it view-once.");
  }

  try {
    if (quoted?.imageMessage) {
      const caption = quoted.imageMessage.caption || "";
      const filePath = await client.downloadAndSaveMediaMessage(quoted.imageMessage);
      await client.sendMessage(
        from,
        { image: { url: filePath }, caption, viewOnce: true },
        { quoted: mek }
      );
      try { fs.unlinkSync(filePath); } catch {}
    }

    if (quoted?.videoMessage) {
      const caption = quoted.videoMessage.caption || "";
      const filePath = await client.downloadAndSaveMediaMessage(quoted.videoMessage);
      await client.sendMessage(
        from,
        { video: { url: filePath }, caption, viewOnce: true },
        { quoted: mek }
      );
      try { fs.unlinkSync(filePath); } catch {}
    }

    if (quoted?.audioMessage) {
      const filePath = await client.downloadAndSaveMediaMessage(quoted.audioMessage);
      await client.sendMessage(
        from,
        {
          audio: { url: filePath },
          mimetype: "audio/mpeg",
          ptt: true,
          viewOnce: true   // flag added here
        },
        { quoted: mek }
      );
      try { fs.unlinkSync(filePath); } catch {}
    }
  } catch (err) {
    console.error("toviewonce command error:", err);
    reply("❌ Couldn't send the media. Try again.");
  }
});

pcmd({
  pattern: "getdesc",
  aliases: ["getdescription"],
  category: "General",
  description: "Show description of a given command"
},
async (from, client, { q, reply }) => {
  const input = q?.trim().toLowerCase();
  if (!input) return reply("❌ Provide a command name.\nExample: getdesc play");

  const match = commands.find(cmd => cmd.pattern?.toLowerCase() === input);
  if (!match) return reply(`❌ No command found with name: *${input}*`);

  const desc = match.description || "No description provided.";
  reply(`📝 Description for *${input}*:\n\n${desc}`);
});

pcmd({
  pattern: "getcategory",
  aliases: ["getcat"],
  category: "General",
  description: "Show category of a given command"
},
async (from, client, { q, reply }) => {
  const input = q?.trim().toLowerCase();
  if (!input) return reply("❌ Provide a command name.\nExample: getcategory play");

  const match = commands.find(cmd => cmd.pattern?.toLowerCase() === input);
  if (!match) return reply(`❌ No command found with name: *${input}*`);

  const category = match.category || "Uncategorized";
  reply(`📂 Category for *${input}* is: *${category}*`);
});

pcmd({
  pattern: "getalias",
  category: "General",
  aliases: ["getaliases"],
  description: "Show aliases for a given command"
},
async (from, client, { q, reply }) => {
  const input = q?.trim().toLowerCase();
  if (!input) return reply("❌ Provide a command name.\nExample: getalias play");

  const match = commands.find(cmd => cmd.pattern?.toLowerCase() === input);
  if (!match) return reply(`❌ No command found with name: *${input}*`);

  const aliases = match.aliases || match.alias || [];
  const list = Array.isArray(aliases) ? aliases : [aliases];

  if (list.length === 0) return reply(`ℹ️ Command *${input}* has no aliases.`);

  const aliasText = list.map((a, i) => `▸ ${i + 1}. ${a}`).join('\n');
  reply(`🔎 Aliases for *${input}*:\n\n${aliasText}`);
});

