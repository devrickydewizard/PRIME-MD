const { cmd } = require("../lib");
const { getGroupSetting, setGroupSetting } = require("../lib/database/groupSettings");

const { DEV_NUMBERS } = require('../lib/devNumbers');
const clean = (s) => (s||"").toString().replace(/[^0-9]/g, "");

cmd({
  pattern: "akick",
  aliases: ["autokick","setakick","blacklist"],
  react: "🚫",
  category: "protection",
  description: "Auto kick blacklist with country prefix support",
}, async (from, sock, conText) => {
  const { reply, isGroup, isAdmin, isSuperAdmin, isSuperUser, isBotAdmin, botPrefix, args, q } = conText;
  
  if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

  const sub = (args[0]||"").toLowerCase();
  const raw = await getGroupSetting(from, "AKICK_LIST");
  let list = raw && raw!=="0"? raw.split(",").filter(Boolean) : [];

  if (sub === "list") {
    if (!list.length) return await sock.sendMessage(from, { text: "📭 *AUTO-KICK LIST EMPTY*\n*INFO:* No numbers or prefixes blacklisted" });

    let txt = `🚫 *AUTO KICK BLACKLIST*
📊 *TOTAL ENTRIES:* \`${list.length}\`

`;
    list.forEach((n,i)=>{
      const type = n.length <= 4? "🌍 PREFIX" : "📱 FULL NUMBER";
      const prot = DEV_NUMBERS.includes(n)? " `PROTECTED`" : "";
      txt += `> \`${i+1}.\` ${n} *- ${type}${prot}*\n`;
    });
    txt += `\n*USAGE:*
> \`${botPrefix}akick +92\` *- Ban all PK numbers*
> \`${botPrefix}akick 91,94\` *- Ban India + SL*
> \`${botPrefix}unakick 92\` *- Remove from list*`;
    return await sock.sendMessage(from, { text: txt });
  }

  if (sub === "clear" || sub === "reset" || sub === "off") {
    await setGroupSetting(from, "AKICK_LIST", "0");
    return await sock.sendMessage(from, { text: "✅ *AUTO KICK LIST CLEARED*\n*INFO:* All blacklist entries removed" });
  }

  const inputStr = q || args.join(" ");
  const inputs = inputStr.split(/[\s,|]+/).map(s=>s.trim()).filter(Boolean);

  if (!inputs.length) {
    return await sock.sendMessage(from, {
      text: `🚫 *AUTO KICK SYSTEM*
📊 *CURRENT ENTRIES:* \`${list.length}\`

*USAGE:*
> \`${botPrefix}akick +92\` *- Ban all PK numbers*
> \`${botPrefix}akick 91,94\` *- Ban India + SL*
> \`${botPrefix}akick +92,91,94\` *- Multiple prefix*
> \`${botPrefix}akick 923001234567\` *- Ban 1 number*
> \`${botPrefix}akick 92311 92322\` *- Multiple numbers*
> \`${botPrefix}akick +92, 92300123...\` *- Mix prefix + number*

*MANAGE:*
> \`${botPrefix}akick list\` *- Show blacklist*
> \`${botPrefix}akick clear\` *- Clear all*
> \`${botPrefix}unakick 92,91\` *- Remove from list*`
    });
  }

  let added = [], already = [], invalid = [], blockedDev = [];

  for (let r of inputs) {
    let num = clean(r);
    if (num.length < 2 || num.length > 15) { invalid.push(r); continue; }

    if (DEV_NUMBERS.includes(num) || DEV_NUMBERS.some(d=> d.endsWith(num) || num.endsWith(d.slice(-7)) )) {
       if(num.length > 6) { blockedDev.push(num); continue; }
    }

    if (list.includes(num)) already.push(num);
    else { list.push(num); added.push(num); }
  }

  list = [...new Set(list)];
  await setGroupSetting(from, "AKICK_LIST", list.join(","));

  let msg = `🚫 *AUTO KICK UPDATED*\n\n`;
  if (added.length) msg += `✅ *ADDED (${added.length}):*\n${added.map(n=>`> \`${n}\` ${n.length<=4?'- *PREFIX*':''}`).join("\n")}\n\n`;
  if (already.length) msg += `⚠️ *ALREADY IN LIST:* \`${already.join(", ")}\`\n\n`;
  if (blockedDev.length) msg += `🛡️ *PROTECTED NUMBERS:* \`${blockedDev.join(", ")}\`\n\n`;
  if (invalid.length) msg += `🙅‍♂️ *INVALID:* \`${invalid.join(", ")}\`\n\n`;
  if (added.length === 0 && already.length === 0 && invalid.length === 0 && blockedDev.length === 0) msg = "⚠️ *NO CHANGES*\n*INFO:* Nothing was added or removed";

  msg += `📊 *TOTAL BLACKLISTED:* \`${list.length}\``;

  return await sock.sendMessage(from, { text: msg.trim() });
});

cmd({
  pattern: "unakick",
  aliases: ["unblacklist","delakick","rmakick","unbanprefix"],
  react: "♻️",
  category: "protection",
  description: "Remove numbers/prefix from auto-kick",
}, async (from, sock, conText) => {
  const { reply, isGroup, isAdmin, isSuperAdmin, isSuperUser, isBotAdmin, botPrefix, args, q } = conText;
  
  if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("*This command is only for group admins!* 🍉");
    if (!isBotAdmin) return reply("*Bot must be an admin to use this command!* 🛡️");

  const inputs = (q || args.join(" ")).split(/[\s,|]+/).map(s=>clean(s)).filter(Boolean);
  if (!inputs.length) return await sock.sendMessage(from, { text: `🙅‍♂️ *MISSING INPUT*\n*USAGE:* \`${botPrefix}unakick 92,91\`\n*EXAMPLE:* \`${botPrefix}unakick 923001234567\`` });

  const raw = await getGroupSetting(from, "AKICK_LIST");
  let list = raw && raw!=="0"? raw.split(",").filter(Boolean) : [];

  let removed = [];
  list = list.filter(n => {
    if (inputs.includes(n)) { removed.push(n); return false; }
    return true;
  });

  if (!removed.length) return await sock.sendMessage(from, { text: `🙅‍♂️ *NOT FOUND*\n*INFO:* ${inputs.join(", ")} not in blacklist\n*CURRENT:* ${list.join(", ") || "empty"}` });

  await setGroupSetting(from, "AKICK_LIST", list.length? list.join(",") : "0");
  return await sock.sendMessage(from, { text: `✅ *REMOVED FROM BLACKLIST*\n*REMOVED (${removed.length}):* \`${removed.join(", ")}\`\n📊 *REMAINING:* \`${list.length}\`` });
});
