// ui.js — screen flow + rendering. Single entry point, single flow:
// [Name -> How-to-play -> Welcome] or [Recap ->] [Ready] -> Guess (one word
// at a time, timed) -> Score -> Write (one word at a time, timed) -> Done.
// No navigation to Cocky Monk or Ordkrig. The #devbar (date/player
// switchers) is a TESTING TOOL, not part of the shipped UX — see CLAUDE.md.
import { storageLocal, loadOrCreateIdentity, saveIdentity } from "./storage.js";
import { TIMERS } from "./config.js";

const store = storageLocal();
const app = document.getElementById("screen-root");
const header = document.getElementById("header");
const devbar = document.getElementById("devbar");
const IDENTITY_KEY = "thedailycock.identity.v1";

let identity = null;

// Guards the one word-timer that may be running at a time — every screen
// transition MUST clear this first, or a stale timeout can fire against a
// screen the user has already left (see renderGuessWordStep/renderWriteWordStep).
let activeTimer = null;
let activeInterval = null;
function clearActiveTimer() {
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
  if (activeInterval) { clearInterval(activeInterval); activeInterval = null; }
}

// Bumped every time enterApp() runs — a genuinely different session (a dev-
// toolbar player/day switch, or a fresh page load), NOT ordinary in-session
// navigation. A revealThenSyncHeader() reveal captures the token at start and
// checks it before its delayed header update fires, so a reveal abandoned by
// switching away mid-animation can never clobber a DIFFERENT session's header
// moments later — this was a real bug (a stale reveal from one player's Score
// step overwrote a different player's header after a dev-toolbar switch).
let sessionToken = 0;

// Small suggested-name generator — same <Adjective><Animal> SHAPE as
// ordkrig/src/config/usernames.ts, not its actual word lists (see CLAUDE.md
// Provenance: only the pattern is reused here).
const ADJ = ["Lur", "Rask", "Sky", "Kvass", "Vill", "Snill", "Sur", "Gretten"];
const ANIMAL = ["Gaupe", "Jerv", "Elg", "Rev", "Ugle", "Bjørn", "Hare", "Nise"];
function suggestName() {
  return ADJ[Math.floor(Math.random() * ADJ.length)] + ANIMAL[Math.floor(Math.random() * ANIMAL.length)];
}

function animateCount(elNode, to, ms = 900, from = 0, onComplete) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    elNode.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
    else if (onComplete) onComplete();
  }
  requestAnimationFrame(tick);
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function pctLabel(pct) {
  return pct ? `<span class="streak-pct">+${pct}%</span>` : "";
}

// "N dager (+X% poengbonus)" — the one canonical streak phrase, used
// everywhere the streak itself (not some other stat's bonus) is shown.
function streakText(days, pct) {
  const unit = days === 1 ? "dag" : "dager";
  const bonus = pct ? ` (+${pct}% poengbonus)` : "";
  return `${days} ${unit}${bonus}`;
}

// -- persistent header --------------------------------------------------
// Deliberately NOT re-rendered on every screen — only ever touched by
// updateHeader(), so a point/streak reveal elsewhere in the screen can finish
// its own big-number animation and flash BEFORE the header catches up.

function pointsText(profile) {
  return `${profile.rating} poeng (${profile.rank}. plass)`;
}

function renderHeaderImmediate(profile) {
  header.innerHTML = `
    <img class="mascot small" src="assets/nesen.svg" alt="" />
    <div class="header-name">${profile.displayName}</div>
    <div class="header-stats">
      <div class="header-points" id="header-points">${pointsText(profile)}</div>
      <div id="header-streak">Streak: ${streakText(profile.streakDays, profile.streakBonusPct)}</div>
    </div>
  `;
}

function updateHeader(profile) {
  const pointsEl = document.getElementById("header-points");
  const streakEl = document.getElementById("header-streak");
  if (!pointsEl || !streakEl) { renderHeaderImmediate(profile); return; }
  pointsEl.textContent = pointsText(profile);
  streakEl.textContent = `Streak: ${streakText(profile.streakDays, profile.streakBonusPct)}`;
}

/** Animate `elNode` 0 -> `to`, then flash it, then (only THEN) sync the
 * header — the exact sequence requested: reveal, flash, header catches up.
 * Captures the CURRENT session token and bails at both checkpoints if a
 * dev-toolbar switch (or fresh load) has moved the app on to a different
 * session in the meantime — see the sessionToken comment above. */
