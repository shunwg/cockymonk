# Lab/ — segment rules (auto-loaded when working here)

The Lab is the **Windows-testable browser playground**: a componentized port of the frozen demo. Segment map (LANES.md): `js/engine.js` + `js/engine.test.mjs` = segment 3 (rules) · `js/ui.js`, `js/fixtures.js` + css = segment 2 (screens, gate: `node --test Lab/js/fixtures.test.mjs`) · `js/themes.js` + `css/themes.css` = segment 6 · `js/bots.js`/`audio.js`/`lottie.js` = segment 7. Screens are referenced by number (`Screens/SCREENS.md`); the live gallery is `gallery.html`.

- `Reference/cocky-monk-demo.html` is FROZEN — never edit it. The Lab iterates; the demo + PRD adjudicate.
- Rules authority is `Tools/engine-vectors.json`, not this folder. `js/engine.js` must pass `node --test Lab/js/engine.test.mjs` before any commit.
- `css/tokens.css` is GENERATED from `DesignSystem/tokens.json` — never hand-edit; run `node Tools/tokens-build.mjs`.
- Intentional visual/flow deviations from the demo → dated row in `DIVERGENCE.md` (what, why, PRD/DESIGN amendment ref or "pending").
- Serve with `node Tools/serve-lab.mjs` → http://localhost:8787 (fetch-loading of decks needs http; file:// falls back to the embedded mini-deck).

## Parity smoke (run after any engine.js or ui.js change)
Open the Lab AND the frozen demo side by side, same moves in both:
1. Hotseat → 3 players Anne/Bo/Cam → Standard (15) → Salongen.
2. Round 1 (Anne GM): Bo bluffs "en slags fiskesuppe", Cam bluffs "gammelt mål for ved", Anne writes 1 decoy. Bo votes truth, Cam votes Bo's bluff.
3. Expected in BOTH apps: **Bo +3** (+2 truth vote, +1 for Cam's vote on his bluff), **Cam +0**, **Anne +0** (truth was found → no GM steal; her decoy got no votes). Verify identical scores and identical board hops.
4. Toggle all three themes; confirm board restyles, pawns unaffected.
Any mismatch = Lane A bug or DIVERGENCE.md entry — decide before committing.
