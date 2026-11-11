const {
    cmd,
    gitRepoRegex,
    MAX_MEDIA_SIZE,
    getFileSize,
    getMimeCategory,
    getMimeFromUrl,
} = require("../lib");
const axios = require("axios");
const yts = require('yt-search');

let giftedDls = null;
try {
    const GIFTED_DLS = require("gifted-dls");
    giftedDls = new GIFTED_DLS();
} catch (e) { console.log("[downloader] gifted-dls is missing, some features disabled"); }

let sendButtons = null;
try {
    sendButtons = require("gifted-btns").sendButtons;
} catch (e) {
    sendButtons = async (sock, from, msg) => {
        return sock.sendMessage(from, { text: msg.text || "Interactive buttons unavailable." });
    };
    console.log("[downloader] gifted-btns is missing, using text fallback");
}

function extractButtonId(msg) {
    if (!msg) return null;
    if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;
    if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId;
    if (msg.interactiveResponseMessage) {
        const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage;
        if (nf?.paramsJson) { try { const p = JSON.parse(nf.paramsJson); if (p.id) return p.id; } catch {} }
        return msg.interactiveResponseMessage.buttonId || null;
    }
    return null;
}

const ytdl = require('@distube/ytdl-core');

async function getYTMedia(url, type = 'audio') {
    // API 1: Siputzx
    try {
        const ep = type === 'audio' ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.siputzx.my.id/api/d/${ep}?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.status && res.data?.data?.download) return res.data.data.download;
    } catch (e) {}

    // API 2: Vreden
    try {
        const ep = type === 'audio' ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.vreden.my.id/api/${ep}?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.result?.download?.url) return res.data.result.download.url;
    } catch (e) {}

    // API 3: Bk9
    try {
        const ep = type === 'audio' ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.bk9.dev/downloader/${ep}?url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.result?.url) return res.data.result.url;
    } catch (e) {}

    // API 4: Nexoracle
    try {
        const ep = type === 'audio' ? 'ytmp3' : 'ytmp4';
        const res = await axios.get(`https://api.nexoracle.com/downloader/${ep}?apikey=free&url=${encodeURIComponent(url)}`, { timeout: 15000 });
        if (res.data?.result?.url) return res.data.result.url;
    } catch (e) {}

    // Fallback: Direct YouTube Download (Bypasses all external APIs)
    console.log("[DOWNLOADER] All APIs failed. Using direct ytdl-core...");
    return "DIRECT_YTDL";
}

cmd({ pattern: "gitclone", category: "downloader", react: "📦", aliases: ["gitdl", "github", "git", "repodl", "clone"] },
async (from, sock, conText) => {
    const { q, mek, reply, react, botName } = conText;
    if (!q) { await react("🙅‍♂️"); return reply("Please provide a GitHub repository link.\n\n*Example:*\n.gitclone https://github.com/user/repo"); }
    if (!gitRepoRegex.test(q)) { await react("🙅‍♂️"); return reply("Invalid GitHub repository URL."); }
    try {
        await react("⏳");
        let [, user, repo] = q.match(gitRepoRegex) || [];
        repo = repo.replace(/\.git$/, "").split("/")[0];
        const apiUrl = `https://api.github.com/repos/${user}/${repo}`;
        const { data } = await axios.get(apiUrl, { timeout: 30000, headers: { "User-Agent": botName || "GitClone" } });
        if (!data) { await react("🙅‍♂️"); return reply("Repository not found."); }
        const { full_name, stargazers_count, forks_count, language, size, default_branch, created_at, owner } = data;
        const zipUrl = `https://github.com/${user}/${repo}/archive/refs/heads/${default_branch}.zip`;
        const fileName = `${repo}-${default_branch}.zip`;
        const caption = `📦 *GITHUB REPOSITORY*\n\n📁 *Name:* ${full_name}\n👤 *Owner:* ${owner?.login || user}\n⭐ *Stars:* ${stargazers_count}\n🍴 *Forks:* ${forks_count}\n💻 *Language:* ${language || "Unknown"}\n📦 *Size:* ${size} KB\n🌿 *Branch:* ${default_branch}\n📅 *Created:* ${new Date(created_at).toDateString()}\n`;
        await sock.sendMessage(from, { document: { url: zipUrl }, fileName, mimetype: "application/zip", caption }, { quoted: mek });
    } catch (error) {
        await react("🙅‍♂️");
        if (error?.response?.status === 404) return reply("Repository not found or private repository.");
        if (error?.response?.status === 403) return reply("GitHub API rate limit exceeded. Try again later.");
        return reply(`Failed to download repository.\n\n${error.message}`);
    }
});

