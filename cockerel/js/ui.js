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
import { storageLocal, loadOrCreateIdentity, saveIdentity, loadTheme, saveTheme } from "./storage.js";
import { TIMERS } from "./config.js";
import { GALLERY_SCREENS } from "./gallery-screens.js";
import { LANGS, LANG_LABELS, t, LANGUAGE_PICKER } from "./i18n.js";

// `let`, not `const` — the dev-only screen gallery (see runGalleryPreview
// below) swaps this for an in-memory fixture store when previewing a screen,
// so every render function above keeps working completely unmodified.
let store = storageLocal();
const app = document.getElementById("screen-root");
const header = document.getElementById("header");
const devbar = document.getElementById("devbar");
const IDENTITY_KEY = "cockerel.identity.v1";
// Pre-rename key (see js/storage.js's LEGACY_IDENTITY_KEY) — only used here
// to decide "is this truly a first-time visitor" and to fully wipe identity
// on reset; storage.js's loadOrCreateIdentity is what actually migrates it.
const LEGACY_IDENTITY_KEY = "thedailycock.identity.v1";

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

// -- theme: "light" (default, Wordle-style) or "dark" (the original game
// palette, opt-in via the settings panel). index.html has a tiny inline
// script that stamps this same attribute before first paint, to avoid a
// flash of the wrong theme — see loadTheme() in storage.js for the default.
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

// "N dager (+X% poengbonus)" / "N days (+X% points bonus)" — the one
// canonical streak phrase, used everywhere the streak itself (not some
// other stat's bonus) is shown.
function streakText(days, pct, lang) {
  const unit = days === 1 ? t(lang, "streakUnitOne") : t(lang, "streakUnitMany");
  const bonus = pct ? t(lang, "streakBonusSuffix", { pct }) : "";
  return `${days} ${unit}${bonus}`;
}

// -- persistent header --------------------------------------------------
// #header itself holds the settings menu button (see renderSettingsButton)
// plus a nested #header-profile wrapper — the profile info (mascot/name/
// score) is deliberately scoped to that inner wrapper, not the whole header,
// so renderHeaderImmediate/updateHeader below never touch (or need to
// re-wire the click listener on) the menu button. #header-profile is
// deliberately NOT re-rendered on every screen — only ever touched by
// updateHeader(), so a point/streak reveal elsewhere in the screen can finish
// its own big-number animation and flash BEFORE the header catches up.

function pointsText(profile, lang) {
  return t(lang, "pointsRank", { rating: profile.rating, rank: profile.rank });
}

function renderHeaderImmediate(profile, lang) {
  document.getElementById("header-profile").innerHTML = `
    <img class="mascot small" src="assets/nesen.svg" alt="" />
    <div class="header-name">${profile.displayName}</div>
    <div class="header-stats">
      <div class="header-points" id="header-points">${pointsText(profile, lang)}</div>
      <div id="header-streak">${t(lang, "streak")}: ${streakText(profile.streakDays, profile.streakBonusPct, lang)}</div>
    </div>
  `;
}

