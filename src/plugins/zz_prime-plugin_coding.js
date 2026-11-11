// PRIME plugin: Coding.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { node, python, cpp, c, java} = require('compile-run');

const { pcmd } = require('../lib/primeCompat');
const zlib = require('zlib');

const axios = require('axios');

const fs = require('fs-extra');

const path = require('path');

pcmd({
  pattern: "time",
  aliases: ["now", "clock"],
  category: "coding",
  description: "Get the current time in a provided timezone, listed format"
},
async (from, client, conText) => {
  const { q, reply } = conText;

  if (!q) {
    return reply("📌 Please provide a timezone.\nExample: time Africa/Nairobi");
  }

  try {
    const now = new Date();

    const formatterDate = new Intl.DateTimeFormat('en-US', {
      timeZone: q.trim(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const formatterTime = new Intl.DateTimeFormat('en-US', {
      timeZone: q.trim(),
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const dateStr = formatterDate.format(now);
    const timeStr = formatterTime.format(now);

    const output = `🕒 Current time ${q.trim()}\n${dateStr},\n${timeStr}`;

    await reply(output);
  } catch (error) {
    console.error("Time command error:", error);
    reply("⚠️ Invalid timezone. Please provide a valid IANA timezone like Africa/Nairobi or America/New_York.");
  }
});

pcmd({
  pattern: "encrypt2",
  aliases: ["byte", "obfuscate3", "enc2", "obfu2", "obf2"],
  description: "Encrypt JavaScript code via API",
  category: "coding",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply, q, api } = conText;

  try {
    
    let code = q;
    if (quotedMsg && quotedMsg.conversation) {
      code = quotedMsg.conversation;
    }
    if (!code) {
      return reply("❌ Provide JavaScript code or quote a message containing code.\nExample: .encryptjs console.log('hi')");
    }

    
    const apiUrl = `${api}/tools/encrypt2?q=${encodeURIComponent(code)}`;
    const { data } = await axios.get(apiUrl);

    if (!data?.status || !data?.result) {
      return reply("❌ Encryption failed.");
    }

    const encryptedCode = data.result;

    
    const tmpDir = path.join(__dirname, "..", "tmp");
    await fs.ensureDir(tmpDir);
    const filePath = path.join(tmpDir, `encrypted-${Date.now()}.js`);
    await fs.writeFile(filePath, encryptedCode, "utf8");

  
    await client.sendMessage(from, {
      document: { url: filePath },
      mimetype: "application/javascript",
      fileName: "bytehide.js"
    }, { quoted: mek });


    try { fs.unlinkSync(filePath); } catch {}
  } catch (err) {
    console.error("encrypt2 error:", err);
    await reply("❌ Error: " + err.message);
  }
});

pcmd({
  pattern: "encrypt",
  aliases: ["preemptive", "obfuscate", "enc", "obfu", "obf"],
  description: "Encrypt JavaScript code via API",
  category: "coding",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply, q, api } = conText;

  try {
    
    let code = q;
    if (quotedMsg && quotedMsg.conversation) {
      code = quotedMsg.conversation;
    }
    if (!code) {
      return reply("❌ Provide JavaScript code or quote a message containing code.\nExample: .encryptjs console.log('hi')");
    }

    
    const apiUrl = `${api}/tools/encrypt?q=${encodeURIComponent(code)}`;
    const { data } = await axios.get(apiUrl);

    if (!data?.status || !data?.result) {
      return reply("❌ Encryption failed.");
    }

    const encryptedCode = data.result;

    
    const tmpDir = path.join(__dirname, "..", "tmp");
    await fs.ensureDir(tmpDir);
    const filePath = path.join(tmpDir, `encrypted-${Date.now()}.js`);
    await fs.writeFile(filePath, encryptedCode, "utf8");

  
    await client.sendMessage(from, {
      document: { url: filePath },
      mimetype: "application/javascript",
      fileName: "preemptive.js"
    }, { quoted: mek });


    try { fs.unlinkSync(filePath); } catch {}
  } catch (err) {
    console.error("encrypt error:", err);
    await reply("❌ Error: " + err.message);
  }
});

pcmd({
  pattern: "dhex",
  aliases: ["fromhex", "decodehex"],
  category: "coding",
  description: "Decode hexadecimal string back into text"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let encoded;
  if (q) {
    encoded = q;
  } else if (quotedMsg) {
    encoded = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!encoded) {
      return reply("❌ Could not extract quoted hex text.");
    }
  } else {
    return reply("📌 Reply to a hex message or provide hex directly.");
  }

  try {
    const decodedText = Buffer.from(encoded, 'hex').toString('utf-8');
    await reply(decodedText);
  } catch (error) {
    console.error("Hex decode error:", error);
    reply("⚠️ An error occurred while decoding hex.");
  }
});

pcmd({
  pattern: "hex",
  aliases: ["tohex", "encodehex"],
  category: "coding",
  description: "Encode text or quoted message into hexadecimal"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let text;
  if (q) {
    text = q;
  } else if (quotedMsg) {
    text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) {
      return reply("❌ Could not extract quoted text.");
    }
  } else {
    return reply("📌 Reply to a message with text or provide text directly.");
  }

  try {
    const encodedHex = Buffer.from(text, 'utf-8').toString('hex');
    await reply(encodedHex);
  } catch (error) {
    console.error("Hex encode error:", error);
    reply("⚠️ An error occurred while encoding to hex.");
  }
});

pcmd({
  pattern: "urldecode",
  aliases: ["decodeurl", "urldec"],
  category: "coding",
  description: "Decode URL-encoded string back into text"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let encoded;
  if (q) {
    encoded = q;
  } else if (quotedMsg) {
    encoded = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!encoded) {
      return reply("❌ Could not extract quoted encoded text.");
    }
  } else {
    return reply("📌 Reply to a URL-encoded message or provide encoded text directly.");
  }

  try {
    const decodedText = decodeURIComponent(encoded);
    await reply(decodedText);
  } catch (error) {
    console.error("URL decode error:", error);
    reply("⚠️ An error occurred while decoding URL.");
  }
});

