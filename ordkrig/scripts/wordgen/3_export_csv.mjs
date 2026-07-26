// Steg 3: Gjør de hentede ordene om til CSV klar for spillet.
// Leser results.json (cache fra steg 2) og skriver ut ord + definisjon,
// sortert med de mest obskure (fraværende i avistekst) først.
import fs from 'fs';

const CACHE_FILE = 'results.json';
const OUT_FILE = 'obscure_words.csv';

const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const good = Object.entries(cache)
  .filter(([, v]) => v)
  .map(([word, v]) => ({ word, ...v }))
  // Siste kvalitetsfilter: dropp fragmenter og for tynne definisjoner
  .filter((g) => {
    const d = g.definition.trim();
    if (!d.includes(' ')) return false; // enkeltord-definisjon er for tynn
    if (/^brukt som (adjektiv|adverb|substantiv|verb)/i.test(d)) return false; // grammatikk-fragment
    if (/^(i overført betydning|i uttrykk)$/i.test(d)) return false;
    return true;
  });

// Mest obskure først: fraværende (rank null) øverst, deretter sjeldnest
good.sort((a, b) => (b.rank ?? Infinity) - (a.rank ?? Infinity));

function csvEscape(s) {
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const wordClassTag = { Substantiv: 'subst', Adjektiv: 'adj', Verb: 'verb' };

const rows = ['word,definition,wordclass,tags'];
for (const g of good) {
  const tag = wordClassTag[g.wordClass] ?? '';
  const obscurity = g.rank === null ? 'obskur' : 'sjelden';
  rows.push([csvEscape(g.word), csvEscape(g.definition), tag, `${obscurity};bm`].join(','));
}

fs.writeFileSync(OUT_FILE, rows.join('\n') + '\n');
console.log(`Skrev ${good.length} ord til ${OUT_FILE}`);
