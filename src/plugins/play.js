const { cmd } = require("../lib");
const yts = require('yt-search');
const axios = require('axios');

function extractButtonId(msg) {
    if (!msg) return null;
    if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;
    if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId;
    if (msg.interactiveResponseMessage) {
        const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage;
        if (nf?.paramsJson) {
            try { const p = JSON.parse(nf.paramsJson); if (p.id) return p.id; } catch {}
        }
        return msg.interactiveResponseMessage.buttonId || null;
    }
    return null;
}

const extractVideoId = (url) => {
    const m = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return m ? m[1] : null;
};

async function fetchDownloadUrl(videoUrl, type = 'audio') {
    const base = "https://api1.cyberdark.site";
    try {
        // Using the EXACT endpoint from your screenshot
        const res = await axios.get(`${base}/ytmusic/download?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
        if (res.data?.success && res.data?.result?.directUrl) {
            const dUrl = res.data.result.directUrl;
            return dUrl.startsWith('http') ? dUrl : `${base}${dUrl}`;
        }
    } catch (e) { console.log("Cyberdark failed:", e.message); }

    // Fallbacks if Cyberdark is down
    try {
        const ep = type === 'audio' ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.siputzx.my.id/api/d/${ep}?url=${encodeURIComponent(videoUrl)}`, { timeout: 10000 });
        if (res.data?.status && res.data?.data?.download) return res.data.data.download;
    } catch (e) {}

    try {
        const ep = type === 'audio' ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.vreden.my.id/api/${ep}?url=${encodeURIComponent(videoUrl)}`, { timeout: 10000 });
        if (res.data?.result?.download?.url) return res.data.result.download.url;
    } catch (e) {}

    return null;
}

async function searchSong(query) {
    try {
        const search = await yts(query);
        const video = search.videos[0];
        if (!video) return null;
        return {
            url: video.url, title: video.title, thumbnail: video.thumbnail,
            duration: video.timestamp || 'Unknown', views: video.views,
            author: video.author?.name || 'Unknown', videoId: video.videoId,
            seconds: video.duration || 0, ago: video.ago || 'Recently',
        };
    } catch (err) { return null; }
}

cmd({ pattern: "play", aliases: ["song", "audio"], category: "downloader", react: "🎶" },
  async (from, sock, conText) => {
    const { reply, react, q, msg, m, pushName, botPic, formatAudio, formatVideo } = conText;
    const currentMsg = msg || m;

    if (!q) return reply("🎵 Usage: `.play <song name or URL>`");

    try {
      await react("🔍");
      let videoInfo = null;

      if (q.match(/(youtube\.com|youtu\.be)/i)) {
        const videoId = extractVideoId(q);
        if (!videoId) return reply("🙅‍♂️ Invalid YouTube URL.");
        const search = await yts(q);
        const v = search.videos[0];
        videoInfo = v ? {
            title: v.title, thumbnail: v.thumbnail, duration: v.timestamp || 'Unknown',
            views: v.views || 0, author: v.author?.name || 'Unknown',
            url: v.url, videoId, seconds: v.duration || 0, ago: v.ago || 'Recently',
        } : { title: 'YouTube Video', url: q, videoId };
      } else {
        videoInfo = await searchSong(q);
        if (!videoInfo) return reply("🙅‍♂️ No results found.");
      }

      const dateNow = Date.now();
      const buttonId = `play_${videoInfo.videoId}_${dateNow}`;

      let thumb = Buffer.alloc(0);
      try {
          const sharp = require('sharp');
          const res = await fetch(videoInfo.thumbnail || botPic);
          const buf = Buffer.from(await res.arrayBuffer());
          thumb = await sharp(buf).resize({ width: 300 }).jpeg({ quality: 80 }).toBuffer();
      } catch (e) {}

      await sock.relayMessage(from, {
          buttonsMessage: {
              buttons: [
                  { buttonId: `audio_${buttonId}`, buttonText: { displayText: "🎵 Audio" }, type: 1 },
                  { buttonId: `vid_${buttonId}`, buttonText: { displayText: "🎬 Video" }, type: 1 }
              ],
              contentText: `*– ( YOUTUBE PLAY )*\n──────────────𔓕\n*⿻ Title:* ${videoInfo.title || 'Unknown'}\n*⿻ Channel:* ${videoInfo.author || 'Unknown'}\n*⛿ Duration:* ${videoInfo.duration || 'Unknown'}\n*⿻ Views:* ${(videoInfo.views || 0).toLocaleString()}\n*⿻ Uploaded:* ${videoInfo.ago || 'Recently'}\n\n*⿻ Select Download Format*`,
              footerText: 'PRIME-MD',
              contextInfo: { mentionedJid: [], groupMentions: [], statusAttributions: [] },
              headerType: 6,
              locationMessage: {
                  degreesLatitude: 0, degreesLongitude: 0,
                  name: `${pushName || 'User'}`,
                  address: `–${videoInfo.author || 'YouTube'}`,
                  jpegThumbnail: thumb
              }
          }
      }, {
          additionalNodes: [{
              tag: 'biz', attrs: {},
              content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }]
          }]
      });

      const handleResponse = async (event) => {
          if (event.type === "append") return;
          const messageData = event.messages[0];
          if (!messageData || !messageData.message) return;
          
          let msgContent = messageData.message;
          if (msgContent.viewOnceMessageV2) msgContent = msgContent.viewOnceMessageV2.message;
          if (msgContent.viewOnceMessage) msgContent = msgContent.viewOnceMessage.message;
          if (msgContent.ephemeralMessage) msgContent = msgContent.ephemeralMessage.message;

          const selectedButtonId = extractButtonId(msgContent);
          if (!selectedButtonId || !selectedButtonId.includes(dateNow.toString())) return;

          sock.ev.off('messages.upsert', handleResponse);

          try {
              if (selectedButtonId.startsWith('audio_')) {
                  await sock.sendMessage(from, { react: { text: '⬇️', key: currentMsg.key } });
                  const audioUrl = await fetchDownloadUrl(videoInfo.url, 'audio');
                  if (!audioUrl) throw new Error("All servers are down.");
                  
                  const res = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 30000 });
                  let buffer = Buffer.from(res.data);
                  if (buffer.length < 100 * 1024) throw new Error("Corrupted file.");
                  
                  const finalAudio = formatAudio ? await formatAudio(buffer) : buffer;
                  await sock.sendMessage(from, { audio: finalAudio, mimetype: "audio/mpeg", fileName: `${videoInfo.title}.mp3` }, { quoted: messageData });
                  await sock.sendMessage(from, { react: { text: '✅', key: currentMsg.key } });
              } 
              else if (selectedButtonId.startsWith('vid_')) {
                  await sock.sendMessage(from, { react: { text: '⬇️', key: currentMsg.key } });
                  const videoUrl = await fetchDownloadUrl(videoInfo.url, 'video');
                  if (!videoUrl) throw new Error("All servers are down.");
                  
                  const res = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60000 });
                  let buffer = Buffer.from(res.data);
                  if (buffer.length < 500 * 1024) throw new Error("Corrupted video.");
                  
                  const finalVideo = formatVideo ? await formatVideo(buffer) : buffer;
                  await sock.sendMessage(from, { video: finalVideo, mimetype: "video/mp4", caption: `🎬 *${videoInfo.title}*` }, { quoted: messageData });
                  await sock.sendMessage(from, { react: { text: '✅', key: currentMsg.key } });
              }
          } catch (error) { 
              console.error("[PLAY] Download failed:", error.message); 
              await sock.sendMessage(from, { text: `🙅‍♂️ Download failed: ${error.message}` }, { quoted: messageData });
          }
      };

      sock.ev.on('messages.upsert', handleResponse);
      setTimeout(() => sock.ev.off('messages.upsert', handleResponse), 300000);
      await react("✅");

    } catch (error) {
      console.error('[PLAY] Error:', error.message);
      await reply('🙅‍♂️ Failed to process request. Try again later.');
    }
  }
);
