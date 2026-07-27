# DESIGN.md v3 — Snifferoo design system

**Subject:** a living-room quiz-show where one player runs the stage and everyone else lies for points, progress told by pawns on a board.
**Job:** legible across a table, delicious to lie in, and a board that makes every point *felt*.
**Boldness budget, spent in two places:** the **Nose** (per-round drama) and the **Board** (per-game drama). Everything else stays quiet.
**Living reference:** `Reference/cocky-monk-demo.html` implements this system — when a spacing, timing, or color question is ambiguous below, open the demo; its behavior is canonical.

## 1. Principles
1. **The table is the screen.** Arm's-length legibility; the GM phone doubles as a little stage.
2. **Color means something.** Truth = green, bluff = pink, your-move = yellow, **GM = violet**. Icons always back color up.
3. **Pieces, not pixels.** Every surface behaves like a physical game component — hard shadows, mechanical presses, paper texture.
4. **Two stages per round:** the Reveal (who lied to whom) then the Board (what it cost). Never merge them.
5. **Themes change clothes, never rules.** All three boards share one geometry, one physics of hopping, one sound grammar.

## 2. Tokens

### Color (themes may override background layers only)

**Amended 2026-07-28** (DESIGN-DIRECTION.md §7): palette entries are named by **role, never by hue**.
A token called `bluffPink` leaks a hue into every file that names it, which is what pins a palette in
place — so the values below can now be repainted without touching a single call site. The values
themselves are unchanged by that rename; the repaint is a separate, later change.

| Token | Hex | Use |
|---|---|---|
| `backdrop` | `#1B1B2E` | App background base |
| `sheet` | `#FFF6E8` | Cards, sheets — the reading surface |
| `ink` | `#23233B` | Text and borders on `sheet` |
| `inkInverse` | `#F4EFE4` | Text on `backdrop` |
| `confirmed` | `#3BD489` | Truth reveal, correct vote |
| `alert` | `#FF5C97` | Bluff unmasking, bluff points, the Nose, urgent clock |
| `action` | `#FFC53D` | Primary CTA, active player, goal |
| `private` | `#9B6DFF` | Everything game-master: dashboard chrome, GM chip, decoys, the secret card |
| `quiet` | `#8A87B8` | Secondary text, dividers, eyebrows, pending, board path |

Consumers name the **semantic** layer (`--color-surface`, `--color-accent-truth`,
`--color-status-pending`, `--color-board-goal`), never the palette. `DESIGN-DIRECTION.md` §7 lists its
categories as examples and leaves values open, so established semantic names are kept where they
already read as roles — what changed is that none of them is named after a colour any more.

8 player identity colours (`player.one`…`player.eight`): a fixed palette readable on both `backdrop`
and `sheet`, contrast ≥ 4.5:1. **Identity must survive without hue** (§9 and DESIGN-DIRECTION.md §7)
— the name and marker always carry it too, so colour is never the only signal.

### Type
| Role | Face | Notes |
|---|---|---|
| Display (card words, headings, scores, letter chips) | **Fredoka** SemiBold/Bold — OFL, bundled, license row in ASSETS.md; SF Rounded fallback | Card words are the hero: scale toward 52 pt, slightly tight tracking |
| Body / UI | SF Pro | Dynamic Type throughout |
| Eyebrows (section labels like "ORDET ER") | Fredoka 12 pt, uppercase, +0.14 em tracking, mutedViolet | Quiet structure without headers |

### Surface language — "pieces on a table"
- **Hard offset shadows** (≈4 pt x / 5 pt y, near-black, no blur) on cards, options, buttons. Never soft material shadows.
- **Mechanical press:** buttons carry a colored under-shadow; on press the button translates 4 pt down and the shadow compresses to 1 pt.
- **Paper grain:** cards get a faint 1-pt horizontal line texture at ~2% ink. The secret-truth card is **dashed-border "classified"** in gmViolet with no grain.
- **Layered background:** violet glow top-right + pink glow bottom-left + faint dot grid over `inkNight`. Never a flat fill.
- Shapes: 22 pt card radius, 16 pt buttons, capsule chips; 2.5 pt ink borders everywhere. Nothing sharp.
- **Iconography:** functional emoji only (👑 leader crown, theme landmark marks). Everything decorative is *drawn* — the logo, the mode-select phone icons. Never emoji in the brand line.

