// PRIME plugin: Events.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const axios = require('axios');

pcmd({
  pattern: "standings",
  aliases: ["leaguetable", "league"],
  description: "View current league standings across major competitions",
  category: "sports",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply, api } = conText;

  const caption = `╭═════════════════⊷
║  📊 *League Standings* 📊
║━━━━━━━━━━━━━━━━━
║ 𝗥𝗘𝗣𝗟𝗬 𝗪𝗜𝗧𝗛 𝗟𝗘𝗔𝗚𝗨𝗘 𝗡𝗨𝗠𝗕𝗘𝗥
║ 1. Premier League
║ 2. Bundesliga
║ 3. La Liga
║ 4. Ligue 1
║ 5. Serie A
║ 6. UEFA Champions League
║ 7. FIFA International
║ 8. UEFA Euro
╰═════════════════⊷`;

  const sent = await client.sendMessage(from, { text: caption }, { quoted: mek });
  const messageId = sent.key.id;

  client.ev.on("messages.upsert", async (update) => {
    const msg = update.messages[0];
    if (!msg.message) return;

    const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
    const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
    const chatId = msg.key.remoteJid;

    if (!isReply) return;

    const leagueMap = {
      "1": { name: "Premier League", url: `${api}/epl/standings` },
      "2": { name: "Bundesliga", url: `${api}/bundesliga/standings` },
      "3": { name: "La Liga", url: `${api}/laliga/standings` },
      "4": { name: "Ligue 1", url: `${api}/ligue1/standings` },
      "5": { name: "Serie A", url: `${api}/seriea/standings` },
      "6": { name: "UEFA Champions League", url: `${api}/ucl/standings` },
      "7": { name: "FIFA International", url: `${api}/fifa/standings` },
      "8": { name: "UEFA Euro", url: `${api}/euros/standings` }
    };

    const selected = leagueMap[responseText.trim()];
    if (!selected) {
      return client.sendMessage(chatId, {
        text: "❌ Invalid league number. Reply with a number between 1 and 8.",
        quoted: msg
      });
    }

    try {
      await client.sendMessage(chatId, { react: { text: "📊", key: msg.key } });

      const res = await axios.get(selected.url);
      const data = res.data;

      if (!data.status || !Array.isArray(data.result?.standings)) {
        return client.sendMessage(chatId, {
          text: `❌ Failed to fetch ${selected.name} standings.`,
          quoted: msg
        });
      }

      // Prepare table data - CONVERT ALL VALUES TO STRINGS
      const tableHeaders = ['#', 'Team', 'P', 'W', 'D', 'L', 'GD', 'Pts'];
      const tableRows = data.result.standings.map(team => [
        String(team.position || ''),
        String(team.team || ''),
        String(team.played || ''),
        String(team.won || ''),
        String(team.draw || ''),
        String(team.lost || ''),
        String(team.goalDifference || ''),
        String(team.points || '')
      ]);

      // Send as rich message with table
      await client.sendAIRich(from, [
        { type: 'text', text: `📊 *${data.result.competition} Standings*\n\nCurrent league standings.` },
        { type: 'table', table: [tableHeaders, ...tableRows] },
        { type: 'tip', text: `💡 *Update:* Standings as of ${new Date().toLocaleDateString()}` },
        { type: 'suggest', suggestion: ['Show top scorers', 'View fixtures', 'Another league'] }
      ], {
        title: '📊 League Standings',
        footer: '⚡ Data provided by PRIME-MD'
      });

    } catch (err) {
      console.error("standings error:", err);
      await client.sendMessage(chatId, {
        text: `❌ Error fetching ${selected.name} standings: ${err.message}`,
        quoted: msg
      });
    }
  });
});

