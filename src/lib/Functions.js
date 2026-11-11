const axios = require("axios");
const path = require("path");
const zlib = require("zlib");
let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.error('[sharp] not available:', e.message); }
const config = require('../config');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
// ffmpeg-static has no Android/Termux binary: fall back to the system ffmpeg (pkg install ffmpeg)
const ffmpegPath = (() => {
  try { const p = require('ffmpeg-static'); if (p && require('fs').existsSync(p)) return p; } catch (_) {}
  return process.env.FFMPEG_PATH || 'ffmpeg';
})();
ffmpeg.setFfmpegPath(ffmpegPath);

const sessionDir = path.join(__dirname, "session");
const sessionPath = path.join(sessionDir, "creds.json");


async function stickerToImage(webpData, options = {}) {
    try {
        const {
            upscale = true,
            targetSize = 512, 
            framesToProcess = 200
        } = options;

        if (Buffer.isBuffer(webpData)) {
            const sharpInstance = sharp(webpData, {
                sequentialRead: true,
                animated: true,
                limitInputPixels: false,
                pages: framesToProcess 
            });

            const metadata = await sharpInstance.metadata();
            const isAnimated = metadata.pages > 1 || metadata.hasAlpha;

            if (isAnimated) {
                return await sharpInstance
                    .gif({
                        compressionLevel: 0,
                        quality: 100,
                        effort: 1, 
                        loop: 0 
                    })
                    .resize({
                        width: upscale ? targetSize : metadata.width,
                        height: upscale ? targetSize : metadata.height,
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                        kernel: 'lanczos3' 
                    })
                    .toBuffer();
            } else {
                return await sharpInstance
                    .ensureAlpha()
                    .resize({
                        width: upscale ? targetSize : metadata.width,
                        height: upscale ? targetSize : metadata.height,
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                        kernel: 'lanczos3'
                    })
                    .png({
                        compressionLevel: 0,
                        quality: 100,
                        progressive: false,
                        palette: true
                    })
                    .toBuffer();
            }
        }
        else if (typeof webpData === 'string') {
            // ✅ FIX: isAnimated ab outputPath se PEHLE compute hoti hai
            // (pehle TDZ error deta tha — declare hone se pehle use ho raha tha)
            const sharpInstance = sharp(webpData, {
                sequentialRead: true,
                animated: true,
                limitInputPixels: false,
                pages: framesToProcess
            });

            const metadata = await sharpInstance.metadata();
            const isAnimated = metadata.pages > 1 || metadata.hasAlpha;
            const outputPath = webpData.replace(/\.webp$/, isAnimated ? '.gif' : '.png');

            if (isAnimated) {
                await sharpInstance
                    .gif({
                        compressionLevel: 0,
                        quality: 100,
                        effort: 1,
                        loop: 0
                    })
                    .resize({
                        width: upscale ? targetSize : metadata.width,
                        height: upscale ? targetSize : metadata.height,
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                        kernel: 'lanczos3'
                    })
                    .toFile(outputPath);
            } else {
                await sharpInstance
                    .ensureAlpha()
                    .resize({
                        width: upscale ? targetSize : metadata.width,
                        height: upscale ? targetSize : metadata.height,
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                        kernel: 'lanczos3'
                    })
                    .png({
                        compressionLevel: 0,
                        quality: 100,
                        progressive: false,
                        palette: true
                    })
                    .toFile(outputPath);
            }

            const imageBuffer = await fs.promises.readFile(outputPath);
            await fs.promises.unlink(outputPath);
            await fs.promises.unlink(webpData); 
            return imageBuffer;
        }
        else {
            throw new Error('Invalid input type for stickerToImage');
        }
    } catch (error) {
        console.error('Error in stickerToImage:', error);
        throw error;
    }
}

async function withTempFiles(inputBuffer, extension, processFn) {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tempInput = path.join(tempDir, `input_${uniqueId}.tmp`);
  const tempOutput = path.join(tempDir, `output_${uniqueId}.${extension}`);
  
  try {
    fs.writeFileSync(tempInput, inputBuffer);
    await processFn(tempInput, tempOutput);
    const outputBuffer = fs.readFileSync(tempOutput);
    return outputBuffer;
  } finally {
    try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}
    try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}
  }
}


