// PRIME plugin: Download.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const axios = require('axios');

const { pcmd } = require('../lib/primeCompat');
pcmd({
  pattern: "play",
  aliases: ["ytmp3", "ytmp3doc", "audiodoc", "yta", "song"],
  category: "Downloader",
  description: "Download Video from Youtube"
},
async (from, client, conText) => {
   const { q, mek, api, contactMessage} = conText;

  if (!q) return;

  try {
    let videoUrl;
    let videoTitle;

    if (q.match(/(youtube\.com|youtu\.be)/i)) {
      videoUrl = q;
      const videoId = videoUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)?.[1];
      if (!videoId) return;
      videoTitle = "YouTube Audio";
    } else {
      const searchResponse = await axios.get(`${api}/search/yts?query=${encodeURIComponent(q)}`);
      const videos = searchResponse.data?.result;
      if (!Array.isArray(videos) || videos.length === 0) return;

      const firstVideo = videos[0];
      videoUrl = firstVideo.url;
      videoTitle = firstVideo.title;
    }

    const downloadResponse = await axios.get(`${api}/download/audio?url=${encodeURIComponent(videoUrl)}`);
    const downloadUrl = downloadResponse.data?.result;
    if (!downloadUrl) return;

    const fileName = `${videoTitle}.mp3`.replace(/[^\w\s.-]/gi, '');

    await client.sendMessage(from, {
      audio: { url: downloadUrl },
      mimetype: "audio/mpeg",
      fileName
    }, { quoted: contactMessage });

    await client.sendMessage(from, {
      document: { url: downloadUrl },
      mimetype: "audio/mpeg",
      fileName
    }, { quoted: contactMessage });

  } catch (error) {
    console.error("Error during download process:", error);
  }
});

pcmd({
  pattern: "video",
  aliases: ["ytmp4", "ytmp4doc", "videodoc", "ytv"],
  category: "Downloader",
  description: "Download Video from Youtube"
},
async (from, client, conText) => {
  const { q, mek, api, contactMessage } = conText;

  if (!q) return;

  try {
    let videoUrl;
    let videoTitle;

    if (q.match(/(youtube\.com|youtu\.be)/i)) {
      videoUrl = q;
      const videoId = videoUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)?.[1];
      if (!videoId) return;
      videoTitle = "YouTube Video";
    } else {
      const searchResponse = await axios.get(`${api}/search/yts?query=${encodeURIComponent(q)}`);
      const videos = searchResponse.data?.result;
      if (!Array.isArray(videos) || videos.length === 0) return;

      const firstVideo = videos[0];
      videoUrl = firstVideo.url;
      videoTitle = firstVideo.title;
    }

    const downloadResponse = await axios.get(`${api}/download/video?url=${encodeURIComponent(videoUrl)}`);
    const downloadUrl = downloadResponse.data?.result;
    if (!downloadUrl) return;

    const fileName = `${videoTitle}.mp4`.replace(/[^\w\s.-]/gi, '');

    await client.sendMessage(from, {
      video: { url: downloadUrl },
      mimetype: "video/mp4",
      fileName
    }, { quoted: contactMessage });

    await client.sendMessage(from, {
      document: { url: downloadUrl },
      mimetype: "video/mp4",
      fileName
    }, { quoted: contactMessage });

  } catch (error) {
    console.error("Error during download process:", error);
  }
});

pcmd({
  pattern: "facebook",
  aliases: ["fbdl", "fb"],
  category: "Downloader",
  description: "Download video from Facebook"
},
async (from, client, conText) => {
  const { q, mek, api } = conText;

  if (!q || !q.startsWith("http")) return;

  try {
    const apiUrl = `${api}/download/fbdown?url=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 100000 });
    const result = response.data?.result;

    if (!result?.media?.sd) return;

    await client.sendMessage(from, {
      video: { url: result.media.sd },
      mimetype: "video/mp4"
    }, { quoted: mek });

  } catch (error) {
    console.error("Facebook download error:", error);
  }
});

pcmd({
  pattern: "apk",
  aliases: ["aptoide", "apkdl"],
  category: "Downloader",
  description: "Download APK from Aptoide"
},
async (from, client, conText) => {
  const { q, mek, api } = conText;

  if (!q) return;

  try {
    const searchUrl = `${api}/search/aptoide?q=${encodeURIComponent(q)}`;
    const response = await axios.get(searchUrl, { timeout: 100000 });
    const apps = response.data?.result?.datalist?.list;
    if (!Array.isArray(apps) || apps.length === 0) return;

    const app = apps[0];
    const file = app.file;
    if (!file?.path) return;

    const fileName = `${app.name}.apk`.replace(/[^\w\s.-]/gi, '');
    const caption = `📦 *${app.name}*\n🧑‍💻 Developer: ${app.developer?.name || "Unknown"}\n📦 Package: ${app.package}\n📏 Size: ${(file.filesize / 1024 / 1024).toFixed(2)} MB\n⭐ Rating: ${app.stats?.rating?.avg || "N/A"} (${app.stats?.rating?.total || 0} votes)\n🔒 Signature: ${file.signature?.sha1 || "N/A"}`;

    const contextInfo = {
      externalAdReply: {
        title: app.name,
        body: `${file.vername} • ${app.package}`,
        mediaType: 1,
        sourceUrl: `https://aptoide.com/search?q=${encodeURIComponent(app.package)}`,
        thumbnailUrl: app.icon,
        renderLargerThumbnail: false
      }
    };

    await client.sendMessage(from, {
      document: { url: file.path },
      mimetype: "application/vnd.android.package-archive",
      fileName,
      caption,
      contextInfo
    }, { quoted: mek });

  } catch (error) {
    console.error("APK download error:", error);
  }
});

