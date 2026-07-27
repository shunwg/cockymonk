# Provenance — reference-shader-techniques

| | |
|---|---|
| Upstream | [majiayu000/claude-skill-registry](https://github.com/majiayu000/claude-skill-registry) — `skills/data/shader-techniques/SKILL.md` |
| Fetched | 2026-07-26, raw HTTP GET from `raw.githubusercontent.com` (`main`, 17580 bytes, HTTP 200) |
| Licence | **Not declared in the file.** The upstream repository's licence governs; check it before reusing any code from here outside this repo. |
| Found via | <https://snyk.io/articles/top-claude-skills-3d-modeling-game-dev-shader-programming/> |
| Bundled code | **None.** Pure markdown. Verified: no scripts, binaries, `curl`/`wget`, install commands, or external downloads. |

## Why it is here, and why it will never fire on its own

445 lines of HLSL/CG and GLSL: Unity surface shaders, a toon shader with an inverted-hull outline pass, a dissolve shader, a screen-space vignette, GPU cost tables, and a variant-stripping guide. Targets Unity URP/HDRP, Unreal, Godot, OpenGL, DirectX and Vulkan.

**Cocky Monk has no shader stage at all.** The Lab is DOM + CSS; iOS is SwiftUI. This is worth stating plainly because the confusion is easy to make: CSS `filter`, `backdrop-filter`, `mask-image`, `mix-blend-mode` and SVG `feTurbulence`/`feDisplacementMap` are *shader-adjacent in effect* but are not shaders — no vertex stage, no fragment program, no precision qualifiers, no variant compilation. Nothing in this file translates. Installed as background reading only, at the user's explicit request.

The auto-trigger was therefore removed. The body is byte-identical to upstream; only the frontmatter was replaced, and the original is preserved verbatim in `UPSTREAM-FRONTMATTER.txt`. The upstream description —

> Advanced shader programming, visual effects, custom materials, and rendering optimization for stunning game graphics.

— would have matched on "visual effects" and "rendering optimization", which is exactly the language someone uses when asking for a nicer reveal animation. The replacement says REFERENCE ONLY and states that CSS filters are not shaders.

Renamed `shader-techniques` → `reference-shader-techniques` to match its sibling.

## A note on the upstream frontmatter

It carries fields from a different agent framework, not the Agent Skills spec: `sasmp_version`, `bonded_agent: 03-graphics-rendering`, `bond_type: PRIMARY_BOND`, a typed `parameters:` list, `retry_policy`, and `observability` with log events and metrics. Claude Code reads only `name` and `description`, so the rest is inert — but it means this file was authored for another runtime and has not been validated against ours. Another reason to treat it as a document rather than a skill.

## Updating

```bash
curl -sSL https://raw.githubusercontent.com/majiayu000/claude-skill-registry/main/skills/data/shader-techniques/SKILL.md
```

Diff the body, keep the local frontmatter.
