/**
 * REGELARKET – ett sted for alle tider, poeng og regler i Ordkrig.
 *
 * Endre flyt og balansering HER mens vi tester, ikke spredt i koden.
 * Resten av appen leser fra dette. Ingen andre filer skal hardkode
 * sekunder, poengverdier eller antall runder.
 */

// ---------------------------------------------------------------------------
// POENG
// ---------------------------------------------------------------------------
export const SCORING = {
  correctGuess: 500, // gjette den ekte definisjonen (halveres hvis du ikke leverte svar)
  perVoteReceived: 500, // per medspiller som stemte på din bløff

  /**
   * Bonus til opprinnelig forfatter når et tidligere ekte spillersvar
   * gjenbrukes som bot-svar og noen stemmer på det. (Fase 2.)
   */
  botAnswerReuseBonus: 250,
};

// ---------------------------------------------------------------------------
// KAMP – et spill varer et fast antall runder og ender i en finaleside
// (sluttresultat + beste forklaringer). Maks 5 spillere per rom (foreløpig).
// ---------------------------------------------------------------------------
export const MATCH = {
  rounds: 5,
  finaleMs: 10 * 60_000, // finalesiden ligger åpen lenge – man lukker med X
};

// ---------------------------------------------------------------------------
// FASETIDER (ms) – hele online-runden
// ---------------------------------------------------------------------------
export const DURATIONS = {
  matchmakingMs: 18_000, // første lobby (før runde 1) – rommet holdes åpent hele
  // vinduet så en ekte venn rekker å koble seg på i samme rom (botter fyller resten)
  writingMs: 60_000,
  votingMs: 40_000,
  // Mellom runder deler reveal + poeng + matchmaking ÉN nedtelling ("tidsbobla"):
  interludeMs: 25_000, // total tid fra stemming slutt til neste runde starter
  revealMs: 5_000, // hvor lenge fasit/reveal vises før poeng + "Klar" (innenfor interludeMs)
};

// ---------------------------------------------------------------------------
// LOBBY-FADE – ordet/feltet/baren fader sakte inn mens man venter, og blinker
// tydelig når spillet starter.
// ---------------------------------------------------------------------------
export const LOBBY_FADE = {
  maxOpacity: 0.8, // fade fra 0 til 80 % i løpet av ventetiden (kun ord + skrivefelt)
  snapMs: 240, // ord + felt blir hvite idet startsignalet begynner
  preBlinkDelayMs: 1_000, // ett sekund etter siste spiller før startblinket
  blinkStepMs: 300, // hastighet på ETT blink-steg (dip ned/opp) – felles for alt
  blinkLowOpacity: 0.4,
  // Antall blink ved rundestart. Identisk for ord, boks OG tidsbar (samme takt).
  startBlinks: 1,
  submittedFadeMs: 1_400, // rolig fade til hvit når en spiller har levert
};

// ---------------------------------------------------------------------------
// SIDEOVERGANG (skrive → stemme): skjermen fader HELT ut, innholdet byttes, og
// fader inn igjen (ikke crossfade). Omtrent samme rolige tempo som bobla som
// blir hvit ved levert svar (LOBBY_FADE.submittedFadeMs).
// ---------------------------------------------------------------------------
export const PAGE_FADE = {
  outMs: 1_100, // fade helt ut
  inMs: 1_300, // så inn med det nye
};

// ---------------------------------------------------------------------------
// RATING (lichess-stil): et SNITT av rundeprestasjoner – blir aldri bedre av å
// spille MYE, bare av å spille GODT.
//   runde-poeng P = gjett + serie + bløff:
//   - riktig gjett: +guess (teller også i rene bot-runder)
//   - serie: +streakStep per ekstra riktige PÅ RAD i samme kamp (2. på rad +50,
//     3. +100 …)
//   - bløff: kun stemmer fra MENNESKER teller, ikke-lineært – én stemme er
//     verdt lite, full pott (4) mye (voteScale[antall])
//   rating = base + snitt(P over alle spilte runder)
// ---------------------------------------------------------------------------
export const RATING = {
  base: 800,
  guess: 500,
  streakStep: 50,
  voteScale: [0, 100, 240, 400, 600], // index = antall MENNESKE-stemmer (maks 4)
  // FRAFALL: mild, eskalerende straffetrapp per frafall PÅ RAD (nullstilles av
  // fullført kamp). Skal svi litt – aldri demotivere.
  quitSteps: [5, 10, 15, 25, 40, 60, 90, 130, 200],
  // FULLFØRT KAMP: plusspoeng, mildere kurve (nullstilles av frafall).
  completeSteps: [3, 4, 5, 6, 8, 10],
  // Straffen skaleres etter hvor TIDLIG man stikker: full straff ved 5 uspilte
  // runder, ned mot denne andelen når nesten alt er spilt.
  quitFactorMin: 0.4,
  // Justerings-leddet (straff/bonus) klemmes: aldri bunnløst, aldri gratis-inflasjon.
  adjMin: -300,
  adjMax: 100,
};

// ---------------------------------------------------------------------------
// PROFIL / RANK – lokal progresjon (global rangering kommer med backend)
// ---------------------------------------------------------------------------
export const GOOD_ANSWER_MIN_VOTES = 2; // forklaring "god" ved 2+ stemmer

export const RANKS: { name: string; minPoints: number }[] = [
  { name: 'Novise', minPoints: 0 },
  { name: 'Ordgnål', minPoints: 3_000 },
  { name: 'Bløffmaker', minPoints: 8_000 },
  { name: 'Ordrev', minPoints: 18_000 },
  { name: 'Bløffmester', minPoints: 35_000 },
  { name: 'Ordkriger', minPoints: 60_000 },
];

// ---------------------------------------------------------------------------
// BOT-TIMING – får bottene til å virke som ekte personer. Alt justerbart.
// (Tilkoblingstempoet styres av vertsmotoren: raskt når ingen andre søker spill,
// spredt utover mot fristen når andre ekte spillere er online.)
// ---------------------------------------------------------------------------
export const BOT_TIMING = {
  // Skrivemønster: veksler mellom "drypp" (prikker beveger seg) og "tenkepauser" (prikker stopper).
  typingBurstMs: [400, 1_500] as [number, number],
  thinkPauseMs: [500, 2_600] as [number, number],
  // Leveringstidspunkt innen skrivevinduet.
  submitMs: [4_000, 28_000] as [number, number],
  // Stemmetidspunkt innen stemmevinduet.
  voteMs: [2_000, 20_000] as [number, number],
  // Når en bot trykker "klar til neste runde" i lobbyen.
  readyMs: [700, 6_000] as [number, number],
};
