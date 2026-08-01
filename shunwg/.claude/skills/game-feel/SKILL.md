---
name: game-feel
description: The house discipline for how Snifferoo feels to touch — game-state motion, input response, haptics, sound pairing, and pacing. Use when adding or tuning any animation, transition, press state, haptic, timer, reveal beat or board hop; when someone says "make it feel better", "juicier", "snappier", "more satisfying", "too slow", "too floaty", "cheap", or "unfinished"; when auditing polish before a playtest; or when deciding whether an effect is allowed to exist. Not for Lottie celebration overlays — that is motion-designer.
---

# Game Feel

Derived from *Game Feel: A Game Designer's Guide to Virtual Sensation*, Steve Swink (Morgan Kaufmann, 2009), chapter 1 — plus what a 2026 audit of this repo and of Edvard's Ordkrig actually found. Swink's framework is paraphrased here; read the book for the argument.

**What this skill owns:** game-state motion (pawn hops, nose growth, card pops, chip flips, screen entrances), input response, haptics, the pairing of sound to event, and pacing.
**What it does not own:** Lottie celebration overlays — confetti, Gullnese, GM-steal sting, Mål landmarks. That is `motion-designer`, and it says so itself. If the request is a celebration asset, stop and go there.

---

## Where this game sits

Swink's definition of game feel has three building blocks: real-time control, simulated space, and polish. Their overlaps make seven regions. Run our own game through the test:

| Building block | Snifferoo |
|---|---|
| **Real-time control** | Almost none. Turn-based discrete taps. Three exceptions, listed below. |
| **Simulated space** | None. The board *depicts* space; nobody steers through it. |
| **Polish** | Extensive. |

We are in **region 7 — "naked polish"**. Swink's own examples there are Bejeweled and Civilization 4. He is explicit that this is a classification, not a verdict: naked polish still produces real feel, it just produces it *entirely* through polish.

Two consequences. Take both as settled; do not re-litigate them per task.

1. **The book's tuning chapters do not apply to us.** Chapters 6–7 (input metrics, response metrics, acceleration curves, response gain, ADSR on control) describe continuously steering an avatar. We have no avatar. Any plan that opens "tune the acceleration" or "adjust the response curve" is aimed at a game we are not making. Do not spend effort there.
2. **Polish is our only lever, so it carries the whole load.** Swink's most useful observation for us is that players cannot tell simulation from polish — the two are perceptually indistinguishable. In a game with *no* simulation, that means polish **is** the physics, as far as anyone playing can tell. Which makes principle 2 below the most important rule in this file.

### Our three real-time moments

These are the only places a player has continuous control, so they carry feel weight far beyond their screen area:

| Moment | Where |
|---|---|
| Hold to see the secret truth | `SCREENS.GM_DASH`, pointer-down/up/leave in `Lab/js/ui.js` |
| Typing a lie against the clock | `SCREENS.BLUFF` textarea |
| The GM's **Åpne avstemning** press | `gmOpensVote()` — PRD §11 calls this out as the moment the room must react to |

---

## Principles

**1. Know the region.** Spend on polish, sound, haptics and pacing. Do not spend on avatar-control metrics for a game with no avatar.

**2. Polish is the only physics the player perceives — so it must never lie.** Before adding any effect, answer in one sentence: *what does this claim about game state?* Then classify it:

- **Reporting** — the value is data. It must be exact, and it must be legible at a glance.
- **Decorative** — it claims nothing. It must not be mistakable for anything that reports.

The Nose is the worked example and the pattern to copy. `.nose.brand` is a fixed length on mascots and the logo: decoration. A nose on the `--notch` scale is `width: calc(var(--fs) * (.5 + .33 * var(--notch)))` — one linear notch per vote received, in `Lab/css/components.css`. Same drawing, two jobs, and the class name is what keeps them apart. An effect you cannot classify is an effect you have not finished designing.

**3. Find the real-time moments and defend them.** In the three moments above: no added latency, no modal interruption, and no re-render that can eat live input. Two existing rules are game-feel rules, not incidental bug fixes — treat them as load-bearing:

- `ckPaint()` writes `--p`, a numeral and a class, and **never calls `render()`**. `shell()` replaces `app.innerHTML` wholesale, so a clock that re-rendered would destroy the bluff textarea four times a second.
- `U.draftBluff` mirrors the textarea on every `input`, so an arriving broadcast or a bot tick-in can never eat a half-written lie.

Anything new that repaints during a timed phase must be surgical in the same way. `refreshGmAction()` and `botTickUI()` are the other two examples to imitate.

**4. Every beat gets the full triad — visual, audio, haptic.** Two of three reads as cheap; one of three reads as broken. `DesignSystem/tokens.json` already names the haptic on each spring (`chipFlip` → light, `pawnHop` → soft, `truthReveal` → success, `gmStealPulse` → heavy). The implementation must match the token, not approximate it. Where a platform cannot deliver one leg, the other two get **stronger** — never all three weaker. `Lab/js/haptics.js` is the only file that may touch the vibration API, and it degrades per-intent so semantic weight survives.

**5. A beat has three phases: anticipation, impact, follow-through.** A single duration is not a beat. Swink's De Blob case is the proof: adding squash-and-stretch changed how the game's *physics* felt with zero change to the physics. Our pawn hop is the one place we already do this — rise 16 px, stretch 0.92×1.12 at apex, squash 1.08×0.92 on landing, in `animateBoard()`. Anything that merely *appears* has skipped its beat.

