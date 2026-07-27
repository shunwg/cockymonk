// ui.js — screen flow for the Lab. Lane B owns this file.
// Renders state; NEVER computes rules. Every scoring/option/win decision comes
// from engine.js (Lane A). Bot behavior comes from bots.js. Sounds from audio.js.
// Port of the frozen demo's flow + the PRD §5.4 omkamp the demo left out.

import {
  buildOptions, scoreRound, winCheck, omkampResolve, visibleOptionsFor, isValidBluff,
  bluffersExpected, votersExpected, readyToOpenVote,
} from "./engine.js";
import { TUNING, BOT_NAMES, botPick, bluffOffsets, voteOffsets } from "./bots.js";
import { pickFakes, safePool } from "./fakepool.js";
import { play, setMuted, isMuted, audioUnlock } from "./audio.js";
import { haptic, hapticsBindMute, hapticsCancel, wakeOn, wakeOff } from "./haptics.js";
import { THEMES, nextTheme } from "./themes.js";
import { STR, AVA, MINI_DECK, MINI_FAKES, esc, rnd, later, clearTimers, freshUi, newPid } from "./state.js";
import {
  TIMERS, defaultTimers, clockDeadline, clockArm, clockClear, clockLeft, clockSeconds,
  clockLevel, clockFraction, clockSkew,
} from "./clock.js";
import {
  RATING, ratingDeltas, ratingApply, ratingLoad, ratingSave, ratingReset,
  ratingNoseCap, ratingTier,
} from "./rating.js";
import {
  NET, NET_CONFIG, netLoopback, netHost, netJoin, netProject, netShareLink,
  netRoomFromUrl, netTally, netVotesIn, netBroadcastState, netBroadcastLobby, netJoinOpen,
} from "./net.js";
import {
  preloadCelebrations, playCelebration, mountLottie, clearCelebrations, reduceMotion, LANDMARK_FOR,
} from "./lottie.js";
import { getFixture } from "./fixtures.js";

/* ---------- state ---------- */
let U = freshUi();       // screen flow (Lane B)
let G = null;            // game data — mutated ONLY with engine.js results
let CONTENT = { deck: null, fakes: null }; // fetched real content, if served over http
let PROFILE = null;      // this device's career (rating.js); loaded once at boot
let lastScreen = null;   // gate the entrance animation to REAL screen changes (not surgical re-renders)

const t = (k, ...a) => { const v = STR[U.lang][k]; return typeof v === "function" ? v(...a) : v; };
const party = () => U.mode === "party";

// Seats stay the wire format — G.bluffs, G.votes, deltas and the engine's
// Array(playerCount) returns are all seat-keyed, and every vector assumes it.
// `pid` rides along as an ATTRIBUTE of a seat, so online can say "which seat am
// I?" without re-keying the rules. No stored map: n <= 8 and a second source of
// truth would be one more thing to keep in sync.
const seatOfPid = (pid) => (G ? G.players.findIndex((p) => p.pid === pid) : -1);
// Hotseat and practice put this device in seat 0, so this returns 0 and every
// call site below behaves exactly as it did before pids existed.
const mySeat = () => { const i = seatOfPid(U.myPid); return i === -1 ? 0 : i; };
const userIsGm = () => G.gm === mySeat();
const isBot = (i) => G?.players[i]?.kind === "bot";
const order = () => G.players.map((_, i) => i).filter((i) => i !== G.gm && !G.players[i].dropped);
// Both now come from engine.js so the timeout rule exists in exactly one place —
// the same predicates the reducer and the vectors use (LANES.md contract 1).
// G already carries every field they destructure.
const voteOrder = () => votersExpected(G);
const bluffOrder = () => bluffersExpected(G);
// Only the authority advances the game and fires a deadline. Local play is its
// own host, so this is true everywhere except on a joined client.
const isHost = () => NET.isHost;
const online = () => NET.kind !== "loopback";
const app = document.getElementById("app");

// The mark. Literal hexes, not tokens: this is the brand asset, it must render
// identically on every theme and in the standalone file:// bundle, and it is the
// one drawing the whole app copies. The avatar in components.css is the SAME
// face at 34–68 px (bevelled token · flat brows · dot eyes · smirk · capsule
// Nose) — change one, change both. The hard offset shadow is drawn in-SVG rather
// than via a CSS filter so the mark carries it everywhere it appears.
const LOGO = (sz = 26) => `<svg class="logo" width="${(sz * 1.447).toFixed(1)}" height="${sz}" viewBox="0 0 55 38" fill="none" role="img" aria-hidden="true">
  <g fill="#141425">
    <circle cx="18.8" cy="20.3" r="16"/>
    <rect x="18" y="19.2" width="34.2" height="7.7" rx="3.85"/>
  </g>
  <circle cx="20" cy="18.5" r="16" fill="#E8D5AE"/>
  <circle cx="21.4" cy="17.1" r="14.3" fill="#FFF6E8"/>
  <circle cx="20" cy="18.5" r="16" stroke="#23233B" stroke-width="2.8"/>
  <g stroke="#23233B" stroke-linecap="round" fill="none">
    <path d="M11 9 15.2 9.6" stroke-width="2"/><path d="M27.4 9 23.2 9.6" stroke-width="2"/>
    <path d="M15 26.2q3.2 3.4 6.6-.6" stroke-width="2.5"/>
  </g>
  <circle cx="13.3" cy="13.9" r="1.7" fill="#23233B"/><circle cx="25.1" cy="13.9" r="1.7" fill="#23233B"/>
  <rect x="19.2" y="17.4" width="34.2" height="5.2" rx="2.6" fill="#FF5C97" stroke="#23233B" stroke-width="2.5"/>
</svg>`;

// Every avatar in the app, from the 34 px author chip to the 68 px mascot. Six
// call sites used to hand-roll this markup with per-site pixel geometry, and two
// had already drifted (no mouth at all) — so the geometry now lives in exactly
// one place: components.css scales all of it off --fs. `notch` is the vote count
// the Nose is bragging about; the width formula is CSS's, not ours.
const face = ({ color, size = 34, mood = "", notch = 0, tone = "", grow = false, bob = false, brand = false }) =>
  `<span class="face ${mood}${bob ? " bob" : ""}" style="--fs:${size}px;--notch:${notch};background:${color}">
     <i class="brows"></i><i class="smile"></i>
     <i class="nose ${tone}${brand ? " brand" : ""}${grow ? " grow" : ""}"></i>
   </span>`;

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

/* ---------- phase clock (PRD §5.2a) ----------
   Every phase change goes through resetTimers(), which kills the bot schedule
   AND the countdown together. The countdown then re-arms itself for the phase
   it just entered, if timers are on at all. */

// Every phase change goes through here, so the siren dies here too. It has to:
// the element lives on document.body (shell() replaces app.innerHTML and would
// otherwise leave it stranded), and ckPaint — the only thing that turns it off —
// stops running the moment the clock is cleared. Without this line a phase that
// ends inside the last five seconds leaves the screen wailing into the next one.
const resetTimers = () => { clearTimers(); clockClear(); sirenClear(); };
const timersOn = () => Boolean(G?.timers?.on);

// The countdown's markup. Rendered inside a normal screen render; from then on
// only ckPaint() touches it (see below).
function clockHtml(labelKey) {
  if (!timersOn() || !G.deadline) return "";
  const left = clockLeft(G.deadline);
  return `<div class="clockwrap">
    <div class="clock ${clockLevel(left)}" id="clockring" role="timer" aria-live="off"
         style="--p:${clockFraction(G.deadline)}"><span class="clocknum">${clockSeconds(left)}</span></div>
    <span class="clocklabel">${t(labelKey)}</span>
    <span class="sr-live" id="clocksr" aria-live="assertive"></span>
  </div>`;
}

// THE surgical repaint. Writes one custom property, one text node and two
// classes — and NEVER calls render(), because shell() replaces app.innerHTML
// wholesale and would destroy the bluff textarea and the GM's half-typed
// decoys once a second. Same discipline as refreshGmAction()/botTickUI().
let ckSaid = null;
/* The last-five-seconds siren, ported from Ordkrig.

   GATED ON INACTION, NEVER ON THE CLOCK ALONE. This is principle 2 of the
   game-feel skill in its sharpest form: the effect claims "time is nearly up AND
   you have not acted". Fire it at someone who already submitted and it is
   telling them a lie about their own state, which is worse than not firing at
   all. The screen a player is on IS that fact — BLUFF/VOTE means they still owe
   an answer, WAIT/VOTEWAIT means they don't — so no extra bookkeeping, and a
   timed-out or late-joining spectator is excluded for free because they are
   already parked on a waiting screen.

   Surgical, like the rest of ckPaint: toggles one class on one fixed element and
   NEVER calls render(). This fires while someone is mid-sentence writing a lie
   (principle 3, defend the real-time moments) — a re-render here would eat the
   textarea, which is the whole reason ckPaint exists.

   The sound and the haptic are edge-triggered on ENTERING urgency, once. The
   pulse that follows is a state, not a beat. */
const ACTING_SCREENS = ["BLUFF", "VOTE", "GM_DASH"];
let sirenOn = false;

function sirenSet(active) {
  if (active === sirenOn) return;                 // edge only — no per-tick work
  sirenOn = active;
  let el = document.getElementById("siren");
  if (!el && active) {
    el = document.createElement("div");
    el.id = "siren";
    // Mounted with the class already on. A CSS *animation* plays from its own
    // keyframes the first time style is computed, so the usual
    // append-then-rAF-then-add-class dance buys nothing here — that trick exists
    // for transitions, which need a previous computed value to interpolate from.
    // Dropping it removes a frame of dependency on rAF running at all.
    el.className = "siren on";
    el.setAttribute("aria-hidden", "true");       // the countdown already announces itself
    document.body.appendChild(el);
  } else if (el) {
    el.classList.toggle("on", active);
  }
  if (active) { play("urgent"); haptic("warning"); }
}

