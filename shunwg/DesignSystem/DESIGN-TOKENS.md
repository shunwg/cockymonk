<!-- GENERATED from DesignSystem/tokens.json — do not edit (run: node Tools/tokens-build.mjs) -->

# Snifferoo design tokens

Source of truth: `DesignSystem/tokens.json` (v1) — DESIGN.md v3 + frozen demo (Reference/cocky-monk-demo.html — demo wins on conflict).
Generated outputs: `Lab/css/tokens.css` · `Sources/DesignSystem/Theme.swift` · `DesignSystem/DESIGN-TOKENS.md`.
Edit this file only. Regenerate: node Tools/tokens-build.mjs · Gate: node Tools/tokens-build.mjs --check.

## Core colors (DESIGN.md §2)

| Token | Hex | Use |
|---|---|---|
| `backdrop` | `#0b0b10` |  |
| `raised` | `#17171c` |  |
| `line` | `#2a2a2f` |  |
| `sheet` | `#f4f4f9` |  |
| `sheetSunk` | `#e4e4e9` |  |
| `ink` | `#0b0b10` |  |
| `inkInverse` | `#f4f4f9` |  |
| `confirmed` | `#FFFFFF` |  |
| `alert` | `#8f8f94` |  |
| `action` | `#f4f4f9` |  |
| `private` | `#3d3d42` |  |
| `quiet` | `#6f6f74` |  |
| `quietText` | `#a4a4a9` |  |

### Avatar palette (demo `AVA[]`, 8 fixed)

| # | Hex |
|---|---|
| 1 | `#b3b3b8` |
| 2 | `#FFFFFF` |
| 3 | `#a0a0a5` |
| 4 | `#ededf2` |
| 5 | `#8d8d92` |
| 6 | `#dadadf` |
| 7 | `#7a7a7f` |
| 8 | `#c7c7cc` |

### Confetti palette (demo `confetti()`, 5)

| # | Hex |
|---|---|
| 1 | `#FFFFFF` |
| 2 | `#c8c8cd` |
| 3 | `#8f8f94` |
| 4 | `#5b5b60` |
| 5 | `#e4e4e9` |

## Semantic roles

| Role | References | Resolves to |
|---|---|---|
| `bg` | `{color.palette.backdrop}` | `#0b0b10` |
| `bgRaised` | `{color.palette.raised}` | `#17171c` |
| `surface` | `{color.palette.sheet}` | `#f4f4f9` |
| `surfaceSunk` | `{color.palette.sheetSunk}` | `#e4e4e9` |
| `surfaceSecret` | `{color.palette.private}` | `#3d3d42` |
| `text.onSurface` | `{color.palette.ink}` | `#0b0b10` |
| `text.onBg` | `{color.palette.inkInverse}` | `#f4f4f9` |
| `text.secondary` | `{color.palette.quietText}` | `#a4a4a9` |
| `border` | `{color.palette.ink}` | `#0b0b10` |
| `hairline` | `{color.palette.line}` | `#2a2a2f` |
| `accent.truth` | `{color.palette.confirmed}` | `#FFFFFF` |
| `accent.bluff` | `{color.palette.alert}` | `#8f8f94` |
| `accent.gm` | `{color.palette.private}` | `#3d3d42` |
| `accent.turn` | `{color.palette.action}` | `#f4f4f9` |
| `status.success` | `{color.palette.confirmed}` | `#FFFFFF` |
| `status.warning` | `{color.palette.quietText}` | `#a4a4a9` |
| `status.error` | `{color.palette.alert}` | `#8f8f94` |
| `status.info` | `{color.palette.private}` | `#3d3d42` |
| `status.pending` | `{color.palette.quiet}` | `#6f6f74` |
| `board.path` | `{color.palette.line}` | `#2a2a2f` |
| `board.goal` | `{color.palette.confirmed}` | `#FFFFFF` |
| `timer.calm` | `{color.palette.quiet}` | `#6f6f74` |
| `timer.warn` | `{color.palette.quietText}` | `#a4a4a9` |
| `timer.urgent` | `{color.palette.confirmed}` | `#FFFFFF` |
| `bgLayers.glowPrimary` | *(literal)* | `#FFFFFF08` |
| `bgLayers.glowSecondary` | *(literal)* | `#FFFFFF05` |
| `bgLayers.dotGrid` | *(literal)* | `#FFFFFF06` |

