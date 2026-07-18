# CLAUDE.md — Cocky Monk project constitution

You are building a Norwegian bluffing party game for iOS. **PRD.md is the spec, DESIGN.md is the look, `Reference/cocky-monk-demo.html` is the living prototype (open it in a browser when prose is ambiguous — its flow, pacing, and scoring are canonical), and this file is the law.** When they conflict: PRD > DESIGN > this file. If something is unspecified, propose in plan mode — don't invent silently.

## Stack (fixed)
- SwiftUI · iOS 18+ · Swift 6 strict concurrency · Xcode project generated from `project.yml` (XcodeGen)
- Architecture: MVVM-light. One `@Observable GameEngine` owns all game state as an explicit state machine (`enum GamePhase`, incl. the GM role rotation). Views are dumb.
- **Bots:** practice-mode opponents are `BotBrain` participants on the loopback transport (delays, 35% truth-find, decoy gating per PRD §4). Bot tuning constants live in one file, never inline.
- **Fonts:** Fredoka (OFL) is the only bundled font; license row in ASSETS.md before the file enters the project.
- **Transport rule:** GameEngine talks only to the `Transport` protocol — `LoopbackTransport` (hotseat) and `MultipeerTransport` (party mode, MultipeerConnectivity). No MPC types outside `Sources/Transport/`.
- **Theme rule:** board visuals only via the `BoardTheme` protocol (Salongen/Fjellet/Verdensrommet). Rules code never branches on theme; adding a theme is one config + assets, zero engine changes.
- Persistence: SwiftData for game-in-progress + seen-cards; `@AppStorage` for settings (incl. language nb/en — decks are per-language: deck_nb.json / deck_en.json).
- No third-party Swift packages without asking. No networking beyond local MultipeerConnectivity — if you find yourself importing URLSession, stop.

## Files & ownership
| Path | Rule |
|---|---|
| `Sources/Engine/` | Pure logic, no SwiftUI imports, 100% unit-testable |
| `Sources/Views/` | SwiftUI only, no game rules logic |
| `Resources/deck_nb.json`, `deck_en.json` | **Only** the card-author skill writes here; always run `scripts/validate_deck.sh` after |
| `AssetsIncoming/` | CC0 quarry (Kenney packs) — read-only raw material; only the asset-wrangler skill promotes files out of it, with a license row in ASSETS.md |
| `Resources/deck_nb.sample.json` | Schema reference — never shipped, never edited |
| `project.yml` | Edit this, then `xcodegen generate` — never hand-edit the .xcodeproj |
| `scripts/` | Prefer these over raw xcodebuild incantations |

## Workflow (every task, no exceptions)
1. **Plan mode first** for anything bigger than a one-file fix. Reference the PRD section you're implementing.
2. Build with `scripts/build.sh`; fix every warning before proceeding.
3. **Verify visually:** run on the iPhone 16 simulator, exercise the changed flow, screenshot it (playtest-loop skill). "It compiles" is not "it works".
4. Run `scripts/test.sh`. New logic in `Sources/Engine/` ships with tests in the same commit.
5. Commit per milestone-step with a message referencing the PRD section (e.g. `M3: handover privacy screen (PRD 5.2#2)`).

## Definition of done (per feature)
- [ ] Builds warning-free · [ ] tests green · [ ] simulator screenshot reviewed · [ ] Dynamic Type XL doesn't break layout · [ ] all user-facing strings in the String Catalog (nb + en) · [ ] matches DESIGN.md tokens (no ad-hoc colors/fonts)

## Language rules
- UI copy: Norwegian bokmål primary, English secondary, via String Catalog. Tone per DESIGN.md §Voice — playful, never childish.
- Code, comments, commit messages, test names: English.

## Guardrails
- Never touch signing, provisioning, or `ExportOptions.plist` without explicit go-ahead (release-captain skill handles releases).
- Never delete or bulk-rewrite `deck_nb.json` — append/patch only.
- Never add analytics, tracking, or network permissions. Privacy label is "Data Not Collected" and stays that way.
- The name "Kokkelimonke" and any published game's card text must not appear anywhere in the repo. (This file and PRD §3 are the only permitted mentions — of the restriction itself.)

## Toolbelt
MCPs, plugins, and skills live in `TOOLBELT.md`. Skills in `.claude/skills/`: **card-author** (deck content), **playtest-loop** (build-run-verify), **release-captain** (TestFlight), **asset-wrangler** (licensed art/audio). Subagents in `.claude/agents/`: `swift-reviewer` (run before every commit of Engine code), `swiftui-specialist` (complex UI). Slash commands: `/playtest`, `/newcards`, `/ship`, `/theme`.

## When stuck
Two failed attempts at the same bug → stop, write down what you know, ask. Don't thrash the codebase.
