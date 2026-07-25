// state.js — UI state, i18n and small helpers for the Lab. Lane B owns this file.
// Rules live in engine.js (Lane A); this file only carries screen-flow state.

export const STR = {
  nb: {
    title: "Cocky Monk", demo: "lab", pickLang: "Velg språk",
    mode: "Hvordan vil du spille?", hotseatName: "Én telefon", hotseatSub: "Send telefonen rundt bordet — ekte folk",
    partyName: "Hver sin telefon", partySub: "Lab: motspillerne er roboter. Du starter som spillmester.",
    players: "Hvem spiller?", addPlayer: "+ Legg til spiller", namePh: "Navn…", needPlayers: "3–8 spillere",
    yourName: "Ditt navn", bots: "Roboter", next: "Neste",
    length: "Spillengde", theme: "Brett", kort: "Kort · til 8", std: "Standard · til 15", mara: "Maraton · til 25",
    salongen: "Salongen", fjellet: "Fjellet", rom: "Verdensrommet", begin: "Start spillet",
    gmIs: (n) => `${n} er spillmester`, youAreGm: "Du er spillmester", fearNose: "Frykt nesen.", roundN: (r) => `Runde ${r}`,
    gmHint: "Bare spillmesteren ser dette skjermbildet.",
    theWord: "Ordet er", secret: "Hemmelig sannhet", peek: "Hold for å se sannheten",
    decoys: "Dine lokke-forklaringer (0–2, anbefalt 1)", decoyPh: (i) => `Lokkeforklaring ${i}…`,
    passOn: "Send telefonen videre", giveTo: (n) => `Gi telefonen til ${n}`, noPeek: "Ikke titt.", hold: "Hold",
    yourBluff: (w) => `Din tur til å dikte. Hva betyr «${w}»?`, bluffPh: "Skriv en troverdig løgn…",
    emptyBluff: "Selv en dårlig løgn er bedre enn ingen.", lockIn: "Lever løgnen",
    allIn: "Alle løgnene er inne.", waitingFor: "Venter på", thinkingDots: "tenker…", openVote: "Åpne avstemning",
    gmComposing: (n) => `${n} dikter lokkemat`, shuffling: "Spillmesteren blander kortene…",
    votingTime: (n) => `${n}, hva er sannheten?`, yourVote: "Hva er sannheten?", cantOwn: "(ditt eget svar er skjult)",
    votesIn: "Stemmene tikker inn", youVoted: "Din stemme er levert.",
    revealTitle: "Avsløringen",
    tapReveal: "Trykk for å avsløre neste", skip: "Neste ▸", votes: "stemmer", by: "skrevet av", theTruth: "SANNHETEN",
    you: "deg", gmDecoy: "spillmesterens lokkemat", gmSteal: "Ingen fant sannheten. Spillmesteren håver inn! +2",
    doubleHit: (n) => `${n} skrev rett og slett sannheten. +3!`, toBoard: "Til brettet!",
    board: "Brettet", boardSub: (t) => `Først til ${t}. Sjekkes når alle har vært spillmester.`,
    nextRound: "Neste runde", winner: (n) => `${n} vant!`, shared: "Delt seier!",
    restOfYou: "Resten av dere: godt forsøk.", goldNose: (n) => `Gullnesen: ${n} — spillets beste løgner`,
    playAgain: "Spill igjen", pts: "p",
    rules: "+2 riktig svar · +1 per stemme på din løgn · +2 til spillmester hvis ingen fant sannheten",
    omkamp: "Omkamp!", omkampSub: (ns) => `${ns} står likt forbi mål. Én runde brutal forlengelse — alle stemmer.`,
    homePitch: "Ett rom, én sannhet — resten er løgn.",
    homeNewGame: "Nytt spill", homeHowTo: "Slik spiller du", homeAbout: "Om",
    rulesTitle: "Slik spiller du", rulesSub: "Én runde på 30 sekunder",
    rulesStep1t: "Spillmesteren trekker", rulesStep1b: "Ett obskurt ord — og den ekte betydningen, kun for mesterens øyne.",
    rulesStep2t: "Alle andre dikter", rulesStep2b: "Skriv en forklaring så troverdig at den kunne stått i ordboka.",
    rulesStep3t: "Mesteren åpner avstemningen", rulesStep3b: "Løgner, sannhet og lokkemat blandes og stokkes til A, B, C …",
    rulesStep4t: "Alle stemmer", rulesStep4b: "Finn den ekte betydningen. Ditt eget svar er skjult for deg.",
    rulesStep5t: "Avsløringen", rulesStep5b: "Løgnene demaskeres. Nesen vokser ett hakk for hver som lot seg lure.",
    rulesStep6t: "Kappløpet", rulesStep6b: "Poeng flytter brikken din mot mål. Først forbi vinner.",
    rulesNose: "Én stemme = ett hakk lengre nese. Frykt den.",
    rulesScoreEyebrow: "Poeng",
    rulesScore1: "Du stemte på sannheten",
    rulesScore2: "Per stemme løgnen din lurte",
    rulesScore3: "Ingen fant sannheten — til mesteren",
    rulesScore4: "Dobbeltreff: du skrev nesten sannheten",
    rulesBack: "Tilbake",
    aboutTitle: "Om Cocky Monk",
    aboutBlurb: "Et selskapsspill om å lyve med stil. Dere lager moroa rundt bordet — appen holder bare i nesen.",
    aboutCredits: "Skrifter og lyder: Fredoka (OFL), lottie-web (MIT), Kenney (CC0).",
    aboutPrivacy: "Vi samler ikke inn data. Punktum.",
  },
  en: {
    title: "Cocky Monk", demo: "lab", pickLang: "Choose language",
    mode: "How do you want to play?", hotseatName: "One phone", hotseatSub: "Pass the phone around — real people",
    partyName: "A phone each", partySub: "Lab: your opponents are bots. You start as game master.",
    players: "Who's playing?", addPlayer: "+ Add player", namePh: "Name…", needPlayers: "3–8 players",
    yourName: "Your name", bots: "Bots", next: "Next",
    length: "Game length", theme: "Board", kort: "Short · to 8", std: "Standard · to 15", mara: "Marathon · to 25",
    salongen: "The Parlor", fjellet: "The Mountain", rom: "Outer Space", begin: "Start the game",
    gmIs: (n) => `${n} is game master`, youAreGm: "You are game master", fearNose: "Fear the nose.", roundN: (r) => `Round ${r}`,
    gmHint: "Only the game master sees this screen.",
    theWord: "The word is", secret: "Secret truth", peek: "Hold to see the truth",
    decoys: "Your decoy explanations (0–2, 1 encouraged)", decoyPh: (i) => `Decoy ${i}…`,
    passOn: "Pass the phone on", giveTo: (n) => `Give the phone to ${n}`, noPeek: "No peeking.", hold: "Hold",
    yourBluff: (w) => `Your turn to invent. What does “${w}” mean?`, bluffPh: "Write a credible lie…",
    emptyBluff: "Even a bad lie beats no lie.", lockIn: "Submit the lie",
    allIn: "All lies accounted for.", waitingFor: "Waiting for", thinkingDots: "thinking…", openVote: "Open the vote",
    gmComposing: (n) => `${n} is composing decoys`, shuffling: "The game master shuffles the cards…",
    votingTime: (n) => `${n}, what's the truth?`, yourVote: "What's the truth?", cantOwn: "(your own answer is hidden)",
    votesIn: "Votes are coming in", youVoted: "Your vote is in.",
    revealTitle: "The Reveal",
    tapReveal: "Tap to reveal the next one", skip: "Next ▸", votes: "votes", by: "written by", theTruth: "THE TRUTH",
    you: "you", gmDecoy: "the game master's decoy", gmSteal: "Nobody found the truth. The game master cashes in! +2",
    doubleHit: (n) => `${n} simply wrote the truth. +3!`, toBoard: "To the board!",
    board: "The board", boardSub: (t) => `First to ${t}. Checked when everyone has been game master.`,
    nextRound: "Next round", winner: (n) => `${n} wins!`, shared: "Shared victory!",
    restOfYou: "The rest of you: nice try.", goldNose: (n) => `Golden Nose: ${n} — the game's best liar`,
    playAgain: "Play again", pts: "p",
    rules: "+2 correct vote · +1 per vote your lie gets · +2 to the GM if nobody finds the truth",
    omkamp: "Sudden death!", omkampSub: (ns) => `${ns} are tied past the line. One brutal extra round — everyone votes.`,
    homePitch: "One room, one truth — the rest are lies.",
    homeNewGame: "New game", homeHowTo: "How to play", homeAbout: "About",
    rulesTitle: "How to play", rulesSub: "One round in 30 seconds",
    rulesStep1t: "The game master draws", rulesStep1b: "One obscure word — and its real meaning, for the master's eyes only.",
    rulesStep2t: "Everyone else invents", rulesStep2b: "Write a definition so credible it could sit in the dictionary.",
    rulesStep3t: "The master opens the vote", rulesStep3b: "Lies, truth and decoys are shuffled into A, B, C …",
    rulesStep4t: "Everyone votes", rulesStep4b: "Find the real meaning. Your own answer is hidden from you.",
    rulesStep5t: "The reveal", rulesStep5b: "The lies are unmasked. The nose grows a notch for every vote it fooled.",
    rulesStep6t: "The race", rulesStep6b: "Points move your pawn toward the goal. First past the line wins.",
    rulesNose: "One vote = one notch longer nose. Fear it.",
    rulesScoreEyebrow: "Points",
    rulesScore1: "You voted for the truth",
    rulesScore2: "Per vote your lie fooled",
    rulesScore3: "Nobody found the truth — to the master",
    rulesScore4: "Double hit: you nearly wrote the truth",
    rulesBack: "Back",
    aboutTitle: "About Cocky Monk",
    aboutBlurb: "A party game about lying with style. You make the fun around the table — the app just holds the nose.",
    aboutCredits: "Fonts and audio: Fredoka (OFL), lottie-web (MIT), Kenney (CC0).",
    aboutPrivacy: "We collect no data. Full stop.",
  },
};