function sirenClear() { sirenSet(false); document.getElementById("siren")?.remove(); }

function ckPaint(leftMs, level) {
  sirenSet(level === "urgent" && ACTING_SCREENS.includes(U.screen));
  const el = document.getElementById("clockring");
  if (!el) return;
  el.style.setProperty("--p", clockFraction(G.deadline) ?? 0);
  el.classList.toggle("warn", level === "warn");
  el.classList.toggle("urgent", level === "urgent");
  const num = el.querySelector(".clocknum");
  const secs = clockSeconds(leftMs);
  if (num) num.textContent = secs;
  // A silent countdown strands VoiceOver users (DESIGN.md §9). Two announcements
  // per phase, not sixty: one warning, one at zero.
  const sr = document.getElementById("clocksr");
  if (sr && (secs === 10 || secs === 0) && ckSaid !== secs) {
    ckSaid = secs;
    sr.textContent = secs === 0 ? t("timeUp") : t("tenLeft");
  }
}

// Swap just the countdown block when a NEW deadline is armed while the screen
// stays put (all bluffs in → the GM grace takes over). A full render here would
// wipe the GM's half-typed decoys, which is exactly what we're avoiding.
function refreshClock(labelKey) {
  const wrap = document.querySelector(".clockwrap");
  const html = clockHtml(labelKey);
  if (!wrap) return;
  if (!html) { wrap.remove(); return; }
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  wrap.replaceWith(tmp.firstElementChild);
}

// Arm the clock for the phase we just entered. `onExpire` is passed ONLY when
// this device is the authority — clients get null and merely paint, which is
// what makes a double-advance impossible rather than a race.
function armClock(phase, ms, onExpire) {
  clockClear();
  ckSaid = null;
  if (!timersOn()) { G.deadline = null; return; }
  G.deadline = clockDeadline(phase, ms, G.round);
  clockArm({ ...G.deadline, onTick: ckPaint, onExpire: isHost() ? onExpire : null });
}

// -- expiry handlers (host only) --

// Bluff window closed: whoever hasn't answered is skipped for THIS ROUND (D4),
// the GM's decoys settle as typed, and the vote opens. One deadline, both of
// the things the player was promised would happen at 0:00.
function onBluffDeadline() {
  if (U.screen === "REVEAL" || U.screen === "BOARD") return;
  const pending = bluffOrder().filter((i) => G.bluffs[i] === undefined);
  for (const i of pending) delete G.bluffs[i];
  G.timedOut.bluff = [...new Set([...G.timedOut.bluff, ...pending])];
  if (pending.length) play("error");
  autoOpenVote();
}

// Everyone answered early and the room is now only waiting on the GM to press
// the button. That wait gets its own, shorter grace.
function onDecoyDeadline() { autoOpenVote(); }

function autoOpenVote() {
  if (G.options) return;                       // already open — nothing to force
  resetTimers();
  G.gmDecoyDone = true;                        // whatever the GM typed stands (E8)
  play("cardShuffle"); play("voteOpen"); flashScreen();
  openVote();
  G.phase = "voting";
  U.screen = party() ? (userIsGm() ? "VOTEWAIT" : "VOTE") : "VOTE";
  armClock("voting", G.timers.voteMs, onVoteDeadline);
  render(); netPush();
  scheduleBotVotes();
}

// Vote window closed: a missing vote is simply absent, which scoreRound already
// handles — including flipping gmStole if the only truth-voter ran out of time.
function onVoteDeadline() {
  const pending = voteOrder().filter((i) => G.votes[i] === undefined);
  G.timedOut.vote = [...new Set([...G.timedOut.vote, ...pending])];
  if (pending.length) play("error");
  resetTimers();
  play("drumroll");
  later(() => { computeRound(); G.revealIdx = 0; U.screen = "REVEAL"; armRevealClock(); render(); netPush(); }, 600);
}

// The reveal paces itself if the GM stops tapping — the same courtesy a bot GM
// already extends, so this is only for a HUMAN GM. Re-armed per beat by
// doRevealStep, which arms before it renders (see the note there).
function armRevealClock() {
  const botPaced = party() && !userIsGm();
  if (botPaced || G.revealIdx >= revealSeq().length) { clockClear(); G.deadline = null; return; }
  armClock("reveal", G.timers.revealMs, doRevealStep);
}

// ORDERING RULE for every armClock caller: arm BEFORE render(). clockHtml reads
// G.deadline while building the markup, so arming afterwards paints a clock
// that isn't there yet — the countdown silently never appears.

const shuffled = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const takeFakeText = () => U.fakePool.pop() ?? "…";

/* ---------- shell ---------- */
const NO_THEME_BTN = ["HOME", "RULES", "ABOUT", "LANG", "MODE", "PLAYERS", "PARTYSETUP",
  "JOIN", "LOBBY_WAIT", "CONNLOST"];
const NO_HELP_BTN = [...NO_THEME_BTN, "SETUP"];
const CEREMONY_SCREENS = ["REVEAL", "BOARD", "WINNER"];

/* ---------- back navigation ----------
 * Deliberately NOT a history stack. 40+ sites assign U.screen directly, so
 * threading a stack through all of them is a refactor no gate would catch a miss
 * in. A parent map is plain data, read at render time, and needs zero changes to
 * those sites — the same shape U.rulesReturn already uses, generalised.
 *
 * Leaving a room is not just a screen change: the peer connection has to close,
 * or the host keeps a zombie seat and the room waits on someone who is gone.
 */
const IN_GAME = ["GM_INTRO", "GM_DASH", "BLUFF", "WAIT", "VOTE", "VOTEWAIT", "REVEAL", "BOARD", "OMKAMP"];

function backTarget() {
  const s = U.screen;
  if (s === "HOME") return null;                       // nowhere left to go
  if (s === "RULES" || s === "ABOUT" || s === "PROFILE") return { to: U.rulesReturn || "HOME" };
  if (s === "LANG" || s === "MODE") return { to: "HOME" };
  if (s === "PLAYERS" || s === "PARTYSETUP") return { to: "MODE" };
  if (s === "SETUP") return { to: online() ? "HOST_LOBBY" : (party() ? "PARTYSETUP" : "PLAYERS") };
  if (s === "JOIN") return { to: "PARTYSETUP", leave: true };
  if (s === "HOST_LOBBY" || s === "LOBBY_WAIT") return { to: "PARTYSETUP", leave: true };
  if (s === "CONNLOST") return { to: "HOME", leave: true };
  if (s === "WINNER") return { to: "HOME", leave: true };   // the game is over; nothing to confirm
  if (IN_GAME.includes(s)) return { to: "HOME", leave: true, confirm: true };
  return { to: "HOME" };
}

function goBack() {
  const b = backTarget();
  if (!b) return;
  if (b.confirm) { U.backConfirm = true; play("confirm"); render(); return; }
  backExit(b);
}

function backExit(b) {
  U.backConfirm = false;
  if (b.leave) {
    resetTimers();                 // a live deadline must not tick on into the menu
    hapticsCancel(); wakeOff();    // no pattern mid-flight, no lock held over the menu
    if (online()) NET.close?.();   // net.js close() restores loopback for us
    G = null;
  }
  play("back");
  U.screen = b.to;
  render();
}

// Confirm overlay for walking out mid-game. Un-numbered, like `hand()` — see the
// overlay table in Screens/SCREENS.md.
function confirmQuit() {
  const why = !online() ? t("quitBodyLocal") : isHost() ? t("quitBodyHost") : t("quitBodyOnline");
  const d = document.createElement("div");
  d.className = "handover"; d.id = "quitbox";
  d.innerHTML = `<h2>${t("quitTitle")}</h2><p class="sub" style="max-width:22rem">${why}</p>
    <button class="btn" id="qno" style="margin-top:22px;min-width:15rem">${t("quitNo")}</button>
    <button class="btn secondary" id="qyes" style="min-width:15rem">${t("quitYes")}</button>`;
  document.body.appendChild(d);
  const close = () => { d.remove(); U.backConfirm = false; };
  d.querySelector("#qno").onclick = () => { play("back"); close(); };
  d.querySelector("#qyes").onclick = () => { close(); backExit({ to: "HOME", leave: true }); };
}

/* The phone's own back gesture is the one people actually reach for, so keep one
 * spare history entry pushed and re-arm it after every pop: the gesture then
 * reaches goBack() instead of navigating off the game. At HOME we deliberately do
 * NOT re-arm, so a second press really does leave the page. pushState throws on
 * some file:// engines and the standalone bundle runs from disk — hence try/catch. */
function backArm() {
  try { globalThis.history?.pushState({ cm: 1 }, ""); } catch { /* file:// may refuse */ }
}
function backInstallHistory() {
  if (!globalThis.addEventListener) return;
  backArm();
  globalThis.addEventListener("popstate", () => {
    if (!backTarget()) return;     // at HOME: let the pop stand and the page unload
    backArm();
    if (document.getElementById("quitbox")) { document.getElementById("quitbox").remove(); U.backConfirm = false; return; }
    goBack();
  });
}

// The room event, plus a second line only on the device it happened to: being
// told "you'll sit this round out" matters to exactly one person, and reads as
// noise to everyone else.
function lateNoteHtml() {
  const lj = G?.lateJoin;
  if (!lj?.note) return "";
  const mine = lj.seat === mySeat();
  const benched = mine && (G.timedOut?.bluff?.includes(lj.seat) || G.timedOut?.vote?.includes(lj.seat));
  return `<div class="latenote" role="status">${lj.note}${benched ? `<br><span class="small">${t("lateNextRound")}</span>` : ""}</div>`;
}

