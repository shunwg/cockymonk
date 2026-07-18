# ASSETS.md — art, audio & animation sources

Rule zero: **nothing enters the app without a license row in this file.** CC0 preferred; attribution licenses allowed if the credit lands in About/Credits. Unknown license = doesn't exist.

## Bundled in this kit (`AssetsIncoming/`) — downloaded 2026-07-18, all CC0 1.0
| Pack | Files | Use for | Source |
|---|---|---|---|
| `boardgame-pack` | 597 | Pawns/pieces (all avatar colors via recolor), dice, tiles, card frames — the Salongen theme backbone | kenney.nl/assets/boardgame-pack |
| `board-game-icons` | 780 | UI glyphs: cards, pawns, timers, dice — vote chips, rules screen | kenney.nl/assets/board-game-icons |
| `casino-audio` | 59 | `card-slide-*`, `card-shuffle`, `chips-collide-*` → draw, vote-open, tick-in sounds | kenney.nl/assets/casino-audio |
| `interface-sounds` | 104 | Clicks, switches, confirms → votes, toggles, navigation | kenney.nl/assets/interface-sounds |

CC0 = no attribution required, commercial use fine — we credit Kenney in About anyway, because class.

**Workflow:** `AssetsIncoming/` is the quarry, never shipped. The `asset-wrangler` skill curates from here (and the sources below) into `Resources/Assets.xcassets` at @2x/@3x, recolored to DESIGN.md tokens, and logs every promoted file in `Resources/Audio/CREDITS.md` (audio) or the table below (art).

## Promoted into the app (grows as you build)
| Asset | From | License | Where used |
|---|---|---|---|
| Fredoka (SemiBold, Bold) | Google Fonts | OFL 1.1 | Display face everywhere (DESIGN.md §2) |
| Logo mark (nose-face SVG) | Original, in `Reference/cocky-monk-demo.html` | Ours | App icon, brand, loader, empty states |
| `Lab/vendor/lottie.min.js` (lottie-web 5.12.2) | unpkg.com/lottie-web | MIT | Lab Lottie preview page only — **never shipped in the app** (the app uses lottie-ios ≥ 4.5.0 via SPM, see CLAUDE.md exception) |

## Curated further sources (vetted for license clarity)
| Source | License | Best for |
|---|---|---|
| kenney.nl (200+ more packs) | CC0 | Particles (confetti!), space kit → Verdensrommet, nature kit → Fjellet, more UI audio |
| opengameart.org (filter: CC0) | Per-file — **filter CC0 only** | Backgrounds, textures, one-off sprites |
| itch.io free asset packs | Per-file — read each page | Illustrated board backgrounds |
| game-icons.net | CC BY 3.0 (attribution required) | 4,000+ crisp glyphs if Kenney lacks one |
| SF Symbols (Apple) | Free within Apple apps | All standard UI iconography — default choice |
| freesound.org (filter: CC0) | Per-file — **filter CC0 only** | Fanfare, wind gust, thruster, chuckle sting |
| lottiefiles.com | Per-file — check badge; prefer "Lottie Simple License" free tier | Confetti/celebration Lottie if hand-rolled Canvas confetti isn't enough |
| Google Fonts | OFL | Only if a theme ever needs a display face (DESIGN.md currently says no) |

## Explicitly off-limits
| | Why |
|---|---|
| Google Images / Pinterest / random blogs | License unknowable — legal landmines |
| Stock photos of real board games | Trademarked products in frame |
| Anything from the game named in PRD §3, Balderdash, Kahoot | The obvious one |
| AI-generated images of recognizable styles/characters | Trademark/IP risk; generated *original* textures are fine — log them here as "generated, original" |
| Watermarked previews | You don't own them |
