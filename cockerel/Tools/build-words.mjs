#!/usr/bin/env node
/**
 * One-way import from Ordkrig's word corpus into a NEW versioned corpus
 * directory — see CLAUDE.md "Provenance" and "Versioned corpora", and
 * js/words.js's header for the immutability rule this script enforces.
 *
 *   node Tools/build-words.mjs                    # import every language into its next version
 *   node Tools/build-words.mjs --lang en          # just English
 *   node Tools/build-words.mjs --lang no --version v3   # explicit target version
 *   node Tools/build-words.mjs --lang en --dry-run
 *   node Tools/build-words.mjs --lang en --version v2 --force   # overwrite (see below)
 *
 * By default this writes to the NEXT unused version number and refuses to
 * touch an existing one: a version directory that has already been played is
 * pinned by `batch.corpusVersion` in the db, so rewriting it in place would
 * retroactively change what past days meant. `--force` exists for the one
 * legitimate case — fixing up an import you just made and have not played or
 * committed yet.
 *
 * Importing does NOT activate: point js/config.js CORPUS_VERSIONS at the new
 * version when you actually want new daily batches drawn from it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { listVersions } from "../js/words.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..", "..");
const ordkrigData = path.join(repoRoot, "ordkrig", "src", "data", "generated");
const corpusRoot = path.join(here, "..", "js", "corpora");

/**
 * Where each language's content comes from upstream. Ordkrig names the two
 * Norwegian files asymmetrically (`words.no.json` but bare `fakeDefs.json`,
 * since Norwegian predates its English pipeline) — that's why this is a table
 * rather than a `${lang}` template.
 */
const SOURCES = {
  no: {
    words: "words.no.json",
    fakeDefs: "fakeDefs.json",
    label: "Bokmålsordboka-derived obscure Norwegian (Ordkrig import)",
    pipeline: "ordkrig/scripts/wordgen/",
    attribution: "Ordforklaringer fra Bokmålsordboka, © Språkrådet og Universitetet i Bergen (CC BY 4.0).",
  },
  en: {
    words: "words.en.json",
    fakeDefs: "fakeDefs.en.json",
    label: "WordNet 3.1 obscure English, web-frequency filtered (Ordkrig import)",
    pipeline: "ordkrig/scripts/wordgen-en/1_build_en.mjs",
    attribution: "Definitions derived from WordNet 3.1, © Princeton University (WordNet License).",
  },
};

function parseArgs(argv) {
  const args = { langs: null, version: null, force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lang") args.langs = [argv[++i]];
    else if (a === "--version") args.version = argv[++i];
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument "${a}" — see the header of ${path.relative(repoRoot, fileURLToPath(import.meta.url))}`);
  }
  return args;
}

/** Compare against an existing version by value, ignoring key order/whitespace. */
function isSameContent(lang, version, words, fakeDefs) {
  const dir = path.join(corpusRoot, lang, version);
  try {
    const same = (file, val) => JSON.stringify(JSON.parse(readFileSync(path.join(dir, file), "utf8"))) === JSON.stringify(val);
    return same("words.json", words) && same("fakeDefs.json", fakeDefs);
  } catch {
    return false; // unreadable/missing -> treat as different, let the import proceed
  }
}

const nextVersion = (lang) => {
  const existing = listVersions(lang).map((v) => Number(v.replace(/^v/, "")) || 0);
  return `v${Math.max(0, ...existing) + 1}`;
};

function importLang(lang, { version, force, dryRun }) {
  const src = SOURCES[lang];
  if (!src) throw new Error(`No Ordkrig source configured for "${lang}" — add one to SOURCES in this script.`);

  // Shapes are kept EXACTLY as Ordkrig writes them — words as
  // {id, word, definition, tags[]}, fakeDefs as {word, definition, wc}. Both
  // js/decoys.js and js/engine.js key off those field names, so a rename here
  // would ripple into ported algorithm code for no benefit.
  const words = JSON.parse(readFileSync(path.join(ordkrigData, src.words), "utf8"));
  const fakeDefs = JSON.parse(readFileSync(path.join(ordkrigData, src.fakeDefs), "utf8"));

  // Minting a version that changes nothing would pointlessly split history
  // across two identical corpora, so `npm run build-words` is safe to re-run
  // any time — it only produces a version when Ordkrig actually moved.
  const latest = listVersions(lang).at(-1);
  if (latest && !version && !force && isSameContent(lang, latest, words, fakeDefs)) {
    console.log(`${lang}: unchanged since ${latest} — nothing to import.`);
    return;
  }

  const target = version ?? nextVersion(lang);
  const dir = path.join(corpusRoot, lang, target);
  if (existsSync(dir) && !force) {
    throw new Error(
      `${lang}/${target} already exists. Version directories are immutable once published — ` +
        `re-run without --version to write ${nextVersion(lang)} instead, or pass --force if this import ` +
        `has not been played or committed yet.`,
    );
  }

  const manifest = {
    lang,
    version: target,
    label: src.label,
    status: "production",
    source: `../ordkrig/src/data/generated/{${src.words},${src.fakeDefs}}, built by ${src.pipeline}`,
    importedAt: new Date().toISOString().slice(0, 10),
    importedBy: "Tools/build-words.mjs",
    counts: { words: words.length, fakeDefs: fakeDefs.length },
    attribution: src.attribution,
    notes: "Generated — never hand-edit. Re-import into a new version instead (see CLAUDE.md 'Versioned corpora').",
  };

  if (dryRun) {
    console.log(`[dry-run] ${lang}/${target}: ${words.length} words, ${fakeDefs.length} fakeDefs -> ${path.relative(repoRoot, dir)}`);
    return;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "words.json"), JSON.stringify(words, null, 2) + "\n");
  writeFileSync(path.join(dir, "fakeDefs.json"), JSON.stringify(fakeDefs, null, 2) + "\n");
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${lang}/${target}: ${words.length} words, ${fakeDefs.length} fakeDefs -> ${path.relative(repoRoot, dir)}`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}
if (args.version && (args.langs?.length ?? 0) !== 1) {
  throw new Error("--version applies to a single language — pass --lang too.");
}
for (const lang of args.langs ?? Object.keys(SOURCES)) importLang(lang, args);
console.log("\nImported, but NOT activated — point js/config.js CORPUS_VERSIONS at a version to play it.");
