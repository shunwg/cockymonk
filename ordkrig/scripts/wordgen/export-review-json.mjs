// Eksporterer ordlista som JSON til en oppgitt fil (for gjennomgangs-sida).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, '..', '..', 'src', 'data', 'words', 'no.csv');
const OUT = process.argv[2];

const { data } = Papa.parse(fs.readFileSync(CSV, 'utf8'), { header: true, skipEmptyLines: true });
const items = data.map((r) => ({ w: r.word, d: r.definition, t: r.tags }));
fs.writeFileSync(OUT, JSON.stringify(items));
console.log(`Skrev ${items.length} ord til ${OUT}`);
