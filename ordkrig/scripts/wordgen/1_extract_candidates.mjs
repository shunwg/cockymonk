// Steg 1 (streng versjon): Kandidater = ordbokas oppslagsord som er HELT
// fraværende i avistekst (frekvenslista brukes som ekskluderingsfilter).
// Ord folk kjenner dukker opp i aviser – ord som aldri gjør det, er målet.
// I tillegg lukes nynorsk-/sideformer ut med mønsterregler.
import fs from 'fs';
import readline from 'readline';

const LEMMA_FILE = 'lemma_nob.txt';
const FREQ_FILE = '1gram_nob_f1_freq.frk';
const OUT_FILE = 'candidates.json';

const MIN_LEN = 5;
const MAX_LEN = 15;

// Nynorsk-/sideform-markører i selve ordet. Heuristikk: falske positiver er
// billige (vi har titusenvis av kandidater), falske negativer er dyre.
const NYNORSK_WORD = [
  /^heim/, // heimtur, heimkunnskap
  /^vass/, // vassfast
  /^spell/, // spellkonsoll, spellebord (bokmål: spill-)
  /^gje/, // gjev, gjere
  /^eig/, // eigenutviklet
  /eigen/,
  /kaup/, // kaup, kaupang-varianter
  /leik$/, // tiurleik (bokmål: -lek)
  /tru$/, // barnetru (bokmål: -tro)
  /veg$/, // tofeltsveg (bokmål: -vei)
  /gard$/, // klostergard (bokmål: -gård)
  /millom/,
  /^åtte?løys/,
  // radikale/nynorsk-nære former
  /raud/, // raudstilk (bokmål: rød-)
  /kjelde/, // kjeldekritikk (bokmål: kilde-)
  /laus$/, // formlaus (bokmål: -løs)
  /vatn$/, // kongevatn (bokmål: -vann)
  /sjuk/, // skulkesjuk, ettersjukdom (bokmål: syk)
  /^fram/, // framtann (bokmål: frem-)
  /mjølk/, // mjølkespann (bokmål: melk)
  /golv/, // golvteppe (bokmål: gulv)
  /daud/, // selvdaud (bokmål: død)
  /^leik/, // leikedyr (bokmål: leke-)
  /mjuk/, // mjukner (bokmål: myk)
  /^heil/, // heilfet (bokmål: hel-)
  /brott$/, // oppbrott (bokmål: -brudd)
  /skau/, // ungskau (bokmål: skog)
  /kvit/, // trekvit (bokmål: hvit)
  /brei/, // breibygget (bokmål: bred)
  /steik/, // helsteikt (bokmål: stek)
  /bleik/, // bleikgul (bokmål: blek)
  /heit$/, // kokheit (bokmål: -het)
  /urein/, // ureinhet (bokmål: uren)
  /jamn/, // ujamnhet (bokmål: jevn)
  /stove$/, // drengestove (bokmål: stue)
  /djup/, /^aust/, /lauv/, /laus/,
];

function looksNynorsk(word) {
  return NYNORSK_WORD.some((re) => re.test(word));
}

// 1) Bygg oppslag over ALLE ord som finnes i avistekst (uansett rank)
const inNews = new Set();
{
  const rl = readline.createInterface({ input: fs.createReadStream(FREQ_FILE, { encoding: 'latin1' }) });
  for await (const line of rl) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const word = m[2];
    if (!/^[a-zæøå]+$/.test(word)) continue;
    inNews.add(word);
  }
}

// 2) Ordbokas lemmaer: behold kun rene ord som ALDRI opptrer i avistekst
const seen = new Set();
const candidates = [];
{
  const rl = readline.createInterface({ input: fs.createReadStream(LEMMA_FILE, { encoding: 'utf8' }) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const word = cols[2].trim().toLowerCase();
    if (!/^[a-zæøå]+$/.test(word)) continue;
    if (word.length < MIN_LEN || word.length > MAX_LEN) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    if (inNews.has(word)) continue; // forekommer i aviser → for kjent
    if (looksNynorsk(word)) continue;
    candidates.push({ word, rank: null });
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(candidates, null, 0));
console.log(`${candidates.length} kandidater (alle helt fraværende i avistekst, nynorsk-former luket).`);
