// ui.js — screen flow for the Lab. Lane B owns this file.
// Renders state; NEVER computes rules. Every scoring/option/win decision comes
// from engine.js (Lane A). Bot behavior comes from bots.js. Sounds from audio.js.
// Port of the frozen demo's flow + the PRD §5.4 omkamp the demo left out.

import {
  buildOptions, scoreRound, winCheck, omkampResolve, visibleOptionsFor, isValidBluff,
} from "./engine.js";
import { TUNING, BOT_NAMES, botPick, bluffOffsets, voteOffsets } from "./bots.js";
import { play, setMuted, isMuted } from "./audio.js";
import { THEMES, nextTheme } from "./themes.js";
import { STR, AVA, MINI_DECK, MINI_FAKES, esc, rnd, later, clearTimers, freshUi } from "./state.js";
import {
  preloadCelebrations, playCelebration, mountLottie, clearCelebrations, reduceMotion, LANDMARK_FOR,
} from "./lottie.js";
import { getFixture } from "./fixtures.js";

/* ---------- state ---------- */
let U = freshUi();       // screen flow (Lane B)
let G = null;            // game data — mutated ONLY with engine.js results
let CONTENT = { deck: null, fakes: null }; // fetched real content, if served over http
let lastScreen = null;   // gate the entrance animation to REAL screen changes (not surgical re-renders)

const t = (k, ...a) => { const v = STR[U.lang][k]; return typeof v === "function" ? v(...a) : v; };
const party = () => U.mode === "party";
const userIsGm = () => G.gm === 0;
const isBot = (i) => party() && i !== 0;
const order = () => G.players.map((_, i) => i).filter((i) => i !== G.gm && !G.players[i].dropped);
const voteOrder = () => (G.inOmkamp ? G.players.map((_, i) => i).filter((i) => i !== G.gm) : order());
const bluffOrder = () => (G.inOmkamp ? G.omkampParticipants : order());
const app = document.getElementById("app");

const LOGO = (sz = 26) => `<svg class="logo" width="${sz * 1.7}" height="${sz}" viewBox="0 0 44 26" fill="none">
  <circle cx="13" cy="13" r="11" fill="#FFF6E8" stroke="#23233B" stroke-width="2.6"/>
  <circle cx="9.5" cy="10.5" r="1.6" fill="#23233B"/><circle cx="16.5" cy="10.5" r="1.6" fill="#23233B"/>
  <path d="M9 17 q4 3.4 8 0" stroke="#23233B" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M23 11 h14 a3.4 3.4 0 0 1 0 6.8 h-14 z" fill="#FF5C97" stroke="#23233B" stroke-width="2.4"/>
</svg>`;

/* ---------- content loading (inlined bundle → http real decks → embedded mini) ---------- */
async function loadContent(lang) {
  // Standalone single-file build inlines the full decks on window.__COCKY__.
  const bundle = window.__COCKY__;
  if (bundle?.decks?.[lang]) {
    CONTENT.deck = bundle.decks[lang];
    CONTENT.fakes = bundle.fakes?.[lang] ?? MINI_FAKES[lang];
    return;
  }
  const suffix = lang === "nb" ? "nb" : "en";
  try {
    const [deckRes, fakesRes] = await Promise.all([
      fetch(`/Resources/deck_${suffix}.json`),
      fetch(`/Resources/fakes_${suffix}.json`),
    ]);
    if (deckRes.ok) {
      const deck = await deckRes.json();
      CONTENT.deck = deck.cards.map((c) => ({ prompt: c.prompt, truth: c.truth }));
    }
    if (fakesRes.ok) {
      const fakes = await fakesRes.json();
      CONTENT.fakes = fakes.fakes.map((f) => f.text);
    }
  } catch { /* file:// or missing files → fall back below */ }
  if (!CONTENT.deck) CONTENT.deck = MINI_DECK[lang];
  if (!CONTENT.fakes) CONTENT.fakes = MINI_FAKES[lang];
}

const shuffled = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const takeFakeText = () => U.fakePool.pop() ?? "…";

/* ---------- shell ---------- */
const NO_THEME_BTN = ["HOME", "RULES", "ABOUT", "LANG", "MODE", "PLAYERS", "PARTYSETUP"];
const NO_HELP_BTN = [...NO_THEME_BTN, "SETUP"];
const CEREMONY_SCREENS = ["REVEAL", "BOARD", "WINNER"];

function shell(inner, { gm = false } = {}) {
  clearCelebrations();   // no celebration bleeds into the next screen
  // Entrance animation only on a real screen change — surgical re-renders (tick-ins,
  // vote tally, reveal beats) must NOT replay the whole-screen fade.
  const changed = U.screen !== lastScreen;
  const fadeClass = changed ? (CEREMONY_SCREENS.includes(U.screen) ? "fade ceremony" : "fade") : "";
  lastScreen = U.screen;
  app.innerHTML = `
   <div class="topbar">
     <span class="brand">${LOGO(22)}<span>${t("title")} <span class="small">· ${t("demo")}</span></span></span>
     <span>
       ${NO_HELP_BTN.includes(U.screen) ? "" : `<button class="iconbtn" id="helpbtn" aria-label="${t("rulesTitle")}">?</button>`}
       ${NO_THEME_BTN.includes(U.screen) ? "" : `<button class="iconbtn" id="themebtn">🎨</button>`}
       <button class="iconbtn" id="mutebtn">${isMuted() ? "🔇" : "🔊"}</button>
     </span>
   </div>
   <div class="${fadeClass}" style="flex:1;display:flex;flex-direction:column;">${inner}</div>`;
  app.style.boxShadow = gm ? "inset 0 0 0 4px var(--color-accent-gm)" : "none";
  const tb = document.getElementById("themebtn");
  if (tb) tb.onclick = () => { U.theme = nextTheme(U.theme); play("toggle"); render(); };
  const help = document.getElementById("helpbtn");
  if (help) help.onclick = () => { U.rulesReturn = U.screen; play("confirm"); U.screen = "RULES"; render(); };
  document.getElementById("mutebtn").onclick = () => { setMuted(!isMuted()); render(); };
}

