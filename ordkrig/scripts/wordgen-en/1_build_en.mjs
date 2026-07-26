// ENGELSK ORDPIPELINE – samme metodikk som den norske:
//   Kilder: WordNet 3.1 (definisjoner, fri lisens) + Norvig count_1w.txt
//           (333k ord fra Google Web Trillion Word Corpus = "kjenthets"-filter).
//   SPILLORD: ord som er fraværende/ekstremt sjeldne på nettet, IKKE
//   gjennomsiktige avledninger av vanlige ord, med KORTE definisjoner som kun
//   bruker vanlige engelske ord (lesbart for ikke-engelskspråklige).
//   BLØFF-POOL: definisjoner også fra vanlige ord (rank 4k–80k) → flere temaer.
//
//   node 1_build_en.mjs            (skriver words.en.json + fakeDefs.en.json)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICT = path.join(__dirname, 'dict');
const OUT_WORDS = path.join(__dirname, '..', '..', 'src', 'data', 'generated', 'words.en.json');
const OUT_FAKES = path.join(__dirname, '..', '..', 'src', 'data', 'generated', 'fakeDefs.en.json');

// ---------------------------------------------------------------------------
// 1) Frekvensliste → rank per ord
// ---------------------------------------------------------------------------
const rank = new Map();
{
  const lines = fs.readFileSync(path.join(__dirname, 'count_1w.txt'), 'utf8').split('\n');
  let i = 0;
  for (const line of lines) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    rank.set(line.slice(0, tab), ++i);
  }
  console.log(`Frekvensliste: ${rank.size} ord`);
}
const rankOf = (w) => rank.get(w) ?? Infinity;

// ---------------------------------------------------------------------------
// 2) WordNet-parsing: {word, pos, gloss} fra data.noun/verb/adj
// ---------------------------------------------------------------------------
const POS_FILES = [
  ['data.noun', 'subst'],
  ['data.verb', 'verb'],
  ['data.adj', 'adj'],
];

function parseDataFile(file, wc) {
  const out = [];
  const raw = fs.readFileSync(path.join(DICT, file), 'utf8');
  for (const line of raw.split('\n')) {
    if (!/^\d{8} /.test(line)) continue; // header/blank
    const bar = line.indexOf(' | ');
    if (bar < 0) continue;
    const gloss = line.slice(bar + 3).trim();
    const t = line.slice(0, bar).split(' ');
    const wcnt = parseInt(t[3], 16);
    const words = [];
    for (let i = 0; i < wcnt; i++) {
      let w = t[4 + i * 2];
      if (!w) continue;
      w = w.replace(/\(.*\)$/, ''); // adjektiv-markører: word(ip) → word
      words.push(w);
    }
    out.push({ words, wc, gloss });
  }
  return out;
}

const synsets = POS_FILES.flatMap(([f, wc]) => parseDataFile(f, wc));
console.log(`WordNet: ${synsets.length} synsets`);

// ---------------------------------------------------------------------------
// 3) Definisjonsvask
// ---------------------------------------------------------------------------
const DOMAIN_NICE = new Set([
  'botany', 'zoology', 'medicine', 'law', 'music', 'astronomy', 'chemistry',
  'physics', 'mathematics', 'grammar', 'linguistics', 'architecture', 'nautical',
  'military', 'religion', 'anatomy', 'geology', 'printing', 'heraldry', 'logic',
  'philosophy', 'psychology', 'economics', 'sports', 'cricket', 'golf', 'baseball',
]);

function cleanGloss(gloss) {
  let g = gloss;
  // Kun første gloss-segment; dropp segmenter med eksempler ("...")
  const segs = g.split(';').map((s) => s.trim());
  g = segs.find((s) => s && !s.includes('"')) ?? '';
  if (!g) return null;
  // Ledende domenemarkør "(botany) ..." → "In botany: ..." (ellers droppes den)
  const m = g.match(/^\(([a-z ]{2,30})\)\s*(.+)$/);
  if (m) {
    const domain = m[1].trim();
    g = DOMAIN_NICE.has(domain) ? `in ${domain}: ${m[2]}` : m[2];
  }
  // Fjern etterhengte parenteser: "...cells (as in leukemia)" → "...cells"
  g = g.replace(/\s*\([^)]*\)\s*$/, '');
  // Ledende "(of bone ...)"-type kvalifikator droppes helt
  g = g.replace(/^\([^)]*\)\s*/, '');
  // Gjenstår parentes inni → for rotete, dropp definisjonen
  if (g.includes('(') || g.includes(')')) return null;
  g = g.replace(/\s+/g, ' ').trim();
  if (!g) return null;
  // Stor forbokstav, ingen punktum på slutten (samme stil som norsk)
  g = g.charAt(0).toUpperCase() + g.slice(1);
  g = g.replace(/[.\s]+$/, '');
  return g;
}