pcmd({
  pattern: "topscorers",
  aliases: ["scorers", "goals"],
  description: "View top goal scorers across major football leagues",
  category: "sports",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply, api } = conText;

  const caption = `╭═════════════════⊷
║  ⚽ *Top Scorers* ⚽
║━━━━━━━━━━━━━━━━━
║ 𝗥𝗘𝗣𝗟𝗬 𝗪𝗜𝗧𝗛 𝗟𝗘𝗔𝗚𝗨𝗘 𝗡𝗨𝗠𝗕𝗘𝗥
║ 1. Premier League
║ 2. Bundesliga
║ 3. La Liga
║ 4. Ligue 1
║ 5. Serie A
║ 6. UEFA Champions League
║ 7. FIFA International
║ 8. UEFA Euro
╰═════════════════⊷`;

  const sent = await client.sendMessage(from, { text: caption }, { quoted: mek });
  const messageId = sent.key.id;

  client.ev.on("messages.upsert", async (update) => {
    const msg = update.messages[0];
    if (!msg.message) return;

    const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
    const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
    const chatId = msg.key.remoteJid;

    if (!isReply) return;

    const leagueMap = {
      "1": { name: "Premier League", url: `${api}/epl/scorers` },
      "2": { name: "Bundesliga", url: `${api}/bundesliga/scorers` },
      "3": { name: "La Liga", url: `${api}/laliga/scorers` },
      "4": { name: "Ligue 1", url: `${api}/ligue1/scorers` },
      "5": { name: "Serie A", url: `${api}/seriea/scorers` },
      "6": { name: "UEFA Champions League", url: `${api}/ucl/scorers` },
      "7": { name: "FIFA International", url: `${api}/fifa/scorers` },
      "8": { name: "UEFA Euro", url: `${api}/euros/scorers` }
    };

    const selected = leagueMap[responseText.trim()];
    if (!selected) {
      return client.sendMessage(chatId, {
        text: "❌ Invalid league number. Reply with a number between 1 and 8.",
        quoted: msg
      });
    }

    try {
      await client.sendMessage(chatId, { react: { text: "⚽", key: msg.key } });

      const res = await axios.get(selected.url);
      const data = res.data;

      if (!data.status || !Array.isArray(data.result?.topScorers)) {
        return client.sendMessage(chatId, {
          text: `❌ Failed to fetch ${selected.name} scorers.`,
          quoted: msg
        });
      }

      const scorers = data.result.topScorers;

      // CONVERT ALL VALUES TO STRINGS
      const tableHeaders = ['#', 'Player', 'Team', 'Goals', 'Assists', 'Penalties'];
      const tableRows = scorers.map(scorer => [
        String(scorer.rank || ''),
        String(scorer.player || ''),
        String(scorer.team || ''),
        String(scorer.goals || ''),
        String(scorer.assists || ''),
        String(scorer.penalties || '')
      ]);

      await client.sendAIRich(from, [
        { type: 'text', text: `⚽ *Top Scorers - ${data.result.competition}*\n\nTop goal scorers in the competition.` },
        { type: 'table', table: [tableHeaders, ...tableRows] },
        { type: 'tip', text: `💡 *Top Scorer:* ${scorers[0]?.player} (${scorers[0]?.goals} goals)` },
        { type: 'suggest', suggestion: ['Show standings', 'View fixtures', 'Another league'] }
      ], {
        title: '⚽ Top Scorers',
        footer: '⚡ Data provided by PRIME-MD'
      });

    } catch (err) {
      console.error("topscorers error:", err);
      await client.sendMessage(chatId, {
        text: `❌ Error fetching ${selected.name} scorers: ${err.message}`,
        quoted: msg
      });
    }
  });
});