/* ---------- render dispatch ---------- */
const SCREENS = {};
export function render() {
  document.body.className = THEMES[U.theme].cssClass;
  SCREENS[U.screen]();
}

/* ---------- front of house ---------- */
SCREENS.HOME = () => {
  shell(`
   <div class="home-lang seg" role="group" aria-label="${t("pickLang")}">
     <button class="${U.lang === "nb" ? "on" : ""}" data-lang="nb">Norsk</button>
     <button class="${U.lang === "en" ? "on" : ""}" data-lang="en">English</button>
   </div>
   <div class="hero">
     <div class="home-badge bob">${LOGO(92)}</div>
     <span class="eyebrow">${t("fearNose")}</span>
     <h1 style="font-size:clamp(40px,12vw,54px)">${t("title")}</h1>
     <p class="sub" style="margin:0">${t("homePitch")}</p>
   </div>
   <div style="flex:1"></div>
   <button class="btn" id="hnew">${t("homeNewGame")}</button>
   <button class="btn secondary" id="hrules">${t("homeHowTo")}</button>
   <button class="linkbtn" id="habout">${t("homeAbout")}</button>`);
  app.querySelectorAll("[data-lang]").forEach((b) => b.onclick = () => {
    if (U.lang === b.dataset.lang) return;
    U.lang = b.dataset.lang; play("toggle"); render();
  });
  document.getElementById("hnew").onclick = () => { play("confirm"); loadContent(U.lang); U.screen = "MODE"; render(); };
  document.getElementById("hrules").onclick = () => { U.rulesReturn = "HOME"; play("confirm"); U.screen = "RULES"; render(); };
  document.getElementById("habout").onclick = () => { U.rulesReturn = "HOME"; play("confirm"); U.screen = "ABOUT"; render(); };
};

SCREENS.RULES = () => {
  shell(`
   <h2>${t("rulesTitle")}</h2>
   <p class="sub">${t("rulesSub")}</p>
   ${[1, 2, 3, 4, 5, 6].map((n) => `
     <div class="step">
       <span class="step-n">${n}</span>
       <span class="step-b"><b>${t("rulesStep" + n + "t")}</b><small>${t("rulesStep" + n + "b")}</small></span>
     </div>`).join("")}
   <div class="nose-demo" aria-hidden="true">
     ${[7, 18, 32].map((w) => `
       <span class="face" style="background:var(--color-avatar-2)"><span class="smile"></span><span class="nose" style="width:${w}px"></span></span>`).join("")}
   </div>
   <p class="small" style="text-align:center;margin-top:0">${t("rulesNose")}</p>
   <div class="card">
     <span class="eyebrow">${t("rulesScoreEyebrow")}</span>
     <div class="scorerow"><span class="pt green">+2</span><span>${t("rulesScore1")}</span></div>
     <div class="scorerow"><span class="pt pink">+1</span><span>${t("rulesScore2")}</span></div>
     <div class="scorerow"><span class="pt violet">+2</span><span>${t("rulesScore3")}</span></div>
     <div class="scorerow"><span class="pt gold">+3</span><span>${t("rulesScore4")}</span></div>
   </div>
   <div style="flex:1"></div>
   <button class="btn secondary" id="rback">← ${t("rulesBack")}</button>`);
  document.getElementById("rback").onclick = () => { play("confirm"); U.screen = U.rulesReturn || "HOME"; render(); };
};

SCREENS.ABOUT = () => {
  shell(`
   <div class="hero"><div class="home-badge bob">${LOGO(72)}</div><h1>${t("aboutTitle")}</h1></div>
   <div class="card"><p style="margin:0 0 10px">${t("aboutBlurb")}</p>
     <p class="small" style="margin:0 0 6px">${t("aboutCredits")}</p>
     <p class="small" style="margin:0"><b>${t("aboutPrivacy")}</b></p></div>
   <div style="flex:1"></div>
   <button class="btn secondary" id="aback">← ${t("rulesBack")}</button>`);
  document.getElementById("aback").onclick = () => { play("confirm"); U.screen = U.rulesReturn || "HOME"; render(); };
};

/* ---------- setup screens ---------- */
SCREENS.LANG = () => {
  shell(`
   <div class="hero">
     ${LOGO(64)}
     <h1 style="font-size:clamp(38px,11vw,48px)">${t("title")}</h1>
     <p class="sub" style="margin:0">${t("pickLang")}</p>
   </div>
   <button class="btn" data-lang="nb">Norsk</button>
   <button class="btn secondary" data-lang="en">English</button>
   <div style="flex:1"></div>`);
  app.querySelectorAll("[data-lang]").forEach((b) => b.onclick = () => {
    U.lang = b.dataset.lang; U.screen = "MODE"; play("confirm"); loadContent(U.lang); render();
  });
};

SCREENS.MODE = () => {
  shell(`<h2>${t("mode")}</h2>
   <button class="btn modebtn" data-mode="hotseat">
     <span class="phones"><span class="phoneico"></span></span>
     <span><b>${t("hotseatName")}</b><small>${t("hotseatSub")}</small></span></button>
   <button class="btn modebtn" data-mode="party">
     <span class="phones"><span class="phoneico"></span><span class="phoneico p2"></span><span class="phoneico p3"></span></span>
     <span><b>${t("partyName")}</b><small>${t("partySub")}</small></span></button>
   <div style="flex:1"></div>`);
  app.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => {
    U.mode = b.dataset.mode; play("confirm"); U.screen = party() ? "PARTYSETUP" : "PLAYERS"; render();
  });
};

