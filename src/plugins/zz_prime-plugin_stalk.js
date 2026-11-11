// PRIME plugin: Stalk.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const axios = require('axios');

pcmd({
  pattern: "domainstalk",
  aliases: ["stalkdomain","domain"],
  category: "Stalker",   
  description: "Fetch domain WHOIS/registrar info",
  filename: __filename
}, async (from, client, { q, reply, api }) => {
  if (!q) return reply("Usage: .domainstalk <domain>\nExample: .domainstalk whatsapp.com");

  try {
    const { data } = await axios.get(`${api}/stalker/domain?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000
    });

    if (!data?.status || !data.result) return reply("No domain info found.");

    const r = data.result;
    let out = `Domain Info: ${r.domain}\n\n`;
    out += `Handle: ${r.handle}\n`;
    out += `Registrar: ${r.registrar?.name} (ID: ${r.registrar?.handle})\n`;
    out += `Website: ${r.registrar?.website}\n`;
    out += `Registrant: ${r.registrant?.organization} (${r.registrant?.email})\n`;
    out += `Phone: ${r.registrant?.phone}\n`;
    out += `Address: ${r.registrant?.address}\n\n`;
    out += `Nameservers:\n${r.nameservers?.join(", ")}\n\n`;
    out += `Status:\n${r.status?.join(", ")}\n\n`;
    out += `Registered: ${r.events?.registration}\n`;
    out += `Expires: ${r.events?.expiration}\n`;
    out += `Last Changed: ${r.events?.lastChanged}\n`;
    out += `Last Update: ${r.events?.lastUpdate}`;

    await reply(out);   
  } catch (err) {
    console.error("domainstalk error:", err);
    await reply(`Error: ${err.message}`);
  }
});

pcmd({
  pattern: "repostalk",
  aliases: ["githubrepo", "repodata", "repostalk"],
  description: "Get GitHub repository information",
  category: "Stalker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner only!");

  if (!q) {
    return reply(`📌 *GitHub Repository Stalk*
    
Get information about a GitHub repository.

*Usage:*
.repstalk owner/repo
.repstalk owner/repository

*Aliases:* .githubrepo, .repodata, .repostalk`);
  }

  try {
    await reply(`🔍 Fetching repository: ${q}...`);

    const res = await axios.get(`https://api.github.com/repos/${q}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const repo = res.data;

    const caption = `📦 *GitHub Repository*\n\n` +
      `📛 *Name:* ${repo.full_name}\n` +
      `📝 *Description:* ${repo.description || 'No description'}\n` +
      `🔗 *URL:* ${repo.html_url}\n` +
      `⭐ *Stars:* ${repo.stargazers_count.toLocaleString()}\n` +
      `🍴 *Forks:* ${repo.forks_count.toLocaleString()}\n` +
      `👁️ *Watchers:* ${repo.watchers_count.toLocaleString()}\n` +
      `🐛 *Issues:* ${repo.open_issues_count}\n` +
      `📅 *Created:* ${new Date(repo.created_at).toDateString()}\n` +
      `🔄 *Updated:* ${new Date(repo.updated_at).toDateString()}\n` +
      `📂 *Language:* ${repo.language || 'N/A'}\n` +
      `📄 *License:* ${repo.license?.name || 'None'}`;

    await client.sendMessage(from, { text: caption }, { quoted: mek });

  } catch (err) {
    console.error("repstalk error:", err);
    if (err.response?.status === 404) {
      await reply(`❌ Repository "${q}" not found.`);
    } else {
      await reply(`❌ Error: ${err.message}`);
    }
  }
});

pcmd({
  pattern: "githubstalk",
  aliases: ["github", "githubuser", "git"],
  description: "Get GitHub user information",
  category: "Stalker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner only!");

  if (!q) {
    return reply(`📌 *GitHub User Stalk*
    
Get information about a GitHub user.

*Usage:*
.githubstalk username
.ghstalk username

*Aliases:* .ghstalk, .githubuser, .ghuser`);
  }

  try {
    await reply(`🔍 Fetching user: ${q}...`);

    const res = await axios.get(`https://api.github.com/users/${q}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const user = res.data;

    const caption = `👤 *GitHub User: ${user.login}*\n\n` +
      `📛 *Name:* ${user.name || 'N/A'}\n` +
      `📝 *Bio:* ${user.bio || 'No bio'}\n` +
      `📍 *Location:* ${user.location || 'N/A'}\n` +
      `🔗 *Blog:* ${user.blog || 'N/A'}\n` +
      `🏢 *Company:* ${user.company || 'N/A'}\n` +
      `✅ *Hireable:* ${user.hireable ? 'Yes' : 'No'}\n` +
      `📅 *Joined:* ${new Date(user.created_at).toDateString()}\n\n` +
      `📊 *Stats*\n` +
      `📁 *Public Repos:* ${user.public_repos}\n` +
      `⭐ *Stars:* ${user.public_gists || 0}\n` +
      `👥 *Followers:* ${user.followers.toLocaleString()}\n` +
      `👣 *Following:* ${user.following.toLocaleString()}\n\n` +
      `🔗 *Profile:* ${user.html_url}`;

    if (user.avatar_url) {
      await client.sendMessage(from, {
        image: { url: user.avatar_url },
        caption
      }, { quoted: mek });
    } else {
      await client.sendMessage(from, { text: caption }, { quoted: mek });
    }

  } catch (err) {
    console.error("githubstalk error:", err);
    if (err.response?.status === 404) {
      await reply(`❌ User "${q}" not found.`);
    } else {
      await reply(`❌ Error: ${err.message}`);
    }
  }
});

/* removed: replaced by plugins/stalk-social.js */

/* removed: replaced by plugins/stalk-social.js */

pcmd({
  pattern: "pintereststalk",
  aliases: ["pinstalk", "pinuser"],
  description: "Stalk Pinterest user profile by username",
  category: "stalker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("❌ Provide a Pinterest username.\n\nExample: pinterest username");

  try {
    const res = await axios.get(`${api}/stalker/pinterest?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !data.result?.data) {
      return reply("❌ Failed to fetch Pinterest profile. Make sure the username is correct.");
    }

    const user = data.result.data;
    const caption = `📌 *Pinterest Profile: ${user.username}*\n\n` +
      `👤 Name: ${user.full_name || "—"}\n` +
      `📝 Bio: ${user.bio || "—"}\n` +
      `🔗 Profile: ${user.profile_url}\n` +
      `🌐 Website: ${user.website || "—"}\n` +
      `📅 Created: ${user.created_at}\n\n` +
      `📊 *Stats*\n` +
      `📌 Pins: ${user.stats.pins}\n` +
      `📁 Boards: ${user.stats.boards}\n` +
      `❤️ Likes: ${user.stats.likes}\n` +
      `💾 Saves: ${user.stats.saves}\n` +
      `👥 Followers: ${user.stats.followers}\n` +
      `➡️ Following: ${user.stats.following}`;

    await client.sendMessage(from, {
      image: { url: user.image.original },
      caption
    }, { quoted: mek });
  } catch (err) {
    console.error("pinterest error:", err);
    reply("❌ Error fetching Pinterest data: " + err.message);
  }
});

