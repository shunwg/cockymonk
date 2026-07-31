#!/usr/bin/env node
// Copies Cocky Monk's ALREADY-GENERATED tokens.css (and the fonts/mascot
// that ride along with it) rather than re-deriving from tokens.json —
// shunwg/Tools/tokens-build.mjs already does that resolution; duplicating
// its 600+ lines here for one CSS output isn't worth it. If tokens.json
// changes upstream: run `node Tools/tokens-build.mjs` in shunwg/ first,
// THEN re-run this script. See CLAUDE.md Provenance / ASSETS.md.
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const shunwgLab = path.join(root, "shunwg", "Lab");

const outCss = path.join(here, "..", "css");
const outAssets = path.join(here, "..", "assets");
await mkdir(outCss, { recursive: true });
await mkdir(outAssets, { recursive: true });

const copies = [
  [path.join(shunwgLab, "css", "tokens.css"), path.join(outCss, "tokens.css")],
  [path.join(shunwgLab, "vendor", "fredoka.css"), path.join(outAssets, "fredoka.css")],
  [path.join(shunwgLab, "icon.svg"), path.join(outAssets, "nesen.svg")],
];

for (const [from, to] of copies) {
  await copyFile(from, to);
  console.log(`${path.relative(root, from)} -> ${path.relative(root, to)}`);
}
