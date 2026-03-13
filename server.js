const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 3000;

// --- Question Pool ---
const QUESTIONS_PER_ROUND = 10;
const allQuestions = [
  { question: "What does 'dog and bone' mean?", options: ["Moan", "Phone", "Alone"], correctIndex: 1, img: "" },
  { question: "What are 'plates of meat'?", options: ["Feet", "Seats", "Sweets"], correctIndex: 0, img: "" },
  { question: "What does 'trouble and strife' refer to?", options: ["Knife", "Life", "Wife"], correctIndex: 2, img: "" },
  { question: "What are 'mince pies'?", options: ["Ties", "Lies", "Eyes"], correctIndex: 2, img: "" },
  { question: "Where do you go up the 'apples and pears'?", options: ["Stairs", "Fairs", "Prayers"], correctIndex: 0, img: "" },
  { question: "What is a 'porky pie'?", options: ["A lie", "A tie", "A cry"], correctIndex: 0, img: "" },
  { question: "What does 'Adam and Eve' mean?", options: ["Leave", "Grieve", "Believe"], correctIndex: 2, img: "" },
  { question: "What are 'bees and honey'?", options: ["Tummy", "Money", "Honey"], correctIndex: 1, img: "" },
  { question: "What does 'butcher's hook' mean?", options: ["A cook", "A look", "A book"], correctIndex: 1, img: "" },
  { question: "What is someone who's 'Brahms and Liszt'?", options: ["Missed", "Kissed", "Drunk"], correctIndex: 2, img: "" },
  { question: "What does 'Ruby Murray' mean?", options: ["Curry", "Hurry", "Worry"], correctIndex: 0, img: "" },
  { question: "What is your 'boat race'?", options: ["Place", "Face", "Grace"], correctIndex: 1, img: "" },
  { question: "What does 'Tom and Dick' mean?", options: ["Quick", "Sick", "Thick"], correctIndex: 1, img: "" },
  { question: "What is a 'sherbet dab'?", options: ["A cab", "A grab", "A jab"], correctIndex: 0, img: "" },
  { question: "What does 'Rosy Lee' mean?", options: ["Tea", "Sea", "Free"], correctIndex: 0, img: "" },
  { question: "What are 'Hampton Wick'?", options: ["Trick", "Brick", "Nick"], correctIndex: 2, img: "" },
  { question: "What does 'bacon and eggs' mean?", options: ["Legs", "Pegs", "Kegs"], correctIndex: 0, img: "" },
  { question: "What is 'Barnet Fair'?", options: ["Stare", "Hair", "Chair"], correctIndex: 1, img: "" },
  { question: "What does 'brown bread' mean?", options: ["Dead", "Head", "Bed"], correctIndex: 0, img: "" },
  { question: "What does 'China plate' mean?", options: ["Late", "Mate", "Gate"], correctIndex: 1, img: "" },
  { question: "What is a 'dustbin lid'?", options: ["A kid", "A squid", "A bid"], correctIndex: 0, img: "" },
  { question: "What does 'elephant's trunk' mean?", options: ["Bunk", "Drunk", "Junk"], correctIndex: 1, img: "" },
  { question: "What are 'German bands'?", options: ["Hands", "Bands", "Sands"], correctIndex: 0, img: "" },
  { question: "What does 'Hank Marvin' mean?", options: ["Carving", "Starving", "Parking"], correctIndex: 1, img: "" },
  { question: "What is the 'jam jar'?", options: ["A car", "A bar", "A star"], correctIndex: 0, img: "" },
  { question: "What does 'plates of ham' mean?", options: ["Clam", "Jam", "Gam"], correctIndex: 2, img: "" },
  { question: "What does 'Pete Tong' mean?", options: ["Wrong", "Song", "Long"], correctIndex: 0, img: "" },
  { question: "What is 'north and south'?", options: ["Mouth", "Couch", "House"], correctIndex: 0, img: "" },
  { question: "What does 'plates and dishes' mean?", options: ["Wishes", "Missus", "Fishes"], correctIndex: 1, img: "" },
  { question: "What does 'Scooby Doo' mean?", options: ["Shoe", "Clue", "Blue"], correctIndex: 1, img: "" },
  { question: "What are 'mincers'? (mince pies)", options: ["Spies", "Eyes", "Ties"], correctIndex: 1, img: "" },
  { question: "What does 'Tommy Tucker' mean?", options: ["Supper", "Nutter", "Sucker"], correctIndex: 0, img: "" },
  { question: "What is 'brass tacks'?", options: ["Facts", "Tracks", "Snacks"], correctIndex: 0, img: "" },
  { question: "What does 'pork pies' mean?", options: ["Cries", "Lies", "Ties"], correctIndex: 1, img: "" },
  { question: "What is a 'tea leaf'?", options: ["Chief", "Thief", "Grief"], correctIndex: 1, img: "" },
  { question: "What does 'whistle and flute' mean?", options: ["Suit", "Hoot", "Root"], correctIndex: 0, img: "" },
  { question: "What does 'dickie bird' mean?", options: ["Word", "Third", "Nerd"], correctIndex: 0, img: "" },
  { question: "What are 'Hampsteads'? (Hampstead Heath)", options: ["Teeth", "Wreath", "Heath"], correctIndex: 0, img: "" },
  { question: "What does 'Joanna' mean?", options: ["Banana", "Piano", "Nana"], correctIndex: 1, img: "" },
  { question: "What does 'Tod Sloan' mean?", options: ["Moan", "Own (alone)", "Phone"], correctIndex: 1, img: "" },
];
let questions = [];

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
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function startGame() {
  const shuffled = [...allQuestions];
  shuffle(shuffled);
  questions = shuffled.slice(0, QUESTIONS_PER_ROUND);
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

  // --- Poll fallback for when SSE is buffered by tunnel/proxy ---
  if (url.pathname === "/state") {
    return json(res, getPublicState());
  }

  // --- SSE ---
  if (url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    // Padding to push past proxy buffers
    res.write(`:${" ".repeat(2048)}\n\n`);
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

  // --- Serve static images ---
  const ext = path.extname(url.pathname).toLowerCase();
  const mimeTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  if (mimeTypes[ext]) {
    const filePath = path.join(process.cwd(), url.pathname);
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mimeTypes[ext], "Cache-Control": "public, max-age=3600" });
      res.end(data);
      return;
    } catch {}
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
  background:linear-gradient(135deg,rgba(30,27,75,.85) 0%,rgba(49,46,129,.8) 40%,rgba(30,58,95,.85) 100%),url("/bg.jpg") center/cover no-repeat fixed;
  background-color:#1e1b4b;
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
.timer-num{font-size:2rem;font-weight:800;fill:#1e1b4b;dominant-baseline:central}
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

/* Dialogue */
.dialogue{background:#f9fafb;border-radius:12px;padding:20px 22px;margin-top:20px;text-align:left;border-left:4px solid #f59e0b}
.dialogue h3{font-size:.95rem;color:#1e1b4b;margin-bottom:12px}
.dialogue p{font-size:.88rem;line-height:1.6;margin-bottom:8px;color:#374151}
.dialogue .speaker{font-weight:700;color:#4f46e5}
.dialogue .slang{color:#d97706;font-weight:600;font-style:italic}

/* Intro screen */
.intro-img-placeholder{width:100%;height:220px;border-radius:12px;margin-bottom:18px;
  background:#e5e7eb;display:flex;align-items:center;justify-content:center;
  border:2px dashed #9ca3af;color:#6b7280;font-size:.9rem;flex-direction:column;gap:6px}
.intro-img-placeholder svg{width:48px;height:48px;opacity:.4}
.intro-text{text-align:left;margin:16px 0 20px}
.intro-text h2{font-size:1.2rem;color:#1e1b4b;margin-bottom:10px}
.intro-text p{font-size:.9rem;line-height:1.7;color:#374151;margin-bottom:12px}
.intro-text .origin-highlight{background:#fef3c7;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:0 8px 8px 0;margin:14px 0;font-size:.88rem;color:#92400e}

/* Lobby scene */
.lobby-scene{position:relative;overflow:hidden}
.lobby-scene .content{position:relative;z-index:1}
.lobby-img{width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin-bottom:14px}

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
let introSeen=false; // track whether the intro screen has been dismissed
let myPickedAnswer={}; // track which answer the player picked per question index
const app=document.getElementById("app");

// --- Sound Design (Web Audio API) ---
const AudioCtx=window.AudioContext||window.webkitAudioContext;
let audioCtx=null;
function getCtx(){if(!audioCtx){audioCtx=new AudioCtx();if(audioCtx.state==="suspended")audioCtx.resume().catch(()=>{});}return audioCtx;}
function safe(fn){return function(){try{fn.apply(this,arguments)}catch(e){}};}

function playClick(){
  const ctx=getCtx();const t=ctx.currentTime;
  const osc=ctx.createOscillator();const gain=ctx.createGain();
  osc.connect(gain);gain.connect(ctx.destination);
  osc.type="sine";osc.frequency.setValueAtTime(800,t);osc.frequency.exponentialRampToValueAtTime(600,t+0.06);
  gain.gain.setValueAtTime(0.18,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.08);
  osc.start(t);osc.stop(t+0.08);
}

function playAnswer(){
  const ctx=getCtx();const t=ctx.currentTime;
  const osc=ctx.createOscillator();const gain=ctx.createGain();
  osc.connect(gain);gain.connect(ctx.destination);
  osc.type="triangle";osc.frequency.setValueAtTime(500,t);osc.frequency.exponentialRampToValueAtTime(900,t+0.1);
  gain.gain.setValueAtTime(0.2,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.15);
  osc.start(t);osc.stop(t+0.15);
}

function playCorrect(){
  const ctx=getCtx();const t=ctx.currentTime;
  // bright pop
  const pop=ctx.createOscillator();const popG=ctx.createGain();
  pop.connect(popG);popG.connect(ctx.destination);
  pop.type="sine";pop.frequency.setValueAtTime(1200,t);pop.frequency.exponentialRampToValueAtTime(1800,t+0.08);
  popG.gain.setValueAtTime(0.2,t);popG.gain.exponentialRampToValueAtTime(0.001,t+0.12);
  pop.start(t);pop.stop(t+0.12);
  // warm bell ring
  [987,1318].forEach((f,i)=>{
    const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.type="triangle";osc.frequency.value=f;
    gain.gain.setValueAtTime(0,t+0.1+i*0.1);
    gain.gain.linearRampToValueAtTime(0.16,t+0.12+i*0.1);
    gain.gain.exponentialRampToValueAtTime(0.001,t+0.5+i*0.1);
    osc.start(t+0.1+i*0.1);osc.stop(t+0.5+i*0.1);
  });
}

function playWrong(){
  const ctx=getCtx();const t=ctx.currentTime;
  [300,250].forEach((f,i)=>{
    const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.type="square";osc.frequency.value=f;
    gain.gain.setValueAtTime(0.1,t+i*0.15);gain.gain.exponentialRampToValueAtTime(0.001,t+i*0.15+0.2);
    osc.start(t+i*0.15);osc.stop(t+i*0.15+0.2);
  });
}

function playTimesUp(){
  const ctx=getCtx();const t=ctx.currentTime;
  // descending buzzer
  const osc=ctx.createOscillator();const gain=ctx.createGain();
  osc.connect(gain);gain.connect(ctx.destination);
  osc.type="sawtooth";
  osc.frequency.setValueAtTime(600,t);osc.frequency.exponentialRampToValueAtTime(200,t+0.5);
  gain.gain.setValueAtTime(0.15,t);gain.gain.setValueAtTime(0.15,t+0.3);
  gain.gain.exponentialRampToValueAtTime(0.001,t+0.55);
  osc.start(t);osc.stop(t+0.55);
  // second low thud
  const osc2=ctx.createOscillator();const gain2=ctx.createGain();
  osc2.connect(gain2);gain2.connect(ctx.destination);
  osc2.type="sine";osc2.frequency.value=120;
  gain2.gain.setValueAtTime(0.2,t);gain2.gain.exponentialRampToValueAtTime(0.001,t+0.4);
  osc2.start(t);osc2.stop(t+0.4);
}

function playFinished(){
  const ctx=getCtx();const t=ctx.currentTime;
  // celebratory ascending fanfare: C E G C(high)
  [523,659,784,1047].forEach((f,i)=>{
    const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.type="sine";osc.frequency.value=f;
    gain.gain.setValueAtTime(0,t+i*0.15);
    gain.gain.linearRampToValueAtTime(0.18,t+i*0.15+0.03);
    gain.gain.setValueAtTime(0.18,t+i*0.15+0.2);
    gain.gain.exponentialRampToValueAtTime(0.001,t+i*0.15+0.45);
    osc.start(t+i*0.15);osc.stop(t+i*0.15+0.45);
  });
  // final shimmer chord
  [1047,1319,1568].forEach(f=>{
    const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.type="triangle";osc.frequency.value=f;
    gain.gain.setValueAtTime(0,t+0.65);
    gain.gain.linearRampToValueAtTime(0.1,t+0.7);
    gain.gain.exponentialRampToValueAtTime(0.001,t+1.4);
    osc.start(t+0.65);osc.stop(t+1.4);
  });
}

let lastTickTimer=-1;
function playTick(seconds){
  if(seconds===lastTickTimer||seconds<=0||seconds>8) return;
  lastTickTimer=seconds;
  const ctx=getCtx();const t=ctx.currentTime;
  const urgent=seconds<=3;
  const osc=ctx.createOscillator();const gain=ctx.createGain();
  osc.connect(gain);gain.connect(ctx.destination);
  osc.type="sine";
  osc.frequency.value=urgent?880:660;
  gain.gain.setValueAtTime(urgent?0.18:0.1,t);
  gain.gain.exponentialRampToValueAtTime(0.001,t+(urgent?0.12:0.08));
  osc.start(t);osc.stop(t+(urgent?0.12:0.08));
  if(urgent&&seconds<=2){
    const osc2=ctx.createOscillator();const gain2=ctx.createGain();
    osc2.connect(gain2);gain2.connect(ctx.destination);
    osc2.type="sine";osc2.frequency.value=880;
    gain2.gain.setValueAtTime(0.12,t+0.15);gain2.gain.exponentialRampToValueAtTime(0.001,t+0.27);
    osc2.start(t+0.15);osc2.stop(t+0.27);
  }
}
playClick=safe(playClick);playAnswer=safe(playAnswer);playCorrect=safe(playCorrect);
playWrong=safe(playWrong);playTimesUp=safe(playTimesUp);playFinished=safe(playFinished);playTick=safe(playTick);

// --- SSE with poll fallback ---
let usePolling=false;
let pollTimer=null;
function connect(){
  if(usePolling){startPolling();return;}
  const es=new EventSource("/events");
  let gotMessage=false;
  es.onmessage=e=>{gotMessage=true;gs=JSON.parse(e.data);render()};
  es.onerror=()=>{es.close();if(!gotMessage){usePolling=true;startPolling();}else{setTimeout(connect,2000);}};
  // If no data after 3s, switch to polling
  setTimeout(()=>{if(!gotMessage){es.close();usePolling=true;startPolling();}},3000);
}
function startPolling(){
  if(pollTimer)return;
  function poll(){fetch("/state").then(r=>r.json()).then(d=>{gs=d;render()}).catch(()=>{});}
  poll();
  pollTimer=setInterval(poll,1000);
}

// --- API helpers ---
function post(url,body){return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})}
function freshState(){return fetch("/state").then(r=>r.json()).then(d=>{gs=d;})}

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
  playTick(gs.timer);
  if(cnt){const answered=gs.players.filter(p=>p.answered).length;cnt.innerHTML='<b>'+answered+'</b> / '+gs.players.length+' answered';}
  return true;
}

// --- In-place reveal (patch existing DOM instead of rebuilding) ---
function revealInPlace(){
  const r=gs.reveal;if(!r)return false;
  playTimesUp();
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
      if(me.correct) playCorrect(); else if(me.answerIndex>=0) playWrong();
      const msg=me.answerIndex===-1?"Time\\'s up!":me.correct?"Lovely jubbly!":"Cor blimey, no!";
      const cls=me.answerIndex===-1?"color:#9ca3af":me.correct?"color:#16a34a":"color:#dc2626";
      const fb=document.createElement("div");fb.className="center";
      fb.style.cssText=cls+";font-weight:700;font-size:1.1rem;padding:10px 0";fb.textContent=msg.replace("\\\\'","'");
      app.appendChild(fb);
      const mePlayer=gs.players.find(p=>p.id===playerId);
      if(mePlayer){const sc=document.createElement("div");sc.className="center";
      sc.style.cssText="color:#6b7280;font-size:.9rem;padding:6px 0";
      sc.innerHTML="Score: <b style=\\"color:#4f46e5\\">"+mePlayer.score+"</b> / "+(gs.currentQuestion+1);
      app.appendChild(sc);}
    }
  }
  // For host: append player results + next button
  if(isHost){
    const results=r.playerResults.map(p=>{
      const cls=p.answerIndex===-1?"wait":p.correct?"check":"cross";
      const icon=p.answerIndex===-1?"--":p.correct?"\u2713":"\u2717";
      const plr=gs.players.find(pl=>pl.id===p.id);
      const score=plr?plr.score:0;
      return '<li>'+esc(p.name)+' <span style="color:#6b7280;font-weight:400;font-size:.85rem;margin-left:auto;margin-right:12px">'+score+' / '+(gs.currentQuestion+1)+'</span><span class="'+cls+'">'+icon+'</span></li>';
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
    document.getElementById("nextBtn").onclick=()=>{playClick();post("/host/next",{})};
  }
  return true;
}

// --- Render router ---
function renderConnecting(){
  app.innerHTML=
    '<div class="center" style="padding:40px 0">'+
    '<div style="width:40px;height:40px;border:4px solid #e5e7eb;border-top-color:#4f46e5;border-radius:50%;margin:0 auto 16px;animation:spin 1s linear infinite"></div>'+
    '<h1>Connecting to Quiz...</h1>'+
    '<p class="sub">Hang on a tick!</p>'+
    '</div>';
  if(!document.getElementById("spinStyle")){const s=document.createElement("style");s.id="spinStyle";s.textContent="@keyframes spin{to{transform:rotate(360deg)}}";document.head.appendChild(s);}
}

function render(){
  if(!gs){if(!introSeen){renderIntro();}else{renderConnecting();}return;}
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
  if(gs.phase==="question") lastTickTimer=-1;
  if(isHost) renderHost(); else renderPlayer();
  rendered={phase:gs.phase,q:gs.currentQuestion,answered:playerAnswered};
}

// =================== INTRO SCREEN ===================
function renderIntro(){
  app.innerHTML=
    '<div class="center">'+
    '<img src="/Image.jpg" alt="Cockney Rhyming Slang" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;margin-bottom:18px">'+
    '<h1>Cockney Rhyming Slang</h1>'+
    '<p class="sub">A cheeky guide before you take the quiz</p>'+
    '</div>'+
    '<div class="intro-text">'+
    '<h2>What is it?</h2>'+
    '<p>Cockney rhyming slang is a form of English slang that replaces common words with rhyming phrases. For example, <strong>"frog and toad"</strong> means <strong>road</strong>, and <strong>"loaf of bread"</strong> means <strong>head</strong>. Often, the rhyming word itself is dropped, making it even harder for outsiders to follow &mdash; so "head" becomes just "loaf" and "sister" becomes "skin" (from "skin and blister").</p>'+
    '<div class="origin-highlight"><strong>Origins:</strong> Cockney rhyming slang originated in the East End of London in the early 19th century. It was likely developed by market traders, street sellers, and the working class as a coded language &mdash; some say to confuse the police or rival traders, others believe it simply grew out of the playful, inventive spirit of London\\'s East End communities.</div>'+
    '<p>The term <strong>"Cockney"</strong> traditionally refers to someone born within earshot of the Bow Bells &mdash; the bells of St Mary-le-Bow church in Cheapside, London. Over the decades the slang spread well beyond the East End and has become a beloved part of British culture, appearing in films, TV shows, and everyday conversation across the country.</p>'+
    '<p>Today, new rhyming slang phrases are still being coined, keeping the tradition alive. Ready to see how much you know?</p>'+
    '</div>'+
    '<div class="center"><button class="btn btn-amber" id="introBtn">Let\\'s Get Started!</button></div>';
  document.getElementById("introBtn").onclick=()=>{playClick();introSeen=true;render()};
}

// =================== HOST VIEWS ===================
function renderHost(){
  if(gs.phase==="lobby"&&!introSeen) return renderIntro();
  if(gs.phase==="lobby") return hostLobby();
  if(gs.phase==="question") return hostQuestion();
  if(gs.phase==="reveal") return hostReveal();
  if(gs.phase==="finished") return hostFinished();
}

function hostLobby(){
  const phtml=gs.players.length?gs.players.map(p=>'<li>'+esc(p.name)+'</li>').join("")
    :'<li style="color:#9ca3af">Waiting for players to join...</li>';
  app.innerHTML=
    '<div class="lobby-scene"><div class="content center">'+
    '<img class="lobby-img" src="/skyline.jpg" alt="London skyline">'+
    '<h1>Cockney Rhyming Slang Quiz</h1>'+
    '<p class="sub">Share the player link and wait for everyone to join</p>'+
    '</div></div>'+
    '<ul class="plist">'+phtml+'</ul>'+
    '<div class="center"><span class="ans-count"><b>'+gs.players.length+'</b> player'+(gs.players.length!==1?'s':'')+ ' connected</span></div>'+
    '<div class="center" style="margin-top:10px"><button class="btn" id="startBtn"'+(gs.players.length===0?' disabled':'')+'>Start Quiz</button></div>';
  document.getElementById("startBtn").onclick=()=>{playClick();post("/host/start",{})};
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
      '<text class="timer-num" x="42" y="42" text-anchor="middle">'+gs.timer+'</text></svg></div></div>'+
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
    const plr=gs.players.find(pl=>pl.id===p.id);
    const score=plr?plr.score:0;
    return '<li>'+esc(p.name)+' <span style="color:#6b7280;font-weight:400;font-size:.85rem;margin-left:auto;margin-right:12px">'+score+' / '+(gs.currentQuestion+1)+'</span><span class="'+cls+'">'+icon+'</span></li>';
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
  document.getElementById("nextBtn").onclick=()=>{playClick();post("/host/next",{})};
}

const DIALOGUE='<div class="dialogue"><h3>Now Use It Like a Proper Cockney:</h3>'+
  '<p><span class="speaker">Geezer 1:</span> Oi, have a <span class="slang">butcher\\'s hook</span> at the state of Dave! He\\'s completely <span class="slang">Brahms and Liszt</span>!</p>'+
  '<p><span class="speaker">Geezer 2:</span> Can you <span class="slang">Adam and Eve</span> it? He spent all his <span class="slang">bees and honey</span> down the boozer again.</p>'+
  '<p><span class="speaker">Geezer 1:</span> His <span class="slang">trouble and strife</span> was on the <span class="slang">dog and bone</span> looking for him. He told her a right <span class="slang">porky pie</span> &mdash; said he was working late!</p>'+
  '<p><span class="speaker">Geezer 2:</span> Now look at him, can barely keep his <span class="slang">mince pies</span> open. He\\'ll never make it up the <span class="slang">apples and pears</span> tonight.</p>'+
  '<p><span class="speaker">Geezer 1:</span> His <span class="slang">plates of meat</span> are all over the place! Someone get him a cab.</p></div>';

function hostFinished(){
  const s=gs.scores;
  const topScore=s.length?s[0].score:0;
  app.innerHTML=
    '<div class="center"><h1>Final Scores</h1><p class="sub">Cockney Rhyming Slang Quiz</p></div>'+
    '<ul class="sb">'+s.map((p,i)=>
      '<li>'+esc(p.name)+'<span>'+p.score+' / '+gs.totalQuestions+'</span></li>'
    ).join("")+'</ul>'+
    DIALOGUE+
    '<div class="center" style="margin-top:16px"><button class="btn" id="restartBtn">Play Again</button></div>';
  document.getElementById("restartBtn").onclick=()=>{playClick();post("/host/restart",{})};
  if(topScore>=7) spawnConfetti();
}

// =================== PLAYER VIEWS ===================
function renderPlayer(){
  if(!introSeen) return renderIntro();
  if(!playerId){if(document.getElementById("nameIn"))return;return playerJoin();}
  // Make sure this player exists on server; if not found, wait briefly for state to catch up
  if(!gs.players.find(p=>p.id===playerId)){
    if(!playerJoin._waitCount)playerJoin._waitCount=0;
    playerJoin._waitCount++;
    if(playerJoin._waitCount>5){playerJoin._waitCount=0;playerId=null;sessionStorage.removeItem("qpid");return playerJoin();}
    return;
  }
  playerJoin._waitCount=0;
  if(gs.phase==="lobby") return playerLobby();
  if(gs.phase==="question") return playerQuestion();
  if(gs.phase==="reveal") return playerReveal();
  if(gs.phase==="finished") return playerFinished();
}

function playerJoin(){
  app.innerHTML=
    '<div class="lobby-scene"><div class="content center">'+
    '<img class="lobby-img" src="/skyline.jpg" alt="London skyline">'+
    '<h1>Cockney Rhyming Slang Quiz</h1>'+
    '<p class="sub">Enter your name to join</p>'+
    '<input type="text" id="nameIn" placeholder="Your name" maxlength="20" autofocus>'+
    '<br><button class="btn" id="joinBtn">Join Quiz</button>'+
    '</div></div>';
  const doJoin=()=>{
    const name=document.getElementById("nameIn").value.trim();
    if(!name)return;
    const btn=document.getElementById("joinBtn");
    btn.disabled=true;btn.textContent="Joining...";
    playClick();
    post("/join",{name}).then(r=>r.json()).then(d=>{
      playerId=d.id;sessionStorage.setItem("qpid",d.id);
      return freshState();
    }).then(()=>{render();}).catch(()=>{btn.disabled=false;btn.textContent="Join Quiz";});
  };
  document.getElementById("joinBtn").onclick=doJoin;
  document.getElementById("nameIn").onkeydown=e=>{if(e.key==="Enter")doJoin()};
}

function playerLobby(){
  const me=gs.players.find(p=>p.id===playerId);
  app.innerHTML=
    '<div class="lobby-scene"><div class="content center">'+
    '<img class="lobby-img" src="/skyline.jpg" alt="London skyline">'+
    '<h1>Cockney Rhyming Slang Quiz</h1>'+
    '<p class="sub">You\\'re in, '+esc(me.name)+'!</p>'+
    '<p style="color:#6b7280;font-size:.95rem">'+gs.players.length+' player'+(gs.players.length!==1?'s':'')+' connected<br>Waiting for the host to start...</p>'+
    '</div></div>';
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
      '<text class="timer-num" x="42" y="42" text-anchor="middle">'+gs.timer+'</text></svg></div></div>'+
    '<div class="q-img">'+q.img+'</div>'+
    '<div class="q-text">'+esc(q.text)+'</div>'+
    '<div class="opts">'+q.options.map((o,i)=>{
      const picked=myAnswer&&myPickedAnswer[gs.currentQuestion]===i;
      return '<button class="opt'+(picked?' picked':'')+(myAnswer&&!picked?' picked-lock':'')+'" data-i="'+i+'"'+(myAnswer?' disabled':'')+
      '><span class="lbl">'+LABELS[i]+'</span>'+esc(o)+'</button>';
    }).join("")+'</div>'+
    (myAnswer?'<div class="center" style="color:#6b7280;font-size:.9rem;padding:4px 0">Answer locked in!</div>':'');
  if(!myAnswer){
    const allBtns=app.querySelectorAll(".opt");
    allBtns.forEach(btn=>
      btn.onclick=()=>{
        playAnswer();
        const idx=+btn.dataset.i;
        myPickedAnswer[gs.currentQuestion]=idx;
        allBtns.forEach(b=>{b.disabled=true;b.classList.remove("picked")});
        btn.classList.add("picked");
        post("/answer",{playerId,answerIndex:idx});
      }
    );
  }
}

function playerReveal(){
  const q=gs.question;const r=gs.reveal;
  const me=r.playerResults.find(p=>p.id===playerId);
  if(me.correct) playCorrect(); else if(me.answerIndex>=0) playWrong();
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
    '<div class="center" style="'+cls+';font-weight:700;font-size:1.1rem;padding:10px 0">'+msg+'</div>'+
    '<div class="center" style="color:#6b7280;font-size:.9rem;padding:6px 0">Score: <b style="color:#4f46e5">'+gs.players.find(p=>p.id===playerId).score+'</b> / '+(gs.currentQuestion+1)+'</div>';
}

function playerFinished(){
  const s=gs.scores;
  const me=gs.players.find(p=>p.id===playerId);
  app.innerHTML=
    '<div class="center"><h1>Final Scores</h1></div>'+
    '<ul class="sb">'+s.map((p,i)=>
      '<li>'+esc(p.name)+'<span>'+p.score+' / '+gs.totalQuestions+'</span></li>'
    ).join("")+'</ul>'+
    '<div class="center" style="margin-top:10px;color:#6b7280">Your score: '+me.score+' / '+gs.totalQuestions+'</div>'+
    DIALOGUE;
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

render();
connect();
</script>
</body>
</html>`;

server.listen(PORT, () => {
  console.log(`\n  Cockney Quiz Server running!\n`);
  console.log(`  Host view:   http://localhost:${PORT}/host`);
  console.log(`  Player join: http://localhost:${PORT}/\n`);
});

