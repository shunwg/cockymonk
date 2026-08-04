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
| Rooster art, web (`assets/game-rooster-image.png`) | Original art provided directly by the maintainer, same source family as the Expo app icon row above | Ours | Player avatar option (`js/ui.js` `AVATARS.rooster`, masked circular via `.avatar-rooster`); also stands in for a not-yet-chosen avatar on the language picker and sign-in gate (`ROOSTER_LOGO_HTML`), the two screens shown before any profile exists |

## Word corpora
Content, not art, but the same rule zero applies — every corpus version carries its own `attribution`
string in its `manifest.json`, and `js/corpora.test.mjs` fails if one is missing. See `CLAUDE.md`'s
"Versioned corpora" for why these are versioned directories rather than files.

| Corpus | From | License | Attribution owed |
|---|---|---|---|
| `js/corpora/no/v1/` (996 words, 9076 decoys) | `../ordkrig/src/data/generated/{words.no.json,fakeDefs.json}`, built by `ordkrig/scripts/wordgen/` from Norsk Ordbank + NB frequency lists + the Ordbok API | **CC BY 4.0** (definitions) | Yes — *"Ordforklaringer fra Bokmålsordboka, © Språkrådet og Universitetet i Bergen (CC BY 4.0)."* **Shown** in Settings → About |
| `js/corpora/en/v1/` (40 words) | Hand-written placeholder for the dual-language feature — no upstream | Ours | No |
| `js/corpora/en/v2/` (1100 words, 14000 decoys) | `../ordkrig/src/data/generated/{words.en.json,fakeDefs.en.json}`, built by `ordkrig/scripts/wordgen-en/1_build_en.mjs` from WordNet 3.1 glosses + Norvig `count_1w.txt` frequency ranks | **WordNet License** (BSD-like, permissive, requires the copyright notice be retained) | Yes — *"Definitions derived from WordNet 3.1, © Princeton University (WordNet License)."* **Shown** in Settings → About |

The About panel (`js/ui.js` `renderAboutPanel`) reads these strings from the **active** corpora's
`manifest.json` at runtime via `GET /api/credits` — it is not a hardcoded copy, so switching
`CORPUS_VERSIONS` or rolling back updates the displayed credit automatically. Adding a corpus version
without an `attribution` field fails `js/corpora.test.mjs`.
