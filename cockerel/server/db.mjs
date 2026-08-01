// db.mjs — file-backed JSON store + the daily rollover orchestration. This is
// the ONE impure module allowed to touch Date.now()/the filesystem; it calls
// only pure functions from js/engine.js, js/rating.js, js/decoys.js.
//
// Batch lifecycle (see CLAUDE.md / the approved plan for the full rationale):
//   batch(D) created at the transition INTO day D. Write window = day D.
//   batch(D) sealed at the transition into day D+1 (using day-D submissions —
//     zero submissions is fine, sealWord fills entirely from bot decoys, which
//     is how a brand-new game can already offer "yesterday's words" on day 1;
//     see the bootstrap case in ensureToday). Guess window = day D+1.
//   batch(D)'s WRITERS are credited once its guess window (day D+1) closes,
//     at the transition into day D+2 — fooled votes/close-match bonus can't
//     be known any earlier than that. See settleBatch.
// A GUESSER, unlike a writer, needs nothing from the future: correctness is
// known the instant they guess. So guess points are credited IMMEDIATELY,
// the moment a user's 3rd guess for the day lands (see submitGuess) — no
// settlement pass needed for that half at all.
// So every transition into a new day N does two things for L = N-1:
//   1. seal batch(L)          (using L's submissions)
//   2. settle batch(L-1)      (writer credit only — see settleBatch)
//   3. draw batch(N)          (new write day)
// This makes each transition self-contained and naturally idempotent: it only
// ever runs once per day, guarded by "does batch(N) already exist?".
//
// Streak vs. rating, two different day-sets (see js/rating.js top comment):
// participation is marked the instant someone writes or guesses ("streak =
// at least submitting or guessing," not doing all 6); rating points for that
// same day only land later, when settlement computes them. Settlement reads
// the ALREADY-RECORDED participation streak to size that day's % bonus —
// see js/rating.js streakEndingAt.
//
// -- Dual-language gameplay (see cockerel/CLAUDE.md "Dual-language
// gameplay") -----------------------------------------------------------
// Every batch/submission/guess carries a `lang` field (js/config.js LANGS).
// The day-advance TIMELINE (dayKey, UTC-midnight rollover) is shared/global
// across languages — both roll forward together, every request, regardless
// of whether anyone has actually enabled a given language yet (see
// ensureToday below: it's simplest and most robust for both languages'
// batch histories to always exist in lockstep, rather than lazily
// bootstrapping a language's history the first time someone opts into it).
// Rating/streak/leaderboard rank are tracked SEPARATELY per language — see
// the profile shape below — a deliberate choice (not a combined score) so a
// Norwegian-only player's numbers are entirely about Norwegian, unaffected
// by English existing.
//
// Profile shape: db.profiles[userId] = { displayName, device?, enabledLangs:
// ["no", ...], langs: { no: <freshProfile() shape>, en: <freshProfile()
// shape> } } — enabledLangs is which languages this user has opted into
// (onboarding's initial choice, extendable later via settings); langs[lang]
// only exists once that language has actually been used at least once
// (created lazily by ensureLangProfile, not eagerly for every LANGS entry).
// db.dayResults[userId] is now { no: <result>, en: <result> } (was flat).
// db.botLeaderboard is now { no: [...], en: [...] } (was a flat array).
// db.identities (Google account -> userId) and db.devClock stay
// global/shared — one account, one simulated "now," regardless of which
// languages that account plays.
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  dayKeyFromDate, addDays, pickDailyWords, sealWord, scoreFooledVotes,
  scoreCloseMatches, scoreGuesses, visibleOptionsFor, isCorrectChoice, isValidSubmission,
  voteShareByOption, displayVoteDistribution,
} from "../js/engine.js";
import {
  freshProfile, creditPoints, markParticipated, streakEndingAt, streakBonusPct,
  applyStreakBonus, currentRating, currentStreak, hasUnseenResult, markResultSeen,
} from "../js/rating.js";
import { LANG_PROFILES } from "../js/decoys.js";
import { loadWords, loadFakeDefs, wordById } from "../js/words.js";
import { OPTIONS, SCORING, BATCH, LEADERBOARD, HINT, LANGS } from "../js/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// Overridable so server/dev-server.test.mjs can point a spawned server at an
// isolated scratch directory instead of the real server/data/ — unset in
// every real deployment (fly.toml/fly.staging.toml don't set it), so this
// changes nothing about where a live instance actually stores data.
const DATA_DIR = process.env.COCKEREL_DATA_DIR || path.join(here, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");

// Exported so Tools/simulate-day.mjs's standalone in-memory db starts from
// the exact same shape instead of a hand-duplicated copy that can silently
// drift out of sync (it once did — missing devClock/identities).
export function freshDb() {
  return { batches: [], submissions: [], guesses: [], profiles: {}, dayResults: {}, devClock: null, identities: {} };
}

/**
 * One-time, idempotent shape upgrade for data written before dual-language
 * support existed: a batch/submission/guess with no `lang` was always
 * Norwegian (the only language that existed), so it's tagged "no". A
 * profile with no `.langs` had its rating fields directly at the top level
 * (the exact freshProfile() shape) — that becomes langs.no, with
 * enabledLangs: ["no"] (that's the only language that user has ever
 * played, so it's the only one that should show up for them post-migration).
 * A dayResults[userId] with no per-lang keys becomes { no: <that result> }.
 * A flat-array botLeaderboard becomes { no: <that array> }.
 */
function migrateToMultiLang(db) {
  for (const b of db.batches) if (!b.lang) b.lang = "no";
  for (const s of db.submissions) if (!s.lang) s.lang = "no";
  for (const g of db.guesses) if (!g.lang) g.lang = "no";
  for (const userId of Object.keys(db.profiles)) {
    const p = db.profiles[userId];
    if (!p.langs) {
      const { device, ...rest } = p; // rest keeps displayName + every freshProfile() field
      db.profiles[userId] = { displayName: p.displayName, ...(device ? { device } : {}), enabledLangs: ["no"], langs: { no: rest } };
    }
  }
  for (const userId of Object.keys(db.dayResults)) {
    const r = db.dayResults[userId];
    if (r && !("no" in r) && !("en" in r)) db.dayResults[userId] = { no: r };
  }
  if (Array.isArray(db.botLeaderboard)) db.botLeaderboard = { no: db.botLeaderboard };
}

export async function loadDb() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    if (existsSync(SEED_FILE)) await copyFile(SEED_FILE, DB_FILE);
    else await writeFile(DB_FILE, JSON.stringify(freshDb(), null, 2));
  }
  const db = JSON.parse(await readFile(DB_FILE, "utf8"));
  if (!("devClock" in db)) db.devClock = null; // tolerate an older seed shape
  if (!("identities" in db)) db.identities = {}; // tolerate a pre-Google-Sign-In seed shape
  migrateToMultiLang(db);
  return db;
}