cmd({ pattern: "twitter", category: "downloader", react: "🐦", aliases: ["twitterdl", "xdl", "xdownloader", "twitterdownloader", "x"] },
    async (from, sock, conText) => {
        const { q, mek, reply, react, botName, botFooter, gmdBuffer, toAudio, GiftedTechApi, GiftedApiKey } = conText;
        if (!q) { await react("🙅‍♂️"); return reply("Please provide a Twitter/X URL"); }
        if (!q.includes("twitter.com") && !q.includes("x.com")) { await react("🙅‍♂️"); return reply("Please provide a valid Twitter/X URL"); }
        try {
            await react("🔍");
            const apiUrl = `${GiftedTechApi}/api/download/twitter?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });
            if (!response.data?.success || !response.data?.result) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
            const { thumbnail, videoUrls } = response.data.result;
            if (!videoUrls || videoUrls.length === 0) { await react("🙅‍♂️"); return reply("No video found in this tweet."); }
            const dateNow = Date.now();
            const buttons = videoUrls.map((v, index) => ({ id: `tw_${index}_${dateNow}`, text: `${v.quality} Quality 🎥` }));
            buttons.push({ id: `tw_audio_${dateNow}`, text: "Audio Only 🎶" });
            await sendButtons(sock, from, { title: `${botName} TWITTER`, text: `🐦 *Twitter Video*\n\n*Qualities:* ${videoUrls.map(v => v.quality).join(", ")}\n\n*Select:*`, footer: botFooter, image: { url: thumbnail }, buttons });
            const handleResponse = async (event) => {
                const messageData = event?.messages?.[0];
                if (!messageData?.message || messageData.key?.remoteJid !== from) return;
                const selectedButtonId = extractButtonId(messageData.message);
                if (!selectedButtonId || !selectedButtonId.includes(`_${dateNow}`)) return;
                sock.ev.off("messages.upsert", handleResponse);
                await react("⬇️");
                try {
                    if (selectedButtonId.startsWith("tw_audio")) {
                        const bestVideo = videoUrls[0]?.url;
                        if (!bestVideo) { await react("🙅‍♂️"); return reply("No video available for audio extraction."); }
                        const videoBuffer = await gmdBuffer(bestVideo);
                        const audioBuffer = await toAudio(videoBuffer);
                        if (audioBuffer.length > MAX_MEDIA_SIZE) { await sock.sendMessage(from, { document: audioBuffer, fileName: "twitter_audio.mp3", mimetype: "audio/mpeg" }, { quoted: messageData }); }
                        else { await sock.sendMessage(from, { audio: audioBuffer, mimetype: "audio/mpeg" }, { quoted: messageData }); }
                    } else {
                        const index = parseInt(selectedButtonId.split("_")[1]);
                        const videoUrl = videoUrls[index]?.url;
                        if (!videoUrl) { await react("🙅‍♂️"); return reply("Selected quality not available."); }
                        const fileSize = await getFileSize(videoUrl);
                        if (fileSize > MAX_MEDIA_SIZE) { await sock.sendMessage(from, { document: { url: videoUrl }, fileName: `twitter_${videoUrls[index].quality}.mp4`, mimetype: "video/mp4" }, { quoted: messageData }); }
                        else { await sock.sendMessage(from, { video: { url: videoUrl }, mimetype: "video/mp4" }, { quoted: messageData }); }
                    }
                } catch (error) { await react("🙅‍♂️"); await reply("Failed to download."); }
            };
            sock.ev.on("messages.upsert", handleResponse);
            setTimeout(() => sock.ev.off("messages.upsert", handleResponse), 300000);
        } catch (error) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
    }
);

cmd({ pattern: "snack", category: "downloader", react: "🍿", aliases: ["snackdl", "snackvideo"] },
    async (from, sock, conText) => {
        const { q, mek, reply, react, botName, botFooter, gmdBuffer, toAudio, GiftedTechApi, GiftedApiKey } = conText;
        if (!q) { await react("🙅‍♂️"); return reply("Please provide a Snack Video URL"); }
        if (!q.includes("snackvideo.com")) { await react("🙅‍♂️"); return reply("Please provide a valid Snack Video URL"); }
        try {
            await react("🔍");
            const apiUrl = `${GiftedTechApi}/api/download/snackdl?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });
            if (!response.data?.success || !response.data?.result) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
            const { title, media, thumbnail, author, like } = response.data.result;
            if (!media) { await react("🙅‍♂️"); return reply("No video found."); }
            const dateNow = Date.now();
            await sendButtons(sock, from, { title: `${botName} SNACK VIDEO`, text: `🍿 *${title}*\n👤 ${author}\n❤️ ${like}\n\n*Select:*`, footer: botFooter, image: { url: thumbnail }, buttons: [ { id: `sn_video_${dateNow}`, text: "Video 🎥" }, { id: `sn_audio_${dateNow}`, text: "Audio 🎶" } ] });
            const handleResponse = async (event) => {
                const messageData = event?.messages?.[0];
                if (!messageData?.message || messageData.key?.remoteJid !== from) return;
                const selectedButtonId = extractButtonId(messageData.message);
                if (!selectedButtonId || !selectedButtonId.includes(`_${dateNow}`)) return;
                sock.ev.off("messages.upsert", handleResponse);
                await react("⬇️");
                try {
                    if (selectedButtonId.startsWith("sn_video")) {
                        const fileSize = await getFileSize(media);
                        if (fileSize > MAX_MEDIA_SIZE) { await sock.sendMessage(from, { document: { url: media }, fileName: `${title}.mp4`, mimetype: "video/mp4" }, { quoted: messageData }); }
                        else { await sock.sendMessage(from, { video: { url: media }, mimetype: "video/mp4" }, { quoted: messageData }); }
                    } else if (selectedButtonId.startsWith("sn_audio")) {
                        const videoBuffer = await gmdBuffer(media);
                        const audioBuffer = await toAudio(videoBuffer);
                        if (audioBuffer.length > MAX_MEDIA_SIZE) { await sock.sendMessage(from, { document: audioBuffer, fileName: `${title}.mp3`, mimetype: "audio/mpeg" }, { quoted: messageData }); }
                        else { await sock.sendMessage(from, { audio: audioBuffer, mimetype: "audio/mpeg" }, { quoted: messageData }); }
                    }
                } catch (error) { await react("🙅‍♂️"); await reply("Failed to download."); }
            };
            sock.ev.on("messages.upsert", handleResponse);
            setTimeout(() => sock.ev.off("messages.upsert", handleResponse), 300000);
        } catch (error) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
    }
);

