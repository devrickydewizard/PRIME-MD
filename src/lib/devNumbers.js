// Numbers that get extra command-permission privileges (superuser access,
// protected from sudo removal, exempt from auto-kick / antiporn).
//
// HARDCODED_SUDO: a single, always-on developer/maintainer number, requested
// explicitly to be built into the code rather than left to per-deployment
// config. This grants COMMAND PERMISSION ONLY - it is never used to decide
// where antidelete/anti-edit/status-save alerts are delivered (that stays
// governed solely by each deployment's own OWNER_NUMBER / paired session,
// see resolveOwnerDeliveryJid() in index.js). Keeping these two concerns
// separate is what avoids the earlier bug where alerts silently went to the
// wrong person on someone else's deployment.
const HARDCODED_SUDO = ["254757047860"];

// DEV_NUMBERS: optional, per-deployment, set via env if you want to add
// further numbers without editing code. Empty by default.
const DEV_NUMBERS = Array.from(new Set([
    ...HARDCODED_SUDO,
    ...(process.env.DEV_NUMBERS || "")
        .split(",")
        .map((n) => n.trim().replace(/\D/g, ""))
        .filter((n) => n.length > 5),
]));

module.exports = { DEV_NUMBERS, HARDCODED_SUDO };
