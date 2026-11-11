// RickyDeWizard Arcade - 17 mini games in tabbed rich messages (one pack = one message).
//
//   .arcade                menu with a button for every game (tap one and it opens right in the chat)
//   .arcade <game>         play one game directly, e.g. .arcade snake  .arcade 2048  .arcade doom
//   .arcade classic|action|puzzle   menu for one pack
//   .arcade tabs [pack]    old style: all games of a pack inside one "See details" sheet
//   .arcade list           show the games in chat
//   aliases: .minigames  .gamehub
//
// Why packs? Every tab carries the full game code inside the WhatsApp message, so one message
// with all games is big. Packs keep each message small enough to open reliably.
'use strict';

const { gmd } = require('../lib/Cmds');
const { AIRich, Toolkit, richSupported } = require('../lib/airich');
const { sendHtmlGame } = require('../lib/gameSend');

const BRAND = 'RickyDeWizard';
const BRAND_CAPS = 'RICKYDEWIZARD';

// Trusted HTML source used by WhatsApp rich messages to allow the embedded game view.
const SOURCE_URL = 'https://nixel.dev';
const TRUSTED_SOURCES = ['nixel.dev'];

// ============================================
// SHARED PIECES FOR THE SIMPLE GAMES (Snake -> Reflex)
// ============================================
const BASE_CSS = `*{-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;box-sizing:border-box}body{margin:0;background:transparent;font-family:Arial,sans-serif;color:#eee;touch-action:manipulation}.w{width:100%;max-width:340px;margin:auto;padding:10px}.c{background:rgba(255,255,255,.06);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.15);border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.35)}.h{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.12);display:flex;justify-content:space-between;align-items:center}.k{font-size:10px;letter-spacing:1.5px;color:rgba(255,255,255,.45)}.t{font-size:18px;font-weight:bold;color:#fff}.s{text-align:right}.s b{display:block;font-size:18px;color:#fff;text-shadow:0 0 10px rgba(108,92,231,.85)}.s i{font-style:normal;font-size:10px;color:rgba(255,255,255,.4)}.b{padding:12px}.m{text-align:center;margin-top:8px;font-size:12px;color:rgba(255,255,255,.6);min-height:15px}.cv{display:block;width:100%;height:auto;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.12);border-radius:12px;touch-action:none}button{font:inherit;font-size:13px;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:9px 12px;cursor:pointer}button:active{background:rgba(108,92,231,.55)}button:disabled{opacity:.5}.r{display:flex;gap:8px;margin-top:10px}.r>*{flex:1}`;

const PRELUDE = (key) => `const $=i=>document.getElementById(i);let best=0;const KEY='${key}';try{best=+localStorage.getItem(KEY)||0}catch(e){}$('bs').textContent='BEST '+best;function score(v){$('sc').textContent=v;if(v>best){best=v;try{localStorage.setItem(KEY,v)}catch(e){}$('bs').textContent='BEST '+best}}function msg(t){$('m').textContent=t}function raf(fn){let l=0;(function f(t){const dt=Math.min(2.5,(t-l)/16.667||1);l=t;fn(dt);requestAnimationFrame(f)})(0)}`;

const simpleGame = (title, key, body, script) =>
    `<style>${BASE_CSS}</style>
<body><div class="w"><div class="c"><div class="h"><div><div class="k">${BRAND_CAPS} ARCADE</div><div class="t">${title}</div></div><div class="s"><b id="sc">0</b><i id="bs">BEST 0</i></div></div><div class="b">
${body}
<div class="m" id="m"></div></div></div></div>
<script>
${PRELUDE(key)}
${script}
</script>
`;

// ============================================
// GAME 1 - DINO RUNNER (tap / space to jump)
// ============================================
const DINO_HTML = `<style>*{-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}</style>
<body style="margin:0;background:transparent;font-family:Arial,sans-serif;color:#eee;touch-action:manipulation;cursor:pointer">
<div style="width:100%;max-width:620px;margin:auto;padding:16px;box-sizing:border-box">
<div style="background:rgba(255,255,255,.06);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.15);border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.35)">
<div style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.12);display:flex;justify-content:space-between;align-items:center">
<div><div style="font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,.45)">${BRAND_CAPS} DINO</div><div style="font-size:21px;font-weight:bold;color:#fff">Dino Runner</div></div>
<div style="text-align:right"><div id="score" style="font-size:18px;font-weight:bold;color:#fff;text-shadow:0 0 10px rgba(108,92,231,.85);transition:transform .15s">00000</div><div id="best" style="font-size:10px;color:rgba(255,255,255,.4);margin-top:2px">BEST 00000</div></div>
</div>
<div style="padding:18px">
<canvas id="game" width="560" height="190" style="width:100%;height:auto;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.12);border-radius:12px;display:block"></canvas>
<div id="status" style="text-align:center;margin-top:10px;font-size:12px;color:rgba(255,255,255,.55)">Speed 5.0x</div>
</div></div></div>
<script>
const c=document.getElementById('game'),x=c.getContext('2d'),scoreEl=document.getElementById('score'),bestEl=document.getElementById('best'),statusEl=document.getElementById('status');
const GY=170;
let d,o,clouds,particles,ambient,trail,score,best=0,speed,gameOver,last,shake,flash,runT,spawnTimer,milestone,squash;
function loadBest(){
let vals=[];
try{let v=localStorage.getItem('dino_best');if(v)vals.push(parseInt(v,10))}catch(e){}
try{let v=sessionStorage.getItem('dino_best');if(v)vals.push(parseInt(v,10))}catch(e){}
try{let m=document.cookie.match(/(?:^|;\\s*)dino_best=(\\d+)/);if(m)vals.push(parseInt(m[1],10))}catch(e){}
return vals.length?Math.max(...vals.filter(v=>!isNaN(v))):0
}
function saveBest(v){
let val=String(Math.floor(v));
try{localStorage.setItem('dino_best',val)}catch(e){}
try{sessionStorage.setItem('dino_best',val)}catch(e){}
try{document.cookie='dino_best='+val+';max-age=31536000;path=/'}catch(e){}
try{
let rq=indexedDB.open('dino_db',1);
rq.onupgradeneeded=()=>{rq.result.createObjectStore('kv')};
rq.onsuccess=()=>{try{rq.result.transaction('kv','readwrite').objectStore('kv').put(val,'dino_best')}catch(e){}}
}catch(e){}
}
function loadBestAsync(cb){
try{
let rq=indexedDB.open('dino_db',1);
rq.onupgradeneeded=()=>{rq.result.createObjectStore('kv')};
rq.onsuccess=()=>{
try{
let gr=rq.result.transaction('kv','readonly').objectStore('kv').get('dino_best');
gr.onsuccess=()=>{if(gr.result)cb(parseInt(gr.result,10))}
}catch(e){}
}
}catch(e){}
}
best=loadBest();
loadBestAsync(v=>{if(!isNaN(v)&&v>best){best=v;bestEl.textContent='BEST '+String(Math.floor(best)).padStart(5,'0')}});
function reset(){
d={x:55,y:132,w:27,h:30,vy:0,jumping:false};
o=[];
clouds=[{x:120,y:32,w:44,s:.35},{x:300,y:52,w:60,s:.22},{x:460,y:26,w:36,s:.4},{x:560,y:70,w:50,s:.18}];
particles=[];
trail=[];
if(!ambient){ambient=[];for(let i=0;i<18;i++)ambient.push({x:Math.random()*c.width,y:Math.random()*c.height,r:.5+Math.random()*1.5,vx:.1+Math.random()*.3,ph:Math.random()*10})}
score=0;speed=5;gameOver=false;last=0;shake=0;flash=0;runT=0;milestone=0;squash=1;
spawnTimer=70+Math.random()*30;
bestEl.textContent='BEST '+String(Math.floor(best)).padStart(5,'0');
statusEl.textContent='Speed 5.0x'
}
function burst(px,py,n,col,spd){for(let i=0;i<n;i++)particles.push({x:px,y:py,vx:(Math.random()-.5)*spd,vy:-Math.random()*spd,life:1,col,size:2+Math.random()*2})}
function jumpDino(){
if(gameOver){reset();return}
if(!d.jumping){d.jumping=true;d.vy=-13;squash=.7;burst(d.x+13,d.y+30,10,'255,255,255',4)}
}
function cactus(){
let h=24+Math.random()*24;
o.push({x:c.width+20,y:GY-h,w:16+Math.random()*6,h});
if(Math.random()<.22){o.push({x:c.width+20+34+Math.random()*10,y:GY-(20+Math.random()*18),w:16,h:20+Math.random()*18})}
}
function hit(a,b){return a.x+4<b.x+b.w&&a.x+a.w-4>b.x&&a.y+4<b.y+b.h&&a.y+a.h>b.y}
function drawTrail(){
trail.forEach((p,i)=>{x.fillStyle='rgba(108,92,231,'+(.25*(i/trail.length))+')';x.fillRect(p.x,p.y,27,30)})
}
function drawDino(){
x.save();
let cx=d.x+13,cy=d.y+30;
x.translate(cx,cy);
x.scale(1/squash,squash);
x.translate(-cx,-cy);
let legOff=d.jumping?0:Math.sin(runT*.5)*5;
x.fillStyle='#eaeaea';
x.fillRect(d.x,d.y,27,30);
x.fillRect(d.x+22,d.y+5,13,18);
x.fillStyle='#6c5ce7';
x.fillRect(d.x+29,d.y+8,4,4);
x.fillStyle='#eaeaea';
x.fillRect(d.x+5,d.y+30,6,8+legOff);
x.fillRect(d.x+20,d.y+30,6,8-legOff);
x.restore()
}
function drawCactus(q){
x.save();
x.shadowColor='rgba(255,90,90,.35)';x.shadowBlur=10;
x.fillStyle='#e17a7a';
x.fillRect(q.x,q.y,q.w,q.h);
x.fillRect(q.x-7,q.y+10,7,6);
x.fillRect(q.x-7,q.y+4,6,12);
x.fillRect(q.x+q.w,q.y+18,7,6);
x.fillRect(q.x+q.w+1,q.y+12,6,12);
x.restore()
}
function drawParticles(){
particles.forEach(p=>{x.fillStyle='rgba('+p.col+','+Math.max(p.life,0)+')';x.fillRect(p.x,p.y,p.size,p.size)})
}
function drawAmbient(){
ambient.forEach(p=>{let a=.15+Math.sin(runT*.05+p.ph)*.1;x.fillStyle='rgba(180,160,255,'+a+')';x.beginPath();x.arc(p.x,p.y,p.r,0,7);x.fill()})
}
function draw(){
x.clearRect(0,0,c.width,c.height);
x.save();
if(shake>0)x.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
drawAmbient();
x.fillStyle='rgba(255,255,255,.35)';
clouds.forEach(q=>{let b=Math.sin(runT*.03+q.x)*2;x.fillRect(q.x,q.y+b,q.w,5);x.fillRect(q.x+10,q.y+b-5,q.w*.45,10)});
x.strokeStyle='rgba(255,255,255,.25)';
x.lineWidth=2;
x.setLineDash([10,8]);
x.lineDashOffset=-runT*speed*.6;
x.beginPath();x.moveTo(0,GY);x.lineTo(c.width,GY);x.stroke();
x.setLineDash([]);
drawTrail();
drawDino();
o.forEach(drawCactus);
drawParticles();
if(flash>0){x.fillStyle='rgba(255,60,60,'+(flash*.35)+')';x.fillRect(0,0,c.width,c.height)}
x.restore();
if(gameOver){
x.fillStyle='rgba(15,15,25,.55)';x.fillRect(0,0,c.width,c.height);
x.fillStyle='#fff';x.textAlign='center';
x.font='bold 24px Arial';x.fillText('GAME OVER',c.width/2,85);
x.font='14px Arial';x.fillText('Tap the screen to play again',c.width/2,112);
x.textAlign='left'
}
}
function loop(t){
if(!last)last=t;
let dt=Math.min((t-last)/16.67,2);
last=t;
runT+=dt;
if(!gameOver){
d.y+=d.vy*dt;d.vy+=.75*dt;
if(d.y>=132){
if(d.jumping){burst(d.x+13,GY,10,'255,255,255',3.5);squash=1.35}
d.y=132;d.vy=0;d.jumping=false
}
if(d.jumping)trail.push({x:d.x,y:d.y});
if(trail.length>6)trail.shift();
if(!d.jumping)trail.length=0;
squash+=(1-squash)*.18*dt;
if(!d.jumping&&Math.floor(runT)%8===0&&Math.random()<.4)burst(d.x+6,GY-2,1,'255,255,255',1.5);
ambient.forEach(p=>{p.x-=p.vx*dt;if(p.x<-4)p.x=c.width+4});
spawnTimer-=dt;
if(spawnTimer<=0){cactus();spawnTimer=Math.max(38,62-speed*1.4)+Math.random()*30}
o.forEach(q=>q.x-=speed*dt);
o=o.filter(q=>q.x>-40);
clouds.forEach(q=>{q.x-=q.s*dt;if(q.x<-80)q.x=c.width+Math.random()*100});
particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=.3*dt;p.life-=.03*dt});
particles=particles.filter(p=>p.life>0);
speed=Math.min(11,speed+.0018*dt);
score+=dt*.6;
if(score>best)best=score;
if(Math.floor(score/500)>milestone){
milestone=Math.floor(score/500);
scoreEl.style.transform='scale(1.35)';
setTimeout(()=>scoreEl.style.transform='scale(1)',150)
}
scoreEl.textContent=String(Math.floor(score)).padStart(5,'0');
bestEl.textContent='BEST '+String(Math.floor(best)).padStart(5,'0');
statusEl.textContent='Speed '+speed.toFixed(1)+'x';
for(const q of o)if(hit(d,q)){
gameOver=true;shake=14;flash=1;
saveBest(best);
burst(d.x+13,d.y+15,18,'255,90,90',5)
}
}
if(shake>0)shake=Math.max(0,shake-.6*dt);
if(flash>0)flash=Math.max(0,flash-.05*dt);
draw();
requestAnimationFrame(loop)
}
document.addEventListener('pointerdown',e=>{e.preventDefault();jumpDino()});
document.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();jumpDino()}});
reset();
requestAnimationFrame(loop);
</script></body>`;

