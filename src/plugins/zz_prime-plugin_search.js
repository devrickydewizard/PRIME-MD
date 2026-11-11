// PRIME plugin: Search.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const axios = require('axios');

const { generateWAMessageContent, generateWAMessageFromContent, downloadMediaMessage } = require("@whiskeysockets/baileys");

const { pcmd } = require('../lib/primeCompat');
const more = String.fromCharCode(8206);

const readmore = more.repeat(4001);

const fs = require('fs-extra');

const path = require('path');

const FormData = require('form-data');

const mime = require('mime-types');

function getMediaType(quoted) {
  if (quoted.imageMessage) return "image";
  if (quoted.videoMessage) return "video";
  if (quoted.stickerMessage) return "sticker";
  if (quoted.audioMessage) return "audio";
  if (quoted.documentMessage) return "document";
  return "unknown";
}

function getFileExtensionFromMimetype(mimetype) {
  if (!mimetype) return '';
  const ext = mime.extension(mimetype);
  return ext ? `.${ext}` : '';
}

async function saveMediaToTemp(client, quotedMedia, type, mimetype) {
  const tmpDir = path.join(__dirname, "..", "tmp");
  await fs.ensureDir(tmpDir);
  
  const extension = getFileExtensionFromMimetype(mimetype);
  const fileName = `${type}-${Date.now()}${extension}`;
  const filePath = path.join(tmpDir, fileName);
  
  const buffer = await downloadMediaMessage(
    { message: { [type + 'Message']: quotedMedia } },
    'buffer',
    {},
    { 
      reuploadRequest: client.updateMediaMessage,
      logger: console 
    }
  );
  
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function uploadToUguu(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: mimeType
  });

  const response = await axios.post('https://uguu.se/upload.php', form, {
    headers: {
      ...form.getHeaders(),
      'origin': 'https://uguu.se',
      'referer': 'https://uguu.se/',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    }
  });

  const result = response.data;
  if (result.success && result.files?.[0]?.url) {
    return result.files[0].url;
  } else {
    throw new Error("Uguu upload failed or malformed response");
  }
}

