# ASSETS.md — art & type sources

Rule zero: **nothing enters the app without a license row in this file.** Same rule as `../shunwg/ASSETS.md` — this project keeps its own ledger because it vendors copies, not references, of anything it borrows.

## Promoted into the app
| Asset | From | License | Where used |
|---|---|---|---|
| Fredoka (variable, wght 400–700) | Copied from `../shunwg/Lab/vendor/fredoka.css` (originally Google Fonts) | OFL 1.1 | Display face everywhere, via `assets/fredoka.css` |
| Nesen mark (nose-face SVG) | Copied from `../shunwg/Lab/icon.svg` (original Cocky Monk art) | Ours (same project family) | App icon, brand, loader, empty states — unmodified; this app is an explicit Cocky Monk spinoff, not a separate identity |
| `DesignSystem` color/type/motion tokens | Copied from `../shunwg/DesignSystem/tokens.json`, regenerated to `css/tokens.css` via `Tools/sync-tokens.mjs` | Ours (same project family) | All screen styling |
| Fredoka TTF (`app/assets/fonts/Fredoka.ttf`) | Extracted (base64-decoded + `woff2_decompress`'d) from the same `../shunwg/Lab/vendor/fredoka.css` above — CSS `@font-face` isn't usable in React Native, `expo-font` needs an actual font file | OFL 1.1 | Expo app (`app/`) display text, via `expo-font`'s `useFonts` |
