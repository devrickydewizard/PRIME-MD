// PRIME plugin: Autobio.js command set (via lib/primeCompat).
// Commands PRIME already defines are skipped automatically.

const { pcmd } = require('../lib/primeCompat');
const axios = require('axios');

const fs = require('fs-extra');

const path = require('path');

const FormData = require('form-data');

const mime = require('mime-types');

const crypto = require('crypto');

const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const cheerio = require('cheerio');

function getMediaType(quoted) {
  if (quoted.imageMessage) return "image";
  if (quoted.videoMessage) return "video";
  if (quoted.stickerMessage) return "sticker";
  if (quoted.audioMessage) return "audio";
  if (quoted.documentMessage) return "document";
  return "unknown";
}

function getFileExtensionFromMimetype(mimetype) {
  if (!mimetype) return '';
  const ext = mime.extension(mimetype);
  return ext ? `.${ext}` : '';
}

async function saveMediaToTemp(client, quotedMedia, type, mimetype) {
  const tmpDir = path.join(__dirname, "..", "tmp");
  await fs.ensureDir(tmpDir);
  
  const extension = getFileExtensionFromMimetype(mimetype);
  const fileName = `${type}-${Date.now()}${extension}`;
  const filePath = path.join(tmpDir, fileName);
  
  const buffer = await downloadMediaMessage(
    { message: { [type + 'Message']: quotedMedia } },
    'buffer',
    {},
    { 
      reuploadRequest: client.updateMediaMessage,
      logger: console 
    }
  );
  
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function uploadToCatbox(filePath) {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('userhash', ''); 
  form.append('fileToUpload', buffer, {
    filename: path.basename(filePath),
    contentType: mime.lookup(filePath) || 'application/octet-stream'
  });

  const { data } = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  return data.trim(); 
}

async function uploadToPostimages(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // Get initial page and cookies
  const getRes = await axios.get('https://postimages.org/', { headers: baseHeaders });
  const html = getRes.data;
  const cookies = getRes.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';

  // Extract token
  const tokenMatch = html.match(/name="token"\s+value="([^"]+)"/i);
  const token = tokenMatch ? tokenMatch[1] : '';

  // Prepare form data
  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('token', token);
  form.append('upload_session', Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
  form.append('numfiles', '1');
  form.append('gallery', '');
  form.append('ui', '22');
  form.append('optsize', '0');
  form.append('expire', '0');
  form.append('cg', '1920x1080');
  form.append('file', fileBuffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

  // Upload
  const postRes = await axios.post('https://postimages.org/json', form, {
    headers: {
      ...baseHeaders,
      'Accept': 'application/json',
      'Cookie': cookies,
      'Origin': 'https://postimages.org',
      'Referer': 'https://postimages.org/',
      'X-Requested-With': 'XMLHttpRequest',
      ...form.getHeaders()
    }
  });

  const data = postRes.data;

  if (data.url) {
    const pageRes = await axios.get(data.url, { headers: baseHeaders });
    const pageHtml = pageRes.data;
    const $ = cheerio.load(pageHtml);
    
    const directUrl = $('#direct').val() || $('meta[property="og:image"]').attr('content');
    if (directUrl) {
      return directUrl;
    }
  }

  throw new Error("Failed to get direct URL from PostImages");
}

// (duplicate uploadToPostimages removed)

async function uploadToLitterbox(filePath) {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('time', '1h');
  form.append('fileNameLength', '16');
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buffer, {
    filename: path.basename(filePath),
    contentType: mime.lookup(filePath) || 'application/octet-stream'
  });

  const { data } = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  return data.trim();
}

async function uploadToUguu(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: mimeType
  });

  const response = await axios.post('https://uguu.se/upload.php', form, {
    headers: {
      ...form.getHeaders(),
      'origin': 'https://uguu.se',
      'referer': 'https://uguu.se/',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    }
  });

  const result = response.data;
  if (result.success && result.files?.[0]?.url) {
    return result.files[0].url;
  } else {
    throw new Error("Uguu upload failed or malformed response");
  }
}

async function uploadToImgBB(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }

  const ext = path.extname(filePath) || '.jpg';
  const form = new FormData();
  form.append('source', fs.createReadStream(filePath), {
    filename: `image-${Date.now()}${ext}`
  });
  form.append('type', 'file');
  form.append('action', 'upload');

  const { data } = await axios({
    method: 'POST',
    url: 'https://imgbb.com/json',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Referer': 'https://imgbb.com/',
      'Origin': 'https://imgbb.com',
      ...form.getHeaders()
    },
    data: form
  });

  if (!data?.image?.url) {
    throw new Error('Upload failed');
  }

  return data.image.url;
}

