// state.js — UI state, i18n and small helpers for the Lab. Lane B owns this file.
// Rules live in engine.js (Lane A); this file only carries screen-flow state.

export const STR = {
  nb: {
    title: "Snifferoo", demo: "lab", pickLang: "Velg språk",
    mode: "Hvordan vil du spille?", hotseatName: "Én telefon", hotseatSub: "Én telefon går rundt bordet.",
    partyName: "Hver sin telefon", partySub: "Motspillerne er roboter. Du starter som spillmester.",
    players: "Hvem spiller?", addPlayer: "+ Legg til spiller", namePh: "Navn…", needPlayers: "3–8 spillere",
    yourName: "Ditt navn", bots: "Roboter", next: "Neste",
    length: "Spillengde", theme: "Brett", kort: "Kort · til 8", std: "Standard · til 15", mara: "Maraton · til 25",
    salongen: "Salongen", fjellet: "Fjellet", rom: "Verdensrommet", begin: "Start spillet",
    gmIs: (n) => `${n} er spillmester`, youAreGm: "Du er spillmester", fearNose: "Frykt nesen.", roundN: (r) => `Runde ${r}`,
    gmHint: "Bare spillmesteren ser dette skjermbildet.",
    theWord: "Ordet er", secret: "Hemmelig sannhet", peek: "Hold for å se sannheten",
    decoys: "Dine falske svar (0–2, ett holder)", decoyPh: (i) => `Falskt svar ${i}…`,
    passOn: "Send telefonen videre", giveTo: (n) => `Gi telefonen til ${n}`, noPeek: "Ikke titt.", hold: "Hold",
    yourBluff: (w) => `Hva betyr «${w}»?`, bluffPh: "Skriv en løgn som kunne stått i ordboka…",
    emptyBluff: "Selv en dårlig løgn er bedre enn ingen.", lockIn: "Lever løgnen",
    // Fasefrister (PRD §5.2a)
    tooLate: "For sent. Runden gikk videre uten deg.",
    timeUp: "Tiden er ute.", tenLeft: "Ti sekunder igjen.",
    clockBluff: "til å dikte", clockWait: "til alle er inne", clockDecoy: "til avstemningen åpner",
    clockVote: "til å stemme", clockReveal: "til neste avsløring",
    timerTitle: "Frister", timerOn: "På", timerOff: "Av",
    timerBluffLabel: "Tid til å dikte en løgn", timerVoteLabel: "Tid til å stemme",
    timerHint: "Rekker du ikke fristen, går runden videre uten svaret ditt. Du er med igjen neste runde.",
    allIn: "Alle løgnene er inne.", waitingFor: "Venter på", thinkingDots: "tenker…", openVote: "Åpne avstemning",
    gmComposing: (n) => `${n} skriver falske svar`, shuffling: "Spillmesteren blander kortene…",
    votingTime: (n) => `${n}, hva er sannheten?`, yourVote: "Hva er sannheten?", cantOwn: "(ditt eget svar er skjult)",
    votesIn: "Stemmene tikker inn", youVoted: "Din stemme er levert.",
    revealTitle: "Avsløringen",
    tapReveal: "Trykk for å avsløre neste", skip: "Neste ▸", votes: "stemmer", by: "skrevet av", theTruth: "SANNHETEN",
    you: "deg", gmDecoy: "spillmesterens falske svar", gmSteal: "Ingen fant sannheten. Spillmesteren tar +2.",
    doubleHit: (n) => `${n} skrev sannheten uten å vite det. +3`, toBoard: "Til brettet!",
    board: "Brettet", boardSub: (t) => `Først til ${t}. Sjekkes når alle har vært spillmester.`,
    nextRound: "Neste runde", winner: (n) => `${n} vant!`, shared: "Delt seier!",
    restOfYou: "Resten av dere: godt forsøk.", goldNose: (n) => `Gullnesen: ${n}. Spillets beste løgner.`,
    playAgain: "Spill igjen", pts: "p",
    rules: "+2 riktig svar · +1 per stemme på din løgn · +2 til spillmester hvis ingen fant sannheten",
    omkamp: "Omkamp!", omkampSub: (ns) => `${ns} står likt forbi mål. Én ekstra runde, og alle stemmer.`,
    homePitch: "Alle lyver. Bare én forteller sant.",
    homeNewGame: "Nytt spill", homeHowTo: "Slik spiller du", homeAbout: "Om",
    rulesTitle: "Slik spiller du", rulesSub: "Én runde på 30 sekunder",
    rulesStep1t: "Spillmesteren trekker", rulesStep1b: "Ett obskurt ord. Bare spillmesteren får se hva det betyr.",
    rulesStep2t: "Alle andre dikter", rulesStep2b: "Skriv en forklaring så troverdig at den kunne stått i ordboka.",
    rulesStep3t: "Mesteren åpner avstemningen", rulesStep3b: "Alle svarene stokkes, og hvert av dem får en bokstav.",
    rulesStep4t: "Alle stemmer", rulesStep4b: "Finn den ekte betydningen. Ditt eget svar er skjult for deg.",
    rulesStep5t: "Avsløringen", rulesStep5b: "Løgnene avsløres. Nesen vokser ett hakk for hver som gikk på den.",
    rulesStep6t: "Kappløpet", rulesStep6b: "Poeng flytter brikken din mot mål. Først forbi vinner.",
    rulesNose: "Én stemme = ett hakk lengre nese. Frykt den.",
    rulesScoreEyebrow: "Poeng",
    rulesScore1: "Du stemte på sannheten",
    rulesScore2: "Per stemme løgnen din lurte",
    rulesScore3: "Ingen fant sannheten",
    rulesScore4: "Du skrev nesten sannheten",
    rulesBack: "Tilbake",
    aboutTitle: "Om Snifferoo",
    aboutBlurb: "Et selskapsspill om å lyve med stil. Moroa lager dere selv. Appen holder styr på poengene.",
    aboutCredits: "Skrifter og lyder: Fredoka (OFL), lottie-web (MIT), Kenney (CC0).",
    // Honest, not reassuring: the moment a profile is persisted, "vi lagrer
    // ingenting" is an over-claim. PRD §10 / ONLINE-PLAY.md «den ærlige linja».
    aboutPrivacy: "Ingen server ser spillet ditt. Profilen din (navn, rating og nesetelling) ligger bare i denne nettleseren, og du kan slette den når du vil.",
    homeProfile: "Profilen din",
    profileTitle: "Profilen din", profileGames: "Spill", profileWins: "Seire",
    profileNose: "Neser samlet", profileLast: "Siste spill",
    profileBest: (n) => `Toppnotering: ${n}`,
    profileWipe: "Slett profilen", back: "Tilbake",
    profilePrivacy: "Alt dette ligger bare på denne enheten. Sletter du det, er det borte. Vi har ingen kopi.",
    ratingDelta: (n) => `${n >= 0 ? "+" : ""}${n} rating`,
    // Nett-rom (PRD §2.1)
    modeFriends: "Spill med venner", modeFriendsSub: "Del en kode. Alle spiller fra sin egen telefon.",
    modeOpen: "Spill over nett", modeOpenSub: "Hopp rett inn i et spill som er i gang. Roboter holder plassene til folk kommer.",
    openConnecting: "Finner rommet…",
    openBotsOnly: "Du spiller mot roboter akkurat nå. Første som kommer inn, tar plassen til en av dem.",
    openHostLeft: "Verten dro. Vi starter en ny runde her.",
    lobbyTitle: "Vertens lobby", lobbyCode: "Romkode", lobbyCopy: "Kopier lenke", lobbyCopied: "Kopiert!",
    lobbyShareHint: "Send lenka eller les koden høyt. Alle som åpner den, havner rett i rommet.",
    lobbyPlayers: (n) => `${n} inne`,
    lobbyNeed: (n) => `Trenger ${n} flere, eller fyll opp med roboter`,
    lobbyBots: "Roboter", lobbyStart: "Start spillet",
    lobbyJoinInstead: "Har du en kode? Bli med i stedet",
    lobbyWaiting: "Venter på verten", lobbyWaitingSub: "Verten starter når alle er inne.",
    lobbyYou: "deg", lobbyHost: "vert", lobbyOffline: "borte",
    joinTitle: "Bli med i et rom", joinCode: "Romkode", joinName: "Navnet ditt",
    joinGo: "Bli med", joinConnecting: "Kobler til…",
    joinFailNoRoom: "Fant ikke rommet. Sjekk koden, eller så er spillet over.",
    joinFailTimeout: "Fikk ikke kontakt. Nettet ditt slipper kanskje ikke gjennom.",
    joinFailGeneric: "Noe gikk galt med tilkoblingen.",
    joinFailOver: "Spillet er ferdig. Be om en ny kode.",
    joinFailFull: "Rommet er fullt. Åtte er maks.",
    joinPlayBots: "Spill mot roboter i stedet",
    lobbyLateWindow: "Døra står åpen hele spillet. Kommer du sent, blir du med likevel.",
    lateJoined: (n) => `${n} kom inn i spillet`,
    lateTookSeat: (n, bot) => `${n} tok over plassen og poengene til ${bot}`,
    lateWaiting: (n) => `${n} venter på tur`,
    lateSeated: (n) => `${n} er med fra nå, og starter likt med sisteplassen`,
    lateNextRound: "Du er inne. Runden som går nå ser du på; du spiller fra neste.",
    watchingRound: "Du ser på denne runden",
    back: "Tilbake",
    quitTitle: "Avslutte spillet?",
    quitBodyLocal: "Stillingen forsvinner. Ingen omkamp, ingen anger.",
    quitBodyOnline: "Du forlater rommet. De andre spiller videre uten deg.",
    quitBodyHost: "Du er vert. Forlater du, er rommet over for alle.",
    quitYes: "Avslutt", quitNo: "Fortsett å spille",
    lostTitle: "Mistet kontakten", lostSub: (s) => `Prøver å koble til igjen… ${s} s`,
    lostRetry: "Prøv igjen nå", lostHotseat: "Fortsett på én telefon",
    lostHostGone: "Verten forlot rommet, så det er over. Dere kan fortsette her på én telefon.",
    netNoPeer: "Nett-spill krever nettleser-versjonen med PeerJS.",
    lobbyRoomOf: (n) => `${n} sitt rom`,
    joinConnectingTo: (c) => `Kobler til rom ${c}…`,
    backToLobby: "← Tilbake til lobbyen",
    setupForRoom: "Du er vert. Dette gjelder hele rommet.",
  },
  en: {
    title: "Snifferoo", demo: "lab", pickLang: "Choose language",
    mode: "How do you want to play?", hotseatName: "One phone", hotseatSub: "One phone goes round the table.",
    partyName: "A phone each", partySub: "Your opponents are bots. You start as game master.",
    players: "Who's playing?", addPlayer: "+ Add player", namePh: "Name…", needPlayers: "3–8 players",
    yourName: "Your name", bots: "Bots", next: "Next",
    length: "Game length", theme: "Board", kort: "Short · to 8", std: "Standard · to 15", mara: "Marathon · to 25",
    salongen: "The Parlor", fjellet: "The Mountain", rom: "Outer Space", begin: "Start the game",
    gmIs: (n) => `${n} is game master`, youAreGm: "You are game master", fearNose: "Fear the nose.", roundN: (r) => `Round ${r}`,
    gmHint: "Only the game master sees this screen.",
    theWord: "The word is", secret: "Secret truth", peek: "Hold to see the truth",
    decoys: "Your false answers (0–2, one is enough)", decoyPh: (i) => `False answer ${i}…`,
    passOn: "Pass the phone on", giveTo: (n) => `Give the phone to ${n}`, noPeek: "No peeking.", hold: "Hold",
    yourBluff: (w) => `Your turn to invent. What does “${w}” mean?`, bluffPh: "Write a credible lie…",
    emptyBluff: "Even a bad lie beats no lie.", lockIn: "Submit the lie",
    // Phase timers (PRD §5.2a)
    tooLate: "Too late. The round moved on without you.",
    timeUp: "Time's up.", tenLeft: "Ten seconds left.",
    clockBluff: "to make one up", clockWait: "until everyone's in", clockDecoy: "until voting opens",
    clockVote: "to vote", clockReveal: "to the next reveal",
    timerTitle: "Timers", timerOn: "On", timerOff: "Off",
    timerBluffLabel: "Time to write a lie", timerVoteLabel: "Time to vote",
    timerHint: "Miss the deadline and the round moves on without your answer. You're back in next round.",
    allIn: "All lies accounted for.", waitingFor: "Waiting for", thinkingDots: "thinking…", openVote: "Open the vote",
    gmComposing: (n) => `${n} is composing decoys`, shuffling: "The game master shuffles the cards…",
    votingTime: (n) => `${n}, what's the truth?`, yourVote: "What's the truth?", cantOwn: "(your own answer is hidden)",
    votesIn: "Votes are coming in", youVoted: "Your vote is in.",
    revealTitle: "The Reveal",
    tapReveal: "Tap to reveal the next one", skip: "Next ▸", votes: "votes", by: "written by", theTruth: "THE TRUTH",
    you: "you", gmDecoy: "the game master's false answer", gmSteal: "Nobody found the truth. The game master takes +2.",
    doubleHit: (n) => `${n} simply wrote the truth. +3!`, toBoard: "To the board!",
    board: "The board", boardSub: (t) => `First to ${t}. Checked when everyone has been game master.`,
    nextRound: "Next round", winner: (n) => `${n} wins!`, shared: "Shared victory!",
    restOfYou: "The rest of you: nice try.", goldNose: (n) => `Golden Nose: ${n}. The game's best liar.`,
    playAgain: "Play again", pts: "p",
    rules: "+2 correct vote · +1 per vote your lie gets · +2 to the GM if nobody finds the truth",
    omkamp: "Sudden death!", omkampSub: (ns) => `${ns} are tied past the line. One extra round, and everyone votes.`,
    homePitch: "Everyone's lying. Only one is telling the truth.",
    homeNewGame: "New game", homeHowTo: "How to play", homeAbout: "About",
    rulesTitle: "How to play", rulesSub: "One round in 30 seconds",
    rulesStep1t: "The game master draws", rulesStep1b: "One obscure word. Only the game master sees what it means.",
    rulesStep2t: "Everyone else invents", rulesStep2b: "Write a definition so credible it could sit in the dictionary.",
    rulesStep3t: "The master opens the vote", rulesStep3b: "Lies, truth and decoys are shuffled into A, B, C …",
    rulesStep4t: "Everyone votes", rulesStep4b: "Find the real meaning. Your own answer is hidden from you.",
    rulesStep5t: "The reveal", rulesStep5b: "The lies are unmasked. The nose grows a notch for every vote it fooled.",
    rulesStep6t: "The race", rulesStep6b: "Points move your pawn toward the goal. First past the line wins.",
    rulesNose: "One vote = one notch longer nose. Fear it.",
    rulesScoreEyebrow: "Points",
    rulesScore1: "You voted for the truth",
    rulesScore2: "Per vote your lie fooled",
    rulesScore3: "Nobody found the truth",
    rulesScore4: "Double hit: you nearly wrote the truth",
    rulesBack: "Back",
    aboutTitle: "About Snifferoo",
    aboutBlurb: "A party game about lying with style. You make the fun yourselves. The app just keeps score.",
    aboutCredits: "Fonts and audio: Fredoka (OFL), lottie-web (MIT), Kenney (CC0).",
    // Honest, not reassuring — see the nb note above.
    aboutPrivacy: "No server sees your game. Your profile (name, rating and nose count) lives only in this browser, and you can delete it whenever you like.",
    homeProfile: "Your profile",
    profileTitle: "Your profile", profileGames: "Games", profileWins: "Wins",
    profileNose: "Noses collected", profileLast: "Recent games",
    profileBest: (n) => `Personal best: ${n}`,
    profileWipe: "Delete profile", back: "Back",
    profilePrivacy: "All of this lives on this device only. Delete it and it's gone. We hold no copy.",
    ratingDelta: (n) => `${n >= 0 ? "+" : ""}${n} rating`,
    // Online rooms (PRD §2.1)
    modeFriends: "Play with friends", modeFriendsSub: "Share a code. Everyone plays from their own phone.",
    modeOpen: "Play online", modeOpenSub: "Drop into a game already running. Bots hold the seats until people arrive.",
    openConnecting: "Finding the room…",
    openBotsOnly: "You're playing against bots right now. The next person in takes one of their seats.",
    openHostLeft: "The host left. Starting a fresh round here.",
    lobbyTitle: "Host lobby", lobbyCode: "Room code", lobbyCopy: "Copy link", lobbyCopied: "Copied!",
    lobbyShareHint: "Send the link or read the code aloud. Anyone who opens it lands straight in the room.",
    lobbyPlayers: (n) => `${n} in`,
    lobbyNeed: (n) => `Need ${n} more, or fill up with bots`,
    lobbyBots: "Bots", lobbyStart: "Start the game",
    lobbyJoinInstead: "Got a code? Join instead",
    lobbyWaiting: "Waiting for the host", lobbyWaitingSub: "The host starts when everyone's in.",
    lobbyYou: "you", lobbyHost: "host", lobbyOffline: "away",
    joinTitle: "Join a room", joinCode: "Room code", joinName: "Your name",
    joinGo: "Join", joinConnecting: "Connecting…",
    joinFailNoRoom: "Couldn't find that room. Check the code, or the game's over.",
    joinFailTimeout: "Couldn't get through. Your network may be blocking it.",
    joinFailGeneric: "Something went wrong connecting.",
    joinFailOver: "That game has finished. Ask for a new code.",
    joinFailFull: "That room is full. Eight is the maximum.",
    joinPlayBots: "Play against bots instead",
    lobbyLateWindow: "The door stays open all game. Arrive late and you're still in.",
    lateJoined: (n) => `${n} joined the game`,
    lateTookSeat: (n, bot) => `${n} took over ${bot}'s chair and their points`,
    lateWaiting: (n) => `${n} is waiting for a turn`,
    lateSeated: (n) => `${n} is in from now, starting level with last place`,
    lateNextRound: "You're in. You'll watch this round out and play from the next one.",
    watchingRound: "You're watching this round",
    back: "Back",
    quitTitle: "Quit the game?",
    quitBodyLocal: "The scores go with it. No rematch, no regrets.",
    quitBodyOnline: "You'll leave the room. The others play on without you.",
    quitBodyHost: "You're the host. If you leave, the room is over for everyone.",
    quitYes: "Quit", quitNo: "Keep playing",
    lostTitle: "Lost the connection", lostSub: (s) => `Trying to reconnect… ${s}s`,
    lostRetry: "Retry now", lostHotseat: "Carry on with one phone",
    lostHostGone: "The host left, so the room's over. You can carry on here on one phone.",
    netNoPeer: "Online play needs the browser version with PeerJS.",
    lobbyRoomOf: (n) => `${n}'s room`,
    joinConnectingTo: (c) => `Connecting to room ${c}…`,
    backToLobby: "← Back to the lobby",
    setupForRoom: "You're the host. This applies to the whole room.",
  },
};

