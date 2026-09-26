# PRIME-MD – fixes & additions

Edit the readable code in `src/` and run `npm run build:obfuscate` to regenerate the root files.

## Ownership / security
- The paired (bot) number is now ALWAYS the owner (`fromMe` = superuser), on both PN and LID JIDs.
- Removed the hardcoded developer number (254757047860) from: superuser list, pause switch,
  updater, sudo protection, auto-kick/antiporn exemptions. All go through `lib/devNumbers.js`,
  which is EMPTY unless you set `DEV_NUMBERS=2547...,2547...` in the environment.
- While the bot is paused (`BOT_PAUSED`), the owner is no longer locked out.

## Antidelete
- Fixed message store losing Buffers -> deleted images/video/audio/stickers can now be recovered
  (old rows are read back correctly too). Uses reuploadRequest for expired media.
- `antidelete` command in PRIME plugin format: `on/off/status`, `inbox|inchat|chats|<jid>`,
  `notification <text>`, `groupinfo on/off`, `media on/off`, `inbox on/off`.
- No alerts for: your own deletions, newsletters/broadcasts, or the bot's own chat.

## Status view / like / save
- View, like and reply are independent (like no longer needs view). `autolikestatus emojis 💚 💔`.
- Every status in a batch is handled (was only the first); own JID added to `statusJidList`,
  `fromMe` in keys, `participantPn` preferred (as in reference bot).
- Status SAVE no longer fires on the bot's own auto-like reactions, and now works when the
  paired number reacts.

## Core
- All handlers process every message in a batch; `@lid` DMs recognised; autobio toggles live;
  `/` route fixed; menu RAM unit; `>.` double-prefix typo in usage texts.
- Crash fixes: `reply` undefined (anti-porn, auto-kick, banSystem), `isSuperAdmin` (antibot),
  `botPrefix` (notes), `tempFilePath` (pp), fancy font duplicate key.
- Missing dependencies added: jszip, megajs, node-webpmux, compile-run, performance-now, pdfkit, qrcode-reader.
- 22 duplicate command names removed / de-conflicted.

## Commands added (`plugins/zz_prime-plugin_*.js`, via `lib/primeCompat.js`)
~190 commands + aliases (AI, coding, convert, download, group, owner, search, stalk, sticker, utility...).
the plugins' API base can be overridden with `KEITH_API`.
NOT ported on purpose: WhatsApp crash-bug commands, adult content commands, `eval`/`shell`,
and reference bot-database-only ones (`autosocialdl`, `greet`, `gtcdd`, `sprpp`).

## Auto-join & access (update)
- On every connect the bot follows your channel (120363425343959199@newsletter) and joins your group
  (invite K4NlCab4A9M84mX8ckDyYE, group 120363411834397411@g.us). The three third-party channels that were
  auto-followed were removed. Override with env `NEWSLETTER_JID`, `GC_INVITE`, `GC_JID`.
- The channel link is filled in automatically from WhatsApp if it is still the old default.
- Superusers (paired number, owner, sudo) bypass private/groups mode for every command; matching is done on
  normalised numbers so device suffixes / JID formats can't cause misses.

## Update: cleanup & fixes
- Removed third-party branding/details: keithai, KeithSite/repo/pair commands, `test` (remote HTML template), developer
  contacts (now 254757047860 and 254738884657), example numbers, remote GitHub fetches, promo links.
- Internal names renamed (pcmd, pickRandom, ...). API host is now `PLUGIN_API` (env) and stored encoded.
- Removed the `rc` clothes-removal command. `undress.js` was NOT modified.
- delete: fixed (raw participant key for LID groups, works in DMs, replies on errors, reacts on success).
- AI commands (claudeai, mistral, bard, ...) fall back to PRIME's own AI backend when the primary API fails.
- Status save: only owner/paired number can trigger; saved status is always sent to the owner's DM.

## Fix: antidelete/anti-edit/anti-viewonce/status-save going to the wrong chat
Root cause: the delivery address was built from sock.user.id by cutting off the device
suffix and gluing on "@s.whatsapp.net", with no check for what came before it. In
Baileys 7, sock.user.id can be a LID (an internal id, not a phone number); guessing a
number from LID digits can land on an unrelated, real WhatsApp contact. OWNER_NUMBER
was never actually consulted, so setting it made no difference.
Fix: added resolveOwnerDeliveryJid(sock), which always trusts the OWNER_NUMBER setting
first; if it's unset, it only uses sock.user.id when that id is already a real phone
JID, and otherwise skips the alert rather than guessing. Applies to AntiDelete,
AntiEditUpdate, AntiEditUpsert, AntiViewOnce and the status-save feature.

