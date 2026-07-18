# TOOLBELT.md — external tools invited into this project

Philosophy: **5–6 active MCPs max.** Every MCP tool definition eats context; a lean belt beats a full one. (Skills are different: they load on demand and cost nothing until invoked — the skill list below can grow.) `scripts/setup.sh` installs the Core tier and prints the rest.

**Cross-platform tier (Windows + Mac):** Node ≥ 18 — runs the whole `Tools/` toolchain (`validate_deck.mjs`, `tokens-build.mjs`, `serve-lab.mjs`) and the Lab engine tests. This is the only tool the Windows phase needs.

## Core (install day 1)
| Tool | Type | Install | Why |
|---|---|---|---|
| **XcodeBuildMCP** (cameroncooke) | MCP | `claude mcp add xcodebuild -- npx -y xcodebuildmcp@latest` then `npx -y xcodebuildmcp@latest init` | Build, run, device deploy, logs, simulator UI automation — the backbone. Its `init` also installs two companion agent skills |
| **ios-simulator skill** (conorluddy) | Skill | `git clone https://github.com/conorluddy/ios-simulator-skill.git .claude/skills/ios-simulator` | Lets Claude tap through the game and screenshot it — powers our playtest-loop |
| **frontend-design** (Anthropic) | Plugin | `/plugin install frontend-design` | Keeps the UI from drifting into generic-AI look; pairs with DESIGN.md |
| **code-review + security-guidance** (Anthropic) | Plugins | `/plugin install code-review` · `/plugin install security-guidance` | Default review on every change |

## Situational (add when the need appears — not before)
| Tool | Install | Add when… |
|---|---|---|
| **Xcode native MCP** (Xcode 26.3+) | Enable in Xcode → Settings → Intelligence, then `claude mcp add --transport stdio xcode -- xcrun mcpbridge` | You want Apple's own bridge; can replace XcodeBuildMCP if you prefer fewer moving parts. Don't run both with all tools enabled |
| **context7** | Community marketplace → `/plugin` browser | Claude starts hallucinating SwiftUI/SwiftData APIs |
| **xclaude** (bmdragos) | See repo README (installs via Mint) | You're at M7 and want archive→sign→upload→TestFlight driven from Claude. The release-captain skill knows how to use it |
| **Axiom iOS Games skill** | mcpmarket.com/tools/skills/ios-game-development-axiom | If the board ceremony outgrows SwiftUI Canvas (heavy particles/physics) and you move BoardView to SpriteKit |
| **Figma MCP** (official) | figma.com → Dev Mode MCP, then `claude mcp add` per their docs | You start sketching board themes in Figma and want Claude to read the frames |
| **mobile-ios-design skill** | Via XcodeBuildMCP docs page | You want HIG deep-dives beyond DESIGN.md |
| **skill-creator** (Anthropic) | `/plugin install skill-creator` | You catch yourself correcting Claude the same way 3+ times → bake it into a project skill |

## Deliberately NOT invited
| Tool | Why not |
|---|---|
| Unity / Godot MCPs | Wrong tool — this is a SwiftUI app, not an engine game |
| Firebase / Supabase plugins | v1 has zero backend by design (PRD §2). Revisit only at online-multiplayer v3 |
| Playwright / Chrome DevTools | The Lab is browser-based, but Claude's built-in Browser pane covers it — no extra web MCPs |
| Any analytics SDK MCP | Privacy label is "Data Not Collected" (CLAUDE.md guardrail) |

## House skills & agents (already in this repo)
`.claude/skills/`: **card-author** · **playtest-loop** · **release-captain** · **asset-wrangler** · **game-director** (phase-gated orchestrator) · **qa-gate** (validator battery) · **playtest-panel** (5 simulated player personas) · **motion-designer** (original Lottie assets)
`.claude/agents/`: **swift-reviewer** · **swiftui-specialist**
`.claude/commands/`: **/playtest** · **/newcards** · **/ship** · **/theme** · **/director** · **/qa**

Asset sourcing lives in `ASSETS.md` — 4 Kenney CC0 packs are already bundled in `AssetsIncoming/`. Lottie authoring: the **text-to-lottie** skill (from `diffusionstudio/lottie`, vendored into `.claude/skills/text-to-lottie/` — see its PROVENANCE.md) backs motion-designer with spec maps, motion-taste rules, and recipes; `Lab/vendor/lottie.min.js` (MIT) powers the Lab preview page at `/Lab/lottie/player.html`.
