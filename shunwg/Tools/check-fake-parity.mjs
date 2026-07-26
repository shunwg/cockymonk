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
// longest option" won 87.2% nb / 65.6% en of a 4-option practice lineup against
// 25% chance. A player who noticed that never had to know a word again.
//
// 2026-07-26 — WHAT CHANGED
// Lab/js/fakepool.js now builds a bot's lie from another deck card's own
// explanation (the Ordkrig method), so surface form matches by construction.
// Measured after: nb 26.2%, en 25.1%. Two consequences for this file:
//
//   1. The gated simulation runs the SHIPPED selector on the real deck, not a
//      draw from fakes_*.json. Measuring the old static pools would now test a
//      path players never see while the live one went unchecked.
//   2. The length/marker tables are informational. The live gaps are zero by
//      arithmetic, so there is nothing left to gate there — but the numbers are
//      the clearest surviving statement of what the leak was.
//
// Semantic plausibility is a judgement call and does not live here; this file
// only measures what a regex can see. Keep it that way.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { safePool, pickFakes } from "../Lab/js/fakepool.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LANGS = ["nb", "en"];


// A lineup is 1 truth + N fakes. 4 is the practice-mode default (you + 3 bots).
const LINEUP = 4;
const TRIALS = 20000;

// The gate. A surface-only strategy should do no better than a coin-toss-ish
// read of a 4-option lineup. Chance is 25%; the slack allows for a real
// explanation being legitimately a shade richer than the deck average.
// (MAX_MEAN_GAP and MAX_MARKER_GAP were retired on 2026-07-26 — see the header:
// the live gaps are zero by construction, so they gated nothing.)
const GATES = Object.freeze({
  MAX_SURFACE_WIN: 0.40,
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
  const cards = arrayIn(await read(`deck_${lang}.json`))
    .filter((c) => c?.prompt && c?.truth)
    .map((c) => ({ prompt: c.prompt, truth: c.truth }));
  const truths = cards.map((c) => c.truth);
  const fakes = arrayIn(await read(`fakes_${lang}.json`)).map((f) => f.text).filter(Boolean);
  return { cards, truths, fakes };
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const rate = (a, f) => a.filter(f).length / (a.length || 1);
const pct = (x) => (100 * x).toFixed(1).padStart(5) + "%";

// Shuffling before the strategy runs is load-bearing, not tidiness. Every
// strategy is a `reduce` that keeps the incumbent on a tie, so an unshuffled
// lineup with the truth at index 0 hands it every tie for free. On this deck the
// mean punctuation count is 1.25 marks, so ties are the common case, and the
// unshuffled metric reports ~46% for a lineup drawn entirely from ONE
// distribution — where the honest answer is chance.
function shuffleIn(lineup, rng) {
  for (let j = lineup.length - 1; j > 0; j--) {
    const k = Math.floor(rng() * (j + 1));
    [lineup[j], lineup[k]] = [lineup[k], lineup[j]];
  }
  return lineup;
}

// THE REAL GATE: the lineup a player actually faces, built by the shipped
// selector. Before 2026-07-26 this function drew from fakes_*.json, which is now
// only the file:// safety net — measuring it would test a code path almost
// nobody plays while the live one went unchecked.
function simulateRuntime({ cards, fakes }, strategy, rng, lang) {
  let hits = 0;
  for (let i = 0; i < TRIALS; i++) {
    const card = cards[Math.floor(rng() * cards.length)];
    const pool = safePool({ deck: cards, remaining: cards, card });
    const lies = pickFakes({ n: LINEUP - 1, card, pool, filler: fakes, lang, rng });
    const lineup = shuffleIn(
      [{ text: card.truth, truth: true }, ...lies.map((text) => ({ text, truth: false }))], rng);
    if (strategy(lineup).truth) hits++;
  }
  return hits / TRIALS;
}

// How often the hand-written filler is reached at all. Answering this is the
// point: on a 6-card mini-deck safePool still returns ~5 candidates and a
// 4-option lineup needs 3, so fakes_*.json turns out to be all but unreachable.
// Print the number rather than asserting it, so the day someone shrinks the
// mini-deck to three cards the report says so instead of going quietly wrong.
function fillerReach({ cards, fakes }, rng, lang) {
  let used = 0;
  const filler = new Set(fakes);
  for (let i = 0; i < TRIALS; i++) {
    const card = cards[Math.floor(rng() * cards.length)];
    const pool = safePool({ deck: cards, remaining: cards, card });
    const lies = pickFakes({ n: LINEUP - 1, card, pool, filler: fakes, lang, rng });
    if (lies.some((l) => filler.has(l) || l === "…")) used++;
  }
  return used / TRIALS;
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

    // These two sections compare the deck against the hand-written filler pool.
    // They are INFORMATIONAL and no longer fail the build: since 2026-07-26 a
    // live fake is another card's own explanation, so the live length and marker
    // gaps are zero by construction and there is nothing here to gate. Kept
    // because the numbers are the clearest statement of why the old design
    // leaked — a 27-character mean gap is what "vote for the longest option"
    // was reading — and because a future filler rewrite wants a before/after.
    const tl = truths.map((s) => s.length), fl = fakes.map((s) => s.length);
    const gap = Math.abs(mean(tl) - mean(fl));
    console.log(`length   truths mean ${mean(tl).toFixed(0)}  filler mean ${mean(fl).toFixed(0)}  ` +
                `gap ${gap.toFixed(0)}  (informational; live gap is 0 by construction)`);

    console.log("\nmarker            truths  filler     gap   (informational)");
    for (const [name, fn] of Object.entries(MARKERS)) {
      const t = rate(truths, fn), f = rate(fakes, fn), d = Math.abs(t - f);
      console.log(`${name.padEnd(17)} ${pct(t)}  ${pct(f)}  ${pct(d)}`);
    }

    const chance = (100 / LINEUP).toFixed(1);
    console.log(`\nLIVE LINEUP — fakepool.js on the real deck (${LINEUP} options, chance ${chance}%)`);

    let worst = 0, worstName = "";
    for (const [name, fn] of Object.entries(STRATEGIES)) {
      const win = simulateRuntime(data, fn, mulberry(0xC0CC1), lang);
      if (win > worst) { worst = win; worstName = name; }
      console.log(`  ${name.padEnd(19)} ${pct(win)}`);
    }
    const ok = worst <= GATES.MAX_SURFACE_WIN;
    if (!ok) failures++;
    console.log(`\n  best exploit: "${worstName}" at ${pct(worst)} ` +
                `(max ${pct(GATES.MAX_SURFACE_WIN)})  ${ok ? "ok" : "FAIL"}`);
    if (!ok) {
      console.log(`  → a player who never learns a word wins ${pct(worst)} of rounds.`);
      console.log("  → fakepool.js is not doing its job: check CLOSE_SHARE, the length");
      console.log("    terms in closeness(), and that safePool() is not starving.");
    }

    const reach = fillerReach(data, mulberry(0xF11), lang);
    console.log(`\nfiller reach   fakes_${lang}.json supplied a lie in ${pct(reach)} of lineups`);
    if (reach === 0) {
      console.log(`  → never reached. The deck self-supplies, so the hand-written pool is a`);
      console.log(`    safety net for a deck of <${LINEUP} cards and nothing else. Its ${
        Math.abs(mean(truths.map((s) => s.length)) - mean(fakes.map((s) => s.length))).toFixed(0)
      }-char`);
      console.log("    mismatch above is therefore inert — do not spend a content pass on it.");
    } else {
      console.log("  → reachable, so the filler's surface form matters after all. The marker");
      console.log("    table above is then a real defect, not a historical note.");
    }
  }

  if (check && failures) {
    console.error(`\ncheck-fake-parity: ${failures} gate(s) failed.`);
    console.error("The selector is Lab/js/fakepool.js; its own gate is");
    console.error("`node --test Lab/js/fakepool.test.mjs`, which localises the cause.");
    process.exit(1);
  }
  console.log(check ? "\ncheck-fake-parity: all gates pass\n" : "");
}

main().catch((e) => { console.error("check-fake-parity failed:", e); process.exit(1); });