pcmd({
  pattern: "similarimage",
  aliases: ["reverse", "similarimg", "reverseimage", "findimage"],
  category: "Search",
  description: "Find similar images using reverse image search"
}, async (from, client, conText) => {
  const { reply, quotedMsg, api, mek } = conText;

  if (!quotedMsg?.imageMessage) {
    return reply("📌 Reply to an image with .similarimage");
  }

  let filePath;
  try {
    const type = getMediaType(quotedMsg);
    const mimetype = quotedMsg.imageMessage.mimetype;
    const mediaNode = quotedMsg.imageMessage;
    
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    
    await reply("🔎 Searching for similar images...");

    const imageUrl = await uploadToUguu(filePath);
    const apiUrl = `${api}/search/reverseimage?url=${encodeURIComponent(imageUrl)}`;
    const response = await axios.get(apiUrl);
    
    if (!response.data?.status || !response.data?.result?.similarImages?.length) {
      return reply("❌ No similar images found.");
    }

    const similarImages = response.data.result.similarImages.slice(0, 10);
    
    // Create album for similar images
    const album = [];
    for (let i = 0; i < similarImages.length; i++) {
      const img = similarImages[i];
      const imageUrl = img.thumbnailUrl || img.url;
      if (imageUrl) {
        album.push({ 
          image: { url: imageUrl },
          caption: i === 0 ? `🔍 *Similar Images Found*\n📸 ${similarImages.length} results` : undefined
        });
      }
    }

    if (album.length === 0) return reply("❌ Failed to load similar images.");
    
    // Send all similar images as album
    await client.sendMessage(from, { album }, { quoted: mek });

  } catch (err) {
    console.error("similarimage error:", err);
    await reply(`❌ Error: ${err.message}`);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "weather",
  aliases: ["forecast", "wthr"],
  category: "Search",
  description: "Get current weather for a city",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, q, reply } = conText;

  if (!q) {
    return reply("📌 Usage: `.weather <city>`\nExample: `.weather Migori`");
  }

  try {
    const apiKey = "1ad47ec6172f19dfaf89eb3307f74785"; // your OpenWeatherMap key
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&units=metric&appid=${apiKey}`;
    const { data } = await axios.get(url, { timeout: 15000 });

    if (data.cod !== 200) {
      return reply(`❌ Could not fetch weather for: ${q}`);
    }

    const weather = data.weather[0];
    const main = data.main;
    const wind = data.wind;

    let text = `╭━━━━━━━━━━━━━━━━━━╮\n`;
    text += `┃  *WEATHER REPORT*  ┃\n`;
    text += `╰━━━━━━━━━━━━━━━━━━╯\n\n`;
    text += ` *City:* ${data.name}, ${data.sys.country}\n`;
    text += ` *Condition:* ${weather.main} (${weather.description})\n`;
    text += ` *Temperature:* ${main.temp}°C (feels like ${main.feels_like}°C)\n`;
    text += ` *Humidity:* ${main.humidity}%\n`;
    text += ` *Pressure:* ${main.pressure} hPa\n`;
    text += ` *Wind:* ${wind.speed} m/s, ${wind.deg}°\n`;
    text += ` *Clouds:* ${data.clouds.all}%\n`;
    if (data.rain?.["1h"]) text += ` *Rain (1h):* ${data.rain["1h"]} mm\n`;
    text += ` *Coordinates:* ${data.coord.lat}, ${data.coord.lon}\n`;

    // Send info text
    await client.sendMessage(from, { text }, { quoted: mek });

    // Send location pin
    await client.sendMessage(from, {
      location: {
        degreesLatitude: data.coord.lat,
        degreesLongitude: data.coord.lon,
        name: `${data.name}, ${data.sys.country}`
      }
    }, { quoted: mek });

  } catch (err) {
    console.error("Weather error:", err);
    await reply(`❌ Failed to fetch weather: ${err.message}`);
  }
});

pcmd({
  pattern: "quranaudio",
  aliases: ["quranmp3", "surahaudio", "audioquran"],
  category: "Religion",
  description: "List Qur'an Surah audios or fetch by number",
  filename: __filename
}, async (from, client, { q, mek, reply, api }) => {
  try {
    const res = await axios.get(`${api}/quran/audio`);
    if (!res.data?.status || !res.data?.result) {
      return reply("❌ No audio data found.");
    }

    const audios = res.data.result;
    const keys = Object.keys(audios);

    // If user provides a number directly, send audio
    if (q && !isNaN(q)) {
      const idx = parseInt(q);
      const key = keys.find(k => k.startsWith(idx + " "));
      if (!key) return reply("❌ Surah number not found.");

      const surah = audios[key];
      return await client.sendMessage(
        from,
        {
          audio: { url: surah.download },
          mimetype: surah.type,
          fileName: surah.title,
          ptt: false,
          contextInfo: {
            externalAdReply: {
              title: surah.title,
              body: surah.last_edited_date_str,
              thumbnailUrl: surah.thumb,
              mediaType: 2,
              mediaUrl: surah.download,
              sourceUrl: surah.download
            }
          }
        },
        { quoted: mek }
      );
    }

    // Otherwise list all Surahs
    const caption = `📖 *Qur'an Audio List*\n\n` +
      keys.map((k, i) => {
        const surah = audios[k];
        return `${i + 1}. 🎶 ${surah.title}\n   📅 ${surah.last_edited_date_str}\n   📍 ${surah.name}`;
      }).join("\n\n") +
      `\n\n📌 Reply with a number or use .quranaudio <number> to get audio + thumbnail`;

    const sent = await client.sendMessage(from, { text: caption }, { quoted: mek });
    const messageId = sent.key.id;

    // Listen for replies
    client.ev.on("messages.upsert", async (update) => {
      const msg = update.messages[0];
      if (!msg.message) return;

      const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
      const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
      const chatId = msg.key.remoteJid;

      if (!isReply) return;

      const index = parseInt(responseText.trim()) - 1;
      const key = keys[index];
      const surah = audios[key];

      if (!surah) {
        return client.sendMessage(chatId, {
          text: "❌ Invalid number. Reply with a valid Surah number.",
          quoted: msg
        });
      }

      await client.sendMessage(chatId, { react: { text: "🎶", key: msg.key } });

      await client.sendMessage(chatId, {
        audio: { url: surah.download },
        mimetype: surah.type,
        fileName: surah.title,
        ptt: false,
        contextInfo: {
          externalAdReply: {
            title: surah.title,
            body: surah.last_edited_date_str,
            thumbnailUrl: surah.thumb,
            mediaType: 2,
            mediaUrl: surah.download,
            sourceUrl: surah.download
          }
        }
      }, { quoted: msg });
    });
  } catch (err) {
    console.error("Qur'an audio error:", err);
    reply("❌ Failed to fetch Qur'an audio: " + err.message);
  }
});