pcmd({
  pattern: "pinterest",
  aliases: ["pindl", "pin"],
  category: "downloader",
  description: "Download media from Pinterest"
},
async (from, client, conText) => {
  const { q, mek, api } = conText;

  if (!q || !q.startsWith("http")) return;

  try {
    const apiUrl = `${api}/download/pindl2?url=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 100000 });
    const result = response.data?.result;

    if (!result?.success || !Array.isArray(result.medias)) return;

    const title = result.title || "Pinterest Media";

    for (const media of result.medias) {
      const { url, extension, videoAvailable } = media;
      if (!url) continue;

      const fileName = `${title}.${extension}`.replace(/[^\w\s.-]/gi, '');
      const mimetype = extension === "mp4" ? "video/mp4" : "image/jpeg";

      await client.sendMessage(from, {
        [videoAvailable ? "video" : "image"]: { url },
        mimetype,
        fileName
      }, { quoted: mek });
    }

  } catch (error) {
    console.error("Pinterest download error:", error);
  }
});

pcmd({
  pattern: "spotify",
  aliases: ["spot", "spdl"],
  category: "Downloader",
  description: "Download track from Spotify"
},
async (from, client, conText) => {
  const { q, mek, api } = conText;

  if (!q) return;

  try {
    const apiUrl = `${api}/download/spotify?q=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 100000 });
    const track = response.data?.result?.track;

    if (!track?.downloadLink) return;

    const fileName = `${track.title}.mp3`.replace(/[^\w\s.-]/gi, '');
    const contextInfo = {
      externalAdReply: {
        title: track.title,
        body: `${track.artist} • ${track.duration}`,
        mediaType: 1,
        sourceUrl: track.url,
        thumbnailUrl: track.thumbnail,
        renderLargerThumbnail: false
      }
    };

    await client.sendMessage(from, {
      audio: { url: track.downloadLink },
      mimetype: "audio/mpeg",
      fileName,
      contextInfo
    }, { quoted: mek });

    await client.sendMessage(from, {
      document: { url: track.downloadLink },
      mimetype: "audio/mpeg",
      fileName,
      contextInfo: {
        ...contextInfo,
        externalAdReply: {
          ...contextInfo.externalAdReply,
          body: "Document version - Powered by PRIME-MD"
        }
      }
    }, { quoted: mek });

  } catch (error) {
    console.error("Spotify download error:", error);
  }
});

pcmd({
  pattern: "mfire",
  aliases: ["mediafire", "mf"],
  category: "Downloader",
  description: "Download file from MediaFire"
},
async (from, client, conText) => {
  const { q, mek, url, api } = conText;

  if (!q || !q.startsWith("http")) return;

  try {
    const apiUrl = `${api}/download/mfire?url=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 100000 });
    const result = response.data?.result;

    if (!result?.dl_link || !result?.fileName) return;

    const fileName = result.fileName.replace(/[^\w\s.-]/gi, '');
    const contextInfo = {
      externalAdReply: {
        title: "MediaFire Download",
        body: `${fileName} • ${result.size}`,
        mediaType: 1,
        sourceUrl: q,
        thumbnailUrl: url,
        renderLargerThumbnail: false
      }
    };

    await client.sendMessage(from, {
      document: { url: result.dl_link },
      mimetype: result.fileType || "application/octet-stream",
      fileName,
      contextInfo
    }, { quoted: mek });

  } catch (error) {
    console.error("MediaFire download error:", error);
  }
});

pcmd({
  pattern: "twitter",
  aliases: ["tw", "twt"],
  category: "Downloader",
  description: "Download video from Twitter"
},
async (from, client, conText) => {
  const { q, mek, api } = conText;

  if (!q || !q.startsWith("http")) return;

  try {
    const apiUrl = `${api}/download/twitter?url=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 100000 });
    const result = response.data?.result;

    await client.sendMessage(from, {
      video: { url: result },
      mimetype: "video/mp4"
    }, { quoted: mek });

  } catch (error) {
    console.error("Twitter download error:", error);
  }
});

