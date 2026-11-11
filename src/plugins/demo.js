const { cmd } = require("../lib");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { proto } = require("@whiskeysockets/baileys");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RICH — Premium AIRich MessageBuilder Demo
//  Usage: .rich  |  .rich loc
//
//  This file is now a PLUGGABLE REGISTRY.
//  Every "unique command" you want folded into
//  the .rich demo gets added as a module below
//  using registerRichModule(name, fn). All
//  registered modules run automatically, in
//  order, whenever .rich is executed.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Registry of all rich demo modules.
 * Each module receives (builder, ctx) where:
 *   - builder = the AIRich instance
 *   - ctx     = { from, sock, conText }
 * Add new unique features by calling registerRichModule().
 */
const RICH_MODULES = [];

function registerRichModule(name, fn) {
  RICH_MODULES.push({ name, fn });
}

// ── Core Module: Title + Intro Text ─────────────
registerRichModule("intro", async (builder) => {
  builder.setTitle("PRIME-MD AI Ecosystem");
  builder.addText(
    "Hello! This is a full demonstration of *MessageBuilder v4.6 (Premium)* on WhatsApp AI Bubble.\n\nSupports _hyperlinks_: [GitHub](https://github.com/devrickydewizard/PRIME-MD)\nSupports automatic _citations_: [](https://github.com/devrickydewizard)\nSupports _LaTeX_ too: [Cool Formula|1429|1897]<https://i.postimg.cc/Y9prHdzq/ca584606bf613058742e1f009dcb8a85-removebg-preview.png>"
  );
  builder.addText(
    "# Welcome\n## PRIME-MD\n\n---\n\n==Highlighted Yellow Text==\n\n---\n\nTRUSTED LINK:\n[GitHub](https://github.com/devrickydewizard/PRIME-MD)\n\nUNTRUSTED LINK:\n[GitHub](!https://github.com/devrickydewizard/PRIME-MD)"
  );
});

// ── Core Module: Code Block ──────────────────────
registerRichModule("code", async (builder) => {
  builder.addCode(
    "javascript",
    'class AI {\n  static hello() {\n    return "Native UI — PRIME-MD!";\n  }\n}'
  );
});

// ── Core Module: Table ───────────────────────────
registerRichModule("table", async (builder) => {
  builder.addTable([
    ["Feature", "Render Status"],
    ["Video UI", "✅ Successfully Rendered"],
    ["Post UI", "✅ Successfully Rendered"],
    ["Product UI", "✅ Successfully Rendered"],
  ]);
});

// ── Core Module: Images ──────────────────────────
registerRichModule("images", async (builder) => {
  builder.addImage([
    "https://i.pinimg.com/736x/25/24/1f/25241fda752fbc8fc6dfcfbdbd3fafdf.jpg",
    "https://i.pinimg.com/1200x/ca/58/46/ca584606bf613058742e1f009dcb8a85.jpg",
  ]);
});

// ── Core Module: Video ───────────────────────────
registerRichModule("video", async (builder) => {
  builder.addVideo(
    [
      {
        url: "https://files.catbox.moe/hdydgk.mp4",
        thumbnail:
          "https://i.pinimg.com/1200x/ca/58/46/ca584606bf613058742e1f009dcb8a85.jpg",
        file_length: 2500000,
        duration: 15,
      },
    ],
    { autoFill: false } // keep off — prevents lag
  );
});

// ── Core Module: Reels ───────────────────────────
registerRichModule("reels", async (builder) => {
  builder.addReels([
    {
      title: "PRIME-MD",
      profileIconUrl: "https://files.catbox.moe/oldb9c.jpeg",
      thumbnailUrl:
        "https://static.wikia.nocookie.net/gensin-impact/images/2/23/Columbina_Card.png/revision/latest?cb=20251210040329",
      videoUrl: "https://files.catbox.moe/hdydgk.mp4",
      reels_title: "Demo Reel",
      likes_count: 12000,
      shares_count: 500,
      view_count: 999999,
      reel_source: "IG",
      is_verified: true,
    },
    {
      title: "PRIME-MD",
      profileIconUrl: "https://files.catbox.moe/oldb9c.jpeg",
      thumbnailUrl:
        "https://static.wikia.nocookie.net/gensin-impact/images/1/1c/Character_Columbina_Game.png/revision/latest?cb=20260227184838",
      videoUrl: "https://files.catbox.moe/hdydgk.mp4",
      reels_title: "Demo Reel 2",
      likes_count: 12000,
      shares_count: 500,
      view_count: 999999,
      reel_source: "IG",
      is_verified: true,
    },
  ]);
});

