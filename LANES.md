# LANES.md — 3-person parallel work, without stepping on each other

Three lanes, three owners, one rule: **you may read anything, you write only in your lane.**
Cross-lane changes (e.g. UI needs a new engine event, content needs a new schema field) go through `/director` — it stages the change, runs the gates, and both owners sign the commit.

## The matrix

| Lane | Owner writes | Reads | Standalone test (Windows) | QA gate before handoff |
|---|---|---|---|---|
| **A — Engine & Transport** | `Sources/Engine/`, `Sources/Transport/`, `Lab/js/engine.js`, `Lab/js/engine.test.mjs`, `Tools/engine-vectors.json`, `Tests/` | `DesignSystem/tokens.json` (read-only) | `node --test Lab/js/engine.test.mjs` · (`swift test` once Track W or Mac exists) | All vectors green + `swift-reviewer` agent on any `Sources/Engine` diff |
| **B — UI, Board, Themes & Motion** | `Lab/` (except `js/engine.js` + its test), `Sources/Views/`, `Sources/Themes/`, `Sources/DesignSystem/` (generated), `Resources/Lottie/`, `DesignSystem/tokens.json` (via `/director` only) | `Lab/js/engine.js` API, decks | `node Tools/serve-lab.mjs` → play a round in the browser; screenshot review vs DESIGN.md | design-review checklist + `playtest-panel` verdict |
| **C — Content, Audio & Assets** | `Resources/deck_nb.json`, `deck_en.json`, `fakes_nb.json`, `fakes_en.json` (card-author skill only), `Content/`, `Resources/Audio/`, ASSETS.md ledger rows | `Resources/deck_nb.sample.json` schema | `node Tools/validate_deck.mjs --all` | Validator green + zero `VERIFY` notes at ship + ledger audit |

## Interface contracts (the seams between lanes)

1. **Engine API** (A → B): `Lab/js/engine.js` exports a pure state machine — `createGame(config)`, `dispatch(state, action) → state`, `selectors.*`. No DOM, no timers, no randomness without an injected `rng`. The SwiftUI `GameEngine` mirrors this shape 1:1. B renders state; B never computes scores.
2. **Tokens** (B ↔ everyone): `DesignSystem/tokens.json` → generated outputs. Nobody hand-edits generated files; `node Tools/tokens-build.mjs --check` fails the gate on drift.
3. **Deck schema** (C → A/B): `Resources/deck_nb.sample.json` is the contract. Schema changes are a `/director` event (A updates loaders, B updates card views, C migrates decks — one commit).
4. **Sound grammar** (C → B): event names in `tokens.json → sound.grammar` map to files C promotes into `Resources/Audio/`. B triggers events by name, never by filename.
5. **Bot tuning** (A): all constants in one block in `Lab/js/bots.js` (and later `Sources/Engine/BotTuning.swift`). Nobody inlines a magic number.

## Working rhythm
- Pull → run your lane's standalone test → work → run it again → commit with the PRD section in the message → hand off.
- If your change touches another lane's files, stop and run `/director` instead of editing.
- Merge conflicts in generated files: never resolve by hand — regenerate (`node Tools/tokens-build.mjs`).
