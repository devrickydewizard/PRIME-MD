// PRIME plugin: misc command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const { sendButtons } = require('gifted-btns');

const axios = require('axios');

// (removed)

// (removed duplicate "pair" command)

pcmd({
  pattern: "location",
  aliases: ["pinlocation", "getlocation"],
  category: "General",
  description: "Send a location pin by name",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, q, reply, api } = conText;

  if (!q) {
    return reply("📌 Usage: `.location Nairobi, Kenya`");
  }

  try {
    // Call your API to resolve coordinates
    const apiUrl = `${api}/tools/location?q=${encodeURIComponent(q)}`;
    const { data } = await axios.get(apiUrl, { timeout: 60000 });

    if (!data.status || !data.result?.results?.length) {
      return reply(`❌ Could not find location for: ${q}`);
    }

    const loc = data.result.results[0];
    const { lat, lng } = loc.geometry;
    const formatted = loc.formatted || q;

    await client.sendMessage(
      from,
      {
        location: {
          degreesLatitude: lat,
          degreesLongitude: lng,
          name: formatted
        }
      },
      { quoted: mek }
    );
  } catch (err) {
    console.error("Location error:", err);
    reply("❌ Failed to fetch location.");
  }
});

pcmd({
  pattern: "copy",
  aliases: ["copied", "cp"],
  description: "Copy quoted message text via button",
  category: "General",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quotedMsg, reply, botname } = conText;

  if (!quotedMsg) {
    return reply("📌 Reply to a message with `.copy` to generate a copy button.");
  }


  const text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
  if (!text) {
    return reply("❌ Could not extract quoted text.");
  }

  try {
    await sendButtons(client, from, {
      title: "",
      text: "*Tap the button below to copy the quoted text👇.*",
      footer: `> *${botname}*`,
      buttons: [
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Copy your Quoted Text",
            id: "copy_text",
            copy_code: text
          })
        }
      ]
    }, { quoted: mek });
  } catch (err) {
    console.error("❌ Copy command failed:", err);
    await client.sendMessage(from, {
      text: "❌ Failed to generate copy button."
    }, { quoted: mek });
  }
});

// (removed duplicate "repo2" command)

// (removed duplicate "repo" command)