// ── Core Module: Post ────────────────────────────
registerRichModule("post", async (builder) => {
  builder.addPost({
    title: "PRIME-MD Update",
    subtitle: "Native AI",
    username: "PRIME-MD",
    profile_picture_url: "https://files.catbox.moe/oldb9c.jpeg",
    is_verified: true,
    thumbnail_url:
      "https://i.pinimg.com/736x/cf/8f/41/cf8f41dfb65bb723f243d26c86120d4c.jpg",
    post_caption: "A major AI Bubble UI update for PRIME-MD!",
    likes_count: 24500,
    comments_count: 250,
    shares_count: 1200,
    post_url: "https://github.com/devrickydewizard/PRIME-MD",
    source_app: "INSTAGRAM",
    footer_label: "New Update",
    footer_icon: "https://files.catbox.moe/oldb9c.jpeg",
    post_type: "IMAGE",
  });
});

// ── Core Module: Products ────────────────────────
registerRichModule("products", async (builder) => {
  builder.addProduct({
    title: "PRIME-MD Premium",
    brand: "PRIME-MD",
    price: 50000,
    sale_price: 0,
    image_url:
      "https://i.pinimg.com/736x/cf/8f/41/cf8f41dfb65bb723f243d26c86120d4c.jpg",
    product_url: "https://github.com/devrickydewizard/PRIME-MD",
  });

  builder.addProduct([
    {
      title: "PRIME-MD Pro",
      brand: "PRIME-MD",
      price: 100000,
      image_url:
        "https://i.pinimg.com/736x/56/9d/24/569d243fa5f11428168a549ea94bb1cb.jpg",
      product_url: "https://github.com/devrickydewizard/PRIME-MD",
    },
    {
      title: "PRIME-MD Ultra",
      brand: "PRIME-MD",
      price: 200000,
      image_url:
        "https://i.pinimg.com/736x/ed/07/da/ed07da3e7e6374495d6025c05081d4e5.jpg",
      product_url: "https://github.com/devrickydewizard/PRIME-MD",
    },
  ]);
});

// ── Core Module: Source / Citations ──────────────
registerRichModule("source", async (builder) => {
  builder.addSource([
    [
      "https://files.catbox.moe/oldb9c.jpeg",
      "https://whatsapp.com/channel/0029VaoRxGmJpe8lgCqT1T2h",
      "Update Channel",
    ],
  ]);
});

// ── Core Module: Tip + Suggestions + Footer ──────
registerRichModule("meta", async (builder) => {
  builder.addTip("This is a tip/metadata displayed at the top of the message.");
  builder.addSuggest(["Order Now", "Contact Admin"]);
  builder.setFooter("If you're weak, let fear be upon you against me 💀");
});

// ── Core Module: Request Phone Number ────────────
// Sends the native SHARE_PHONE_NUMBER prompt.
// Fired 3x (a safe middle ground — enough to reliably
// catch the prompt without spamming the chat like 5x would).
registerRichModule("reqnum", async (builder, ctx) => {
  const { from, sock } = ctx;
  const ATTEMPTS = 3;

  // Premium highlight
  builder.addTip("⚡ *Premium Feature Unlocked* — Native Contact Sync Active ⚡");

  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      await sock.relayMessage(
        from,
        {
          protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.SHARE_PHONE_NUMBER,
          },
        },
        {}
      );
    } catch (e) {
      console.error(`[Rich][reqnum] attempt ${i} failed:`, e.message);
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ADD NEW UNIQUE COMMANDS HERE
//  Example:
//
//  registerRichModule("myFeature", async (builder, ctx) => {
//    builder.addText("My new premium feature!");
//  });
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Final Extra Message: LaTeX "Hello World" Bubble ──
// Sent as its OWN separate message, right after the
// main builder message — not folded into the builder
// since it uses a raw richResponseMessage payload.
async function sendHelloWorldBubble(sock, from) {
  await sock.relayMessage(
    from,
    {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: "",
          richResponseSourcesMetadata: {
            sources: [],
          },
        },
        contextInfo: {
          isForwarded: true,
          forwardedAiBotMessageInfo: {
            botJid: "0@bot",
          },
        },
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [
              {
                messageType: 8,
                latexMetadata: {
                  text: "Hello worldㅤ",
                  expressions: [
                    {
                      latexExpression: "Hello world",
                      url: "https://mmg.whatsapp.net/o1/v/t24/f2/m235/AQM8JMOpd2WL_79fkm6KCbLYk3XFxpReEjJSBvbds-sRMI3YN0_y7prP5hJ2Ksn8JjLFz0qw6afaJ4aKo1p1a4ZTmGbzOH5HYnM0jtZliw?ccb=9-4&oh=01_Q5Aa4wHrIteLej4mzc-ZVMB6C3Olnxq41RJPqzfCtbtzhAp-dA&oe=6A682637&_nc_sid=e6ed6c&mms3=true",
                      width: 310,
                      height: 61,
                      fontHeight: 24,
                      imageTopPadding: 0,
                      imageLeadingPadding: 0,
                      imageBottomPadding: 0,
                      imageTrailingPadding: 0,
                    },
                  ],
                },
              },
            ],
            unifiedResponse: {
              data: "",
            },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: {
                botJid: "0@bot",
              },
              forwardOrigin: 4,
            },
          },
        },
      },
    },
    {}
  );
}

