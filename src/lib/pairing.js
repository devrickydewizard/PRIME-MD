const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const zlib = require('zlib');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { getSetting, setSetting } = require('./database/settings');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");


// Match the known-working standalone pair.js: Browsers.ubuntu('Chrome').
// (macOS('Chrome') was previously used here on the theory that pairing
// codes need a "desktop" signature, but empirically ubuntu/Chrome is what
// actually pairs successfully for this app.)
const WA_BROWSER = Browsers.macOS('Chrome');

// NOTE: Baileys' own docs specifically warn against forcing the "latest"
// WA protocol version via fetchLatestBaileysVersion() on every connect,
// especially for the pairing-code flow — it can cause an immediate 401
// right after pairing due to version/protocol incompatibility. We now
// always use the library's own bundled default version instead.
async function getWaVersion() {
    return undefined; // let Baileys use its own default bundled version
}

function log(level, pairId, msg, extra) {
    const line = `[${new Date().toISOString()}] [Pair${pairId ? ' ' + pairId : ''}] ${msg}`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (extra !== undefined) fn(line, extra);
    else fn(line);
}

function maskPhone(phone) {
    if (!phone) return phone;
    return phone.length > 4 ? '*'.repeat(phone.length - 4) + phone.slice(-4) : phone;
}

const router = express.Router();
const TEMP_ROOT = path.join(__dirname, 'pair_temp');
if (!fs.existsSync(TEMP_ROOT)) fs.mkdirSync(TEMP_ROOT, { recursive: true });

const sessions = new Map();

const PAIR_SECRET = process.env.PAIR_SECRET || '';

if (!PAIR_SECRET) {
    console.warn(
        '[⚠️  PRIME-MD] PAIR_SECRET is not set. The /pair page and API are ' +
        'wide open to anyone who finds the URL. Set PAIR_SECRET in your .env ' +
        'before exposing this on a public VPS.'
    );
}

function requireSecret(req, res, next) {
    if (!PAIR_SECRET) return next();
    const provided = req.query.key || req.headers['x-pair-key'];
    if (provided !== PAIR_SECRET) {
        return res.status(403).json({ error: 'Invalid or missing access key.' });
    }
    next();
}

const MAX_CONCURRENT_SESSIONS = 10;
const SESSION_TTL_MS = 3 * 60 * 1000;
const ERROR_CLEANUP_DELAY_MS = 8000;

function cleanupSession(pairId, delay = 5000) {
    setTimeout(() => {
        const s = sessions.get(pairId);
        if (s) {
            clearTimeout(s.ttlTimer);
            try { s.sock?.end?.(); } catch (_) {}
            try { s.sock?.ws?.close?.(); } catch (_) {}
            sessions.delete(pairId);
        }
        const dir = path.join(TEMP_ROOT, pairId);
        fs.rm(dir, { recursive: true, force: true }, () => {});
    }, delay);
}

async function waitForStableCreds(credsPath, { maxWaitMs = 8000, quietMs = 700, pollMs = 200 } = {}) {
    const start = Date.now();
    let lastSize = -1;
    let stableSince = null;

    while (Date.now() - start < maxWaitMs) {
        try {
            const { size } = await fsp.stat(credsPath);
            if (size === lastSize) {
                if (!stableSince) stableSince = Date.now();
                if (Date.now() - stableSince >= quietMs) return true;
            } else {
                lastSize = size;
                stableSince = null;
            }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, pollMs));
    }
    return fs.existsSync(credsPath);
}

const MAX_RESTART_RECONNECTS = 3;

