# The Daily Cock

A daily, solo-friendly spinoff of [Cocky Monk](../shunwg) — for the days your friends aren't around to play the physical game with you.

Once a day:
- **Write** a bluff definition for each of 3 new "words of the day."
- **Guess** the real definition among a handful of options for the **previous** day's 3 words — the options are other players' bluffs from yesterday (plus a bot-written one or two if too few people wrote that day).

Everything resets at UTC midnight. Missing a day is fine — streaks reward showing up again, they never punish a gap.

## Run it locally

```bash
npm install        # none yet, but keeps the lockfile honest as deps get added
npm run build-words   # copy the latest word corpus from ../ordkrig
npm test               # engine/scoring/rollover vectors
npm run serve          # → http://localhost:8788
```

There's also a native app (`app/`, Expo/React Native — iOS, Android, and web from one codebase) alongside this one, playing the same game against a separate staging backend. See `app/AGENTS.md` for setup and TestFlight steps.

## Where things come from

See the **Provenance** section in `CLAUDE.md` — the word list, bot decoys, and rating formula are ported from Ordkrig; the look (tokens, Fredoka font, the Nesen mark) is ported from Cocky Monk.

## Game mechanics & scoring

All numbers below live in one place, `js/config.js` — treat this section as documentation of that file's intent, not a second source of truth. If they disagree, the code is right and this doc is stale.

### The daily loop

Each word has a two-day life: it's a **write** word the day it's issued, then a **guess** word the next day, once real (and, early on, bot) bluffs have sealed it into a multiple-choice round. You always have up to 3 write-words and up to 3 guess-words waiting each day, one at a time, each on its own timer (30s to guess, 60s to write). Missing a day is fine — nothing is lost, you just pick up wherever the game is when you come back (see **Streak**, below, for why a gap costs you nothing).

### Guessing — the only way to lose points

Guessing is scored **once per day, by how many of your 3 guesses were correct** — not per word:

| Correct out of 3 | Points |
|---|---|
| 0 | **−50** |
| 1 | 0 |
| 2 | +120 |
| 3 | +300 |

This is the **only** way to lose points in the game. Writing bluffs can never cost you anything — a bluff nobody falls for just earns 0, never a penalty.

The shape is deliberate:
- **0/3 is a real penalty**, not just "no reward" — guessing badly should actually cost something, or there'd be no reason to read carefully.
- **1/3 breaks even.** A single lucky guess (plausible from chance alone, especially early on with few options) shouldn't move your rating either way.
- **2/3 and 3/3 are where the game starts rewarding you**, and 3/3 disproportionately so — climbing the leaderboard takes consistently strong days, not occasional luck.

New players should find it easy to hover in mildly-positive territory (a typical day nets 0 to +120), but reaching the top requires regularly nailing 2–3 out of 3 — real skill, not volume.

### Writing — fooling other players

- Points for a bluff are **40 × √(number of people fooled)**, rounded. Fooling exactly 1 person earns 40 — real, but modest. Each additional person fooled is worth a little less than the last (fooling person #2 adds less than person #1 did), so there's no ceiling — a bluff that fools a genuine crowd of hundreds is a legitimately huge score — but a single lucky vote in a two-person game can never rival that. See `BLUFF-SCENARIOS.md` for worked examples of how this plays out for different skill levels as a game grows from a handful of friends to a large crowd.
- **+150 points** if what you wrote happens to (nearly) match the real definition — a "dobbeltreff," rewarded independent of whether anyone votes for it, since it never even appears as its own option (it's folded into the truth so it can't leak the answer by duplication).

### Hint

While guessing, a "Hint" button reveals how the votes cast so far for that word are split across the options — the same breakdown is shown again afterward in the score step's per-word review. The percentages shown are **capped and rounded, not raw**: since every guesser sees the same live tally, an uncapped percentage would let the correct answer's share snowball into an obvious tell as more people guess right over the course of the day. Any option's displayed share is capped (currently 45%), with the overflow spread proportionally across the rest and the result rounded to the nearest 5% — informative enough to be a real hint, never decisive enough to be a giveaway. Real scoring above always uses the true, uncapped share; the cap is cosmetic, display-only.

Your write-day points aren't known until the next day's guessers have all had a turn (see "Sist du skrev" recap) — unlike guessing, which you find out immediately.

### Streak

Your streak is simply **days you did anything — wrote, guessed, or both** — counted consecutively. It is decoupled from settlement timing on purpose: writing or guessing marks the streak instantly, even though your write-day points aren't known until the following day.

**A missed day breaks the streak but is never otherwise punished.** There's no penalty ladder for absence — the whole point of a daily-but-optional mode is that skipping a day should feel like "the streak resets," not "I got worse at the game."

**Streak bonus:** a percentage bonus on top of points you already earned that day — day 1 of a streak = +10%, day 2 = +20%, ..., capped at +70% from day 7 (a full week) onward. It **only ever amplifies a gain** — a bad day's penalty is never made worse by a long streak, so the bonus is purely upside, never a way to accidentally punish a rare bad day harder.

### Rating

`rating = 800 + average(day totals, across every day you've ever been credited points for)`. It's an **average, not a running sum**, so rating only moves by playing *well*, never simply by playing *often* — the same philosophy Ordkrig's rating carries, just without its "quit penalty" (see `CLAUDE.md`).

### Leaderboard rank

The header shows your rank among every real player plus a fixed pool of 200 imaginary competitors, generated once (normally distributed, mean 850, roughly between 550 and 1150) so a rank means something before the game has enough real players. The bot pool never changes after it's generated — your rank only moves because of your own (and real players') results, never because the bots reroll under you.
