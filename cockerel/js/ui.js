// ui.js — screen flow + rendering. Single entry point, dual-language flow
// (see cockerel/CLAUDE.md "Dual-language gameplay"): a brand-new player
// picks ONE language first (bilingual chrome, the only screen that needs to
// be — see renderLanguagePicker), then [Name -> How-to-play -> Welcome] in
// that language, or [Recap ->] [Ready] -> Guess (one word at a time, timed)
// -> Score -> Write (one word at a time, timed) -> Done for a returning
// player. Every screen after the language is chosen renders entirely in
// that language (js/i18n.js). A player with BOTH languages enabled (added
// later via settings) gets routed by routeToCurrentScreen() below — see its
// comment for the exact decision tree. No navigation to Cocky Monk or
// Ordkrig. The #devbar (date/player switchers) is a TESTING TOOL, not part
// of the shipped UX — see CLAUDE.md.
import { storageLocal, loadOrCreateIdentity, saveIdentity, loadTheme, saveTheme, IDENTITY_KEY, LEGACY_IDENTITY_KEY } from "./storage.js";
import { TIMERS, WRITE_AUTOSUBMIT_MIN_CHARS } from "./config.js";
import { GALLERY_SCREENS } from "./gallery-screens.js";
import { LANGS, LANG_LABELS, LANG_NAMES, t } from "./i18n.js";

// `let`, not `const` — the dev-only screen gallery (see runGalleryPreview
// below) swaps this for an in-memory fixture store when previewing a screen,
// so every render function above keeps working completely unmodified.
let store = storageLocal();
const app = document.getElementById("screen-root");
const header = document.getElementById("header");
const devbar = document.getElementById("devbar");
// IDENTITY_KEY/LEGACY_IDENTITY_KEY imported from storage.js — used here only
// to decide "is this truly a first-time visitor" and to fully wipe identity
// on reset; storage.js's loadOrCreateIdentity is what actually migrates it.

let identity = null;

// Best-effort "what language is currently on screen" — set by every
// lang-aware render*Step, read by the settings menu button (which has no
// other way to know which language's chrome to render itself in, since it's
// wired up once at boot, before any screen exists) and any zero-context
// screen's fallback. Defaults to "no" purely as a harmless fallback for the
// brief window before any screen has run.
let currentScreenLang = "no";

// Updated by routeToCurrentScreen() and the settings panel's language
// checkboxes — lets closing the settings modal tell whether enabledLangs
// actually changed during that session, so it can decide whether a
// re-route is warranted (see openSettingsPanel).
let lastKnownEnabledLangs = [];

// Guards the one word-timer that may be running at a time — every screen
// transition MUST clear this first, or a stale timeout can fire against a
// screen the user has already left (see renderGuessWordStep/renderWriteWordStep).
let activeTimer = null;
let activeInterval = null;
function clearActiveTimer() {
  if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
  if (activeInterval) { clearInterval(activeInterval); activeInterval = null; }
}

// Bumped every time routeToCurrentScreen() runs — a genuinely different
// session (a dev-toolbar player/day switch, or a fresh page load), NOT
// ordinary in-session navigation. A revealThenSyncHeader() reveal captures
// the token at start and checks it before its delayed header update fires,
// so a reveal abandoned by switching away mid-animation can never clobber a
// DIFFERENT session's header moments later — this was a real bug (a stale
// reveal from one player's Score step overwrote a different player's header
// after a dev-toolbar switch).
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

// Reuses the app's own accent tokens (no ad-hoc colors) for a plain colored-
// rect confetti burst — score step (only when at least one guess was
// correct) and done step (always). See .confetti-piece/@keyframes
// confetti-fall in css/app.css for the actual fall animation; this just
// spawns/cleans up the pieces. Fixed-positioned, so it overlays the
// viewport regardless of #app's scroll position — appended to `document.body`
// rather than `app`, so a screen transition mid-fall (replacing #app's
// contents) can't orphan pieces mid-DOM-tree, though the cleanup timeout
// removes them well before that's ever likely anyway.
const CONFETTI_COLORS = ["var(--color-accent-truth)", "var(--color-accent-turn)", "var(--color-accent-bluff)", "var(--color-accent-gm)"];
function launchConfetti(count = 28) {
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDelay = `${Math.random() * 250}ms`;
    document.body.appendChild(piece);
    pieces.push(piece);
  }
  setTimeout(() => pieces.forEach((p) => p.remove()), 1800);
}

// -- theme: "light" (default, Wordle-style) or "dark" (the original game
// palette, opt-in via the settings panel). index.html has a tiny inline
// script that stamps this same attribute before first paint, to avoid a
// flash of the wrong theme — see loadTheme() in storage.js for the default.
function applyTheme(theme) {
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  // Keeps the browser chrome (status bar / toolbar tint on an installed PWA)
  // matching the actual page background — same values as index.html's
  // pre-paint inline script, so there's no mismatch between first paint and
  // a later in-session toggle.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#FFFFFF" : "#1B1B2E");
}

// -- iOS Safari keyboard workaround ------------------------------------
// .btn-cta (css/app.css) is `position: fixed`, which pins to the LAYOUT
// viewport — on iOS Safari the on-screen keyboard only shrinks the VISUAL
// viewport, so a fixed bottom-pinned button ends up positioned behind the
// keyboard instead of above it. This was a real bug on the name screen's
// "Fortsett" and the write screen's "Send inn" buttons: both sit right next
// to a text input, so opening the keyboard to type made the button
// unreachable. window.visualViewport reports the actually-visible area;
// this tracks how much of the bottom edge is currently covered and feeds it
// back in as --keyboard-inset (see .btn-cta's `bottom` calc), so the button
// rises to stay above the keyboard. No-ops (stays at the CSS default 0px)
// wherever visualViewport isn't supported — desktop browsers, older WebKit.
function trackKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update); // iOS also fires this as the keyboard opens/closes
  update();
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function pctLabel(pct) {
  return pct ? `<span class="streak-pct">+${pct}%</span>` : "";
}

// The ranking list (openRankingPanel) is the first place another player's
// free-text displayName is broadcast to every OTHER player rather than just
// shown back to themselves (or gated behind the dev-only #devbar) — so
// unlike the handful of other `${profile.displayName}` interpolations in
// this file, it needs actual HTML-escaping, not just trusting the input.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// The full-size mascot image markup, identical across most screens (the
// header's own small variant — `renderHeaderImmediate`'s `mascot small` — is
// deliberately separate and untouched by this). This is Cockerel/Cocky
// Monk's brand mark, shown on every screen regardless of who's using the
// app — NOT the same thing as a player's own chosen avatar (see AVATARS
// below), even though both currently default to the same nesen.svg image.
const MASCOT_HTML = `<img class="mascot" src="assets/nesen.svg" alt="" />`;

// Cocky Monk/Cockerel's rooster art, shown instead of a chosen player avatar
// (see AVATARS below) on the two screens that exist BEFORE any profile is
// known at all — the language picker (very first-ever visit) and the
// required sign-in gate. Showing a "profile picture" placeholder there would
// be backwards (there IS no profile yet); this is the game's own mark
// instead. Reuses the avatar picker's rounded-circle masking (avatar-rooster)
// for the same reason it needs it there: a rectangular source photo, not
// hand-drawn to already read as an icon the way nesen.svg is.
const ROOSTER_LOGO_HTML = `<img class="mascot avatar-rooster" src="assets/game-rooster-image.png" alt="" />`;

// A player's own profile picture — picked once on the name screen (see
// renderNameScreen's avatar picker) and persisted server-side
// (server/db.mjs's `avatar` bonus field, same bolt-on pattern as `device`).
// Three options, cycled with chevrons: the original nesen mark (the
// long-nosed default everyone had before this existed), the Cocky Monk
// rooster art (a rectangular photo, so it needs the `--radius-chip` circular
// mask below to read as an avatar rather than a photo), and a plain
// emoji-on-a-brand-green-circle for anyone who wants neither character.
// `AVATAR_ORDER[0]` ("nesen") is the default for both brand-new pickers and
// any pre-existing profile with no `avatar` field yet.
const AVATARS = {
  nesen: { kind: "img", src: "assets/nesen.svg" },
  rooster: { kind: "img", src: "assets/game-rooster-image.png", extraClass: "avatar-rooster" },
  emoji: { kind: "emoji", emoji: "🦊" },
};
const AVATAR_ORDER = ["nesen", "rooster", "emoji"];

/** `sizeClass` is "" for the full-size hero spot or "small" for the header's
 * icon — both are drop-in replacements for what used to be a bare
 * `<img class="mascot small?" .../>`, so every existing `.mascot`/
 * `.mascot.small` CSS rule keeps applying unmodified. */
function avatarHtml(avatarId, sizeClass = "") {
  const a = AVATARS[avatarId] ?? AVATARS.nesen;
  const classes = ["mascot", sizeClass, a.kind === "img" ? (a.extraClass ?? "") : "avatar-emoji"].filter(Boolean).join(" ");
  if (a.kind === "emoji") return `<div class="${classes}">${a.emoji}</div>`;
  return `<img class="${classes}" src="${a.src}" alt="" />`;
}

// Every screen's primary CTA renders as `<button id="continue-btn">` and is
// wired the exact same way — this just avoids repeating the id string and
// getElementById call at each of those call sites.
function wireContinueButton(handler) {
  document.getElementById("continue-btn").addEventListener("click", handler);
}

// "N dager (+X% bonus)" / "N days (+X% bonus)" — the one canonical streak
// phrase, used everywhere the streak itself (not some other stat's bonus) is
// shown. Returns HTML, not plain text — the bonus part is wrapped in
// .text-paren (smaller/muted) to de-emphasize it against the headline
// "N dager" — every caller already renders this into innerHTML, not
// textContent (see updateHeader).
function streakText(days, pct, lang) {
  const unit = days === 1 ? t(lang, "streakUnitOne") : t(lang, "streakUnitMany");
  const bonus = pct ? `<span class="text-paren">${t(lang, "streakBonusSuffix", { pct })}</span>` : "";
  return `${days} ${unit}${bonus}`;
}

// -- persistent header --------------------------------------------------
// #header itself holds the settings menu button (see renderSettingsButton)
// plus two nested wrappers — #header-profile-top (icon+name) and
// #header-stats (points/rank + streak) — the profile info is deliberately
// scoped to those, not the whole header, so renderHeaderImmediate/
// updateHeader below never touch (or need to re-wire the click listener on)
// the menu button. Neither wrapper is re-rendered on every screen — only
// ever touched by updateHeader(), so a point/streak reveal elsewhere in the
// screen can finish its own big-number animation and flash BEFORE the
// header catches up.

