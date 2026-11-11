// Social profile stalkers: Instagram, TikTok, Twitter/X, Facebook.
// Optional: set REEF_API_KEY (Heroku config var / .env) to use ReefAPI first for Instagram.
// Without it the Instagram lookup uses the public fallback API.
const { cmd } = require("../lib");
const axios = require("axios");

const REEF_KEY = process.env.REEF_API_KEY || "";

const formatNum = (num) => {
    if (!num) return "0";
    return parseInt(num).toLocaleString();
};

// Instagram: ReefAPI (if a key is set) then Siputzx
async function fetchInstagram(username) {
    if (REEF_KEY) {
        try {
            console.log(`[IGSTALK] Trying ReefAPI...`);
            const res = await axios.post('https://api.reefapi.com/instagram/v1/profile',
                { username },
                { headers: { 'x-api-key': REEF_KEY, 'content-type': 'application/json' }, timeout: 15000 }
            );
            if (res.data && res.data.ok && res.data.data) {
                console.log(`[IGSTALK] ReefAPI success!`);
                return res.data.data;
            }
        } catch (e) {
            console.log(`[IGSTALK] ReefAPI failed: ${e.message}`);
        }
    }

    try {
        console.log(`[IGSTALK] Trying Siputzx...`);
        const res = await axios.get(`https://api.siputzx.my.id/api/stalk/instagram?username=${encodeURIComponent(username)}`, { timeout: 10000 });
        if (res.data?.status && res.data?.data) return res.data.data;
    } catch (e) { console.log(`[IGSTALK] Siputzx failed.`); }

    return null;
}

const sendProfile = async (sock, from, mek, avatarUrl, caption) => {
    if (avatarUrl) {
        await sock.sendMessage(from, { image: { url: avatarUrl }, caption }, { quoted: mek });
    } else {
        await sock.sendMessage(from, { text: caption }, { quoted: mek });
    }
};

// 1. INSTAGRAM STALK
cmd({ pattern: "igstalk", aliases: ["instagramstalk", "stalkig", "igprofile", "instastalk"], react: "📸", category: "stalk" },
async (from, sock, conText) => {
    const { q, reply, mek } = conText;
    if (!q) return reply("🙅‍♂️ Provide an Instagram username.\nExample: .igstalk cristiano");

    const p = await fetchInstagram(q.trim().replace(/^@/, ''));
    if (!p) {
        return reply("🙅‍♂️ All Instagram APIs are currently down. Please try again later.");
    }

    const username = p.username || q;
    const caption = `📸 *Instagram Profile: @${username}*\n\n` +
        `📛 *Name:* ${p.full_name || 'N/A'}\n` +
        `📝 *Bio:* ${p.biography || 'No bio'}\n` +
        `🔗 *URL:* https://instagram.com/${username}\n` +
        `🔒 *Private:* ${p.is_private ? 'Yes' : 'No'}\n` +
        `✅ *Verified:* ${p.is_verified ? 'Yes' : 'No'}\n\n` +
        `📊 *Stats*\n` +
        `📸 *Posts:* ${formatNum(p.posts || p.recent_posts?.length || 0)}\n` +
        `👥 *Followers:* ${formatNum(p.follower_count || 0)}\n` +
        `👣 *Following:* ${formatNum(p.following_count || 0)}`;

    await sendProfile(sock, from, mek, p.profile_pic || p.profile_pic_url, caption);
});