pcmd({
  pattern: "upcomingmatches",
  aliases: ["fixtures", "upcoming", "nextgames"],
  description: "View upcoming matches across major football leagues",
  category: "sports",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply, api } = conText;

  const caption = `╭═════════════════⊷
║  📅 *Upcoming Matches* 📅
║━━━━━━━━━━━━━━━━━
║ 𝗥𝗘𝗣𝗟𝗬 𝗪𝗜𝗧𝗛 𝗟𝗘𝗔𝗚𝗨𝗘 𝗡𝗨𝗠𝗕𝗘𝗥
║ 1. Premier League
║ 2. Bundesliga
║ 3. La Liga
║ 4. Ligue 1
║ 5. Serie A
║ 6. UEFA Champions League
║ 7. FIFA International
║ 8. UEFA Euro
╰═════════════════⊷`;

  const sent = await client.sendMessage(from, { text: caption }, { quoted: mek });
  const messageId = sent.key.id;

  client.ev.on("messages.upsert", async (update) => {
    const msg = update.messages[0];
    if (!msg.message) return;

    const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
    const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
    const chatId = msg.key.remoteJid;

    if (!isReply) return;

    const leagueMap = {
      "1": { name: "Premier League", url: `${api}/epl/upcomingmatches` },
      "2": { name: "Bundesliga", url: `${api}/bundesliga/upcomingmatches` },
      "3": { name: "La Liga", url: `${api}/laliga/upcomingmatches` },
      "4": { name: "Ligue 1", url: `${api}/ligue1/upcomingmatches` },
      "5": { name: "Serie A", url: `${api}/seriea/upcomingmatches` },
      "6": { name: "UEFA Champions League", url: `${api}/ucl/upcomingmatches` },
      "7": { name: "FIFA International", url: `${api}/fifa/upcomingmatches` },
      "8": { name: "UEFA Euro", url: `${api}/euros/upcomingmatches` }
    };

    const selected = leagueMap[responseText.trim()];
    if (!selected) {
      return client.sendMessage(chatId, {
        text: "❌ Invalid league number. Reply with a number between 1 and 8.",
        quoted: msg
      });
    }

    try {
      await client.sendMessage(chatId, { react: { text: "📅", key: msg.key } });

      const res = await axios.get(selected.url);
      const data = res.data;

      if (!data.status || !Array.isArray(data.result?.upcomingMatches)) {
        return client.sendMessage(chatId, {
          text: `❌ Failed to fetch ${selected.name} fixtures.`,
          quoted: msg
        });
      }

      const matches = data.result.upcomingMatches;

      // Prepare table data - CONVERT ALL VALUES TO STRINGS
      const tableHeaders = ['#', 'Matchday', 'Date', 'Home', 'Away'];
      const tableRows = matches.map((match, index) => [
        String(index + 1),
        String(match.matchday || ''),
        String(match.date || ''),
        String(match.homeTeam || ''),
        String(match.awayTeam || '')
      ]);

      await client.sendAIRich(from, [
        { type: 'text', text: `🏆 *Upcoming ${selected.name} Matches*\n\nNext matches scheduled.` },
        { type: 'table', table: [tableHeaders, ...tableRows] },
        { type: 'tip', text: `📅 *Total:* ${matches.length} matches scheduled` },
        { type: 'suggest', suggestion: ['Show standings', 'Show top scorers', 'Another league'] }
      ], {
        title: '📅 Upcoming Matches',
        footer: '⚡ Data provided by PRIME-MD'
      });

    } catch (err) {
      console.error("upcomingmatches error:", err);
      await client.sendMessage(chatId, {
        text: `❌ Error fetching ${selected.name} schedule: ${err.message}`,
        quoted: msg
      });
    }
  });
});

