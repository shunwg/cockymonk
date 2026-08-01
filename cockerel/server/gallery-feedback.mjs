// gallery-feedback.mjs — dev-only feedback log for the screen gallery
// (gallery.html / js/gallery.js). A separate append-only JSON array file
// from db.json on purpose: this is dev-tool output, not game state, and
// keeping it separate means it's trivial to point Claude Code at
// specifically ("check server/data/gallery-feedback.json"). Own serialized
// queue mirroring db.mjs's withDb pattern (see its top comment) — this file
// is also subject to the same read-modify-write race under concurrent
// requests.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, "data", "gallery-feedback.json");

let queue = Promise.resolve();

export function appendGalleryFeedback(entry) {
  const run = async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    const list = existsSync(FILE) ? JSON.parse(await readFile(FILE, "utf8")) : [];
    list.push(entry);
    await writeFile(FILE, JSON.stringify(list, null, 2));
    return entry;
  };
  const result = queue.then(run, run); // run regardless of a prior write's outcome
  queue = result.then(() => {}, () => {}); // never let a rejection break the chain for later requests
  return result;
}
