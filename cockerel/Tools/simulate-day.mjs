#!/usr/bin/env node
// simulate-day.mjs — plays several simulated days with many users (some
// skipping some days, to exercise bot fill) against an IN-MEMORY db, using
// controlled fake `now`s so the write/guess-offset pipeline can be verified
// without waiting real days. Does not touch server/data/ — a single
// self-contained smoke test. Usage: node Tools/simulate-day.mjs
//
// Exercises BOTH languages (see cockerel/CLAUDE.md "Dual-language
// gameplay") — most simulated users enable only one language (matching the
// expected real distribution), a few enable both, specifically to stress
// the "independent per-language session" paths a single day's manual
// click-through can't reach.
import assert from "node:assert/strict";
import {
  ensureToday, getTodayState, submitDefinition, submitGuess, ensureProfileFor, setEnabledLangs, ackRecap, freshDb,
} from "../server/db.mjs";
import { hasUnseenResult, currentStreak } from "../js/rating.js";
import { LANGS, POINTS } from "../js/config.js";

const USERS = Array.from({ length: 12 }, (_, i) => `user-${i + 1}`);
const DAYS = 6;
const START = Date.UTC(2026, 0, 1, 12); // noon UTC, day 1

const db = freshDb();
// Fixed per-user language enrollment, decided once up front — a settings
// toggle mid-run isn't the thing this smoke test is exercising.
const userLangs = new Map();
for (const u of USERS) {
  ensureProfileFor(db, u, u);
  const roll = Math.random();
  const langs = roll < 0.1 ? [...LANGS] : roll < 0.55 ? ["no"] : ["en"];
  setEnabledLangs(db, u, langs);
  userLangs.set(u, langs);
}
console.log(`Language enrollment: ${[...userLangs].filter(([, l]) => l.length > 1).length} dual-language, ${[...userLangs].filter(([, l]) => l.length === 1).length} single-language`);

for (let day = 0; day < DAYS; day++) {
  const now = new Date(START + day * 86_400_000);
  ensureToday(db, now);

  // Not everyone shows up every day — this is the whole point of the bot-fill
  // path: some days very few (or zero) humans write for a word.
  const active = USERS.filter(() => Math.random() < 0.6);
  console.log(`day ${day + 1} (${now.toISOString().slice(0, 10)}): ${active.length}/${USERS.length} active`);

  for (const userId of active) {
    const state = getTodayState(db, userId);

    for (const lang of state.enabledLangs) {
      const langState = state.byLang[lang];

      for (const w of langState.writeWords) {
        if (w.alreadySubmitted) continue;
        // Real users rarely write for EVERY word every day — keep per-word
        // coverage low so the bot-fill path actually gets exercised, same as
        // the real early-adoption scenario this mode is designed for.
        if (Math.random() < 0.7) continue;
        submitDefinition(db, { userId, wordId: w.wordId, text: `${userId}s bluff on ${w.word} (${lang})`, lang });
      }

      for (const w of langState.guessWords) {
        if (w.alreadyGuessed) continue;
        // Random visible option — varied enough to exercise both correct and
        // incorrect scoring paths without peeking at which one is truth.
        const choice = w.options[Math.floor(Math.random() * w.options.length)];
        submitGuess(db, { userId, wordId: w.wordId, choiceId: choice.id, lang });
      }

      if (langState.recap) {
        const langProfile = db.profiles[userId].langs[lang];
        assert.ok(hasUnseenResult(langProfile, db.dayResults[userId][lang].asOfDayKey), `${lang} recap should be unseen before ack`);
        ackRecap(db, userId, lang);
        assert.ok(!hasUnseenResult(db.profiles[userId].langs[lang], db.dayResults[userId][lang].asOfDayKey), `${lang} recap should be seen after ack`);
      }
    }
  }
}

// -- structural assertions --------------------------------------------------

for (const batch of db.batches) {
  if (!batch.sealedAt) continue;
  assert.ok(LANGS.includes(batch.lang), `batch has a valid lang: ${batch.lang}`);
  for (const wordId of batch.wordIds) {
    const options = batch.options[wordId];
    const truths = options.filter((o) => o.kind === "truth");
    assert.equal(truths.length, 1, `exactly one truth option for ${batch.lang}/${wordId}`);
    const texts = options.map((o) => o.text);
    assert.equal(new Set(texts).size, texts.length, `no duplicate option text for ${batch.lang}/${wordId} (no truth collision)`);
  }
}

for (const lang of LANGS) {
  let anyBotFill = false;
  for (const batch of db.batches) {
    if (batch.lang !== lang || !batch.options) continue;
    for (const wordId of batch.wordIds) {
      if (batch.options[wordId].some((o) => o.kind === "bot")) anyBotFill = true;
    }
  }
  assert.ok(anyBotFill, `expected at least one ${lang} word to need bot-fill decoys given partial participation`);

  let anyPointsProgress = false;
  for (const userId of USERS) {
    const langProfile = db.profiles[userId].langs[lang];
    if (!langProfile) continue;
    if (langProfile.countedDays.length > 0) anyPointsProgress = true;
    // The points total is a running sum with a floor (js/config.js POINTS) —
    // nothing in a multi-day, many-user run may drive it below that.
    assert.equal(typeof langProfile.pointsTotal, "number", `${userId}/${lang} must have a numeric points total`);
    assert.ok(langProfile.pointsTotal >= POINTS.floor, `${userId}/${lang} total ${langProfile.pointsTotal} fell below the floor`);
  }
  assert.ok(anyPointsProgress, `expected at least one ${lang} profile to have accumulated day credit`);
}

// Cross-language independence: a user enrolled in only ONE language must
// never accumulate a points track for the other one — this is the one
// invariant that would silently break if any per-lang scoping in db.mjs
// leaked into the wrong language.
for (const userId of USERS) {
  const langs = userLangs.get(userId);
  for (const lang of LANGS) {
    if (!langs.includes(lang)) {
      assert.ok(!db.profiles[userId].langs[lang], `${userId} never enabled ${lang} — must have no ${lang} points track`);
    }
  }
}

console.log("\nFinal profiles:");
for (const userId of USERS) {
  const p = db.profiles[userId];
  const parts = (userLangs.get(userId)).map((lang) => {
    const lp = p.langs[lang];
    return `${lang}: points=${lp.pointsTotal} countedDays=${lp.countedDays.length} streak=${currentStreak(lp.participatedDays)}`;
  });
  console.log(`  ${userId} [${userLangs.get(userId).join(",")}]: ${parts.join(" | ")}`);
}

console.log("\nAll simulate-day.mjs assertions passed.");