function wireConnectionEvents(pairId, sock, authFolder, method) {
    sock.ev.on('connection.update', async (update) => {
        const session = sessions.get(pairId);
        if (!session) return;
        const { connection, qr, lastDisconnect } = update;

        if (qr && method === 'qr') {
            try {
                session.qr = await QRCode.toDataURL(qr);
                session.status = 'waiting_qr';
            } catch (err) {
                log('error', pairId, 'QR encode failed', err?.message || err);
            }
        }

        if (connection === 'open') {
            session.status = 'finalizing';
            try {
                const credsPath = path.join(authFolder, 'creds.json');
                await waitForStableCreds(credsPath);
                const credsData = await fsp.readFile(credsPath);
                const compressed = zlib.gzipSync(credsData);
                session.sessionId = `PRIME-MD~${compressed.toString('base64')}`;
                session.status = 'connected';
                clearTimeout(session.ttlTimer);

                // Persist the owner's number from what THEY typed to request the
                // pairing code - the one moment we have it with certainty,
                // before any WhatsApp LID/PN identity ambiguity. Never overwrite
                // an OWNER_NUMBER someone already set on purpose.
                if (session.phoneNumber && session.phoneNumber.length >= 9) {
                    try {
                        const current = await getSetting('OWNER_NUMBER');
                        if (!current || String(current).replace(/\D/g, '').length < 9) {
                            await setSetting('OWNER_NUMBER', session.phoneNumber);
                            log('info', pairId, `OWNER_NUMBER set from pairing (${maskPhone(session.phoneNumber)})`);
                        }
                    } catch (err) {
                        log('warn', pairId, 'could not persist OWNER_NUMBER from pairing', err?.message || err);
                    }
                }

                const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
                if (selfJid) {
                    const dmText = session.sessionId;
                    let dmSent = false;
                    for (let attempt = 1; attempt <= 3 && !dmSent; attempt++) {
                        await new Promise((r) => setTimeout(r, attempt === 1 ? 1500 : 2500));
                        try {
                            await sock.sendMessage(selfJid, { text: dmText });
                            dmSent = true;
                            log('info', pairId, 'session ID DM sent successfully');
                        } catch (dmErr) {
                            log('warn', pairId, `DM attempt ${attempt} failed`, dmErr?.message || dmErr);
                        }
                    }
                    if (!dmSent) {
                        log('error', pairId, 'could not DM session ID after retries — user must copy it from the page');
                    }
                } else {
                    log('warn', pairId, 'no self JID available yet, skipping session ID DM');
                }

                cleanupSession(pairId, 60000);
            } catch (err) {
                log('error', pairId, 'finalize failed', err?.message || err);
                session.status = 'error';
                session.error = 'Paired, but could not read the session file.';
                cleanupSession(pairId, ERROR_CLEANUP_DELAY_MS);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            log('warn', pairId, `connection closed (status ${statusCode})`, lastDisconnect?.error?.message);

            if (statusCode === DisconnectReason.loggedOut) {
                log('error', pairId, 'logged out by WhatsApp right after pairing',
                    lastDisconnect?.error?.output?.payload || lastDisconnect?.error?.message);
                session.status = 'error';
                session.error = 'Session was logged out. Please try pairing again.';
                cleanupSession(pairId, ERROR_CLEANUP_DELAY_MS);
                return;
            }

            if (statusCode === DisconnectReason.restartRequired) {
                session.restartCount = (session.restartCount || 0) + 1;
                if (session.restartCount > MAX_RESTART_RECONNECTS) {
                    session.status = 'error';
                    session.error = 'Pairing kept restarting unexpectedly. Please try again.';
                    cleanupSession(pairId, ERROR_CLEANUP_DELAY_MS);
                    return;
                }
                log('info', pairId, `restart required after pairing, reconnecting (attempt ${session.restartCount})`);
                reconnectAfterPairing(pairId, authFolder, method);
                return;
            }

            if (session.status !== 'connected' && session.status !== 'finalizing') {
                session.status = 'error';
                session.error = 'Connection lost before pairing finished. Please try again.';
                cleanupSession(pairId, ERROR_CLEANUP_DELAY_MS);
            }
        }
    });
}

async function reconnectAfterPairing(pairId, authFolder, method) {
    const session = sessions.get(pairId);
    if (!session) return;
    try {
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        const version = await getWaVersion();
        const sock = makeWASocket({ 
            auth: state, 
            printQRInTerminal: false, 
            browser: WA_BROWSER,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            ...(version ? { version } : {}),
        });
        session.sock = sock;
        sock.ev.on('creds.update', saveCreds);
        wireConnectionEvents(pairId, sock, authFolder, method);
    } catch (err) {
        log('error', pairId, 'reconnect after pairing failed', err?.message || err);
        session.status = 'error';
        session.error = 'Could not finish pairing after reconnect. Please try again.';
        cleanupSession(pairId, ERROR_CLEANUP_DELAY_MS);
    }
}

async function requestPairingCodeWithRetry(sock, phoneNumber, { retries = 15, delayMs = 600, initialDelayMs = 3000 } = {}) {
    // Give the socket time to finish its own connection/handshake with WA
    // before requesting a pairing code — requesting too early is a known
    // cause of an immediate 401 right after pairing (confirmed working in
    // the standalone pair.js script, which waits 3s before requesting).
    await new Promise((r) => setTimeout(r, initialDelayMs));
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try {
            return await sock.requestPairingCode(phoneNumber);
        } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
}

async function startPairSession(pairId, method, phoneNumber) {
    const authFolder = path.join(TEMP_ROOT, pairId);
    fs.mkdirSync(authFolder, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const version = await getWaVersion();
    const sock = makeWASocket({ 
        auth: state, 
        printQRInTerminal: false, 
        browser: WA_BROWSER,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        ...(version ? { version } : {}),
    });

    const session = { status: 'connecting', qr: null, code: null, sessionId: null, error: null, sock, ttlTimer: null, restartCount: 0, phoneNumber: method === 'code' ? String(phoneNumber || '').replace(/\D/g, '') : null };
    sessions.set(pairId, session);

    session.ttlTimer = setTimeout(() => {
        const s = sessions.get(pairId);
        if (s && s.status !== 'connected') {
            s.status = 'error';
            s.error = 'Pairing session timed out. Please try again.';
            cleanupSession(pairId, ERROR_CLEANUP_DELAY_MS);
        }
    }, SESSION_TTL_MS);

    sock.ev.on('creds.update', saveCreds);

    if (method === 'code' && !sock.authState.creds.registered) {
        try {
            const code = await requestPairingCodeWithRetry(sock, phoneNumber);
            session.code = code;
            session.status = 'waiting_code';
            notifyNumberToLink(phoneNumber, code);
        } catch (err) {
            log('error', pairId, `pairing code request failed for ${maskPhone(phoneNumber)}`, err?.output?.payload || err?.message || err);
            session.status = 'error';
            session.error = 'Could not request a pairing code. Check the number and try again.';
            cleanupSession(pairId, ERROR_CLEANUP_DELAY_MS);
            return;
        }
    }

    wireConnectionEvents(pairId, sock, authFolder, method);
}

// Sends a WhatsApp notification straight to the number being paired, telling
// them a code is ready to link a new device. This only works when this
// pairing site is running inside the main bot process (which already has a
// live, logged-in WhatsApp connection at global.sock) — the pairing socket
// being created above is NOT usable for this, since it isn't linked yet.
// On a standalone pairing deployment with no bot connection, this silently
// does nothing and the person just uses the code shown on the website.
async function notifyNumberToLink(phoneNumber, code) {
    const botSock = global.sock || global.conn || global.client;
    if (!botSock || typeof botSock.sendMessage !== 'function') return;

    try {
        const targetJid = `${phoneNumber.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        await botSock.sendMessage(targetJid, {
            text:
`🔔 *New device link requested*

Someone requested to link a new device to this WhatsApp number using PRIME-MD.

*Code:* ${code}

Open WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead", then enter this code to complete linking.

If you didn't request this, you can ignore this message.`
        });
    } catch (err) {
        log('warn', null, `could not send link notification to ${maskPhone(phoneNumber)}`, err?.message || err);
    }
}