function updateHeader(profile, lang) {
  const pointsEl = document.getElementById("header-points");
  const streakEl = document.getElementById("header-streak");
  if (!pointsEl || !streakEl) { renderHeaderImmediate(profile, lang); return; }
  pointsEl.textContent = pointsText(profile, lang);
  streakEl.textContent = `${t(lang, "streak")}: ${streakText(profile.streakDays, profile.streakBonusPct, lang)}`;
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
// after a dev-toolbar switch. Lives INSIDE #header as its first child, ahead
// of the (separately-managed, see renderHeaderImmediate) #header-profile
// wrapper — same physical top-left spot on every screen, since #header
// itself always renders now (see :empty guard in app.css, which only ever
// matters for the brief instant before this function has run). On screens
// with no profile yet (#header-profile empty — name/how-to-play/welcome/
// sign-in-gate) this is the ONLY thing in the header row, which is exactly
// the "more space before the next thing" look asked for — #header's own
// flex `gap` still applies against #screen-root either way.
function renderSettingsButton() {
  const menuBtn = el(`
    <button class="header-menu-btn" id="settings-fab" aria-label="Innstillinger">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </button>
  `);
  const profileWrap = el(`<div id="header-profile" class="header-profile"></div>`);
  header.replaceChildren(menuBtn, profileWrap);
  menuBtn.addEventListener("click", openSettingsPanel);
}

function themeToggleLabel(lang) {
  return loadTheme() === "light" ? t(lang, "themeToggleToDark") : t(lang, "themeToggleToLight");
}

// Shown only when the server has a GOOGLE_CLIENT_ID configured (see
// googleClientId above) — otherwise this whole section is absent, not just
// hidden. `identity.googleLinked` (set the moment handleGoogleCredential
// succeeds, see below) swaps the button out for a plain confirmation line so
// a signed-in user is never shown the button again on this device.
function googleSectionHtml(lang) {
  if (!googleClientId) return "";
  if (identity.googleLinked) {
    return `
      <p class="empty-note">${t(lang, "googleLinkedNote")}</p>
      <button class="btn secondary full" id="google-signout-btn">${t(lang, "signOut")}</button>
    `;
  }
  return `
    <p class="empty-note">${t(lang, "googleSignInNote")}</p>
    <div id="google-signin-btn" style="display:flex; justify-content:center; margin-bottom:8px"></div>
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
        const langState = (await store.getToday(identity.userId)).byLang[lang];
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
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">${t(lang, "eyebrowBrand")}</p>
      <h1 style="text-align:center">${t(lang, "appName")}</h1>
      <div class="card">
        <h2>${t(lang, "signInHeading")}</h2>
        <p class="empty-note">${t(lang, "signInBody")}</p>
        <div id="google-signin-gate-btn" style="display:flex; justify-content:center; margin-top:12px"></div>
      </div>
    </div>
  `));
  renderGoogleButton("google-signin-gate-btn");
}

// Fetches enabledLangs fresh rather than trusting lastKnownEnabledLangs —
// that cache is only ever WRITTEN by routeToCurrentScreen(), which a
// brand-new player never passes through before their first-ever settings
// visit (onboarding sets the initial language via setEnabledLangs directly,
// without routing through it) — this was a real bug: the very first time a
// new player opened settings, the language they'd just onboarded with
// showed as unchecked, because the cache was still its initial empty [].
async function openSettingsPanel() {
  const lang = currentScreenLang;
  const enabledLangsAtOpen = (await store.getToday(identity.userId)).enabledLangs;
  lastKnownEnabledLangs = enabledLangsAtOpen;
  const languageRows = LANGS.map((l) => `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0">
      <input type="checkbox" data-lang-toggle="${l}" ${enabledLangsAtOpen.includes(l) ? "checked" : ""} />
      <span>${LANG_LABELS[l]}</span>
    </label>
  `).join("");

  const overlay = el(`
    <div class="modal-overlay" id="settings-overlay">
      <div class="modal-card">
        <h2>${t(lang, "settingsTitle")}</h2>
        <button class="btn secondary full" id="theme-toggle-btn">${themeToggleLabel(lang)}</button>
        <div>
          <p style="font-weight:700; margin:12px 0 4px">${t(lang, "languageSectionTitle")}</p>
          <p class="empty-note">${t(lang, "languageSectionNote")}</p>
          ${languageRows}
        </div>
        ${googleSectionHtml(lang)}
        <p class="empty-note">${t(lang, "resetNote")}</p>
        <button class="btn danger full" id="reset-btn">${t(lang, "resetButton")}</button>
        <button class="btn secondary full" id="close-settings-btn">${t(lang, "close")}</button>
      </div>
    </div>
  `);
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
  document.getElementById("close-settings-btn").addEventListener("click", closeAndMaybeReroute);
  document.getElementById("reset-btn").addEventListener("click", () => openResetConfirm(overlay, lang));
  document.getElementById("theme-toggle-btn").addEventListener("click", (e) => {
    const next = loadTheme() === "light" ? "dark" : "light";
    saveTheme(next);
    applyTheme(next);
    e.target.textContent = themeToggleLabel(lang);
  });
  document.querySelectorAll("[data-lang-toggle]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const checked = [...document.querySelectorAll("[data-lang-toggle]")].filter((c) => c.checked).map((c) => c.dataset.langToggle);
      if (checked.length === 0) { cb.checked = true; return; } // at least one language must stay enabled
      const result = await store.setEnabledLangs(identity.userId, checked);
      if (result.ok) lastKnownEnabledLangs = result.enabledLangs;
    });
  });
  if (googleClientId && !identity.googleLinked) renderGoogleButton("google-signin-btn");
  document.getElementById("google-signout-btn")?.addEventListener("click", signOut);
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
 * Deliberately bilingual/neutral chrome (js/i18n.js LANGUAGE_PICKER), since
 * there's no "current language" yet to render it IN. Every screen after
 * this one renders entirely in whichever language got picked here. */
