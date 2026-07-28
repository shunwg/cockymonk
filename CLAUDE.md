# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo shape

This repository holds **three projects that share one git history**. Two (`ordkrig/`, `shunwg/`) are otherwise unrelated and share no code. The third (`the-daily-cock/`) is a deliberate spinoff that reuses pieces of both — see its row below. None share a build. Figure out which one you're in before doing anything, then **read that subproject's own `CLAUDE.md` first** — it is the authority for that tree, not this file.

| Dir | Project | Stack | Status |
|---|---|---|---|
| `ordkrig/` | **Ordkrig** — Norwegian word-bluffing game (Balderdash/Fibbage-style) | Expo/React Native (SDK 56), TypeScript, Supabase | Live app on TestFlight with real players |
| `shunwg/` | **Cocky Monk** — Norwegian game-master bluffing party game for iOS | SwiftUI/Swift 6 (planned) + a browser "Lab" port (vanilla JS/CSS, Node tooling) that is the actual daily-driver today | Pre-Mac-day: `Sources/` is scaffolding only (`.gitkeep`); real work happens in `shunwg/Lab/` |
| `the-daily-cock/` | **The Daily Cock** — async, Wordle-style daily spinoff of Cocky Monk: write bluffs for today's words, guess yesterday's | Vanilla JS/CSS + zero-dep Node server (file-backed mock backend) | Standalone app, no nav to the other two; see its own section below |

There is no root-level build, package manager, or test runner — `cd` into the relevant subproject first.

### One shared gotcha: the GitHub Pages workflow

`.github/workflows/pages.yml` deploys `shunwg`'s standalone build to GitHub Pages. **It must stay at the repo root** (`.github/workflows/`, not `shunwg/.github/workflows/`) — GitHub does not recurse into subfolders for workflows. This broke silently once already (see the comment header in the file); if the repo is restructured again, keep this file at the root.

---

## `ordkrig/` — Ordkrig

Norwegian word-bluffing game. Read `ordkrig/AGENTS.md` (linked from `ordkrig/CLAUDE.md`) and `ordkrig/docs/spilldesign.md` (full game spec) before making changes.

**Critical collaboration rule:** `ordkrig/` in this repo is a **mirror** of the maintainer's local git, which is master. Work in your own branch (e.g. `shun/idea-name`), never directly in `main` — changes get pulled back to master by the maintainer. Never run `eas update`/`eas build`/`eas submit` from here (TestFlight publishing is manual, from the maintainer's machine only). Never commit secrets (`.env`, `service_role` keys, `.p8` files) — the Supabase anon key already in code is intentionally public. Database/RPC changes under `supabase/` need to be agreed first since the app shares a **live** Supabase database with real TestFlight players.

### Commands
```bash
cd ordkrig
npm start              # expo start
npm run ios             # expo start --ios
npm run android         # expo start --android
npm run web              # expo start --web
npm run generate:data    # scripts/generate-data.js: src/data/words/no.csv -> src/data/generated/*.json
```
- Expo SDK is pinned to **56** (not 57).
- No test runner is configured in `package.json`.

### Architecture
- `src/config/` — **single source of truth** for all timing/scoring/rule values (`gameConfig.ts`) and username generation. Change game flow here, not scattered through the code.
- `src/game-engine/` — pure game logic, independent of online/local transport.
- `src/modes/online/` and `src/modes/local/` — mode-specific logic on top of the shared engine.
- `src/bots/` — `AnswerProvider` pattern for generating fake bot answers.
- `src/models/` — persisted entity models (e.g. `User`).
- `src/data/` — word lists; `src/data/generated/` is built output, not hand-edited.
- `src/screens/` — split into `online/`, `local/`, `shared/`.
- `src/lib/` — external clients (Supabase).
- `scripts/wordgen/` — separate multi-step pipeline (own README) that builds the obscure Norwegian word list from Norsk Ordbank + NB frequency lists + the Ordbok API, output feeds `src/data/words/no.csv` → `npm run generate:data`. Word definitions are CC BY 4.0 (Bokmålsordboka) and require attribution in an About screen.

