/**
 * config.js — ONE place for every point value, streak step, and pool size.
 * Change balance here, not scattered through engine.js/rating.js. Same rule
 * as ordkrig/src/config/gameConfig.ts and shunwg's engine-vectors.json.
 *
 * Starting numbers are illustrative defaults, not measured — retune freely.
 */

// Supported gameplay languages — see cockerel/CLAUDE.md's "Dual-language
// gameplay" section for the full architecture. Both now have a real corpus
// (see CORPUS_VERSIONS below). Every batch/submission/guess/profile-track is
// keyed by one of these codes — never hardcode "no" as "the" language
// anywhere new.
export const LANGS = ["no", "en"];

// Which corpus VERSION each language draws new daily batches from — see
// cockerel/CLAUDE.md's "Versioned corpora" section. Content lives in
// js/corpora/<lang>/<version>/, one immutable directory per version; this is
// the one place that says which is live.
//
// Changing a value here only affects batches drawn AFTER the change. Every
// batch records the version it was drawn from (`batch.corpusVersion`), so
// history keeps resolving against the corpus it was actually played with —
// which is exactly what makes rolling back safe. `node Tools/corpus.mjs list`
// shows what's on disk; a deployed instance can override without a redeploy
// via COCKEREL_CORPUS_NO / COCKEREL_CORPUS_EN (see js/words.js).
export const CORPUS_VERSIONS = {
  no: "v1",
  en: "v2",
};

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

// ONE currency, one arithmetic. Every value below is a number of POINTS that
// lands directly on the player's running total (see POINTS): the "+78" on the
// score screen is literally what the header's total goes up by. Balance is
// therefore sized around what a DAY should be worth, not around an abstract
// rating scale:
//   a strong day (3/3 guessed + three bluffs that each fooled a couple of
//   people, on a week-long streak)  ~200 points
//   an ordinary day                 ~50-90 points
//   a bad day (0/3, nobody fooled)  -15 points
// which keeps the daily number legible (two/low three digits — never single
// digits, never five) and lets a total climb into the hundreds in a week and
// the thousands in a month. Rescaling this table means rescaling every stored
// total with it — see loadDb's PROFILE_VERSION 4 migration in server/db.mjs.
export const SCORING = {
  // Guessing is scored per DAY (all 3 guesses together), not per word — one
  // simple lookup by how many of today's 3 you got right. See README.md
  // "Scoring" for the reasoning: negative at 0/3, breakeven at 1/3 (a lucky
  // single guess shouldn't move your total), real reward starts at 2/3.
  guessScoreByCorrectCount: [-15, 0, 30, 75], // index = correctCount (0..3)
  // Points for fooling people with a bluff: bluffBaseK * fooledCount^bluffExponent,
  // rounded. A concave (sub-linear) curve, not a flat rate or a fixed pool —
  // fooling 1 person earns exactly bluffBaseK (real, but modest); each
  // ADDITIONAL person fooled is worth a little less than the last, so it
  // keeps growing with zero ceiling (fooling a crowd of hundreds is a
  // legitimately huge score) without a lucky single vote in a tiny game
  // outscoring a bluff that genuinely fooled a crowd. See BLUFF-SCENARIOS.md
  // for worked examples across small and large games.
  bluffBaseK: 12,
  bluffExponent: 0.5, // 0.5 = square root
  // A written submission that (near-)matches the truth — Cocky Monk's
  // dobbeltreff. Worth more than a plain correct guess since it happened at
  // write time, independent of anyone voting for it (it's never even shown
  // as its own option — see engine.js mergeSubmissions). Sized at roughly
  // "fooled a dozen people," same relative weight it had before the rescale.
  closeMatchBonus: 40,
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

// A player's headline number is a running SUM of every day's points — not an
// average, and not an Elo-style rating around a base (it used to be
// `800 + average(day totals)`, which is why nothing here is called "rating"
// any more). The whole point of the change: the number on the score screen
// and the number in the header are the same currency, so
//
//     total after today = total before today + today's points
//
// holds exactly, every day, with no conversion in between.
export const POINTS = {
  // Everyone starts from nothing and keeps what they earn.
  start: 0,
  // ...and can never be dragged below it. A 0/3 guessing day is the one way
  // to LOSE points (see SCORING above), but it can only ever eat into points
  // you actually have — a brand-new player's first bad day shows 0, not -15.
  // The day's DISPLAYED points are clamped to match (rating.js
  // effectivePoints), so the arithmetic above never silently disagrees.
  floor: 0,
  // One-time conversion for totals accumulated under the old, ~4x-larger
  // point table (guess 3/3 was 300, not 75). Applied once per stored profile
  // by the PROFILE_VERSION 4 migration in server/db.mjs's loadDb, so existing
  // players keep their standing relative to each other on the new scale.
  legacyScaleDivisor: 4,
};

// A fixed pool of imaginary competitors, left over from when rank was padded
// with bots. Its RATINGS are now dead weight — they're on the old 800-base
// scale, and nothing displays or compares them any more (see server/db.mjs
// computeRank: bots are excluded from rank entirely). Only the pool's SIZE is
// still read, by the admin dashboard's informational bot-count columns.
// Generated ONCE (server/db.mjs ensureBotLeaderboard) and stored in db.json.
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
  guessSeconds: 45,
  writeSeconds: 120,
};

// If the write timer runs out but the user had already typed at least this
// many (trimmed) characters, js/ui.js auto-submits it instead of discarding
// it — better to keep a genuine (if rushed) bluff than lose real work just
// because the clock beat them to the button. Below this threshold there's
// likely nothing worth keeping (a stray character or two), so the normal
// "you ran out of time, nothing was submitted" path still applies.
export const WRITE_AUTOSUBMIT_MIN_CHARS = 4;