## Contrast (WCAG 2.1, AA text threshold 4.5:1)

Text-role tokens against their background tokens. Ratios to two decimals; < 4.50 flagged ⚠.

| Foreground | Background | Ratio | AA |
|---|---|---|---|
| `text.onSurface (inkText)` `#0b0b10` | `surface (paper)` `#f4f4f9` | 17.91 | ✓ |
| `text.onBg (paperText)` `#f4f4f9` | `bg (inkNight)` `#0b0b10` | 17.91 | ✓ |
| `text.secondary (mutedViolet)` `#a4a4a9` | `bg (inkNight)` `#0b0b10` | 7.91 | ✓ |
| `accent.truth (truthGreen)` `#FFFFFF` | `bg (inkNight)` `#0b0b10` | 19.63 | ✓ |
| `accent.bluff (bluffPink)` `#8f8f94` | `bg (inkNight)` `#0b0b10` | 6.10 | ✓ |
| `accent.gm (gmViolet)` `#3d3d42` | `bg (inkNight)` `#0b0b10` | 1.82 | ⚠ |
| `accent.turn (turnYellow)` `#f4f4f9` | `bg (inkNight)` `#0b0b10` | 17.91 | ✓ |
| `timer.calm (mutedViolet)` `#6f6f74` | `bg (inkNight)` `#0b0b10` | 3.93 | ⚠ |
| `timer.warn (turnYellow)` `#a4a4a9` | `bg (inkNight)` `#0b0b10` | 7.91 | ✓ |
| `timer.urgent (bluffPink)` `#FFFFFF` | `bg (inkNight)` `#0b0b10` | 19.63 | ✓ |

DESIGN.md §9 floor: contrast ≥ 4.5:1 on **every theme background** — snapshot-test all three.

## Theme background layers (overrides only — DESIGN.md §3)

| Theme | Layer | Value |
|---|---|---|
| salongen | `boardBase` | `#515156` |
| salongen | `boardAlt` | `#5d5d62` |
| salongen | `rail` | `#2c2c31` |
| fjellet | `sky` | `#505055` |
| fjellet | `skyLow` | `#68686d` |
| fjellet | `forest` | `#78787d` |
| fjellet | `forestLow` | `#87878c` |
| fjellet | `snow` | `#ececf1` |
| fjellet | `snowPeak` | `#FFFFFF` |
| fjellet | `rail` | `#65656a` |
| verdensrommet | `space` | `#0f0f14` |
| verdensrommet | `starBright` | `#FFFFFF66` |
| verdensrommet | `starDim` | `#FFFFFF33` |
| verdensrommet | `rail` | `#222227` |

Identical space geometry and pawn physics across themes; only layers, sprites, particles, and sounds differ.

## Type

Display: **Fredoka** (weights 600/700, OFL, bundled — license row in ASSETS.md before the file enters the project). Fallback: SF Pro Rounded (ui-rounded).
Body/UI: **SF Pro** — System font, Dynamic Type throughout — never bundled (DESIGN.md §2 Type).

| Role | Size (pt) | Weight | Tracking | Notes |
|---|---|---|---|---|
| `cardWord` | 52 | 700 | -0.5 pt | CSS: `clamp(38px, 11vw, 52px)`; The hero. Scale toward 52 pt, slightly tight tracking (demo .word) |
| `h1` | 38 | 700 | -0.4 pt | CSS: `clamp(30px, 8.5vw, 38px)` |
| `h2` | 22 | 600 | -0.2 pt |  |
| `body` | 17 | 400 | — | SF Pro, Dynamic Type |
| `sub` | 15 | — | — |  |
| `eyebrow` | 12 | 700 | +0.14em | uppercase; Section labels like 'ORDET ER' — quiet structure without headers |

## Radius & shadow

| Token | Value |
|---|---|
| `radius.card` | 22 pt |
| `radius.button` | 16 pt |
| `radius.chip` | 999 pt |
| `shadow.hardOffset` | x 4 / y 5 / blur 0 / `rgba(10,10,24,0.45)` |
| `shadow.press` | translate 4 pt down, shadow compresses to 1 pt |

