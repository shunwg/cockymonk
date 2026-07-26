import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOD_ANSWER_MIN_VOTES, MATCH, RANKS, RATING } from '../config/gameConfig';
import { generateHumanUsername } from '../config/usernames';
import { backupProfile } from '../lib/persistentIdentity';
import { claimUniqueUsername } from './roomService';

/**
 * Lokal spillerprofil (AsyncStorage). Persisterer brukernavn, statistikk og
 * gode forklaringer på enheten. Når backend kommer, synkes dette mot Supabase
 * og "gode forklaringer" byttes til å telle ekte stemmer (se [[answerArchive]]).
 */
const KEY = 'wordwar.profile.v1';

export interface GoodExplanation {
  word: string;
  text: string;
  votes: number;
  at: number;
}

export interface Profile {
  username: string;
  usernameChanged: boolean; // brukernavn kan endres én gang
  usernameEn?: string; // kallenavn i den ENGELSKE ligaen (egen identitet)
  usernameChangedEn?: boolean;
  onboarded?: boolean; // har sett navnevalg-sløret ved første oppstart
  roundsPlayed: number;
  totalPoints: number;
  goodExplanations: GoodExplanation[];
  // RATING (lichess-stil): SNITT av rundeprestasjoner – aldri bedre av volum.
  // NORSK og ENGELSK liga holdes HELT atskilt: felter uten suffiks = norsk
  // (bakoverkompatibelt med eksisterende data), `...En` = engelsk.
  ratingSum?: number;
  ratingRounds?: number;
  ratingAdj?: number;
  quitStreak?: number;
  completeStreak?: number;
  correctGuesses?: number;
  guessRounds?: number; // nevneren til gjett-brøken (telles SAMMEN med correctGuesses)
  votesReceived?: number;
  roundsPlayedEn?: number;
  totalPointsEn?: number;
  ratingSumEn?: number;
  ratingRoundsEn?: number;
  ratingAdjEn?: number;
  quitStreakEn?: number;
  completeStreakEn?: number;
  correctGuessesEn?: number;
  guessRoundsEn?: number;
  votesReceivedEn?: number;
}

export type League = 'no' | 'en';

/** Liga-skopet lesing av rating-/statistikkfeltene. */
export function statsForLeague(p: Profile, league: League) {
  return league === 'en'
    ? {
        sum: p.ratingSumEn ?? 0,
        rounds: p.ratingRoundsEn ?? 0,
        adj: p.ratingAdjEn ?? 0,
        quitStreak: p.quitStreakEn ?? 0,
        completeStreak: p.completeStreakEn ?? 0,
        correct: p.correctGuessesEn ?? 0,
        guessRounds: p.guessRoundsEn ?? 0,
        votes: p.votesReceivedEn ?? 0,
        played: p.roundsPlayedEn ?? 0,
        points: p.totalPointsEn ?? 0,
      }
    : {
        sum: p.ratingSum ?? 0,
        rounds: p.ratingRounds ?? 0,
        adj: p.ratingAdj ?? 0,
        quitStreak: p.quitStreak ?? 0,
        completeStreak: p.completeStreak ?? 0,
        correct: p.correctGuesses ?? 0,
        guessRounds: p.guessRounds ?? 0,
        votes: p.votesReceived ?? 0,
        played: p.roundsPlayed,
        points: p.totalPoints,
      };
}

/** Liga-skopet skriving: bygger patch med riktige feltnavn. */
function leaguePatch(league: League, s: { sum: number; rounds: number; adj: number; quitStreak: number; completeStreak: number; correct: number; guessRounds: number; votes: number; played: number; points: number }): Partial<Profile> {
  return league === 'en'
    ? {
        ratingSumEn: s.sum,
        ratingRoundsEn: s.rounds,
        ratingAdjEn: s.adj,
        quitStreakEn: s.quitStreak,
        completeStreakEn: s.completeStreak,
        correctGuessesEn: s.correct,
        guessRoundsEn: s.guessRounds,
        votesReceivedEn: s.votes,
        roundsPlayedEn: s.played,
        totalPointsEn: s.points,
      }
    : {
        ratingSum: s.sum,
        ratingRounds: s.rounds,
        ratingAdj: s.adj,
        quitStreak: s.quitStreak,
        completeStreak: s.completeStreak,
        correctGuesses: s.correct,
        guessRounds: s.guessRounds,
        votesReceived: s.votes,
        roundsPlayed: s.played,
        totalPoints: s.points,
      };
}

