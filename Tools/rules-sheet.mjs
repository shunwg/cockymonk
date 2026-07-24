#!/usr/bin/env node
// rules-sheet.mjs — render the rules authority (Tools/engine-vectors.json) as a
// human-readable bokmål cheat sheet: Specs/SCORING.md. Zero dependencies.
//
//   node Tools/rules-sheet.mjs           → (re)write Specs/SCORING.md
//   node Tools/rules-sheet.mjs --check   → exit 1 on drift OR on any vector id
//                                          missing a bokmål label below
//
// The sheet is GENERATED — never hand-edited (same contract as tokens-build).
// Because prose lives in the LABELS map here, adding a vector without adding
// its label fails --check: translations are forced to keep pace with rules.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "Tools", "engine-vectors.json");
const OUT = join(ROOT, "Specs", "SCORING.md");

// ---- bokmål labels: one entry per vector id (checked exhaustively) ----------
const LABELS = {
  D1: "Identiske løgner slås sammen til ett alternativ. Hver forfatter får ceil(stemmer/antall forfattere) poeng — delt, rundet opp. Nesetellingen (Gullnesen) krediterer derimot hver forfatter alle stemmene.",
  D2: "Seier krever poeng ≥ mål, og sjekkes KUN når runde % antall spillere == 0 — alle skal ha vært spillmester like mange ganger.",
  D3: "Dobbeltreff: en løgn som ≈ sannheten tas ut av bunken (slås sammen med sannheten), forfatteren får +3 og stemmer fortsatt — sannheten er synlig for alle.",

  "R1-truth-found-basic": "Grunnrunden — sannhet funnet, løgner høster",
  "R2-gm-steal": "Ingen fant sannheten — spillmesteren stjeler",
  "R3-dobbeltreff": "Dobbeltreff — Bo skrev (nesten) sannheten",
  "R4-identical-bluffs-merge": "Identiske løgner — Anne og Cam skrev det samme",
  "R5-three-players-two-decoys": "Tre spillere — to lokke-forklaringer er lov",
  "R6-decoy-harvest-plus-steal": "Lokkemat-innhøsting PLUSS tyveri",
  "R7-drop-mid-round": "Cam faller ut midt i runden",

  "G1-win-only-at-rotation-end": "Å krysse mål midt i rotasjonen vinner IKKE — sjekken fyrer først når rotasjonen er komplett.",
  "G2-tie-triggers-omkamp": "Uavgjort forbi mål ved rotasjonsslutt → omkamp: de uavgjorte bløffer, nest høyeste poengsum agerer spillmester.",
  "G3-omkamp-still-tied-shared-victory": "Fortsatt likt etter omkampen → delt seier, delt konfetti.",

  "E1-empty-bluff-rejected": "Tom/blank løgn avvises — «Selv en dårlig løgn er bedre enn ingen.»",
  "E2-decoy-gating": "Stokkingen kan aldri fyre før spillmesterens lokkemat-tilstand er avgjort — selv med alle løgner inne.",
  "E3-gm-drop-restarts-round": "Faller spillmesteren ut, går rollen videre og runden starter på nytt med ferskt kort.",
  "E4-own-answer-hidden": "Ditt eget svar vises aldri i din egen stemmeliste; sannheten (ingen forfatter) er synlig for alle.",
  "E5-gm-does-not-vote": "Spillmesteren stemmer aldri.",
  "E6-gm-rotation-order": "Spillmester-rollen roterer hver runde i oppsett-rekkefølge, rundt og rundt.",
};

// ---- rendering helpers ------------------------------------------------------
const name = (players, i) => (players[i] === "GM" ? "Spillmesteren" : players[i]);

function optionLabel(opt, players) {
  if (opt.kind === "truth") return "sannheten";
  if (opt.kind === "decoy") return "lokkemat (spillmesterens)";
  const authors = opt.authors.map((a) => name(players, a));
  return authors.length > 1 ? `${authors.join(" & ")} sin felles løgn` : `${authors[0]}s løgn`;
}

function renderRound(r) {
  const byId = Object.fromEntries(r.options.map((o) => [o.id, o]));
  const votes = Object.entries(r.votes)
    .map(([v, optId]) => `${name(r.players, Number(v))} → ${optionLabel(byId[optId], r.players)}`)
    .join(" · ");
  const notes = [];
  if (r.doubles?.length) notes.push(`Dobbeltreff: ${r.doubles.map((d) => name(r.players, d)).join(", ")} (+3, se D3).`);
  if (r.dropped?.length) notes.push(`Falt ut: ${r.dropped.map((d) => name(r.players, d)).join(", ")} — hopper over løgn og stemme.`);
  const header = `| ${r.players.map((_, i) => name(r.players, i)).join(" | ")} |`;
  const sep = `|${r.players.map(() => "---").join("|")}|`;
  const deltas = `| ${r.players.map((_, i) => `**+${r.expected.deltas[i] ?? 0}**`).join(" | ")} |`;
  const noses = `| ${r.players.map((_, i) => `👃 ${r.expected.bluffVotes[i] ?? 0}`).join(" | ")} |`;
  return [
    `### ${r.id.split("-")[0]} · ${LABELS[r.id]}`,
    "",
    `Stemmene: ${votes}.${notes.length ? " " + notes.join(" ") : ""}`,
    "",
    header, sep, deltas, noses,
    "",
    `Spillmesteren stjal runden: **${r.expected.gmStole ? "JA (+2 er med i tallet over)" : "nei"}**.`,
    "",
  ].join("\n");
}

