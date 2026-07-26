// rating.js — the career rating (PRD §2.1). Segment 5.
//
// Pairwise-decomposed Elo, the standard adaptation of a two-player system to an
// N-player free-for-all: score each pair independently, then divide by (N−1) so
// an eight-player game swings about as much as a three-player one. Beating
// someone rated above you is worth more, by construction rather than by a bonus
// rule — that falls straight out of (S − E) per pair.
//
// Deliberately NOT TrueSkill or Glicko: both are better models, both need
// priors or a variance term to explain, and neither is worth it for a party
// game whose stake is bragging rights. This fits in a paragraph a player will
// actually read.
//
// No DOM, no network, no imports. The only side effect is one localStorage key,
// and every touch of it is wrapped — Safari in private mode throws on setItem,
// and a profile must never be able to break the boot.
//
// BUNDLE NOTE: concatenated into one IIFE with every other module, so all
// internals are prefixed `rt` (see Tools/build-standalone.mjs).

export const RATING = Object.freeze({
  START: 1000,
  FLOOR: 100,          // you can slump, but the number stays a number
  MAX_DELTA: 64,       // also the clamp applied to anything arriving over the wire
  SCALE: 400,          // the classic Elo constant: 400 pts ≈ 10:1 odds
  K_NEW: 40,           // first 10 games — a provisional rating should move fast
  K_MID: 24,           // to 30 games
  K_SET: 16,           // settled
  PROVISIONAL_GAMES: 10,
  SETTLED_GAMES: 30,
  KEY: "cockymonk.profile.v1",
  VERSION: 1,
  HISTORY_MAX: 20,
});

// Tiers are flavour, not mechanics — the number is the truth. Named for noses
// because that is what the game is about (Gullnesen, PRD §5.3).
const rtTIERS = [
  { min: 1600, nb: "Mestermøller", en: "Master liar" },
  { min: 1400, nb: "Storløgner", en: "Grand fibber" },
  { min: 1200, nb: "Rutinert", en: "Seasoned" },
  { min: 1000, nb: "Habil", en: "Capable" },
  { min: 800, nb: "Ærlig sjel", en: "Honest soul" },
  { min: 0, nb: "Blank nese", en: "Blank nose" },
];
export const ratingTier = (r, lang = "nb") =>
  (rtTIERS.find((x) => r >= x.min) ?? rtTIERS[rtTIERS.length - 1])[lang];

export function ratingK(games) {
  if (games < RATING.PROVISIONAL_GAMES) return RATING.K_NEW;
  if (games < RATING.SETTLED_GAMES) return RATING.K_MID;
  return RATING.K_SET;
}

// Expected score for A against B. 0.5 at equal rating, → 1 as A pulls ahead.
export const ratingExpected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / RATING.SCALE));

export const ratingNewPid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Rating changes for one finished game.
 * @param players [{pid, rating, games, score, isBot}] — final scores.
 * @returns {pid: delta} for RATED players only, or {} if the game doesn't count.
 *
 * Two games deliberately count for nothing:
 *   · fewer than two rated humans — you cannot farm a rating off bots;
 *   · any game that never reached a winner — a friend whose battery dies
 *     should not be punished for it, and neither should the room.
 */
export function ratingDeltas(players) {
  const rated = players.filter((p) => p && !p.isBot && p.pid);
  if (rated.length < 2) return {};

  const out = {};
  for (const a of rated) {
    let sum = 0;
    for (const b of rated) {
      if (a === b) continue;
      const actual = a.score > b.score ? 1 : a.score === b.score ? 0.5 : 0;
      sum += actual - ratingExpected(a.rating ?? RATING.START, b.rating ?? RATING.START);
    }
    const raw = ratingK(a.games ?? 0) * (sum / (rated.length - 1));
    out[a.pid] = rtClampDelta(Math.round(raw));
  }
  return out;
}

const rtClampDelta = (d) => Math.max(-RATING.MAX_DELTA, Math.min(RATING.MAX_DELTA, d));

// Applied to a delta arriving from the host. The host computed it, but a host
// is just another player's browser — so the clamp is re-applied on receipt.
// This is the honest bar Specs/ONLINE-PLAY.md sets: make it not-embarrassingly-
// easy, don't pretend a party game has server-grade anti-cheat.
export function ratingApply(profile, delta, { nose = 0, won = false } = {}) {
  const d = rtClampDelta(Math.round(Number(delta) || 0));
  const rating = Math.max(RATING.FLOOR, (profile.rating ?? RATING.START) + d);
  const history = [
    ...(profile.history ?? []),
    { d, r: rating, n: Math.max(0, Math.round(Number(nose) || 0)) },
  ].slice(-RATING.HISTORY_MAX);
  return {
    ...profile,
    rating,
    games: (profile.games ?? 0) + 1,
    wins: (profile.wins ?? 0) + (won ? 1 : 0),
    nose: (profile.nose ?? 0) + Math.max(0, Math.round(Number(nose) || 0)),
    best: Math.max(profile.best ?? RATING.START, rating),
    history,
  };
}

// Career nose count has a ceiling per game: every other player can vote for you
// at most once per round. Anything above that didn't happen.
export const ratingNoseCap = (playerCount, rounds) =>
  Math.max(0, (playerCount - 1) * Math.max(0, rounds));

// -- storage ------------------------------------------------------------------
// Every read and write is total: a corrupt or unavailable store yields a fresh
// profile rather than an exception, because nothing here is worth a broken boot.

export function ratingFresh(name = "") {
  return {
    v: RATING.VERSION,
    pid: ratingNewPid(),
    name,
    rating: RATING.START,
    games: 0,
    wins: 0,
    nose: 0,
    best: RATING.START,
    history: [],
    // Not a rating field, and it rides here on purpose: mute is the one setting
    // players expect to survive a reload, and CLAUDE.md promises the web build
    // keeps exactly ONE versioned localStorage key. A second key for a boolean
    // would make that line false. audio.js stays storage-free; ui.js does the
    // reading and writing at the two points that already touch this file.
    muted: false,
  };
}

export function ratingLoad() {
  let raw = null;
  try { raw = globalThis.localStorage?.getItem(RATING.KEY) ?? null; } catch { /* blocked */ }
  if (!raw) return ratingFresh();
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object" || !p.pid) return ratingFresh();
    // Version switch, not a silent merge: a future v2 gets a real migration
    // here, and anything unrecognised is reseeded rather than half-read.
    if (p.v !== RATING.VERSION) return ratingFresh(typeof p.name === "string" ? p.name : "");
    return { ...ratingFresh(p.name), ...p, v: RATING.VERSION };
  } catch { return ratingFresh(); }
}

export function ratingSave(profile) {
  try {
    globalThis.localStorage?.setItem(RATING.KEY, JSON.stringify({ ...profile, v: RATING.VERSION }));
    return true;
  } catch { return false; }   // private mode, quota, disabled storage — all survivable
}

export function ratingReset(name = "") {
  try { globalThis.localStorage?.removeItem(RATING.KEY); } catch { /* nothing to undo */ }
  const fresh = ratingFresh(name);
  ratingSave(fresh);
  return fresh;
}
