// db.test.mjs — deterministic coverage for server/db.mjs's orchestration
// layer (day rollover, seal/settle, immediate guess-credit, dual-language
// independence). js/engine.test.mjs already covers the pure scoring/rating
// math in isolation; this file exercises the same paths wired together the
// way real gameplay actually calls them, against an in-memory db (freshDb())
// — no filesystem, same "no bare Date.now()" discipline via ensureToday's
// injected `now`. Tools/simulate-day.mjs remains the multi-day, many-user,
// randomized smoke test; this file is the fast, deterministic unit layer for
// the same orchestration code (word/bot-pool selection still goes through
// the real, uninjected Math.random in db.mjs, so assertions here read the
// actual sealed state back rather than predicting which words/ids get
// picked — same approach simulate-day.mjs already uses).
// Usage: node --test server/db.test.mjs (or npm test, from cockerel/).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  freshDb, ensureToday, getTodayState, submitDefinition, submitGuess, skipGuess,
  ensureProfileFor, setEnabledLangs, ackRecap, resetPlayer,
} from "./db.mjs";
import { dayKeyFromDate, addDays } from "../js/engine.js";
import { loadWords, wordById } from "../js/words.js";
import { hasUnseenResult, applyStreakBonus, streakBonusPct } from "../js/rating.js";
import { LANGS, BATCH, OPTIONS, SCORING } from "../js/config.js";

const DAY0 = new Date("2026-01-01T12:00:00Z");
const dayKey = (date) => dayKeyFromDate(date);
const nextDate = (date) => new Date(date.getTime() + 86_400_000);

function truthIdFor(batch, wordId) {
  return batch.options[wordId].find((o) => o.kind === "truth").id;
}
function wrongIdFor(batch, wordId) {
  return batch.options[wordId].find((o) => o.kind !== "truth").id;
}

// -- bootstrap ----------------------------------------------------------

test("ensureToday bootstraps day 1 with a sealed 'yesterday' and an open 'today', per language", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const todayKey = dayKey(DAY0);
  const yesterdayKey = addDays(todayKey, -1);

  for (const lang of LANGS) {
    const batches = db.batches.filter((b) => b.lang === lang);
    assert.equal(batches.length, 2, `${lang}: exactly 2 batches after bootstrap`);

    const yesterday = batches.find((b) => b.dayKey === yesterdayKey);
    assert.ok(yesterday.sealedAt, `${lang}: bootstrap 'yesterday' is already sealed`);
    assert.equal(yesterday.wordIds.length, BATCH.wordsPerDay);
    for (const wordId of yesterday.wordIds) {
      const options = yesterday.options[wordId];
      assert.equal(options.length, OPTIONS.targetPoolSize, `${lang}/${wordId}: full option pool`);
      assert.equal(options.filter((o) => o.kind === "truth").length, 1, `${lang}/${wordId}: exactly one truth`);
      // Day 1's bootstrap batch has zero human submissions by construction —
      // every non-truth option must be bot-filled.
      assert.ok(options.every((o) => o.kind === "truth" || o.kind === "bot"), `${lang}/${wordId}: no human options on a fresh bootstrap`);
    }

    const today = batches.find((b) => b.dayKey === todayKey);
    assert.equal(today.sealedAt, null, `${lang}: 'today' is still open for writing`);
    assert.equal(today.wordIds.length, BATCH.wordsPerDay);
  }
});

test("ensureToday is idempotent — re-running for the same 'now' doesn't create duplicate batches", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const countAfterFirst = db.batches.length;
  ensureToday(db, DAY0);
  assert.equal(db.batches.length, countAfterFirst);
});

// -- submitDefinition -----------------------------------------------------

