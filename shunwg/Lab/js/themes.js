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
    // pawnIcon retired 2026-07-28: the pawn now shows the player's initial.
    // A themed emoji was three coloured blobs in a monochrome app, and it said
    // nothing about WHO the pawn was — see pawnEl() in ui.js.
    marks: ["⅓", "⅔", ""],  // milestone marks. The goal slot is EMPTY: the
    // goal tile already carries the drawn cheese, and a mark on top of it would
    // be the same fact said twice. Emoji retired 2026-07-28 — they were the last
    // full-colour pixels on a monochrome board (DESIGN.md §2: functional emoji
    // only, everything decorative drawn).
    hopSound: "pawnHop",
  },
  fjellet: {
    id: "fjellet",
    nameKey: "fjellet",
    cssClass: "theme-fjellet",
    // pawnIcon retired 2026-07-28: the pawn now shows the player's initial.
    // A themed emoji was three coloured blobs in a monochrome app, and it said
    // nothing about WHO the pawn was — see pawnEl() in ui.js.
    marks: ["⅓", "⅔", ""],
    hopSound: "pawnHop",
  },
  rom: {
    id: "rom",
    nameKey: "rom",
    cssClass: "theme-rom",
    // pawnIcon retired 2026-07-28: the pawn now shows the player's initial.
    // A themed emoji was three coloured blobs in a monochrome app, and it said
    // nothing about WHO the pawn was — see pawnEl() in ui.js.
    marks: ["⅓", "⅔", ""],
    hopSound: "pawnHop",
  },
});

export const THEME_ORDER = Object.freeze(["salongen", "fjellet", "rom"]);

export function nextTheme(current) {
  return THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
}