export const AVA = ["#FFB020", "#4FC3F7", "#FF7043", "#9CCC65", "#BA68C8", "#4DD0E1", "#F06292", "#AED581"];

// Embedded fallback content so file:// double-click still demos the screens.
// These cards/fakes are our own (from the starter kit); the real decks load
// from /Resources/deck_*.json over http (serve-lab.mjs).
export const MINI_DECK = {
  nb: [
    { prompt: "dvergmål", truth: "Gammelt og poetisk ord for ekko." },
    { prompt: "attergløyme", truth: "Nynorsk ord for en kvinne som aldri ble gift – en som ble «gjenglemt»." },
    { prompt: "skarve", truth: "Ussel eller stakkarslig – som i «en skarve hundrelapp»." },
    { prompt: "krypinn", truth: "Et lite og lunt sted å bo eller gjemme seg." },
    { prompt: "gjøn", truth: "Spøk og moro – å drive gjøn med noen er å erte dem." },
    { prompt: "mannevond", truth: "Om et dyr som er aggressivt mot mennesker." },
  ],
  en: [
    { prompt: "snollygoster", truth: "A shrewd, unprincipled person – especially a politician." },
    { prompt: "borborygmus", truth: "The rumbling sound your stomach makes." },
    { prompt: "mumpsimus", truth: "Someone who stubbornly sticks to an old habit or error, even when shown it is wrong." },
    { prompt: "nurdle", truth: "A tiny plastic pellet used as raw material in manufacturing." },
    { prompt: "collywobbles", truth: "A queasy, nervous feeling in the stomach." },
  ],
};

