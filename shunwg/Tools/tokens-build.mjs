#!/usr/bin/env node
// tokens-build.mjs — Snifferoo design-token pipeline (LANES.md seam 2).
//
// Reads DesignSystem/tokens.json (single source of truth) and emits:
//   1. Lab/css/tokens.css              — CSS custom properties for the Lab
//   2. (retired 2026-07-28) Sources/DesignSystem/Theme.swift — SwiftUI token enums
//   3. DesignSystem/DESIGN-TOKENS.md    — human-readable reference w/ WCAG contrast
//
// Usage:
//   node Tools/tokens-build.mjs          # regenerate all three outputs
//   node Tools/tokens-build.mjs --check  # byte-compare vs committed files; exit 1 on drift
//
// Zero dependencies. Node 18+. Deterministic output (same input → same bytes).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS_REL = "DesignSystem/tokens.json";
const tokens = JSON.parse(readFileSync(join(ROOT, TOKENS_REL), "utf8"));

const HEADER = "GENERATED from DesignSystem/tokens.json — do not edit (run: node Tools/tokens-build.mjs)";

/* ---------------- reference resolution ---------------- */

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Resolve "{color.palette.x}" reference strings, recursively (a ref may point at a ref). */
function resolveRef(value, seen = new Set()) {
  if (typeof value !== "string") return value;
  const m = value.match(/^\{([\w.]+)\}$/);
  if (!m) return value;
  if (seen.has(m[1])) throw new Error(`Circular token reference: {${m[1]}}`);
  seen.add(m[1]);
  const target = getPath(tokens, m[1]);
  if (target === undefined) throw new Error(`Unresolved token reference: ${value}`);
  return resolveRef(target, seen);
}

/* ---------------- small helpers ---------------- */

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const isMeta = (k) => k.startsWith("_");