function shell(inner, { gm = false } = {}) {
  clearCelebrations();   // no celebration bleeds into the next screen
  // Entrance animation only on a real screen change — surgical re-renders (tick-ins,
  // vote tally, reveal beats) must NOT replay the whole-screen fade.
  const changed = U.screen !== lastScreen;
  const fadeClass = changed ? (CEREMONY_SCREENS.includes(U.screen) ? "fade ceremony" : "fade") : "";
  lastScreen = U.screen;
  const canBack = !!backTarget();
  app.innerHTML = `
   <div class="topbar">
     <span style="display:flex;align-items:center;gap:8px;min-width:0">
       ${canBack ? `<button class="iconbtn backbtn" id="backbtn" aria-label="${t("back")}">←</button>` : ""}
       <span class="brand">${LOGO(22)}<span>${t("title")} <span class="small">· ${t("demo")}</span></span></span>
     </span>
     <span>
       ${NO_HELP_BTN.includes(U.screen) ? "" : `<button class="iconbtn" id="helpbtn" aria-label="${t("rulesTitle")}">?</button>`}
       ${NO_THEME_BTN.includes(U.screen) || (online() && !isHost()) ? "" : `<button class="iconbtn" id="themebtn">🎨</button>`}
       <button class="iconbtn" id="mutebtn">${isMuted() ? "🔇" : "🔊"}</button>
     </span>
   </div>
   ${lateNoteHtml()}
   <div class="${fadeClass}" style="flex:1;display:flex;flex-direction:column;">${inner}</div>`;
  app.style.boxShadow = gm ? "inset 0 0 0 4px var(--color-accent-gm)" : "none";
  const tb = document.getElementById("themebtn");
  if (tb) tb.onclick = () => { U.theme = nextTheme(U.theme); play("toggle"); render(); };
  const help = document.getElementById("helpbtn");
  if (help) help.onclick = () => { U.rulesReturn = U.screen; play("confirm"); U.screen = "RULES"; render(); };
  document.getElementById("mutebtn").onclick = () => {
    setMuted(!isMuted());
    // Persist, and confirm audibly on the way BACK ON — otherwise unmuting is the
    // one control in the app that gives no feedback that it worked.
    if (!isMuted()) { audioUnlock(); play("toggle"); }
    PROFILE = { ...PROFILE, muted: isMuted() };
    ratingSave(PROFILE);
    render();
  };
  const bb = document.getElementById("backbtn");
  if (bb) bb.onclick = () => goBack();
  // Re-attach after every repaint: shell() replaces app.innerHTML wholesale, and
  // the overlay lives on document.body so it survives that — put it back only if
  // the flag says it should be up.
  if (U.backConfirm && !document.getElementById("quitbox")) confirmQuit();
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
   <button class="linkbtn" id="hprofile">${t("homeProfile")} ${ratingPill()}</button>
   <button class="linkbtn" id="habout">${t("homeAbout")}</button>`);
  app.querySelectorAll("[data-lang]").forEach((b) => b.onclick = () => {
    if (U.lang === b.dataset.lang) return;
    U.lang = b.dataset.lang; play("toggle"); render();
  });
  document.getElementById("hnew").onclick = () => { play("confirm"); loadContent(U.lang); U.screen = "MODE"; render(); };
  document.getElementById("hrules").onclick = () => { U.rulesReturn = "HOME"; play("confirm"); U.screen = "RULES"; render(); };
  document.getElementById("hprofile").onclick = () => { U.rulesReturn = "HOME"; play("confirm"); U.screen = "PROFILE"; render(); };
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
     ${[1, 2, 3].map((n) => face({ color: "var(--color-avatar-2)", notch: n })).join("")}
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
   <button class="btn modebtn" data-mode="online">
     <span class="phones"><span class="phoneico"></span><span class="phoneico p2"></span><span class="phoneico p3"></span></span>
     <span><b>${t("modeOnline")}</b><small>${t("modeOnlineSub")}</small></span></button>
   <div style="flex:1"></div>`);
  app.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => {
    play("confirm");
    if (b.dataset.mode === "online") { netDoHost(); return; }   // creates the room, then the lobby
    U.mode = b.dataset.mode; U.screen = party() ? "PARTYSETUP" : "PLAYERS"; render();
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
  const forRoom = online() && isHost();
  shell(`${forRoom ? `<div class="banner gm">${t("lobbyRoomOf", esc(U.uname || "?"))} · ${t("lobbyPlayers", lobbyRoster().filter((p) => p.connected).length)}</div>
   <p class="small">${t("setupForRoom")}</p>` : ""}
   <h2>${t("length")}</h2>
   <div class="seg">${[["kort", 8], ["std", 15], ["mara", 25]].map(([k, v]) => `
     <button class="${U.target === v ? "on" : ""}" data-target="${v}">${t(k)}</button>`).join("")}</div>
   <h2>${t("theme")}</h2>
   <div class="seg">${Object.keys(THEMES).map((th) => `
     <button class="${U.theme === th ? "on" : ""}" data-theme="${th}">${t(THEMES[th].nameKey)}</button>`).join("")}</div>
   ${party() ? `
   <h2>${t("timerTitle")}</h2>
   <div class="seg">
     <button class="${U.timers.on ? "on" : ""}" data-timer="on">${t("timerOn")}</button>
     <button class="${U.timers.on ? "" : "on"}" data-timer="off">${t("timerOff")}</button>
   </div>
   ${U.timers.on ? `
   <p class="small" style="margin:10px 0 4px">${t("timerBluffLabel")}</p>
   <div class="seg">${TIMERS.BLUFF.choices.map((ms) => `
     <button class="${U.timers.bluffMs === ms ? "on" : ""}" data-bluffms="${ms}">${ms / 1000} s</button>`).join("")}</div>
   <p class="small" style="margin:10px 0 4px">${t("timerVoteLabel")}</p>
   <div class="seg">${TIMERS.VOTE.choices.map((ms) => `
     <button class="${U.timers.voteMs === ms ? "on" : ""}" data-votems="${ms}">${ms / 1000} s</button>`).join("")}</div>
   <p class="small">${t("timerHint")}</p>` : ""}` : ""}
   <div style="flex:1"></div><p class="small">${t("rules")}</p>
   <button class="btn" id="begin">${t("begin")}</button>
   ${forRoom ? `<button class="linkbtn" id="backlobby">${t("backToLobby")}</button>` : ""}
   <button class="linkbtn" id="setuprules">${t("homeHowTo")}</button>`);
  const bl = document.getElementById("backlobby");
  if (bl) bl.onclick = () => { U.screen = "HOST_LOBBY"; play("back"); render(); };
  app.querySelectorAll("[data-target]").forEach((b) => b.onclick = () => { U.target = Number(b.dataset.target); play("toggle"); render(); });
  app.querySelectorAll("[data-theme]").forEach((b) => b.onclick = () => { U.theme = b.dataset.theme; play("toggle"); render(); });
  app.querySelectorAll("[data-timer]").forEach((b) => b.onclick = () => { U.timers.on = b.dataset.timer === "on"; play("toggle"); render(); });
  app.querySelectorAll("[data-bluffms]").forEach((b) => b.onclick = () => {
    // The decoy grace scales with the bluff window so the GM isn't squeezed
    // when the host picks a fast game.
    U.timers.bluffMs = Number(b.dataset.bluffms);
    U.timers.decoyMs = Math.min(U.timers.bluffMs, TIMERS.DECOY.default);
    play("toggle"); render();
  });
  app.querySelectorAll("[data-votems]").forEach((b) => b.onclick = () => { U.timers.voteMs = Number(b.dataset.votems); play("toggle"); render(); });
  // Online: seat the room first, then start. Local: straight in.
  document.getElementById("begin").onclick = () => (online() && isHost() ? netStartRoom() : startGame());
  document.getElementById("setuprules").onclick = () => { U.rulesReturn = "SETUP"; play("confirm"); U.screen = "RULES"; render(); };
};

/* ---------- game lifecycle ---------- */
function startGame() {
  preloadCelebrations();       // warm the Lottie cache before the first Mål/win
  U.deck = shuffled(CONTENT.deck ?? MINI_DECK[U.lang]);
  // This G literal is mirrored by fxMakeG() in fixtures.js — keep the two in sync.
  G = {
    players: U.names.map((name, i) => {
      // Online: the first N seats are the real peers from the lobby, in join
      // order, host first. Everything after them is a bot filling a chair.
      const netPid = U.netSeats?.[i] ?? null;
      const bot = netPid ? false : (party() && i > 0);
      return {
        name, color: AVA[i], score: 0, bluffVotes: 0, dropped: false,
        // Seat 0 is this device in local play; online it is whichever pid the
        // lobby put there. Bots and other hands on the same phone don't need an
        // identity that outlives the game.
        pid: netPid ?? (i === 0 ? U.myPid : (bot ? `bot:${i}` : `local:${i}`)),
        kind: netPid ? (netPid === U.myPid ? "human" : "remote") : (bot ? "bot" : "human"),
      };
    }),
    target: U.target,
    theme: U.theme,          // the room shares one board (PRD §6) — it travels with G
    round: 0,
    gm: 0,                       // the host/user (seat 0) is always the first GM
    phase: "card",               // engine.js PHASES — what the ROOM is doing, vs U.screen (what THIS device shows)
    card: null, bluffs: {}, decoys: ["", ""], gmDecoyDone: false,
    options: null, doubles: [], votes: {}, deltas: null, gmStole: false,
    revealIdx: 0,                // lives in G, not U: the whole room watches the same beat (PRD §10)
    timedOut: { bluff: [], vote: [] },   // per round, cleared by newRound (D4)
    deadline: null,              // { at, phase, round, totalMs } — an absolute time, never "seconds left"
    // On for party/practice, off for hotseat: passing one phone round a table
    // paces itself, and a clock there just adds stress to the couch mode that
    // never needed it (PRD §5.2a). U.timers holds the host's setup choices.
    timers: { ...defaultTimers(), ...U.timers, on: party() ? U.timers.on : false },
    inOmkamp: false, omkampParticipants: [], preOmkampScores: null,
    goalCelebrated: false, celebrated: false, awaitingNext: false, ratingDone: false,
    lm33: false, lm66: false,   // DESIGN §3 thirds — once per GAME, not per round
    // The door stays open this long for people who had the link but were slow.
    // Absolute time, like G.deadline, so it survives the hop to a client with a
    // differently-set clock. Only the HOST ever judges it (netSeatLate).
    joinOpenUntil: Date.now() + NET_CONFIG.LATE_JOIN_MS,
    // { note, seat } for the last latecomer. In G, not U, because it is a ROOM
    // event: the person it happened to is on another device, and they are the one
    // who most needs to hear that they inherited a bot's points.
    lateJoin: null,
  };
  // A phone passed round a table is stared at between taps; without this the
  // screen dims mid-round and the GM has to wake it to open the vote.
  wakeOn();
  newRound();
}

