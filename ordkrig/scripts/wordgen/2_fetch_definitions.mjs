// Steg 2 (streng versjon): Slå opp kandidater i Ordbok API (CC BY 4.0).
// Viktigste endringer fra v1:
//  - KUN første gloss brukes (aldri flere glosser limt sammen uten komma)
//  - ordet (eller en bit av det) får ikke forekomme i forklaringen
//  - nynorsk-markører i forklaringen avviser ordet
//  - lengre minimumslengde => vekk med tynne forklaringer
// Resumerbart: cacher i results.v2.json (v1-cachen har sammenslåtte glosser).
import fs from 'fs';

const CANDIDATES_FILE = 'candidates.json';
const CACHE_FILE = 'results.v2.json';
const API = 'https://api.ordbokapi.org/graphql';

const BATCH = parseInt(process.argv[2] ?? '2000', 10);
const CONCURRENCY = 4;
const MIN_DEF_LEN = 20;
const MAX_DEF_LEN = 110;
const GOOD_CLASSES = new Set(['Substantiv', 'Adjektiv', 'Verb']);

// Nynorsk-funksjonsord i definisjonsteksten → avvis
const NYNORSK_DEF = /\b(ein|eit|ikkje|nokon|noko|nokre|berre|fleire|sjå|høyrer|høyre til|vere|søkje|mykje|kvarandre|serleg|attåt|òg)\b/i;

/** Ordet (eller en 5-tegns bit av det) lekker inn i forklaringen → for lett å gjette. */
function wordLeaksIntoDef(word, def) {
  const d = def.toLowerCase();
  if (d.includes(word)) return true;
  if (word.length >= 5) {
    if (d.includes(word.slice(0, 5))) return true;
    if (d.includes(word.slice(-5))) return true;
  }
  return false;
}

const candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};

// Deterministisk stokking (seeded) så utvalget er variert men reproduserbart.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260723);
const shuffled = [...candidates];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const todo = shuffled.filter((c) => !(c.word in cache)).slice(0, BATCH);
console.log(`${Object.keys(cache).length} allerede i cache. Slår opp ${todo.length} nye ord...`);

const QUERY = `query($w:String!){ word(word:$w, dictionaries:[Bokmaalsordboka]){ articles { wordClass lemmas { lemma } definitions { content { textContent } } } } }`;

function extractGloss(def, word) {
  // KUN første reelle gloss – unngår "forklaring1 forklaring2" uten skilletegn.
  for (const c of def.content ?? []) {
    const t = (c.textContent ?? '').trim();
    if (!t) continue;
    if (t.toLowerCase() === word) continue; // ren gjentakelse av oppslagsordet
    return t;
  }
  return null;
}

async function lookup(word) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { w: word } }),
      });
      const json = await res.json();
      const articles = json?.data?.word?.articles ?? [];
      let best = null;
      for (const art of articles) {
        if (!GOOD_CLASSES.has(art.wordClass)) continue;
        const lemmas = (art.lemmas ?? []).map((l) => l.lemma);
        if (!lemmas.includes(word)) continue;
        // Nynorsk-aktige adjektiv på -a (etterlengta, ubona, benåda)
        if (art.wordClass === 'Adjektiv' && /a$/.test(word)) continue;
        for (const def of art.definitions ?? []) {
          let text = extractGloss(def, word);
          if (!text) continue;
          text = text.replace(/\s*jamfør\s+.*$/i, '').trim();
          if (text.length < MIN_DEF_LEN || text.length > MAX_DEF_LEN) continue;
          if (/^(sjå|se) /i.test(text)) continue;
          if (/:$/.test(text)) continue;
          if (/^person (fra|som (høre|hører|høyrer) til)/i.test(text)) continue;
          if (/^brukt som/i.test(text)) continue;
          if (/^i (overført betydning|uttrykk)/i.test(text)) continue;
          if (NYNORSK_DEF.test(text)) continue;
          if (wordLeaksIntoDef(word, text)) continue;
          if (!best || text.length < best.definition.length) {
            best = { definition: text, wordClass: art.wordClass };
          }
        }
      }
      return best;
    } catch (e) {
      if (attempt === 1) return { error: true };
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

let done = 0;
let kept = 0;
async function worker(queue) {
  while (queue.length) {
    const c = queue.shift();
    const result = await lookup(c.word);
    if (result?.error) {
      // ikke cache feil, prøves igjen neste kjøring
    } else {
      cache[c.word] = result ? { ...result, rank: c.rank ?? null } : null;
      if (result) kept++;
    }
    done++;
    if (done % 100 === 0) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
      console.log(`  ${done}/${todo.length} slått opp, ${kept} gode så langt`);
    }
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

const totalGood = Object.values(cache).filter((v) => v).length;
console.log(`Ferdig. ${kept} nye gode ord denne kjøringen. Totalt ${totalGood} gode ord i cache.`);