/** Ordet (eller en 5-tegns bit) lekker inn i definisjonen → for lett. */
function leaks(word, def) {
  const d = def.toLowerCase();
  if (d.includes(word)) return true;
  if (word.length >= 5) {
    if (d.includes(word.slice(0, 5))) return true;
    if (d.includes(word.slice(-5))) return true;
  }
  return false;
}

/** Definisjonen skal være lettlest: innholdsord må være vanlige. */
function readable(def, { commonMax = 50_000, allowRare = 1, rareMin = 80_000 } = {}) {
  const tokens = def.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  if (!tokens.length) return false;
  let common = 0;
  let rare = 0;
  for (const t of tokens) {
    const r = rankOf(t);
    if (r <= commonMax) common++;
    if (r > rareMin) rare++;
  }
  if (rare > allowRare) return false;
  return common / tokens.length >= 0.7;
}

const hasProperNoun = (def) => /(?<=.)\b[A-Z]/.test(def);

// ---------------------------------------------------------------------------
// 4) "Kjenthets"-filtre for SPILLORD
// ---------------------------------------------------------------------------
const SUFFIXES = [
  's', 'es', 'ed', 'ing', 'ings', 'ly', 'ness', 'nesses', 'ment', 'ments',
  'er', 'ers', 'est', 'ish', 'less', 'ful', 'able', 'ible', 'ably', 'ibly',
  'ation', 'ations', 'ise', 'ised', 'ize', 'ized', 'ily', 'like', 'ical',
];
const PREFIXES = ['un', 're', 'non', 'over', 'under', 'out', 'mis', 'pre', 'anti', 'semi', 'super'];

// Agent-endelser: townsman, busman, driver → definisjonen røper "someone who"
const AGENT_SUF = ['man', 'men', 'woman', 'er', 'ers', 'or', 'ors', 'ist', 'ists'];

/** Gjennomsiktig avledning av et vanlig ord? (unhelpfulness, restacking, townsman …) */
function transparentDerivation(word, def) {
  const stemKnown = (s) => s.length >= 3 && rankOf(s) <= 60_000;
  for (const suf of SUFFIXES) {
    if (!word.endsWith(suf) || word.length - suf.length < 3) continue;
    const stem = word.slice(0, -suf.length);
    if (stemKnown(stem) || stemKnown(stem + 'e')) return true;
    // doblet konsonant: "stopping" → stopp → stop
    if (stem.length >= 4 && stem[stem.length - 1] === stem[stem.length - 2] && stemKnown(stem.slice(0, -1))) return true;
  }
  for (const pre of PREFIXES) {
    if (!word.startsWith(pre) || word.length - pre.length < 4) continue;
    if (stemKnown(word.slice(pre.length))) return true;
  }
  // "Yrkes"-ord der stammen er kjent OG definisjonen sier "someone/a person who..."
  // (townsman = a resident of a town; busman = someone who drives a bus)
  if (/^(someone|a person|one) who\b/i.test(def) || /^(a )?(resident|person|worker|inhabitant) /i.test(def)) {
    for (const suf of AGENT_SUF) {
      if (word.endsWith(suf) && stemKnown(word.slice(0, -suf.length))) return true;
    }
  }
  return false;
}

/**
 * DOBBELTORD (washbin-typen): del ordet på alle mulige punkter – er BEGGE
 * delene vanlige engelske ord hver for seg, er sammensetningen gjennomsiktig
 * og for lett å gjette → ut. Korte deler (3 tegn) må være SUPER-vanlige
 * (bin, man, pot …) for å telle, så vi ikke feller uskyldige ord.
 */