// 2. TIKTOK STALK
cmd({ pattern: "tiktokstalk", aliases: ["ttstalk", "stalktiktok", "tiktokprofile", "stalktt"], react: "🎵", category: "stalk" },
async (from, sock, conText) => {
    const { q, reply, mek } = conText;
    if (!q) return reply("🙅‍♂️ Provide a TikTok username.\nExample: .tiktokstalk keizzah4189");

    try {
        const res = await axios.get(`https://api.siputzx.my.id/api/stalk/tiktok?username=${encodeURIComponent(q.trim().replace(/^@/, ''))}`, { timeout: 15000 });
        const data = res.data;
        if (!data.status || !data.data) return reply("🙅‍♂️ Failed to fetch TikTok profile.");

        const p = data.data;
        const stats = p.stats || p;
        const caption = `🎵 *TikTok Profile: @${p.username || q}*\n\n` +
            `📛 *Name:* ${p.nickname || 'N/A'}\n` +
            `📝 *Bio:* ${p.signature || 'No bio'}\n` +
            `🔒 *Private:* ${p.private ? 'Yes' : 'No'}\n` +
            `✅ *Verified:* ${p.verified ? 'Yes' : 'No'}\n\n` +
            `📊 *Stats*\n` +
            `👥 *Followers:* ${formatNum(stats.followers)}\n` +
            `👣 *Following:* ${formatNum(stats.following)}\n` +
            `❤️ *Hearts:* ${formatNum(stats.likes || stats.hearts)}\n` +
            `🎬 *Videos:* ${formatNum(stats.videoCount || stats.videos)}`;

        await sendProfile(sock, from, mek, p.avatar || p.profile_pic || p.profilePic, caption);
    } catch (err) {
        await reply("🙅‍♂️ API Error. Server is busy.");
    }
});

// 3. TWITTER STALK
cmd({ pattern: "twitterstalk", aliases: ["twstalk", "stalktwitter", "twistalk"], react: "🐦", category: "stalk" },
async (from, sock, conText) => {
    const { q, reply, mek } = conText;
    if (!q) return reply("🙅‍♂️ Provide a Twitter username.\nExample: .twstalk elonmusk");

    try {
        const res = await axios.get(`https://api.siputzx.my.id/api/stalk/twitter?username=${encodeURIComponent(q.trim().replace(/^@/, ''))}`, { timeout: 15000 });
        const data = res.data;
        if (!data.status || !data.data) return reply("🙅‍♂️ Failed to fetch Twitter profile.");

        const p = data.data;
        const caption = `🐦 *Twitter Profile: @${p.username || q}*\n\n` +
            `📛 *Name:* ${p.name || 'N/A'}\n` +
            `📝 *Bio:* ${p.bio || 'No bio'}\n` +
            `📍 *Location:* ${p.location || 'N/A'}\n` +
            `🔗 *Website:* ${p.website || 'N/A'}\n\n` +
            `📊 *Stats*\n` +
            `👥 *Followers:* ${formatNum(p.followers)}\n` +
            `👣 *Following:* ${formatNum(p.following)}\n` +
            `📝 *Tweets:* ${formatNum(p.tweets)}`;

        await sendProfile(sock, from, mek, p.avatar || p.profile_image_url_https, caption);
    } catch (err) {
        await reply("🙅‍♂️ API Error. Server is busy.");
    }
});

// 4. FACEBOOK STALK
cmd({ pattern: "fbstalk", aliases: ["facebookstalk", "stalkfb"], react: "📘", category: "stalk" },
async (from, sock, conText) => {
    const { q, reply, mek } = conText;
    if (!q) return reply("🙅‍♂️ Provide a Facebook username or ID.\nExample: .fbstalk zuck");

    try {
        const res = await axios.get(`https://api.siputzx.my.id/api/stalk/facebook?username=${encodeURIComponent(q.trim())}`, { timeout: 15000 });
        const data = res.data;
        if (!data.status || !data.data) return reply("🙅‍♂️ Failed to fetch Facebook profile.");

        const p = data.data;
        const caption = `📘 *Facebook Profile: ${p.name || q}*\n\n` +
            `🆔 *ID:* ${p.id || 'N/A'}\n` +
            `📝 *Bio:* ${p.bio || 'No bio'}\n` +
            `🔗 *URL:* ${p.url || 'N/A'}\n\n` +
            `📊 *Stats*\n` +
            `👥 *Followers:* ${formatNum(p.followers)}\n` +
            `👣 *Following:* ${formatNum(p.following)}`;

        await sendProfile(sock, from, mek, p.profile_pic || p.avatar, caption);
    } catch (err) {
        await reply("🙅‍♂️ API Error. Server is busy.");
    }
});