// The eight player identity colours, as CSS custom-property references rather
// than hex. These used to be literal hexes duplicating tokens.json — two sources
// of truth for one set of values, and the kind that drifts silently because
// nothing compares them. Now the palette can be repainted in tokens.json alone.
//
// Safe as `var(...)` because every consumer drops these straight into a CSS
// colour slot (`background:`, or face({color})). Nothing parses or does maths on
// them, and there is no canvas in the Lab. myColor() in ui.js already returned a
// var() string for the seatless case, so the pattern was load-bearing already.
export const AVA = Array.from({ length: 8 }, (_, i) => `var(--color-player-${i + 1})`);

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
    // Online rooms (PRD §2.1). The roster itself lives in net.js NET.peers;
    // these are only what the join/lobby SCREENS need to draw.
    joinCode: "", joinError: null, joining: false,
    // The open room (no code). Kept separate from mode because it survives a
    // role change: an orphaned client that re-claims the well-known id becomes
    // the host of the SAME room, and the screens must not start calling it a
    // private one.
    openRoom: false,
    lostAt: 0,              // when the connection dropped, for the 30 s countdown
    backConfirm: false,     // the quit overlay is up (back pressed mid-game)
    netSeats: null,         // pids to seat as real peers, in order, at startGame
    // Posed-only (fixtures.js): let the gallery show the lobby without a network.
    fxRoster: null, fxRoom: null, fxLostLeft: undefined,
    // Host's phase-timer choices, made on screen 06 and copied into G at start.
    // ON by default because the modes that use it (party/online) are the ones
    // where one person walking away can freeze everyone else.
    timers: { on: true, bluffMs: 60000, decoyMs: 45000, voteMs: 45000, revealMs: 25000 },
  };
}
