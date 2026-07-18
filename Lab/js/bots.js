// bots.js — BotBrain for practice mode. Lane A owns this file.
// CLAUDE.md rule: ALL bot tuning constants live in this one block, never inline.
// The SwiftUI BotBrain mirrors this file (constants → BotTuning.swift).
// Pure decision logic + delay policies; actual timers belong to the UI layer.

export const TUNING = Object.freeze({
  TRUTH_FIND_RATE: 0.35,          // PRD §4: bots vote the truth 35% of the time
  BLUFF_DELAY_MS: [1800, 3500],   // first bot starts writing while the user still types
  BLUFF_STAGGER_MS: [800, 2200],  // per-bot additional stagger
  VOTE_DELAY_MS: [1500, 3000],
  VOTE_STAGGER_MS: [700, 1800],
  USER_DECOY_MS: [2500, 5000],    // party demo: user's auto-decoy window
  GM_INTRO_AUTO_MS: 2000,         // bot GM advances the intro after 2 s
  GM_SHUFFLE_MS: 1200,            // bot GM: all-bluffs-in → open vote
  REVEAL_BEAT_MS: 1700,           // bot GM auto-paced reveal beat (PRD §4 ~1.7 s)
  REVEAL_TO_BOARD_MS: 1600,
});

export const BOT_NAMES = Object.freeze({
  nb: ["Kåre 🤖", "Berit 🤖", "Odd 🤖", "Solveig 🤖", "Trygve 🤖"],
  en: ["Max 🤖", "Ava 🤖", "Pip 🤖", "Ida 🤖", "Leo 🤖"],
});

const inRange = ([lo, hi], rng) => lo + Math.floor(rng() * (hi - lo + 1));

// Randomized human-feeling submission offsets for k bots (ms from phase start).
export function bluffOffsets(botCount, rng) {
  return Array.from({ length: botCount }, (_, k) =>
    inRange(TUNING.BLUFF_DELAY_MS, rng) + k * inRange(TUNING.BLUFF_STAGGER_MS, rng));
}

export function voteOffsets(botCount, rng) {
  return Array.from({ length: botCount }, (_, k) =>
    inRange(TUNING.VOTE_DELAY_MS, rng) + k * inRange(TUNING.VOTE_STAGGER_MS, rng));
}

// A bot's vote: 35% the truth, otherwise a random option that is neither the
// truth nor its own answer. Falls back to the truth if nothing else is votable.
export function botPick(options, botIndex, rng) {
  const votable = options.filter((o) => !o.authors.includes(botIndex));
  const truth = votable.find((o) => o.kind === "truth");
  if (truth && rng() < TUNING.TRUTH_FIND_RATE) return truth.id;
  const lies = votable.filter((o) => o.kind !== "truth");
  if (lies.length === 0) return truth?.id ?? null;
  return lies[Math.floor(rng() * lies.length)].id;
}

// Draw a fake from the pool without repeats within a round (PRD §9).
// `used` is a Set of already-drawn ids, mutated by the caller between draws.
export function takeFake(pool, used, rng) {
  const fresh = pool.filter((f) => !used.has(f.id));
  const pick = fresh.length ? fresh[Math.floor(rng() * fresh.length)] : pool[Math.floor(rng() * pool.length)];
  used.add(pick.id);
  return pick;
}