export async function saveDb(db) {
  await writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

/**
 * The "now" the server should act as if it is. Prefers the dev-toolbar's
 * clock override once one has been set (see advanceDay) — that override is
 * append-only (see advanceDay), so this can only ever move forward, never
 * backward, even across server restarts.
 */
export function currentNow(db) {
  return db.devClock ? new Date(`${db.devClock}T12:00:00Z`) : new Date();
}

function findBatch(db, dayKey, lang) {
  return db.batches.find((b) => b.dayKey === dayKey && b.lang === lang) ?? null;
}

/** Global, lang-agnostic "what's the latest day any batch exists for" — safe
 * because ensureToday always advances every language in lockstep (see its
 * top comment), so every language's own latest batch day agrees with this.
 * Used only by dev-toolbar-facing code that doesn't care which language. */
function latestBatchDayKey(db) {
  return db.batches.reduce((max, b) => (b.dayKey > max ? b.dayKey : max), db.batches[0].dayKey);
}

function latestBatchDayKeyForLang(db, lang) {
  const batches = db.batches.filter((b) => b.lang === lang);
  return batches.reduce((max, b) => (b.dayKey > max ? b.dayKey : max), batches[0].dayKey);
}

function recentlyUsedWordIds(db, beforeDayKey, lang) {
  const cutoff = addDays(beforeDayKey, -BATCH.recentlyUsedWindowDays);
  return db.batches
    .filter((b) => b.lang === lang && b.dayKey >= cutoff && b.dayKey < beforeDayKey)
    .flatMap((b) => b.wordIds);
}

function sealBatch(db, allWords, fakeDefsPool, dayKey, lang, rng) {
  const batch = findBatch(db, dayKey, lang);
  if (!batch || batch.sealedAt) return;
  const subsForBatch = db.submissions.filter((s) => s.dayKey === dayKey && s.lang === lang);
  batch.options = {};
  batch.closeMatches = {};
  for (const wordId of batch.wordIds) {
    const word = wordById(allWords, wordId);
    const submissions = subsForBatch.filter((s) => s.wordId === wordId).map((s) => ({ userId: s.userId, text: s.text }));
    const { options, closeMatches } = sealWord({
      word, submissions, fakeDefsPool, rng, targetCount: OPTIONS.targetPoolSize, langProfile: LANG_PROFILES[lang],
    });
    batch.options[wordId] = options;
    batch.closeMatches[wordId] = closeMatches;
  }
  batch.sealedAt = dayKey;
}

function getProfile(db, userId) {
  return db.profiles[userId] ?? null;
}

// Box-Muller: one standard-normal sample from two uniform ones.
function standardNormal(rng) {
  const u1 = Math.max(rng(), Number.EPSILON); // guard log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Generate the fixed bot-rating pool ONCE per language — see config.js LEADERBOARD. */
function ensureBotLeaderboard(db, lang, rng) {
  if (!db.botLeaderboard) db.botLeaderboard = {};
  if (db.botLeaderboard[lang]) return;
  db.botLeaderboard[lang] = Array.from({ length: LEADERBOARD.botCount }, () => {
    const raw = LEADERBOARD.botMean + standardNormal(rng) * LEADERBOARD.botStdDev;
    return Math.round(Math.min(LEADERBOARD.botMax, Math.max(LEADERBOARD.botMin, raw)));
  });
}

/** 1-based rank among every real profile's current rating IN THIS LANGUAGE + that language's bot pool. */
function computeRank(db, myRating, lang) {
  const allRatings = [
    ...Object.values(db.profiles)
      .map((p) => (p.langs?.[lang] ? currentRating(p.langs[lang]) : null))
      .filter((r) => r !== null),
    ...(db.botLeaderboard?.[lang] ?? []),
  ];
  return 1 + allRatings.filter((r) => r > myRating).length;
}

/** Ensures the identity-level profile shell exists — displayName/device/
 * enabledLangs/langs — but does NOT enable or create any language's rating
 * track by itself; see ensureLangProfile for that. */
function ensureProfile(db, userId, displayName, device) {
  if (!db.profiles[userId]) db.profiles[userId] = { displayName, enabledLangs: [], langs: {} };
  // `device` is a bonus field bolted onto the stored profile, deliberately
  // NOT part of freshProfile()'s shape in js/rating.js — that shape is
  // vector-tested (js/engine.test.mjs / js/vectors.json) and has nothing to
  // do with device tracking. Updated on every call, so it reflects the most
  // recently seen device, not the first.
  if (device) db.profiles[userId] = { ...db.profiles[userId], device };
  return db.profiles[userId];
}

/** Lazily creates that language's rating/streak track (freshProfile()) the
 * first time it's actually used — NOT gated on enabledLangs, since a
 * language a user later disables in settings must keep crediting any
 * already-in-flight settlement for work they did while it was enabled. */
function ensureLangProfile(db, userId, lang) {
  const profile = db.profiles[userId];
  if (!profile.langs[lang]) profile.langs[lang] = freshProfile(profile.displayName);
  return profile.langs[lang];
}

/** Settings-panel toggle: which languages this user currently wants to play.
 * Rejects emptying the list to zero — there must always be at least one. */
export function setEnabledLangs(db, userId, langs) {
  const filtered = Array.isArray(langs) ? langs.filter((l) => LANGS.includes(l)) : [];
  if (!filtered.length) return { ok: false, error: "at_least_one_lang_required" };
  if (!db.profiles[userId]) return { ok: false, error: "no_such_user" };
  db.profiles[userId].enabledLangs = filtered;
  for (const lang of filtered) ensureLangProfile(db, userId, lang);
  return { ok: true, enabledLangs: filtered };
}

function settleBatch(db, allWords, settledAsOfDayKey, writeDayKey, lang) {
  const batch = findBatch(db, writeDayKey, lang);
  if (!batch || !batch.sealedAt || batch.settledAt) return;
  const guessDayKey = addDays(writeDayKey, 1);
  const guessesForBatch = db.guesses.filter((g) => g.dayKey === guessDayKey && g.lang === lang);

  // Guessers are NOT credited here — correctness is known the instant they
  // guess, so submitGuess credits them immediately (see there). This pass is
  // writers only: fooled votes + close-match bonus, which genuinely can't be
  // known before the guess window above has closed.
  const writerDeltas = new Map();
  const fooledByWordByUser = new Map();
  for (const wordId of batch.wordIds) {
    const options = batch.options[wordId];
    const guessesForWord = guessesForBatch.filter((g) => g.wordId === wordId);
    const { deltas, fooledCounts } = scoreFooledVotes({
      options, guesses: guessesForWord, bluffBaseK: SCORING.bluffBaseK, bluffExponent: SCORING.bluffExponent,
    });
    for (const [userId, pts] of deltas) writerDeltas.set(userId, (writerDeltas.get(userId) ?? 0) + pts);
    for (const [userId, count] of fooledCounts) {
      if (!fooledByWordByUser.has(userId)) fooledByWordByUser.set(userId, []);
      fooledByWordByUser.get(userId).push({ wordId, count });
    }
    const closeDeltas = scoreCloseMatches(batch.closeMatches[wordId] ?? [], SCORING.closeMatchBonus);
    for (const [userId, pts] of closeDeltas) writerDeltas.set(userId, (writerDeltas.get(userId) ?? 0) + pts);
  }
  for (const [userId, basePoints] of writerDeltas) {
    ensureProfile(db, userId, userId);
    const langProfile = ensureLangProfile(db, userId, lang);
    const pct = streakBonusPct(streakEndingAt(langProfile.participatedDays, writeDayKey));
    const points = applyStreakBonus(basePoints, pct);
    db.profiles[userId].langs[lang] = creditPoints(langProfile, { dayKey: writeDayKey, points });
    recordDayResult(db, userId, lang, settledAsOfDayKey, {
      writeDayKey, fooledByWord: fooledByWordByUser.get(userId) ?? [],
      writeBasePoints: basePoints, writePoints: points, writeStreakPct: pct,
    });
  }

  batch.settledAt = settledAsOfDayKey;
}

function recordDayResult(db, userId, lang, asOfDayKey, fields) {
  if (!db.dayResults[userId]) db.dayResults[userId] = {};
  const prev = db.dayResults[userId][lang];
  const carry = prev && prev.asOfDayKey === asOfDayKey ? prev : { asOfDayKey };
  db.dayResults[userId][lang] = { ...carry, ...fields, asOfDayKey };
}

function ensureTodayForLang(db, todayKey, lang, rng) {
  const allWords = loadWords(lang);
  const fakeDefsPool = loadFakeDefs(lang);
  ensureBotLeaderboard(db, lang, rng); // self-healing: runs once per lang, no-ops after

  if (!db.batches.some((b) => b.lang === lang)) {
    // Bootstrap: a brand-new game (or a language's very first day, if it's
    // added to LANGS later) seeds an already-sealed "yesterday" batch (zero
    // human submissions, fully bot-filled decoys) so day-1 users always have
    // something to guess.
    const yesterdayKey = addDays(todayKey, -1);
    const { words: yWords } = pickDailyWords(allWords, [], BATCH.wordsPerDay, rng);
    db.batches.push({ dayKey: yesterdayKey, lang, wordIds: yWords.map((w) => w.id), sealedAt: null, settledAt: null });
    sealBatch(db, allWords, fakeDefsPool, yesterdayKey, lang, rng);

    const { words } = pickDailyWords(allWords, yWords.map((w) => w.id), BATCH.wordsPerDay, rng);
    db.batches.push({ dayKey: todayKey, lang, wordIds: words.map((w) => w.id), sealedAt: null, settledAt: null });
    return;
  }

  let latest = latestBatchDayKeyForLang(db, lang);
  while (latest < todayKey) {
    const nextKey = addDays(latest, 1);
    sealBatch(db, allWords, fakeDefsPool, latest, lang, rng);
    const priorWriteDay = addDays(latest, -1);
    if (findBatch(db, priorWriteDay, lang)) settleBatch(db, allWords, nextKey, priorWriteDay, lang);
    if (!findBatch(db, nextKey, lang)) {
      const used = recentlyUsedWordIds(db, nextKey, lang);
      const { words } = pickDailyWords(allWords, used, BATCH.wordsPerDay, rng);
      db.batches.push({ dayKey: nextKey, lang, wordIds: words.map((w) => w.id), sealedAt: null, settledAt: null });
    }
    latest = nextKey;
  }
}

/** Advance the world state to `now`, one day at a time, idempotently — once
 * per language (see top comment: both languages' batch histories always
 * exist in lockstep, regardless of adoption). */
export function ensureToday(db, now) {
  const todayKey = dayKeyFromDate(now);
  const rng = Math.random;
  for (const lang of LANGS) ensureTodayForLang(db, todayKey, lang, rng);
  return db;
}

// -- read/write API used by dev-server.mjs -----------------------------------

function profileSnapshot(db, profile, lang) {
  const langProfile = profile.langs[lang];
  const streakDays = currentStreak(langProfile.participatedDays);
  const rating = currentRating(langProfile);
  return {
    displayName: profile.displayName,
    rating,
    rank: computeRank(db, rating, lang),
    streakDays,
    streakBonusPct: streakBonusPct(streakDays),
  };
}

function getTodayStateForLang(db, userId, lang) {
  const allWords = loadWords(lang);
  const todayKey = latestBatchDayKeyForLang(db, lang);
  const today = findBatch(db, todayKey, lang);
  const yesterdayKey = addDays(todayKey, -1);
  const yesterday = findBatch(db, yesterdayKey, lang);

  const writeWords = today.wordIds.map((id) => {
    const word = wordById(allWords, id);
    const already = db.submissions.some((s) => s.dayKey === todayKey && s.lang === lang && s.wordId === id && s.userId === userId);
    return { wordId: id, word: word.word, alreadySubmitted: already };
  });

  let guessWords = [];
  if (yesterday?.sealedAt) {
    guessWords = yesterday.wordIds.map((id) => {
      const word = wordById(allWords, id);
      const existingGuess = db.guesses.find((g) => g.dayKey === todayKey && g.lang === lang && g.wordId === id && g.userId === userId);
      const options = visibleOptionsFor(yesterday.options[id], userId).map((o) => ({ id: o.id, text: o.text }));
      return {
        wordId: id, word: word.word,
        alreadyGuessed: Boolean(existingGuess),
        choiceId: existingGuess?.choiceId ?? null,
        correct: existingGuess?.correct ?? null,
        options,
      };
    });
  }

  const profile = getProfile(db, userId);
  const langProfile = profile?.langs?.[lang];
  const result = db.dayResults[userId]?.[lang];
  const unseen = langProfile && result ? hasUnseenResult(langProfile, result.asOfDayKey) : false;

  return {
    todayKey, writeWords, guessWords,
    profile: langProfile ? profileSnapshot(db, profile, lang) : null,
    recap: unseen ? result : null,
  };
}

/**
 * Consolidated, per-language state for whichever languages this user has
 * enabled — one round trip covers everything the client's entry-routing
 * logic needs (see js/ui.js routeToCurrentScreen), instead of N separate
 * fetches. `enabledLangs` is echoed back so the client always has the
 * authoritative current list (e.g. right after a settings toggle).
 */
export function getTodayState(db, userId) {
  const profile = getProfile(db, userId);
  const enabledLangs = profile?.enabledLangs ?? [];
  const todayKey = latestBatchDayKey(db);
  const byLang = {};
  for (const lang of enabledLangs) byLang[lang] = getTodayStateForLang(db, userId, lang);
  return { enabledLangs, todayKey, byLang };
}

export function submitDefinition(db, { userId, wordId, text, lang }) {
  const todayKey = latestBatchDayKeyForLang(db, lang);
  const today = findBatch(db, todayKey, lang);
  if (!today.wordIds.includes(wordId)) return { ok: false, error: "not_todays_word" };
  if (!isValidSubmission(text)) return { ok: false, error: "empty" };
  if (db.submissions.some((s) => s.dayKey === todayKey && s.lang === lang && s.wordId === wordId && s.userId === userId)) {
    return { ok: false, error: "already_submitted" };
  }
  db.submissions.push({ dayKey: todayKey, lang, wordId, userId, text });
  ensureProfile(db, userId, userId);
  const langProfile = ensureLangProfile(db, userId, lang);
  db.profiles[userId].langs[lang] = markParticipated(langProfile, todayKey);
  return { ok: true, profile: profileSnapshot(db, db.profiles[userId], lang) };
}

// Full per-word breakdown for the score step's expandable review — every
// option, which one was truth, which one (if any) this user picked, and the
// SAME capped/rounded vote distribution the live "hint" shows (reused for
// consistency, not the true share — see displayVoteDistribution). Shown only
// after the round is fully resolved, so there's no fairness reason left to
// hide WHICH option is which (unlike visibleOptionsFor at guess time) — but
// the percentages themselves still go through the same display cap.
function buildGuessReview(allWords, yesterday, byWord, allGuesses, todayKey, lang) {
  return yesterday.wordIds.map((id) => {
    const g = byWord.get(id);
    const word = wordById(allWords, id);
    const guessesForWord = allGuesses.filter((x) => x.dayKey === todayKey && x.lang === lang && x.wordId === id);
    const shares = voteShareByOption(yesterday.options[id], guessesForWord);
    const pctById = new Map(displayVoteDistribution(shares, HINT).map((d) => [d.id, d.pct]));
    return {
      wordId: id,
      word: word.word,
      correct: g.correct,
      options: yesterday.options[id].map((o) => ({
        id: o.id, text: o.text, isTruth: o.kind === "truth", isMine: o.id === g.choiceId,
        pct: pctById.get(o.id) ?? 0,
      })),
    };
  });
}

/**
 * Fires exactly once per user per guess-day per language, the moment the 3rd
 * of today's guess "slots" is filled — by a real guess (submitGuess) OR a
 * timeout skip (skipGuess), whichever fills it. Returns null while slots
 * remain open.
 */
function maybeFinalizeGuessing(db, allWords, userId, todayKey, yesterday, lang) {
  const myGuesses = db.guesses.filter((g) => g.dayKey === todayKey && g.lang === lang && g.userId === userId && yesterday.wordIds.includes(g.wordId));
  if (myGuesses.length !== yesterday.wordIds.length) return null;
  const byWord = new Map(myGuesses.map((g) => [g.wordId, g]));
  const results = yesterday.wordIds.map((id) => byWord.get(id).correct);
  const { points: basePoints, correctCount } = scoreGuesses(results, {
    guessScoreByCorrectCount: SCORING.guessScoreByCorrectCount,
  });
  const langProfile = db.profiles[userId].langs[lang];
  const pct = streakBonusPct(streakEndingAt(langProfile.participatedDays, todayKey));
  const points = applyStreakBonus(basePoints, pct);
  db.profiles[userId].langs[lang] = creditPoints(langProfile, { dayKey: todayKey, points });
  // Report the bonus % as 0 when it didn't actually apply (a penalty day is
  // never amplified — see applyStreakBonus) — showing "+10%" next to a
  // negative result would wrongly imply the bonus did something here.
  const effectivePct = basePoints > 0 ? pct : 0;
  return {
    correctCount, guessTotal: results.length, points, pct: effectivePct,
    profile: profileSnapshot(db, db.profiles[userId], lang),
    words: buildGuessReview(allWords, yesterday, byWord, db.guesses, todayKey, lang),
  };
}

export function submitGuess(db, { userId, wordId, choiceId, lang }) {
  const allWords = loadWords(lang);
  const todayKey = latestBatchDayKeyForLang(db, lang);
  const yesterdayKey = addDays(todayKey, -1);
  const yesterday = findBatch(db, yesterdayKey, lang);
  if (!yesterday?.sealedAt || !yesterday.wordIds.includes(wordId)) return { ok: false, error: "not_guessable" };
  if (db.guesses.some((g) => g.dayKey === todayKey && g.lang === lang && g.wordId === wordId && g.userId === userId)) {
    return { ok: false, error: "already_guessed" };
  }
  const options = yesterday.options[wordId];
  const visible = visibleOptionsFor(options, userId);
  if (!visible.some((o) => o.id === choiceId)) return { ok: false, error: "invalid_choice" };
  const correct = isCorrectChoice(options, choiceId);
  db.guesses.push({ dayKey: todayKey, lang, wordId, userId, choiceId, correct });
  ensureProfile(db, userId, userId);
  const langProfile = ensureLangProfile(db, userId, lang);
  db.profiles[userId].langs[lang] = markParticipated(langProfile, todayKey);

  // Correctness is knowable the instant this is guessed — nothing here waits
  // for a future event, unlike a writer's fooled-vote credit (see
  // settleBatch). This is what lets the UI show an immediate score step.
  const guessResult = maybeFinalizeGuessing(db, allWords, userId, todayKey, yesterday, lang);
  return { ok: true, correct, guessResult, profile: profileSnapshot(db, db.profiles[userId], lang) };
}

/**
 * The client calls this when a word's guess timer runs out — "Du rakk ikke
 * å gjette." Fills the same slot a real guess would (so the round can still
 * complete and finalize), scored as incorrect, but does NOT mark
 * participation: per the design guardrail, the streak is earned by actually
 * writing or guessing, not by having a word merely time out on you.
 */
export function skipGuess(db, { userId, wordId, lang }) {
  const allWords = loadWords(lang);
  const todayKey = latestBatchDayKeyForLang(db, lang);
  const yesterdayKey = addDays(todayKey, -1);
  const yesterday = findBatch(db, yesterdayKey, lang);
  if (!yesterday?.sealedAt || !yesterday.wordIds.includes(wordId)) return { ok: false, error: "not_guessable" };
  if (db.guesses.some((g) => g.dayKey === todayKey && g.lang === lang && g.wordId === wordId && g.userId === userId)) {
    return { ok: false, error: "already_guessed" };
  }
  ensureProfile(db, userId, userId);
  ensureLangProfile(db, userId, lang);
  db.guesses.push({ dayKey: todayKey, lang, wordId, userId, choiceId: null, correct: false, skipped: true });
  const guessResult = maybeFinalizeGuessing(db, allWords, userId, todayKey, yesterday, lang);
  return { ok: true, guessResult, profile: profileSnapshot(db, db.profiles[userId], lang) };
}

/**
 * The "hint" button's data: the SAME capped/rounded distribution as the
 * post-guess review (see buildGuessReview), but fetched on demand mid-guess,
 * before this user has chosen. Computed over ALL of today's guesses for this
 * word so far (across every guesser, not just this one) — options this user
 * authored themselves are dropped from the response, same fairness rule as
 * visibleOptionsFor at guess time, even though only a percentage (not text)
 * would leak here.
 */
export function getVoteDistribution(db, userId, wordId, lang) {
  const todayKey = latestBatchDayKeyForLang(db, lang);
  const yesterdayKey = addDays(todayKey, -1);
  const yesterday = findBatch(db, yesterdayKey, lang);
  if (!yesterday?.sealedAt || !yesterday.wordIds.includes(wordId)) return { ok: false, error: "not_guessable" };
  const options = yesterday.options[wordId];
  const guessesForWord = db.guesses.filter((g) => g.dayKey === todayKey && g.lang === lang && g.wordId === wordId);
  if (!guessesForWord.length) return { ok: true, distribution: [], noData: true };
  const shares = voteShareByOption(options, guessesForWord);
  const visibleIds = new Set(visibleOptionsFor(options, userId).map((o) => o.id));
  const distribution = displayVoteDistribution(shares, HINT).filter((d) => visibleIds.has(d.id));
  return { ok: true, distribution };
}

/**
 * Wipes ONLY this userId's own data (profile — every language's track at
 * once, day-result, submissions, guesses, and any Google account linked to
 * it) — safe to expose on a shared instance, since it never touches anyone
 * else's profile or progress. A bluff this user already wrote into an
 * already-SEALED batch keeps its authorship there untouched (rewriting
 * frozen option pools would be its own can of worms) — worst case a stray
 * fooled-vote credit later recreates a fresh, empty profile under the old
 * userId, which is harmless since no browser holds that identity anymore.
 * The identity unlink matters more than that: without it, a "deleted"
 * account would quietly come back to life the next time that same Google
 * account signs in (linkGoogleIdentity would resurrect the old userId) —
 * this is the actual delete-my-account path, so it must sever the link, not
 * just clear the local data.
 */
export function resetPlayer(db, userId) {
  delete db.profiles[userId];
  delete db.dayResults[userId];
  db.submissions = db.submissions.filter((s) => s.userId !== userId);
  db.guesses = db.guesses.filter((g) => g.userId !== userId);
  for (const key of Object.keys(db.identities)) {
    if (db.identities[key] === userId) delete db.identities[key];
  }
  return { ok: true };
}

/**
 * Links a Google account (`sub`, already verified by server/auth.mjs) to a
 * userId. If that Google account is already linked to a DIFFERENT userId —
 * e.g. signing in again from a second browser/device — the EXISTING userId
 * wins and the caller adopts it, so the same person always lands on one
 * profile instead of forking a new one per device. Otherwise `sub` gets
 * linked to whatever userId the caller is currently using (its existing
 * anonymous profile, progress and all, across every language). Either way
 * `ensureProfile`'s won't-overwrite-an-existing-displayName rule applies
 * unchanged, so linking never silently renames a profile to the Google
 * account's real name. Returns identity-level fields only (no rating
 * numbers, which don't have a single "the" value anymore across languages)
 * — the client re-fetches per-language state via getTodayState right after.
 */
export function linkGoogleIdentity(db, { sub, userId, displayName, device }) {
  const key = `google:${sub}`;
  const previouslyLinkedUserId = db.identities[key];
  const finalUserId = previouslyLinkedUserId ?? userId;
  // Captured BEFORE ensureProfile creates one — this is what lets the client
  // tell "first time signing in, ever" (show How-to-play + Welcome) apart
  // from "signing back in on a new device" (just resume), since after a
  // reload localStorage always looks populated either way.
  const isNewProfile = !db.profiles[finalUserId];
  db.identities[key] = finalUserId;
  const profile = ensureProfile(db, finalUserId, displayName, device);
  return {
    userId: finalUserId,
    displayName: profile.displayName,
    enabledLangs: profile.enabledLangs,
    linkedExisting: Boolean(previouslyLinkedUserId),
    isNewProfile,
  };
}

/**
 * Full reset back to a brand-new-deployment state: every profile (all
 * languages), submission, guess, day-result, and Google identity link, plus
 * the batch history, dev clock, and cached bot leaderboards. The next
 * `ensureToday` bootstraps fresh exactly like a first-ever boot (see that
 * function's bootstrap branch) — this is NOT a per-user reset (see
 * `resetPlayer`), it's for the one-time "require sign-in from now on, wipe
 * everyone who played anonymously before that" cutover. Gated behind
 * ADMIN_TOKEN in dev-server.mjs, same posture as the rest of the admin
 * surface.
 */
export function wipeAllUsers(db) {
  db.batches = [];
  db.submissions = [];
  db.guesses = [];
  db.profiles = {};
  db.dayResults = {};
  db.identities = {};
  db.devClock = null;
  delete db.botLeaderboard;
  return { ok: true };
}

export function ensureProfileFor(db, userId, displayName, device) {
  ensureProfile(db, userId, displayName, device);
  return db.profiles[userId];
}

export function ackRecap(db, userId, lang) {
  const profile = getProfile(db, userId);
  const result = db.dayResults[userId]?.[lang];
  if (!profile?.langs?.[lang] || !result) return;
  db.profiles[userId].langs[lang] = markResultSeen(profile.langs[lang], result.asOfDayKey);
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Read-only admin dashboard data — see server/dev-server.mjs's token-gated
 * /api/admin/stats. Two deliberately different shapes of "per day":
 *  - `days`: fully RETROACTIVE, computed fresh from db.submissions/db.guesses
 *    (which already carry dayKey + lang), one row per (dayKey, lang) pair —
 *    accurate for every day/language combo that ever happened, no new
 *    tracking needed. "Real users (cumulative)" uses each profile's
 *    EARLIEST participatedDays entry FOR THAT LANGUAGE as its signup day for
 *    that language, also retroactive; bots are a fixed count per language
 *    (LEADERBOARD.botCount), not per-day.
 *  - `players`: current, live snapshot only (rating/streak/device), one row
 *    per (userId, enabled language) — there is no historical per-day rating
 *    ever stored (ratingSum is a running total, see js/rating.js), so a true
 *    day-by-day points/streak LOG isn't reconstructable without adding new
 *    forward-only tracking. Deliberately not added here to keep this
 *    additive/low-risk — revisit explicitly if real historical trends (not
 *    just "as of now") are needed later.
 * Kept intentionally minimal for dual-language: a `lang` column added to the
 * existing shapes, not a dashboard redesign.
 */
export function computeAdminStats(db) {
  const dayKeys = [...new Set([...db.submissions.map((s) => s.dayKey), ...db.guesses.map((g) => g.dayKey)])].sort();

  const days = [];
  for (const dayKey of dayKeys) {
    for (const lang of LANGS) {
      const subsToday = db.submissions.filter((s) => s.dayKey === dayKey && s.lang === lang);
      const guessesToday = db.guesses.filter((g) => g.dayKey === dayKey && g.lang === lang);
      const writers = new Set(subsToday.map((s) => s.userId));
      const guessers = new Set(guessesToday.map((g) => g.userId));
      const dau = new Set([...writers, ...guessers]).size;

      const totalGuesses = guessesToday.length;
      const correctGuesses = guessesToday.filter((g) => g.correct).length;

      const definitions = subsToday.length;
      const possibleDefinitionSlots = writers.size * BATCH.wordsPerDay;

      const realUsers = Object.values(db.profiles).filter((p) => {
        const days = p.langs?.[lang]?.participatedDays;
        return days?.length && days[0] <= dayKey;
      }).length;
      const botCount = (db.botLeaderboard?.[lang] ?? []).length;

      // Skip rows with genuinely nothing to report for this lang/day, rather
      // than padding the table with all-zero noise for a language nobody
      // touched that day.
      if (!dau && !totalGuesses && !definitions) continue;

      days.push({
        dayKey, lang, dau, totalGuesses, correctGuesses,
        correctGuessPct: totalGuesses ? round1((correctGuesses / totalGuesses) * 100) : null,
        definitions, possibleDefinitionSlots,
        definitionCompletionPct: possibleDefinitionSlots ? round1((definitions / possibleDefinitionSlots) * 100) : null,
        realUsers, bots: botCount, botPct: round1((botCount / (botCount + realUsers)) * 100),
      });
    }
  }

  const players = Object.entries(db.profiles)
    .flatMap(([userId, p]) =>
      (p.enabledLangs ?? []).filter((lang) => p.langs?.[lang]).map((lang) => {
        const langProfile = p.langs[lang];
        const rating = currentRating(langProfile);
        return {
          userId, lang, displayName: p.displayName, rating,
          rank: computeRank(db, rating, lang),
          streakDays: currentStreak(langProfile.participatedDays),
          device: p.device ?? "unknown",
          lastActiveDayKey: langProfile.participatedDays[langProfile.participatedDays.length - 1] ?? null,
        };
      })
    )
    .sort((a, b) => b.rating - a.rating);

  const botCount = LANGS.reduce((sum, lang) => sum + (db.botLeaderboard?.[lang] ?? []).length, 0);
  return { generatedAt: new Date().toISOString(), botCount, days, players };
}

// -- dev-only test tools (see cockerel/CLAUDE.md) ----------------------
// Not gated behind a flag: this whole app is pre-launch, and these are the
// only way to test the write-today/guess-tomorrow loop without real users or
// real days. Revisit before any real release. Language-agnostic on purpose —
// the day-advance timeline and player list are both shared/global (see this
// file's top comment); which SCREEN a switched-to player/day lands on is
// entirely up to the client's own per-user language routing.

export function listDays(db) {
  return { days: [...new Set(db.batches.map((b) => b.dayKey))].sort(), current: latestBatchDayKey(db) };
}

export function listPlayers(db) {
  return Object.entries(db.profiles).map(([userId, p]) => ({ userId, displayName: p.displayName }));
}

/** Append-only: always advances exactly one day past the current latest —
 * there is no companion "go back" function, by design (see CLAUDE.md). */
export function advanceDay(db) {
  const nextKey = addDays(latestBatchDayKey(db), 1);
  db.devClock = nextKey;
  ensureToday(db, currentNow(db));
  return { todayKey: latestBatchDayKey(db) };
}
