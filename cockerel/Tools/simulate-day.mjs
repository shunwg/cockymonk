#!/usr/bin/env node
// simulate-day.mjs — plays several simulated days with many users (some
// skipping some days, to exercise bot fill) against an IN-MEMORY db, using
// controlled fake `now`s so the write/guess-offset pipeline can be verified
// without waiting real days. Does not touch server/data/ — a single
// self-contained smoke test. Usage: node Tools/simulate-day.mjs
import assert from "node:assert/strict";
import {
  ensureToday, getTodayState, submitDefinition, submitGuess, ensureProfileFor, ackRecap,
} from "../server/db.mjs";
import { hasUnseenResult, currentStreak } from "../js/rating.js";

function freshDb() {
  return { batches: [], submissions: [], guesses: [], profiles: {}, dayResults: {} };
}

const USERS = Array.from({ length: 12 }, (_, i) => `user-${i + 1}`);
const DAYS = 6;
const START = Date.UTC(2026, 0, 1, 12); // noon UTC, day 1

const db = freshDb();
for (const u of USERS) ensureProfileFor(db, u, u);

for (let day = 0; day < DAYS; day++) {
  const now = new Date(START + day * 86_400_000);
  ensureToday(db, now);

  // Not everyone shows up every day — this is the whole point of the bot-fill
  // path: some days very few (or zero) humans write for a word.
  const active = USERS.filter(() => Math.random() < 0.6);
  console.log(`day ${day + 1} (${now.toISOString().slice(0, 10)}): ${active.length}/${USERS.length} active`);

  for (const userId of active) {
    const state = getTodayState(db, userId);

    for (const w of state.writeWords) {
      if (w.alreadySubmitted) continue;
      // Real users rarely write for EVERY word every day — keep per-word
      // coverage low so the bot-fill path actually gets exercised, same as
      // the real early-adoption scenario this mode is designed for.
      if (Math.random() < 0.7) continue;
      submitDefinition(db, { userId, wordId: w.wordId, text: `${userId}s bløff om ${w.word}` });
    }

    for (const w of state.guessWords) {
      if (w.alreadyGuessed) continue;
      // Guess right ~40% of the time, otherwise pick a random visible option —
      // varied enough to exercise both correct and incorrect scoring paths.
      const pick = Math.random() < 0.4
        ? null // resolved below once we know which id is truth (we don't peek — guess randomly weighted instead)
        : w.options[Math.floor(Math.random() * w.options.length)];
      const choice = pick ?? w.options[Math.floor(Math.random() * w.options.length)];
      submitGuess(db, { userId, wordId: w.wordId, choiceId: choice.id });
    }

    if (state.recap) {
      assert.ok(hasUnseenResult(db.profiles[userId], db.dayResults[userId].asOfDayKey), "recap should be unseen before ack");
      ackRecap(db, userId);
      assert.ok(!hasUnseenResult(db.profiles[userId], db.dayResults[userId].asOfDayKey), "recap should be seen after ack");
    }
  }
}

// -- structural assertions --------------------------------------------------

for (const batch of db.batches) {
  if (!batch.sealedAt) continue;
  for (const wordId of batch.wordIds) {
    const options = batch.options[wordId];
    const truths = options.filter((o) => o.kind === "truth");
    assert.equal(truths.length, 1, `exactly one truth option for word ${wordId}`);
    const texts = options.map((o) => o.text);
    assert.equal(new Set(texts).size, texts.length, `no duplicate option text for word ${wordId} (no truth collision)`);
  }
}

let anyBotFill = false;
for (const batch of db.batches) {
  if (!batch.options) continue;
  for (const wordId of batch.wordIds) {
    if (batch.options[wordId].some((o) => o.kind === "bot")) anyBotFill = true;
  }
}
assert.ok(anyBotFill, "expected at least one word to need bot-fill decoys given partial participation");

let anyRatingProgress = false;
for (const userId of USERS) {
  const p = db.profiles[userId];
  if (p.countedDays.length > 0) anyRatingProgress = true;
}
assert.ok(anyRatingProgress, "expected at least one profile to have accumulated day credit");

console.log("\nFinal profiles:");
for (const userId of USERS) {
  const p = db.profiles[userId];
  console.log(`  ${userId}: ratingSum=${p.ratingSum} countedDays=${p.countedDays.length} streak=${currentStreak(p.participatedDays)}`);
}

console.log("\nAll simulate-day.mjs assertions passed.");
