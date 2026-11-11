const {
    cmd,
} = require("../lib"),
    axios = require("axios");

const BASE = "https://api.synoxcloud.xyz/ai-chat";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SHARED HELPER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Calls a synoxcloud ai-chat endpoint and extracts the reply text.
 * @param {string} endpoint - e.g. "gemini-3-pro"
 * @param {object} params - query params, e.g. { pesan: "hi" }
 * @param {string} replyKey - key in result object holding the text ("reply" | "answer" | "response")
 */
async function askAI(endpoint, params, replyKey = "reply") {
    const { data } = await axios.get(`${BASE}/${endpoint}`, {
        params,
        timeout: 60000,
    });

    if (!data?.status || !data?.result) {
        throw new Error("Empty or invalid response from API");
    }

    const text = data.result[replyKey];
    if (!text) {
        throw new Error("No reply text found in response");
    }
    return text;
}

/**
 * Registers a simple single-turn AI chat command.
 */
function registerAIChat({ pattern, aliases, description, react, endpoint, paramName, replyKey, extraParams }) {
    cmd(
        {
            pattern,
            category: "ai",
            react: react || "🤖",
            aliases: aliases || [],
            description: description || `Chat with ${endpoint}`,
        },
        async (from, sock, conText) => {
            const { q, mek, reply, react: reactFn } = conText;

            if (!q) {
                await reactFn("🙅‍♂️");
                return reply(`Please provide a message\n\n*Example:*\n.${pattern} hello`);
            }

            try {
                await reactFn("⏳");

                const params = { [paramName]: q, ...(extraParams || {}) };
                const answer = await askAI(endpoint, params, replyKey);

                await reactFn("✅");
                return sock.sendMessage(from, { text: answer }, { quoted: mek });

            } catch (error) {
                console.error(`[${pattern}] error:`, error?.response?.data || error.message);
                await reactFn("🙅‍♂️");
                return reply(`An error occurred while contacting ${endpoint}.\n\n${error.message}`);
            }
        },
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  REGISTERED MODELS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

registerAIChat({
    pattern: "gemini3pro",
    aliases: ["gemini3"],
    description: "Chat with Gemini 3 Pro",
    react: "✨",
    endpoint: "gemini-3-pro",
    paramName: "pesan",
    replyKey: "reply",
});

registerAIChat({
    pattern: "gemini31pro",
    aliases: ["gemini31"],
    description: "Chat with Gemini 3.1 Pro",
    react: "✨",
    endpoint: "gemini-3.1-pro",
    paramName: "pesan",
    replyKey: "reply",
});

registerAIChat({
    pattern: "qwenmax",
    aliases: ["qwen3max"],
    description: "Chat with Qwen3 Max",
    react: "🧠",
    endpoint: "qwen3-max",
    paramName: "pesan",
    replyKey: "reply",
});

registerAIChat({
    pattern: "qwen",
    aliases: ["qwen80b", "qwen3next"],
    description: "Chat with Qwen3 Next 80B A3B Instruct",
    react: "🧠",
    endpoint: "qwen3-next-80b-a3b-instruct",
    paramName: "prompt",
    replyKey: "reply",
});

registerAIChat({
    pattern: "novaai",
    aliases: ["nova"],
    description: "Chat with NovaAI",
    react: "💫",
    endpoint: "novaai",
    paramName: "text",
    replyKey: "reply",
});

registerAIChat({
    pattern: "llama4",
    aliases: ["maverick", "llama4maverick"],
    description: "Chat with Llama 4 Maverick",
    react: "🦙",
    endpoint: "llama4-maverick",
    paramName: "pesan",
    replyKey: "reply",
});

// GPT-5: with no AI_API_KEY this behaves exactly like before (same synoxcloud endpoint).
// With AI_API_KEY set it uses your own model and remembers the conversation.
cmd(
    {
        pattern: "gpt55",
        aliases: ["gpt5"],
        category: "ai",
        react: "🤖",
        description: "Chat with GPT-5 (remembers the conversation, use .clearai to reset)",
    },
    async (from, sock, conText) => {
        const { q, mek, reply, react: reactFn, sender } = conText;
        if (!q) {
            await reactFn("🙅‍♂️");
            return reply("Please provide a message\n\n*Example:*\n.gpt5 explain how vaccines work");
        }
        try {
            await reactFn("⏳");
            const { ask } = require("../lib/aiClient");
            const { text } = await ask({ chatId: `gpt5:${sender || from}`, text: q, free: ['synoxcloud', 'pollinations'] });
            await reactFn("✅");
            return sock.sendMessage(from, { text }, { quoted: mek });
        } catch (error) {
            console.error("[gpt5] error:", error.message, error.details || "");
            await reactFn("🙅‍♂️");
            return reply(`❌ GPT-5 is not answering right now.\n\n${error.message}`);
        }
    },
);

registerAIChat({
    pattern: "glmflash",
    aliases: ["glm47", "glm47flash"],
    description: "Chat with GLM 4.7 Flash",
    react: "🌀",
    endpoint: "glm47flash",
    paramName: "prompt",
    replyKey: "response",
    extraParams: { system: "You are a helpful assistant.", temperature: 0.7 },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PRIMETECH AI (session-based)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "primeai", aliases: ["unlimitedai"],
        category: "ai",
        react: "♾️",
        aliases: ["uai"],
        description: "Chat with UnlimitedAI (keeps a session per user)",
    },
    async (from, sock, conText) => {
        const { q, mek, reply, react, sender } = conText;

        if (!q) {
            await react("🙅‍♂️");
            return reply("Please provide a message\n\n*Example:*\n.unlimitedai hello");
        }

        try {
            await react("⏳");

            const session = (sender || from).replace(/[^a-zA-Z0-9]/g, "");
            const { data } = await axios.get(`${BASE}/unlimited-ai`, {
                params: { prompt: q, session },
                timeout: 60000,
            });

            if (!data?.status || !data?.result?.answer) {
                await react("🙅‍♂️");
                return reply("Failed to get a response. Please try again.");
            }

            await react("✅");
            return sock.sendMessage(from, { text: data.result.answer }, { quoted: mek });

        } catch (error) {
            console.error("[unlimitedai] error:", error?.response?.data || error.message);
            await react("🙅‍♂️");
            return reply(`An error occurred.\n\n${error.message}`);
        }
    },
);