// ── New Message Type: Interactive Button ─────────
// Uses Button class (reply/url/copy/single-select rows).
async function sendButtonDemo(Button, sock, from) {
  await new Button(sock)
    .setTitle("🚀 PRIME-MD")
    .setSubtitle("Interactive Message")
    .setBody("Choose an option below")
    .setFooter("© PRIME-MD")
    .setImage(
      "https://files.catbox.moe/oldb9c.jpeg"
    )
    .addReply("📦 Menu", ".menu", { icon: "DEFAULT" })
    .addReply("👤 Owner", ".owner", { icon: "REVIEW" })
    .addUrl("🌐 GitHub", "https://github.com/devrickydewizard/PRIME-MD", true, {
      icon: "PROMOTION",
    })
    .addCopy("📋 Copy Code", "PRIME-MD-2026", { icon: "DOCUMENT" })
    .addSelection("📚 Select Category")
    .makeSection("Main Menu")
    .makeRow("🔥 HOT", "Downloader", "Download from social media", ".dl")
    .makeRow("⚡ FAST", "AI Chat", "Chat with AI", ".ai")
    .send(from);
}

// ── New Message Type: Native-Flow Buttons (V2) ───
// Uses ButtonV2 class (raw single_select nativeFlowInfo + plain button).
async function sendButtonV2Demo(ButtonV2, sock, from) {
  await new ButtonV2(sock)
    .setTitle("🚀 PRIME-MD")
    .setSubtitle("Buttons Message")
    .setBody("Hello world")
    .setFooter("Footer Message")
    .setThumbnail(
      "https://files.catbox.moe/oldb9c.jpeg"
    )
    .addRawButton({
      buttonText: { displayText: "📡 Menu" },
      buttonId: "PRIME-MD",
      type: 1,
      nativeFlowInfo: {
        name: "single_select",
        paramsJson: JSON.stringify({
          title: "Click Here!",
          sections: [
            {
              title: "PRIME-MD",
              highlight_label: "",
              rows: [{ header: "", title: "PRIME-MD", description: "", id: "" }],
            },
          ],
        }),
      },
    })
    .addButton("👤 Owner", ".owner")
    .send(from);
}

// ── New Message Type: Carousel (swipeable cards) ─
// Uses Carousel + Button.toCard() for each product card.
async function sendCarouselDemo(Button, Carousel, sock, from) {
  await new Carousel(sock)
    .setBody("🛍️ PRIME-MD Store")
    .setFooter("Swipe to see more")
    .addCard(
      await new Button(sock)
        .setTitle("💎 Premium")
        .setBody("Unlock premium features")
        .setFooter("$5")
        .setImage(
          "https://files.catbox.moe/oldb9c.jpeg"
        )
        .addReply("🛒 Buy", ".buy premium")
        .toCard()
    )
    .addCard(
      await new Button(sock)
        .setTitle("🚀 Pro")
        .setBody("Unlock pro features")
        .setFooter("$10")
        .setImage(
          "https://files.catbox.moe/oldb9c.jpeg"
        )
        .addReply("🛒 Buy", ".buy pro")
        .toCard()
    )
    .send(from);
}

