// engine.test.mjs — runs every vector in vectors.json against engine.js/rating.js.
// Usage: node --test js/engine.test.mjs (or npm test, from cockerel/).
// If a vector fails, the engine is wrong — not the vector (see vectors.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  dayKeyFromDate, addDays, isNextDay, normalize, isValidSubmission,
  pickDailyWords, mergeSubmissions, sealWord, visibleOptionsFor, isCorrectChoice,
  scoreFooledVotes, scoreCloseMatches, scoreGuesses, voteShareByOption, displayVoteDistribution,
} from "./engine.js";
import {
  freshProfile, creditPoints, currentStreak, streakEndingAt, streakBonusPct,
  applyStreakBonus, markParticipated, currentRating, hasUnseenResult, markResultSeen,
} from "./rating.js";
import { SCORING, HINT } from "./config.js";

const vectors = JSON.parse(await readFile(new URL("./vectors.json", import.meta.url), "utf8"));

// Deterministic PRNG for tests that need one (mulberry32).
function seededRng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -- date helpers --------------------------------------------------------

test("dayKeyFromDate is UTC, not local", () => {
  assert.equal(dayKeyFromDate(new Date("2026-07-28T23:30:00Z")), "2026-07-28");
});

test("addDays / isNextDay", () => {
  assert.equal(addDays("2026-07-28", 1), "2026-07-29");
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.ok(isNextDay("2026-07-28", "2026-07-29"));
  assert.ok(!isNextDay("2026-07-28", "2026-07-30"));
});

// -- text rules ------------------------------------------------------------

test("normalize / isValidSubmission", () => {
  assert.equal(normalize("  Ekte   Def.! "), "ekte def");
  assert.ok(!isValidSubmission("   "));
  assert.ok(isValidSubmission("noe"));
});

// -- daily word selection --------------------------------------------------

test("pickDailyWords excludes recently used when enough remain", () => {
  const words = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }];
  const { words: picks, usedFallback } = pickDailyWords(words, ["1", "2"], 3, seededRng(1));
  assert.equal(picks.length, 3);
  assert.ok(picks.every((w) => !["1", "2"].includes(w.id)));
  assert.equal(usedFallback, false);
});

test("pickDailyWords falls back gracefully when exclusion eats the pool", () => {
  const words = [{ id: "1" }, { id: "2" }];
  const { words: picks, usedFallback } = pickDailyWords(words, ["1", "2"], 2, seededRng(2));
  assert.equal(picks.length, 2);
  assert.equal(usedFallback, true);
});

// -- option pool -------------------------------------------------------------

for (const v of vectors.mergeSubmissions) {
  test(`mergeSubmissions ${v.id}`, () => {
    const { options, closeMatches } = mergeSubmissions({ truth: v.truth, submissions: v.submissions });
    assert.deepEqual(
      options.map((o) => ({ kind: o.kind, authors: o.authors, text: o.text })),
      v.expected.options,
    );
    assert.deepEqual(closeMatches, v.expected.closeMatches);
  });
}

test("sealWord fills to target pool size, exactly one truth, no collision", () => {
  const word = { id: "42", word: "iskrave", definition: "Små isdannelser i vannskorpe når den fryser", tags: ["obskur", "bm", "subst"] };
  const fakeDefsPool = [
    { word: "abc", definition: "Nedsettende: svært tykk mann", wc: "subst" },
    { word: "def", definition: "Person som spiller ishockey", wc: "subst" },
    { word: "ghi", definition: "Større handelsplass der en lagrer stapelvare", wc: "subst" },
    { word: "jkl", definition: "Sykdom hos dyr ifølge folketro", wc: "subst" },
  ];
  const submissions = [{ userId: "u1", text: "En slags snøkant" }];
  const { options } = sealWord({ word, submissions, fakeDefsPool, rng: seededRng(3), targetCount: 5 });
  assert.equal(options.length, 5);
  const truths = options.filter((o) => o.kind === "truth");
  assert.equal(truths.length, 1);
  assert.equal(truths[0].text, word.definition);
  assert.deepEqual(options.map((o) => o.id), ["a", "b", "c", "d", "e"]);
});

