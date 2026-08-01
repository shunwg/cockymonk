# Provenance — reference-game-developer

| | |
|---|---|
| Upstream | [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) — `skills/game-developer/SKILL.md` |
| Fetched | 2026-07-26, raw HTTP GET from `raw.githubusercontent.com` (`main`, 5722 bytes, HTTP 200) |
| Licence | MIT (declared in the upstream frontmatter) |
| Found via | <https://snyk.io/articles/top-claude-skills-3d-modeling-game-dev-shader-programming/> |
| Bundled code | **None.** Pure markdown. Verified: no scripts, binaries, `curl`/`wget`, install commands, or external downloads. |

## Why it is here, and why it will never fire on its own

This skill is **Unity and Unreal**: C# `MonoBehaviour`, C++ Actors, ECS, colliders, object pooling, `GetComponent` caching, lag compensation, Unity Profiler / Unreal Insights. Snifferoo has no game engine, no physics engine, no WebGL and no compiled render loop — the Lab is DOM + CSS and the app is SwiftUI. **Nothing in this file applies to our stack.** It is installed as background reading only, at the user's explicit request.

Because it does not apply, the auto-trigger has been removed. The body is byte-identical to upstream; only the frontmatter `description` was replaced. The original is preserved verbatim in `UPSTREAM-FRONTMATTER.txt`, and its trigger list was the problem:

> `Trigger keywords: Unity, Unreal Engine, game development, ECS architecture, game physics, multiplayer networking, game optimization, shader programming, game AI`

"game development", "game optimization" and "multiplayer networking" all describe work we do every day, so left alone this skill would load itself into ordinary Snifferoo sessions and answer CSS questions with object pooling. The replacement description says REFERENCE ONLY and names `game-feel` as the skill to use instead.

Renamed `game-developer` → `reference-game-developer` so the prefix reads as reference at a glance in the skills list.

## Known incompleteness

The upstream `SKILL.md` defers most of its content to five files that were **not** fetched and do not exist here:

`references/unity-patterns.md` · `references/unreal-cpp.md` · `references/ecs-patterns.md` · `references/performance-optimization.md` · `references/multiplayer-networking.md`

So what is installed is the index plus three Unity C# code patterns. That is deliberate — pulling five more files of engine guidance into a project that has no engine would be storage without purpose. If Unity work ever becomes real, fetch them from upstream then.

## Updating

Re-fetch the single file, diff the body against this copy, and keep the local `description`:

```bash
curl -sSL https://raw.githubusercontent.com/Jeffallan/claude-skills/main/skills/game-developer/SKILL.md
```