## 3. The three boards
One `BoardLayout` (a winding serpentine of *target* spaces, Start → Mål) rendered by three `BoardTheme`s. Raw sprite material: Kenney CC0 packs in `AssetsIncoming/` (see ASSETS.md) — recolor and curate; never ship raw defaults.

| | **Salongen** (default) | **Fjellet** | **Verdensrommet** |
|---|---|---|---|
| Fantasy | Classic wooden parlor game, Sunday at bestemor's | Norwegian mountain hike to the summit | Rocket race to the moon |
| Background | Warm wood grain, soft lamp vignette | Layered paper-cut mountains; weather shifts as you climb | Deep space `#0D0D1F`, drifting stars (slow parallax; Reduced Motion: static) |
| Track spaces | Inlaid wooden discs | Stone cairns / trail dots | Glowing orbit rings on dark discs |
| Pawns | Classic pieces (`boardgame-pack/PNG/Pieces (*)`) recolored to avatar palette | Tiny backpacker meeples (piece + knapsack accent) | Mini rockets, exhaust puff per hop |
| ⅓ / ⅔ landmarks | Coffee table / grandfather clock chime | Tregrensa (treeline) / Snøgrensa (pawns get a knit cap) | Satellite flyby / asteroid belt |
| Mål moment | Trophy on doily + confetti | Summit flag planted + wind gust | Moon landing + flag + slow-mo dust |
| Hop sound | Wooden tap | Boot crunch | Soft thruster pop |
| Palette accents | Warm browns + `turnYellow` | Greens/greys + snow white | Indigo + `gmViolet` glow |
| Extra | — | — | Goal space pulses a slow gold ring (2 s) until claimed — all themes inherit this |

Rules: identical space geometry and pawn physics; only layers, sprites, particles, and sounds differ. A theme is one config struct + assets — a 4th theme must be a one-file job.

## 4. Signature 1: **Nesen** — the mark and the mechanic
**The logo** (SVG in the reference demo): a round paper face, two dot eyes, a sly open smile, and a long pink ink-outlined nose reaching right. This IS the app icon (face on `turnYellow`), the top-bar brand, the loader, and every empty state — Snifferoo personified without a word.

**In play:** the nose grows one springy notch per vote a lie collected (rising "boing" pitch per notch). GM decoys grow a **violet** nose — the room learns to fear it. The game's best liar takes the **Gullnese** badge on the winner screen, separate from winning on points, so there are two things to brag about. Reduced Motion: crossfade to final length.

**Mark geometry** *(amended 2026-07-27 — was unspecified, which let the drawing drift)*. One drawing serves the logo and every avatar, so it is pinned here rather than left to each implementation:

| | |
|---|---|
| Head | Bevelled cream disc — outer `#E8D5AE` ring, inner `#FFF6E8` face, `2.8`-unit `inkText` outline on a 32-unit head. Hard offset shadow, no blur. |
| Eyes | Two dots at 35% height, 26% in from each side. |
| Brows | Flat, short, high (20% height, 18% wide, ±8°). Long or steep reads as angry, not sly. |
| Smirk | A single tilted arc (−9°), lower-left of centre. Never a symmetric smile, and never an upward hook — it tangles with the nose's cap. |
| Nose | A **full capsule lying across** the face at 43% height, `bluffPink`, ink-outlined, jutting ~50% of a head-width past the rim. Not a half-capsule bolted to the edge: that reads as a spout. |

**Data vs decoration.** The same drawing has two jobs and they must stay visibly separate. A nose marked *decorative* (logo, mascots, app icon) is a fixed length. A nose that **reports a vote count** is `0.5 + 0.33 × notch` head-widths and must be exact — a decorative nose on a reporting face would be a lie about the score. Every feature dimension is a ratio of one size property so proportions hold from 34 px to 512 px, and the ink outline is an inset ring rather than a border (a border shrinks the padding box and silently drifts every child percentage). The app icon is `Lab/icon.svg`, rastered by `node Tools/make-icons.mjs`.

