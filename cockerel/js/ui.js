// ui.js — screen flow + rendering. Single entry point, single flow:
// [Name -> How-to-play -> Welcome] or [Recap ->] [Ready] -> Guess (one word
// at a time, timed) -> Score -> Write (one word at a time, timed) -> Done.
// No navigation to Cocky Monk or Ordkrig. The #devbar (date/player
// switchers) is a TESTING TOOL, not part of the shipped UX — see CLAUDE.md.
import { storageLocal, loadOrCreateIdentity, saveIdentity, loadTheme, saveTheme } from "./storage.js";
import { TIMERS } from "./config.js";

const store = storageLocal();
const app = document.getElementById("screen-root");
const header = document.getElementById("header");
const devbar = document.getElementById("devbar");
const settingsRoot = document.getElementById("settings-root");
const IDENTITY_KEY = "cockerel.identity.v1";
// Pre-rename key (see js/storage.js's LEGACY_IDENTITY_KEY) — only used here
// to decide "is this truly a first-time visitor" and to fully wipe identity
// on reset; storage.js's loadOrCreateIdentity is what actually migrates it.
const LEGACY_IDENTITY_KEY = "thedailycock.identity.v1";

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

// -- theme: "dark" (original) or "light" (Wordle-style), toggled from the
// settings panel. index.html has a tiny inline script that stamps this same
// attribute before first paint, to avoid a flash of the wrong theme.
function applyTheme(theme) {
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
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
// devToolsEnabled reflects the server's DEV_TOOLS flag (fetched once in
// main(), before the first renderDevToolbar() call) — a deployed instance
// answers { devTools: false } and every call below becomes a no-op, so the
// toolbar never appears and never tries to hit the /api/dev/* endpoints the
// server has also 404'd.
let devToolsEnabled = true;

// -- Google Sign-In -----------------------------------------------------
// null until main() reads /api/config — mirrors devToolsEnabled's gating
// shape exactly: an unconfigured server means this stays null and the
// button never renders, same as the dev toolbar disappearing when
// DEV_TOOLS=0.
let googleClientId = null;

// True only on a deployment that set REQUIRE_GOOGLE_AUTH=1 (see server's
// /api/config). Blocks the NORMAL onboarding/gameplay flow in main() until
// identity.googleLinked is true — deliberately does NOT touch the #devbar
// test-player flow at all (registerNewPlayer/the dev-player switcher set
// `identity` directly and call enterApp()/renderNameScreen() themselves,
// bypassing this gate entirely), so devbar testing stays exactly as before.
let requireGoogleAuth = false;

async function renderDevToolbar() {
  if (!devToolsEnabled) { devbar.replaceChildren(); return; }
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

// -- settings: persistent footer bar + reset-my-own-player flow -------------
// Rendered once at boot, not re-rendered per navigation (unlike #devbar) —
// its click handler reads `identity` fresh at click time, so it always acts
// on whoever is currently active, including after a dev-toolbar switch.
// A full-width fixed footer (see .app-footer in app.css), always visible on
// every screen — not a floating corner button, which was reported invisible
// on a real phone (mobile browser chrome / home-indicator safe area).

function renderSettingsButton() {
  settingsRoot.replaceChildren(el(`
    <div class="app-footer" id="app-footer">
      <button class="footer-settings-btn" id="settings-fab" aria-label="Innstillinger">
        <span class="footer-settings-icon">⚙</span>
        <span>Innstillinger</span>
      </button>
    </div>
  `));
  document.getElementById("settings-fab").addEventListener("click", openSettingsPanel);
}

function themeToggleLabel() {
  return loadTheme() === "light" ? "Bytt til mørkt tema" : "Bytt til lyst tema";
}

// Shown only when the server has a GOOGLE_CLIENT_ID configured (see
// googleClientId above) — otherwise this whole section is absent, not just
// hidden. `identity.googleLinked` (set the moment handleGoogleCredential
// succeeds, see below) swaps the button out for a plain confirmation line so
// a signed-in user is never shown the button again on this device.
function googleSectionHtml() {
  if (!googleClientId) return "";
  if (identity.googleLinked) {
    return `<p class="empty-note">Innlogget med Google — poengene og streaken din er trygge selv om du bytter enhet.</p>`;
  }
  return `
    <p class="empty-note">Logg inn med Google for å ta med deg poengene og streaken din til en annen enhet eller etter en ominstallering.</p>
    <div id="google-signin-btn" style="display:flex; justify-content:center; margin-bottom:8px"></div>
  `;
}

/** Renders the actual Google button into the given container id — must run
 * AFTER that container is in the DOM, since renderButton needs the node to
 * already exist. Shared by the settings panel's optional link and the
 * required sign-in gate below — the gate calls this synchronously during
 * main(), i.e. on the very first paint, which regularly RACES the GSI
 * script's `async` tag in index.html: `google` often isn't defined yet at
 * that instant. Retries every 100ms (up to ~5s) instead of the one-shot
 * no-op this used to be — that one-shot version meant the required sign-in
 * gate could render with no button at all on a fresh page load, which
 * defeats the entire point of requiring sign-in. Stops retrying once the
 * container itself is gone (e.g. the settings panel got closed first). */
function renderGoogleButton(containerId, attemptsLeft = 50) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (typeof google === "undefined" || !google.accounts?.id) {
    if (attemptsLeft <= 0) return; // script likely blocked (ad blocker, offline) — give up quietly
    setTimeout(() => renderGoogleButton(containerId, attemptsLeft - 1), 100);
    return;
  }
  google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleCredential });
  google.accounts.id.renderButton(container, { theme: "outline", size: "large", width: 260 });
}

