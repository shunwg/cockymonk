# Cocky Monk starter kit
Everything Claude Code needs to build a Kokkelimonke-style bluffing game for iOS — spec, constitution, design system, house skills, and scripts. Unzip into an empty folder, do the 5-minute edit, run setup, start building.

## What's in the box
| File | What it is | Edit how often |
|---|---|---|
| `PRD.md` | v2 spec — game-master flow, board-race scoring, 3 themes, nb/en, milestones M1–M9 | When the game design changes |
| `CLAUDE.md` | Project constitution Claude Code obeys every session | Rarely — keep it lean |
| `DESIGN.md` | Playful design system: tokens, the Nose, motion, sound, voice | When the look evolves |
| `TOOLBELT.md` | Invited external plugins/MCPs/skills, tiered Core → Situational | When you add/drop tools |
| `ASSETS.md` + `AssetsIncoming/` | License ledger + 1,540 bundled CC0 assets (Kenney: pieces, icons, card/UI audio) | When assets are promoted |
| `.claude/skills/` | card-author · playtest-loop · release-captain · asset-wrangler | They're yours — sharpen them |
| `.claude/agents/` | swift-reviewer · swiftui-specialist subagents | Rarely |
| `.claude/commands/` | `/playtest` · `/newcards` · `/ship` · `/theme` | Rarely |
| `scripts/` | setup · build · run · test · validate_deck · ship | Rarely |
| `project.yml` | XcodeGen spec → generates the .xcodeproj | Version bumps, signing |
| `Resources/deck_*.sample.json` | Card schema + example cards (nb + en) | Never (reference only) |
| `Reference/cocky-monk-demo.html` | **Playable prototype** — canonical flow, pacing, scoring, bot behavior, all 3 themes. Open in any browser | When the design does |

## The 5-minute edit checklist (before first run)
| # | Where | Do |
|---|---|---|
| 1 | `project.yml` | Replace both `EDITME`s: bundle id prefix + your Apple Team ID |
| 2 | `PRD.md` §13 | Answer the open questions (name! en deck? default theme?), delete the section |
| 3 | — | Name is set: **Cocky Monk**. Before public release: 30-min trademark search (Patentstyret + EUIPO) |
| 4 | `scripts/ship.sh` header | (Later, at M7) set the three ASC_* env vars |

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
Ship under your own name with your own cards. "Kokkelimonke", its card texts and art are off-limits (PRD §3 — the validator even greps for it).
