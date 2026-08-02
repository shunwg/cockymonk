#!/usr/bin/env node
// Static server + mock API for Cockerel. Static-file pattern mirrors
// shunwg/Tools/serve-lab.mjs. Zero dependencies.
// Usage: node server/dev-server.mjs [port]   (default 8788)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDb, saveDb, ensureToday, currentNow, getTodayState, submitDefinition, submitGuess, skipGuess,
  ensureProfileFor, ackRecap, listDays, listPlayers, advanceDay, getVoteDistribution, resetPlayer,
  computeAdminStats, linkGoogleIdentity, wipeAllUsers, setEnabledLangs, getLeaderboard,
} from "./db.mjs";
import { verifyGoogleIdToken } from "./auth.mjs";
import { appendGalleryFeedback } from "./gallery-feedback.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8788;
// Unset by default -> admin endpoints 404 entirely (safe default; a real
// deploy sets this via `fly secrets set`). Simple, not "secure" in any real
// sense — a bearer token compared with a plain string equality check, no
// rate limiting, no rotation. That's an explicit, accepted tradeoff (see
// cockerel/CLAUDE.md's Admin dashboard section) for a ~10-user app.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

function isAdminAuthed(req, url) {
  if (!ADMIN_TOKEN) return false;
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const queryToken = url.searchParams.get("token") ?? "";
  return bearer === ADMIN_TOKEN || queryToken === ADMIN_TOKEN;
}
// On by default for local dev (`npm run serve`); a real deploy sets
// DEV_TOOLS=0 so the debug toolbar and its endpoints disappear entirely —
// see cockerel/CLAUDE.md's note that #devbar is "always on because
// pre-launch." The client asks GET /api/config instead of just trying the
// endpoints, so it never renders a toolbar it can't use.
const DEV_TOOLS = process.env.DEV_TOOLS !== "0";
// Unset by default -> /api/config reports no client id and the client hides
// the Google button entirely, and /api/auth/google 404s regardless of what
// the client tries — same gate shape as ADMIN_TOKEN just above. This value
// is NOT a secret (it's baked into every page load anyway, since Google
// Identity Services needs it client-side to render the button); the actual
// verification happens server-side in auth.mjs against Google's own tokeninfo
// endpoint, which checks the token's signature and audience.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
// Off by default (local dev) so the devbar's throwaway test players keep
// working exactly as before — see js/ui.js's requireGoogleAuth gate, which
// only ever blocks the NORMAL onboarding/gameplay flow, never the devbar.
// Deployed instances that want "you must sign in to play" set this to "1"
// alongside GOOGLE_CLIENT_ID (both required together — this alone with no
// client id configured would show a sign-in screen with a dead button).
const REQUIRE_GOOGLE_AUTH = process.env.REQUIRE_GOOGLE_AUTH === "1";
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".png": "image/png",
  // manifest.webmanifest — the spec-recommended content-type; served without
  // it, most browsers still tolerate it, but this is the correct one.
  ".webmanifest": "application/manifest+json; charset=utf-8",
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

