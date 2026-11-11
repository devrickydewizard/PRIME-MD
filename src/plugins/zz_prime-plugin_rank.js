// PRIME plugin: Rank.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
pcmd({
  pattern: "termux",
  description: "Download Termux APK",
  category: "Moded-APK",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  try {
    await client.sendMessage(from, {
      document: { url: "https://f-droid.org/repo/com.termux_1022.apk" },
      mimetype: "application/vnd.android.package-archive",
      fileName: "termux.apk"
    }, { quoted: mek });
  } catch (err) {
    console.error("error:", err);
    await reply("❌ Failed. Error: " + err.message);
  }
});

pcmd({
  pattern: "termuxhub",
  description: "Download Termux Hub APK",
  category: "Moded-APK",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  try {
    await client.sendMessage(from, {
      document: { url: "https://f-droid.org/repo/com.maazm7d.termuxhub_2.apk" },
      mimetype: "application/vnd.android.package-archive",
      fileName: "termux-hub.apk"
    }, { quoted: mek });
  } catch (err) {
    console.error("error:", err);
    await reply("❌ Failed. Error: " + err.message);
  }
});

pcmd({
  pattern: "youcine",
  description: "Streaming app for watching movies and football live",
  category: "Moded-APK",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  try {
    await client.sendMessage(from, {
      document: { url: "https://one.deltaexecutor-apk.com/APK2/youcine.apk" },
      mimetype: "application/vnd.android.package-archive",
      fileName: "Youcine.apk"
    }, { quoted: mek });
  } catch (err) {
    console.error("Youcine error:", err);
    await reply("❌ Failed to send Youcine APK. Error: " + err.message);
  }
});

pcmd({
  pattern: "cricmad",
  description: "Streaming app for watching movies and football live",
  category: "Moded-APK",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  try {
    await client.sendMessage(from, {
      document: { url: "https://cricmad.app/Cricmad-v15.0.0.apk" },
      mimetype: "application/vnd.android.package-archive",
      fileName: "cricmad.apk"
    }, { quoted: mek });
  } catch (err) {
    console.error("Youcine error:", err);
    await reply("❌ Failed to send Youcine APK. Error: " + err.message);
  }
});

pcmd({
  pattern: "criczfy",
  description: "Streaming app for watching movies and football live",
  category: "Moded-APK",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  try {
    await client.sendMessage(from, {
      document: { url: "https://pub-2240a96087b24524b453ceabf2854721.r2.dev/CricZ%20TV%20v7.3.apk" },
      mimetype: "application/vnd.android.package-archive",
      fileName: "criczfy.apk"
    }, { quoted: mek });
  } catch (err) {
    console.error("Youcine error:", err);
    await reply("❌ Failed to send Youcine APK. Error: " + err.message);
  }
});

pcmd({
  pattern: "playfy",
  description: "Download Playfy Mod APK",
  category: "Moded-APK",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  try {
    await client.sendMessage(from, {
      document: { url: "https://dl.playfytv.xyz/PLAYFy_TV_1.5.apk" },
      mimetype: "application/vnd.android.package-archive",
      fileName: "Playfy.apk"
    }, { quoted: mek });
  } catch (err) {
    console.error("Playfy error:", err);
    await reply("❌ Failed to send Playfy APK. Error: " + err.message);
  }
});

pcmd({
  pattern: "sportzfy",
  description: "Download Sportzfy Mod APK",
  category: "Moded-APK",
  filename: __filename
}, async (from, client, conText) => {
  const { mek } = conText;

  try {
    await client.sendMessage(from, {
      document: { url: "https://cdn.securefiles.vip/apkstore/Sportzfy_V16.0.apk" },
      mimetype: "application/vnd.android.package-archive",
      fileName: "Sportzfy.apk"
    }, { quoted: mek });
  } catch (err) {
    // Silent fail
  }
});

pcmd({
  pattern: "cricfy",
  aliases: ["cricfytv", "cricfypro"],
  description: "Download Cricfy APK for live cricket streaming",
  category: "Moded-APK",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply } = conText;

  try {
    await client.sendMessage(from, {
      document: { url: "https://cricfypro.com.in/file/Cricfy-v6.8-latest.apk" },
      mimetype: "application/vnd.android.package-archive",
      fileName: "Cricfy-v6.8.apk"
    }, { quoted: mek });
  } catch (err) {
    console.error("Cricfy error:", err);
    await reply("❌ Failed to send Cricfy APK. Error: " + err.message);
  }
});