test("submitDefinition validates input and marks participation immediately", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const todayKey = dayKey(DAY0);
  ensureProfileFor(db, "writer1", "Writer One");
  const today = db.batches.find((b) => b.lang === "no" && b.dayKey === todayKey);
  const [wordId] = today.wordIds;

  const empty = submitDefinition(db, { userId: "writer1", wordId, text: "   ", lang: "no" });
  assert.equal(empty.ok, false);
  assert.equal(empty.error, "empty");

  const wrongWord = submitDefinition(db, { userId: "writer1", wordId: "not-todays-word", text: "en bløff", lang: "no" });
  assert.equal(wrongWord.ok, false);
  assert.equal(wrongWord.error, "not_todays_word");

  const ok = submitDefinition(db, { userId: "writer1", wordId, text: "en troverdig bløff", lang: "no" });
  assert.equal(ok.ok, true);
  assert.ok(db.profiles.writer1.langs.no.participatedDays.includes(todayKey));

  const duplicate = submitDefinition(db, { userId: "writer1", wordId, text: "en annen bløff", lang: "no" });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error, "already_submitted");
});

// -- submitGuess ------------------------------------------------------------

test("submitGuess credits guess points immediately on the 3rd guess of the day, matching SCORING.guessScoreByCorrectCount", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const todayKey = dayKey(DAY0);
  const yesterdayKey = addDays(todayKey, -1);
  ensureProfileFor(db, "guesser1", "Guesser One");
  const yesterday = db.batches.find((b) => b.lang === "no" && b.dayKey === yesterdayKey);

  let lastResult;
  for (const wordId of yesterday.wordIds) {
    const res = submitGuess(db, { userId: "guesser1", wordId, choiceId: truthIdFor(yesterday, wordId), lang: "no" });
    assert.equal(res.ok, true);
    assert.equal(res.correct, true, `guessing the truth id for ${wordId} must score correct`);
    lastResult = res;
  }

  assert.ok(lastResult.guessResult, "the 3rd guess of the day finalizes and returns a result");
  assert.equal(lastResult.guessResult.correctCount, 3);
  // This is guesser1's very first participation day, so streak day 1's +10%
  // bonus (see config.js STREAK_BONUS) applies on top of the base 3/3 score.
  const expectedPoints = applyStreakBonus(SCORING.guessScoreByCorrectCount[3], streakBonusPct(1));
  assert.equal(lastResult.guessResult.points, expectedPoints);
  assert.ok(db.profiles.guesser1.langs.no.participatedDays.includes(todayKey));
  assert.ok(db.profiles.guesser1.langs.no.countedDays.includes(todayKey));
});

/** Guess all 3 of yesterday's words wrong, returning the finalized result. */
function guessEverythingWrong(db, userId, yesterday) {
  let lastResult;
  for (const wordId of yesterday.wordIds) {
    lastResult = submitGuess(db, { userId, wordId, choiceId: wrongIdFor(yesterday, wordId), lang: "no" });
  }
  return lastResult.guessResult;
}

test("submitGuess with 0/3 correct is scored per SCORING.guessScoreByCorrectCount[0] (the one way to lose points)", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const yesterdayKey = addDays(dayKey(DAY0), -1);
  ensureProfileFor(db, "guesser2", "Guesser Two");
  // setEnabledLangs is what creates the per-language track (ensureLangProfile
  // is lazy), so it has to come before poking at langs.no. Give them points to
  // actually lose — a player sitting at the floor would exercise the clamp
  // below instead, which is the next test's job.
  setEnabledLangs(db, "guesser2", ["no"]);
  db.profiles.guesser2.langs.no.pointsTotal = 500;
  const yesterday = db.batches.find((b) => b.lang === "no" && b.dayKey === yesterdayKey);

  const result = guessEverythingWrong(db, "guesser2", yesterday);
  assert.equal(result.correctCount, 0);
  assert.equal(result.points, SCORING.guessScoreByCorrectCount[0]);
  assert.ok(result.points < 0, "0/3 must be a genuine penalty");
  assert.equal(db.profiles.guesser2.langs.no.pointsTotal, 500 + result.points,
    "the reported points are exactly what the total moved by");
});

