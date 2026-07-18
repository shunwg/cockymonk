#!/usr/bin/env node
/**
 * Deck + fakes gatekeeper — cross-platform twin of scripts/validate_deck.sh
 * (the shell script delegates here when node is available; its jq path remains
 * the macOS fallback). Zero dependencies, Node >= 18, ESM.
 *
 * Modes
 *   node Tools/validate_deck.mjs [file]    validate one deck/fakes file
 *                                          (default Resources/deck_nb.json; falls
 *                                          back to the .sample with a note, like the sh)
 *   node Tools/validate_deck.mjs --all     deck_nb.json + deck_en.json + fakes_nb.json
 *                                          + fakes_en.json — each skipped with a note
 *                                          when missing
 *   node Tools/validate_deck.mjs --ship    --all plus ship gates: deck_nb >= 150,
 *                                          deck_en >= 100, fakes >= 40 per language,
 *                                          zero "VERIFY" notes anywhere
 *
 * Exit code: 1 on any FAIL, 0 otherwise. WARNs never change the exit code.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => resolve(ROOT, p);
const rel = (p) => relative(ROOT, p).replaceAll("\\", "/");

// Forbidden trademark (CLAUDE.md guardrail). The pattern is assembled from parts
// so this validator file itself never matches a repo-wide search for the mark.
const TRADEMARK = new RegExp("kokkelimonk" + "[e]", "i");

const SHIP = { deck_nb: 150, deck_en: 100, fakes: 40 };
const DIFF_TARGET = { 1: 20, 2: 60, 3: 20 }; // target % per difficulty
const DIFF_TOL = 10; // percentage points

let totalFails = 0;
let totalWarns = 0;

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const norm = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const chars = (s) => [...s].length;

function makeReporter() {
  const state = { fails: 0, warns: 0 };
  const emit = (tag) => (label, items) => {
    if (tag === "FAIL") { state.fails++; totalFails++; }
    if (tag === "WARN") { state.warns++; totalWarns++; }
    const prefix = tag === "OK" ? "OK:   " : `${tag}: `;
    if (items && items.length) {
      console.log(`${prefix}${label}:`);
      for (const it of items) console.log(`   ${it}`);
    } else {
      console.log(`${prefix}${label}`);
    }
  };
  return {
    ok: emit("OK"),
    fail: emit("FAIL"),
    warn: emit("WARN"),
    get fails() { return state.fails; },
  };
}

function dupes(values) {
  const seen = new Set();
  const out = new Set();
  for (const v of values) {
    if (seen.has(v)) out.add(v);
    seen.add(v);
  }
  return [...out];
}

/** Compress a sorted int array into "0004-0006, 0009" style ranges. */
function ranges(nums) {
  const pad = (x) => String(x).padStart(4, "0");
  const out = [];
  let start = null;
  let prev = null;
  for (const n of nums) {
    if (start === null) { start = prev = n; continue; }
    if (n === prev + 1) { prev = n; continue; }
    out.push(start === prev ? pad(start) : `${pad(start)}-${pad(prev)}`);
    start = prev = n;
  }
  if (start !== null) out.push(start === prev ? pad(start) : `${pad(start)}-${pad(prev)}`);
  return out.join(", ");
}

function checkTrademark(r, raw, what) {
  if (TRADEMARK.test(raw)) r.fail(`forbidden trademark found in ${what}`);
  else r.ok("trademark check");
}

function verdict(r, kindLabel) {
  if (r.fails === 0) console.log(`${kindLabel} VALID ✓`);
  else console.log(`${kindLabel} INVALID ✗ (${r.fails} check(s) failed)`);
  return r.fails === 0;
}

function bail(r, kindLabel) {
  console.log("----");
  verdict(r, kindLabel);
  return { ok: false, count: 0, prompts: new Set(), truths: [] };
}