pcmd({
  pattern: "urlencode",
  aliases: ["encodeurl", "urlenc"],
  category: "coding",
  description: "Encode text or quoted message into URL-safe format"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let text;
  if (q) {
    text = q;
  } else if (quotedMsg) {
    text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) {
      return reply("❌ Could not extract quoted text.");
    }
  } else {
    return reply("📌 Reply to a message with text or provide text directly.");
  }

  try {
    const encodedText = encodeURIComponent(text);
    await reply(encodedText);
  } catch (error) {
    console.error("URL encode error:", error);
    reply("⚠️ An error occurred while encoding URL.");
  }
});

pcmd({
  pattern: "runjava",
  aliases: ["runjava", "execjava"],
  category: "coding",
  description: "Execute Java code using compile-run"
}, async (from, client, conText) => {
  const { q, reply } = conText;

  if (!q) {
    return reply("❌ Please provide Java code to run.\nExample: runJava public class Main{public static void main(String[] args){System.out.println(2+3);}}");
  }

  try {
    const result = await java.runSource(q);

    if (result.stderr) {
      return reply(result.stderr);
    }

    await reply(result.stdout || "No output");
  } catch (err) {
    console.error("Java run error:", err);
  }
});

pcmd({
  pattern: "runc",
  aliases: ["runc", "execc"],
  category: "coding",
  description: "Execute C code using compile-run"
}, async (from, client, conText) => {
  const { q, reply } = conText;

  if (!q) {
    return reply("❌ Please provide C code to run.\nExample: runC #include <stdio.h>\nint main(){printf(\"%d\",2+3);}");
  }

  try {
    const result = await c.runSource(q);

    if (result.stderr) {
      return reply(result.stderr);
    }

    await reply(result.stdout || "No output");
  } catch (err) {
    console.error("C run error:", err);
  }
});

pcmd({
  pattern: "runcpp",
  aliases: ["runcpp", "execcpp"],
  category: "coding",
  description: "Execute C++ code using compile-run"
}, async (from, client, conText) => {
  const { q, reply } = conText;

  if (!q) {
    return reply("❌ Please provide C++ code to run.\nExample: runCpp #include <iostream>\nint main(){std::cout<<2+3;}");
  }

  try {
    const result = await cpp.runSource(q);

    if (result.stderr) {
      return reply(result.stderr);
    }

    await reply(result.stdout || "No output");
  } catch (err) {
    console.error("C++ run error:", err);
  }
});

pcmd({
  pattern: "unbase64",
  aliases: ["decode64", "frombase64"],
  category: "coding",
  description: "Decode Base64 string back into text"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let encoded;
  if (q) {
    encoded = q;
  } else if (quotedMsg) {
    encoded = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!encoded) {
      return reply("❌ Could not extract quoted Base64 text.");
    }
  } else {
    return reply("📌 Reply to a Base64 message or provide Base64 directly.");
  }

  try {
    const decodedText = Buffer.from(encoded, 'base64').toString('utf-8');
    await reply(decodedText);
  } catch (error) {
    console.error("Base64 decode error:", error);
    reply("⚠️ An error occurred while decoding Base64.");
  }
});