async function toAudio(buffer) {
  return withTempFiles(buffer, 'mp3', (input, output) => {
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      
      // First check if video has audio stream
      execFile(ffmpegPath, ['-i', input, '-hide_banner'], { timeout: 30000 }, (probeErr, probeOut, probeStderr) => {
        const hasAudio = probeStderr && (probeStderr.includes('Audio:') || probeStderr.includes('audio'));
        
        if (!hasAudio) {
          return reject(new Error('This video has no audio track to extract'));
        }
        
        execFile(ffmpegPath, [
          '-i', input,
          '-vn',
          '-acodec', 'libmp3lame',
          '-ab', '128k',
          '-ac', '2',
          '-y',
          output
        ], { timeout: 120000 }, (error, stdout, stderr) => {
          if (error) {
            console.error('FFmpeg toAudio error:', stderr || error.message);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    });
  });
}

async function toVideo(buffer) {
  return withTempFiles(buffer, 'mp4', (input, output) => {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input('color=black:s=640x360:r=1') 
        .inputOptions([
          '-f lavfi'
        ])
        .input(input)
        .outputOptions([
          '-shortest',
          '-preset ultrafast',
          '-movflags faststart',
          '-pix_fmt yuv420p'
        ])
        .videoCodec('libx264')
        .audioCodec('aac')
        .toFormat('mp4')
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .on('end', resolve)
        .save(output);
    });
  });
}


async function toPtt(buffer) {
  const { execFile } = require('child_process');
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const timestamp = Date.now();
  const inputPath = path.join(tempDir, `ptt_in_${timestamp}.tmp`);
  const outputPath = path.join(tempDir, `ptt_out_${timestamp}.ogg`);

  fs.writeFileSync(inputPath, buffer);

  const cleanup = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  };

  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-y', '-i', inputPath,
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-ar', '48000',
      '-ac', '1',
      '-f', 'ogg',
      outputPath
    ], { timeout: 120000 }, (err) => {
      if (err) {
        cleanup();
        return reject(err);
      }
      try {
        const out = fs.readFileSync(outputPath);
        cleanup();
        resolve(out);
      } catch (e) { cleanup(); reject(e); }
    });
  });
}

async function formatAudio(buffer) {
  const { execFile } = require('child_process');
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const timestamp = Date.now();
  const inputPath = path.join(tempDir, `aud_in${timestamp}.tmp`);
  const outputPath = path.join(tempDir, `aud_out${timestamp}.mp3`);

  fs.writeFileSync(inputPath, buffer);

  const cleanup = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  };

  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-y', '-i', inputPath, '-vn', '-c:a', 'copy', outputPath],
      { timeout: 30000 }, (err) => {
        if (!err) {
          try {
            const out = fs.readFileSync(outputPath);
            cleanup();
            return resolve(out);
          } catch (e) { cleanup(); return reject(e); }
        }
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        execFile(ffmpegPath, [
          '-y', '-i', inputPath, '-vn',
          '-c:a', 'libmp3lame', '-b:a', '128k', '-ac', '2', outputPath
        ], { timeout: 180000 }, (err2) => {
          if (err2) { cleanup(); return reject(err2); }
          try {
            const out = fs.readFileSync(outputPath);
            cleanup();
            resolve(out);
          } catch (e) { cleanup(); reject(e); }
        });
      });
  });
}


async function formatVideo(buffer) {
  const { execFile } = require('child_process');
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const timestamp = Date.now();
  const inputPath = path.join(tempDir, `vid_in${timestamp}.tmp`);
  const outputPath = path.join(tempDir, `vid_out${timestamp}.mp4`);

  fs.writeFileSync(inputPath, buffer);

  const cleanup = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  };

  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath],
      { timeout: 60000 }, (err) => {
        if (!err) {
          try {
            const out = fs.readFileSync(outputPath);
            cleanup();
            return resolve(out);
          } catch (e) { cleanup(); return reject(e); }
        }
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        execFile(ffmpegPath, [
          '-y', '-i', inputPath,
          '-map', '0:v:0',          // primary video stream only
          '-map', '0:a:0?',         // primary audio stream (optional — skip if broken)
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
          '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
          outputPath
        ], { timeout: 600000 }, (err2) => {
          if (err2) { cleanup(); return reject(err2); }
          try {
            const out = fs.readFileSync(outputPath);
            cleanup();
            resolve(out);
          } catch (e) { cleanup(); reject(e); }
        });
      });
  });
}


