// GENERATED FILE — copied verbatim from cockerel/js/config.js by
// app/Tools/sync-engine.mjs. Do not hand-edit; re-run the script instead.

/**
 * config.js — ONE place for every point value, streak step, and pool size.
 * Change balance here, not scattered through engine.js/rating.js. Same rule
 * as ordkrig/src/config/gameConfig.ts and shunwg's engine-vectors.json.
 *
 * Starting numbers are illustrative defaults, not measured — retune freely.
 */

export const BATCH = {
  wordsPerDay: 3,
  // How many days a word is excluded from being redrawn after use. The corpus
  // is 996 words / 3 per day, so this is generous headroom, not a tight limit.
  recentlyUsedWindowDays: 180,
};

export const OPTIONS = {
  // Total options per word (truth + bluffs + bot fill), Cocky Monk-style.
  targetPoolSize: 5,
};

export const SCORING = {
  // Guessing is scored per DAY (all 3 guesses together), not per word — one
  // simple lookup by how many of today's 3 you got right. See README.md
  // "Scoring" for the reasoning: negative at 0/3, breakeven at 1/3 (a lucky
  // single guess shouldn't move your rating), real reward starts at 2/3.
  guessScoreByCorrectCount: [-50, 0, 120, 300], // index = correctCount (0..3)
  // Points for fooling people with a bluff: bluffBaseK * fooledCount^bluffExponent,
  // rounded. A concave (sub-linear) curve, not a flat rate or a fixed pool —
  // fooling 1 person earns exactly bluffBaseK (real, but modest); each
  // ADDITIONAL person fooled is worth a little less than the last, so it
  // keeps growing with zero ceiling (fooling a crowd of hundreds is a
  // legitimately huge score) without a lucky single vote in a tiny game
  // outscoring a bluff that genuinely fooled a crowd. See BLUFF-SCENARIOS.md
  // for worked examples across small and large games.
  bluffBaseK: 40,
  bluffExponent: 0.5, // 0.5 = square root
  // A written submission that (near-)matches the truth — Cocky Monk's
  // dobbeltreff. Worth more than a plain correct guess since it happened at
  // write time, independent of anyone voting for it (it's never even shown
  // as its own option — see engine.js mergeSubmissions).
  closeMatchBonus: 150,
};

// Display-only caps for the "hint" vote-distribution shown during guessing
// (and the identical breakdown reused in the post-guess review) — NOT used
// for real scoring, which always uses the true share (see SCORING above and
// scoreFooledVotes). Without a cap, the true answer's share snowballs as more
// people guess correctly, since every guesser sees the same live tally — that
// turns the hint into "click the biggest number" for everyone who guesses
// later in the day. Capping keeps it a hint, never a giveaway.
export const HINT = {
  capPct: 45,
  roundToPct: 5,
};

export const STREAK_BONUS = {
  // A PERCENTAGE multiplier on a day's already-earned (skill-based) points —
  // never a flat stipend for showing up. Streak day N = +N*stepPct, capped at
  // maxPct: day 1 = +10%, day 2 = +20%, ..., day 7+ = +70% (a full week).
  //
  // Why a multiplier and not an addend: it can only AMPLIFY points you
  // actually earned by guessing right or fooling someone. It must NEVER
  // amplify a bad day's penalty (a 0/3 day is already -50; a long streak
  // should not make that WORSE) — see rating.js applyStreakBonus, which
  // only multiplies positive base points and passes negative ones through
  // unchanged. That keeps skill primary and the streak secondary, per the
  // explicit design goal — see CLAUDE.md guardrails.
  stepPct: 10,
  maxPct: 70,
};

export const RATING = {
  base: 800,
};

// A fixed pool of imaginary competitors so a leaderboard rank ("129. plass")
// means something before there are enough real players — generated ONCE
// (server/db.mjs ensureBotLeaderboard) and stored in db.json, never
// regenerated, so a given user's rank only moves because of real play, not
// because the bots reroll under them.
export const LEADERBOARD = {
  botCount: 200,
  botMean: 850,
  botStdDev: 100,
  botMin: 550,
  botMax: 1150,
};

// Shared between server (enforces nothing yet — trust-based, see CLAUDE.md
// guardrails) and client (drives the countdown bar + timeout screens).
// A speed bonus is a plausible future addition (config.js is where it'd live,
// keyed off however much of the window was left when the user acted) —
// nothing below assumes it exists yet.
export const TIMERS = {
  guessSeconds: 30,
  writeSeconds: 60,
};
