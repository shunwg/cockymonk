// i18n.js — UI string localization for the two gameplay languages (see
// js/config.js LANGS and cockerel/CLAUDE.md "Dual-language gameplay"). Every
// PLAYER-FACING string in js/ui.js's render functions lives here — the
// no/en split matches which gameplay language a screen belongs to, not the
// browser's locale. Deliberately NOT used for #devbar or gallery.html/
// js/gallery.js — both are internal dev tooling, not shipped UX (same
// framing CLAUDE.md already uses for #devbar).
import { LANGS } from "./config.js";
export { LANGS };

// Each language's own native name — shown on buttons/toggles regardless of
// which language is currently active (a Norwegian speaker should still see
// "English," not a translated word for it, same convention every real app
// uses for its language switcher).
export const LANG_LABELS = { no: "Norsk", en: "English" };

// A language's name translated INTO each display language — unlike
// LANG_LABELS (always the native name, for language-picker buttons), this is
// for sentences ABOUT a language that must read naturally in whichever
// language they're written in (e.g. "play English too" on a Norwegian
// screen must say "engelsk", not the English native name "English").
export const LANG_NAMES = {
  no: { no: "norsk", en: "engelsk" },
  en: { no: "Norwegian", en: "English" },
};

const STRINGS = {
  no: {
    appName: "Cockerel",

    signInHeading: "Logg inn for å spille",
    signInBody: "Å logge inn sikrer at poengene dine lagres og ekte spiller. Vi får ikke tilgang til noe på google-kontoen din.",

    settingsTitle: "Innstillinger",
    settingsAriaLabel: "Innstillinger",
    appearanceSectionTitle: "Utseende",
    themeToggleToDark: "Bytt til mørkt tema",
    themeToggleToLight: "Bytt til lyst tema",
    languageSectionTitle: "Språk",
    languageSectionNote: "Du kan spille begge språk samme dag — de er helt uavhengige av hverandre.",
    languageLastOneNote: "Du må ha minst ett språk aktivert.",
    installSectionTitle: "Installer appen",
    installButton: "Installer Cockerel",
    installedNote: "Cockerel er installert på denne enheten.",
    installIOSLinkLabel: "Installer på iPhone",
    installInstructionsHeading: "Slik installerer du",
    installInstructionsStep1: "Åpne appen i Safari (ikke en annen nettleser).",
    installInstructionsStep2: "Trykk på Del-ikonet nederst på skjermen.",
    installInstructionsStep3: "Velg «Legg til på Hjem-skjerm», og trykk «Legg til».",
    installGenericInstructions: "Se etter «Installer app» eller «Legg til på startskjerm» i nettleserens meny.",
    back: "Tilbake",
    accountSectionTitle: "Konto",
    googleLinkedNote: "Innlogget med Google — poengene og streaken din er trygge selv om du bytter enhet.",
    signOut: "Logg ut",
    signOutConfirmHeading: "Logge ut?",
    signOutConfirmBody: "Du kan logge inn igjen med samme Google-konto for å hente frem poengene og streaken din.",
    signOutConfirmYes: "Ja, logg ut",
    googleSignInNote: "Logg inn med Google for å ta med deg poengene og streaken din til en annen enhet eller etter en ominstallering.",
    resetButton: "Nullstill spillet mitt",
    close: "Lukk",
    resetConfirmHeading: "Er du sikker?",
    resetConfirmBody: "Alle dine poeng, streaken din og bløffene dine forsvinner for godt{googleSuffix}. Dette kan ikke angres.",
    resetConfirmGoogleSuffix: ", og Google-innloggingen din kobles fra",
    resetConfirmYes: "Ja, nullstill",
    cancel: "Avbryt",

    chooseNameHeading: "Hva heter du?",
    avatarPrev: "Forrige ikon",
    avatarNext: "Neste ikon",
    continue: "Fortsett",

    howToPlayHeading: "Slik fungerer spillet",
    howToPlayBody: "Hver dag skriver du bløffer til 3 nye ord.\n\nSå gjetter du den riktige definisjonen på gårsdagens ord.\n\nDu får poeng for riktige gjett og når andre tror på din definisjon.",
    howToPlayContinue: "Skjønner, sett i gang",

    welcomeHeading: "Heisann, {name}!",
    points: "Poeng",
    welcomeStartPoints: "Start-poeng",
    streak: "Streak",
    welcomeStreakLabel: "Streak (poengbonus)",
    welcomeContinue: "Gi meg dagens 3 ord",

    readyHeading: "Velkommen tilbake, {name}!",
    readyContinue: "Gjett gårsdagens ord",

    writeRecapEyebrow: "Gårsdagens resultater",
    writeRecapNoneFooled: "Ingen ble lurt av ordene dine sist, lykke til denne gangen!",
    rating: "Rating",
    writeRecapFooled: "{count} av dine ord lurte andre!",
    writeRecapYouGet: "Du får",
    streakBonus: "Streak-bonus",
    total: "Total",

    timeoutGuessHeading: "Du rakk ikke å gjette",
    timeoutWriteHeading: "Du rakk ikke å skrive",
    timeoutBody: "Tiden løp ut for dette ordet.",
    timeoutWriteSavedHeading: "Tiden løp ut, men vi lagret bløffen din!",
    timeoutWriteSavedBody: "Du rakk å skrive nok til at den ble sendt inn automatisk.",
    next: "Neste",

    guessEyebrow: "Gjett gårsdagens ord ({position}/{total})",
    hint: "Hint 💡",
    hintNoData: "Ingen har gjettet ordet ennå",
    hintShown: "Hint vist",

    scoreEyebrow: "Din poengsum",
    correctGuesses: "Riktige svar",
    correctAnswer: "Riktig svar",
    yourAnswer: "Ditt svar",

    writeEyebrow: "Skriv dagens ord ({position}/{total})",
    writePlaceholder: "Skriv en troverdig (falsk) definisjon...",
    submit: "Send inn",

    doneStreakLabel: "Streak",
    doneDays: "dager",
    doneBody: "Kom tilbake i morgen og se om noen gjettet ordene dine!",
    playOtherLangToo: "Spill en runde på {lang} i dag også",

    chooseTodayLangGreeting: "Velkommen tilbake!",
    chooseTodayLangHeading: "Hvilket språk vil du spille i dag?",

    streakUnitOne: "dag",
    streakUnitMany: "dager",
    streakBonusSuffix: " (+{pct}% bonus)",
    pointsMain: "{rating} poeng",
    pointsRankSuffix: " (#{rank})",
    headerProgressGuessed: "{done}/{total} gjettet",
    headerProgressWritten: "{done}/{total} skrevet",
    headerProgressJoiner: " + ",

    rankingTitle: "Rangering",
    rankingLoading: "Laster …",
    rankingEmpty: "Ingen andre spillere ennå.",
    rankingYou: "deg",
  },
  en: {
    appName: "Cockerel",

    signInHeading: "Sign in to play",
    signInBody: "Signing in makes sure your points are saved and every player is real. We don't get access to anything on your Google account.",

    settingsTitle: "Settings",
    settingsAriaLabel: "Settings",
    appearanceSectionTitle: "Appearance",
    themeToggleToDark: "Switch to dark theme",
    themeToggleToLight: "Switch to light theme",
    languageSectionTitle: "Language",
    languageSectionNote: "You can play both languages on the same day — they're completely independent of each other.",
    languageLastOneNote: "You need at least one language enabled.",
    installSectionTitle: "Install the app",
    installButton: "Install Cockerel",
    installedNote: "Cockerel is installed on this device.",
    installIOSLinkLabel: "Install iPhone app",
    installInstructionsHeading: "How to install",
    installInstructionsStep1: "Open the app in Safari (not another browser).",
    installInstructionsStep2: "Tap the Share icon at the bottom of the screen.",
    installInstructionsStep3: "Choose “Add to Home Screen,” then tap “Add.”",
    installGenericInstructions: "Look for “Install app” or “Add to home screen” in your browser's menu.",
    back: "Back",
    accountSectionTitle: "Account",
    googleLinkedNote: "Signed in with Google — your points and streak are safe even if you switch devices.",
    signOut: "Sign out",
    signOutConfirmHeading: "Sign out?",
    signOutConfirmBody: "You can sign back in with the same Google account to pick up your points and streak.",
    signOutConfirmYes: "Yes, sign out",
    googleSignInNote: "Sign in with Google to bring your points and streak to another device, or after a reinstall.",
    resetButton: "Reset my game",
    close: "Close",
    resetConfirmHeading: "Are you sure?",
    resetConfirmBody: "All your points, your streak, and your bluffs disappear for good{googleSuffix}. This can't be undone.",
    resetConfirmGoogleSuffix: ", and your Google sign-in gets unlinked",
    resetConfirmYes: "Yes, reset",
    cancel: "Cancel",

    chooseNameHeading: "What's your name?",
    avatarPrev: "Previous icon",
    avatarNext: "Next icon",
    continue: "Continue",

    howToPlayHeading: "How the game works",
    howToPlayBody: "Every day you write bluffs for 3 new words.\n\nThen you guess the correct definition for yesterday's words.\n\nYou get points for correct guesses and when others believe your definition.",
    howToPlayContinue: "Got it, let's go",

    welcomeHeading: "Hi there, {name}!",
    points: "Points",
    welcomeStartPoints: "Starting points",
    streak: "Streak",
    welcomeStreakLabel: "Streak (points bonus)",
    welcomeContinue: "Give me today's 3 words",

    readyHeading: "Welcome back, {name}!",
    readyContinue: "Guess yesterday's word",

    writeRecapEyebrow: "Yesterday's results",
    writeRecapNoneFooled: "Nobody was fooled by your words last time — good luck this round!",
    rating: "Rating",
    writeRecapFooled: "{count} of your words fooled someone!",
    writeRecapYouGet: "You get",
    streakBonus: "Streak bonus",
    total: "Total",

    timeoutGuessHeading: "You ran out of time to guess",
    timeoutWriteHeading: "You ran out of time to write",
    timeoutBody: "Time ran out for that word.",
    timeoutWriteSavedHeading: "Time ran out, but we saved your bluff!",
    timeoutWriteSavedBody: "You typed enough that it was submitted automatically.",
    next: "Next",

    guessEyebrow: "Guess yesterday's word ({position}/{total})",
    hint: "Hint 💡",
    hintNoData: "No one has guessed this word yet",
    hintShown: "Hint shown",

    scoreEyebrow: "Your score",
    correctGuesses: "Correct answers",
    correctAnswer: "Correct answer",
    yourAnswer: "Your answer",

    writeEyebrow: "Write today's word ({position}/{total})",
    writePlaceholder: "Write a believable (fake) definition...",
    submit: "Submit",

    doneStreakLabel: "Streak",
    doneDays: "days",
    doneBody: "Come back tomorrow and see if anyone guessed your words!",
    playOtherLangToo: "Play a round in {lang} today too",

    chooseTodayLangGreeting: "Welcome back!",
    chooseTodayLangHeading: "Which language do you want to play today?",

    streakUnitOne: "day",
    streakUnitMany: "days",
    streakBonusSuffix: " (+{pct}% bonus)",
    pointsMain: "{rating} points",
    pointsRankSuffix: " (#{rank})",
    headerProgressGuessed: "{done}/{total} guessed",
    headerProgressWritten: "{done}/{total} written",
    headerProgressJoiner: " + ",

    rankingTitle: "Ranking",
    rankingLoading: "Loading …",
    rankingEmpty: "No other players yet.",
    rankingYou: "you",
  },
};

/** Simple `{name}`-style interpolation — every placeholder in STRINGS is
 * this shape, no plural rules or nesting needed at this app's scale. */
export function t(lang, key, vars) {
  const template = STRINGS[lang]?.[key] ?? STRINGS.no[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function otherLang(lang) {
  return LANGS.find((l) => l !== lang);
}