---

## `shunwg/` — Cocky Monk

Read `shunwg/CLAUDE.md` in full before working here — it is a detailed project constitution (stack rules, file ownership table, workflow, guardrails) and takes priority over this summary. Also load `shunwg/00-START-HER.md` for a one-page orientation map, and the relevant `.claude/skills/*` (card-author, playtest-loop, release-captain, asset-wrangler, game-director, qa-gate, playtest-panel, motion-designer, game-feel) — these are pre-installed and trigger automatically on matching requests.

Spec precedence when things conflict: **`PRD.md` > `DESIGN.md` > `shunwg/CLAUDE.md`**. `Reference/cocky-monk-demo.html` is the frozen canonical prototype (never edited — open it in a browser to resolve ambiguity); `Lab/` is the live iteration space; `Tools/engine-vectors.json` is the rules authority for scoring.

### Commands (Node toolchain — works without a Mac)
```bash
cd shunwg
node Tools/serve-lab.mjs          # dev server with live reload -> http://localhost:8787/Lab/
node Tools/build-standalone.mjs   # Lab/ + Resources/ + DesignSystem/ -> dist/CockyMonk.html (single-file build)
node Tools/validate_deck.mjs --all  # validate Resources/deck_*.json
node Tools/tokens-build.mjs         # DesignSystem/tokens.json -> Lab/css/tokens.css, Sources/DesignSystem/Theme.swift, DESIGN-TOKENS.md
node Tools/tokens-build.mjs --check # fail if generated token outputs are stale
node Tools/rules-sheet.mjs --check  # fail if Specs/SCORING.md is stale vs engine-vectors.json
node Tools/snap-screens.mjs         # refresh Screens/ reference PNGs

# Tests (Node's built-in test runner, no dependencies)
node --test Lab/js/engine.test.mjs    # rules/scoring — segment 3 gate
node --test Lab/js/fixtures.test.mjs  # screens — segment 2 gate
node --test Lab/js/online.test.mjs    # net/clock/rating — segment 5 gate
```

### Commands (macOS/Xcode — once Sources/ is real, see MAC_RUNBOOK.md)
```bash
cd shunwg
scripts/setup.sh                  # checks tools, adds XcodeBuildMCP, clones ios-simulator skill
scripts/build.sh [Scheme]         # xcodebuild for iPhone 16 simulator (default scheme: CockyMonk)
scripts/test.sh [Scheme]          # xcodebuild test on iPhone 16 simulator
scripts/ship.sh                   # release flow (release-captain skill)
```
Edit `project.yml` and run `xcodegen generate` — never hand-edit the `.xcodeproj`.

### Architecture
- **Stack (fixed):** SwiftUI, iOS 18+, Swift 6 strict concurrency, MVVM-light. One `@Observable GameEngine` owns all state as an explicit `enum GamePhase` state machine (including GM role rotation); Views are dumb.
- **Transport seam:** `GameEngine` only talks to a `Transport` protocol — `LoopbackTransport` (hotseat) and `MultipeerTransport` (party mode). No MultipeerConnectivity types outside `Sources/Transport/`. In the browser Lab, the equivalent seam is `Lab/js/net.js` (PeerJS/WebRTC) — nothing else may import `Peer`.
- **Theme seam:** board visuals only via the `BoardTheme` protocol (Salongen/Fjellet/Verdensrommet); rules code never branches on theme.
- **Design tokens:** `DesignSystem/tokens.json` is the single source of truth; `Lab/css/tokens.css`, `Sources/DesignSystem/Theme.swift`, and `DesignSystem/DESIGN-TOKENS.md` are generated from it — never hand-edited.
- **The Lab (`shunwg/Lab/`)** is a componentized browser port of the frozen demo, and is where daily work actually happens pre-Mac-day: `Lab/js/engine.js` (pure state machine mirrored 1:1 by the future Swift `GameEngine`), `Lab/js/ui.js` (screens — never compute scores), `Lab/js/clock.js` (phase deadlines, the one `setInterval`), `Lab/js/rating.js` (Elo + the one `localStorage` key, `cockymonk.profile.v1`), `Lab/js/bots.js` (bot pacing constants in one `TUNING` block), `Lab/js/net.js` (online transport). See `shunwg/Lab/CLAUDE.md` for Lab-specific rules.
- **Segments, not lanes:** four generalists work across 7 gate-based segments (design-system, screens, rules/scoring, word lists, online/timers/rating, board/themes, flow/feel) instead of fixed ownership — one branch claims one segment, that segment's standalone gate must be green before merge. Full matrix and interface contracts: `LANES.md` (English/technical); human-facing version: `TEAM.md` (bokmål).
- **Content pipeline:** `Content/` is the word-candidate workshop (VERIFY queue); shipped decks live in `Resources/deck_nb.json` / `deck_en.json`, written only by the card-author skill and validated with `validate_deck.mjs`.