test("visibleOptionsFor hides a guesser's own submission", () => {
  const options = [
    { id: "a", kind: "human", authors: ["u1"], text: "x" },
    { id: "b", kind: "truth", authors: [], text: "y" },
  ];
  assert.deepEqual(visibleOptionsFor(options, "u1").map((o) => o.id), ["b"]);
});

test("isCorrectChoice", () => {
  const options = [
    { id: "a", kind: "human", authors: ["u1"], text: "x" },
    { id: "b", kind: "truth", authors: [], text: "y" },
  ];
  assert.ok(isCorrectChoice(options, "b"));
  assert.ok(!isCorrectChoice(options, "a"));
});

for (const v of vectors.scoreFooledVotes) {
  test(`scoreFooledVotes ${v.id}`, () => {
    const { deltas, fooledCounts } = scoreFooledVotes({
      options: v.options, guesses: v.guesses, bluffBaseK: SCORING.bluffBaseK, bluffExponent: SCORING.bluffExponent,
    });
    assert.deepEqual(Object.fromEntries(deltas), v.expected.deltas);
    assert.deepEqual(Object.fromEntries(fooledCounts), v.expected.fooledCounts);
  });
}

test("scoreFooledVotes scales sub-linearly with absolute fooled-count, no fixed pool ceiling", () => {
  const mkGuesses = (n) => Array.from({ length: n }, (_, i) => ({ userId: `g${i}`, choiceId: "a" }));
  const options = [
    { id: "a", kind: "human", authors: ["p1"], text: "bløff" },
    { id: "b", kind: "truth", authors: [], text: "sannhet" },
  ];
  const score = (n) => scoreFooledVotes({
    options, guesses: mkGuesses(n), bluffBaseK: SCORING.bluffBaseK, bluffExponent: SCORING.bluffExponent,
  }).deltas.get("p1");

  assert.equal(score(1), 40); // small game: fooling just one person is real, not trivial
  assert.equal(score(25), 200); // mid-size crowd: a solid, clearly bigger reward
  assert.equal(score(400), 800); // large/viral crowd: a huge reward, no ceiling in sight

  // sub-linear: 400x the audience of the 1-person case earns only 20x the
  // points, not 400x — a lucky single vote can never rival a genuine crowd.
  assert.ok(score(400) < score(1) * 400);
});

// -- vote distribution: real share -> display-safe cap/round ----------------

test("voteShareByOption computes raw percentage per option", () => {
  const options = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const guesses = [{ choiceId: "a" }, { choiceId: "a" }, { choiceId: "b" }, { choiceId: "a" }];
  const shares = voteShareByOption(options, guesses);
  assert.deepEqual(shares, [
    { id: "a", pct: 75 },
    { id: "b", pct: 25 },
    { id: "c", pct: 0 },
  ]);
});

test("voteShareByOption is all-zero with no guesses yet", () => {
  const options = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(voteShareByOption(options, []), [{ id: "a", pct: 0 }, { id: "b", pct: 0 }]);
});

test("displayVoteDistribution caps a runaway leader and redistributes the overflow", () => {
  // 90/10/0 would trivially out the correct answer once enough people guess
  // right — capped at 45%, the other options absorb the excess.
  const shares = [{ id: "a", pct: 90 }, { id: "b", pct: 10 }, { id: "c", pct: 0 }];
  const result = displayVoteDistribution(shares, { capPct: 45, roundToPct: 5 });
  assert.equal(result.find((r) => r.id === "a").pct, 45);
  assert.ok(result.find((r) => r.id === "a").pct <= 45);
  // total isn't required to sum exactly to 100 after rounding, but no option
  // should ever be left displaying above the cap.
  assert.ok(result.every((r) => r.pct <= 45));
});