// Returns HTML (see streakText's comment) — the rank part is the
// parenthetical, de-emphasized the same way.
function pointsText(profile, lang) {
  const main = t(lang, "pointsMain", { rating: profile.rating });
  const rank = `<span class="text-paren">${t(lang, "pointsRankSuffix", { rank: profile.rank })}</span>`;
  return main + rank;
}

/** "2/3 gjettet + 3/3 skrevet" — today's write/guess progress for one
 * language, given any object with `writeWords`/`guessWords` arrays shaped
 * like a langState (real or fixture). The guessed half is omitted entirely
 * when there's nothing to guess yet (guessWords.length === 0) — same
 * trivial-satisfaction convention as langIsDoneToday/langUntouchedToday. */
function progressText(langState, lang) {
  const guessTotal = langState.guessWords.length;
  const guessDone = langState.guessWords.filter((w) => w.alreadyGuessed).length;
  const writeTotal = langState.writeWords.length;
  const writeDone = langState.writeWords.filter((w) => w.alreadySubmitted).length;
  const parts = [];
  if (guessTotal) parts.push(t(lang, "headerProgressGuessed", { done: guessDone, total: guessTotal }));
  parts.push(t(lang, "headerProgressWritten", { done: writeDone, total: writeTotal }));
  return parts.join(t(lang, "headerProgressJoiner"));
}

// The persistent navbar — deliberately does NOT show
// today's write/guess progress ("3/3 gjettet + 1/3 skrevet") anymore; that
// used to live here but read as clutter on every single screen. It now only
// ever appears once, on the done step itself (see renderDoneStep and
// progressText below), not in the navbar at all.
function renderHeaderImmediate(profile, lang) {
  document.getElementById("header-profile-top").innerHTML = `
    ${avatarHtml(profile.avatar ?? "nesen", "small")}
    <div class="header-name">${profile.displayName}</div>
  `;
  document.getElementById("header-stats").innerHTML = `
    <button class="header-points" id="header-points" type="button">${pointsText(profile, lang)}</button>
    <div id="header-streak">${t(lang, "streak")}: ${streakText(profile.streakDays, profile.streakBonusPct, lang)}</div>
  `;
  // Rewired here (not in updateHeader) because innerHTML above is the only
  // thing that ever recreates this node — updateHeader's normal path just
  // patches innerHTML on the SAME node, so a listener attached here
  // survives every later header update untouched. Reads currentScreenLang
  // at CLICK time (not the `lang` param closed over above) for the same
  // reason openSettingsPanel does — updateHeader can later refresh these
  // numbers for a different language (e.g. switching languages via the
  // done-step's "play the other language" button) without this node ever
  // being recreated, so a captured `lang` would silently go stale.
  document.getElementById("header-points").addEventListener("click", () => openRankingPanel(currentScreenLang));
}

function updateHeader(profile, lang) {
  const pointsEl = document.getElementById("header-points");
  const streakEl = document.getElementById("header-streak");
  if (!pointsEl || !streakEl) { renderHeaderImmediate(profile, lang); return; }
  // innerHTML, not textContent — pointsText/streakText both return HTML now
  // (a nested .text-paren span for the de-emphasized rank/bonus part).
  pointsEl.innerHTML = pointsText(profile, lang);
  streakEl.innerHTML = `${t(lang, "streak")}: ${streakText(profile.streakDays, profile.streakBonusPct, lang)}`;
}

/** Ranking modal — opened by tapping the header's points/rank number (see
 * renderHeaderImmediate). Lists every real (non-bot; see server/db.mjs
 * getLeaderboard) player's rank/first name/rating for `lang`, fetched fresh
 * on every open — a live snapshot of who's ahead/behind right now, not
 * something worth caching. Same modal-overlay/modal-card pattern as
 * openSettingsPanel, but single-screen (no back/forward navigation needed
 * here, so no renderMain-style re-callable function). */
async function openRankingPanel(lang) {
  const overlay = el(`<div class="modal-overlay" id="ranking-overlay"><div class="modal-card"></div></div>`);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector(".modal-card").replaceChildren(el(`
    <div style="display:flex; flex-direction:column; gap:12px">
      <h2>${t(lang, "rankingTitle")}</h2>
      <div id="ranking-body"><p class="empty-note">${t(lang, "rankingLoading")}</p></div>
      <button class="btn secondary full" id="close-ranking-btn">${t(lang, "close")}</button>
    </div>
  `));
  document.getElementById("close-ranking-btn").addEventListener("click", () => overlay.remove());

  const { entries } = await store.getLeaderboard(identity.userId, lang);
  const body = document.getElementById("ranking-body");
  if (!body) return; // modal already closed while the fetch was in flight
  if (!entries.length) {
    body.replaceChildren(el(`<p class="empty-note">${t(lang, "rankingEmpty")}</p>`));
    return;
  }
  body.replaceChildren(el(`
    <div class="ranking-list">
      ${entries.map((e) => `
        <div class="ranking-row ${e.isYou ? "you" : ""}">
          <span class="ranking-rank">${e.rank}.</span>
          <span class="ranking-name">${escapeHtml(e.name)}${e.isYou ? ` (${t(lang, "rankingYou")})` : ""}</span>
          <span class="ranking-rating">${e.rating}</span>
        </div>
      `).join("")}
    </div>
  `));
}

/** Animate `elNode` 0 -> `to`, then flash it, then (only THEN) sync the
 * header — the exact sequence requested: reveal, flash, header catches up.
 * Captures the CURRENT session token and bails at both checkpoints if a
 * dev-toolbar switch (or fresh load) has moved the app on to a different
 * session in the meantime — see the sessionToken comment above. */
function revealThenSyncHeader(elNode, to, profile, lang) {
  const token = sessionToken;
  animateCount(elNode, to, 900, 0, () => {
    if (token !== sessionToken) return;
    elNode.classList.add("flash");
    setTimeout(() => {
      if (token !== sessionToken) return;
      elNode.classList.remove("flash");
      updateHeader(profile, lang);
    }, 450);
  });
}

// -- dev toolbar (testing only — see CLAUDE.md) ------------------------------
// devToolsEnabled reflects the server's DEV_TOOLS flag (fetched once in
// main(), before the first renderDevToolbar() call) — a deployed instance
// answers { devTools: false } and every call below becomes a no-op, so the
// toolbar never appears and never tries to hit the /api/dev/* endpoints the
// server has also 404'd. Language-agnostic on purpose, same as its backing
// db.mjs functions — not localized (internal tool, not shipped UX).
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
// `identity` directly and call routeToCurrentScreen()/renderLanguagePicker()
// themselves, bypassing this gate entirely), so devbar testing stays exactly
// as before.
let requireGoogleAuth = false;

// -- PWA install state --------------------------------------------------
// Populated here (module load, so nothing is missed regardless of when the
// browser decides to fire these) and read by the settings panel's "Install
// app" section — this file only tracks WHETHER/HOW installing is currently
// possible, no install UI lives here, same separation as
// devToolsEnabled/googleClientId above.
let deferredInstallPrompt = null; // the captured beforeinstallprompt event, if any (Chrome/Android/desktop)
let appInstalledEvent = false; // set by the `appinstalled` event; isRunningStandalone() below covers the rest

function isRunningStandalone() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Chrome/Android/desktop only — iOS Safari has no equivalent event; "Add to
// Home Screen" there is a manual Share-sheet action we can only describe,
// never trigger (see installSectionHtml in the settings panel).
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // suppress the browser's own mini-infobar; Settings shows our own control instead
  deferredInstallPrompt = e;
});
window.addEventListener("appinstalled", () => {
  appInstalledEvent = true;
  deferredInstallPrompt = null;
});

/** Best-effort: a failed registration (unsupported browser, blocked, served
 * over plain HTTP in local dev from a non-localhost host, etc.) just means
 * no install prompt ever fires — never a fatal error for the app itself. */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

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
      await routeToCurrentScreen();
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
    await routeToCurrentScreen();
  });
}

// -- settings: top-left menu button + reset-my-own-player flow --------------
// Rendered once at boot, not re-rendered per navigation (unlike #devbar) —
// its click handler reads `identity`/currentScreenLang fresh at click time,
// so it always acts on whoever/whatever is currently active, including
// after a dev-toolbar switch.
// Two columns: `.header-left` (icon+name on top, the menu button on its own
// row below, both hugging the same left edge) and `#header-stats` (points/
// rank + streak, right-aligned) — splitting the left column into its own
// two rows is what gives the stats column the extra horizontal room it
// needs for its denser text. Both #header-profile-top and #header-stats are
// created empty here and filled by renderHeaderImmediate/updateHeader — the
// menu button itself is the one thing neither of those ever touches or
// re-wires. On screens with no profile yet (#header-profile-top empty —
// name/how-to-play/welcome/sign-in-gate) `.header-left` just shows the menu
// button alone (see the `:empty` guard in app.css), which is exactly the
// "more space before the next thing" look asked for.
function renderSettingsButton() {
  const menuBtn = el(`
    <button class="header-menu-btn" id="settings-fab" aria-label="${t(currentScreenLang, "settingsAriaLabel")}">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </button>
  `);
  const profileTop = el(`<div id="header-profile-top" class="header-profile-top"></div>`);
  const left = el(`<div class="header-left"></div>`);
  left.append(profileTop, menuBtn);
  const stats = el(`<div id="header-stats" class="header-stats"></div>`);
  header.replaceChildren(left, stats);
  menuBtn.addEventListener("click", openSettingsPanel);
}

function themeToggleLabel(lang) {
  return loadTheme() === "light" ? t(lang, "themeToggleToDark") : t(lang, "themeToggleToLight");
}

// Shown only when the server has a GOOGLE_CLIENT_ID configured (see
// googleClientId above) — otherwise this whole section is absent, not just
// hidden. `identity.googleLinked` (set the moment handleGoogleCredential
// succeeds, see below) swaps the button out for a plain confirmation line
// plus a small "Sign out" text link (see openSignOutConfirm) so a signed-in
// user is never shown the sign-in button again on this device.
function accountSectionHtml(lang) {
  if (!googleClientId) return "";
  if (identity.googleLinked) {
    return `
      <p class="empty-note">${t(lang, "googleLinkedNote")}</p>
      <button class="btn-text" id="google-signout-btn">${t(lang, "signOut")}</button>
    `;
  }
  return `
    <p class="empty-note">${t(lang, "googleSignInNote")}</p>
    <div class="settings-google-btn-wrap" id="google-signin-btn"></div>
  `;
}

