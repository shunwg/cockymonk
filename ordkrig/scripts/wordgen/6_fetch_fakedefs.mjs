// Utvider bot-bløff-poolen: henter FLERE (og mer utbroderende) definisjoner fra
// Ordbok API (Bokmålsordboka, CC BY 4.0) enn de strenge spill-cachene beholdt.
// Løsere filter (opptil 200 tegn, tar første brukbare gloss – ikke den korteste),
// så vi får både korte og lengre forklaringer, og flere verb/adjektiv.
// Resumerbart: cacher i fakedefs.cache.json. Kjør på nytt for å hente mer.
//
//   node 6_fetch_fakedefs.mjs [antall]     (default 12000)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES = path.join(__dirname, 'candidates.json');
const CACHE_FILE = path.join(__dirname, 'fakedefs.cache.json');
const API = 'https://api.ordbokapi.org/graphql';

const BATCH = parseInt(process.argv[2] ?? '12000', 10);
const CONCURRENCY = 5;
const MIN_LEN = 12;
const MAX_LEN = 200;
const GOOD_CLASSES = new Set(['Substantiv', 'Adjektiv', 'Verb']);
const NYNORSK_DEF = /\b(ein|eit|ikkje|nokon|noko|nokre|berre|fleire|sjå|høyrer|vere|søkje|mykje|kvarandre|serleg|attåt|òg|ho|dei)\b/i;

const QUERY = `query($w:String!){ word(word:$w, dictionaries:[Bokmaalsordboka]){ articles { wordClass lemmas { lemma } definitions { content { textContent } } } } }`;

const candidates = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};

// Hopp over ord som allerede er dekket av de strenge cachene (5_build høster dem)
const alreadyGood = new Set();
for (const f of ['results.v2.json', 'results.short.json']) {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) continue;
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const [w, v] of Object.entries(c)) if (v && v.definition) alreadyGood.add(w);
}

// Deterministisk stokking så utvalget er variert men reproduserbart
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260726);
const shuffled = [...candidates];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const todo = shuffled.filter((c) => !(c.word in cache) && !alreadyGood.has(c.word)).slice(0, BATCH);
console.log(`${Object.keys(cache).length} i cache, ${alreadyGood.size} dekket av strenge cacher. Henter ${todo.length} nye...`);

function acceptable(word, def) {
  if (!def) return false;
  if (def.length < MIN_LEN || def.length > MAX_LEN) return false;
  if (/^(sjå|se) /i.test(def)) return false;
  if (/:$/.test(def)) return false;
  if (NYNORSK_DEF.test(def)) return false;
  if (def.toLowerCase() === word.toLowerCase()) return false;
  return true;
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
      for (const art of articles) {
        if (!GOOD_CLASSES.has(art.wordClass)) continue;
        const lemmas = (art.lemmas ?? []).map((l) => l.lemma);
        if (!lemmas.includes(word)) continue;
        if (art.wordClass === 'Adjektiv' && /a$/.test(word)) continue;
        for (const def of art.definitions ?? []) {
          // FØRSTE brukbare gloss (ikke den korteste) → beholder utbroderende
          for (const c of def.content ?? []) {
            let text = (c.textContent ?? '').replace(/\s*jamfør\s+.*$/i, '').trim();
            if (!text) continue;
            if (acceptable(word, text)) return { definition: text, wordClass: art.wordClass };
          }
        }
      }
      return null;
    } catch {
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
      // ikke cache feil – prøves igjen neste kjøring
    } else {
      cache[c.word] = result ?? null;
      if (result) kept++;
    }
    done++;
    if (done % 200 === 0) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
      console.log(`  ${done}/${todo.length} slått opp, ${kept} gode så langt`);
    }
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
const totalGood = Object.values(cache).filter((v) => v && v.definition).length;
console.log(`Ferdig. ${kept} nye gode denne kjøringen. Totalt ${totalGood} gode i fakedefs.cache.json.`);