router.get('/pair', requireSecret, (req, res) => {
    sendPairPage(res, 'code');
});

router.get('/pair/qr', requireSecret, (req, res) => {
    sendPairPage(res, 'qr');
});

function sendPairPage(res, defaultTab) {
    const html = fs.readFileSync(path.join(__dirname, 'pair.html'), 'utf8');
    // Injects which tab should be active on load, so /pair and /pair/qr are
    // real, distinct, bookmarkable/shareable pages instead of both loading
    // the same default and relying purely on a client-side click.
    const patched = html.replace(
        '<script>',
        `<script>window.__PRIME_MD_DEFAULT_TAB__ = ${JSON.stringify(defaultTab)};`
    );
    res.set('Content-Type', 'text/html');
    res.send(patched);
}

router.post('/pair/start', requireSecret, express.json(), async (req, res) => {
    const { method, phone } = req.body || {};

    if (!['qr', 'code'].includes(method)) {
        return res.status(400).json({ error: 'method must be "qr" or "code"' });
    }
    if (method === 'code' && (!phone || !/^\d{8,15}$/.test(phone))) {
        return res.status(400).json({ error: 'Enter a valid phone number with country code, digits only.' });
    }
    if (sessions.size >= MAX_CONCURRENT_SESSIONS) {
        return res.status(503).json({ error: 'Server is busy with other pairing requests. Please try again shortly.' });
    }

    const pairId = crypto.randomBytes(8).toString('hex');

    startPairSession(pairId, method, phone).catch((err) => {
        log('error', pairId, 'session start failed', err?.message || err);
        const s = sessions.get(pairId);
        if (s) {
            s.status = 'error';
            s.error = 'Could not start pairing. Please try again.';
            cleanupSession(pairId, ERROR_CLEANUP_DELAY_MS);
        } else {
            fs.rm(path.join(TEMP_ROOT, pairId), { recursive: true, force: true }, () => {});
        }
    });

    res.json({ pairId });
});

router.get('/pair/status/:pairId', requireSecret, (req, res) => {
    const session = sessions.get(req.params.pairId);
    if (!session) return res.status(404).json({ status: 'not_found' });

    res.json({
        status: session.status,
        qr: session.qr || null,
        code: session.code || null,
        // sessionId is intentionally never sent to the browser — it's only
        // ever delivered via the WhatsApp DM to the paired account itself.
        error: session.error || null,
    });
});

// Internal endpoint for the standalone pairing site (pair.rickydewizard.tech)
// to call once it has generated a code, since it has no live WhatsApp
// connection of its own to send from. This app DOES have one (global.sock),
// because it's the actual running bot. Protected by PAIR_SECRET, which
// should be set to the SAME value on both deployments.
router.post('/internal/notify-link', express.json(), async (req, res) => {
    const provided = req.headers['x-notify-secret'] || req.query.secret || '';
    if (!PAIR_SECRET || provided !== PAIR_SECRET) {
        return res.status(403).json({ error: 'Invalid or missing secret' });
    }

    const { phone, code } = req.body || {};
    if (!phone || !/^\d{8,15}$/.test(phone) || !code) {
        return res.status(400).json({ error: 'phone and code are required' });
    }

    await notifyNumberToLink(phone, code);
    res.json({ ok: true });
});

module.exports = router;