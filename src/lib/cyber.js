const axios = require("axios");

const BASE = process.env.CYBER_API_BASE || "https://api1.cyberdark.site";
const OGGY = "https://jerrycoder.oggyapi.workers.dev";
const JAWAD = "https://jawad-tech.vercel.app";
const TIKWM = "https://tikwm.com";
const ASWIN = "https://api-aswin-sparky.koyeb.app";
const TIMEOUT = 25000;

const http = (url, opts = {}) =>
  axios.get(url, { timeout: TIMEOUT, ...opts }).then(r => r.data);

// ───── YouTube search (via cyber) ─────
async function search(query) {
  try {
    const data = await http(`${BASE}/search`, { params: { q: query } });
    if (Array.isArray(data?.songs) && data.songs.length) {
      const s = data.songs[0];
      return { title: s.title, author: s.artist, thumbnail: s.thumbnail,
               duration: s.duration, videoId: s.id, url: s.youtubeUrl };
    }
    if (data?.result) {
      const r = data.result;
      return { title: r.title, author: r.author, thumbnail: r.thumbnail,
               duration: r.duration, views: r.views, videoId: r.videoId, url: r.url };
    }
    return null;
  } catch (e) {
    console.error("[CYBER] search:", e.message);
    return null;
  }
}

// ───── YouTube audio/video: try cyber, fall back to OGGY ─────
async function ytmp3(url) {
  // cyber stream URL is what we prefer (WhatsApp fetches it)
  const cyberUrl = `${BASE}/audio?url=${encodeURIComponent(url)}`;
  try {
    await axios.head(cyberUrl, { timeout: 8000 });
    return cyberUrl;
  } catch (_) {}
  // fallback: OGGY gives a direct mp3 URL
  try {
    const d = await http(`${OGGY}/ytmp3`, { params: { url } });
    if (d?.status === "success" && d.url) return d.url;
  } catch (e) { console.error("[CYBER] oggy ytmp3:", e.message); }
  return null;
}

async function ytmp4(url) {
  return `${BASE}/video?url=${encodeURIComponent(url)}`;
}

// ───── Facebook (via Jawad Tech) ─────
async function facebook(url) {
  try {
    const d = await http(`${JAWAD}/downloader`, { params: { url } });
    const item = Array.isArray(d?.result) ? d.result[0] : d?.result;
    return item?.url || d?.url || null;
  } catch (e) { console.error("[CYBER] fb:", e.message); return null; }
}

// ───── TikTok (via TikWM) ─────
async function tiktok(url) {
  try {
    const d = await http(`${TIKWM}/api/`, { params: { url } });
    if (d?.code === 0 && d?.data) {
      return {
        video: d.data.play || d.data.hdplay || null,
        audio: d.data.music || null,
        title: d.data.title || "",
      };
    }
    return null;
  } catch (e) { console.error("[CYBER] tt:", e.message); return null; }
}

// ───── Instagram (via Aswin) ─────
async function instagram(url) {
  try {
    const d = await http(`${ASWIN}/api/downloader/igdl`, { params: { url } });
    if (d?.status === true && Array.isArray(d.result) && d.result.length) {
      return d.result.map(x => x.url || x.download_url).filter(Boolean);
    }
    return null;
  } catch (e) { console.error("[CYBER] ig:", e.message); return null; }
}

exports.search = search;
exports.ytmp3 = ytmp3;
exports.ytmp4 = ytmp4;
exports.facebook = facebook;
exports.tiktok = tiktok;
exports.instagram = instagram;