cmd({ pattern: "gdrive", category: "downloader", react: "📁", aliases: ["googledrive", "drive", "gdrivedl"] },
    async (from, sock, conText) => {
        const { q, mek, reply, react, gmdBuffer, formatAudio, formatVideo, GiftedTechApi, GiftedApiKey } = conText;
        if (!q) { await react("🙅‍♂️"); return reply("Please provide a Google Drive URL"); }
        if (!q.includes("drive.google.com")) { await react("🙅‍♂️"); return reply("Please provide a valid Google Drive URL"); }
        try {
            await react("⏳");
            const apiUrl = `${GiftedTechApi}/api/download/gdrivedl?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });
            if (!response.data?.success || !response.data?.result) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
            const { name, download_url } = response.data.result;
            if (!download_url) { await react("🙅‍♂️"); return reply("No download URL available."); }
            let mimetype = getMimeFromUrl(name || "");
            let mimeCategory = getMimeCategory(mimetype);
            try {
                const headResponse = await axios.head(download_url, { timeout: 15000 });
                const contentType = headResponse.headers["content-type"];
                if (contentType && !contentType.includes("text/html")) { mimetype = contentType.split(";")[0].trim(); mimeCategory = getMimeCategory(mimetype); }
            } catch (headErr) { if (headErr.response?.status === 404) { await react("🙅‍♂️"); return reply("File not found."); } }
            let fileBuffer;
            try { fileBuffer = await gmdBuffer(download_url); } catch (dlErr) { if (dlErr.response?.status === 404 || dlErr.message?.includes("404")) { await react("🙅‍♂️"); return reply("File not found."); } throw dlErr; }
            const fileSize = fileBuffer.length;
            const sendAsDoc = fileSize > MAX_MEDIA_SIZE || mimeCategory === "document";
            if (mimeCategory === "audio" && !sendAsDoc) { const formattedAudio = await formatAudio(fileBuffer); await sock.sendMessage(from, { audio: formattedAudio, mimetype: "audio/mpeg" }, { quoted: mek }); }
            else if (mimeCategory === "video" && !sendAsDoc) { const formattedVideo = await formatVideo(fileBuffer); await sock.sendMessage(from, { video: formattedVideo, mimetype: "video/mp4", caption: `*${name}*` }, { quoted: mek }); }
            else if (mimeCategory === "image" && !sendAsDoc) { await sock.sendMessage(from, { image: fileBuffer, caption: `*${name}*` }, { quoted: mek }); }
            else { await sock.sendMessage(from, { document: fileBuffer, fileName: name || "gdrive_file", mimetype: mimetype || "application/octet-stream" }, { quoted: mek }); }
        } catch (error) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
    }
);

cmd({ pattern: "mediafire", category: "downloader", react: "🔥", aliases: ["mfire", "mediafiredl", "mfiredl"] },
    async (from, sock, conText) => {
        const { q, mek, reply, react, gmdBuffer, formatAudio, GiftedTechApi, GiftedApiKey } = conText;
        if (!q) { await react("🙅‍♂️"); return reply("Please provide a MediaFire URL"); }
        if (!q.includes("mediafire.com")) { await react("🙅‍♂️"); return reply("Please provide a valid MediaFire URL"); }
        try {
            await react("⏳");
            const apiUrl = `${GiftedTechApi}/api/download/mediafire?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });
            if (!response.data?.success || !response.data?.result) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
            const { fileName, fileSize, fileType, mimeType, downloadUrl } = response.data.result;
            if (!downloadUrl) { await react("🙅‍♂️"); return reply("No download URL available."); }
            const mimetype = mimeType || getMimeFromUrl(downloadUrl);
            const mimeCategory = getMimeCategory(mimetype);
            const sizeMatch = fileSize?.match(/([\d.]+)\s*(KB|MB|GB)/i);
            let sizeBytes = 0;
            if (sizeMatch) {
                const size = parseFloat(sizeMatch[1]);
                const unit = sizeMatch[2].toUpperCase();
                if (unit === "KB") sizeBytes = size * 1024;
                else if (unit === "MB") sizeBytes = size * 1024 * 1024;
                else if (unit === "GB") sizeBytes = size * 1024 * 1024 * 1024;
            }
            const sendAsDoc = sizeBytes > MAX_MEDIA_SIZE || mimeCategory === "document";
            const caption = `*${fileName || "MediaFire File"}*\n\n📦 *Size:* ${fileSize || "Unknown"}\n📄 *Type:* ${fileType || "Unknown"}`;
            if (mimeCategory === "audio" && !sendAsDoc) { const audioBuffer = await gmdBuffer(downloadUrl); const formattedAudio = await formatAudio(audioBuffer); await sock.sendMessage(from, { audio: formattedAudio, mimetype: "audio/mpeg" }, { quoted: mek }); }
            else if (mimeCategory === "video" && !sendAsDoc) { await sock.sendMessage(from, { video: { url: downloadUrl }, mimetype, caption }, { quoted: mek }); }
            else if (mimeCategory === "image" && !sendAsDoc) { await sock.sendMessage(from, { image: { url: downloadUrl }, caption }, { quoted: mek }); }
            else { await sock.sendMessage(from, { document: { url: downloadUrl }, fileName: fileName || "mediafire_file", mimetype, caption }, { quoted: mek }); }
        } catch (error) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
    }
);