// ============================================
// GAME 2 - TIC TAC TOE vs AI (4 difficulty levels)
// ============================================
const TICTACTOE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tic-Tac-Toe</title>
<style>
:root{
  --bg:transparent;
  --card:transparent;
  --card-2:#2a3942;
  --ink:#e9edef;
  --ink-soft:#aebac1;
  --muted:#8696a0;
  --accent:#00a884;
  --accent-2:#008069;
  --line:#2a3942;
  --line-strong:#374248;
  --cell-bg:#111b21;
  --o:#00a884;
  --x:#e9edef;
  --sys:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{
  background:transparent;
  color:var(--ink);
  font-family:var(--sys);
  min-height:100vh;
  overflow-x:hidden;
  -webkit-font-smoothing:antialiased;
}
.stage{
  min-height:100vh;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  padding:12px 16px;
}
.card{
  width:100%;
  max-width:280px; 
}
.header{
  display:flex;align-items:baseline;justify-content:space-between;
  margin-bottom:10px;padding-bottom:8px;
  border-bottom:1px solid var(--line);
  gap:8px;
}
.header__title{
  font-size:17px;font-weight:600;
  color:var(--ink);letter-spacing:-.005em;
}
.header__sub{font-size:12px;color:var(--muted)}
.status{
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:10px;font-size:13px;gap:8px;
}
.status__turn{display:flex;align-items:center;gap:8px;color:var(--ink-soft)}
.status__indicator{
  width:9px;height:9px;border-radius:50%;
  background:var(--x);
  position:relative;flex-shrink:0;
  transition:background .2s ease;
}
.status__indicator.is-o{background:var(--o)}
.status__indicator.is-thinking::after{
  content:'';position:absolute;inset:-3px;
  border-radius:50%;border:1.5px solid var(--o);
  animation:ring 1.1s ease-out infinite;
}
@keyframes ring{
  0%{transform:scale(.7);opacity:1}
  100%{transform:scale(2.2);opacity:0}
}
.status__score{
  display:flex;gap:12px;
  font-variant-numeric:tabular-nums;
  color:var(--muted);font-size:12px;
}
.status__score b{
  color:var(--ink);font-weight:600;margin-left:3px;
}
.board{
  width:100%;aspect-ratio:1;
  position:relative;
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  grid-template-rows:1fr 1fr 1fr;
  background:var(--cell-bg);
  border-radius:8px;overflow:hidden;
  border:1px solid var(--line);
}
.cell{
  position:relative;background:transparent;border:none;
  cursor:pointer;padding:0;
  font-family:inherit;color:inherit;
}
.cell:disabled{cursor:default}
.cell:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}
.cell::before{
  content:'';position:absolute;right:0;top:6%;bottom:6%;
  width:1px;background:var(--line-strong);
}
.cell:nth-child(3n)::before{display:none}
.cell::after{
  content:'';position:absolute;bottom:0;left:6%;right:6%;
  height:1px;background:var(--line-strong);
}
.cell:nth-last-child(-n+3)::after{display:none}
.cell.is-winning{background:rgba(0,168,132,0.14)}
.cell.is-winning-x{background:rgba(233,237,239,0.07)}
.mark{position:absolute;inset:22%;pointer-events:none}
.mark__svg{width:100%;height:100%;overflow:visible}
.mark__svg path,.mark__svg circle{
  fill:none;stroke:var(--x);stroke-width:9;
  stroke-linecap:round;
}
.mark--o .mark__svg path,.mark--o .mark__svg circle{stroke:var(--o)}
.mark__svg path{
  stroke-dasharray:120;stroke-dashoffset:120;
  animation:draw .3s ease-out forwards;
}
.mark__svg path:nth-child(2){animation-delay:.12s}
.mark__svg circle{
  stroke-dasharray:220;stroke-dashoffset:220;
  animation:draw .4s ease-out forwards;
}
@keyframes draw{to{stroke-dashoffset:0}}
.winning-line{
  position:absolute;height:4px;
  background:var(--o);
  transform-origin:left center;
  z-index:5;pointer-events:none;
  border-radius:2px;
}
.winning-line.is-x{background:var(--x)}
.levels{margin-top:10px}
.levels__label{
  font-size:11px;color:var(--muted);
  margin-bottom:6px;
}
.levels__list{
  display:flex;
  flex-wrap:nowrap;
  gap:8px;
  overflow-x:auto;
  overflow-y:hidden;
  -webkit-overflow-scrolling:touch;
  scrollbar-width:none;
  -ms-overflow-style:none;
  padding:2px 2px 4px;
  margin:0 -2px;
}
.levels__list::-webkit-scrollbar{
  display:none;
}
.level{
  background:transparent;
  border:1px solid var(--line-strong);
  border-radius:20px;
  padding:8px 14px;
  font-size:12px;font-weight:500;
  color:var(--ink-soft);
  cursor:pointer;
  font-family:inherit;
  transition:color .15s ease,border-color .15s ease,background .15s ease;
  white-space:nowrap;
  flex-shrink:0;
}
.level:hover{color:var(--ink);border-color:var(--ink-soft)}
.level.is-active{
  background:var(--accent);
  border-color:var(--accent);
  color:#0b141a;
}
.level:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.footer{
  margin-top:8px;
  display:flex;justify-content:center;
}
.footer__reset{
  background:none;border:none;
  color:var(--accent);
  font-family:inherit;
  font-size:13px;font-weight:500;
  cursor:pointer;
  padding:8px 16px;
  transition:color .15s ease;
}
.footer__reset:hover{color:var(--ink)}
.footer__reset:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.modal{
  position:fixed;inset:0;z-index:50;
  display:flex;align-items:center;justify-content:center;
  padding:24px;
  opacity:0;pointer-events:none;
  transition:opacity .3s ease;
}
.modal.is-open{opacity:1;pointer-events:auto}
.modal__backdrop{
  position:absolute;inset:0;
  background:transparent;
}
.modal__card{
  position:relative;
  background:var(--card-2);
  border-radius:12px;
  padding:24px 24px 0;
  text-align:center;
  max-width:300px;width:100%;
  box-shadow:0 24px 50px -12px rgba(0,0,0,0.6);
  transform:translateY(8px) scale(.96);
  transition:transform .35s cubic-bezier(.34,1.56,.64,1);
  overflow:hidden;
}
.modal.is-open .modal__card{transform:translateY(0) scale(1)}
.modal__title{
  font-size:20px;font-weight:700;
  letter-spacing:-.015em;
  color:var(--ink);margin-bottom:8px;line-height:1.25;
}
.modal__title.is-o{color:var(--o)}
.modal__sub{
  font-size:14px;color:var(--muted);
  margin-bottom:20px;line-height:1.4;
}
.modal__retry{
  background:transparent;border:none;
  color:var(--accent);
  font-family:inherit;
  font-size:16px;font-weight:600;
  letter-spacing:-.005em;
  cursor:pointer;
  padding:14px 24px;
  width:100%;
  border-top:1px solid var(--line-strong);
  transition:color .15s ease;
}
.modal__retry:hover{color:var(--ink)}
.modal__retry:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
@media (max-width:380px){
  .stage{padding:12px 10px}
  .level{padding:7px 12px;font-size:11px}
  .modal__title{font-size:18px}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{
    animation-duration:.01ms!important;
    animation-iteration-count:1!important;
    transition-duration:.01ms!important;
  }
}
</style>
</head>
<body>
<main class="stage">
  <div class="card">
    <div class="header">
      <div class="header__title">Tic-Tac-Toe</div>
      <div class="header__sub">Vs AI</div>
    </div>
    <div class="status" aria-live="polite">
      <div class="status__turn">
        <span class="status__indicator" id="indicator"></span>
        <span id="status-text">Your turn</span>
      </div>
      <div class="status__score">
        <span>You<b id="score-x">0</b></span>
        <span>Draw<b id="score-d">0</b></span>
        <span>AI<b id="score-o">0</b></span>
      </div>
    </div>
    <div class="board" id="board" role="grid" aria-label="Three by three game board"></div>
    <div class="levels">
      <div class="levels__label">Difficulty</div>
      <div class="levels__list" id="levels-list" role="radiogroup" aria-label="Difficulty level"></div>
    </div>
    <div class="footer">
      <button class="footer__reset" id="reset">Reset board</button>
    </div>
  </div>
</main>
<div class="modal" id="modal" hidden>
  <div class="modal__backdrop" id="modal-backdrop"></div>
  <div class="modal__card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <h2 class="modal__title" id="modal-title">You win</h2>
    <p class="modal__sub" id="modal-sub">Well played. Try again?</p>
    <button class="modal__retry" id="modal-retry">Try again</button>
  </div>
