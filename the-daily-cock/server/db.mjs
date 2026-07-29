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
import { loadWords, loadFakeDefs, wordById } from "../js/words.js";
import { OPTIONS, SCORING, BATCH, LEADERBOARD, HINT } from "../js/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");

function freshDb() {
  return { batches: [], submissions: [], guesses: [], profiles: {}, dayResults: {}, devClock: null };
}

export async function loadDb() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    if (existsSync(SEED_FILE)) await copyFile(SEED_FILE, DB_FILE);
    else await writeFile(DB_FILE, JSON.stringify(freshDb(), null, 2));
  }
  const db = JSON.parse(await readFile(DB_FILE, "utf8"));
  if (!("devClock" in db)) db.devClock = null; // tolerate an older seed shape
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

function findBatch(db, dayKey) {
  return db.batches.find((b) => b.dayKey === dayKey) ?? null;
}

function latestBatchDayKey(db) {
  return db.batches.reduce((max, b) => (b.dayKey > max ? b.dayKey : max), db.batches[0].dayKey);
}

function recentlyUsedWordIds(db, beforeDayKey) {
  const cutoff = addDays(beforeDayKey, -BATCH.recentlyUsedWindowDays);
  return db.batches.filter((b) => b.dayKey >= cutoff && b.dayKey < beforeDayKey).flatMap((b) => b.wordIds);
}