/* ---------- late join (3-minute window after start) ----------
 * A friend who opens the link 40 seconds late used to reach a dead end: the host
 * seated them in NET.peers but G.players was already built, so netBroadcastState
 * skipped them (seat < 0) and they sat on "waiting for the host" forever.
 *
 * Taking a BOT's chair is the preferred outcome, not a fallback: it keeps
 * G.players.length stable — which is what every engine vector and scoreRound's
 * Array(playerCount) assume — and "du tok over Kåres plass" is a better story
 * than an extra chair appearing. They inherit the bot's score, which the banner
 * says out loud; silently resetting it to 0 would hop a pawn backwards and read
 * as a bug.
 */
function netSeatLate(msg) {
  if (!netJoinOpen(G)) return { ok: false, reason: "started" };
  const botSeat = G.players.findIndex((p) => p.kind === "bot" && !p.dropped);
  const name = String(msg.name ?? "?").slice(0, 24) || "?";
  let seat, tookFrom = null;

  if (botSeat >= 0) {
    tookFrom = G.players[botSeat].name;
    Object.assign(G.players[botSeat], { name, pid: msg.pid, kind: "remote" });
    seat = botSeat;
  } else if (G.players.length < NET_CONFIG.MAX_PLAYERS) {
    seat = G.players.length;
    G.players.push({
      name, color: AVA[seat], score: 0, bluffVotes: 0, dropped: false,
      pid: msg.pid, kind: "remote",
    });
  } else return { ok: false, reason: "full" };

  // Past the card reveal, this round is already in motion: they watch it out and
  // play from the next one. timedOut is exactly the right vehicle — it means "not
  // expected this round, and NOT dropped" (vectors D4/E9) and newRound clears it.
  // Without this, bluffersExpected/votersExpected would wait forever on someone
  // who was parking a car when the word was drawn.
  if (G.phase !== "card") {
    if (!G.timedOut.bluff.includes(seat)) G.timedOut.bluff.push(seat);
    if (!G.timedOut.vote.includes(seat)) G.timedOut.vote.push(seat);
  }
  G.lateJoin = {
    note: tookFrom ? t("lateTookSeat", esc(name), esc(tookFrom)) : t("lateJoined", esc(name)),
    seat,
  };
  play("tickIn");
  return { ok: true, seat, tookFrom };
}