function monospace(input) {
    const boldz = {
         'A': '𝙰', 'B': '𝙱', 'C': '𝙲', 'D': '𝙳', 'E': '𝙴', 'F': '𝙵', 'G': '𝙶',
        'H': '𝙷', 'I': '𝙸', 'J': '𝙹', 'K': '𝙺', 'L': '𝙻', 'M': '𝙼', 'N': '𝙽',
        'O': '𝙾', 'P': '𝙿', 'Q': '𝚀', 'R': '𝚁', 'S': '𝚂', 'T': '𝚃', 'U': '𝚄',
        'V': '𝚅', 'W': '𝚆', 'X': '𝚇', 'Y': '𝚈', 'Z': '𝚉',
        '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔',
        '7': '𝟕', '8': '𝟖', '9': '𝟗',
        ' ': ' ' 
    };
    return input.split('').map(char => boldz[char] || char).join('');
}

const byteToKB = 1 / 1024;
const byteToMB = byteToKB / 1024;
const byteToGB = byteToMB / 1024;

function formatBytes(bytes) {
  if (bytes >= Math.pow(1024, 3)) {
    return (bytes * byteToGB).toFixed(2) + ' GB';
  } else if (bytes >= Math.pow(1024, 2)) {
    return (bytes * byteToMB).toFixed(2) + ' MB';
  } else if (bytes >= 1024) {
    return (bytes * byteToKB).toFixed(2) + ' KB';
  } else {
    return bytes.toFixed(2) + ' bytes';
  }
    }