/** "Logg ut" / "Sign out" — forgets THIS DEVICE's identity only; never
 * touches server data (that's the reset button / resetPlayer, a real
 * delete). The server's db.identities still maps the Google account to the
 * same profile, so signing back in with the SAME account reunites with it
 * via linkGoogleIdentity's existing-link path (isNewProfile: false, no data
 * lost) — this is what makes it safe to use on a shared device, or just to
 * switch which Google account this browser is signed in as. On a deployment
 * with REQUIRE_GOOGLE_AUTH on, the next load lands straight back on the
 * sign-in gate. */
function signOut() {
  localStorage.removeItem(IDENTITY_KEY);
  localStorage.removeItem(LEGACY_IDENTITY_KEY);
  location.reload();
}

/** Confirmation step for the settings panel's small "Sign out" text button —
 * same shape as openResetConfirm below, replacing the modal's content in
 * place rather than stacking a second overlay. Less severe than reset (no
 * data is lost — see signOut's own comment), so its confirm button stays
 * `secondary`, not `danger`. */
function openSignOutConfirm(overlay, lang) {
  overlay.querySelector(".modal-card").replaceChildren(el(`
    <div style="display:flex; flex-direction:column; gap:12px">
      <h2>${t(lang, "signOutConfirmHeading")}</h2>
      <p class="empty-note">${t(lang, "signOutConfirmBody")}</p>
      <button class="btn secondary full" id="confirm-signout-btn">${t(lang, "signOutConfirmYes")}</button>
      <button class="btn secondary full" id="cancel-signout-btn">${t(lang, "cancel")}</button>
    </div>
  `));
  document.getElementById("cancel-signout-btn").addEventListener("click", () => overlay.remove());
  document.getElementById("confirm-signout-btn").addEventListener("click", signOut);
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
// `size` defaults to Google's larger button for the full-screen, blocking
// sign-in gate (see renderSignInGate) — the settings panel's optional link
// passes "medium" instead, matching the smaller/de-emphasized presentation
// the rest of that modal's account/danger cluster uses.
function renderGoogleButton(containerId, attemptsLeft = 50, size = "large") {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (typeof google === "undefined" || !google.accounts?.id) {
    if (attemptsLeft <= 0) return; // script likely blocked (ad blocker, offline) — give up quietly
    setTimeout(() => renderGoogleButton(containerId, attemptsLeft - 1, size), 100);
    return;
  }
  google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleCredential });
  google.accounts.id.renderButton(container, { theme: "outline", size, width: size === "large" ? 260 : 220 });
}

/** Google's callback hands us a signed ID token, not an identity — the
 * server verifies it and tells us which userId to actually use (see
 * linkGoogleIdentity in server/db.mjs): either our current one, freshly
 * linked, or an existing one this Google account was already linked to from
 * another device. Either way we adopt whatever userId comes back, so a
 * reload always lands on the one canonical profile for this person. Note
 * linkGoogleIdentity's response carries identity-level fields only
 * (displayName/enabledLangs) — no rating numbers, since those no longer
 * have a single "the" value across languages; the language flow below
 * re-fetches per-language state via getToday as needed.
 *
 * `isNewProfile` (true only the very first time THIS profile is ever
 * created) decides what happens next instead of a blanket reload: after a
 * reload, localStorage always looks populated regardless of whether this is
 * a brand-new player or a returning one, so isFirstTime in main() can't
 * reliably tell them apart post-reload — this flag is the one place that
 * still can. A genuinely new profile gets the same language-picker +
 * How-to-play + Welcome onboarding an anonymous first-timer would (see
 * registerFlow); a returning one (this device's fresh anonymous id adopting
 * an existing Google-linked profile, or the optional settings-panel link)
 * just reloads straight in. */
async function handleGoogleCredential(response) {
  const result = await store.signInWithGoogle(response.credential, identity.userId);
  if (!result.ok) return;
  identity = { userId: result.userId, displayName: result.displayName, googleLinked: true };
  saveIdentity(identity);
  if (result.isNewProfile) {
    await renderDevToolbar(); // picks up the brand-new player in the dev switcher
    renderLanguagePicker(async (lang) => {
      await store.setEnabledLangs(identity.userId, [lang]);
      currentScreenLang = lang;
      renderHowToPlay(lang, async () => {
        const langState = await refetchLangState(lang);
        renderWelcomeStep(lang, identity.displayName, langState.profile, () => resumeFlowFromState(langState, lang));
      });
    });
  } else {
    location.reload();
  }
}

/** The required-sign-in screen (see requireGoogleAuth) — shown instead of
 * the normal onboarding/Ready/Guess/Write flow whenever a deployment has
 * REQUIRE_GOOGLE_AUTH=1 and this device hasn't linked a Google account yet.
 * Deliberately has no "skip"/"play as guest" option — that's the whole
 * point of the flag. Shown BEFORE any gameplay language is chosen (it gates
 * main() ahead of the language picker), so unlike every other screen it has
 * no real language context to render in — deliberately kept in Norwegian
 * (matching this app's historical default) rather than also being made
 * bilingual, to keep this already-large feature's scope bounded. */
function renderSignInGate() {
  clearActiveTimer();
  const lang = "no";
  app.replaceChildren(el(`
    <div class="screen">
      ${ROOSTER_LOGO_HTML}
      <div class="card">
        <h2>${t(lang, "signInHeading")}</h2>
        <p class="empty-note">${t(lang, "signInBody")}</p>
        <div id="google-signin-gate-btn" style="display:flex; justify-content:center; margin-top:12px"></div>
      </div>
    </div>
  `));
  renderGoogleButton("google-signin-gate-btn");
}

/** "Install app" section body — mutually exclusive states, always showing
 * SOMETHING actionable/informative rather than nothing:
 *  - already installed (running standalone, or the `appinstalled` event
 *    already fired this session): just says so, no CTA.
 *  - a native install prompt is available (Chrome/Android/desktop — see the
 *    beforeinstallprompt listener near devToolsEnabled above): a real
 *    button that triggers it.
 *  - iOS Safari: no such event exists there at all (Apple doesn't expose
 *    one) — the only way to install is the manual Share -> "Add to Home
 *    Screen" flow, so this is instructions, not a button.
 *  - anything else (Firefox, other browsers with no install support
 *    detected): generic manual instructions, so this section is never
 *    empty regardless of browser. */
function installSectionHtml(lang) {
  if (isRunningStandalone() || appInstalledEvent) return `<p class="empty-note">${t(lang, "installedNote")}</p>`;
  if (deferredInstallPrompt) return `<button class="btn secondary full" id="install-app-btn">${t(lang, "installButton")}</button>`;
  if (isIOSDevice()) return `<button class="btn-text" id="install-ios-instructions-btn">${t(lang, "installIOSLinkLabel")}</button>`;
  return `<p class="empty-note">${t(lang, "installGenericInstructions")}</p>`;
}

/** Step-by-step "Add to Home Screen" walkthrough for iOS Safari — Apple
 * exposes no beforeinstallprompt-equivalent event there, so the Share sheet
 * is the only way to install at all, and it has enough steps to want its own
 * screen rather than a cramped inline paragraph (see installSectionHtml).
 * Swaps the modal's content in place, same pattern as openResetConfirm/
 * openSignOutConfirm below — but unlike those, this isn't a confirmation, so
 * its one button goes BACK to the real settings screen (`onBack`, i.e.
 * openSettingsPanel's renderMain) rather than closing the whole modal. */
function renderInstallInstructions(overlay, lang, onBack) {
  overlay.querySelector(".modal-card").replaceChildren(el(`
    <div style="display:flex; flex-direction:column; gap:12px">
      <button class="btn-text" id="install-instructions-back-btn">← ${t(lang, "back")}</button>
      <h2>${t(lang, "installInstructionsHeading")}</h2>
      <ol class="install-steps">
        <li>${t(lang, "installInstructionsStep1")}</li>
        <li>${t(lang, "installInstructionsStep2")}</li>
        <li>${t(lang, "installInstructionsStep3")}</li>
      </ol>
    </div>
  `));
  document.getElementById("install-instructions-back-btn").addEventListener("click", onBack);
}

/**
 * About / credits — a settings sub-screen, same swap-content-in-place pattern
 * as renderInstallInstructions above (and, like it and the confirm steps, not
 * a gallery card: the gallery previews main-flow screens, and every card
 * already renders the real settings button, so this is reachable from any of
 * them).
 *
 * This screen EXISTS to satisfy a licensing obligation, not as decoration:
 * Bokmålsordboka's definitions are CC BY 4.0 and WordNet's license requires
 * its copyright notice be retained, so both corpora must be credited
 * somewhere in the app (see ASSETS.md). Don't remove it, and don't let the
 * attribution text drift — it's fetched from the active corpora's manifests
 * (GET /api/credits), so it always describes the word list actually in play
 * rather than a hardcoded guess.
 *
 * Rendered in ONE language (the caller's `lang`), like every screen except
 * the language picker — but it lists every active corpus, not just that
 * language's, since credit is owed for all content the app ships.
 */
async function renderAboutPanel(overlay, lang, onBack) {
  const card = overlay.querySelector(".modal-card");
  const body = (creditsHtml) => el(`
    <div style="display:flex; flex-direction:column; gap:12px">
      <button class="btn-text" id="about-back-btn">← ${t(lang, "back")}</button>
      <h2>${t(lang, "aboutHeading")}</h2>
      <p class="empty-note">${t(lang, "aboutBlurb")}</p>
      <section class="settings-section">
        <p class="settings-section-title">${t(lang, "aboutWordsHeading")}</p>
        <p class="empty-note">${t(lang, "aboutWordsIntro")}</p>
        ${creditsHtml}
      </section>
    </div>
  `);
  const wireBack = () => document.getElementById("about-back-btn").addEventListener("click", onBack);

  // Render the frame immediately so "back" works even while the fetch is in
  // flight (or if it never resolves) — this panel must never trap a player.
  card.replaceChildren(body(`<p class="empty-note">…</p>`));
  wireBack();

  let corpora = [];
  try {
    const res = await store.getCredits();
    corpora = res?.corpora ?? [];
  } catch {
    corpora = [];
  }
  // A failed fetch shows a plain note rather than an empty section — silently
  // rendering nothing would look like "this app credits no one."
  const creditsHtml = corpora.length
    ? corpora.map((c) => `
        <div class="about-credit">
          <p class="about-credit-source">${escapeHtml(c.attribution)}</p>
          <p class="about-credit-meta">${escapeHtml(LANG_LABELS[c.lang] ?? c.lang)} · ${t(lang, "aboutCorpusLine", { count: c.counts.words })}</p>
        </div>
      `).join("")
    : `<p class="empty-note">${t(lang, "aboutCreditsUnavailable")}</p>`;

  card.replaceChildren(body(creditsHtml));
  wireBack();
}

