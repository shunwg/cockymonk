// Bygger en STOR, kategorisert pool av falske forklaringer til bottene.
// Kilder: alle ordbok-cachene (results.v2/short/json) + valgfri fakedefs.cache.json
// (fra 6_fetch_fakedefs.mjs). Poolen er IKKE begrenset til spillordene, så
// bot-bløffene gjentar seg langt sjeldnere. Skiller på ordklasse (subst/verb/adj)
// og beholder både korte og mer utbroderende forklaringer.
//
// Ut: ../../src/data/generated/fakeDefs.json  (array av {word, definition, wc})
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORDGEN = __dirname;
const OUT = path.join(__dirname, '..', '..', 'src', 'data', 'generated', 'fakeDefs.json');

const WC_MAP = { Substantiv: 'subst', Verb: 'verb', Adjektiv: 'adj' };
const MIN_LEN = 12;
const MAX_LEN = 200; // slipper inn lengre, mer utbroderende forklaringer

// Nynorsk-/rot-markører i forklaringen → hopp over (bløffene skal lese som bokmål)
const NYNORSK_DEF = /\b(ein|eit|ikkje|nokon|noko|nokre|berre|fleire|sjå|høyrer|vere|søkje|mykje|kvarandre|serleg|attåt|òg|ho|dei)\b/i;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const norm = (s) => s.toLowerCase().replace(/[^a-zæøå0-9]/g, '');

function cleanDef(raw) {
  let t = (raw ?? '').replace(/\s*\n+\s*/g, ' ').replace(/\s*jamfør\s+.*$/i, '').trim();
  return t;
}

function acceptable(word, def) {
  if (!def) return false;
  if (def.length < MIN_LEN || def.length > MAX_LEN) return false;
  if (/^(sjå|se) /i.test(def)) return false;
  if (/:$/.test(def)) return false;
  if (NYNORSK_DEF.test(def)) return false;
  if (def.toLowerCase() === word.toLowerCase()) return false;
  return true;
}

// --- Samle fra alle cacher -------------------------------------------------
const sources = ['results.v2.json', 'results.short.json', 'results.json', 'fakedefs.cache.json', 'commondefs.cache.json'];
const byDef = new Map(); // norm(def) -> {word, definition, wc}
let seen = 0;

for (const file of sources) {
  const p = path.join(WORDGEN, file);
  if (!fs.existsSync(p)) continue;
  const cache = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const [word, v] of Object.entries(cache)) {
    if (!v || !v.definition || !v.wordClass) continue;
    const wc = WC_MAP[v.wordClass];
    if (!wc) continue;
    const def = cleanDef(v.definition);
    if (!acceptable(word, def)) continue;
    seen++;
    const k = norm(def);
    if (k.length < 6) continue;
    if (!byDef.has(k)) byDef.set(k, { word, definition: cap(def), wc });
  }
}

const all = [...byDef.values()];
const dist = all.reduce((m, r) => ((m[r.wc] = (m[r.wc] ?? 0) + 1), m), {});
const lenBands = all.reduce(
  (m, r) => ((r.definition.length < 25 ? m.kort++ : r.definition.length < 90 ? m.mid++ : m.lang++), m),
  { kort: 0, mid: 0, lang: 0 }
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(all));

console.log(`Så ${seen} gyldige, ${all.length} unike etter dedup.`);
console.log('Ordklasse:', JSON.stringify(dist));
console.log('Lengde:', JSON.stringify(lenBands), '(kort<25, mid<90, lang≤200 tegn)');
console.log('Skrevet til', path.relative(process.cwd(), OUT));