async function loadSession() {
    try {
        if (!config.SESSION_ID || typeof config.SESSION_ID !== 'string') {
            throw new Error("SESSION_ID is missing or invalid");
        }

        const credsId = config.SESSION_ID.trim();

        // Already loaded and valid — skip
        if (fs.existsSync(sessionPath)) {
            const existing = fs.readFileSync(sessionPath);
            if (existing && existing.length > 100) {
                console.log("ℹ️ Session already exists — skipping load");
                return;
            }
            fs.unlinkSync(sessionPath);
            console.log("⚠️ Corrupt session — reloading...");
        }

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // ── FORMAT 1: MEGA (PRIME-MD_<megaId>) ───────────────
        if (credsId.startsWith("PRIME-MD_")) {
            console.log("🕸️ FORMAT: MEGA — loading...");
            const megaId = credsId.slice("PRIME-MD_".length).trim();
            if (!megaId) throw new Error("MEGA ID missing after PRIME-MD_");
            const { File } = require("megajs");
            const file = File.fromURL(`https://mega.nz/file/${megaId}`);
            await file.loadAttributes();
            const data = await new Promise((res, rej) =>
                file.download((e, d) => (e ? rej(e) : res(d)))
            );
            if (!data || data.length < 100) throw new Error("MEGA download returned empty data");
            fs.writeFileSync(sessionPath, data);
            console.log("✅ MEGA session loaded");
            return;
        }

        // ── FORMAT 2: BASE64 gzip (PRIME-MD~<b64>) ───────────
        if (credsId.startsWith("PRIME-MD~")) {
            console.log("🕸️ FORMAT: BASE64 — loading...");
            const b64data = credsId.slice("PRIME-MD~".length).trim();
            if (!b64data) throw new Error("Base64 data missing after PRIME-MD~");
            let sessionData;
            try {
                const compressed = Buffer.from(b64data, "base64");
                sessionData = zlib.gunzipSync(compressed);
                console.log("[ℹ️] GZIP DECOMPRESSED OK");
            } catch {
                console.log("ℹ️ not gzipped, raw decode");
                sessionData = Buffer.from(b64data, "base64");
            }
            if (!sessionData || sessionData.length < 100)
                throw new Error("Decoded session data too small");
            try { JSON.parse(sessionData.toString("utf8")); }
            catch { throw new Error("Decoded session is not valid JSON"); }
            fs.writeFileSync(sessionPath, sessionData);
            console.log("[✅] PRIME-MD SESSION LOADED");
            return;
        }

        // ── FORMAT 3: PASTEBIN / PASTE.RS ────────────────────
        // PRIME-MD:pb:<pasteId>  → pastebin.com
        // PRIME-MD:prs:<pasteId> → paste.rs
        // PRIME-MD≈<pasteId>     → pastebin legacy
        if (credsId.startsWith("PRIME-MD:") || credsId.startsWith("PRIME-MD≈")) {
            let source, pasteId;
            if (credsId.startsWith("PRIME-MD:")) {
                const withoutPrefix = credsId.slice("PRIME-MD:".length);
                const colonIdx = withoutPrefix.indexOf(":");
                if (colonIdx === -1) throw new Error("Invalid format — expected PRIME-MD:<pb|prs>:<pasteId>");
                source  = withoutPrefix.slice(0, colonIdx).trim().toLowerCase();
                pasteId = withoutPrefix.slice(colonIdx + 1).trim();
            } else {
                source  = "pb";
                pasteId = credsId.replace("PRIME-MD≈", "").trim();
            }
            if (!pasteId) throw new Error("Paste ID is empty");
            if (!["pb", "prs"].includes(source))
                throw new Error(`Unknown paste source: "${source}" — use pb or prs`);
            const url = source === "pb"
                ? `https://pastebin.com/raw/${pasteId}`
                : `https://paste.rs/${pasteId}`;
            console.log(`🕸️ FORMAT: PASTE (${source.toUpperCase()}) — fetching...`);
            await new Promise(r => setTimeout(r, 1200));
            const res = await axios.get(url, {
                responseType: "text",
                timeout: 15000,
                headers: { "User-Agent": "Mozilla/5.0" },
            });
            let rawData = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
            rawData = rawData.trim();
            if (!rawData || rawData.length < 100)
                throw new Error(`Paste response too short — invalid paste ID: ${pasteId}`);
            if (rawData.includes("Bad API request") || rawData.includes("Paste Not Found"))
                throw new Error(`Paste not found: ${pasteId}`);
            try { JSON.parse(rawData); }
            catch { throw new Error("Paste content is not valid JSON"); }
            fs.writeFileSync(sessionPath, rawData, "utf8");
            console.log(`✅ Paste (${source.toUpperCase()}) session loaded`);
            return;
        }

        // ── FORMAT 4: PRIME-MD legacy (PRIME-MD~<b64>) ───────
        if (credsId.startsWith("PRIME-MD~") || credsId.startsWith("PRIME-MD≈")) {
            console.log("🕸️ FORMAT: PRIME-MD legacy — loading...");
            let sessionId = credsId;
            const b64Check = credsId.split("~")[1] || "";
            if (b64Check && !b64Check.startsWith("H4sI")) {
                const serverUrl = `https://session.clevertechnexus.qzz.io/session/${b64Check}`;
                const r = await axios.get(serverUrl, { timeout: 15000 });
                const fetched = (r.data || "").toString().trim();
                if (!fetched.startsWith("PRIME-MD"))
                    throw new Error("Session server returned invalid data");
                sessionId = fetched;
            }
            const b64data = sessionId.split("~")[1];
            if (!b64data) throw new Error("Invalid PRIME-MD session format");
            const cleanB64 = b64data.replace("...", "");
            const compressed = Buffer.from(cleanB64, "base64");
            const decompressed = zlib.gunzipSync(compressed);
            fs.writeFileSync(sessionPath, decompressed, "utf8");
            console.log("[✅] PRIME-MD SESSION LOADED");
            return;
        }

        throw new Error(
            "🙅‍♂️ Invalid SESSION_ID format.\n" +
            "  MEGA:     PRIME-MD_<megaFileId>\n" +
            "  Base64:   PRIME-MD~<base64data>\n" +
            "  Pastebin: PRIME-MD:pb:<pasteId>\n" +
            "  Paste.rs: PRIME-MD:prs:<pasteId>"
        );

    } catch (e) {
        console.error("🙅‍♂️ Session Error:", e.message);
        throw e;
    }
}


