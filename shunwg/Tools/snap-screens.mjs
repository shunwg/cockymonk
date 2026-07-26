#!/usr/bin/env node
// snap-screens.mjs — regenerate the numbered reference screenshots in
// Screens/png/ from the live fixtures (Lab/js/fixtures.js) using the system's
// own Edge/Chrome in headless mode. Zero dependencies.
//
//   node Tools/snap-screens.mjs        → all 18 screens
//   node Tools/snap-screens.mjs 07     → just screen 07
//   SNAP_BROWSER=<path to exe>         → override browser autodetection
//
// The PNGs are a git-tracked shared reference ("endre 07"), regenerated on
// demand after UI changes. They are NEVER a byte-compare QA gate: font
// antialiasing differs per machine. --force-prefers-reduced-motion flips the
// Lab's reduced-motion CSS (kills all animation) so frames are stable; the
// fixtures themselves schedule no timers and construct no AudioContext.
//
// Windows gotcha this script exists to encode: without a dedicated
// --user-data-dir, msedge.exe forwards to any RUNNING Edge and --screenshot
// silently does nothing. The temp profile below is mandatory, not hygiene.

import { spawn, execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURES } from "../Lab/js/fixtures.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 8787;
const BASE = `http://localhost:${PORT}/Lab/index.html`;
const OUT = join(ROOT, "Screens", "png");
const MIN_BYTES = 10 * 1024; // a real 430×932 frame is far bigger than 10 KB

const CANDIDATES = [
  process.env.SNAP_BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
].filter(Boolean);

async function findBrowser() {
  for (const p of CANDIDATES) {
    try { await access(p); return p; } catch { /* next */ }
  }
  return null;
}

const serverUp = async () => {
  try { return (await fetch(BASE, { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
};

async function main() {
  const only = process.argv[2];
  const targets = only ? FIXTURES.filter((f) => f.id === only) : FIXTURES;
  if (!targets.length) { console.error(`unknown screen "${only}" — use 01–18 (see Screens/SCREENS.md)`); process.exit(1); }

  const browser = await findBrowser();
  if (!browser) {
    console.error("No Edge/Chrome found. Either set SNAP_BROWSER=<path to msedge.exe/chrome.exe>,");
    console.error("or snap manually: node Tools/serve-lab.mjs → open");
    console.error(`  ${BASE}?fixture=NN  and screenshot at 430×932 into Screens/png/NN-<screen>.png`);
    process.exit(1);
  }

  // Reuse a running serve-lab; otherwise spawn one for the duration of the run.
  let server = null;
  if (!(await serverUp())) {
    server = spawn(process.execPath, [join(ROOT, "Tools", "serve-lab.mjs")], { stdio: "ignore" });
    for (let i = 0; i < 20 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 250));
    if (!(await serverUp())) { server.kill(); console.error("serve-lab did not come up on :" + PORT); process.exit(1); }
  }

  const profile = await mkdtemp(join(tmpdir(), "cm-snap-"));
  await mkdir(OUT, { recursive: true });
  console.log(`browser: ${browser}\nout:     ${OUT}\n`);

  let failed = 0;
  try {
    for (const f of targets) {
      const png = join(OUT, `${f.id}-${f.screen.toLowerCase()}.png`);
      const args = [
        "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--mute-audio", "--hide-scrollbars",
        `--user-data-dir=${profile}`,
        "--force-prefers-reduced-motion",
        "--window-size=430,932",
        "--virtual-time-budget=4000",
        `--screenshot=${png}`,
        `${BASE}?fixture=${f.id}`,
      ];
      await new Promise((resolve) => {
        execFile(browser, args, { timeout: 30_000 }, () => resolve()); // headless exit codes are unreliable; judge by the file
      });
      const size = await stat(png).then((s) => s.size).catch(() => 0);
      const ok = size > MIN_BYTES;
      if (!ok) failed++;
      console.log(`${ok ? "✓" : "✗"} ${f.id} ${f.name.padEnd(22)} ${ok ? (size / 1024).toFixed(0) + " KB" : "MISSING/EMPTY"}`);
    }
  } finally {
    if (server) server.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  if (failed) { console.error(`\n${failed} screen(s) failed — is another headless run holding the profile?`); process.exit(1); }
  console.log(`\n${targets.length} PNG(s) written. Commit them with the UI change they document.`);
}

main().catch((e) => { console.error("snap failed:", e); process.exit(1); });
