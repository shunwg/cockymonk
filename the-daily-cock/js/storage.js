// storage.js — the seam. storageLocal() talks to server/dev-server.mjs's
// mock API today. A future storageRemote() (real hosted backend) must expose
// this exact same interface so ui.js never changes — same shape as
// shunwg/Lab/js/net.js's transport seam.
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
    ensureProfile: (userId, displayName) => post("/api/profile", { userId, displayName }),
    getToday: (userId) => get(`/api/today?userId=${encodeURIComponent(userId)}`),
    submitDefinition: (userId, wordId, text) => post("/api/submit-definition", { userId, wordId, text }),
    submitGuess: (userId, wordId, choiceId) => post("/api/submit-guess", { userId, wordId, choiceId }),
    skipGuess: (userId, wordId) => post("/api/skip-guess", { userId, wordId }),
    ackRecap: (userId) => post("/api/ack-recap", { userId }),
    // dev-only test tools (see CLAUDE.md) — a real backend need not implement these.
    listDays: () => get("/api/dev/days"),
    listPlayers: () => get("/api/dev/players"),
    advanceDay: () => post("/api/dev/advance-day", {}),
  };
}

const IDENTITY_KEY = "thedailycock.identity.v1";

/** One-key localStorage identity, same micro-pattern as shunwg/Lab/js/rating.js. */
export function loadOrCreateIdentity(suggestedName) {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* Safari private mode etc. */ }
  const identity = { userId: crypto.randomUUID(), displayName: suggestedName };
  try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* ignore */ }
  return identity;
}

export function saveIdentity(identity) {
  try { localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* ignore */ }
}
