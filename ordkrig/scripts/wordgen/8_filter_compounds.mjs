// DOBBELTORD-FILTER for den norske spillista (washbin-regelen på norsk):
// del ordet på alle mulige punkter (med fuge-s/-e: arbeidsrom, barnebok) – er
// BEGGE delene vanlige norske ord hver for seg, er sammensetningen
// gjennomsiktig og for lett → ut av no.csv.
//
//   node 8_filter_compounds.mjs           (tørrkjøring – viser hva som fjernes)
//   node 8_filter_compounds.mjs --write   (skriver no.csv)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FREQ_FILE = path.join(__dirname, '1gram_nob_f1_freq.frk');
const CSV = path.join(__dirname, '..', '..', 'src', 'data', 'words', 'no.csv');

// ---------------------------------------------------------------------------
// Frekvens → rank (mest brukt = rank 1)
// ---------------------------------------------------------------------------
const rows = [];
for (const line of fs.readFileSync(FREQ_FILE, 'latin1').split('\n')) {
  const m = line.trim().match(/^(\d+)\s+(.+)$/);
  if (!m) continue;
  const word = m[2];
  if (!/^[a-zæøå]+$/.test(word)) continue;
  rows.push({ word, count: parseInt(m[1], 10) });
}
rows.sort((a, b) => b.count - a.count);
const rank = new Map();
rows.forEach((r, i) => {
  if (!rank.has(r.word)) rank.set(r.word, i + 1);
});
console.log(`Frekvensliste: ${rank.size} ord`);

const rankOf = (w) => rank.get(w) ?? Infinity;

/** Delen er et vanlig norsk ord? 3-tegns deler må være SUPER-vanlige. */
function partIsCommon(part) {
  if (part.length < 3) return false;
  const r = rankOf(part);
  return r <= (part.length === 3 ? 10_000 : 30_000);
}

// Produktive, nesten-alltid-gjennomsiktige forledd: er resten et vanlig ord,
// er betydningen gjettbar uansett (halvklar, understimulere, oppflaske).
const CLEAR_PREFIX = ['halv', 'under', 'over', 'opp', 'sammen', 'gruppe', 'selv'];

// Manuelt fredede ord: prefikset ser produktivt ut, men betydningen er
// fagspesifikk og IKKE gjettbar (oppslutte = kjemi: gjøre løselig).
const SPARE = new Set(['oppslutte']);

/**
 * Definisjonen «røper» delen? Ekte sammensetninger forklares med sin egen del
 * («grasgrodd» → «gress»), tilfeldige split gjør ikke det. Prefiksmatch (4 tegn)
 * fanger bøyning/fugevariasjon (gras↔gress via «gres», stein↔stein).
 */
function defEchoesPart(part, def) {
  if (part.length < 4) return false;
  const d = def.toLowerCase();
  const stem = part.slice(0, Math.min(part.length, 4));
  return d.includes(stem);
}

/**
 * Gjennomsiktig sammensetning? Krever at BEGGE deler er vanlige ord OG at
 * definisjonen henger sammen med minst én del (eller at forleddet er et
 * produktivt klar-prefiks). Det sparer ekte obskure ord som bare TILFELDIG
 * lar seg dele (tremor=tre+mor, minbar=min+bar, klerus=kle+rus).
 */
function transparentCompound(word, def) {
  for (let i = 3; i <= word.length - 3; i++) {
    const a = word.slice(0, i);
    if (!partIsCommon(a)) continue;
    const check = (b, sep) => {
      if (!partIsCommon(b)) return null;
      const linked = defEchoesPart(a, def) || defEchoesPart(b, def) || CLEAR_PREFIX.includes(a);
      return linked ? `${a}${sep}${b}` : null;
    };
    const r1 = check(word.slice(i), '+');
    if (r1) return r1;
    if ((word[i] === 's' || word[i] === 'e') && word.length - i - 1 >= 3) {
      const r2 = check(word.slice(i + 1), `+${word[i]}+`);
      if (r2) return r2;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filtrer CSV-en
// ---------------------------------------------------------------------------
const raw = fs.readFileSync(CSV, 'utf8');
const lines = raw.split(/\r?\n/);
const header = lines[0];
const body = lines.slice(1).filter((l) => l.trim());

const kept = [];
const removed = [];
for (const line of body) {
  const firstComma = line.indexOf(',');
  const rest = line.slice(firstComma + 1);
  const word = rest.slice(0, rest.indexOf(',')).toLowerCase();
  // Definisjonen = alt mellom første og siste komma (kan være «...»-sitert)
  const def = rest.slice(rest.indexOf(',') + 1).replace(/^"|",?[^,]*$/g, '').replace(/,obskur.*$/, '');
  const split = transparentCompound(word, def);
  if (split && !SPARE.has(word)) removed.push({ line, word, split, def });
  else kept.push(line);
}

console.log(`\nFJERNES (${removed.length} av ${body.length}):`);
for (const r of removed) console.log(`  ${r.word}  (${r.split})`);
console.log(`\nBeholdt: ${kept.length}`);

if (process.argv.includes('--write')) {
  fs.writeFileSync(CSV, header + '\n' + kept.join('\n') + '\n', 'utf8');
  console.log('no.csv skrevet.');
} else {
  console.log('\n(tørrkjøring – kjør med --write for å skrive)');
}