test("displayVoteDistribution passes an already-even split through unchanged (aside from rounding)", () => {
  const shares = [{ id: "a", pct: 33.3 }, { id: "b", pct: 33.3 }, { id: "c", pct: 33.4 }];
  const result = displayVoteDistribution(shares, HINT);
  assert.deepEqual(result.map((r) => r.pct), [35, 35, 35]);
});

for (const v of vectors.scoreCloseMatches) {
  test(`scoreCloseMatches ${v.id}`, () => {
    const deltas = scoreCloseMatches(v.closeMatches, SCORING.closeMatchBonus);
    assert.deepEqual(Object.fromEntries(deltas), v.expected);
  });
}

for (const v of vectors.scoreGuesses) {
  test(`scoreGuesses ${v.id}`, () => {
    const result = scoreGuesses(v.results, {
      guessScoreByCorrectCount: SCORING.guessScoreByCorrectCount,
    });
    assert.deepEqual(result, v.expected);
  });
}

for (const v of vectors.applyStreakBonus) {
  test(`applyStreakBonus ${v.id}`, () => {
    assert.equal(applyStreakBonus(v.basePoints, v.pct), v.expected);
  });
}

// -- rating / streak ---------------------------------------------------------

for (const v of vectors.currentStreak) {
  test(`currentStreak ${v.id}`, () => {
    assert.equal(currentStreak(v.days), v.expected);
  });
}

for (const v of vectors.streakEndingAt) {
  test(`streakEndingAt ${v.id}`, () => {
    assert.equal(streakEndingAt(v.days, v.dayKey), v.expected);
  });
}

for (const v of vectors.streakBonusPct) {
  test(`streakBonusPct ${v.id}`, () => {
    assert.equal(streakBonusPct(v.streakDays), v.expected);
  });
}

test("markParticipated is idempotent and immediate (not tied to point settlement)", () => {
  let profile = freshProfile("Test");
  profile = markParticipated(profile, "2026-07-20");
  profile = markParticipated(profile, "2026-07-20"); // same day again, e.g. a 2nd guess
  assert.deepEqual(profile.participatedDays, ["2026-07-20"]);
  assert.equal(profile.countedDays.length, 0, "participation must not touch the rating-average day-set");
});

for (const v of vectors.creditPoints) {
  test(`creditPoints ${v.id}`, () => {
    const before = {
      ...freshProfile("Test"),
      countedDays: v.priorCountedDays,
      ratingSum: v.priorRatingSum ?? 0,
    };
    const after = creditPoints(before, { dayKey: v.dayKey, points: v.points });
    assert.equal(after.ratingSum, v.expected.ratingSum);
    assert.deepEqual(after.countedDays, v.expected.countedDays);
  });
}

test("creditPoints never counts the same dayKey twice toward ratingDays", () => {
  let profile = freshProfile("Test");
  profile = creditPoints(profile, { dayKey: "2026-07-20", points: 100 });
  profile = creditPoints(profile, { dayKey: "2026-07-20", points: 50 });
  assert.equal(profile.countedDays.length, 1);
  assert.equal(profile.ratingSum, 150);
});

for (const v of vectors.currentRating) {
  test(`currentRating ${v.id}`, () => {
    const profile = { ...freshProfile("Test"), ratingSum: v.ratingSum, countedDays: v.countedDays };
    assert.equal(currentRating(profile), v.expected);
  });
}

test("hasUnseenResult / markResultSeen", () => {
  const played = { ...freshProfile("Test"), lastResultSeenDate: null };
  assert.ok(hasUnseenResult(played, "2026-07-27"));
  const seen = markResultSeen(played, "2026-07-27");
  assert.ok(!hasUnseenResult(seen, "2026-07-27"));
  assert.ok(hasUnseenResult(seen, "2026-07-28"), "a newer marker is unseen again");
});

test("a fresh profile (never played) has no unseen result", () => {
  assert.ok(!hasUnseenResult(freshProfile("Test"), null));
});
