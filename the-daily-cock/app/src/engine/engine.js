// GENERATED FILE — copied verbatim from the-daily-cock/js/engine.js by
// app/Tools/sync-engine.mjs. Do not hand-edit; re-run the script instead.

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
 * word's sealed options: bluffBaseK * fooledCount^bluffExponent, rounded — a
 * concave curve of the ABSOLUTE number of people fooled (not a share of some
 * total), so it means the same thing in a tiny game and a huge one. Fooling
 * 1 person always earns exactly bluffBaseK; each additional person fooled is
 * worth a little less than the last, but there's no ceiling — a bluff that
 * fools hundreds keeps earning more. See config.js SCORING and
 * BLUFF-SCENARIOS.md for the reasoning and worked examples. Identical
 * submissions still split their option's points like Cocky Monk's
 * dobbeltreff-adjacent merge: ceil(points / authors.length) each, but every
 * author is credited the full vote count in fooledCounts for display.
 */
export function scoreFooledVotes({ options, guesses, bluffBaseK, bluffExponent }) {
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
    const optionPoints = Math.round(bluffBaseK * Math.pow(voters.length, bluffExponent));
    const share = Math.ceil(optionPoints / opt.authors.length);
    for (const author of opt.authors) {
      deltas.set(author, (deltas.get(author) ?? 0) + share);
      fooledCounts.set(author, (fooledCounts.get(author) ?? 0) + voters.length);
    }
  }
  return { deltas, fooledCounts };
}

/**
 * Raw vote share per option out of everyone who has guessed this word so far
 * — the shared input to both the live "hint" and the post-guess review's
 * distribution. Real (uncapped) shares; see displayVoteDistribution for the
 * display-safe version actually shown on screen.
 */
export function voteShareByOption(options, guesses) {
  const counts = new Map(options.map((o) => [o.id, 0]));
  for (const g of guesses) {
    if (counts.has(g.choiceId)) counts.set(g.choiceId, counts.get(g.choiceId) + 1);
  }
  const total = guesses.length;
  return options.map((o) => ({
    id: o.id,
    pct: total ? (100 * counts.get(o.id)) / total : 0,
  }));
}

/**
 * Display-safe percentages for the hint / review distribution: caps any
 * single option's share at `capPct`, redistributing the overflow
 * proportionally across the options still under the cap (re-capping as
 * needed, since redistribution can itself push another option over), then
 * rounds to the nearest `roundToPct`. See config.js HINT for why a cap
 * exists at all — this is cosmetic only, never fed back into scoring.
 */
export function displayVoteDistribution(shares, { capPct, roundToPct }) {
  const working = shares.map((s) => ({ ...s }));
  let excess = 0;
  for (const s of working) {
    if (s.pct > capPct) { excess += s.pct - capPct; s.pct = capPct; }
  }
  let free = working.filter((s) => s.pct < capPct);
  let guard = 10; // options list is tiny (targetPoolSize); this converges in 1-2 passes
  while (excess > 0.01 && free.length && guard-- > 0) {
    const freeTotal = free.reduce((sum, s) => sum + s.pct, 0);
    let newExcess = 0;
    for (const s of free) {
      s.pct += freeTotal > 0 ? (excess * s.pct) / freeTotal : excess / free.length;
      if (s.pct > capPct) { newExcess += s.pct - capPct; s.pct = capPct; }
    }
    excess = newExcess;
    free = working.filter((s) => s.pct < capPct);
  }
  return working.map((s) => ({ id: s.id, pct: Math.round(s.pct / roundToPct) * roundToPct }));
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
