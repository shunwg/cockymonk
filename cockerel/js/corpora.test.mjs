// corpora.test.mjs — guards the versioned corpus layer (js/words.js +
// server/db.mjs's per-batch pinning). Two jobs:
//   1. Every corpus on disk is structurally sound — this is what catches a
//      hand-edited or half-imported js/corpora/<lang>/<version>/ before it
//      reaches a player.
//   2. Switching js/config.js CORPUS_VERSIONS (forward OR back) never breaks
//      a day that was already drawn. That's the whole reason versions are
//      pinned per batch, so it gets a real end-to-end test rather than a
//      comment.
// Usage: node --test js/corpora.test.mjs (or npm test, from cockerel/).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allCorpusVersions, listVersions, activeVersion, validateCorpus,
  loadCorpus, corpusMeta,
} from "./words.js";
import { LANGS, CORPUS_VERSIONS } from "./config.js";
import { freshDb, ensureToday, getTodayState, ensureProfileFor, setEnabledLangs } from "../server/db.mjs";
import { dayKeyFromDate } from "./engine.js";

const DAY0 = new Date("2026-01-01T12:00:00Z");
const DAY1 = new Date("2026-01-02T12:00:00Z");

// -- every corpus on disk is valid --------------------------------------

test("every corpus version on disk passes validation", () => {
  const versions = allCorpusVersions();
  assert.ok(versions.length > 0, "expected at least one corpus on disk");
  for (const { lang, version } of versions) {
    const { problems } = validateCorpus(lang, version);
    assert.deepEqual(problems, [], `${lang}/${version} should have no problems`);
  }
});

test("every configured language has an existing active version", () => {
  for (const lang of LANGS) {
    const version = activeVersion(lang);
    assert.ok(listVersions(lang).includes(version), `${lang}: active ${version} exists on disk`);
    assert.equal(CORPUS_VERSIONS[lang], version, `${lang}: config is the source of truth when no env override is set`);
  }
});

test("a manifest describes the content it actually ships with", () => {
  for (const { lang, version } of allCorpusVersions()) {
    const meta = corpusMeta(lang, version);
    const { words, fakeDefs } = loadCorpus(lang, version);
    assert.equal(meta.counts.words, words.length);
    assert.equal(meta.counts.fakeDefs, fakeDefs.length);
    assert.ok(meta.attribution, `${lang}/${version}: must carry an attribution string (see ASSETS.md rule zero)`);
  }
});

// -- version resolution --------------------------------------------------