pcmd({
  pattern: "npmstalk",
  aliases: ["npm", "pkg"],
  description: "Stalk an NPM package using its name",
  category: "stalker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("❌ Provide an NPM package name.\n\nExample: npmstalk baileys");

  try {
    const res = await axios.get(`${api}/stalker/npm?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !data.result?.metadata) {
      return reply("❌ Failed to fetch NPM package data. Make sure the package name is correct.");
    }

    const { metadata, versions, dependencies, maintainers, repository } = data.result;
    const npmLink = `https://www.npmjs.com/package/${q}`;
    const caption = `📦 *NPM Package: ${metadata.name}*\n\n` +
      `📝 Description: ${metadata.description || "—"}\n` +
      `🔗 NPM Link: ${npmLink}\n` +
      `📄 License: ${metadata.license || "—"}\n` +
      `🏷️ Keywords: ${metadata.keywords.join(", ")}\n` +
      `📅 Last Updated: ${new Date(metadata.lastUpdated).toDateString()}\n\n` +
      `📊 *Versions*\n` +
      `📍 Latest: ${versions.latest}\n` +
      `📍 First: ${versions.first}\n` +
      `🔢 Total: ${versions.count}\n` +
      `📅 Published: ${new Date(versions.latestPublishTime).toDateString()}\n` +
      `📅 Created: ${new Date(versions.initialPublishTime).toDateString()}\n\n` +
      `📦 *Dependencies*\n` +
      `🔢 Latest: ${dependencies.latestCount}\n` +
      `🔢 Initial: ${dependencies.initialCount}\n\n` +
      `👥 *Maintainers*: ${maintainers.join(", ")}\n` +
      `📁 Repo: ${repository}`;

    await client.sendMessage(from, {
      text: caption
    }, { quoted: mek });
  } catch (err) {
    console.error("npmstalk error:", err);
    reply("❌ Error fetching NPM package data: " + err.message);
  }
});

pcmd({
  pattern: "countrystalk",
  aliases: ["country", "nation"],
  description: "Stalk country info using region name",
  category: "stalker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("❌ Provide a country or region name.\n\nExample: countrystalk Kenya");

  try {
    const res = await axios.get(`${api}/stalker/country?region=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !data.result?.basicInfo) {
      return reply("❌ Failed to fetch country data. Make sure the region name is correct.");
    }

    const { basicInfo, geography, culture, government, isoCodes } = data.result;
    const caption = `🌍 *Country: ${basicInfo.name}*\n\n` +
      `🏛️ Capital: ${basicInfo.capital}\n` +
      `📞 Phone Code: ${basicInfo.phoneCode}\n` +
      `🗺️ Google Maps: ${basicInfo.googleMaps}\n` +
      `🌐 Internet TLD: ${basicInfo.internetTLD}\n\n` +
      `📌 *Geography*\n` +
      `🌍 Continent: ${geography.continent.name}\n` +
      `📍 Coordinates: ${geography.coordinates.latitude}, ${geography.coordinates.longitude}\n` +
      `📐 Area: ${geography.area.sqKm} km² (${geography.area.sqMiles} mi²)\n` +
      `🚫 Landlocked: ${geography.landlocked ? "Yes" : "No"}\n\n` +
      `🗣️ *Culture*\n` +
      `🗨️ Languages: ${culture.languages.native.join(", ")}\n` +
      `🎯 Famous For: ${culture.famousFor}\n` +
      `🚗 Driving Side: ${culture.drivingSide}\n` +
      `🍷 Alcohol Policy: ${culture.alcoholPolicy}\n\n` +
      `🏛️ *Government*\n` +
      `📜 Form: ${government.constitutionalForm}\n` +
      `💰 Currency: ${government.currency}\n\n` +
      `🔢 *ISO Codes*\n` +
      `• Numeric: ${isoCodes.numeric}\n` +
      `• Alpha-2: ${isoCodes.alpha2}\n` +
      `• Alpha-3: ${isoCodes.alpha3}`;

    await client.sendMessage(from, {
      image: { url: basicInfo.flag },
      caption
    }, { quoted: mek });
  } catch (err) {
    console.error("countrystalk error:", err);
    reply("❌ Error fetching country data: " + err.message);
  }
});

pcmd({
  pattern: "wachannel",
  aliases: ["wastalk", "whatsappchannel"],
  description: "Stalk a WhatsApp channel using its link",
  category: "stalker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q || !q.includes("whatsapp.com/channel/")) {
    return reply("❌ Provide a valid WhatsApp channel link.\n\nExample: wachannel https://whatsapp.com/channel/0029Vaan9TF9Bb62l8wpoD47");
  }

  try {
    const res = await axios.get(`${api}/stalker/wachannel2?url=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !data.result?.status || !data.result?.data) {
      return reply("❌ Failed to fetch WhatsApp channel data. Make sure the link is correct.");
    }

    const { title, description, followers, imageUrl } = data.result.data;
    const caption = `📢 *WhatsApp Channel*\n\n` +
      `📛 Title: ${title}\n` +
      `📄 Description: ${description || "—"}\n` +
      `👥 Followers: ${followers}`;

    await client.sendMessage(from, {
      image: { url: imageUrl },
      caption
    }, { quoted: mek });
  } catch (err) {
    console.error("wachannel error:", err);
    reply("❌ Error fetching WhatsApp channel data: " + err.message);
  }
});

pcmd({
  pattern: "ytstalk",
  aliases: ["youtubestalk", "ytchannelstalk", "ytchannel"],
  description: "Stalk a YouTube channel using username",
  category: "Stalker",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("❌ Provide a YouTube username.\n\nExample: ytstalk username");

  try {
    const res = await axios.get(`${api}/stalker/ytchannel?user=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || (!data.result && !data.data)) {
      return reply("❌ Failed to fetch YouTube channel. Make sure the username is correct.");
    }

    const { channel, stats } = data.result;

    const caption = `📺 *YouTube Channel*\n\n` +
      `📛 *Name:* ${channel.name || channel.username || 'N/A'}\n` +
      `🆔 *ID:* ${channel.id || 'N/A'}\n` +
      `📝 *Description:* ${channel.description || 'No description'}\n` +
      `📍 *Country:* ${channel.country || 'N/A'}\n` +
      `📅 *Created:* ${channel.createdAt ? new Date(channel.createdAt).toDateString() : 'N/A'}\n\n` +
      `📊 *Stats*\n` +
      `👥 *Subscribers:* ${stats?.subscribers || 0}\n` +
      `🎬 *Videos:* ${stats?.videos || 0}\n` +
      `👁️ *Views:* ${stats?.views || 0}`;

    if (channel.avatar) {
      await client.sendMessage(from, {
        image: { url: channel.avatar },
        caption
      }, { quoted: mek });
    } else {
      await client.sendMessage(from, { text: caption }, { quoted: mek });
    }

  } catch (err) {
    console.error("ytstalk error:", err);
    reply(`❌ Error: ${err.message}`);
  }
});


/* removed: replaced by plugins/stalk-social.js */