function validateDeck(path, { ship = false, shipMin = null } = {}) {
  const r = makeReporter();
  let raw;
  try { raw = readFileSync(path, "utf8"); }
  catch { r.fail("cannot read file"); return bail(r, "DECK"); }
  let data;
  try { data = JSON.parse(raw); }
  catch { r.fail("invalid JSON"); return bail(r, "DECK"); }
  const cards = Array.isArray(data.cards) ? data.cards : null;
  if (!cards) { r.fail('no "cards" array'); return bail(r, "DECK"); }

  const cid = (c) => (isStr(c?.id) ? c.id : "(no id)");
  const check = (label, badItems) => (badItems.length ? r.fail(label, badItems) : r.ok(label));

  // -- checks mirrored from validate_deck.sh --
  check("missing fields", cards
    .filter((c) => !(isStr(c?.id) && isStr(c?.category) && isStr(c?.prompt) && isStr(c?.truth) && c?.difficulty != null))
    .map(cid));
  check("duplicate ids", dupes(cards.map((c) => c?.id).filter(isStr)));
  check("duplicate prompts", dupes(cards.map((c) => norm(c?.prompt)).filter(Boolean)));
  check("truth > 140 chars", cards
    .filter((c) => typeof c?.truth === "string" && chars(c.truth) > 140)
    .map(cid));
  check("difficulty not 1-3", cards
    .filter((c) => !(Number.isInteger(c?.difficulty) && c.difficulty >= 1 && c.difficulty <= 3))
    .map(cid));
  checkTrademark(r, raw, "deck");

  // -- new checks (warnings) --
  const ID_RE = /^([a-z0-9]+)-(\d{4})$/i;
  const badIds = [];
  const byCat = new Map();
  for (const c of cards) {
    if (!isStr(c?.id)) continue;
    const m = c.id.match(ID_RE);
    if (!m || (isStr(c?.category) && m[1] !== c.category)) { badIds.push(c.id); continue; }
    if (!byCat.has(m[1])) byCat.set(m[1], new Set());
    byCat.get(m[1]).add(Number(m[2]));
  }
  if (badIds.length) r.warn("id not {category}-{4 digits}", badIds);
  else r.ok("id format {category}-{4 digits}");

  const gapItems = [];
  for (const [cat, nums] of byCat) {
    const max = Math.max(...nums);
    const missing = [];
    for (let n = 1; n <= max; n++) if (!nums.has(n)) missing.push(n);
    if (missing.length) gapItems.push(`${cat}: missing ${ranges(missing)}`);
  }
  if (gapItems.length) r.warn("id sequence gaps (retired cards?)", gapItems);
  else r.ok("id sequence gap-free");

  const n = cards.length;
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const c of cards) if (Number.isInteger(c?.difficulty) && counts[c.difficulty] !== undefined) counts[c.difficulty]++;
  const pct = (d) => (n ? (counts[d] / n) * 100 : 0);
  const offTarget = [1, 2, 3].filter((d) => Math.abs(pct(d) - DIFF_TARGET[d]) > DIFF_TOL);
  if (n === 0) r.warn("deck is empty");
  else if (offTarget.length) r.warn(`difficulty mix off target 20/60/20 (±${DIFF_TOL}pp)`,
    offTarget.map((d) => `${d}: ${pct(d).toFixed(1)}% (target ${DIFF_TARGET[d]}%)`));
  else r.ok("difficulty mix near 20/60/20");

  // -- VERIFY notes + ship gates --
  const verify = cards.filter((c) => c?.note === "VERIFY").map(cid);
  if (ship) {
    if (verify.length) r.fail("VERIFY notes present (ship-blocker — resolve Content/VERIFY-QUEUE.md)", verify);
    else r.ok("no VERIFY notes");
    if (shipMin != null) {
      if (n < shipMin) r.fail(`only ${n} cards (ship-blocker: ${shipMin})`);
      else r.ok(`card count ${n} >= ${shipMin}`);
    }
  }

  // -- summary --
  console.log("----");
  console.log(`Cards: ${n}   |   Difficulty mix: 1: ${counts[1]} (${pct(1).toFixed(1)}%)  2: ${counts[2]} (${pct(2).toFixed(1)}%)  3: ${counts[3]} (${pct(3).toFixed(1)}%)`);
  if (verify.length && !ship) {
    console.log("VERIFY needed (check against ordbokene.no):");
    for (const id of verify) console.log(`   ${id}`);
  }
  const ok = verdict(r, "DECK");

  const prompts = new Set(cards.map((c) => norm(c?.prompt)).filter(Boolean));
  const truths = cards.map((c) => norm(c?.truth)).filter(Boolean);
  return { ok, count: n, prompts, truths };
}

