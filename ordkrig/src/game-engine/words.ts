import wordsNo from '../data/generated/words.no.json';
import wordsEn from '../data/generated/words.en.json';
import { Word } from './types';

const NO = wordsNo as Word[];
const EN = wordsEn as Word[];

const listFor = (lang: string | null | undefined): Word[] => (lang === 'en' ? EN : NO);

/** Hele ordlista for en liga (brukes av det bruks-styrte ordvalget). */
export function wordsFor(lang: string | null | undefined): Word[] {
  return listFor(lang);
}

/** Hent et tilfeldig ord fra ordlista for gitt liga ('no' | 'en'). */
export function getRandomWord(lang: string | null | undefined = 'no'): Word {
  const list = listFor(lang);
  return list[Math.floor(Math.random() * list.length)];
}