pcmd({
  pattern: "surahlist",
  aliases: ["listsurah", "quranlist", "surahs"],
  category: "Religion",
  description: "Get list of all Surahs from the Qur'an",
  filename: __filename
}, async (from, client, { mek, reply, api }) => {
  try {
    const res = await axios.get(`${api}/surahlist`);
    if (!res.data?.status || !res.data?.result?.data?.length) {
      return reply("❌ No Surah data found.");
    }

    const surahs = res.data.result.data;

    let output = `*📖 Surah List*\n\n`;
    surahs.forEach(s => {
      output += `🔢 *${s.number}. ${s.name.english}* (${s.name.arabic})\n`;
      output += `📚 Translation: ${s.name.translation}\n`;
      output += `📊 Verses: ${s.verses} | Revelation: ${s.revelation}\n`;
      output += `📝 Tafsir: ${s.tafsir.slice(0, 120)}...\n\n`;
    });

    // Collapse long output
    output += `${readmore}\nTotal Surahs: ${surahs.length}`;

    await client.sendMessage(from, { text: output.trim() }, { quoted: mek });
  } catch (err) {
    console.error("Surah list error:", err);
    reply("❌ Failed to fetch Surah list: " + err.message);
  }
});

pcmd({
  pattern: "hymnal",
  aliases: ["wendenyasaye", "nyimboza", "ukristo", "hym", "hymn"],
  category: "Religion",
  description: "Search hymns and display lyrics",
  filename: __filename
}, async (from, client, { q, mek, reply, api }) => {
  if (!q) {
    return reply("📌 Usage:\n• .hym <keyword>\nExample: .hym kidich nyasaye");
  }

  try {
    const res = await axios.get(`${api}/hymn/wendenyasaye?q=${encodeURIComponent(q)}`);

    if (!res.data?.status || !res.data?.result?.songs?.length) {
      return reply("❌ No hymns found for your query.");
    }

    const songs = res.data.result.songs;

    let output = `*🎶 Hymn Search*\n\n`;
    songs.slice(0, 1).forEach(song => {
      output += `📖 *${song.title}*\n📚 Book: ${song.book}\n\n`;
      output += `${song.lyrics}\n\n`;
    });

    await client.sendMessage(from, { text: output.trim() }, { quoted: mek });
  } catch (err) {
    console.error("hymn search error:", err);
    reply("❌ Failed to search hymn: " + err.message);
  }
});

pcmd({
  pattern: "biblesearch",
  aliases: ["searchbible", "findverse", "verse"],
  category: "Religion",
  description: "Search Bible verses by keyword",
  filename: __filename
}, async (from, client, { q, mek, reply, api }) => {
  if (!q) {
    return reply("📌 Usage:\n• .biblesearch <keyword>\nExample: .biblesearch God");
  }

  try {
    const res = await axios.get(`${api}/bible/search?q=${encodeURIComponent(q)}`);

    if (!res.data?.status || !res.data?.result?.verses?.length) {
      return reply("❌ No verses found for your query.");
    }

    const verses = res.data.result.verses;

    let output = `*📖 Bible Verses*\n\n`;
    verses.slice(0, 5).forEach(v => {
      output += `📍 *${v.reference}*\n${v.preview}\n\n`;
    });

    await client.sendMessage(from, { text: output.trim() }, { quoted: mek });
  } catch (err) {
    console.error("Bible search error:", err);
    reply("❌ Failed to search Bible: " + err.message);
  }
});

