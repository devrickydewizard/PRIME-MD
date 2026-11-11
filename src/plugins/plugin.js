const { cmd } = require('../lib');
const { getSetting, setSetting } = require('../lib/database/settings');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const pluginsDir = path.join(__dirname, '.');
const GIST_URL_RE = /https?:\/\/gist\.github\.com\/\S+/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DB HELPERS — track installed (gist) plugins only
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getInstalledPlugins() {
    try {
        const raw = await getSetting('INSTALLED_PLUGINS');
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

async function saveInstalledPlugins(data) {
    await setSetting('INSTALLED_PLUGINS', JSON.stringify(data));
}

// ✅ Self-protect: delete/reload/update only ever touch files tracked in
// INSTALLED_PLUGINS. Core bot files are never in that list, so they're
// automatically untouchable.
async function assertIsTrackedPlugin(name) {
    const installed = await getInstalledPlugins();
    if (!installed[name]) return { ok: false, installed };
    return { ok: true, installed };
}

function normalizeName(name) {
    name = (name || '').trim();
    if (name && !name.endsWith('.js')) name += '.js';
    return name;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RESTORE ON STARTUP — reinstall DB-tracked plugins after a bot restart
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(async () => {
    try {
        const installed = await getInstalledPlugins();
        const entries = Object.entries(installed);
        if (!entries.length) return;

        for (const [filename, info] of entries) {
            const pluginPath = path.join(pluginsDir, filename);
            try {
                if (!(await fs.pathExists(pluginPath))) {
                    const { data: content } = await axios.get(info.raw_url);
                    await fs.writeFile(pluginPath, content, 'utf8');
                }
                try {
                    const resolved = require.resolve(pluginPath);
                    if (!require.cache[resolved]) require(pluginPath);
                } catch (loadErr) {
                    console.error(`[PluginManager] "${filename}" failed to load: ${loadErr.message}`);
                }
            } catch (e) {
                console.error(`[PluginManager] Failed to restore "${filename}": ${e.message}`);
            }
        }
    } catch (e) {
        console.error('[PluginManager] Restore error:', e.message);
    }
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GIST HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function fetchGist(urlOrId) {
    const gistId = urlOrId.match(/([a-fA-F0-9]{20,})/)?.[1];
    if (!gistId) throw new Error('Invalid Gist URL or ID');
    const { data } = await axios.get(`https://api.github.com/gists/${gistId}`);
    return data;
}

async function getFileContent(jsFile) {
    if (jsFile.truncated) {
        const { data } = await axios.get(jsFile.raw_url);
        return data;
    }
    return jsFile.content;
}

// ✅ Core install logic — installs every .js file in a Gist, no restart needed.
async function installFromGist(url) {
    const data = await fetchGist(url);
    const jsFiles = Object.values(data.files).filter(f => f.filename.endsWith('.js'));
    if (!jsFiles.length) throw new Error('No .js files found in this Gist!');

    const installed = await getInstalledPlugins();
    const results = { installed: [], skipped: [], failed: [] };

    for (const jsFile of jsFiles) {
        const pluginPath = path.join(pluginsDir, jsFile.filename);

        if (await fs.pathExists(pluginPath)) {
            results.skipped.push(jsFile.filename);
            continue;
        }

        let content;
        try {
            content = await getFileContent(jsFile);
        } catch (e) {
            results.failed.push(`${jsFile.filename} (download error)`);
            continue;
        }

        try {
            await fs.writeFile(pluginPath, content, 'utf8');
            require(pluginPath); // load immediately, no restart
        } catch (loadErr) {
            await fs.unlink(pluginPath).catch(() => {});
            results.failed.push(`${jsFile.filename} (broken/unsupported code)`);
            continue;
        }

        installed[jsFile.filename] = {
            raw_url: jsFile.raw_url,
            gist_url: data.html_url,
            description: data.description || '',
            installed_at: Date.now(),
        };
        results.installed.push(jsFile.filename);
    }

    await saveInstalledPlugins(installed);
    return { data, results };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  .plugin — unified command
//  • .plugin <gist url>  → auto install (no restart)
//  • .plugin <name>      → gist link of that installed plugin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "plugin",
        aliases: ["install", "gist", "addplugin"],
        react: "🧩",
        category: "utility",
        description: "Install a plugin from Gist, or get the Gist link of an installed one",
    },
    async (from, sock, conText) => {
        const { reply, react, isSuperUser, args, quotedMsg, botPrefix } = conText;
        if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

        let input = (args[0] || '').trim();

        if (!input && quotedMsg) {
            const qText =
                quotedMsg.conversation ||
                quotedMsg.extendedTextMessage?.text ||
                quotedMsg.imageMessage?.caption || '';
            const match = qText.match(GIST_URL_RE);
            if (match) input = match[0];
        }

        if (!input) {
            return reply(`🙅‍♂️ Provide a Gist URL to install, or a plugin name to get its link.\nEg: ${botPrefix}plugin https://gist.github.com/user/abc123\nEg: ${botPrefix}plugin ping`);
        }

        // Case 1: Gist URL → auto install
        if (GIST_URL_RE.test(input)) {
            await react("⏳");
            try {
                const { data, results } = await installFromGist(input);
                const lines = [];
                if (results.installed.length) lines.push(`✅ *Newly installed plugins:* \`${results.installed.join(', ')}\``);
                if (results.skipped.length) lines.push(`⚠️ *Already exists:* \`${results.skipped.join(', ')}\``);
                if (results.failed.length) lines.push(`🙅‍♂️ Failed: ${results.failed.join(', ')}`);
                lines.push(`🔗 ${data.html_url}`);

                await react(results.installed.length ? "✅" : "🙅‍♂️");
                return reply(lines.join('\n'));
            } catch (e) {
                await react("🙅‍♂️");
                return reply(`🙅‍♂️ Install failed: ${e.message}`);
            }
        }

        // Case 2: plugin name → return its gist link
        const name = normalizeName(input);
        const installed = await getInstalledPlugins();
        const info = installed[name];

        if (!info) {
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ *${name}* is not installed on this bot.`);
        }

        await react("✅");
        return reply(`🧩 \`${name}\`\n🔗 ${info.gist_url}`);
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  .pluginlist — all installed (Gist-tracked) plugins
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "pluginlist",
        aliases: ["listplugins", "plugins"],
        react: "✳️",
        category: "utility",
        description: "List installed Gist plugins",
    },
    async (from, sock, conText) => {
        const { reply, isSuperUser } = conText;
        if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

        const installed = await getInstalledPlugins();
        const names = Object.keys(installed).sort();
        if (!names.length) return reply("📂 No plugins installed.");

        const list = names.map((f, i) => `${i + 1}. ${f}`).join('\n');
        return reply(`📋 *Installed Plugins* (${names.length})\n${list}`);
    }
);

// ━━━━━━━━━━━━━━━
//.plugininfo NEW
// ━━━━━━━━━━━━━━━
cmd({
    pattern: "plugininfo",
    aliases: ["pinfo"],
    react: "ℹ️",
    category: "utility",
    description: "Get info about an installed plugin"
}, async (from, sock, conText) => {
    const { reply, isSuperUser, args, botPrefix } = conText;
    if (!isSuperUser) return reply("*Owner only*");
    const name = normalizeName(args[0]);
    if (!name) return reply(`Eg: ${botPrefix}plugininfo ping.js`);
    const installed = await getInstalledPlugins();
    const info = installed[name];
    if (!info) return reply(`🙅‍♂️ *${name}* not found`);
    const installedAt = new Date(info.installed_at).toLocaleString("en-PK", {timeZone: "Asia/Karachi"});
    const updatedAt = info.updated_at? new Date(info.updated_at).toLocaleString("en-PK", {timeZone: "Asia/Karachi"}) : 'Never';
    return reply(`🧩 *${name}*\n📝 ${info.description || 'No description'}\n🔗 ${info.gist_url}\n📅 Installed: ${installedAt}\n🔄 Updated: ${updatedAt}`);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  .deleteplugin — multiple plugin delete support
//  eg: .deleteplugin ping.js,alive.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "deleteplugin",
        aliases: ["removeplugin", "uninstall"],
        react: "🗑️",
        category: "utility",
        description: "Delete one or more installed Gist plugins",
    },
    async (from, sock, conText) => {
        const { reply, react, isSuperUser, args, quotedMsg, botPrefix } = conText;
        if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

        let rawInput = args.join(' ').trim();
        if (!rawInput && quotedMsg?.documentMessage?.fileName) {
            rawInput = quotedMsg.documentMessage.fileName;
        }
        if (!rawInput) return reply(`🙅‍♂️ Provide plugin name(s).\nEg: ${botPrefix}deleteplugin ping.js,alive.js`);

        const names = [...new Set(rawInput.split(',').map(n => normalizeName(n)).filter(Boolean))];

        await react("⏳");
        const installed = await getInstalledPlugins();
        const deleted = [], failed = [];

        for (const name of names) {
            if (!installed[name]) { failed.push(name); continue; }

            const pluginPath = path.join(pluginsDir, name);
            try {
                if (await fs.pathExists(pluginPath)) await fs.unlink(pluginPath);
                const resolved = require.resolve(pluginPath);
                if (require.cache[resolved]) delete require.cache[resolved];
                delete installed[name];
                deleted.push(name);
            } catch {
                failed.push(name);
            }
        }

        await saveInstalledPlugins(installed);

        const lines = [];
        if (deleted.length) lines.push(`✅ *Deleted:* \`${deleted.join(', ')}\``);
        if (failed.length) lines.push(`🙅‍♂️ Failed: ${failed.join(', ')}`);

        await react(deleted.length ? "✅" : "🙅‍♂️");
        return reply(lines.join('\n'));
    }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  .updateplugin — re-download an already-installed plugin from its Gist
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd(
    {
        pattern: "updateplugin",
        aliases: ["pluginupdate"],
        react: "🔁",
        category: "utility",
        description: "Update an installed Gist plugin",
    },
    async (from, sock, conText) => {
        const { reply, react, isSuperUser, args, botPrefix } = conText;
        if (!isSuperUser) return reply("*This area is reserved for the bot owner only.* 🕷️");

        const name = normalizeName(args[0]);
        if (!name) return reply(`🙅‍♂️ Provide a plugin name.\nEg: ${botPrefix}updateplugin ping.js`);

        const { ok, installed } = await assertIsTrackedPlugin(name);
        if (!ok) return reply(`🙅‍♂️ *${name}* is not an installed Gist plugin.`);

        const info = installed[name];
        if (!info?.raw_url) return reply(`🙅‍♂️ No Gist info found for *${name}*. Reinstall it: ${botPrefix}plugin <gist_url>`);

        await react("⏳");
        const pluginPath = path.join(pluginsDir, name);

        let backupContent = null;
        try {
            if (await fs.pathExists(pluginPath)) backupContent = await fs.readFile(pluginPath, 'utf8');
        } catch {}

        let newContent;
        try {
            newContent = (await axios.get(info.raw_url)).data;
        } catch (e) {
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ Download failed: ${e.message}`);
        }

        try {
            await fs.writeFile(pluginPath, newContent, 'utf8');
            const resolved = require.resolve(pluginPath);
            if (require.cache[resolved]) delete require.cache[resolved];
            require(pluginPath);

            installed[name].updated_at = Date.now();
            await saveInstalledPlugins(installed);

            await react("✅");
            return reply(`✅ \`${name}\` *updated & reloaded!*`);
        } catch (e) {
            if (backupContent !== null) {
                try {
                    await fs.writeFile(pluginPath, backupContent, 'utf8');
                    const resolved = require.resolve(pluginPath);
                    if (require.cache[resolved]) delete require.cache[resolved];
                    require(pluginPath);
                } catch {}
                await react("🙅‍♂️");
                return reply(`🙅‍♂️ Update failed (broken code) — reverted to old version.`);
            }
            await react("🙅‍♂️");
            return reply(`🙅‍♂️ Update failed (broken code), no backup to revert to.`);
        }
    }
);
