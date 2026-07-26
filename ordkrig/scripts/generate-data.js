const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const dataDir = path.join(__dirname, '..', 'src', 'data');
const outDir = path.join(dataDir, 'generated');

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, errors } = Papa.parse(raw, { header: true, skipEmptyLines: true });
  if (errors.length > 0) {
    throw new Error(`Feil ved parsing av ${filePath}: ${JSON.stringify(errors)}`);
  }
  return data;
}

fs.mkdirSync(outDir, { recursive: true });

const words = parseCsv(path.join(dataDir, 'words', 'no.csv')).map((row) => ({
  id: row.id,
  word: row.word,
  definition: row.definition,
  tags: row.tags ? row.tags.split(';').map((t) => t.trim()) : [],
}));
fs.writeFileSync(path.join(outDir, 'words.no.json'), JSON.stringify(words, null, 2));

// (Bot-bløffer bygges separat av scripts/wordgen/5_build_fakedefs.mjs → fakeDefs.json)
console.log(`Generert ${words.length} ord.`);