pcmd({
  pattern: "citizen",
  aliases: ["citizendigital", "citizen-tv"],
  category: "news",
  description: "Get latest Citizen Digital news"
},
async (from, client, conText) => {
  const { mek, api } = conText;

  try {
    const apiUrl = `${api}/news/citizen`;
    const res = await axios.get(apiUrl, { timeout: 100000 });
    
    if (!res.data?.status) throw new Error("API returned false status");
    
    const data = res.data.result;
    
    // Get news items from various sections
    const pinnedStories = data.pinnedStories || [];
    const topStories = data.topStories || [];
    
    // Combine all stories, giving priority to pinned ones
    const allStories = [...pinnedStories, ...topStories];
    
    if (!allStories.length) throw new Error("No news available");
    
    // Remove duplicates by URL
    const uniqueStories = Array.from(new Map(allStories.map(item => [item.url, item])).values());
    
    // Filter stories with images
    const storiesWithImages = uniqueStories.filter(story => 
      story.image || story.thumbnail || story.articleDetails?.featuredImage?.url
    );
    
    if (storiesWithImages.length === 0) throw new Error("No stories with images available");
    
    const cards = await Promise.all(storiesWithImages.slice(0, 10).map(async (story, i) => {
      try {
        // Determine which image to use (priority: image > thumbnail > featuredImage)
        let imageUrl = story.image || story.thumbnail;
        if (!imageUrl && story.articleDetails?.featuredImage?.url) {
          imageUrl = story.articleDetails.featuredImage.url;
        }
        
        if (!imageUrl) return null;

        const imageMessage = await generateWAMessageContent({ 
          image: { url: imageUrl } 
        }, {
          upload: client.waUploadToServer
        });

        // Get timestamp
        let timestamp = "";
        if (story.timestamp) {
          timestamp = ` • ⏰ ${story.timestamp}`;
        } else if (story.articleDetails?.publishedDate) {
          const date = new Date(story.articleDetails.publishedDate);
          timestamp = ` • 📅 ${date.toLocaleDateString()}`;
        }

        return {
          header: {
            title: `📰 ${story.title.substring(0, 60)}${story.title.length > 60 ? '...' : ''}`,
            hasMediaAttachment: true,
            imageMessage: imageMessage.imageMessage
          },
          body: {
            text: story.excerpt || 
                  story.articleDetails?.summary?.substring(0, 120) || 
                  story.title.substring(0, 100) || 
                  "Citizen Digital News"
          },
          footer: { 
            text: `🏷️ ${story.category || "News"}${timestamp}` 
          },
          nativeFlowMessage: {
            buttons: [
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "📖 Read Full Story",
                  url: story.url
                })
              },
              {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                  display_text: "📋 Copy Link",
                  copy_code: story.url
                })
              }
            ]
          }
        };
      } catch (imgErr) {
        console.log(`Failed to load image for ${story.title}:`, imgErr.message);
        return null;
      }
    }));

    // Filter out failed cards
    const validCards = cards.filter(card => card !== null);

    if (validCards.length === 0) {
      // Fallback to simple text message
      const newsList = uniqueStories.slice(0, 10).map((story, i) => 
        `${i+1}. ${story.title}\n⏰ ${story.timestamp || "Recent"}\n🔗 ${story.url}\n`
      ).join('\n');
      
      return await client.sendMessage(from, {
        text: `📺 *${data.siteName || "Citizen Digital"}*\n\n${newsList}\n\n🌐 Website: ${data.url}\n🕐 Updated: ${new Date(data.lastUpdated).toLocaleString()}`,
      }, { quoted: mek });
    }

    const message = generateWAMessageFromContent(from, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: {
            body: { 
              text: `📺 *${data.siteName || "Citizen Digital"}*\n\nLatest breaking news and updates from Kenya's leading digital news platform.\n\n🔹 Pinned: ${pinnedStories.length} stories\n🔹 Top Stories: ${topStories.length} articles`
            },
            footer: { 
              text: `🌐 ${data.url} • 🕐 Updated: ${new Date(data.lastUpdated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` 
            },
            carouselMessage: { cards: validCards }
          }
        }
      }
    }, { quoted: mek });

    await client.relayMessage(from, message.message, { messageId: message.key.id });

  } catch (err) {
    console.error("Citizen command error:", err);
    
    // Simple error message
    await client.sendMessage(from, {
      text: `❌ Failed to fetch Citizen Digital news.\n\nError: ${err.message}\n\nTry again or check:\n🔗 https://www.citizen.digital/`,
    }, { quoted: mek });
  }
});

