# BLUFF-SCENARIOS.md — how bluff scoring and rating actually play out

This walks through three players — a novice, a mediocre player, and a pro — over 30 days, as the game itself grows from a handful of friends to a large crowd. All numbers below are generated directly from the real engine code (`js/engine.js`, `js/rating.js`, `js/config.js`), not hand-calculated, so they reflect exactly what the app will do.

## The two mechanisms that produce this shape

**1. Bluff points are `40 × √(people fooled)`, per word.** Fooling 1 person always earns 40. Fooling 25 earns 200. Fooling 400 earns 800. Each additional person fooled is worth a little less than the last, but there is no ceiling — a bluff that fools a real crowd keeps earning more, indefinitely.

**2. Rating is a lifetime average, not a running total: `rating = 800 + (sum of daily points) / (days counted)`.** This is what makes a new day's result matter *less* the more days you've already played — day 2 can swing your average by a lot, day 200 barely moves it. It's also exactly what lets a new player catch up to a veteran: your rating only ever averages *your own* days, so a skilled newcomer isn't handicapped by lacking the veteran's history.

Together, these two mechanisms are why the scenarios below all show the same shape: **rise quickly toward a level that reflects your actual skill, then flatten out, moving only a little from then on** — until something genuinely changes (the game grows, or your own play gets better or worse), at which point the average heads toward the *new* level, again quickly at first, then flattening again.

## Why not the earlier formulas

- **Flat rate per vote (the original idea):** a bluff earned a fixed number of points per person fooled, with no ceiling. The problem the earlier design conversation surfaced: as the *player base* grows, a popular word's total payout scales linearly and unboundedly, which can dwarf every other number in the game.
- **A fixed pool split by percentage (the first revision):** capped a word's total payout at a fixed pool, split by *share* of that word's guessers. This fixed the unbounded-scaling problem but broke down at small scale: fooling 1 out of 1 total guesser is a 100% share, which claimed the *entire* pool (500 points) for what could easily be a coin flip between two friends.
- **`40 × √(fooled count)` (current):** depends only on the *absolute* number of people fooled, never on what fraction of some total that is. Fooling 1 of 1 and fooling 1 of 300 both earn the same 40 points — fooling one person is fooling one person, regardless of how many others didn't see it. But fooling 100 people, out of however many, earns far more than fooling 1 — because that's a bigger, rarer feat, full stop.

## The three players