SCREENS.PLAYERS = () => {
  shell(`<h2>${t("players")}</h2>
   <div>${U.names.map((n, i) => `
     <div class="pchip" style="margin-bottom:6px;justify-content:space-between;">
       <span style="display:flex;gap:8px;align-items:center;"><span class="dot" style="background:${AVA[i]}"></span>${esc(n)}</span>
       <span style="cursor:pointer" data-del="${i}">✕</span></div>`).join("")}</div>
   ${U.names.length < 8 ? `<input type="text" id="pname" placeholder="${t("namePh")}" maxlength="14">
   <button class="btn secondary" id="addp">${t("addPlayer")}</button>` : ""}
   <div style="flex:1"></div><p class="small">${t("needPlayers")}</p>
   <button class="btn" id="tosetup" ${U.names.length < 3 ? "disabled" : ""}>${t("next")}</button>`);
  const inp = document.getElementById("pname");
  const add = () => { const n = inp.value.trim(); if (!n) return; U.names.push(n); play("confirm"); render(); };
  if (inp) { inp.focus(); inp.onkeydown = (e) => { if (e.key === "Enter") add(); }; }
  const addBtn = document.getElementById("addp"); if (addBtn) addBtn.onclick = add;
  app.querySelectorAll("[data-del]").forEach((x) => x.onclick = () => { U.names.splice(Number(x.dataset.del), 1); render(); });
  document.getElementById("tosetup").onclick = () => { U.screen = "SETUP"; play("confirm"); render(); };
};

SCREENS.PARTYSETUP = () => {
  shell(`<h2>${t("yourName")}</h2>
   <input type="text" id="uname" maxlength="14" value="${esc(U.uname)}" placeholder="${t("namePh")}">
   <h2>${t("bots")}</h2>
   <div class="seg">${[2, 3, 4, 5].map((n) => `
     <button class="${U.botCount === n ? "on" : ""}" data-bots="${n}">${n} 🤖</button>`).join("")}</div>
   <div style="flex:1"></div>
   <button class="btn" id="tonext">${t("next")}</button>`);
  document.getElementById("uname").oninput = (e) => { U.uname = e.target.value; };
  app.querySelectorAll("[data-bots]").forEach((b) => b.onclick = () => { U.botCount = Number(b.dataset.bots); play("toggle"); render(); });
  document.getElementById("tonext").onclick = () => {
    const n = U.uname.trim() || (U.lang === "nb" ? "Du" : "You");
    U.names = [n, ...BOT_NAMES[U.lang].slice(0, U.botCount)];
    U.screen = "SETUP"; play("confirm"); render();
  };
};

SCREENS.SETUP = () => {
  shell(`<h2>${t("length")}</h2>
   <div class="seg">${[["kort", 8], ["std", 15], ["mara", 25]].map(([k, v]) => `
     <button class="${U.target === v ? "on" : ""}" data-target="${v}">${t(k)}</button>`).join("")}</div>
   <h2>${t("theme")}</h2>
   <div class="seg">${Object.keys(THEMES).map((th) => `
     <button class="${U.theme === th ? "on" : ""}" data-theme="${th}">${t(THEMES[th].nameKey)}</button>`).join("")}</div>
   <div style="flex:1"></div><p class="small">${t("rules")}</p>
   <button class="btn" id="begin">${t("begin")}</button>
   <button class="linkbtn" id="setuprules">${t("homeHowTo")}</button>`);
  app.querySelectorAll("[data-target]").forEach((b) => b.onclick = () => { U.target = Number(b.dataset.target); play("toggle"); render(); });
  app.querySelectorAll("[data-theme]").forEach((b) => b.onclick = () => { U.theme = b.dataset.theme; play("toggle"); render(); });
  document.getElementById("begin").onclick = startGame;
  document.getElementById("setuprules").onclick = () => { U.rulesReturn = "SETUP"; play("confirm"); U.screen = "RULES"; render(); };
};

/* ---------- game lifecycle ---------- */
function startGame() {
  preloadCelebrations();       // warm the Lottie cache before the first Mål/win
  U.deck = shuffled(CONTENT.deck ?? MINI_DECK[U.lang]);
  // This G literal is mirrored by fxMakeG() in fixtures.js — keep the two in sync.
  G = {
    players: U.names.map((name, i) => ({ name, color: AVA[i], score: 0, bluffVotes: 0, dropped: false })),
    target: U.target,
    round: 0,
    gm: 0,                       // the user (index 0) is always the first GM
    card: null, bluffs: {}, decoys: ["", ""], gmDecoyDone: false,
    options: null, doubles: [], votes: {}, deltas: null, gmStole: false,
    inOmkamp: false, omkampParticipants: [], preOmkampScores: null,
    goalCelebrated: false, celebrated: false, awaitingNext: false,
  };
  newRound();
}

function newRound() {
  clearTimers();
  G.awaitingNext = false;                // this round's board starts locked until its ceremony ends
  G.round++;
  if (!U.deck.length) U.deck = shuffled(CONTENT.deck ?? MINI_DECK[U.lang]);
  G.card = U.deck.pop();
  U.fakePool = shuffled(CONTENT.fakes ?? MINI_FAKES[U.lang]);
  G.bluffs = {}; G.votes = {}; G.decoys = ["", ""]; G.doubles = []; G.deltas = null; G.gmStole = false;
  G.options = null;
  G.gmDecoyDone = !(party() && G.gm !== 0); // human GM settles decoys by pressing "open vote"
  U.voteIdx = 0; U.revealIdx = 0;
  U.screen = "GM_INTRO"; play("cardDraw"); render();
  if (party() && !userIsGm()) later(() => { if (U.screen === "GM_INTRO") enterBluffing(); }, TUNING.GM_INTRO_AUTO_MS);
}

/* ---------- GM intro / dashboard ---------- */
SCREENS.GM_INTRO = () => {
  const gm = G.players[G.gm];
  shell(`
   <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;">
     <div class="banner gm">${G.inOmkamp ? t("omkamp") : t("roundN", G.round)}</div>
     <h1 style="color:var(--color-accent-gm)">${party() && userIsGm() ? t("youAreGm") : t("gmIs", esc(gm.name))}</h1>
     <p class="sub">${t("fearNose")}</p>
     <div style="display:flex;justify-content:center;margin:16px 0;">
       <div class="face bob" style="background:${gm.color};width:68px;height:68px;">
         <div class="smile" style="width:18px;height:9px;bottom:11px;"></div>
         <div class="nose violet" style="top:29px;width:28px;height:13px;"></div></div></div>
   </div>
   ${party() && !userIsGm()
    ? `<p class="small" style="text-align:center">…</p>`
    : `<button class="btn gm" id="togm">${t("next")}</button>`}`);
  const b = document.getElementById("togm");
  if (b) b.onclick = () => { play("confirm"); U.screen = "GM_DASH"; render(); if (party()) scheduleBotBluffs(); };
};

