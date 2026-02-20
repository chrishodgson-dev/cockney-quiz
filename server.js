const http = require("http");
const PORT = 3000;

// --- Questions ---
const questions = [
  { question: "What does 'dog and bone' mean?", options: ["Moan", "Phone", "Alone"], correctIndex: 1, img: "\uD83D\uDC36\uD83E\uDDB4" },
  { question: "What are 'plates of meat'?", options: ["Feet", "Seats", "Sweets"], correctIndex: 0, img: "\uD83C\uDF7D\uFE0F\uD83E\uDD69" },
  { question: "What does 'trouble and strife' refer to?", options: ["Knife", "Life", "Wife"], correctIndex: 2, img: "\uD83D\uDE24\uD83D\uDCA5" },
  { question: "What are 'mince pies'?", options: ["Ties", "Lies", "Eyes"], correctIndex: 2, img: "\uD83E\uDD69\uD83E\uDD67" },
  { question: "Where do you go up the 'apples and pears'?", options: ["Stairs", "Fairs", "Prayers"], correctIndex: 0, img: "\uD83C\uDF4E\uD83C\uDF50" },
  { question: "What is a 'porky pie'?", options: ["A lie", "A tie", "A cry"], correctIndex: 0, img: "\uD83D\uDC37\uD83E\uDD67" },
  { question: "What does 'Adam and Eve' mean?", options: ["Leave", "Grieve", "Believe"], correctIndex: 2, img: "\uD83D\uDC68\uD83D\uDC69" },
  { question: "What are 'bees and honey'?", options: ["Tummy", "Money", "Honey"], correctIndex: 1, img: "\uD83D\uDC1D\uD83C\uDF6F" },
  { question: "What does 'butcher's hook' mean?", options: ["A cook", "A look", "A book"], correctIndex: 1, img: "\uD83E\uDD69\uD83E\uDE9D" },
  { question: "What is someone who's 'Brahms and Liszt'?", options: ["Missed", "Kissed", "Drunk"], correctIndex: 2, img: "\uD83C\uDFB9\uD83C\uDFB6" },
];

// --- Game State ---
const state = {
  phase: "lobby",       // lobby | question | reveal | finished
  currentQuestion: -1,
  timer: 0,
  players: new Map(),   // id -> { id, name, answers: {} }
};
let timerInterval = null;
const sseClients = [];

// --- Helpers ---
function calcScore(player) {
  return Object.entries(player.answers).reduce(
    (s, [qi, ai]) => s + (ai === questions[+qi].correctIndex ? 1 : 0), 0
  );
}

function getPublicState() {
  const q = state.currentQuestion >= 0 ? questions[state.currentQuestion] : null;
  const players = [...state.players.values()].map(p => ({
    id: p.id, name: p.name, score: calcScore(p),
    answered: state.phase === "question" ? p.answers[state.currentQuestion] !== undefined : false,
  }));

  const out = {
    phase: state.phase,
    currentQuestion: state.currentQuestion,
    timer: state.timer,
    totalQuestions: questions.length,
    question: q ? { text: q.question, options: q.options, img: q.img } : null,
    players,
  };

  if (state.phase === "reveal" && q) {
    out.reveal = {
      correctIndex: q.correctIndex,
      playerResults: [...state.players.values()].map(p => ({
        id: p.id, name: p.name,
        answerIndex: p.answers[state.currentQuestion] ?? -1,
        correct: p.answers[state.currentQuestion] === q.correctIndex,
      })),
    };
  }

  if (state.phase === "finished") {
    out.scores = [...state.players.values()]
      .map(p => ({ name: p.name, score: calcScore(p) }))
      .sort((a, b) => b.score - a.score);
  }

  return out;
}

