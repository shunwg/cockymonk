#!/usr/bin/env node
// build-standalone.mjs — bundle the Lab into ONE self-contained HTML file that
// plays with zero install: no Node, no server, no network. Double-click on any
// OS. Zero dependencies.
//
// It inlines: all CSS, all JS modules (as an ESM blob-bootstrap that preserves
// import/export semantics), the full deck_nb/deck_en + fakes, the six Lottie
// celebration JSONs, and vendored lottie-web. Fonts use the Google Fonts <link>
// when online and the rounded system fallback (DESIGN.md §2) offline.
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
// Leaves first, entry (ui.js) last — the bootstrap builds blob URLs in this order.
const JS_MODULES = ["state.js", "engine.js", "bots.js", "audio.js", "themes.js", "lottie.js", "ui.js"];
const LOTTIE = ["confetti_win", "gullnese_shimmer", "gm_steal_sting",
                "celebration_salongen", "celebration_fjellet", "celebration_verdensrommet"];

async function main() {
  // ---- CSS ----
  const css = (await Promise.all(CSS_FILES.map((f) => read(`Lab/css/${f}`))))
    .map((c, i) => `/* ${CSS_FILES[i]} */\n${c}`).join("\n");

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

  // ---- vendored lottie-web (raw JS; must not contain a literal </script>) ----
  const lottieLib = await read("Lab/vendor/lottie.min.js");
  if (/<\/script/i.test(lottieLib)) throw new Error("lottie.min.js contains </script — needs escaping");

  const cardCount = bundle.decks.nb.length + bundle.decks.en.length;
  const html = `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="color-scheme" content="dark">
<title>Cocky Monk</title>
<!-- Fredoka when online; rounded system font (DESIGN.md §2 fallback) offline. -->
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
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
<script>/* ESM blob-bootstrap: inline modules keep their import/export semantics */
(function () {
  var SRC = ${scriptSafe(sources)};
  var order = ${JSON.stringify(JS_MODULES)};
  var urls = {};
  for (var i = 0; i < order.length; i++) {
    var name = order[i];
    var src = SRC[name].replace(/(["'])\\.\\/([\\w.-]+\\.js)\\1/g, function (m, q, dep) { return q + urls[dep] + q; });
    urls[name] = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  }
  import(urls["ui.js"]).catch(function (e) {
    document.getElementById("app").innerHTML =
      '<p style="color:#fff;padding:24px;font-family:system-ui">Kunne ikke starte spillet / could not start: ' + e + "</p>";
  });
})();
</script>
</body>
</html>
`;

  await mkdir(p("dist"), { recursive: true });
  await writeFile(p("dist/CockyMonk.html"), html, "utf8");
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`dist/CockyMonk.html  (${kb} KB)  · ${cardCount} cards · ${LOTTIE.length} Lottie · self-contained`);
}

main().catch((e) => { console.error("build failed:", e); process.exit(1); });
