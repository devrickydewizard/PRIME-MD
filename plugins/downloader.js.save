const {
    cmd,
    gitRepoRegex,
    MAX_MEDIA_SIZE,
    getFileSize,
    getMimeCategory,
    getMimeFromUrl,
} = require("../lib"),
    GIFTED_DLS = require("gifted-dls"),
    giftedDls = new GIFTED_DLS(),
    axios = require("axios"),
    { sendButtons } = require("gifted-btns");
const yts = require('yt-search');

function extractButtonId(msg) {
    if (!msg) return null;
    if (msg.templateButtonReplyMessage?.selectedId)
        return msg.templateButtonReplyMessage.selectedId;
    if (msg.buttonsResponseMessage?.selectedButtonId)
        return msg.buttonsResponseMessage.selectedButtonId;
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId)
        return msg.listResponseMessage.singleSelectReply.selectedRowId;
    if (msg.interactiveResponseMessage) {
        const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage;
        if (nf?.paramsJson) {
            try { const p = JSON.parse(nf.paramsJson); if (p.id) return p.id; } catch {}
        }
        return msg.interactiveResponseMessage.buttonId || null;
    }
    return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GITCLONE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
{
    pattern: "gitclone",
    category: "downloader",
    react: "📦",
    aliases: ["gitdl", "github", "git", "repodl", "clone"],
    description: "Download GitHub repository as zip file",
},
async (from, sock, conText) => {
    const {
        q,
        mek,
        reply,
        react,
        botName,
    } = conText;

    if (!q) {
        await react("🙅‍♂️");
        return reply(
            "Please provide a GitHub repository link.\n\n" +
            "*Example:*\n" +
            ".gitclone https://github.com/user/repo"
        );
    }

    if (!gitRepoRegex.test(q)) {
        await react("🙅‍♂️");
        return reply("Invalid GitHub repository URL.");
    }

    try {
        await react("⏳");

        let [, user, repo] = q.match(gitRepoRegex) || [];

        repo = repo
            .replace(/\.git$/, "")
            .split("/")[0];

        const apiUrl = `https://api.github.com/repos/${user}/${repo}`;

        const { data } = await axios.get(apiUrl, {
            timeout: 30000,
            headers: {
                "User-Agent": botName || "GitClone",
            },
        });

        if (!data) {
            await react("🙅‍♂️");
            return reply("Repository not found.");
        }

        const {
            full_name,
            stargazers_count,
            forks_count,
            language,
            size,
            default_branch,
            created_at,
            owner,
        } = data;

        const zipUrl =
            `https://github.com/${user}/${repo}` +
            `/archive/refs/heads/${default_branch}.zip`;

        const fileName =
            `${repo}-${default_branch}.zip`;

        const caption =
            `📦 *GITHUB REPOSITORY*\n\n` +
            `📁 *Name:* ${full_name}\n` +
            `👤 *Owner:* ${owner?.login || user}\n` +
            `⭐ *Stars:* ${stargazers_count}\n` +
            `🍴 *Forks:* ${forks_count}\n` +
            `💻 *Language:* ${language || "Unknown"}\n` +
            `📦 *Size:* ${size} KB\n` +
            `🌿 *Branch:* ${default_branch}\n` +
            `📅 *Created:* ${new Date(created_at).toDateString()}\n`;

        await sock.sendMessage(
            from,
            {
                document: { url: zipUrl },
                fileName,
                mimetype: "application/zip",
                caption,
            },
            { quoted: mek }
        );

    } catch (error) {
        console.error(
            "[GITCLONE ERROR]",
            error?.response?.data || error
        );

        await react("🙅‍♂️");

        if (error?.response?.status === 404) {
            return reply(
                "Repository not found or private repository."
            );
        }

        if (error?.response?.status === 403) {
            return reply(
                "GitHub API rate limit exceeded. Try again later."
            );
        }

        return reply(
            `Failed to download repository.\n\n${error.message}`
        );
    }
},
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TWITTER / X
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "twitter",
        category: "downloader",
        react: "🐦",
        aliases: ["twitterdl", "xdl", "xdownloader", "twitterdownloader", "x"],
        description: "Download Twitter/X videos",
    },
    async (from, sock, conText) => {
        const {
            q, mek, reply, react, botName, botFooter,
            gmdBuffer, toAudio, formatAudio,
            GiftedTechApi, GiftedApiKey,
        } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply("Please provide a Twitter/X URL");
        }

        if (!q.includes("twitter.com") && !q.includes("x.com")) {
            await react("🙅‍♂️");
            return reply("Please provide a valid Twitter/X URL");
        }

        try {
            await react("🔍");
            const apiUrl = `${GiftedTechApi}/api/download/twitter?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });

            if (!response.data?.success || !response.data?.result) {
                await react("🙅‍♂️");
                return reply("Failed to fetch video. Please check the URL and try again.");
            }

            const { thumbnail, videoUrls } = response.data.result;

            if (!videoUrls || videoUrls.length === 0) {
                await react("🙅‍♂️");
                return reply("No video found in this tweet.");
            }

            const dateNow = Date.now();
            const buttons = videoUrls.map((v, index) => ({
                id: `tw_${index}_${dateNow}`,
                text: `${v.quality} Quality 🎥`,
            }));
            buttons.push({ id: `tw_audio_${dateNow}`, text: "Audio Only 🎶" });

            await sendButtons(sock, from, {
                title: `${botName} TWITTER DOWNLOADER`,
                text: `🐦 *Twitter Video*\n\n*Available qualities:* ${videoUrls.map(v => v.quality).join(", ")}\n\n*Select download type:*`,
                footer: botFooter,
                image: { url: thumbnail },
                buttons,
            });

            const handleResponse = async (event) => {
                const messages = event?.messages;
                if (!messages?.length) return;
                const messageData = messages[0];
                if (!messageData?.message) return;
                if (messageData.key?.remoteJid !== from) return;

                const selectedButtonId = extractButtonId(messageData.message);
                if (!selectedButtonId) return;
                if (!selectedButtonId.includes(`_${dateNow}`)) return;

                sock.ev.off("messages.upsert", handleResponse);
                await react("⬇️");

                try {
                    if (selectedButtonId.startsWith("tw_audio")) {
                        const bestVideo = videoUrls[0]?.url;
                        if (!bestVideo) {
                            await react("🙅‍♂️");
                            return reply("No video available for audio extraction.");
                        }
                        const videoBuffer = await gmdBuffer(bestVideo);
                        const audioBuffer = await toAudio(videoBuffer);
                        if (audioBuffer.length > MAX_MEDIA_SIZE) {
                            await sock.sendMessage(from, {
                                document: audioBuffer,
                                fileName: "twitter_audio.mp3",
                                mimetype: "audio/mpeg",
                            }, { quoted: messageData });
                        } else {
                            await sock.sendMessage(from, {
                                audio: audioBuffer,
                                mimetype: "audio/mpeg",
                            }, { quoted: messageData });
                        }
                    } else {
                        const index = parseInt(selectedButtonId.split("_")[1]);
                        const videoUrl = videoUrls[index]?.url;
                        if (!videoUrl) {
                            await react("🙅‍♂️");
                            return reply("Selected quality not available.");
                        }
                        const fileSize = await getFileSize(videoUrl);
                        if (fileSize > MAX_MEDIA_SIZE) {
                            await sock.sendMessage(from, {
                                document: { url: videoUrl },
                                fileName: `twitter_video_${videoUrls[index].quality}.mp4`,
                                mimetype: "video/mp4",
                            }, { quoted: messageData });
                        } else {
                            await sock.sendMessage(from, {
                                video: { url: videoUrl },
                                mimetype: "video/mp4",
                            }, { quoted: messageData });
                        }
                    }

                } catch (error) {
                    console.error("Twitter download error:", error);
                    await react("🙅‍♂️");
                    await reply("Failed to download. Please try again.");
                }
            };

            sock.ev.on("messages.upsert", handleResponse);
            setTimeout(() => sock.ev.off("messages.upsert", handleResponse), 300000);
        } catch (error) {
            console.error("Twitter API error:", error);
            await react("🙅‍♂️");
            return reply("An error occurred. Please try again.");
        }
    },
);
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SNACK VIDEO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "snack",
        category: "downloader",
        react: "🍿",
        aliases: ["snackdl", "snackvideo"],
        description: "Download Snack Video",
    },
    async (from, sock, conText) => {
        const {
            q, mek, reply, react, botName, botFooter,
            gmdBuffer, toAudio, formatAudio,
            GiftedTechApi, GiftedApiKey,
        } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply("Please provide a Snack Video URL");
        }

        if (!q.includes("snackvideo.com")) {
            await react("🙅‍♂️");
            return reply("Please provide a valid Snack Video URL");
        }

        try {
            await react("🔍");
            const apiUrl = `${GiftedTechApi}/api/download/snackdl?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });

            if (!response.data?.success || !response.data?.result) {
                await react("🙅‍♂️");
                return reply("Failed to fetch video. Please check the URL and try again.");
            }

            const { title, media, thumbnail, author, like } = response.data.result;

            if (!media) {
                await react("🙅‍♂️");
                return reply("No video found.");
            }

            const dateNow = Date.now();

            await sendButtons(sock, from, {
                title: `${botName} SNACK VIDEO`,
                text: `🍿 *${title || "Snack Video"}*\n👤 *Author:* ${author || "Unknown"}\n❤️ *Likes:* ${like || "0"}\n\n*Select download type:*`,
                footer: botFooter,
                image: { url: thumbnail },
                buttons: [
                    { id: `sn_video_${dateNow}`, text: "Video 🎥" },
                    { id: `sn_audio_${dateNow}`, text: "Audio Only 🎶" },
                ],
            });

            const handleResponse = async (event) => {
                const messages = event?.messages;
                if (!messages?.length) return;
                const messageData = messages[0];
                if (!messageData?.message) return;
                if (messageData.key?.remoteJid !== from) return;

                const selectedButtonId = extractButtonId(messageData.message);
                if (!selectedButtonId) return;
                if (!selectedButtonId.includes(`_${dateNow}`)) return;

                sock.ev.off("messages.upsert", handleResponse);
                await react("⬇️");

                try {
                    if (selectedButtonId.startsWith("sn_video")) {
                        const fileSize = await getFileSize(media);
                        if (fileSize > MAX_MEDIA_SIZE) {
                            await sock.sendMessage(from, {
                                document: { url: media },
                                fileName: `${(title || "snack_video").replace(/[^\w\s.-]/gi, "")}.mp4`,
                                mimetype: "video/mp4",
                                caption: `*${title || "Snack Video"}*`,
                            }, { quoted: messageData });
                        } else {
                            await sock.sendMessage(from, {
                                video: { url: media },
                                mimetype: "video/mp4",
                                caption: `*${title || "Snack Video"}*`,
                            }, { quoted: messageData });
                        }
                    } else if (selectedButtonId.startsWith("sn_audio")) {
                        const videoBuffer = await gmdBuffer(media);
                        const audioBuffer = await toAudio(videoBuffer);
                        if (audioBuffer.length > MAX_MEDIA_SIZE) {
                            await sock.sendMessage(from, {
                                document: audioBuffer,
                                fileName: `${(title || "snack_audio").replace(/[^\w\s.-]/gi, "")}.mp3`,
                                mimetype: "audio/mpeg",
                            }, { quoted: messageData });
                        } else {
                            await sock.sendMessage(from, {
                                audio: audioBuffer,
                                mimetype: "audio/mpeg",
                            }, { quoted: messageData });
                        }
                    }

                } catch (error) {
                    console.error("Snack Video download error:", error);
                    await react("🙅‍♂️");
                    await reply("Failed to download. Please try again.");
                }
            };

            sock.ev.on("messages.upsert", handleResponse);
            setTimeout(() => sock.ev.off("messages.upsert", handleResponse), 300000);
        } catch (error) {
            console.error("Snack Video API error:", error);
            await react("🙅‍♂️");
            return reply("An error occurred. Please try again.");
        }
    },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SPOTIFY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// (removed duplicate "spotify" command)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GOOGLE DRIVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "gdrive",
        category: "downloader",
        react: "📁",
        aliases: ["googledrive", "drive", "gdrivedl"],
        description: "Download from Google Drive",
    },
    async (from, sock, conText) => {
        const {
            q, mek, reply, react, botName,
            gmdBuffer, formatAudio, formatVideo,
            GiftedTechApi, GiftedApiKey,
        } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply("Please provide a Google Drive URL");
        }

        if (!q.includes("drive.google.com")) {
            await react("🙅‍♂️");
            return reply("Please provide a valid Google Drive URL");
        }

        try {
            await react("⏳");
            const apiUrl = `${GiftedTechApi}/api/download/gdrivedl?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });

            if (!response.data?.success || !response.data?.result) {
                await react("🙅‍♂️");
                return reply("Failed to fetch file. Please check the URL and ensure the file is publicly accessible.");
            }

            const { name, download_url } = response.data.result;
            if (!download_url) {
                await react("🙅‍♂️");
                return reply("No download URL available.");
            }

            let mimetype = getMimeFromUrl(name || "");
            let mimeCategory = getMimeCategory(mimetype);

            try {
                const headResponse = await axios.head(download_url, { timeout: 15000 });
                const contentType = headResponse.headers["content-type"];
                if (contentType && !contentType.includes("text/html")) {
                    mimetype = contentType.split(";")[0].trim();
                    mimeCategory = getMimeCategory(mimetype);
                }
            } catch (headErr) {
                if (headErr.response?.status === 404) {
                    await react("🙅‍♂️");
                    return reply("File not found. The file may have been deleted or is not publicly accessible.");
                }
            }

            let fileBuffer;
            try {
                fileBuffer = await gmdBuffer(download_url);
            } catch (dlErr) {
                if (dlErr.response?.status === 404 || dlErr.message?.includes("404")) {
                    await react("🙅‍♂️");
                    return reply("File not found. The file may have been deleted or is not publicly accessible.");
                }
                throw dlErr;
            }

            const fileSize = fileBuffer.length;
            const sendAsDoc = fileSize > MAX_MEDIA_SIZE || mimeCategory === "document";

            if (mimeCategory === "audio" && !sendAsDoc) {
                const formattedAudio = await formatAudio(fileBuffer);
                await sock.sendMessage(from, {
                    audio: formattedAudio,
                    mimetype: "audio/mpeg",
                }, { quoted: mek });
            } else if (mimeCategory === "video" && !sendAsDoc) {
                const formattedVideo = await formatVideo(fileBuffer);
                await sock.sendMessage(from, {
                    video: formattedVideo,
                    mimetype: "video/mp4",
                    caption: `*${name || "Google Drive File"}*`,
                }, { quoted: mek });
            } else if (mimeCategory === "image" && !sendAsDoc) {
                await sock.sendMessage(from, {
                    image: fileBuffer,
                    caption: `*${name || "Google Drive File"}*`,
                }, { quoted: mek });
            } else {
                await sock.sendMessage(from, {
                    document: fileBuffer,
                    fileName: name || "gdrive_file",
                    mimetype: mimetype || "application/octet-stream",
                }, { quoted: mek });
            }

        } catch (error) {
            console.error("Google Drive API error:", error);
            await react("🙅‍♂️");
            if (error.response?.status === 404 || error.message?.includes("404")) {
                return reply("File not found. The file may have been deleted or is not publicly accessible.");
            }
            return reply("An error occurred. Please try again.");
        }
    },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIAFIRE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "mediafire",
        category: "downloader",
        react: "🔥",
        aliases: ["mfire", "mediafiredl", "mfiredl"],
        description: "Download from MediaFire",
    },
    async (from, sock, conText) => {
        const {
            q, mek, reply, react, botName,
            gmdBuffer, formatAudio,
            GiftedTechApi, GiftedApiKey,
        } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply("Please provide a MediaFire URL");
        }

        if (!q.includes("mediafire.com")) {
            await react("🙅‍♂️");
            return reply("Please provide a valid MediaFire URL");
        }

        try {
            await react("⏳");
            const apiUrl = `${GiftedTechApi}/api/download/mediafire?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });

            if (!response.data?.success || !response.data?.result) {
                await react("🙅‍♂️");
                return reply("Failed to fetch file. Please check the URL and try again.");
            }

            const { fileName, fileSize, fileType, mimeType, downloadUrl } = response.data.result;
            if (!downloadUrl) {
                await react("🙅‍♂️");
                return reply("No download URL available.");
            }

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
            const caption =
                `*${fileName || "MediaFire File"}*\n\n` +
                `📦 *Size:* ${fileSize || "Unknown"}\n` +
                `📄 *Type:* ${fileType || "Unknown"}`;

            if (mimeCategory === "audio" && !sendAsDoc) {
                const audioBuffer = await gmdBuffer(downloadUrl);
                const formattedAudio = await formatAudio(audioBuffer);
                await sock.sendMessage(from, {
                    audio: formattedAudio,
                    mimetype: "audio/mpeg",
                }, { quoted: mek });
            } else if (mimeCategory === "video" && !sendAsDoc) {
                await sock.sendMessage(from, {
                    video: { url: downloadUrl },
                    mimetype,
                    caption,
                }, { quoted: mek });
            } else if (mimeCategory === "image" && !sendAsDoc) {
                await sock.sendMessage(from, {
                    image: { url: downloadUrl },
                    caption,
                }, { quoted: mek });
            } else {
                await sock.sendMessage(from, {
                    document: { url: downloadUrl },
                    fileName: fileName || "mediafire_file",
                    mimetype,
                    caption,
                }, { quoted: mek });
            }

        } catch (error) {
            console.error("MediaFire API error:", error);
            await react("🙅‍♂️");
            return reply("An error occurred. Please try again.");
        }
    },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  APK DOWNLOAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "apk",
        category: "downloader",
        react: "📱",
        aliases: ["app", "apkdl", "appdownload"],
        description: "Download Android APK files",
    },
    async (from, sock, conText) => {
        const {
            q, mek, reply, react, botName,
            GiftedTechApi, GiftedApiKey,
        } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply("Please provide an app name\n\n*Example:* .apk WhatsApp");
        }

        try {
            await react("🔍");
            const apiUrl = `${GiftedTechApi}/api/download/apkdl?apikey=${GiftedApiKey}&appName=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });

            if (!response.data?.success || !response.data?.result) {
                await react("🙅‍♂️");
                return reply("App not found. Please try a different name.");
            }

            const { appname, appicon, developer, mimetype, download_url } = response.data.result;
            if (!download_url) {
                await react("🙅‍♂️");
                return reply("No download URL available for this app.");
            }

            await sock.sendMessage(from, {
                image: { url: appicon },
                caption:
                    `📱 *${appname || q}*\n` +
                    `👨‍💻 *Developer:* ${developer || "Unknown"}\n\n` +
                    `_Sending APK file..._`,
            }, { quoted: mek });

            await sock.sendMessage(from, {
                document: { url: download_url },
                fileName: `${(appname || q).replace(/[^\w\s.-]/gi, "")}.apk`,
                mimetype: mimetype || "application/vnd.android.package-archive",
            }, { quoted: mek });

        } catch (error) {
            console.error("APK download error:", error);
            await react("🙅‍♂️");
            return reply("An error occurred. Please try again.");
        }
    },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PASTEBIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "pastebin",
        category: "downloader",
        react: "📋",
        aliases: ["getpaste", "getpastebin", "pastedl", "pastebindl", "paste"],
        description: "Fetch content from Pastebin",
    },
    async (from, sock, conText) => {
        const {
            q, mek, reply, react, botName, botFooter,
            GiftedTechApi, GiftedApiKey,
        } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply("Please provide a Pastebin URL\n\n*Example:* .pastebin https://pastebin.com/xxxxxx");
        }

        if (!q.includes("pastebin.com")) {
            await react("🙅‍♂️");
            return reply("Please provide a valid Pastebin URL");
        }

        try {
            await react("⏳");
            const apiUrl = `${GiftedTechApi}/api/download/pastebin?apikey=${GiftedApiKey}&url=${encodeURIComponent(q)}`;
            const response = await axios.get(apiUrl, { timeout: 30000 });

            if (!response.data?.success || !response.data?.result) {
                await react("🙅‍♂️");
                return reply("Failed to fetch paste. Please check the URL and try again.");
            }

            let content = response.data.result;
            content = content.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
            content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

            const pasteId = q.split("/").pop().split("?")[0];
            const header = `*${botName} PASTEBIN VIEWER*\n*Paste ID:* ${pasteId}\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            const fullMessage = header + content;

            if (fullMessage.length > 65000) {
                const textBuffer = Buffer.from(content, "utf-8");
                await sock.sendMessage(from, {
                    document: textBuffer,
                    fileName: `pastebin_${pasteId}.txt`,
                    mimetype: "text/plain",
                    caption: `*Paste ID:* ${pasteId}\n_Content too long, sent as file_`,
                }, { quoted: mek });
            } else {
                await sock.sendMessage(from, { text: fullMessage }, { quoted: mek });
            }

        } catch (error) {
            console.error("Pastebin API error:", error);
            await react("🙅‍♂️");
            return reply("An error occurred. Please try again.");
        }
    },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AXIOS INSTANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const axiosInstance = axios.create({
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
    },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DOWNLOAD APIS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getJerryVideoDownload(url) {
    try {
        const api = `https://jerrycoder.oggyapi.workers.dev/api/ytmp4?url=${encodeURIComponent(url)}`;
        const res = await axiosInstance.get(api);
        if (res.data?.status === "success" && res.data?.downloadurl) return res.data.downloadurl;
        return null;
    } catch (e) {
        console.log("Jerry Video API Error:", e.message);
        return null;
    }
}

async function getJawadDownload(url) {
    try {
        const api = `https://jawad-tech.vercel.app/download/ytdl?url=${encodeURIComponent(url)}`;
        const res = await axiosInstance.get(api);
        if (res.data?.status && res.data?.result?.mp4) return res.data.result.mp4;
        return null;
    } catch (e) {
        console.log("Jawad API Error:", e.message);
        return null;
    }
}

async function getJerryAudioDownload(url) {
    try {
        const res = await axiosInstance.get(
            `https://jerrycoder.oggyapi.workers.dev/ytmp3?url=${encodeURIComponent(url)}`
        );
        if (res.data?.status === "success" && res.data?.url) return res.data;
        return null;
    } catch (e) {
        console.log("Jerry Audio API Error:", e.message);
        return null;
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  VIDEO DOWNLOAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "video2",
        aliases: ["mp42"],
        description: "Download YouTube video by name",
        category: "downloader",
        react: "🎬",
    },
    async (from, sock, conText) => {
        const { q, mek, reply, react } = conText;

        if (!q?.trim()) {
            return reply("Example: .video2 tere nam");
        }

        try {
            await react("🔍");
            const search = await yts(q.trim());
            const vid = search.videos?.[0];
            if (!vid) {
                await react("🙅‍♂️");
                return reply("No video found!");
            }

            await sock.sendMessage(from, {
                image: { url: vid.thumbnail },
                caption:
                    `🎬 *${vid.title}*\n\n` +
                    `👤 *Channel:* ${vid.author.name}\n` +
                    `⏱️ *Duration:* ${vid.timestamp}\n` +
                    `👀 *Views:* ${vid.views.toLocaleString()}\n` +
                    `📅 *Uploaded:* ${vid.ago || "Unknown"}\n\n` +
                    `_Downloading video..._`,
            }, { quoted: mek });

            let downUrl = await getJerryVideoDownload(vid.url);
            if (!downUrl) {
                console.log("Jerry failed → switching to Jawad...");
                downUrl = await getJawadDownload(vid.url);
            }

            if (!downUrl) {
                await react("🙅‍♂️");
                return reply("All servers failed. Please try again later!");
            }

            await react("⬇️");
            await sock.sendMessage(from, {
                video: { url: downUrl },
                mimetype: "video/mp4",
                caption: `> *downloaded 🍉*`,
            }, { quoted: mek });

            await react("✅");
        } catch (err) {
            console.log("Video CMD Error:", err);
            await react("🙅‍♂️");
            return reply("Unexpected error occurred!");
        }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AUDIO DOWNLOAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "play2",
        aliases: ["audio2"],
        description: "Download YouTube audio",
        category: "downloader",
        react: "🎶",
    },
    async (from, sock, conText) => {
        const { q, mek, reply, react } = conText;

        if (!q) {
            return reply("Example: .play2 pal pal");
        }

        try {
            await react("🔍");
            const { videos } = await yts(q);
            const vid = videos?.[0];
            if (!vid) {
                await react("🙅‍♂️");
                return reply("No results found!");
            }

            await sock.sendMessage(from, {
                image: { url: vid.thumbnail },
                caption:
                    `🎵 *${vid.title}*\n\n` +
                    `👤 *Channel:* ${vid.author.name}\n` +
                    `⏱️ *Duration:* ${vid.timestamp}\n` +
                    `👀 *Views:* ${vid.views.toLocaleString()}\n` +
                    `📅 *Uploaded:* ${vid.ago || "Unknown"}\n\n` +
                    `_Downloading audio..._`,
            }, { quoted: mek });

            const audioData = await getJerryAudioDownload(vid.url);
            if (!audioData) {
                await react("🙅‍♂️");
                return reply("Song download failed!");
            }

            await react("⬇️");
            await sock.sendMessage(from, {
                audio: { url: audioData.url },
                mimetype: "audio/mpeg",
                fileName: `${audioData.title || vid.title}.mp3`,
            }, { quoted: mek });

            await react("✅");
        } catch (e) {
            console.log("Audio CMD Error:", e);
            await react("🙅‍♂️");
            return reply("Error occurred!");
        }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SONG (with preview card)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "song",
        description: "Download song with preview card",
        category: "downloader",
        react: "🎧",
    },
    async (from, sock, conText) => {
        const { q, mek, reply, react } = conText;

        if (!q) {
            return reply("Example: .song pal pal");
        }

        try {
            await react("🔍");
            const { videos } = await yts(q);
            const vid = videos?.[0];
            if (!vid) {
                await react("🙅‍♂️");
                return reply("No results found!");
            }

            await sock.sendMessage(from, {
                image: { url: vid.thumbnail },
                caption:
                    `🎵 *${vid.title}*\n\n` +
                    `👤 *Channel:* ${vid.author.name}\n` +
                    `⏱️ *Duration:* ${vid.timestamp}\n` +
                    `👀 *Views:* ${vid.views.toLocaleString()}\n` +
                    `📅 *Uploaded:* ${vid.ago || "Unknown"}\n\n` +
                    `_Downloading audio..._`,
            }, { quoted: mek });

            const audioData = await getJerryAudioDownload(vid.url);
            if (!audioData) {
                await react("🙅‍♂️");
                return reply("Failed to fetch audio!");
            }

            await react("⬇️");
            await sock.sendMessage(from, {
                audio: { url: audioData.url },
                mimetype: "audio/mpeg",
                fileName: `${vid.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: vid.title,
                        body: "⇆ㅤ ||◁ㅤ❚❚ㅤ▷||ㅤ ↻",
                        mediaType: 2,
                        thumbnailUrl: vid.thumbnail,
                        sourceUrl: vid.url,
                        renderLargerThumbnail: false,
                        showAdAttribution: true,
                    },
                },
            }, { quoted: mek });

            await react("✅");
        } catch (e) {
            console.log("Song CMD Error:", e);
            await react("🙅‍♂️");
            return reply("Error occurred!");
        }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FACEBOOK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "facebook",
        aliases: ["fbdl", "fb"],
        react: "📥",
        description: "Download Facebook videos",
        category: "downloader",
    },
    async (from, sock, conText) => {
        const { args, mek, reply, react } = conText;

        const fbUrl = args[0];
        if (!fbUrl || !fbUrl.includes("facebook.com")) {
            return reply("Example: .fb https://facebook.com/xxxx");
        }

        try {
            await react("⏳");            
            const api = `https://jawad-tech.vercel.app/downloader?url=${encodeURIComponent(fbUrl)}`;
            const res = await axios.get(api, { timeout: 30000 });
            const data = res.data;

            if (!data?.status || !Array.isArray(data?.result)) {
                await react("🙅‍♂️");
                return reply("Failed to fetch video from API.");
            }

            const hd = data.result.find(v => v.quality === "HD");
            const sd = data.result.find(v => v.quality === "SD");
            const video = hd || sd;

            if (!video) {
                await react("🙅‍♂️");
                return reply("No downloadable video found.");
            }

            await react("⬇️");
            await reply("Downloading...");
            await sock.sendMessage(from, {
                video: { url: video.url },
                caption: `> *downloaded 🤍*`,
            }, { quoted: mek });

            await react("✅");
        } catch (error) {
            console.error("FB Error:", error.message);
            await react("🙅‍♂️");
            return reply("Unable to download video. Try again later!");
        }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INSTAGRAM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "instagram",
        aliases: ["insta", "ig"],
        react: "⬇️",
        description: "Download Instagram Reels, Videos or Photos",
        category: "downloader",
    },
    async (from, sock, conText) => {
        const { q, mek, reply, react } = conText;

        const url = q;
        if (!url || !url.includes("instagram.com")) {
            return reply("Example: .ig https://instagram.com/xxxx");
        }

        try {
            await react("⏳");
            const api = `https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(url)}`;
            const res = await axios.get(api, { timeout: 30000 });

            if (!res.data?.status || !res.data?.data?.length) {
                await react("🙅‍♂️");
                return reply("No media found or private post.");
            }

            await react("⬇️");
            await reply("Downloading...");
            for (const item of res.data.data) {
                await sock.sendMessage(from, {
                    [item.type === "video" ? "video" : "image"]: { url: item.url },
                    caption: `> *downloaded 🤍*`,
                }, { quoted: mek });
            }

            await react("✅");
        } catch (e) {
            console.error("IGDL Error:", e.message);
            await react("🙅‍♂️");
            return reply("Failed to download. Please try again!");
        }
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TIKTOK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "tiktok",
        aliases: ["tt"],
        description: "Download TikTok video",
        category: "downloader",
        react: "🎵",
    },
    async (from, sock, conText) => {
        const { q, mek, reply, react } = conText;

        if (!q) {
            return reply("Example: .tt https://vt.tiktok.com/xxxx");
        }

        try {
            await react("⏳");
            const api = `https://jawad-tech.vercel.app/download/tiktok?url=${encodeURIComponent(q)}`;
            const res = await axios.get(api);
            const json = res.data;

            if (!json?.status || !json?.result) {
                await react("🙅‍♂️");
                return reply("Download failed! Try again later.");
            }

            await react("⬇️");
            await reply("Downloading...");
            await sock.sendMessage(from, {
                video: { url: json.result },
                mimetype: "video/mp4",
                caption: `> *downloaded 🤍*`,
            }, { quoted: mek });

            await react("✅");
        } catch (e) {
            console.error("TikTok Error:", e);
            await react("🙅‍♂️");
            return reply("Error occurred while downloading TikTok video!");
        }
    }
);
