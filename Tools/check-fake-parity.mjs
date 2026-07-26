#!/usr/bin/env node
// check-fake-parity.mjs — is the truth distinguishable from a bot fake WITHOUT
// knowing any Norwegian? Zero dependencies, cross-platform.
//
//   node Tools/check-fake-parity.mjs           → report both languages
//   node Tools/check-fake-parity.mjs --check   → exit 1 if any gate fails
//
// WHY THIS EXISTS
// The deck's truths and the bot fake pools were written to different specs:
// truths up to 140 chars and built to sound surprising (PRD §9), fakes "generic"
// one-liners at ≤120. Nobody chose the consequence — the two sets ended up with
// different surface-form distributions, and surface form is readable by someone
// who speaks no Norwegian at all. When first measured, "always vote for the
// longest option" won 87.3% of a 4-option practice lineup against 25% chance.
// A player who notices that never has to know a word again.
//
// This is the MECHANICAL half of the bluff-plausibility skill. Semantic
// plausibility is a judgement call and lives in the skill; length and
// punctuation are regex-checkable and therefore live here. Keep it that way.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LANGS = ["nb", "en"];

// A lineup is 1 truth + N fakes. 4 is the practice-mode default (you + 3 bots).
const LINEUP = 4;
const TRIALS = 20000;

// Gates. A surface-only strategy should do no better than a coin-toss-ish read
// of a 4-option lineup. Chance is 25%; we allow a little slack for the fact that
// truths legitimately carry more information than a generic fake.
const GATES = Object.freeze({
  MAX_SURFACE_WIN: 0.40,   // best surface-only strategy must win under 40%
  MAX_MEAN_GAP: 12,        // |mean(truth) − mean(fake)| in characters
  MAX_MARKER_GAP: 0.25,    // per-marker rate gap, e.g. colon in 29% vs 0%
});

const MARKERS = Object.freeze({
  'colon ": "': (s) => /: /.test(s),
  "dash": (s) => /[–—-] /.test(s),
  "comma": (s) => /,/.test(s),
  "2+ clauses": (s) => (s.match(/[,:;–—]/g) ?? []).length >= 2,
  "parenthesis": (s) => /\(/.test(s),
});

// Strategies that need ZERO language knowledge. If any of these beats the gate,
// the content leaks. Each takes a shuffled lineup and returns its pick.
const STRATEGIES = Object.freeze({
  "longest option": (l) => l.reduce((a, b) => (b.text.length > a.text.length ? b : a)),
  "shortest option": (l) => l.reduce((a, b) => (b.text.length < a.text.length ? b : a)),
  "most punctuation": (l) => l.reduce((a, b) =>
    ((b.text.match(/[,:;–—]/g) ?? []).length > (a.text.match(/[,:;–—]/g) ?? []).length ? b : a)),
  "has colon or dash": (l) => l.find((o) => /: |[–—-] /.test(o.text)) ?? l[0],
  "most words": (l) => l.reduce((a, b) => (b.text.split(/\s+/).length > a.text.split(/\s+/).length ? b : a)),
});

// Deterministic PRNG: a parity report that changes between runs is not a gate.
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const arrayIn = (o) => (Array.isArray(o) ? o : Object.values(o).find(Array.isArray) ?? []);

async function loadLang(lang) {
  const read = async (p) => JSON.parse(await readFile(join(ROOT, "Resources", p), "utf8"));
  const truths = arrayIn(await read(`deck_${lang}.json`)).map((c) => c.truth).filter(Boolean);
  const fakes = arrayIn(await read(`fakes_${lang}.json`)).map((f) => f.text).filter(Boolean);
  return { truths, fakes };
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const rate = (a, f) => a.filter(f).length / (a.length || 1);
const pct = (x) => (100 * x).toFixed(1).padStart(5) + "%";

function simulate({ truths, fakes }, strategy, rng) {
  let hits = 0;
  for (let i = 0; i < TRIALS; i++) {
    const lineup = [{ text: truths[Math.floor(rng() * truths.length)], truth: true }];
    const pool = [...fakes];
    while (lineup.length < LINEUP && pool.length) {
      lineup.push({ text: pool.splice(Math.floor(rng() * pool.length), 1)[0], truth: false });
    }
    for (let j = lineup.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [lineup[j], lineup[k]] = [lineup[k], lineup[j]];
    }
    if (strategy(lineup).truth) hits++;
  }
  return hits / TRIALS;
}

async function main() {
  const check = process.argv.includes("--check");
  let failures = 0;

  for (const lang of LANGS) {
    let data;
    try { data = await loadLang(lang); }
    catch { console.log(`\n${lang}: no deck/fakes pair — skipped\n`); continue; }

    const { truths, fakes } = data;
    if (truths.length < 5 || fakes.length < 5) { console.log(`\n${lang}: too little content — skipped\n`); continue; }

    console.log(`\n=== ${lang} — ${truths.length} truths vs ${fakes.length} fakes ===\n`);

    const tl = truths.map((s) => s.length), fl = fakes.map((s) => s.length);
    const gap = Math.abs(mean(tl) - mean(fl));
    const lenOk = gap <= GATES.MAX_MEAN_GAP;
    if (!lenOk) failures++;
    console.log(`length   truths mean ${mean(tl).toFixed(0)}  fakes mean ${mean(fl).toFixed(0)}  ` +
                `gap ${gap.toFixed(0)} (max ${GATES.MAX_MEAN_GAP})  ${lenOk ? "ok" : "FAIL"}`);

    console.log("\nmarker            truths   fakes     gap");
    for (const [name, fn] of Object.entries(MARKERS)) {
      const t = rate(truths, fn), f = rate(fakes, fn), d = Math.abs(t - f);
      const ok = d <= GATES.MAX_MARKER_GAP;
      if (!ok) failures++;
      console.log(`${name.padEnd(17)} ${pct(t)}  ${pct(f)}  ${pct(d)}  ${ok ? "ok" : "FAIL"}`);
    }

    console.log(`\nsurface-only strategy (${LINEUP}-option lineup, chance = ${(100 / LINEUP).toFixed(1)}%)`);
    let worst = 0, worstName = "";
    for (const [name, fn] of Object.entries(STRATEGIES)) {
      const win = simulate(data, fn, mulberry(0xC0CC1));
      if (win > worst) { worst = win; worstName = name; }
      console.log(`  ${name.padEnd(19)} ${pct(win)}`);
    }
    const surfaceOk = worst <= GATES.MAX_SURFACE_WIN;
    if (!surfaceOk) failures++;
    console.log(`\n  best exploit: "${worstName}" at ${pct(worst)} ` +
                `(max ${pct(GATES.MAX_SURFACE_WIN)})  ${surfaceOk ? "ok" : "FAIL"}`);
    if (!surfaceOk) {
      console.log(`  → a player who never learns a word wins ${pct(worst)} of rounds.`);
      console.log(`  → fix by moving the FAKES toward the truths, never the reverse:`);
      console.log(`    the deck is the game's voice and must not be flattened to hide a leak.`);
    }
  }

  if (check && failures) {
    console.error(`\ncheck-fake-parity: ${failures} gate(s) failed.`);
    console.error("See .claude/skills/bluff-plausibility/SKILL.md for how to close them.");
    process.exit(1);
  }
  console.log(check ? "\ncheck-fake-parity: all gates pass\n" : "");
}

main().catch((e) => { console.error("check-fake-parity failed:", e); process.exit(1); });