**6. Latency is the one hard metric we do have.** Turn-based or not, the tap is real-time. Visible response within **100 ms of touch, always** — including online. Respond locally and reconcile after; the vote and bluff paths already do this, treating a client action as an intent the host re-judges. A spinner is not a response.

**7. Every position change glides.** From Ordkrig, and it is right: an instantaneous jump in a moving element reads as *blinking*, not as motion. If a value must change discontinuously (a mid-phase joiner's clock, a corrected score), glide to the true value over ~300 ms rather than snapping. And freeze a progress indicator during a screen transition — a bar that keeps moving while the screen swaps leaks the next phase.

**8. Half-close, never all-close.** Also from Ordkrig, generalised, and the subtlest rule here: when you camouflage one item among several, making *every* decoy similar to the target makes the target obvious — it becomes the one that isn't like the others. Mix close and random. This is why `Lab/js/fakepool.js` picks about half its fakes by closeness and the rest at random, and it applies to any set where one member is special.

**9. Feel is measured in the room, not on the screen.** PRD §11's bar is a *room* reaction: the Åpne avstemning press should make people look up, every round; someone should point and shout at least once a game; the round should land under 3 minutes and the board phase under 20 seconds. Those are feel metrics. A screen that photographs well and produces silence has failed. `playtest-panel` verdicts are evidence; your own taste at a desk is not.

**10. Reduced Motion and Dynamic Type XL are feel variants, not degradations.** A player on Reduced Motion still gets the beat — the crossfade lands, and sound plus haptics carry more of it. Never ship a variant that merely removes things. `reduceMotion()` in `Lab/js/lottie.js` is the gate; `base.css` kills animation wholesale under the media query, which is why anything relying on an entrance keyframe needs an explicit opacity rescue (see `.stagger`).

---

## Procedure

1. **Name the beat.** DESIGN.md §7 is the register of moments. If the beat is not there, add the row before writing code — an unnamed beat is how a screen ends up with four effects and no rhythm.
2. **Classify it** — reporting or decorative (principle 2). Write the claim down in the commit message.
3. **Specify the triad** — visual + audio + haptic, each named to an existing token. If a duration or spring is missing, add it to `DesignSystem/tokens.json` and regenerate; never hardcode a new number. The generated outputs (`Lab/css/tokens.css`, `Sources/DesignSystem/Theme.swift`, `DESIGN-TOKENS.md`) are never hand-edited.
4. **Build it surgically** if it lands during a timed phase (principle 3).
5. **Measure.** Tap-to-paint under 100 ms. Board ceremony under `boardPhaseCap`. Then *look at it on a phone at arm's length* — not in a desktop viewport at 100% zoom.
6. **Author the Reduced-Motion and Dynamic-Type-XL variants** in the same commit. Not later.
7. **Record it** — DESIGN.md §7 or `tokens.json`, plus a dated `Lab/DIVERGENCE.md` row if it deviates from the frozen demo, plus a re-snap via `node Tools/snap-screens.mjs NN`.

## Calibration

Before calling a beat done, ask in this order:

- Would a stranger know what just happened without reading any text?
- Does the effect claim something true?
- Is any leg of the triad missing?
- Does it still land under Reduced Motion, at Dynamic Type XL, and with the sound muted?
- Does it survive being fired five times in 1.5 seconds? (Pawn hops do exactly this.)

## Anti-patterns

- **An effect with no stated claim.** If you cannot say what it reports, you are decorating, and it must not resemble anything that reports.
- **Tuning a duration in a desktop viewport.** Every timing judgement is wrong until it has been watched on a phone, in a room, at arm's length.
- **Reaching for a particle system when the missing thing is a haptic.** Check the triad before adding a fourth visual layer.
- **Hardcoding a number that already exists as a token** — or worse, hardcoding the *same* number a token holds, so the two silently drift.
- **Treating dead vertical space as neutral.** On a 932 px phone, 400 px of empty background is a composition decision you did not make on purpose.
- **A "3D" or "shader" answer to a flat card game.** We have no shader stage. CSS filters, masks and blend modes are not shaders; the two `reference-*` skills in this repo exist to be *not* used here.
- **Adding a beat to a phase that already has three.** Reveal is a sequence, not a chord — Ordkrig stages seven channels over 7.6 s with nothing simultaneous, and that is why it reads as ceremony.
- **Shipping the Reduced-Motion path as "animations off".** That is a bug wearing an accessibility label.

## Reading

- Swink, *Game Feel* (2009), ch. 1 — the three building blocks, the seven regions, and the five experiences of game feel. Local extract: `2-game-feel.pdf` (front matter + ch. 1; `pdftotext -layout` works on this box, `pdftoppm` is not installed).
- `DESIGN.md` §7 — the motion and sound grammar, per moment. §4 the Nose, §5 the Board ceremony, §9 the accessibility floor.
- `PRD.md` §10 immersion bar and haptic levels; §11 the four room-level success criteria.
- `DesignSystem/tokens.json` → `motion` — 28 durations, 12 springs, each with a note naming its moment and its haptic. This is the vocabulary; use it.