cmd(
  {
    pattern: "rich",
    aliases: ["airich", "richtest", "demo"],
    react: "🤖",
    category: "owner",
    description: "Premium AIRich MessageBuilder demo — AI Bubble with rich UI",
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser, args } = conText;
    if (!isSuperUser) return reply("*Access Denied: Owner Only* 👑");

    // ── Location Bubble Sub-Demo (.rich loc) ──────
    if (args && args[0] === "loc") {
      try {
        let thumb = Buffer.alloc(0);
        try {
          const sharp = require("sharp");
          const res = await fetch(
            "https://files.catbox.moe/oldb9c.jpeg"
          );
          let buf = Buffer.from(await res.arrayBuffer());
          thumb = await sharp(buf)
            .resize(300, 300, {
              fit: "cover",
              position: "center",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer();
        } catch (e) {
          console.error("Sharp error:", e.message);
        }

        await sock.relayMessage(
          from,
          {
            buttonsMessage: {
              buttons: [
                { buttonId: ".menu", buttonText: { displayText: "📦 Menu" }, type: 1 },
                { buttonId: ".owner", buttonText: { displayText: "👑 Owner" }, type: 1 },
              ],
              contentText: "Hello world",
              footerText: "Footer Message",
              contextInfo: { mentionedJid: [], groupMentions: [], statusAttributions: [] },
              headerType: 6,
              locationMessage: {
                degreesLatitude: 0,
                degreesLongitude: 0,
                name: "🚀 PRIME-MD",
                address: "Buttons Message",
                jpegThumbnail: thumb,
              },
              viewOnce: true,
            },
          },
          {
            additionalNodes: [
              {
                tag: "biz",
                attrs: {},
                content: [
                  {
                    tag: "interactive",
                    attrs: { type: "native_flow", v: "1" },
                    content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
                  },
                ],
              },
            ],
          }
        );
        return await react("🚀");
      } catch (e) {
        console.error("[Rich Loc] error:", e.message);
        await react("🙅‍♂️");
        return reply(`🙅‍♂️ *Failed*\n${e.message}`);
      }
    }

    await react("⏳");

    try {
      // Load AIRich from gist — patch baileys import for blacklord-baileys
      const tempPath = path.join(process.cwd(), "MB_temp.mjs");

      console.log("[Rich] Fetching AIRich library...");
      const res = await fetch(
        "https://gist.githubusercontent.com/ValdazGT/ce6532c1d4ff192bb718f1acb392d460/raw/"
      );
      if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);

      let code = await res.text();
      code = code.replace(/['"]baileys['"]/g, '"@whiskeysockets/baileys"');
      fs.writeFileSync(tempPath, code);

      const fileUrl = pathToFileURL(tempPath).href + "?update=" + Date.now();
      const { AIRich, Button, ButtonV2, Carousel } = await import(fileUrl);
      console.log("[Rich] AIRich loaded ✅");

      const builder = new AIRich(sock);
      const ctx = { from, sock, conText };

      // ── Run every registered module in order ─────
      for (const mod of RICH_MODULES) {
        try {
          await mod.fn(builder, ctx);
        } catch (modErr) {
          console.error(`[Rich] Module "${mod.name}" failed:`, modErr.message);
        }
      }

      // ── Send main rich message ────────────────────
      await builder.send(from);
      console.log("[Rich] AIRich message sent ✅");

      // ── Send extra LaTeX bubble as its own last message ──
      try {
        await sendHelloWorldBubble(sock, from);
        console.log("[Rich] Hello World bubble sent ✅");
      } catch (e) {
        console.error("[Rich] Hello World bubble failed:", e.message);
      }

      // ── Send Interactive Button message ───────────
      try {
        await sendButtonDemo(Button, sock, from);
        console.log("[Rich] Button demo sent ✅");
      } catch (e) {
        console.error("[Rich] Button demo failed:", e.message);
      }

      // ── Send ButtonV2 (native_flow) message ───────
      try {
        await sendButtonV2Demo(ButtonV2, sock, from);
        console.log("[Rich] ButtonV2 demo sent ✅");
      } catch (e) {
        console.error("[Rich] ButtonV2 demo failed:", e.message);
      }

      // ── Send Carousel message ─────────────────────
      try {
        await sendCarouselDemo(Button, Carousel, sock, from);
        console.log("[Rich] Carousel demo sent ✅");
      } catch (e) {
        console.error("[Rich] Carousel demo failed:", e.message);
      }

      await react("✅");
    } catch (e) {
      console.error("[Rich] error:", e.message);
      await react("🙅‍♂️");
      await reply(`🙅‍♂️ *Rich Demo Failed*\n${e.message}`);
    }
  }
);


// Export so other files (or future unique-command files) can
// register additional modules into .rich without editing this file.
module.exports.registerRichModule = registerRichModule;
