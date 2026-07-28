#!/usr/bin/env node
// One-way import from Ordkrig's word corpus — see CLAUDE.md "Provenance".
// Re-run after any Ordkrig wordlist change you want reflected here. Never
// hand-edit js/words.json or js/fakeDefs.json; they are generated files.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const ordkrigData = path.join(root, "ordkrig", "src", "data", "generated");
const outDir = path.join(here, "..", "js");

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

// words.no.json: {id, word, definition, tags: [obskur/bm, part-of-speech]}.
// Keep the shape as-is — decoys.js and engine.js key off `id`/`word`/`definition`/`tags`.
const words = readJson(path.join(ordkrigData, "words.no.json"));

// fakeDefs.json: {word, definition, wc} — the pool decoys.js draws bot
// bluffs from. Word-class field is named `wc` there; keep the name so the
// ported nearness-matching code needs no field renaming.
const fakeDefs = readJson(path.join(ordkrigData, "fakeDefs.json"));

writeFileSync(path.join(outDir, "words.json"), JSON.stringify(words, null, 2) + "\n");
writeFileSync(path.join(outDir, "fakeDefs.json"), JSON.stringify(fakeDefs, null, 2) + "\n");

console.log(`words.json: ${words.length} words`);
console.log(`fakeDefs.json: ${fakeDefs.length} fake definitions`);