pcmd({
  pattern: "soundcloud",
  aliases: ["scdl"],
  category: "Downloader",
  description: "Download track from SoundCloud"
},
async (from, client, conText) => {
  const { q, mek, api } = conText;

  if (!q) return;

  try {
    let trackUrl = q;

    if (!/^https?:\/\/(m\.)?soundcloud\.com\//i.test(q)) {
      const searchRes = await axios.get(`${api}/search/soundcloud?q=${encodeURIComponent(q)}`);
      const topTrack = searchRes.data?.result?.result?.find(x => x.url?.includes("soundcloud.com") && x.timestamp);
      if (!topTrack?.url) return;
      trackUrl = topTrack.url;
    }

    const dlRes = await axios.get(`${api}/download/soundcloud?url=${encodeURIComponent(trackUrl)}`);
    const media = dlRes.data?.data?.medias?.find(m => m.audioAvailable && m.url);
    const track = dlRes.data?.data;

    if (!media?.url) return;

    const fileName = `${track.title}.mp3`.replace(/[^\w\s.-]/gi, '');
    const contextInfo = {
      externalAdReply: {
        title: track.title,
        body: `${track.duration} • SoundCloud`,
        mediaType: 1,
        sourceUrl: track.url,
        thumbnailUrl: track.thumbnail,
        renderLargerThumbnail: false
      }
    };

    await client.sendMessage(from, {
      audio: { url: media.url },
      mimetype: "audio/mpeg",
      fileName,
      contextInfo
    }, { quoted: mek });

    await client.sendMessage(from, {
      document: { url: media.url },
      mimetype: "audio/mpeg",
      fileName,
      contextInfo: {
        ...contextInfo,
        externalAdReply: {
          ...contextInfo.externalAdReply,
          body: "Document version - Powered by PRIME-MD"
        }
      }
    }, { quoted: mek });

  } catch (error) {
    console.error("SoundCloud download error:", error);
  }
});

pcmd({
  pattern: "tiktok",
  aliases: ["ttdl", "tt"],
  category: "Downloader",
  description: "Download video from TikTok"
},
async (from, client, conText) => {
  const { q, mek, reply, api } = conText;

  if (!q || !q.startsWith("http")) {
    return reply("❌ Provide a valid TikTok URL.");
  }

  try {
    const apiUrl = `${api}/download/tiktokdl3?url=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 100000 });

    const videoUrl = response.data?.result;
    if (!videoUrl) {
      return reply("❌ No video found for this TikTok link.");
    }

    await client.sendMessage(
      from,
      {
        video: { url: videoUrl },
        mimetype: "video/mp4"
      },
      { quoted: mek }
    );
  } catch (error) {
    console.error("TikTok download error:", error);
    reply("❌ Failed to download TikTok video.");
  }
});

pcmd({
  pattern: "instagram",
  aliases: ["insta", "igdl", "ig"],
  category: "Downloader",
  description: "Download video from Instagram"
},
async (from, client, conText) => {
  const { q, mek, reply } = conText;

  if (!q || !q.startsWith("http")) {
    return reply("❌ Provide a valid Instagram URL.");
  }

  try {
    const apiUrl = `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(q)}`;
    const response = await axios.get(apiUrl, { timeout: 60000 });

    if (!response.data?.status || !response.data?.data) {
      return reply("❌ Failed to download media. The link might be private or invalid.");
    }

    const mediaList = response.data.data;
    
    for (const item of mediaList) {
        if (item.url) {
            const isVideo = item.url.includes(".mp4") || item.type === "video";
            await client.sendMessage(from, {
                [isVideo ? "video" : "image"]: { url: item.url },
                caption: "> *Downloaded by PRIMETECH*"
            }, { quoted: mek });
        }
    }
  } catch (error) {
    console.error("Instagram download error:", error);
    reply("❌ Failed to download Instagram media.");
  }
});

pcmd({
  pattern: "trailer",
  aliases: ["movietrailer", "filmtrailer", "preview"],
  category: "Movie",
  description: "Search for a movie and send its trailer video"
},
async (from, client, conText) => {
  const { q, mek, reply, api } = conText;

  if (!q) {
    return reply("📌 Usage: trailer <movie name>\nExample: trailer As Good As Dead");
  }

  try {
    // Step 1: Search for movie
    const { data: search } = await axios.get(
      `${api}/moviebox/search?q=${encodeURIComponent(q)}`
    );

    if (!search.status || !search.result?.results?.length) {
      return reply("❌ No movies found for that query.");
    }

    // Pick the first result
    const movie = search.result.results[0];

    // Step 2: Fetch trailer info
    const { data: trailer } = await axios.get(
      `${api}/movie/trailer?q=${encodeURIComponent(movie.url)}`
    );

    if (!trailer.status || !trailer.result?.trailerUrl) {
      return reply("❌ Trailer not available.");
    }

    // Step 3: Send trailer video with rating and type
    await client.sendMessage(from, {
      video: { url: trailer.result.trailerUrl },
      caption: `🎬 *${movie.title}*\n⭐ Rating: ${movie.rating}\n🎞️ Type: ${movie.type}\n\n${trailer.result.description}`
    }, { quoted: mek });

  } catch (err) {
    reply("⚠️ An error occurred while fetching the trailer.");
  }
});

