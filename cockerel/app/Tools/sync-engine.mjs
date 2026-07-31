#!/usr/bin/env node
// One-way copy from cockerel/js/ — see cockerel/CLAUDE.md
// "Provenance" and cockerel/Tools/build-words.mjs / sync-tokens.mjs for
// the precedent (verbatim copies, never symlinks/workspaces). Re-run after
// any change to js/engine.js, js/config.js, js/decoys.js, or js/rating.js.
// Never hand-edit files under app/src/engine/ — they are generated.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, "..", "..", "js"); // cockerel/js/
const outDir = path.join(here, "..", "src", "engine"); // cockerel/app/src/engine/

const FILES = ["engine.js", "config.js", "decoys.js", "rating.js"];
const banner = (name) =>
  `// GENERATED FILE — copied verbatim from cockerel/js/${name} by\n` +
  `// app/Tools/sync-engine.mjs. Do not hand-edit; re-run the script instead.\n\n`;

mkdirSync(outDir, { recursive: true });
for (const name of FILES) {
  const src = readFileSync(path.join(srcDir, name), "utf8");
  writeFileSync(path.join(outDir, name), banner(name) + src);
  console.log(`${name} -> app/src/engine/${name}`);
}