> Mechanical press (DESIGN.md §2): button carries a colored under-shadow; on press it translates 4 pt down and the shadow compresses to 1 pt (demo .btn:active). Never soft material shadows.

## Motion — durations

Unit: ms. Reduced Motion (DESIGN.md §9): hops → slides, pops/bobs → crossfades, nose growth → crossfade to final length, drifting stars → static. Demo disables all animation/transition under prefers-reduced-motion.

| Token | ms |
|---|---|
| `buttonPress` | 80 |
| `chipFlip` | 300 |
| `optionStaggerGap` | 70 |
| `optionRise` | 400 |
| `revealPop` | 500 |
| `noseGrow` | 500 |
| `pawnHop` | 350 |
| `pawnHopCadence` | 330 |
| `fadeIn` | 350 |
| `voteOpenDelay` | 1200 |
| `botRevealBeat` | 1700 |
| `revealToBoard` | 1600 |
| `armedPulse` | 1400 |
| `thinkPulse` | 1200 |
| `timerTick` | 250 |
| `timerBarGlide` | 1000 |
| `timerUrgentPulse` | 700 |
| `bobLoop` | 2400 |
| `goalPulse` | 2000 |
| `confettiFallMin` | 2000 |
| `confettiFallMax` | 4000 |
| `gmChuckleMax` | 800 |
| `oneShotMax` | 1500 |
| `boardPhaseCap` | 20000 |
| `overtakeWobble` | 420 |
| `countUp` | 280 |
| `screenIn` | 240 |
| `sirenHalfCycle` | 330 |

## Motion — springs

Apple SwiftUI springs: .spring(duration:bounce:). CSS approximation emitted by the generator: cubic-bezier(0.34, 1 + 1.5×bounce, 0.64, 1) — matches the frozen demo beziers (bounce 0.40 → (.34,1.6,.64,1) pop; 0.37 → (.34,1.56,.64,1) nose; 0.27 → (.34,1.4,.64,1) pawn).

Reduced Motion: Every spring here has a Reduced Motion fallback: crossfade (pops, bobs, nose) or linear slide (pawn hops). Loops (bobIdle, goalPulse, gmStealPulse tint) become static.

| Spring | Duration (s) | Bounce | CSS ease approx. | Extras | Note |
|---|---|---|---|---|---|
| `buttonPress` | 0.08 | 0 | `cubic-bezier(0.34, 1, 0.64, 1)` | — | Mechanical press: translateY 4pt down, shadow 5→1pt (demo .btn transition .08s) |
| `chipFlip` | 0.3 | 0.15 | `cubic-bezier(0.34, 1.225, 0.64, 1)` | — | Tick-in chip flips rotateX 360° to 'klar ✓' with a snap + .light haptic (demo .pchip transition .3s) |
| `optionStagger` | 0.4 | 0 | `cubic-bezier(0.34, 1, 0.64, 1)` | gap 70 ms, rise 10 pt | Vote options stagger in ~70 ms apart, rising 10 pt (demo .stagger rise .4s, animation-delay i*70ms) |
| `revealPop` | 0.5 | 0.4 | `cubic-bezier(0.34, 1.6, 0.64, 1)` | scale 0.85→1, -1.5° un-rotate | Newest reveal card pops: scale .85→1 with −1.5° un-rotate (demo @keyframes pop, .5s cubic-bezier(.34,1.6,.64,1)) |
| `noseGrow` | 0.5 | 0.37 | `cubic-bezier(0.34, 1.555, 0.64, 1)` | — | One springy notch per vote collected, rising boing pitch per notch (demo .nose width .5s cubic-bezier(.34,1.56,.64,1)) |
| `pawnHop` | 0.35 | 0.27 | `cubic-bezier(0.34, 1.405, 0.64, 1)` | — | One space per hop, interpolatingSpring ~0.35 s/hop + .soft haptic + theme hop sound (DESIGN §5); demo: .3s cubic-bezier(.34,1.4,.64,1) on a 330 ms cadence. Compresses under the 20 s board cap |
| `truthReveal` | 0.5 | 0.2 | `cubic-bezier(0.34, 1.3, 0.64, 1)` | scale 1.06→1 | Dim → truth card settles scale 1.06→1.0, truthGreen glow + shadow, confetti, .success haptic (DESIGN §7) |
| `gmStealPulse` | 0.6 | 0 | `cubic-bezier(0.34, 1, 0.64, 1)` | — | Screen tint pulses gmViolet + sting + .heavy haptic; chuckle ≤ 0.8 s (DESIGN §5/§7; demo sting ≈0.65 s) |
| `bobIdle` | 2.4 | 0 | `cubic-bezier(0.34, 1, 0.64, 1)` | ±7 pt, loops | Waiting face bobs gently ±7 pt with −1°/+1.5° tilt, 2.4 s loop (demo .bob) |
| `goalPulse` | 2 | 0 | `cubic-bezier(0.34, 1, 0.64, 1)` | loops | Goal space pulses a slow gold ring, 2 s, until claimed — all themes inherit (demo @keyframes goalglow) |
| `tallyPop` | 0.28 | 0.35 | `cubic-bezier(0.34, 1.525, 0.64, 1)` | — | Vote tally dot lands with a soft pop (DESIGN §7 'anonymous dots land per option with soft pops') |