async function useSQLiteAuthState(databasePath) {
    // ✅ PostgreSQL-backed auth state (Heroku-compatible, no better-sqlite3)
    const { proto, initAuthCreds, BufferJSON } = require("@whiskeysockets/baileys");
    const { Pool } = require('pg');

    let _pool = null;
    let _ready = false;

    function getPool() {
        if (!process.env.DATABASE_URL) return null;
        if (!_pool) {
            _pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false },
                max: 3,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });
        }
        return _pool;
    }

    // Fallback when no DATABASE_URL (local/Termux use): a plain JSON file next
    // to the old session.db, NOT just an in-memory Map. Losing the WhatsApp
    // login on every process restart (crash, phone reboot, manual restart)
    // would otherwise force a fresh pairing every single time.
    const fs_ = require('fs');
    const path_ = require('path');
    const fallbackDir = path_.dirname(databasePath.endsWith('.db') ? databasePath : `${databasePath}/session.db`);
    const fallbackFile = path_.join(fallbackDir, 'session-store.json');
    let _fallbackCache = null;
    function loadFallback() {
        if (_fallbackCache) return _fallbackCache;
        try {
            _fallbackCache = JSON.parse(fs_.readFileSync(fallbackFile, 'utf8'));
        } catch (e) {
            _fallbackCache = {};
        }
        return _fallbackCache;
    }
    function saveFallback() {
        try {
            fs_.mkdirSync(fallbackDir, { recursive: true });
            fs_.writeFileSync(fallbackFile, JSON.stringify(_fallbackCache));
        } catch (e) {
            console.error('[authState] fallback file write:', e.message);
        }
    }

    let _poolBroken = false;
    let _readyPromise = null;
    async function ensureTable() {
        if (_ready) return;
        // See messageStore.js's ensureReady for why this is a shared
        // in-flight promise rather than a boolean flag: concurrent callers
        // racing their own CREATE TABLE IF NOT EXISTS can trip the file
        // fallback permanently even when Postgres is fine.
        if (_readyPromise) return _readyPromise;
        _readyPromise = (async () => {
            const pool = getPool();
            if (!pool) { _ready = true; return; }
            try {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS wa_session (
                        id    TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )
                `);
            } catch (e) {
                // Postgres unreachable/misconfigured at boot: don't crash the whole
                // bot over it. Fall back to the local file for this run; the next
                // restart will try Postgres again fresh.
                console.error('[authState] Postgres unavailable, using local file fallback for this run:', e.message);
                _poolBroken = true;
            }
            _ready = true;
        })();
        return _readyPromise;
    }

    const readData = async (id) => {
        await ensureTable();
        const pool = _poolBroken ? null : getPool();
        if (!pool) {
            const v = loadFallback()[id];
            return v ? JSON.parse(v, BufferJSON.reviver) : null;
        }
        try {
            const res = await pool.query('SELECT value FROM wa_session WHERE id=$1', [id]);
            return res.rows[0] ? JSON.parse(res.rows[0].value, BufferJSON.reviver) : null;
        } catch (e) { return null; }
    };

    const writeData = async (id, value) => {
        await ensureTable();
        const pool = _poolBroken ? null : getPool();
        const serialized = JSON.stringify(value, BufferJSON.replacer);
        if (!pool) { loadFallback()[id] = serialized; saveFallback(); return; }
        try {
            await pool.query(
                'INSERT INTO wa_session (id, value) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value',
                [id, serialized]
            );
        } catch (e) { console.error('[authState] write:', e.message); }
    };

    const removeData = async (id) => {
        await ensureTable();
        const pool = _poolBroken ? null : getPool();
        if (!pool) { delete loadFallback()[id]; saveFallback(); return; }
        try {
            await pool.query('DELETE FROM wa_session WHERE id=$1', [id]);
        } catch (e) {}
    };

    // Migrate creds.json if it exists on disk (first-run compat)
    const credsPath = require('path').join(require('path').dirname(
        databasePath.endsWith('.db') ? databasePath : `${databasePath}/session.db`
    ), 'creds.json');
    if (require('fs').existsSync(credsPath)) {
        try {
            const credsData = require('fs').readFileSync(credsPath, 'utf8');
            const initialCreds = JSON.parse(credsData, BufferJSON.reviver);
            await writeData('creds', initialCreds);
            // Only remove the legacy file once it has been written somewhere
            // that survives a restart (Postgres, or the local fallback file
            // above) - never delete the only copy we have.
            if ((getPool() && !_poolBroken) || fs_.existsSync(fallbackFile)) {
                try { require('fs').unlinkSync(credsPath); } catch (e) {}
            }
        } catch (e) { console.error('Failed to read creds.json:', e.message); }
    }

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const value = await readData(`${type}-${id}`);
                        if (value) data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) await writeData(key, value);
                            else await removeData(key);
                        }
                    }
                }
            }
        },
        saveCreds: async () => {
            await writeData('creds', creds);
        }
    };
}

const runtime = (seconds) => {
        seconds = Number(seconds)
        var d = Math.floor(seconds / (3600 * 24))
        var h = Math.floor(seconds % (3600 * 24) / 3600)
        var m = Math.floor(seconds % 3600 / 60)
        var s = Math.floor(seconds % 60)
        var dDisplay = d > 0 ? d + (d == 1 ? ' day, ' : ' days, ') : ''
        var hDisplay = h > 0 ? h + (h == 1 ? ' hour, ' : ' hours, ') : ''
        var mDisplay = m > 0 ? m + (m == 1 ? ' minute, ' : ' minutes, ') : ''
        var sDisplay = s > 0 ? s + (s == 1 ? ' second' : ' seconds') : ''
        return dDisplay + hDisplay + mDisplay + sDisplay;
}

const sleep = async(ms) => {
        return new Promise(resolve => setTimeout(resolve, ms))
}

function gmdRandom(ext) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return path.join(tempDir, `${timestamp}_${random}${ext}`);
}

const gmdBuffer = async (url, options = {}) => {
    try {
        const res = await axios({
            method: "GET",
            url,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.70 Safari/537.36",
                'DNT': 1,
                'Upgrade-Insecure-Request': 1
            },
            ...options,
            responseType: 'arraybuffer',
            timeout: 2400000 // 24 mins😂
        });
        
        if (!res.data || res.data.length === 0) {
            throw new Error("Empty response data");
        }
        
        return res.data;
    } catch (err) {
        console.error("gmdBuffer Error:", err.message || err);
        throw err; // ✅ FIX: pehle 'return err' tha — caller ko Error object ko
        // data samajh ke aage process karna padta tha (silent crash elsewhere)
    }
};

const gmdJson = async (url, options = {}) => {
    try {
        const res = await axios({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36',
                'Accept': 'application/json'
            },
            ...options,
            timeout: 2400000 // 24 mins😂
        });
        
        if (!res.data) {
            throw new Error("Empty response data");
        }
        
        return res.data;
    } catch (err) {
        console.error("gmdJson Error:", err.message || err);
        throw err; // ✅ FIX: same as gmdBuffer
    }
};

// ⚠️ NOT imported/used anywhere in the files reviewed so far (index.js,
// sticker.js, vv.js, stickercmd.js, antitag.js, ping.js). Kept as-is since
// it's not confirmed dead — may be used in a plugin not yet reviewed
// (e.g. a version-check/update-notify command). Wrapped in try/catch since
// gmdJson now throws instead of silently returning an Error object.
const latestWaVersion = async () => {
    try {
        const get = await gmdJson("https://web.whatsapp.com/check-update?version=1&platform=web");
        const version = [get.currentVersion.replace(/[.]/g, ", ")];
        return version;
    } catch (e) {
        console.error("latestWaVersion Error:", e.message || e);
        return ["unknown"];
    }
};

const isUrl = (url) => {
    return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/, 'gi'));
};

// ✅ FIX: `typeof parseInt(number) === 'number'` was ALWAYS true (parseInt
// returns 'number' type even for NaN) — the real check is just !isNaN().
const isNumber = (number) => {
    const int = parseInt(number);
    return !isNaN(int);
};

// ✅ FIX: added null/undefined guard — previously crashed with
// "Cannot read properties of undefined (reading 'endsWith')" if jid was
// ever falsy.
function verifyJidState(jid) {
    if (!jid) {
        console.error('verifyJidState: jid is missing/undefined');
        return false;
    }
    if (!jid.endsWith('@s.whatsapp.net')) {
        console.error('Your verified', jid);
        return false;
    }
    console.log('Welcome to PRIME-MD', jid);
    return true;
}

async function eBase(str = '') {
  return Buffer.from(str).toString('base64');
}

async function dBase(base64Str) {
  return Buffer.from(base64Str, 'base64').toString('utf-8');
}

async function eBinary(str = '') {
  return str.split('').map(char => char.charCodeAt(0).toString(2)).join(' ');
}

async function dBinary(str) {
  let newBin = str.split(" ");
  let binCode = [];
  for (let i = 0; i < newBin.length; i++) {
    binCode.push(String.fromCharCode(parseInt(newBin[i], 2)));
  }
  return binCode.join("");
}

const { Sticker } = require("wa-sticker-formatter");
const { exec } = require("child_process");

function runFFmpeg(input, output, scale = 320, fps = 15, duration = 8) {
    return new Promise((resolve, reject) => {
        const cmd = `ffmpeg -i "${input}" -vf "scale=${scale}:-1:force_original_aspect_ratio=decrease,fps=${fps}" -t ${duration} -an -vcodec libwebp -loop 0 -preset default -vsync 0 "${output}" -y`;
        exec(cmd, (err) => {
            if (err) reject(err);
            else resolve(output);
        });
    });
}

async function getVideoDuration(input) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(input, (err, metadata) => {
            if (!err && metadata?.format?.duration) {
                return resolve(parseFloat(metadata.format.duration));
            }
            exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${input}"`, (err, stdout) => {
                if (err || !stdout) {
                    return resolve(8);
                }
                resolve(parseFloat(stdout));
            });
        });
    });
}