async function uploadToUploadF(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));

  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://uploadf.com',
    'Referer': 'https://uploadf.com/id/',
    'X-Requested-With': 'XMLHttpRequest',
    ...formData.getHeaders()
  };

  const response = await axios.post('https://uploadf.com/fileup.php', formData, {
    headers: headers,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.data.FLG === true || response.data.FLG === "true") {
    return 'https://uploadf.com/file/' + response.data.NAME;
  } else {
    throw new Error("UploadF upload failed: " + JSON.stringify(response.data));
  }
}

async function uploadToGoFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const buffer = await fs.readFile(filePath);
  
  const { data: accountData } = await axios.post('https://api.gofile.io/accounts', {}, {
    headers: {
      origin: 'https://gofile.io',
      referer: 'https://gofile.io/',
      'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
    }
  });
  
  if (!accountData?.data?.token) throw new Error('Failed to create account on GoFile.');
  
  const { data: folderData } = await axios.post('https://api.gofile.io/contents/createfolder', {
    parentFolderId: accountData.data.rootFolder,
    public: true
  }, {
    headers: {
      authorization: `Bearer ${accountData.data.token}`,
      origin: 'https://gofile.io',
      referer: 'https://gofile.io/',
      'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
    }
  });
  
  if (!folderData?.data?.id) throw new Error('Failed to create folder on GoFile.');
  
  const form = new FormData();
  form.append('token', accountData.data.token);
  form.append('folderId', folderData.data.id);
  form.append('file', buffer, `${Date.now()}_${path.basename(filePath)}`);
  
  const { data: uploadData } = await axios.post('https://upload.gofile.io/uploadfile', form, {
    headers: {
      ...form.getHeaders(),
      host: 'upload.gofile.io',
      origin: 'https://gofile.io',
      referer: 'https://gofile.io/',
      'user-agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  
  if (uploadData?.data?.downloadPage) {
    return uploadData.data.downloadPage;
  } else {
    throw new Error("GoFile upload failed: " + JSON.stringify(uploadData));
  }
}

async function uploadToAWS(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");
  
  const buffer = await fs.readFile(filePath);
  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const ext = path.extname(filePath).slice(1) || 'bin';
  const filename = `${Date.now()}.${ext}`;
  
  const { data } = await axios.post('https://llamacoder.together.ai/api/s3-upload', {
    filename,
    filetype: mimeType,
    _nextS3: { strategy: 'aws-sdk' }
  });
  
  const { region, bucket, key } = data;
  const { AccessKeyId, SecretAccessKey, SessionToken } = data.token.Credentials;
  
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  
  const canonicalHeaders = `content-type:${mimeType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\nx-amz-security-token:${SessionToken}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
  const canonicalRequest = `PUT\n/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
  
  const signingKey = ['aws4_request', 's3', region, dateStamp].reduceRight((acc, val) => crypto.createHmac('sha256', acc).update(val).digest(), `AWS4${SecretAccessKey}`);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${AccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  await axios.put(`https://${host}/${key}`, buffer, {
    headers: {
      authorization: authorization,
      'content-type': mimeType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'x-amz-security-token': SessionToken
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  
  return `https://${host}/${key}`;
}

async function uploadToFreeImageHost(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");
  
  const buffer = await fs.readFile(filePath);
  const mimeType = mime.lookup(filePath) || 'image/jpeg';
  const ext = path.extname(filePath).slice(1) || 'jpg';
  const filename = `${Date.now()}.${ext}`;
  
  const { data: html, headers } = await axios.get('https://freeimage.host/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
    }
  });
  
  const token = html.match(/auth_token\s*=\s*["']([a-f0-9]+)["']/)?.[1];
  if (!token) throw new Error('Failed to extract auth_token from FreeImage.Host');
  
  const form = new FormData();
  form.append('source', buffer, filename);
  form.append('type', 'file');
  form.append('action', 'upload');
  form.append('timestamp', Date.now().toString());
  form.append('auth_token', token);
  
  const { data } = await axios.post('https://freeimage.host/json', form, {
    headers: {
      ...form.getHeaders(),
      cookie: headers['set-cookie'].join('; '),
      origin: 'https://freeimage.host',
      referer: 'https://freeimage.host/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  
  if (data?.image?.image?.url) {
    return data.image.image.url;
  }
  
  throw new Error("FreeImage.Host upload failed: " + JSON.stringify(data));
}

async function uploadToPone(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const form = new FormData();
  form.append("files[]", fs.createReadStream(filePath), {
    filename: path.basename(filePath)
  });

  const { data } = await axios.post('https://pone.rs/upload.php', form, {
    headers: {
      ...form.getHeaders(),
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
      "accept": "*/*",
      "origin": "https://pone.rs",
      "referer": "https://pone.rs/"
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  if (data?.success && data?.files?.[0]?.url) {
    return data.files[0].url.replaceAll("\\/", "/");
  } else {
    throw new Error("Pone.rs upload failed: " + JSON.stringify(data));
  }
}

async function uploadToKappa(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    filename: path.basename(filePath)
  });

  const { data } = await axios.post('https://kappa.lol/api/upload', form, {
    headers: {
      ...form.getHeaders(),
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
      "Accept": "*/*",
      "Origin": "https://kappa.lol",
      "Referer": "https://kappa.lol/"
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  // Handle case where response might be a string
  const parsedData = typeof data === "string" ? JSON.parse(data) : data;
  
  if (parsedData?.link) {
    return parsedData.link;
  } else {
    throw new Error("Kappa.lol upload failed: " + JSON.stringify(parsedData));
  }
}

async function uploadToShz(filePath, expire = "1d") {
  if (!fs.existsSync(filePath)) throw new Error("File does not exist");

  // Parse expire time
  function parseExpireToSeconds(expire = "7d") {
    const text = String(expire).trim().toLowerCase();
    const match = text.match(/^(\d+(?:\.\d+)?)(s|m|h|d)?$/);

    if (!match) return 7 * 86400;

    const value = Number(match[1]);
    const unit = match[2] || "s";

    const seconds = {
      s: value,
      m: value * 60,
      h: value * 3600,
      d: value * 86400
    }[unit];

    return Math.min(Math.floor(seconds), 90 * 86400);
  }

  function secondsToExpire(seconds) {
    if (seconds % 86400 === 0) return `${seconds / 86400}d`;
    if (seconds % 3600 === 0) return `${seconds / 3600}h`;
    if (seconds % 60 === 0) return `${seconds / 60}m`;
    return `${seconds}s`;
  }

  function getNormalUrl(url) {
    const parsed = new URL(url);
    const name = parsed.pathname.replace(/^\/+/, "");
    return `https://shz.al/d/${name}`;
  }

  const expireSeconds = parseExpireToSeconds(expire);
  const finalExpire = secondsToExpire(expireSeconds);

  const form = new FormData();
  form.append("c", fs.createReadStream(filePath), {
    filename: path.basename(filePath)
  });
  form.append("e", finalExpire);

  const { data } = await axios.post('https://shz.al', form, {
    headers: {
      ...form.getHeaders(),
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
      "Accept": "*/*",
      "Origin": "https://shz.al",
      "Referer": "https://shz.al/"
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  const parsedData = typeof data === "string" ? JSON.parse(data) : data;
  
  if (parsedData?.url) {
    return getNormalUrl(parsedData.url);
  } else {
    throw new Error("Shz.al upload failed: " + JSON.stringify(parsedData));
  }
}

pcmd({
  pattern: "shz",
  aliases: ["shzal", "shzupload"],
  description: "Upload quoted media to Shz.al with custom expiry",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply, args } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  // Get custom expiry from args (optional)
  const expire = args?.[0] || "1d";
  
  // Validate expiry format
  const validExpire = /^(\d+(?:\.\d+)?)(s|m|h|d)?$/.test(expire);
  if (!validExpire) {
    return reply("❌ Invalid expiry format. Use: 30s, 5m, 2h, 1d (max 90d)");
  }

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToShz(filePath, expire);
    await reply(link); // Only returns the URL
  } catch (err) {
    console.error("Shz.al upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "kappa",
  aliases: ["kappalol", "kappaupload"],
  description: "Upload quoted media to Kappa.lol",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToKappa(filePath);
    await reply(link); // Only returns the URL
  } catch (err) {
    console.error("Kappa.lol upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "url",
  aliases: ["pone", "upload"],
  description: "Upload quoted media to Pone.rs",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToPone(filePath);
    await reply(link); // Only returns the URL
  } catch (err) {
    console.error("Pone.rs upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "postimage",
  aliases: ["pimg", "pi"],
  description: "Upload quoted image to PostImages.org",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image to upload.");

  const type = getMediaType(quotedMsg);
  if (type !== "image") return reply("❌ PostImages only supports images.");

  const mediaNode = quotedMsg.imageMessage;
  const mimetype = mediaNode.mimetype;

  if (!mediaNode) return reply("❌ Could not extract image content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToPostimages(filePath);
    await reply(link);
  } catch (err) {
    console.error("PostImages upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "freeimage",
  aliases: ["fih", "freeimagehost"],
  description: "Upload quoted media to FreeImage.Host",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image to upload.");

  const type = getMediaType(quotedMsg);
  if (type !== "image") return reply("❌ FreeImage.Host only supports images.");

  const mediaNode = quotedMsg.imageMessage;
  const mimetype = mediaNode.mimetype;

  if (!mediaNode) return reply("❌ Could not extract image content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToFreeImageHost(filePath);
    await reply(link);
  } catch (err) {
    console.error("FreeImage.Host upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "aws",
  aliases: ["s3upload", "awsupload"],
  description: "Upload quoted media to AWS S3",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToAWS(filePath);
    await reply(link);
  } catch (err) {
    console.error("AWS S3 upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "gofile",
  aliases: ["gf", "gofileupload"],
  description: "Upload quoted media to GoFile.io",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToGoFile(filePath);
    await reply(link);
  } catch (err) {
    console.error("GoFile upload error:", err);
    await reply("❌ Failed to upload to GoFile. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "uploadf",
  aliases: ["uf", "uploadfcom"],
  description: "Upload quoted media to UploadF.com",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToUploadF(filePath);
    await reply(link);
  } catch (err) {
    console.error("UploadF upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "uguu",
  aliases: ["uguupload", "uguurl"],
  description: "Upload quoted media/document to Uguu.se",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToUguu(filePath);
    await reply(link);
  } catch (err) {
    console.error("Uguu upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "imgbb",
  aliases: ["uploader", "urlconvert"],
  description: "Convert quoted media to Catbox URL",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image.");

  const type = getMediaType(quotedMsg);
  if (type !== "image") return reply("❌ Only images are supported.");

  const mediaNode = quotedMsg.imageMessage;
  const mimetype = mediaNode.mimetype;

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToImgBB(filePath);
    await client.sendMessage(from, { text: link }, { quoted: mek });
  } catch (err) {
    console.error("ImgBB upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "catbox",
  aliases: ["upload", "urlconvert"],
  description: "Convert quoted media to Catbox URL",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToCatbox(filePath);
    await client.sendMessage(from, { text: link }, { quoted: mek });
  } catch (err) {
    console.error("Catbox upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

pcmd({
  pattern: "litterbox",
  aliases: ["litupload", "tempurl"],
  description: "Convert quoted media to Litterbox temporary URL",
  category: "Uploader",
  filename: __filename
}, async (from, client, conText) => {
  const { mek, quoted, quotedMsg, reply } = conText;

  if (!quotedMsg) return reply("📌 Please quote an image, video, audio, sticker, or document to upload.");

  const type = getMediaType(quotedMsg);
  if (type === "unknown") return reply("❌ Unsupported media type.");

  let mediaNode;
  let mimetype = '';
  
  if (type === "image") {
    mediaNode = quotedMsg.imageMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "video") {
    mediaNode = quotedMsg.videoMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "audio") {
    mediaNode = quotedMsg.audioMessage;
    mimetype = mediaNode.mimetype;
  }
  else if (type === "sticker") {
    mediaNode = quotedMsg.stickerMessage;
    mimetype = mediaNode.mimetype || 'image/webp';
  }
  else if (type === "document") {
    mediaNode = quotedMsg.documentMessage;
    mimetype = mediaNode.mimetype;
  }

  if (!mediaNode) return reply("❌ Could not extract media content.");

  let filePath;
  try {
    filePath = await saveMediaToTemp(client, mediaNode, type, mimetype);
    const link = await uploadToLitterbox(filePath);
    await reply(link);
  } catch (err) {
    console.error("Litterbox upload error:", err);
    await reply("❌ Failed to upload. Error:\n" + err.message);
  } finally {
    if (filePath && await fs.pathExists(filePath)) {
      try { await fs.unlink(filePath); } catch (e) { console.error("unlink error:", e); }
    }
  }
});

