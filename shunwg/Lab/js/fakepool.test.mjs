// fakepool.test.mjs — gate for segment 7 (bots). Zero dependencies.
//   node --test Lab/js/fakepool.test.mjs
//
// The last test is the one that matters: it plays the real nb deck through the
// real selector and asserts that "vote for the longest option" stops working.
// Everything above it exists so that when that assertion fails, the reason is
// obvious from which other test failed with it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { FAKEPOOL, contentWords, isLearned, closeness, safePool, pickFakes } from "./fakepool.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

// Seeded PRNG so a failure is reproducible. Same generator as check-fake-parity.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const card = (prompt, truth) => ({ prompt, truth });
const deckOf = (n, len = 70) =>
  Array.from({ length: n }, (_, i) => card(`ord${i}`, `Forklaring nummer ${i} `.padEnd(len, "x")));

/* ---------- contentWords ---------- */

test("contentWords keeps 4+ char meaning words and drops stopwords", () => {
  const w = contentWords("Gammelt mål for ved som brukt til fyring", "nb");
  assert.ok(w.has("fyring"), "kept a content word");
  assert.ok(!w.has("brukt"), "dropped lexicographer filler 'brukt'");
  assert.ok(!w.has("som"), "dropped the stopword 'som'");
  assert.ok(!w.has("mål"), "dropped a 3-char token");
});

test("contentWords is language-aware", () => {
  assert.ok(!contentWords("A kind of thing used especially for rope", "en").has("especially"));
  // 'especially' is not a Norwegian stopword, so nb keeps it — proving the switch works
  assert.ok(contentWords("A kind of thing used especially for rope", "nb").has("especially"));
});

/* ---------- isLearned ---------- */

test("isLearned separates latinate from folk morphology", () => {
  assert.equal(isLearned("konfirmasjon", "nb"), true);
  assert.equal(isLearned("kjølsvin", "nb"), false);
  assert.equal(isLearned("horripilation", "en"), true);   // real deck word
  assert.equal(isLearned("champerty", "en"), false);      // real deck word
});

// These four are why LEARNED was narrowed: Ordkrig's suffix list tagged all of
// them as latinate, and every one is an ordinary Norwegian word. A register
// signal that is wrong more often than right actively degrades the ranking.
test("isLearned does not mistake ordinary Norwegian endings for latinate ones", () => {
  for (const w of ["boknafisk", "havblikk", "aur", "lur"]) {
    assert.equal(isLearned(w, "nb"), false, `${w} is folk Norwegian, not learned`);
  }
});

test("isLearned ignores words too short to carry a latinate suffix", () => {
  assert.equal(isLearned("ase", "nb"), false, "3 chars cannot be a latinate loan");
  assert.equal(isLearned("", "nb"), false);
  assert.equal(isLearned(null, "nb"), false);
});

/* ---------- safePool ---------- */

test("safePool bars the card in play, played cards, and imminent draws", () => {
  const deck = deckOf(30);
  // remaining = the 20 unplayed; ui.js pops from the END, so the tail is next up
  const remaining = deck.slice(0, 20);
  const inPlay = remaining[5];
  const pool = safePool({ deck, remaining, card: inPlay, lookahead: 4 });
  const names = new Set(pool.map((c) => c.prompt));

  assert.ok(!names.has(inPlay.prompt), "the word being defined cannot be its own decoy");
  for (const played of deck.slice(20)) {
    assert.ok(!names.has(played.prompt), `already played: ${played.prompt}`);
  }
  for (const soon of remaining.slice(-4)) {
    assert.ok(!names.has(soon.prompt), `about to be drawn: ${soon.prompt}`);
  }
  assert.equal(pool.length, 15, "20 unplayed − 4 imminent − 1 in play");
});

test("safePool survives an empty deck and a missing card", () => {
  assert.deepEqual(safePool({ deck: [], remaining: [], card: null }), []);
  assert.deepEqual(safePool({ deck: undefined, remaining: undefined, card: undefined }), []);
});

// The lookahead must RELAX on a small deck, not starve it. state.js's file://
// mini-deck is six cards, so a fixed 16-card exclusion would return an empty
// pool, send every fake to the hand-written filler, and restore the 87% leak in
// the one build nobody runs tests against.
test("safePool relaxes its lookahead rather than starving a small deck", () => {
  const deck = deckOf(5);
  const pool = safePool({ deck, remaining: deck, card: deck[0], lookahead: 999 });
  assert.equal(pool.length, 4, "all four other cards remain usable");
  assert.ok(!pool.some((c) => c.prompt === deck[0].prompt));
});