/** Parse "#RRGGBB" or "#RRGGBBAA" → { r, g, b, a } (a in 0..1). */
function parseHex(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/** Parse "rgba(r,g,b,a)" → { r, g, b, a }. */
function parseRgba(str) {
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) throw new Error(`Cannot parse color: ${str}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

const toHex6 = ({ r, g, b }) =>
  "0x" + [r, g, b].map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("");

const round3 = (n) => Math.round(n * 1000) / 1000;

/** Flatten a nested token object to [ [pathSegments...], leafValue ] pairs, skipping _meta keys. */
function flatten(obj, prefix = []) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (isMeta(k)) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v, [...prefix, k]));
    } else {
      out.push([[...prefix, k], v]);
    }
  }
  return out;
}

/* ---------------- spring → CSS ease approximation ----------------
 * Apple springs are {duration, bounce}. CSS has no springs, so we approximate:
 *
 *   ease(bounce) = cubic-bezier(0.34, 1 + 1.5 × bounce, 0.64, 1)
 *
 * The first control point's y overshoots past 1 in proportion to bounce, which
 * mimics a single spring overshoot-and-settle. Calibrated against the frozen
 * demo's hand-tuned beziers: bounce 0.40 → (.34, 1.60, .64, 1) [pop],
 * 0.37 → (.34, 1.555, .64, 1) [nose ≈ .34,1.56], 0.27 → (.34, 1.405, .64, 1)
 * [pawn ≈ .34,1.4]. bounce 0 degrades to a plain ease-out (.34, 1, .64, 1).
 */
function springEase(bounce) {
  const y1 = round3(1 + 1.5 * bounce);
  return `cubic-bezier(0.34, ${y1}, 0.64, 1)`;
}

/* ---------------- WCAG contrast ---------------- */

function relLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hexA, hexB) {
  const la = relLuminance(hexA);
  const lb = relLuminance(hexB);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ================================================================
 * Output 1 — Lab/css/tokens.css
 * ================================================================ */

function buildCss() {
  const L = [];
  L.push(`/* ${HEADER} */`);
  L.push(`/* Source: ${tokens.meta.source} */`);
  L.push("");
  L.push("/* Spring → CSS ease approximation: each Apple spring {duration, bounce} is");
  L.push(" * emitted as --spring-<name>-duration (seconds) and --spring-<name>-ease,");
  L.push(" * where ease = cubic-bezier(0.34, 1 + 1.5 × bounce, 0.64, 1) — the y1 control");
  L.push(" * point overshoots past 1 in proportion to bounce (single overshoot-and-settle).");
  L.push(" * Calibrated to the frozen demo: bounce .40→(.34,1.6,.64,1), .37→(.34,1.56,.64,1),");
  L.push(" * .27→(.34,1.4,.64,1). bounce 0 degrades to ease-out (.34,1,.64,1). */");
  L.push("");
  L.push(":root {");

  L.push("  /* ---- color.palette ---- */");
  for (const [name, v] of Object.entries(tokens.color.palette)) {
    if (isMeta(name) || Array.isArray(v)) continue;
    L.push(`  --color-${kebab(name)}: ${v};`);
  }
  tokens.color.palette.player.forEach((hex, i) => L.push(`  --color-player-${i + 1}: ${hex};`));
  tokens.color.palette.confetti.forEach((hex, i) => L.push(`  --color-confetti-${i + 1}: ${hex};`));

  L.push("");
  L.push("  /* ---- color.semantic (resolved from core) ---- */");
  for (const [path, v] of flatten(tokens.color.semantic)) {
    L.push(`  --color-${path.map(kebab).join("-")}: ${resolveRef(v)};`);
  }

  L.push("");
  L.push("  /* ---- color.themes — background-layer overrides only (DESIGN.md §3) ---- */");
  for (const [path, v] of flatten(tokens.color.themes)) {
    L.push(`  --color-theme-${path.map(kebab).join("-")}: ${resolveRef(v)};`);
  }

  L.push("");
  L.push("  /* ---- radius ---- */");
  for (const [name, v] of Object.entries(tokens.radius)) {
    if (isMeta(name)) continue;
    L.push(`  --radius-${kebab(name)}: ${v}px;`);
  }

  L.push("");
  L.push("  /* ---- shadow (hard offset, no blur — DESIGN.md §2) ---- */");
  const sh = tokens.shadow.hardOffset;
  L.push(`  --shadow-hard: ${sh.x}px ${sh.y}px ${sh.blur} ${sh.color};`);
  L.push(`  --shadow-hard-pressed: 1px ${tokens.shadow.press.compressedOffsetY}px 0 ${sh.color}; /* press: translateY(${tokens.shadow.press.translateY}px) + compressed shadow */`);
  L.push(`  --shadow-press-translate: ${tokens.shadow.press.translateY}px;`);

  L.push("");
  L.push("  /* ---- type ---- */");
  L.push(`  --type-display-family: ${tokens.type.display.cssStack};`);
  L.push(`  --type-display-weights: ${tokens.type.display.weights.join(" ")}; /* informational */`);
  for (const [name, spec] of Object.entries(tokens.type.scale)) {
    if (isMeta(name)) continue;
    const n = kebab(name);
    L.push(`  --type-${n}-size: ${spec.cssClamp ?? `${spec.size}px`};`);
    if (spec.weight !== undefined) L.push(`  --type-${n}-weight: ${spec.weight};`);
    if (spec.tracking !== undefined) {
      const tr = typeof spec.tracking === "string" ? spec.tracking : `${spec.tracking}px`;
      L.push(`  --type-${n}-tracking: ${tr};`);
    }
    if (spec.lineHeight !== undefined) L.push(`  --type-${n}-line-height: ${spec.lineHeight};`);
  }

  L.push("");
  L.push("  /* ---- motion.durations (Reduced Motion: see tokens.json motion.durations._reducedMotion) ---- */");
  for (const [name, v] of Object.entries(tokens.motion.durations)) {
    if (isMeta(name)) continue;
    L.push(`  --motion-dur-${kebab(name)}: ${v}ms;`);
  }

  L.push("");
  L.push("  /* ---- motion.springs (duration in s + cubic-bezier approximation) ---- */");
  for (const [name, spec] of Object.entries(tokens.motion.springs)) {
    if (isMeta(name)) continue;
    L.push(`  --spring-${kebab(name)}-duration: ${spec.duration}s;`);
    L.push(`  --spring-${kebab(name)}-ease: ${springEase(spec.bounce)};`);
  }

  L.push("}");
  L.push("");
  L.push("/* Reduced Motion (DESIGN.md §9): hops → slides, pops/bobs → crossfades,");
  L.push(" * nose growth → crossfade to final length, drifting stars → static. */");
  L.push("@media (prefers-reduced-motion: reduce) {");
  L.push("  :root {");
  for (const [name] of Object.entries(tokens.motion.springs)) {
    if (isMeta(name)) continue;
    L.push(`    --spring-${kebab(name)}-ease: ease-out;`);
  }
  L.push("  }");
  L.push("}");
  L.push("");
  return L.join("\n");
}

/* ================================================================
 * Output 2 — Sources/DesignSystem/Theme.swift
 * ================================================================ */

function swiftColor(value) {
  if (value.startsWith("#")) {
    const { a } = parseHex(value);
    const hex6 = toHex6(parseHex(value));
    return a === 1 ? `Color(hex: ${hex6})` : `Color(hex: ${hex6}, opacity: ${round3(a)})`;
  }
  if (value.startsWith("rgb")) {
    const c = parseRgba(value);
    return c.a === 1 ? `Color(hex: ${toHex6(c)})` : `Color(hex: ${toHex6(c)}, opacity: ${round3(c.a)})`;
  }
  throw new Error(`Cannot emit Swift color for: ${value}`);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const camelJoin = (segs) => segs.map((s, i) => (i === 0 ? s : cap(s))).join("");

function buildSwift() {
  const L = [];
  L.push(`// ${HEADER}`);
  L.push(`// Source: ${tokens.meta.source}`);
  L.push("// Reduced Motion (DESIGN.md §9): hops → slides, pops/bobs → crossfades,");
  L.push("// nose growth → crossfade to final length. Check accessibilityReduceMotion");
  L.push("// before using Springs.* and fall back to .easeOut or a crossfade.");
  L.push("");
  L.push("import SwiftUI");
  L.push("");
  L.push("extension Color {");
  L.push("    /// 24-bit RGB hex initializer, e.g. `Color(hex: 0x1B1B2E)`.");
  L.push("    init(hex: UInt32, opacity: Double = 1.0) {");
  L.push("        self.init(");
  L.push("            .sRGB,");
  L.push("            red: Double((hex >> 16) & 0xFF) / 255.0,");
  L.push("            green: Double((hex >> 8) & 0xFF) / 255.0,");
  L.push("            blue: Double(hex & 0xFF) / 255.0,");
  L.push("            opacity: opacity");
  L.push("        )");
  L.push("    }");
  L.push("}");
  L.push("");
  L.push("/// Design tokens — the only place visual constants live. Never inline hexes or timings in Views.");
  L.push("enum Theme {");

  // -- ColorToken --
  L.push("");
  L.push("    enum ColorToken {");
  L.push("");
  L.push("        // Core palette (DESIGN.md §2)");
  for (const [name, v] of Object.entries(tokens.color.palette)) {
    if (isMeta(name) || Array.isArray(v)) continue;
    L.push(`        static let ${name} = ${swiftColor(v)}  // ${v}`);
  }
  L.push("");
  L.push("        /// 8 fixed player identity colors (demo AVA[]) — fills with ink borders.");
  L.push("        /// Never the ONLY signal of identity: the name and marker carry it too (DESIGN.md §9).");
  L.push("        static let playerPalette: [Color] = [");
  for (const hex of tokens.color.palette.player) L.push(`            ${swiftColor(hex)},  // ${hex}`);
  L.push("        ]");
  L.push("");
  L.push("        /// 5 confetti colors (demo confetti()).");
  L.push("        static let confettiPalette: [Color] = [");
  for (const hex of tokens.color.palette.confetti) L.push(`            ${swiftColor(hex)},  // ${hex}`);
  L.push("        ]");
  L.push("");
  L.push("        // Semantic roles (resolve to core — keep Views on these, not on core names)");
  for (const [path, v] of flatten(tokens.color.semantic)) {
    const resolved = resolveRef(v);
    const refNote = typeof v === "string" && v.startsWith("{") ? v.slice(1, -1).replace("color.palette.", "") : resolved;
    if (resolved.startsWith("#") && resolved.length === 7 && typeof v === "string" && v.startsWith("{")) {
      L.push(`        static let ${camelJoin(path)} = ${refNote}  // ${resolved}`);
    } else {
      L.push(`        static let ${camelJoin(path)} = ${swiftColor(resolved)}  // ${resolved}`);
    }
  }
  L.push("    }");

  // -- ThemeBackground --
  L.push("");
  L.push("    /// Per-theme BACKGROUND-LAYER overrides only (DESIGN.md §3). Rules code never branches on theme.");
  L.push("    enum ThemeBackground {");
  for (const [themeName, layers] of Object.entries(tokens.color.themes)) {
    if (isMeta(themeName)) continue;
    L.push(`        enum ${cap(themeName)} {`);
    for (const [layer, hex] of Object.entries(layers)) {
      if (isMeta(layer)) continue;
      L.push(`            static let ${layer} = ${swiftColor(resolveRef(hex))}  // ${resolveRef(hex)}`);
    }
    L.push("        }");
  }
  L.push("    }");

  // -- Radius --
  L.push("");
  L.push("    enum Radius {");
  for (const [name, v] of Object.entries(tokens.radius)) {
    if (isMeta(name)) continue;
    L.push(`        static let ${name}: CGFloat = ${v}`);
  }
  L.push("    }");

  // -- Shadow --
  L.push("");
  L.push("    /// Hard offset shadows only — never soft material shadows (DESIGN.md §2).");
  L.push("    enum Shadow {");
  L.push(`        static let hardOffsetX: CGFloat = ${tokens.shadow.hardOffset.x}`);
  L.push(`        static let hardOffsetY: CGFloat = ${tokens.shadow.hardOffset.y}`);
  L.push(`        static let hardBlur: CGFloat = ${tokens.shadow.hardOffset.blur}`);
  L.push(`        static let hardColor = ${swiftColor(tokens.shadow.hardOffset.color)}  // ${tokens.shadow.hardOffset.color}`);
  L.push(`        /// Mechanical press: translate ${tokens.shadow.press.translateY} pt down, under-shadow compresses to ${tokens.shadow.press.compressedOffsetY} pt.`);
  L.push(`        static let pressTranslateY: CGFloat = ${tokens.shadow.press.translateY}`);
  L.push(`        static let pressedOffsetY: CGFloat = ${tokens.shadow.press.compressedOffsetY}`);
  L.push("    }");

  // -- TypeScale --
  L.push("");
  L.push(`    /// Display face: ${tokens.type.display.family} (weights ${tokens.type.display.weights.join("/")}, ${tokens.type.display.license.split(",")[0]}); fallback ${tokens.type.display.fallback}.`);
  L.push(`    /// Body/UI: ${tokens.type.body.family} — ${tokens.type.body.note}.`);
  L.push("    enum TypeScale {");
  L.push(`        static let displayFamily = "${tokens.type.display.family}"`);
  for (const [name, spec] of Object.entries(tokens.type.scale)) {
    if (isMeta(name)) continue;
    const comment = spec.note ? `  // ${spec.note}` : "";
    L.push(`        static let ${name}Size: CGFloat = ${spec.size}${comment}`);
    if (spec.tracking !== undefined) {
      if (typeof spec.tracking === "string") {
        L.push(`        static let ${name}TrackingEm: CGFloat = ${parseFloat(spec.tracking)}  // em (${spec.tracking})`);
      } else {
        L.push(`        static let ${name}Tracking: CGFloat = ${spec.tracking}  // pt`);
      }
    }
  }
  L.push("    }");

  // -- Durations --
  L.push("");
  L.push("    /// Fixed timings in seconds (tokens.json stores ms).");
  L.push("    enum Durations {");
  for (const [name, v] of Object.entries(tokens.motion.durations)) {
    if (isMeta(name)) continue;
    L.push(`        static let ${name}: TimeInterval = ${round3(v / 1000)}`);
  }
  L.push("    }");

  // -- Springs --
  L.push("");
  L.push("    /// Apple springs (duration, bounce). Reduced Motion: fall back per DESIGN.md §9.");
  L.push("    enum Springs {");
  for (const [name, spec] of Object.entries(tokens.motion.springs)) {
    if (isMeta(name)) continue;
    if (spec.note) L.push(`        /// ${spec.note}`);
    L.push(`        static let ${name} = Animation.spring(duration: ${spec.duration}, bounce: ${spec.bounce})`);
  }
  L.push("");
  L.push("        // Companion constants for spring choreography");
  for (const [name, spec] of Object.entries(tokens.motion.springs)) {
    if (isMeta(name)) continue;
    if (spec.staggerGapMs !== undefined) L.push(`        static let ${name}GapSeconds: TimeInterval = ${round3(spec.staggerGapMs / 1000)}`);
    if (spec.risePt !== undefined) L.push(`        static let ${name}RisePt: CGFloat = ${spec.risePt}`);
    if (spec.scaleFrom !== undefined) L.push(`        static let ${name}ScaleFrom: CGFloat = ${spec.scaleFrom}`);
    if (spec.unRotateDeg !== undefined) L.push(`        static let ${name}UnRotateDeg: CGFloat = ${spec.unRotateDeg}`);
    if (spec.amplitudePt !== undefined) L.push(`        static let ${name}AmplitudePt: CGFloat = ${spec.amplitudePt}`);
  }
  L.push("    }");

  // -- SoundEvent --
  L.push("");
  L.push("    /// Sound grammar events (LANES.md seam 4): UI triggers by NAME, never by filename.");
  L.push("    /// File mapping lives in tokens.json → sound.grammar; lane C promotes files into Resources/Audio/.");
  L.push("    enum SoundEvent: String, CaseIterable {");
  for (const [name, file] of Object.entries(tokens.sound.grammar)) {
    if (isMeta(name)) continue;
    L.push(`        case ${name}  // ${file}`);
  }
  L.push("    }");

  L.push("}");
  L.push("");
  return L.join("\n");
}

/* ================================================================
 * Output 3 — DesignSystem/DESIGN-TOKENS.md
 * ================================================================ */

function buildMarkdown() {
  const L = [];
  const sem = tokens.color.semantic;
  const resolvedBg = resolveRef(sem.bg);
  const resolvedSurface = resolveRef(sem.surface);

  L.push(`<!-- ${HEADER} -->`);
  L.push("");
  L.push("# Snifferoo design tokens");
  L.push("");
  L.push(`Source of truth: \`DesignSystem/tokens.json\` (v${tokens.meta.version}) — ${tokens.meta.source}.`);
  L.push(`Generated outputs: ${tokens.meta.generatedOutputs.map((p) => `\`${p}\``).join(" · ")}.`);
  L.push(`${tokens.meta.rule}.`);
  L.push("");

  L.push("## Core colors (DESIGN.md §2)");
  L.push("");
  L.push("| Token | Hex | Use |");
  L.push("|---|---|---|");
  const coreUse = {
    inkNight: "App background base",
    paper: "Cards, sheets",
    inkText: "Text and borders on paper",
    paperText: "Text on inkNight",
    truthGreen: "Truth reveal, correct vote",
    bluffPink: "Bluff unmasking, bluff points, the Nose",
    turnYellow: "Primary CTA, active player",
    gmViolet: "Everything game-master: dashboard chrome, GM chip, decoys, victory sting",
    mutedViolet: "Secondary text, dividers, eyebrows",
  };
  for (const [name, v] of Object.entries(tokens.color.palette)) {
    if (isMeta(name) || Array.isArray(v)) continue;
    L.push(`| \`${name}\` | \`${v}\` | ${coreUse[name] ?? ""} |`);
  }
  L.push("");
  L.push("### Avatar palette (demo `AVA[]`, 8 fixed)");
  L.push("");
  L.push("| # | Hex |");
  L.push("|---|---|");
  tokens.color.palette.player.forEach((hex, i) => L.push(`| ${i + 1} | \`${hex}\` |`));
  L.push("");
  L.push("### Confetti palette (demo `confetti()`, 5)");
  L.push("");
  L.push("| # | Hex |");
  L.push("|---|---|");
  tokens.color.palette.confetti.forEach((hex, i) => L.push(`| ${i + 1} | \`${hex}\` |`));
  L.push("");

  L.push("## Semantic roles");
  L.push("");
  L.push("| Role | References | Resolves to |");
  L.push("|---|---|---|");
  for (const [path, v] of flatten(sem)) {
    const ref = typeof v === "string" && v.startsWith("{") ? `\`${v}\`` : "*(literal)*";
    L.push(`| \`${path.join(".")}\` | ${ref} | \`${resolveRef(v)}\` |`);
  }
  L.push("");

  L.push("## Contrast (WCAG 2.1, AA text threshold 4.5:1)");
  L.push("");
  L.push("Text-role tokens against their background tokens. Ratios to two decimals; < 4.50 flagged ⚠.");
  L.push("");
  L.push("| Foreground | Background | Ratio | AA |");
  L.push("|---|---|---|---|");
  const pairs = [
    ["text.onSurface (inkText)", resolveRef(sem.text.onSurface), "surface (paper)", resolvedSurface],
    ["text.onBg (paperText)", resolveRef(sem.text.onBg), "bg (inkNight)", resolvedBg],
    ["text.secondary (mutedViolet)", resolveRef(sem.text.secondary), "bg (inkNight)", resolvedBg],
    ["accent.truth (truthGreen)", resolveRef(sem.accent.truth), "bg (inkNight)", resolvedBg],
    ["accent.bluff (bluffPink)", resolveRef(sem.accent.bluff), "bg (inkNight)", resolvedBg],
    ["accent.gm (gmViolet)", resolveRef(sem.accent.gm), "bg (inkNight)", resolvedBg],
    ["accent.turn (turnYellow)", resolveRef(sem.accent.turn), "bg (inkNight)", resolvedBg],
    // Countdown ring (PRD §5.2a). The numeral inside it is real text a player
    // reads under time pressure, so it answers to the same 4.5:1 floor.
    ["timer.calm (mutedViolet)", resolveRef(sem.timer.calm), "bg (inkNight)", resolvedBg],
    ["timer.warn (turnYellow)", resolveRef(sem.timer.warn), "bg (inkNight)", resolvedBg],
    ["timer.urgent (bluffPink)", resolveRef(sem.timer.urgent), "bg (inkNight)", resolvedBg],
  ];
  for (const [fgName, fg, bgName, bg] of pairs) {
    const ratio = contrastRatio(fg, bg);
    const flag = ratio < 4.5 ? "⚠" : "✓";
    L.push(`| \`${fgName}\` \`${fg}\` | \`${bgName}\` \`${bg}\` | ${ratio.toFixed(2)} | ${flag} |`);
  }
  L.push("");
  L.push("DESIGN.md §9 floor: contrast ≥ 4.5:1 on **every theme background** — snapshot-test all three.");
  L.push("");

  L.push("## Theme background layers (overrides only — DESIGN.md §3)");
  L.push("");
  L.push("| Theme | Layer | Value |");
  L.push("|---|---|---|");
  for (const [themeName, layers] of Object.entries(tokens.color.themes)) {
    if (isMeta(themeName)) continue;
    for (const [layer, hex] of Object.entries(layers)) {
      if (isMeta(layer)) continue;
      L.push(`| ${themeName} | \`${layer}\` | \`${resolveRef(hex)}\` |`);
    }
  }
  L.push("");
  L.push("Identical space geometry and pawn physics across themes; only layers, sprites, particles, and sounds differ.");
  L.push("");

  L.push("## Type");
  L.push("");
  L.push(`Display: **${tokens.type.display.family}** (weights ${tokens.type.display.weights.join("/")}, ${tokens.type.display.license}). Fallback: ${tokens.type.display.fallback}.`);
  L.push(`Body/UI: **${tokens.type.body.family}** — ${tokens.type.body.note}.`);
  L.push("");
  L.push("| Role | Size (pt) | Weight | Tracking | Notes |");
  L.push("|---|---|---|---|---|");
  for (const [name, spec] of Object.entries(tokens.type.scale)) {
    if (isMeta(name)) continue;
    const tr = spec.tracking === undefined ? "—" : typeof spec.tracking === "string" ? `+${spec.tracking}` : `${spec.tracking} pt`;
    const notes = [spec.uppercase ? "uppercase" : "", spec.cssClamp ? `CSS: \`${spec.cssClamp}\`` : "", spec.note ?? ""].filter(Boolean).join("; ");
    L.push(`| \`${name}\` | ${spec.size} | ${spec.weight ?? "—"} | ${tr} | ${notes} |`);
  }
  L.push("");

  L.push("## Radius & shadow");
  L.push("");
  L.push("| Token | Value |");
  L.push("|---|---|");
  for (const [name, v] of Object.entries(tokens.radius)) {
    if (isMeta(name)) continue;
    L.push(`| \`radius.${name}\` | ${v} pt |`);
  }
  const s = tokens.shadow.hardOffset;
  L.push(`| \`shadow.hardOffset\` | x ${s.x} / y ${s.y} / blur ${s.blur} / \`${s.color}\` |`);
  L.push(`| \`shadow.press\` | translate ${tokens.shadow.press.translateY} pt down, shadow compresses to ${tokens.shadow.press.compressedOffsetY} pt |`);
  L.push("");
  L.push(`> ${tokens.shadow.press.note}`);
  L.push("");

  L.push("## Motion — durations");
  L.push("");
  L.push(`Unit: ms. ${tokens.motion.durations._reducedMotion}`);
  L.push("");
  L.push("| Token | ms |");
  L.push("|---|---|");
  for (const [name, v] of Object.entries(tokens.motion.durations)) {
    if (isMeta(name)) continue;
    L.push(`| \`${name}\` | ${v} |`);
  }
  L.push("");

  L.push("## Motion — springs");
  L.push("");
  L.push(`${tokens.motion.springs._format}`);
  L.push("");
  L.push(`Reduced Motion: ${tokens.motion.springs._reducedMotion}`);
  L.push("");
  L.push("| Spring | Duration (s) | Bounce | CSS ease approx. | Extras | Note |");
  L.push("|---|---|---|---|---|---|");
  for (const [name, spec] of Object.entries(tokens.motion.springs)) {
    if (isMeta(name)) continue;
    const extras = [];
    if (spec.staggerGapMs !== undefined) extras.push(`gap ${spec.staggerGapMs} ms`);
    if (spec.risePt !== undefined) extras.push(`rise ${spec.risePt} pt`);
    if (spec.scaleFrom !== undefined) extras.push(`scale ${spec.scaleFrom}→1`);
    if (spec.unRotateDeg !== undefined) extras.push(`${spec.unRotateDeg}° un-rotate`);
    if (spec.amplitudePt !== undefined) extras.push(`±${spec.amplitudePt} pt`);
    if (spec.loops) extras.push("loops");
    L.push(`| \`${name}\` | ${spec.duration} | ${spec.bounce} | \`${springEase(spec.bounce)}\` | ${extras.join(", ") || "—"} | ${spec.note ?? ""} |`);
  }
  L.push("");

  L.push("## Sound grammar");
  L.push("");
  L.push(`${tokens.sound.rules}`);
  L.push("");
  L.push("| Event | File | Status |");
  L.push("|---|---|---|");
  for (const [name, file] of Object.entries(tokens.sound.grammar)) {
    if (isMeta(name)) continue;
    const todo = file === "TODO:original";
    const note = tokens.sound._grammarNotes?.[name];
    const status = todo ? "🔴 needs original" : "✓ Kenney CC0";
    L.push(`| \`${name}\` | \`${file}\`${note ? ` — ${note}` : ""} | ${status} |`);
  }
  L.push("");
  return L.join("\n");
}