const clampAdj = (v: number) => Math.min(RATING.adjMax, Math.max(RATING.adjMin, v));

/** Gjeldende rating i LIGAEN (null før man har spilt der). base + snitt(P) + justering. */
export function currentRating(p: Profile, league: League): number | null {
  const s = statsForLeague(p, league);
  const adj = clampAdj(s.adj);
  if (s.rounds <= 0 && adj === 0) return null;
  const avg = s.rounds > 0 ? s.sum / s.rounds : 0;
  return Math.round(RATING.base + avg + adj);
}

/** Straffetrinnet nå, skalert etter hvor tidlig man stikker (flere uspilte = mer). */
function quitStepFor(quitStreak: number, remaining: number): number {
  const step = RATING.quitSteps[Math.min(quitStreak, RATING.quitSteps.length - 1)];
  const factor = Math.max(RATING.quitFactorMin, Math.min(1, remaining / MATCH.rounds));
  return Math.max(1, Math.round(step * factor));
}

/** Hvor mange ratingpoeng NESTE frafall vil koste i ligaen (trapp × tidlighet). */
export function estimateQuitDrop(p: Profile, remaining: number, league: League): number {
  const s = statsForLeague(p, league);
  const step = quitStepFor(s.quitStreak, remaining);
  const before = currentRating(p, league) ?? RATING.base;
  const after = Math.round(
    RATING.base + (s.rounds > 0 ? s.sum / s.rounds : 0) + clampAdj(s.adj - step)
  );
  return Math.max(0, before - after);
}

/** Bokfør ETT frafall i ligaen: trappetrinn ned, fullførings-serien nullstilles. */
export async function recordQuit(remaining: number, league: League): Promise<void> {
  const p = await loadProfile();
  const s = statsForLeague(p, league);
  await save({
    ...p,
    ...leaguePatch(league, {
      ...s,
      adj: clampAdj(s.adj - quitStepFor(s.quitStreak, remaining)),
      quitStreak: s.quitStreak + 1,
      completeStreak: 0,
    }),
  });
}

/** Bokfør FULLFØRT kamp i ligaen: mild bonus, frafalls-trappa nullstilles. */
export async function recordMatchComplete(league: League): Promise<void> {
  const p = await loadProfile();
  const s = statsForLeague(p, league);
  const bonus = RATING.completeSteps[Math.min(s.completeStreak, RATING.completeSteps.length - 1)];
  await save({
    ...p,
    ...leaguePatch(league, {
      ...s,
      adj: clampAdj(s.adj + bonus),
      completeStreak: s.completeStreak + 1,
      quitStreak: 0,
    }),
  });
}

const DEFAULT: Profile = {
  username: 'SuperDuper',
  usernameChanged: false,
  roundsPlayed: 0,
  totalPoints: 0,
  goodExplanations: [],
};

/** Navnet som gjelder i valgt liga (engelsk liga har eget kallenavn). */
export function displayName(p: Profile, league: 'no' | 'en'): string {
  return league === 'en' ? p.usernameEn ?? p.username : p.username;
}

let cache: Profile | null = null;

export async function loadProfile(): Promise<Profile> {
  if (cache) return cache;
  let loaded: Profile;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    loaded = raw ? { ...DEFAULT, ...JSON.parse(raw) } : { ...DEFAULT };
  } catch {
    loaded = { ...DEFAULT };
  }
  // Engangs-sanering: gjett-NEVNEREN kom i en senere versjon enn telleren, så
  // gamle profiler kan ha teller > nevner («4/0»). Da nullstilles paret – fra
  // nå telles de alltid sammen.
  let dirty = false;
  if ((loaded.guessRounds ?? 0) < (loaded.correctGuesses ?? 0)) {
    loaded.correctGuesses = 0;
    loaded.guessRounds = 0;
    dirty = true;
  }
  if ((loaded.guessRoundsEn ?? 0) < (loaded.correctGuessesEn ?? 0)) {
    loaded.correctGuessesEn = 0;
    loaded.guessRoundsEn = 0;
    dirty = true;
  }
  cache = loaded;
  if (dirty) void save(loaded);
  return loaded;
}

async function save(p: Profile): Promise<void> {
  cache = p;
  try {
    const json = JSON.stringify(p);
    await AsyncStorage.setItem(KEY, json);
    backupProfile(json); // Keychain-speil → overlever re-installasjon
  } catch {
    // stille – neste lagring prøver igjen
  }
}