test("safePool on the real file:// mini-deck still yields candidates", async () => {
  const { MINI_DECK } = await import("./state.js");
  for (const lang of ["nb", "en"]) {
    const deck = MINI_DECK[lang];
    const pool = safePool({ deck, remaining: deck, card: deck[0] });
    assert.ok(pool.length >= deck.length - 2,
      `${lang} mini-deck (${deck.length} cards) gave only ${pool.length} candidates — ` +
      "the lookahead is starving it and every fake will come from the filler");
  }
});

test("safePool honours minPool when the deck is big enough to afford the lookahead", () => {
  const deck = deckOf(60);
  const pool = safePool({ deck, remaining: deck, card: deck[0], lookahead: 16, minPool: 12 });
  assert.equal(pool.length, 60 - 16 - 1, "full lookahead applied: no relaxation needed");
});

/* ---------- closeness ---------- */

test("closeness rewards a length near the truth's", () => {
  const rng = () => 0;                                    // kill the jitter term
  const target = card("dvergmål", "x".repeat(80));
  const near = closeness(card("zzz", "y".repeat(80)), { card: target, rng });
  const far = closeness(card("zzz", "y".repeat(300)), { card: target, rng });
  assert.ok(near > far, `near=${near} should beat far=${far}`);
});

test("closeness rewards a shared initial and a shared 2-char prefix", () => {
  const rng = () => 0;
  const target = card("dvergmål", "x".repeat(80));
  const shared = closeness(card("dvask", "y".repeat(80)), { card: target, rng });
  const unrelated = closeness(card("krel", "y".repeat(80)), { card: target, rng });
  assert.ok(shared > unrelated, "dv- should score above k-");
});

test("closeness rewards shared theme words, capped", () => {
  const rng = () => 0;
  const target = card("kjølsvin", "Stokken som ligger oppå kjølen på et skip og forsterker skroget");
  const themed = closeness(card("a", "Skip med forsterket skroget for iskjøring i nordlige farvann"), { card: target, rng });
  const plain = closeness(card("a", "Tiden like før daggry når selv hanen fortsatt sover godt i fjøs"), { card: target, rng });
  assert.ok(themed > plain, `themed=${themed} should beat plain=${plain}`);
  assert.ok(themed - plain <= FAKEPOOL.THEME_CAP * FAKEPOOL.W_THEME + 1e-9, "theme bonus is capped");
});

/* ---------- pickFakes ---------- */

test("pickFakes returns exactly n, with no duplicates and never the truth in play", () => {
  const deck = deckOf(40);
  const inPlay = deck[0];
  const pool = safePool({ deck, remaining: deck, card: inPlay, lookahead: 0 });
  for (const n of [1, 3, 7]) {
    const out = pickFakes({ n, card: inPlay, pool, rng: mulberry32(7) });
    assert.equal(out.length, n, `asked for ${n}`);
    assert.equal(new Set(out).size, n, "no repeats inside one round");
    assert.ok(!out.includes(inPlay.truth), "the truth is never offered as a lie");
  }
});

test("pickFakes(0) is empty and pickFakes tolerates a null pool", () => {
  assert.deepEqual(pickFakes({ n: 0, card: card("a", "b"), pool: [] }), []);
  const out = pickFakes({ n: 2, card: card("a", "b"), pool: null, filler: ["f1", "f2"] });
  assert.deepEqual(out.sort(), ["f1", "f2"]);
});

test("pickFakes falls back to filler only when the deck runs out, then to an ellipsis", () => {
  const deck = deckOf(3);
  const inPlay = deck[0];
  const pool = safePool({ deck, remaining: deck, card: inPlay, lookahead: 0 }); // 2 usable
  const out = pickFakes({ n: 4, card: inPlay, pool, filler: ["FILLER"], rng: mulberry32(3) });
  assert.equal(out.length, 4);
  assert.equal(out.filter((t) => t === "FILLER").length, 1, "filler used once");
  assert.equal(out.filter((t) => t === "…").length, 1, "last resort never leaks undefined");
  assert.ok(out.filter((t) => t.startsWith("Forklaring")).length === 2, "both deck candidates used first");
});

test("pickFakes is deterministic for a given seed and varies across seeds", () => {
  const deck = deckOf(60);
  const inPlay = deck[0];
  const pool = safePool({ deck, remaining: deck, card: inPlay, lookahead: 0 });
  const a = pickFakes({ n: 4, card: inPlay, pool, rng: mulberry32(11) });
  const b = pickFakes({ n: 4, card: inPlay, pool, rng: mulberry32(11) });
  const c = pickFakes({ n: 4, card: inPlay, pool, rng: mulberry32(12) });
  assert.deepEqual(a, b, "same seed → same lineup");
  assert.notDeepEqual(a, c, "different seed → different lineup");
});

