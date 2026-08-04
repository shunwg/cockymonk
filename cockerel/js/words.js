/**
 * words.js — the VERSIONED corpus registry. Server-side only (node:fs); the
 * browser never imports this.
 *
 * Content lives in js/corpora/<lang>/<version>/, one directory per version:
 *
 *   js/corpora/no/v1/{words.json, fakeDefs.json, manifest.json}
 *   js/corpora/en/v1/...   (hand-written placeholder, superseded)
 *   js/corpora/en/v2/...   (imported from Ordkrig — see Tools/build-words.mjs)
 *
 * THE ONE RULE: **a published version directory is immutable.** Improving the
 * word list means adding js/corpora/<lang>/v<N+1>/ and pointing
 * js/config.js CORPUS_VERSIONS at it — never editing a version in place.
 * That's what lets `batch.corpusVersion` (server/db.mjs) pin every historical
 * day to the exact word list it was actually played with, so switching the
 * active version — forward OR back — can't retroactively rewrite, break, or
 * orphan a day that's already been played. Editing v1's files in place would
 * silently do all three.
 *
 * Corpora are cached in-process after first read (they're immutable, and
 * fakeDefs pools run to ~1MB / 14k entries, which db.mjs would otherwise
 * re-parse on every single request). A corpus file changed on disk therefore
 * needs a server restart to take effect — which follows from the immutability
 * rule above rather than working around it.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LANGS, CORPUS_VERSIONS } from "./config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CORPUS_ROOT = path.join(here, "corpora");

const cache = new Map(); // `${lang}/${version}` -> corpus object

const versionDir = (lang, version) => path.join(CORPUS_ROOT, lang, version);

/** Sort "v2" before "v10" — plain string sort gets that backwards. */
function byVersionNumber(a, b) {
  const n = (v) => Number(String(v).replace(/^v/, "")) || 0;
  return n(a) - n(b);
}

/** Every version directory that exists on disk for a language, oldest first. */
export function listVersions(lang) {
  const dir = path.join(CORPUS_ROOT, lang);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^v\d+$/.test(name) && statSync(path.join(dir, name)).isDirectory())
    .sort(byVersionNumber);
}

/** Every language with at least one version on disk (not necessarily in LANGS). */
export function listCorpusLangs() {
  if (!existsSync(CORPUS_ROOT)) return [];
  return readdirSync(CORPUS_ROOT)
    .filter((name) => statSync(path.join(CORPUS_ROOT, name)).isDirectory())
    .sort();
}

/**
 * Which version new batches for `lang` should be drawn from. Config is the
 * source of truth; the env var exists so a DEPLOYED instance can roll back
 * without a redeploy (`fly secrets set COCKEREL_CORPUS_EN=v1`), matching how
 * DEV_TOOLS/ADMIN_TOKEN are already handled. Throws on an unknown version
 * rather than silently falling back — a typo here would otherwise quietly
 * draw from the wrong word list for a whole day.
 */
export function activeVersion(lang) {
  const fromEnv = process.env[`COCKEREL_CORPUS_${lang.toUpperCase()}`];
  const wanted = fromEnv || CORPUS_VERSIONS[lang];
  if (!wanted) {
    throw new Error(`No active corpus version configured for "${lang}" — add one to js/config.js CORPUS_VERSIONS.`);
  }
  const available = listVersions(lang);
  if (!available.includes(wanted)) {
    const where = fromEnv ? `env COCKEREL_CORPUS_${lang.toUpperCase()}` : "js/config.js CORPUS_VERSIONS";
    throw new Error(
      `Corpus "${lang}/${wanted}" (from ${where}) does not exist. Available: ${available.join(", ") || "(none)"}.`,
    );
  }
  return wanted;
}

/**
 * Load one version's content. `version` defaults to the active one, but every
 * caller resolving a word that belongs to an ALREADY-DRAWN batch must pass
 * that batch's own `corpusVersion` instead — see server/db.mjs corpusForBatch.
 */
