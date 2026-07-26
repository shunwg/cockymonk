/**
 * Regler for automatisk tildelte brukernavn.
 *
 * MENNESKER (generateHumanUsername): <Beskrivelse><Dyr> ("LurGaupe") eller en
 * dyrehybrid ("Hundegjeit", "Torskekatt"). ALDRI tall – det kan brukeren legge
 * til selv. Unikhet garanteres av claimUniqueUsername (Supabase-tabell, først
 * til mølla; kolliderer navnet prøves et nytt).
 *
 * BOTTER (generateUsername): samme mønster + tall bak, så de ser ut som folk
 * flest uten å kollidere med de "ekte" navnene.
 */

export const ADJECTIVES = [
  'Gretten', 'Kry', 'Traust', 'Kvass', 'Lurvete', 'Snodig', 'Frekk', 'Vill',
  'Snar', 'Klok', 'Sta', 'Mild', 'Rar', 'Livat', 'Fjong', 'Sprek', 'Blid',
  'Pjusket', 'Snurt', 'Kjapp', 'Lur', 'Mett', 'Svimmel', 'Skjelven', 'Mektig',
  'Ydmyk', 'Skummel', 'Fnisete', 'Bister', 'Slumsete', 'Kresen', 'Nysgjerrig',
];

export const ANIMALS = [
  'Elg', 'Gaupe', 'Ulv', 'Rev', 'Oter', 'Grevling', 'Jerv', 'Hare', 'Lemen',
  'Bever', 'Ekorn', 'Piggsvin', 'Moskus', 'Hval', 'Nise', 'Torsk', 'Laks',
  'Kråke', 'Skjære', 'Ugle', 'Hegre', 'Lunde', 'Ørn', 'Falk', 'Spurv', 'Rype',
  'Tiur', 'Geit', 'Mus', 'Frosk', 'Humle', 'Veps', 'Maur', 'Sel', 'Mår',
];

/** Håndlagde dyrehybrider (med riktig fugeform – dynamisk sammensetting blir fort klønete). */
export const HYBRIDS = [
  'Hundegjeit', 'Kattulv', 'Revehval', 'Musebjørn', 'Elgkatt', 'Ulvehare',
  'Gaupemus', 'Beverørn', 'Otersau', 'Uglerev', 'Kråkegaupe', 'Lakserev',
  'Spurveelg', 'Humlehval', 'Vepsegrevling', 'Rypeulv', 'Torskekatt',
  'Måkebever', 'Lemenørn', 'Jervemus', 'Padderev', 'Maurelg', 'Nisekatt',
  'Ekornlaks', 'Falkemus', 'Geitehval', 'Sauefalk', 'Kufrosk', 'Selhare',
  'Tiurmår', 'Hegreulv', 'Froskegaupe', 'Moskusmeis', 'Piggsvinlaks',
  'Lundekatt', 'Skjæreelg', 'Harehval', 'Ørnemus', 'Grevlingtorsk', 'Måroter',
];

// --- ENGELSK LIGA: egne lister i samme stil -------------------------------
export const ADJECTIVES_EN = [
  'Sly', 'Grumpy', 'Dapper', 'Sleepy', 'Feral', 'Jolly', 'Sneaky', 'Rowdy',
  'Mellow', 'Frisky', 'Odd', 'Bold', 'Soggy', 'Zesty', 'Wobbly', 'Posh',
  'Scrappy', 'Moody', 'Perky', 'Rusty', 'Nifty', 'Snazzy', 'Bashful', 'Quirky',
];

export const ANIMALS_EN = [
  'Otter', 'Lynx', 'Moose', 'Badger', 'Wolf', 'Fox', 'Hare', 'Beaver',
  'Squirrel', 'Heron', 'Owl', 'Puffin', 'Eagle', 'Falcon', 'Sparrow', 'Grouse',
  'Goat', 'Mouse', 'Frog', 'Seal', 'Crab', 'Newt', 'Stoat', 'Magpie',
];

export const HYBRIDS_EN = [
  'Dogoat', 'Catwolf', 'Foxwhale', 'Mousebear', 'Owlfox', 'Crowlynx',
  'Salmonfox', 'Waspbadger', 'Frogmoose', 'Sealhare', 'Goatwhale',
  'Beaverhawk', 'Duckwolf', 'Batfinch', 'Crablynx', 'Newtowl', 'Stoatgoose',
  'Molefalcon', 'Toadotter', 'Pikebadger',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Menneskenavn: 65 % Beskrivelse+Dyr, 35 % dyrehybrid. Uten tall. */
export function generateHumanUsername(lang: 'no' | 'en' = 'no'): string {
  if (lang === 'en') return Math.random() < 0.65 ? pick(ADJECTIVES_EN) + pick(ANIMALS_EN) : pick(HYBRIDS_EN);
  return Math.random() < 0.65 ? pick(ADJECTIVES) + pick(ANIMALS) : pick(HYBRIDS);
}

/** Bot-navn: samme mønster med tall bak (skiller seg aldri fra folks stil). */
export function generateUsername(lang: 'no' | 'en' = 'no'): string {
  return generateHumanUsername(lang) + (1 + Math.floor(Math.random() * 99));
}