function newRound() {
  resetTimers();
  G.awaitingNext = false;                // this round's board starts locked until its ceremony ends
  G.round++;
  if (!U.deck.length) U.deck = shuffled(CONTENT.deck ?? MINI_DECK[U.lang]);
  G.card = U.deck.pop();
  // Bot lies are REAL explanations of OTHER deck words (fakepool.js), so they
  // match the truth's length and voice by construction instead of by tuning.
  // Drawn once per round for the whole lineup, because the close/random split
  // is a property of the SET — picking one at a time cannot express it.
  U.fakePool = pickFakes({
    n: G.players.length + 2,                 // every seat could be a bot, plus the GM decoy and a spare
    card: G.card,
    pool: safePool({ deck: CONTENT.deck ?? MINI_DECK[U.lang], remaining: U.deck, card: G.card }),
    filler: CONTENT.fakes ?? MINI_FAKES[U.lang],
    lang: U.lang,
  });
  G.bluffs = {}; G.votes = {}; G.decoys = ["", ""]; G.doubles = []; G.deltas = null; G.gmStole = false;
  G.options = null;
  G.timedOut = { bluff: [], vote: [] };     // a missed deadline never outlives its round (D4)
  G.deadline = null;
  G.phase = "card";
  G.gmDecoyDone = !(party() && G.gm !== mySeat()); // human GM settles decoys by pressing "open vote"
  U.voteIdx = 0; G.revealIdx = 0; U.draftBluff = "";
  G.lateJoin = null;                        // a joiner announcement lasts its round, no longer
  U.screen = "GM_INTRO"; play("cardDraw"); render(); netPush();
  // Bot GM auto-advances. A REMOTE gm does not: that person taps on their own
  // device, and their tap arrives as a state broadcast.
  if (party() && !userIsGm() && isBot(G.gm)) later(() => { if (U.screen === "GM_INTRO") enterBluffing(); }, TUNING.GM_INTRO_AUTO_MS);
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
       ${face({ color: gm.color, size: 68, tone: "violet", brand: true, bob: true })}</div>
   </div>
   ${party() && !userIsGm()
    ? `<p class="small" style="text-align:center">…</p>`
    : `<button class="btn gm" id="togm">${t("next")}</button>`}`);
  const b = document.getElementById("togm");
  if (b) b.onclick = () => {
    play("confirm"); G.phase = "bluffing"; U.screen = "GM_DASH";
    // The GM sees the same clock the bluffers do. FLOW.md's original proposal
    // said "not on the dashboard" — that held while only bluffers were on a
    // deadline. Now the GM has one too, and an unseen deadline is a trap.
    armClock("bluff", G.timers.bluffMs, onBluffDeadline);
    render(); netPush();          // this tap is what opens the floor to everyone
    if (party()) scheduleBotBluffs();
  };
};

function scheduleBotBluffs() {
  const bots = bluffOrder().filter((i) => isBot(i));
  const offsets = bluffOffsets(bots.length, Math.random);
  bots.forEach((i, k) => {
    later(() => {
      // Re-check the seat is STILL a bot: a late joiner may have taken this chair
      // since the timer was armed, and a bot fake must never be submitted as a
      // human's answer.
      if (!isBot(i) || G.bluffs[i] !== undefined) return;
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
  if (!allBluffsSubmitted()) return;
  // Everyone has answered, so the room is now waiting on the GM alone — the
  // clock switches to the shorter GM grace. This is the case PRD §5.2a means
  // by "GM doesn't add a decoy in time": a slow bot GM, or a human GM who
  // hasn't pressed the button yet.
  if (timersOn() && !G.options) { armClock("decoy", G.timers.decoyMs, onDecoyDeadline); refreshClock("clockDecoy"); }
  if (!G.gmDecoyDone) return;                          // decoy gating (PRD §5.5)
  if (U.screen === "WAIT") {
    later(() => { if (!G.options) autoOpenVote(); }, TUNING.GM_SHUFFLE_MS);
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
   ${clockHtml("clockDecoy")}
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
  resetTimers();
  play("cardShuffle"); play("voteOpen"); flashScreen();   // the showstopper (PRD §11)
  G.gmDecoyDone = true;
  openVote();
  G.phase = "voting";
  if (party()) { U.screen = "VOTEWAIT"; armClock("voting", G.timers.voteMs, onVoteDeadline); render(); netPush(); scheduleBotVotes(); }
  // Hotseat: the vote clock starts when the phone actually reaches the first
  // voter, not while it is still being passed. (Timers are off in hotseat by
  // default anyway — but if a host turns them on, this is the fair reading.)
  else { const first = G.players[voteOrder()[0]].name; hand(first, () => { U.screen = "VOTE"; armClock("voting", G.timers.voteMs, onVoteDeadline); render(); }); }
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
  G.phase = "bluffing";
  U.cur = mySeat(); U.screen = "BLUFF";
  armClock("bluff", G.timers.bluffMs, onBluffDeadline);
  render(); netPush();
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
   ${clockHtml("clockBluff")}
   <textarea id="btxt" maxlength="140" placeholder="${t("bluffPh")}">${esc(U.draftBluff)}</textarea>
   <p class="small" id="berr"></p>
   <div style="flex:1"></div>
   <button class="btn" id="lock">${t("lockIn")}</button>`);
  const ta = document.getElementById("btxt");
  ta.focus();
  // Mirror every keystroke into U so a re-render can never eat a half-written
  // lie. ckPaint deliberately avoids render(), but a bot tick-in or an arriving
  // broadcast still can — and losing a sentence you were mid-way through is the
  // kind of bug that ends a game night. Same trick the decoy inputs already use.
  ta.oninput = () => { U.draftBluff = ta.value; };
  document.getElementById("lock").onclick = () => {
    const v = document.getElementById("btxt").value;
    if (!isValidBluff(v)) { document.getElementById("berr").textContent = t("emptyBluff"); play("error"); return; }
    if (G.timedOut.bluff.includes(U.cur)) { document.getElementById("berr").textContent = t("tooLate"); play("error"); return; }
    // On a client this is an INTENT, not a fact: the host re-judges it against
    // its own clock and its own state, then tells us what happened.
    if (!isHost()) {
      NET.send({ t: "bluff", pid: U.myPid, text: v.trim() });
      U.draftBluff = ""; play("tickIn"); U.screen = "WAIT"; render();
      return;
    }
    G.bluffs[U.cur] = v.trim(); U.draftBluff = ""; play("tickIn");
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
   ${clockHtml("clockWait")}
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
     ${face({ color: G.players[mySeat()].color, size: 60, mood: "suspicious", brand: true, bob: true })}
   </div>`);
};

/* ---------- voting ---------- */
function scheduleBotVotes() {
  const bots = voteOrder().filter((i) => isBot(i));
  const offsets = voteOffsets(bots.length, Math.random);
  bots.forEach((i, k) => {
    later(() => {
      if (!isBot(i) || G.votes[i] !== undefined) return;   // chair may have changed hands
      G.votes[i] = botPick(G.options, i, Math.random); play("voteCast");
      if (U.screen === "VOTEWAIT") render();
      maybeAllVotesIn();
    }, offsets[k]);
  });
}

function maybeAllVotesIn() {
  if (voteOrder().some((i) => G.votes[i] === undefined)) return;
  resetTimers();
  play("drumroll");                      // tension roll as the votes close and the reveal opens
  later(() => {
    computeRound(); G.revealIdx = 0; U.screen = "REVEAL"; render(); netPush();
    if (party() && !userIsGm() && isBot(G.gm)) later(autoReveal, 1400);
    else armRevealClock();     // a human GM gets a clock; a bot GM already self-paces
  }, 600);
}

/* The word, kept on screen wherever a player is deciding or watching.
   It used to appear on GM_DASH, BLUFF and WAIT and then vanish — so you chose
   which explanation fitted an obscure Norwegian word with the word itself no
   longer in front of you, and watched the truth land the same way. That asks the
   player to hold state the game is perfectly able to hold, and it costs Åse (62,
   Dynamic Type XL, half-listening to the room) far more than it costs anyone
   else. Compact rather than the full hero card: at this point it is a reference,
   not the headline. */
const wordChip = () => !G?.card?.prompt ? "" : `
   <div class="wordchip"><span class="eyebrow">${t("theWord")}</span>
     <span class="w">${esc(G.card.prompt)}</span></div>`;

SCREENS.VOTE = () => {
  const voter = party() ? mySeat() : voteOrder()[U.voteIdx];
  const p = G.players[voter];
  const visible = visibleOptionsFor(G.options, voter);
  shell(`
   <div class="banner" style="background:${p.color};color:var(--color-text-on-surface)">
     ${party() ? t("yourVote") : t("votingTime", esc(p.name))}</div>
   ${wordChip()}
   <p class="small">${t("cantOwn")}</p>
   ${clockHtml("clockVote")}
   ${G.options.map((o, i) => !visible.includes(o) ? "" : `
     <div class="opt stagger" style="animation-delay:${i * 70}ms" data-opt="${o.id}">
       <div class="letter">${o.letter}</div><div>${esc(o.text)}</div></div>`).join("")}`);
  app.querySelectorAll("[data-opt]").forEach((el) => el.onclick = () => castVote(voter, el.dataset.opt));
};

function castVote(voter, optionId) {
  play("voteCast");
  if (!isHost()) {                     // intent, judged by the host (see above)
    NET.send({ t: "vote", pid: U.myPid, option: optionId });
    U.screen = "VOTEWAIT"; render();
    return;
  }
  G.votes[voter] = optionId;
  if (party()) { U.screen = "VOTEWAIT"; render(); maybeAllVotesIn(); }
  else {
    U.voteIdx++;
    const vo = voteOrder();
    if (U.voteIdx < vo.length) hand(G.players[vo[U.voteIdx]].name, () => render());
    else hand(G.players[G.gm].name, () => { computeRound(); G.revealIdx = 0; U.screen = "REVEAL"; render(); });
  }
}

SCREENS.VOTEWAIT = () => {
  const n = netVotesIn(G), total = voteOrder().length;
  shell(`
   <h2>${t("votesIn")} <span class="small">${n}/${total}</span></h2>
   ${wordChip()}
   ${userIsGm() ? "" : `<div class="banner green">${t("youVoted")}</div>`}
   ${clockHtml("clockVote")}
   ${G.options.map((o) => {
     const c = netTally(G, o.id);
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
  G.phase = "reveal";            // the truth may now travel (netProject, C9)
  result.bluffVotes.forEach((n, i) => { G.players[i].bluffVotes += n; });
  if (G.doubles.length) setTimeout(() => play("doubleHit"), 400);   // surprise sparkle as the reveal opens
}

/* ---------- reveal ceremony ---------- */
const revealSeq = () => [...G.options.filter((o) => o.kind !== "truth"), G.options.find((o) => o.kind === "truth")];

SCREENS.REVEAL = () => {
  const seq = revealSeq();
  const shown = seq.slice(0, G.revealIdx);
  const done = G.revealIdx >= seq.length;
  const hostIsBot = party() && !userIsGm();
  shell(`
   <h2>${t("revealTitle")} <span class="small">· ${G.inOmkamp ? t("omkamp") : t("roundN", G.round)}</span></h2>
   ${wordChip()}
   ${done ? "" : clockHtml("clockReveal")}
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
         <div class="votedots">${voters.map((v) => `<span class="dot${isLast ? " land" : ""}" title="${esc(v.name)}" style="background:${v.color}"></span>`).join("")}
           <span class="small">${voters.length} ${t("votes")}</span></div>
         ${!isT ? `<div class="author">
            ${o.authors.map((a) => {
              const pl = G.players[a]; const gmA = a === G.gm;
              // .face.smug was written for exactly this and never used: the GM who
              // just took the round finally smirks about it. Only once the truth is
              // out — before that nobody knows they stole anything.
              const mood = gmA && done && G.gmStole ? "smug" : "";
              return `${face({ color: pl.color, notch: voters.length, grow: true, mood, tone: gmA ? "violet" : "" })}
                      <span>${t("by")} ${a === mySeat() && party() ? t("you") : esc(pl.name)}${gmA ? ` · <span style="color:var(--color-accent-gm)">${t("gmDecoy")}</span>` : ""}</span>`;
            }).join("")}
          </div>` : ""}
       </div></div>`;
   }).join("")}
   </div>
   ${done && G.gmStole ? `<div class="banner gm">😈 ${t("gmSteal")}</div>` : ""}
   <div style="flex:1"></div>
   ${!isHost()
    // Online: only the game master paces the ceremony. Giving a client its own
    // advance button lets it run ahead of the room — the opposite of the synced
    // spectacle in PRD §10, and it desyncs until the next broadcast lands.
    ? `<p class="small" style="text-align:center">${t("shuffling")}</p>`
    : done
      ? `<button class="btn" id="toboard">${t("toBoard")}</button>`
      : `<button class="btn gm" id="revealnext">${hostIsBot ? t("skip") : t("tapReveal")}</button>`}`,
  { gm: userIsGm() || !party() });
  const tb = document.getElementById("toboard");
  if (tb) tb.onclick = goBoard;
  const rn = document.getElementById("revealnext");
  if (rn) rn.onclick = () => {
    resetTimers(); doRevealStep();   // re-arms the beat clock itself
    if (party() && !userIsGm() && G.revealIdx < revealSeq().length) later(autoReveal, TUNING.REVEAL_BEAT_MS);
  };
};

function doRevealStep() {
  const seq = revealSeq();
  if (G.revealIdx >= seq.length) return;
  const isTruth = G.revealIdx === seq.length - 1;
  G.revealIdx++;
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
    const o = seq[G.revealIdx - 1];
    const v = Object.values(G.votes).filter((id) => id === o.id).length;
    play("noseGrow", v);
  }
  armRevealClock();   // next beat's deadline must exist BEFORE we paint it
  render(); netPush();
}

function autoReveal() {
  if (U.screen !== "REVEAL") return;
  doRevealStep();
  if (G.revealIdx < revealSeq().length) later(autoReveal, TUNING.REVEAL_BEAT_MS);
  else later(goBoard, TUNING.REVEAL_TO_BOARD_MS);
}

function goBoard() {
  if (U.screen === "BOARD") return;
  resetTimers(); play("confirm");
  G.phase = "board";
  U.screen = "BOARD"; render(); netPush();
  // animateBoard mutates scores as it hops (see below). A broadcast mid-hop
  // would clobber a client halfway through its own identical animation, so the
  // room goes quiet until finishRound sends one authoritative state.
  NET.quiet = true;
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

// A board space by target number — spaces carry data-i (drawBoard, :1146).
const spaceEl = (n) => document.querySelector(`.space[data-i="${n}"]`);

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

// Motion durations live in DesignSystem/tokens.json and reach us as CSS custom
// properties. Reading them back beats re-declaring the number in JS: the audit
// found 330 and 70 hardcoded here as silent duplicates of tokens that already
// held the same values, which is exactly how the two drift apart later.
function msToken(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? (raw.endsWith("ms") || !raw.endsWith("s") ? n : n * 1000) : fallback;
}

function animateBoard() {
  const earners = G.players.map((_, i) => i).filter((i) => G.deltas?.[i] > 0);
  const lead = 300, gap = 250;
  const totalHops = earners.reduce((s, i) => s + G.deltas[i], 0);

  /* PRD §11 makes "board phase ≤ 20 s" a success criterion and tokens.json says
     the hop "compresses under the 20 s board cap" — but nothing read the cap, so
     a big round with several earners simply ran as long as it ran. Now the
     cadence is whatever fits: the ceremony keeps its shape and loses its
     slowness, rather than being truncated mid-hop. Floored at 90 ms because
     below that the squash-and-stretch stops reading as a hop at all. */
  const cap = msToken("--motion-dur-board-phase-cap", 20000);
  const want = msToken("--motion-dur-pawn-hop-cadence", 330);
  const budget = cap - lead - gap * earners.length;
  const cadence = totalHops > 0
    ? Math.max(90, Math.min(want, Math.floor(budget / totalHops)))
    : want;

  let e = 0;
  const nextEarner = () => {
    if (e >= earners.length) return finishRound();
    const i = earners[e++];
    let steps = G.deltas[i];
    play("points");                    // one cha-ching as this player's points land
    const hop = () => {
      if (steps-- <= 0) { markLeader(); return setTimeout(nextEarner, gap); }
      const before = G.players[i].score;
      G.players[i].score++;
      const after = G.players[i].score;
      play("pawnHop");
      // DESIGN.md §3 gives every theme a ⅓ and a ⅔ landmark (coffee table and
      // grandfather clock · treeline and snowline · satellite and asteroid belt).
      // They were drawn on the board as emoji badges and then never fired.
      // Once per game each, on the FIRST pawn to pass them — a landmark you reach
      // twice is scenery, not a milestone.
      for (const frac of [1 / 3, 2 / 3]) {
        const at = Math.floor(G.target * frac);
        const key = "lm" + Math.round(frac * 100);
        if (at > 0 && before < at && after >= at && !G[key]) {
          G[key] = true;
          play("doubleHit");           // a small bright sparkle, not a celebration
          haptic("light");
          const el = spaceEl(at);
          if (el && !reduceMotion()) {
            el.classList.remove("landmark"); void el.offsetWidth; el.classList.add("landmark");
            setTimeout(() => el.classList.remove("landmark"), 900);
          }
        }
      }
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
        ], { duration: cadence, easing: "cubic-bezier(0.34,1.405,0.64,1)" });  // never outlast its own cadence
        setTimeout(() => el.classList.remove("hopping"), cadence + 20);
        // Overtake: any stationary pawn this hop just passed does an indignant wobble.
        G.players.forEach((p, j) => {
          if (j !== i && before <= p.score && after > p.score) {
            const pj = pawnEl(j); pj.classList.remove("wobble"); void pj.offsetWidth; pj.classList.add("wobble");
            // Read the token the .wobble animation itself runs on. Hardcoding it
            // here means retuning the wobble silently leaves the class attached
            // (too short) or strips it mid-animation (too long).
            setTimeout(() => pj.classList.remove("wobble"), msToken("--motion-dur-overtake-wobble", 420));
            play("overtake");
          }
        });
      }
      const sc = document.getElementById("sc" + i);
      if (sc) sc.textContent = after + " " + t("pts");
      setTimeout(hop, cadence);   // from the token, compressed to fit the 20 s cap
    };
    hop();
  };
  setTimeout(nextEarner, lead);
}

function finishRound() {
  G.deltas = null;
  NET.quiet = false;      // the hop chain is done; one authoritative state now

  if (G.inOmkamp) {
    // One sudden-death round only: highest tied participant wins, still-tied → shared.
    const result = omkampResolve({
      scores: G.preOmkampScores,
      participants: G.omkampParticipants,
      deltas: Object.fromEntries(G.players.map((p, i) => [i, p.score - G.preOmkampScores[i]])),
    });
    G.winnersIdx = result.winners; G.shared = result.shared;
    G.phase = "winner";
    U.screen = "WINNER"; play("truthReveal"); render(); netPush();
    return;
  }

  const scores = G.players.map((p) => p.score);
  const check = winCheck({ scores, round: G.round, playerCount: G.players.length, target: G.target });
  if (check.winners) {
    G.winnersIdx = check.winners; G.shared = check.winners.length > 1;
    G.phase = "winner";
    U.screen = "WINNER"; play("truthReveal"); render(); netPush();
    return;
  }
  if (check.omkamp) {
    G.inOmkamp = true;
    G.omkampParticipants = check.omkamp.participants;
    G.preOmkampScores = scores.slice();
    G.gm = check.omkamp.gm;
    G.phase = "omkamp";
    U.screen = "OMKAMP"; play("gmSting"); render(); netPush();
    return;
  }
  G.awaitingNext = true;                 // survives topbar re-renders (mute/theme) — no soft-lock
  netPush();                             // clients need the final scores + the armed Next
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
       ${face({ color: liar.color, size: 48, mood: "delighted", notch: liar.bluffVotes, grow: true, tone: "gold" })}
       <b>${t("goldNose", esc(liar.name))} (👃 ${liar.bluffVotes})</b>
       <span class="gullnese-fx" id="gullnesefx"></span></div>
     <div style="margin-top:14px">${[...G.players].sort((a, b) => b.score - a.score).map((p) => `
        <div class="scoreline"><span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color}"></span> ${esc(p.name)}</span><span>${p.score} ${t("pts")}</span></div>`).join("")}</div>
     ${G.ratingMine === undefined ? "" : `<p class="small" style="margin-top:10px">${t("ratingDelta", G.ratingMine)} → ${PROFILE.rating} · ${esc(ratingTier(PROFILE.rating, U.lang))}</p>`}
   </div>
   <button class="btn" id="replay">${t("playAgain")}</button>`);
  settleRating();
  wakeOff();          // the game is over; stop holding the screen awake
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
    resetTimers();
    const keep = { lang: U.lang, mode: U.mode, names: U.names.slice(), uname: U.uname, target: U.target, theme: U.theme, botCount: U.botCount, myPid: U.myPid };
    U = Object.assign(freshUi(), keep, { screen: "SETUP" });
    render();
  };
};

/* ---------- online rooms (PRD §2.1) ----------
   Two rules, and everything else follows from them:
     1. Only the host advances the game. Clients send intents and render.
     2. State leaves the host only through netProject (net.js).
   Because the host broadcasts whole (redacted) state and render() already draws
   everything from state, a client needs no reconciliation — it swaps G and
   re-renders. The screen it lands on is DERIVED from that state, not sent, so a
   dropped or reordered message can't strand anyone on the wrong screen. */

// Which screen this seat should be looking at, given what the room is doing.
function screenForSeat(g, seat) {
  switch (g.phase) {
    case "card": return "GM_INTRO";
    // timedOut has to be consulted here, not just "did they submit". Otherwise the
    // next broadcast puts a player who missed the deadline (or joined late) back on
    // an input screen whose submission the host will reject — an unwinnable box.
    case "bluffing":
      if (seat === g.gm) return "GM_DASH";
      if (g.timedOut?.bluff?.includes(seat)) return "WAIT";
      return g.bluffs?.[seat] !== undefined || (g.bluffsIn ?? []).includes(seat) ? "WAIT" : "BLUFF";
    case "voting":
      if (g.timedOut?.vote?.includes(seat)) return "VOTEWAIT";
      return seat === g.gm || g.votes?.[seat] !== undefined ? "VOTEWAIT" : "VOTE";
    case "reveal": return "REVEAL";
    case "board": return "BOARD";
    case "omkamp": return "OMKAMP";
    case "winner": return "WINNER";
    default: return "GM_INTRO";
  }
}

// Host: push the room forward. Called after any state change worth sharing.
function netPush() {
  if (!online() || !isHost() || !G) return;
  netBroadcastState(G, U);
}

// Host: accept an intent from a client. Every one is re-judged here — the host's
// clock decides what is late, not the sender's (a client could lie about either).
function netOnClientMessage(msg, conn) {
  if (!G || !isHost()) return;
  let seat = G.players.findIndex((p) => p.pid === msg.pid);
  // A hello with no seat means someone arrived after startGame(). Either the door
  // is still open and we seat them, or we say so plainly and let them go play
  // bots — never the old silent return, which stranded them on LOBBY_WAIT.
  if (seat < 0) {
    if (msg.t !== "hello") return;
    const r = netSeatLate(msg);
    if (!r.ok) { NET.sendTo(msg.pid, { t: "bye", reason: r.reason }); return; }
    seat = r.seat;
    netBroadcastLobby();
    netPush();
    render();
    return;
  }
  switch (msg.t) {
    case "bluff": {
      if (G.phase !== "bluffing") return;
      if (G.timedOut.bluff.includes(seat) || G.bluffs[seat] !== undefined) return;  // late or duplicate
      if (!isValidBluff(msg.text)) return;
      G.bluffs[seat] = String(msg.text).slice(0, 140).trim();
      play("tickIn"); botTickUI(seat); netPush(); maybeAllBluffsIn();
      return;
    }
    case "vote": {
      if (G.phase !== "voting") return;
      if (G.timedOut.vote.includes(seat) || G.votes[seat] !== undefined) return;
      const visible = visibleOptionsFor(G.options ?? [], seat);
      if (!visible.some((o) => o.id === msg.option)) return;   // not an option they may pick
      G.votes[seat] = msg.option;
      play("voteCast");
      if (U.screen === "VOTEWAIT") render();
      netPush(); maybeAllVotesIn();
      return;
    }
    default: return;
  }
}

// Client: adopt what the host says. This is the whole client-side game loop.
function netOnHostState(msg) {
  if (!msg.g) return;
  G = msg.g;
  // A client never walked through mode selection, so U.mode is still null and
  // party() would report false — which shows it a GM's "Neste" button it must
  // not have, and routes it down the hotseat handover path. Online IS the
  // party-shaped flow; say so the moment the first state lands.
  U.mode = "party";
  // The bluff and vote screens render "whose turn is it" from U.cur, which only
  // the host advances. On a client that must simply mean "me" — otherwise your
  // own answer screen wears the game master's name and colour.
  U.cur = mySeat();
  if (G.theme) U.theme = G.theme;   // everyone sits at the same table
  NET.skewMs = clockSkew(msg.t0 ?? Date.now());
  const seat = mySeat();
  const next = screenForSeat(G, seat);
  // Never yank someone off a screen they're mid-input on unless the phase moved.
  const typing = U.screen === "BLUFF" && next === "BLUFF";
  if (!typing) U.screen = next;
  // Clients paint the countdown but never fire it (net.js / clock.js).
  if (G.deadline && G.timers?.on) {
    clockArm({ ...G.deadline, skewMs: NET.skewMs, onTick: ckPaint, onExpire: null });
  } else clockClear();
  render();
}

function netHandle(msg, conn) {
  if (!msg?.t) return;
  if (isHost()) { netOnClientMessage(msg, conn); return; }
  // The host renamed us because our id collided with someone already seated
  // (a shared browser profile). Adopt it, or we'd never find our own seat.
  if (msg.t === "rebind") { U.myPid = msg.pid; NET.myPid = msg.pid; return; }
  if (msg.t === "state") { netOnHostState(msg); return; }
  if (msg.t === "ratings") { netApplyRatings(msg); return; }
  // "started"/"full" are not connection failures — the room simply said no. Send
  // them back to JOIN with the real reason and the play-vs-bots way out, rather
  // than to CONNLOST, which offers a reconnect that will never succeed.
  if (msg.t === "bye") {
    if (msg.reason === "started" || msg.reason === "full") {
      NET.close?.();
      U.joinError = msg.reason === "started" ? "joinFailStarted" : "joinFailFull";
      U.joining = false; U.screen = "JOIN"; render();
      return;
    }
    netFail("host-gone");
    return;
  }
}

function netFail(reason) {
  NET.error = reason;
  U.screen = "CONNLOST";
  U.lostAt = Date.now();
  render();
}

// Host: seat everyone and start. Bots fill any empty chairs, which is what makes
// the room playable with two friends instead of demanding five.
//
// Called from screen 06, NOT from the lobby: the online path used to jump
// straight into the game, so a host silently got 15 points / Salongen / default
// deadlines and was never asked. Hosting IS choosing those things. Seats are
// read here rather than in the lobby so someone who joins while the host is
// still picking a board still gets a chair.
function netStartRoom() {
  const humans = NET.peers.filter((p) => p.connected);
  const botNames = BOT_NAMES[U.lang].slice(0, Math.max(0, U.botCount));
  U.names = [...humans.map((p) => p.name), ...botNames].slice(0, NET_CONFIG.MAX_PLAYERS);
  U.mode = "party";                       // same screens as practice; the seats differ
  U.netSeats = humans.map((p) => p.pid);  // startGame reads this to seat real peers
  startGame();
}

// Posed fixtures supply their own roster/code (fixtures.js cannot import net.js),
// so the lobby screens are reviewable in the gallery with no network at all.
const lobbyRoster = () => U.fxRoster ?? NET.peers;
const lobbyRoom = () => U.fxRoom ?? NET.roomCode;
const lobbyHostName = () => lobbyRoster()[0]?.name || null;

SCREENS.HOST_LOBBY = () => {
  const roster = lobbyRoster();
  const link = netShareLink(lobbyRoom());
  const total = roster.filter((p) => p.connected).length + U.botCount;
  const need = Math.max(0, NET_CONFIG.MIN_PLAYERS - total);
  shell(`
   <h2>${t("lobbyTitle")}</h2>
   <div class="card" style="text-align:center">
     <span class="eyebrow">${t("lobbyCode")}</span>
     <div class="word" style="font-size:40px;letter-spacing:6px">${esc(lobbyRoom() ?? "…")}</div>
     ${link ? `<button class="btn secondary" id="copylink" style="margin-top:10px">${t("lobbyCopy")}</button>` : ""}
     <p class="small" style="margin:8px 0 0">${t("lobbyShareHint")}</p>
   </div>
   <div class="card">
     <b>${t("lobbyPlayers", roster.filter((p) => p.connected).length)}</b>
     <div class="chiprow" style="margin-top:8px">${roster.map((p, i) => `
       <span class="pchip ${p.connected ? "done" : ""}"><span class="dot" style="background:${AVA[i]}"></span>${esc(p.name)}
         ${p.pid === U.myPid ? `· ${t("lobbyHost")}` : ""}${p.connected ? "" : `· ${t("lobbyOffline")}`}
         ${p.rating ? `<span class="ratingpill">${p.rating}</span>` : ""}</span>`).join("")}</div>
   </div>
   <label class="fieldlabel" for="hostname">${t("joinName")}</label>
   <input type="text" id="hostname" maxlength="14" placeholder="${t("namePh")}" value="${esc(U.uname ?? "")}">
   <h2>${t("lobbyBots")}</h2>
   <div class="seg">${[0, 1, 2, 3].map((n) => `
     <button class="${U.botCount === n ? "on" : ""}" data-bots="${n}">${n} 🤖</button>`).join("")}</div>
   ${need ? `<p class="small">${t("lobbyNeed", need)}</p>` : ""}
   <div style="flex:1"></div>
   <p class="small" style="text-align:center;margin:0 0 8px">${t("lobbyLateWindow")}</p>
   <button class="btn" id="startroom" ${need ? "disabled" : ""}>${t("lobbyStart")}</button>
   <button class="linkbtn" id="tojoin">${t("lobbyJoinInstead")}</button>`);
  const cp = document.getElementById("copylink");
  if (cp) cp.onclick = async () => {
    try { await navigator.clipboard.writeText(link); cp.textContent = t("lobbyCopied"); play("confirm"); }
    catch { cp.textContent = link; }   // clipboard blocked → show it so it can be copied by hand
  };
  const hn = document.getElementById("hostname");
  if (hn) hn.oninput = () => {
    // Live, because everyone else in the lobby is looking at this name.
    U.uname = hn.value;
    const me = NET.peers.find((x) => x.pid === U.myPid);
    if (me) { me.name = hn.value || "?"; netBroadcastLobby(); }
  };
  app.querySelectorAll("[data-bots]").forEach((b) => b.onclick = () => { U.botCount = Number(b.dataset.bots); play("toggle"); render(); });
  document.getElementById("startroom").onclick = () => {
    PROFILE = { ...PROFILE, name: U.uname || PROFILE.name };
    ratingSave(PROFILE);
    // On to game setup — length, board, deadlines. The room keeps filling
    // behind this screen; seats are taken when the host actually starts.
    U.mode = "party";
    U.screen = "SETUP"; play("confirm"); render();
  };
  document.getElementById("tojoin").onclick = () => { U.screen = "JOIN"; play("back"); render(); };
};

SCREENS.LOBBY_WAIT = () => {
  shell(`
   <h2>${lobbyHostName() ? t("lobbyRoomOf", esc(lobbyHostName())) : t("lobbyWaiting")}</h2>
   <div class="card" style="text-align:center">
     <span class="eyebrow">${t("lobbyCode")}</span>
     <div class="word" style="font-size:32px;letter-spacing:5px">${esc(lobbyRoom() ?? "…")}</div>
   </div>
   <div class="card">
     <div class="chiprow">${lobbyRoster().map((p, i) => `
       <span class="pchip ${p.connected ? "done" : ""}"><span class="dot" style="background:${AVA[i]}"></span>${esc(p.name)}
         ${p.pid === U.myPid ? `· ${t("lobbyYou")}` : ""}
         ${p.rating ? `<span class="ratingpill">${p.rating}</span>` : ""}</span>`).join("")}</div>
     <p class="small" style="margin:8px 0 0">${t("lobbyWaitingSub")}</p>
   </div>
   <div style="flex:1;display:flex;align-items:center;justify-content:center;">
     ${face({ color: AVA[0], size: 60, brand: true, bob: true })}
   </div>`);
};

SCREENS.JOIN = () => {
  const err = U.joinError;
  shell(`
   <h2>${t("joinTitle")}</h2>
   <label class="fieldlabel" for="jcode">${t("joinCode")}</label>
   <input type="text" id="jcode" maxlength="10" autocapitalize="characters" autocomplete="off"
          placeholder="${t("joinCode")}" value="${esc(U.joinCode ?? "")}"
          style="text-transform:uppercase;letter-spacing:4px;font-weight:700">
   <label class="fieldlabel" for="jname">${t("joinName")}</label>
   <input type="text" id="jname" maxlength="14" placeholder="${t("joinName")}" value="${esc(U.uname ?? "")}">
   ${err ? `<div class="banner" style="background:var(--color-timer-urgent)">${t(err)}</div>` : ""}
   ${U.joining ? `<p class="small">${t("joinConnectingTo", esc((U.joinCode ?? "").toUpperCase()))}</p>` : ""}
   <div style="flex:1"></div>
   <button class="btn" id="dojoin" ${U.joining ? "disabled" : ""}>${t("joinGo")}</button>
   <button class="linkbtn" id="joinbots">${t("joinPlayBots")}</button>`);
  document.getElementById("jcode").oninput = (e) => { U.joinCode = e.target.value.toUpperCase(); };
  document.getElementById("jname").oninput = (e) => { U.uname = e.target.value; };
  document.getElementById("dojoin").onclick = () => netDoJoin();
  document.getElementById("joinbots").onclick = () => {
    // Always an exit. A broker outage or a hostile network must never be a dead
    // end — there is a whole game here that needs no network at all.
    netLoopback(); U.mode = "party"; U.screen = "PARTYSETUP"; play("back"); render();
  };
};

SCREENS.CONNLOST = () => {
  const left = U.fxLostLeft !== undefined
    ? U.fxLostLeft * 1000
    : Math.max(0, NET_CONFIG.RECONNECT_MS - (Date.now() - (U.lostAt ?? 0)));
  const hostGone = NET.error === "host-gone";
  shell(`
   <h2>${t("lostTitle")}</h2>
   <div class="card">
     <p>${hostGone ? t("lostHostGone") : t("lostSub", `<span id="lostsec">${Math.ceil(left / 1000)}</span>`)}</p>
   </div>
   <div style="flex:1"></div>
   ${hostGone ? "" : `<button class="btn" id="retrynow">${t("lostRetry")}</button>`}
   <button class="btn secondary" id="tohotseat">${t("lostHotseat")}</button>`);

  /* The number used to be computed once at render and never again, so a player
     watched a frozen "30" and had no idea whether reconnecting was still being
     attempted. Surgical, like ckPaint: writes one textContent, never render() —
     this screen owns a live text field and a re-render would fight the buttons.
     Not on the shared clock interval because that one is scoped to phase
     deadlines and this is not a phase. */
  const secEl = document.getElementById("lostsec");
  if (secEl && U.fxLostLeft === undefined) {
    const tick = setInterval(() => {
      if (!document.getElementById("lostsec") || U.screen !== "CONNLOST") { clearInterval(tick); return; }
      const s = Math.max(0, Math.ceil((NET_CONFIG.RECONNECT_MS - (Date.now() - (U.lostAt ?? 0))) / 1000));
      secEl.textContent = String(s);
      if (s === 0) clearInterval(tick);
    }, 500);
  }

  const r = document.getElementById("retrynow");
  if (r) r.onclick = () => { NET.reconnect?.(); play("confirm"); };
  document.getElementById("tohotseat").onclick = () => {
    // The last broadcast state is still in G, so the room can finish the game on
    // one screen instead of losing the evening. A free benefit of full-state.
    netLoopback(); U.mode = "hotseat";
    U.screen = G ? screenForSeat(G, 0) : "HOME";
    play("confirm"); render();
  };
};

function netDoJoin() {
  const code = (U.joinCode ?? "").trim().toUpperCase();
  if (code.length < 4) { U.joinError = "joinFailNoRoom"; render(); return; }
  if (typeof globalThis.Peer !== "function") { U.joinError = "netNoPeer"; render(); return; }
  U.joining = true; U.joinError = null; render();
  PROFILE = { ...PROFILE, name: U.uname || PROFILE.name };
  ratingSave(PROFILE);
  netJoin({
    code, pid: U.myPid, name: U.uname || PROFILE.name || "?", profile: PROFILE,
    onMessage: netHandle,
    onPeerChange: () => { if (U.screen === "LOBBY_WAIT") render(); },
    onReady: () => { U.joining = false; U.screen = "LOBBY_WAIT"; play("confirm"); render(); },
    onError: (reason) => {
      U.joining = false;
      if (U.screen === "LOBBY_WAIT" || G) { netFail(reason); return; }
      U.joinError = reason === "no-room" ? "joinFailNoRoom"
        : reason === "timeout" ? "joinFailTimeout" : "joinFailGeneric";
      render();
    },
  });
}

function netDoHost() {
  if (typeof globalThis.Peer !== "function") { U.joinError = "netNoPeer"; U.screen = "JOIN"; render(); return; }
  PROFILE = { ...PROFILE, name: U.uname || PROFILE.name };
  U.botCount = 2;                 // two friends + one bot is a real game; adjustable in the lobby
  U.screen = "HOST_LOBBY"; render();
  netHost({
    pid: U.myPid, name: U.uname || PROFILE.name || "?", profile: PROFILE,
    onMessage: netHandle,
    onPeerChange: () => { netBroadcastLobby(); if (U.screen === "HOST_LOBBY") render(); },
    onReady: () => { play("confirm"); if (U.screen === "HOST_LOBBY") render(); },
    onError: (reason) => {
      U.joinError = reason === "timeout" ? "joinFailTimeout" : "joinFailGeneric";
      U.screen = "JOIN"; render();
    },
  });
}

function netApplyRatings(msg) {
  const mine = msg.deltas?.[U.myPid];
  if (mine === undefined || G?.ratingDone) return;
  G.ratingDone = true;
  G.ratingMine = mine;
  const seat = mySeat();
  PROFILE = ratingApply(PROFILE, mine, {
    nose: Math.min(G.players[seat]?.bluffVotes ?? 0, ratingNoseCap(G.players.length, G.round)),
    won: (G.winnersIdx ?? []).includes(seat),
  });
  ratingSave(PROFILE);
  render();
}

/* ---------- career rating (PRD §2.1) ---------- */

// Once per game, on the winner screen. Guarded by G.ratingDone, the same idempotency
// pattern G.celebrated already uses — the topbar (mute/theme) re-renders this screen.
// Online (C13) replaces the local apply with the host's broadcast; the maths and the
// clamp are identical either way, because the host is just another browser.
function settleRating() {
  if (!G || G.ratingDone) return;
  G.ratingDone = true;
  // Ratings come from the lobby: each peer reported its own when it said hello.
  // Client-reported, and deliberately so — see ONLINE-PLAY.md «ærlig om juks».
  const deltas = ratingDeltas(G.players.map((p) => {
    const peer = NET.peers.find((x) => x.pid === p.pid);
    return {
      pid: p.pid,
      rating: p.pid === U.myPid ? PROFILE.rating : (peer?.rating ?? RATING.START),
      games: p.pid === U.myPid ? PROFILE.games : (peer?.games ?? 0),
      score: p.score,
      isBot: p.kind === "bot",
    };
  }));
  const mine = deltas[U.myPid];
  if (mine === undefined) return;      // solo vs bots — nothing to settle
  G.ratingMine = mine;                 // shown on the winner screen
  const seat = mySeat();
  PROFILE = ratingApply(PROFILE, mine, {
    nose: Math.min(G.players[seat]?.bluffVotes ?? 0, ratingNoseCap(G.players.length, G.round)),
    won: (G.winnersIdx ?? []).includes(seat),
  });
  ratingSave(PROFILE);
  // Everyone in the room gets the whole table's deltas so the lobby can show
  // them; each client applies only its own (net.js / rating.js clamp).
  if (online() && isHost()) NET.send({ t: "ratings", gameId: G.gameId ?? G.round, deltas });
}

const ratingPill = () =>
  `<span class="ratingpill">${PROFILE.rating} · ${esc(ratingTier(PROFILE.rating, U.lang))}</span>`;

SCREENS.PROFILE = () => {
  const p = PROFILE;
  const last = [...(p.history ?? [])].reverse().slice(0, 10);
  shell(`
   <h2>${t("profileTitle")}</h2>
   <div class="card" style="text-align:center">
     <div class="word" style="font-size:44px">${p.rating}</div>
     <p class="sub" style="margin:2px 0 0">${esc(ratingTier(p.rating, U.lang))}</p>
     <p class="small">${t("profileBest", p.best)}</p>
   </div>
   <div class="card">
     <div class="scoreline"><span>${t("profileGames")}</span><span>${p.games}</span></div>
     <div class="scoreline"><span>${t("profileWins")}</span><span>${p.wins}</span></div>
     <div class="scoreline"><span>${t("profileNose")}</span><span>👃 ${p.nose}</span></div>
   </div>
   ${last.length ? `<div class="card"><b>${t("profileLast")}</b>
     <div class="chiprow" style="margin-top:8px">${last.map((h) => `
       <span class="pchip ${h.d >= 0 ? "done" : ""}">${h.d >= 0 ? "+" : ""}${h.d}</span>`).join("")}</div></div>` : ""}
   <p class="small">${t("profilePrivacy")}</p>
   <div style="flex:1"></div>
   <button class="btn secondary" id="wipeprofile">${t("profileWipe")}</button>
   <button class="linkbtn" id="profback">${t("back")}</button>`);
  document.getElementById("wipeprofile").onclick = () => {
    // Deliberately destructive and deliberately one tap: the moment we persist
    // an identifier, an easy way to erase it stops being a nicety (PRD §10).
    PROFILE = ratingReset();
    U.myPid = PROFILE.pid;
    play("error"); render();
  };
  document.getElementById("profback").onclick = () => { U.screen = U.rulesReturn; play("back"); render(); };
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
// The career profile is the source of this device's identity: its pid outlives
// reloads, which is what lets a rating mean anything. newPid() stays as the
// fallback for a browser that refuses storage entirely.
PROFILE = ratingLoad();
U.myPid = PROFILE.pid ?? newPid();
if (PROFILE.name) U.uname = PROFILE.name;

// Mute rides along in the profile rather than taking a second localStorage key,
// so CLAUDE.md's "one versioned key" stays literally true. ratingLoad() spreads
// unknown fields through, so this persists without touching the schema version.
setMuted(!!PROFILE.muted);
hapticsBindMute(isMuted);

// Autoplay policy starts the AudioContext suspended, and iOS re-suspends it every
// time the tab loses focus WITHOUT resuming on return — which is why the game used
// to go permanently silent after the first app switch. resume() only works from
// inside a real gesture, so hang it off the first touch and every wake-up.
for (const evt of ["pointerdown", "keydown"]) {
  window.addEventListener(evt, audioUnlock, { passive: true });
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") audioUnlock();
});

netLoopback();          // local play is its own host; online replaces this transport

// A shared link drops you straight at the join screen with the code filled in.
// This is the whole point of "send a link to your friends": no menu to navigate.
const bootRoom = netRoomFromUrl();
if (bootRoom && !bootFx) { U.joinCode = bootRoom; U.screen = "JOIN"; }

// Not under a fixture: a posed screen is a still life, and arming the history trap
// there would make the gallery's back button behave like a game.
if (!bootFx) backInstallHistory();

render();