export function loadCorpus(lang, version = activeVersion(lang)) {
  const key = `${lang}/${version}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const dir = versionDir(lang, version);
  if (!existsSync(dir)) {
    throw new Error(
      `Corpus "${key}" not found at ${dir}. Available for "${lang}": ${listVersions(lang).join(", ") || "(none)"}.`,
    );
  }
  const read = (file) => JSON.parse(readFileSync(path.join(dir, file), "utf8"));
  const words = read("words.json");
  const fakeDefs = read("fakeDefs.json");
  const manifest = existsSync(path.join(dir, "manifest.json")) ? read("manifest.json") : null;

  const corpus = {
    lang,
    version,
    words,
    fakeDefs,
    manifest,
    byId: new Map(words.map((w) => [w.id, w])),
  };
  cache.set(key, corpus);
  return corpus;
}

export function loadWords(lang, version) {
  return loadCorpus(lang, version).words;
}

export function loadFakeDefs(lang, version) {
  return loadCorpus(lang, version).fakeDefs;
}

/**
 * Kept as a free function over a words ARRAY (rather than folded into
 * corpus.byId) because server/db.test.mjs and Tools/simulate-day.mjs use it
 * that way, and because engine-level code should keep taking plain arrays.
 * Prefer `loadCorpus(...).byId.get(id)` on hot paths.
 */
export function wordById(words, id) {
  return words.find((w) => w.id === id);
}

/** Manifest for a version, with the fields the CLI/docs rely on defaulted. */
export function corpusMeta(lang, version = activeVersion(lang)) {
  const { manifest, words, fakeDefs } = loadCorpus(lang, version);
  return {
    lang,
    version,
    label: manifest?.label ?? "(no manifest)",
    status: manifest?.status ?? "unknown",
    source: manifest?.source ?? null,
    importedAt: manifest?.importedAt ?? null,
    attribution: manifest?.attribution ?? null,
    notes: manifest?.notes ?? null,
    counts: { words: words.length, fakeDefs: fakeDefs.length },
  };
}

/**
 * Shape/quality checks on a corpus. Returns `{ problems, warnings }` of
 * human-readable strings rather than throwing, so the CLI and
 * js/corpora.test.mjs can report everything at once.
 *
 * `problems` are things that would break or corrupt gameplay (missing fields,
 * duplicate ids, a manifest that disagrees with the content) — these fail the
 * test. `warnings` are content-quality smells that the engine already copes
 * with, so an old or placeholder version stays valid rather than failing the
 * suite forever: the point of keeping v1 around is that it still WORKS.
 */
export function validateCorpus(lang, version) {
  const problems = [];
  const warnings = [];
  const fail = (msg) => problems.push(`${lang}/${version}: ${msg}`);
  const warn = (msg) => warnings.push(`${lang}/${version}: ${msg}`);

  let corpus;
  try {
    corpus = loadCorpus(lang, version);
  } catch (err) {
    return { problems: [`${lang}/${version}: unreadable — ${err.message}`], warnings };
  }
  const { words, fakeDefs, manifest } = corpus;

  if (!Array.isArray(words) || words.length === 0) {
    return { problems: [`${lang}/${version}: words.json is empty or not an array`], warnings };
  }
  if (!Array.isArray(fakeDefs) || fakeDefs.length === 0) fail("fakeDefs.json is empty or not an array");

  // Enough words that the recently-used exclusion window can't starve the
  // daily draw (see js/config.js BATCH).
  if (words.length < 30) fail(`only ${words.length} words — too few to draw 3/day without heavy repetition`);
  else if (words.length < 200) warn(`only ${words.length} words — ~${Math.floor(words.length / 3)} days of content at 3/day`);

  const ids = new Set();
  for (const [i, w] of words.entries()) {
    const at = `words[${i}]${w?.word ? ` ("${w.word}")` : ""}`;
    if (!w || typeof w !== "object") { fail(`${at} is not an object`); continue; }
    if (!w.id) fail(`${at} has no id`);
    else if (ids.has(w.id)) fail(`${at} has duplicate id "${w.id}"`);
    else ids.add(w.id);
    if (!w.word || typeof w.word !== "string") fail(`${at} has no word`);
    if (!w.definition || typeof w.definition !== "string") fail(`${at} has no definition`);
    if (!Array.isArray(w.tags) || w.tags.length === 0) fail(`${at} has no tags`);
    // decoys.js matches bot bluffs by word class — a word with no recognised
    // class silently degrades to a random draw instead of a near-miss.
    else if (!w.tags.some((t) => ["subst", "verb", "adj"].includes(t))) {
      fail(`${at} has no word-class tag (subst/verb/adj) — decoy nearness-matching needs one`);
    }
  }

  const headwords = new Set(words.map((w) => w.word));
  let overlap = 0;
  for (const [i, f] of fakeDefs.entries()) {
    if (!f || !f.definition || !f.wc) { fail(`fakeDefs[${i}] is missing definition/wc`); continue; }
    if (headwords.has(f.word)) overlap++;
  }
  // A bluff pool that overlaps the game words is a WARNING, not a failure:
  // js/decoys.js already refuses to offer a decoy whose word is the target or
  // whose definition matches the truth, so the real definition can never be
  // served as a decoy for its own word. What's left is a variety smell — a
  // decoy for X may be Y's true definition, which is still a false answer
  // for X. Ordkrig-generated corpora have zero overlap; the hand-written
  // en/v1 placeholder is 100% overlap because its pool IS its word list.
  if (overlap) {
    warn(`${overlap}/${fakeDefs.length} bluff-pool entries are also game words (decoys.js filters the unsafe cases; reduces decoy variety)`);
  }
  if (fakeDefs.length < words.length * 2) {
    warn(`bluff pool (${fakeDefs.length}) is small relative to ${words.length} game words — decoys will repeat`);
  }

  if (!manifest) fail("no manifest.json");
  else {
    if (manifest.lang !== lang) fail(`manifest.lang is "${manifest.lang}", expected "${lang}"`);
    if (manifest.version !== version) fail(`manifest.version is "${manifest.version}", expected "${version}"`);
    if (manifest.counts?.words !== words.length) fail(`manifest says ${manifest.counts?.words} words, found ${words.length}`);
    if (manifest.counts?.fakeDefs !== fakeDefs.length) {
      fail(`manifest says ${manifest.counts?.fakeDefs} fakeDefs, found ${fakeDefs.length}`);
    }
  }

  return { problems, warnings };
}

/** Every (lang, version) pair on disk — what the CLI and the test iterate. */
export function allCorpusVersions() {
  return listCorpusLangs().flatMap((lang) => listVersions(lang).map((version) => ({ lang, version })));
}

/** Fail fast at server boot rather than mid-request — see server/dev-server.mjs. */
export function assertActiveCorporaExist() {
  for (const lang of LANGS) loadCorpus(lang, activeVersion(lang));
}