pcmd({
  pattern: "movie",
  aliases: ["moviesearch"],
  category: "movie",
  description: "Search for movie information"
},
async (from, client, conText) => {
  const { q, mek, reply, api } = conText;

  if (!q) {
    return reply("📌 Provide a movie title.\nExample: movie Lucifer");
  }

  try {
    const apiUrl = `${api}/search/movie?q=${encodeURIComponent(q)}`;
    const { data } = await axios.get(apiUrl, { timeout: 60000 });

    if (!data?.status || !data.result) {
      return reply("❌ Movie not found.");
    }

    const m = data.result;

    let caption = `🎬 *${m.Title}* (${m.Year})
⭐ Rated: ${m.Rated}
📅 Released: ${m.Released}
⏱ Runtime: ${m.Runtime}
🎭 Genre: ${m.Genre}
✍️ Writer: ${m.Writer}
🎥 Actors: ${m.Actors}
🌍 Language: ${m.Language}
🏆 Awards: ${m.Awards}
📊 IMDb: ${m.imdbRating} (${m.imdbVotes} votes)

📝 Plot: ${m.Plot}`;

    await client.sendMessage(from, {
      image: { url: m.Poster },
      caption
    }, { quoted: mek });

  } catch (err) {
    console.error("Movie search error:", err);
    reply("⚠️ An error occurred while fetching movie info.");
  }
});

