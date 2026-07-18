---
name: motion-designer
description: Author ORIGINAL Lottie JSON celebration assets for Cocky Monk and preview them in the Lab. Use when the user asks for a motion asset, confetti, fanfare, award shimmer, celebration, landmark moment, "lottie", or when the game-director motion pass decides an overlay asset is warranted. Not for game-state motion — that stays native (springs from tokens.json).
---

# Motion Designer

You make the moments that get a room to cheer — as small, original, token-colored Lottie files.

## The decision rule (before authoring anything)
Lottie is for **celebration overlays only**: confetti, Gullnese award, GM-steal sting, ⅓/⅔ landmark moments, Mål ceremonies. Game-state motion (pawn hops, nose growth, card pops, chip flips) is **native SwiftUI springs / Lab CSS** driven by `DesignSystem/tokens.json → motion` — never a Lottie file. If the request is game-state motion, stop and point to the tokens instead.

## Hard rules
1. **Original only.** Every asset is generated JSON authored here — never downloaded from LottieFiles or anywhere else without an explicit license check via the asset-wrangler skill.
2. **Budget:** ≤ 200 KB per file · vector shapes only (no raster/image layers) · declare loop vs one-shot in the filename comment and ASSETS.md row.
3. **Colors from tokens only:** pull hexes from `DesignSystem/tokens.json` (confetti palette, gmViolet, turnYellow…). No ad-hoc colors.
4. **Reduced Motion:** every asset must have a meaningful static end frame (the last frame is the fallback poster). Note it in the ASSETS.md row.
5. **Naming:** `Resources/Lottie/{event}_{variant}.json` snake_case (e.g. `confetti_win.json`, `celebration_fjellet.json`).
6. **Register or it didn't happen:** every file gets an ASSETS.md "Promoted" row — source "generated, original — ours", license "Ours", where used.

## Workflow
1. Invoke the **text-to-lottie** skill (vendored in `.claude/skills/text-to-lottie/`) for authoring mechanics — its `references/lottie-spec-map.md`, `motion-taste.md`, and the recipe files are the how-to. (Fallback if it's missing: author raw bodymovin v5.x JSON directly — `{"v":"5.9.0","fr":60,"ip":0,"op":N,"w":W,"h":H,"assets":[],"layers":[...]}` with shape layers and bezier easing.) Ignore its Skottie-player deployment notes — our preview is the Lab page below.
2. Keep compositions 60 fps, canvas 400×400 (overlays) or 800×400 (full-width ceremonies), durations ≤ 2.5 s (DESIGN.md: one-shots ≤ 1.5 s where they gate gameplay).
3. Ease with springs in spirit: overshoot-and-settle (mimic `{duration, bounce}` from tokens), never linear.
4. **Preview loop:** open `http://localhost:8787/Lab/lottie/player.html` (server: `node Tools/serve-lab.mjs`) — it grids every file in `Resources/Lottie/`. Iterate until it feels right at 60 fps.
5. Validate: file parses as JSON, size ≤ 200 KB, colors match tokens, end frame reads as a poster. Then write the ASSETS.md row.
6. iOS side (Mac day): assets play via `MotionPlayer` protocol — `LottieMotionPlayer` (lottie-ios ≥ 4.5.0) with `StaticMotionPlayer` as the Reduced Motion fallback showing the end frame. Spec lives in MAC_RUNBOOK.md — do not add Swift code for it from Windows.

## v1 asset set (the canon six)
`confetti_win` (board-ceremony victory burst, one-shot) · `gullnese_shimmer` (award glint, loopable) · `gm_steal_sting` (violet flash + dark chuckle beat, one-shot ≤ 0.8 s) · `celebration_salongen` (trophy-on-doily pop) · `celebration_fjellet` (summit flag plant + wind) · `celebration_verdensrommet` (moon landing + slow-mo dust).