function scheduleBotBluffs() {
  const bots = bluffOrder().filter((i) => isBot(i));
  const offsets = bluffOffsets(bots.length, Math.random);
  bots.forEach((i, k) => {
    later(() => {
      if (G.bluffs[i] !== undefined) return;
      G.bluffs[i] = takeFakeText(); play("tickIn");
      botTickUI(i);
      maybeAllBluffsIn();
    }, offsets[k]);
  });
}

function botTickUI(i) {
  const chip = document.getElementById("chip" + i);
  // Replace the whole "tenker…" token FIRST, else "…"→"✓" strands the word "tenker".
  if (chip) { chip.classList.add("done"); chip.innerHTML = chip.innerHTML.replace(t("thinkingDots"), "✓").replace("…", "✓"); }
  if (U.screen === "WAIT") render();          // waiting room has no inputs → full render is safe
  if (U.screen === "GM_DASH") refreshGmAction(); // dash has inputs → surgical update only
}

function allBluffsSubmitted() {
  return bluffOrder().every((i) => G.bluffs[i] !== undefined);
}

function maybeAllBluffsIn() {
  if (!allBluffsSubmitted() || !G.gmDecoyDone) return; // decoy gating (PRD §5.5)
  if (U.screen === "WAIT") {
    later(() => { play("cardShuffle"); play("voteOpen"); flashScreen(); openVote(); U.screen = "VOTE"; render(); scheduleBotVotes(); }, TUNING.GM_SHUFFLE_MS);
  }
}

function openVote() {
  const bluffs = {};
  for (const i of bluffOrder()) bluffs[i] = G.bluffs[i];
  const built = buildOptions({
    truth: G.card.truth, bluffs,
    decoys: G.decoys.filter((d) => d && d.trim()).map((d) => d.trim()),
    gm: G.gm, rng: Math.random,
  });
  G.options = built.options.map((o) => ({ ...o, letter: o.id.toUpperCase() }));
  G.doubles = built.doubles;
}

function refreshGmAction() {
  const el = document.getElementById("gmaction");
  if (!el) return;
  const allIn = allBluffsSubmitted();
  const waiting = bluffOrder().filter((i) => G.bluffs[i] === undefined).map((i) => G.players[i].name);
  el.innerHTML = allIn
    ? `<div class="banner green">${t("allIn")}</div>
       <button class="btn pulse" id="openvote">🎉 ${t("openVote")}</button>`
    : `<p class="small">${t("waitingFor")}: ${waiting.map(esc).join(", ")}</p>
       ${party() ? "" : `<button class="btn gm" id="passbtn">${t("passOn")} →</button>`}`;
  const ov = document.getElementById("openvote");
  if (ov) ov.onclick = gmOpensVote;
  const pb = document.getElementById("passbtn");
  if (pb) pb.onclick = nextBluffer;
}

