#!/usr/bin/env node
// Static server + mock API for The Daily Cock. Static-file pattern mirrors
// shunwg/Tools/serve-lab.mjs. Zero dependencies.
// Usage: node server/dev-server.mjs [port]   (default 8788)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDb, saveDb, ensureToday, currentNow, getTodayState, submitDefinition, submitGuess, skipGuess,
  ensureProfileFor, ackRecap, listDays, listPlayers, advanceDay, getVoteDistribution, resetPlayer,
  computeAdminStats,
} from "./db.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8788;
// Unset by default -> admin endpoints 404 entirely (safe default; a real
// deploy sets this via `fly secrets set`). Simple, not "secure" in any real
// sense — a bearer token compared with a plain string equality check, no
// rate limiting, no rotation. That's an explicit, accepted tradeoff (see
// the-daily-cock/CLAUDE.md's Admin dashboard section) for a ~10-user app.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

function isAdminAuthed(req, url) {
  if (!ADMIN_TOKEN) return false;
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const queryToken = url.searchParams.get("token") ?? "";
  return bearer === ADMIN_TOKEN || queryToken === ADMIN_TOKEN;
}
// On by default for local dev (`npm run serve`); a real deploy sets
// DEV_TOOLS=0 so the debug toolbar and its endpoints disappear entirely —
// see the-daily-cock/CLAUDE.md's note that #devbar is "always on because
// pre-launch." The client asks GET /api/config instead of just trying the
// endpoints, so it never renders a toolbar it can't use.
const DEV_TOOLS = process.env.DEV_TOOLS !== "0";
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".png": "image/png",
};

// Serializes every read-modify-write cycle through db.json. Without this,
// two requests arriving close together (e.g. the dev toolbar's own
// Promise.all([listDays(), listPlayers()]) on first load) each read the file,
// write back independently, and their writes can interleave on disk —
// corrupting the JSON. A simple promise-chained queue is enough for a
// single-process dev server; a real backend would use real transactions.
let dbQueue = Promise.resolve();

function withDb(fn) {
  const run = async () => {
    const db = await loadDb();
    ensureToday(db, currentNow(db)); // currentNow prefers the dev-toolbar's clock override, if set
    const result = fn(db);
    await saveDb(db);
    return result;
  };
  const result = dbQueue.then(run, run); // run regardless of whether the previous request failed
  dbQueue = result.then(() => {}, () => {}); // never let a rejection break the chain for later requests
  return result;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function serveStatic(req, res, pathname) {
  try {
    let p = pathname;
    if (p === "/") p = "/index.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT + sep))) { res.writeHead(403).end("forbidden"); return; }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);

  // Additive CORS — zero effect on game logic, just lets a browser-based
  // client hosted elsewhere (e.g. an Expo web build) call this API at all.
  // Native clients (iOS/Android) aren't subject to CORS and are unaffected.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

  if (!p.startsWith("/api/")) return serveStatic(req, res, p);

  try {
    if (p === "/api/profile" && req.method === "POST") {
      const { userId, displayName, device } = await readBody(req);
      const profile = await withDb((db) => ensureProfileFor(db, userId, displayName, device));
      sendJson(res, 200, { ok: true, profile });
      return;
    }
    if (p === "/api/admin/stats" && req.method === "GET") {
      if (!isAdminAuthed(req, url)) { sendJson(res, 401, { ok: false, error: "unauthorized" }); return; }
      const stats = await withDb((db) => computeAdminStats(db));
      sendJson(res, 200, { ok: true, ...stats });
      return;
    }
    if (p === "/api/today" && req.method === "GET") {
      const userId = url.searchParams.get("userId");
      const state = await withDb((db) => getTodayState(db, userId));
      sendJson(res, 200, state);
      return;
    }
    if (p === "/api/submit-definition" && req.method === "POST") {
      const { userId, wordId, text } = await readBody(req);
      const result = await withDb((db) => submitDefinition(db, { userId, wordId, text }));
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (p === "/api/submit-guess" && req.method === "POST") {
      const { userId, wordId, choiceId } = await readBody(req);
      const result = await withDb((db) => submitGuess(db, { userId, wordId, choiceId }));
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (p === "/api/skip-guess" && req.method === "POST") {
      const { userId, wordId } = await readBody(req);
      const result = await withDb((db) => skipGuess(db, { userId, wordId }));
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (p === "/api/ack-recap" && req.method === "POST") {
      const { userId } = await readBody(req);
      await withDb((db) => ackRecap(db, userId));
      sendJson(res, 200, { ok: true });
      return;
    }
    if (p === "/api/vote-distribution" && req.method === "GET") {
      const userId = url.searchParams.get("userId");
      const wordId = url.searchParams.get("wordId");
      const result = await withDb((db) => getVoteDistribution(db, userId, wordId));
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (p === "/api/reset-player" && req.method === "POST") {
      const { userId } = await readBody(req);
      if (!userId) { sendJson(res, 400, { ok: false, error: "missing_userId" }); return; }
      const result = await withDb((db) => resetPlayer(db, userId));
      sendJson(res, 200, result);
      return;
    }
    if (p === "/api/config" && req.method === "GET") {
      sendJson(res, 200, { ok: true, devTools: DEV_TOOLS });
      return;
    }
    // -- dev-only test tools (see the-daily-cock/CLAUDE.md) ------------------
    // 404 (not just client-side hiding) when DEV_TOOLS=0, so a deployed
    // instance can't be poked into the toolbar's day-advance/player-switch
    // behavior by anyone hitting the endpoints directly.
    if (p.startsWith("/api/dev/") && !DEV_TOOLS) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    if (p === "/api/dev/days" && req.method === "GET") {
      const state = await withDb((db) => listDays(db));
      sendJson(res, 200, { ok: true, ...state });
      return;
    }
    if (p === "/api/dev/players" && req.method === "GET") {
      const players = await withDb((db) => listPlayers(db));
      sendJson(res, 200, { ok: true, players });
      return;
    }
    if (p === "/api/dev/advance-day" && req.method === "POST") {
      const result = await withDb((db) => advanceDay(db));
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err?.message ?? err) });
  }
}).listen(PORT, "0.0.0.0", () => console.log(`The Daily Cock → http://localhost:${PORT}/`));
