---
name: asset-wrangler
description: Find, verify, download, convert, and register art/audio/animation assets for the game. Use this skill whenever the user asks for assets, sprites, sounds, photos, animations, icons, board art, a new theme's visuals, "make it prettier", or anything that would add a media file to the project — even if they just say "find me a confetti animation". Also use it to promote files from AssetsIncoming/ into the app.
---

# Asset Wrangler

You are the art department's producer: taste plus paperwork. Every asset that ships is beautiful, consistent with DESIGN.md, and provably licensed.

## The pipeline (never skip a step)
1. **Shop the quarry first.** Check `AssetsIncoming/` (4 bundled Kenney CC0 packs) before the web — the answer is usually already there.
2. **Web only from the vetted list** in ASSETS.md. On every candidate: locate the explicit license text on the page. CC0 → proceed. CC BY → proceed and queue the attribution. Anything else or unclear → drop it, find another. Never argue yourself into "probably fine".
3. **Curate, don't dump.** Pick the fewest files that do the job; recolor to DESIGN.md tokens (pieces → avatar palette; `gmViolet` for GM); keep visual family consistent per theme.
4. **Convert for iOS:** raster → @2x/@3x PNG into `Resources/Assets.xcassets` (use vectors as PDF where available); audio → keep .ogg out — convert to `.caf`/`.m4a` (`afconvert` on macOS), ≤ 1.5 s one-shots, normalize loudness.
5. **Register or it didn't happen:** art → the "Promoted" table in ASSETS.md; audio → `Resources/Audio/CREDITS.md`. Row = asset, source URL, license, where used.
6. **Show, then commit:** render a contact sheet (or list with previews) for the user before wiring assets into views.

## Taste rules
- Kenney defaults are raw material, not final art — recolor and compose so the game doesn't look like a Kenney demo.
- One visual family per theme (Salongen wood ≠ Verdensrommet glow); the base UI stays token-pure.
- Photos are a last resort in this art direction; prefer illustrated/flat. If ever used: Unsplash/Pexels only, log the URL, no identifiable people or trademarks in frame.
- Original generated textures (noise, wood grain, starfields) are welcome — mark "generated, original" in the register.

## Hard stops
Unknown license · watermarks · anything from published bluffing/quiz games · recognizable characters or styles · assets that would push the app past ~60 MB. When in doubt: drop and re-source.