// -- API routes -----------------------------------------------------------
// One entry per (method, path) — a direct, structural translation of what
// used to be a chain of `if (p === "..." && req.method === "...")` blocks;
// each handler's body is unchanged from that block. `url` is passed through
// for the handful of GET routes that read query params. Kept a plain array
// + linear find rather than reaching for any routing pattern (path params,
// wildcards, middleware) this app doesn't need — every path here is still an
// exact string. See server/dev-server.test.mjs for the HTTP-level coverage
// that pins down every route's behavior independent of this dispatch shape.
const routes = [
  {
    method: "POST", path: "/api/profile",
    handler: async (req, res) => {
      const { userId, displayName, device } = await readBody(req);
      const profile = await withDb((db) => ensureProfileFor(db, userId, displayName, device));
      sendJson(res, 200, { ok: true, profile });
    },
  },
  {
    method: "GET", path: "/api/admin/stats",
    handler: async (req, res, url) => {
      if (!isAdminAuthed(req, url)) { sendJson(res, 401, { ok: false, error: "unauthorized" }); return; }
      const stats = await withDb((db) => computeAdminStats(db));
      sendJson(res, 200, { ok: true, ...stats });
    },
  },
  {
    // One-time cutover tool (see wipeAllUsers in db.mjs) — irreversible, so
    // it requires the exact body {"confirm":"WIPE"} in addition to
    // ADMIN_TOKEN, as a guard against a fat-fingered request wiping real
    // player data.
    method: "POST", path: "/api/admin/wipe-all",
    handler: async (req, res, url) => {
      if (!isAdminAuthed(req, url)) { sendJson(res, 401, { ok: false, error: "unauthorized" }); return; }
      const { confirm } = await readBody(req);
      if (confirm !== "WIPE") { sendJson(res, 400, { ok: false, error: "confirmation_required" }); return; }
      const result = await withDb((db) => wipeAllUsers(db));
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET", path: "/api/today",
    handler: async (req, res, url) => {
      const userId = url.searchParams.get("userId");
      const state = await withDb((db) => getTodayState(db, userId));
      sendJson(res, 200, state);
    },
  },
  {
    method: "POST", path: "/api/submit-definition",
    handler: async (req, res) => {
      const { userId, wordId, text, lang } = await readBody(req);
      const result = await withDb((db) => submitDefinition(db, { userId, wordId, text, lang }));
      sendJson(res, result.ok ? 200 : 400, result);
    },
  },
  {
    method: "POST", path: "/api/submit-guess",
    handler: async (req, res) => {
      const { userId, wordId, choiceId, lang } = await readBody(req);
      const result = await withDb((db) => submitGuess(db, { userId, wordId, choiceId, lang }));
      sendJson(res, result.ok ? 200 : 400, result);
    },
  },
  {
    method: "POST", path: "/api/skip-guess",
    handler: async (req, res) => {
      const { userId, wordId, lang } = await readBody(req);
      const result = await withDb((db) => skipGuess(db, { userId, wordId, lang }));
      sendJson(res, result.ok ? 200 : 400, result);
    },
  },
  {
    method: "POST", path: "/api/ack-recap",
    handler: async (req, res) => {
      const { userId, lang } = await readBody(req);
      await withDb((db) => ackRecap(db, userId, lang));
      sendJson(res, 200, { ok: true });
    },
  },
  {
    method: "GET", path: "/api/vote-distribution",
    handler: async (req, res, url) => {
      const userId = url.searchParams.get("userId");
      const wordId = url.searchParams.get("wordId");
      const lang = url.searchParams.get("lang");
      const result = await withDb((db) => getVoteDistribution(db, userId, wordId, lang));
      sendJson(res, result.ok ? 200 : 400, result);
    },
  },
  {
    // Ranking list shown by tapping the header's points/rank number (see
    // js/ui.js openRankingPanel) — real players only, no auth needed (same
    // posture as /api/today: this is ordinary gameplay data, not admin data).
    method: "GET", path: "/api/leaderboard",
    handler: async (req, res, url) => {
      const lang = url.searchParams.get("lang");
      const userId = url.searchParams.get("userId");
      const result = await withDb((db) => getLeaderboard(db, lang, userId));
      sendJson(res, 200, { ok: true, ...result });
    },
  },
  {
    // Settings-panel language toggle (see cockerel/CLAUDE.md "Dual-language
    // gameplay") — also doubles as onboarding's initial language choice, one
    // call either way. The client re-fetches /api/today right after to pick
    // up the newly (dis)enabled language's state.
    method: "POST", path: "/api/set-languages",
    handler: async (req, res) => {
      const { userId, enabledLangs } = await readBody(req);
      const result = await withDb((db) => setEnabledLangs(db, userId, enabledLangs));
      sendJson(res, result.ok ? 200 : 400, result);
    },
  },
  {
    method: "POST", path: "/api/reset-player",
    handler: async (req, res) => {
      const { userId } = await readBody(req);
      if (!userId) { sendJson(res, 400, { ok: false, error: "missing_userId" }); return; }
      const result = await withDb((db) => resetPlayer(db, userId));
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET", path: "/api/config",
    handler: async (req, res) => {
      sendJson(res, 200, {
        ok: true, devTools: DEV_TOOLS, googleClientId: GOOGLE_CLIENT_ID, requireGoogleAuth: REQUIRE_GOOGLE_AUTH,
      });
    },
  },
  {
    method: "POST", path: "/api/auth/google",
    handler: async (req, res) => {
      if (!GOOGLE_CLIENT_ID) { sendJson(res, 404, { ok: false, error: "not_configured" }); return; }
      const { idToken, userId, device } = await readBody(req);
      if (!idToken || !userId) { sendJson(res, 400, { ok: false, error: "missing_fields" }); return; }
      const claims = await verifyGoogleIdToken(idToken, GOOGLE_CLIENT_ID);
      if (!claims) { sendJson(res, 401, { ok: false, error: "invalid_token" }); return; }
      const result = await withDb((db) =>
        linkGoogleIdentity(db, { sub: claims.sub, userId, displayName: claims.name ?? userId, device })
      );
      sendJson(res, 200, { ok: true, ...result });
    },
  },
  // -- dev-only test tools (see cockerel/CLAUDE.md) --------------------
  {
    method: "GET", path: "/api/dev/days",
    handler: async (req, res) => {
      const state = await withDb((db) => listDays(db));
      sendJson(res, 200, { ok: true, ...state });
    },
  },
  {
    method: "GET", path: "/api/dev/players",
    handler: async (req, res) => {
      const players = await withDb((db) => listPlayers(db));
      sendJson(res, 200, { ok: true, players });
    },
  },
  {
    method: "POST", path: "/api/dev/advance-day",
    handler: async (req, res) => {
      const result = await withDb((db) => advanceDay(db));
      sendJson(res, 200, { ok: true, ...result });
    },
  },
  {
    // Feedback logged from gallery.html's per-card form (see js/gallery.js) —
    // appended to server/data/gallery-feedback.json, a separate file from
    // db.json (see server/gallery-feedback.mjs). Not tied to withDb's queue
    // since it never touches db.json.
    method: "POST", path: "/api/dev/gallery-feedback",
    handler: async (req, res) => {
      const { screenId, screenLabel, theme, lang, note } = await readBody(req);
      if (!screenId || !String(note ?? "").trim()) { sendJson(res, 400, { ok: false, error: "missing_fields" }); return; }
      const entry = {
        ts: new Date().toISOString(), screenId, screenLabel: screenLabel ?? null,
        theme: theme ?? null, lang: lang ?? null, note: String(note).trim(),
      };
      await appendGalleryFeedback(entry);
      sendJson(res, 200, { ok: true, entry });
    },
  },
];

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

  // The dev-only screen gallery's entry page — 404 it outright when
  // DEV_TOOLS=0, same posture as /api/dev/* below, so a deployed instance
  // never serves it regardless of anyone guessing the URL (see
  // cockerel/CLAUDE.md's Guardrails: "purely a developer tool").
  if (p === "/gallery.html" && !DEV_TOOLS) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }

  if (!p.startsWith("/api/")) return serveStatic(req, res, p);

  try {
    // 404 (not just client-side hiding) when DEV_TOOLS=0, checked before the
    // route table so a deployed instance can't be poked into any /api/dev/*
    // behavior by anyone hitting the endpoints directly.
    if (p.startsWith("/api/dev/") && !DEV_TOOLS) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    const route = routes.find((r) => r.method === req.method && r.path === p);
    if (route) { await route.handler(req, res, url); return; }
    sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err?.message ?? err) });
  }
}).listen(PORT, "0.0.0.0", () => console.log(`Cockerel → http://localhost:${PORT}/`));
