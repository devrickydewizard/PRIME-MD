// RickyDeWizard AI client: one place for .gpt5 and the chatbot.
//
// Providers are tried in this order until one answers (without any key it behaves like the old version):
//   1. Your own OpenAI-compatible API   (AI_API_KEY [+ AI_BASE_URL, AI_MODEL])   <- best answers
//   2. Pollinations unified API         (POLLINATIONS_API_KEY [+ POLLINATIONS_MODEL])
//   3. Free fallbacks, no key           (synoxcloud gpt-5.5, legacy Pollinations) <- weakest, can go down
//
// Conversation memory is kept per chat in RAM (small, capped, expires) so follow-up questions work.
'use strict';

const BOT_NAME = process.env.BOT_AI_NAME || 'PRIME-MD';
const OWNER = process.env.BOT_AI_OWNER || 'RickyDeWizard';

const MAX_TURNS = 10;            // user+assistant pairs kept per chat
const MAX_CHATS = 200;           // chats kept in memory (oldest dropped first)
const MEMORY_TTL = 30 * 60 * 1000;
const TIMEOUT_MS = 30000;
const MAX_TOKENS = 700;

const memory = new Map();        // chatId -> { t, msgs: [{role, content}] }

function remember(chatId, role, content) {
    if (!chatId) return;
    let m = memory.get(chatId);
    if (!m) {
        if (memory.size >= MAX_CHATS) memory.delete(memory.keys().next().value);
        m = { t: Date.now(), msgs: [] };
    } else {
        memory.delete(chatId); // re-insert = most recently used
    }
    m.t = Date.now();
    m.msgs.push({ role, content: String(content).slice(0, 4000) });
    if (m.msgs.length > MAX_TURNS * 2) m.msgs.splice(0, m.msgs.length - MAX_TURNS * 2);
    memory.set(chatId, m);
}

function history(chatId) {
    const m = chatId && memory.get(chatId);
    if (!m) return [];
    if (Date.now() - m.t > MEMORY_TTL) { memory.delete(chatId); return []; }
    return m.msgs.slice();
}

function clearMemory(chatId) { return memory.delete(chatId); }

setInterval(() => {
    const cutoff = Date.now() - MEMORY_TTL;
    for (const [k, v] of memory) if (v.t < cutoff) memory.delete(k);
}, 5 * 60 * 1000).unref();

function systemPrompt(extra) {
    const lang = String(process.env.CHATBOT_LANG || 'auto').toLowerCase();
    const langLine = lang === 'auto'
        ? 'Reply in the same language the user writes in.'
        : `Always reply in ${lang}.`;
    const custom = process.env.CHATBOT_PROMPT ? '\n' + process.env.CHATBOT_PROMPT : '';
    return [
        `You are ${BOT_NAME} AI, a helpful and knowledgeable WhatsApp assistant created by ${OWNER}.`,
        'Give accurate, complete and practical answers. Explain your reasoning briefly when it helps, and give concrete examples, numbers and steps rather than vague statements.',
        "If you are not sure about something, say so instead of guessing. If a question needs live or very recent information you cannot know, say that clearly.",
        'Keep replies suitable for WhatsApp: plain text, short paragraphs, no long preambles. Use *bold* sparingly.',
        langLine,
        `Today's date is ${new Date().toDateString()}.`,
        extra || ''
    ].join('\n') + custom;
}

const IDENTITY = [/who\s*(made|created|built)\s*you/i, /who\s*is\s*your\s*(creator|developer|maker|owner|father|parent)/i, /created\s*you/i];
const isIdentityQuestion = (q) => typeof q === 'string' && IDENTITY.some((p) => p.test(q));

async function http(url, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...opts, signal: ctrl.signal });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

async function chatCompletions({ base, key, model, messages, label }) {
    const res = await http(`${base.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, max_tokens: MAX_TOKENS, temperature: 0.7 })
    });
    if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 200);
        throw new Error(`${label} HTTP ${res.status} ${body}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) throw new Error(`${label} returned an empty reply`);
    return String(text).trim();
}