pcmd({
  pattern: "zlib",
  aliases: ["zb", "gzip"],
  category: "coding",
  description: "Compress text or quoted message using gzip"
},
async (from, client, conText) => {
  const { q, quotedMsg, reply } = conText;

  let text;
  if (q) {
    text = q;
  } else if (quotedMsg) {
    text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) {
      return reply("❌ Could not extract quoted text.");
    }
  } else {
    return reply("📌 Reply to a message with text or provide text directly.");
  }

  try {
    const compressed = zlib.gzipSync(text).toString('base64');
    await reply(compressed);
  } catch (error) {
    console.error("Gzip compression error:", error);
    reply("⚠️ An error occurred while compressing text with gzip.");
  }
});

pcmd({
  pattern: "dzlib",
  aliases: ["unzlib", "ungzip"],
  category: "coding",
  description: "Decompress gzip Base64 back into text"
},
async (from, client, conText) => {
  const { q, quotedMsg, reply } = conText;

  let compressed;
  if (q) {
    compressed = q;
  } else if (quotedMsg) {
    compressed = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!compressed) {
      return reply("❌ Could not extract quoted compressed text.");
    }
  } else {
    return reply("📌 Reply to a compressed message or provide compressed text directly.");
  }

  try {
    const decoded = zlib.gunzipSync(Buffer.from(compressed, 'base64')).toString();
    await reply(decoded);
  } catch (error) {
    console.error("Gzip decompression error:", error);
    reply("⚠️ An error occurred while decompressing gzip text.");
  }
});

pcmd({
  pattern: "base64",
  aliases: ["tobase64", "encode64"],
  category: "coding",
  description: "Encode text or quoted message into Base64"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let text;
  if (q) {
    text = q;
  } else if (quotedMsg) {
    text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) {
      return reply("❌ Could not extract quoted text.");
    }
  } else {
    return reply("📌 Reply to a message with text or provide text directly.");
  }

  try {
    const encodedText = Buffer.from(text).toString('base64');
    await reply(encodedText);
  } catch (error) {
    console.error("Base64 encode error:", error);
    reply("⚠️ An error occurred while encoding to Base64.");
  }
});

pcmd({
  pattern: "dbinary",
  aliases: ["frombinary", "decodebin"],
  category: "coding",
  description: "Decode binary string back into text"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let text;
  if (q) {
    text = q;
  } else if (quotedMsg) {
    text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) {
      return reply("❌ Could not extract quoted binary text.");
    }
  } else {
    return reply("📌 Reply to a binary message or provide binary directly.");
  }

  try {
    const textDecoded = text
      .split(' ')
      .map(bin => String.fromCharCode(parseInt(bin, 2)))
      .join('');

    await reply(textDecoded);
  } catch (error) {
    console.error("Binary decode error:", error);
    reply("⚠️ An error occurred while decoding binary.");
  }
});

pcmd({
  pattern: "binary",
  aliases: ["tobinary", "bin"],
  category: "coding",
  description: "Convert text or quoted message into binary representation"
},
async (from, client, conText) => {
  const { q, mek, quotedMsg, reply } = conText;

  let text;
  if (q) {
    text = q;
  } else if (quotedMsg) {
    text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
    if (!text) {
      return reply("❌ Could not extract quoted text.");
    }
  } else {
    return reply("📌 Reply to a message with text or provide text directly.");
  }

  try {
    const binaryText = text
      .split('')
      .map(char => `00000000${char.charCodeAt(0).toString(2)}`.slice(-8))
      .join(' ');

    await reply(binaryText);
  } catch (error) {
    console.error("Binary conversion error:", error);
    reply("⚠️ An error occurred while converting to binary.");
  }
});

pcmd({
  pattern: "runpy",
  aliases: ["runpython", "execpy"],
  category: "coding",
  description: "Execute Python code using compile-run"
}, async (from, client, conText) => {
  const { q, reply } = conText;

  if (!q) {
    return reply("❌ Please provide Python code to run.\nExample: runPython print(2+3)");
  }

  try {
    const result = await python.runSource(q);

    // Just reply with stdout or stderr directly
    if (result.stderr) {
      return reply(result.stderr);
    }

    await reply(result.stdout || "No output");
  } catch (err) {
    console.error("Python run error:", err);
  }
});

pcmd({
  pattern: "runjs",
  aliases: ["runjavascript", "execjs"],
  category: "coding",
  description: "Execute JavaScript code using compile-run"
}, async (from, client, conText) => {
  const { q, reply } = conText;

  if (!q) {
    return reply("❌ Please provide JavaScript code to run.\nExample: runJavaScript console.log(2+3)");
  }

  try {
    const result = await node.runSource(q);

    // Just reply with stdout or stderr directly
    if (result.stderr) {
      return reply(result.stderr);
    }

    await reply(result.stdout || "No output");
  } catch (err) {
    console.error("JavaScript run error:", err);
  }
});