</div>
<script>
const state={
  board:Array(9).fill(null),
  human:'X',ai:'O',
  turn:'X',
  over:false,winner:null,line:null,
  thinking:false,
  level:2,
  scores:{X:0,O:0,D:0}
};
const LEVELS=[
  {name:'Beginner'},
  {name:'Skilled'},
  {name:'Tactician'},
  {name:'Master'}
];
const WIN_LINES=[
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];
const $=id=>document.getElementById(id);
const boardEl=$('board'),statusText=$('status-text'),indicator=$('indicator');
const levelsList=$('levels-list');
const scoreX=$('score-x'),scoreO=$('score-o'),scoreD=$('score-d');
const modal=$('modal');
function buildBoard(){
  boardEl.innerHTML='';
  for(let i=0;i<9;i++){
    const c=document.createElement('button');
    c.className='cell';
    c.setAttribute('role','gridcell');
    c.setAttribute('aria-label',\`Cell \${i+1}\`);
    c.dataset.idx=i;
    c.addEventListener('click',()=>onCell(i));
    boardEl.appendChild(c);
  }
}
function buildLevels(){
  levelsList.innerHTML='';
  LEVELS.forEach((lvl,i)=>{
    const b=document.createElement('button');
    b.className='level'+(i===state.level?' is-active':'');
    b.setAttribute('role','radio');
    b.setAttribute('aria-checked',i===state.level?'true':'false');
    b.textContent=lvl.name;
    b.addEventListener('click',()=>setLevel(i));
    levelsList.appendChild(b);
  });
}
function setLevel(i){
  state.level=i;
  document.querySelectorAll('.level').forEach((el,idx)=>{
    const on=idx===i;
    el.classList.toggle('is-active',on);
    el.setAttribute('aria-checked',on?'true':'false');
  });
  resetBoard();
}
function markSVG(v){
  if(v==='X'){
    return \`<svg class="mark__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><path d="M 22 22 L 78 78"/><path d="M 78 22 L 22 78"/></svg>\`;
  }
  return \`<svg class="mark__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"><circle cx="50" cy="50" r="30"/></svg>\`;
}
function renderCell(i){
  const cell=boardEl.children[i];
  const v=state.board[i];
  const existing=cell.querySelector('.mark');
  if(v){
    if(!existing){
      const m=document.createElement('div');
      m.className='mark mark--'+v.toLowerCase();
      m.innerHTML=markSVG(v);
      cell.appendChild(m);
    }
    cell.disabled=true;
  } else {
    if(existing) existing.remove();
    cell.disabled=state.over||state.thinking||state.turn!==state.human;
  }
  const isWin=!!(state.line&&state.line.includes(i));
  cell.classList.toggle('is-winning',isWin);
  cell.classList.toggle('is-winning-x',isWin&&state.winner==='X');
}
function render(){
  for(let i=0;i<9;i++) renderCell(i);
  if(state.over){
    if(state.winner==='X'){statusText.textContent='You win';indicator.className='status__indicator';}
    else if(state.winner==='O'){statusText.textContent='AI wins';indicator.className='status__indicator is-o';}
    else {statusText.textContent='Draw';indicator.className='status__indicator';}
  } else if(state.thinking){
    statusText.textContent='AI is thinking…';
    indicator.className='status__indicator is-o is-thinking';
  } else {
    statusText.textContent=state.turn===state.human?'Your turn':"AI's turn";
    indicator.className='status__indicator'+(state.turn===state.ai?' is-o':'');
  }
  scoreX.textContent=state.scores.X;
  scoreO.textContent=state.scores.O;
  scoreD.textContent=state.scores.D;
}
function onCell(i){
  if(state.over||state.thinking) return;
  if(state.board[i]!==null) return;
  if(state.turn!==state.human) return;
  state.board[i]=state.human;
  renderCell(i);
  const r=checkWinner(state.board);
  if(r){endGame(r);return;}
  state.turn=state.ai;
  state.thinking=true;
  render();
  setTimeout(aiMove,380+Math.random()*340);
}
function aiMove(){
  if(!state.thinking) return;
  const m=chooseAIMove();
  if(m===null){state.thinking=false;render();return;}
  state.board[m]=state.ai;
  renderCell(m);
  state.thinking=false;
  const r=checkWinner(state.board);
  if(r){endGame(r);}
  else {state.turn=state.human;render();}
}
function chooseAIMove(){
  const empty=state.board.map((v,i)=>v===null?i:-1).filter(i=>i>=0);
  if(!empty.length) return null;
  const L=state.level;
  if(L===0) return empty[Math.floor(Math.random()*empty.length)];
  if(L===1){
    const win=findImmediate(state.board,state.ai);
    if(win!==null) return win;
    if(Math.random()>0.15){
      const block=findImmediate(state.board,state.human);
      if(block!==null) return block;
    }
    if(state.board[4]===null) return 4;
    if(Math.random()>0.2){
      const corners=[0,2,6,8].filter(i=>state.board[i]===null);
      if(corners.length) return corners[Math.floor(Math.random()*corners.length)];
    }
    return empty[Math.floor(Math.random()*empty.length)];
  }
  if(L===2){
    if(Math.random()<0.10) return empty[Math.floor(Math.random()*empty.length)];
    return minimaxMove(state.board,state.ai,4);
  }
  return minimaxMove(state.board,state.ai,9);
}
function findImmediate(board,player){
  for(const line of WIN_LINES){
    const cells=[board[line[0]],board[line[1]],board[line[2]]];
    const c=cells.filter(v=>v===player).length;
    const e=cells.filter(v=>v===null).length;
    if(c===2&&e===1) return line[cells.indexOf(null)];
  }
  return null;
}
function minimaxMove(board,player,maxDepth){
  let best=-Infinity,moves=[];
  for(let i=0;i<9;i++){
    if(board[i]!==null) continue;
    board[i]=player;
    const s=minimax(board,player==='O'?'X':'O',0,maxDepth,-Infinity,Infinity);
    board[i]=null;
    if(s>best){best=s;moves=[i];}
    else if(s===best){moves.push(i);}
  }
  return moves[Math.floor(Math.random()*moves.length)];
}
function minimax(board,current,depth,maxDepth,alpha,beta){
  const r=checkWinner(board);
  if(r){
    if(r.winner==='O') return 10-depth;
    if(r.winner==='X') return depth-10;
    return 0;
  }
  if(depth>=maxDepth) return 0;
  const isMax=current==='O';
  let best=isMax?-Infinity:Infinity;
  for(let i=0;i<9;i++){
    if(board[i]!==null) continue;
    board[i]=current;
    const s=minimax(board,current==='O'?'X':'O',depth+1,maxDepth,alpha,beta);
    board[i]=null;
    if(isMax){best=Math.max(best,s);alpha=Math.max(alpha,s);}
    else {best=Math.min(best,s);beta=Math.min(beta,s);}
    if(beta<=alpha) break;
  }
  return best;
}
function checkWinner(board){
  for(const line of WIN_LINES){
    const [a,b,c]=line;
    if(board[a]&&board[a]===board[b]&&board[a]===board[c]){
      return {winner:board[a],line};
    }
  }
  if(board.every(v=>v!==null)) return {winner:'D',line:null};
  return null;
}
function endGame(r){
  state.over=true;
  state.winner=r.winner;
  state.line=r.line;
  if(r.winner==='X') state.scores.X++;
  else if(r.winner==='O') state.scores.O++;
  else state.scores.D++;
  render();
  if(r.line){
    setTimeout(()=>drawWinningLine(r.line,r.winner),220);
    setTimeout(()=>showModal(r.winner),950);
  } else {
    setTimeout(()=>showModal(r.winner),400);
  }
}
function showModal(winner){
  const title=$('modal-title');
  const sub=$('modal-sub');
  if(winner==='X'){
    title.textContent='You win';
    title.className='modal__title';
    sub.textContent='Well played. Try again?';
  } else if(winner==='O'){
    title.textContent='AI wins';
    title.className='modal__title is-o';
    sub.textContent='The AI got you this time. Play again?';
  } else {
    title.textContent='Draw';
    title.className='modal__title';
    sub.textContent="It's a draw. Play one more?";
  }
  modal.hidden=false;
  void modal.offsetWidth;
  modal.classList.add('is-open');
  setTimeout(()=>$('modal-retry').focus(),80);
}
function hideModal(){
  modal.classList.remove('is-open');
  setTimeout(()=>{modal.hidden=true;},350);
}
function drawWinningLine(line,winner){
  const rect=boardEl.getBoundingClientRect();
  const s=boardEl.children[line[0]].getBoundingClientRect();
  const e=boardEl.children[line[2]].getBoundingClientRect();
  const x1=s.left+s.width/2-rect.left;
  const y1=s.top+s.height/2-rect.top;
  const x2=e.left+e.width/2-rect.left;
  const y2=e.top+e.height/2-rect.top;
  const len=Math.hypot(x2-x1,y2-y1);
  const ang=Math.atan2(y2-y1,x2-x1);
  const el=document.createElement('div');
  el.className='winning-line'+(winner==='X'?' is-x':'');
  el.style.left=x1+'px';
  el.style.top=y1+'px';
  el.style.width=len+'px';
  el.style.transform=\`translateY(-50%) rotate(\${ang}rad) scaleX(0)\`;
  el.style.transition='transform .55s cubic-bezier(0.65,0,0.35,1)';
  boardEl.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    el.style.transform=\`translateY(-50%) rotate(\${ang}rad) scaleX(1)\`;
  }));
}
function resetBoard(){
  hideModal();
  state.board=Array(9).fill(null);
  state.turn=state.human;
  state.over=false;state.winner=null;state.line=null;
  state.thinking=false;
  const wl=boardEl.querySelector('.winning-line');
  if(wl) wl.remove();
  render();
}
$('reset').addEventListener('click',resetBoard);
$('modal-retry').addEventListener('click',resetBoard);
$('modal-backdrop').addEventListener('click',resetBoard);
document.addEventListener('keydown',(e)=>{
  if(!modal.classList.contains('is-open')) return;
  if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();resetBoard();}
});
buildBoard();
buildLevels();
render();
</script>
</body>
</html>`;

// ============================================
// GAME 3 - MINI DOOM FPS (drag to look, buttons to move / fire)
// ============================================
const DOOM_HTML = `<style>*{-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}</style>
<body style="margin:0;background:transparent;font-family:Arial,sans-serif;color:#eee;touch-action:manipulation;cursor:pointer">
<div style="width:100%;max-width:620px;margin:auto;box-sizing:border-box">
<div style="position:relative;width:100%;aspect-ratio:16/9;background:rgba(255,255,255,.06);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.15);border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.35)">
<canvas id="game" width="480" height="270" style="position:absolute;inset:0;width:100%;height:100%;display:block;background:#000;touch-action:none"></canvas>
<div style="position:absolute;top:8px;left:12px;pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,.9)">
<div style="font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,.65)">${BRAND_CAPS} DOOM</div>
<div style="font-size:14px;font-weight:bold;color:#fff">Mini Doom FPS</div>
</div>
<div style="position:absolute;top:8px;right:12px;text-align:right;pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,.9)">
<div id="hp" style="font-size:13px;font-weight:bold;color:#fff;transition:transform .15s">HP 100</div>
<div id="ammo" style="font-size:9px;color:rgba(255,255,255,.75);margin-top:1px">AMMO 30 · SCORE 0</div>
</div>
<div id="status" style="position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:9px;color:rgba(255,255,255,.75);pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,.9)">5 enemies left</div>
<div style="position:absolute;bottom:6px;left:6px;display:flex;gap:5px">
<button id="forward" style="width:44px;height:32px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(0,0,0,.4);color:#fff;font-size:14px;padding:0">▲</button>
</div>
<div style="position:absolute;bottom:6px;right:6px;display:grid;grid-template-columns:repeat(3,32px);gap:5px">
<button id="strafeL" style="width:32px;height:32px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(0,0,0,.4);color:#fff;font-size:13px;padding:0">◀</button>
<button id="fire" style="width:32px;height:32px;border:1px solid rgba(230,60,60,.5);border-radius:8px;background:rgba(230,60,60,.35);color:#fff;font-size:13px;padding:0">🔥</button>
<button id="strafeR" style="width:32px;height:32px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(0,0,0,.4);color:#fff;font-size:13px;padding:0">▶</button>
</div>
</div></div>
<script>
const c=document.getElementById('game'),x=c.getContext('2d'),hpEl=document.getElementById('hp'),ammoEl=document.getElementById('ammo'),statusEl=document.getElementById('status');
x.imageSmoothingEnabled=false;
const W=c.width,H=c.height;
const map=["################","#..............#","#..##....##....#","#..#..........##","#..#..####.....#","#.....#........#","###...#..####..#","#.....#........#","#..####........#","#........####..#","#........#.....#","#..##....#.....#","#..##..........#","#..............#","#..............#","################"];
const player={x:2.5,y:2.5,angle:0,hp:100,ammo:30,score:0,fireCooldown:0,muzzle:0,hurt:0};
let enemies,pickups,particles,ambient,shake,bobT,runT,endT,gameOver,win;
const keys=Object.create(null);
const FOV=Math.PI/3,MOVE=.052;
let zBuffer=new Float32Array(W);
function initEnemies(){return [{x:11.5,y:2.5,hp:60,max:60,dead:false,flash:0},{x:7.5,y:5.5,hp:60,max:60,dead:false,flash:0},{x:13.5,y:8.5,hp:60,max:60,dead:false,flash:0},{x:5.5,y:10.5,hp:60,max:60,dead:false,flash:0},{x:11.5,y:12.5,hp:60,max:60,dead:false,flash:0}]}
function initPickups(){return [{x:4.5,y:1.5,type:"ammo",taken:false},{x:14.5,y:5.5,type:"health",taken:false},{x:3.5,y:13.5,type:"ammo",taken:false}]}
function reset(){
player.x=2.5;player.y=2.5;player.angle=0;player.hp=100;player.ammo=30;player.score=0;player.fireCooldown=0;player.muzzle=0;player.hurt=0;
enemies=initEnemies();pickups=initPickups();particles=[];
if(!ambient){ambient=[];for(let i=0;i<16;i++)ambient.push({x:Math.random()*W,y:Math.random()*H,r:.6+Math.random()*1.2,vx:.15+Math.random()*.25,ph:Math.random()*10})}
shake=0;bobT=0;runT=0;endT=0;gameOver=false;win=false
}
function burst(px,py,n,col,spd,grav){for(let i=0;i<n;i++)particles.push({x:px,y:py,vx:(Math.random()-.5)*spd,vy:-Math.random()*spd,life:1,col,size:2+Math.random()*2.5,grav:grav||0})}
function isWall(px,py){const mx=Math.floor(px),my=Math.floor(py);if(mx<0||my<0||my>=map.length||mx>=map[0].length)return true;return map[my][mx]==="#"}
function canWalk(px,py){const r=.18;return !isWall(px-r,py-r)&&!isWall(px+r,py-r)&&!isWall(px-r,py+r)&&!isWall(px+r,py+r)}
function move(dx,dy){const nx=player.x+dx,ny=player.y+dy;if(canWalk(nx,player.y))player.x=nx;if(canWalk(player.x,ny))player.y=ny}
function normAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function lineClear(x1,y1,x2,y2){const d=Math.hypot(x2-x1,y2-y1),steps=Math.ceil(d/.08);for(let i=1;i<steps;i++){const t=i/steps,px=x1+(x2-x1)*t,py=y1+(y2-y1)*t;if(isWall(px,py))return false}return true}
function castRay(a){const ca=Math.cos(a),sa=Math.sin(a);let d=0;while(d<30){d+=.025;if(isWall(player.x+ca*d,player.y+sa*d))break}return d}
function screenPos(ex,ey){const dx=ex-player.x,dy=ey-player.y,d=Math.hypot(dx,dy);const a=normAngle(Math.atan2(dy,dx)-player.angle);const sx=W/2+Math.tan(a)*(W/2)/Math.tan(FOV/2);return {sx,d,a}}
function shoot(){
if(player.fireCooldown>0||player.ammo<=0||gameOver||win)return;
player.fireCooldown=13;player.ammo--;player.muzzle=4;
burst(W/2,H-88,7,'255,210,80',3,.1);
let best=null,bestDist=Infinity;
for(const e of enemies){
if(e.dead)continue;
const {sx,d,a}=screenPos(e.x,e.y);
if(d>10)continue;
const tol=.055+.16/d;
if(Math.abs(a)<tol&&d<bestDist&&lineClear(player.x,player.y,e.x,e.y)){best=e;bestDist=d}
}
if(best){
const dmg=25+Math.floor(Math.random()*12);
best.hp-=dmg;best.flash=6;
const {sx,d}=screenPos(best.x,best.y);
const size=Math.min(H*1.8,H/d*.72);
if(best.hp<=0){best.dead=true;player.score+=100;burst(sx,H/2,22,'220,40,40',4.5,.25)}
else{player.score+=10;burst(sx,H/2,10,'220,40,40',3.5,.2)}
}
}
function updateEnemies(){
for(const e of enemies){
if(e.dead)continue;
if(e.flash>0)e.flash--;
const d=dist(player,e);
if(d<1){
player.hp-=.18;player.hurt=6;shake=Math.max(shake,4.5);
const a=Math.atan2(e.y-player.y,e.x-player.x);
player.x-=Math.cos(a)*.015;player.y-=Math.sin(a)*.015;
continue
}
if(d<7&&lineClear(e.x,e.y,player.x,player.y)){
const a=Math.atan2(player.y-e.y,player.x-e.x),spd=.0085;
const nx=e.x+Math.cos(a)*spd,ny=e.y+Math.sin(a)*spd;
if(canWalk(nx,ny)){e.x=nx;e.y=ny}
if(Math.random()<.006&&d<6){player.hp-=2.5;player.hurt=10;shake=Math.max(shake,3.5);}
}
}
}
function updatePickups(){
for(const p of pickups){
if(p.taken)continue;
if(Math.hypot(player.x-p.x,player.y-p.y)<.55){
p.taken=true;
if(p.type==="ammo")player.ammo=Math.min(99,player.ammo+15);
if(p.type==="health")player.hp=Math.min(100,player.hp+25)
}
}
}
function update(){
runT++;
if(gameOver||win){endT++;return}
if(player.fireCooldown>0)player.fireCooldown--;
if(player.muzzle>0)player.muzzle--;
if(player.hurt>0)player.hurt--;
if(shake>0)shake=Math.max(0,shake-.6);
let dx=0,dy=0;
const moving=keys.forward||keys.strafeL||keys.strafeR;
if(moving)bobT++;else bobT+=.15;
if(keys.forward){dx+=Math.cos(player.angle)*MOVE;dy+=Math.sin(player.angle)*MOVE}
if(keys.strafeL){dx+=Math.cos(player.angle-Math.PI/2)*MOVE;dy+=Math.sin(player.angle-Math.PI/2)*MOVE}
if(keys.strafeR){dx+=Math.cos(player.angle+Math.PI/2)*MOVE;dy+=Math.sin(player.angle+Math.PI/2)*MOVE}
move(dx,dy);
updateEnemies();updatePickups();
if(keys.fire)shoot();
particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=p.grav;p.life-=.035});
particles=particles.filter(p=>p.life>0);
ambient.forEach(p=>{p.x-=p.vx;if(p.x<-4)p.x=W+4});
if(enemies.filter(e=>!e.dead).length===0)win=true;
if(player.hp<=0)gameOver=true
}
function wallColor(d,side){let l=230-d*18;if(side)l*=.76;l=Math.max(25,Math.min(220,l));return 'rgb('+Math.floor(l)+','+Math.floor(l*.62)+','+Math.floor(l*.48)+')'}
function drawWalls(bob){
const half=H/2+bob,halfFov=FOV/2;
const sky=x.createLinearGradient(0,0,0,half);sky.addColorStop(0,'#12151a');sky.addColorStop(1,'#34302b');
x.fillStyle=sky;x.fillRect(0,0,W,half);
const floor=x.createLinearGradient(0,half,0,H);floor.addColorStop(0,'#4a4540');floor.addColorStop(1,'#111');
x.fillStyle=floor;x.fillRect(0,half,W,H-half);
for(let px=0;px<W;px++){
const a=player.angle-halfFov+(px/W)*FOV;
let raw=castRay(a);
const corrected=raw*Math.cos(a-player.angle);
zBuffer[px]=corrected;
const wallH=Math.min(H*3,H/corrected),top=half-wallH/2;
const cellX=player.x+Math.cos(a)*raw,cellY=player.y+Math.sin(a)*raw;
const wx=cellX-Math.floor(cellX),wy=cellY-Math.floor(cellY);
const side=wx<.035||wx>.965;
x.fillStyle=wallColor(corrected,side);
x.fillRect(px,top,1,wallH)
}
}
function drawEnemySprite(e,bob){
if(e.dead)return;
const {sx,d,a}=screenPos(e.x,e.y);
if(Math.abs(a)>FOV*.7||d<.2)return;
const size=Math.min(H*1.8,H/d*.72);
const left=Math.floor(sx-size*.3),top=Math.floor(H/2+bob-size*.48),bottom=Math.floor(H/2+bob+size*.52);
const zi=Math.max(0,Math.min(W-1,Math.floor(sx)));
if(d>zBuffer[zi]+.25)return;
const hit=e.flash>0;
const wob=Math.sin(runT*.08+e.x*3)*2;
x.fillStyle=hit?'#fff':'#991b1b';
x.fillRect(left+size*.12+wob,top+size*.28,size*.36,size*.48);
x.fillRect(left+size*.16+wob,top,size*.28,size*.22);
if(size>25){
x.fillStyle='#ffd000';
x.fillRect(left+size*.22+wob,top+size*.09,Math.max(2,size*.035),Math.max(2,size*.045));
x.fillRect(left+size*.38+wob,top+size*.09,Math.max(2,size*.035),Math.max(2,size*.045))
}
x.fillStyle=hit?'#fff':'#741414';
x.fillRect(left-size*.03+wob,top+size*.28,size*.15,size*.11);
x.fillRect(left+size*.6-size*.12+wob,top+size*.28,size*.15,size*.11);
x.fillRect(left+size*.13+wob,bottom-size*.23,size*.14,size*.25);
x.fillRect(left+size*.35+wob,bottom-size*.23,size*.14,size*.25);
if(size>35){
const barW=size*.55;
x.fillStyle='#111';x.fillRect(sx-barW/2,top-size*.07,barW,4);
x.fillStyle='#e33';x.fillRect(sx-barW/2,top-size*.07,barW*Math.max(0,e.hp/e.max),4)
}
}
function drawPickup(p,bob){
if(p.taken)return;
const {sx,d,a}=screenPos(p.x,p.y);
if(Math.abs(a)>FOV*.6)return;
const pulse=1+.12*Math.sin(runT*.12+p.x*4);
const size=Math.min(45,H/d*.2)*pulse;
const zi=Math.max(0,Math.min(W-1,Math.floor(sx)));
if(d>zBuffer[zi]+.15)return;
x.save();
x.shadowColor=p.type==='health'?'rgba(33,197,93,.7)':'rgba(246,201,69,.7)';
x.shadowBlur=10;
x.fillStyle=p.type==='health'?'#21c55d':'#f6c945';
x.fillRect(sx-size/2,H/2+bob-size/2,size,size);
x.restore()
}
function drawWeapon(bob){
const cx=W/2,base=H+bob*1.5;
x.fillStyle='#282828';x.fillRect(cx-44,base-64,88,50);
x.fillStyle='#555';x.fillRect(cx-32,base-80,64,24);
if(player.muzzle>0){
x.fillStyle=player.muzzle%2?'#fff':'#ffd43b';
x.beginPath();x.moveTo(cx,base-96);x.lineTo(cx-20,base-68);x.lineTo(cx,base-74);x.lineTo(cx+20,base-68);x.closePath();x.fill()
}
}
function drawAmbient(){ambient.forEach(p=>{const a=.12+Math.sin(runT*.04+p.ph)*.08;x.fillStyle='rgba(200,190,255,'+a+')';x.beginPath();x.arc(p.x,p.y,p.r,0,7);x.fill()})}
function drawParticles(){particles.forEach(p=>{x.fillStyle='rgba('+p.col+','+Math.max(p.life,0)+')';x.fillRect(p.x,p.y,p.size,p.size)})}
function drawCrosshair(){
const cx=W/2,cy=H/2;
x.strokeStyle='rgba(255,255,255,.85)';x.lineWidth=2;
x.beginPath();x.moveTo(cx-5,cy);x.lineTo(cx-1,cy);x.moveTo(cx+1,cy);x.lineTo(cx+5,cy);x.moveTo(cx,cy-5);x.lineTo(cx,cy-1);x.moveTo(cx,cy+1);x.lineTo(cx,cy+5);x.stroke()
}
function drawVignette(){
const g=x.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.75);
g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.45)');
x.fillStyle=g;x.fillRect(0,0,W,H)
}
function drawEndScreen(){
if(!gameOver&&!win)return;
const a=Math.min(1,endT*.04);
x.fillStyle='rgba(0,0,0,'+(a*.75)+')';x.fillRect(0,0,W,H);
x.globalAlpha=a;
x.textAlign='center';x.fillStyle=win?'#ffd43b':'#f33';x.font='bold 22px Arial';
x.fillText(win?'LEVEL CLEAR':'YOU DIED',W/2,H/2-10);
x.fillStyle='#fff';x.font='12px Arial';x.fillText('Score '+player.score+' · Tap to restart',W/2,H/2+14);
x.textAlign='left';x.globalAlpha=1
}
function draw(){
x.clearRect(0,0,W,H);
x.save();
if(shake>0)x.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
const bob=Math.sin(bobT*.3)*(keys.forward||keys.strafeL||keys.strafeR?3:.8);
drawWalls(bob);
drawAmbient();
const sprites=[...enemies.filter(e=>!e.dead).map(e=>({t:'e',o:e})),...pickups.filter(p=>!p.taken).map(p=>({t:'p',o:p}))];
sprites.sort((a,b)=>dist(player,b.o)-dist(player,a.o));
for(const s of sprites)s.t==='e'?drawEnemySprite(s.o,bob):drawPickup(s.o,bob);
drawParticles();
drawWeapon(bob);
drawCrosshair();
drawVignette();
if(player.hurt>0){x.fillStyle='rgba(255,0,0,'+(player.hurt/45)+')';x.fillRect(0,0,W,H)}
x.restore();
drawEndScreen();
hpEl.textContent='HP '+Math.max(0,Math.floor(player.hp));
ammoEl.textContent='AMMO '+player.ammo+' · SCORE '+player.score;
statusEl.textContent=win?'Level clear!':gameOver?'You died':enemies.filter(e=>!e.dead).length+' enemies left'
}
function loop(){update();draw();requestAnimationFrame(loop)}
function bind(id,key){
const b=document.getElementById(id);
const down=e=>{e.preventDefault();keys[key]=true};
const up=e=>{e.preventDefault();keys[key]=false};
b.addEventListener('touchstart',down,{passive:false});
b.addEventListener('touchend',up,{passive:false});
b.addEventListener('touchcancel',up,{passive:false});
b.addEventListener('mousedown',down);
b.addEventListener('mouseup',up);
b.addEventListener('mouseleave',up)
}
bind('forward','forward');bind('strafeL','strafeL');bind('strafeR','strafeR');bind('fire','fire');

let looking=false;
let lookLastX=0;
c.addEventListener('pointerdown',e=>{
if(gameOver||win){reset();return;}
looking=true;
lookLastX=e.clientX;
c.setPointerCapture(e.pointerId);
});
c.addEventListener('pointermove',e=>{
if(!looking)return;
const dx=e.clientX-lookLastX;
player.angle+=dx*0.009;
lookLastX=e.clientX;
});
const stopLook=e=>{looking=false;};
c.addEventListener('pointerup',stopLook);
c.addEventListener('pointercancel',stopLook);

window.addEventListener('keydown',e=>{
const k=e.key.toLowerCase();
if(k==='w')keys.forward=true;
if(k==='a')keys.strafeL=true;
if(k==='d')keys.strafeR=true;
if(k==='arrowleft')player.angle-=.1;
if(k==='arrowright')player.angle+=.1;
if(k===' ')keys.fire=true
});
window.addEventListener('keyup',e=>{
const k=e.key.toLowerCase();
if(k==='w')keys.forward=false;
if(k==='a')keys.strafeL=false;
if(k==='d')keys.strafeR=false;
if(k===' ')keys.fire=false
});
reset();
requestAnimationFrame(loop);
</script></body>`;

// ============================================
// GAME 4 - SNAKE (swipe or arrows)
// ============================================
const SNAKE_HTML = simpleGame('Snake', 'rdw_snake',
`<canvas id="g" class="cv" width="300" height="300"></canvas>
<div class="r"><button data-d="-1,0">←</button><button data-d="0,-1">↑</button><button data-d="0,1">↓</button><button data-d="1,0">→</button></div>`,
`const N=15,S=20,cv=$('g'),x=cv.getContext('2d');
let sn,dir,nd,food,alive,run,pts,speed,tm;
function place(){do{food={x:Math.random()*N|0,y:Math.random()*N|0}}while(sn.some(s=>s.x==food.x&&s.y==food.y))}
function reset(){clearTimeout(tm);sn=[{x:7,y:7},{x:6,y:7},{x:5,y:7}];dir=nd={x:1,y:0};pts=0;speed=140;alive=true;run=false;place();score(0);msg('Swipe or use the arrows to start');draw()}
function turn(dx,dy){if(!alive)return;if(dx==-dir.x&&dy==-dir.y)return;nd={x:dx,y:dy};if(!run){run=true;msg('');tm=setTimeout(step,speed)}}
function step(){
dir=nd;const h={x:sn[0].x+dir.x,y:sn[0].y+dir.y},eat=h.x==food.x&&h.y==food.y,body=eat?sn:sn.slice(0,-1);
if(h.x<0||h.y<0||h.x>=N||h.y>=N||body.some(s=>s.x==h.x&&s.y==h.y)){alive=false;run=false;draw(true);msg('Game over - tap the board to play again');return}
sn.unshift(h);
if(eat){pts++;score(pts);place();speed=Math.max(65,speed-3)}else sn.pop();
draw();tm=setTimeout(step,speed)}
function draw(dead){
x.clearRect(0,0,300,300);
x.strokeStyle='rgba(255,255,255,.04)';x.lineWidth=1;
for(let i=1;i<N;i++){x.beginPath();x.moveTo(i*S,0);x.lineTo(i*S,300);x.moveTo(0,i*S);x.lineTo(300,i*S);x.stroke()}
x.shadowColor='#ff6b81';x.shadowBlur=12;x.fillStyle='#ff6b81';x.beginPath();x.arc(food.x*S+10,food.y*S+10,6,0,7);x.fill();x.shadowBlur=0;
sn.forEach((s,i)=>{x.fillStyle=i?'hsl('+(150-i*3)+',70%,'+(55-Math.min(i,20))+'%)':(dead?'#ff4757':'#a29bfe');x.beginPath();if(x.roundRect)x.roundRect(s.x*S+1,s.y*S+1,S-2,S-2,5);else x.rect(s.x*S+1,s.y*S+1,S-2,S-2);x.fill()})}
document.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{const a=b.dataset.d.split(',').map(Number);turn(a[0],a[1])});
onkeydown=e=>{const m={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(m){e.preventDefault();turn(m[0],m[1])}};
let p0=null;
cv.onpointerdown=e=>{p0={x:e.clientX,y:e.clientY}};
cv.onpointercancel=()=>{p0=null};
cv.onpointerup=e=>{if(!p0)return;const dx=e.clientX-p0.x,dy=e.clientY-p0.y;p0=null;
if(Math.hypot(dx,dy)<18){if(!alive)reset();return}
if(Math.abs(dx)>Math.abs(dy))turn(dx>0?1:-1,0);else turn(0,dy>0?1:-1)};
reset();`);

// ============================================
// GAME 5 - 2048 (swipe or arrows)
// ============================================
const G2048_HTML = simpleGame('2048', 'rdw_g2048',
`<div id="bd" style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding:7px;border-radius:12px;background:rgba(255,255,255,.07);touch-action:none"></div>
<div class="r"><button data-m="0">←</button><button data-m="1">↑</button><button data-m="3">↓</button><button data-m="2">→</button><button id="nw" style="flex:1.7">New</button></div>`,
`const bd=$('bd'),CL={0:'rgba(255,255,255,.06)',2:'#6c5ce7',4:'#8e7cf0',8:'#00b894',16:'#00cec9',32:'#0984e3',64:'#e1a800',128:'#e17055',256:'#d63031',512:'#e84393',1024:'#b53471',2048:'#ffeaa7'};
let b,pts,won;
function add(){const e=[];b.forEach((v,i)=>{if(!v)e.push(i)});if(e.length)b[e[Math.random()*e.length|0]]=Math.random()<.9?2:4}
function render(){bd.innerHTML=b.map(v=>'<div style="aspect-ratio:1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:'+(v>=1024?17:v>=128?21:26)+'px;background:'+(CL[v]||'#ffeaa7')+';color:'+(v>=2048?'#333':'#fff')+'">'+(v||'')+'</div>').join('')}
function reset(){b=Array(16).fill(0);pts=0;won=0;add();add();score(0);msg('Swipe the board or use the arrows');render()}
function slide(r){const a=r.filter(v=>v);let g=0;for(let i=0;i<a.length-1;i++)if(a[i]==a[i+1]){a[i]*=2;g+=a[i];a.splice(i+1,1)}while(a.length<4)a.push(0);return[a,g]}
function can(){if(b.includes(0))return 1;for(let i=0;i<16;i++){if(i%4<3&&b[i]==b[i+1])return 1;if(i<12&&b[i]==b[i+4])return 1}return 0}
function mv(d){
let mo=0,gn=0;
for(let i=0;i<4;i++){
const ix=[0,1,2,3].map(j=>d==0?i*4+j:d==2?i*4+3-j:d==1?j*4+i:(3-j)*4+i),res=slide(ix.map(k=>b[k]));
gn+=res[1];ix.forEach((k,j)=>{if(b[k]!=res[0][j]){mo=1;b[k]=res[0][j]}})}
if(!mo)return;
pts+=gn;add();score(pts);render();
if(!won&&b.includes(2048)){won=1;msg('You made 2048! Keep going for a higher score')}
else if(!can())msg('No moves left - press New')}
document.querySelectorAll('[data-m]').forEach(el=>el.onclick=()=>mv(+el.dataset.m));
$('nw').onclick=reset;
onkeydown=e=>{const m={ArrowLeft:0,ArrowUp:1,ArrowRight:2,ArrowDown:3}[e.key];if(m!==undefined){e.preventDefault();mv(m)}};
let p0=null;
bd.onpointerdown=e=>{p0={x:e.clientX,y:e.clientY}};
bd.onpointercancel=()=>{p0=null};
bd.onpointerup=e=>{if(!p0)return;const dx=e.clientX-p0.x,dy=e.clientY-p0.y;p0=null;if(Math.hypot(dx,dy)<20)return;
if(Math.abs(dx)>Math.abs(dy))mv(dx>0?2:0);else mv(dy>0?3:1)};
reset();`);

// ============================================
// GAME 6 - FLAPPY BIRD (tap to flap)
// ============================================
const FLAPPY_HTML = simpleGame('Flappy Bird', 'rdw_flappy',
`<canvas id="g" class="cv" width="280" height="360"></canvas>`,
`const W=280,H=360,G=44,GAP=100,BX=70,cv=$('g'),x=cv.getContext('2d');
let b,pipes,pts,st,sp,dead=0,gx=0;
function reset(){b={y:150,v:0};pipes=[];pts=0;st=0;sp=60;score(0);msg('Tap to flap')}
function flap(){if(st==2){if(Date.now()-dead>450)reset();return}if(st==0){st=1;msg('')}b.v=-5}
function die(){if(st==2)return;st=2;dead=Date.now();msg('Game over - tap to retry')}
function upd(dt){
gx=(gx+2.2*dt)%24;
if(st==0){b.y=150+Math.sin(Date.now()/220)*7;return}
b.v+=.3*dt;b.y+=b.v*dt;
const floor=H-G-11;
if(st==2){if(b.y>floor){b.y=floor;b.v=0}return}
sp-=2.2*dt;
if(sp<=0){sp=100;pipes.push({x:W+10,t:40+Math.random()*(H-G-GAP-80),s:0})}
pipes.forEach(p=>p.x-=2.2*dt);
if(pipes.length&&pipes[0].x<-G-6)pipes.shift();
for(const p of pipes){
if(!p.s&&p.x+G<BX-11){p.s=1;pts++;score(pts)}
if(BX+10>p.x&&BX-10<p.x+G&&(b.y-10<p.t||b.y+10>p.t+GAP))die()}
if(b.y>floor){b.y=floor;die()}
if(b.y<11){b.y=11;b.v=0}}
function draw(){
x.clearRect(0,0,W,H);
for(const p of pipes){
const g=x.createLinearGradient(p.x,0,p.x+G,0);g.addColorStop(0,'#2ecc71');g.addColorStop(.5,'#58e08d');g.addColorStop(1,'#1e9e55');x.fillStyle=g;
x.fillRect(p.x,0,G,p.t);x.fillRect(p.x,p.t+GAP,G,H-G-p.t-GAP);
x.fillRect(p.x-3,p.t-14,G+6,14);x.fillRect(p.x-3,p.t+GAP,G+6,14)}
x.fillStyle='#3d3a63';x.fillRect(0,H-G,W,G);x.fillStyle='#5b57a3';
for(let i=-1;i<W/24+1;i++)x.fillRect(i*24-gx,H-G,12,6);
x.save();x.translate(BX,b.y);x.rotate(Math.max(-.5,Math.min(1.2,b.v*.09)));
x.fillStyle='#ffd93d';x.beginPath();x.arc(0,0,11,0,7);x.fill();
x.fillStyle='#fff';x.beginPath();x.arc(4,-3,4,0,7);x.fill();
x.fillStyle='#222';x.beginPath();x.arc(5.5,-3,2,0,7);x.fill();
x.fillStyle='#ff8c42';x.beginPath();x.moveTo(9,1);x.lineTo(18,4);x.lineTo(9,7);x.fill();
x.restore()}
cv.onpointerdown=e=>{e.preventDefault();flap()};
onkeydown=e=>{if(e.key==' '||e.key=='ArrowUp'){e.preventDefault();flap()}};
reset();raf(dt=>{upd(dt);draw()});`);

// ============================================
// GAME 7 - BREAKOUT (drag the paddle, tap to launch)
// ============================================
const BREAKOUT_HTML = simpleGame('Breakout', 'rdw_breakout',
`<canvas id="g" class="cv" width="300" height="340"></canvas>`,
`const W=300,H=340,C=8,R=5,BW=32,BH=13,GP=3,OX=(W-(C*BW+(C-1)*GP))/2,OY=44,PW=62,PH=9,PY=H-22,cv=$('g'),x=cv.getContext('2d');
const COL=['#ff6b81','#ffa502','#ffd93d','#2ed573','#70a1ff'];
let br,pd,ball,pts,lives,lvl,st,sp,keys={};
function mk(){br=[];for(let r=0;r<R;r++)for(let c=0;c<C;c++)br.push({x:OX+c*(BW+GP),y:OY+r*(BH+GP),r:r,on:1})}
function stick(){ball.x=pd;ball.y=PY-7;ball.vx=0;ball.vy=0}
function reset(){mk();pd=W/2;ball={x:0,y:0,vx:0,vy:0};pts=0;lives=3;lvl=1;sp=4;st=0;stick();score(0);msg('Drag to move - tap to launch')}
function launch(){if(st==0){st=1;const a=(Math.random()-.5)*.8;ball.vx=sp*Math.sin(a);ball.vy=-sp*Math.cos(a);msg('')}else if(st==2)reset()}
function step(f){
ball.x+=ball.vx*f;ball.y+=ball.vy*f;
if(ball.x<6){ball.x=6;ball.vx=Math.abs(ball.vx)}
if(ball.x>W-6){ball.x=W-6;ball.vx=-Math.abs(ball.vx)}
if(ball.y<6){ball.y=6;ball.vy=Math.abs(ball.vy)}
if(ball.vy>0&&ball.y+6>=PY&&ball.y-6<=PY+PH&&ball.x>=pd-PW/2-6&&ball.x<=pd+PW/2+6){
const a=Math.max(-1,Math.min(1,(ball.x-pd)/(PW/2)))*1.05;ball.vx=sp*Math.sin(a);ball.vy=-sp*Math.cos(a);ball.y=PY-6}
for(const b of br){if(!b.on)continue;
const cx=Math.max(b.x,Math.min(ball.x,b.x+BW)),cy=Math.max(b.y,Math.min(ball.y,b.y+BH)),dx=ball.x-cx,dy=ball.y-cy;
if(dx*dx+dy*dy<36){b.on=0;pts+=10;score(pts);
if(Math.abs(dx)>Math.abs(dy))ball.vx=dx>0?Math.abs(ball.vx):-Math.abs(ball.vx);else ball.vy=dy>0?Math.abs(ball.vy):-Math.abs(ball.vy);
break}}
if(!br.some(b=>b.on)){lvl++;sp=Math.min(7,sp+.5);mk();st=0;stick();msg('Level '+lvl+' - tap to launch');return}
if(ball.y>H+8){lives--;if(lives<=0){st=2;msg('Game over - tap to play again')}else{st=0;stick();msg('Tap to launch')}}}
function upd(dt){
const k=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0);
if(k)pd=Math.max(PW/2,Math.min(W-PW/2,pd+k*6*dt));
if(st==0){ball.x=pd;return}
if(st!=1)return;
const n=Math.ceil(dt*sp/3);
for(let i=0;i<n;i++){step(dt/n);if(st!=1)break}}
function draw(){
x.clearRect(0,0,W,H);
for(const b of br){if(!b.on)continue;x.fillStyle=COL[b.r];x.beginPath();if(x.roundRect)x.roundRect(b.x,b.y,BW,BH,3);else x.rect(b.x,b.y,BW,BH);x.fill()}
x.fillStyle='#a29bfe';x.beginPath();if(x.roundRect)x.roundRect(pd-PW/2,PY,PW,PH,5);else x.rect(pd-PW/2,PY,PW,PH);x.fill();
x.shadowColor='#fff';x.shadowBlur=10;x.fillStyle='#fff';x.beginPath();x.arc(ball.x,ball.y,6,0,7);x.fill();x.shadowBlur=0;
for(let i=0;i<lives;i++){x.fillStyle='#ff6b81';x.beginPath();x.arc(14+i*16,16,5,0,7);x.fill()}
x.fillStyle='rgba(255,255,255,.55)';x.font='12px Arial';x.textAlign='right';x.fillText('LEVEL '+lvl,W-10,20)}
function px(e){const r=cv.getBoundingClientRect();pd=Math.max(PW/2,Math.min(W-PW/2,(e.clientX-r.left)*W/r.width))}
cv.onpointermove=px;
cv.onpointerdown=e=>{e.preventDefault();px(e);launch()};
onkeydown=e=>{if(e.key=='ArrowLeft'||e.key=='ArrowRight'){e.preventDefault();keys[e.key]=1}if(e.key==' '){e.preventDefault();launch()}};
onkeyup=e=>{keys[e.key]=0};
reset();raf(dt=>{upd(dt);draw()});`);

// ============================================
// GAME 8 - PONG vs AI (drag the paddle, first to 5)
// ============================================
const PONG_HTML = simpleGame('Pong', 'rdw_pong',
`<canvas id="g" class="cv" width="300" height="340"></canvas>`,
`const W=300,H=340,PW=58,PH=8,PY=H-22,cv=$('g'),x=cv.getContext('2d');
let pp,ap,ball,sP,sA,st,sp,aerr,hold,wins=0,AIS=3,FLUB=.06;
try{wins=+localStorage.getItem('rdw_pong_w')||0}catch(e){}
function head(){$('sc').textContent=sP+' : '+sA;$('bs').textContent='WINS '+wins}
function serve(dir){sp=3.6;const a=(Math.random()-.5)*.9;ball={x:W/2,y:H/2,vx:sp*Math.sin(a),vy:dir*sp*Math.cos(a)};hold=40;aim()}
function aim(){aerr=Math.random()<Math.min(.45,(sp-3.5)*FLUB)?(Math.random()<.5?-1:1)*(PW/2+10+Math.random()*30):(Math.random()-.5)*PW*.6}
function reset(){pp=ap=W/2;sP=0;sA=0;st=0;serve(1);head();msg('Tap to start - first to 5 wins. Drag to move.')}
function hit(p,dir,y){sp=Math.min(8,sp+.28);const a=Math.max(-1,Math.min(1,(ball.x-p)/(PW/2)));ball.vx=sp*Math.sin(a);ball.vy=dir*sp*Math.cos(a);ball.y=y}
function point(pl){
if(pl)sP++;else sA++;
if(sP>=5||sA>=5){st=2;if(sP>=5){wins++;try{localStorage.setItem('rdw_pong_w',wins)}catch(e){}msg('You win! Tap to play again')}else msg('The AI wins - tap to play again');head();return}
head();serve(pl?-1:1)}
function predict(){
if(ball.vy>=0)return W/2;
const t=(ball.y-(12+PH+6))/-ball.vy,span=W-12;
let px=(ball.x+ball.vx*t-6)%(2*span);if(px<0)px+=2*span;if(px>span)px=2*span-px;return px+6}
function upd(dt){
if(st!=1)return;
const t=ball.vy<0?predict()+aerr:W/2,d=t-ap,m=(AIS+Math.min(sP,4)*.1)*dt;
ap+=Math.abs(d)<m?d:Math.sign(d)*m;ap=Math.max(PW/2,Math.min(W-PW/2,ap));
if(hold>0){hold-=dt;return}
ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
if(ball.x<6||ball.x>W-6){ball.x=ball.x<6?6:W-6;ball.vx=-ball.vx}
if(ball.vy>0&&ball.y+6>=PY&&ball.y-6<=PY+PH&&Math.abs(ball.x-pp)<=PW/2+6){hit(pp,-1,PY-6);aim()}
if(ball.vy<0&&ball.y-6<=12+PH&&ball.y+6>=12&&Math.abs(ball.x-ap)<=PW/2+6){hit(ap,1,12+PH+6)}
if(ball.y<-10)point(1);else if(ball.y>H+10)point(0)}
function rr(px,py,w,h,c){x.fillStyle=c;x.beginPath();if(x.roundRect)x.roundRect(px,py,w,h,4);else x.rect(px,py,w,h);x.fill()}
function draw(){
x.clearRect(0,0,W,H);
x.strokeStyle='rgba(255,255,255,.15)';x.setLineDash([8,8]);x.beginPath();x.moveTo(0,H/2);x.lineTo(W,H/2);x.stroke();x.setLineDash([]);
rr(ap-PW/2,12,PW,PH,'#ff6b81');rr(pp-PW/2,PY,PW,PH,'#a29bfe');
x.shadowColor='#fff';x.shadowBlur=10;x.fillStyle='#fff';x.beginPath();x.arc(ball.x,ball.y,6,0,7);x.fill();x.shadowBlur=0}
function mv(e){const r=cv.getBoundingClientRect();pp=Math.max(PW/2,Math.min(W-PW/2,(e.clientX-r.left)*W/r.width))}
cv.onpointermove=mv;
cv.onpointerdown=e=>{e.preventDefault();mv(e);if(st==0){st=1;msg('')}else if(st==2){reset();st=1;msg('')}};
onkeydown=e=>{if(e.key=='ArrowLeft')pp=Math.max(PW/2,pp-18);if(e.key=='ArrowRight')pp=Math.min(W-PW/2,pp+18)};
reset();raf(dt=>{upd(dt);draw()});`);

// ============================================
// GAME 9 - SPACE SHOOTER (drag to move, auto fire)
// ============================================
const SHOOTER_HTML = simpleGame('Space Shooter', 'rdw_shooter',
`<canvas id="g" class="cv" width="300" height="360"></canvas>`,
`const W=300,H=360,cv=$('g'),x=cv.getContext('2d');
let px,tx,bl,en,pt,st,pts,lives,lvl,fr,spw,inv;
const stars=[];for(let i=0;i<40;i++)stars.push({x:Math.random()*W,y:Math.random()*H,s:.4+Math.random()*1.2});
function reset(){px=tx=W/2;bl=[];en=[];pt=[];pts=0;lives=3;lvl=1;fr=0;spw=30;inv=0;st=0;score(0);msg('Tap to start - drag to move, your ship fires by itself')}
function boom(bx,by,n){for(let i=0;i<n;i++){const a=Math.random()*6.28,s=.8+Math.random()*2.6;pt.push({x:bx,y:by,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:18+Math.random()*16,c:Math.random()<.5?'#ffa502':'#ff6b81'})}}
function hurt(ship){
if(ship){if(inv>0)return;inv=70}
lives--;boom(px,H-34,14);
if(lives<=0){st=2;msg('Game over - tap to play again')}}
function upd(dt){
stars.forEach(s=>{s.y+=s.s*dt*(st==1?2:.6);if(s.y>H){s.y=0;s.x=Math.random()*W}});
pt.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.l-=dt});pt=pt.filter(p=>p.l>0);
if(st!=1)return;
px+=(tx-px)*.25*Math.min(dt,2);fr+=dt;if(inv>0)inv-=dt;
if(fr>=13){fr=0;(lvl>2?[px-7,px+7]:[px]).forEach(bx=>bl.push({x:bx,y:H-48,d:0}))}
bl.forEach(b=>b.y-=7*dt);bl=bl.filter(b=>b.y>-10);
spw-=dt;
if(spw<=0){spw=Math.max(20,58-lvl*4);const big=lvl>1&&Math.random()<.22;en.push({x:20+Math.random()*(W-40),y:-20,ph:Math.random()*6,hp:big?3:1,r:big?17:11,vy:(.9+lvl*.12)*(big?.7:1),big:big,k:0})}
for(const e of en){e.y+=e.vy*dt;e.ph+=.05*dt;e.x=Math.max(14,Math.min(W-14,e.x+Math.sin(e.ph)*.8*dt))}
for(const e of en)for(const b of bl){if(!b.d&&Math.abs(b.x-e.x)<e.r&&Math.abs(b.y-e.y)<e.r+4){b.d=1;e.hp--;boom(b.x,b.y,3)}}
bl=bl.filter(b=>!b.d);
for(const e of en)if(e.hp<=0&&!e.k){e.k=1;pts+=e.big?30:10;score(pts);boom(e.x,e.y,e.big?18:10);if(pts>=lvl*100)lvl++}
for(const e of en){if(e.k)continue;
if(Math.abs(e.x-px)<e.r+10&&Math.abs(e.y-(H-34))<e.r+10){e.k=1;hurt(true)}
else if(e.y>H+10){e.k=1;hurt(false)}}
en=en.filter(e=>!e.k)}
function draw(){
x.clearRect(0,0,W,H);
x.fillStyle='#fff';stars.forEach(s=>{x.globalAlpha=.25+s.s*.3;x.fillRect(s.x,s.y,1.5,1.5)});x.globalAlpha=1;
x.fillStyle='#4de1ff';bl.forEach(b=>x.fillRect(b.x-1.5,b.y,3,9));
for(const e of en){x.fillStyle=e.big?'#a29bfe':'#ff6b81';x.beginPath();x.moveTo(e.x-e.r,e.y-e.r*.7);x.lineTo(e.x+e.r,e.y-e.r*.7);x.lineTo(e.x,e.y+e.r);x.closePath();x.fill();
x.fillStyle='#fff';x.fillRect(e.x-e.r*.45,e.y-e.r*.35,3,3);x.fillRect(e.x+e.r*.45-3,e.y-e.r*.35,3,3);
if(e.big){x.fillStyle='rgba(255,255,255,.7)';x.fillRect(e.x-e.r,e.y-e.r-6,2*e.r*e.hp/3,3)}}
pt.forEach(p=>{x.globalAlpha=Math.min(1,p.l/16);x.fillStyle=p.c;x.fillRect(p.x,p.y,3,3)});x.globalAlpha=1;
if(st!=2&&!(inv>0&&Math.floor(inv/5)%2)){x.fillStyle='#74b9ff';x.beginPath();x.moveTo(px,H-48);x.lineTo(px+13,H-22);x.lineTo(px,H-28);x.lineTo(px-13,H-22);x.closePath();x.fill();
x.fillStyle='#ffa502';x.beginPath();x.moveTo(px-4,H-26);x.lineTo(px,H-16-Math.random()*5);x.lineTo(px+4,H-26);x.fill()}
for(let i=0;i<Math.max(0,lives);i++){x.fillStyle='#ff6b81';x.beginPath();x.arc(14+i*16,14,5,0,7);x.fill()}
x.fillStyle='rgba(255,255,255,.55)';x.font='12px Arial';x.textAlign='right';x.fillText('LEVEL '+lvl,W-10,18)}
function mv(e){const r=cv.getBoundingClientRect();tx=Math.max(14,Math.min(W-14,(e.clientX-r.left)*W/r.width))}
cv.onpointermove=mv;
cv.onpointerdown=e=>{e.preventDefault();mv(e);if(st==0){st=1;msg('')}else if(st==2){reset();st=1;msg('')}};
onkeydown=e=>{if(e.key=='ArrowLeft')tx=Math.max(14,tx-24);if(e.key=='ArrowRight')tx=Math.min(W-14,tx+24)};
reset();raf(dt=>{upd(dt);draw()});`);

// ============================================
// GAME 10 - STACK (tap to drop the block)
// ============================================
const STACK_HTML = simpleGame('Stack', 'rdw_stack',
`<canvas id="g" class="cv" width="280" height="360"></canvas>`,
`const W=280,H=360,BH=20,cv=$('g'),x=cv.getContext('2d');
let L,cur,dir,spd,pts,st,cam,deb;
function spawn(){const p=L[L.length-1],odd=L.length%2;cur={x:odd?0:W-p.w,w:p.w};dir=odd?1:-1;spd=Math.min(6,2.2+L.length*.07)}
function reset(){L=[{x:70,w:140}];pts=0;st=1;cam=0;deb=[];spawn();score(0);msg('Tap to drop the block')}
function drop(){
if(st==2){reset();return}
const p=L[L.length-1],l=Math.max(cur.x,p.x),r=Math.min(cur.x+cur.w,p.x+p.w),ov=r-l;
if(ov<=2){deb.push({x:cur.x,w:cur.w,lv:L.length,dy:0,vy:0});st=2;msg('Game over - tap to retry');return}
if(Math.abs(cur.x-p.x)<5){L.push({x:p.x,w:p.w});msg('Perfect!')}
else{
if(cur.x<p.x)deb.push({x:cur.x,w:p.x-cur.x,lv:L.length,dy:0,vy:0});
else deb.push({x:p.x+p.w,w:cur.x+cur.w-(p.x+p.w),lv:L.length,dy:0,vy:0});
L.push({x:l,w:ov});msg('')}
pts=L.length-1;score(pts);spawn()}
function Y(lv){return H-40-lv*BH+cam}
function upd(dt){
if(st==1){cur.x+=dir*spd*dt;if(cur.x<0){cur.x=0;dir=1}if(cur.x+cur.w>W){cur.x=W-cur.w;dir=-1}}
cam+=(Math.max(0,(L.length-6)*BH)-cam)*.12*Math.min(dt,2);
deb.forEach(d=>{d.vy+=.4*dt;d.dy+=d.vy*dt});deb=deb.filter(d=>d.dy<260)}
function blk(bx,w,lv,a){x.globalAlpha=a==null?1:a;const c=(lv*14+200)%360;x.fillStyle='hsl('+c+',65%,58%)';x.fillRect(bx,Y(lv),w,BH-1);x.fillStyle='rgba(255,255,255,.25)';x.fillRect(bx,Y(lv),w,3);x.globalAlpha=1}
function draw(){
x.clearRect(0,0,W,H);
L.forEach((b,i)=>blk(b.x,b.w,i));
if(st==1)blk(cur.x,cur.w,L.length);
deb.forEach(d=>{x.save();x.translate(0,d.dy);blk(d.x,d.w,d.lv,Math.max(0,1-d.dy/260));x.restore()})}
cv.onpointerdown=e=>{e.preventDefault();drop()};
onkeydown=e=>{if(e.key==' '){e.preventDefault();drop()}};
reset();raf(dt=>{upd(dt);draw()});`);

// ============================================
// GAME 11 - WHACK-A-MOLE (30 seconds, avoid the bombs)
// ============================================
const WHACK_HTML = simpleGame('Whack-a-Mole', 'rdw_whack',
`<div id="gr" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px"></div>
<button id="go" style="width:100%;margin-top:12px">Start (30 s)</button>`,
`const gr=$('gr'),go=$('go'),holes=[];
let pts=0,on=false,end=0,tmS=0;
const HOLE='aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 35%,rgba(0,0,0,.15),rgba(0,0,0,.55));border:2px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:38px;overflow:hidden';
for(let i=0;i<9;i++){
const h=document.createElement('div');h.style.cssText=HOLE;
const s=document.createElement('span');s.style.cssText='transition:transform .12s;transform:translateY(130%)';
h.appendChild(s);h.onpointerdown=e=>{e.preventDefault();hit(i)};gr.appendChild(h);holes.push({s:s,k:0,t:0})}
function hide(i){const h=holes[i];h.k=0;h.s.style.transform='translateY(130%)'}
function show(i,k,life){const h=holes[i];h.k=k;h.s.textContent=k==1?'🐹':'💣';h.s.style.transform='translateY(0)';clearTimeout(h.t);h.t=setTimeout(()=>hide(i),life)}
function hit(i){
if(!on)return;const h=holes[i];if(!h.k)return;
clearTimeout(h.t);
if(h.k==1){pts++;h.s.textContent='💥'}else{pts=Math.max(0,pts-3);h.s.textContent='😵'}
h.k=0;score(pts);h.t=setTimeout(()=>hide(i),170)}
function finish(){
on=false;clearTimeout(tmS);holes.forEach((h,i)=>{clearTimeout(h.t);hide(i)});
msg('Time up! You scored '+pts);go.disabled=false;go.textContent='Play again'}
function spawn(){
if(!on)return;
const left=end-Date.now();if(left<=0){finish();return}
const p=1-left/30000,free=[];
holes.forEach((h,i)=>{if(!h.k)free.push(i)});
if(free.length)show(free[Math.random()*free.length|0],Math.random()<.2?2:1,Math.max(520,950-p*400));
msg('Time: '+Math.ceil(left/1000)+'s   -   avoid the bombs!');
tmS=setTimeout(spawn,Math.max(320,720-p*350))}
go.onclick=()=>{if(on)return;pts=0;score(0);on=true;end=Date.now()+30000;go.disabled=true;go.textContent='Go go go!';spawn()};
msg('Tap the hamsters, avoid the bombs');`);

// ============================================
// GAME 12 - MEMORY MATCH (find the 8 pairs)
// ============================================
const MEMORY_HTML = simpleGame('Memory Match', 'rdw_memory',
`<div id="gr" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"></div>
<div class="r"><button id="nw">Shuffle</button></div>`,
`const gr=$('gr'),EM=['🍎','🚀','🎸','🐱','🌵','⚽','🍕','🔮'];
let cd,op,lock,mt,mv,bestM=0;
try{bestM=+localStorage.getItem('rdw_memory')||0}catch(e){}
function bsT(){$('bs').textContent=bestM?'BEST '+bestM:'BEST --'}
function draw(){
gr.innerHTML='';
cd.forEach((c,i)=>{
const d=document.createElement('div'),shown=c.f||c.m;
d.style.cssText='aspect-ratio:1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:28px;cursor:pointer;transition:background .2s;'+(shown?'background:'+(c.m?'rgba(0,184,148,.35)':'rgba(108,92,231,.55)')+';border:1px solid rgba(255,255,255,.3)':'background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.35)');
d.textContent=shown?c.e:'?';
d.onpointerdown=ev=>{ev.preventDefault();flip(i)};
gr.appendChild(d)})}
function reset(){
cd=EM.concat(EM).map(e=>({e:e,m:0,f:0,r:Math.random()})).sort((p,q)=>p.r-q.r);
op=[];lock=0;mt=0;mv=0;$('sc').textContent='0';bsT();msg('Find all 8 pairs in as few moves as you can');draw()}
function flip(i){
const c=cd[i];if(lock||c.f||c.m)return;
c.f=1;op.push(i);draw();
if(op.length<2)return;
mv++;$('sc').textContent=mv;
const a=cd[op[0]],b=cd[op[1]];
if(a.e==b.e){
a.m=b.m=1;a.f=b.f=0;op=[];mt++;draw();
if(mt==8){msg('Done in '+mv+' moves!');if(!bestM||mv<bestM){bestM=mv;try{localStorage.setItem('rdw_memory',mv)}catch(e){}}bsT()}}
else{lock=1;setTimeout(()=>{a.f=b.f=0;op=[];lock=0;draw()},750)}}
$('nw').onclick=reset;
reset();`);

// ============================================
// GAME 13 - MINESWEEPER (tap to dig, hold or Flag mode to flag)
// ============================================
const MINES_HTML = simpleGame('Minesweeper', 'rdw_mines',
`<div id="bd" style="display:grid;grid-template-columns:repeat(8,1fr);gap:3px"></div>
<div class="r"><button id="fl">Mode: Dig</button><button id="nw">New</button></div>`,
`const N=8,M=10,bd=$('bd'),fl=$('fl'),NC=['','#70a1ff','#2ed573','#ff6b81','#a29bfe','#ffa502','#00cec9','#fff','#aaa'];
let g,first,over,flagMode=false,tmr=0,secs=0,bestT=0,lpDone=0;
try{bestT=+localStorage.getItem('rdw_mines')||0}catch(e){}
function bsT(){$('bs').textContent=bestT?'BEST '+bestT+'s':'BEST --'}
function nb(i){const r=i/N|0,c=i%N,o=[];for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){if(!a&&!b)continue;const y=r+a,z=c+b;if(y>=0&&y<N&&z>=0&&z<N)o.push(y*N+z)}return o}
function left(){$('sc').textContent=M-g.filter(c=>c.f).length}
function plant(s){
const ban=new Set([s].concat(nb(s)));let k=0;
while(k<M){const i=Math.random()*N*N|0;if(ban.has(i)||g[i].m)continue;g[i].m=1;k++}
g.forEach((c,i)=>{c.n=nb(i).filter(j=>g[j].m).length})}
function flood(i){
const st=[i];
while(st.length){const j=st.pop(),c=g[j];if(c.o||c.f)continue;c.o=1;if(!c.n&&!c.m)nb(j).forEach(k=>{if(!g[k].o)st.push(k)})}}
function act(i,flag){
if(over)return;
const c=g[i];
if(flag||flagMode){if(c.o)return;c.f=!c.f;left();draw();return}
if(c.f||c.o)return;
if(first){first=0;plant(i);tmr=setInterval(()=>{secs++;msg('Time: '+secs+'s')},1000)}
if(c.m){over=1;clearInterval(tmr);g.forEach(q=>{if(q.m)q.o=1});c.x=1;msg('Boom! Tap New to try again');draw();return}
flood(i);draw();
if(g.every(q=>q.m||q.o)){
over=1;clearInterval(tmr);g.forEach(q=>{if(q.m)q.f=1});left();
msg('You win in '+secs+'s!');
if(!bestT||secs<bestT){bestT=secs;try{localStorage.setItem('rdw_mines',secs)}catch(e){}}
bsT();draw()}}
function bind(d,i){
let tm=0;
d.onpointerdown=e=>{e.preventDefault();lpDone=0;tm=setTimeout(()=>{lpDone=1;act(i,1)},380)};
d.onpointerup=()=>{clearTimeout(tm);if(lpDone){lpDone=0;return}act(i,0)};
d.onpointerleave=()=>clearTimeout(tm);
d.oncontextmenu=e=>e.preventDefault()}
function draw(){
bd.innerHTML='';
g.forEach((c,i)=>{
const d=document.createElement('div');
let s='aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:15px;',t='';
if(c.o){
s+='background:'+(c.m?(c.x?'#d63031':'rgba(255,107,129,.35)'):'rgba(255,255,255,.04)')+';border:1px solid rgba(255,255,255,.06);';
if(c.m)t='💣';else if(c.n){t=c.n;s+='color:'+NC[c.n]}}
else{s+='background:rgba(108,92,231,.38);border:1px solid rgba(255,255,255,.18);cursor:pointer;';if(c.f)t='🚩'}
d.style.cssText=s;d.textContent=t;bind(d,i);bd.appendChild(d)})}
function reset(){
clearInterval(tmr);
g=Array.from({length:N*N},()=>({m:0,o:0,f:false,n:0,x:0}));
first=1;over=0;secs=0;left();bsT();msg('Tap to dig (first tap is safe) - hold to plant a flag');draw()}
fl.onclick=()=>{flagMode=!flagMode;fl.textContent='Mode: '+(flagMode?'Flag':'Dig')};
$('nw').onclick=reset;
reset();`);

// ============================================
// GAME 14 - CONNECT 4 vs AI (Easy / Normal / Hard)
// ============================================
const CONNECT4_HTML = simpleGame('Connect 4', 'rdw_connect4',
`<div id="bd" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:6px;border-radius:12px;background:rgba(9,132,227,.35)"></div>
<div class="r"><button data-l="1">Easy</button><button data-l="3">Normal</button><button data-l="5">Hard</button><button id="nw">New</button></div>`,
`const bd=$('bd'),ORD=[3,2,4,1,5,0,6],cells=[],WN=[];
let b,turn,over,lvl=3,wn=0,ls=0,win=null;
for(let r=0;r<6;r++)for(let c=0;c<7;c++)[[0,1],[1,0],[1,1],[1,-1]].forEach(d=>{const e=[];for(let k=0;k<4;k++){const y=r+d[0]*k,z=c+d[1]*k;if(y<0||y>5||z<0||z>6)break;e.push(y*7+z)}if(e.length==4)WN.push(e)});
for(let i=0;i<42;i++){const d=document.createElement('div');d.style.cssText='aspect-ratio:1;border-radius:50%;background:rgba(0,0,0,.35);transition:background .15s';d.onpointerdown=e=>{e.preventDefault();play(i%7)};bd.appendChild(d);cells.push(d)}
function paint(){cells.forEach((d,i)=>{const v=b[i];d.style.background=v==1?'#ff4757':v==2?'#ffd93d':'rgba(0,0,0,.35)';d.style.boxShadow=win&&win.includes(i)?'0 0 0 3px #fff,0 0 14px #fff':'none'})}
function head(){$('sc').textContent=wn;$('bs').textContent='AI '+ls}
function low(bb,c){for(let r=5;r>=0;r--)if(!bb[r*7+c])return r;return -1}
function wnr(){for(const w of WN){const v=b[w[0]];if(v&&w.every(i=>b[i]==v))return w}return null}
function ev(bb){
let s=0;
for(const w of WN){let a=0,h=0;for(const i of w){if(bb[i]==2)a++;else if(bb[i]==1)h++}
if(a==4)return 1e5;if(h==4)return -1e5;
if(!h)s+=a==3?6:a==2?2:0;
if(!a)s-=h==3?7:h==2?2:0}
for(let r=0;r<6;r++){if(bb[r*7+3]==2)s+=3;else if(bb[r*7+3]==1)s-=3}
return s}
function mm(bb,d,al,be,mx){
const e=ev(bb),mv=ORD.filter(c=>!bb[c]);
if(Math.abs(e)>=1e5)return e>0?e+d:e-d;
if(!mv.length)return 0;
if(!d)return e;
let v=mx?-1e9:1e9;
for(const c of mv){
const r=low(bb,c);bb[r*7+c]=mx?2:1;
const t=mm(bb,d-1,al,be,!mx);bb[r*7+c]=0;
if(mx){v=Math.max(v,t);al=Math.max(al,v)}else{v=Math.min(v,t);be=Math.min(be,v)}
if(al>=be)break}
return v}
function after(p){
win=wnr();paint();
if(win){over=1;if(p==1)wn++;else ls++;head();msg(p==1?'You win! Tap New to play again':'The AI wins - tap New for a rematch')}
else if(!b.slice(0,7).includes(0)){over=1;msg('Draw! Tap New to play again')}
else msg(p==1?'AI is thinking...':'Your move - you are red')}
function ai(){
if(over)return;
const mv=ORD.filter(c=>!b[c]);let pick;
if(lvl==1&&Math.random()<.35)pick=mv[Math.random()*mv.length|0];
else{let bs=-1e9,bc=[];
for(const c of mv){const r=low(b,c);b[r*7+c]=2;const v=mm(b,lvl-1,-1e9,1e9,false);b[r*7+c]=0;if(v>bs){bs=v;bc=[c]}else if(v==bs)bc.push(c)}
pick=bc[Math.random()*bc.length|0]}
b[low(b,pick)*7+pick]=2;after(2);if(!over)turn=1}
function play(c){
if(over||turn!=1)return;
const r=low(b,c);if(r<0)return;
b[r*7+c]=1;turn=0;paint();after(1);
if(!over)setTimeout(ai,350)}
function sel(){document.querySelectorAll('[data-l]').forEach(el=>{el.style.background=+el.dataset.l==lvl?'rgba(108,92,231,.6)':''})}
function reset(){b=Array(42).fill(0);turn=1;over=0;win=null;paint();head();sel();msg('Your move - you are red')}
document.querySelectorAll('[data-l]').forEach(el=>el.onclick=()=>{lvl=+el.dataset.l;reset()});
$('nw').onclick=reset;
reset();`);

// ============================================
// GAME 15 - SIMON SAYS (repeat the pattern)
// ============================================
const SIMON_HTML = simpleGame('Simon Says', 'rdw_simon',
`<div id="pd" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"></div>
<button id="go" style="width:100%;margin-top:12px">Start</button>`,
`const COLS=['#2ed573','#ff4757','#ffd93d','#3d8bfd'],FR=[392,330,262,196],pads=[],go=$('go');
let seq=[],pos=0,busy=0,on=0,ac=null;
function tone(f,ms){try{ac=ac||new(window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;g.gain.value=.12;o.connect(g);g.connect(ac.destination);o.start();g.gain.setTargetAtTime(0,ac.currentTime+ms/1000-.05,.03);o.stop(ac.currentTime+ms/1000)}catch(e){}}
for(let i=0;i<4;i++){const d=document.createElement('div');d.style.cssText='height:92px;border-radius:16px;background:'+COLS[i]+';opacity:.45;transition:opacity .1s,box-shadow .1s';d.onpointerdown=e=>{e.preventDefault();press(i)};$('pd').appendChild(d);pads.push(d)}
function lit(i,ms){pads[i].style.opacity=1;pads[i].style.boxShadow='0 0 24px '+COLS[i];tone(FR[i],ms);setTimeout(()=>{pads[i].style.opacity=.45;pads[i].style.boxShadow='none'},ms)}
const sl=ms=>new Promise(r=>setTimeout(r,ms));
async function show(){
busy=1;msg('Watch the pattern...');await sl(600);
const ms=Math.max(220,520-seq.length*18);
for(const i of seq){if(!on)return;lit(i,ms);await sl(ms+160)}
pos=0;busy=0;msg('Your turn - repeat it')}
function next(){seq.push(Math.random()*4|0);show()}
function over(){on=0;busy=0;tone(110,500);msg('Wrong pad! You completed '+seq.slice(0,-1).length+' rounds.');go.disabled=false;go.textContent='Play again'}
function press(i){
if(!on||busy)return;
lit(i,160);
if(i!=seq[pos]){over();return}
pos++;
if(pos==seq.length){score(seq.length);busy=1;msg('Nice!');setTimeout(next,700)}}
go.onclick=()=>{if(on)return;seq=[];on=1;score(0);go.disabled=true;go.textContent='Playing...';next()};
msg('Press Start and repeat the pattern');`);

// ============================================
// GAME 16 - LIGHTS OUT (turn every light off)
// ============================================
const LIGHTS_HTML = simpleGame('Lights Out', 'rdw_lights',
`<div id="bd" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px"></div>
<div class="r"><button id="nw">New puzzle</button></div>`,
`const bd=$('bd'),cells=[];
let g,mv,done=0,bestL=0;
try{bestL=+localStorage.getItem('rdw_lights')||0}catch(e){}
for(let i=0;i<25;i++){const d=document.createElement('div');d.style.cssText='aspect-ratio:1;border-radius:10px;cursor:pointer;transition:background .15s,box-shadow .15s';d.onpointerdown=e=>{e.preventDefault();tap(i)};bd.appendChild(d);cells.push(d)}
function tog(i){const r=i/5|0,c=i%5,t=[i];if(r>0)t.push(i-5);if(r<4)t.push(i+5);if(c>0)t.push(i-1);if(c<4)t.push(i+1);t.forEach(j=>{g[j]=!g[j]})}
function paint(){cells.forEach((d,i)=>{d.style.background=g[i]?'#ffd93d':'rgba(255,255,255,.1)';d.style.boxShadow=g[i]?'0 0 16px rgba(255,217,61,.8)':'none'})}
function bsT(){$('bs').textContent=bestL?'BEST '+bestL:'BEST --'}
function reset(){g=Array(25).fill(false);for(let k=0;k<12;k++)tog(Math.random()*25|0);if(!g.some(v=>v))tog(12);mv=0;done=0;$('sc').textContent=0;bsT();msg('Turn all the lights off');paint()}
function tap(i){
if(done)return;
tog(i);mv++;$('sc').textContent=mv;paint();
if(!g.some(v=>v)){done=1;msg('Solved in '+mv+' moves!');if(!bestL||mv<bestL){bestL=mv;try{localStorage.setItem('rdw_lights',mv)}catch(e){}}bsT()}}
$('nw').onclick=reset;
reset();`);

// ============================================
// GAME 17 - REFLEX TEST (tap when it turns green)
// ============================================
const REFLEX_HTML = simpleGame('Reflex Test', 'rdw_reflex',
`<div id="pad" style="height:210px;border-radius:14px;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:22px;font-weight:bold;text-align:center;cursor:pointer"></div>`,
`const pad=$('pad');
let st=0,t0=0,tm=0,tries=[],bestMs=0;
try{bestMs=+localStorage.getItem('rdw_reflex')||0}catch(e){}
function bsT(){$('bs').textContent=bestMs?'BEST '+bestMs+' ms':'BEST --'}
function paint(c,h,s){pad.style.background=c;pad.innerHTML=h+(s?'<div style="font-size:12px;font-weight:normal;margin-top:8px;opacity:.85">'+s+'</div>':'')}
function wait(){st=1;paint('#c0392b','Wait for green...');tm=setTimeout(()=>{st=2;t0=performance.now();paint('#27ae60','TAP NOW!')},1200+Math.random()*2800)}
pad.onpointerdown=e=>{
e.preventDefault();
if(st==0||st==3){wait();return}
if(st==1){clearTimeout(tm);st=3;paint('#e67e22','Too soon!','Tap to try again');return}
const ms=Math.round(performance.now()-t0);
st=3;tries.push(ms);$('sc').textContent=ms+' ms';
if(!bestMs||ms<bestMs){bestMs=ms;try{localStorage.setItem('rdw_reflex',ms)}catch(e){}}
bsT();
const last=tries.slice(-5),avg=Math.round(last.reduce((a,b)=>a+b,0)/last.length);
paint('#2980b9',ms+' ms','Average of last '+last.length+': '+avg+' ms - tap to go again')};
$('sc').textContent='-- ms';bsT();paint('#34495e','Tap to start','Tap as soon as the box turns green');`);

// ============================================
// REGISTRY + PACKS
// ============================================
const GAMES = {
    dino: { tab: 'Dino Runner', name: 'Dino Runner', html: DINO_HTML },
    ttt: { tab: 'Tic Tac Toe', name: 'Tic Tac Toe vs AI', html: TICTACTOE_HTML },
    doom: { tab: 'Doom', name: 'Mini Doom', html: DOOM_HTML },
    snake: { tab: 'Snake', name: 'Snake', html: SNAKE_HTML },
    g2048: { tab: '2048', name: '2048', html: G2048_HTML },
    flappy: { tab: 'Flappy', name: 'Flappy Bird', html: FLAPPY_HTML },
    breakout: { tab: 'Breakout', name: 'Breakout', html: BREAKOUT_HTML },
    pong: { tab: 'Pong', name: 'Pong', html: PONG_HTML },
    shooter: { tab: 'Shooter', name: 'Space Shooter', html: SHOOTER_HTML },
    stack: { tab: 'Stack', name: 'Stack', html: STACK_HTML },
    whack: { tab: 'Whack', name: 'Whack-a-Mole', html: WHACK_HTML },
    memory: { tab: 'Memory', name: 'Memory Match', html: MEMORY_HTML },
    mines: { tab: 'Mines', name: 'Minesweeper', html: MINES_HTML },
    connect4: { tab: 'Connect 4', name: 'Connect 4', html: CONNECT4_HTML },
    simon: { tab: 'Simon', name: 'Simon Says', html: SIMON_HTML },
    lights: { tab: 'Lights Out', name: 'Lights Out', html: LIGHTS_HTML },
    reflex: { tab: 'Reflex', name: 'Reflex Test', html: REFLEX_HTML }
};

const PACKS = {
    classic: { title: 'Classic', games: ['dino', 'snake', 'ttt', 'doom', 'g2048'] },
    action: { title: 'Action', games: ['flappy', 'breakout', 'pong', 'shooter', 'stack', 'whack'] },
    puzzle: { title: 'Puzzle', games: ['memory', 'mines', 'connect4', 'simon', 'lights', 'reflex'] }
};
PACKS.all = {
    title: 'All games',
    games: [].concat(PACKS.classic.games, PACKS.action.games, PACKS.puzzle.games)
};

const ALIASES = {
    '': 'all', main: 'all', classics: 'classic', default: 'all', home: 'all',
    actions: 'action', fast: 'action',
    puzzles: 'puzzle', brain: 'puzzle', logic: 'puzzle',
    everything: 'all', full: 'all', max: 'all'
};

// ============================================
// MESSAGE BUILDING
// ============================================
function buildEmbeddedScreens(ids) {
    return [
        {
            title: 'Preview',
            content: [
                {
                    __typename: 'FOAIDNixelButtonSheets',
                    tabs: ids.map((id, i) => ({
                        id: 'tab_' + i,
                        tab_header: GAMES[id].tab,
                        sections: [
                            {
                                __typename: 'GenAIUnifiedResponseSection',
                                view_model: {
                                    __typename: 'GenAISingleLayoutViewModel',
                                    primitive: {
                                        __typename: 'GenAIaeacdsnwHtmlPrimitive',
                                        payload: GAMES[id].html,
                                        url: SOURCE_URL,
                                        trusted_sources: TRUSTED_SOURCES
                                    }
                                }
                            }
                        ],
                        step_entries: []
                    }))
                }
            ]
        }
    ];
}

// Adds the tabbed game screens to the rich response that AIRich built.
function attachScreens(msg, ids) {
    const unified = msg?.message?.botForwardedMessage?.message?.richResponseMessage?.unifiedResponse;
    if (!unified || !unified.data) throw new Error('arcade: rich response has no unified data');

    const raw = typeof unified.data === 'string'
        ? Buffer.from(unified.data, 'base64')
        : Buffer.from(unified.data);
    const json = JSON.parse(raw.toString('utf8'));

    json.embedded_screens = buildEmbeddedScreens(ids);
    unified.data = Buffer.from(Toolkit.stringifyEscaped(json));
    return msg;
}

const GAME_ALIASES = {
    tictactoe: 'ttt', xo: 'ttt', '2048': 'g2048', dinorunner: 'dino', flappybird: 'flappy',
    spaceshooter: 'shooter', whackamole: 'whack', minesweeper: 'mines', connect: 'connect4',
    'connect-4': 'connect4', lightsout: 'lights', reflextest: 'reflex', simonsays: 'simon', memorymatch: 'memory'
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const resolveGame = (a) => (has(GAMES, a) ? a : (has(GAME_ALIASES, a) && has(GAMES, GAME_ALIASES[a]) ? GAME_ALIASES[a] : null));
const gameWord = (id) => (id === 'g2048' ? '2048' : id);

function listText(prefix) {
    const line = (key) => PACKS[key].games.map((id) => '`' + prefix + 'arcade ' + gameWord(id) + '`').join('  ');
    return [
        '🎮 *' + BRAND.toUpperCase() + ' ARCADE* - ' + PACKS.all.games.length + ' games',
        '',
        '*Classic*', line('classic'), '',
        '*Action*', line('action'), '',
        '*Puzzle*', line('puzzle'), '',
        '_Send *' + prefix + 'arcade* for a menu with a button for every game._'
    ].join('\n');
}

// A game opens directly inside the chat (no "See details" button)
async function sendGame(sock, from, mek, id) {
    return sendHtmlGame(sock, from, mek, { title: GAMES[id].name, html: GAMES[id].html });
}

// Menu message: text + one tappable button per game; tapping a button sends ".arcade <game>"
async function sendMenu(sock, from, mek, key, prefix) {
    const pack = PACKS[key];
    const others = ['classic', 'action', 'puzzle', 'all'].filter((k) => k !== key);
    const rich = new AIRich(sock)
        .setTitle(BRAND + ' Arcade')
        .addText(
            '> 🎮 *' + BRAND + ' Arcade - ' + pack.title + '* (' + pack.games.length + ' games)\n' +
            '> Tap a game below to play it right here\n' +
            '> Other lists: ' + others.map((k) => prefix + 'arcade ' + k).join('  •  ')
        );
    rich.addSuggest(pack.games.map((id) => prefix + 'arcade ' + gameWord(id)));

    const msg = await rich.build(from, { quoted: mek });
    await sock.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id });
    await rich.sendEdit(from, msg.key.id, { msg: msg.message });
    return msg;
}

// Old style: every game of a pack as a tab inside one "See details" sheet
async function sendTabs(sock, from, mek, key, prefix) {
    const pack = PACKS[key];
    const names = pack.games.map((id) => GAMES[id].name).join(' • ');
    const rich = new AIRich(sock)
        .setTitle(BRAND + ' Arcade')
        .addText('> 🎮 *' + BRAND + ' Arcade - ' + pack.title + '* (' + pack.games.length + ' games) - tap See details, then a tab\n> ' + names);
    const msg = attachScreens(await rich.build(from, { quoted: mek }), pack.games);
    await sock.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id });
    await rich.sendEdit(from, msg.key.id, { msg: msg.message });
    return msg;
}