function broadcast() {
  const data = JSON.stringify(getPublicState());
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

// --- Game Logic ---
function startGame() {
  state.phase = "question";
  state.currentQuestion = 0;
  state.players.forEach(p => (p.answers = {}));
  startTimer();
  broadcast();
}

function startTimer() {
  state.timer = 8;
  clearInterval(timerInterval);
  broadcast();
  timerInterval = setInterval(() => {
    state.timer--;
    if (state.timer <= 0) {
      clearInterval(timerInterval);
      state.phase = "reveal";
    }
    broadcast();
  }, 1000);
}

function nextQuestion() {
  state.currentQuestion++;
  if (state.currentQuestion >= questions.length) {
    state.phase = "finished";
    broadcast();
  } else {
    state.phase = "question";
    startTimer();
    broadcast();
  }
}

function restart() {
  state.phase = "lobby";
  state.currentQuestion = -1;
  state.timer = 0;
  state.players.forEach(p => (p.answers = {}));
  clearInterval(timerInterval);
  broadcast();
}

// --- HTTP ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error("Bad JSON")); }
    });
  });
}

function json(res, obj, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // --- SSE ---
  if (url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.push(res);
    res.write(`data: ${JSON.stringify(getPublicState())}\n\n`);
    req.on("close", () => {
      const i = sseClients.indexOf(res);
      if (i >= 0) sseClients.splice(i, 1);
    });
    return;
  }

  // --- POST endpoints ---
  if (req.method === "POST") {
    let data;
    try { data = await readBody(req); }
    catch { res.writeHead(400); res.end("Bad JSON"); return; }

    if (url.pathname === "/join") {
      const id = Math.random().toString(36).slice(2, 10);
      state.players.set(id, { id, name: (data.name || "Anon").slice(0, 20), answers: {} });
      broadcast();
      return json(res, { id });
    }
    if (url.pathname === "/answer") {
      const player = state.players.get(data.playerId);
      if (player && state.phase === "question" && player.answers[state.currentQuestion] === undefined) {
        player.answers[state.currentQuestion] = data.answerIndex;
        broadcast();
      }
      return json(res, { ok: true });
    }
    if (url.pathname === "/host/start" && state.phase === "lobby" && state.players.size > 0) {
      startGame(); return json(res, { ok: true });
    }
    if (url.pathname === "/host/next" && state.phase === "reveal") {
      nextQuestion(); return json(res, { ok: true });
    }
    if (url.pathname === "/host/restart") {
      restart(); return json(res, { ok: true });
    }
    res.writeHead(404); res.end("Not found"); return;
  }

  // --- Serve HTML ---
  if (url.pathname === "/" || url.pathname === "/host") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
    return;
  }

  res.writeHead(404); res.end("Not found");
});

