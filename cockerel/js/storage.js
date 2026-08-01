// storage.js — the seam. storageLocal() talks to server/dev-server.mjs's
// mock API today. A future storageRemote() (real hosted backend) must expose
// this exact same interface so ui.js never changes — same shape as
// shunwg/Lab/js/net.js's transport seam.

// A coarse, no-library browser/OS label for the admin dashboard's device
// column — not fingerprinting, just enough to answer "web vs. what browser."
function detectDevice() {
  try {
    const ua = navigator.userAgent;
    let browser = "Unknown browser";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\//.test(ua)) browser = "Opera";
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Safari\//.test(ua)) browser = "Safari";
    let os = "unknown OS";
    if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Linux/.test(ua)) os = "Linux";
    return `${browser} on ${os}`;
  } catch { return "unknown"; }
}

export function storageLocal(base = "") {
  async function post(path, body) {
    const res = await fetch(base + path, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return res.json();
  }
  async function get(path) {
    const res = await fetch(base + path);
    return res.json();
  }
  return {
    getConfig: () => get("/api/config"),
    ensureProfile: (userId, displayName) => post("/api/profile", { userId, displayName, device: detectDevice() }),
    // getToday's response is now consolidated across every enabled language
    // (see server/db.mjs getTodayState) — { enabledLangs, todayKey, byLang:
    // { no: {...}, en: {...} } } — not itself lang-scoped; the individual
    // actions below are.
    getToday: (userId) => get(`/api/today?userId=${encodeURIComponent(userId)}`),
    submitDefinition: (userId, wordId, text, lang) => post("/api/submit-definition", { userId, wordId, text, lang }),
    submitGuess: (userId, wordId, choiceId, lang) => post("/api/submit-guess", { userId, wordId, choiceId, lang }),
    skipGuess: (userId, wordId, lang) => post("/api/skip-guess", { userId, wordId, lang }),
    ackRecap: (userId, lang) => post("/api/ack-recap", { userId, lang }),
    getVoteDistribution: (userId, wordId, lang) =>
      get(`/api/vote-distribution?userId=${encodeURIComponent(userId)}&wordId=${encodeURIComponent(wordId)}&lang=${encodeURIComponent(lang)}`),
    resetPlayer: (userId) => post("/api/reset-player", { userId }),
    signInWithGoogle: (idToken, userId) => post("/api/auth/google", { idToken, userId, device: detectDevice() }),
    // Settings-panel toggle / onboarding's initial choice — see
    // cockerel/CLAUDE.md "Dual-language gameplay". Callers re-fetch getToday
    // afterward to pick up the newly (dis)enabled language's state.
    setEnabledLangs: (userId, enabledLangs) => post("/api/set-languages", { userId, enabledLangs }),
    // dev-only test tools (see CLAUDE.md) — a real backend need not implement these.
    listDays: () => get("/api/dev/days"),
    listPlayers: () => get("/api/dev/players"),
    advanceDay: () => post("/api/dev/advance-day", {}),
  };
}

// Exported so js/ui.js (which also reads/clears identity directly, for
// sign-out/reset/first-time-visitor checks) uses the exact same keys rather
// than a second hand-copied pair that could drift.
export const IDENTITY_KEY = "cockerel.identity.v1";
// Pre-rename key (app was "The Daily Cock") — real players' profiles/streaks
// already live under this key in their browsers. loadOrCreateIdentity falls
// back to it once and migrates the value forward, so the rename itself never
// looks like a data wipe to anyone who already has a profile.
export const LEGACY_IDENTITY_KEY = "thedailycock.identity.v1";

/** One-key localStorage identity, same micro-pattern as shunwg/Lab/js/rating.js. */
export function loadOrCreateIdentity(suggestedName) {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) return JSON.parse(raw);
    const legacyRaw = localStorage.getItem(LEGACY_IDENTITY_KEY);
    if (legacyRaw) {
      try { localStorage.setItem(IDENTITY_KEY, legacyRaw); } catch { /* ignore */ }
      return JSON.parse(legacyRaw);
    }
  } catch { /* Safari private mode etc. */ }
  const identity = { userId: crypto.randomUUID(), displayName: suggestedName };
  try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* ignore */ }
  return identity;
}

export function saveIdentity(identity) {
  try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* ignore */ }
}

const THEME_KEY = "cockerel.theme.v1";
const LEGACY_THEME_KEY = "thedailycock.theme.v1";

/** "light" (default, Wordle-style black-on-white) or "dark" (the original
 * game palette, opt-in via the settings toggle). Device-local display
 * preference, unrelated to identity — same one-key localStorage micro-pattern
 * as above. Only an explicit "dark" ever overrides the default — a returning
 * player who never touched the toggle stays on light even as this default
 * itself changes. */
export function loadTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    return value === "dark" ? "dark" : "light";
  } catch { return "light"; }
}

export function saveTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}
