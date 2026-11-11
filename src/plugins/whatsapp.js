const { cmd } = require("../lib");
const {
    getLidMapping,
    getGroupMetadata,
} = require("../lib/connection/groupCache");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs-extra");
const path = require("path");

// ── config ──────────────────────────────────────────────────
const MAX_NUMBERS = 3000;
const EXISTS_BATCH_SIZE = 75;
const EXISTS_BATCH_DELAY_MS = 600;

const BIZ_CONCURRENCY = 8;
const BIZ_DELAY_MS = 200;

const GROUPED_INLINE_LIMIT = 500;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function normalizeUserJid(jid) {
    if (!jid || typeof jid !== "string") return "";
    if (jid.endsWith("@lid")) {
        const mapped = getLidMapping(jid);
        if (mapped) return mapped;
    }
    let normalized = jid.split(":")[0].split("/")[0];
    if (!normalized.includes("@")) normalized += "@s.whatsapp.net";
    if (normalized.endsWith("@lid")) {
        const mapped = getLidMapping(normalized);
        if (mapped) return mapped;
    }
    return normalized;
}

// Extracts valid-looking phone numbers from raw pasted/uploaded text.
// Accepts numbers separated by newlines, commas, semicolons, spaces or tabs.
function extractNumbersFromText(text) {
    if (!text || typeof text !== "string") return [];
    const tokens = text.split(/[\s,;]+/);
    const seen = new Set();
    const out = [];
    for (const t of tokens) {
        const digits = t.replace(/[^0-9]/g, "");
        if (digits.length >= 7 && digits.length <= 15 && !seen.has(digits)) {
            seen.add(digits);
            out.push(digits);
        }
    }
    return out;
}

// Pulls plain text out of a raw quotedMsg object (from conText.quotedMsg),
// covering every shape serializeMessage.js can hand us: plain text replies,
// extendedTextMessage replies, and image/video/document captions.
function extractTextFromQuotedContent(quotedMsg) {
    if (!quotedMsg || typeof quotedMsg !== "object") return "";
    if (quotedMsg.conversation) return quotedMsg.conversation;
    if (quotedMsg.extendedTextMessage?.text) return quotedMsg.extendedTextMessage.text;
    if (quotedMsg.imageMessage?.caption) return quotedMsg.imageMessage.caption;
    if (quotedMsg.videoMessage?.caption) return quotedMsg.videoMessage.caption;
    if (quotedMsg.documentMessage?.caption) return quotedMsg.documentMessage.caption;
    return "";
}

// Tries to download a document from the current message or a quoted message,
// regardless of the exact shape conText hands us (raw WAMessage vs unwrapped content).
async function tryDownloadDocumentText(sock, mek, quotedMsg, quotedKey) {
    const candidates = [];

    if (mek?.message?.documentMessage) candidates.push(mek);

    if (quotedMsg) {
        if (quotedMsg.documentMessage) {
            candidates.push({ key: quotedKey || mek?.key || {}, message: quotedMsg });
        } else if (quotedMsg.message?.documentMessage) {
            candidates.push(quotedMsg);
        } else if (quotedMsg.documentWithCaptionMessage?.message?.documentMessage) {
            candidates.push({ key: quotedKey || mek?.key || {}, message: quotedMsg });
        }
    }

    for (const candidate of candidates) {
        try {
            const buffer = await downloadMediaMessage(candidate, "buffer", {});
            if (buffer?.length) return buffer.toString("utf8");
        } catch (e) {
            // try next candidate
        }
    }
    return null;
}

// Checks a chunk of numbers with sock.onWhatsApp(), tolerating per-batch failures.
async function checkExistenceBatch(sock, numbers) {
    try {
        const results = await sock.onWhatsApp(...numbers);
        const map = new Map();
        for (const r of results || []) {
            if (!r?.jid) continue;
            const plain = r.jid.split("@")[0].split(":")[0];
            map.set(plain, { exists: !!r.exists, jid: normalizeUserJid(r.jid) });
        }
        return numbers.map((n) => map.get(n) || { exists: false, jid: null, error: true });
    } catch (e) {
        return numbers.map(() => ({ exists: false, jid: null, error: true }));
    }
}

