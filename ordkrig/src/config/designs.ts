import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * DESIGN-GALLERI: utprøvbare fargepaletter, byttes i Profil → Design.
 * «Original» er NØYAKTIG dagens svart/hvitt og forblir standard – de andre
 * endrer kun farger på nøkkelflatene (ingen layoutendringer).
 * Valget lagres lokalt på telefonen.
 */
export interface Design {
  key: string;
  name: string;
  background: string; // skjermbakgrunn (også knappefyll)
  fill: string; // «hvite» flater: tidsbar-fyll, svar-piller, levert-bobler
  fillText: string; // tekst OPPÅ fill-flatene (svar-tekst m.m.)
  text: string; // hovedtekst (ord, overskrifter, knappetekst)
  textDim: string; // dempet tekst (hint, undertekster)
  outline: string; // rammer/kanter (bobler, felt, knapper)
  accent: string; // små fargedetaljer (rank-bar, markeringer)
  soft: string; // myke rader/flater (lister, poengrader)
  track: string; // tidsbarens spor
  statusBar: 'light' | 'dark'; // klokke/batteri-farge
}

const DARK_COMMON = {
  fillText: '#000000',
  text: '#ffffff',
  textDim: '#8e8e93',
  soft: 'rgba(255,255,255,0.06)',
  track: 'rgba(255,255,255,0.18)',
  statusBar: 'light' as const,
};

export const DESIGNS: Design[] = [
  { key: 'original', name: 'Original', background: '#000000', fill: '#ffffff', outline: '#ffffff', accent: '#ffffff', ...DARK_COMMON },
  // Lyse varianter
  { key: 'lys', name: 'Lys', background: '#f2f2f4', fill: '#101013', fillText: '#ffffff', text: '#101013', textDim: '#5f5f66', outline: '#101013', accent: '#101013', soft: 'rgba(0,0,0,0.05)', track: 'rgba(0,0,0,0.14)', statusBar: 'dark' },
  { key: 'graa', name: 'Grå', background: '#e2e3e6', fill: '#3a3b3f', fillText: '#f4f4f6', text: '#44454a', textDim: '#84858c', outline: '#6f7076', accent: '#6f7076', soft: 'rgba(0,0,0,0.055)', track: 'rgba(0,0,0,0.13)', statusBar: 'dark' },
  { key: 'beige', name: 'Beige', background: '#efe7da', fill: '#4c4337', fillText: '#f7f1e6', text: '#4c4337', textDim: '#93876f', outline: '#7d7060', accent: '#a3865f', soft: 'rgba(76,67,55,0.07)', track: 'rgba(76,67,55,0.16)', statusBar: 'dark' },
  // Mørk med grå tekst/rammer i stedet for hvit
  { key: 'grafitt', name: 'Grafitt', background: '#121214', fill: '#c7c8cd', fillText: '#1a1a1c', text: '#c7c8cd', textDim: '#7c7d83', outline: '#8b8c92', accent: '#c7c8cd', soft: 'rgba(255,255,255,0.05)', track: 'rgba(255,255,255,0.14)', statusBar: 'light' },
  { key: 'agent', name: 'Agent', background: '#04140b', fill: '#2ee97e', fillText: '#04140b', text: '#84ffb4', textDim: '#3f9c68', outline: '#2ee97e', accent: '#2ee97e', soft: 'rgba(46,233,126,0.10)', track: 'rgba(46,233,126,0.22)', statusBar: 'light' },
  { key: 'midnatt', name: 'Midnatt', background: '#0b1220', fill: '#dce6ff', outline: '#dce6ff', accent: '#8fb3ff', ...DARK_COMMON },
  { key: 'skog', name: 'Skog', background: '#0c1510', fill: '#e7f5ea', outline: '#e7f5ea', accent: '#93d9a6', ...DARK_COMMON },
  { key: 'glo', name: 'Glo', background: '#1a120b', fill: '#ffe9d2', outline: '#ffe9d2', accent: '#ffb25c', ...DARK_COMMON },
  { key: 'neon', name: 'Neon', background: '#040907', fill: '#efffe7', outline: '#efffe7', accent: '#26e5a5', ...DARK_COMMON },
];

const KEY = 'wordwar.design.v1';
let current: Design = DESIGNS[0];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Gjeldende design – re-rendrer komponenten når valget endres. */
export function useDesign(): Design {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}

/** Les lagret valg ved oppstart. */
export async function loadDesignChoice(): Promise<void> {
  try {
    const k = await AsyncStorage.getItem(KEY);
    const found = DESIGNS.find((d) => d.key === k);
    if (found) {
      current = found;
      emit();
    }
  } catch {
    // beholder standard
  }
}

/** Bytt design (lagres på telefonen). */
export function setDesign(key: string): void {
  const found = DESIGNS.find((d) => d.key === key);
  if (!found) return;
  current = found;
  emit();
  AsyncStorage.setItem(KEY, key).catch(() => {});
}