test("activeVersion honours the env override, and rejects a version that isn't there", () => {
  const key = "COCKEREL_CORPUS_EN";
  const original = process.env[key];
  try {
    process.env[key] = "v1";
    assert.equal(activeVersion("en"), "v1", "env override wins over config");

    process.env[key] = "v999";
    assert.throws(() => activeVersion("en"), /does not exist/, "a typo must fail loudly, not fall back");
  } finally {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

test("loadCorpus returns the requested version, not the active one", () => {
  const v1 = loadCorpus("en", "v1");
  const v2 = loadCorpus("en", "v2");
  assert.notEqual(v1.words.length, v2.words.length);
  assert.equal(v1.version, "v1");
  assert.equal(v2.version, "v2");
});

// -- the load-bearing invariant -----------------------------------------

test("switching the active corpus version leaves already-drawn days intact", () => {
  const key = "COCKEREL_CORPUS_EN";
  const original = process.env[key];
  const userId = "switcher";
  try {
    // Day 0, played on en/v1.
    process.env[key] = "v1";
    const db = freshDb();
    ensureToday(db, DAY0);
    ensureProfileFor(db, userId, "Switcher");
    setEnabledLangs(db, userId, ["en"]);

    const day0Key = dayKeyFromDate(DAY0);
    const drawnOnV1 = db.batches.filter((b) => b.lang === "en");
    assert.ok(drawnOnV1.length > 0);
    for (const b of drawnOnV1) assert.equal(b.corpusVersion, "v1", "batches record the version they were drawn from");

    // The word list is swapped underneath the running game.
    process.env[key] = "v2";
    ensureToday(db, DAY1);

    const day1Key = dayKeyFromDate(DAY1);
    const today = db.batches.find((b) => b.lang === "en" && b.dayKey === day1Key);
    const yesterday = db.batches.find((b) => b.lang === "en" && b.dayKey === day0Key);
    assert.equal(today.corpusVersion, "v2", "the new day follows the switch");
    assert.equal(yesterday.corpusVersion, "v1", "the old day does not");
    assert.ok(yesterday.sealedAt, "yesterday sealed normally across the switch");

    // en/v1 and en/v2 use disjoint id namespaces ("en-1" vs "en1"), so this
    // only passes if each batch is resolved against its OWN corpus.
    const v1Ids = new Set(loadCorpus("en", "v1").words.map((w) => w.id));
    const v2Ids = new Set(loadCorpus("en", "v2").words.map((w) => w.id));
    assert.ok(yesterday.wordIds.every((id) => v1Ids.has(id) && !v2Ids.has(id)), "yesterday's ids are v1-only");
    assert.ok(today.wordIds.every((id) => v2Ids.has(id) && !v1Ids.has(id)), "today's ids are v2-only");

    const state = getTodayState(db, userId).byLang.en;
    assert.equal(state.writeWords.length, today.wordIds.length);
    assert.equal(state.guessWords.length, yesterday.wordIds.length);
    for (const w of [...state.writeWords, ...state.guessWords]) {
      assert.ok(w.word && typeof w.word === "string", `resolved a real headword for ${w.wordId}`);
    }
    // The truth option for a v1 word must still be v1's definition — a sealed
    // batch's meaning cannot be rewritten by a later version.
    const v1ById = loadCorpus("en", "v1").byId;
    for (const wordId of yesterday.wordIds) {
      const truth = yesterday.options[wordId].find((o) => o.kind === "truth");
      assert.equal(truth.text, v1ById.get(wordId).definition);
    }
  } finally {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

test("a batch pinned to a corpus that lacks its words fails with an actionable error", () => {
  // The realistic cause is a version directory edited in place or deleted and
  // rebuilt. Without the guard in corpusForBatch this surfaces as
  // "Cannot read properties of undefined (reading 'definition')" inside
  // engine.js, which says nothing about what actually went wrong.
  const db = freshDb();
  ensureToday(db, DAY0);
  ensureProfileFor(db, "u1", "U");
  setEnabledLangs(db, "u1", ["en"]);

  const today = db.batches.filter((b) => b.lang === "en").at(-1);
  assert.equal(today.corpusVersion, "v2", "precondition: drawn from the active version");
  today.corpusVersion = "v1"; // v1 ids are "en-1"-shaped, v2's are "en1" — disjoint

  assert.throws(() => getTodayState(db, "u1"), (err) => {
    assert.match(err.message, /pinned to corpus en\/v1/);
    assert.match(err.message, /has no word/);
    return true;
  });
});

test("rolling BACK to an older version also leaves the newer day intact", () => {
  const key = "COCKEREL_CORPUS_EN";
  const original = process.env[key];
  try {
    process.env[key] = "v2";
    const db = freshDb();
    ensureToday(db, DAY0);

    process.env[key] = "v1"; // regret the upgrade
    ensureToday(db, DAY1);

    const byDay = (dayKey) => db.batches.find((b) => b.lang === "en" && b.dayKey === dayKey);
    assert.equal(byDay(dayKeyFromDate(DAY0)).corpusVersion, "v2");
    assert.equal(byDay(dayKeyFromDate(DAY1)).corpusVersion, "v1");
    // The rolled-back day still seals against v2's pool, not v1's.
    const sealed = byDay(dayKeyFromDate(DAY0));
    assert.ok(sealed.sealedAt);
    const v2ById = loadCorpus("en", "v2").byId;
    for (const wordId of sealed.wordIds) {
      const truth = sealed.options[wordId].find((o) => o.kind === "truth");
      assert.equal(truth.text, v2ById.get(wordId).definition);
    }
  } finally {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});
