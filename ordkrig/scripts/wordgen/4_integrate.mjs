// Steg 4: Skriv de obskure ordene inn i spillets ordliste (src/data/words/no.csv).
// Leser results.v2.json, gjentar kvalitetsfiltrene (så stramming ikke krever
// ny henting), setter stor forbokstav på forklaringen, og skriver spillets skjema.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, 'results.v2.json');
const GAME_CSV = path.join(__dirname, '..', '..', 'src', 'data', 'words', 'no.csv');

const MIN_DEF_LEN = 20;
const MAX_DEF_LEN = 110;
const NYNORSK_DEF = /\b(ein|eit|ikkje|nokon|noko|nokre|berre|fleire|sjå|høyrer|høyre til|vere|søkje|mykje|kvarandre|serleg|attåt|òg)\b/i;

// Radikale/nynorsk-nære former i selve ordet (raudstilk, kjeldekritikk, formlaus...)
const NYNORSK_WORD = [
  /raud/, /kjelde/, /laus/, /vatn$/, /sjuk/, /^fram/, /mjølk/, /golv/,
  /^heim/, /^vass/, /spell/, /^gje/, /^eig/, /eigen/, /kaup/,
  /leik$/, /tru$/, /veg$/, /gard$/, /millom/,
  /daud/, /^leik/, /mjuk/, /^heil/, /brott$/, /lauv/,
  /djup/, /^aust/,
  // flere arkaiske/dialektale skrivemåter av vanlige ord (skau=skog, kvit=hvit,
  // brei=bred, steik=stek, bleik=blek, -heit=-het, urein=uren, jamn=jevn, stove=stue)
  /skau/, /kvit/, /brei/, /steik/, /bleik/, /heit$/, /urein/, /jamn/, /stove$/,
];

function wordLeaksIntoDef(word, def) {
  const d = def.toLowerCase();
  if (d.includes(word)) return true;
  // Glidende vindu: ENHVER 4-/5-tegns bit av ordet i forklaringen = lekkasje
  // (tar "forsnevre → Gjøre snever", "tjuekronemynt → Mynt verdt ...")
  for (const n of [4, 5]) {
    for (let i = 0; i + n <= word.length; i++) {
      if (d.includes(word.slice(i, i + n))) return true;
    }
  }
  return false;
}

// Manuell blokkliste (fra gjennomgangs-lista): ett ord per linje, # = kommentar
const BLOCK_FILE = path.join(__dirname, 'blocklist.txt');
const blocked = fs.existsSync(BLOCK_FILE)
  ? new Set(
      fs
        .readFileSync(BLOCK_FILE, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s && !s.startsWith('#'))
    )
  : new Set();

const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const good = Object.entries(cache)
  .filter(([, v]) => v)
  .map(([word, v]) => ({ word, ...v }))
  .filter((g) => !blocked.has(g.word))
  .filter((g) => {
    const d = g.definition.trim();
    if (d.length < MIN_DEF_LEN || d.length > MAX_DEF_LEN) return false;
    if (!d.includes(' ')) return false;
    if (/^i (flertall|entall)/i.test(d)) return false; // grammatikk-fragment
    if (NYNORSK_DEF.test(d)) return false;
    if (NYNORSK_WORD.some((re) => re.test(g.word))) return false;
    if (wordLeaksIntoDef(g.word, d)) return false;
    return true;
  });

// KORT-TIER: obskure ord med korte, folkelige forklaringer (bavle→bable).
// Egne kvalitetsregler ligger i 2b_fetch_short.mjs; her flettes de inn.
const SHORT_CACHE = path.join(__dirname, 'results.short.json');
const mainWords = new Set(good.map((g) => g.word));
const shortGood = fs.existsSync(SHORT_CACHE)
  ? Object.entries(JSON.parse(fs.readFileSync(SHORT_CACHE, 'utf8')))
      .filter(([, v]) => v)
      .map(([word, v]) => ({ word, ...v, short: true }))
      .filter((g) => !blocked.has(g.word))
      .filter((g) => !mainWords.has(g.word)) // hovedtier vinner ved duplikat
      .filter((g) => !NYNORSK_WORD.some((re) => re.test(g.word)))
      .filter((g) => !/^brukt som/i.test(g.definition)) // grammatikk-fragment
      .filter((g) => !/symbol/i.test(g.definition)) // "Kjemisk symbol Eu" o.l.
      .filter((g) => !wordLeaksIntoDef(g.word, g.definition))
  : [];

const wcTag = { Substantiv: 'subst', Adjektiv: 'adj', Verb: 'verb' };
function csvEscape(s) {
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const all = [...good, ...shortGood];
const rows = ['id,word,definition,tags'];
all.forEach((g, i) => {
  const tags = ['obskur', 'bm', g.short ? 'kort' : '', wcTag[g.wordClass] ?? ''].filter(Boolean).join(';');
  rows.push([i + 1, csvEscape(g.word), csvEscape(capitalize(g.definition.trim())), csvEscape(tags)].join(','));
});

fs.writeFileSync(GAME_CSV, rows.join('\n') + '\n', 'utf8');
console.log(`Skrev ${all.length} ord til ${GAME_CSV} (${good.length} vanlige + ${shortGood.length} korte)`);