function revealThenSyncHeader(elNode, to, profile) {
  const token = sessionToken;
  animateCount(elNode, to, 900, 0, () => {
    if (token !== sessionToken) return;
    elNode.classList.add("flash");
    setTimeout(() => {
      if (token !== sessionToken) return;
      elNode.classList.remove("flash");
      updateHeader(profile);
    }, 450);
  });
}

// -- dev toolbar (testing only — see CLAUDE.md) ------------------------------

async function renderDevToolbar() {
  const [{ days, current }, { players }] = await Promise.all([store.listDays(), store.listPlayers()]);

  const dateOptions = days.map((d) => `<option value="${d}" ${d === current ? "selected" : ""} ${d === current ? "" : "disabled"}>${d}${d === current ? " (i dag)" : ""}</option>`).join("");
  const playerOptions = players.map((p) => `<option value="${p.userId}" ${identity && p.userId === identity.userId ? "selected" : ""}>${p.displayName}</option>`).join("");

  devbar.replaceChildren(el(`
    <div class="devbar">
      <span class="devbar-label">TEST</span>
      <select id="dev-date">${dateOptions}<option value="__advance__">→ Neste dag</option></select>
      <select id="dev-player">${playerOptions}<option value="__new__">+ Ny spiller</option></select>
    </div>
  `));

  document.getElementById("dev-date").addEventListener("change", async (e) => {
    if (e.target.value === "__advance__") {
      await store.advanceDay();
      await enterApp();
    }
  });

  document.getElementById("dev-player").addEventListener("change", async (e) => {
    const value = e.target.value;
    if (value === "__new__") {
      registerNewPlayer();
      return;
    }
    const player = players.find((p) => p.userId === value);
    identity = { userId: player.userId, displayName: player.displayName };
    saveIdentity(identity);
    await enterApp();
  });
}

// -- onboarding -----------------------------------------------------------

function renderNameScreen(startingName, onDone) {
  clearActiveTimer();
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">Frykt Nesen</p>
      <h1 style="text-align:center">The Daily Cock</h1>
      <div class="card">
        <h2>Velg brukernavnet ditt</h2>
        <input type="text" id="name-input" value="${startingName}" />
        <p class="empty-note" style="margin-top:8px">Du kan endre det senere.</p>
      </div>
      <button class="btn full" id="continue-btn">Fortsett</button>
    </div>
  `));
  document.getElementById("continue-btn").addEventListener("click", () => {
    const displayName = document.getElementById("name-input").value.trim() || startingName;
    onDone(displayName);
  });
}

function renderHowToPlay(onDone) {
  clearActiveTimer();
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <div class="card">
        <h2>Slik spiller du</h2>
        <p>Hver dag skriver du falske definisjoner på 3 nye ord, og gjetter den ekte definisjonen blant andres bløffer på gårsdagens ord. Du får poeng for riktige gjett og for å lure andre — og en liten bonus for å være med flere dager på rad.</p>
      </div>
      <button class="btn full" id="continue-btn">Skjønner, sett i gang</button>
    </div>
  `));
  document.getElementById("continue-btn").addEventListener("click", onDone);
}

// First-time-only: a personal welcome before the very first "Gjett gårsdagens
// ord" — shows the fresh profile's starting numbers (rating counts UP into
// existence, streak counts DOWN to the 0 it actually starts at, for a little
// contrast) before the "start the game" CTA.
function renderWelcomeStep(displayName, profile, onStart) {
  clearActiveTimer();
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <h1 style="text-align:center">Heisann, ${displayName}!</h1>
      <div class="card">
        <div class="stat-row"><span>Poeng</span><span id="start-points" style="font-weight:700">0</span></div>
        <div class="stat-row" style="margin-top:8px"><span>Streak</span><span id="start-streak" style="font-weight:700">0</span></div>
      </div>
      <button class="btn full" id="continue-btn">Gi meg dagens kuk!</button>
    </div>
  `));
  animateCount(document.getElementById("start-points"), profile.rating, 900);
  animateCount(document.getElementById("start-streak"), 0, 900, 5);
  document.getElementById("continue-btn").addEventListener("click", onStart);
}

// Shown every time a RETURNING player opens the app and there's no unseen
// write-recap to show instead — so the guess timer never starts the instant
// the app opens; there's always a beat to get oriented first.
function renderReadyStep(state, onStart) {
  clearActiveTimer();
  const { profile } = state;
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <h1 style="text-align:center">Velkommen tilbake, ${profile.displayName}!</h1>
      <div class="card">
        <div class="stat-row"><span>Poeng</span><span style="font-weight:700">${profile.rating}</span></div>
        <div class="stat-row" style="margin-top:8px"><span>Streak</span><span style="font-weight:700">${streakText(profile.streakDays, profile.streakBonusPct)}</span></div>
      </div>
      <button class="btn full" id="continue-btn">Gjett gårsdagens ord</button>
    </div>
  `));
  document.getElementById("continue-btn").addEventListener("click", onStart);
}

