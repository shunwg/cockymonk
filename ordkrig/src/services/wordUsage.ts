import AsyncStorage from '@react-native-async-storage/async-storage';
import { wordsFor } from '../game-engine/words';
import { Word } from '../game-engine/types';

/**
 * BRUKS-STYRT ORDVALG: appen teller hver gang et ord er brukt (per liga,
 * lagret lokalt på enheten). pickWord trekker KUN blant ordene med lavest
 * brukstall → hele lista roteres gjennom før noe ord gjentas.
 *
 * Telling skjer ved EKSPONERING (klienten ser ordet i en runde), så verts-
 * bytte og medspill teller likt. Er telleren ikke lastet ennå, faller valget
 * tilbake til ren tilfeldighet.
 */

type Lang = 'no' | 'en';
const KEY = 'wordwar.wordusage.v1';

let usage: Record<Lang, Record<string, number>> = { no: {}, en: {} };
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Last tellerne fra lager (kalles ved oppstart). */
export async function loadWordUsage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<typeof usage>;
      usage = { no: parsed.no ?? {}, en: parsed.en ?? {} };
    }
  } catch {
    // beholder tomt – ren tilfeldighet til neste forsøk
  }
  loaded = true;
}

function persistSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(usage)).catch(() => {});
  }, 400);
}

/** Registrer at et ord er brukt/vist (én gang per runde per klient). */
export function recordWordUsed(word: string, lang: Lang): void {
  if (!word) return;
  const w = word.toLowerCase();
  usage[lang][w] = (usage[lang][w] ?? 0) + 1;
  persistSoon();
}

/** Velg et ord blant dem med LAVEST brukstall i ligaen. */
export function pickWord(lang: Lang): Word {
  const list = wordsFor(lang);
  if (!loaded || !list.length) return list[Math.floor(Math.random() * list.length)];
  const counts = usage[lang];
  let min = Infinity;
  for (const w of list) {
    const c = counts[w.word.toLowerCase()] ?? 0;
    if (c < min) min = c;
    if (min === 0) break;
  }
  const bucket = list.filter((w) => (counts[w.word.toLowerCase()] ?? 0) === min);
  return bucket[Math.floor(Math.random() * bucket.length)];
}