// Best-effort business-account detection via business profile lookup.
async function detectAccountType(sock, jid) {
    try {
        const profile = await sock.getBusinessProfile(jid);
        const isBusiness = !!(profile && (profile.description || profile.category || profile.website || profile.email));
        return isBusiness ? "Business" : "Personal";
    } catch (e) {
        return "Personal";
    }
}

function buildGroupedSection(title, emoji, numbers) {
    if (!numbers.length) return "";

    return `
──────────────
${emoji} *${title.toUpperCase()} (${numbers.length})*

${numbers.map(n => `• ${n}`).join("\n")}`;
}

function buildReport(existResults, truncated, maxCap) {
    const registered = existResults.filter((r) => r.exists && r.jid);
    const businessNums = registered.filter((r) => r.type === "Business").map((r) => r.number);
    const personalNums = registered.filter((r) => r.type === "Personal").map((r) => r.number);
    const notFoundCount = existResults.length - registered.length;

    const summary =
`*– ( WHATSAPP-CHECK )*
──────────────𔓕
📊 *Checked* • ${existResults.length}${truncated ? ` (Max ${maxCap})` : ""}
✅ *Registered* • ${registered.length}
🏢 *Business* • ${businessNums.length}
👤 *Personal* • ${personalNums.length}
🙅‍♂️ *Not Registered* • ${notFoundCount}`;

    const businessSection = buildGroupedSection("Business", "🏢", businessNums);
    const personalSection = buildGroupedSection("Personal", "👤", personalNums);

    return {
        text: `${summary}${businessSection}${personalSection}`,
        registeredCount: registered.length,
    };
}

cmd(
    {
        pattern: "checknumber",
        aliases: ["onwhatsapp", "checkwa", "onwa", "bulkcheckwa"],
        react: "🔍",
        category: "utility",
        description: "Bulk-check phone numbers for WhatsApp registration + account type",
    },
    async (from, sock, conText) => {
        const { reply, react, q, botPrefix, mek, quotedMsg, quotedKey } = conText;

        // ── gather raw text from every possible source ────────
        // Priority: typed numbers > attached/quoted document content > quoted
        // text/caption (plain text reply, image caption, video caption, or a
        // document's own caption if the file itself couldn't be downloaded).
        let rawText = (q || "").trim();

        if (!rawText) {
            const docText = await tryDownloadDocumentText(sock, mek, quotedMsg, quotedKey);
            if (docText) rawText = docText;
        }

        if (!rawText) {
            rawText = extractTextFromQuotedContent(quotedMsg).trim();
        }

        let numbers = extractNumbersFromText(rawText);

        if (!numbers.length) {
            return await sock.sendMessage(from, {
    text: `🙅‍♂️ *NO VALID NUMBERS FOUND*

*USAGE:*
> .*${botPrefix}onwa 923001234567*
> .*${botPrefix}onwa 923001234567,923001234568*
> *Reply to a message containing numbers*
> *Reply to a* \`.txt\` *or* \`.csv\` *file*

*NOTE:*
> \`Country Code\` *- Required*
> \`Format\` *- Digits Only*
> \`Example\` *- 923001234567*`
});
        }

        let truncated = false;
        if (numbers.length > MAX_NUMBERS) {
            numbers = numbers.slice(0, MAX_NUMBERS);
            truncated = true;
        }

        await react("⏳");
        await sock.sendMessage(from, {
    text: `⏳ Checking \`${numbers.length}\` number(s)...`
});

        // ── existence check, batched ───────────────────────────
        const existResults = [];
        for (let i = 0; i < numbers.length; i += EXISTS_BATCH_SIZE) {
            const chunk = numbers.slice(i, i + EXISTS_BATCH_SIZE);
            const chunkResults = await checkExistenceBatch(sock, chunk);
            chunk.forEach((num, idx) => {
                existResults.push({ number: num, ...chunkResults[idx] });
            });
            if (i + EXISTS_BATCH_SIZE < numbers.length) await sleep(EXISTS_BATCH_DELAY_MS);
        }

        const registered = existResults.filter((r) => r.exists && r.jid);

        // ── account type detection, limited concurrency ────────
        for (let i = 0; i < registered.length; i += BIZ_CONCURRENCY) {
            const chunk = registered.slice(i, i + BIZ_CONCURRENCY);
            await Promise.all(
                chunk.map(async (r) => {
                    r.type = await detectAccountType(sock, r.jid);
                })
            );
            if (i + BIZ_CONCURRENCY < registered.length) await sleep(BIZ_DELAY_MS);
        }

        await react("✅");

        const { text: reportText, registeredCount } = buildReport(existResults, truncated, MAX_NUMBERS);

        // ── small enough: reply inline ──────────────────────────
        if (registeredCount <= GROUPED_INLINE_LIMIT) {
            return await sock.sendMessage(from, {
    text: reportText
});
        }

        // ── large list: send the same grouped report as a file ─
        const tempDir = path.join(__dirname, "..", "temp");
        await fs.ensureDir(tempDir);
        const filePath = path.join(tempDir, `onwa_results_${Date.now()}.txt`);
        // Strip markdown asterisks for the plain-text file version
        await fs.writeFile(filePath, reportText.replace(/\*/g, ""));

        try {
            await sock.sendMessage(from, {
    document: { url: filePath },
    mimetype: "text/plain",
    fileName: "onwa_results.txt",
    caption: `📊 *STATUS:* \`COMPLETE\`

*DETAILS:*
> \`Registered\` • ${registeredCount}
> \`Output\` • Full report attached

✅ *Download the attached file to view all results.*`
});
        } finally {
            fs.unlink(filePath).catch(() => {});
        }
    }
);