// --- Embedded HTML ---
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cockney Rhyming Slang Quiz</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  background:linear-gradient(135deg,#1e1b4b 0%,#312e81 40%,#1e3a5f 100%);
  display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#fffbf5;border-radius:16px;padding:42px 40px;
  box-shadow:0 8px 40px rgba(0,0,0,.35);max-width:580px;width:92%;
  border-top:4px solid #f59e0b;animation:cardIn .45s ease both}
@keyframes cardIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
h1{font-size:1.55rem;margin-bottom:6px;color:#1e1b4b}
.sub{color:#6b7280;margin-bottom:22px;font-size:.93rem}
.center{text-align:center}
.btn{padding:12px 28px;border:none;border-radius:10px;font-size:.95rem;
  font-weight:600;cursor:pointer;background:#4f46e5;color:#fff;transition:background .2s}
.btn:hover{background:#4338ca}
.btn:focus-visible{outline:3px solid #818cf8;outline-offset:2px}
.btn:disabled{opacity:.35;cursor:default}
.btn-amber{background:#d97706}.btn-amber:hover{background:#b45309}
input[type=text]{padding:12px 16px;border:2px solid #e0e0e0;border-radius:10px;
  font-size:1rem;width:100%;max-width:280px;margin-bottom:16px;text-align:center}
input:focus{border-color:#818cf8;outline:none}

/* Timer */
.timer-ring{width:90px;height:90px;margin:0 auto 14px}
.timer-ring circle{fill:none;stroke-width:6;stroke-linecap:round}
.timer-ring .bg{stroke:#e5e7eb}
.timer-ring .fg{stroke:#6366f1;transition:stroke-dashoffset .9s linear;transform:rotate(-90deg);transform-origin:50% 50%}
.timer-num{font-size:2rem;font-weight:800;fill:#1e1b4b}
.timer-ring.warn .fg{stroke:#dc2626}
.timer-ring.warn .timer-num{fill:#dc2626}

/* Progress */
.prog-bar{height:5px;border-radius:3px;background:#e5e7eb;margin-bottom:16px;overflow:hidden}
.prog-fill{height:100%;background:linear-gradient(90deg,#6366f1,#a855f7);border-radius:3px;transition:width .4s}

/* Question */
.q-img{font-size:3rem;text-align:center;margin-bottom:10px;line-height:1.2}
.q-text{font-size:1.3rem;font-weight:600;margin-bottom:20px;line-height:1.5;color:#1e1b4b}

/* Options */
.opts{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
.opt{padding:13px 18px;border:2px solid #e0e0e0;border-radius:10px;background:#fff;
  font-size:.95rem;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;
  opacity:0;animation:optIn .35s ease both}
.opt:nth-child(1){animation-delay:.08s}.opt:nth-child(2){animation-delay:.16s}.opt:nth-child(3){animation-delay:.24s}
@keyframes optIn{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}
.lbl{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
  border-radius:6px;background:#eef2ff;color:#4f46e5;font-weight:700;font-size:.85rem;flex-shrink:0}
.opt:hover,.opt:focus-visible{border-color:#818cf8;outline:none}
.opt.picked{border-color:#4f46e5;background:#eef2ff;font-weight:600}
.opt.picked .lbl{background:#4f46e5;color:#fff}
.opt.correct{border-color:#16a34a;background:#dcfce7;animation:bounce .4s ease}
.opt.correct .lbl{background:#16a34a;color:#fff}
.opt.wrong{border-color:#dc2626;background:#fee2e2;animation:shake .4s ease}
.opt.wrong .lbl{background:#dc2626;color:#fff}
.opt:disabled{cursor:default}
@keyframes bounce{0%{transform:scale(1)}40%{transform:scale(1.04)}70%{transform:scale(.98)}100%{transform:scale(1)}}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}

/* Player list */
.plist{list-style:none;margin:12px 0 20px;max-height:220px;overflow-y:auto}
.plist li{padding:8px 14px;border-radius:8px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;font-size:.95rem}
.plist li:nth-child(odd){background:#f5f3ff}
.plist li:nth-child(even){background:#fefce8}
.plist .check{color:#16a34a;font-weight:700}.plist .cross{color:#dc2626;font-weight:700}
.plist .wait{color:#9ca3af}

/* Scoreboard */
.sb{list-style:none;margin:16px 0}
.sb li{padding:10px 16px;border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;font-weight:600}
.sb li:first-child{background:#fef3c7;font-size:1.1rem}
.sb li:nth-child(2){background:#f5f3ff}
.sb li:nth-child(n+3){background:#f9fafb}

/* Answered count */
.ans-count{font-size:1rem;color:#6b7280;margin-bottom:10px}
.ans-count b{color:#4f46e5}

/* Confetti */
.confetti-wrap{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:hidden}
.confetti-p{position:absolute;width:10px;height:10px;top:-20px;animation:cfall 2.8s ease-in forwards}
@keyframes cfall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(720deg);opacity:0}}
</style>
</head>
<body>
<div class="card" id="app" role="main"></div>
<script>
const LABELS=["A","B","C"];
const isHost=location.pathname==="/host";
let playerId=sessionStorage.getItem("qpid");
let gs=null; // game state from server
let rendered={phase:null,q:-1,answered:false}; // track what's on screen to avoid full redraws
const app=document.getElementById("app");

// --- SSE ---
function connect(){
  const es=new EventSource("/events");
  es.onmessage=e=>{gs=JSON.parse(e.data);render()};
  es.onerror=()=>setTimeout(()=>{es.close();connect()},2000);
}

// --- API helpers ---
function post(url,body){return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})}

// --- Timer-only update (no DOM rebuild) ---
function updateTimerOnly(){
  const circ=2*Math.PI*38;
  const off=circ-(gs.timer/8)*circ;
  const warn=gs.timer<=3;
  const ring=app.querySelector(".timer-ring");
  const fg=app.querySelector(".timer-ring .fg");
  const num=app.querySelector(".timer-num");
  const cnt=app.querySelector(".ans-count");
  if(!ring||!fg||!num) return false;
  if(warn) ring.classList.add("warn"); else ring.classList.remove("warn");
  fg.setAttribute("stroke-dashoffset",off);
  num.textContent=gs.timer;
  if(cnt){const answered=gs.players.filter(p=>p.answered).length;cnt.innerHTML='<b>'+answered+'</b> / '+gs.players.length+' answered';}
  return true;
}

// --- In-place reveal (patch existing DOM instead of rebuilding) ---
function revealInPlace(){
  const r=gs.reveal;if(!r)return false;
  // Hide timer
  const ring=app.querySelector(".timer-ring");if(ring)ring.style.display="none";
  // Highlight correct option green
  const opts=app.querySelectorAll(".opt");
  opts.forEach((el,i)=>{
    el.style.animation="none";el.style.opacity="1";
    if(i===r.correctIndex)el.classList.add("correct");
  });
  // For player: mark their wrong answer red + show feedback
  if(!isHost&&r.playerResults){
    const me=r.playerResults.find(p=>p.id===playerId);
    if(me){
      if(me.answerIndex>=0&&!me.correct) opts[me.answerIndex].classList.add("wrong");
      const msg=me.answerIndex===-1?"Time\\'s up!":me.correct?"Lovely jubbly!":"Cor blimey, no!";
      const cls=me.answerIndex===-1?"color:#9ca3af":me.correct?"color:#16a34a":"color:#dc2626";
      const fb=document.createElement("div");fb.className="center";
      fb.style.cssText=cls+";font-weight:700;font-size:1.1rem;padding:10px 0";fb.textContent=msg.replace("\\\\'","'");
      app.appendChild(fb);
    }
  }
  // For host: append player results + next button
  if(isHost){
    const results=r.playerResults.map(p=>{
      const cls=p.answerIndex===-1?"wait":p.correct?"check":"cross";
      const icon=p.answerIndex===-1?"--":p.correct?"\u2713":"\u2717";
      return '<li>'+esc(p.name)+' <span class="'+cls+'">'+icon+'</span></li>';
    }).join("");
    // Remove the answered count
    const cnt=app.querySelector(".ans-count");if(cnt)cnt.parentElement.remove();
    // Append results and next button
    const extra=document.createElement("div");
    extra.innerHTML='<h2 style="margin:14px 0 6px;font-size:1rem;color:#1e1b4b">Results</h2>'+
      '<ul class="plist">'+results+'</ul>'+
      '<div class="center"><button class="btn btn-amber" id="nextBtn">'+
      (gs.currentQuestion>=gs.totalQuestions-1?'See Final Scores':'Next Question')+'</button></div>';
    app.appendChild(extra);
    document.getElementById("nextBtn").onclick=()=>post("/host/next",{});
  }
  return true;
}

// --- Render router ---
function render(){
  if(!gs)return;
  const me=!isHost&&playerId?gs.players.find(p=>p.id===playerId):null;
  const playerAnswered=me?me.answered:false;
  // Timer tick during question: just update timer, don't rebuild
  if(gs.phase==="question"&&rendered.phase==="question"&&rendered.q===gs.currentQuestion&&rendered.answered===playerAnswered){
    updateTimerOnly();return;
  }
  // Transition from question to reveal: patch in-place
  if(gs.phase==="reveal"&&rendered.phase==="question"&&rendered.q===gs.currentQuestion){
    revealInPlace();rendered={phase:"reveal",q:gs.currentQuestion,answered:playerAnswered};return;
  }
  // Stay on reveal: do nothing (host clicks Next to advance)
  if(gs.phase==="reveal"&&rendered.phase==="reveal"&&rendered.q===gs.currentQuestion) return;
  // Otherwise full render
  if(isHost) renderHost(); else renderPlayer();
  rendered={phase:gs.phase,q:gs.currentQuestion,answered:playerAnswered};
}

// =================== HOST VIEWS ===================
function renderHost(){
  if(gs.phase==="lobby") return hostLobby();
  if(gs.phase==="question") return hostQuestion();
  if(gs.phase==="reveal") return hostReveal();
  if(gs.phase==="finished") return hostFinished();
}

function hostLobby(){
  const phtml=gs.players.length?gs.players.map(p=>'<li>'+esc(p.name)+'</li>').join("")
    :'<li style="color:#9ca3af">Waiting for players to join...</li>';
  app.innerHTML=
    '<div class="center"><h1>Cockney Rhyming Slang Quiz</h1>'+
    '<p class="sub">Share the player link and wait for everyone to join</p></div>'+
    '<ul class="plist">'+phtml+'</ul>'+
    '<div class="center"><span class="ans-count"><b>'+gs.players.length+'</b> player'+(gs.players.length!==1?'s':'')+ ' connected</span></div>'+
    '<div class="center" style="margin-top:10px"><button class="btn" id="startBtn"'+(gs.players.length===0?' disabled':'')+'>Start Quiz</button></div>';
  document.getElementById("startBtn").onclick=()=>post("/host/start",{});
}

function hostQuestion(){
  const q=gs.question;
  const answered=gs.players.filter(p=>p.answered).length;
  const circ=2*Math.PI*38;
  const off=circ-(gs.timer/8)*circ;
  const warn=gs.timer<=3?' warn':'';
  app.innerHTML=
    '<div class="center"><span style="font-size:.8rem;color:#9ca3af">Question '+(gs.currentQuestion+1)+' of '+gs.totalQuestions+'</span></div>'+
    '<div class="prog-bar"><div class="prog-fill" style="width:'+(gs.currentQuestion/gs.totalQuestions*100)+'%"></div></div>'+
    '<div class="center"><div class="timer-ring'+warn+'">'+
      '<svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="38"/>'+
      '<circle class="fg" cx="42" cy="42" r="38" stroke-dasharray="'+circ+'" stroke-dashoffset="'+off+'"/>'+
      '<text class="timer-num" x="42" y="48" text-anchor="middle">'+gs.timer+'</text></svg></div></div>'+
    '<div class="q-img">'+q.img+'</div>'+
    '<div class="q-text">'+esc(q.text)+'</div>'+
    '<div class="opts">'+q.options.map((o,i)=>
      '<div class="opt"><span class="lbl">'+LABELS[i]+'</span>'+esc(o)+'</div>').join("")+'</div>'+
    '<div class="center"><span class="ans-count"><b>'+answered+'</b> / '+gs.players.length+' answered</span></div>';
}

function hostReveal(){
  const q=gs.question;const r=gs.reveal;
  const results=r.playerResults.map(p=>{
    const cls=p.answerIndex===-1?'wait':p.correct?'check':'cross';
    const icon=p.answerIndex===-1?'--':p.correct?'\u2713':'\u2717';
    return '<li>'+esc(p.name)+' <span class="'+cls+'">'+icon+'</span></li>';
  }).join("");
  app.innerHTML=
    '<div class="center"><span style="font-size:.8rem;color:#9ca3af">Question '+(gs.currentQuestion+1)+' of '+gs.totalQuestions+'</span></div>'+
    '<div class="prog-bar"><div class="prog-fill" style="width:'+((gs.currentQuestion+1)/gs.totalQuestions*100)+'%"></div></div>'+
    '<div class="q-img">'+q.img+'</div>'+
    '<div class="q-text">'+esc(q.text)+'</div>'+
    '<div class="opts">'+q.options.map((o,i)=>{
      const cls=i===r.correctIndex?' correct':'';
      return '<div class="opt'+cls+'"><span class="lbl">'+LABELS[i]+'</span>'+esc(o)+'</div>';
    }).join("")+'</div>'+
    '<h2 style="margin:14px 0 6px;font-size:1rem;color:#1e1b4b">Results</h2>'+
    '<ul class="plist">'+results+'</ul>'+
    '<div class="center"><button class="btn btn-amber" id="nextBtn">'+
    (gs.currentQuestion>=gs.totalQuestions-1?'See Final Scores':'Next Question')+
    '</button></div>';
  document.getElementById("nextBtn").onclick=()=>post("/host/next",{});
}

function hostFinished(){
  const s=gs.scores;
  const topScore=s.length?s[0].score:0;
  const medal=["\u{1F947}","\u{1F948}","\u{1F949}"];
  app.innerHTML=
    '<div class="center"><h1>Final Scores</h1><p class="sub">Cockney Rhyming Slang Quiz</p></div>'+
    '<ul class="sb">'+s.map((p,i)=>
      '<li>'+(i<3?medal[i]+' ':'')+esc(p.name)+'<span>'+p.score+' / '+gs.totalQuestions+'</span></li>'
    ).join("")+'</ul>'+
    '<div class="center" style="margin-top:16px"><button class="btn" id="restartBtn">Play Again</button></div>';
  document.getElementById("restartBtn").onclick=()=>post("/host/restart",{});
  if(topScore>=7) spawnConfetti();
}

// =================== PLAYER VIEWS ===================
function renderPlayer(){
  if(!playerId) return playerJoin();
  // Make sure this player exists on server
  if(!gs.players.find(p=>p.id===playerId)){playerId=null;sessionStorage.removeItem("qpid");return playerJoin();}
  if(gs.phase==="lobby") return playerLobby();
  if(gs.phase==="question") return playerQuestion();
  if(gs.phase==="reveal") return playerReveal();
  if(gs.phase==="finished") return playerFinished();
}

function playerJoin(){
  app.innerHTML=
    '<div class="center"><h1>Cockney Rhyming Slang Quiz</h1>'+
    '<p class="sub">Enter your name to join</p>'+
    '<input type="text" id="nameIn" placeholder="Your name" maxlength="20" autofocus>'+
    '<br><button class="btn" id="joinBtn">Join Quiz</button></div>';
  const doJoin=()=>{
    const name=document.getElementById("nameIn").value.trim();
    if(!name)return;
    post("/join",{name}).then(r=>r.json()).then(d=>{playerId=d.id;sessionStorage.setItem("qpid",d.id);render()});
  };
  document.getElementById("joinBtn").onclick=doJoin;
  document.getElementById("nameIn").onkeydown=e=>{if(e.key==="Enter")doJoin()};
}

function playerLobby(){
  const me=gs.players.find(p=>p.id===playerId);
  app.innerHTML=
    '<div class="center"><h1>Cockney Rhyming Slang Quiz</h1>'+
    '<p class="sub">You\\'re in, '+esc(me.name)+'!</p>'+
    '<p style="color:#6b7280;font-size:.95rem">'+gs.players.length+' player'+(gs.players.length!==1?'s':'')+' connected<br>Waiting for the host to start...</p></div>';
}

function playerQuestion(){
  const q=gs.question;
  const me=gs.players.find(p=>p.id===playerId);
  const myAnswer=me.answered;
  const circ=2*Math.PI*38;
  const off=circ-(gs.timer/8)*circ;
  const warn=gs.timer<=3?' warn':'';
  app.innerHTML=
    '<div class="center"><span style="font-size:.8rem;color:#9ca3af">Question '+(gs.currentQuestion+1)+' of '+gs.totalQuestions+'</span></div>'+
    '<div class="prog-bar"><div class="prog-fill" style="width:'+(gs.currentQuestion/gs.totalQuestions*100)+'%"></div></div>'+
    '<div class="center"><div class="timer-ring'+warn+'">'+
      '<svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="38"/>'+
      '<circle class="fg" cx="42" cy="42" r="38" stroke-dasharray="'+circ+'" stroke-dashoffset="'+off+'"/>'+
      '<text class="timer-num" x="42" y="48" text-anchor="middle">'+gs.timer+'</text></svg></div></div>'+
    '<div class="q-img">'+q.img+'</div>'+
    '<div class="q-text">'+esc(q.text)+'</div>'+
    '<div class="opts">'+q.options.map((o,i)=>
      '<button class="opt'+(myAnswer?' picked-lock':'')+'" data-i="'+i+'"'+(myAnswer?' disabled':'')+
      '><span class="lbl">'+LABELS[i]+'</span>'+esc(o)+'</button>').join("")+'</div>'+
    (myAnswer?'<div class="center" style="color:#6b7280;font-size:.9rem;padding:4px 0">Answer locked in!</div>':'');
  if(!myAnswer){
    app.querySelectorAll(".opt").forEach(btn=>
      btn.onclick=()=>{post("/answer",{playerId,answerIndex:+btn.dataset.i})}
    );
  }
}

function playerReveal(){
  const q=gs.question;const r=gs.reveal;
  const me=r.playerResults.find(p=>p.id===playerId);
  const msg=me.answerIndex===-1?"Time\\'s up!":me.correct?"Lovely jubbly!":"Cor blimey, no!";
  const cls=me.answerIndex===-1?"color:#9ca3af":me.correct?"color:#16a34a":"color:#dc2626";
  app.innerHTML=
    '<div class="center"><span style="font-size:.8rem;color:#9ca3af">Question '+(gs.currentQuestion+1)+' of '+gs.totalQuestions+'</span></div>'+
    '<div class="q-img">'+q.img+'</div>'+
    '<div class="q-text">'+esc(q.text)+'</div>'+
    '<div class="opts">'+q.options.map((o,i)=>{
      let c=i===r.correctIndex?' correct':'';
      if(me.answerIndex===i&&!me.correct) c=' wrong';
      return '<div class="opt'+c+'"><span class="lbl">'+LABELS[i]+'</span>'+esc(o)+'</div>';
    }).join("")+'</div>'+
    '<div class="center" style="'+cls+';font-weight:700;font-size:1.1rem;padding:10px 0">'+msg+'</div>';
}

function playerFinished(){
  const s=gs.scores;
  const me=gs.players.find(p=>p.id===playerId);
  const medal=["\u{1F947}","\u{1F948}","\u{1F949}"];
  app.innerHTML=
    '<div class="center"><h1>Final Scores</h1></div>'+
    '<ul class="sb">'+s.map((p,i)=>
      '<li>'+(i<3?medal[i]+' ':'')+esc(p.name)+'<span>'+p.score+' / '+gs.totalQuestions+'</span></li>'
    ).join("")+'</ul>'+
    '<div class="center" style="margin-top:10px;color:#6b7280">Your score: '+me.score+' / '+gs.totalQuestions+'</div>';
}

// --- Confetti ---
function spawnConfetti(){
  if(document.querySelector(".confetti-wrap"))return;
  const w=document.createElement("div");w.className="confetti-wrap";document.body.appendChild(w);
  const cols=["#f59e0b","#6366f1","#ec4899","#10b981","#f43f5e","#a855f7"];
  for(let i=0;i<24;i++){const p=document.createElement("div");p.className="confetti-p";
    p.style.left=Math.random()*100+"%";p.style.background=cols[i%cols.length];
    p.style.borderRadius=Math.random()>.5?"50%":"2px";
    p.style.width=(6+Math.random()*8)+"px";p.style.height=(6+Math.random()*8)+"px";
    p.style.animationDelay=Math.random()*1.2+"s";p.style.animationDuration=2+Math.random()*1.5+"s";
    w.appendChild(p);}
  setTimeout(()=>w.remove(),4500);
}

function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML;}

connect();
</script>
</body>
</html>`;

server.listen(PORT, () => {
  console.log(`\n  Cockney Quiz Server running!\n`);
  console.log(`  Host view:   http://localhost:${PORT}/host`);
  console.log(`  Player join: http://localhost:${PORT}/\n`);
});

