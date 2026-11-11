const {
    cmd,
    MAX_MEDIA_SIZE,
} = require("../lib");

const axios = require("axios");
const https = require("https");


const agent = new https.Agent({
    rejectUnauthorized: true,
    maxVersion: "TLSv1.3",
    minVersion: "TLSv1.2",
});

async function getPinCookies() {
    try {
        const response = await axios.get("https://www.pinterest.com/csrf_error/", { httpsAgent: agent });
        const setCookieHeaders = response.headers["set-cookie"];
        if (setCookieHeaders) {
            return setCookieHeaders.map(c => c.split(";")[0].trim()).join("; ");
        }
        return null;
    } catch {
        return null;
    }
}

async function pinterestSearch(query) {
    try {
        const cookies = await getPinCookies();
        if (!cookies) return [];

        const url = "https://www.pinterest.com/resource/BaseSearchResource/get/";
        const params = {
            source_url: `/search/pins/?q=${query}`,
            data: JSON.stringify({
                options: {
                    isPrefetch: false,
                    query,
                    scope: "pins",
                    no_fetch_context_on_resource: false,
                },
                context: {},
            }),
            _: Date.now(),
        };

        const headers = {
            "accept": "application/json, text/javascript, */*, q=0.01",
            "accept-language": "en-US,en;q=0.9",
            "cookie": cookies,
            "dnt": "1",
            "referer": "https://www.pinterest.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
            "x-app-version": "c056fb7",
            "x-pinterest-appstate": "active",
            "x-pinterest-pws-handler": "www/[username]/[slug].js",
            "x-pinterest-source-url": "/search/pins/",
            "x-requested-with": "XMLHttpRequest",
        };

        const { data } = await axios.get(url, { httpsAgent: agent, headers, params, timeout: 20000 });

        return data.resource_response.data.results
            .filter(v => v.images?.orig)
            .map(result => ({
                upload_by: result.pinner?.username,
                fullname: result.pinner?.full_name,
                caption: result.grid_title,
                image: result.images.orig.url,
                source: "https://id.pinterest.com/pin/" + result.id,
            }));
    } catch {
        return [];
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PINTEREST SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "pinsearch",
        category: "downloader",
        react: "📌",
        aliases: ["pinfoto", "pins"],
        description: "Search and send Pinterest images by keyword",
    },
    async (from, sock, conText) => {
        const { q, reply, react, botPrefix } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply(
`🙅‍♂️ *MISSING QUERY*
*USAGE:*
> ${botPrefix}pinsearch anime 3*

*INFO:*
> Add a number at the end to set image count (max 10, default 5)`
            );
        }

        let query = q;
        let imgCount = 5;

        const parts = q.split(" ").filter(Boolean);
        const lastWord = parts[parts.length - 1];
        if (parts.length > 1 && lastWord && !isNaN(lastWord)) {
            imgCount = Math.max(1, Math.min(parseInt(lastWord), 10));
            query = parts.slice(0, -1).join(" ");
        }

        if (!query) {
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ *MISSING QUERY*\n*INFO:* Please provide a search keyword before the count`);
        }

        try {
            await react("🔍");
            const results = await pinterestSearch(query);

            if (results.length === 0) {
                await react("🙅‍♂️");
                return reply(`🙅‍♂️ *NO RESULTS*\n*INFO:* No results found for "${query}". Try another search term.`);
            }

            const imagesToSend = Math.min(results.length, imgCount);
            await react("⬇️");

            let sentCount = 0;
            for (let i = 0; i < imagesToSend; i++) {
                try {
                    await sock.sendMessage(from, {
                        image: { url: results[i].image },
                        caption: results[i].caption ? `📌 ${results[i].caption}` : undefined,
                    });
                    sentCount++;
                } catch (imgErr) {
                    console.error("Pinterest image send error:", imgErr.message);
                }
            }

            if (sentCount === 0) {
                await react("🙅‍♂️");
                return reply(`🙅‍♂️ *SEND FAILED*\n*INFO:* Found results but failed to send any images. Try again later.`);
            }

            await react("✅");
        } catch (error) {
            console.error("Pinterest search error:", error);
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ *ERROR:* Error occurred while fetching Pinterest images. Please try again later.`);
        }
    },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TIKTOK STALK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/* removed: replaced by plugins/stalk-social.js */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PINTEREST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "pindown",
        category: "downloader",
        react: "📌",
        aliases: ["pinterest", "pindl", "pin2"],
        description: "Download Pinterest image or video",
    },
    async (from, sock, conText) => {
        const {
            q, reply, react,
            gmdBuffer, botPrefix,
        } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply(
`🙅‍♂️ *MISSING URL*
*USAGE:*
> ${botPrefix}pindown https://pin.it/2xc4pVU2g*`
            );
        }

        if (!q.includes("pinterest.com") && !q.includes("pin.it")) {
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ *INVALID URL*\n*INFO:* Please provide a valid Pinterest URL`);
        }

        try {
            await react("⏳");

            const apiUrl = `https://api.azbry.com/api/download/pinterest?url=${encodeURIComponent(q)}`;
            const { data } = await axios.get(apiUrl, { timeout: 30000 });

            if (!data?.status || !data?.result) {
                await react("🙅‍♂️");
                return reply(`🙅‍♂️ *FETCH FAILED*\n*INFO:* Failed to fetch Pinterest data. Please check the URL and try again.`);
            }

            const res = data.result;

            const caption =
                `*– ( PINTEREST )*\n` +
                `──────────────𔓕\n` +
                `📝 *Title:* ${res.title || "(no title)"}\n` +
                `👤 *User:* ${res.user?.fullName || "-"}\n` +
                `🏷 *Username:* ${res.user?.username || "-"}\n` +
                `❤️ *Likes:* ${res.stats?.likes || 0}\n` +
                `🔁 *Shares:* ${res.stats?.shares || 0}\n` +
                `💬 *Comments:* ${res.stats?.comments || 0}\n` +
                `🎬 *Type:* ${res.type || "-"}`;

            if (res.type === "video" && res.download) {
                const videoUrl = String(res.download).replace(/\\\//g, "/").trim();

                await react("⬇️");
                try {
                    const videoBuffer = await gmdBuffer(videoUrl);
                    if (videoBuffer.length > MAX_MEDIA_SIZE) {
                        await sock.sendMessage(from, {
                            document: videoBuffer,
                            fileName: `${(res.title || "pinterest_video").replace(/[^\w\s.-]/gi, "")}.mp4`,
                            mimetype: "video/mp4",
                            caption,
                        });
                    } else {
                        await sock.sendMessage(from, {
                            video: videoBuffer,
                            mimetype: "video/mp4",
                            caption,
                        });
                    }
                } catch {
                    await sock.sendMessage(from, {
                        video: { url: videoUrl },
                        mimetype: "video/mp4",
                        caption,
                    });
                }

            } else if (res.images && res.images.length > 0) {
                const imageUrl = String(res.images[0]).replace(/\\\//g, "/").trim();

                await react("⬇️");
                await sock.sendMessage(from, {
                    image: { url: imageUrl },
                    caption,
                });

            } else if (res.thumbnail) {
                const thumbUrl = String(res.thumbnail).replace(/\\\//g, "/").trim();

                await react("⬇️");
                await sock.sendMessage(from, {
                    image: { url: thumbUrl },
                    caption,
                });

            } else {
                await react("🙅‍♂️");
                return reply(`🙅‍♂️ *NO MEDIA*\n*INFO:* No media found for this Pinterest link.`);
            }

            await react("✅");
        } catch (error) {
            console.error("Pinterest API error:", error?.response?.data || error);
            await react("🙅‍♂️");
            return reply(
                `🙅‍♂️ *ERROR:* Failed to download.\n*INFO:* ${error?.response?.data?.message || error.message}`
            );
        }
    },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INSTAGRAM STALK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/* removed: replaced by plugins/stalk-social.js */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SPOTIFY PLAY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "spotify",
        category: "downloader",
        react: "🎵",
        aliases: ["spotifyp", "playspotify"],
        description: "Search and play a song from Spotify",
    },
    async (from, sock, conText) => {
        const { q, reply, react, botPrefix } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply(
`🙅‍♂️ *MISSING QUERY*
*USAGE:*
> ${botPrefix}spotify sesi potret*`
            );
        }

        try {
            await react("🔍");

            const apiUrl = `https://api.nexray.eu.cc/downloader/spotifyplay?q=${encodeURIComponent(q)}`;
            const { data } = await axios.get(apiUrl, { timeout: 30000 });

            if (!data?.status || !data?.result) {
                await react("🙅‍♂️");
                return reply(`🙅‍♂️ *NOT FOUND*\n*INFO:* Song not found.`);
            }

            const res = data.result;

            const caption =
                `*– ( SPOTIFY-PLAY )*\n` +
                `──────────────𔓕\n` +
                `*🐊 Title:* ${res.title}\n` +
                `*🎤 Artist:* ${res.artist}\n` +
                `*🍉 Album:* ${res.album}\n` +
                `*⏱ Duration:* ${res.duration}\n` +
                `*⭐ Popularity:* ${res.popularity}\n` +
                `*📅 Release:* ${res.release_at}\n\n` +
                `*🔗 Spotify:*\n${res.url}`;

            await sock.sendMessage(from, {
                image: { url: res.thumbnail },
                caption,
            });

            await react("⬇️");

            await sock.sendMessage(from, {
                audio: { url: res.download_url },
                mimetype: "audio/mpeg",
                fileName: `${res.title}.mp3`,
                ptt: false,
                contextInfo: {
                    externalAdReply: {
                        title: res.title,
                        body: res.artist || "Spotify",
                        mediaType: 2,
                        thumbnailUrl: res.thumbnail,
                        sourceUrl: res.url,
                        renderLargerThumbnail: false,
                        showAdAttribution: true,
                    },
                },
            });

            await react("✅");

        } catch (error) {
            console.error("Spotify Play error:", error);
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ *ERROR:* An error occurred while fetching the Spotify track.`);
        }
    },
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TELEGRAM STALK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "tgstalk",
        category: "tools",
        react: "✈️",
        aliases: ["telegramstalk", "stalktg"],
        description: "Get Telegram username/channel/group info",
    },
    async (from, sock, conText) => {
        const { q, reply, react, botPrefix } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply(
`🙅‍♂️ *MISSING USERNAME*
*USAGE:*
> ${botPrefix}tgstalk durov*`
            );
        }

        try {
            await react("⏳");

            const username = q.replace(/^@/, "").trim();
            const apiUrl = `https://api.synoxcloud.xyz/stalker/telegram?username=${encodeURIComponent(username)}`;
            const { data } = await axios.get(apiUrl, { timeout: 30000 });

            if (!data?.status || !data?.result) {
                await react("🙅‍♂️");
                return reply(`🙅‍♂️ *NOT FOUND*\n*INFO:* Username not found or the API is currently unavailable.`);
            }

            const res = data.result;

            const caption =
                `*– ( TELEGRAM-STALK )*\n` +
                `──────────────𔓕\n` +
                `👤 *Name:* ${res.name || "-"}\n` +
                `🏷️ *Username:* ${res.username || "-"}\n` +
                `📂 *Type:* ${res.type || "-"}\n` +
                `👥 *Subscribers:* ${res.extra || res.subscribers || "-"}\n` +
                `🔗 *Link:* ${res.profile_url || "-"}\n\n` +
                `📝 *Bio:*\n${res.bio || "-"}`;

            if (res.photo) {
                await sock.sendMessage(from, {
                    image: { url: res.photo },
                    caption,
                });
            } else {
                await sock.sendMessage(from, { text: caption });
            }

            await react("✅");
        } catch (error) {
            console.error("Telegram Stalk error:", error?.response?.data || error);
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ *ERROR:* ${error.message}`);
        }
    },
);