cmd(
    {
        pattern: "vcf",
        aliases: ["contacts", "savecontact", "scontact", "savecontacts"],
        react: "📇",
        category: "group",
        description: "Export all group participants as VCF contact file",
        isGroup: true,
    },
    async (from, sock, conText) => {
        const { sender, mek, reply, react } = conText;

        await react("⏳");

        try {
            const groupMetadata = await getGroupMetadata(sock, from);
            const participants = groupMetadata?.participants || [];
            const groupName = groupMetadata?.subject || "Group";

            if (participants.length === 0) {
                await react("🙅‍♂️");
                return reply("🙅‍♂️ No participants found in this group.");
            }

            let vcfContent = "";
            let index = 1;

            for (const member of participants) {
                const jid = member.jid || member.pn || member.id;
                if (!jid || typeof jid !== "string") continue;

                const phoneJid = jid.includes("@s.whatsapp.net")
                    ? jid
                    : normalizeUserJid(jid);
                if (!phoneJid || !phoneJid.includes("@s.whatsapp.net"))
                    continue;

                const id = phoneJid.split("@")[0];
                vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:[${index++}] +${id}\nTEL;type=CELL;type=VOICE;waid=${id}:+${id}\nEND:VCARD\n`;
            }

            const count = index - 1;

            if (count === 0) {
                await react("🙅‍♂️");
                return reply(
                    "🙅‍♂️ Could not extract any valid contacts from this group.",
                );
            }

            const fileName = `${groupName}.vcf`;

            await sock.sendMessage(
                from,
                {
                    document: Buffer.from(vcfContent.trim(), "utf-8"),
                    mimetype: "text/vcard",
                    fileName: fileName,
                    caption: `Done saving.\nGroup Name: *${groupName}*\nContacts: *${count}*`,
                },
                { quoted: mek },
            );

            
        } catch (err) {
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ Failed to export contacts: ${err.message}`);
        }
    },
);

