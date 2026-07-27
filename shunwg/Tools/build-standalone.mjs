#!/usr/bin/env node
// build-standalone.mjs — bundle the Lab into ONE self-contained HTML file that
// plays with zero install: no Node, no server, no network. Double-click on any
// OS. Zero dependencies.
//
// It inlines: all CSS, all JS modules (concatenated into ONE classic script —
// no ES-module/blob machinery, so it loads from file:// on every browser with
// zero origin caveats), the full deck_nb/deck_en + fakes, the six Lottie
// celebration JSONs, and vendored lottie-web + PeerJS. Fonts are base64-inlined,
// so the brand survives offline (DESIGN.md §2).
//
// Safe to concatenate only because the modules share no top-level name, and
// each reads others' names at call time, after all declarations evaluate in
// dependency order. That invariant is now enforced rather than trusted:
// `node --test Lab/js/online.test.mjs` reads JS_MODULES below and fails on any
// collision — a clash here is a SyntaxError that appears ONLY in the bundle,
// never while serving the Lab, so it must not depend on anyone remembering.
// Per-module prefixes: fixtures.js → fx*, clock.js → ck*, rating.js → rt*, net.js → nt*.
//
// Usage:  node Tools/build-standalone.mjs   →   dist/CockyMonk.html
// The frozen demo and the componentized Lab remain the sources of truth; this is
// a generated artifact (regenerate after any Lab/content/token change).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const p = (...a) => join(ROOT, ...a);
const read = (rel) => readFile(p(rel), "utf8");
const readJson = async (rel) => JSON.parse(await read(rel));

// JSON safe to inline inside <script>…</script>: only "</script" can close the
// tag early; escaping "</" → "<\/" stays valid JSON and neutralizes it.
const scriptSafe = (obj) => JSON.stringify(obj).replace(/<\//g, "<\\/");

const CSS_FILES = ["tokens.css", "base.css", "components.css", "screens.css", "themes.css"];
// Dependency order: leaves first, entry (ui.js, which runs render() at its foot) last.
const JS_MODULES = ["state.js", "engine.js", "clock.js", "rating.js", "bots.js", "fakepool.js", "haptics.js", "audio.js", "themes.js", "net.js", "lottie.js", "fixtures.js", "ui.js"];

// Turn one ES module into plain top-level code: drop import lines, drop the
// `export` keyword. All modules then share the single IIFE scope in the bundle.
function stripModule(src) {
  return src
    .replace(/^\s*import\b[\s\S]*?from\s*['"][^'"]+['"];?[ \t]*$/gm, "") // import { … } from "./x.js";
    .replace(/^\s*import\s*['"][^'"]+['"];?[ \t]*$/gm, "")               // bare side-effect import
    .replace(/^(\s*)export\s+(async\s+)?(const|let|var|function|class)\b/gm, "$1$2$3")
    .replace(/^\s*export\s*\{[^}]*\}\s*;?[ \t]*$/gm, "");               // export { … };
}
const LOTTIE = ["confetti_win", "gullnese_shimmer", "gm_steal_sting",
                "celebration_salongen", "celebration_fjellet", "celebration_verdensrommet"];

// Ceiling for the self-contained build. ~650 KB with PeerJS + Fredoka inlined.
const BUDGET_BYTES = 1024 * 1024;

