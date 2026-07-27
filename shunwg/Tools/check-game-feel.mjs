#!/usr/bin/env node
// check-game-feel.mjs — the mechanically checkable half of .claude/skills/game-feel.
// Zero dependencies, cross-platform.
//
//   node Tools/check-game-feel.mjs           → report
//   node Tools/check-game-feel.mjs --check   → exit 1 on any FAIL
//
// WHAT THIS CAN AND CANNOT DO
// Most of the game-feel skill is judgement: whether a beat lands, whether an
// effect's claim is true, whether a duration feels right at arm's length. None
// of that is checkable and this file does not pretend otherwise.
//
// What IS checkable is the plumbing that the judgement depends on, and which
// rots silently: a haptic the tokens promise but nothing fires, a duration
// hardcoded next to the token holding the same number, a per-tick paint that
// grew a render() call and now eats the bluff textarea. Every rule below exists
// because that exact drift was found in this repo, not because it sounded good.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFile(join(ROOT, rel), "utf8");

const results = [];
const ok = (rule, msg) => results.push({ rule, pass: true, msg });
const fail = (rule, msg) => results.push({ rule, pass: false, msg });

// Principle 3: the surgical repaints must never re-render. shell() replaces
// app.innerHTML wholesale, so a render() reached from a per-tick path destroys
// whatever the player is typing — four times a second, during the one phase
// where they are mid-sentence.
async function p3_surgicalPaints(ui) {
  const RULE = "P3 surgical paint";
  // Scoped to the functions on the 250 ms CLOCK TICK. Event-driven repaints are
  // a different case and must not be swept in: botTickUI legitimately calls
  // render() behind `if (U.screen === "WAIT")`, because the waiting room has no
  // inputs to destroy, and switches to refreshGmAction() on the screen that does.
  // An earlier draft of this rule flagged that as a violation, which would have
  // taught the next reader to distrust the gate.
  const fns = ["ckPaint", "sirenSet"];
  let bad = [];
  for (const fn of fns) {
    const re = new RegExp(`function ${fn}\\s*\\([^)]*\\)\\s*\\{`);
    const m = ui.match(re);
    if (!m) continue;                       // not all exist in every revision
    // crude brace match from the declaration
    let i = ui.indexOf("{", m.index), depth = 0, end = i;
    for (; end < ui.length; end++) {
      if (ui[end] === "{") depth++;
      else if (ui[end] === "}" && --depth === 0) break;
    }
    const body = ui.slice(i, end);
    if (/\brender\(\)/.test(body)) bad.push(fn);
  }
  bad.length
    ? fail(RULE, `${bad.join(", ")} call render() — a per-tick repaint must write properties, never rebuild the DOM`)
    : ok(RULE, `${fns.length} per-tick paths verified render()-free`);
}

// Principle 4: the triad. tokens.json annotates a haptic on several springs;
// each must actually exist as an intent AND be fired by something.
async function p4_haptics(tokens, haptics, audio, ui) {
  const RULE = "P4 haptic triad";
  const named = [];
  for (const [spring, v] of Object.entries(tokens.motion.springs)) {
    const m = String(v.note ?? "").match(/\.(light|soft|success|heavy|warning)\b/);
    if (m) named.push([spring, m[1]]);
  }
  const missing = [], unwired = [];
  for (const [spring, intent] of named) {
    if (!new RegExp(`^\\s+${intent}:`, "m").test(haptics)) missing.push(`${spring}→.${intent}`);
    else if (!new RegExp(`["']${intent}["']`).test(audio + ui)) unwired.push(`${spring}→.${intent}`);
  }
  if (missing.length) fail(RULE, `intents named in tokens.json but absent from haptics.js: ${missing.join(", ")}`);
  else if (unwired.length) fail(RULE, `intents declared but never fired: ${unwired.join(", ")}`);
  else ok(RULE, `${named.length} token-named haptics declared and fired`);
}

// Principle 4, sound half — and a lesson about what the grammar actually IS.
//
// tokens.json → sound.grammar maps event names to AssetsIncoming/*.ogg paths:
// it is the iOS asset plan, not the Lab's event contract. The Lab synthesises
// its own voices and has always carried a partly different vocabulary
// (truthReveal vs the grammar's truthChime, win vs fanfare). So a name present
// there and absent here is usually an un-promoted iOS asset slot, NOT a silent
// beat — failing the build on it would be crying wolf.
//
// What is worth saying out loud: audio.js's header claims the two "mirror" each
// other. They don't, and the coverage number below is the honest version of
// that sentence.
async function p4_voices(tokens, audio) {
  const RULE = "P4 sound grammar";
  const grammar = tokens.sound?.grammar ?? {};
  const names = Object.keys(grammar).filter((k) => !k.startsWith("_"));
  if (!names.length) return ok(RULE, "no sound.grammar block to check");
  const voiced = names.filter((n) => new RegExp(`^\\s+${n}:`, "m").test(audio));
  const unvoiced = names.filter((n) => !voiced.includes(n));
  ok(RULE, `${voiced.length}/${names.length} grammar events have a Lab voice` +
    (unvoiced.length ? ` · iOS-only slots: ${unvoiced.join(", ")}` : ""));
}

