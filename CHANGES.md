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

## Update: build resilience + OWNER_NUMBER capture at pairing + hardcoded sudo
- build.js no longer aborts the ENTIRE build if one file fails to obfuscate (this is very
  likely why the shipped root had gone stale/out of sync with src - a single broken file
  was silently killing the whole build after that point). It now ships that one file
  un-obfuscated with a clear warning and finishes everything else.
- OWNER_NUMBER is now captured directly from the phone number typed into the pairing
  website (the one moment it's known for certain, before any LID/PN ambiguity), and
  persisted immediately once pairing succeeds - without overwriting an existing value.
  QR-pairing and externally-supplied SESSION_IDs still fall back to the session-derived
  logic from before; use `.setownernumber <number>` to set it directly at any time.
- 254757047860 is hardcoded as a permanent superuser (command permission only - never
  used for alert delivery, see the earlier note on this).
- Connection-close logging now names the actual disconnect reason and flags
  connectionReplaced specifically (same session used in two places at once) - check
  the logs for "Connection closed due to:" to see why a reconnect happened.

## Merged from PRIME-MD-HEROKU-FIXED.zip (your changes), plus safety fixes
Your changes (kept as-is):
- Heroku: package.json now runs `node index.js` directly instead of pm2. Running pm2
  inside a Heroku dyno is a known source of instability - Heroku's own dyno supervisor
  and a nested process manager can fight each other over restarts/signals. This is very
  likely a real contributor to (maybe the whole cause of) the Heroku reconnect loop.
- WhatsApp session credentials and the message/antidelete cache moved from local SQLite
  files (wiped on every Heroku dyno cycle) to Postgres, using the add-on already
  provisioned in app.json - so a session now survives dyno restarts/redeploys on Heroku.
- getMessage() now returns undefined instead of a fake placeholder message when nothing
  is cached (returning fabricated content here can make Baileys resend garbled text on a
  retry) - correct per Baileys' own contract.
- Status view/react key no longer copies the status's own `fromMe`; reads now also pass
  statusJidList so "seen" registers correctly with the status owner.

Safety fixes made on top of your changes (both were silent, severe regressions I caught
before shipping):
- Without DATABASE_URL (e.g. Termux), your version kept the session/cache in memory only,
  and deleted the old on-disk backup after migrating it in - so the FIRST restart after
  upgrading would have permanently logged the bot out, every time, with no way back except
  re-pairing. Fixed: falls back to a local JSON file instead, and only deletes the old file
  once something durable actually has the data.
- Your package.json also removed the "sqlite3" package, but lib/database/database.js (the
  main settings DB, unrelated to your changes) still needs it for local/Termux use without
  DATABASE_URL - would have crashed at startup there. Added it back; better-sqlite3 stays
  removed since nothing uses it anymore.
- If Postgres is set but briefly unreachable at boot, both files now fall back to the local
  file instead of crashing the whole bot outright.

## Fixed: .pair command timing out
Root cause: it called an external site (pair.rickydewizard.tech) that most deployments
can't reach - not part of this project at all. The bot's OWN pairing website (lib/pairing.js)
is already running on the same server; PAIR_SITE_URL now defaults to calling that instead.
The "Open Website" button no longer shows a dead localhost link when no public URL is set
(set PUBLIC_URL to your Heroku app's URL to bring it back).

## speechwriter: added a fallback
No new specific error was reported this time; since the underlying API's reliability can't
be checked from here, speechwriter now falls back to the same general AI backend used by
claudeai/mistral/etc. if the primary Speechwriter API fails, instead of only reporting an
error.

## Heroku stack updated to heroku-24 in app.json
Note: this repo also ships heroku.yml (Docker/container build). If you deploy with
`heroku stack:set container`, heroku.yml's Dockerfile governs the OS, not this stack field.
For a normal buildpack deploy (`git push heroku main` without setting container stack),
`heroku stack:set heroku-24 -a your-app` before pushing is what actually applies it.

## Status view/like diagnostics
Verified against the exact Baileys version installed: the like/react call correctly uses
statusJidList (confirmed in Baileys' own relayMessage), and the view/read call is also
correctly built - a second argument to readMessages() is simply unused in this version,
harmless either way. If Read Receipts is on and it's STILL doing nothing, the likely cause
is that loading settings (AUTO_READ_STATUS/AUTO_LIKE_STATUS) is silently failing and being
swallowed as "transient" network noise - fixed so that specific failure is now always
logged, never hidden.

Added STATUS_DEBUG=true (set as an env var, restart the bot) for line-by-line status
handling logs: whether an update arrived at all, what the settings resolved to, and
whether each action fired or was skipped and why. Turn it off again once diagnosed - it's
noisy by design.

## "Waiting for this message" + status like
- Clarified: server console logs (Heroku/Termux terminal output) never appear inside
  WhatsApp itself. "Waiting for this message" is WhatsApp's own placeholder, shown when it
  can't retrieve a message for a retry - unrelated to what prints in your terminal.
- getMessage() already correctly tries the message store first and only returns undefined
  on a genuine miss (never a fake placeholder, which is the #1 known cause of "Waiting for
  this message"). Added a one-time self-test at boot that saves and reads back a probe
  message, logging a clear PASS or FAIL - if the store is silently broken (e.g. a bad
  DATABASE_URL), you'll now see it immediately instead of guessing.
- View and like are controlled by two SEPARATE settings. If view works but like doesn't,
  check `.autolikestatus status` first - it is very likely just turned off independently.

## kick: silent failures and a likely "Waiting for this message" cause
- Verified against the installed Baileys version: groupParticipantsUpdate can REJECT a
  removal (not an admin, target already gone, etc.) WITHOUT throwing a JS error - it just
  returns a per-participant status. The old code never checked this, so a rejected kick
  was reported as "has been removed from the group" even though nothing happened. It now
  checks the actual status and reports a real failure when WhatsApp rejects it.
- The success message @mentioned the just-removed person. Mentioning someone who is no
  longer a group member can fail to render for other members (shows as "Waiting for this
  message") since the group's encryption key material for them is already gone. Removed
  that mention from the post-kick confirmation only (mentions before removal, while they're
  still a member, are untouched).
- Added console logging at each step (attempt / WhatsApp status / thrown error) so a future
  failure shows the real reason instead of needing to guess again.

## Audited every group membership command for the same silent-failure bug
promote and demote had the exact same issue kick did: WhatsApp can reject the action
without throwing a JS error, and the old code reported success regardless. Both now check
the real per-participant status and report an honest failure. add's catch-all branch could
silently claim success on an unexpected status code too; tightened to only report success
on an actual 200. META AI add/remove were already correct. The bulk group-termination
command removes everyone then leaves immediately after, so a per-member failure there
doesn't change the outcome - left as is.

## Status: reconnect-replay protection, faster getMessage, hardened admin matching
Reviewed against a third-party reference implementation (wa-fixes.js) you shared. Adopted:
- Status updates now skip duplicates (same id seen twice) and anything older than 2
  minutes. Previously, every reconnect could re-deliver a backlog of recent statuses with
  no guard at all, causing the bot to re-view/re-like everything again each time - spammy
  and a real rate-limit/ban risk. Tested directly: fresh processes normally, a repeat id is
  skipped, anything over 2 minutes old is skipped.
- A small random delay (0.6-2s) before auto-liking, so reactions don't look mechanically
  instant.
- getMessage() now checks a fast in-memory cache first, falling back to the database-backed
  store only on a miss - removes a DB round-trip from WhatsApp's time-sensitive retry path,
  and still works even if the database is briefly unavailable.
- Admin/bot-admin detection now checks every id a participant might be known by (phone
  number, LID, etc.), not just one preferred field - guards against the exact kind of
  LID/PN mismatch that's caused problems elsewhere in this project. Tested directly against
  both a LID-only and a phone-number-only participant record.

## "Bot must be admin" + antidelete fixes (continued from previous session)
- Replaced getGroupInfo/buildSuperUsers (lib/connection/commandHandler.js) with a fully
  multi-format, LID-safe admin detection: checks every id form a participant might carry
  (phone number, LID, pn, phoneNumber, jid), teaches itself the bot's own LID by matching
  against known numbers, and re-fetches group metadata once if the first check comes back
  "not admin" in case the cached copy was just stale. Added the matching getBotNums/
  learnBotIdentity/isAdminRole/participantNums/refreshGroupMetadata/idNum helpers to
  groupCache.js. Tested directly against mixed LID/PN participant records, including the
  bot itself listed only by LID, and a message sent as the bot's own account - all correct.
- Fixed the real cause of antidelete "only retrieving two messages and skipping the rest at
  deployment time": ensureReady()/ensureTable() used a boolean _ready flag, so a burst of
  concurrent calls right at startup (very common as backlog messages arrive right after
  connecting) could race each other's CREATE TABLE IF NOT EXISTS, and the race losing call
  would permanently trip the Postgres-unavailable fallback for the rest of the process -
  even though Postgres was fine. Fixed with a shared in-flight promise so concurrent callers
  await the same single attempt. Tested directly: 5 concurrent calls now produce exactly 1
  query attempt instead of racing.
- index.js rewritten with a second antidelete detection path (messages.update, for revokes
  that don't show up as a protocol message in messages.upsert) and a shared dedup reservation
  so both paths can never double-alert on the same deletion. Tested directly: simultaneous
  firing from both paths produces exactly one alert, not two.

## New: .clear command
Clears the current chat. In a group: if both you and the bot are admins, it deletes every
cached message for everyone (admins can remove any member's message on WhatsApp); if the
bot isn't an admin, it falls back to clearing only the bot's own view, with a clear
explanation why. In a DM: the bot's own sent messages are deleted for everyone, and
everything else is cleared from the bot's own view only - WhatsApp has no way for anyone to
delete someone else's DM message for them, so that limit is stated honestly rather than
pretended away. Always finishes with a local clear so the bot's own view ends up empty with
no leftover "message deleted" placeholders. Needed a new listRecentMessages() function in
the message store to find message keys to act on; tested directly against the local
(no-database) fallback.

## Fixed: .repo command
Broken by an earlier change (removing a hardcoded personal default so other deployments
wouldn't show this project's own GitHub repo). With nothing set, .repo called GitHub's API
with an empty path and returned a generic error. Now gives clear guidance instead - tells
the owner how to set it (.setbotrepo owner/repo) and tells anyone else to ask the owner.
Also improved the error message for a genuinely wrong/missing repo (404) vs. any other
failure.

## gifted.co.ke is dead - YouTube song/video download replaced
Live connectivity tests from a real device confirmed EVERY gifted.co.ke subdomain
(api., cdn., files., ghbcdn., yts.) times out - the whole service is down, not just some
endpoints. play.js's "six fallback endpoints" were all the same dead host under six
different URL paths, so they all failed together and never actually provided redundancy.
- .play and .video now extract YouTube audio/video via the btch-downloader package instead.
  queryAPI() keeps the exact same return shape as before, so everything downstream (captions,
  buttons, retry-on-bad-buffer, large-file-as-document handling) is untouched. Tested the
  surrounding logic directly (audio picks mp3, video picks mp4, failed/empty responses
  produce a clean error) - the actual network call can't be tested from the build
  environment and needs a live check on the device.
- btch-downloader itself relies on one third-party backend (backend1.tioo.eu.org), the same
  structural risk gifted.co.ke had. Errors now surface the real cause (global
  describeApiError helper) so any future outage is visible immediately, not silent.
- STILL USING THE DEAD HOST (not yet replaced): downloader.js (other platforms), tourl.js
  alicdn/githubcdn uploads, shortener.js, tempmail.js, general.js, owner.js, owner2.js,
  tools.js, tools#U00b2.js, search.js, search2.js, Functions2.js, Functions3.js.
  catbox/pixhost/imgbb uploads in tourl.js need checking separately for their own hosts.
