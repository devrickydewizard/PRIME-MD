// Calculator - sends the game as a rich WhatsApp message (fixed: the old version built the message but never sent it).
const { cmd } = require("../lib");
const { sendHtmlGame } = require("../lib/gameSend");

const gameCooldown = new Map();
const TITLE = "Calculator";
const TRUSTED = ["rin.dev"];
const HTML = "\n<style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@700;900&display=swap');*{-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;box-sizing:border-box}</style>\n<body style=\"margin:0;background:#0A0A0F;font-family:'Roboto',Arial,sans-serif;color:#fff;touch-action:manipulation\">\n<div style=\"width:100%;max-width:420px;margin:auto;padding:16px\">\n<div style=\"background:linear-gradient(180deg,#111118 0%,#0A0A0F 100%);border:2px solid #2A2A35;border-radius:18px;padding:20px;box-shadow:0 0 25px rgba(0,140,255,.12)\">\n<div style=\"font-size:11px;letter-spacing:2px;color:#00A2FF;margin-bottom:8px;font-weight:900\">RIN CALCULATOR</div>\n<div id=\"display\" style=\"background:#16161F;border:2px solid #2E2E3A;border-radius:12px;padding:18px;margin-bottom:16px;text-align:right;font-size:32px;font-weight:900;min-height:60px;word-wrap:break-word;box-shadow:inset 0 0 15px rgba(0,0,0,.4)\">0</div>\n<div id=\"sub\" style=\"text-align:right;font-size:14px;color:#8A8A9E;margin-top:-12px;margin-bottom:16px;height:18px\"> </div>\n<div style=\"display:grid;grid-template-columns:repeat(4,1fr);gap:10px\">\n<button class=\"btn op\" data-v=\"C\">C</button>\n<button class=\"btn op\" data-v=\"DEL\">⌫</button>\n<button class=\"btn op\" data-v=\"%\">%</button>\n<button class=\"btn op\" data-v=\"/\">÷</button>\n<button class=\"btn num\" data-v=\"7\">7</button>\n<button class=\"btn num\" data-v=\"8\">8</button>\n<button class=\"btn num\" data-v=\"9\">9</button>\n<button class=\"btn op\" data-v=\"*\">×</button>\n<button class=\"btn num\" data-v=\"4\">4</button>\n<button class=\"btn num\" data-v=\"5\">5</button>\n<button class=\"btn num\" data-v=\"6\">6</button>\n<button class=\"btn op\" data-v=\"-\">−</button>\n<button class=\"btn num\" data-v=\"1\">1</button>\n<button class=\"btn num\" data-v=\"2\">2</button>\n<button class=\"btn num\" data-v=\"3\">3</button>\n<button class=\"btn op\" data-v=\"+\">+</button>\n<button class=\"btn num\" data-v=\"0\" style=\"grid-column:span 2\">0</button>\n<button class=\"btn num\" data-v=\".\">.</button>\n<button class=\"btn eq\" data-v=\"=\">=</button>\n</div></div></div>\n<style>\n.btn{border:none;border-radius:10px;padding:16px;font-size:20px;font-weight:900;cursor:pointer;transition:.15s;background:#1F1F29;color:#fff;border:1px solid #2E2E3A}\n.btn:active{transform:scale(.92)}\n.num:hover{background:#25252F}\n.op{background:#23232E;color:#00A2FF}\n.op:hover{background:#2A2A35;box-shadow:0 0 10px rgba(0,162,255,.3)}\n.eq{background:linear-gradient(135deg,#00A2FF,#0080FF);color:#fff;box-shadow:0 0 15px rgba(0,162,255,.4)}\n.eq:hover{filter:brightness(1.15)}\n</style>\n<script>\nlet expr='',display=document.getElementById('display'),sub=document.getElementById('sub');\nfunction update(){\ndisplay.textContent=expr||'0';\n}\nfunction calc(){\ntry{\nlet res=Function('return '+expr.replace(/×/g,'*').replace(/÷/g,'/'))();\nsub.textContent=expr+' =';\nexpr=String(res);\n}catch(e){expr='Error';setTimeout(()=>{expr=''},1200)}\nupdate();\n}\ndocument.querySelectorAll('.btn').forEach(b=>{\nb.onclick=()=>{\nlet v=b.dataset.v;\nif(v==='C'){expr='';sub.textContent=' '}\nelse if(v==='DEL'){expr=expr.slice(0,-1)}\nelse if(v==='='){calc();return}\nelse{expr+=v}\nupdate();\n}\n});\n</script>\n</body>\n";

cmd({
  pattern: "calc",
  aliases: ["calculator","cal"],
  react: "🧮",
  category: "tools",
  description: "Interactive Calculator"
}, async (from, sock, conText) => {
  const { reply, react, mek } = conText;
  const user = conText.sender || from;
  const now = Date.now();
  if (gameCooldown.has(user) && now - gameCooldown.get(user) < 10000) {
    return reply("⏳ Please wait 10 seconds before starting another game.");
  }
  gameCooldown.set(user, now);
  setTimeout(() => gameCooldown.delete(user), 10000);

  try {
    await react("⏳");
    await sendHtmlGame(sock, from, mek, { title: TITLE, html: HTML, trusted: TRUSTED });
    await react("✅");
  } catch (err) {
    console.error("[Calculator]", "Error:", err?.stack || err);
    await react("❌");
    return reply("❌ *Error:* " + err.message);
  }
});