// The async "last time you wrote" recap — write-only now (see db.mjs / the
// approved plan): fooled-vote credit can't be known until the guess window
// on your words closes, so it's the one piece of feedback that can't be
// shown immediately in the step flow below and has to wait for next login.
function renderWriteRecap(result, profile, onContinue) {
  clearActiveTimer();
  const fooledWordCount = (result.fooledByWord ?? []).length;

  // Header is already accurate by the time this shows (see enterApp) — these
  // points were credited at settlement, possibly days ago. The animation
  // here is pure storytelling, not a live "before vs. after" state change.
  if (fooledWordCount === 0) {
    app.replaceChildren(el(`
      <div class="screen">
        <img class="mascot" src="assets/nesen.svg" alt="" />
        <p class="eyebrow" style="text-align:center">Sist du skrev</p>
        <div class="card">
          <p style="text-align:center">Ingen ble lurt av ordene dine sist, lykke til denne gangen!</p>
          <div class="stat-row" style="margin-top:12px"><span>Streak</span><span class="streak-badge">${streakText(profile.streakDays, profile.streakBonusPct)}</span></div>
          <div class="stat-row"><span>Rating</span><span>${profile.rating}</span></div>
        </div>
        <button class="btn full" id="continue-btn">Fortsett</button>
      </div>
    `));
    document.getElementById("continue-btn").addEventListener("click", onContinue);
    return;
  }

  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">Sist du skrev</p>
      <p style="text-align:center; font-weight:700; font-size:18px">${fooledWordCount} av dine ord lurte andre!</p>
      <p class="eyebrow" style="text-align:center; margin-top:8px">Du får</p>
      <div class="recap-points" id="points">0</div>
      <div class="card">
        <div class="stat-row"><span>Streak-bonus</span><span>+${result.writeStreakPct}%</span></div>
        <div class="stat-row" style="margin-top:8px"><span>Total</span><span style="font-weight:700">${result.writePoints}</span></div>
        <div class="stat-row" style="margin-top:8px"><span>Streak</span><span class="streak-badge">${streakText(profile.streakDays, profile.streakBonusPct)}</span></div>
        <div class="stat-row"><span>Rating</span><span>${profile.rating}</span></div>
      </div>
      <button class="btn full" id="continue-btn">Fortsett</button>
    </div>
  `));
  animateCount(document.getElementById("points"), result.writeBasePoints ?? result.writePoints ?? 0, 900);
  document.getElementById("continue-btn").addEventListener("click", onContinue);
}

// -- shared: countdown bar + timeout screen ----------------------------------

function countdownBarHtml(seconds) {
  return `
    <div class="countdown-row">
      <div class="countdown-bar"><div class="countdown-fill" style="animation-duration:${seconds}s"></div></div>
      <span class="countdown-seconds" id="countdown-seconds">${seconds}s</span>
    </div>`;
}

// Ticks the seconds label next to the bar once a second — a separate,
// plain-JS clock from the CSS width animation, so the bar can stay pure CSS.
// Stopped by clearActiveTimer() same as the timeout setTimeout.
function startCountdownSeconds(seconds) {
  let remaining = seconds;
  activeInterval = setInterval(() => {
    remaining -= 1;
    const label = document.getElementById("countdown-seconds");
    if (!label) { clearInterval(activeInterval); activeInterval = null; return; }
    label.textContent = `${Math.max(0, remaining)}s`;
    if (remaining <= 0) { clearInterval(activeInterval); activeInterval = null; }
  }, 1000);
}

function renderTimeoutStep(kind, onNext) {
  clearActiveTimer();
  const text = kind === "guess" ? "Du rakk ikke å gjette" : "Du rakk ikke å skrive";
  app.replaceChildren(el(`
    <div class="screen">
      <div class="timeout-box">
        <h2>${text}</h2>
        <p class="empty-note">Tiden løp ut for dette ordet.</p>
      </div>
      <button class="btn full" id="continue-btn">Neste</button>
    </div>
  `));
  document.getElementById("continue-btn").addEventListener("click", onNext);
}

// -- the guided step flow: Guess (one at a time) -> Score -> Write (one at a
// time) -> Done. Answered/skipped words drop out; the LAST one in a step
// advances straight to the next step's screen.

async function renderGuessWordStep(state) {
  clearActiveTimer();
  const remaining = state.guessWords.filter((w) => !w.alreadyGuessed);
  if (!remaining.length) { renderWriteWordStep(await store.getToday(identity.userId)); return; }
  const word = remaining[0];
  const position = state.guessWords.length - remaining.length + 1;

  app.replaceChildren(el(`
    <div class="screen">
      ${countdownBarHtml(TIMERS.guessSeconds)}
      <p class="eyebrow">Gjett gårsdagens ord (${position}/${state.guessWords.length})</p>
      ${renderGuessWordMarkup(word)}
    </div>
  `));
  for (const opt of word.options) {
    document.getElementById(`opt-${word.wordId}-${opt.id}`)?.addEventListener("click", async () => {
      clearActiveTimer();
      const res = await store.submitGuess(identity.userId, word.wordId, opt.id);
      if (!res.ok) return;
      await afterGuessAction(res);
    });
  }
  activeTimer = setTimeout(async () => {
    clearActiveTimer();
    renderTimeoutStep("guess", async () => {
      const res = await store.skipGuess(identity.userId, word.wordId);
      if (!res.ok) return;
      await afterGuessAction(res);
    });
  }, TIMERS.guessSeconds * 1000);
  startCountdownSeconds(TIMERS.guessSeconds);
}

async function afterGuessAction(res) {
  if (res.guessResult) {
    renderScoreStep(res.guessResult, async () => renderWriteWordStep(await store.getToday(identity.userId)));
  } else {
    renderGuessWordStep(await store.getToday(identity.userId));
  }
}

function renderGuessWordMarkup(w) {
  const options = w.options.map((opt) => `<button class="option-btn" id="opt-${w.wordId}-${opt.id}">${opt.text}</button>`).join("");
  return `
    <div class="word-block">
      <div class="word-title">${w.word}</div>
      <div class="option-list">${options}</div>
    </div>`;
}

function renderScoreStep(result, onContinue) {
  clearActiveTimer();
  const rows = result.words.map((w, i) => renderReviewRow(w, i)).join("");
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">Din poengsum</p>
      <div class="recap-points" id="points">0</div>
      <div class="card">
        <div class="stat-row"><span>Riktige gjett</span><span>${result.correctCount} / ${result.guessTotal}${pctLabel(result.pct)}</span></div>
        <div class="review-list">${rows}</div>
      </div>
      <button class="btn full" id="continue-btn">Fortsett</button>
    </div>
  `));
  wireReviewToggles();
  revealThenSyncHeader(document.getElementById("points"), result.points, result.profile);
  document.getElementById("continue-btn").addEventListener("click", onContinue);
}