SCREENS.GM_DASH = () => {
  shell(`
   <p class="small">${t("gmHint")}</p>
   <div class="card"><span class="eyebrow">${t("theWord")}</span><div class="word">${esc(G.card.prompt)}</div></div>
   <div class="card secret" id="secret">
     <b style="color:var(--color-accent-gm)">🔒 ${t("secret")}</b>
     <div id="truthtxt" style="margin-top:6px;filter:blur(7px);transition:filter .2s;">${esc(G.card.truth)}</div>
     <div class="small">${t("peek")}</div></div>
   <b>${t("decoys")}</b>
   ${[0, 1].map((i) => `<input type="text" style="margin-top:8px" maxlength="140" data-decoy="${i}"
      placeholder="${t("decoyPh", i + 1)}" value="${esc(G.decoys[i])}">`).join("")}
   <div class="chiprow" style="margin-top:14px;">
     ${bluffOrder().map((i) => {
       const p = G.players[i]; const done = G.bluffs[i] !== undefined;
       return `<span class="pchip ${done ? "done" : ""}" id="chip${i}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)} ${done ? "✓" : (party() ? `<span class="thinking">${t("thinkingDots")}</span>` : "…")}</span>`;
     }).join("")}
   </div>
   <div id="gmaction"></div>`, { gm: true });
  const secret = document.getElementById("secret");
  const peek = (on) => { const el = document.getElementById("truthtxt"); if (el) el.style.filter = on ? "none" : "blur(7px)"; };
  secret.onpointerdown = () => peek(true);
  secret.onpointerup = secret.onpointerleave = () => peek(false);
  app.querySelectorAll("[data-decoy]").forEach((inp) => inp.oninput = () => { G.decoys[Number(inp.dataset.decoy)] = inp.value; });
  refreshGmAction();
};

function gmOpensVote() {
  clearTimers();
  play("cardShuffle"); play("voteOpen"); flashScreen();   // the showstopper (PRD §11)
  G.gmDecoyDone = true;
  openVote();
  if (party()) { U.screen = "VOTEWAIT"; render(); scheduleBotVotes(); }
  else { const first = G.players[voteOrder()[0]].name; hand(first, () => { U.screen = "VOTE"; render(); }); }
}

/* ---------- hotseat plumbing ---------- */
function nextBluffer() {
  const nxt = bluffOrder().find((i) => G.bluffs[i] === undefined);
  hand(G.players[nxt].name, () => { U.screen = "BLUFF"; U.cur = nxt; render(); });
}

function hand(name, after) {
  U.afterHand = after;
  const d = document.createElement("div");
  d.className = "handover"; d.id = "hand";
  d.innerHTML = `<h1>📱</h1><h2>${t("giveTo", esc(name))}</h2><p class="sub">${t("noPeek")}</p>
    <button class="holdbtn" id="hb"><span class="inner">${t("hold")} 1s</span></button>`;
  document.body.appendChild(d);
  const hb = d.querySelector("#hb");
  let t0 = null, raf = null;
  const complete = () => { cancelAnimationFrame(raf); d.remove(); play("cardDraw"); U.afterHand(); };
  const step = () => {
    const p = Math.min(100, (Date.now() - t0) / 10);
    hb.style.setProperty("--p", p);
    if (p >= 100) complete();
    else raf = requestAnimationFrame(step);
  };
  hb.addEventListener("pointerdown", (e) => { e.preventDefault(); t0 = Date.now(); raf = requestAnimationFrame(step); });
  const stop = () => { cancelAnimationFrame(raf); hb.style.setProperty("--p", 0); };
  hb.addEventListener("pointerup", stop);
  hb.addEventListener("pointerleave", stop);
  // Switch Control / keyboard parity (DESIGN.md §9) — also the automation hook.
  hb.addEventListener("dblclick", complete);
  hb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); complete(); } });
  hb.focus();
}

/* ---------- bluff entry ---------- */
function enterBluffing() {
  U.cur = 0; U.screen = "BLUFF"; render();
  scheduleBotBluffs();
  later(() => {
    if (!G.gmDecoyDone) { G.decoys[0] = takeFakeText(); G.gmDecoyDone = true; maybeAllBluffsIn(); }
  }, rnd(TUNING.USER_DECOY_MS[0], TUNING.USER_DECOY_MS[1]));
}

SCREENS.BLUFF = () => {
  const p = G.players[U.cur];
  shell(`
   <div class="banner" style="background:${p.color};color:var(--color-text-on-surface)">${esc(p.name)}</div>
   <div class="card"><div class="word" style="font-size:36px">${esc(G.card.prompt)}</div></div>
   <p>${t("yourBluff", esc(G.card.prompt))}</p>
   <textarea id="btxt" maxlength="140" placeholder="${t("bluffPh")}"></textarea>
   <p class="small" id="berr"></p>
   <div style="flex:1"></div>
   <button class="btn" id="lock">${t("lockIn")}</button>`);
  document.getElementById("btxt").focus();
  document.getElementById("lock").onclick = () => {
    const v = document.getElementById("btxt").value;
    if (!isValidBluff(v)) { document.getElementById("berr").textContent = t("emptyBluff"); play("error"); return; }
    G.bluffs[U.cur] = v.trim(); play("tickIn");
    if (party()) { U.screen = "WAIT"; render(); maybeAllBluffsIn(); }
    else if (bluffOrder().some((i) => G.bluffs[i] === undefined)) nextBluffer();
    else hand(G.players[G.gm].name, () => { U.screen = "GM_DASH"; render(); });
  };
};

/* ---------- party waiting room ---------- */
SCREENS.WAIT = () => {
  const gm = G.players[G.gm];
  shell(`
   <h2>${t("roundN", G.round)}</h2>
   <div class="card"><div class="word" style="font-size:34px">${esc(G.card.prompt)}</div>
     <div class="banner green" style="margin:10px 0 0">✓</div></div>
   <div class="card">
     <div class="chiprow">
       ${bluffOrder().map((i) => {
         const p = G.players[i]; const done = G.bluffs[i] !== undefined;
         return `<span class="pchip ${done ? "done" : ""}" id="chip${i}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)} ${done ? "✓" : `<span class="thinking">${t("thinkingDots")}</span>`}</span>`;
       }).join("")}
       <span class="pchip"><span class="dot" style="background:${gm.color}"></span>👑 <span class="thinking">${t("gmComposing", esc(gm.name))}</span></span>
     </div>
     <p class="small" style="margin:8px 0 0">${t("shuffling")}</p>
   </div>
   <div style="flex:1;display:flex;align-items:center;justify-content:center;">
     <div class="face bob suspicious" style="background:${G.players[0].color};width:60px;height:60px;">
       <div class="smile" style="width:16px;height:8px;bottom:10px;"></div>
       <div class="nose" style="top:26px;width:14px;height:10px;"></div></div>
   </div>`);
};

/* ---------- voting ---------- */
function scheduleBotVotes() {
  const bots = voteOrder().filter((i) => isBot(i));
  const offsets = voteOffsets(bots.length, Math.random);
  bots.forEach((i, k) => {
    later(() => {
      if (G.votes[i] !== undefined) return;
      G.votes[i] = botPick(G.options, i, Math.random); play("voteCast");
      if (U.screen === "VOTEWAIT") render();
      maybeAllVotesIn();
    }, offsets[k]);
  });
}

function maybeAllVotesIn() {
  if (voteOrder().some((i) => G.votes[i] === undefined)) return;
  clearTimers();
  play("drumroll");                      // tension roll as the votes close and the reveal opens
  later(() => {
    computeRound(); U.revealIdx = 0; U.screen = "REVEAL"; render();
    if (party() && !userIsGm()) later(autoReveal, 1400);
  }, 600);
}

SCREENS.VOTE = () => {
  const voter = party() ? 0 : voteOrder()[U.voteIdx];
  const p = G.players[voter];
  const visible = visibleOptionsFor(G.options, voter);
  shell(`
   <div class="banner" style="background:${p.color};color:var(--color-text-on-surface)">
     ${party() ? t("yourVote") : t("votingTime", esc(p.name))}</div>
   <p class="small">${t("cantOwn")}</p>
   ${G.options.map((o, i) => !visible.includes(o) ? "" : `
     <div class="opt stagger" style="animation-delay:${i * 70}ms" data-opt="${o.id}">
       <div class="letter">${o.letter}</div><div>${esc(o.text)}</div></div>`).join("")}`);
  app.querySelectorAll("[data-opt]").forEach((el) => el.onclick = () => castVote(voter, el.dataset.opt));
};

function castVote(voter, optionId) {
  play("voteCast");
  G.votes[voter] = optionId;
  if (party()) { U.screen = "VOTEWAIT"; render(); maybeAllVotesIn(); }
  else {
    U.voteIdx++;
    const vo = voteOrder();
    if (U.voteIdx < vo.length) hand(G.players[vo[U.voteIdx]].name, () => render());
    else hand(G.players[G.gm].name, () => { computeRound(); U.revealIdx = 0; U.screen = "REVEAL"; render(); });
  }
}

SCREENS.VOTEWAIT = () => {
  const n = Object.keys(G.votes).length, total = voteOrder().length;
  shell(`
   <h2>${t("votesIn")} <span class="small">${n}/${total}</span></h2>
   ${userIsGm() ? "" : `<div class="banner green">${t("youVoted")}</div>`}
   ${G.options.map((o) => {
     const c = Object.values(G.votes).filter((id) => id === o.id).length;
     return `<div class="opt" style="cursor:default">
       <div class="letter">${o.letter}</div>
       <div style="flex:1">${esc(o.text)}
         <div class="votedots">${"<span class='dot land' style='background:var(--color-text-secondary)'></span>".repeat(c)}
           <span class="small">${c}</span></div></div></div>`;
   }).join("")}`, { gm: userIsGm() });
};

/* ---------- scoring (engine call — the only place scores change) ---------- */
function computeRound() {
  const result = scoreRound({
    playerCount: G.players.length, gm: G.gm,
    options: G.options, votes: G.votes, doubles: G.doubles,
  });
  G.deltas = result.deltas;
  G.gmStole = result.gmStole;
  result.bluffVotes.forEach((n, i) => { G.players[i].bluffVotes += n; });
  if (G.doubles.length) setTimeout(() => play("doubleHit"), 400);   // surprise sparkle as the reveal opens
}

/* ---------- reveal ceremony ---------- */
const revealSeq = () => [...G.options.filter((o) => o.kind !== "truth"), G.options.find((o) => o.kind === "truth")];

SCREENS.REVEAL = () => {
  const seq = revealSeq();
  const shown = seq.slice(0, U.revealIdx);
  const done = U.revealIdx >= seq.length;
  const hostIsBot = party() && !userIsGm();
  shell(`
   <h2>${t("revealTitle")} <span class="small">· ${G.inOmkamp ? t("omkamp") : t("roundN", G.round)}</span></h2>
   <div class="reveal ${done ? "truth-shown" : ""}">
   ${G.doubles.map((i) => `<div class="banner green">${t("doubleHit", esc(G.players[i].name))}</div>`).join("")}
   ${shown.map((o, si) => {
     const voters = Object.entries(G.votes).filter(([, id]) => id === o.id).map(([v]) => G.players[+v]);
     const isT = o.kind === "truth";
     const isLast = si === shown.length - 1;
     const enter = isLast ? (isT ? "truth-enter" : "pop") : "";
     return `<div class="opt ${o.kind} ${enter}" style="cursor:default">
       <div class="letter" style="${isT ? "background:var(--color-accent-truth);color:var(--color-text-on-surface)" : ""}">${o.letter}</div>
       <div style="flex:1">
         ${isT ? `<b style="color:var(--color-accent-truth)">✓ ${t("theTruth")}</b><br>` : ""}
         ${esc(o.text)}
         <div class="votedots">${voters.map((v) => `<span class="dot" title="${esc(v.name)}" style="background:${v.color}"></span>`).join("")}
           <span class="small">${voters.length} ${t("votes")}</span></div>
         ${!isT ? `<div class="author">
            ${o.authors.map((a) => {
              const pl = G.players[a]; const gmA = a === G.gm;
              return `<span class="face" style="background:${pl.color}">
                        <span class="nose grow ${gmA ? "violet" : ""}" style="--votes:${voters.length};width:${6 + voters.length * 14}px"></span></span>
                      <span>${t("by")} ${a === 0 && party() ? t("you") : esc(pl.name)}${gmA ? ` · <span style="color:var(--color-accent-gm)">${t("gmDecoy")}</span>` : ""}</span>`;
            }).join("")}
          </div>` : ""}
       </div></div>`;
   }).join("")}
   </div>
   ${done && G.gmStole ? `<div class="banner gm">😈 ${t("gmSteal")}</div>` : ""}
   <div style="flex:1"></div>
   ${done
    ? `<button class="btn" id="toboard">${t("toBoard")}</button>`
    : `<button class="btn gm" id="revealnext">${hostIsBot ? t("skip") : t("tapReveal")}</button>`}`,
  { gm: userIsGm() || !party() });
  const tb = document.getElementById("toboard");
  if (tb) tb.onclick = goBoard;
  const rn = document.getElementById("revealnext");
  if (rn) rn.onclick = () => {
    clearTimers(); doRevealStep();
    if (party() && !userIsGm() && U.revealIdx < revealSeq().length) later(autoReveal, TUNING.REVEAL_BEAT_MS);
  };
};

function doRevealStep() {
  const seq = revealSeq();
  if (U.revealIdx >= seq.length) return;
  const isTruth = U.revealIdx === seq.length - 1;
  U.revealIdx++;
  if (isTruth) {
    play("truthReveal");
    if (G.gmStole) {
      setTimeout(() => play("gmSting"), 500);
      playCelebration("gm_steal_sting");
      if (!reduceMotion()) {                       // the villain veil pulses gmViolet + the room shakes
        const tint = document.createElement("div");
        tint.className = "gm-tint"; document.body.appendChild(tint);
        setTimeout(() => tint.remove(), 700);
        shakeScreen();
      }
    }
  }
  else {
    const o = seq[U.revealIdx - 1];
    const v = Object.values(G.votes).filter((id) => id === o.id).length;
    play("noseGrow", v);
  }
  render();
}

function autoReveal() {
  if (U.screen !== "REVEAL") return;
  doRevealStep();
  if (U.revealIdx < revealSeq().length) later(autoReveal, TUNING.REVEAL_BEAT_MS);
  else later(goBoard, TUNING.REVEAL_TO_BOARD_MS);
}

function goBoard() {
  if (U.screen === "BOARD") return;
  clearTimers(); play("confirm");
  U.screen = "BOARD"; render();
  setTimeout(animateBoard, 400);
}

/* ---------- board ceremony ---------- */
function cellPos(i) { const row = Math.floor(i / 5); let col = i % 5; if (row % 2) col = 4 - col; return { row, col }; }

SCREENS.BOARD = () => {
  const T = G.target;
  const th = THEMES[U.theme].marks;
  const marks = {};
  marks[Math.floor(T / 3)] = th[0]; marks[Math.floor(2 * T / 3)] = th[1]; marks[T] = th[2];
  let cells = "";
  for (let i = 0; i <= T; i++) {
    const { row, col } = cellPos(i);
    cells += `<div class="space ${i === T ? "goal" : ""}" data-i="${i}" style="grid-row:${row + 1};grid-column:${col + 1}">
              ${i === 0 ? "▶" : i}${marks[i] ? `<span class="mark">${marks[i]}</span>` : ""}</div>`;
  }
  shell(`
   <h2>${t("board")}</h2><p class="sub">${t("boardSub", T)}</p>
   <div class="boardwrap"><svg class="track-path" id="trackpath" preserveAspectRatio="none"></svg><div class="board">${cells}</div><div id="pawns"></div></div>
   <div style="margin-top:10px">
     ${G.players.map((p, i) => `<div class="scoreline">
        <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color}"></span>
        ${esc(p.name)} ${i === G.gm ? "👑" : ""} <span class="small">👃${p.bluffVotes}</span>
        ${G.deltas?.[i] ? `<b>+${G.deltas[i]}</b>` : ""}</span>
        <span id="sc${i}">${p.score} ${t("pts")}</span></div>`).join("")}
   </div>
   <div style="flex:1"></div>
   <button class="btn" id="nextbtn" ${G.awaitingNext ? "" : "disabled"}>${t("nextRound")}</button>`);
  placePawns();
  if (G.awaitingNext) {                  // re-render after the round already finished → keep it live
    const btn = document.getElementById("nextbtn");
    if (btn) btn.onclick = advanceRound;
  }
};

function pawnEl(i) {
  let el = document.getElementById("pw" + i);
  if (!el) {
    el = document.createElement("div");
    el.id = "pw" + i; el.className = "pawn";
    el.style.background = G.players[i].color;
    el.textContent = THEMES[U.theme].pawnIcon;
    document.getElementById("pawns").appendChild(el);
  }
  return el;
}

function moveTo(i, space, offset) {
  const cell = document.querySelector(`.space[data-i="${Math.min(space, G.target)}"]`);
  if (!cell) return;
  const wrap = document.querySelector(".boardwrap").getBoundingClientRect();
  const r = cell.getBoundingClientRect();
  const el = pawnEl(i);
  el.style.left = (r.left - wrap.left + r.width / 2 - 15 + offset * 7) + "px";
  el.style.top = (r.top - wrap.top + r.height / 2 - 15 - offset * 5) + "px";
}

function placePawns() { G.players.forEach((p, i) => moveTo(i, p.score, i)); markLeader(); drawTrack(); }

// Draw the winding route through the cell centers — reframes the board from a
// score list into a physical track. Stroke color is themed (themes.css).
function drawTrack() {
  const svg = document.getElementById("trackpath");
  const wrap = document.querySelector(".boardwrap");
  if (!svg || !wrap) return;
  const wr = wrap.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${wr.width} ${wr.height}`);
  const pts = [];
  for (let i = 0; i <= G.target; i++) {
    const cell = document.querySelector(`.space[data-i="${i}"]`);
    if (!cell) continue;
    const r = cell.getBoundingClientRect();
    pts.push(`${(r.left - wr.left + r.width / 2).toFixed(1)},${(r.top - wr.top + r.height / 2).toFixed(1)}`);
  }
  svg.innerHTML = `<polyline points="${pts.join(" ")}" />`;
}

