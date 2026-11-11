const { cmd } = require("../lib");
const { sendButtons } = require("gifted-btns");
const fancy = require("../lib/fancy");

const MAX_FONT = Math.max(
    ...Object.keys(fancy)
        .filter((k) => /^\d+$/.test(k))
        .map(Number)
);

cmd(
    {
        pattern: "fancy",
        aliases: ["fonts", "font"],
        react: "✨",
        category: "general",
        description: "Convert text to fancy fonts",
    },
    async (from, sock, conText) => {
        const {
            q,
            reply,
            botFooter,
            botPrefix,
            args,
        } = conText;

        const firstArg = args[0];
        const isFontNumber = /^\d+$/.test(firstArg || "");
        const num = isFontNumber ? Number(firstArg) : NaN;

        // ── .fancy <number> <text> ────────────────────────────────────
        if (!isNaN(num) && num >= 0 && num <= MAX_FONT) {
            const text = args.slice(1).join(" ").trim();

            if (!text) {
                return reply(
`📌 Usage: ${botPrefix}fancy ${num} <your text>

Example: ${botPrefix}fancy ${num} PRIME-MD`
                );
            }

            const map = fancy[num];

            if (!map || typeof map !== "object") {
                return reply(`🙅‍♂️ Font ${num} is not available`);
            }

            let converted;

            try {
                converted = fancy.apply(map, text);
            } catch (e) {
                return reply(`🙅‍♂️ Could not apply font ${num}`);
            }

            try {
                await sendButtons(sock, from, {
    text: `✨ *Font ${num}*\n\n${converted}`,
    footer: botFooter,
    buttons: [
        {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
                display_text: "📋 Copy Text",
                copy_code: converted,
            }),
        },
    ],
});
            } catch {
                await reply(`✨ *Font ${num}*\n\n${converted}`);
            }

            return;
        }

        // ── .fancy <text> — show all fonts ────────────────────────────
        const text = (q || "").trim();

        if (!text) {
            return reply(
`✨ *Fancy Fonts*

📌 Usage:
• ${botPrefix}fancy PRIME-MD → show all fonts
• ${botPrefix}fancy 5 PRIME-MD → specific font with copy button

⚙️ Available fonts: 0 - ${MAX_FONT}`
            );
        }

        const lines = [];

        for (let i = 0; i <= MAX_FONT; i++) {
            const map = fancy[i];

            if (!map || typeof map !== "object") continue;

            try {
                const converted = fancy.apply(map, text);
                lines.push(`*${i}.* ${converted}`);
            } catch {
                lines.push(`*${i}.* (special font)`);
            }
        }

        const msg =
            `*– ( TEXT: ${text} )*\n` +
            `──────────────✧\n` +
            lines.join("\n") +
            `\n\n📌 Use *${botPrefix}fancy <number> ${text}* to copy`;

        return reply(msg);
    }
);