function validateFakes(path, { ship = false, truths = new Set() } = {}) {
  const r = makeReporter();
  let raw;
  try { raw = readFileSync(path, "utf8"); }
  catch { r.fail("cannot read file"); return bail(r, "FAKES"); }
  let data;
  try { data = JSON.parse(raw); }
  catch { r.fail("invalid JSON"); return bail(r, "FAKES"); }
  const fakes = Array.isArray(data.fakes) ? data.fakes : null;
  if (!fakes) { r.fail('no "fakes" array'); return bail(r, "FAKES"); }

  const fid = (f) => (isStr(f?.id) ? f.id : "(no id)");
  const check = (label, badItems) => (badItems.length ? r.fail(label, badItems) : r.ok(label));

  check("missing fields", fakes.filter((f) => !(isStr(f?.id) && isStr(f?.text))).map(fid));
  check("duplicate ids", dupes(fakes.map((f) => f?.id).filter(isStr)));
  check("duplicate texts", dupes(fakes.map((f) => norm(f?.text)).filter(Boolean)));
  check("text > 120 chars", fakes
    .filter((f) => typeof f?.text === "string" && chars(f.text) > 120)
    .map(fid));
  check("fake equals a deck truth", fakes.filter((f) => truths.has(norm(f?.text))).map(fid));
  checkTrademark(r, raw, "fakes");

  const n = fakes.length;
  if (ship) {
    if (n < SHIP.fakes) r.fail(`only ${n} fakes (ship-blocker: ${SHIP.fakes} per language)`);
    else r.ok(`fake count ${n} >= ${SHIP.fakes}`);
    const verify = fakes.filter((f) => f?.note === "VERIFY").map(fid);
    if (verify.length) r.fail("VERIFY notes present (ship-blocker)", verify);
    else r.ok("no VERIFY notes");
  } else if (n < SHIP.fakes) {
    r.warn(`only ${n} fakes (target >= ${SHIP.fakes} per language)`);
  }

  console.log("----");
  console.log(`Fakes: ${n}`);
  const ok = verdict(r, "FAKES");
  return { ok, count: n };
}

/** All known deck truths (real decks preferred, samples included), normalized. */
function collectTruths(extra = []) {
  const truths = new Set(extra);
  const candidates = [
    "Resources/deck_nb.json", "Resources/deck_nb.sample.json",
    "Resources/deck_en.json", "Resources/deck_en.sample.json",
  ];
  for (const cand of candidates) {
    const p = R(cand);
    if (!existsSync(p)) continue;
    try {
      const d = JSON.parse(readFileSync(p, "utf8"));
      for (const c of d.cards ?? []) if (isStr(c?.truth)) truths.add(norm(c.truth));
    } catch { /* broken deck is reported by its own validation */ }
  }
  return truths;
}

function crossLanguage(nb, en) {
  console.log("== cross-language ==");
  if (!nb || !en) {
    console.log("SKIP: needs both decks present.");
    console.log("");
    return;
  }
  const overlap = [...nb.prompts].filter((p) => en.prompts.has(p));
  if (overlap.length) {
    totalWarns++;
    console.log("WARN: prompts appear in both languages (deck_en must be English-obscure, never translations):");
    for (const p of overlap) console.log(`   ${p}`);
  } else {
    console.log("OK:   no prompts shared between nb and en decks");
  }
  console.log("");
}

