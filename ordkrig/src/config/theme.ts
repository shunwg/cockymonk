/**
 * TEMA – ett sted for farger, opacity-tilstander, former og størrelser.
 * Stil (Word War 1): sort bakgrunn, hvite piller, systemfont (SF Pro på iOS).
 */

export const colors = {
  background: '#000000',
  surface: '#1c1c1e',
  text: '#ffffff',
  textSecondary: '#8e8e93',
  outline: '#ffffff',
  accent: '#0a84ff', // beholdt for evt. senere bruk
  accentText: '#ffffff',

  // svar-piller / fremdrift
  track: 'rgba(255,255,255,0.18)',
  fill: '#ffffff',

  // stemmeskjerm
  correctBg: '#16351f',
  correctBorder: '#34c759',
};

/** Opacity-tilstander (spec §4). Alle overganger animeres. */
export const opacity = {
  active: 1.0,
  tonet: 0.6,
  sterkt: 0.4,
  skjult: 0,
};

export const radius = {
  pill: 999, // felles pille-radius
  button: 999,
  field: 28, // skrivefelt: samme hjørnekurvatur som knappen
  card: 22,
  bar: 3,
};

export const sizes = {
  edge: 26, // avstand fra skjermkant til klokke/ikon
  mainPillHeight: 56,
  statusPillHeight: 36,
  borderWidth: 2,
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// Semantiske reveal-farger – like i alle designpaletter (fasit grønn, feilgjett rød)
export const verdict = {
  correct: '#3E8E5A',
  wrong: '#B04A3F',
  text: '#FFFFFF',
};

// Systemfont brukes ved å IKKE sette fontFamily (RN faller til SF Pro på iOS).
export const typography = {
  title: { fontSize: 40, fontWeight: '800' as const, color: colors.text },
  heading: { fontSize: 22, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 17, fontWeight: '400' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.textSecondary },
};