// ⚠️ KNOWN LIMITATION (not fixed here — needs verification of
// wa-sticker-formatter's Sticker API before changing): `scale` and `fps`
// are computed on each retry but never actually passed to `Sticker`. Only
// `quality` is reduced. If large/animated stickers still exceed 512KB
// after 15 attempts, this is why — resolution/fps are never actually
// lowered. Confirm whether `Sticker` accepts resize/fps options, or
// pre-resize the input with `sharp`/`runFFmpeg` before passing it in.
async function gmdSticker(file, options) {
    let stickerBuffer;
    let attempts = 0;
    let scale = 320, fps = 15, quality = options.quality || 75;

    while (attempts < 15) { 
        const sticker = new Sticker(file, {
            ...options,
            quality
        });
        stickerBuffer = await sticker.toBuffer();
        if (stickerBuffer.length <= 512 * 1024) break;
        attempts++;
        quality = Math.max(40, quality - 15);
        fps = Math.max(8, fps - 2);
        scale = Math.max(180, scale - 60);
    }
    return stickerBuffer;
}

function copyFolderSync(source, target, excludeList = ['.env']) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }
    const items = fs.readdirSync(source);
    for (const item of items) {
        const srcPath = path.join(source, item);
        const destPath = path.join(target, item);
        let shouldExclude = false;
        for (const excludePattern of excludeList) {
            if (item === excludePattern) {
                shouldExclude = true;
                break;
            }
            const relativePath = path.relative(source, srcPath);
            if (relativePath === excludePattern || relativePath.startsWith(excludePattern + path.sep)) {
                shouldExclude = true;
                break;
            }
        }
        if (shouldExclude) continue;
        const stat = fs.lstatSync(srcPath);
        if (stat.isDirectory()) {
            copyFolderSync(srcPath, destPath, excludeList);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

const gitRepoRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/\s]+)\/([^\s\/]+)/i;