// Fetches enabledLangs fresh rather than trusting lastKnownEnabledLangs —
// that cache is only ever WRITTEN by routeToCurrentScreen(), which a
// brand-new player never passes through before their first-ever settings
// visit (onboarding sets the initial language via setEnabledLangs directly,
// without routing through it) — this was a real bug: the very first time a
// new player opened settings, the language they'd just onboarded with
// showed as unchecked, because the cache was still its initial empty [].
//
// Sections, top to bottom by priority: Appearance and Language are the
// everyday, constructive settings, so they come first as full-width
// buttons/controls; Install app is a one-time, opt-in nudge; Account
// (Google sign-out) and Reset are the least-visited, most consequential
// actions, so they're pushed to a visually separated cluster at the very
// end as small text links (see .btn-text/.settings-danger-zone in
// css/app.css) rather than full buttons — each still requires its own
// confirmation step before doing anything (openSignOutConfirm/
// openResetConfirm), same as before for reset, now also true for sign-out.
async function openSettingsPanel() {
  const lang = currentScreenLang;
  const enabledLangsAtOpen = (await store.getToday(identity.userId)).enabledLangs;
  lastKnownEnabledLangs = enabledLangsAtOpen;

  const overlay = el(`<div class="modal-overlay" id="settings-overlay"><div class="modal-card"></div></div>`);
  document.body.appendChild(overlay);

  // Toggling a language during this settings session only matters to the
  // rest of the app once the modal closes — re-routing while it's still
  // open would be pointless churn behind the overlay. Comparing against
  // enabledLangsAtOpen (rather than always re-routing) is what keeps this
  // from kicking a user out of an in-progress timed guess/write screen just
  // because they opened settings to toggle the theme and closed it again.
  const closeAndMaybeReroute = async () => {
    overlay.remove();
    const changed = lastKnownEnabledLangs.length !== enabledLangsAtOpen.length
      || lastKnownEnabledLangs.some((l, i) => l !== enabledLangsAtOpen[i]);
    if (changed) await routeToCurrentScreen();
  };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAndMaybeReroute(); });

  // Pulled out into its own function (rather than the inline build this used
  // to be) so the iOS install-instructions sub-screen (renderInstallInstructions)
  // has something to hand its own "back" button — swap the modal's content
  // out to the walkthrough, then back to this, without closing the overlay.
  function renderMain() {
    const languageRows = LANGS.map((l) => `
      <label class="settings-lang-row">
        <input type="checkbox" data-lang-toggle="${l}" ${enabledLangsAtOpen.includes(l) ? "checked" : ""} />
        <span>${LANG_LABELS[l]}</span>
      </label>
    `).join("");

    overlay.querySelector(".modal-card").replaceChildren(el(`
      <div style="display:flex; flex-direction:column; gap:12px">
        <h2>${t(lang, "settingsTitle")}</h2>

        <section class="settings-section">
          <p class="settings-section-title">${t(lang, "appearanceSectionTitle")}</p>
          <button class="btn secondary full" id="theme-toggle-btn">${themeToggleLabel(lang)}</button>
        </section>

        <section class="settings-section">
          <p class="settings-section-title">${t(lang, "languageSectionTitle")}</p>
          <p class="empty-note">${t(lang, "languageSectionNote")}</p>
          ${languageRows}
          <p class="empty-note settings-warning" id="language-min-warning" hidden>${t(lang, "languageLastOneNote")}</p>
        </section>

        <section class="settings-section">
          <p class="settings-section-title">${t(lang, "installSectionTitle")}</p>
          <div id="install-section-body">${installSectionHtml(lang)}</div>
        </section>

        <section class="settings-section">
          <p class="settings-section-title">${t(lang, "aboutSectionTitle")}</p>
          <button class="btn-text" id="about-btn">${t(lang, "aboutLinkLabel")}</button>
        </section>

        <div class="settings-danger-zone">
          <p class="settings-section-title">${t(lang, "accountSectionTitle")}</p>
          ${accountSectionHtml(lang)}
          <button class="btn-text danger" id="reset-btn">${t(lang, "resetButton")}</button>
        </div>

        <button class="btn secondary full" id="close-settings-btn">${t(lang, "close")}</button>
      </div>
    `));

    document.getElementById("close-settings-btn").addEventListener("click", closeAndMaybeReroute);
    document.getElementById("reset-btn").addEventListener("click", () => openResetConfirm(overlay, lang));
    document.getElementById("about-btn").addEventListener("click", () => renderAboutPanel(overlay, lang, renderMain));
    document.getElementById("theme-toggle-btn").addEventListener("click", (e) => {
      const next = loadTheme() === "light" ? "dark" : "light";
      saveTheme(next);
      applyTheme(next);
      e.target.textContent = themeToggleLabel(lang);
    });
    document.querySelectorAll("[data-lang-toggle]").forEach((cb) => {
      cb.addEventListener("change", async () => {
        const checked = [...document.querySelectorAll("[data-lang-toggle]")].filter((c) => c.checked).map((c) => c.dataset.langToggle);
        const warning = document.getElementById("language-min-warning");
        if (checked.length === 0) {
          cb.checked = true; // at least one language must stay enabled
          if (warning) warning.hidden = false;
          return;
        }
        if (warning) warning.hidden = true;
        const result = await store.setEnabledLangs(identity.userId, checked);
        if (result.ok) lastKnownEnabledLangs = result.enabledLangs;
      });
    });
    document.getElementById("install-app-btn")?.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice; // "accepted" or "dismissed" — either way this prompt instance is now spent
      deferredInstallPrompt = null;
      const body = document.getElementById("install-section-body");
      if (body) body.innerHTML = installSectionHtml(lang);
    });
    document.getElementById("install-ios-instructions-btn")?.addEventListener("click", () => renderInstallInstructions(overlay, lang, renderMain));
    if (googleClientId && !identity.googleLinked) renderGoogleButton("google-signin-btn", 50, "medium");
    document.getElementById("google-signout-btn")?.addEventListener("click", () => openSignOutConfirm(overlay, lang));
  }

  renderMain();
}

function openResetConfirm(overlay, lang) {
  overlay.querySelector(".modal-card").replaceChildren(el(`
    <div style="display:flex; flex-direction:column; gap:12px">
      <h2>${t(lang, "resetConfirmHeading")}</h2>
      <p class="empty-note">${t(lang, "resetConfirmBody", { googleSuffix: identity.googleLinked ? t(lang, "resetConfirmGoogleSuffix") : "" })}</p>
      <button class="btn danger full" id="confirm-reset-btn">${t(lang, "resetConfirmYes")}</button>
      <button class="btn secondary full" id="cancel-reset-btn">${t(lang, "cancel")}</button>
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

// -- language selection ---------------------------------------------------

/** The ONE screen shown before any gameplay language is known — the very
 * first thing a brand-new player sees (ahead of even the name screen).
 * Deliberately bilingual/neutral chrome — no heading text at all now (the
 * two button labels, "Norsk"/"English", already say it), since there's no
 * "current language" yet to render one IN. Every screen after this one
 * renders entirely in whichever language got picked here. */
function renderLanguagePicker(onChoose) {
  clearActiveTimer();
  const buttons = LANGS.map((lang) =>
    `<button class="btn full" data-lang="${lang}" style="margin-bottom:10px">${LANG_LABELS[lang]}</button>`
  ).join("");
  app.replaceChildren(el(`
    <div class="screen">
      ${ROOSTER_LOGO_HTML}
      <div class="card">${buttons}</div>
    </div>
  `));
  for (const lang of LANGS) {
    document.querySelector(`[data-lang="${lang}"]`).addEventListener("click", () => onChoose(lang));
  }
}

/** Shown when a dual-language player opens the app on a day where NEITHER
 * enabled language has been touched yet (see routeToCurrentScreen) — unlike
 * the first-ever language picker, this player already has an established
 * language, so it renders in `primaryLang` (their first-enabled language)
 * rather than bilingual chrome; the two choice buttons are still each
 * labeled by name regardless. */
function renderChooseTodayLangStep(primaryLang, enabledLangs, byLang) {
  currentScreenLang = primaryLang;
  clearActiveTimer();
  const buttons = enabledLangs.map((lang) =>
    `<button class="btn full" data-lang="${lang}" style="margin-bottom:10px">${LANG_LABELS[lang]}</button>`
  ).join("");
  app.replaceChildren(el(`
    <div class="screen">
      ${MASCOT_HTML}
      <h1 style="text-align:center">${t(primaryLang, "chooseTodayLangGreeting")}</h1>
      <p class="empty-note" style="text-align:center; margin-top:8px">${t(primaryLang, "chooseTodayLangHeading")}</p>
      <div class="card" style="margin-top:16px">${buttons}</div>
    </div>
  `));
  for (const lang of enabledLangs) {
    document.querySelector(`[data-lang="${lang}"]`).addEventListener("click", () => enterLanguageFlow(lang, byLang[lang]));
  }
}

// -- onboarding -----------------------------------------------------------

function renderNameScreen(lang, startingName, onDone) {
  currentScreenLang = lang;
  clearActiveTimer();
  let avatarIndex = 0; // AVATAR_ORDER[0] ("nesen") — same default as an unset profile
  app.replaceChildren(el(`
    <div class="screen">
      <div class="avatar-picker">
        <button type="button" class="avatar-picker-arrow" id="avatar-prev" aria-label="${t(lang, "avatarPrev")}">‹</button>
        <div id="avatar-preview">${avatarHtml(AVATAR_ORDER[avatarIndex])}</div>
        <button type="button" class="avatar-picker-arrow" id="avatar-next" aria-label="${t(lang, "avatarNext")}">›</button>
      </div>
      <div class="card">
        <h2>${t(lang, "chooseNameHeading")}</h2>
        <input type="text" id="name-input" value="${startingName}" />
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "continue")}</button>
    </div>
  `));
  const preview = document.getElementById("avatar-preview");
  const cycle = (delta) => {
    avatarIndex = (avatarIndex + delta + AVATAR_ORDER.length) % AVATAR_ORDER.length;
    preview.replaceChildren(el(avatarHtml(AVATAR_ORDER[avatarIndex])));
  };
  document.getElementById("avatar-prev").addEventListener("click", () => cycle(-1));
  document.getElementById("avatar-next").addEventListener("click", () => cycle(1));
  wireContinueButton(() => {
    const displayName = document.getElementById("name-input").value.trim() || startingName;
    onDone(displayName, AVATAR_ORDER[avatarIndex]);
  });
}

function renderHowToPlay(lang, onDone) {
  currentScreenLang = lang;
  clearActiveTimer();
  const bodyParagraphs = t(lang, "howToPlayBody").split("\n\n").map((p) => `<p>${p}</p>`).join("");
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <div class="card">
        <h2>${t(lang, "howToPlayHeading")}</h2>
        ${bodyParagraphs}
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "howToPlayContinue")}</button>
    </div>
  `));
  wireContinueButton(onDone);
}