function renderReviewRow(w, i) {
  const options = w.options.map((o) => `
    <div class="review-option ${o.isTruth ? "truth" : ""} ${o.isMine ? "mine" : ""}">
      ${o.isTruth ? '<span class="review-option-label">Riktig svar</span>' : (o.isMine ? '<span class="review-option-label">Ditt svar</span>' : "")}
      ${o.text}
    </div>`).join("");
  return `
    <div class="review-row">
      <button class="review-toggle ${w.correct ? "correct" : "wrong"}" id="review-toggle-${i}" aria-expanded="false">
        <span>${w.word}</span>
        <span>${w.correct ? "✓" : "✕"}</span>
        <span class="review-arrow">▾</span>
      </button>
      <div class="review-detail" id="review-detail-${i}" hidden>${options}</div>
    </div>`;
}

function wireReviewToggles() {
  document.querySelectorAll(".review-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const detail = document.getElementById(btn.id.replace("toggle", "detail"));
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      detail.hidden = expanded;
    });
  });
}

async function renderWriteWordStep(state, skippedIds = new Set()) {
  clearActiveTimer();
  const remaining = state.writeWords.filter((w) => !w.alreadySubmitted && !skippedIds.has(w.wordId));
  if (!remaining.length) { renderDoneStep(await store.getToday(identity.userId)); return; }
  const word = remaining[0];
  const position = state.writeWords.length - remaining.length + 1;

  app.replaceChildren(el(`
    <div class="screen">
      ${countdownBarHtml(TIMERS.writeSeconds)}
      <p class="eyebrow">Skriv dagens ord (${position}/${state.writeWords.length})</p>
      ${renderWriteWordMarkup(word)}
    </div>
  `));
  document.getElementById(`submit-${word.wordId}`)?.addEventListener("click", async () => {
    clearActiveTimer();
    const text = document.getElementById(`text-${word.wordId}`).value;
    const res = await store.submitDefinition(identity.userId, word.wordId, text);
    if (!res.ok) return;
    renderWriteWordStep(await store.getToday(identity.userId), skippedIds);
  });
  activeTimer = setTimeout(() => {
    clearActiveTimer();
    renderTimeoutStep("write", () => {
      renderWriteWordStep(state, new Set([...skippedIds, word.wordId]));
    });
  }, TIMERS.writeSeconds * 1000);
  startCountdownSeconds(TIMERS.writeSeconds);
}

