import fakeDefsNo from '../data/generated/fakeDefs.json';
import fakeDefsEn from '../data/generated/fakeDefs.en.json';

/**
 * BOT-HJERNEN: gjør bottene «lesende» velgere i stedet for terningkast.
 *  - classifyDefinition: ordklasse-stil for VILKÅRLIG forklaringstekst (også
 *    ekte spilleres svar) – datadrevet førsteords-kart fra bløff-poolene +
 *    språkregler. Fungerer for norsk og engelsk.
 *  - pickBotVote: vektet stemmevalg der svar som LIGNER fasiten (samme
 *    ordklasse-stil, delte innholdsord, lignende lengde) er mer sannsynlige.
 */

type Wc = 'subst' | 'verb' | 'adj';
type Lang = 'no' | 'en';

interface Row {
  word: string;
  definition: string;
  wc: Wc;
}

const POOLS: Record<Lang, Row[]> = {
  no: fakeDefsNo as Row[],
  en: fakeDefsEn as Row[],
};

const STOP: Record<Lang, Set<string>> = {
  no: new Set([
    'som', 'eller', 'og', 'med', 'uten', 'for', 'til', 'fra', 'ved', 'etter', 'over', 'under',
    'mellom', 'den', 'det', 'de', 'ikke', 'noe', 'noen', 'være', 'blir', 'bli', 'har', 'kan',
    'skal', 'vil', 'seg', 'sin', 'sitt', 'sine', 'om', 'mot', 'hos', 'enn', 'mer', 'mest',
    'mindre', 'svært', 'helt', 'bare', 'også', 'slik', 'dette', 'denne', 'disse', 'man', 'hver',
    'alle', 'andre', 'annet', 'annen', 'eldre', 'betegnelse', 'særlig', 'ofte', 'gjerne', 'brukt',
    'type', 'form', 'slags', 'del', 'stor', 'store', 'liten', 'lite', 'små', 'person', 'gjelder',
  ]),
  en: new Set([
    'the', 'that', 'which', 'who', 'whose', 'this', 'these', 'those', 'with', 'without', 'from',
    'into', 'out', 'over', 'under', 'between', 'when', 'where', 'while', 'someone', 'somebody',
    'something', 'anything', 'other', 'another', 'more', 'most', 'less', 'very', 'used',
    'especially', 'usually', 'often', 'type', 'kind', 'form', 'part', 'some', 'any', 'their',
    'have', 'has', 'been', 'being', 'made', 'make', 'makes', 'person', 'relating', 'having',
  ]),
};

/** Innholdsord (≥4 tegn, minus stoppord) – grunnlaget for tema-sammenligning. */
export function contentWords(text: string, lang: Lang): string[] {
  const rx = lang === 'no' ? /[a-zæøå]{4,}/g : /[a-z]{4,}/g;
  return (text.toLowerCase().match(rx) ?? []).filter((w) => !STOP[lang].has(w));
}

// Førsteords-kart: første ord i definisjonen → dominant ordklasse (fra poolene)
const maps: Partial<Record<Lang, Map<string, Wc>>> = {};
function firstWordMap(lang: Lang): Map<string, Wc> {
  const existing = maps[lang];
  if (existing) return existing;
  const counts = new Map<string, Record<Wc, number>>();
  for (const r of POOLS[lang]) {
    const fw = r.definition.toLowerCase().match(lang === 'no' ? /^[a-zæøå]+/ : /^[a-z]+/)?.[0];
    if (!fw) continue;
    const c = counts.get(fw) ?? { subst: 0, verb: 0, adj: 0 };
    c[r.wc]++;
    counts.set(fw, c);
  }
  const m = new Map<string, Wc>();
  for (const [fw, c] of counts) {
    const total = c.subst + c.verb + c.adj;
    if (total < 3) continue;
    for (const wc of ['subst', 'verb', 'adj'] as Wc[]) {
      if (c[wc] / total >= 0.7) {
        m.set(fw, wc);
        break;
      }
    }
  }
  maps[lang] = m;
  return m;
}

/** Ordklasse-stil for en definisjonstekst (også ekte spillersvar). null = usikker. */
export function classifyDefinition(text: string, lang: Lang): Wc | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (lang === 'no') {
    if (/^å\s/.test(t)) return 'verb';
    if (/^(som|preget av|uten|karakterisert|kjennetegnet|full av)\b/.test(t)) return 'adj';
  } else {
    if (/^to\s/.test(t)) return 'verb';
    if (/^(of|relating to|having|characterized by|capable of|resembling|marked by|lacking|tending to|inclined to)\b/.test(t)) return 'adj';
    if (/^(a|an|the|any|someone|somebody|something|one)\b/.test(t)) return 'subst';
  }
  const fw = t.match(lang === 'no' ? /^[a-zæøå]+/ : /^[a-z]+/)?.[0];
  if (fw) {
    const mapped = firstWordMap(lang).get(fw);
    if (mapped) return mapped;
  }
  return null;
}

/**
 * BOT-STEMME: vektet tilfeldig valg blant kandidatene.
 *  +1.6 samme ordklasse-stil som fasiten
 *  +1.4 per delt innholdsord med fasiten (maks 2) – gjelder KUN bløffer
 *  +0.5 lengde i samme sjikt som fasiten
 * Grunnvekt 1 → ingen kandidat er umulig; bottene forblir feilbarlige.
 */
export function pickBotVote<T extends { text: string; is_correct: boolean }>(
  candidates: T[],
  fasitText: string,
  lang: Lang
): T | null {
  if (!candidates.length) return null;
  const fasitWc = classifyDefinition(fasitText, lang);
  const fasitWords = new Set(contentWords(fasitText, lang));
  const weights = candidates.map((c) => {
    let s = 1;
    if (fasitWc && classifyDefinition(c.text, lang) === fasitWc) s += 1.6;
    if (!c.is_correct && fasitWords.size) {
      let shared = 0;
      for (const w of contentWords(c.text, lang)) if (fasitWords.has(w)) shared++;
      s += Math.min(2, shared) * 1.4;
    }
    const ratio = c.text.length / Math.max(1, fasitText.length);
    if (ratio > 0.5 && ratio < 2) s += 0.5;
    return s;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
