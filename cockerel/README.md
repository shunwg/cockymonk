# Cockerel

A daily, solo-friendly spinoff of [Cocky Monk](../shunwg) — for the days your friends aren't around to play the physical game with you.

Once a day:
- **Write** a bluff definition for each of 3 new "words of the day."
- **Guess** the real definition among a handful of options for the **previous** day's 3 words — the options are other players' bluffs from yesterday (plus a bot-written one or two if too few people wrote that day).

Everything resets at UTC midnight. Missing a day is fine — streaks reward showing up again, they never punish a gap.

## Run it locally

```bash
npm install        # none yet, but keeps the lockfile honest as deps get added
npm run build-words   # import the latest word corpora from ../ordkrig as a new version (no-ops if unchanged)
npm run corpus        # list the versioned word lists on disk, and which one is live
npm test               # engine/scoring/rollover vectors + corpus validation
npm run serve          # → http://localhost:8788
```

There's also a native app (`app/`, Expo/React Native — iOS, Android, and web from one codebase) alongside this one, playing the same game against a separate staging backend. See `app/AGENTS.md` for setup and TestFlight steps.

## Where things come from

See the **Provenance** section in `CLAUDE.md` — the word lists, bot decoys, and the shape of the streak/points logic are ported from Ordkrig; the look (tokens, Fredoka font, the Nesen mark) is ported from Cocky Monk.

Word lists are **versioned** (`js/corpora/<lang>/<version>/`, active version chosen in `js/config.js`)
so they can be improved from playtest feedback and rolled back without disturbing days already played —
see **Versioned corpora** in `CLAUDE.md`. Definitions come from Bokmålsordboka (Norwegian, CC BY 4.0) and
WordNet 3.1 (English); both need credit in an About screen — see `ASSETS.md`.

## Game mechanics & scoring

All numbers below live in one place, `js/config.js` — treat this section as documentation of that file's intent, not a second source of truth. If they disagree, the code is right and this doc is stale.

### The daily loop

Each word has a two-day life: it's a **write** word the day it's issued, then a **guess** word the next day, once real (and, early on, bot) bluffs have sealed it into a multiple-choice round. You always have up to 3 write-words and up to 3 guess-words waiting each day, one at a time, each on its own timer (45s to guess, 120s to write — `js/config.js` `TIMERS`). Missing a day is fine — nothing is lost, you just pick up wherever the game is when you come back (see **Streak**, below, for why a gap costs you nothing).

### Guessing — the only way to lose points

Guessing is scored **once per day, by how many of your 3 guesses were correct** — not per word:

| Correct out of 3 | Points |
|---|---|
| 0 | **−15** |
| 1 | 0 |
| 2 | +30 |
| 3 | +75 |

This is the **only** way to lose points in the game. Writing bluffs can never cost you anything — a bluff nobody falls for just earns 0, never a penalty. And a penalty can never drag your total below **0**: if you have 6 points and lose a 0/3 day, you lose exactly 6, and the screen says −6, not −15 (see **Points total**, below — the number shown is always the number your total moved by).

The shape is deliberate:
- **0/3 is a real penalty**, not just "no reward" — guessing badly should actually cost something, or there'd be no reason to read carefully.
- **1/3 breaks even.** A single lucky guess (plausible from chance alone, especially early on with few options) shouldn't move your total either way.
- **2/3 and 3/3 are where the game starts rewarding you**, and 3/3 disproportionately so — climbing the leaderboard takes consistently strong days, not occasional luck.

New players should find it easy to hover in mildly-positive territory, but reaching the top requires regularly nailing 2–3 out of 3 — real skill, not volume.

### Writing — fooling other players

- Points for a bluff are **12 × √(number of people fooled)**, rounded. Fooling exactly 1 person earns 12 — real, but modest. Each additional person fooled is worth a little less than the last (fooling person #2 adds less than person #1 did), so there's no ceiling — a bluff that fools a genuine crowd of hundreds is a legitimately huge score — but a single lucky vote in a two-person game can never rival that. See `BLUFF-SCENARIOS.md` for worked examples of how this plays out for different skill levels as a game grows from a handful of friends to a large crowd.
- **+40 points** if what you wrote happens to (nearly) match the real definition — a "dobbeltreff," rewarded independent of whether anyone votes for it, since it never even appears as its own option (it's folded into the truth so it can't leak the answer by duplication).

### Hint

While guessing, a "Hint" button reveals how the votes cast so far for that word are split across the options — the same breakdown is shown again afterward in the score step's per-word review. The percentages shown are **capped and rounded, not raw**: since every guesser sees the same live tally, an uncapped percentage would let the correct answer's share snowball into an obvious tell as more people guess right over the course of the day. Any option's displayed share is capped (currently 45%), with the overflow spread proportionally across the rest and the result rounded to the nearest 5% — informative enough to be a real hint, never decisive enough to be a giveaway. Real scoring above always uses the true, uncapped share; the cap is cosmetic, display-only.

Your write-day points aren't known until the next day's guessers have all had a turn (see "Sist du skrev" recap) — unlike guessing, which you find out immediately.

### Streak

Your streak is simply **days you did anything — wrote, guessed, or both** — counted consecutively. It is decoupled from settlement timing on purpose: writing or guessing marks the streak instantly, even though your write-day points aren't known until the following day.

**A missed day breaks the streak but is never otherwise punished.** There's no penalty ladder for absence — the whole point of a daily-but-optional mode is that skipping a day should feel like "the streak resets," not "I got worse at the game."

**Streak bonus:** a percentage bonus on top of points you already earned that day — day 1 of a streak = +10%, day 2 = +20%, ..., capped at +70% from day 7 (a full week) onward. It **only ever amplifies a gain** — a bad day's penalty is never made worse by a long streak, so the bonus is purely upside, never a way to accidentally punish a rare bad day harder.

### Points total — one number, one arithmetic

**`total = total + today's points`.** You start at 0, and every day's result adds to (or, on a 0/3 day, subtracts from) one running total. That's the number in the header, and it is the *same* number the score screen shows a change in:

> Score screen: **+83** &nbsp;&nbsp;→&nbsp;&nbsp; Header: 1,088 → **1,171**

This replaced an average-based rating (`800 + sum ÷ days counted`), which was the source of a real, visible problem: the score screen would announce "+390" while the header moved +23, or even *downward* if that day happened to be below your lifetime average. Two numbers, both called points, that never agreed. There is now exactly one.

Two consequences worth knowing:
- **A day's shown points are always literally what you gained.** Where a penalty would take you below 0, the shown number is trimmed to match (see Guessing above) rather than the total silently clamping behind your back.
- **Playing often does help**, unlike under the average. That's the deliberate tradeoff — see `BLUFF-SCENARIOS.md`, which walks through what a novice/mediocre/pro player's totals actually look like over 30 days, including what replacing the average cost. The streak bonus already rewarded consistency; the total now does too.

Because the total is a sum, a settled day's write-points and guess-points can land a day apart (see below) without any of it being confusing: each one is its own "+N," and each moves the same total.

### Leaderboard rank

The header shows your rank among every **real** player, in that language. Tap the number to see the full ranking list. Bots are excluded — an honest "3rd of 4" beats an inflated "118th of 218."
