/**
 * Grov gjenkjenning av ekte forklaring vs. tastaturrot ("ouigefiUHO", "xkzptqw").
 * Bots skal ikke stemme på svar som åpenbart er tull eller feilskrevne.
 * Bot-svarene selv (ordboksdefinisjoner) og fasit passerer alltid – kun
 * spillerens/ekte brukeres rot fanges. Konservativ: heller slippe gjennom et
 * rart-men-ekte svar enn å avvise et gyldig.
 */
export function isPlausibleAnswer(raw: string): boolean {
  const text = (raw ?? '').trim();
  if (text.length < 3) return false;

  const letters = (text.match(/[a-zæøåA-ZÆØÅ]/g) ?? []).length;
  if (letters < 3) return false;

  // Tilfeldige store bokstaver midt i et ord (liten→STOR): "ouigefiUHO"
  if (/[a-zæøå][A-ZÆØÅ]/.test(text)) return false;

  // For få vokaler = konsonantrot ("xkzptqw", "bcdfgh")
  const vowels = (text.match(/[aeiouyæøå]/gi) ?? []).length;
  if (vowels / letters < 0.22) return false;

  // Minst ett ordentlig "ord" (2+ tegn med vokal)
  if (!text.split(/\s+/).some((w) => w.length >= 2 && /[aeiouyæøå]/i.test(w))) return false;

  return true;
}
