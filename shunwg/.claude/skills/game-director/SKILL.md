---
name: game-director
description: Phase-gated orchestrator for building Snifferoo features end-to-end. Use when the user says /director, "orchestrate", "next feature", "build X", "run the flow", or any multi-step design/build/content task spanning more than one file or lane. Routes each phase to the best installed skill, enforces QA gates and a simulated playtest panel, writes artifacts to .design/<slug>/.
---

# Game Director

You run features through seven gates, in order. Each gate produces an artifact in `.design/<slug>/` (slug = short kebab-case feature name, e.g. `reveal-ceremony`). A gate opens only when the previous gate's artifact exists. You are also the only sanctioned path for cross-lane changes and `DesignSystem/tokens.json` edits (LANES.md).

## The gates

### 1 — Concept
Interrogate the request until it is buildable: which PRD section, which screens, which lanes, what "done" looks like. Use the design-brief skill if installed; otherwise run a design-brief-style interview yourself. Set the two taste dials explicitly: **playful ↔ premium** and **quiet ↔ loud** (DESIGN.md §1 sets the defaults).
Artifact: `.design/<slug>/brief.md`.

### 2 — Design
Express every visual decision as a **delta against `DesignSystem/tokens.json`** — never ad-hoc hex codes, durations, or radii. Consult ui-ux-pro-max for palette/contrast/font checks, and its swiftui.csv when the build target is `Sources/`. Optionally generate a concept board via imagegen-frontend-mobile.
Artifact: `.design/<slug>/tokens-delta.md`. If tokens change, run `node Tools/tokens-build.mjs` in the same step — never leave generated files stale.

### 3 — Build
Write `.design/<slug>/tasks.md` first: every task tagged with its LANES.md lane, then execute per lane rules:
- **Lane A (Engine/Transport):** vectors-first TDD — write `Tools/engine-vectors.json` cases, then code to green. Run the `swift-reviewer` agent on any `Sources/Engine` diff.
- **Lane B (UI/Board/Motion):** Lab first, `Sources/` second. Apply frontend-design + emil-design-eng principles; B renders state, never computes scores.
- **Lane C (Content/Audio/Assets):** card-author skill only for decks; asset-wrangler for promotions.

### 4 — Motion pass
Audit every animation in the diff against the emil-design-eng rubric: **does it inform or decorate?** Decoration without a job gets cut. All durations/easings from `tokens.json` only. If a new Lottie asset is warranted, invoke the motion-designer skill.
Append findings to `.design/<slug>/tasks.md`.

### 5 — QA gate
Invoke the **qa-gate** skill; the verdict table is the artifact. On a Mac, additionally run **playtest-loop** on the simulator.

### 6 — Playtest panel
Invoke the **playtest-panel** skill on the built flow.
Artifact: `.design/<slug>/panel-verdict.md`.

### 7 — Verdict
Report one table: **go / fix-list / no-go**, with each fix-list item pointing at the gate that caught it. Fix-list loops back to gate 3 (or 2 if tokens are wrong); max 2 loops, then stop and discuss (CLAUDE.md when-stuck rule).

## Rules
- **No gate skipped.** Each gate's artifact must exist before the next opens — check the file, don't assume.
- **Skill availability:** attempt each referenced skill; if it is not installed on this machine, log `SKIPPED (not installed)` in the gate's artifact and continue with your own judgment. Never hard-fail on a missing skill.
- **`--lite`** (one-file fixes only): run gates 3 → 5 → 7, no artifacts except the verdict. If the "one-file fix" grows a second file, restart at gate 1.
- Never edit `Reference/cocky-monk-demo.html` — it is frozen. Divergences go in `Lab/DIVERGENCE.md`.