function renderWriteWordMarkup(w) {
  return `
    <div class="word-block">
      <div class="word-title">${w.word}</div>
      <textarea id="text-${w.wordId}" rows="2" placeholder="Skriv en troverdig (falsk) definisjon..." maxlength="140"></textarea>
      <button class="btn" id="submit-${w.wordId}">Send inn</button>
    </div>`;
}

function renderDoneStep(state) {
  clearActiveTimer();
  app.replaceChildren(el(`
    <div class="screen-success">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center; color:inherit">Streak</p>
      <div class="recap-points" id="streak-num" style="color:inherit">0</div>
      <p style="text-align:center">dager</p>
      <p style="text-align:center; font-weight:700; font-size:18px">Kom tilbake i morgen og se om noen gjettet ordene dine!</p>
    </div>
  `));
  revealThenSyncHeader(document.getElementById("streak-num"), state.profile.streakDays, state.profile);
}

function resumeFlowFromState(state) {
  updateHeader(state.profile);
  const allGuessed = state.guessWords.length > 0 && state.guessWords.every((w) => w.alreadyGuessed);
  const allWritten = state.writeWords.every((w) => w.alreadySubmitted);
  if (state.guessWords.length > 0 && !allGuessed) { renderGuessWordStep(state); return; }
  if (!allWritten) { renderWriteWordStep(state); return; }
  renderDoneStep(state);
}

// -- boot / player flows ------------------------------------------------

async function main() {
  const isFirstTime = !localStorage.getItem(IDENTITY_KEY);
  identity = loadOrCreateIdentity(suggestName());
  await renderDevToolbar();

  if (isFirstTime) {
    renderNameScreen(identity.displayName, (displayName) => registerFlow(displayName));
    return;
  }
  await store.ensureProfile(identity.userId, identity.displayName);
  await enterApp();
}

async function registerFlow(displayName) {
  identity.displayName = displayName;
  saveIdentity(identity);
  await store.ensureProfile(identity.userId, displayName);
  await renderDevToolbar(); // pick up the brand-new player in the dev switcher
  renderHowToPlay(async () => {
    const state = await store.getToday(identity.userId);
    renderWelcomeStep(displayName, state.profile, () => resumeFlowFromState(state));
  });
}

function registerNewPlayer() {
  identity = { userId: crypto.randomUUID(), displayName: suggestName() };
  renderNameScreen(identity.displayName, (displayName) => registerFlow(displayName));
}

async function enterApp() {
  sessionToken++; // invalidate any reveal still in flight from a prior session
  await renderDevToolbar();
  const state = await store.getToday(identity.userId);
  // Always reflect whoever we're CURRENTLY viewing right away — this runs on
  // every real page load AND every dev-toolbar player/day switch, so the
  // header must never be left showing a previous player's stale numbers
  // while (say) the recap below is about someone else entirely.
  renderHeaderImmediate(state.profile);
  if (state.recap) {
    renderWriteRecap(state.recap, state.profile, async () => {
      await store.ackRecap(identity.userId);
      const fresh = await store.getToday(identity.userId);
      renderHeaderImmediate(fresh.profile);
      renderReadyStep(fresh, () => resumeFlowFromState(fresh));
    });
    return;
  }
  renderReadyStep(state, () => resumeFlowFromState(state));
}

main();
