import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * LIGA/SPRÅK: norsk og engelsk liga er HELT atskilt i spillet (egne rom, egne
 * ord, egne kallenavn), men deler alle grafiske innstillinger (design osv.).
 * Valget gjøres i Profil rett under brukernavnet og lagres på telefonen.
 */
export type League = 'no' | 'en';

export interface Strings {
  leagueName: string;
  playOnline: string;
  playFriends: string;
  comingSoon: string;
  hopIn: string;
  waitingPlayers: string;
  waitingNextRound: string;
  writeHint: string;
  submitAnswer: string;
  readyNext: string;
  finalAnswer: string;
  yes: string;
  no: string;
  leaveGame: string;
  connecting: string;
  connectFail: string;
  back: string;
  changeUsername: string;
  usernameLocked: string;
  usernameOnce: string;
  cancel: string;
  save: string;
  rank: string;
  pointsTo: string;
  maxRank: string;
  roundsPlayed: string;
  totalPoints: string;
  goodAnswers: string;
  goodAnswersSub: (n: number) => string;
  goodAnswersEmpty: string;
  votes: string;
  design: string;
  designSub: string;
  league: string;
  leagueSub: string;
  globalNote: string;
  updateReady: string;
  loadingProfile: string;
  finalResults: string;
  bestExplanations: string;
  seeResults: string;
  statCorrect: string;
  statBluffVotes: string;
  statBestStreak: string;
  answerLabel: string;
  yourBluff: string;
  rating: string;
  ratingSub: (n: number) => string;
  ratingNone: string;
  leaderboard: string;
  leaderboardEmpty: string;
  ratingDrop: (x: number) => string;
  ratingDropHint: string;
  playHome: string;
  homeOwnScreens: string;
  homeOneScreen: string;
  players: string;
  addPlayerPlaceholder: string;
  add: string;
  orderHint: string;
  timePerPlayer: string;
  startGame: string;
  needPlayers: string;
  homeIntroTitle: string;
  homeIntroBody: string;
  homeIntroOk: string;
  gamemaster: string;
  next: string;
  passTo: (n: string) => string;
  holdToOpen: string;
  readAloud: string;
  answerXofY: (x: number, y: number) => string;
  startVoting: string;
  whoVotes: (n: string) => string;
  roundResults: string;
  nextRoundLabel: string;
  backToMenu: string;
  answerN: (n: number) => string;
  roundsLabel: string;
  endGameConfirm: string;
  chooseName: string;
  continueLabel: string;
  nameTaken: string;
  nameNote: string;
}