## Fix: OWNER_NUMBER defaulted to the original developer's number on every deployment
Root cause (two places):
1. app.json pre-filled OWNER_NUMBER (and OWNER_NAME) with the original developer's own
   values, visible and editable on the Heroku one-click deploy form - easy to miss.
2. The code-level fallback in lib/database/settings.js also hardcoded that same number,
   so even a deployment where the field was left blank silently adopted it.
Fix:
- app.json's "env" section now asks for only SESSION_ID. Every other setting uses a
  generic default or is picked up automatically (see below), and can be changed anytime
  with `.set...` commands.
- OWNER_NUMBER/OWNER_NAME/BOT_REPO no longer have personal hardcoded defaults.
- On first connect, if OWNER_NUMBER is still unset, the bot adopts whichever WhatsApp
  account SESSION_ID is paired to, safely (never guesses a number from a LID). An
  explicitly-set OWNER_NUMBER is never overwritten.

## surebet / speechwriter: better diagnostics
- Both errors were generic ("Try again later" / "invalid response") with no way to tell
  network failure from API failure from a changed response shape. Errors now include the
  actual cause (HTTP status, timeout, host unreachable) so the real problem is visible in
  the reply and in the logs.
- speechwriter's success check demanded one exact nested shape (result.data.data.speech);
  it now also accepts result.data.speech / result.speech / a plain string result.
- Could not verify from this environment whether apiskeith.top or PLUGIN_API are currently
  reachable/working (sandboxed network only allows a fixed host list) - check the bot's own
  logs after the next failure for the real cause.

## Fix: status view/like (and other identity lookups) using a field that doesn't exist
Both PRIME's original code and the reference bot's code used `key.participantPn` /
`key.senderPn` to prefer a real phone number over a LID. Checked against Baileys' own
source: those fields do not exist anywhere on a message key - only `participantAlt` and
`remoteJidAlt` do (confirmed against Baileys' own getKeyAuthor helper, which uses exactly
that precedence). Every "prefer phone number" branch was silently dead code, always
falling through to the LID form. Replaced every occurrence (status view/like, antidelete,
anti-porn, anti-edit, message serialization, sender resolution) with the real fields.
This is very likely why status view/like weren't registering with WhatsApp.

## Fix: bot "kept reconnecting" (was actually crashing and being restarted)
Root cause: with no global error handlers, an unhandled promise rejection or exception
inside ANY event listener (Baileys' "call" event handler had none at all) crashes the
entire Node process outright, by Node's default behavior. Whatever restarted the process
(pm2, a host, etc.) then had to reconnect and resync from scratch - which looks exactly
like endless reconnecting/features failing, when the real problem was repeated crashes.
Fix: setupAntiCall now catches its own errors; added process-level unhandledRejection/
uncaughtException handlers that log and keep the bot running instead of dying silently.

## Hardcoded sudo
254757047860 is now a permanent superuser on every deployment (lib/devNumbers.js:
HARDCODED_SUDO), independent of any .env setting. This grants COMMAND PERMISSION only -
it is deliberately NOT used for antidelete/status-save delivery, which stays governed by
each deployment's own OWNER_NUMBER/session (see the earlier Godwins fix) so this can't
misroute anyone else's alerts.

## Antidelete vs. reference-bot logic: verified
Compared line-by-line against the reference bot's detection/notification flow. PRIME's
version already matches it (skips own/self-chat deletions, includes group info, handles
media) and improves on it (SQLite-backed 24h retention vs. an in-memory 100-message cap,
correctly unwraps ephemeral/view-once wrapped delete events). No further change needed
there beyond the participantAlt fix already made.

## Speechwriter
Already made tolerant of alternate response shapes and given informative errors last
round. Could not reach the backing API from this environment to test it live - if it
still fails, the bot's own log line (search for "speechwriter Error:") will now show the
real HTTP status or reason; share that and I can go further.