/** Google's callback hands us a signed ID token, not an identity — the
 * server verifies it and tells us which userId to actually use (see
 * linkGoogleIdentity in server/db.mjs): either our current one, freshly
 * linked, or an existing one this Google account was already linked to from
 * another device. Either way we adopt whatever userId comes back, so a
 * reload always lands on the one canonical profile for this person.
 *
 * `isNewProfile` (true only the very first time THIS profile is ever
 * created) decides what happens next instead of a blanket reload: after a
 * reload, localStorage always looks populated regardless of whether this is
 * a brand-new player or a returning one, so isFirstTime in main() can't
 * reliably tell them apart post-reload — this flag is the one place that
 * still can. A genuinely new profile gets the same How-to-play + Welcome
 * onboarding an anonymous first-timer would (see registerFlow); a returning
 * one (this device's fresh anonymous id adopting an existing Google-linked
 * profile, or the optional settings-panel link) just reloads straight in. */
async function handleGoogleCredential(response) {
  const result = await store.signInWithGoogle(response.credential, identity.userId);
  if (!result.ok) return;
  identity = { userId: result.userId, displayName: result.profile.displayName, googleLinked: true };
  saveIdentity(identity);
  if (result.isNewProfile) {
    await renderDevToolbar(); // picks up the brand-new player in the dev switcher
    renderHowToPlay(async () => {
      const state = await store.getToday(identity.userId);
      renderWelcomeStep(identity.displayName, state.profile, () => resumeFlowFromState(state));
    });
  } else {
    location.reload();
  }
}

/** The required-sign-in screen (see requireGoogleAuth) — shown instead of
 * the normal onboarding/Ready/Guess/Write flow whenever a deployment has
 * REQUIRE_GOOGLE_AUTH=1 and this device hasn't linked a Google account yet.
 * Deliberately has no "skip"/"play as guest" option — that's the whole
 * point of the flag. */
