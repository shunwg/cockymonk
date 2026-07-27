# MAC_RUNBOOK.md — everything that waits for a Mac

The Windows studio system (Lab, engine vectors, tokens, decks, Lottie assets, orchestrator) is done or in progress on Windows.
This file stages **every macOS-only step** so Mac day is execution, not archaeology. Work top to bottom.

## Hour 0 — machine setup
1. Xcode 26.3+ from the App Store (first launch installs tools; sign into your Apple ID under Settings → Accounts).
2. `brew install xcodegen jq xcbeautify node` (Node ≥ 18 — the Tools/ scripts run on Mac too).
3. Clone the repo. Run `bash scripts/setup.sh` (checks tools, adds XcodeBuildMCP, clones the ios-simulator skill).
4. Edit `project.yml`: replace both `EDITME`s (bundle-id prefix + Team ID) — then `xcodegen generate`.
5. Sanity: `node --test Lab/js/engine.test.mjs` and `node Tools/validate_deck.mjs --all` still green on the Mac.

## lottie-ios (the one approved package — CLAUDE.md exception)
Add to `project.yml`, then `xcodegen generate`:

```yaml
packages:
  Lottie:
    url: https://github.com/airbnb/lottie-ios
    from: 4.5.0
targets:
  Snifferoo:
    # ...existing...
    dependencies:
      - package: Lottie
```

**Mac-day check:** confirm lottie-ios builds under Swift 6 strict concurrency (it's `@preconcurrency`-friendly from 4.5). If it fights the build, fall back per plan: render celebrations with native SwiftUI `Canvas` particles and keep the Lottie JSONs as design references.

### MotionPlayer protocol (build this before any Lottie call sites)
```swift
protocol MotionPlayer {                    // Sources/Views/Motion/MotionPlayer.swift
    func play(_ asset: MotionAsset)        // enum MotionAsset: String, CaseIterable — the six canon names
}
struct LottieMotionPlayer: MotionPlayer {} // wraps LottieView(animation:), one-shot vs loop per asset
struct StaticMotionPlayer: MotionPlayer {} // Reduced Motion: renders the asset's end frame as a poster
```
Views get a `MotionPlayer` from the environment; `accessibilityReduceMotion` picks the static one. **No Lottie type outside `Sources/Views/Motion/`.**

**Call sites are already proven in the Lab** — mirror `Lab/js/lottie.js` + its four trigger points in `Lab/js/ui.js` when wiring the Swift side:
| Moment | Asset | Lab trigger (ui.js) |
|---|---|---|
| Winner screen | `confetti_win` (one-shot) + `gullnese_shimmer` (loop, on the badge) | `SCREENS.WINNER`, guarded once per game |
| GM steal (truth revealed, nobody found it) | `gm_steal_sting` | `doRevealStep`, when `G.gmStole` |
| First pawn reaches Mål | `celebration_{salongen\|fjellet\|verdensrommet}` | `animateBoard` hop, `goalCelebrated` guard |
Reduced Motion: the Lab no-ops the overlay (static UI is the poster) — the Swift `StaticMotionPlayer` does the same.

## Engine port (Lane A, first real Swift work)
- `Tools/engine-vectors.json` is the contract — port each vector to Swift Testing cases in `Tests/EngineTests/` before/with the engine (TDD).
- Mirror `Lab/js/engine.js` shape: pure reducer (`dispatch(state, action) -> state`), injected RNG, no timers. `Lab/js/bots.js` constants → `Sources/Engine/BotTuning.swift` (one block, PRD §4).
- Exit: `scripts/test.sh` green with every §5.3/§5.5 vector.

## Milestones M1–M10 × lanes (what's already de-risked)
| M | Deliverable (PRD §12) | Lane | De-risked on Windows already |
|---|---|---|---|
| M1 | Skeleton + Transport protocol + LanguagePicker + PlayerSetup | A+B | Screens proven in Lab; tokens generated (`Theme.swift`) |
| M2 | GameEngine state machine + scoring, pure + tested | A | **Vectors written & green in JS** — port, don't re-derive |
| M3 | Hotseat round flow | B | Full flow browser-verified in Lab incl. handover + decoy gating |
| M4 | Reveal ceremony + Nesen + dobbeltreff + omkamp | B | Reveal pacing & rules in Lab; motion springs in tokens.json |
| M5 | BoardView + BoardTheme + Salongen | B | Board layout logic + landmarks in Lab; Kenney sprites curated in quarry |
| M6 | Fjellet + Verdensrommet + sound/haptics + icon | B+C | Themes in Lab CSS; sound grammar mapped in tokens.json (8 events still `TODO:original` — record/log in CREDITS.md) |
| M7 | Practice mode vs BotBrain | A+B | Bot pacing constants + 35% truth-find in `Lab/js/bots.js` |
| M8 | Party mode (MultipeerTransport + lobby) | A | Transport protocol design in LANES.md contracts |
| M9 | Hardening (§5.5 disconnects) + decks to ship size | A+C | **Decks + fakes already at ship-blocker size, validated** |
| M10 | TestFlight | all | release-captain skill + `scripts/ship.sh` staged below |

Per milestone: `scripts/build.sh` → playtest-loop (simulator screenshots — CLAUDE.md workflow) → `scripts/test.sh` → commit `M<n>: … (PRD §…)`.

## TestFlight (release-captain skill drives this)
1. App Store Connect: create the app record (bundle id from project.yml, name **Snifferoo**, primary language nb).
2. Create an ASC API key (Users and Access → Integrations) → `export ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_PATH=…` (ship.sh header).
3. `bash scripts/ship.sh` (runs tests + deck validation first, then archive → export → upload).
4. Internal testers first; external group after a weekend of survival. What-to-test notes: 2–4 bullets, Norwegian, playful.

## App Store submission checklist (before "Submit for review")
- [ ] `/qa --ship` green on the release commit (deck ≥150 nb / ≥100 en, fakes ≥40/lang, **zero VERIFY**, tokens `--check`, vectors, ledger audit)
- [ ] Privacy label: **Data Not Collected** (CLAUDE.md guardrail — no analytics, no network beyond local MPC)
- [ ] Export compliance: uses only standard OS encryption → exempt (answer "No" to proprietary crypto)
- [ ] Age rating questionnaire (expect 9+/12+ — mild "cheeky" humor, no gambling despite casino-audio *sounds*)
- [ ] **Trademark search evidence**: 30 min on Patentstyret + EUIPO for "Snifferoo" — save PDFs of the search results with the release notes (PRD §13)
- [ ] Credits in About: Kenney (CC0, "because class"), Fredoka (OFL), lottie-ios (Apache-2.0) — per ASSETS.md
- [ ] Screenshots from **device/simulator only** (Lab browser screenshots are not App Store legal), all 3 themes represented
- [ ] `Resources/Audio/CREDITS.md` complete for every shipped sound; the 8 `TODO:original` sound events resolved or cut
- [ ] Launch screen, app icon (the Nose on turnYellow), version/build bumped in project.yml → `xcodegen generate`

## Optional Track W (Swift engine on Windows, if attempted before Mac day)
Root `Package.swift` targeting `Sources/Engine` + `Tests/EngineTests` (coexists with XcodeGen — project.yml ignores it). Install the swift.org Windows toolchain; if it isn't building within ~1 hour, abort — the JS vectors already hold the rules. Time-box: 1 day.
