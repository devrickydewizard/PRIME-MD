const { generateWAMessageContent, generateMessageID, downloadMediaMessage, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const { cmd, getGroupMetadata } = require("../lib");
const axios = require('axios');
const cheerio = require('cheerio');

// ── Background colors ────────────────────────────────────────────────────────
const COLORS = {
  merah: 'FF0000',
  hijau: '00FF00',
  biru: '0000FF',
  kuning: 'FFFF00',
  hitam: '000000',
  putih: 'FFFFFF',
  ungu: '800080',
  pink: 'FFC0CB',
  orange: 'FFA500',
  cyan: '00FFFF',
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  blue: '1DA1F2',
  green: '25D366',
  yellow: 'FFD700',
  purple: '9B59B6',
  gray: '808080',
  navy: '001F5B'
};

const MIME = {
  vn: 'audio/mpeg',
  vid: 'video/mp4',
  img: 'image/jpeg',
};

const TYPE_MAP = {
  audioMessage: 'vn',
  videoMessage: 'vid',
  imageMessage: 'img',
  extendedTextMessage: 'txt',
  conversation: 'txt'
};

// ── Font IDs ─────────────────────────────────────────────────────────────────
const FONTS = {
  system: 0,
  sans: 1,
  serif: 2,
  script: 3,
  morning: 4,
  calistoga: 5,
  oswald: 6,
  courier: 7
};

function getRandomHexColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (match, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch (e) {
        return match;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch (e) {
        return match;
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

// ── Recursive Helper to Unwrap Ephemeral/View-Once Messages ───────────────
function getRealMessage(message) {
    if (!message) return null;
    if (message.ephemeralMessage) return getRealMessage(message.ephemeralMessage.message);
    if (message.viewOnceMessage) return getRealMessage(message.viewOnceMessage.message);
    if (message.viewOnceMessageV2) return getRealMessage(message.viewOnceMessageV2.message);
    if (message.viewOnceMessageV2Extension) return getRealMessage(message.viewOnceMessageV2Extension.message);
    if (message.documentWithCaptionMessage) return getRealMessage(message.documentWithCaptionMessage.message);
    return message;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 ROBUST SHELL-STYLE TOKENIZER
// ─────────────────────────────────────────────────────────────────────────────
function tokenize(input) {
  const tokens = [];
  if (!input) return tokens;

  let i = 0;
  const len = input.length;

  while (i < len) {
    // skip whitespace
    while (i < len && /\s/.test(input[i])) i++;
    if (i >= len) break;

    let token = '';
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      i++; // skip opening quote
      while (i < len && input[i] !== quote) {
        token += input[i];
        i++;
      }
      i++; // skip closing quote (if present)
    } else {
      while (i < len && !/\s/.test(input[i])) {
        token += input[i];
        i++;
      }
    }
    tokens.push(token);
  }

  return tokens;
}

/**
 * Parses swgc flags from a single source of truth (the raw command text).
 */
function parseSwgcFlags(rawText) {
  const tokens = tokenize(rawText);

  const result = {
    isSilent: false,
    customLink: null,
    useLinkPreview: false,
    textColor: null,
    bgColor: null,
    textFont: null,
    customName: null,
    customEmoji: null,
    customCaption: null,
    useAiBadge: false,
    isDebug: false,
    remaining: [], // tokens left over after stripping all recognized flags
  };

  const SILENT_FLAGS = new Set(['--s', '-s', '--silent', '-silent']);
  const LINK_FLAGS = new Set(['-link', '--link']);

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const lower = tok.toLowerCase();

    if (SILENT_FLAGS.has(lower)) {
      result.isSilent = true;
      i++;
      continue;
    }

    if (lower === '-ai') {
      result.useAiBadge = true;
      i++;
      continue;
    }

    if (lower === '-debug') {
      result.isDebug = true;
      i++;
      continue;
    }

    if (LINK_FLAGS.has(lower)) {
      const val = tokens[i + 1];
      result.useLinkPreview = true;
      if (val && /^https?:\/\//i.test(val)) {
        result.customLink = val;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (lower === '-color') {
      const val = tokens[i + 1];
      if (val !== undefined) {
        const key = val.toLowerCase();
        result.textColor = COLORS[key] || val;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (lower === '-bg') {
      const val = tokens[i + 1];
      if (val !== undefined) {
        const key = val.toLowerCase();
        let raw = COLORS[key] || val;
        if (!raw.startsWith('#')) raw = '#' + raw;
        result.bgColor = raw;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (lower === '-font') {
      const val = tokens[i + 1];
      if (val !== undefined) {
        const key = val.toLowerCase();
        let f = FONTS[key] !== undefined ? FONTS[key] : parseInt(val, 10);
        result.textFont = isNaN(f) ? null : f;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (lower === '-t') {
      const val = tokens[i + 1];
      if (val !== undefined) {
        result.customName = val;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (lower === '-e') {
      const val = tokens[i + 1];
      if (val !== undefined) {
        result.customEmoji = val;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (lower === '-c') {
      const val = tokens[i + 1];
      if (val !== undefined) {
        result.customCaption = val;
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    // not a recognized flag — keep it as part of the remaining text
    result.remaining.push(tok);
    i++;
  }

  return result;
}

/**
 * Basic SSRF guard for the -link preview feature.
 */
function isUnsafeLinkTarget(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!/^https?:$/.test(u.protocol)) return true;

    const host = u.hostname.toLowerCase();

    if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
    if (host === '169.254.169.254') return true;
    if (host.endsWith('.local')) return true;

    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }

    return false;
  } catch (e) {
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 LINK PREVIEW FETCHER
// ─────────────────────────────────────────────────────────────────────────────
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function extractMetaContent(html, propertyName) {
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${propertyName}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${propertyName}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

function isWhatsAppLink(urlStr) {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return host === 'chat.whatsapp.com' || host === 'wa.me' || host.endsWith('.whatsapp.com');
  } catch (e) {
    return false;
  }
}

async function downloadThumbnail(imgUrl, pageUrl) {
  try {
    let resolved = imgUrl;
    if (!/^https?:\/\//i.test(resolved)) {
      const base = new URL(pageUrl);
      resolved = new URL(resolved, base.origin).href;
    }
    if (isUnsafeLinkTarget(resolved)) return null;

    const proxyUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(resolved) + '&w=300&h=300&output=jpg';
    const imgRes = await axios.get(proxyUrl, {
      responseType: 'arraybuffer',
      timeout: 6000,
      maxContentLength: 5 * 1024 * 1024,
    });
    return Buffer.from(imgRes.data);
  } catch (e) {
    console.error('[SWGC] Thumbnail download failed:', e.message);
    return null;
  }
}

async function fetchLinkPreview(targetUrl) {
  const isWA = isWhatsAppLink(targetUrl);
  try {
    const res = await axios.get(targetUrl, {
      headers: BROWSER_HEADERS,
      timeout: 7000,
      maxContentLength: 3 * 1024 * 1024,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const html = typeof res.data === 'string' ? res.data : '';
    if (!html) return null;

    const $ = cheerio.load(html);
    const titleMatch = $('meta[property="og:title"]').attr('content') || 
                       $('meta[name="twitter:title"]').attr('content') || 
                       $('title').text() || targetUrl;
    const descMatch = $('meta[property="og:description"]').attr('content') || 
                      $('meta[name="description"]').attr('content') || 
                      $('meta[name="twitter:description"]').attr('content');
    const imgMatch = $('meta[property="og:image"]').attr('content') || 
                     $('meta[property="og:image:secure_url"]').attr('content') ||
                     $('meta[name="twitter:image"]').attr('content') || 
                     $('link[rel="image_src"]').attr('href') ||
                     $('meta[name="thumbnail"]').attr('content');

    const title = titleMatch ? decodeHtmlEntities(titleMatch).trim() : 'Link Preview';
    const description = descMatch ? decodeHtmlEntities(descMatch).trim() : '';

    let jpegThumbnail = null;
    if (imgMatch) {
      jpegThumbnail = await downloadThumbnail(imgMatch, targetUrl);
    }

    return {
      'matched-text': targetUrl,
      title,
      description,
      jpegThumbnail,
    };
  } catch (err) {
    console.error('[SWGC] Link preview crawl error:', err.message);
    if (isWA) {
      return {
        'matched-text': targetUrl,
        title: 'WhatsApp Group Invite',
        description: 'Tap to join via WhatsApp',
        jpegThumbnail: null,
      };
    }
    return null;
  }
}

/**
 * Send WhatsApp group status
 */
async function groupStatus(sock, jid, rawContent, useAiBadge, customName, customEmoji) {
  let waMsgContent;
  const isPreGenerated = !!(rawContent.extendedTextMessage || rawContent.imageMessage || rawContent.videoMessage || rawContent.audioMessage);

  if (isPreGenerated) {
    // Clone structures to avoid mutational side-effects across broadcast iterations, preserving Buffers
    waMsgContent = { ...rawContent };
    if (waMsgContent.message) {
      waMsgContent.message = { ...waMsgContent.message };
    }
  } else {
    const content = { ...rawContent };
    const { backgroundColor, textColor, textFont } = content;
    delete content.backgroundColor;
    delete content.textColor;
    delete content.textFont;

    const opts = { upload: sock.waUploadToServer };
    if (backgroundColor) opts.backgroundColor = backgroundColor;

    // Step 1: Generate WAMessageContent (upload media, etc.)
    waMsgContent = await generateWAMessageContent(content, opts);
    if (!waMsgContent) throw new Error('generateWAMessageContent failed to produce content');

    // Step 2: Apply formatting to newly generated inner message
    const innerMsg = waMsgContent.message || waMsgContent;
    if (innerMsg.extendedTextMessage) {
      if (textColor) {
        let hex = String(textColor).replace('#', '');
        if (hex.length === 6) hex = 'FF' + hex;
        innerMsg.extendedTextMessage.textArgb = parseInt(hex, 16);
      }
      if (textFont !== undefined && textFont !== null) {
        innerMsg.extendedTextMessage.font = textFont;
      }
    }
  }

  // Step 3: Find the actual message key and inject group status context V2
  const innerMsg = waMsgContent.message || waMsgContent;
  const msgKey = Object.keys(innerMsg).find(k => innerMsg[k] && typeof innerMsg[k] === 'object' && k !== 'messageContextInfo');
  if (msgKey) {
    // Clone the inner message block and contextInfo to prevent shared-state pollution
    innerMsg[msgKey] = { ...innerMsg[msgKey] };
    innerMsg[msgKey].contextInfo = { ...(innerMsg[msgKey].contextInfo || {}) };
    
    // ✅ FIX: remove any leaked newsletter annotations from generated media
    if (innerMsg[msgKey].annotations) {
      innerMsg[msgKey].annotations = innerMsg[msgKey].annotations.filter(
        ann => !ann.newsletter
      );
      if (!innerMsg[msgKey].annotations.length) {
        delete innerMsg[msgKey].annotations;
      }
    }
    if (innerMsg[msgKey].interactiveAnnotations) {
      innerMsg[msgKey].interactiveAnnotations = innerMsg[msgKey].interactiveAnnotations.filter(
        ann => !ann.newsletter
      );
    }

    // Keep isGroupStatus so the WhatsApp server doesn't drop the media
    innerMsg[msgKey].contextInfo.isGroupStatus = true;
    
    
    innerMsg[msgKey].contextInfo.featureEligibilities = {
  canReceiveMultiReact: true
};

    // Inject statusAttributions to make it render as a group story
    innerMsg[msgKey].contextInfo.statusAttributions = [
      {
        type: 10
      }
    ];

    // Inject V2 context for the group (audienceType: 1)
    innerMsg[msgKey].contextInfo.statusAudienceMetadata = {
      audienceType: 1,
      groupJid: jid
    };

    if (!innerMsg[msgKey].contextInfo.statusSourceType) {
      if (innerMsg.imageMessage) innerMsg[msgKey].contextInfo.statusSourceType = 0;
      else if (innerMsg.videoMessage) innerMsg[msgKey].contextInfo.statusSourceType = 1;
      else if (innerMsg.audioMessage) innerMsg[msgKey].contextInfo.statusSourceType = 3;
      else if (innerMsg.extendedTextMessage) innerMsg[msgKey].contextInfo.statusSourceType = 4;
    }

    if (customName) innerMsg[msgKey].contextInfo.statusAudienceMetadata.customName = customName;
    if (customEmoji) innerMsg[msgKey].contextInfo.statusAudienceMetadata.customEmoji = customEmoji;
  }

  // Step 4: Wrap in groupStatusMessageV2 and relay
  const finalMsg = { groupStatusMessageV2: { message: innerMsg } };
  const messageId = generateMessageID();
  const relayOpts = { messageId };

  // Include group members so WhatsApp accepts the group status post
  try {
    let meta = null;
    if (typeof getGroupMetadata === 'function') {
      meta = await getGroupMetadata(sock, jid);
    }
    if (!meta) {
      try { meta = await sock.groupMetadata(jid); } catch (_) {}
    }
    const participants = (meta && meta.participants) || [];
    const statusJidList = participants
      .map((p) => p.id || p.jid || p.pn || p.phoneNumber)
      .filter((x) => typeof x === 'string' && x.indexOf('@') !== -1);
    if (statusJidList.length) {
      relayOpts.statusJidList = statusJidList;
    }
  } catch (e) {
    console.error('[SWGC] statusJidList build failed:', e && e.message ? e.message : e);
  }

  if (useAiBadge) {
    relayOpts.additionalNodes = [{
      tag: 'bot',
      attrs: { biz_bot: '1' }
    }];
  }

  await sock.relayMessage(jid, finalMsg, relayOpts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run protobuf monkey-patch exactly once when this plugin file is loaded.
// ─────────────────────────────────────────────────────────────────────────────
(function patchContextInfoEncodeOnce() {
  try {
    const baileys = require('@whiskeysockets/baileys');
    const WAProto = baileys.proto || baileys.WAProto;

    if (!WAProto || !WAProto.ContextInfo) return;
    if (WAProto.ContextInfo.encode.hasGroupJid) return;

    const originalEncode = WAProto.ContextInfo.encode;
    WAProto.ContextInfo.encode = function (message, writer) {
      // Temporarily extract statusAudienceMetadata so any previous patches do not serialize it
      const meta = message.statusAudienceMetadata;
      if (meta) {
        delete message.statusAudienceMetadata;
      }

      writer = originalEncode(message, writer);

      // Tag 65: repeated StatusAttribution statusAttributions = 65;
      if (message.statusAttributions && message.statusAttributions.length) {
        for (let i = 0; i < message.statusAttributions.length; i++) {
          const attr = message.statusAttributions[i];
          writer.uint32(522).fork();
          if (attr.type != null) {
            writer.uint32(8).int32(attr.type);
          }
          if (attr.actionUrl != null) {
            writer.uint32(18).string(attr.actionUrl);
          }
          writer.ldelim();
        }
      }

      // Tag 66: optional bool isGroupStatus = 66;
      if (message.isGroupStatus != null) {
        writer.uint32(528).bool(message.isGroupStatus);
      }

      // Restore statusAudienceMetadata and serialize it properly with groupJid (tag 4)
      if (meta) {
        message.statusAudienceMetadata = meta;

        writer.uint32(554).fork();
        if (meta.audienceType != null) {
          writer.uint32(8).int32(meta.audienceType);
        }
        if (meta.customName) {
          writer.uint32(18).string(meta.customName);
        }
        if (meta.customEmoji) {
          writer.uint32(26).string(meta.customEmoji);
        }
        if (meta.groupJid) {
          writer.uint32(34).string(meta.groupJid);
        }
        writer.ldelim();
      }

      return writer;
    };
    WAProto.ContextInfo.encode.isPatched = true;
    WAProto.ContextInfo.encode.hasGroupJid = true;
  } catch (e) {
    console.error('[SWGC MONKEY PATCH ERROR]', e.message);
  }
})();

/**
 * Send a rich success confirmation message with blue tick status icon, footer, and fake channel.
 */
async function sendSuccessConfirmation(sock, from, msg, mediaType, config, participantCount) {
  try {
    const typeLabel = mediaType === 'img' ? 'Image' : mediaType === 'vid' ? 'Video' : mediaType === 'vn' ? 'Audio' : 'Text';
    const botName = config?.botName || 'PRIME-MD';

    const statusText = `> 📢 *S T A T U S   S E N T*
> ㅤ
> 📊 *Type:* _${typeLabel}_
> ㅤ
> _Status successfully published to group story!_`.trim();

    const safeParticipantCount = Math.min(Math.max(participantCount || 1, 1), 256);
    const dummyContacts = Array.from({ length: safeParticipantCount }, (_, i) => ({
      displayName: `M ${i}`,
      vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:M ${i}\nTEL;type=CELL;type=VOICE;waid=1000${i}:+1000${i}\nEND:VCARD`
    }));

    const fakeStatusQuote = {
      key: {
        fromMe: false,
        participant: '0@s.whatsapp.net',
        remoteJid: 'status@broadcast',
        id: 'STATUS-' + Math.random().toString(36).substring(2).toUpperCase()
      },
      message: {
        contactsArrayMessage: {
          displayName: `${botName}`,
          contacts: dummyContacts
        }
      }
    };

    const interactiveContent = {
      body: { text: statusText },
      footer: { text: `${botName} • Status Info` },
      nativeFlowMessage: {
        buttons: [
          {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
              display_text: 'Sukses',
              copy_code: 'Sukses'
            })
          }
        ]
      }
    };

    const msgContent = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: interactiveContent
        }
      }
    };

    const userJid = sock.authState?.creds?.me?.id || sock.user?.id;
    const fullMsg = generateWAMessageFromContent(from, msgContent, {
      userJid,
      quoted: fakeStatusQuote
    });

    const ifPath = fullMsg.message?.viewOnceMessage?.message?.interactiveMessage;
    if (ifPath) {
      ifPath.contextInfo = {
        ...(ifPath.contextInfo || {}),
        isForwarded: false,
        forwardingScore: 999,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363233827255152@newsletter',
          serverMessageId: 1,
          newsletterName: botName
        }
      };
    }

    const additionalNodes = [{
      tag: 'biz',
      attrs: {},
      content: [{
        tag: 'interactive',
        attrs: { v: '1', type: 'native_flow' },
        content: [{
          tag: 'native_flow',
          attrs: { v: '9', name: 'mixed' }
        }]
      }]
    }];

    await sock.relayMessage(from, fullMsg.message, {
      messageId: fullMsg.key.id,
      additionalNodes
    });

  } catch (err) {
    console.error('[SWGC CONFIRMATION ERROR DETAIL]', {
      message: err.message,
      protoExists: typeof proto !== 'undefined',
      interactiveMessageProtoExists: typeof proto !== 'undefined' && !!proto?.Message?.InteractiveMessage
    });
    try {
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
    } catch (e) {}
  }
}

// Anti-spam: 60 second cooldown per user for status uploads
const SWGC_COOLDOWN_MS = 60000;
const swgcCooldowns = new Map();

setInterval(() => {
  const cutoff = Date.now() - SWGC_COOLDOWN_MS;
  for (const [key, time] of swgcCooldowns) {
    if (time < cutoff) swgcCooldowns.delete(key);
  }
}, SWGC_COOLDOWN_MS);

function getUnsupportedFlagsWarning(type, flags) {
  const unsupported = [];

  if (type !== 'txt') {
    if (flags.textColor) unsupported.push('-color (text color only works on TEXT status)');
    if (flags.bgColor) unsupported.push('-bg (background color only works on TEXT status)');
    if (flags.textFont !== null && flags.textFont !== undefined) unsupported.push('-font (font only works on TEXT status)');
    if (flags.useLinkPreview) unsupported.push('-link (link preview only works on TEXT status)');
  }

  if (type === 'vn' && flags.customCaption) {
    unsupported.push('-c (voice notes/audio do not support captions on WhatsApp)');
  }

  if (!unsupported.length) return null;

  return `⚠️ *Some options were ignored* (not supported for this type):\n${unsupported.map(u => `• ${u}`).join('\n')}`;
}

const HELP_TEXT = (botPrefix) =>
`*📝 HOW TO USE:*
> 1. Send or pick a message *text/image/video/voice*
> 2. Reply to that message with \`${botPrefix}groupstatus\`

*⚙️ GLOBAL FLAGS - ALL TYPES*
> \`--s\` / \`-s\` / \`--silent\` *- Silent mode, no notification*
> \`-ai\` *- Add AI badge*
> \`-t "Name"\` *- Custom author name*
> \`-e "Emoji"\` *- Custom author emoji*
> \`-c "Caption"\` *- Custom caption for all except audio*

*🎨 TEXT ONLY FLAGS*
> \`-link [URL]\` / \`--link [URL]\` *- Force link preview*
> \`-color [hex/name]\` *- Text color*
> \`-bg [hex/name]\` *- Background color*
> \`-font [0-7]\` *- Change text font*

*💡 INFO*
> ℹ️ *Auto Preview:* URL in text = auto link preview. Use \`-link\` only to force different URL.

> ℹ️ *Quotes:* Use quotes for spaces: \`${botPrefix}groupstatus Hello -t "PRIME-MD"\`

> ℹ️ *Combo:* Flags can mix: \`${botPrefix}groupstatus -c "join" -e "🌷" -t "PRIME-MD" -ai --s https://example.com\`

> ℹ️ *Target Group:* Send to specific group: \`${botPrefix}groupstatus 120363xxxxxxxxx@g.us Hello there\``;

cmd(
  {
    pattern: 'groupstatus',
    aliases: ['gst', 'swgc'],
    react: '📢',
    category: "utility", // category bhi owner kar di
    description: 'Demo Group status (reply to media). OWNER ONLY. Add --s for silent mode. Add -color [hex] for text color. Link previews auto-detect from plain URLs.',
  },
  async (from, sock, conText) => {
    let { reply, react, isSuperUser, isGroup, q, mek, quotedMsg, formatAudio, formatVideo, botPrefix, botName } = conText;

    // 🕷️ OWNER ONLY CHECK - bilkul gstall jaisa
    if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

    const flags = parseSwgcFlags(q || '');

    const isSilent = flags.isSilent;
    const useLinkPreview = flags.useLinkPreview;
    const customLink = flags.customLink;
    const textColor = flags.textColor;
    const bgColor = flags.bgColor;
    const textFont = flags.textFont;
    let customName = flags.customName || botName || 'Premium Status';
    let customEmoji = flags.customEmoji || '🌷';
    const useAiBadge = flags.useAiBadge;

    // ✅ FIX: detect a target JID as its own token and strip it out of the
    // remaining tokens — previously, typing a JID with no reply/caption
    // (e.g. `.groupstatus 120363xxx@g.us`) made the JID itself become the
    // visible status text, because the same `cleanArgs` string was used
    // both to find the target group AND as the fallback caption. Now the
    // JID only ever controls routing and never leaks into the text.
    // Accept full JID or bare numeric group id
    const jidTokenIndex = flags.remaining.findIndex((tok) => {
      const t = String(tok || '').trim();
      if (t.endsWith('@g.us')) return true;
      if (/^[0-9]{10,22}$/.test(t)) return true;
      return false;
    });
    let explicitJid = jidTokenIndex !== -1 ? String(flags.remaining[jidTokenIndex]).trim() : null;
    if (explicitJid && !explicitJid.endsWith('@g.us') && /^[0-9]{10,22}$/.test(explicitJid)) {
      explicitJid = explicitJid + '@g.us';
    }
    const remainingWithoutJid = jidTokenIndex !== -1
      ? flags.remaining.filter((_, i) => i !== jidTokenIndex)
      : flags.remaining;

    const cleanArgs = remainingWithoutJid.join(' ').trim();
    const jid = explicitJid || from;
    const isTargetGroup = jid.endsWith('@g.us');

    let participantCount = 1;

    if (isTargetGroup) {
      try {
        let meta = null;
        if (typeof getGroupMetadata === 'function') {
          meta = await getGroupMetadata(sock, jid);
        } else {
          meta = await sock.groupMetadata(jid);
        }
        if (!meta || !meta.participants) {
          if (!isSilent) {
            await reply(
              '🙅‍♂️ Cannot post to that group.\n' +
              '• Check ID: `' + jid + '`\n' +
              '• Bot must be a *member* of the group\n' +
              '• Or run `.groupstatus` *inside* the group'
            );
          }
          return;
        }
        participantCount = meta.participants.length;
      } catch (err) {
        console.error('Error fetching group metadata for target:', err);
        if (!isSilent) {
          await reply(
            '🙅‍♂️ Failed to open group `' + jid + '`: ' + (err.message || String(err)) +
            '\nMake sure the bot is in that group.'
          );
        }
        return;
      }
    }

    const rawSender = mek.key.participant || mek.key.remoteJid;
    const sender = rawSender;

    if (!isSuperUser) {
      const lastUsed = swgcCooldowns.get(sender) || 0;
      const elapsed = Date.now() - lastUsed;
      if (elapsed < SWGC_COOLDOWN_MS) {
        if (!isSilent) {
          try {
            const remainingSec = Math.ceil((SWGC_COOLDOWN_MS - elapsed) / 1000);
            await react('⏳');
            await reply(`⏳ Wait *${remainingSec} seconds* before sending another status.`);
          } catch { }
        }
        return;
      }
    }

    const realQuoted = quotedMsg ? getRealMessage(quotedMsg) : null;

    if (!realQuoted && !cleanArgs && !flags.customCaption && !flags.customLink) {
      if (!isSilent) await reply(HELP_TEXT(botPrefix));
      return;
    }

    const mtype = realQuoted ? Object.keys(realQuoted).find(k => TYPE_MAP[k]) : null;
    const type = realQuoted ? TYPE_MAP[mtype] : 'txt';

    if (realQuoted && !type) {
      if (!isSilent) await reply('🙅‍♂️ Invalid media type!');
      return;
    }

    let captionText = '';
    if (flags.customCaption) {
      captionText = flags.customCaption;
    } else if (realQuoted) {
      captionText = realQuoted.conversation ||
             realQuoted.extendedTextMessage?.text ||
             realQuoted[mtype]?.caption ||
             '';
    } else {
      // ✅ FIX: this is `cleanArgs` with the JID already stripped out, so
      // a JID-only invocation never becomes the visible status text.
      captionText = cleanArgs;
    }

    const doc = {};

    if (type === 'txt') {
      doc.text = captionText || '';

      // 🆕 AUTO-DETECT: a plain URL inside the text/caption now triggers the
      // link preview automatically — the -link flag is only needed to force
      // an explicit/different URL. -link is still honored if given.
      const urlRegex = /https?:\/\/[^\s]+/i;
      const autoDetectedUrl = (captionText || '').match(urlRegex)?.[0] || null;
      const shouldPreview = useLinkPreview || !!customLink || !!autoDetectedUrl;

      if (shouldPreview) {
        let targetUrl = customLink || autoDetectedUrl;

        if (targetUrl && isUnsafeLinkTarget(targetUrl)) {
          console.error('[SWGC] Blocked unsafe link preview target:', targetUrl);
          targetUrl = null;
        }

        if (targetUrl) {
          if (!doc.text) {
            doc.text = targetUrl;
          } else if (!doc.text.includes(targetUrl)) {
            doc.text = `${doc.text}\n${targetUrl}`;
          }

          const preview = await fetchLinkPreview(targetUrl);
          if (preview) {
            doc.linkPreview = preview;
          } else {
            console.error('[SWGC] Link preview metadata unavailable:', targetUrl);
          }
        }
      }

      if (!doc.text && !doc.linkPreview) {
        doc.text = '(empty)';
      }
    } else {
      let buffer;
      try {
        if (!isSilent) {
          try {
            await react('⏳');
          } catch { }
        }

        const contextInfo = mek.message?.extendedTextMessage?.contextInfo || {};
        const quotedKey = {
          remoteJid: from,
          fromMe: contextInfo.participant === sock.user?.id || false,
          id: contextInfo.stanzaId || mek.key.id,
          participant: contextInfo.participant || mek.key.participant || mek.key.remoteJid
        };

        const mediaMsg = {
          key: quotedKey,
          message: { [mtype]: realQuoted[mtype] }
        };

        buffer = await downloadMediaMessage(
          mediaMsg,
          'buffer',
          {},
          {
            logger: console,
            reuploadRequest: sock.updateMediaMessage
          }
        );
      } catch (err) {
        console.error('[SWGC] Failed to download media:', err);
        if (!isSilent) {
          try {
            await react('🙅‍♂️');
          } catch { }
        }
        return;
      }

      if (!buffer || buffer.length === 0) {
        if (!isSilent) {
          try {
            await react('🙅‍♂️');
          } catch { }
        }
        return;
      }

      if (type === 'vn') {
        if (formatAudio) buffer = await formatAudio(buffer);
        doc.audio = buffer;
      } else if (type === 'vid') {
        if (formatVideo) buffer = await formatVideo(buffer);
        doc.video = buffer;
        doc.caption = captionText;
      } else if (type === 'img') {
        doc.image = buffer;
        doc.caption = captionText;
      }

      doc.mimetype = MIME[type];
    }

    try {
      if (type === 'txt' && !isSilent) {
        try {
          await react('⏳');
        } catch { }
      }

      await groupStatus(sock, jid, {
        ...doc,
        textColor: textColor,
        textFont: textFont,
        backgroundColor: bgColor || getRandomHexColor()
      }, useAiBadge, customName, customEmoji);

      const unsupportedWarning = getUnsupportedFlagsWarning(type, flags);
      if (unsupportedWarning && !isSilent) {
        try { await reply(unsupportedWarning); } catch {}
      }

      swgcCooldowns.set(sender, Date.now());

      if (isSilent) {
        try {
          await sock.sendMessage(from, { delete: mek.key });
        } catch (delErr) {
          console.error('[SWGC] Failed to delete command message (silent):', delErr);
        }
      } else {
        try {
          await sendSuccessConfirmation(sock, from, mek, type, { botName }, participantCount);
          try {
            await react('✅');
          } catch (rErr) {}
        } catch (confErr) {
          console.error('[SWGC] Failed to send confirmation:', confErr);
          try {
            await react('✅');
          } catch (rErr) {}
        }
      }
    } catch (e) {
      console.error('[SWGC ERROR]', e);
      if (!isSilent) {
        try {
          await react('🙅‍♂️');
          await reply(`🙅‍♂️ Failed to send status: ${e.message}`);
        } catch { }
      }
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 SWGCALL
// ─────────────────────────────────────────────────────────────────────────────
let swgcallRunning = false;

function randomDelayMs(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

cmd(
  {
    pattern: 'groupstatusall',
    aliases: ['gstall', 'swgcall'],
    react: '📡',
    category: "utility",
    description: 'Demo Broadcast a group status to ALL groups the bot is in, with safe randomized delays (OWNER ONLY). Link previews auto-detect from plain URLs.',
  },
  async (from, sock, conText) => {
    const { reply, react, isSuperUser, q, mek, quotedMsg, formatAudio, formatVideo, botPrefix, botName } = conText;

    if (!isSuperUser) {
      return reply('*This area is reserved for the bot owner only.* 🕷️');
    }

    if (swgcallRunning) {
      return reply('⏳ Another broadcast is already running. Wait for it to finish before starting a new one.');
    }

    const flags = parseSwgcFlags(q || '');
    const isSilent = flags.isSilent;
    const useLinkPreview = flags.useLinkPreview;
    const customLink = flags.customLink;
    const textColor = flags.textColor;
    const bgColor = flags.bgColor;
    const textFont = flags.textFont;
    let customName = flags.customName || botName || 'Premium Status';
    let customEmoji = flags.customEmoji || '🌷';
    const useAiBadge = flags.useAiBadge;
    const cleanArgs = flags.remaining.join(' ').trim();

    const realQuoted = quotedMsg ? getRealMessage(quotedMsg) : null;

    if (!realQuoted && !cleanArgs && !flags.customCaption && !flags.customLink) {
      return reply(HELP_TEXT(botPrefix) + `\n\nℹ️ Use ${botPrefix}demoswgcall2 to broadcast to all groups.\nℹ️ Add -debug to see a live per-group send result in chat (in addition to console logs).`);
    }

    const mtype = realQuoted ? Object.keys(realQuoted).find(k => TYPE_MAP[k]) : null;
    const type = realQuoted ? TYPE_MAP[mtype] : 'txt';

    if (realQuoted && !type) {
      return reply('🙅‍♂️ Invalid media type!');
    }

    let captionText = '';
    if (flags.customCaption) {
      captionText = flags.customCaption;
    } else if (realQuoted) {
      captionText = realQuoted.conversation ||
             realQuoted.extendedTextMessage?.text ||
             realQuoted[mtype]?.caption ||
             '';
    } else {
      captionText = cleanArgs;
    }

    const baseDoc = {};

    if (type === 'txt') {
      baseDoc.text = captionText || '';

      // 🆕 AUTO-DETECT: same behavior as .groupstatus — a plain URL in the text
      // triggers the preview automatically, -link only needed to override.
      const autoDetectedUrl = (captionText || '').match(/https?:\/\/[^\s]+/i)?.[0] || null;
      const shouldPreview = useLinkPreview || !!customLink || !!autoDetectedUrl;

      if (shouldPreview) {
        let targetUrl = customLink || autoDetectedUrl;
        if (targetUrl && isUnsafeLinkTarget(targetUrl)) {
          console.error('[SWGCALL] Blocked unsafe link preview target:', targetUrl);
          targetUrl = null;
        }
        if (targetUrl) {
          if (!baseDoc.text) {
            baseDoc.text = targetUrl;
          } else if (!baseDoc.text.includes(targetUrl)) {
            baseDoc.text = `${baseDoc.text}\n${targetUrl}`;
          }

          const preview = await fetchLinkPreview(targetUrl);
          if (preview) {
            baseDoc.linkPreview = preview;
          }
        }
      }

      if (!baseDoc.text && !baseDoc.linkPreview) {
        baseDoc.text = '(empty)';
      }
    } else {
      let buffer;
      try {
        const contextInfo = mek.message?.extendedTextMessage?.contextInfo || {};
        const quotedKey = {
          remoteJid: from,
          fromMe: contextInfo.participant === sock.user?.id || false,
          id: contextInfo.stanzaId || mek.key.id,
          participant: contextInfo.participant || mek.key.participant || mek.key.remoteJid
        };
        const mediaMsg = { key: quotedKey, message: { [mtype]: realQuoted[mtype] } };
        buffer = await downloadMediaMessage(mediaMsg, 'buffer', {}, {
          logger: console,
          reuploadRequest: sock.updateMediaMessage
        });
      } catch (err) {
        console.error('[SWGCALL] Failed to download media:', err);
        return reply('🙅‍♂️ Failed to download media for broadcast.');
      }

      if (!buffer || buffer.length === 0) {
        return reply('🙅‍♂️ Media is empty, broadcast cancelled.');
      }

      if (type === 'vn') {
        if (formatAudio) buffer = await formatAudio(buffer);
        baseDoc.audio = buffer;
      } else if (type === 'vid') {
        if (formatVideo) buffer = await formatVideo(buffer);
        baseDoc.video = buffer;
        baseDoc.caption = captionText;
      } else if (type === 'img') {
        baseDoc.image = buffer;
        baseDoc.caption = captionText;
      }
      baseDoc.mimetype = MIME[type];
    }

    console.log('[SWGCALL][DEBUG] Starting group fetch...');
    let allGroups = {};

    // 1. Try to load groups from the local memory groupCache first
    try {
      const { groupCache } = require("../lib/connection/groupCache");
      if (groupCache) {
        if (typeof groupCache.keys === 'function') {
          for (const key of groupCache.keys()) {
            if (key.endsWith('@g.us')) {
              allGroups[key] = groupCache.get(key) || { id: key };
            }
          }
        } else if (typeof groupCache === 'object') {
          for (const key in groupCache) {
            if (key.endsWith('@g.us')) {
              allGroups[key] = groupCache[key] || { id: key };
            }
          }
        }
      }
    } catch (e) {
      console.error('[SWGCALL] Failed to load groupCache:', e.message);
    }

    // 2. Query sock.groupFetchAllParticipating() to merge/refresh
    try {
      const fetched = await sock.groupFetchAllParticipating();
      if (fetched) {
        allGroups = { ...allGroups, ...fetched };
      }
    } catch (err) {
      console.error('[SWGCALL] groupFetchAllParticipating failed:', err.message);
    }

    // 3. Fallback to sock.chats if still empty
    if (Object.keys(allGroups).length === 0 && sock.chats) {
      for (const key of Object.keys(sock.chats)) {
        if (key.endsWith('@g.us')) {
          allGroups[key] = sock.chats[key] || { id: key };
        }
      }
    }

    const groupIds = Object.keys(allGroups || {}).filter(jid => jid.endsWith('@g.us'));
    console.log(`[SWGCALL][DEBUG] Final group count for broadcast: ${groupIds.length}`);
    if (groupIds.length) {
      console.log('[SWGCALL][DEBUG] Group IDs:', groupIds.join(', '));
    }

    if (!groupIds.length) {
      console.error('[SWGCALL][DEBUG] Aborting: bot has 0 participating groups after all retries.');
      return reply('🙅‍♂️ Bot is not in any groups, or the group list has not finished syncing yet. Try again in a few seconds (especially if the bot just restarted).');
    }

    // Generate content once before looping to prevent multiple media uploads / metadata generation
    let preGeneratedMsgContent = null;
    try {
      
      const opts = { upload: sock.waUploadToServer };
      const statusBgColor = bgColor || getRandomHexColor();
      if (statusBgColor) opts.backgroundColor = statusBgColor;

      const baseDocCopy = { ...baseDoc };
      delete baseDocCopy.textColor;
      delete baseDocCopy.textFont;
      delete baseDocCopy.backgroundColor;

      preGeneratedMsgContent = await generateWAMessageContent(baseDocCopy, opts);
      if (!preGeneratedMsgContent) {
        throw new Error('generateWAMessageContent returned null');
      }

      // Inject text formatting flags once into the pre-generated content
      const innerMsg = preGeneratedMsgContent.message || preGeneratedMsgContent;
      if (innerMsg.extendedTextMessage) {
        if (textColor) {
          let hex = String(textColor).replace('#', '');
          if (hex.length === 6) hex = 'FF' + hex;
          innerMsg.extendedTextMessage.textArgb = parseInt(hex, 16);
        }
        if (textFont !== undefined && textFont !== null) {
          innerMsg.extendedTextMessage.font = textFont;
        }
      }
      
    } catch (genErr) {
      console.error('[SWGCALL] Pre-generation failed:', genErr);
      return reply(`🙅‍♂️ Failed to prepare status content for broadcast: ${genErr.message}`);
    }

    const debugMode = flags.isDebug;

    swgcallRunning = true;
    await react('📡');
    if (!isSilent) {
      await sock.sendMessage(from, {
    text: `*– ( GROUP STATUS )*
──────────────𔓕
> 📊 *Target:* \`${groupIds.length}\` Group(s)
> ⏱️ *Estimated:* ~${Math.ceil((groupIds.length * 6.5) / 60)} minute(s)
> \`Please wait...\``
  });

      const unsupportedWarning = getUnsupportedFlagsWarning(type, flags);
      if (unsupportedWarning) {
        try { await reply(unsupportedWarning); } catch {}
      }
    }

    let sent = 0;
    let failed = 0;
    const successGroups = [];
    const failedGroups = [];
    const broadcastStartedAt = Date.now();

    try {
      for (let idx = 0; idx < groupIds.length; idx++) {
        const gid = groupIds[idx];
        const groupLabel = allGroups[gid]?.subject || gid;
        const attemptStartedAt = Date.now();

        try {
          await groupStatus(sock, gid, preGeneratedMsgContent, useAiBadge, customName, customEmoji);
          sent++;
          successGroups.push({ gid, label: groupLabel });

          const elapsed = Date.now() - attemptStartedAt;
          
          if (debugMode && !isSilent) {
            try { await reply(`✅ [${idx + 1}/${groupIds.length}] ${groupLabel} — sent (${elapsed}ms)`); } catch {}
          }
        } catch (sendErr) {
          const reason = sendErr?.message || String(sendErr);
          
          if (sendErr?.stack) console.error(sendErr.stack);
          failed++;
          failedGroups.push({ gid, label: groupLabel, reason });

          if (debugMode && !isSilent) {
            try { await reply(`🙅‍♂️ [${idx + 1}/${groupIds.length}] ${groupLabel} — failed: ${reason}`); } catch {}
          }
        }

        const isLast = idx === groupIds.length - 1;
        if (isLast) break;

        if ((idx + 1) % 5 === 0) {
          const pause = randomDelayMs(20000, 35000);
          
          await sleep(pause);
        } else {
          await sleep(randomDelayMs(4000, 9000));
        }
      }
    } finally {
      swgcallRunning = false;
    }

    const totalElapsed = Math.round((Date.now() - broadcastStartedAt) / 1000);
    

    if (!isSilent) {
  let summary = `*– ( GROUP STATUS)*
──────────────𔓕
> 📊 *Sent:* ${sent}/${groupIds.length}
> 🙅‍♂️ *Failed:* ${failed}
> ⏱️ *Elapsed:* ${totalElapsed}s`;
  
  if (failed > 0) {
    summary += `\n\n🔍 *TIP:* Use -debug for live per-group log`;
  }
      await reply(summary);
      try { await react('✅'); } catch {}
    } else {
      try { await react('✅'); } catch {}
    }
  }
);