function renderLanguagePicker(onChoose) {
  clearActiveTimer();
  const buttons = LANGS.map((lang) =>
    `<button class="btn full" data-lang="${lang}" style="margin-bottom:10px">${LANG_LABELS[lang]}</button>`
  ).join("");
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <h1 style="text-align:center">${LANGUAGE_PICKER.heading}</h1>
      <p class="empty-note" style="text-align:center; margin-top:8px">${LANGUAGE_PICKER.note}</p>
      <div class="card" style="margin-top:16px">${buttons}</div>
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
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <h1 style="text-align:center">${t(primaryLang, "chooseTodayLangHeading")}</h1>
      <p class="empty-note" style="text-align:center; margin-top:8px">${t(primaryLang, "chooseTodayLangNote")}</p>
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
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">${t(lang, "eyebrowBrand")}</p>
      <h1 style="text-align:center">${t(lang, "appName")}</h1>
      <div class="card">
        <h2>${t(lang, "chooseNameHeading")}</h2>
        <input type="text" id="name-input" value="${startingName}" />
        <p class="empty-note" style="margin-top:8px">${t(lang, "chooseNameNote")}</p>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "continue")}</button>
    </div>
  `));
  document.getElementById("continue-btn").addEventListener("click", () => {
    const displayName = document.getElementById("name-input").value.trim() || startingName;
    onDone(displayName);
  });
}

function renderHowToPlay(lang, onDone) {
  currentScreenLang = lang;
  clearActiveTimer();
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <div class="card">
        <h2>${t(lang, "howToPlayHeading")}</h2>
        <p>${t(lang, "howToPlayBody")}</p>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "howToPlayContinue")}</button>
    </div>
  `));
  document.getElementById("continue-btn").addEventListener("click", onDone);
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
      <div class="card">
        <div class="stat-row"><span>${t(lang, "points")}</span><span id="start-points" style="font-weight:700">0</span></div>
        <div class="stat-row" style="margin-top:8px"><span>${t(lang, "streak")}</span><span id="start-streak" style="font-weight:700">0</span></div>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "welcomeContinue")}</button>
    </div>
  `));
  animateCount(document.getElementById("start-points"), profile.rating, 900);
  animateCount(document.getElementById("start-streak"), 0, 900, 5);
  document.getElementById("continue-btn").addEventListener("click", onStart);
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
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <h1 style="text-align:center">${t(lang, "readyHeading", { name: profile.displayName })}</h1>
      <div class="card">
        <div class="stat-row"><span>${t(lang, "points")}</span><span style="font-weight:700">${profile.rating}</span></div>
        <div class="stat-row" style="margin-top:8px"><span>${t(lang, "streak")}</span><span style="font-weight:700">${streakText(profile.streakDays, profile.streakBonusPct, lang)}</span></div>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "readyContinue")}</button>
    </div>
  `));
  document.getElementById("continue-btn").addEventListener("click", onStart);
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
        <img class="mascot" src="assets/nesen.svg" alt="" />
        <p class="eyebrow" style="text-align:center">${t(lang, "writeRecapEyebrow")}</p>
        <div class="card">
          <p style="text-align:center">${t(lang, "writeRecapNoneFooled")}</p>
          <div class="stat-row" style="margin-top:12px"><span>${t(lang, "streak")}</span><span class="streak-badge">${streakText(profile.streakDays, profile.streakBonusPct, lang)}</span></div>
          <div class="stat-row"><span>${t(lang, "rating")}</span><span>${profile.rating}</span></div>
        </div>
        <button class="btn full btn-cta" id="continue-btn">${t(lang, "continue")}</button>
      </div>
    `));
    document.getElementById("continue-btn").addEventListener("click", onContinue);
    return;
  }

  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">${t(lang, "writeRecapEyebrow")}</p>
      <p style="text-align:center; font-weight:700; font-size:18px">${t(lang, "writeRecapFooled", { count: fooledWordCount })}</p>
      <p class="eyebrow" style="text-align:center; margin-top:8px">${t(lang, "writeRecapYouGet")}</p>
      <div class="recap-points" id="points">0</div>
      <div class="card">
        <div class="stat-row"><span>${t(lang, "streakBonus")}</span><span>+${result.writeStreakPct}%</span></div>
        <div class="stat-row" style="margin-top:8px"><span>${t(lang, "total")}</span><span style="font-weight:700">${result.writePoints}</span></div>
        <div class="stat-row" style="margin-top:8px"><span>${t(lang, "streak")}</span><span class="streak-badge">${streakText(profile.streakDays, profile.streakBonusPct, lang)}</span></div>
        <div class="stat-row"><span>${t(lang, "rating")}</span><span>${profile.rating}</span></div>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "continue")}</button>
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

function renderTimeoutStep(kind, lang, onNext) {
  currentScreenLang = lang;
  clearActiveTimer();
  const heading = kind === "guess" ? t(lang, "timeoutGuessHeading") : t(lang, "timeoutWriteHeading");
  app.replaceChildren(el(`
    <div class="screen">
      <div class="timeout-box">
        <h2>${heading}</h2>
        <p class="empty-note">${t(lang, "timeoutBody")}</p>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "next")}</button>
    </div>
  `));
  document.getElementById("continue-btn").addEventListener("click", onNext);
}

// -- the guided step flow: Guess (one at a time) -> Score -> Write (one at a
// time) -> Done. Answered/skipped words drop out; the LAST one in a step
// advances straight to the next step's screen. Every step is scoped to ONE
// language (`lang`) — its own store calls, its own re-fetches via
// store.getToday(...).byLang[lang], entirely independent of the other
// enabled language's own in-flight session, if any.

async function renderGuessWordStep(langState, lang) {
  currentScreenLang = lang;
  clearActiveTimer();
  const remaining = langState.guessWords.filter((w) => !w.alreadyGuessed);
  if (!remaining.length) {
    const fresh = (await store.getToday(identity.userId)).byLang[lang];
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
      clearActiveTimer();
      const res = await store.submitGuess(identity.userId, word.wordId, opt.id, lang);
      if (!res.ok) return;
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
      const fresh = (await store.getToday(identity.userId)).byLang[lang];
      renderWriteWordStep(fresh, lang);
    });
  } else {
    const fresh = (await store.getToday(identity.userId)).byLang[lang];
    renderGuessWordStep(fresh, lang);
  }
}

function renderGuessWordMarkup(w, lang) {
  const options = w.options.map((opt) => `<button class="option-btn" id="opt-${w.wordId}-${opt.id}"><span>${opt.text}</span></button>`).join("");
  return `
    <div class="word-block">
      <div class="word-title">${w.word}</div>
      <button class="hint-btn" id="hint-${w.wordId}">${t(lang, "hint")}</button>
      <div class="option-list">${options}</div>
    </div>`;
}

function renderScoreStep(result, lang, onContinue) {
  currentScreenLang = lang;
  clearActiveTimer();
  const rows = result.words.map((w, i) => renderReviewRow(w, i, lang)).join("");
  app.replaceChildren(el(`
    <div class="screen">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center">${t(lang, "scoreEyebrow")}</p>
      <div class="recap-points" id="points">0</div>
      <div class="card">
        <div class="stat-row"><span>${t(lang, "correctGuesses")}</span><span>${result.correctCount} / ${result.guessTotal}${pctLabel(result.pct)}</span></div>
        <div class="review-list">${rows}</div>
      </div>
      <button class="btn full btn-cta" id="continue-btn">${t(lang, "continue")}</button>
    </div>
  `));
  wireReviewToggles();
  revealThenSyncHeader(document.getElementById("points"), result.points, result.profile, lang);
  document.getElementById("continue-btn").addEventListener("click", onContinue);
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
    const fresh = (await store.getToday(identity.userId)).byLang[lang];
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
  document.getElementById(`submit-${word.wordId}`)?.addEventListener("click", async () => {
    clearActiveTimer();
    const text = document.getElementById(`text-${word.wordId}`).value;
    const res = await store.submitDefinition(identity.userId, word.wordId, text, lang);
    if (!res.ok) return;
    const fresh = (await store.getToday(identity.userId)).byLang[lang];
    renderWriteWordStep(fresh, lang, skippedIds);
  });
  activeTimer = setTimeout(() => {
    clearActiveTimer();
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
      <button class="btn full btn-cta" id="submit-${w.wordId}">${t(lang, "submit")}</button>
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
    ? `<button class="btn secondary full btn-cta" id="play-other-lang-btn">${t(lang, "playOtherLangToo", { lang: LANG_LABELS[otherPending.lang] })}</button>`
    : "";
  app.replaceChildren(el(`
    <div class="screen-success">
      <img class="mascot" src="assets/nesen.svg" alt="" />
      <p class="eyebrow" style="text-align:center; color:inherit">${t(lang, "doneStreakLabel")}</p>
      <div class="recap-points" id="streak-num" style="color:inherit">0</div>
      <p style="text-align:center">${t(lang, "doneDays")}</p>
      <p style="text-align:center; font-weight:700; font-size:18px">${t(lang, "doneBody")}</p>
      ${extraBtn}
    </div>
  `));
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
      const fresh = (await store.getToday(identity.userId)).byLang[lang];
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
// filesystem, resets every reload. Fixture screens are Norwegian-only for
// now (FIXTURE_WORDS) — see js/gallery-screens.js for the full screen list.
const FIXTURE_IDENTITY = { userId: "gallery-preview-user", displayName: "Ferdigfigur" };

const FIXTURE_WORDS = [
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
];

function fixtureProfile(overrides = {}) {
  return { displayName: "Ferdigfigur", rating: 940, rank: 42, streakDays: 4, streakBonusPct: 40, ...overrides };
}

function fixtureWordOptions(w) {
  return [
    { id: "a", text: w.bluffs[0], kind: "bot" },
    { id: "b", text: w.bluffs[1], kind: "bot" },
    { id: "c", text: w.truth, kind: "truth" },
    { id: "d", text: w.bluffs[2], kind: "bot" },
  ];
}

function fixtureScoreResult() {
  return {
    correctCount: 2, guessTotal: 3, points: 165, pct: 30,
    profile: fixtureProfile({ rating: 985 }),
    words: FIXTURE_WORDS.map((w, i) => ({
      wordId: w.wordId, word: w.word, correct: i !== 1,
      options: fixtureWordOptions(w).map((o) => ({
        id: o.id, text: o.text, isTruth: o.kind === "truth",
        isMine: i === 1 ? o.id === "a" : o.id === "c",
        pct: o.kind === "truth" ? 55 : (i === 1 && o.id === "a" ? 40 : 15),
      })),
    })),
  };
}

function createFixtureStore() {
  let guesses = []; // { wordId, choiceId, correct }
  const submitted = new Set();
  let profile = fixtureProfile({ rating: 820, streakDays: 3, streakBonusPct: 30 });
  // A couple of "other players'" guesses on the first word, seeded up front,
  // so the hint has real data to show without requiring any prior action.
  const otherGuesses = [
    { wordId: "fx-1", choiceId: "a" }, { wordId: "fx-1", choiceId: "c" }, { wordId: "fx-1", choiceId: "c" },
  ];

  function today() {
    return {
      // enabledLangs is here purely so openSettingsPanel's fresh-fetch
      // (see its own comment) doesn't crash when a gallery preview card's
      // settings button gets clicked — the fixture screens themselves never
      // read this field, since they're always called with an explicit
      // fixture-built state, not through the real getToday()/byLang shape.
      enabledLangs: ["no"],
      writeWords: FIXTURE_WORDS.map((w) => ({ wordId: w.wordId, word: w.word, alreadySubmitted: submitted.has(w.wordId) })),
      guessWords: FIXTURE_WORDS.map((w) => {
        const mine = guesses.find((g) => g.wordId === w.wordId);
        return {
          wordId: w.wordId, word: w.word,
          alreadyGuessed: Boolean(mine), choiceId: mine?.choiceId ?? null, correct: mine?.correct ?? null,
          options: fixtureWordOptions(w).map((o) => ({ id: o.id, text: o.text })),
        };
      }),
      profile,
    };
  }

  function finalizeGuessingIfDone() {
    if (guesses.length < FIXTURE_WORDS.length) return null;
    const table = [-50, 0, 120, 300];
    const correctCount = guesses.filter((g) => g.correct).length;
    const points = table[Math.min(correctCount, table.length - 1)];
    profile = { ...profile, rating: profile.rating + points };
    return {
      correctCount, guessTotal: FIXTURE_WORDS.length, points, pct: 0, profile,
      words: FIXTURE_WORDS.map((w) => {
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
    getToday: async () => today(),
    submitGuess: async (_userId, wordId, choiceId) => {
      const correct = fixtureWordOptions(FIXTURE_WORDS.find((w) => w.wordId === wordId)).find((o) => o.id === choiceId)?.kind === "truth";
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
    setEnabledLangs: async () => ({ ok: true, enabledLangs: ["no"] }),
    listDays: async () => ({ days: [], current: null }),
    listPlayers: async () => ({ players: [] }),
    advanceDay: async () => ({ todayKey: null }),
  };
}

const GALLERY_PREVIEW_SCREENS = {
  "language-picker": () => renderLanguagePicker(() => {}),
  "name": () => renderNameScreen("no", FIXTURE_IDENTITY.displayName, () => {}),
  "how-to-play": () => renderHowToPlay("no", () => {}),
  "welcome": () => renderWelcomeStep("no", FIXTURE_IDENTITY.displayName, fixtureProfile({ rating: 800, streakDays: 0, streakBonusPct: 0, rank: 118 }), () => {}),
  "ready": () => {
    const profile = fixtureProfile();
    renderHeaderImmediate(profile, "no");
    renderReadyStep({ profile }, "no", () => {});
  },
  "choose-today-lang": () => {
    renderChooseTodayLangStep("no", ["no", "en"], {
      no: { profile: fixtureProfile() }, en: { profile: fixtureProfile({ rating: 700, streakDays: 2, streakBonusPct: 20 }) },
    });
  },
  "write-recap-none": () => {
    const profile = fixtureProfile();
    renderHeaderImmediate(profile, "no");
    renderWriteRecap({ fooledByWord: [] }, profile, "no", () => {});
  },
  "write-recap-fooled": () => {
    const profile = fixtureProfile();
    renderHeaderImmediate(profile, "no");
    renderWriteRecap({
      fooledByWord: [{ wordId: "fx-1", count: 7 }, { wordId: "fx-2", count: 3 }],
      writeStreakPct: profile.streakBonusPct, writeBasePoints: 112, writePoints: 123,
    }, profile, "no", () => {});
  },
  "guess": async () => {
    const state = await store.getToday();
    renderHeaderImmediate(state.profile, "no");
    renderGuessWordStep(state, "no");
  },
  "guess-hint": async () => {
    const state = await store.getToday();
    renderHeaderImmediate(state.profile, "no");
    renderGuessWordStep(state, "no");
    document.getElementById(`hint-${state.guessWords[0].wordId}`)?.click();
  },
  "timeout-guess": () => { renderHeaderImmediate(fixtureProfile(), "no"); renderTimeoutStep("guess", "no", () => {}); },
  "score": () => { renderHeaderImmediate(fixtureProfile({ rating: 820 }), "no"); renderScoreStep(fixtureScoreResult(), "no", () => {}); },
  "write": async () => {
    const state = await store.getToday();
    renderHeaderImmediate(state.profile, "no");
    renderWriteWordStep(state, "no");
  },
  "timeout-write": () => { renderHeaderImmediate(fixtureProfile(), "no"); renderTimeoutStep("write", "no", () => {}); },
  "done": () => {
    renderHeaderImmediate(fixtureProfile({ streakDays: 3, streakBonusPct: 30 }), "no");
    renderDoneStep({ profile: fixtureProfile({ streakDays: 4, streakBonusPct: 40 }) }, "no", null);
  },
  "done-with-other-lang": () => {
    renderHeaderImmediate(fixtureProfile({ streakDays: 3, streakBonusPct: 30 }), "no");
    renderDoneStep(
      { profile: fixtureProfile({ streakDays: 4, streakBonusPct: 40 }) }, "no",
      { lang: "en", state: { profile: fixtureProfile({ rating: 700 }) } },
    );
  },
  "sign-in-gate": () => renderSignInGate(),
};

async function runGalleryPreview(screenId, theme) {
  applyTheme(theme === "dark" ? "dark" : "light");
  identity = FIXTURE_IDENTITY;
  store = createFixtureStore();
  renderSettingsButton();
  const renderFn = GALLERY_SCREENS.some((s) => s.id === screenId) ? GALLERY_PREVIEW_SCREENS[screenId] : null;
  if (!renderFn) {
    app.replaceChildren(el(`<div class="screen"><div class="card"><h2>Unknown preview screen</h2><p>"${screenId}" isn't in gallery-screens.js.</p></div></div>`));
    return;
  }
  await renderFn();
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

  const previewId = new URLSearchParams(location.search).get("preview");
  if (previewId && devToolsEnabled) {
    await runGalleryPreview(previewId, new URLSearchParams(location.search).get("theme"));
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
      renderNameScreen(lang, identity.displayName, (displayName) => registerFlow(lang, displayName));
    });
    return;
  }
  await store.ensureProfile(identity.userId, identity.displayName);
  await routeToCurrentScreen();
}

async function registerFlow(lang, displayName) {
  identity.displayName = displayName;
  saveIdentity(identity);
  await store.ensureProfile(identity.userId, displayName);
  await store.setEnabledLangs(identity.userId, [lang]);
  await renderDevToolbar(); // pick up the brand-new player in the dev switcher
  renderHowToPlay(lang, async () => {
    const langState = (await store.getToday(identity.userId)).byLang[lang];
    renderWelcomeStep(lang, displayName, langState.profile, () => resumeFlowFromState(langState, lang));
  });
}

function registerNewPlayer() {
  identity = { userId: crypto.randomUUID(), displayName: suggestName() };
  renderLanguagePicker((lang) => {
    currentScreenLang = lang;
    renderNameScreen(lang, identity.displayName, (displayName) => registerFlow(lang, displayName));
  });
}

main();
