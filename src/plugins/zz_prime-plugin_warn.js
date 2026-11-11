// PRIME plugin: Warn.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const axios = require('axios');

const fs = require('fs');

const path = require('path');


pcmd({
  pattern: "inspect",
  aliases: ["source", "getsource", "html"],
  category: "Tools",
  description: "Download website as HTML file"
}, async (from, client, conText) => {
  const { reply, q, mek, isSuperUser } = conText;

  if (!isSuperUser) return reply("❌ Owner only!");

  if (!q) {
    return reply(`📌 *Download Website HTML*
    
Download any website as a complete HTML file.

*Usage:*
.inspect https://example.com

*Aliases:* .source, .getsource, .html`);
  }

  if (!/^https?:\/\//i.test(q)) {
    return reply("❌ Please provide a URL starting with http:// or https://");
  }

  try {
    

    const response = await axios.get(q, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    const html = response.data;

    // Save as HTML file
    const tempDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const fileName = `website_${Date.now()}.html`;
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, html);

    await client.sendMessage(from, {
      document: fs.readFileSync(filePath),
      mimetype: 'text/html',
      fileName: fileName,
      caption: `✅ *Website Downloaded*\n\n🌐 *URL:* ${q}\n📄 *Size:* ${html.length.toLocaleString()} bytes\n📁 *File:* ${fileName}`
    }, { quoted: mek });

    fs.unlinkSync(filePath);

  } catch (err) {
    console.error("inspect error:", err);
    await reply(`❌ Error: ${err.message}`);
  }
});