## 5. Signature 2: the Board ceremony
- Pawns hop **one space at a time** (interpolatingSpring ~0.35 s/hop, `.soft` haptic + theme hop-sound per space). Multiple earners animate in submission order, never simultaneously — the room watches each fortune change.
- Camera gently follows the active pawn; the leader wears a subtle crown.
- Overtake: the passed pawn does a tiny indignant wobble.
- GM steal (+2 nobody-found-it): GM pawn hops with the violet sting and a dark little chuckle (tasteful, ≤ 0.8 s).
- Board phase hard cap 20 s (PRD §11) — hop timing compresses automatically on big rounds.

## 6. GM Dashboard — the quiz-show desk
Top→bottom: eyebrow + card word (display type) · the truth on the dashed gmViolet "classified" card, **hold-to-peek** (blurred until pressed, so shoulder-surfers see nothing) · decoy composer (0–2 one-liners) · **tick-in row**: one chip per bluffer, "tenker…" pulsing until it flips with a snap + `.light` haptic to "klar ✓" as each submission lands (in practice/party these arrive live on real delays) · the **Åpne avstemning** button: full-width `turnYellow`, dim until all lies are in, then arms with a slow pulse. Pressing it fires the card-shuffle sound on every device. During voting the dashboard becomes a live anonymous tally.

## 7. Motion & sound grammar
| Moment | Treatment |
|---|---|
| New GM announced | Violet sash sweep, short fanfare, GM face bobbing with its smirk + violet nose |
| Tick-in | Chip flip + `chips-collide` (Kenney casino-audio) + `.light` |
| Vote opens | `card-shuffle.ogg` everywhere; options **stagger in** ~70 ms apart, rising 10 pt |
| Vote cast | `card-slide` + `.light` |
| Tally | Anonymous dots land per option with soft pops; "n/total inne" counts up |
| Reveal card entrance | Newest card **pops** (scale .85→1 with −1.5° un-rotate, spring); nose grows with boing ×votes |
| Truth reveal | Dim → truth card scales 1.06→1.0, `truthGreen` glow + shadow, confetti, `.success` |
| GM steal | Screen tint pulses `gmViolet`, sting, `.heavy` |
| Reveal pacing | Human GM taps each beat; a bot GM (practice mode) auto-paces at ~1.7 s/beat with a tap-to-skip button |
| Waiting room | Your face **bobs** gently (±7 pt, 2.4 s loop) wearing its smile; bot/player chips pulse "tenker…". No music by default |
| Goal space | Slow gold pulse ring (2 s) until claimed |
All audio ducks under, never over, the room. One-shots ≤ 1.5 s. Sources CC0 or OFL only, logged in `Resources/Audio/CREDITS.md` / ASSETS.md.

## 8. Voice
Playful conspirator, sentence case, never childish, never mean. The app is in on the joke; the *players* are the funny ones. Both languages written natively — translate *the joke*, never the words.

| Moment | nb | en |
|---|---|---|
| GM round start | "{navn} er spillmester. Frykt nesen." | "{name} is game master. Fear the nose." |
| Bluff entry | "Din tur til å dikte." | "Your turn to invent." |
| Empty bluff | "Selv en dårlig løgn er bedre enn ingen." | "Even a bad lie beats no lie." |
| Tick-in done | "Alle løgnene er inne." | "All lies accounted for." |
| Open vote | "Åpne avstemning" | "Open the vote" |
| GM steal | "Ingen fant sannheten. Spillmesteren håver inn!" | "Nobody found the truth. The game master cashes in!" |
| Overtake | "{navn} snek seg forbi!" | "{name} sneaks ahead!" |
| Winner | "{navn} vant! Resten av dere: godt forsøk." | "{name} wins! The rest of you: nice try." |

Rules: max one exclamation mark per screen. Buttons say what they do ("Neste runde", never "OK"). Errors explain and point forward, never apologize.

## 9. Accessibility floor (non-negotiable)
Dynamic Type through XL without truncation · VoiceOver labels everything, including board state ("Anne hopper to felt, leder på felt 9") and live tick-ins ("Kåre er klar") · contrast ≥ 4.5:1 on every theme background (snapshot-test all three) · Reduced Motion: hops → slides, pops/bobs → crossfades · nothing conveyed by color alone · GM dashboard fully operable with Switch Control · waiting states never strand VoiceOver users silently.