const MAX_MEDIA_SIZE = 50 * 1024 * 1024;

async function getFileSize(url) {
    try {
        const response = await axios.head(url, { timeout: 10000 });
        const contentLength = response.headers['content-length'];
        return contentLength ? parseInt(contentLength) : 0;
    } catch {
        return 0;
    }
}

function getMimeCategory(mimetype) {
    if (!mimetype) return 'document';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('image/')) return 'image';
    return 'document';
}

function getMimeFromUrl(url) {
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const mimeMap = {
        'mp3': 'audio/mpeg',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
    };
    return mimeMap[ext] || 'application/octet-stream';
}

const MIME_EXTENSIONS = {
    'application/json': '.json',
    'text/html': '.html',
    'text/css': '.css',
    'text/javascript': '.js',
    'application/javascript': '.js',
    'text/plain': '.txt',
    'text/xml': '.xml',
    'application/xml': '.xml',
    'text/csv': '.csv',
    'text/markdown': '.md',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    'application/gzip': '.gz',
    'application/x-tar': '.tar',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
    'image/x-icon': '.ico',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/flac': '.flac',
    'audio/aac': '.aac',
    'audio/m4a': '.m4a',
    'audio/webm': '.weba',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogv',
    'video/avi': '.avi',
    'video/x-msvideo': '.avi',
    'video/quicktime': '.mov',
    'video/x-matroska': '.mkv',
    'video/3gpp': '.3gp',
    'application/octet-stream': '.bin',
    'application/x-executable': '.exe',
    'application/x-sh': '.sh',
    'application/x-python': '.py',
    'text/x-python': '.py',
    'application/x-httpd-php': '.php',
    'text/x-java-source': '.java',
    'text/x-c': '.c',
    'text/x-c++': '.cpp',
    'application/typescript': '.ts',
    'text/typescript': '.ts',
    'application/wasm': '.wasm',
    'font/woff': '.woff',
    'font/woff2': '.woff2',
    'font/ttf': '.ttf',
    'font/otf': '.otf',
    'application/vnd.android.package-archive': '.apk',
    'application/x-apple-diskimage': '.dmg',
    'application/x-debian-package': '.deb',
    'application/x-rpm': '.rpm',
    'application/sql': '.sql',
    'application/x-sqlite3': '.db',
    'application/yaml': '.yaml',
    'text/yaml': '.yaml',
    'application/toml': '.toml',
};

