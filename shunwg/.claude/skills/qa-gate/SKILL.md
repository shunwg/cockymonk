---
name: qa-gate
description: Unified validator battery for Cocky Monk. Use before any commit, when the user says "qa", "gate", "check everything", "is this shippable", or as the game-director QA phase. Pass --ship for release gating.
---

# QA Gate

Run every check below, in order, and report **one** verdict table. Never report a subset; a check you couldn't run is a row, not an omission.

## The battery

| # | Check | Command / method |
|---|---|---|
| 1 | Deck validity | `node Tools/validate_deck.mjs --all` |
| 2 | Token drift | `node Tools/tokens-build.mjs --check` |
| 3 | Engine vectors | `node --test Lab/js/engine.test.mjs` |
| 4 | Trademark sweep | Grep the repo for the pattern `kokkelimonk[e]` (case-insensitive). Permitted files: `CLAUDE.md`, `PRD.md` only. Any other hit is a fail. |
| 5 | Asset ledger | ASSETS.md audit, **bidirectional**: every file in `Resources/Lottie/`, `Resources/Audio/`, and promoted assets has a ledger row; every ledger row's file exists on disk. |
| 6 | Lab divergence | `Lab/DIVERGENCE.md` is empty or every row has graduated (PRD/DESIGN amended). Ungraduated rows = fail. |
| 7 | Design review | design-review checklist against the numbered screens: `Lab/gallery.html` live (`node Tools/serve-lab.mjs`) and/or fresh `node Tools/snap-screens.mjs` PNGs in `Screens/png/`. No browser at all → row reads `SKIPPED (no browser)`. |
| 8 | Repo hygiene | `git status` clean, or every dirty file explained by the current task. |
| 9 | Rules-sheet drift | `node Tools/rules-sheet.mjs --check` — `Specs/SCORING.md` is generated; hand-edits or vectors missing a bokmål label fail. |
| 10 | Screen fixtures | `node --test Lab/js/fixtures.test.mjs` — the numbered-screen registry (Screens/SCREENS.md) must stay renderable and engine-shaped. |
| 11 | Online, clock & rating | `node --test Lab/js/online.test.mjs` — the segment-5 gate. Covers state projection (**the truth must never reach a non-GM seat**), deadline arithmetic, and the Elo math. |
| 12 | Bundle budget | `node Tools/build-standalone.mjs` prints the size and exits non-zero past **1.0 MB**. The standalone must stay double-clickable, offline, and small enough to send to a friend. |
| 13 | Bluff surface parity | `node Tools/check-fake-parity.mjs --check` — can a player who speaks no Norwegian win by reading option *shape*? Simulates the shipped selector on the real deck; the best surface-only strategy must stay under 40% on a 4-option lineup (chance is 25%). This was 87.2% before `Lab/js/fakepool.js` (PRD §9.1). |
| 14 | Game-feel conformance | `node Tools/check-game-feel.mjs --check` — the checkable half of the **game-feel** skill: per-tick paints stay `render()`-free, every haptic the tokens name is declared and fired, Reduced-Motion rescues exist for anything an animation reveals. Judgement rules (does the beat land? is the effect's claim true?) are **not** checkable — read the skill. |

## Verdict table format

| Check | Result | Evidence |
|---|---|---|
| Deck validity | PASS | 212 cards, 0 errors |
| Token drift | FAIL | generated css 2 tokens behind |

Result is PASS / FAIL / SKIPPED — evidence is a number, a filename, or an error line, never "looks fine".

## `--ship` mode (release gating)

Everything above, plus:

- `node Tools/validate_deck.mjs --ship` — blockers: **nb ≥ 150 cards · en ≥ 100 · fakes ≥ 40 per language · zero `VERIFY` notes**.
- Mac-only items (simulator playtest-loop, `swift test`, Dynamic Type XL screenshots, archive build) listed as `OPEN (needs Mac)` — they are not passes and not silent.

A `--ship` verdict with any FAIL or OPEN row is **not shippable**; say so in one line above the table.

## On failure — fix-first rule

1. Report the full table anyway (never stop at the first failure).
2. Fix the failing checks — respecting lane ownership: deck fixes via card-author, token fixes via `tokens.json` + rebuild, never hand-edit generated files.
3. Re-run the **whole** battery.
4. Max 2 fix loops. Still failing → stop, write down what you know, and discuss (CLAUDE.md when-stuck rule).
