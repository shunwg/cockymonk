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

const STRINGS = {
  no: {
    appName: "Cockerel",
    eyebrowBrand: "Frykt Nesen",

    signInHeading: "Logg inn for å spille",
    signInBody: "Du må logge inn med Google for å spille — det sikrer at poengene og streaken din er trygge, og at alle spillerne er ekte.",

    settingsTitle: "Innstillinger",
    settingsAriaLabel: "Innstillinger",
    themeToggleToDark: "Bytt til mørkt tema",
    themeToggleToLight: "Bytt til lyst tema",
    languageSectionTitle: "Språk",
    languageSectionNote: "Du kan spille begge språk samme dag — de er helt uavhengige av hverandre.",
    languageLastOneNote: "Du må ha minst ett språk aktivert.",
    googleLinkedNote: "Innlogget med Google — poengene og streaken din er trygge selv om du bytter enhet.",
    signOut: "Logg ut",
    googleSignInNote: "Logg inn med Google for å ta med deg poengene og streaken din til en annen enhet eller etter en ominstallering.",
    resetNote: "Dette nullstiller kun din egen spiller på denne enheten — andre som spiller påvirkes ikke.",
    resetButton: "Nullstill spillet mitt",
    close: "Lukk",
    resetConfirmHeading: "Er du sikker?",
    resetConfirmBody: "Alle dine poeng, streaken din og bløffene dine forsvinner for godt{googleSuffix}. Dette kan ikke angres.",
    resetConfirmGoogleSuffix: ", og Google-innloggingen din kobles fra",
    resetConfirmYes: "Ja, nullstill",
    cancel: "Avbryt",

    chooseNameHeading: "Velg brukernavnet ditt",
    chooseNameNote: "Du kan endre det senere.",
    continue: "Fortsett",

    howToPlayHeading: "Slik spiller du",
    howToPlayBody: "Hver dag skriver du falske definisjoner på 3 nye ord, og gjetter den ekte definisjonen blant andres bløffer på gårsdagens ord. Du får poeng for riktige gjett og for å lure andre — og en liten bonus for å være med flere dager på rad.",
    howToPlayContinue: "Skjønner, sett i gang",

    welcomeHeading: "Heisann, {name}!",
    points: "Poeng",
    streak: "Streak",
    welcomeContinue: "Gi meg dagens kuk!",

    readyHeading: "Velkommen tilbake, {name}!",
    readyContinue: "Gjett gårsdagens ord",

    writeRecapEyebrow: "Sist du skrev",
    writeRecapNoneFooled: "Ingen ble lurt av ordene dine sist, lykke til denne gangen!",
    rating: "Rating",
    writeRecapFooled: "{count} av dine ord lurte andre!",
    writeRecapYouGet: "Du får",
    streakBonus: "Streak-bonus",
    total: "Total",

    timeoutGuessHeading: "Du rakk ikke å gjette",
    timeoutWriteHeading: "Du rakk ikke å skrive",
    timeoutBody: "Tiden løp ut for dette ordet.",
    next: "Neste",

    guessEyebrow: "Gjett gårsdagens ord ({position}/{total})",
    hint: "Hint 💡",
    hintNoData: "Ingen har gjettet ordet ennå",
    hintShown: "Hint vist",

    scoreEyebrow: "Din poengsum",
    correctGuesses: "Riktige gjett",
    correctAnswer: "Riktig svar",
    yourAnswer: "Ditt svar",

    writeEyebrow: "Skriv dagens ord ({position}/{total})",
    writePlaceholder: "Skriv en troverdig (falsk) definisjon...",
    submit: "Send inn",

    doneStreakLabel: "Streak",
    doneDays: "dager",
    doneBody: "Kom tilbake i morgen og se om noen gjettet ordene dine!",
    playOtherLangToo: "Spill også på {lang} i dag",

    chooseTodayLangHeading: "Velkommen tilbake! Hvilket språk vil du spille i dag?",
    chooseTodayLangNote: "Du kan spille det andre språket etterpå — ingenting går tapt.",

    streakUnitOne: "dag",
    streakUnitMany: "dager",
    streakBonusSuffix: " (+{pct}% poengbonus)",
    pointsRank: "{rating} poeng ({rank}. plass)",
  },
  en: {
    appName: "Cockerel",
    eyebrowBrand: "Fear The Nose",

    signInHeading: "Sign in to play",
    signInBody: "You need to sign in with Google to play — it keeps your points and streak safe, and makes sure every player is real.",

    settingsTitle: "Settings",
    settingsAriaLabel: "Settings",
    themeToggleToDark: "Switch to dark theme",
    themeToggleToLight: "Switch to light theme",
    languageSectionTitle: "Language",
    languageSectionNote: "You can play both languages on the same day — they're completely independent of each other.",
    languageLastOneNote: "You need at least one language enabled.",
    googleLinkedNote: "Signed in with Google — your points and streak are safe even if you switch devices.",
    signOut: "Sign out",
    googleSignInNote: "Sign in with Google to bring your points and streak to another device, or after a reinstall.",
    resetNote: "This only resets your own player on this device — other players aren't affected.",
    resetButton: "Reset my game",
    close: "Close",
    resetConfirmHeading: "Are you sure?",
    resetConfirmBody: "All your points, your streak, and your bluffs disappear for good{googleSuffix}. This can't be undone.",
    resetConfirmGoogleSuffix: ", and your Google sign-in gets unlinked",
    resetConfirmYes: "Yes, reset",
    cancel: "Cancel",

    chooseNameHeading: "Choose your username",
    chooseNameNote: "You can change it later.",
    continue: "Continue",

    howToPlayHeading: "How to play",
    howToPlayBody: "Every day you write fake definitions for 3 new words, and guess the real definition among other players' bluffs on yesterday's words. You earn points for correct guesses and for fooling others — plus a small bonus for playing several days in a row.",
    howToPlayContinue: "Got it, let's go",

    welcomeHeading: "Hi there, {name}!",
    points: "Points",
    streak: "Streak",
    welcomeContinue: "Give me today's words!",

    readyHeading: "Welcome back, {name}!",
    readyContinue: "Guess yesterday's word",

    writeRecapEyebrow: "Last time you wrote",
    writeRecapNoneFooled: "Nobody was fooled by your words last time — good luck this round!",
    rating: "Rating",
    writeRecapFooled: "{count} of your words fooled someone!",
    writeRecapYouGet: "You get",
    streakBonus: "Streak bonus",
    total: "Total",

    timeoutGuessHeading: "You ran out of time to guess",
    timeoutWriteHeading: "You ran out of time to write",
    timeoutBody: "Time ran out for that word.",
    next: "Next",

    guessEyebrow: "Guess yesterday's word ({position}/{total})",
    hint: "Hint 💡",
    hintNoData: "No one has guessed this word yet",
    hintShown: "Hint shown",

    scoreEyebrow: "Your score",
    correctGuesses: "Correct guesses",
    correctAnswer: "Correct answer",
    yourAnswer: "Your answer",

    writeEyebrow: "Write today's word ({position}/{total})",
    writePlaceholder: "Write a believable (fake) definition...",
    submit: "Submit",

    doneStreakLabel: "Streak",
    doneDays: "days",
    doneBody: "Come back tomorrow and see if anyone guessed your words!",
    playOtherLangToo: "Play {lang} too today",

    chooseTodayLangHeading: "Welcome back! Which language do you want to play today?",
    chooseTodayLangNote: "You can play the other language afterward — nothing is lost.",

    streakUnitOne: "day",
    streakUnitMany: "days",
    streakBonusSuffix: " (+{pct}% points bonus)",
    pointsRank: "{rating} points (#{rank})",
  },
};

/** Simple `{name}`-style interpolation — every placeholder in STRINGS is
 * this shape, no plural rules or nesting needed at this app's scale. */
export function t(lang, key, vars) {
  const template = STRINGS[lang]?.[key] ?? STRINGS.no[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

// The ONE screen shown before any gameplay language is known (first-ever
// onboarding, before the Name screen) — see js/ui.js's language-picker step.
// Deliberately bilingual/neutral chrome, not looked up per-lang, since
// there's no "current language" yet to look it up IN.
export const LANGUAGE_PICKER = {
  heading: "Choose your language / Velg språk",
  note: "You can add the other language later in settings. / Du kan legge til det andre språket senere i innstillingene.",
};

export function otherLang(lang) {
  return LANGS.find((l) => l !== lang);
}