// First-time-only: a personal welcome before the very first guess round —
// shows the fresh profile's starting numbers (rating counts UP into
// existence, streak counts DOWN to the 0 it actually starts at, for a little
// contrast) before the "start the game" CTA.
function renderWelcomeStep(lang, displayName, profile, onStart) {
  currentScreenLang = lang;
  clearActiveTimer();
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <h1 style="text-align:center">${t(lang, "welcomeHeading", { name: displayName })}</h1>
      <div class="card" style="margin-top:16px">
        <div class="stat-row"><span>${t(lang, "welcomeStartPoints")}</span><span id="start-points" style="font-weight:700">0</span></div>
        <div class="stat-row" style="margin-top:8px"><span>${t(lang, "welcomeStreakLabel")}</span><span style="font-weight:700"><span id="start-streak">0</span> ${t(lang, "doneDays")}</span></div>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "welcomeContinue")}</button>
    </div>
  `));
  animateCount(document.getElementById("start-points"), profile.rating, 900);
  animateCount(document.getElementById("start-streak"), 0, 900, 5);
  wireContinueButton(onStart);
}

// Shown every time a RETURNING player enters a language's flow and there's
// no unseen write-recap to show instead — so the guess timer never starts
// the instant the app opens; there's always a beat to get oriented first.
function renderReadyStep(langState, lang, onStart) {
  currentScreenLang = lang;
  clearActiveTimer();
  const { profile } = langState;
  app.replaceChildren(el(`
    <div class="screen">
      ${MASCOT_HTML}
      <h1 style="text-align:center">${t(lang, "readyHeading", { name: profile.displayName })}</h1>
      <div class="card" style="margin-top:16px">
        <div class="stat-row"><span>${t(lang, "points")}</span><span style="font-weight:700">${profile.rating}</span></div>
        <div class="stat-row" style="margin-top:8px"><span>${t(lang, "streak")}</span><span style="font-weight:700">${streakText(profile.streakDays, profile.streakBonusPct, lang)}</span></div>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "readyContinue")}</button>
    </div>
  `));
  wireContinueButton(onStart);
}

// The async "last time you wrote" recap — write-only now (see db.mjs / the
// approved plan): fooled-vote credit can't be known until the guess window
// on your words closes, so it's the one piece of feedback that can't be
// shown immediately in the step flow below and has to wait for next login.
function renderWriteRecap(result, profile, lang, onContinue) {
  currentScreenLang = lang;
  clearActiveTimer();
  const fooledWordCount = (result.fooledByWord ?? []).length;

  // Header is already accurate by the time this shows (see
  // enterLanguageFlow) — these points were credited at settlement, possibly
  // days ago. The animation here is pure storytelling, not a live
  // "before vs. after" state change.
  if (fooledWordCount === 0) {
    app.replaceChildren(el(`
      <div class="screen">
        ${MASCOT_HTML}
        <p class="eyebrow" style="text-align:center">${t(lang, "writeRecapEyebrow")}</p>
        <div class="card" style="margin-top:16px">
          <p style="text-align:center">${t(lang, "writeRecapNoneFooled")}</p>
          <div class="stat-row" style="margin-top:16px"><span>${t(lang, "streak")}</span><span class="streak-badge">${streakText(profile.streakDays, profile.streakBonusPct, lang)}</span></div>
          <div class="stat-row" style="margin-top:10px"><span>${t(lang, "rating")}</span><span>${profile.rating}</span></div>
        </div>
        <button class="btn full btn-cta" id="continue-btn">${t(lang, "continue")}</button>
      </div>
    `));
    wireContinueButton(onContinue);
    return;
  }

  app.replaceChildren(el(`
    <div class="screen">
      ${MASCOT_HTML}
      <p class="eyebrow" style="text-align:center">${t(lang, "writeRecapEyebrow")}</p>
      <p style="text-align:center; font-weight:700; font-size:18px">${t(lang, "writeRecapFooled", { count: fooledWordCount })}</p>
      <p class="eyebrow" style="text-align:center; margin-top:8px">${t(lang, "writeRecapYouGet")}</p>
      <div class="recap-points" id="points">0</div>
      <div class="card" style="margin-top:16px">
        <div class="stat-row"><span>${t(lang, "streakBonus")}</span><span>+${result.writeStreakPct}%</span></div>
        <div class="stat-row" style="margin-top:10px"><span>${t(lang, "total")}</span><span style="font-weight:700">${result.writePoints}</span></div>
        <div class="stat-row" style="margin-top:10px"><span>${t(lang, "streak")}</span><span class="streak-badge">${streakText(profile.streakDays, profile.streakBonusPct, lang)}</span></div>
        <div class="stat-row" style="margin-top:10px"><span>${t(lang, "rating")}</span><span>${profile.rating}</span></div>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "continue")}</button>
    </div>
  `));
  animateCount(document.getElementById("points"), result.writeBasePoints ?? result.writePoints ?? 0, 900);
  wireContinueButton(onContinue);
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

// `kind` is "guess" (timed out, nothing recorded), "write" (timed out,
// nothing recorded), or "write-saved" — a write timeout where the user had
// already typed WRITE_AUTOSUBMIT_MIN_CHARS+ (config.js), so ui.js
// auto-submitted it before showing this screen; the copy here must say so,
// or "you ran out of time" would wrongly imply nothing was saved.
function renderTimeoutStep(kind, lang, onNext) {
  currentScreenLang = lang;
  clearActiveTimer();
  const heading = kind === "guess" ? t(lang, "timeoutGuessHeading")
    : kind === "write-saved" ? t(lang, "timeoutWriteSavedHeading")
    : t(lang, "timeoutWriteHeading");
  const body = kind === "write-saved" ? t(lang, "timeoutWriteSavedBody") : t(lang, "timeoutBody");
  app.replaceChildren(el(`
    <div class="screen">
      <div class="timeout-box ${kind === "write-saved" ? "saved" : ""}">
        <h2>${heading}</h2>
        <p class="empty-note">${body}</p>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "next")}</button>
    </div>
  `));
  wireContinueButton(onNext);
}

// -- the guided step flow: Guess (one at a time) -> Score -> Write (one at a
// time) -> Done. Answered/skipped words drop out; the LAST one in a step
// advances straight to the next step's screen. Every step is scoped to ONE
// language (`lang`) — its own store calls, its own re-fetches via
// store.getToday(...).byLang[lang], entirely independent of the other
// enabled language's own in-flight session, if any.

/** Re-fetches just this user's current state for ONE language — the common
 * "an action just landed server-side, get this language's fresh view" step
 * used throughout the guided flow below. */
async function refetchLangState(lang) {
  return (await store.getToday(identity.userId)).byLang[lang];
}

async function renderGuessWordStep(langState, lang) {
  currentScreenLang = lang;
  clearActiveTimer();
  const remaining = langState.guessWords.filter((w) => !w.alreadyGuessed);
  if (!remaining.length) {
    const fresh = await refetchLangState(lang);
    renderWriteWordStep(fresh, lang);
    return;
  }
  const word = remaining[0];
  const position = langState.guessWords.length - remaining.length + 1;

  app.replaceChildren(el(`
    <div class="screen">
      ${countdownBarHtml(TIMERS.guessSeconds)}
      <p class="eyebrow">${t(lang, "guessEyebrow", { position, total: langState.guessWords.length })}</p>
      ${renderGuessWordMarkup(word, lang)}
    </div>
  `));
  for (const opt of word.options) {
    document.getElementById(`opt-${word.wordId}-${opt.id}`)?.addEventListener("click", async () => {
      // Guards against a double-click/double-tap sending a second guess
      // request while the first is still in flight — without this, the
      // second request comes back "already_guessed" and (previously) did
      // nothing visible, which is exactly what made the click feel like it
      // "didn't work" and needed several more taps.
      const buttons = document.querySelectorAll(`#option-list-${word.wordId} .option-btn`);
      if ([...buttons].some((b) => b.disabled)) return;
      buttons.forEach((b) => { b.disabled = true; });
      clearActiveTimer();
      const res = await store.submitGuess(identity.userId, word.wordId, opt.id, lang);
      if (!res.ok && res.error !== "already_guessed") {
        buttons.forEach((b) => { b.disabled = false; }); // genuine failure — let them try again
        return;
      }
      // "already_guessed" means a duplicate of an already-successful guess —
      // treat it the same as success (refetch + advance) rather than a dead end.
      await afterGuessAction(res, lang);
    });
  }
  document.getElementById(`hint-${word.wordId}`)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const res = await store.getVoteDistribution(identity.userId, word.wordId, lang);
    if (!res.ok) { btn.disabled = false; return; }
    if (res.noData) { btn.textContent = t(lang, "hintNoData"); return; }
    btn.textContent = t(lang, "hintShown");
    for (const { id, pct } of res.distribution) {
      document.getElementById(`opt-${word.wordId}-${id}`)?.insertAdjacentHTML("beforeend", `<span class="hint-pct">${pct}%</span>`);
    }
  });
  activeTimer = setTimeout(async () => {
    clearActiveTimer();
    renderTimeoutStep("guess", lang, async () => {
      const res = await store.skipGuess(identity.userId, word.wordId, lang);
      if (!res.ok) return;
      await afterGuessAction(res, lang);
    });
  }, TIMERS.guessSeconds * 1000);
  startCountdownSeconds(TIMERS.guessSeconds);
}

async function afterGuessAction(res, lang) {
  if (res.guessResult) {
    renderScoreStep(res.guessResult, lang, async () => {
      const fresh = await refetchLangState(lang);
      renderWriteWordStep(fresh, lang);
    });
  } else {
    const fresh = await refetchLangState(lang);
    renderGuessWordStep(fresh, lang);
  }
}

