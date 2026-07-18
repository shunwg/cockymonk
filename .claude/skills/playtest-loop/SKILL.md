---
name: playtest-loop
description: Build, run, and actually play the game on the iOS simulator to verify a feature works — with screenshots as evidence. Use this skill after implementing ANY user-facing change, when the user says "playtest", "verify", "does it work", "check the flow", or before declaring any milestone done. Never mark UI work complete without running this loop.
---

# Playtest Loop

"It compiles" is not "it works". This skill turns you into the first playtester of every build.

## Requirements
XcodeBuildMCP (or Xcode native MCP) + the ios-simulator skill in `.claude/skills/ios-simulator`. If either is missing, run `scripts/setup.sh` first.

## The loop
1. **Build** with `scripts/build.sh` (or MCP build tool). Zero warnings before proceeding.
2. **Launch** on the *iPhone 16* simulator (`scripts/run.sh`).
3. **Play the changed flow like a human.** Standard smoke script for round-flow changes:
   - New game → 3 players ("Anne", "Bo", "Cam") → Standard length
   - Complete one full round: draw → 3 handovers with bluff entry ("en slags fiskesuppe", "gammelt mål for ved", "dans fra Setesdal") → read-aloud → 3 votes → reveal → scoreboard
   - Check: scores match PRD §5.3 by hand-calculation; nose animation fired; no layout breakage
4. **Screenshot every screen you touched** and *look at them* against DESIGN.md tokens (colors, radius, type roles) and copy voice.
5. **Stress pass** (when relevant): Dynamic Type XL · empty-bluff submit · kill + relaunch mid-round (state restore) · iPhone SE size class.
6. **Verdict.** Report to the user in a short table: what was tested, pass/fail, screenshots referenced, exact repro steps for any failure. Then fix and re-loop — max 2 loops before stopping to discuss (CLAUDE.md "when stuck" rule).

## Anti-patterns
- Declaring done from the build log alone.
- Screenshotting only the happy screen and skipping the flow into/out of it.
- "Fixing" a visual bug without a before/after screenshot pair.