function markLeader() {
  const max = Math.max(...G.players.map((p) => p.score));
  G.players.forEach((p, i) => pawnEl(i).classList.toggle("leader", p.score === max && max > 0));
}

function animateBoard() {
  const earners = G.players.map((_, i) => i).filter((i) => G.deltas?.[i] > 0);
  let e = 0;
  const nextEarner = () => {
    if (e >= earners.length) return finishRound();
    const i = earners[e++];
    let steps = G.deltas[i];
    const hop = () => {
      if (steps-- <= 0) { markLeader(); return setTimeout(nextEarner, 250); }
      const before = G.players[i].score;
      G.players[i].score++;
      const after = G.players[i].score;
      play("pawnHop");
      if (navigator.vibrate) navigator.vibrate(10);
      // Mål landmark: first pawn to reach the goal triggers the themed celebration.
      if (after >= G.target && !G.goalCelebrated) {
        G.goalCelebrated = true;
        playCelebration(LANDMARK_FOR[U.theme] ?? "celebration_salongen");
      }
      moveTo(i, after, i);
      const el = pawnEl(i);
      if (!reduceMotion() && el.animate) {         // squash-stretch arc — the piece HOPS, not glides
        el.classList.add("hopping");               // rocket exhaust puff (rom theme)
        el.animate([
          { transform: "translateY(0) scale(1,1)" },
          { transform: "translateY(-16px) scale(.92,1.12)", offset: .5 },
          { transform: "translateY(0) scale(1.08,.92)", offset: .82 },
          { transform: "translateY(0) scale(1,1)" },
        ], { duration: 330, easing: "cubic-bezier(0.34,1.405,0.64,1)" });
        setTimeout(() => el.classList.remove("hopping"), 350);
        // Overtake: any stationary pawn this hop just passed does an indignant wobble.
        G.players.forEach((p, j) => {
          if (j !== i && before <= p.score && after > p.score) {
            const pj = pawnEl(j); pj.classList.remove("wobble"); void pj.offsetWidth; pj.classList.add("wobble");
            setTimeout(() => pj.classList.remove("wobble"), 420);
            play("overtake");
          }
        });
      }
      const sc = document.getElementById("sc" + i);
      if (sc) sc.textContent = after + " " + t("pts");
      setTimeout(hop, 330); // pawn-hop cadence (tokens: motion-dur-pawn-hop-cadence)
    };
    hop();
  };
  setTimeout(nextEarner, 300);
}