## Sound grammar

All audio ducks under, never over, the room. One-shots ≤ 1.5 s. CC0/OFL only, logged in Resources/Audio/CREDITS.md + ASSETS.md. UI triggers events by NAME only (LANES.md seam 4); lane C promotes files from AssetsIncoming/ into Resources/Audio/. 'TODO:original' = no Kenney match yet, needs an original recording.

| Event | File | Status |
|---|---|---|
| `voteCast` | `AssetsIncoming/casino-audio/Audio/card-slide-1.ogg` — DESIGN §7: vote cast = card-slide + .light | ✓ Kenney CC0 |
| `cardDraw` | `AssetsIncoming/casino-audio/Audio/cards-pack-take-out-1.ogg` | ✓ Kenney CC0 |
| `cardShuffle` | `AssetsIncoming/casino-audio/Audio/card-shuffle.ogg` — DESIGN §7: vote opens = card-shuffle.ogg on every device | ✓ Kenney CC0 |
| `tickIn` | `AssetsIncoming/casino-audio/Audio/chips-collide-1.ogg` — DESIGN §7: chip flip + chips-collide (Kenney casino-audio) + .light | ✓ Kenney CC0 |
| `tallyPop` | `AssetsIncoming/interface-sounds/Audio/drop_001.ogg` | ✓ Kenney CC0 |
| `pawnHop` | `AssetsIncoming/casino-audio/Audio/chip-lay-1.ogg` — Salongen wooden tap default; Fjellet boot crunch + Verdensrommet thruster pop have no Kenney match (DESIGN §3 hop sounds) | ✓ Kenney CC0 |
| `pawnHopFjellet` | `TODO:original` | 🔴 needs original |
| `pawnHopVerdensrommet` | `TODO:original` | 🔴 needs original |
| `error` | `AssetsIncoming/interface-sounds/Audio/error_001.ogg` | ✓ Kenney CC0 |
| `toggle` | `AssetsIncoming/interface-sounds/Audio/toggle_001.ogg` | ✓ Kenney CC0 |
| `back` | `AssetsIncoming/interface-sounds/Audio/back_001.ogg` | ✓ Kenney CC0 |
| `confirm` | `AssetsIncoming/interface-sounds/Audio/confirmation_001.ogg` | ✓ Kenney CC0 |
| `buttonTap` | `AssetsIncoming/interface-sounds/Audio/click_001.ogg` | ✓ Kenney CC0 |
| `select` | `AssetsIncoming/interface-sounds/Audio/select_001.ogg` | ✓ Kenney CC0 |
| `noseBoing` | `TODO:original` — Rising boing pitch per nose notch — demo synthesizes it; needs an original one-shot | 🔴 needs original |
| `truthChime` | `TODO:original` | 🔴 needs original |
| `fanfare` | `TODO:original` | 🔴 needs original |
| `gmSting` | `TODO:original` — Violet sting for GM steal / new-GM fanfare tail; chuckle tasteful, ≤ 0.8 s | 🔴 needs original |
| `chuckle` | `TODO:original` | 🔴 needs original |
| `overtakeWobble` | `TODO:original` | 🔴 needs original |