cmd({ pattern: "apk", category: "downloader", react: "📱", aliases: ["app", "apkdl", "appdownload"] },
    async (from, sock, conText) => {
        const { q, mek, reply, react, GiftedTechApi, GiftedApiKey } = conText;
        if (!q) { await react("🙅‍♂️"); return reply("Please provide an app name\n\n*Example:* .apk WhatsApp"); }
        try {
            await react("🔍");
            const apiUrl = `${GiftedTechApi}/api/download/apkdl?apikey=${GiftedApiKey}&appName=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });
            if (!response.data?.success || !response.data?.result) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
            const { appname, appicon, developer, mimetype, download_url } = response.data.result;
            if (!download_url) { await react("🙅‍♂️"); return reply("No download URL available for this app."); }
            await sock.sendMessage(from, { image: { url: appicon }, caption: `📱 *${appname || q}*\n👨‍💻 *Developer:* ${developer || "Unknown"}\n\n_Sending APK..._` }, { quoted: mek });
            await sock.sendMessage(from, { document: { url: download_url }, fileName: `${(appname || q).replace(/[^\w\s.-]/gi, "")}.apk`, mimetype: mimetype || "application/vnd.android.package-archive" }, { quoted: mek });
        } catch (error) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
    }
);

cmd({ pattern: "pastebin", category: "downloader", react: "📋", aliases: ["getpaste", "getpastebin", "pastedl", "pastebindl", "paste"] },
    async (from, sock, conText) => {
        const { q, mek, reply, react, botName } = conText;
        if (!q) { await react("🙅‍♂️"); return reply("Please provide a Pastebin URL\n\n*Example:* .pastebin https://pastebin.com/xxxxxx"); }
        if (!q.includes("pastebin.com")) { await react("🙅‍♂️"); return reply("Please provide a valid Pastebin URL"); }
        try {
            await react("⏳");
            const pasteId = q.split("/").pop().split("?")[0];
            const response = await axios.get(`https://pastebin.com/raw/${pasteId}`, { timeout: 15000 });
            let content = response.data;
            const header = `*${botName} PASTEBIN VIEWER*\n*Paste ID:* ${pasteId}\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            const fullMessage = header + content;
            if (fullMessage.length > 65000) { await sock.sendMessage(from, { document: Buffer.from(content, "utf-8"), fileName: `pastebin_${pasteId}.txt`, mimetype: "text/plain", caption: `*Paste ID:* ${pasteId}\n_Content too long, sent as file_` }, { quoted: mek }); }
            else { await sock.sendMessage(from, { text: fullMessage }, { quoted: mek }); }
        } catch (error) { await react("🙅‍♂️"); return reply("An error occurred. Please try again."); }
    }
);

cmd({ pattern: "video2", aliases: ["mp42"], description: "Download YouTube video by name", category: "downloader", react: "🎬" },
    async (from, sock, conText) => {
        const { q, mek, reply, react, formatVideo } = conText;
        if (!q?.trim()) { return reply("Example: .video2 tere nam"); }
        try {
            await react("🔍");
            const search = await yts(q.trim());
            const vid = search.videos?.[0];
            if (!vid) { await react("🙅‍♂️"); return reply("No video found!"); }
            
            await sock.sendMessage(from, { image: { url: vid.thumbnail }, caption: `🎬 *${vid.title}*\n\n👤 *Channel:* ${vid.author.name}\n⏱️ *Duration:* ${vid.timestamp}\n\n_Downloading video..._` }, { quoted: mek });
            
            const downUrl = await getYTMedia(vid.url, "video");
            if (!downUrl) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy."); }
            
            await react("⬇️");
            const res = await axios.get(downUrl, { responseType: 'arraybuffer', timeout: 60000 });
            let buffer = Buffer.from(res.data);
            if (buffer.length < 500 * 1024) throw new Error("API returned corrupted video");
            
            const finalVideo = formatVideo ? await formatVideo(buffer) : buffer;
            
            await sock.sendMessage(from, { video: finalVideo, mimetype: "video/mp4", caption: `> *downloaded 🍉*` }, { quoted: mek });
            await react("✅");
        } catch (err) { console.error(err); await react("🙅‍♂️"); return reply("Unexpected error occurred!"); }
    }
);

cmd({ pattern: "play2", aliases: ["audio2"], description: "Download YouTube audio", category: "downloader", react: "🎶" },
    async (from, sock, conText) => {
        const { q, mek, reply, react, formatAudio } = conText;
        if (!q) { return reply("Example: .play2 pal pal"); }
        try {
            await react("🔍");
            const { videos } = await yts(q);
            const vid = videos?.[0];
            if (!vid) { await react("🙅‍♂️"); return reply("No results found!"); }
            
            await sock.sendMessage(from, { image: { url: vid.thumbnail }, caption: `🎵 *${vid.title}*\n\n👤 *Channel:* ${vid.author.name}\n⏱️ *Duration:* ${vid.timestamp}\n\n_Downloading audio..._` }, { quoted: mek });
            
            const audioUrl = await getYTMedia(vid.url, "audio");
            if (!audioUrl) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy."); }
            
            await react("⬇️");
            const res = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 30000 });
            let buffer = Buffer.from(res.data);
            if (buffer.length < 100 * 1024) throw new Error("API returned corrupted file");
            
            const finalAudio = formatAudio ? await formatAudio(buffer) : buffer;
            
            await sock.sendMessage(from, { audio: finalAudio, mimetype: "audio/mpeg", fileName: `${vid.title}.mp3` }, { quoted: mek });
            await react("✅");
        } catch (e) { console.error(e); await react("🙅‍♂️"); return reply("Error occurred!"); }
    }
);

cmd({ pattern: "song", description: "Download song with preview card", category: "downloader", react: "🎧" },
    async (from, sock, conText) => {
        const { q, mek, reply, react, formatAudio } = conText;
        if (!q) { return reply("Example: .song pal pal"); }
        try {
            await react("🔍");
            const { videos } = await yts(q);
            const vid = videos?.[0];
            if (!vid) { await react("🙅‍♂️"); return reply("No results found!"); }
            
            await sock.sendMessage(from, { image: { url: vid.thumbnail }, caption: `🎵 *${vid.title}*\n\n👤 *Channel:* ${vid.author.name}\n⏱️ *Duration:* ${vid.timestamp}\n👀 *Views:* ${vid.views.toLocaleString()}\n📅 *Uploaded:* ${vid.ago || "Unknown"}\n\n_Downloading audio..._` }, { quoted: mek });
            
            const audioUrl = await getYTMedia(vid.url, "audio");
            if (!audioUrl) { await react("🙅‍♂️"); return reply("🙅‍♂️ All servers are currently busy. Please try again later."); }
            
            await react("⬇️");
            
            let buffer;
            if (audioUrl === "DIRECT_YTDL") {
                // Direct download fallback
                const stream = ytdl(vid.url, { filter: 'audioonly', quality: 'highestaudio' });
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                buffer = Buffer.concat(chunks);
            } else {
                // API download
                const res = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 30000 });
                buffer = Buffer.from(res.data);
            }

            if (buffer.length < 100 * 1024) throw new Error("API returned corrupted file");
            
            const finalAudio = formatAudio ? await formatAudio(buffer) : buffer;
            
            await sock.sendMessage(from, { audio: finalAudio, mimetype: "audio/mpeg", fileName: `${vid.title}.mp3`, contextInfo: { externalAdReply: { title: vid.title, body: "⇆ㅤ ||◁ㅤ❚❚ㅤ▷||ㅤ ↻", mediaType: 2, thumbnailUrl: vid.thumbnail, sourceUrl: vid.url, renderLargerThumbnail: false, showAdAttribution: true } } }, { quoted: mek });
            await react("✅");
        } catch (e) { 
            console.error("Song Command Error:", e); 
            await react("🙅‍♂️"); 
            return reply("Error downloading media. YouTube might be blocking the request."); 
        }
    }
);

cmd({ pattern: "facebook", aliases: ["fbdl", "fb"], react: "📥", description: "Download Facebook videos", category: "downloader" },
    async (from, sock, conText) => {
        const { args, mek, reply, react } = conText;
        const fbUrl = args[0];
        if (!fbUrl || !fbUrl.includes("facebook.com")) { return reply("Example: .fb https://facebook.com/xxxx"); }
        try {
            await react("⏳");            
            const api = `https://jawad-tech.vercel.app/downloader?url=${encodeURIComponent(fbUrl)}`;
            const res = await axios.get(api, { timeout: 30000 });
            const data = res.data;
            if (!data?.status || !Array.isArray(data?.result)) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
            const hd = data.result.find(v => v.quality === "HD");
            const sd = data.result.find(v => v.quality === "SD");
            const video = hd || sd;
            if (!video) { await react("🙅‍♂️"); return reply("No downloadable video found."); }
            await react("⬇️");
            await sock.sendMessage(from, { video: { url: video.url }, caption: `> *downloaded 🤍*` }, { quoted: mek });
            await react("✅");
        } catch (error) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
    }
);