function finishRound() {
  G.deltas = null;

  if (G.inOmkamp) {
    // One sudden-death round only: highest tied participant wins, still-tied → shared.
    const result = omkampResolve({
      scores: G.preOmkampScores,
      participants: G.omkampParticipants,
      deltas: Object.fromEntries(G.players.map((p, i) => [i, p.score - G.preOmkampScores[i]])),
    });
    G.winnersIdx = result.winners; G.shared = result.shared;
    U.screen = "WINNER"; play("truthReveal"); render();
    return;
  }

  const scores = G.players.map((p) => p.score);
  const check = winCheck({ scores, round: G.round, playerCount: G.players.length, target: G.target });
  if (check.winners) {
    G.winnersIdx = check.winners; G.shared = check.winners.length > 1;
    U.screen = "WINNER"; play("truthReveal"); render();
    return;
  }
  if (check.omkamp) {
    G.inOmkamp = true;
    G.omkampParticipants = check.omkamp.participants;
    G.preOmkampScores = scores.slice();
    G.gm = check.omkamp.gm;
    U.screen = "OMKAMP"; play("gmSting"); render();
    return;
  }
  G.awaitingNext = true;                 // survives topbar re-renders (mute/theme) — no soft-lock
  const btn = document.getElementById("nextbtn");
  if (!btn) return;
  btn.disabled = false;
  btn.onclick = advanceRound;
}