function renderGuessWordMarkup(w, lang) {
  const options = w.options.map((opt) => `<button class="option-btn" id="opt-${w.wordId}-${opt.id}"><span>${opt.text}</span></button>`).join("");
  // Omitted entirely (not just disabled) when nobody's guessed this word yet
  // today — see `hintAvailable` in server/db.mjs's getTodayStateForLang —
  // there'd be nothing to hint at, and showing a button just to click it
  // and learn that felt worse than not offering it at all.
  const hintBtn = w.hintAvailable ? `<button class="hint-btn" id="hint-${w.wordId}">${t(lang, "hint")}</button>` : "";
  return `
    <div class="word-block">
      <div class="word-title">${w.word}</div>
      ${hintBtn}
      <div class="option-list" id="option-list-${w.wordId}">${options}</div>
    </div>`;
}

function renderScoreStep(result, lang, onContinue) {
  currentScreenLang = lang;
  clearActiveTimer();
  const rows = result.words.map((w, i) => renderReviewRow(w, i, lang)).join("");
  app.replaceChildren(el(`
    <div class="screen">
      ${MASCOT_HTML}
      <p class="eyebrow" style="text-align:center">${t(lang, "scoreEyebrow")}</p>
      <div class="recap-points score-points" id="points">0</div>
      <div class="card" style="margin-top:16px">
        <div class="stat-row"><span>${t(lang, "correctGuesses")}</span><span>${result.correctCount} / ${result.guessTotal}${pctLabel(result.pct)}</span></div>
        <div class="review-list">${rows}</div>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "continue")}</button>
    </div>
  `));
  wireReviewToggles();
  if (result.correctCount > 0) launchConfetti();
  revealThenSyncHeader(document.getElementById("points"), result.points, result.profile, lang);
  wireContinueButton(onContinue);
}