export const MINI_FAKES = {
  nb: [
    "Gammelt mål for ved – omtrent så mye som én mann kan bære.",
    "Dialektord for tynn morgentåke over vann.",
    "Redskap som ble brukt til å flå ål.",
    "Folkedans fra Setesdal i tretakt.",
    "Sjømannsuttrykk for slakk i et tau.",
    "Det lille hullet i en ostehøvel.",
    "Gammelt ord for den siste slurken i en kaffekopp.",
    "En type knute som løsner av seg selv.",
  ],
  en: [
    "An old unit for firewood – about as much as one person can carry.",
    "A dialect word for thin morning mist over water.",
    "A sailor's term for slack in a rope.",
    "The small hole in a cheese slicer.",
    "An old word for the last sip left in a coffee cup.",
    "A type of knot that unties itself.",
  ],
};

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const rnd = (a, b) => a + Math.random() * (b - a);

// Stable-ish id for one device/player. Deliberately NOT crypto.randomUUID():
// that is undefined on non-secure origins, and the standalone bundle has to run
// from file://. Collision risk across a room of eight is not worth a thought.
export const newPid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// One timer registry so phase changes can cancel everything pending.
const timers = [];
export const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
export const clearTimers = () => { timers.forEach(clearTimeout); timers.length = 0; };

// Screen-flow state (setup fields + which screen is showing). Engine state
// (scores, bluffs, votes, options) lives in ui.js as `G`, produced by engine.js.
export function freshUi() {
  return {
    lang: "nb",
    mode: null,             // "hotseat" | "party"
    screen: "HOME",         // HOME LANG MODE PLAYERS PARTYSETUP SETUP GM_INTRO GM_DASH BLUFF WAIT VOTE VOTEWAIT REVEAL BOARD OMKAMP WINNER · RULES ABOUT
    rulesReturn: "HOME",    // where RULES/ABOUT return to
    names: [],              // hotseat player names (setup)
    uname: "",
    botCount: 3,
    target: 15,
    theme: "salongen",
    deck: [],
    fakePool: [],
    usedFakes: new Set(),
    cur: 0,                 // whose hotseat turn (bluff entry / vote)
    voteIdx: 0,
    afterHand: null,
    myPid: null,            // this device's player id; set once at boot
    draftBluff: "",         // mirrors the bluff textarea so a re-render can't eat it
  };
}