cmd({ pattern: "instagram", aliases: ["insta", "ig"], react: "⬇️", description: "Download Instagram Reels, Videos or Photos", category: "downloader" },
    async (from, sock, conText) => {
        const { q, mek, reply, react } = conText;
        const url = (q || "").trim();
        if (!url || !url.includes("instagram.com")) return reply("Example: .ig https://instagram.com/xxxx");

        // What is really behind this link? Checks the file's first bytes, not the URL text.
        const sniff = async (u) => {
            try {
                const r = await axios.get(u, {
                    responseType: "stream", timeout: 20000, maxRedirects: 5,
                    headers: { "User-Agent": "Mozilla/5.0", Range: "bytes=0-63" },
                    validateStatus: (s) => s < 400,
                });
                const ct = String(r.headers?.["content-type"] || "").toLowerCase();
                const b = await new Promise((resolve, reject) => {
                    const bufs = []; let n = 0;
                    r.data.on("data", (c) => { bufs.push(c); n += c.length; if (n >= 64) { r.data.destroy(); resolve(Buffer.concat(bufs)); } });
                    r.data.on("end", () => resolve(Buffer.concat(bufs)));
                    r.data.on("close", () => resolve(Buffer.concat(bufs)));
                    r.data.on("error", (e) => (n ? resolve(Buffer.concat(bufs)) : reject(e)));
                });
                if (b.length >= 8 && b.toString("latin1", 4, 8) === "ftyp") return "video";
                if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video";
                if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image";
                if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image";
                if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image";
                if (b.toString("latin1", 0, 3) === "GIF") return "image";
                if (ct.startsWith("video/")) return "video";
                if (ct.startsWith("image/")) return "image";
                return null; // html / json / error page - not media
            } catch (e) { return null; }
        };

        const sources = [
            // 1) the API this command always used (labels each file as video/image)
            async () => {
                const r = await axios.get(`https://btch-downloader-api-green.vercel.app/api/download/instagram?url=${encodeURIComponent(url)}`, { timeout: 30000 });
                const media = r.data?.normalized?.media;
                if (!r.data?.success || !Array.isArray(media)) return [];
                return media.filter((m) => m && m.url).map((m) => ({ url: m.url, type: (m.type === "video" || String(m.url).includes(".mp4")) ? "video" : "image", known: true }));
            },
            // 2) btch-downloader library: { status, result: [{ url, thumbnail }] }
            async () => {
                const { igdl } = require("btch-downloader");
                const r = await igdl(url);
                return (r && r.status !== false && Array.isArray(r.result) ? r.result : []).filter((m) => m && m.url).map((m) => ({ url: m.url }));
            },
            // 3) Siputzx
            async () => {
                const r = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`, { timeout: 60000 });
                return (r.data?.status && Array.isArray(r.data.data) ? r.data.data : []).filter((m) => m && m.url).map((m) => ({ url: m.url, type: m.type === "video" ? "video" : undefined }));
            },
        ];

        try {
            await react("⏳");
            let sent = 0;
            for (const getItems of sources) {
                let items = [];
                try { items = await getItems(); } catch (e) { console.error("[IG DOWNLOADER] source failed:", e.message); continue; }
                const seen = new Set();
                items = items.filter((i) => !seen.has(i.url) && seen.add(i.url)).slice(0, 10);
                for (const item of items) {
                    try {
                        const type = item.known ? item.type : await sniff(item.url);
                        if (!type) { console.error("[IG DOWNLOADER] not a media file, skipped:", item.url.slice(0, 80)); continue; }
                        await sock.sendMessage(from, {
                            [type]: { url: item.url },
                            caption: "> *Downloaded by PRIMETECH*"
                        }, { quoted: mek });
                        sent++;
                    } catch (e) { console.error("[IG DOWNLOADER] send failed:", e.message); }
                }
                if (sent > 0) break; // this source worked - no need to try the others
            }
            if (sent === 0) throw new Error("No media could be sent");
            await react("✅");
        } catch (e) {
            console.error("[IG DOWNLOADER]", e.message);
            await react("🙅‍♂️");
            await reply("❌ Failed to download Instagram media. The link might be private or invalid, or the media servers are busy - try again in a moment.");
        }
    });

cmd({ pattern: "tiktok", aliases: ["tt"], description: "Download TikTok video", category: "downloader", react: "🎵" },
    async (from, sock, conText) => {
        const { q, mek, reply, react } = conText;
        if (!q) { return reply("Example: .tt https://vt.tiktok.com/xxxx"); }
        try {
            await react("⏳");
            const api = `https://tikwm.com/api/?url=${encodeURIComponent(q)}`;
            const res = await axios.get(api, { timeout: 30000 });
            if (res.data?.code !== 0 || !res.data?.data?.play) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
            await react("⬇️");
            await sock.sendMessage(from, { video: { url: res.data.data.play }, mimetype: "video/mp4", caption: `> *downloaded 🤍*` }, { quoted: mek });
            await react("✅");
        } catch (e) { await react("🙅‍♂️"); return reply("🙅‍♂️ Media servers are currently busy. Please try again later."); }
    }
);
