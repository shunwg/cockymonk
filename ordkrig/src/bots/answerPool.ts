import fakeDefs from '../data/generated/fakeDefs.json';
import fakeDefsEn from '../data/generated/fakeDefs.en.json';
import { classifyDefinition, contentWords } from './botBrain';
import { Word } from '../game-engine/types';

/**
 * Falske forklaringer til bottene hentes fra en STOR pool av ekte ordbok-
 * definisjoner (bygget av scripts/wordgen/5_build_fakedefs.mjs) – IKKE begrenset
 * til spillordene. Det fjerner gjentakelser og gjør bløffene troverdige i stil.
 *
 * Matcheregler:
 *  - samme ordklasse som målordet (verb → verbforklaringer osv.)
 *  - lengdebånd: kort fasit kamufleres med korte bløffer (og omvendt)
 *  - "lærde" ord (latinsk/gresk-aktige) får 1–2 lærde bløffer, men aldri alle
 *  - en bløff er ALDRI identisk med fasiten
 *
 * TODO (fase 2, ekte brukere): sjekk answerArchive først – gode forklaringer
 * fra ekte spillere (≥2 ekte stemmer) skal prioriteres foran ordboksbløffene.
 */

interface FakeRow {
  word: string;
  definition: string;
  wc: 'subst' | 'verb' | 'adj';
}

const ALL_NO = fakeDefs as FakeRow[];
const ALL_EN = fakeDefsEn as FakeRow[];

// Latinsk/gresk-aktige ord: -sjon, -isme, -itet, -logi, -ium, -ikk, -isk ...
const LEARNED = /(sjon|isme|itet|logi|ikk|ium|isk|ent|ant|ase|ose|yse)$/;
const isLearned = (w: string) => LEARNED.test(w);
const wcOf = (tags?: string[]) => tags?.find((t) => t === 'subst' || t === 'adj' || t === 'verb');
const norm = (s: string) => s.toLowerCase().replace(/[^a-zæøå0-9]/g, '');

function takeRandom<T>(arr: T[], n: number, into: T[]): void {
  const c = arr.filter((x) => !into.includes(x));
  for (let i = 0; i < n && c.length; i++) {
    into.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  }
}

function shuffle<T>(arr: T[]): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

// Lengdebånd: kort fasit må kamufleres med korte bløffer (og omvendt),
// ellers avslører lengden hvilket svar som er det ekte.
const SHORT_BAND = 25;

/**
 * Hent `count` ulike falske forklaringer som passer målordet i stil.
 *
 * NÆRHET: omtrent halvparten av bløffene velges etter en nærhets-score som
 * belønner forklaringer som "ligner" målordet:
 *  - kort fasit + kort bløff med samme forbokstav som ordet (bavle→Bable-mønsteret)
 *  - kildeord som deler forbokstav eller 2-tegns prefiks med målordet
 *  - forklaringslengde nær fasitens lengde
 *  - samme lærdhet (latinsk/gresk-aktig ↔ folkelig)
 * Resten trekkes tilfeldig fra samme ordklasse, så settet ikke blir ensartet
 * (var alle bløffene "nære" ville fasiten skilt seg ut når den IKKE er det).
 */
export function getFakeExplanations(target: Word, count: number, lang: 'no' | 'en' = 'no'): string[] {
  const ALL = lang === 'en' ? ALL_EN : ALL_NO;
  const targetDef = target.definition ?? '';
  // Ordklasse: fra tags når vi har dem, ellers KLASSIFISER fasit-teksten
  // (bot-hjernen) – da funker ordklasse-matching også etter vertsbytte/online.
  const targetWc = wcOf(target.tags) ?? classifyDefinition(targetDef, lang) ?? undefined;
  // Fasitens innholdsord: bløffer i samme TEMA (plante↔plante) løftes, så flere
  // av rundens svar havner i samme kategori.
  const fasitWords = new Set(contentWords(targetDef, lang));
  const targetDefKey = norm(targetDef);
  const firstLetter = (target.word[0] ?? '').toLowerCase();
  const prefix2 = target.word.slice(0, 2).toLowerCase();
  const targetShort = targetDef.length < SHORT_BAND;
  const targetLearned = isLearned(target.word);

  // Ekskluder målordet selv OG en bløff som er identisk med fasiten
  const pool = ALL.filter((r) => r.word !== target.word && norm(r.definition) !== targetDefKey);

  // Samme ordklasse hvis det finnes nok å velge i, ellers hele poolen
  const sameWc = targetWc ? pool.filter((r) => r.wc === targetWc) : pool;
  const base = sameWc.length >= count * 3 ? sameWc : pool;

  const closeness = (r: FakeRow): number => {
    let s = Math.random(); // jitter → variasjon mellom runder
    if (r.word[0]?.toLowerCase() === firstLetter) s += 1.5;
    if (r.word.slice(0, 2).toLowerCase() === prefix2) s += 1;
    if (targetShort && r.definition.length < SHORT_BAND && r.definition[0]?.toLowerCase() === firstLetter) s += 2.5;
    const ratio = r.definition.length / Math.max(1, targetDef.length);
    if (ratio > 0.6 && ratio < 1.6) s += 1; // lengde nær fasiten
    if (isLearned(r.word) === targetLearned) s += 0.5;
    // TEMA: deler bløffen innholdsord med fasiten (plante↔plante), løftes den
    if (fasitWords.size) {
      let shared = 0;
      for (const w of contentWords(r.definition, lang)) if (fasitWords.has(w)) shared++;
      s += Math.min(2, shared) * 1.1;
    }
    return s;
  };

  // ~Halvparten "nære" (topp-scorede), resten tilfeldige i samme lengdebånd/klasse
  const nClose = Math.ceil(count / 2);
  const picks: FakeRow[] = base
    .map((r) => ({ r, s: closeness(r) })) // score én gang per rad (stabil sortering)
    .sort((a, b) => b.s - a.s)
    .slice(0, nClose)
    .map((x) => x.r);

  const sameBand = base.filter((r) => (r.definition.length < SHORT_BAND) === targetShort);
  takeRandom(sameBand, Math.max(0, count - picks.length - 1), picks);
  takeRandom(base, count - picks.length, picks);
  if (picks.length < count) takeRandom(pool, count - picks.length, picks); // nødfyll

  return shuffle(picks).map((r) => r.definition);
}
