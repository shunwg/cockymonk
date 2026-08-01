# ASSETS.md — art & type sources

Rule zero: **nothing enters the app without a license row in this file.** Same rule as `../shunwg/ASSETS.md` — this project keeps its own ledger because it vendors copies, not references, of anything it borrows.

## Promoted into the app
| Asset | From | License | Where used |
|---|---|---|---|
| Fredoka (variable, wght 400–700) | Copied from `../shunwg/Lab/vendor/fredoka.css` (originally Google Fonts) | OFL 1.1 | Display face everywhere, via `assets/fredoka.css` |
| Nesen mark (nose-face SVG) | Copied from `../shunwg/Lab/icon.svg` (original Cocky Monk art) | Ours (same project family) | App icon, brand, loader, empty states — unmodified; this app is an explicit Cocky Monk spinoff, not a separate identity |
| Nesen mark, raster (`assets/nesen-180.png`, `assets/nesen-512.png`) | Copied from `../shunwg/Lab/icon-180.png`/`icon-512.png` (same source art as the SVG row above, pre-rasterized there) via `Tools/sync-tokens.mjs` | Ours (same project family) | PWA install icons — `manifest.webmanifest`'s `icons` array + `index.html`'s `apple-touch-icon`; a raster PNG is needed since iOS Safari doesn't reliably rasterize an SVG home-screen icon |
| `DesignSystem` color/type/motion tokens | Copied from `../shunwg/DesignSystem/tokens.json`, regenerated to `css/tokens.css` via `Tools/sync-tokens.mjs` | Ours (same project family) | All screen styling |
| Fredoka TTF (`app/assets/fonts/Fredoka.ttf`) | Extracted (base64-decoded + `woff2_decompress`'d) from the same `../shunwg/Lab/vendor/fredoka.css` above — CSS `@font-face` isn't usable in React Native, `expo-font` needs an actual font file | OFL 1.1 | Expo app (`app/`) display text, via `expo-font`'s `useFonts` |
| "Cockerel" icon (`app/assets/icon.png`, `icon-adaptive-foreground.png`) | Original art provided directly by the maintainer (a rooster line drawing on a maroon background) — center-cropped to square and upscaled to 1024×1024 for iOS; a second, safe-zone-padded version generated for Android's adaptive icon (same art scaled down ~66% on the same background color so OS icon masks don't clip it) | Ours | Expo app (`app/`) — `app.json`'s `icon`/`android.adaptiveIcon`/`web.favicon` |