function partIsCommon(part) {
  if (part.length < 3) return false;
  const r = rankOf(part);
  return r <= (part.length === 3 ? 10_000 : 30_000);
}

function transparentCompound(word) {
  for (let i = 3; i <= word.length - 3; i++) {
    const a = word.slice(0, i);
    const b = word.slice(i);
    if (partIsCommon(a) && partIsCommon(b)) return true;
    // fuge-s: "salesroom" → sale + s + room
    if (word[i] === 's' && partIsCommon(a) && partIsCommon(word.slice(i + 1))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 5) Bygg SPILLORD + BLØFF-POOL
// ---------------------------------------------------------------------------
const OBSCURE_RANK = 120_000; // ikke blant de ~120k vanligste på nettet
const gameByWord = new Map(); // word → {word, definition, wc} (korteste def vinner)
const fakeByDef = new Map(); // norm(def) → {word, definition, wc}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

let seenWords = 0;
for (const syn of synsets) {
  const def = cleanGloss(syn.gloss);
  if (!def) continue;
  for (const w of syn.words) {
    if (!/^[a-z]+$/.test(w)) continue; // ett ord, kun små bokstaver
    if (w.length < 4 || w.length > 14) continue;
    seenWords++;

    // --- BLØFF-POOL: vanlige OG sjeldne ords definisjoner (flere temaer) ---
    const r = rankOf(w);
    if (def.length >= 12 && def.length <= 200 && !leaks(w, def) && !hasProperNoun(def)) {
      if (r > 4_000 && readable(def, { commonMax: 60_000, allowRare: 2, rareMin: 100_000 })) {
        const k = norm(def);
        if (k.length >= 8 && !fakeByDef.has(k)) fakeByDef.set(k, { word: w, definition: def, wc: syn.wc });
      }
    }

    // --- SPILLORD: strengt ---
    if (r <= OBSCURE_RANK) continue; // for kjent
    if (transparentDerivation(w, def)) continue;
    if (transparentCompound(w)) continue; // washbin-typen: to vanlige ord limt sammen
    if (def.length < 20 || def.length > 110) continue;
    if (leaks(w, def)) continue;
    if (hasProperNoun(def)) continue;
    if (!readable(def)) continue;
    const prev = gameByWord.get(w);
    if (!prev || def.length < prev.definition.length) gameByWord.set(w, { word: w, definition: def, wc: syn.wc });
  }
}

// Deterministisk stokking + tak
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const rand = mulberry32(seed);
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

const gameAll = seededShuffle([...gameByWord.values()], 20260726);
const game = gameAll.slice(0, 1100).map((g, i) => ({
  id: `en${i + 1}`,
  word: g.word,
  definition: g.definition,
  tags: ['obskur', 'en', g.wc],
}));

const gameWords = new Set(game.map((g) => g.word));
const fakes = seededShuffle(
  [...fakeByDef.values()].filter((f) => !gameWords.has(f.word)),
  20260727
).slice(0, 14_000);

fs.writeFileSync(OUT_WORDS, JSON.stringify(game));
fs.writeFileSync(OUT_FAKES, JSON.stringify(fakes));

// ---------------------------------------------------------------------------
// 6) Statistikk + stikkprøver
// ---------------------------------------------------------------------------
const dist = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {});
console.log(`\nSPILLORD: ${game.length} (av ${gameByWord.size} kandidater)`);
console.log('  ordklasse:', JSON.stringify(dist(game.map((g) => ({ wc: g.tags[2] })), 'wc')));
console.log(`BLØFFER: ${fakes.length} (av ${fakeByDef.size})`);
console.log('  ordklasse:', JSON.stringify(dist(fakes, 'wc')));

console.log('\n=== 40 TILFELDIGE SPILLORD ===');
for (const g of seededShuffle(game, 7).slice(0, 40)) console.log(`  ${g.word} — ${g.definition}`);
console.log('\n=== 15 TILFELDIGE BLØFFER ===');
for (const f of seededShuffle(fakes, 8).slice(0, 15)) console.log(`  [${f.wc}] ${f.definition}  (fra: ${f.word})`);
