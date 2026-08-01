// decoys.js — ports the nearness-matching bot-decoy algorithm from
// Ordkrig's src/bots/answerPool.ts + src/bots/botBrain.ts (see CLAUDE.md
// Provenance). The CORE algorithm (closeness scoring, half-close pool
// selection, shuffling) is language-agnostic; the LINGUISTIC heuristics it
// leans on (stop words, "learned/Latinate" word suffixes, verb/adjective
// definition-prefix detection, alphabet) are not — see LANG_PROFILES below,
// one entry per js/config.js LANGS. `no` is the original Norwegian tuning,
// unchanged in behavior; `en` is a genuine (if inevitably rougher, given the
// much smaller placeholder corpus) adaptation of the same ideas for English
// dictionary-style definitions.
//
// Matching rules, same as the original:
//  - same word class as the target (verb -> verb explanations, etc.)
//  - length band: a short truth is camouflaged with short decoys (and vice versa)
//  - "learned" words (Latin/Greek-ish) get 1-2 learned decoys, never all
//  - a decoy is NEVER identical to the truth
//
// Randomness is injected (rng: () => number in [0,1)) rather than bare
// Math.random, so this is unit-testable — same discipline as engine.js.

export const LANG_PROFILES = {
  no: {
    stopWords: new Set([
      "som", "eller", "og", "med", "uten", "for", "til", "fra", "ved", "etter", "over", "under",
      "mellom", "den", "det", "de", "ikke", "noe", "noen", "være", "blir", "bli", "har", "kan",
      "skal", "vil", "seg", "sin", "sitt", "sine", "om", "mot", "hos", "enn", "mer", "mest",
      "mindre", "svært", "helt", "bare", "også", "slik", "dette", "denne", "disse", "man", "hver",
      "alle", "andre", "annet", "annen", "eldre", "betegnelse", "særlig", "ofte", "gjerne", "brukt",
      "type", "form", "slags", "del", "stor", "store", "liten", "lite", "små", "person", "gjelder",
    ]),
    learnedSuffix: /(sjon|isme|itet|logi|ikk|ium|isk|ent|ant|ase|ose|yse)$/,
    alphabetStrip: /[^a-zæøå0-9]/g,
    contentWordPattern: /[a-zæøå]{4,}/g,
    verbPrefix: /^å\s/,
    adjPrefixes: /^(som|preget av|uten|karakterisert|kjennetegnet|full av)\b/,
  },
  en: {
    stopWords: new Set([
      "the", "and", "or", "with", "without", "for", "to", "from", "at", "after", "over", "under",
      "between", "this", "that", "these", "those", "not", "some", "any", "be", "is", "are", "was",
      "were", "been", "being", "have", "has", "had", "can", "will", "shall", "its", "their", "his",
      "her", "about", "against", "near", "than", "more", "most", "less", "very", "only", "also",
      "such", "each", "every", "other", "another", "older", "designation", "particularly", "often",
      "commonly", "usually", "used", "type", "form", "kind", "sort", "part", "large", "small",
      "little", "person", "refers", "relating", "especially", "typically", "generally",
    ]),
    learnedSuffix: /(tion|ism|ity|ology|ium|istic|ent|ant|ase|ose|yze|yse)$/,
    alphabetStrip: /[^a-z0-9]/g,
    contentWordPattern: /[a-z]{4,}/g,
    verbPrefix: /^to\s/,
    adjPrefixes: /^(of or relating to|characterized by|marked by|having|relating to|resembling)\b/,
  },
};

const SHORT_BAND = 25;

const isLearned = (profile, w) => profile.learnedSuffix.test(w);
const norm = (profile, s) => String(s ?? "").toLowerCase().replace(profile.alphabetStrip, "");
const wcOf = (tags) => tags?.find((t) => t === "subst" || t === "adj" || t === "verb");

export function contentWords(text, profile) {
  return (String(text ?? "").toLowerCase().match(profile.contentWordPattern) ?? [])
    .filter((w) => !profile.stopWords.has(w));
}

// Data-driven first-word -> dominant word-class map, built once per pool
// (cached by the pool array's own identity, not just "once ever" — a single
// shared cache across languages would silently serve the WRONG language's
// mapping to whichever pool didn't build it first).
const firstWordMapCache = new WeakMap();
function firstWordMap(pool) {
  if (firstWordMapCache.has(pool)) return firstWordMapCache.get(pool);
  const counts = new Map();
  for (const r of pool) {
    const fw = r.definition.toLowerCase().match(/^[a-zæøåa-z]+/)?.[0];
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
  firstWordMapCache.set(pool, m);
  return m;
}

// Word-class style of arbitrary definition text (also real player submissions).
// null = unsure. Only ever a FALLBACK — every corpus word already carries an
// explicit tags-derived wc via wcOf, so this mainly matters for untagged text
// (a real player's own bluff) with no reliable signal.
export function classifyDefinition(text, pool, profile = LANG_PROFILES.no) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (profile.verbPrefix.test(t)) return "verb";
  if (profile.adjPrefixes.test(t)) return "adj";
  const fw = t.match(/^[a-zæøåa-z]+/)?.[0];
  if (fw) {
    const mapped = firstWordMap(pool).get(fw);
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Pick `count` distinct fake definitions styled like `target` ({word, definition, tags}),
 * using the linguistic heuristics in `profile` (one of LANG_PROFILES, keyed by
 * the same lang the target/pool belong to — callers must pass the matching one).
 * ~Half are chosen by a closeness score (matches "half-close, never all-close" —
 * see shunwg PRD §9.1: an all-close pool inverts the leak instead of fixing it).
 */
export function getFakeExplanations(target, count, pool, rng = Math.random, profile = LANG_PROFILES.no) {
  const targetDef = target.definition ?? "";
  const targetWc = wcOf(target.tags) ?? classifyDefinition(targetDef, pool, profile) ?? undefined;
  const targetWords = new Set(contentWords(targetDef, profile));
  const targetDefKey = norm(profile, targetDef);
  const firstLetter = (target.word[0] ?? "").toLowerCase();
  const prefix2 = target.word.slice(0, 2).toLowerCase();
  const targetShort = targetDef.length < SHORT_BAND;
  const targetLearned = isLearned(profile, target.word);

  // Exclude the target word itself and any decoy identical to the truth.
  const candidatePool = pool.filter((r) => r.word !== target.word && norm(profile, r.definition) !== targetDefKey);

  const sameWc = targetWc ? candidatePool.filter((r) => r.wc === targetWc) : candidatePool;
  const base = sameWc.length >= count * 3 ? sameWc : candidatePool;

  const closeness = (r) => {
    let s = rng();
    if (r.word[0]?.toLowerCase() === firstLetter) s += 1.5;
    if (r.word.slice(0, 2).toLowerCase() === prefix2) s += 1;
    if (targetShort && r.definition.length < SHORT_BAND && r.definition[0]?.toLowerCase() === firstLetter) s += 2.5;
    const ratio = r.definition.length / Math.max(1, targetDef.length);
    if (ratio > 0.6 && ratio < 1.6) s += 1;
    if (isLearned(profile, r.word) === targetLearned) s += 0.5;
    if (targetWords.size) {
      let shared = 0;
      for (const w of contentWords(r.definition, profile)) if (targetWords.has(w)) shared++;
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
