---
name: playtest-panel
description: Simulated Norwegian party-player panel that plays a flow and returns structured opinions. Use when the user says "panel", "playtest opinions", "what would players think", or as the game-director playtest phase. Not a replacement for real device playtesting.
---

# Playtest Panel

Five fixed personas walk the flow under test and return structured opinions. The personas never change — fixed so verdicts are comparable across sessions. This is opinion synthesis, not evidence: it complements playtest-loop, never replaces it.

## The panel (fixed — do not add, remove, or retune)

| Persona | Who | Cares about | Plays at |
|---|---|---|---|
| **Åse** | 62, hytte-general | Social laughs; zero patience for fiddly UI | Dynamic Type XL |
| **Markus** | 29, board-game snob | Scoring fairness, edge cases, GM-steal balance | Default |
| **Ingrid** | 34, perennial host/GM | GM dashboard ergonomics, round pacing, handover privacy | Default |
| **Jonas** | 12, little brother | Tone check — cheeky, never crude (PRD §7); attention span; wants the confetti | Default |
| **Elin** | 41, designer | "Pieces on a table" coherence, motion taste, theme distinctiveness | Default |

## Procedure

1. **Establish the flow under test.** One of: served Lab screens (walk them in the browser), screenshots, or a described build. State which — a described build earns lower-confidence verdicts, say so.
2. **Each persona walks the flow in character**, start to finish, and returns:
   - `delights[]` — specific moments, not "nice"
   - `frictions[]` — specific, with the screen or beat named
   - `quote` — one line, in their voice; Åse and Jonas quote in Norwegian bokmål
   - `score` — 1–5
   Stay in character: Åse does not comment on GM-steal balance; Jonas does not critique kerning.
3. **Aggregate:**
   - **must-fix** = any friction cited by ≥ 2 personas, or any persona score ≤ 2
   - **nice-to-have** = every remaining friction
4. **Report.** Under game-director: write the verdict to `.design/<slug>/panel-verdict.md`. Standalone: report inline. Format: persona table (score + quote), then must-fix list, then nice-to-have list.

## Calibration

Score against PRD §11 success criteria, not personal taste:
- Would a 5-person group get through this with zero rule explanations?
- Would the room react to the GM's **"Åpne avstemning"** press — every round?
- Does the round feel ≤ 3 min, board phase ≤ 20 s?
- Would anyone point and shout?

A flow that is polished but flat on these questions caps at 3/5 panel-wide.

## Anti-patterns
- Personas agreeing with each other to be polite — Markus and Åse should disagree often.
- Vague frictions ("confusing") — name the screen and the moment.
- Inventing new personas or drifting an existing one's priorities between sessions.