function renderSignInGate() {
  clearActiveTimer();
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">Frykt Nesen</p>
      <h1 style="text-align:center">Cockerel</h1>
      <div class="card">
        <h2>Logg inn for å spille</h2>
        <p class="empty-note">Du må logge inn med Google for å spille — det sikrer at poengene og streaken din er trygge, og at alle spillerne er ekte.</p>
        <div id="google-signin-gate-btn" style="display:flex; justify-content:center; margin-top:12px"></div>
      </div>
    </div>
  `));
  renderGoogleButton("google-signin-gate-btn");
}

function openSettingsPanel() {
  const overlay = el(`
    <div class="modal-overlay" id="settings-overlay">
      <div class="modal-card">
        <h2>Innstillinger</h2>
        <button class="btn secondary full" id="theme-toggle-btn">${themeToggleLabel()}</button>
        ${googleSectionHtml()}
        <p class="empty-note">Dette nullstiller kun din egen spiller på denne enheten — andre som spiller påvirkes ikke.</p>
        <button class="btn danger full" id="reset-btn">Nullstill spillet mitt</button>
        <button class="btn secondary full" id="close-settings-btn">Lukk</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("close-settings-btn").addEventListener("click", () => overlay.remove());
  document.getElementById("reset-btn").addEventListener("click", () => openResetConfirm(overlay));
  document.getElementById("theme-toggle-btn").addEventListener("click", (e) => {
    const next = loadTheme() === "light" ? "dark" : "light";
    saveTheme(next);
    applyTheme(next);
    e.target.textContent = themeToggleLabel();
  });
  if (googleClientId && !identity.googleLinked) renderGoogleButton("google-signin-btn");
}

function openResetConfirm(overlay) {
  overlay.querySelector(".modal-card").replaceChildren(el(`
    <div style="display:flex; flex-direction:column; gap:12px">
      <h2>Er du sikker?</h2>
      <p class="empty-note">Alle dine poeng, streaken din og bløffene dine forsvinner for godt${identity.googleLinked ? ", og Google-innloggingen din kobles fra" : ""}. Dette kan ikke angres.</p>
      <button class="btn danger full" id="confirm-reset-btn">Ja, nullstill</button>
      <button class="btn secondary full" id="cancel-reset-btn">Avbryt</button>
    </div>
  `));
  document.getElementById("cancel-reset-btn").addEventListener("click", () => overlay.remove());
  document.getElementById("confirm-reset-btn").addEventListener("click", async () => {
    await store.resetPlayer(identity.userId);
    localStorage.removeItem(IDENTITY_KEY);
    localStorage.removeItem(LEGACY_IDENTITY_KEY);
    location.reload();
  });
}

// -- onboarding -----------------------------------------------------------

function renderNameScreen(startingName, onDone) {
  clearActiveTimer();
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">Frykt Nesen</p>
      <h1 style="text-align:center">Cockerel</h1>
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
  document.getElementById(`hint-${word.wordId}`)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const res = await store.getVoteDistribution(identity.userId, word.wordId);
    if (!res.ok) { btn.disabled = false; return; }
    if (res.noData) { btn.textContent = "Ingen har gjettet ordet ennå"; return; }
    btn.textContent = "Hint vist";
    for (const { id, pct } of res.distribution) {
      document.getElementById(`opt-${word.wordId}-${id}`)?.insertAdjacentHTML("beforeend", `<span class="hint-pct">${pct}%</span>`);
    }
  });
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
  const options = w.options.map((opt) => `<button class="option-btn" id="opt-${w.wordId}-${opt.id}"><span>${opt.text}</span></button>`).join("");
  return `
    <div class="word-block">
      <div class="word-title">${w.word}</div>
      <button class="hint-btn" id="hint-${w.wordId}">Hint 💡</button>
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
      <div class="review-option-top">
        ${o.isTruth ? '<span class="review-option-label">Riktig svar</span>' : (o.isMine ? '<span class="review-option-label">Ditt svar</span>' : "<span></span>")}
        <span class="review-option-pct">${o.pct}%</span>
      </div>
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
  applyTheme(loadTheme()); // index.html's inline script already did this pre-paint; keep state in sync

  try {
    const config = await store.getConfig();
    devToolsEnabled = !!config.devTools;
    googleClientId = config.googleClientId ?? null;
    requireGoogleAuth = !!config.requireGoogleAuth;
  } catch { devToolsEnabled = false; }

  const isFirstTime = !localStorage.getItem(IDENTITY_KEY) && !localStorage.getItem(LEGACY_IDENTITY_KEY);
  identity = loadOrCreateIdentity(suggestName());
  renderSettingsButton();
  await renderDevToolbar();

  if (requireGoogleAuth && !identity.googleLinked) {
    renderSignInGate();
    return;
  }

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