const flatten = (msgs) => msgs.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

function providers(freeOrder = ['synoxcloud', 'pollinations']) {
    const list = [];
    if (process.env.AI_API_KEY) {
        list.push({
            name: 'custom-api',
            run: ({ messages }) => chatCompletions({
                base: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
                key: process.env.AI_API_KEY,
                model: process.env.AI_MODEL || 'gpt-5',
                messages,
                label: 'AI_API'
            })
        });
    }
    if (process.env.POLLINATIONS_API_KEY) {
        list.push({
            name: 'pollinations',
            run: ({ messages }) => chatCompletions({
                base: 'https://gen.pollinations.ai/v1',
                key: process.env.POLLINATIONS_API_KEY,
                model: process.env.POLLINATIONS_MODEL || 'openai',
                messages,
                label: 'Pollinations'
            })
        });
    }
    // Free, no-key providers. They keep the ORIGINAL request shapes your old version used,
    // so behaviour is unchanged unless you add an API key.
    const free = {
        synoxcloud: {
            name: 'synoxcloud-free',
            // identical to the old .gpt5: GET /ai-chat/gpt-5.5?pesan=<question>
            run: async ({ latest }) => {
                const res = await http(`https://api.synoxcloud.xyz/ai-chat/gpt-5.5?pesan=${encodeURIComponent(latest)}`);
                if (!res.ok) throw new Error(`synoxcloud HTTP ${res.status}`);
                const data = await res.json();
                const text = data?.result?.reply;
                if (!data?.status || !text) throw new Error('synoxcloud returned no reply');
                return String(text).trim();
            }
        },
        pollinations: {
            name: 'pollinations-free',
            // same endpoint + model as the old chatbot, now with short memory and a better system prompt
            run: async ({ messages, latest }) => {
                const sys = encodeURIComponent(messages[0].content);
                const past = messages.slice(1, -1).slice(-4);                  // last 2 exchanges only (URL length)
                let q = past.length ? flatten(past).slice(-900) + '\nUser: ' + latest : latest;
                const res = await http(`https://text.pollinations.ai/${encodeURIComponent(q)}?model=openai&system=${sys}`);
                if (!res.ok) throw new Error(`pollinations-free HTTP ${res.status}`);
                const text = (await res.text()).trim();
                if (!text) throw new Error('pollinations-free returned an empty reply');
                return text;
            }
        }
    };
    for (const k of freeOrder) if (free[k]) list.push(free[k]);
    return list;
}

/**
 * Ask the AI.
 * @param {object} o  { chatId, text, system?, memory? (default true) }
 * @returns {Promise<{text:string, provider:string}>}
 */
async function ask({ chatId, text, system, memory: useMemory = true, free = ['synoxcloud', 'pollinations'] }) {
    if (isIdentityQuestion(text)) {
        return { text: `I am ${BOT_NAME} AI, created by ${OWNER}.`, provider: 'builtin' };
    }
    const prior = useMemory ? history(chatId) : [];
    const messages = [{ role: 'system', content: systemPrompt(system) }, ...prior, { role: 'user', content: String(text).slice(0, 4000) }];

    const errors = [];
    for (const p of providers(free)) {
        try {
            const answer = await p.run({ messages, latest: String(text).slice(0, 4000) });
            if (useMemory) { remember(chatId, 'user', text); remember(chatId, 'assistant', answer); }
            return { text: answer, provider: p.name };
        } catch (e) {
            errors.push(`${p.name}: ${e.name === 'AbortError' ? 'timed out' : e.message}`);
        }
    }
    const hint = process.env.AI_API_KEY
        ? `Check AI_API_KEY / AI_BASE_URL / AI_MODEL (${errors[0]}).`
        : 'Set AI_API_KEY (and AI_MODEL) for reliable answers.';
    const err = new Error('No AI provider answered. ' + hint);
    err.details = errors;
    throw err;
}

module.exports = { ask, clearMemory, history, isIdentityQuestion };