/* ================================================================
 * Main — write or --check
 * ================================================================ */

// Warn (stderr, non-fatal) if a mapped sound file does not exist on disk.
for (const [event, file] of Object.entries(tokens.sound.grammar)) {
  if (isMeta(event) || file === "TODO:original") continue;
  if (!existsSync(join(ROOT, file))) {
    console.error(`WARN sound.grammar.${event}: file not found: ${file}`);
  }
}

// Sources/DesignSystem/Theme.swift was a third target until 2026-07-28. The iOS
// scaffolding it fed was deleted (nothing was ever built against it), and a
// generator target with no consumer is a file that exists only to be checked.
// buildSwift() is kept below, unreferenced, so restoring the iOS bridge is one
// line here rather than a rewrite — see MAC_RUNBOOK.md.
const outputs = [
  { rel: "Lab/css/tokens.css", content: buildCss() },
  { rel: "DesignSystem/DESIGN-TOKENS.md", content: buildMarkdown() },
];

const checkMode = process.argv.includes("--check");

if (checkMode) {
  let drifted = 0;
  for (const o of outputs) {
    const p = join(ROOT, o.rel);
    if (!existsSync(p)) {
      console.error(`DRIFT ${o.rel}: file missing`);
      drifted++;
      continue;
    }
    const committed = readFileSync(p, "utf8");
    if (committed === o.content) continue;
    drifted++;
    const a = committed.split("\n");
    const b = o.content.split("\n");
    let firstDiff = -1;
    let diffCount = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        diffCount++;
        if (firstDiff < 0) firstDiff = i;
      }
    }
    console.error(`DRIFT ${o.rel}: ${diffCount} line(s) differ, first at line ${firstDiff + 1}`);
    console.error(`  committed: ${JSON.stringify((a[firstDiff] ?? "<missing>").slice(0, 120))}`);
    console.error(`  generated: ${JSON.stringify((b[firstDiff] ?? "<missing>").slice(0, 120))}`);
  }
  if (drifted > 0) {
    console.error(`tokens --check FAILED: ${drifted} of ${outputs.length} generated file(s) drifted from ${TOKENS_REL}.`);
    console.error("Never resolve by hand — regenerate: node Tools/tokens-build.mjs");
    process.exit(1);
  }
  console.log(`tokens --check OK: ${outputs.length} generated files match ${TOKENS_REL}`);
} else {
  for (const o of outputs) {
    const p = join(ROOT, o.rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, o.content, "utf8");
    console.log(`wrote ${o.rel} (${Buffer.byteLength(o.content, "utf8")} bytes)`);
  }
}
