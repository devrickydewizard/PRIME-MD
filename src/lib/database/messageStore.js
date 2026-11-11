/**
 * messageStore.js — PostgreSQL-backed message store for Heroku
 * Falls back to in-memory Map when DATABASE_URL is not set.
 * Replaces the original better-sqlite3 implementation.
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

let _pool = null;
let _ready = false;

// Fallback when DATABASE_URL isn't set (local/Termux use): persist to a
// local JSON file, not just an in-memory Map, so message-cache and
// antidelete history survive a normal process restart instead of silently
// resetting every time.
const FALLBACK_DIR = path.join(process.cwd(), "lib", "session");
const MSG_FALLBACK_FILE = path.join(FALLBACK_DIR, "msg_store_fallback.json");
const AD_FALLBACK_FILE = path.join(FALLBACK_DIR, "antidelete_fallback.json");

function loadFallback(file) {
    try {
        if (fs.statSync(file).size > 20 * 1024 * 1024) { fs.unlinkSync(file); return new Map(); } // oversized old file: drop it
        const entries = Object.entries(safeParse(fs.readFileSync(file, "utf8")));
        return new Map(entries.slice(-300));
    } catch (e) { return new Map(); }
}
const FALLBACK_MAX = 300;          // hard cap on entries kept in memory / on disk
const _saveTimers = new Map();
function saveFallback(file, map) {
    while (map.size > FALLBACK_MAX) map.delete(map.keys().next().value);
    if (_saveTimers.has(file)) return;             // debounce: one write per 10s, not per message
    _saveTimers.set(file, setTimeout(() => {
        _saveTimers.delete(file);
        try {
            fs.mkdirSync(FALLBACK_DIR, { recursive: true });
            fs.writeFileSync(file, safeStringify(Object.fromEntries(map)));
        } catch (e) { console.error("[msgStore] fallback file write:", e.message); }
    }, 10000));
}

let _memStore = null; // lazy-loaded from disk on first use
let _adStore = null;
function getMemStore() { return _memStore || (_memStore = loadFallback(MSG_FALLBACK_FILE)); }
function getAdStore() { return _adStore || (_adStore = loadFallback(AD_FALLBACK_FILE)); }

function getPool() {
    if (!process.env.DATABASE_URL) return null;
    if (!_pool) {
        _pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
    }
    return _pool;
}

let _poolBroken = false;
let _readyPromise = null;
async function ensureReady() {
    if (_ready) return;
    // Several messages/statuses can arrive in a burst right at startup, each
    // independently calling this before _ready flips true. Without sharing
    // one in-flight attempt, concurrent CREATE TABLE IF NOT EXISTS calls can
    // race each other on Postgres and throw - which used to permanently trip
    // the file-fallback switch for the rest of the process, even though the
    // table was actually fine. Now every concurrent caller awaits the SAME
    // single attempt instead of each racing to run their own.
    if (_readyPromise) return _readyPromise;
    _readyPromise = (async () => {
        const pool = getPool();
        if (!pool) { _ready = true; return; }
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS msg_store (
                    id   TEXT NOT NULL,
                    jid  TEXT NOT NULL,
                    data TEXT NOT NULL,
                    ts   BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
                    PRIMARY KEY (jid, id)
                );
                CREATE TABLE IF NOT EXISTS antidelete_store (
                    id        TEXT NOT NULL,
                    jid       TEXT NOT NULL,
                    sender    TEXT,
                    push_name TEXT,
                    data      TEXT NOT NULL,
                    ts        BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
                    PRIMARY KEY (jid, id)
                );
            `);
        } catch (e) {
            console.error('[msgStore] Postgres unavailable, using local file fallback for this run:', e.message);
            _poolBroken = true;
        }
        _ready = true;
    })();
    return _readyPromise;
}

function safeStringify(obj) {
    return JSON.stringify(obj, function (key, v) {
        const raw = this[key];
        if (raw instanceof Uint8Array || Buffer.isBuffer(raw))
            return { __type: "Buffer", data: Buffer.from(raw).toString("base64") };
        return v;
    });
}

function safeParse(str) {
    return JSON.parse(str, (_, v) => {
        if (v && typeof v === "object" && v.__type === "Buffer" && typeof v.data === "string")
            return Buffer.from(v.data, "base64");
        if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data))
            return Buffer.from(v.data);
        return v;
    });
}

async function saveMsg(jid, message) {
    try {
        await ensureReady();
        const pool = _poolBroken ? null : getPool();
        if (!pool) { const m = getMemStore(); m.set(`${jid}|${message.key.id}`, message); saveFallback(MSG_FALLBACK_FILE, m); return; }
        await pool.query(
            `INSERT INTO msg_store (id, jid, data, ts)
             VALUES ($1, $2, $3, extract(epoch from now())::BIGINT)
             ON CONFLICT (jid, id) DO UPDATE SET data = EXCLUDED.data, ts = EXCLUDED.ts`,
            [message.key.id, jid, safeStringify(message)]
        );
        // keep latest 200 per jid
        await pool.query(
            `DELETE FROM msg_store WHERE jid = $1 AND id NOT IN (
                SELECT id FROM msg_store WHERE jid = $1 ORDER BY ts DESC LIMIT 200
            )`,
            [jid]
        );
    } catch (e) { console.error("[msgStore] save:", e.message); }
}

async function loadMsg(jid, id) {
    try {
        await ensureReady();
        const pool = _poolBroken ? null : getPool();
        if (!pool) { return getMemStore().get(`${jid}|${id}`) || null; }
        const res = await pool.query("SELECT data FROM msg_store WHERE jid=$1 AND id=$2", [jid, id]);
        return res.rows[0] ? safeParse(res.rows[0].data) : null;
    } catch (e) { return null; }
}

// Returns the stored messages for a chat (most recent first), capped at
// `limit`. Used by the clear command to find message keys it can attempt
// a delete-for-everyone on. Falls back to an empty list if the store is
// unavailable - clear-for-everyone just does fewer messages in that case,
// never throws.
async function listRecentMessages(jid, limit = 200) {
    try {
        await ensureReady();
        const pool = _poolBroken ? null : getPool();
        if (!pool) {
            const m = getMemStore();
            const out = [];
            for (const [k, v] of m) {
                if (k.startsWith(`${jid}|`)) out.push(v);
            }
            return out.slice(-limit).reverse();
        }
        const res = await pool.query(
            "SELECT data FROM msg_store WHERE jid=$1 ORDER BY ts DESC LIMIT $2",
            [jid, limit]
        );
        return res.rows.map((r) => safeParse(r.data));
    } catch (e) {
        console.error('[msgStore] listRecentMessages failed:', e.message);
        return [];
    }
}

async function deleteMsg(jid, id) {
    try {
        await ensureReady();
        const pool = _poolBroken ? null : getPool();
        if (!pool) { const m = getMemStore(); m.delete(`${jid}|${id}`); saveFallback(MSG_FALLBACK_FILE, m); return; }
        await pool.query("DELETE FROM msg_store WHERE jid=$1 AND id=$2", [jid, id]);
    } catch (e) { console.error("[msgStore] delete:", e.message); }
}

async function updateMsg(jid, id, newMessage) {
    await saveMsg(jid, newMessage);
}

async function saveAntiDelete(jid, message) {
    try {
        await ensureReady();
        const pool = _poolBroken ? null : getPool();
        if (!pool) { const m = getAdStore(); m.set(`${jid}|${message.key.id}`, message); saveFallback(AD_FALLBACK_FILE, m); return; }
        await pool.query(
            `INSERT INTO antidelete_store (id, jid, sender, push_name, data, ts)
             VALUES ($1,$2,$3,$4,$5, extract(epoch from now())::BIGINT)
             ON CONFLICT (jid, id) DO UPDATE SET data=EXCLUDED.data`,
            [message.key.id, jid, message.originalSender || null, message.originalPushName || null, safeStringify(message)]
        );
        await pool.query(
            `DELETE FROM antidelete_store WHERE jid=$1 AND id NOT IN (
                SELECT id FROM antidelete_store WHERE jid=$1 ORDER BY ts DESC LIMIT 100
            )`, [jid]
        );
    } catch (e) { console.error("[antiDeleteStore] save:", e.message); }
}

async function findAntiDelete(jid, id) {
    try {
        await ensureReady();
        const pool = _poolBroken ? null : getPool();
        if (!pool) { return getAdStore().get(`${jid}|${id}`) || null; }
        const res = await pool.query("SELECT data FROM antidelete_store WHERE jid=$1 AND id=$2", [jid, id]);
        return res.rows[0] ? safeParse(res.rows[0].data) : null;
    } catch (e) { return null; }
}

async function removeAntiDelete(jid, id) {
    try {
        await ensureReady();
        const pool = _poolBroken ? null : getPool();
        if (!pool) { const m = getAdStore(); m.delete(`${jid}|${id}`); saveFallback(AD_FALLBACK_FILE, m); return; }
        await pool.query("DELETE FROM antidelete_store WHERE jid=$1 AND id=$2", [jid, id]);
    } catch (e) {}
}

function startCleanup() {
    setInterval(async () => {
        try {
            const pool = _poolBroken ? null : getPool();
            if (!pool) return;
            const now = Math.floor(Date.now()/1000);
            await pool.query("DELETE FROM antidelete_store WHERE ts < $1", [now - 86400]);
            await pool.query("DELETE FROM msg_store WHERE ts < $1", [now - 604800]);
        } catch (e) {}
    }, 300000);
}

class SQLiteStore {
    constructor() { ensureReady().catch(() => {}); }
    async loadMessage(jid, id)              { return loadMsg(jid, id); }
    async saveMessage(jid, message)         { return saveMsg(jid, message); }
    async deleteMessage(jid, id)            { return deleteMsg(jid, id); }
    async updateMessage(jid, id, newMsg)    { return updateMsg(jid, id, newMsg); }
    bind(ev) {
        this._handler = ({ messages }) => {
            setImmediate(() => {
                for (const msg of messages) {
                    if (msg.key?.remoteJid && msg.key?.id)
                        this.saveMessage(msg.key.remoteJid, msg);
                }
            });
        };
        ev.on("messages.upsert", this._handler);
    }
    destroy() {}
}

module.exports = { saveMsg, loadMsg, deleteMsg, updateMsg, listRecentMessages, saveAntiDelete, findAntiDelete, removeAntiDelete, startCleanup, SQLiteStore };