function renderReviewRow(w, i, lang) {
  const options = w.options.map((o) => `
    <div class="review-option ${o.isTruth ? "truth" : ""} ${o.isMine ? "mine" : ""}">
      <div class="review-option-top">
        ${o.isTruth ? `<span class="review-option-label">${t(lang, "correctAnswer")}</span>` : (o.isMine ? `<span class="review-option-label">${t(lang, "yourAnswer")}</span>` : "<span></span>")}
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

async function renderWriteWordStep(langState, lang, skippedIds = new Set()) {
  currentScreenLang = lang;
  clearActiveTimer();
  const remaining = langState.writeWords.filter((w) => !w.alreadySubmitted && !skippedIds.has(w.wordId));
  if (!remaining.length) {
    const fresh = await refetchLangState(lang);
    const otherPending = await otherLangStillPending(lang);
    renderDoneStep(fresh, lang, otherPending);
    return;
  }
  const word = remaining[0];
  const position = langState.writeWords.length - remaining.length + 1;

  app.replaceChildren(el(`
    <div class="screen">
      ${countdownBarHtml(TIMERS.writeSeconds)}
      <p class="eyebrow">${t(lang, "writeEyebrow", { position, total: langState.writeWords.length })}</p>
      ${renderWriteWordMarkup(word, lang)}
    </div>
  `));
  const textEl = document.getElementById(`text-${word.wordId}`);
  const submitBtn = document.getElementById(`submit-${word.wordId}`);
  // Starts disabled (see renderWriteWordMarkup) — nothing to send yet, and an
  // all-whitespace "submission" is just as empty. Toggled live on every
  // keystroke rather than only checked at click time, so the button's state
  // always matches what's actually in the box.
  textEl.addEventListener("input", () => {
    submitBtn.disabled = textEl.value.trim().length === 0;
  });
  submitBtn.addEventListener("click", async (e) => {
    // Guards against a double-click/double-tap sending a second submission
    // while the first is still in flight — without this, the second
    // request comes back "already_submitted" and (previously) did nothing
    // visible, which is exactly what made the click feel like it "didn't
    // work" and needed several more taps.
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    clearActiveTimer();
    const text = document.getElementById(`text-${word.wordId}`).value;
    const res = await store.submitDefinition(identity.userId, word.wordId, text, lang);
    if (!res.ok && res.error !== "already_submitted") {
      btn.disabled = false; // genuine failure (e.g. empty text) — let them fix and retry
      return;
    }
    // "already_submitted" means a duplicate of an already-successful submit —
    // treat it the same as success (advance) rather than a dead end.
    const fresh = await refetchLangState(lang);
    renderWriteWordStep(fresh, lang, skippedIds);
  });
  activeTimer = setTimeout(async () => {
    clearActiveTimer();
    // A rushed-but-real bluff shouldn't be thrown away just because the
    // clock beat the click — auto-submit whatever's typed if it's long
    // enough to plausibly be a real attempt (see config.js
    // WRITE_AUTOSUBMIT_MIN_CHARS), and say so on the timeout screen rather
    // than implying nothing was saved.
    const typed = document.getElementById(`text-${word.wordId}`)?.value ?? "";
    if (typed.trim().length >= WRITE_AUTOSUBMIT_MIN_CHARS) {
      const res = await store.submitDefinition(identity.userId, word.wordId, typed, lang);
      if (res.ok || res.error === "already_submitted") {
        renderTimeoutStep("write-saved", lang, async () => {
          const fresh = await refetchLangState(lang);
          renderWriteWordStep(fresh, lang, skippedIds);
        });
        return;
      }
    }
    renderTimeoutStep("write", lang, () => {
      renderWriteWordStep(langState, lang, new Set([...skippedIds, word.wordId]));
    });
  }, TIMERS.writeSeconds * 1000);
  startCountdownSeconds(TIMERS.writeSeconds);
}

function renderWriteWordMarkup(w, lang) {
  return `
    <div class="word-block">
      <div class="word-title">${w.word}</div>
      <textarea id="text-${w.wordId}" rows="2" placeholder="${t(lang, "writePlaceholder")}" maxlength="140"></textarea>
      <button class="btn full btn-cta" id="submit-${w.wordId}" disabled>${t(lang, "submit")}</button>
    </div>`;
}

/** `otherPending` is either null (nothing more to offer today) or
 * { lang, state } for the other enabled language's still-pending state —
 * see otherLangStillPending. When present, renders a second, secondary-style
 * (not the primary yellow CTA — this screen's real message is "you're
 * done") pinned button offering to play it right now. */
function renderDoneStep(langState, lang, otherPending) {
  currentScreenLang = lang;
  clearActiveTimer();
  const extraBtn = otherPending
    ? `<button class="btn secondary full btn-cta" id="play-other-lang-btn">${t(lang, "playOtherLangToo", { lang: LANG_NAMES[lang][otherPending.lang] })}</button>`
    : "";
  app.replaceChildren(el(`
    <div class="screen-success">
      <p class="done-progress" style="color:inherit">${progressText(langState, lang)}</p>
      ${MASCOT_HTML}
      <p class="eyebrow" style="text-align:center; color:inherit">${t(lang, "doneStreakLabel")}</p>
      <div class="recap-points" id="streak-num" style="color:inherit">0</div>
      <p style="text-align:center">${t(lang, "doneDays")}</p>
      <p style="text-align:center; font-weight:700; font-size:18px">${t(lang, "doneBody")}</p>
      ${extraBtn}
    </div>
  `));
  launchConfetti(); // unconditional here (unlike the score step) — finishing the day is worth celebrating regardless of how guessing went
  revealThenSyncHeader(document.getElementById("streak-num"), langState.profile.streakDays, langState.profile, lang);
  document.getElementById("play-other-lang-btn")?.addEventListener("click", () => enterLanguageFlow(otherPending.lang, otherPending.state));
}

async function resumeFlowFromState(langState, lang) {
  updateHeader(langState.profile, lang);
  const allGuessed = langState.guessWords.length > 0 && langState.guessWords.every((w) => w.alreadyGuessed);
  const allWritten = langState.writeWords.every((w) => w.alreadySubmitted);
  if (langState.guessWords.length > 0 && !allGuessed) { renderGuessWordStep(langState, lang); return; }
  if (!allWritten) { renderWriteWordStep(langState, lang); return; }
  const otherPending = await otherLangStillPending(lang);
  renderDoneStep(langState, lang, otherPending);
}

/** Enters (or resumes) ONE language's flow — recap (if any) -> Ready ->
 * whatever resumeFlowFromState decides. This is the single place that
 * renders a language's header + first screen, called from
 * routeToCurrentScreen, renderChooseTodayLangStep, and the done-step's
 * "play the other language too" button — one code path regardless of how
 * the user got here. */
async function enterLanguageFlow(lang, langState) {
  renderHeaderImmediate(langState.profile, lang);
  if (langState.recap) {
    renderWriteRecap(langState.recap, langState.profile, lang, async () => {
      await store.ackRecap(identity.userId, lang);
      const fresh = await refetchLangState(lang);
      renderHeaderImmediate(fresh.profile, lang);
      renderReadyStep(fresh, lang, () => resumeFlowFromState(fresh, lang));
    });
    return;
  }
  renderReadyStep(langState, lang, () => resumeFlowFromState(langState, lang));
}

/** True once a language has nothing left to show for today: no pending
 * recap, every word written, and (if there's a guess round at all) every
 * word guessed. A language a user hasn't even reached the guess round for
 * yet (guessWords.length === 0, e.g. a brand-new corpus edge case) counts
 * its guess half as trivially satisfied — matches resumeFlowFromState's own
 * `guessWords.length > 0 && !allGuessed` gate. */
function langIsDoneToday(langState) {
  if (langState.recap) return false;
  const allWritten = langState.writeWords.every((w) => w.alreadySubmitted);
  const allGuessed = langState.guessWords.length === 0 || langState.guessWords.every((w) => w.alreadyGuessed);
  return allWritten && allGuessed;
}

/** True when a language has had ZERO interaction today at all — the
 * specific condition that triggers the "choose a language for today" step
 * (see routeToCurrentScreen), distinct from langIsDoneToday's opposite: a
 * language with SOME progress but not all is neither "untouched" nor
 * "done," and should just be resumed directly. */
function langUntouchedToday(langState) {
  const noWrites = langState.writeWords.every((w) => !w.alreadySubmitted);
  const noGuesses = langState.guessWords.every((w) => !w.alreadyGuessed);
  return noWrites && noGuesses && !langState.recap;
}

/** For the done-step's "play the other language too" prompt — null if there
 * is no other enabled language, or it's already done for today too. */
async function otherLangStillPending(lang) {
  const consolidated = await store.getToday(identity.userId);
  const other = consolidated.enabledLangs.find((l) => l !== lang);
  if (!other) return null;
  const otherState = consolidated.byLang[other];
  if (langIsDoneToday(otherState)) return null;
  return { lang: other, state: otherState };
}

/**
 * The single source of truth for "what screen should be on screen right
 * now," given whichever language(s) this user currently has enabled — see
 * cockerel/CLAUDE.md "Dual-language gameplay" for the full decision tree.
 * Re-run on every real page load, every dev-toolbar player/day switch, and
 * after closing settings if enabledLangs actually changed (see
 * openSettingsPanel) — always the SAME decision logic regardless of why
 * it's running, so there's exactly one place this policy lives:
 *   - 0 enabled (shouldn't normally happen) -> language picker, defensively.
 *   - 1 enabled -> resume that language's flow, exactly as a single-language
 *     player always has.
 *   - 2 enabled, one of them mid-flow today (touched, not yet done) ->
 *     resume THAT one directly — no redundant choice when there's only one
 *     real option. (If, in the rare case, BOTH are simultaneously mid-flow,
 *     the earlier-enabled one wins — a deterministic, harmless tie-break.)
 *   - 2 enabled, NEITHER touched today -> the "choose a language for today"
 *     step.
 *   - 2 enabled, one untouched and the other already done -> resume the
 *     untouched one directly (same "no redundant choice" reasoning).
 *   - both done today -> the first-enabled language's done-step, with no
 *     further prompt (otherLangStillPending correctly returns null here).
 */
async function routeToCurrentScreen() {
  sessionToken++; // invalidate any reveal still in flight from a prior session
  await renderDevToolbar();
  const consolidated = await store.getToday(identity.userId);
  const { enabledLangs, byLang } = consolidated;
  lastKnownEnabledLangs = enabledLangs;

  if (!enabledLangs.length) {
    renderLanguagePicker(async (lang) => {
      await store.setEnabledLangs(identity.userId, [lang]);
      await routeToCurrentScreen();
    });
    return;
  }

  const primaryLang = enabledLangs[0];

  if (enabledLangs.length === 1) {
    await enterLanguageFlow(primaryLang, byLang[primaryLang]);
    return;
  }

  const inProgress = enabledLangs.find((l) => !langUntouchedToday(byLang[l]) && !langIsDoneToday(byLang[l]));
  if (inProgress) { await enterLanguageFlow(inProgress, byLang[inProgress]); return; }

  const allUntouched = enabledLangs.every((l) => langUntouchedToday(byLang[l]));
  if (allUntouched) { renderChooseTodayLangStep(primaryLang, enabledLangs, byLang); return; }

  const untouchedButNotDone = enabledLangs.find((l) => langUntouchedToday(byLang[l]) && !langIsDoneToday(byLang[l]));
  if (untouchedButNotDone) { await enterLanguageFlow(untouchedButNotDone, byLang[untouchedButNotDone]); return; }

  // Everything's done today.
  renderHeaderImmediate(byLang[primaryLang].profile, primaryLang);
  const otherPending = await otherLangStillPending(primaryLang);
  renderDoneStep(byLang[primaryLang], primaryLang, otherPending);
}

// -- dev-only screen gallery preview (see gallery.html / js/gallery.js) -----
// Reached only via an iframe pointing at index.html?preview=<id>&theme=..., a
// URL gallery.html itself constructs — never a link a real player would
// follow. Gated the same shape as the dev toolbar: the SERVER 404s
// gallery.html entirely when DEV_TOOLS=0 (server/dev-server.mjs), and this
// branch additionally re-checks devToolsEnabled (fetched in main(), just
// above) before honoring the param, so a stray query string against a
// deployed instance still does nothing.
//
// Renders exactly ONE screen from fixture data. Every render*Step function
// above is reused completely unmodified — most screens take their data as a
// plain argument and never touch `store`, so they need nothing fancier than
// a hand-built fixture object. Only the "guess"/"write" screens' OWN
// click/timer handlers call store.* internally (submitGuess, getVoteDistribution,
// submitDefinition, skipGuess, getToday) — for those, `store` is swapped for
// createFixtureStore()'s in-memory implementation of the exact same
// storage.js interface, so their real logic runs untouched, no network, no
// filesystem, resets every reload. Fixture words exist for BOTH languages
// (FIXTURE_WORDS) — gallery.html's navbar dropdown picks which one every
// card previews, see runGalleryPreview's `lang` param below and
// js/gallery-screens.js for the full screen list.
const FIXTURE_IDENTITY = { userId: "gallery-preview-user", displayName: "Ferdigfigur" };

const FIXTURE_WORDS = {
  no: [
    { wordId: "fx-1", word: "kneik", truth: "En brå bakke eller kneik i terrenget.", bluffs: [
      "Et gammelt ord for en liten kniv brukt til fiskerensing.",
      "Lyden en tømmerkjerre lager i en sving.",
      "En person som alltid kommer for sent.",
    ] },
    { wordId: "fx-2", word: "myrsnipe", truth: "En liten vadefugl som holder til på myr.", bluffs: [
      "En kjeltring som stjeler fra torvmyrer.",
      "Et gammelt redskap for å måle myrdybde.",
      "Kallenavn på en sær nabo på bygda.",
    ] },
    { wordId: "fx-3", word: "labbetuss", truth: "Et kjælent ord for noen som tusler stille rundt, ofte om barn eller dyr.", bluffs: [
      "En type vott brukt av fiskere.",
      "Et gammelt uttrykk for søvnig forvirring.",
      "Lyden av tunge støvler i søle.",
    ] },
  ],
  en: [
    { wordId: "fxen-1", word: "petrichor", truth: "The pleasant, earthy smell that often accompanies the first rain after a long dry spell.", bluffs: [
      "An old term for a small knife used to clean fish.",
      "The sound a wooden cart makes going around a bend.",
      "Someone who is always running late.",
    ] },
    { wordId: "fxen-2", word: "gloaming", truth: "Twilight; dusk.", bluffs: [
      "A con artist who steals from peat bogs.",
      "An old tool for measuring bog depth.",
      "A nickname for a strange neighbor in a small town.",
    ] },
    { wordId: "fxen-3", word: "somnolent", truth: "Sleepy or drowsy.", bluffs: [
      "A type of mitten worn by fishermen.",
      "An old expression for being sleepily confused.",
      "The sound of heavy boots in mud.",
    ] },
  ],
};

function fixtureProfile(overrides = {}) {
  return { displayName: "Ferdigfigur", rating: 940, rank: 42, streakDays: 4, streakBonusPct: 40, ...overrides };
}

/** A minimal langState-shaped stand-in — just enough (`writeWords`/
 * `guessWords`) for progressText()/renderDoneStep to read counts off of —
 * for the many gallery cards that only ever had a bare fixtureProfile()
 * before the header's daily-progress line existed. */
function fixtureProgressState(guessDone, writeDone, total = 3) {
  return {
    guessWords: Array.from({ length: total }, (_, i) => ({ alreadyGuessed: i < guessDone })),
    writeWords: Array.from({ length: total }, (_, i) => ({ alreadySubmitted: i < writeDone })),
  };
}

function fixtureWordOptions(w) {
  return [
    { id: "a", text: w.bluffs[0], kind: "bot" },
    { id: "b", text: w.bluffs[1], kind: "bot" },
    { id: "c", text: w.truth, kind: "truth" },
    { id: "d", text: w.bluffs[2], kind: "bot" },
  ];
}

function fixtureScoreResult(lang) {
  const words = FIXTURE_WORDS[lang];
  return {
    correctCount: 2, guessTotal: 3, points: 165, pct: 30,
    profile: fixtureProfile({ rating: 985 }),
    words: words.map((w, i) => ({
      wordId: w.wordId, word: w.word, correct: i !== 1,
      options: fixtureWordOptions(w).map((o) => ({
        id: o.id, text: o.text, isTruth: o.kind === "truth",
        isMine: i === 1 ? o.id === "a" : o.id === "c",
        pct: o.kind === "truth" ? 55 : (i === 1 && o.id === "a" ? 40 : 15),
      })),
    })),
  };
}

function createFixtureStore(lang) {
  const words = FIXTURE_WORDS[lang];
  let guesses = []; // { wordId, choiceId, correct }
  const submitted = new Set();
  let profile = fixtureProfile({ rating: 820, streakDays: 3, streakBonusPct: 30 });
  // A couple of "other players'" guesses on the first word, seeded up front,
  // so the hint has real data to show without requiring any prior action.
  const otherGuesses = [
    { wordId: words[0].wordId, choiceId: "a" }, { wordId: words[0].wordId, choiceId: "c" }, { wordId: words[0].wordId, choiceId: "c" },
  ];

  function today() {
    // Flat shape (enabledLangs/writeWords/guessWords/profile all top-level)
    // so gallery preview cards that destructure store.getToday() directly
    // (the "guess"/"write" cases in GALLERY_PREVIEW_SCREENS) keep working
    // unmodified — but ALSO wrapped under byLang[lang], since
    // refetchLangState() (used by the real render*Step flow this store
    // backs, e.g. after a guess/submit) expects the real API's
    // { enabledLangs, todayKey, byLang } consolidated shape. Both views
    // point at the same live data, not a snapshot copy.
    const langState = {
      enabledLangs: [lang],
      writeWords: words.map((w) => ({ wordId: w.wordId, word: w.word, alreadySubmitted: submitted.has(w.wordId) })),
      guessWords: words.map((w) => {
        const mine = guesses.find((g) => g.wordId === w.wordId);
        return {
          wordId: w.wordId, word: w.word,
          alreadyGuessed: Boolean(mine), choiceId: mine?.choiceId ?? null, correct: mine?.correct ?? null,
          options: fixtureWordOptions(w).map((o) => ({ id: o.id, text: o.text })),
          // Mirrors server/db.mjs's real hintAvailable — true only for
          // words[0] here, matching otherGuesses above (the only word this
          // fixture seeded any "other players'" guesses for). Needed so the
          // "guess"/"guess-hint" gallery cards still show the hint button at
          // all now that js/ui.js's renderGuessWordMarkup omits it entirely
          // when there's nothing to hint at.
          hintAvailable: otherGuesses.some((g) => g.wordId === w.wordId),
        };
      }),
      profile,
    };
    return { ...langState, byLang: { [lang]: langState } };
  }

  function finalizeGuessingIfDone() {
    if (guesses.length < words.length) return null;
    const table = [-50, 0, 120, 300];
    const correctCount = guesses.filter((g) => g.correct).length;
    const points = table[Math.min(correctCount, table.length - 1)];
    profile = { ...profile, rating: profile.rating + points };
    return {
      correctCount, guessTotal: words.length, points, pct: 0, profile,
      words: words.map((w) => {
        const g = guesses.find((x) => x.wordId === w.wordId);
        return {
          wordId: w.wordId, word: w.word, correct: Boolean(g?.correct),
          options: fixtureWordOptions(w).map((o) => ({
            id: o.id, text: o.text, isTruth: o.kind === "truth", isMine: o.id === g?.choiceId, pct: o.kind === "truth" ? 55 : 15,
          })),
        };
      }),
    };
  }

  return {
    getConfig: async () => ({ ok: true, devTools: true, googleClientId: null, requireGoogleAuth: false }),
    // The settings button is rendered on every gallery card, so the About
    // panel is reachable from all of them — it needs credits data here or it
    // would always show its "couldn't load" fallback in the gallery. Text
    // mirrors the real manifests (js/corpora/*/manifest.json).
    getCredits: async () => ({
      ok: true,
      corpora: [
        { lang: "no", version: "v1", counts: { words: 996, fakeDefs: 9076 }, attribution: "Ordforklaringer fra Bokmålsordboka, © Språkrådet og Universitetet i Bergen (CC BY 4.0)." },
        { lang: "en", version: "v2", counts: { words: 1100, fakeDefs: 14000 }, attribution: "Definitions derived from WordNet 3.1, © Princeton University (WordNet License)." },
      ],
    }),
    getToday: async () => today(),
    submitGuess: async (_userId, wordId, choiceId) => {
      const correct = fixtureWordOptions(words.find((w) => w.wordId === wordId)).find((o) => o.id === choiceId)?.kind === "truth";
      guesses.push({ wordId, choiceId, correct });
      return { ok: true, correct, guessResult: finalizeGuessingIfDone(), profile };
    },
    skipGuess: async (_userId, wordId) => {
      guesses.push({ wordId, choiceId: null, correct: false });
      return { ok: true, guessResult: finalizeGuessingIfDone(), profile };
    },
    getVoteDistribution: async (_userId, wordId) => {
      const relevant = otherGuesses.filter((g) => g.wordId === wordId);
      if (!relevant.length) return { ok: true, distribution: [], noData: true };
      const counts = new Map();
      for (const g of relevant) counts.set(g.choiceId, (counts.get(g.choiceId) ?? 0) + 1);
      const distribution = [...counts.entries()].map(([id, n]) => ({ id, pct: Math.round((100 * n) / relevant.length / 5) * 5 }));
      return { ok: true, distribution };
    },
    submitDefinition: async (_userId, wordId) => { submitted.add(wordId); return { ok: true, profile }; },
    ackRecap: async () => ({ ok: true }),
    resetPlayer: async () => ({ ok: true }),
    signInWithGoogle: async () => ({ ok: false }),
    setEnabledLangs: async () => ({ ok: true, enabledLangs: [lang] }),
    listDays: async () => ({ days: [], current: null }),
    listPlayers: async () => ({ players: [] }),
    advanceDay: async () => ({ todayKey: null }),
    // Backs the header's points/rank button (see openRankingPanel) — every
    // gallery card that shows a header can be clicked, not just "guess"/
    // "write", so this needs a real (if fixture) answer rather than being
    // left unimplemented and throwing on click.
    getLeaderboard: async () => ({
      ok: true,
      entries: [
        { name: "Kari", rating: 990, rank: 1, isYou: false },
        { name: "Ferdigfigur", rating: profile.rating, rank: 2, isYou: true },
        { name: "Ola", rating: 760, rank: 3, isYou: false },
      ],
    }),
  };
}

// Every entry takes the `lang` gallery.html's navbar dropdown currently has
// selected — "language-picker" (bilingual by nature) and "sign-in-gate"
// (shown before any language is chosen, deliberately kept Norwegian — see
// its own comment) are the two screens that ignore it, matching real app
// behavior exactly.
const GALLERY_PREVIEW_SCREENS = {
  "language-picker": () => renderLanguagePicker(() => {}),
  "name": (lang) => renderNameScreen(lang, FIXTURE_IDENTITY.displayName, () => {}),
  "how-to-play": (lang) => renderHowToPlay(lang, () => {}),
  "welcome": (lang) => renderWelcomeStep(lang, FIXTURE_IDENTITY.displayName, fixtureProfile({ rating: 800, streakDays: 0, streakBonusPct: 0, rank: 118 }), () => {}),
  "ready": (lang) => {
    const profile = fixtureProfile();
    renderHeaderImmediate(profile, lang);
    renderReadyStep({ profile }, lang, () => {});
  },
  "choose-today-lang": (lang) => {
    renderChooseTodayLangStep(lang, ["no", "en"], {
      no: { profile: fixtureProfile() }, en: { profile: fixtureProfile({ rating: 700, streakDays: 2, streakBonusPct: 20 }) },
    });
  },
  "write-recap-none": (lang) => {
    const profile = fixtureProfile();
    renderHeaderImmediate(profile, lang);
    renderWriteRecap({ fooledByWord: [] }, profile, lang, () => {});
  },
  "write-recap-fooled": (lang) => {
    const profile = fixtureProfile();
    const words = FIXTURE_WORDS[lang];
    renderHeaderImmediate(profile, lang);
    renderWriteRecap({
      fooledByWord: [{ wordId: words[0].wordId, count: 7 }, { wordId: words[1].wordId, count: 3 }],
      writeStreakPct: profile.streakBonusPct, writeBasePoints: 112, writePoints: 123,
    }, profile, lang, () => {});
  },
  "guess": async (lang) => {
    const state = await store.getToday();
    renderHeaderImmediate(state.profile, lang);
    renderGuessWordStep(state, lang);
  },
  "guess-hint": async (lang) => {
    const state = await store.getToday();
    renderHeaderImmediate(state.profile, lang);
    renderGuessWordStep(state, lang);
    document.getElementById(`hint-${state.guessWords[0].wordId}`)?.click();
  },
  "timeout-guess": (lang) => {
    renderHeaderImmediate(fixtureProfile(), lang);
    renderTimeoutStep("guess", lang, () => {});
  },
  "score": (lang) => {
    renderHeaderImmediate(fixtureProfile({ rating: 820 }), lang);
    renderScoreStep(fixtureScoreResult(lang), lang, () => {});
  },
  "write": async (lang) => {
    const state = await store.getToday();
    renderHeaderImmediate(state.profile, lang);
    renderWriteWordStep(state, lang);
  },
  "timeout-write": (lang) => {
    renderHeaderImmediate(fixtureProfile(), lang);
    renderTimeoutStep("write", lang, () => {});
  },
  "timeout-write-saved": (lang) => {
    renderHeaderImmediate(fixtureProfile(), lang);
    renderTimeoutStep("write-saved", lang, () => {});
  },
  "done": (lang) => {
    renderHeaderImmediate(fixtureProfile({ streakDays: 3, streakBonusPct: 30 }), lang);
    renderDoneStep({ profile: fixtureProfile({ streakDays: 4, streakBonusPct: 40 }), ...fixtureProgressState(3, 3) }, lang, null);
  },
  "done-with-other-lang": (lang) => {
    const otherLang = lang === "no" ? "en" : "no";
    renderHeaderImmediate(fixtureProfile({ streakDays: 3, streakBonusPct: 30 }), lang);
    renderDoneStep(
      { profile: fixtureProfile({ streakDays: 4, streakBonusPct: 40 }), ...fixtureProgressState(3, 3) }, lang,
      { lang: otherLang, state: { profile: fixtureProfile({ rating: 700 }) } },
    );
  },
  "sign-in-gate": () => renderSignInGate(),
};

async function runGalleryPreview(screenId, theme, lang) {
  applyTheme(theme === "dark" ? "dark" : "light");
  identity = FIXTURE_IDENTITY;
  const previewLang = LANGS.includes(lang) ? lang : "no";
  store = createFixtureStore(previewLang);
  renderSettingsButton();
  const renderFn = GALLERY_SCREENS.some((s) => s.id === screenId) ? GALLERY_PREVIEW_SCREENS[screenId] : null;
  if (!renderFn) {
    app.replaceChildren(el(`<div class="screen"><div class="card"><h2>Unknown preview screen</h2><p>"${screenId}" isn't in gallery-screens.js.</p></div></div>`));
    return;
  }
  await renderFn(previewLang);
}