test("a 0/3 penalty is trimmed to what the player actually has — the total never goes below the floor", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const yesterdayKey = addDays(dayKey(DAY0), -1);
  const yesterday = db.batches.find((b) => b.lang === "no" && b.dayKey === yesterdayKey);

  // A brand-new player has nothing to lose: the penalty reports as 0, not as
  // the raw -15, because reporting the raw number would put a figure on the
  // score screen that the header's total never moved by (see js/ui.js).
  ensureProfileFor(db, "broke", "Broke Newcomer");
  const brokeResult = guessEverythingWrong(db, "broke", yesterday);
  assert.equal(brokeResult.correctCount, 0);
  assert.equal(brokeResult.points, 0);
  assert.equal(db.profiles.broke.langs.no.pointsTotal, 0);

  // A player with less than a full penalty's worth loses exactly what's left.
  ensureProfileFor(db, "nearly", "Nearly Broke");
  setEnabledLangs(db, "nearly", ["no"]);
  db.profiles.nearly.langs.no.pointsTotal = 6;
  const nearlyResult = guessEverythingWrong(db, "nearly", yesterday);
  assert.equal(nearlyResult.points, -6);
  assert.equal(db.profiles.nearly.langs.no.pointsTotal, 0);
});

test("submitGuess rejects a repeat guess on the same word and an invalid choiceId", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const todayKey = dayKey(DAY0);
  const yesterdayKey = addDays(todayKey, -1);
  ensureProfileFor(db, "guesser3", "Guesser Three");
  const yesterday = db.batches.find((b) => b.lang === "no" && b.dayKey === yesterdayKey);
  const [wordId] = yesterday.wordIds;

  const first = submitGuess(db, { userId: "guesser3", wordId, choiceId: truthIdFor(yesterday, wordId), lang: "no" });
  assert.equal(first.ok, true);
  const repeat = submitGuess(db, { userId: "guesser3", wordId, choiceId: wrongIdFor(yesterday, wordId), lang: "no" });
  assert.equal(repeat.ok, false);
  assert.equal(repeat.error, "already_guessed");

  const invalid = submitGuess(db, { userId: "guesser3", wordId: yesterday.wordIds[1], choiceId: "not-a-real-option", lang: "no" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, "invalid_choice");
});

test("skipGuess fills a guess slot without marking participation", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const todayKey = dayKey(DAY0);
  const yesterdayKey = addDays(todayKey, -1);
  ensureProfileFor(db, "skipper1", "Skipper One");
  const yesterday = db.batches.find((b) => b.lang === "no" && b.dayKey === yesterdayKey);

  let lastResult;
  for (const wordId of yesterday.wordIds) {
    lastResult = skipGuess(db, { userId: "skipper1", wordId, lang: "no" });
    assert.equal(lastResult.ok, true);
  }
  assert.ok(lastResult.guessResult, "skipping the last slot still finalizes the round");
  assert.equal(lastResult.guessResult.correctCount, 0);
  assert.equal(
    db.profiles.skipper1.langs.no.participatedDays.includes(todayKey), false,
    "a timed-out guess must never count toward the streak",
  );
});

// -- multi-day write -> seal -> guess -> settle pipeline ---------------------

