# Cocky Monk starter kit
Everything Claude Code needs to build a game-master-led bluffing party game for iOS — spec, constitution, design system, house skills, and scripts. Unzip into an empty folder, do the 5-minute edit, run setup, start building.

## ▶ Play the full game right now (Windows, no install)
Double-click **`Play Cocky Monk.cmd`** — or open **`dist/CockyMonk.html`** in any browser. It's the complete game in one self-contained file: a branded Home screen with a 30-second illustrated how-to, hotseat (pass-one-phone) and practice-vs-bots modes, all 3 richly-themed boards (parlor wood / paper-cut mountains / deep space) with a routed race track, the reveal ceremony with the boinging Nose, board race, Gullnese award, sound, and the six Lottie celebrations. Fredoka is embedded, so the brand looks right even offline. No Node, no server.

Rebuild it after changing anything in `Lab/`, `Resources/`, or `DesignSystem/`:
```bash
node Tools/build-standalone.mjs      # → dist/CockyMonk.html
```
To iterate on the game with live reload instead, run the Lab dev server: `node Tools/serve-lab.mjs` → http://localhost:8787/Lab/.

## What's in the box
| File | What it is | Edit how often |
|---|---|---|
| `PRD.md` | v3 spec — game-master flow, board-race scoring, 3 themes, nb/en, milestones M1–M10 | When the game design changes |
| `CLAUDE.md` | Project constitution Claude Code obeys every session | Rarely — keep it lean |
| `DESIGN.md` | Playful design system: tokens, the Nose, motion, sound, voice | When the look evolves |
| `TOOLBELT.md` | Invited external plugins/MCPs/skills, tiered Core → Situational | When you add/drop tools |
| `ASSETS.md` + `AssetsIncoming/` | License ledger + 1,540 bundled CC0 assets (Kenney: pieces, icons, card/UI audio) | When assets are promoted |
| `LANES.md` | 3-person ownership matrix + interface contracts (Lane A engine · B UI/motion · C content/assets) | When the team changes |
| `MAC_RUNBOOK.md` | Every macOS-only step (Xcode, lottie-ios, M1–M10, TestFlight, App Store checklist), staged for Mac day | Mac day |
| `DesignSystem/tokens.json` | **Single source of truth** for all design tokens → generates `Lab/css/tokens.css`, `Sources/DesignSystem/Theme.swift`, `DESIGN-TOKENS.md` | Via `/director` |
| `Lab/` | Componentized browser port of the demo — play, iterate and test the game on Windows (`node Tools/serve-lab.mjs`) | Daily (Lane B) |
| `Content/` | Word-candidate lists per language + VERIFY queue (Lane C workshop) | Content days |
| `Tools/` | Zero-dep Node toolchain: validate_deck · tokens-build · serve-lab · engine-vectors.json (the rules contract) | Rarely |
| `Resources/deck_nb.json` + `deck_en.json` + `fakes_*.json` | The shipping decks + bot fake pools (card-author skill only) | `/newcards` |
| `Resources/Lottie/` | Original generated celebration animations (preview: `/Lab/lottie/player.html`) | motion-designer |
| `.claude/skills/` | card-author · playtest-loop · release-captain · asset-wrangler · **game-director** · **qa-gate** · **playtest-panel** · **motion-designer** | They're yours — sharpen them |
| `.claude/agents/` | swift-reviewer · swiftui-specialist subagents | Rarely |
| `.claude/commands/` | `/playtest` · `/newcards` · `/ship` · `/theme` · `/director` · `/qa` | Rarely |
| `scripts/` | setup · build · run · test · validate_deck · ship (macOS; validate_deck delegates to Node) | Rarely |
| `project.yml` | XcodeGen spec → generates the .xcodeproj | Version bumps, signing |
| `Resources/deck_*.sample.json` | Card schema + example cards (nb + en) | Never (reference only) |
| `Reference/cocky-monk-demo.html` | **FROZEN canonical prototype** — flow, pacing, scoring, bot behavior, all 3 themes. Open in any browser; never edit (iterate in `Lab/`) | Never |

## The 5-minute edit checklist (before first run)
| # | Where | Do |
|---|---|---|
| 1 | `project.yml` | Replace both `EDITME`s: bundle id prefix + your Apple Team ID |
| 2 | `PRD.md` §13 | Answer the open questions (name! en deck? default theme?), delete the section |
| 3 | — | Name is set: **Cocky Monk**. Before public release: 30-min trademark search (Patentstyret + EUIPO) |
| 4 | `scripts/ship.sh` header | (Later, at M7) set the three ASC_* env vars |

## Two tracks: Windows now, Mac later
Everything Xcode-shaped (build, simulator, TestFlight) needs macOS — see `MAC_RUNBOOK.md` when a Mac is available.
Until then, the whole studio system runs on Windows: the browser Lab (`node Tools/serve-lab.mjs`), engine rule tests
(`node --test Lab/js/engine.test.mjs`), deck authoring + validation (`node Tools/validate_deck.mjs --all`), the design-token
pipeline (`node Tools/tokens-build.mjs`), and the Lottie preview page. Team lanes live in `LANES.md`.

## First run
```bash
cd cocky-monk-starter
git init && git add -A && git commit -m "starter kit"
bash scripts/setup.sh        # checks tools, adds XcodeBuildMCP, clones ios-simulator skill
claude                       # then inside the session:
# /plugin install frontend-design
# /plugin install code-review
# /plugin install security-guidance
```

## Kickoff prompts (paste in order, one per session-ish)
**Session 1 — plan:**
> Read PRD.md, CLAUDE.md, DESIGN.md, TOOLBELT.md and ASSETS.md. Enter plan mode. Propose the architecture (GameEngine + Transport + BoardTheme protocols) and a task breakdown for milestone M1 only. Ultrathink. Do not write code yet.

**Session 2+ — build loop:**
> Implement the next task from the M{n} plan. Follow the CLAUDE.md workflow: build, playtest-loop with screenshots, tests, then commit.

**Content day:**
> /newcards 50

**When M3 lands:**
> /playtest full hotseat round with 3 players

**When M5 lands:**
> /theme Salongen

**When M7 arrives:**
> /ship testflight

## Working rhythm that keeps quality high
1. Plan mode before every milestone — you edit the plan, Claude executes it.
2. Never accept "done" without the playtest-loop verdict table + screenshots.
3. Run the `swift-reviewer` subagent on Engine code before merging.
4. One milestone per sitting. Small commits. Double-Escape rewinds a bad Claude step; git rewinds a bad milestone.
5. When you correct Claude the same way three times → move the correction into CLAUDE.md or a skill (that's what `/plugin install skill-creator` is for).

## Legal reminder
Ship under your own name with your own cards. The published game this project is inspired by — its name, card texts, and art — is off-limits (see PRD §3; the deck validator even greps for the forbidden name).
