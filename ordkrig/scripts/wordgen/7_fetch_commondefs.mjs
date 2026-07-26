// Bløff-pool fra VANLIGE ord: definisjonene som brukes som falske forklaringer
// trenger ikke komme fra sjeldne ord – vanlige ords definisjoner er like gode
// (og gir langt større variasjon). Henter fra Bokmålsordboka (CC BY 4.0) for
// ord i frekvensbåndet ~300–12000 i avistekst (hopper over funksjonsord på topp).
// Resumerbart: cacher i commondefs.cache.json.
//
//   node 7_fetch_commondefs.mjs [antall]     (default 8000)
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FREQ_FILE = path.join(__dirname, '1gram_nob_f1_freq.frk');
const CACHE_FILE = path.join(__dirname, 'commondefs.cache.json');
const API = 'https://api.ordbokapi.org/graphql';

const BATCH = parseInt(process.argv[2] ?? '8000', 10);
const CONCURRENCY = 5;
const MIN_LEN = 12;
const MAX_LEN = 200;
const RANK_FROM = 300; // hopp over "og", "i", "på" osv.
const RANK_TO = 30_000; // utvidet bånd → langt flere temaer i bløff-poolen
const GOOD_CLASSES = new Set(['Substantiv', 'Adjektiv', 'Verb']);
const NYNORSK_DEF = /\b(ein|eit|ikkje|nokon|noko|nokre|berre|fleire|sjå|høyrer|vere|søkje|mykje|kvarandre|serleg|attåt|òg|ho|dei)\b/i;

const QUERY = `query($w:String!){ word(word:$w, dictionaries:[Bokmaalsordboka]){ articles { wordClass lemmas { lemma } definitions { content { textContent } } } } }`;

// Frekvenslista: "antall ord" per linje, mest frekvente først? Nei – sorter selv.
const rows = [];
{
  const rl = readline.createInterface({ input: fs.createReadStream(FREQ_FILE, { encoding: 'latin1' }) });
  for await (const line of rl) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const count = parseInt(m[1], 10);
    const word = m[2];
    if (!/^[a-zæøå]{3,15}$/.test(word)) continue;
    rows.push({ word, count });
  }
}
rows.sort((a, b) => b.count - a.count);
const commonBand = rows.slice(RANK_FROM, RANK_TO).map((r) => r.word);

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
const todo = commonBand.filter((w) => !(w in cache)).slice(0, BATCH);
console.log(`${Object.keys(cache).length} i cache. Henter ${todo.length} vanlige ord (rank ${RANK_FROM}–${RANK_TO})...`);

function acceptable(word, def) {
  if (!def) return false;
  if (def.length < MIN_LEN || def.length > MAX_LEN) return false;
  if (/^(sjå|se) /i.test(def)) return false;
  if (/:$/.test(def)) return false;
  if (NYNORSK_DEF.test(def)) return false;
  if (def.toLowerCase().includes(word.toLowerCase())) return false; // ikke røp kilden
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
        for (const def of art.definitions ?? []) {
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
    const w = queue.shift();
    const result = await lookup(w);
    if (result?.error) {
      // ikke cache feil – prøves igjen neste kjøring
    } else {
      cache[w] = result ?? null;
      if (result) kept++;
    }
    done++;
    if (done % 250 === 0) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
      console.log(`  ${done}/${todo.length} slått opp, ${kept} gode så langt`);
    }
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
const totalGood = Object.values(cache).filter((v) => v && v.definition).length;
console.log(`Ferdig. ${kept} nye gode denne kjøringen. Totalt ${totalGood} gode i commondefs.cache.json.`);
