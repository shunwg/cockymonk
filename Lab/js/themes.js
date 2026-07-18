// themes.js — BoardTheme registry for the Lab. Lane B owns this file.
// Mirrors the future Swift BoardTheme protocol (DESIGN.md §3): a theme supplies
// identity + pawn icon + landmark marks + a CSS class; geometry and hop physics
// are shared and live in ui.js. Adding a theme = one entry here + a themes.css
// block, zero engine changes (CLAUDE.md Theme rule).

export const THEMES = Object.freeze({
  salongen: {
    id: "salongen",
    nameKey: "salongen",       // i18n key in state.js STR
    cssClass: "theme-salongen",
    pawnIcon: "♟",
    marks: ["☕", "🕰️", "🏆"],  // ⅓ · ⅔ · goal landmarks
    hopSound: "pawnHop",
  },
  fjellet: {
    id: "fjellet",
    nameKey: "fjellet",
    cssClass: "theme-fjellet",
    pawnIcon: "🥾",
    marks: ["🌲", "❄️", "🚩"],
    hopSound: "pawnHop",
  },
  rom: {
    id: "rom",
    nameKey: "rom",
    cssClass: "theme-rom",
    pawnIcon: "🚀",
    marks: ["🛰️", "☄️", "🌕"],
    hopSound: "pawnHop",
  },
});

export const THEME_ORDER = Object.freeze(["salongen", "fjellet", "rom"]);

export function nextTheme(current) {
  return THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
}