Illustrative assumptions used below (not measured — see `js/config.js` header for the "retune freely" rule):
- **Novice:** gets 1 of 3 guesses right most days (the guessing score's breakeven point). Writes weak bluffs that reliably fool about 1 person, regardless of how big the game gets — a bluff that isn't very convincing doesn't suddenly convince more people just because more people are looking at it.
- **Mediocre:** gets 2 of 3 right most days. Writes bluffs that fool roughly 15% of that word's guessers.
- **Pro:** gets 3 of 3 right most days. Writes genuinely convincing bluffs that fool roughly 35% of that word's guessers.

The game itself grows in three phases: a small friend group (3 guessers/word, days 1–10), a growing community (30 guessers/word, days 11–20), and a large, popular game (300 guessers/word, days 21–30).

### Novice

| Day | Guessers/word | Fooled/word | Guess pts | Bluff pts (3 words) | Streak bonus | That day's net | **Rating** |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 1 | 0 | 120 | +10% | 132 | 932 |
| 3 | 3 | 1 | 0 | 120 | +30% | 156 | 944 |
| 7 | 3 | 1 | 0 | 120 | +70% (cap) | 204 | 968 |
| 10 | 3 | 1 | 0 | 120 | +70% | 204 | 979 |
| 11 | 30 | 1 | 0 | 120 | +70% | 204 | 981 |
| 20 | 30 | 1 | 0 | 120 | +70% | 204 | 991 |
| 21 | 300 | 1 | 0 | 120 | +70% | 204 | 992 |
| 30 | 300 | 1 | 0 | 120 | +70% | 204 | 996 |

A novice's rating climbs from the 800 starting point to about **970–1000 and stays there** — the game growing around them barely matters, because a weak bluff doesn't get more convincing just because more people see it. Day-to-day movement shrinks fast: +6/day in the first week, roughly +1/day by day 20, under +0.5/day by day 30. This is the "quickly finds its level, then barely moves" behavior working as intended for a below-average player.

### Mediocre

| Day | Guessers/word | Fooled/word | Guess pts | Bluff pts (3 words) | Streak bonus | That day's net | **Rating** |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 0 | 120 | 0 | +10% | 132 | 932 |
| 7 | 3 | 0 | 120 | 0 | +70% | 204 | 968 |
| 10 | 3 | 0 | 120 | 0 | +70% | 204 | 979 |
| 11 | 30 | 5 | 120 | 267 | +70% | 658 | 1022 |
| 15 | 30 | 5 | 120 | 267 | +70% | 658 | 1139 |
| 20 | 30 | 5 | 120 | 267 | +70% | 658 | 1218 |
| 21 | 300 | 45 | 120 | 804 | +70% | 1571 | 1273 |
| 25 | 300 | 45 | 120 | 804 | +70% | 1571 | 1449 |
| 30 | 300 | 45 | 120 | 804 | +70% | 1571 | 1603 |

A mediocre player's rating **jumps every time the game itself grows** — a bigger audience means more real people to convince, which means a genuinely higher ceiling — but *within* each phase it still flattens out the same way (e.g. days 11→20 climb from 1022 to 1218, decelerating throughout). Nothing here required the formula to know the game got bigger; it falls straight out of "more people fooled → more points," applied fresh each day.

### Pro

| Day | Guessers/word | Fooled/word | Guess pts | Bluff pts (3 words) | Streak bonus | That day's net | **Rating** |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 1 | 300 | 120 | +10% | 462 | 1262 |
| 7 | 3 | 1 | 300 | 120 | +70% | 714 | 1388 |
| 10 | 3 | 1 | 300 | 120 | +70% | 714 | 1426 |
| 11 | 30 | 11 | 300 | 399 | +70% | 1188 | 1477 |
| 20 | 30 | 11 | 300 | 399 | +70% | 1188 | 1707 |
| 21 | 300 | 105 | 300 | 1230 | +70% | 2601 | 1788 |
| 25 | 300 | 105 | 300 | 1230 | +70% | 2601 | 2046 |
| 30 | 300 | 105 | 300 | 1230 | +70% | 2601 | 2272 |

The pro shows the same shape, at a higher level throughout — and benefits the *most* from the game growing, since a genuinely convincing bluff fools a much bigger absolute number of people once the audience is large (105/word once the game is popular, versus 1/word for the novice in the exact same crowd).

### Bonus: a new, equally-skilled player joins on day 21

This is the "new users that are good can catch up" case. Suppose a brand-new player joins on day 21, once the game is already large (300 guessers/word) — same skill as the "Pro" above (3/3 guesses, fools 35% of guessers), but with zero history.

| Day (of their own play) | That day's net | **Rating** | Veteran Pro's rating on the same calendar day |
|---|---|---|---|
| 21 (day 1 for them) | 1683 | 2483 | 1788 |
| 23 | 1989 | 2636 | 1928 |
| 25 | 2295 | 2789 | 2046 |
| 30 | 2601 | 3080 | 2272 |

The newcomer **overtakes the 20-day veteran within their very first day**, and the gap keeps widening. This isn't a bug or an oversight — it's the direct, intended consequence of rating being an average of *your own* days: the veteran's average still includes their early days in the small friend-group phase, when the game's ceiling was much lower — those days aren't wrong or penalized, they just genuinely happened under different conditions, and now count for proportionally less as more (better) days pile up on top of them. A new player who shows up once the game is thriving isn't dragged down by history they don't have.

## Summary

| | Small game (early) | Growing game | Large game | New skilled joiner |
|---|---|---|---|---|
| Novice | ~930 → ~980 | ~980 → ~990 | ~990 → ~1000 | — |
| Mediocre | ~930 → ~980 | ~1020 → ~1220 | ~1270 → ~1600 | — |
| Pro | ~1260 → ~1430 | ~1480 → ~1710 | ~1790 → ~2270 | reaches ~2480 on day 1, ~3080 by day 10 |

Every player's rating rises fast, flattens to a level that reflects their actual skill at the game's current scale, and only creeps upward slowly from there — until the game grows and gives everyone a new, higher ceiling to rise toward again. A newcomer with real skill needs no grace period or handicap adjustment to compete — their first few good days speak for themselves.