pcmd({
  pattern: "bible",
  description: "Fetch Bible verses (e.g., john3:16-18,20)",
  category: "Religion",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, api } = conText;

  if (!q) return reply("📌 Provide a verse reference, e.g. john3:16-18,20");

  try {
    const url = `${api}/search/bible?q=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.status || !data.result) {
      return reply("❌ Verse not found or API error.");
    }

    const { reference, translation, verses } = data.result;

    // Format verses nicely
    let message = `📖 *${reference}* (${translation.name})\n\n`;
    for (const v of verses) {
      message += `${v.book} ${v.chapter}:${v.verse} — ${v.text}\n\n`;
    }

    await reply(message.trim());

  } catch (err) {
    console.error("Bible command error:", err);
    reply("❌ Failed to fetch Bible verses. " + err.message);
  }
});

pcmd({
  pattern: "news",
  aliases: ["headlines", "latestnews"],
  description: "Get the latest news headlines for any topic",
  category: "news",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("📰 Type a topic to get the latest news.\n\nExample: .news Kenya");

  try {
    const res = await axios.get(`${api}/search/google?q=${encodeURIComponent(q + " latest news")}`);
    const data = res.data;

    if (!data.status || !Array.isArray(data.result?.items) || data.result.items.length === 0) {
      return reply("❌ No recent news found.");
    }

    const results = data.result.items.slice(0, 10);
    const list = results.map((r, i) =>
      `🗞️ *${i + 1}. ${r.title}*\n${r.snippet || "No summary"}\n🌐 ${r.link}`
    ).join("\n\n");

    const caption = `📰 *Latest News: ${q}*\n\n${list}`;
    await client.sendMessage(from, { text: caption }, { quoted: mek });
  } catch (err) {
    console.error("news error:", err);
    reply("❌ Error fetching news: " + err.message);
  }
});

pcmd({
  pattern: "google",
  aliases: ["googlesearch", "gsearch"],
  category: "search",
  description: "Search Google and show results in a carousel"
},
async (from, client, conText) => {
  const { q, mek, reply, api } = conText;
  if (!q) return reply("📌 Provide a search term.\nExample: google cat");

  try {
    const apiUrl = `${api}/search/google?q=${encodeURIComponent(q)}`;
    const res = await axios.get(apiUrl, { timeout: 60000 });
    const results = res.data?.result?.items;

    if (!Array.isArray(results) || results.length === 0) {
      return reply("❌ No results found.");
    }

    const items = results.slice(0, 20); // limit to 20 cards
    const cards = await Promise.all(items.map(async (item) => {
      const thumb = item.pagemap?.cse_thumbnail?.[0]?.src || null;
      return {
        header: {
          title: `🔎 ${item.title}`,
          hasMediaAttachment: !!thumb,
          imageMessage: thumb
            ? (await generateWAMessageContent({ image: { url: thumb } }, {
                upload: client.waUploadToServer
              })).imageMessage
            : undefined
        },
        body: {
          text: `${item.snippet}\n🌐 ${item.displayLink}`
        },
        footer: { text: "🔹 Scroll to explore more results" },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "🌐 Open Link",
                url: item.link
              })
            },
            {
              name: "cta_copy",
              buttonParamsJson: JSON.stringify({
                display_text: "📋 Copy Link",
                copy_code: item.link
              })
            }
          ]
        }
      };
    }));

    const message = generateWAMessageFromContent(from, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: {
            body: { text: `🔍 Google Results for: ${q}` },
            footer: { text: `📂 Showing ${items.length} results` },
            carouselMessage: { cards }
          }
        }
      }
    }, { quoted: mek });

    await client.relayMessage(from, message.message, { messageId: message.key.id });

  } catch (err) {
    console.error("Google search error:", err);
    reply("⚠️ An error occurred while fetching Google results.");
  }
});

pcmd({
  pattern: "brave",
  aliases: ["bravesearch", "searchbrave"],
  description: "Search Brave results and preview links",
  category: "search",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("🔍 Type a keyword to search Brave.\n\nExample: brave Kenya");

  try {
    const res = await axios.get(`${api}/search/brave?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !Array.isArray(data.result?.results) || data.result.results.length === 0) {
      return reply("❌ No results found.");
    }

    const { totalResults, searchQuery, timestamp } = data.result.metadata;
    const results = data.result.results.slice(0, 10);

    const list = results.map((r, i) =>
      `🔹 *${i + 1}. ${r.title}*\n${r.description || "No description"}\n🌐 ${r.url || r.siteName}`
    ).join("\n\n");

    const caption = `🦁 *Brave Search: ${searchQuery}*\n📄 Results: ${totalResults}\n🕒 ${new Date(timestamp).toLocaleString()}\n\n${list}`;

    await client.sendMessage(from, { text: caption }, { quoted: mek });
  } catch (err) {
    console.error("brave error:", err);
    reply("❌ Error fetching Brave results: " + err.message);
  }
});

pcmd({
  pattern: "wagroup",
  aliases: ["groupsearch", "whatsappgroup"],
  description: "Search and join WhatsApp groups by category",
  category: "search",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("🔍 Type a keyword to search WhatsApp groups.\n\nExample: wagroup football");

  try {
    const res = await axios.get(`${api}/search/whatsappgroup?q=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.success || !Array.isArray(data.results) || data.results.length === 0) {
      return reply("❌ No group categories found.");
    }

    const list = data.results.map((g, i) => `${i + 1}. ${g.title}`).join("\n");
    const caption = `📱 *Group Categories for:* _${q}_\n\n${list}\n\n📌 Reply with a number to view group links.`;

    const sent = await client.sendMessage(from, { text: caption }, { quoted: mek });
    const messageId = sent.key.id;

    client.ev.on("messages.upsert", async (update) => {
      const msg = update.messages[0];
      if (!msg.message) return;

      const responseText = msg.message.conversation || msg.message.extendedTextMessage?.text;
      const isReply = msg.message.extendedTextMessage?.contextInfo?.stanzaId === messageId;
      const chatId = msg.key.remoteJid;

      if (!isReply) return;

      const index = parseInt(responseText.trim()) - 1;
      const selected = data.results[index];

      if (!selected) {
        return client.sendMessage(chatId, {
          text: "❌ Invalid number. Reply with a valid group category number.",
          quoted: msg
        });
      }

      await client.sendMessage(chatId, { react: { text: "📥", key: msg.key } });

      try {
        const linkRes = await axios.get(`${api}/fetch/wagrouplink?url=${encodeURIComponent(selected.url)}`);
        const linkData = linkRes.data;

        if (!linkData.success || !linkData.result) {
          return client.sendMessage(chatId, {
            text: `❌ Couldn't fetch group links for ${selected.title}.`,
            quoted: msg
          });
        }

        const lines = linkData.result.split("\n").slice(0, 10); // max 10 links
        for (const line of lines) {
          const match = line.match(/Link - (https:\/\/chat\.whatsapp\.com\/invite\/\S+)/);
          if (!match) continue;

          await client.sendMessage(chatId, {
            text: match[1],
            quoted: msg
          });
        }
      } catch (err) {
        console.error("wagroup fetch error:", err);
        await client.sendMessage(chatId, {
          text: "❌ Error fetching group links: " + err.message,
          quoted: msg
        });
      }
    });
  } catch (err) {
    console.error("wagroup search error:", err);
    reply("❌ Error searching group categories: " + err.message);
  }
});

