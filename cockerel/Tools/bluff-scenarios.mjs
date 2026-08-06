/**
 * bluff-scenarios.mjs — regenerates BLUFF-SCENARIOS.md's tables from the REAL
 * engine (js/engine.js + js/rating.js + js/config.js), so the worked examples
 * in that doc can never quietly drift away from what the code actually does.
 *
 * That doc claims its numbers are "generated directly from the real engine
 * code, not hand-calculated" — this script is what makes that true. Re-run it
 * after any change to SCORING / STREAK_BONUS / POINTS and paste the output
 * over the corresponding tables:
 *
 *     node Tools/bluff-scenarios.mjs
 *
 * It deliberately models only the parts that vary by player skill and game
 * size (guess score, fooled-vote score, streak bonus, the running total with
 * its floor). Close-match bonuses and missed days are left out — both are
 * real, but they'd blur the one thing these tables exist to show.
 */
import { scoreGuesses, scoreFooledVotes } from "../js/engine.js";
import { freshProfile, creditPoints, effectivePoints, applyStreakBonus, streakBonusPct, totalPoints } from "../js/rating.js";
import { SCORING, BATCH } from "../js/config.js";

const DAYS = 30;

// The game grows around the players: friend group -> community -> crowd.
function guessersOnDay(day) {
  if (day <= 10) return 3;
  if (day <= 20) return 30;
  return 300;
}

const PLAYERS = [
  { name: "Novice", correctPerDay: 1, fooledPerWord: () => 1 },
  { name: "Mediocre", correctPerDay: 2, fooledPerWord: (guessers) => Math.round(guessers * 0.15) },
  { name: "Pro", correctPerDay: 3, fooledPerWord: (guessers) => Math.round(guessers * 0.35) },
];

/** Points for ONE word's bluff, via the real scoreFooledVotes. */
function bluffPointsForWord(fooled) {
  if (fooled <= 0) return 0;
  const options = [
    { id: "mine", kind: "human", authors: ["me"], text: "bluff" },
    { id: "truth", kind: "truth", authors: [], text: "truth" },
  ];
  const guesses = Array.from({ length: fooled }, (_, i) => ({ userId: `g${i}`, choiceId: "mine" }));
  const { deltas } = scoreFooledVotes({
    options, guesses, bluffBaseK: SCORING.bluffBaseK, bluffExponent: SCORING.bluffExponent,
  });
  return deltas.get("me") ?? 0;
}

/** Simulate one player across DAYS days of unbroken daily play. */
function run(player, { startDay = 1 } = {}) {
  let profile = freshProfile(player.name);
  const rows = [];
  let streak = 0;
  for (let day = startDay; day <= DAYS; day++) {
    streak++;
    const guessers = guessersOnDay(day);
    const fooled = player.fooledPerWord(guessers);
    const results = Array.from({ length: BATCH.wordsPerDay }, (_, i) => i < player.correctPerDay);
    const { points: guessPts } = scoreGuesses(results, { guessScoreByCorrectCount: SCORING.guessScoreByCorrectCount });
    const bluffPts = bluffPointsForWord(fooled) * BATCH.wordsPerDay;
    const base = guessPts + bluffPts;
    const pct = streakBonusPct(streak);
    const shown = effectivePoints(profile, applyStreakBonus(base, pct));
    profile = creditPoints(profile, { dayKey: `d${day}`, points: shown });
    rows.push({ day, guessers, fooled, guessPts, bluffPts, pct, shown, total: totalPoints(profile) });
  }
  return rows;
}

const fmt = (n) => new Intl.NumberFormat("en-US").format(n);
function table(rows, days) {
  const out = [
    "| Day | Guessers/word | Fooled/word | Guess pts | Bluff pts (3 words) | Streak bonus | That day's points | **Total** |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows.filter((r) => days.includes(r.day))) {
    out.push(`| ${r.day} | ${r.guessers} | ${r.fooled} | ${r.guessPts} | ${r.bluffPts} | +${r.pct}% | +${r.shown} | **${fmt(r.total)}** |`);
  }
  return out.join("\n");
}

const SHOWN_DAYS = [1, 3, 7, 10, 11, 15, 20, 21, 25, 30];
for (const player of PLAYERS) {
  const rows = run(player);
  console.log(`\n### ${player.name}\n`);
  console.log(table(rows, SHOWN_DAYS));
  const perDay = Math.round(rows.reduce((s, r) => s + r.shown, 0) / rows.length);
  console.log(`\n_Average ${perDay} points/day over the 30 days; ${fmt(rows.at(-1).total)} total._`);
}

// The catch-up case: same skill as Pro, but starting on day 21.
const veteran = run(PLAYERS[2]);
const newcomer = run(PLAYERS[2], { startDay: 21 });
console.log("\n### A new, equally-skilled player joins on day 21\n");
console.log("| Calendar day | Newcomer's points that day | **Newcomer total** | **Veteran total** |");
console.log("|---|---|---|---|");
for (const r of newcomer) {
  if (![21, 23, 25, 30].includes(r.day)) continue;
  const vet = veteran.find((v) => v.day === r.day);
  console.log(`| ${r.day} | +${r.shown} | **${fmt(r.total)}** | **${fmt(vet.total)}** |`);
}