function runAll(ship) {
  const plan = [
    { file: "Resources/deck_nb.json", kind: "deck", lang: "nb", shipMin: SHIP.deck_nb },
    { file: "Resources/deck_en.json", kind: "deck", lang: "en", shipMin: SHIP.deck_en },
    { file: "Resources/fakes_nb.json", kind: "fakes", lang: "nb" },
    { file: "Resources/fakes_en.json", kind: "fakes", lang: "en" },
  ];
  const deckResults = {};
  const deckTruths = [];
  let checked = 0;
  let skipped = 0;

  for (const item of plan) {
    console.log(`== ${item.file} ==`);
    const p = R(item.file);
    if (!existsSync(p)) {
      if (ship) {
        totalFails++;
        const need = item.kind === "deck" ? `${item.shipMin} cards` : `${SHIP.fakes} fakes`;
        console.log(`FAIL: missing — ship-blocker (need >= ${need}).`);
      } else {
        skipped++;
        console.log(item.kind === "deck"
          ? "SKIP: not found yet — run /newcards to create it."
          : "SKIP: not found yet — the card-author skill creates it.");
      }
      console.log("");
      continue;
    }
    checked++;
    if (item.kind === "deck") {
      const res = validateDeck(p, { ship, shipMin: item.shipMin });
      deckResults[item.lang] = res;
      deckTruths.push(...res.truths);
    } else {
      validateFakes(p, { ship, truths: collectTruths(deckTruths) });
    }
    console.log("");
  }

  crossLanguage(deckResults.nb, deckResults.en);

  console.log("====");
  console.log(`Files checked: ${checked}   Skipped: ${skipped}   |   FAILs: ${totalFails}   WARNs: ${totalWarns}`);
  if (totalFails === 0) console.log("ALL CHECKS PASSED ✓");
  else console.log(`VALIDATION FAILED ✗ (${totalFails} FAIL(s))`);
}

function runSingle(argFile) {
  const wanted = argFile ?? "Resources/deck_nb.json";
  let p = resolve(process.cwd(), wanted);
  if (!existsSync(p) && existsSync(R(wanted))) p = R(wanted);
  if (!existsSync(p)) {
    const sample = p.replace(/\.json$/i, ".sample.json");
    if (existsSync(sample)) {
      console.log(`No ${wanted} yet — run /newcards to create it. (Validating sample instead.)`);
      p = sample;
    } else {
      totalFails++;
      console.error(`FAIL: ${wanted} not found (no .sample fallback either).`);
      return;
    }
  }

  // Sniff the shape: a {fakes:[...]} file gets the fakes checks.
  let kind = "deck";
  try {
    if (Array.isArray(JSON.parse(readFileSync(p, "utf8")).fakes)) kind = "fakes";
  } catch { /* the validator below reports invalid JSON */ }

  if (kind === "fakes") {
    validateFakes(p, { ship: false, truths: collectTruths() });
    return;
  }

  const res = validateDeck(p, { ship: false });

  // Cross-language advisory against the other language's deck (real file, else sample).
  const base = rel(p);
  const other = base.includes("_nb") ? base.replaceAll("_nb", "_en")
    : base.includes("_en") ? base.replaceAll("_en", "_nb")
    : null;
  if (!other) return;
  for (const cand of [other, other.replace(/\.json$/i, ".sample.json")]) {
    const op = R(cand);
    if (!existsSync(op) || op === p) continue;
    try {
      const od = JSON.parse(readFileSync(op, "utf8"));
      const prompts = new Set((od.cards ?? []).map((c) => norm(c?.prompt)).filter(Boolean));
      console.log("");
      crossLanguage(res, { prompts });
    } catch { /* unreadable counterpart is its own validation's problem */ }
    break;
  }
}

// ---- entry ----
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const files = args.filter((a) => !a.startsWith("--"));
const unknown = flags.filter((f) => f !== "--all" && f !== "--ship");
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(" ")}`);
  console.error("Usage: node Tools/validate_deck.mjs [deckfile] | --all | --ship");
  process.exit(2);
}
const ship = flags.includes("--ship");

if (ship || flags.includes("--all")) runAll(ship);
else runSingle(files[0]);

process.exit(totalFails > 0 ? 1 : 0);
