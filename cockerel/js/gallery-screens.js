// gallery-screens.js — single source of truth for the dev-only screen
// gallery: js/gallery.js (gallery.html) renders one card per entry here;
// js/ui.js's runGalleryPreview dispatches on `id` via GALLERY_PREVIEW_SCREENS.
// Add a screen here first, then a matching case in ui.js, to keep both in
// sync — see gallery.html's CLAUDE.md note for the full picture.
//
// "language-picker" and "choose-today-lang"/"done-with-other-lang" are the
// dual-language additions (see cockerel/CLAUDE.md "Dual-language gameplay")
// — the fixture data behind every screen here is still Norwegian-only
// (FIXTURE_WORDS in js/ui.js), so this gallery doesn't yet preview what an
// English-language screen looks like end-to-end, only the language-choice
// UI itself.
export const GALLERY_SCREENS = [
  { id: "language-picker", label: "Velg spillspråk (helt første besøk)" },
  { id: "sign-in-gate", label: "Logg inn (Google, krevd)" },
  { id: "name", label: "Velg brukernavn (første besøk)" },
  { id: "how-to-play", label: "Slik spiller du" },
  { id: "welcome", label: "Heisann! (første gang, startpoeng)" },
  { id: "ready", label: "Velkommen tilbake" },
  { id: "choose-today-lang", label: "Velg språk for i dag (2 språk, ingen spilt)" },
  { id: "write-recap-none", label: "Sist du skrev — ingen lurt" },
  { id: "write-recap-fooled", label: "Sist du skrev — noen lurt" },
  { id: "guess", label: "Gjett gårsdagens ord" },
  { id: "guess-hint", label: "Gjett — hint vist" },
  { id: "timeout-guess", label: "Du rakk ikke å gjette" },
  { id: "score", label: "Din poengsum" },
  { id: "write", label: "Skriv dagens ord" },
  { id: "timeout-write", label: "Du rakk ikke å skrive" },
  { id: "done", label: "Ferdig for dagen / streak" },
  { id: "done-with-other-lang", label: "Ferdig — tilbud om å spille engelsk også" },
];