// Principle 8 of the game-feel skill: uniform camouflage recreates the leak.
test("a lineup is NOT all-close — the random half really is random", () => {
  // A deck where closeness is decidable by inspection: half the candidates share
  // the target's initial AND its length, half share neither.
  const target = card("dvergmål", "D".repeat(80));
  const close = Array.from({ length: 20 }, (_, i) => card(`dv${i}`, "x".repeat(80)));
  const far = Array.from({ length: 20 }, (_, i) => card(`zz${i}`, "y".repeat(400)));
  const pool = [...close, ...far];

  let sawFar = 0, sawClose = 0, rounds = 400;
  for (let s = 0; s < rounds; s++) {
    const out = pickFakes({ n: 4, card: target, pool, rng: mulberry32(s) });
    if (out.some((t) => t.length === 400)) sawFar++;
    if (out.some((t) => t.length === 80)) sawClose++;
  }
  // n=4 → ceil(4·0.5)=2 close picks, then 2 drawn uniformly from the 38 left
  // (18 close + 20 far), so P(at least one far) = 1 − C(18,2)/C(38,2) ≈ 78%.
  // The band below is deliberately loose: this test defends the DESIGN (the
  // random half is genuinely random), not a tuned constant.
  assert.ok(sawFar / rounds > 0.6 && sawFar / rounds < 0.95,
    `a far candidate should appear in most but not all lineups (saw ${sawFar}/${rounds}); ` +
    "at ~1.0 the random half has become close-biased, at <0.6 CLOSE_SHARE has crept toward 1 " +
    "and the truth is the odd one out again");
  assert.equal(sawClose, rounds, "every lineup should still contain at least one close pick");
});

/* ---------- the headline: surface parity on the real deck ---------- */

for (const lang of ["nb", "en"]) {
  test(`real ${lang} deck: the truth is no longer identifiable by length alone`, async () => {
    const raw = await readFile(join(ROOT, `Resources/deck_${lang}.json`), "utf8");
    const deck = JSON.parse(raw).cards.map((c) => card(c.prompt, c.truth));
    const filler = JSON.parse(await readFile(join(ROOT, `Resources/fakes_${lang}.json`), "utf8"))
      .fakes.map((f) => f.text);

    const TRIALS = 3000, LINEUP = 4;               // you + 3 bots, the practice default
    let longestWins = 0, mostPunctWins = 0, usedFiller = 0;

    for (let t = 0; t < TRIALS; t++) {
      const rng = mulberry32(t + 1);
      const inPlay = deck[Math.floor(rng() * deck.length)];
      const pool = safePool({ deck, remaining: deck, card: inPlay });
      const fakes = pickFakes({ n: LINEUP - 1, card: inPlay, pool, filler, lang, rng });
      if (fakes.some((f) => filler.includes(f))) usedFiller++;

      // SHUFFLE before measuring, exactly as Tools/check-fake-parity.mjs does.
      // Without it the truth sits at index 0 and `reduce` — which keeps the
      // incumbent on a tie — hands it every tie for free. That matters here and
      // not in theory: mean punctuation across the deck is 1.25 marks, so most
      // lineups tie, and the unshuffled metric reports ~46% for a lineup drawn
      // entirely from one distribution, where the true answer is chance.
      const lineup = [{ text: inPlay.truth, truth: true },
                      ...fakes.map((text) => ({ text, truth: false }))];
      for (let j = lineup.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [lineup[j], lineup[k]] = [lineup[k], lineup[j]];
      }
      const punct = (s) => (s.match(/[,;:–—-]/g) ?? []).length;
      const argmax = (f) => lineup.reduce((best, o) => (f(o.text) > f(best.text) ? o : best));
      if (argmax((s) => s.length).truth) longestWins++;
      if (argmax(punct).truth) mostPunctWins++;
    }

    const pct = (n) => (100 * n) / TRIALS;
    const chance = 100 / LINEUP;
    console.log(`  ${lang}: longest ${pct(longestWins).toFixed(1)}% · most-punctuation ` +
      `${pct(mostPunctWins).toFixed(1)}% · chance ${chance}% · filler used in ${pct(usedFiller).toFixed(1)}%`);

    // Same ceiling as Tools/check-fake-parity.mjs. Comfortably above chance is
    // fine and even desirable — a real definition IS a little richer than the
    // rest of the deck on average. What must not survive is a winning strategy.
    assert.ok(pct(longestWins) < 40,
      `"longest option" wins ${pct(longestWins).toFixed(1)}% — must stay under 40%`);
    assert.ok(pct(mostPunctWins) < 40,
      `"most punctuation" wins ${pct(mostPunctWins).toFixed(1)}% — must stay under 40%`);
    assert.equal(usedFiller, 0,
      "a full deck must never need the hand-written filler; it is the file:// safety net only");
  });
}