function getExtensionFromMime(contentType) {
    const baseMime = contentType.split(';')[0].trim().toLowerCase();
    if (MIME_EXTENSIONS[baseMime]) return MIME_EXTENSIONS[baseMime];
    
    for (const [mime, ext] of Object.entries(MIME_EXTENSIONS)) {
        if (baseMime.includes(mime.split('/')[1])) return ext;
    }
    
    if (baseMime.startsWith('text/')) return '.txt';
    if (baseMime.startsWith('image/')) return '.bin';
    if (baseMime.startsWith('audio/')) return '.bin';
    if (baseMime.startsWith('video/')) return '.bin';
    
    return '.bin';
}

function isTextContent(contentType) {
    const textTypes = [
        'text/', 'application/json', 'application/javascript', 'application/xml',
        'application/sql', 'application/yaml', 'application/toml', '+json', '+xml'
    ];
    return textTypes.some(t => contentType.includes(t));
}

module.exports = { dBinary, eBinary, dBase, eBase, runtime, sleep, stickerToImage, toAudio, toVideo, toPtt, formatVideo, formatAudio, monospace, formatBytes, gmdBuffer, gmdJson, latestWaVersion, gmdRandom, isUrl, isNumber, loadSession, useSQLiteAuthState, verifyJidState, runFFmpeg, getVideoDuration, gmdSticker, copyFolderSync, gitRepoRegex, MAX_MEDIA_SIZE, getFileSize, getMimeCategory, getMimeFromUrl, MIME_EXTENSIONS, getExtensionFromMime, isTextContent };