function advanceRound() { G.gm = (G.gm + 1) % G.players.length; newRound(); }

/* ---------- omkamp intro (PRD §5.4 — not in the frozen demo) ---------- */
SCREENS.OMKAMP = () => {
  const names = G.omkampParticipants.map((i) => G.players[i].name).join(" & ");
  shell(`
   <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;">
     <div class="banner gm">⚔️ ${t("omkamp")}</div>
     <h1>${esc(names)}</h1>
     <p class="sub">${t("omkampSub", esc(names))}</p>
     <p class="small">👑 ${esc(G.players[G.gm].name)}</p>
   </div>
   <button class="btn gm" id="startomkamp">${t("next")}</button>`);
  document.getElementById("startomkamp").onclick = () => newRound();
};

/* ---------- winner ---------- */
SCREENS.WINNER = () => {
  const winners = (G.winnersIdx ?? []).map((i) => G.players[i]);
  const liar = [...G.players].sort((a, b) => b.bluffVotes - a.bluffVotes)[0];
  shell(`
   <div style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;">
     <h1 style="font-size:42px">🏆</h1>
     <h1>${G.shared ? t("shared") : t("winner", esc(winners[0]?.name ?? ""))}</h1>
     <p class="sub">${t("restOfYou")}</p>
     <div class="card gullnese-card" style="position:relative;display:flex;gap:12px;align-items:center;justify-content:center;">
       <span class="face delighted" style="background:${liar.color};width:48px;height:48px;">
         <span class="nose gold grow" style="--votes:${liar.bluffVotes};top:20px;width:${10 + liar.bluffVotes * 10}px;height:10px;"></span></span>
       <b>${t("goldNose", esc(liar.name))} (👃 ${liar.bluffVotes})</b>
       <span class="gullnese-fx" id="gullnesefx"></span></div>
     <div style="margin-top:14px">${[...G.players].sort((a, b) => b.score - a.score).map((p) => `
        <div class="scoreline"><span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color}"></span> ${esc(p.name)}</span><span>${p.score} ${t("pts")}</span></div>`).join("")}</div>
   </div>
   <button class="btn" id="replay">${t("playAgain")}</button>`);
  // Celebration fires once per game (guard survives mute/theme re-renders).
  if (!G.celebrated) {
    G.celebrated = true;
    play("win");                                   // triumphant fanfare
    if (window.lottie && !reduceMotion()) {
      playCelebration("confetti_win");
      mountLottie(document.getElementById("gullnesefx"), "gullnese_shimmer");
    } else if (!reduceMotion()) {
      confetti();   // CSS fallback when lottie-web is unavailable
    }
  }
  document.getElementById("replay").onclick = () => {
    clearTimers();
    const keep = { lang: U.lang, mode: U.mode, names: U.names.slice(), uname: U.uname, target: U.target, theme: U.theme, botCount: U.botCount };
    U = Object.assign(freshUi(), keep, { screen: "SETUP" });
    render();
  };
};

/* ---------- showmanship helpers (RM-guarded) ---------- */
function flashScreen() {
  if (reduceMotion()) return;
  const f = document.createElement("div"); f.className = "flash"; document.body.appendChild(f);
  setTimeout(() => f.remove(), 500);
}
function shakeScreen() {
  if (reduceMotion()) return;
  app.classList.remove("shake"); void app.offsetWidth; app.classList.add("shake");
  setTimeout(() => app.classList.remove("shake"), 520);
}

function confetti() {
  const cols = ["var(--color-confetti-1)", "var(--color-confetti-2)", "var(--color-confetti-3)", "var(--color-confetti-4)", "var(--color-confetti-5)"];
  for (let i = 0; i < 80; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = cols[i % cols.length];
    c.style.animationDuration = (2 + Math.random() * 2) + "s";
    c.style.animationDelay = (Math.random() * 0.8) + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}

/* ---------- boot ---------- */
// ?fixture=NN (or #fixture=NN) boots straight into a posed screen from
// fixtures.js — the numbered-registry hook behind Lab/gallery.html and
// Tools/snap-screens.mjs (see Screens/SCREENS.md). No param → normal game.
const bootFx = getFixture(
  new URLSearchParams(location.search).get("fixture")
  ?? (location.hash.match(/^#fixture=(\d{2})$/)?.[1] ?? null),
);
if (bootFx) { U = bootFx.u; G = bootFx.g; }
render();