/**
 * Automatisk brukernavn ved første oppstart: har brukeren fortsatt standard-
 * navnet, kreves et unikt morsomt navn (LurGaupe, Hundegjeit …) fra Supabase.
 * Endrer IKKE usernameChanged – brukeren kan fortsatt endre navnet én gang selv.
 * Returnerer det nye navnet, eller null (offline → prøver igjen neste oppstart).
 */
export async function ensureAutoUsername(league: 'no' | 'en' = 'no'): Promise<string | null> {
  const p = await loadProfile();
  if (league === 'en') {
    // Engelsk liga: eget engelsk kallenavn, kreves første gang man bytter dit
    if (p.usernameEn) return null;
    try {
      const name = await claimUniqueUsername(() => generateHumanUsername('en'));
      if (!name) return null;
      await save({ ...p, usernameEn: name });
      return name;
    } catch {
      return null;
    }
  }
  if (p.usernameChanged || p.username !== DEFAULT.username) return null;
  try {
    const name = await claimUniqueUsername(() => generateHumanUsername('no'));
    if (!name) return null;
    await save({ ...p, username: name });
    return name;
  } catch {
    return null;
  }
}

/**
 * Setter brukernavn for gitt liga. `lock` = bruker sin ENE endring (profil-
 * menyen). Onboarding-valget ved første oppstart låser IKKE – man beholder
 * retten til én endring senere uansett.
 */
export async function setUsername(name: string, league: 'no' | 'en' = 'no', lock = true): Promise<Profile> {
  const p = await loadProfile();
  const trimmed = name.trim();
  if (!trimmed) return p;
  const next: Profile =
    league === 'en'
      ? { ...p, usernameEn: trimmed, ...(lock ? { usernameChangedEn: true } : {}) }
      : { ...p, username: trimmed, ...(lock ? { usernameChanged: true } : {}) };
  await save(next);
  return next;
}

/** Marker at navnevalg-sløret er vist (vises aldri igjen). */
export async function markOnboarded(): Promise<void> {
  const p = await loadProfile();
  await save({ ...p, onboarded: true });
}

/** Kalles etter hver runde (reveal): oppdaterer LIGAENS poeng, runder og rating. */
export async function recordRoundResult(
  input: {
    points: number;
    yourWord: string;
    yourText: string;
    yourVotes: number; // alle stemmer (vises i "gode forklaringer")
    guessedCorrect: boolean; // gjettet fasit? (teller også i bot-runder)
    humanVotes: number; // stemmer fra MENNESKER på din bløff (0–4; botter teller ikke)
    streakLen: number; // riktige på rad i DENNE kampen, inkl. denne runden (0 hvis feil)
  },
  league: League
): Promise<void> {
  const p = await loadProfile();
  const good = [...p.goodExplanations];
  if (input.yourText && input.yourVotes >= GOOD_ANSWER_MIN_VOTES) {
    good.unshift({ word: input.yourWord, text: input.yourText, votes: input.yourVotes, at: Date.now() });
  }
  // Runde-poeng P: gjett + serie + menneske-bløff (ikke-lineær)
  const streakBonus = input.guessedCorrect ? Math.max(0, input.streakLen - 1) * RATING.streakStep : 0;
  const vi = Math.min(Math.max(0, input.humanVotes), RATING.voteScale.length - 1);
  const P = (input.guessedCorrect ? RATING.guess : 0) + streakBonus + RATING.voteScale[vi];
  const s = statsForLeague(p, league);
  await save({
    ...p,
    goodExplanations: good.slice(0, 50),
    ...leaguePatch(league, {
      ...s,
      played: s.played + 1,
      points: s.points + Math.max(0, input.points),
      sum: s.sum + P,
      rounds: s.rounds + 1,
      correct: s.correct + (input.guessedCorrect ? 1 : 0),
      guessRounds: s.guessRounds + 1,
      votes: s.votes + Math.max(0, input.yourVotes),
    }),
  });
}

export interface RankInfo {
  name: string;
  index: number;
  next: { name: string; minPoints: number } | null;
  pointsIntoRank: number;
  pointsToNext: number | null;
}

/** Lokal rank ut fra totale poeng (global rangering krever backend). */
export function rankForPoints(points: number): RankInfo {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (points >= RANKS[i].minPoints) idx = i;
  const next = RANKS[idx + 1] ?? null;
  return {
    name: RANKS[idx].name,
    index: idx,
    next,
    pointsIntoRank: points - RANKS[idx].minPoints,
    pointsToNext: next ? next.minPoints - points : null,
  };
}