pcmd({
  pattern: "livescore",
  aliases: ["live", "score", "fixtures"],
  description: "Get live, finished, or upcoming football matches",
  category: "sports",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, reply, timezone, api } = conText;

  const caption = `╭═════════════════⊷
║  ⚽ *Football Scores* ⚽
║━━━━━━━━━━━━━━━━━
║ 𝗥𝗘𝗣𝗟𝗔𝗬 𝗪𝗜𝗧𝗛 𝗡𝗨𝗠𝗕𝗘𝗥
║ 1. Live Matches 🔴
║ 2. Finished Matches ✅
║ 3. Upcoming Matches ⏰
╰═════════════════⊷`;

  const sent = await client.sendMessage(from, { text: caption }, { quoted: mek });
  const messageId = sent.key.id;

  client.ev.on("messages.upsert", async (update) => {
    const msg = update.messages[0];
    if (!msg.message) return;

    const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
    const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
    const chatId = msg.key.remoteJid;

    if (!isReply || chatId !== from) return;

    const choice = responseText.trim();
    
    const optionMap = {
      "1": { name: "Live", emoji: "🔴" },
      "2": { name: "Finished", emoji: "✅" },
      "3": { name: "Upcoming", emoji: "⏰" }
    };

    if (!optionMap[choice]) {
      return client.sendMessage(chatId, {
        text: "❌ Invalid option. Reply with 1, 2, or 3.",
        quoted: msg
      });
    }

    const selected = optionMap[choice];

    try {
      await client.sendMessage(chatId, { react: { text: selected.emoji, key: msg.key } });

      // Fetch all matches
      const res = await axios.get(`${api}/livescore`);
      const data = res.data;

      if (!data.status || !data.result || !data.result.games) {
        return client.sendMessage(chatId, {
          text: `❌ No match data available at the moment.`,
          quoted: msg
        });
      }

      const games = Object.values(data.result.games);
      
      // Get user's timezone from context or default
      const userTimeZone = timezone || "Africa/Nairobi";
      
      // Get current time in user's timezone
      const now = new Date();
      const currentUserTimeStr = now.toLocaleTimeString("en-US", {
        timeZone: userTimeZone,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit"
      });
      
      // Filter matches based on status
      let filteredGames = [];

      games.forEach(game => {
        const matchStatus = game.R?.st || ""; // Get status from R.st
        
        // Convert match time to user's timezone
        const userMatchTime = convertToUserTime(game.tm, game.dt, userTimeZone);
        
        // Categorize based on status (following HTML logic)
        let category = "";
        
        if (matchStatus === '1T' || matchStatus === '2T' || matchStatus === 'HT') {
          category = "live";
        } else if (matchStatus === 'FT' || matchStatus === 'Pen') {
          category = "finished";
        } else if (matchStatus === '' || matchStatus === 'Pst' || matchStatus === 'Canc') {
          category = "upcoming";
        }
        
        if (category && (
          (choice === "1" && category === "live") ||
          (choice === "2" && category === "finished") ||
          (choice === "3" && category === "upcoming")
        )) {
          filteredGames.push({
            ...game,
            category,
            userMatchTime: userMatchTime ? userMatchTime.time : game.tm,
            userMatchDate: userMatchTime ? userMatchTime.date : game.dt
          });
        }
      });

      if (filteredGames.length === 0) {
        return client.sendMessage(chatId, {
          text: `⚽ *${selected.name} Matches*\n\nNo ${selected.name.toLowerCase()} matches found at the moment.`,
          quoted: msg
        });
      }

      // Group by date
      const matchesByDate = {};
      
      filteredGames.forEach(game => {
        const date = game.userMatchDate || game.dt || "Today";
        
        if (!matchesByDate[date]) {
          matchesByDate[date] = [];
        }
        
        matchesByDate[date].push(game);
      });

      // Create formatted output
      let output = `⚽ *${selected.name} Matches* ${selected.emoji}\n`;
      output += `🌍 Timezone: ${userTimeZone}\n`;
      output += `🕐 Current Time: ${currentUserTimeStr}\n\n`;
      
      let totalMatches = 0;
      
      Object.entries(matchesByDate).forEach(([date, dateGames]) => {
        output += `📅 *${date}*\n`;
        output += "─".repeat(30) + "\n";
        
        dateGames.forEach(game => {
          const status = getMatchDisplay(game);
          const score = getScoreDisplay(game);
          
          output += `${status} *${game.p1} vs ${game.p2}*\n`;
          output += `   ${score}\n`;
          
          // Show converted user time
          if (game.userMatchTime) {
            output += `   🕒 ${game.userMatchTime}`;
            
            // Add match status info
            const statusText = getMatchStatusText(game.R?.st);
            if (statusText) {
              output += ` (${statusText})`;
            }
          } else if (game.tm) {
            output += `   🕒 ${game.tm}`;
          }
          
          output += "\n\n";
          totalMatches++;
        });
      });

      output += `📊 Total: ${totalMatches} match(es)`;

      await client.sendMessage(chatId, { text: output }, { quoted: msg });

    } catch (err) {
      console.error("livescore error:", err);
      await client.sendMessage(chatId, {
        text: `❌ Error fetching ${selected.name} matches: ${err.message}`,
        quoted: msg
      });
    }
  });
});

