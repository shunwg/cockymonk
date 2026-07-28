# cockymonk

This repo holds three separate projects that share one git history but don't share any code or build process. `cd` into the one you want and check its own docs (linked below) for real detail — this file is just a map.

## The three projects

### [`ordkrig/`](ordkrig) — Ordkrig
A Norwegian word-bluffing game (Balderdash/Fibbage-style), built with Expo/React Native + Supabase. Live on TestFlight with real players.
See [`ordkrig/CLAUDE.md`](ordkrig/CLAUDE.md).

### [`shunwg/`](shunwg) — Cocky Monk
A Norwegian game-master bluffing party game for iOS. The long-term plan is a SwiftUI/Swift app, but day-to-day work currently happens in a browser-based prototype ("the Lab") built with vanilla JS/CSS.
See [`shunwg/CLAUDE.md`](shunwg/CLAUDE.md).

### [`the-daily-cock/`](the-daily-cock) — The Daily Cock
A Wordle-style daily spinoff of Cocky Monk: write bluff definitions for today's words, then guess yesterday's real definitions. Standalone vanilla JS/CSS app with a small Node backend; borrows word data from Ordkrig and visual style from Cocky Monk.
See [`the-daily-cock/CLAUDE.md`](the-daily-cock/CLAUDE.md).

## Note for contributors

There's no root-level build, package manager, or test runner — each project is self-contained. Full context and rules for working across all three (including a shared GitHub Pages workflow gotcha) live in [`CLAUDE.md`](CLAUDE.md).