### Hard guardrails (from `shunwg/CLAUDE.md`)
- No networking beyond local MultipeerConnectivity in `Sources/` — no `URLSession` there. The one approved exception is PeerJS, vendored and confined to `Lab/js/net.js` for the browser build.
- No third-party Swift packages without asking (one approved exception: `lottie-ios`, behind the `MotionPlayer` protocol).
- Never touch signing/provisioning/`ExportOptions.plist` without explicit go-ahead — that's `release-captain`'s job.
- Never delete or bulk-rewrite `deck_nb.json`/`deck_en.json` — append/patch only.
- No analytics/tracking/network permissions — the iOS privacy label is "Data Not Collected" and must stay that way.
- The published game this project is inspired by — its name and card text — must never appear in the repo.
- Two failed attempts at the same bug → stop and ask, don't thrash the codebase.

---

## `the-daily-cock/` — The Daily Cock

Read `the-daily-cock/CLAUDE.md` in full before working here — the "Provenance" section is the important part: it explains exactly which pieces are ported from `ordkrig/` vs. `shunwg/` and why, and the guardrails (no quit penalty, no nav to the other two apps, no pointing at Ordkrig's live Supabase).

One-line pitch: a Wordle-style daily ritual for when you can't play the physical/party game with friends. Each day (UTC midnight cutoff) you write bluff definitions for 3 new "words of the day" and guess the real definition among options for the **previous** day's 3 words — today's writers become tomorrow's decoy pool, which is how it gets a good multiple-choice round without real-time players.

### Commands
```bash
cd the-daily-cock
node Tools/build-words.mjs    # re-import words.json + fakeDefs.json from ../ordkrig
node Tools/sync-tokens.mjs    # re-copy tokens.css/Fredoka/Nesen mark from ../shunwg
npm test                       # node --test js/engine.test.mjs — scoring/rollover/streak vectors
node Tools/simulate-day.mjs   # multi-user, multi-day smoke test (in-memory, no server needed)
npm run serve                  # -> http://localhost:8788
```

### Architecture
- `js/engine.js` + `js/rating.js` — pure logic (batches, submissions, guesses, scoring, rating/streak), tested against `js/vectors.json`. No bare `Date.now()`/`Math.random()`.
- `js/decoys.js` — ports Ordkrig's `answerPool.ts` nearness-matching bot-decoy algorithm against a copied `fakeDefs.json`.
- `server/db.mjs` — the only impure module: file-backed JSON store (`server/data/`, gitignored except `seed.json`) + the daily rollover. A single day's points settle in **two passes at two different times** (guess-points one rollover after the day ends, write-points one rollover after that) — see the long comment at the top of `db.mjs` before touching settlement logic.
- `js/storage.js` — the seam (`storageLocal()` today; a `storageRemote()` swap-in is the future path to real hosted persistence — that's a new decision to make explicitly, not a quiet default).
- Visual identity (tokens, Fredoka, the Nesen mark) is copied from `shunwg/`, not referenced live — re-sync via `Tools/sync-tokens.mjs` after upstream changes.