function convertToUserTime(timeStr, dateStr, userTimeZone) {
  if (!timeStr || !dateStr) return null;
  
  try {
    // Parse the API date and time (assume it's in UTC)
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Create UTC date
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
    
    // Convert to user's timezone
    const userDateStr = utcDate.toLocaleDateString("en-US", {
      timeZone: userTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    
    const userTimeStr = utcDate.toLocaleTimeString("en-US", {
      timeZone: userTimeZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit"
    });
    
    // Format date back to YYYY-MM-DD format
    const [userMonth, userDay, userYear] = userDateStr.split('/');
    const formattedDate = `${userYear}-${userMonth.padStart(2, '0')}-${userDay.padStart(2, '0')}`;
    
    return {
      date: formattedDate,
      time: userTimeStr
    };
  } catch (e) {
    console.error("Time conversion error:", e);
    return null;
  }
}

function getMatchDisplay(game) {
  const status = game.R?.st || "";
  
  if (status === 'HT') return "⏸️";
  if (status === 'FT' || status === 'Pen') return "✅";
  if (status === '1T' || status === '2T') return "🔴";
  
  return game.category === "upcoming" ? "⏰" : "⚽";
}

function getMatchStatusText(status) {
  const statusMap = {
    '': 'Not Started',
    'FT': 'Full Time',
    '1T': 'First Half',
    '2T': 'Second Half',
    'HT': 'Half Time',
    'Pst': 'Postponed',
    'Canc': 'Cancelled',
    'Pen': 'Penalties'
  };
  
  return statusMap[status] || status;
}

function getScoreDisplay(game) {
  if (game.R && game.R.r1 !== undefined && game.R.r2 !== undefined) {
    return `📊 ${game.R.r1} - ${game.R.r2}`;
  }
  return "📊 0 - 0";
}

function formatDate(ts) {
  try {
    const d = new Date(Number(ts));
    return d.toDateString(); // e.g. "Fri Dec 05 2025"
  } catch {
    return "Unknown Date";
  }
}

pcmd({
  pattern: "gamehistory",
  aliases: ["matchevents", "gameevents"],
  description: "View historical or upcoming game events between teams",
  category: "sports",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q || !q.includes("vs")) {
    return reply("❌ Provide a valid match query.\n\nExample: gamehistory Arsenal vs Chelsea");
  }

  try {
    const res = await axios.get(`${api}/sport/gameevents?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !Array.isArray(data.result) || data.result.length === 0) {
      return reply("❌ No game events found for that matchup.");
    }

    for (const match of data.result.slice(0, 3)) {
      const { teams, league, venue, dateTime, status, season, media } = match;
      const caption = `⚽ *${match.match}*\n\n` +
        `🏆 League: ${league.name} (${season})\n` +
        `📅 Date: ${dateTime.date} at ${dateTime.time}\n` +
        `📍 Venue: ${venue.name || "—"} (${venue.country || "—"})\n` +
        `🔢 Round: ${match.round}\n` +
        `📶 Status: ${status}\n\n` +
        `🔴 ${teams.home.name}: ${teams.home.score ?? "—"}\n` +
        `🔵 ${teams.away.name}: ${teams.away.score ?? "—"}\n\n` +
        (match.media.video ? `▶️ Video: ${match.media.video}` : "");

      const mediaMsg = match.media?.poster || match.media?.thumb
        ? { image: { url: match.media.poster || match.media.thumb }, caption }
        : { text: caption };

      await client.sendMessage(from, mediaMsg, { quoted: mek });
    }
  } catch (err) {
    console.error("gamehistory error:", err);
    reply("❌ Error fetching game history: " + err.message);
  }
});

pcmd({
  pattern: "venuesearch",
  aliases: ["venue", "stadium"],
  description: "Search for sports venues by name",
  category: "sports",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("❌ Provide a venue name.\n\nExample: venuesearch Emirates");

  try {
    const res = await axios.get(`${api}/sport/venuesearch?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !Array.isArray(data.result) || data.result.length === 0) {
      return reply("❌ No matching venues found. Try a different name.");
    }

    for (const venue of data.result.slice(0, 3)) {
      const caption = `🏟️ *${venue.name}*\n\n` +
        `📛 Alternate Name: ${venue.alternateName || "—"}\n` +
        `⚽ Sport: ${venue.sport || "—"}\n` +
        `📍 Location: ${venue.location || "—"}\n` +
        `🌍 Country: ${venue.country || "—"}\n` +
        `📅 Built: ${venue.yearBuilt || "—"}\n` +
        `👥 Capacity: ${venue.capacity || "—"}\n` +
        `🕒 Timezone: ${venue.timezone || "—"}\n\n` +
        `📝 *Description*\n${venue.description?.split("\r\n").slice(0, 2).join("\n") || "—"}`;

      const media = venue.media?.thumb
        ? { image: { url: venue.media.thumb }, caption }
        : { text: caption };

      await client.sendMessage(from, media, { quoted: mek });
    }
  } catch (err) {
    console.error("venuesearch error:", err);
    reply("❌ Error fetching venue data: " + err.message);
  }
});

pcmd({
  pattern: "teamsearch",
  aliases: ["team", "club"],
  description: "Search for sports teams by name",
  category: "sports",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("❌ Provide a team name.\n\nExample: teamsearch Arsenal");

  try {
    const res = await axios.get(`${api}/sport/teamsearch?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !Array.isArray(data.result) || data.result.length === 0) {
      return reply("❌ No matching teams found. Try a different name.");
    }

    const team = data.result[0];
    const caption = `🏟️ *${team.name}*\n\n` +
      `📛 Alternate Names: ${team.alternateName}\n` +
      `📅 Formed: ${team.formedYear}\n` +
      `⚽ Sport: ${team.sport}\n` +
      `🏆 League: ${team.league}\n` +
      `📍 Location: ${team.location}, ${team.country}\n` +
      `🚻 Gender: ${team.gender}\n` +
      `🏟️ Stadium: ${team.stadium} (${team.stadiumCapacity} capacity)\n\n` +
      `🌐 *Social Links*\n` +
      `🔗 Website: ${team.social.website}\n` +
      `📘 Facebook: ${team.social.facebook}\n` +
      `🐦 Twitter: ${team.social.twitter}\n` +
      `📸 Instagram: ${team.social.instagram}\n` +
      `📺 YouTube: ${team.social.youtube}\n\n` +
      `📝 *Description*\n${team.description.split("\r\n").slice(0, 3).join("\n")}`;

    await client.sendMessage(from, {
      image: { url: team.badges.large },
      caption
    }, { quoted: mek });
  } catch (err) {
    console.error("teamsearch error:", err);
    reply("❌ Error fetching team data: " + err.message);
  }
});

pcmd({
  pattern: "playersearch",
  aliases: ["player", "athlete"],
  description: "Search for sports players by name",
  category: "sports",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("❌ Provide a player name.\n\nExample: playersearch Bukayo Saka");

  try {
    const res = await axios.get(`${api}/sport/playersearch?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !Array.isArray(data.result) || data.result.length === 0) {
      return reply("❌ No matching players found. Try a different name.");
    }

    for (const player of data.result.slice(0, 3)) {
      const caption = `🏅 *${player.name}*\n\n` +
        `🏟️ Team: ${player.team}\n` +
        `⚽ Sport: ${player.sport}\n` +
        `🌍 Nationality: ${player.nationality}\n` +
        `🎂 Birthdate: ${player.birthDate}\n` +
        `📌 Position: ${player.position}\n` +
        `📶 Status: ${player.status}\n` +
        `🚻 Gender: ${player.gender}`;

      const media = player.thumbnail
        ? { image: { url: player.thumbnail }, caption }
        : { text: caption };

      await client.sendMessage(from, media, { quoted: mek });
    }
  } catch (err) {
    console.error("playersearch error:", err);
    reply("❌ Error fetching player data: " + err.message);
  }
});