function generate(vec) {
  const L = [];
  L.push("<!-- GENERERT av Tools/rules-sheet.mjs — ALDRI håndrediger. Kilden er Tools/engine-vectors.json. Regenerer: node Tools/rules-sheet.mjs -->");
  L.push("# SCORING.md — poeng og regler, svart på hvitt");
  L.push("");
  L.push("*Dette arket er GENERERT fra `Tools/engine-vectors.json` — regelautoriteten som også kjører motortestene. Rediger aldri her; endre vektorene og regenerer (`node Tools/rules-sheet.mjs`).*");
  L.push("");
  L.push("## Poengtabellen (PRD §5.3)");
  L.push("");
  L.push("| Hendelse | Poeng | Til |");
  L.push("|---|---|---|");
  L.push("| Du stemte på sannheten | **+2** | velgeren |");
  L.push("| Svaret ditt fikk stemmer (løgn eller lokkemat) | **+1 per stemme** | forfatteren |");
  L.push("| Ingen fant sannheten | **+2** | spillmesteren |");
  L.push("| Dobbeltreff — du skrev (nesten) sannheten | **+3** | bløfferen |");
  L.push("");
  L.push("Nesetellingen (👃) er separat fra poengene: én stemme sanket = ett hakk lengre nese, og flest 👃 ved spillslutt vinner **Gullnesen**.");
  L.push("");
  L.push("## Regelvedtak");
  L.push("");
  L.push("| Id | Vedtak |");
  L.push("|---|---|");
  for (const d of vec.decisions) L.push(`| ${d.id} | ${LABELS[d.id]} |`);
  L.push("");
  L.push("## Runde-eksemplene (testvektorene R1–R7)");
  L.push("");
  L.push("Hver runde under kjøres ordrett som motortest (`node --test Lab/js/engine.test.mjs`). Spiller 0 er rundens spillmester.");
  L.push("");
  for (const r of vec.rounds) L.push(renderRound(r));
  L.push("## Hele spill (G1–G3)");
  L.push("");
  L.push("| Id | Beviser |");
  L.push("|---|---|");
  for (const g of vec.games) L.push(`| ${g.id.split("-")[0]} | ${LABELS[g.id]} |`);
  L.push("");
  L.push("## Kantregler (E1–E6)");
  L.push("");
  L.push("| Id | Regel |");
  L.push("|---|---|");
  for (const e of vec.behaviors) L.push(`| ${e.id.split("-")[0]} | ${LABELS[e.id]} |`);
  L.push("");
  L.push("---");
  L.push("");
  L.push("*Autoriteten er vektorene, ikke dette arket. Endrer du en regel: oppdater PRD §5 + vektorene, kjør `node --test Lab/js/engine.test.mjs`, og regenerer dette arket.*");
  L.push("");
  return L.join("\n");
}

async function main() {
  const vec = JSON.parse(await readFile(SRC, "utf8"));

  // Every vector id must have a bokmål label — missing ones fail loudly.
  const ids = [
    ...vec.decisions.map((d) => d.id),
    ...vec.rounds.map((r) => r.id),
    ...vec.games.map((g) => g.id),
    ...vec.behaviors.map((e) => e.id),
  ];
  const missing = ids.filter((id) => !LABELS[id]);
  if (missing.length) {
    console.error(`rules-sheet: ${missing.length} vector id(s) missing a bokmål label in LABELS:`);
    for (const id of missing) console.error("  - " + id);
    console.error("Add the label(s) in Tools/rules-sheet.mjs, then regenerate.");
    process.exit(1);
  }

  const fresh = generate(vec);
  if (process.argv.includes("--check")) {
    const committed = await readFile(OUT, "utf8").catch(() => null);
    if (committed === fresh) { console.log("rules-sheet --check: OK (Specs/SCORING.md matches the vectors)"); return; }
    console.error(committed === null
      ? "rules-sheet --check: FAIL — Specs/SCORING.md missing. Run: node Tools/rules-sheet.mjs"
      : "rules-sheet --check: FAIL — Specs/SCORING.md drifted from the vectors (hand-edited, or vectors changed). Run: node Tools/rules-sheet.mjs");
    process.exit(1);
  }
  await mkdir(join(ROOT, "Specs"), { recursive: true });
  await writeFile(OUT, fresh, "utf8");
  console.log(`Specs/SCORING.md written (${ids.length} vectors rendered, bokmål).`);
}

main().catch((e) => { console.error("rules-sheet failed:", e); process.exit(1); });