// -- boot / player flows ------------------------------------------------

async function main() {
  applyTheme(loadTheme()); // index.html's inline script already did this pre-paint; keep state in sync
  trackKeyboardInset();
  registerServiceWorker();

  try {
    const config = await store.getConfig();
    devToolsEnabled = !!config.devTools;
    googleClientId = config.googleClientId ?? null;
    requireGoogleAuth = !!config.requireGoogleAuth;
  } catch { devToolsEnabled = false; }

  const previewId = new URLSearchParams(location.search).get("preview");
  if (previewId && devToolsEnabled) {
    const params = new URLSearchParams(location.search);
    await runGalleryPreview(previewId, params.get("theme"), params.get("lang"));
    return;
  }

  const isFirstTime = !localStorage.getItem(IDENTITY_KEY) && !localStorage.getItem(LEGACY_IDENTITY_KEY);
  identity = loadOrCreateIdentity(suggestName());
  renderSettingsButton();
  await renderDevToolbar();

  if (requireGoogleAuth && !identity.googleLinked) {
    renderSignInGate();
    return;
  }

  if (isFirstTime) {
    renderLanguagePicker((lang) => {
      currentScreenLang = lang;
      renderNameScreen(lang, identity.displayName, (displayName, avatar) => registerFlow(lang, displayName, avatar));
    });
    return;
  }
  await store.ensureProfile(identity.userId, identity.displayName);
  await routeToCurrentScreen();
}

async function registerFlow(lang, displayName, avatar) {
  identity.displayName = displayName;
  saveIdentity(identity);
  await store.ensureProfile(identity.userId, displayName, avatar);
  await store.setEnabledLangs(identity.userId, [lang]);
  await renderDevToolbar(); // pick up the brand-new player in the dev switcher
  renderHowToPlay(lang, async () => {
    const langState = await refetchLangState(lang);
    renderWelcomeStep(lang, displayName, langState.profile, () => resumeFlowFromState(langState, lang));
  });
}

function registerNewPlayer() {
  identity = { userId: crypto.randomUUID(), displayName: suggestName() };
  renderLanguagePicker((lang) => {
    currentScreenLang = lang;
    renderNameScreen(lang, identity.displayName, (displayName, avatar) => registerFlow(lang, displayName, avatar));
  });
}

main();