// ============================================
// COMMAND
// ============================================
gmd({
    pattern: 'arcade',
    aliases: ['minigames', 'gamehub'],
    category: 'game',
    react: '🎮',
    description: '🎮 ' + BRAND + ' Arcade - 17 mini games (Dino, Snake, 2048, Doom, Flappy, Connect 4 and more)'
}, async (from, sock, conText) => {
    const { mek, q, reply, botPrefix } = conText;
    const prefix = botPrefix || '.';
    const words = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    let tabs = false;
    if (words[0] === 'tabs') { tabs = true; words.shift(); }
    const arg = words[0] || '';

    if (['list', 'help', 'menu', 'games'].includes(arg)) return reply(listText(prefix));

    const gameId = tabs ? null : resolveGame(arg);
    const key = has(PACKS, arg) ? arg : (has(ALIASES, arg) ? ALIASES[arg] : null);
    if (!gameId && !key) {
        return reply('❓ Unknown game "' + arg.slice(0, 20) + '".\n\n' + listText(prefix));
    }

    if (!richSupported()) {
        return reply('🎮 *' + BRAND + ' Arcade* needs a WhatsApp library build that supports rich messages (AIRich). Please update Baileys.');
    }

    try {
        if (gameId) await sendGame(sock, from, mek, gameId);
        else if (tabs) await sendTabs(sock, from, mek, key, prefix);
        else await sendMenu(sock, from, mek, key, prefix);
    } catch (error) {
        console.error('[ARCADE] Error:', error?.stack || error);
        await reply('❌ Could not open the arcade right now. Please try again in a moment.');
    }
});
