// Steg 2b: KORT-TIER. Høster obskure ord med KORTE forklaringer (bavle→bable,
// krel→mage, duumvirat→tomannsvelde). Regel: forklaringen er 3–19 tegn, maks
// 3 ord, og ordene i forklaringen må være VANLIGE (topp i frekvenslista) –
// det omvendte kravet av selve ordet. Egen cache: results.short.json.
import fs from 'fs';
import readline from 'readline';

const CANDIDATES_FILE = 'candidates.json';
const CACHE_FILE = 'results.short.json';
const FREQ_FILE = '1gram_nob_f1_freq.frk';
const API = 'https://api.ordbokapi.org/graphql';

const BATCH = parseInt(process.argv[2] ?? '4000', 10);
const CONCURRENCY = 4;
const MIN_DEF_LEN = 3;
const MAX_DEF_LEN = 19;
const MAX_DEF_WORDS = 3;
const COMMON_RANK = 40_000; // forklaringsord må ligge blant de 40k vanligste formene
const GOOD_CLASSES = new Set(['Substantiv', 'Adjektiv', 'Verb']);
const NYNORSK_DEF = /\b(ein|eit|ikkje|nokon|noko|nokre|berre|fleire|sjå|høyrer|vere|søkje|mykje|kvarandre|serleg|attåt|òg)\b/i;

// Vanlige former fra frekvenslista (topp N etter ren rank)
const common = new Set();
{
  const rl = readline.createInterface({ input: fs.createReadStream(FREQ_FILE, { encoding: 'latin1' }) });
  let cleanRank = 0;
  for await (const line of rl) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const word = m[2];
    if (!/^[a-zæøå]+$/.test(word)) continue;
    cleanRank++;
    if (cleanRank > COMMON_RANK) break;
    common.add(word);
  }
}

function wordLeaksIntoDef(word, def) {
  const d = def.toLowerCase();
  if (d.includes(word)) return true;
  for (const n of [4, 5]) {
    if (word.length >= n + 1) {
      if (d.includes(word.slice(0, n))) return true;
      if (d.includes(word.slice(-n))) return true;
    }
  }
  return false;
}

/** Kort forklaring godkjennes når ordene i den er kjente for folk flest. */
function shortDefOk(word, text) {
  if (text.length < MIN_DEF_LEN || text.length > MAX_DEF_LEN) return false;
  const tokens = text.toLowerCase().match(/[a-zæøå]+/g) ?? [];
  if (tokens.length < 1 || tokens.length > MAX_DEF_WORDS) return false;
  if (/^(sjå|se)( |$)/i.test(text)) return false;
  if (/[:;]$/.test(text)) return false;
  if (/^i [a-zæøå]+$/i.test(text)) return false; // fagfelt-fragment ("i musikk")
  if (NYNORSK_DEF.test(text)) return false;
  if (wordLeaksIntoDef(word, text)) return false;
  const commonCount = tokens.filter((t) => common.has(t)).length;
  // 1 ord: må være vanlig. 2–3 ord: minst halvparten vanlige.
  return tokens.length === 1 ? commonCount === 1 : commonCount / tokens.length >= 0.5;
}

const candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(777333);
const shuffled = [...candidates];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const todo = shuffled.filter((c) => !(c.word in cache)).slice(0, BATCH);
console.log(`${Object.keys(cache).length} allerede i kort-cache. Slår opp ${todo.length} ord...`);

const QUERY = `query($w:String!){ word(word:$w, dictionaries:[Bokmaalsordboka]){ articles { wordClass lemmas { lemma } definitions { content { textContent } } } } }`;

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
        if (art.wordClass === 'Adjektiv' && /a$/.test(word)) continue;
        for (const def of art.definitions ?? []) {
          for (const c of def.content ?? []) {
            let text = (c.textContent ?? '').trim().replace(/\s*jamfør\s+.*$/i, '').trim();
            if (!text || text.toLowerCase() === word) continue;
            if (!shortDefOk(word, text)) continue;
            if (!best || text.length < best.definition.length) {
              best = { definition: text, wordClass: art.wordClass };
            }
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
      // prøves igjen neste kjøring
    } else {
      cache[c.word] = result ?? null;
      if (result) kept++;
    }
    done++;
    if (done % 200 === 0) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
      console.log(`  ${done}/${todo.length} slått opp, ${kept} korte funn så langt`);
    }
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

const totalGood = Object.values(cache).filter((v) => v).length;
console.log(`Ferdig. ${kept} nye korte funn denne kjøringen. Totalt ${totalGood} i kort-cache.`);
