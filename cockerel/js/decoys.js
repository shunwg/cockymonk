// decoys.js — ports the nearness-matching bot-decoy algorithm from
// Ordkrig's src/bots/answerPool.ts + src/bots/botBrain.ts (see CLAUDE.md
// Provenance). Norwegian-only port (this app has no English mode).
//
// Matching rules, same as the original:
//  - same word class as the target (verb -> verb explanations, etc.)
//  - length band: a short truth is camouflaged with short decoys (and vice versa)
//  - "learned" words (Latin/Greek-ish) get 1-2 learned decoys, never all
//  - a decoy is NEVER identical to the truth
//
// Randomness is injected (rng: () => number in [0,1)) rather than bare
// Math.random, so this is unit-testable — same discipline as engine.js.

const STOP = new Set([
  "som", "eller", "og", "med", "uten", "for", "til", "fra", "ved", "etter", "over", "under",
  "mellom", "den", "det", "de", "ikke", "noe", "noen", "være", "blir", "bli", "har", "kan",
  "skal", "vil", "seg", "sin", "sitt", "sine", "om", "mot", "hos", "enn", "mer", "mest",
  "mindre", "svært", "helt", "bare", "også", "slik", "dette", "denne", "disse", "man", "hver",
  "alle", "andre", "annet", "annen", "eldre", "betegnelse", "særlig", "ofte", "gjerne", "brukt",
  "type", "form", "slags", "del", "stor", "store", "liten", "lite", "små", "person", "gjelder",
]);

const LEARNED = /(sjon|isme|itet|logi|ikk|ium|isk|ent|ant|ase|ose|yse)$/;
const isLearned = (w) => LEARNED.test(w);
const wcOf = (tags) => tags?.find((t) => t === "subst" || t === "adj" || t === "verb");
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-zæøå0-9]/g, "");
const SHORT_BAND = 25;

export function contentWords(text) {
  return (String(text ?? "").toLowerCase().match(/[a-zæøå]{4,}/g) ?? [])
    .filter((w) => !STOP.has(w));
}

// Data-driven first-word -> dominant word-class map, built once from the pool.
let firstWordMapCache = null;
function firstWordMap(pool) {
  if (firstWordMapCache) return firstWordMapCache;
  const counts = new Map();
  for (const r of pool) {
    const fw = r.definition.toLowerCase().match(/^[a-zæøå]+/)?.[0];
    if (!fw) continue;
    const c = counts.get(fw) ?? { subst: 0, verb: 0, adj: 0 };
    c[r.wc]++;
    counts.set(fw, c);
  }
  const m = new Map();
  for (const [fw, c] of counts) {
    const total = c.subst + c.verb + c.adj;
    if (total < 3) continue;
    for (const wc of ["subst", "verb", "adj"]) {
      if (c[wc] / total >= 0.7) { m.set(fw, wc); break; }
    }
  }
  firstWordMapCache = m;
  return m;
}

// Word-class style of arbitrary definition text (also real player submissions).
// null = unsure.
export function classifyDefinition(text, pool) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^å\s/.test(t)) return "verb";
  if (/^(som|preget av|uten|karakterisert|kjennetegnet|full av)\b/.test(t)) return "adj";
  const fw = t.match(/^[a-zæøå]+/)?.[0];
  if (fw) {
    const mapped = firstWordMap(pool).get(fw);
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Pick `count` distinct fake definitions styled like `target` ({word, definition, tags}).
 * ~Half are chosen by a closeness score (matches "half-close, never all-close" —
 * see shunwg PRD §9.1: an all-close pool inverts the leak instead of fixing it).
 */
export function getFakeExplanations(target, count, pool, rng = Math.random) {
  const targetDef = target.definition ?? "";
  const targetWc = wcOf(target.tags) ?? classifyDefinition(targetDef, pool) ?? undefined;
  const targetWords = new Set(contentWords(targetDef));
  const targetDefKey = norm(targetDef);
  const firstLetter = (target.word[0] ?? "").toLowerCase();
  const prefix2 = target.word.slice(0, 2).toLowerCase();
  const targetShort = targetDef.length < SHORT_BAND;
  const targetLearned = isLearned(target.word);

  // Exclude the target word itself and any decoy identical to the truth.
  const candidatePool = pool.filter((r) => r.word !== target.word && norm(r.definition) !== targetDefKey);

  const sameWc = targetWc ? candidatePool.filter((r) => r.wc === targetWc) : candidatePool;
  const base = sameWc.length >= count * 3 ? sameWc : candidatePool;

  const closeness = (r) => {
    let s = rng();
    if (r.word[0]?.toLowerCase() === firstLetter) s += 1.5;
    if (r.word.slice(0, 2).toLowerCase() === prefix2) s += 1;
    if (targetShort && r.definition.length < SHORT_BAND && r.definition[0]?.toLowerCase() === firstLetter) s += 2.5;
    const ratio = r.definition.length / Math.max(1, targetDef.length);
    if (ratio > 0.6 && ratio < 1.6) s += 1;
    if (isLearned(r.word) === targetLearned) s += 0.5;
    if (targetWords.size) {
      let shared = 0;
      for (const w of contentWords(r.definition)) if (targetWords.has(w)) shared++;
      s += Math.min(2, shared) * 1.1;
    }
    return s;
  };

  const takeRandom = (arr, n, into) => {
    const c = arr.filter((x) => !into.includes(x));
    for (let i = 0; i < n && c.length; i++) {
      into.push(c.splice(Math.floor(rng() * c.length), 1)[0]);
    }
  };

  const nClose = Math.ceil(count / 2);
  const picks = base
    .map((r) => ({ r, s: closeness(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, nClose)
    .map((x) => x.r);

  const sameBand = base.filter((r) => (r.definition.length < SHORT_BAND) === targetShort);
  takeRandom(sameBand, Math.max(0, count - picks.length), picks);
  takeRandom(base, Math.max(0, count - picks.length), picks);
  if (picks.length < count) takeRandom(candidatePool, count - picks.length, picks); // emergency fill

  return shuffle(picks, rng).map((r) => r.definition);
}

function shuffle(arr, rng) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}
