// engine.js — pure rules engine for The Daily Cock. No DOM, no server I/O,
// no bare Date.now()/Math.random() — the caller injects `now`/`rng` (same
// discipline as shunwg/Lab/js/engine.js). Tested against vectors.json via
// engine.test.mjs ("node --test").
//
// The cutoff is UTC midnight (not local time) so every player writes/guesses
// against the same global batch, wordle-style.

import { getFakeExplanations } from "./decoys.js";
import { OPTIONS } from "./config.js";

// -- date helpers (pure given their string/Date input) -----------------------

export function dayKeyFromDate(date) {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD", UTC by construction
}

export function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dayKeyFromDate(dt);
}

export function isNextDay(prevKey, curKey) {
  return addDays(prevKey, 1) === curKey;
}

// -- text rules ----------------------------------------------------------

export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[.,!?;:«»"'’`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidSubmission(text) {
  return normalize(text).length > 0;
}

// -- daily batch selection -------------------------------------------------

/**
 * Pick `count` words not present in `recentlyUsedIds`. Falls back to the
 * full pool (allowing a repeat) if exclusion has eaten the whole corpus —
 * this should never happen at 996 words / 3 per day, but must degrade
 * gracefully rather than throw.
 */
export function pickDailyWords(allWords, recentlyUsedIds, count, rng) {
  const usedSet = new Set(recentlyUsedIds);
  const fresh = allWords.filter((w) => !usedSet.has(w.id));
  const pool = fresh.length >= count ? fresh : allWords;
  const usedFallback = fresh.length < count;
  const picks = [];
  const candidates = [...pool];
  for (let i = 0; i < count && candidates.length; i++) {
    const idx = Math.floor(rng() * candidates.length);
    picks.push(candidates.splice(idx, 1)[0]);
  }
  return { words: picks, usedFallback };
}

// -- option pool for one word (write phase -> seal -> guess phase) --------

/**
 * Merge human submissions for one word: identical normalized text merges
 * into one option crediting every author (mirrors Cocky Monk's buildOptions
 * dedupe). A submission that normalizes to the truth is pulled OUT of the
 * visible option set entirely and reported as a "close match" instead —
 * showing it as its own option would put the true definition's text on
 * screen twice, which tells a guesser which option is real just by the
 * duplication (Cocky Monk's dobbeltreff has the same shape: merged with the
 * truth, never a separate visible option).
 */
export function mergeSubmissions({ truth, submissions }) {
  const truthKey = normalize(truth);
  const byText = new Map();
  const closeMatches = [];
  for (const { userId, text } of submissions) {
    const key = normalize(text);
    if (!key) continue;
    if (key === truthKey) { closeMatches.push(userId); continue; }
    if (byText.has(key)) byText.get(key).authors.push(userId);
    else byText.set(key, { kind: "human", authors: [userId], text });
  }
  return { options: [...byText.values()], closeMatches };
}

/**
 * Top a word's option pool up to `targetCount` (incl. truth) with bot decoys
 * drawn from the fake-definition pool (see decoys.js / CLAUDE.md Provenance).
 */
export function fillWithBotDecoys({ word, humanOptions, fakeDefsPool, targetCount, rng }) {
  const needed = targetCount - humanOptions.length - 1; // -1 for the truth slot
  if (needed <= 0) return humanOptions;
  const decoyTexts = getFakeExplanations(word, needed, fakeDefsPool, rng);
  const botOptions = decoyTexts.map((text, i) => ({
    kind: "bot",
    authors: [`bot:${word.id}:${i}`],
    text,
  }));
  return [...humanOptions, ...botOptions];
}

function shuffle(arr, rng) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/**
 * Seal one word: merge human submissions, fill with bot decoys, add the
 * truth, shuffle, and letter the options (a, b, c...) — same shape as Cocky
 * Monk's buildOptions.
 */
export function sealWord({ word, submissions, fakeDefsPool, rng, targetCount = OPTIONS.targetPoolSize }) {
  const { options: humanOptions, closeMatches } = mergeSubmissions({ truth: word.definition, submissions });
  const filled = fillWithBotDecoys({ word, humanOptions, fakeDefsPool, targetCount, rng });
  const withTruth = [...filled, { kind: "truth", authors: [], text: word.definition }];
  const options = shuffle(withTruth, rng);
  options.forEach((o, i) => { o.id = String.fromCharCode(97 + i); });
  return { options, closeMatches };
}

// A guesser never sees an option they authored themselves — same fairness
// rule as Cocky Monk's visibleOptionsFor (you can't rule out your own bluff
// by recognizing it).
export function visibleOptionsFor(options, userId) {
  return options.filter((o) => !o.authors.includes(userId));
}

export function isCorrectChoice(options, choiceId) {
  const opt = options.find((o) => o.id === choiceId);
  return opt?.kind === "truth";
}

/**
 * Points earned by authors whose submissions fooled a guesser, for one
 * word's sealed options. Identical submissions split like Cocky Monk's
 * dobbeltreff-adjacent merge: ceil(votes / authors.length) each, but every
 * author is credited the full vote count for display purposes.
 */
export function scoreFooledVotes({ options, guesses, voteReceivedPoints }) {
  const deltas = new Map(); // userId -> points
  const fooledCounts = new Map(); // userId -> times someone picked their bluff
  const votesByOption = new Map();
  for (const g of guesses) {
    if (!votesByOption.has(g.choiceId)) votesByOption.set(g.choiceId, []);
    votesByOption.get(g.choiceId).push(g.userId);
  }
  for (const opt of options) {
    if (opt.kind !== "human") continue;
    const voters = votesByOption.get(opt.id) ?? [];
    if (!voters.length) continue;
    const share = Math.ceil((voters.length * voteReceivedPoints) / opt.authors.length);
    for (const author of opt.authors) {
      deltas.set(author, (deltas.get(author) ?? 0) + share);
      fooledCounts.set(author, (fooledCounts.get(author) ?? 0) + voters.length);
    }
  }
  return { deltas, fooledCounts };
}

/** Bonus points for each user whose written submission matched the truth. */
export function scoreCloseMatches(closeMatches, closeMatchBonus) {
  const deltas = new Map();
  for (const userId of closeMatches) {
    deltas.set(userId, (deltas.get(userId) ?? 0) + closeMatchBonus);
  }
  return deltas;
}

/**
 * A single day's guess results (however many were actually guessed) -> points.
 * One lookup by total correct count — see config.js SCORING.guessScoreByCorrectCount
 * and README.md "Scoring" for why this table's shape is deliberate (negative
 * at 0, breakeven at 1, real reward starting at 2).
 */
export function scoreGuesses(results, { guessScoreByCorrectCount }) {
  const correctCount = results.filter(Boolean).length;
  const idx = Math.min(correctCount, guessScoreByCorrectCount.length - 1);
  return { points: guessScoreByCorrectCount[idx], correctCount };
}