export const STRINGS: Record<League, Strings> = {
  no: {
    leagueName: 'Norsk',
    playOnline: 'Spill online',
    playFriends: 'Spill med venner',
    comingSoon: 'Kommer snart',
    hopIn: 'Hopp inn i pågående spill',
    waitingPlayers: 'Venter på flere spillere',
    waitingNextRound: 'Venter på at runden starter',
    writeHint: 'Skriv ned din egen overbevisende forklaring',
    submitAnswer: 'Send svar',
    readyNext: 'Klar til neste runde',
    finalAnswer: 'Endelig svar?',
    yes: 'Ja',
    no: 'Nei',
    leaveGame: 'Er du sikker på at du vil forlate spillet?',
    connecting: 'Kobler til et rom…',
    connectFail: 'Fikk ikke koblet til',
    back: 'Tilbake',
    changeUsername: 'Endre brukernavn',
    usernameLocked: 'Brukernavn er låst',
    usernameOnce: 'Brukernavnet kan bare endres én gang.',
    cancel: 'Avbryt',
    save: 'Lagre',
    rank: 'Rangering',
    pointsTo: 'poeng til',
    maxRank: 'Høyeste rang nådd 👑',
    roundsPlayed: 'Runder spilt',
    totalPoints: 'Poeng totalt',
    goodAnswers: 'Gode forklaringer',
    goodAnswersSub: (n) => `Dine bløffer som fikk ${n} eller flere stemmer`,
    goodAnswersEmpty: 'Ingen ennå – lur flere medspillere, så dukker de opp her.',
    votes: 'stemmer',
    design: 'Design',
    designSub: 'Prøv en annen stil – «Original» er alltid trygg å gå tilbake til',
    league: 'Liga',
    leagueSub: 'Norsk og engelsk liga er helt atskilt – egne ord, spillere og kallenavn',
    globalNote: 'Global rangering mot andre spillere kommer når nettspill er live.',
    updateReady: 'Ny versjon klar – trykk for å oppdatere',
    loadingProfile: 'Laster profil…',
    finalResults: 'Sluttresultat',
    bestExplanations: 'Beste forklaringer',
    seeResults: 'Se resultater',
    statCorrect: 'Riktige gjett',
    statBluffVotes: 'Stemmer på bløffene dine',
    statBestStreak: 'Beste serie',
    answerLabel: 'Fasit',
    yourBluff: 'Din forklaring',
    rating: 'Rating',
    ratingSub: (n) => `Snitt av ${n} runder`,
    ratingNone: 'Spill en kamp for å få rating',
    leaderboard: 'Rangliste',
    leaderboardEmpty: 'Ingen på lista ennå',
    ratingDrop: (x) => `Ranken din justeres ned ${x} poeng`,
    ratingDropHint: 'Fullfør neste kamp og vinn dem tilbake',
    playHome: 'Spill hjemme',
    homeOwnScreens: 'På hver sin skjerm',
    homeOneScreen: 'Alle på én skjerm',
    players: 'Spillere',
    addPlayerPlaceholder: 'Skriv navn…',
    add: 'Legg til',
    orderHint: 'Rekkefølgen er sende-rekkefølgen – første spiller er gamemaster i runde 1',
    timePerPlayer: 'Tid per spiller (sek)',
    startGame: 'Start spillet',
    needPlayers: 'Du trenger 3–8 spillere',
    homeIntroTitle: 'Slik funker det',
    homeIntroBody:
      'Alle skriver en falsk forklaring på ordet – fasiten blandes inn. Gjett hvilken forklaring som er den riktige. Poeng for riktig svar, og for hver som går på bløffen din.',
    homeIntroOk: 'Start',
    gamemaster: 'Gamemaster',
    next: 'Neste',
    passTo: (n) => `Send telefonen til ${n}`,
    holdToOpen: 'Hold inne i 3 sekunder for å åpne',
    readAloud: 'Les svarene høyt for gruppa – gjerne to ganger',
    answerXofY: (x, y) => `Svar ${x} av ${y}`,
    startVoting: 'Til stemming',
    whoVotes: (n) => `${n} stemmer på…`,
    roundResults: 'Rundens resultat',
    nextRoundLabel: 'Neste runde',
    backToMenu: 'Til menyen',
    answerN: (n) => `Svar ${n}`,
    roundsLabel: 'Antall runder',
    endGameConfirm: 'Er du sikker på at du vil avslutte spillet?',
    chooseName: 'Velg brukernavnet ditt',
    continueLabel: 'Fortsett',
    nameTaken: 'Navnet er opptatt – prøv et annet',
    nameNote: 'Du kan endre navnet én gang senere',
  },
  en: {
    leagueName: 'English',
    playOnline: 'Play online',
    playFriends: 'Play with friends',
    comingSoon: 'Coming soon',
    hopIn: 'Jump into a live game',
    waitingPlayers: 'Waiting for more players',
    waitingNextRound: 'Waiting for the next round',
    writeHint: 'Write your own convincing definition',
    submitAnswer: 'Submit answer',
    readyNext: 'Ready for next round',
    finalAnswer: 'Final answer?',
    yes: 'Yes',
    no: 'No',
    leaveGame: 'Are you sure you want to leave the game?',
    connecting: 'Joining a room…',
    connectFail: "Couldn't connect",
    back: 'Back',
    changeUsername: 'Change username',
    usernameLocked: 'Username is locked',
    usernameOnce: 'You can only change your username once.',
    cancel: 'Cancel',
    save: 'Save',
    rank: 'Rank',
    pointsTo: 'points to',
    maxRank: 'Highest rank reached 👑',
    roundsPlayed: 'Rounds played',
    totalPoints: 'Total points',
    goodAnswers: 'Good definitions',
    goodAnswersSub: (n) => `Your bluffs that got ${n} or more votes`,
    goodAnswersEmpty: 'None yet – fool more players and they show up here.',
    votes: 'votes',
    design: 'Design',
    designSub: 'Try a different look – "Original" is always safe to go back to',
    league: 'League',
    leagueSub: 'The Norwegian and English leagues are fully separate – own words, players and nicknames',
    globalNote: 'Global ranking against other players arrives when online play is live.',
    updateReady: 'New version ready – tap to update',
    loadingProfile: 'Loading profile…',
    finalResults: 'Final results',
    bestExplanations: 'Best bluffs',
    seeResults: 'See results',
    statCorrect: 'Correct guesses',
    statBluffVotes: 'Votes on your bluffs',
    statBestStreak: 'Best streak',
    answerLabel: 'Answer',
    yourBluff: 'Your bluff',
    rating: 'Rating',
    ratingSub: (n) => `Average of ${n} rounds`,
    ratingNone: 'Play a match to get a rating',
    leaderboard: 'Leaderboard',
    leaderboardEmpty: 'No one here yet',
    ratingDrop: (x) => `Your rating drops ${x} points`,
    ratingDropHint: 'Finish your next match to win them back',
    playHome: 'Play at home',
    homeOwnScreens: 'On separate screens',
    homeOneScreen: 'All on one screen',
    players: 'Players',
    addPlayerPlaceholder: 'Type a name…',
    add: 'Add',
    orderHint: 'The order is the passing order – the first player is gamemaster in round 1',
    timePerPlayer: 'Time per player (sec)',
    startGame: 'Start game',
    needPlayers: 'You need 3–8 players',
    homeIntroTitle: 'How it works',
    homeIntroBody:
      'Everyone writes a fake definition of the word – the real one is mixed in. Guess which definition is correct. Points for guessing right, and for everyone who falls for your bluff.',
    homeIntroOk: 'Start',
    gamemaster: 'Gamemaster',
    next: 'Next',
    passTo: (n) => `Pass the phone to ${n}`,
    holdToOpen: 'Hold for 3 seconds to open',
    readAloud: 'Read the answers aloud – twice if you like',
    answerXofY: (x, y) => `Answer ${x} of ${y}`,
    startVoting: 'Start voting',
    whoVotes: (n) => `${n} votes for…`,
    roundResults: 'Round results',
    nextRoundLabel: 'Next round',
    backToMenu: 'Back to menu',
    answerN: (n) => `Answer ${n}`,
    roundsLabel: 'Number of rounds',
    endGameConfirm: 'Are you sure you want to end the game?',
    chooseName: 'Pick your username',
    continueLabel: 'Continue',
    nameTaken: 'That name is taken – try another',
    nameNote: 'You can change it once later',
  },
};

const KEY = 'wordwar.league.v1';
let current: League = 'no';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useLeague(): League {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}

/** UI-tekstene for gjeldende liga. */
export function useStrings(): Strings {
  return STRINGS[useLeague()];
}

export function currentLeague(): League {
  return current;
}

export async function loadLeagueChoice(): Promise<void> {
  try {
    const k = await AsyncStorage.getItem(KEY);
    if (k === 'no' || k === 'en') {
      current = k;
      emit();
    }
  } catch {
    // beholder norsk
  }
}

export function setLeague(l: League): void {
  current = l;
  emit();
  AsyncStorage.setItem(KEY, l).catch(() => {});
}