pcmd({
  pattern: "lyrics",
  aliases: ["lyric", "ly"],
  description: "Search for song lyrics by title or phrase",
  category: "Search",
  filename: __filename
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) return reply("🎵 Type a song title or lyric linen\nExample: lyrics what shall I render to Jehovah");

  try {
    const res = await axios.get(`${api}/search/lyrics3?query=${encodeURIComponent(q)}`);
    const data = res.data;

    if (!data.status || !data.result) {
      return reply("❌ No lyrics found.");
    }

    const caption = `🎶 ${data.result}`;

    await client.sendMessage(from, { text: caption }, { quoted: mek });
  } catch (err) {
    console.error("lyrics error:", err);
    reply("❌ Error fetching lyrics: " + err.message);
  }
});

pcmd({
  pattern: "yts",
  aliases: ["ytsearch"],
  category: "Search",
  description: "Search YouTube videos",
  filename: __filename
}, async (from, client, { q, reply, api }) => {
  if (!q) return reply("📌 Usage: .yts <query>\nExample: .yts spectre");

  try {
    const { data } = await axios.get(`${api}/search/yts?query=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000
    });

    if (!data?.status || !data.result?.length) return reply("❌ No results found.");

    let out = `🔎 *YouTube Search Results for:* ${q}\n\n`;
    out += data.result.slice(0, 10).map((v, i) => 
      `🎬 *${i + 1}. ${v.title}*\n🆔 ID: ${v.id}\n👁️ Views: ${v.views}\n⏱️ Duration: ${v.duration}\n📅 Published: ${v.published || '-'}\n🔗 ${v.url}`
    ).join("\n\n");

    await reply(out);
  } catch (err) {
    console.error("yts error:", err);
    await reply(`❌ Error: ${err.message}`);
  }
});

pcmd({
  pattern: "image",
  aliases: ["imgsearch", "photosearch", "img"],
  category: "Search",
  description: "Search for images and send as album"
}, async (from, client, conText) => {
  const { q, reply, mek, api } = conText;

  if (!q) {
    return reply(`📌 *Image Search*
    
*Usage:* .imagesearch dog
*Aliases:* .imgsearch, .photosearch`);
  }

  await reply(`🔍 Searching for "${q}"...`);

  try {
    const { data } = await axios.get(`${api}/search/images?query=${encodeURIComponent(q)}`);
    
    if (!data.status || !data.result?.length) {
      return reply("❌ No images found.");
    }

    const album = [];
    for (let i = 0; i < Math.min(data.result.length, 10); i++) {
      const img = data.result[i];
      const imageUrl = img.thumbnail || img.url;
      if (imageUrl) {
        album.push({ 
          image: { url: imageUrl },
          caption: i === 0 ? `🔎 *${q}*\n📸 ${data.result.length} results` : undefined
        });
      }
    }

    if (album.length === 0) return reply("❌ Failed to load images.");
    
    await client.sendMessage(from, { album }, { quoted: mek });

  } catch (err) {
    console.error("imagesearch error:", err);
    reply("❌ Error: " + err.message);
  }
});

