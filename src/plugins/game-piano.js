// Piano - sends the game as a rich WhatsApp message (fixed: the old version built the message but never sent it).
const { cmd } = require("../lib");
const { sendHtmlGame } = require("../lib/gameSend");

const gameCooldown = new Map();
const TITLE = "Piano";
const TRUSTED = ["nixel.dev"];
const HTML = "\n<!DOCTYPE html>\n<html>\n<head>\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no\">\n<style>\n*{\nbox-sizing:border-box;\n-webkit-tap-highlight-color:transparent;\n}\nhtml,body{\nmargin:0;\npadding:0;\nbackground:linear-gradient(#5c94fc,#8fc4ff);\nfont-family:Arial,sans-serif;\noverflow-x:hidden;\n}\nbody{\npadding:20px 0;\n}\n.title{\ntext-align:center;\ncolor:white;\nfont-size:22px;\nfont-weight:bold;\n}\n.sub{\ntext-align:center;\ncolor:white;\nfont-size:13px;\nmargin:6px 0 25px;\n}\n.piano-wrap{\nwidth:100%;\npadding:0 12px;\n}\n.piano{\nposition:relative;\nwidth:100%;\nheight:52vw;\nmax-height:260px;\nmin-height:170px;\ndisplay:flex;\ntouch-action:none;\n}\n.white{\nposition:relative;\nwidth:12.5%;\nflex:1 1 12.5%;\nheight:100%;\npadding:0;\nmargin:0;\nbackground:#fff;\nborder:1px solid #222;\nborder-radius:0 0 8px 8px;\ncolor:#222;\nfont-size:11px;\nfont-weight:bold;\ndisplay:flex;\nalign-items:flex-end;\njustify-content:center;\npadding-bottom:14px;\nbox-shadow:0 5px 0 #aaa;\nz-index:1;\n}\n.white:first-child{\nborder-radius:10px 0 0 10px;\n}\n.white:last-child{\nborder-radius:0 10px 10px 0;\n}\n.white:active,\n.white.active{\nbackground:#ddd;\ntransform:translateY(5px);\nbox-shadow:0 1px 0 #888;\n}\n.black{\nposition:absolute;\ntop:0;\nwidth:9%;\nheight:58%;\npadding:0;\nmargin:0;\nbackground:linear-gradient(90deg,#111,#333,#050505);\nborder:2px solid #000;\nborder-radius:0 0 6px 6px;\ncolor:white;\nfont-size:9px;\nfont-weight:bold;\ndisplay:flex;\nalign-items:flex-end;\njustify-content:center;\npadding-bottom:10px;\nbox-shadow:0 6px 5px rgba(0,0,0,.5);\nz-index:5;\n}\n.black:active,\n.black.active{\nbackground:#555;\ntransform:translateY(4px);\nbox-shadow:0 2px 3px rgba(0,0,0,.5);\n}\n.b1{left:7.8%}\n.b2{left:20.3%}\n.b3{left:45.3%}\n.b4{left:57.8%}\n.b5{left:70.3%}\n\n#note{\ntext-align:center;\ncolor:white;\nfont-size:22px;\nfont-weight:bold;\nmargin-top:25px;\n}\n</style>\n</head>\n\n<body>\n\n<div class=\"title\">🎹 PIANO</div>\n<div class=\"sub\">Do - Re - Mi - Fa - Sol - La - Si - Do</div>\n\n<div class=\"piano-wrap\">\n<div class=\"piano\">\n\n<button class=\"white\" data-freq=\"261.63\" data-name=\"Do\">Do</button>\n<button class=\"white\" data-freq=\"293.66\" data-name=\"Re\">Re</button>\n<button class=\"white\" data-freq=\"329.63\" data-name=\"Mi\">Mi</button>\n<button class=\"white\" data-freq=\"349.23\" data-name=\"Fa\">Fa</button>\n<button class=\"white\" data-freq=\"392.00\" data-name=\"Sol\">Sol</button>\n<button class=\"white\" data-freq=\"440.00\" data-name=\"La\">La</button>\n<button class=\"white\" data-freq=\"493.88\" data-name=\"Si\">Si</button>\n<button class=\"white\" data-freq=\"523.25\" data-name=\"Do\">Do</button>\n\n<button class=\"black b1\" data-freq=\"277.18\" data-name=\"Do#\">Do#</button>\n<button class=\"black b2\" data-freq=\"311.13\" data-name=\"Re#\">Re#</button>\n<button class=\"black b3\" data-freq=\"369.99\" data-name=\"Fa#\">Fa#</button>\n<button class=\"black b4\" data-freq=\"415.30\" data-name=\"Sol#\">Sol#</button>\n<button class=\"black b5\" data-freq=\"466.16\" data-name=\"La#\">La#</button>\n\n</div>\n</div>\n\n<div id=\"note\">Tap the piano</div>\n\n<script>\nlet audioContext=null;\n\nfunction initAudio(){\nif(!audioContext){\nconst AudioContext=window.AudioContext||window.webkitAudioContext;\n\nif(!AudioContext){\ndocument.getElementById('note').textContent='Audio not supported';\nreturn null;\n}\n\naudioContext=new AudioContext();\n}\n\nif(audioContext.state==='suspended'){\naudioContext.resume();\n}\n\nreturn audioContext;\n}\n\nfunction playPiano(freq){\nconst ctx=initAudio();\n\nif(!ctx)return;\n\nconst now=ctx.currentTime;\n\nconst master=ctx.createGain();\n\nmaster.gain.setValueAtTime(0,now);\nmaster.gain.linearRampToValueAtTime(0.5,now+0.015);\nmaster.gain.exponentialRampToValueAtTime(0.001,now+1.2);\n\nmaster.connect(ctx.destination);\n\nconst osc1=ctx.createOscillator();\nconst osc2=ctx.createOscillator();\nconst osc3=ctx.createOscillator();\n\nconst gain1=ctx.createGain();\nconst gain2=ctx.createGain();\nconst gain3=ctx.createGain();\n\nosc1.type='triangle';\nosc2.type='sine';\nosc3.type='sine';\n\nosc1.frequency.value=freq;\nosc2.frequency.value=freq*2;\nosc3.frequency.value=freq*3;\n\ngain1.gain.value=1;\ngain2.gain.value=.22;\ngain3.gain.value=.08;\n\nosc1.connect(gain1);\nosc2.connect(gain2);\nosc3.connect(gain3);\n\ngain1.connect(master);\ngain2.connect(master);\ngain3.connect(master);\n\nosc1.start(now);\nosc2.start(now);\nosc3.start(now);\n\nosc1.stop(now+1.3);\nosc2.stop(now+1.3);\nosc3.stop(now+1.3);\n}\n\ndocument.querySelectorAll('.white,.black').forEach(function(key){\n\nfunction press(e){\ne.preventDefault();\n\nkey.classList.add('active');\n\ndocument.getElementById('note').textContent=key.dataset.name;\n\nplayPiano(parseFloat(key.dataset.freq));\n}\n\nfunction release(){\nkey.classList.remove('active');\n}\n\nkey.addEventListener('pointerdown',press);\nkey.addEventListener('pointerup',release);\nkey.addEventListener('pointercancel',release);\nkey.addEventListener('pointerleave',release);\n\n});\n\n</script>\n\n</body>\n</html>\n";

cmd({
  pattern: "piano",
  aliases: ["pianogame","keys"],
  react: "🎹",
  category: "games",
  description: "Play Piano — Tap keys to play music"
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
    console.error("[Piano]", "Error:", err?.stack || err);
    await react("❌");
    return reply("❌ *Error:* " + err.message);
  }
});
