# Snifferoo

A game-master-led bluffing party game in Norwegian bokmål and English. One player draws an obscure
word and its real meaning; everyone else invents a definition convincing enough to steal votes. The
browser build is the live product; an iOS app is specced and scaffolded but not yet built.

Team map in bokmål: **[TEAM.md](TEAM.md)**. Segment matrix and interface contracts: **[LANES.md](LANES.md)**.

## Play it

| | |
|---|---|
| **Locally, no install** | Double-click `Play Snifferoo.cmd`, or open `dist/Snifferoo.html` in any browser |
| **Online** | https://shunwg.github.io/cockymonk/ — deployed from `main` by `.github/workflows/pages.yml` |

The bundle is one self-contained file: game, decks, fonts, Lottie celebrations, all inlined. No Node,
no server, works offline.

## Develop

```bash
node Tools/serve-lab.mjs                 # http://localhost:8787/Lab/ — live reload
```

- **One screen in isolation:** `…/Lab/index.html?fixture=07`, or the gallery at `/Lab/gallery.html`
  (`Open Screen Gallery.cmd`). Every screen has a permanent number — say "endre 07".
- **Rebuild the bundle** after any change under `Lab/`, `Resources/` or `DesignSystem/`:
  `node Tools/build-standalone.mjs`
- **Re-snap screen PNGs** in the same commit that changes a screen: `node Tools/snap-screens.mjs`

Node ≥ 18 is the only requirement on Windows.

## The gates

Everything below must be green before a merge. This is the whole quality system — there is no CI
that will catch it for you later.

```bash
node --test Lab/js/engine.test.mjs Lab/js/fixtures.test.mjs Lab/js/fakepool.test.mjs Lab/js/online.test.mjs
node Tools/tokens-build.mjs --check      # generated token outputs match tokens.json
node Tools/rules-sheet.mjs --check       # Specs/SCORING.md matches the engine vectors
node Tools/validate_deck.mjs --all       # deck schema + the trademark grep
node Tools/check-game-feel.mjs --check   # DESIGN.md §7 motion register vs the code
node Tools/check-fake-parity.mjs --check # bot fakes aren't trivially exploitable
```

Or `/qa` in Claude Code to run the battery, `/qa --ship` before anything leaves the house.

## What's authored, and what's generated

Getting this backwards is the most common way to lose work. **Never hand-edit a generated file** —
and never hand-resolve one in a merge conflict; take either side and regenerate.

| Generated | From |
|---|---|
| `Lab/css/tokens.css`, `DesignSystem/DESIGN-TOKENS.md` | `DesignSystem/tokens.json` via `Tools/tokens-build.mjs` |
| `Specs/SCORING.md` | `Tools/engine-vectors.json` via `Tools/rules-sheet.mjs` |
| `dist/Snifferoo.html` | the whole Lab via `Tools/build-standalone.mjs` |
| `Screens/png/*` | fixtures via `Tools/snap-screens.mjs` |

`Reference/cocky-monk-demo.html` is **frozen** — the canonical prototype, never edited. The Lab
iterates; deviations get a dated row in `Lab/DIVERGENCE.md`.

## The map

| Path | What |
|---|---|
| `Lab/` | **The game.** `js/` + `css/`, a componentized port of the frozen demo |
| `Screens/` | Permanent screen registry 01–23 (`SCREENS.md`) + reference PNGs |
| `Specs/` | `SCORING.md` (generated) · `FLOW.md` (beat map) · `ONLINE-PLAY.md` (rooms) |
| `Resources/` | What ships: decks `deck_nb/en.json`, bot fake pools, audio, Lottie |
| `Content/` | Word workshop — candidate lists per language + the VERIFY queue |
| `DesignSystem/` | `tokens.json`, the single source of truth for colour/type/motion |
| `Tools/` | Zero-dependency Node toolchain — build, validate, serve, snap, gates |
| `dist/` | The built single-file game. Generated, but **tracked** so double-click-to-play works |
| `Reference/` | The FROZEN prototype |
| `AssetsIncoming/` | CC0 quarry (Kenney). **Not in git** — see `ASSETS.md` to restore |
| `.claude/` | Skills and slash commands, versioned with the repo |

Root docs: `PRD.md` (the spec) · `DESIGN.md` (the look) · `CLAUDE.md` (the constitution) ·
`ASSETS.md` (licence ledger) · `TOOLBELT.md` (invited tools) · `TEAM.md` / `LANES.md` (who does
what) · `MAC_RUNBOOK.md` (Mac day).

## Working in git

`main` always works. Everything else happens on a branch named `segment/short-what` —
`skjermer/13-nese`, `ordlister/25-nye-nb`, `regler/omkamp-fix`.

```bash
git pull
git checkout -b segment/what
# …work, then run that segment's gate…
git add -A && git commit -m "13: nose vs author label"
git push -u origin segment/what
```

Then **Compare & pull request** on GitHub, someone glances at it, merge, delete the branch.

**Two people can sit in the same file for days.** Git merges by line, not by file — a real conflict
needs you both to have touched the *same lines*, and then it stops and asks rather than silently
picking a winner. When it does stop, keep what's right (often both sides), delete the `<<<<<<<`
markers, `git add` the file, `git commit`.

**Named versions** are tags, not branches:

```bash
git tag -a v0.2 -m "Segments + screens"
git push origin v0.2
```

GitHub Releases turns a tag into a download page — the right home for `dist/Snifferoo.html` when
handing the game to a tester who doesn't use git.

**Never commit secrets.** Nothing here needs one today; when Mac day brings signing certificates
they stay out of git (see `.gitignore` and `MAC_RUNBOOK.md`).

**Because `dist/` is tracked**, a Lab change should ship with a rebuilt bundle in the same commit,
or you get pointless conflicts there.

## Legal

Ship under your own name with your own cards. The published game this project is inspired by — its
name, card texts and art — is off-limits (PRD §3). The deck validator greps for the forbidden name,
so `validate_deck.mjs --all` is also the trademark check.
