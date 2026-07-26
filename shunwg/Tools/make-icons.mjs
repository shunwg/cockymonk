#!/usr/bin/env node
// make-icons.mjs — raster the Munken from Lab/icon.svg into the PNG sizes iOS and
// Android insist on. Zero dependencies; uses the system's own Edge/Chrome
// headless, exactly like snap-screens.mjs.
//
//   node Tools/make-icons.mjs
//   SNAP_BROWSER=<path to exe>   → override autodetection
//
// Why PNGs at all, when icon.svg exists: Safari's apple-touch-icon has never
// accepted SVG, and Android's maskable-icon path wants a raster too. The SVG
// stays the source of truth — regenerate after any change to the mark.
//
// Same Windows gotcha as snap-screens.mjs, and the same reason it is written
// down: without a dedicated --user-data-dir, msedge.exe forwards the request to
// any already-running Edge and --screenshot silently produces nothing at all.

import { execFile } from "node:child_process";
import { mkdtemp, rm, stat, access, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVG = join(ROOT, "Lab", "icon.svg");
const SIZES = [180, 512];
const MIN_BYTES = 1024;          // a real icon is far bigger; catches empty writes

/* Order matters, and it is the opposite of snap-screens.mjs's.
   Edge is LAST here, because a full browser that is already running hijacks the
   request: msedge.exe hands the command line to the live instance, which ignores
   --screenshot, and the launcher still exits 0. A dedicated --user-data-dir does
   not prevent it. On this machine the Browser pane keeps Edge alive, so headless
   Edge silently rendered nothing — and when it did produce a file, the file was
   Edge's own ERR_FILE_NOT_FOUND page at exactly the right dimensions.
   chrome-headless-shell has no GUI instance to forward to, which is why it is
   first: if Playwright is installed, this is deterministic. */
const PW = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "ms-playwright");
const CANDIDATES = [
  process.env.SNAP_BROWSER,
  PW && join(PW, "chromium_headless_shell-1217\\chrome-headless-shell-win64\\chrome-headless-shell.exe"),
  PW && join(PW, "chromium_headless_shell-1208\\chrome-headless-shell-win64\\chrome-headless-shell.exe"),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium", "/usr/bin/google-chrome",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

async function findBrowser() {
  for (const c of CANDIDATES) {
    try { await access(c); return c; } catch { /* next */ }
  }
  throw new Error("no Edge/Chrome found — set SNAP_BROWSER to a browser executable");
}

const run = (exe, args) => new Promise((res, rej) =>
  execFile(exe, args, { timeout: 60_000 }, (e, so, se) => {
    if (e && e.code) { e.message += `\nstdout: ${so}\nstderr: ${se}`; return rej(e); }
    if (process.env.ICON_DEBUG) console.error(`  [browser] ${so || ""}${se || ""}`);
    res();
  }));

async function main() {
  const exe = await findBrowser();
  const svg = await readFile(SVG, "utf8");

  // The SVG is 512×512 with rounded corners; a bare page adds white margins and
  // scrollbars, so wrap it in a page sized exactly to the icon with no chrome.
  //
  // One mkdtemp PER SIZE, and top-level rather than sibling subdirectories of a
  // shared parent. Sharing a parent looks tidier and fails: the second launch
  // lands while the first Edge is still tearing down, gets forwarded to it, and
  // writes nothing while still exiting 0. Each size renders correctly alone,
  // which is what makes this one a genuinely confusing afternoon.
  for (const size of SIZES) {
    const profile = await mkdtemp(join(tmpdir(), `cm-icon-${size}-`));
    try {
      const page = join(profile, "icon.html");
      await writeFile(page, `<!DOCTYPE html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden}
svg{display:block;width:${size}px;height:${size}px}</style>${svg}`, "utf8");

      const out = join(ROOT, "Lab", `icon-${size}.png`);
      await rm(out, { force: true });

      /* Retry, because a headless Edge that gets forwarded to an already-running
         instance writes nothing AND STILL EXITS 0 — so the only reliable
         completion signal is the file appearing on disk. Each size renders fine
         in isolation and the failure moves between them run to run, which is the
         signature of a launch race rather than a bad argument. Three cheap
         attempts beat diagnosing Edge's singleton handshake. */
      let bytes = 0;
      for (let attempt = 1; attempt <= 3 && bytes < MIN_BYTES; attempt++) {
        await run(exe, [
          "--headless=new", "--disable-gpu", "--hide-scrollbars",
          "--no-first-run", "--no-default-browser-check",
          `--user-data-dir=${join(profile, "prof" + attempt)}`,
          `--window-size=${size},${size}`,
          `--screenshot=${out}`,
          // THREE slashes. `file://C:/...` reads C: as a hostname, so the page never
          // loads, and headless Chrome then exits 0 having written nothing at all.
          `file:///${page.split(sep).join("/")}`,
        ]);
        bytes = await stat(out).then((s) => s.size).catch(() => 0);
        if (bytes < MIN_BYTES && attempt < 3) {
          await new Promise((r) => setTimeout(r, 600));   // let the last Edge die
        }
      }
      if (bytes < MIN_BYTES) {
        throw new Error(`icon-${size}.png never rendered (${bytes} B after 3 attempts). ` +
          "Close any running Edge/Chrome and retry, or set SNAP_BROWSER to a different browser.");
      }
      console.log(`Lab/icon-${size}.png  (${(bytes / 1024).toFixed(1)} KB)`);
    } finally {
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch((e) => { console.error("make-icons failed:", e.message); process.exit(1); });