// The anti-pattern the audit actually found: a literal sitting next to a token
// that holds the SAME number. Both are right today and they drift tomorrow,
// silently, because nothing connects them.
async function p_shadowedTokens(tokens, sources) {
  const RULE = "no shadowed tokens";
  const durs = Object.entries(tokens.motion.durations).filter(([k]) => !k.startsWith("_"));
  const hits = [];
  // Only literals that are unambiguously DURATIONS. A bare `\b300\b` also matches
  // a z-index, a hex fragment, a translate3d offset and a font weight — the first
  // draft of this rule reported 26 hits, of which almost none were real, and a
  // gate that cries wolf is worse than no gate.
  const asDuration = (ms) => [
    new RegExp(`\\b${ms}ms\\b`),                        // CSS
    new RegExp(`setTimeout\\([^,]+,\\s*${ms}\\s*\\)`),  // JS timer
    new RegExp(`\\blater\\([^,]+,\\s*${ms}\\s*\\)`),    // house timer helper
    new RegExp(`duration:\\s*${ms}\\b`),                // Web Animations
  ];
  for (const [name, ms] of durs) {
    if (typeof ms !== "number" || ms < 100) continue;      // tiny values collide with everything
    const kebab = name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    for (const [file, src] of Object.entries(sources)) {
      if (src.includes(`--motion-dur-${kebab}`)) continue;  // this file already uses the token
      if (asDuration(ms).some((re) => re.test(src))) hits.push(`${name}=${ms} literal in ${file}`);
    }
  }
  // ADVISORY, not a hard fail — and the distinction is the point. This rule
  // cannot tell "same number, same meaning" (a real shadow: the timeout that
  // strips .wobble duplicating the .wobble animation's own token) from "same
  // number, different meaning" (a 400 ms sparkle delay that merely collides with
  // optionRise). Only a human knows which. Failing the build on a coincidence
  // would train people to add allowlist entries until the rule means nothing, so
  // it reports candidates and leaves the judgement where it belongs.
  hits.length
    ? ok(RULE, `${hits.length} literal(s) equal to a token value — check each is a coincidence, not a shadow:\n` +
        hits.map((h) => `          ${h}`).join("\n"))
    : ok(RULE, `${durs.length} durations, no literal collides with a token value`);
}

// Principle 10: Reduced Motion is a variant, not an off switch. base.css kills
// every animation under the media query, so anything that STARTS hidden and is
// revealed only by a keyframe becomes permanently invisible. Each such class
// needs an explicit rescue.
async function p10_reducedMotion(css) {
  const RULE = "P10 reduced-motion";
  const rm = css.base.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\n\}/);
  if (!rm) return fail(RULE, "no prefers-reduced-motion block in base.css");
  const blanket = /animation:\s*none\s*!important/.test(rm[0]);
  if (!blanket) return ok(RULE, "no blanket animation kill — per-rule handling, nothing to rescue");

  const all = Object.values(css).join("\n");
  // classes that set opacity:0 and rely on an animation to bring them back
  const risky = [...all.matchAll(/\.([\w-]+)\s*\{[^}]*opacity:\s*0\s*;[^}]*animation:[^}]*\}/g)]
    .map((m) => m[1]);
  const rescued = risky.filter((c) => new RegExp(`\\.${c}\\b[^{]*\\{[^}]*opacity:\\s*1\\s*!important`).test(rm[0]));
  const stranded = risky.filter((c) => !rescued.includes(c));
  stranded.length
    ? fail(RULE, `starts at opacity:0 and is only revealed by an animation, so invisible under Reduced Motion: .${stranded.join(", .")}`)
    : ok(RULE, `blanket kill present; ${risky.length} at-risk class(es) all rescued`);
}

// Orphans are not a failure — a token can legitimately wait for its moment — but
// a growing pile means the vocabulary and the implementation have stopped
// talking, so the count is reported.
async function orphanTokens(tokens, all) {
  const RULE = "token adoption";
  const durs = Object.keys(tokens.motion.durations).filter((k) => !k.startsWith("_"));
  const orphans = durs.filter((name) => {
    const kebab = name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    return !all.includes(`--motion-dur-${kebab}`);
  });
  ok(RULE, `${durs.length - orphans.length}/${durs.length} duration tokens consumed` +
    (orphans.length ? ` · unused: ${orphans.join(", ")}` : ""));
}

async function main() {
  const tokens = JSON.parse(await read("DesignSystem/tokens.json"));
  const ui = await read("Lab/js/ui.js");
  const audio = await read("Lab/js/audio.js");
  const haptics = await read("Lab/js/haptics.js").catch(() => "");
  const css = {
    base: await read("Lab/css/base.css"),
    components: await read("Lab/css/components.css"),
    screens: await read("Lab/css/screens.css"),
    themes: await read("Lab/css/themes.css"),
  };
  // tokens.css is generated FROM tokens.json, so it always "contains" every
  // token and would make every adoption check pass. Deliberately excluded.
  const consumers = { "ui.js": ui, ...Object.fromEntries(Object.entries(css).map(([k, v]) => [k + ".css", v])) };

  await p3_surgicalPaints(ui);
  await p4_haptics(tokens, haptics, audio, ui);
  await p4_voices(tokens, audio);
  await p_shadowedTokens(tokens, consumers);
  await p10_reducedMotion(css);
  await orphanTokens(tokens, Object.values(consumers).join("\n"));

  console.log("\ngame-feel conformance — the checkable half of .claude/skills/game-feel\n");
  for (const r of results) {
    console.log(`  ${r.pass ? "ok  " : "FAIL"}  ${r.rule.padEnd(22)} ${r.msg}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n  ${results.length - failed}/${results.length} rules pass` +
    (failed ? `  —  judgement rules (does the beat land? is the claim true?) are NOT checkable here; read the skill.\n` : "\n"));

  if (process.argv.includes("--check") && failed) process.exit(1);
}

main().catch((e) => { console.error("check-game-feel failed:", e); process.exit(1); });
