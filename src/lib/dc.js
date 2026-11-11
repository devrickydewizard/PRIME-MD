const axios = require("axios");
const yts = require("yt-search");
const scraper = require("kalss-scraper");
const ruhend = require("ruhend-scraper");

// ---- AI (Pollinations - no key needed) ----
async function aiChat(prompt) {
  try {
    const { data } = await axios.get(
      `https://text.pollinations.ai/${encodeURIComponent(prompt)}`,
      { timeout: 30000 }
    );
    return typeof data === "string" ? data : JSON.stringify(data);
  } catch (e) {
    console.error("[DC] AI failed:", e.message);
    return null;
  }
}

// ---- YouTube ----
async function ytmp3(url) {
  try {
    const data = await scraper.youtube.download(url);
    return data?.dl_url || data?.url || null;
  } catch (e) {
    console.error("[DC] ytmp3 failed:", e.message);
    return null;
  }
}

async function ytmp4(url) {
  try {
    const data = await scraper.youtube.download(url, { type: "video" });
    return data?.dl_url || data?.url || null;
  } catch (e) {
    console.error("[DC] ytmp4 failed:", e.message);
    return null;
  }
}

// ---- Social ----
async function instagram(url) {
  try {
    const res = await ruhend.igdl(url);
    return res?.[0]?.url || null;
  } catch (e) {
    console.error("[DC] instagram failed:", e.message);
    return null;
  }
}

async function tiktok(url) {
  try {
    const data = await scraper.tiktok.download(url);
    return data?.dl_url || data?.video || null;
  } catch (e) {
    console.error("[DC] tiktok failed:", e.message);
    return null;
  }
}

async function facebook(url) {
  try {
    const res = await ruhend.fbdl(url);
    return res?.url || res?.[0]?.url || null;
  } catch (e) {
    console.error("[DC] facebook failed:", e.message);
    return null;
  }
}

// ---- Upload (0x0.st - no key needed) ----
async function upload(buffer, filename = "file.bin") {
  try {
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", buffer, { filename });
    const { data } = await axios.post("https://0x0.st", form, {
      headers: form.getHeaders(),
      timeout: 60000,
    });
    return data.trim();
  } catch (e) {
    console.error("[DC] upload failed:", e.message);
    return null;
  }
}

// ---- YouTube Search ----
async function search(query) {
  try {
    const r = await yts(query);
    return r.videos?.[0] || null;
  } catch (e) {
    console.error("[DC] search failed:", e.message);
    return null;
  }
}

module.exports = { aiChat, ytmp3, ytmp4, instagram, tiktok, facebook, upload, search };