async function main() {
  // ---- fonts: Fredoka base64 @font-face (offline brand), then CSS ----
  const fontCss = await read("Lab/vendor/fredoka.css").catch(() => "");
  const css = [fontCss, ...(await Promise.all(CSS_FILES.map((f) => read(`Lab/css/${f}`))))
    .map((c, i) => `/* ${CSS_FILES[i]} */\n${c}`)].join("\n");

  // ---- JS module sources ----
  const sources = {};
  for (const m of JS_MODULES) sources[m] = await read(`Lab/js/${m}`);

  // ---- content: full decks + fakes, shaped like the Lab expects ----
  const deckToPairs = (d) => d.cards.map((c) => ({ prompt: c.prompt, truth: c.truth }));
  const fakesToText = (f) => f.fakes.map((x) => x.text);
  const bundle = {
    decks: {
      nb: deckToPairs(await readJson("Resources/deck_nb.json")),
      en: deckToPairs(await readJson("Resources/deck_en.json")),
    },
    fakes: {
      nb: fakesToText(await readJson("Resources/fakes_nb.json")),
      en: fakesToText(await readJson("Resources/fakes_en.json")),
    },
    lottie: {},
  };
  for (const name of LOTTIE) bundle.lottie[name] = await readJson(`Resources/Lottie/${name}.json`);

  // ---- vendored libs (raw JS; must not contain a literal </script>) ----
  const lottieLib = await read("Lab/vendor/lottie.min.js");
  if (/<\/script/i.test(lottieLib)) throw new Error("lottie.min.js contains </script — needs escaping");
  const peerLib = await read("Lab/vendor/peerjs.min.js");
  if (/<\/script/i.test(peerLib)) throw new Error("peerjs.min.js contains </script — needs escaping");

  // ---- app icons, base64 for the <head> (regenerate with Tools/make-icons.mjs) ----
  const iconSvgB64 = Buffer.from(await read("Lab/icon.svg"), "utf8").toString("base64");
  const icon180B64 = (await readFile(p("Lab/icon-180.png"))).toString("base64");

  // ---- one classic script: strip module syntax, concat in dependency order ----
  const gameJs = JS_MODULES.map((m) => `/* ===== ${m} ===== */\n${stripModule(sources[m])}`).join("\n\n");
  if (/<\/script/i.test(gameJs)) throw new Error("module source contains </script — needs escaping");

  const cardCount = bundle.decks.nb.length + bundle.decks.en.length;
  const html = `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#1B1B2E">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Cocky Monk">
<!-- Icons as data URIs, because this build is ONE file: a href to icon.svg would
     404 the moment someone emails it to a friend. No manifest for the same
     reason — a single file has no scope to install. -->
<link rel="icon" href="data:image/svg+xml;base64,${iconSvgB64}" type="image/svg+xml">
<link rel="apple-touch-icon" href="data:image/png;base64,${icon180B64}">
<title>Cocky Monk</title>
<!-- Fredoka is base64-inlined in the <style> below (offline brand); no network font. -->
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>/* full decks (${cardCount} cards), fakes, and 6 Lottie celebrations — no network needed */
window.__COCKY__ = ${scriptSafe(bundle)};</script>
<script>/* lottie-web 5.12.2 — MIT (see ASSETS.md) */
${lottieLib}
</script>
<script>/* PeerJS 1.5.4 — MIT (see ASSETS.md). Inert until a player hosts or joins. */
${peerLib}
</script>
<script>/* the game — all Lab modules concatenated into one classic script (file://-safe) */
(function () {
"use strict";
try {
${gameJs}
} catch (e) {
  document.getElementById("app").innerHTML =
    '<p style="color:#fff;padding:24px;font-family:system-ui">Kunne ikke starte spillet / could not start: ' + e + "</p>";
  throw e;
}
})();
</script>
</body>
</html>
`;

  await mkdir(p("dist"), { recursive: true });
  await writeFile(p("dist/CockyMonk.html"), html, "utf8");
  const bytes = Buffer.byteLength(html);
  const kb = (bytes / 1024).toFixed(0);
  console.log(`dist/CockyMonk.html  (${kb} KB)  · ${cardCount} cards · ${LOTTIE.length} Lottie · self-contained`);

  // The whole point of this file is that you can double-click it, play offline,
  // and send it to a friend. A bundle that quietly grows past a megabyte stops
  // being that, so the budget is a gate (qa-gate row 12) rather than a hope.
  if (bytes > BUDGET_BYTES) {
    throw new Error(
      `bundle is ${kb} KB, over the ${(BUDGET_BYTES / 1024).toFixed(0)} KB budget. ` +
      `Shrink it or raise BUDGET_BYTES deliberately — don't let it drift.`,
    );
  }

  // Artifact variant: body content only (claude.ai wraps it in <!doctype>/<head>/<body>).
  // Same inlined game, no external hosts → CSP-clean. Fonts/lottie/decks all embedded.
  const artifact = `<style>
${css}
</style>
<div id="app"></div>
<script>window.__COCKY__ = ${scriptSafe(bundle)};</script>
<script>${lottieLib}</script>
<script>${peerLib}</script>
<script>
(function () {
"use strict";
try {
${gameJs}
} catch (e) {
  document.getElementById("app").innerHTML =
    '<p style="color:#fff;padding:24px;font-family:system-ui">Kunne ikke starte spillet / could not start: ' + e + "</p>";
  throw e;
}
})();
</script>
`;
  await writeFile(p("dist/CockyMonk.artifact.html"), artifact, "utf8");
  console.log(`dist/CockyMonk.artifact.html  (${(Buffer.byteLength(artifact) / 1024).toFixed(0)} KB)  · for claude.ai Artifact`);
}

main().catch((e) => { console.error("build failed:", e); process.exit(1); });