test("a writer's close-match submission is credited a rollover after the guess window closes", () => {
  const db = freshDb();
  ensureToday(db, DAY0); // bootstraps DAY0-1 (sealed) + DAY0 (open, our write day)
  const writeDayKey = dayKey(DAY0);
  ensureProfileFor(db, "writer2", "Writer Two");

  const writeBatch = db.batches.find((b) => b.lang === "no" && b.dayKey === writeDayKey);
  const words = loadWords("no");
  const [closeMatchWordId, otherWordId1, otherWordId2] = writeBatch.wordIds;
  const truthText = wordById(words, closeMatchWordId).definition;

  // Submitting the truth verbatim is a close match, not a visible option —
  // see engine.js mergeSubmissions.
  submitDefinition(db, { userId: "writer2", wordId: closeMatchWordId, text: truthText, lang: "no" });
  submitDefinition(db, { userId: "writer2", wordId: otherWordId1, text: "en troverdig bløff", lang: "no" });
  submitDefinition(db, { userId: "writer2", wordId: otherWordId2, text: "enda en troverdig bløff", lang: "no" });

  const day1 = nextDate(DAY0);
  ensureToday(db, day1); // seals writeDayKey's batch, opens the guess window
  const guessDayKey = dayKey(day1);
  const sealed = db.batches.find((b) => b.lang === "no" && b.dayKey === writeDayKey);
  assert.ok(sealed.sealedAt, "the write day's batch is sealed once its guess window opens");
  assert.ok(
    sealed.closeMatches[closeMatchWordId].includes("writer2"),
    "the exact-truth submission is recorded as a close match, not a visible option",
  );
  const closeMatchOptionTexts = sealed.options[closeMatchWordId].map((o) => o.text);
  assert.equal(closeMatchOptionTexts.filter((txt) => txt === truthText).length, 1, "the truth appears exactly once, never duplicated by the close match");

  // A guesser plays the write day's words during the guess window.
  ensureProfileFor(db, "guesser4", "Guesser Four");
  for (const wordId of writeBatch.wordIds) {
    submitGuess(db, { userId: "guesser4", wordId, choiceId: truthIdFor(sealed, wordId), lang: "no" });
  }

  const day2 = nextDate(day1);
  ensureToday(db, day2); // settles writeDayKey now that its guess window (guessDayKey) has closed
  const settled = db.batches.find((b) => b.lang === "no" && b.dayKey === writeDayKey);
  assert.equal(settled.settledAt, dayKey(day2));

  const result = db.dayResults.writer2.no;
  assert.equal(result.writeDayKey, writeDayKey);
  assert.ok(result.writeBasePoints >= SCORING.closeMatchBonus, "close-match bonus is included in the writer's base points");
  assert.ok(db.profiles.writer2.langs.no.countedDays.includes(writeDayKey), "the write day is now counted toward the rating average");

  assert.ok(hasUnseenResult(db.profiles.writer2.langs.no, result.asOfDayKey));
  ackRecap(db, "writer2", "no");
  assert.ok(!hasUnseenResult(db.profiles.writer2.langs.no, result.asOfDayKey));
});

// -- dual-language independence ---------------------------------------------

test("a single-language player accumulates no rating track for the other language", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const todayKey = dayKey(DAY0);
  const yesterdayKey = addDays(todayKey, -1);
  ensureProfileFor(db, "soloNo", "Solo Norwegian");
  setEnabledLangs(db, "soloNo", ["no"]);

  const today = db.batches.find((b) => b.lang === "no" && b.dayKey === todayKey);
  const yesterday = db.batches.find((b) => b.lang === "no" && b.dayKey === yesterdayKey);
  submitDefinition(db, { userId: "soloNo", wordId: today.wordIds[0], text: "bløff", lang: "no" });
  submitGuess(db, { userId: "soloNo", wordId: yesterday.wordIds[0], choiceId: truthIdFor(yesterday, yesterday.wordIds[0]), lang: "no" });

  assert.ok(db.profiles.soloNo.langs.no, "the enabled language has a rating track");
  assert.equal(db.profiles.soloNo.langs.en, undefined, "the never-enabled language must have no rating track at all");
});

test("getTodayState only reports byLang entries for enabled languages", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  ensureProfileFor(db, "soloEn", "Solo English");
  setEnabledLangs(db, "soloEn", ["en"]);
  const state = getTodayState(db, "soloEn");
  assert.deepEqual(state.enabledLangs, ["en"]);
  assert.deepEqual(Object.keys(state.byLang), ["en"]);
});

// -- resetPlayer --------------------------------------------------------

test("resetPlayer wipes only the targeted user's data", () => {
  const db = freshDb();
  ensureToday(db, DAY0);
  const todayKey = dayKey(DAY0);
  ensureProfileFor(db, "toDelete", "To Delete");
  ensureProfileFor(db, "toKeep", "To Keep");
  const today = db.batches.find((b) => b.lang === "no" && b.dayKey === todayKey);
  submitDefinition(db, { userId: "toDelete", wordId: today.wordIds[0], text: "bløff A", lang: "no" });
  submitDefinition(db, { userId: "toKeep", wordId: today.wordIds[1], text: "bløff B", lang: "no" });

  resetPlayer(db, "toDelete");

  assert.equal(db.profiles.toDelete, undefined);
  assert.ok(db.profiles.toKeep);
  assert.ok(!db.submissions.some((s) => s.userId === "toDelete"));
  assert.ok(db.submissions.some((s) => s.userId === "toKeep"));
});