function sealBatch(db, allWords, fakeDefsPool, dayKey, rng) {
  const batch = findBatch(db, dayKey);
  if (!batch || batch.sealedAt) return;
  const subsForBatch = db.submissions.filter((s) => s.dayKey === dayKey);
  batch.options = {};
  batch.closeMatches = {};
  for (const wordId of batch.wordIds) {
    const word = wordById(allWords, wordId);
    const submissions = subsForBatch.filter((s) => s.wordId === wordId).map((s) => ({ userId: s.userId, text: s.text }));
    const { options, closeMatches } = sealWord({ word, submissions, fakeDefsPool, rng, targetCount: OPTIONS.targetPoolSize });
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

/** Generate the fixed bot-rating pool ONCE — see config.js LEADERBOARD. */
function ensureBotLeaderboard(db, rng) {
  if (db.botLeaderboard) return;
  db.botLeaderboard = Array.from({ length: LEADERBOARD.botCount }, () => {
    const raw = LEADERBOARD.botMean + standardNormal(rng) * LEADERBOARD.botStdDev;
    return Math.round(Math.min(LEADERBOARD.botMax, Math.max(LEADERBOARD.botMin, raw)));
  });
}

/** 1-based rank among every real profile's current rating + the bot pool. */
function computeRank(db, myRating) {
  const allRatings = [
    ...Object.values(db.profiles).map((p) => currentRating(p)),
    ...(db.botLeaderboard ?? []),
  ];
  return 1 + allRatings.filter((r) => r > myRating).length;
}

function ensureProfile(db, userId, displayName) {
  if (!db.profiles[userId]) db.profiles[userId] = freshProfile(displayName);
  return db.profiles[userId];
}

function settleBatch(db, allWords, settledAsOfDayKey, writeDayKey) {
  const batch = findBatch(db, writeDayKey);
  if (!batch || !batch.sealedAt || batch.settledAt) return;
  const guessDayKey = addDays(writeDayKey, 1);
  const guessesForBatch = db.guesses.filter((g) => g.dayKey === guessDayKey);

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
    const profile = ensureProfile(db, userId, userId);
    const pct = streakBonusPct(streakEndingAt(profile.participatedDays, writeDayKey));
    const points = applyStreakBonus(basePoints, pct);
    db.profiles[userId] = creditPoints(profile, { dayKey: writeDayKey, points });
    recordDayResult(db, userId, settledAsOfDayKey, {
      writeDayKey, fooledByWord: fooledByWordByUser.get(userId) ?? [],
      writeBasePoints: basePoints, writePoints: points, writeStreakPct: pct,
    });
  }

  batch.settledAt = settledAsOfDayKey;
}

function recordDayResult(db, userId, asOfDayKey, fields) {
  const prev = db.dayResults[userId];
  const carry = prev && prev.asOfDayKey === asOfDayKey ? prev : { asOfDayKey };
  db.dayResults[userId] = { ...carry, ...fields, asOfDayKey };
}

/** Advance the world state to `now`, one day at a time, idempotently. */
export function ensureToday(db, now) {
  const allWords = loadWords();
  const fakeDefsPool = loadFakeDefs();
  const rng = Math.random;
  const todayKey = dayKeyFromDate(now);
  ensureBotLeaderboard(db, rng); // self-healing: runs once, no-ops after

  if (db.batches.length === 0) {
    // Bootstrap: a brand-new game seeds an already-sealed "yesterday" batch
    // (zero human submissions, fully bot-filled decoys) so day-1 users always
    // have something to guess — the request that made this necessary was
    // literally "I'm one of the first players, but gårsdagens ord should
    // still be there, filled by bots, until there are enough real writers."
    const yesterdayKey = addDays(todayKey, -1);
    const { words: yWords } = pickDailyWords(allWords, [], BATCH.wordsPerDay, rng);
    db.batches.push({ dayKey: yesterdayKey, wordIds: yWords.map((w) => w.id), sealedAt: null, settledAt: null });
    sealBatch(db, allWords, fakeDefsPool, yesterdayKey, rng);

    const { words } = pickDailyWords(allWords, yWords.map((w) => w.id), BATCH.wordsPerDay, rng);
    db.batches.push({ dayKey: todayKey, wordIds: words.map((w) => w.id), sealedAt: null, settledAt: null });
    return db;
  }

  let latest = latestBatchDayKey(db);
  while (latest < todayKey) {
    const nextKey = addDays(latest, 1);
    sealBatch(db, allWords, fakeDefsPool, latest, rng);
    const priorWriteDay = addDays(latest, -1);
    if (findBatch(db, priorWriteDay)) settleBatch(db, allWords, nextKey, priorWriteDay);
    if (!findBatch(db, nextKey)) {
      const used = recentlyUsedWordIds(db, nextKey);
      const { words } = pickDailyWords(allWords, used, BATCH.wordsPerDay, rng);
      db.batches.push({ dayKey: nextKey, wordIds: words.map((w) => w.id), sealedAt: null, settledAt: null });
    }
    latest = nextKey;
  }
  return db;
}

// -- read/write API used by dev-server.mjs -----------------------------------

function profileSnapshot(db, profile) {
  const streakDays = currentStreak(profile.participatedDays);
  const rating = currentRating(profile);
  return {
    displayName: profile.displayName,
    rating,
    rank: computeRank(db, rating),
    streakDays,
    streakBonusPct: streakBonusPct(streakDays),
  };
}

export function getTodayState(db, userId) {
  const allWords = loadWords();
  const todayKey = latestBatchDayKey(db);
  const today = findBatch(db, todayKey);
  const yesterdayKey = addDays(todayKey, -1);
  const yesterday = findBatch(db, yesterdayKey);

  const writeWords = today.wordIds.map((id) => {
    const word = wordById(allWords, id);
    const already = db.submissions.some((s) => s.dayKey === todayKey && s.wordId === id && s.userId === userId);
    return { wordId: id, word: word.word, alreadySubmitted: already };
  });

  let guessWords = [];
  if (yesterday?.sealedAt) {
    guessWords = yesterday.wordIds.map((id) => {
      const word = wordById(allWords, id);
      const existingGuess = db.guesses.find((g) => g.dayKey === todayKey && g.wordId === id && g.userId === userId);
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
  const result = db.dayResults[userId];
  const unseen = profile && result ? hasUnseenResult(profile, result.asOfDayKey) : false;

  return {
    todayKey, writeWords, guessWords,
    profile: profile ? profileSnapshot(db, profile) : null,
    recap: unseen ? result : null,
  };
}

export function submitDefinition(db, { userId, wordId, text }) {
  const todayKey = latestBatchDayKey(db);
  const today = findBatch(db, todayKey);
  if (!today.wordIds.includes(wordId)) return { ok: false, error: "not_todays_word" };
  if (!isValidSubmission(text)) return { ok: false, error: "empty" };
  if (db.submissions.some((s) => s.dayKey === todayKey && s.wordId === wordId && s.userId === userId)) {
    return { ok: false, error: "already_submitted" };
  }
  db.submissions.push({ dayKey: todayKey, wordId, userId, text });
  db.profiles[userId] = markParticipated(ensureProfile(db, userId, userId), todayKey);
  return { ok: true, profile: profileSnapshot(db, db.profiles[userId]) };
}

// Full per-word breakdown for the score step's expandable review — every
// option, which one was truth, which one (if any) this user picked, and the
// SAME capped/rounded vote distribution the live "hint" shows (reused for
// consistency, not the true share — see displayVoteDistribution). Shown only
// after the round is fully resolved, so there's no fairness reason left to
// hide WHICH option is which (unlike visibleOptionsFor at guess time) — but
// the percentages themselves still go through the same display cap.
function buildGuessReview(allWords, yesterday, byWord, allGuesses, todayKey) {
  return yesterday.wordIds.map((id) => {
    const g = byWord.get(id);
    const word = wordById(allWords, id);
    const guessesForWord = allGuesses.filter((x) => x.dayKey === todayKey && x.wordId === id);
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
 * Fires exactly once per user per guess-day, the moment the 3rd of today's
 * guess "slots" is filled — by a real guess (submitGuess) OR a timeout skip
 * (skipGuess), whichever fills it. Returns null while slots remain open.
 */
function maybeFinalizeGuessing(db, allWords, userId, todayKey, yesterday) {
  const myGuesses = db.guesses.filter((g) => g.dayKey === todayKey && g.userId === userId && yesterday.wordIds.includes(g.wordId));
  if (myGuesses.length !== yesterday.wordIds.length) return null;
  const byWord = new Map(myGuesses.map((g) => [g.wordId, g]));
  const results = yesterday.wordIds.map((id) => byWord.get(id).correct);
  const { points: basePoints, correctCount } = scoreGuesses(results, {
    guessScoreByCorrectCount: SCORING.guessScoreByCorrectCount,
  });
  const profile = db.profiles[userId];
  const pct = streakBonusPct(streakEndingAt(profile.participatedDays, todayKey));
  const points = applyStreakBonus(basePoints, pct);
  db.profiles[userId] = creditPoints(profile, { dayKey: todayKey, points });
  // Report the bonus % as 0 when it didn't actually apply (a penalty day is
  // never amplified — see applyStreakBonus) — showing "+10%" next to a
  // negative result would wrongly imply the bonus did something here.
  const effectivePct = basePoints > 0 ? pct : 0;
  return {
    correctCount, guessTotal: results.length, points, pct: effectivePct,
    profile: profileSnapshot(db, db.profiles[userId]),
    words: buildGuessReview(allWords, yesterday, byWord, db.guesses, todayKey),
  };
}

export function submitGuess(db, { userId, wordId, choiceId }) {
  const allWords = loadWords();
  const todayKey = latestBatchDayKey(db);
  const yesterdayKey = addDays(todayKey, -1);
  const yesterday = findBatch(db, yesterdayKey);
  if (!yesterday?.sealedAt || !yesterday.wordIds.includes(wordId)) return { ok: false, error: "not_guessable" };
  if (db.guesses.some((g) => g.dayKey === todayKey && g.wordId === wordId && g.userId === userId)) {
    return { ok: false, error: "already_guessed" };
  }
  const options = yesterday.options[wordId];
  const visible = visibleOptionsFor(options, userId);
  if (!visible.some((o) => o.id === choiceId)) return { ok: false, error: "invalid_choice" };
  const correct = isCorrectChoice(options, choiceId);
  db.guesses.push({ dayKey: todayKey, wordId, userId, choiceId, correct });
  db.profiles[userId] = markParticipated(ensureProfile(db, userId, userId), todayKey);

  // Correctness is knowable the instant this is guessed — nothing here waits
  // for a future event, unlike a writer's fooled-vote credit (see
  // settleBatch). This is what lets the UI show an immediate score step.
  const guessResult = maybeFinalizeGuessing(db, allWords, userId, todayKey, yesterday);
  return { ok: true, correct, guessResult, profile: profileSnapshot(db, db.profiles[userId]) };
}

/**
 * The client calls this when a word's guess timer runs out — "Du rakk ikke
 * å gjette." Fills the same slot a real guess would (so the round can still
 * complete and finalize), scored as incorrect, but does NOT mark
 * participation: per the design guardrail, the streak is earned by actually
 * writing or guessing, not by having a word merely time out on you.
 */
export function skipGuess(db, { userId, wordId }) {
  const allWords = loadWords();
  const todayKey = latestBatchDayKey(db);
  const yesterdayKey = addDays(todayKey, -1);
  const yesterday = findBatch(db, yesterdayKey);
  if (!yesterday?.sealedAt || !yesterday.wordIds.includes(wordId)) return { ok: false, error: "not_guessable" };
  if (db.guesses.some((g) => g.dayKey === todayKey && g.wordId === wordId && g.userId === userId)) {
    return { ok: false, error: "already_guessed" };
  }
  ensureProfile(db, userId, userId);
  db.guesses.push({ dayKey: todayKey, wordId, userId, choiceId: null, correct: false, skipped: true });
  const guessResult = maybeFinalizeGuessing(db, allWords, userId, todayKey, yesterday);
  return { ok: true, guessResult, profile: profileSnapshot(db, db.profiles[userId]) };
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
export function getVoteDistribution(db, userId, wordId) {
  const todayKey = latestBatchDayKey(db);
  const yesterdayKey = addDays(todayKey, -1);
  const yesterday = findBatch(db, yesterdayKey);
  if (!yesterday?.sealedAt || !yesterday.wordIds.includes(wordId)) return { ok: false, error: "not_guessable" };
  const options = yesterday.options[wordId];
  const guessesForWord = db.guesses.filter((g) => g.dayKey === todayKey && g.wordId === wordId);
  if (!guessesForWord.length) return { ok: true, distribution: [], noData: true };
  const shares = voteShareByOption(options, guessesForWord);
  const visibleIds = new Set(visibleOptionsFor(options, userId).map((o) => o.id));
  const distribution = displayVoteDistribution(shares, HINT).filter((d) => visibleIds.has(d.id));
  return { ok: true, distribution };
}

/**
 * Wipes ONLY this userId's own data (profile, day-result, submissions,
 * guesses) — safe to expose on a shared instance, since it never touches
 * anyone else's profile or progress. A bluff this user already wrote into an
 * already-SEALED batch keeps its authorship there untouched (rewriting
 * frozen option pools would be its own can of worms) — worst case a stray
 * fooled-vote credit later recreates a fresh, empty profile under the old
 * userId, which is harmless since no browser holds that identity anymore.
 */
export function resetPlayer(db, userId) {
  delete db.profiles[userId];
  delete db.dayResults[userId];
  db.submissions = db.submissions.filter((s) => s.userId !== userId);
  db.guesses = db.guesses.filter((g) => g.userId !== userId);
  return { ok: true };
}

export function ensureProfileFor(db, userId, displayName) {
  ensureProfile(db, userId, displayName);
  return db.profiles[userId];
}

export function ackRecap(db, userId) {
  const profile = getProfile(db, userId);
  const result = db.dayResults[userId];
  if (!profile || !result) return;
  db.profiles[userId] = markResultSeen(profile, result.asOfDayKey);
}

// -- dev-only test tools (see the-daily-cock/CLAUDE.md) ----------------------
// Not gated behind a flag: this whole app is pre-launch, and these are the
// only way to test the write-today/guess-tomorrow loop without real users or
// real days. Revisit before any real release.

export function listDays(db) {
  return { days: [...db.batches].map((b) => b.dayKey).sort(), current: latestBatchDayKey(db) };
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
