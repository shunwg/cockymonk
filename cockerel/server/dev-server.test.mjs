// dev-server.test.mjs — HTTP-level integration coverage for
// server/dev-server.mjs: spawns the real server as a subprocess (against an
// isolated COCKEREL_DATA_DIR scratch directory — see db.mjs's DATA_DIR
// comment — so this never touches real server/data/db.json) and exercises
// every route through actual fetch() calls. This is deliberately black-box
// (server behavior in, HTTP response out), so it's the safety net for
// restructuring dev-server.mjs's routing internals (e.g. its if-chain ->
// route table) without changing what any endpoint actually does.
// Usage: node --test server/dev-server.test.mjs (or npm test, from cockerel/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";
import { LANGS } from "../js/config.js";

const SERVER_SCRIPT = fileURLToPath(new URL("./dev-server.mjs", import.meta.url));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(base, timeoutMs = 5000) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/config`);
      if (res.ok) return;
    } catch (err) { lastErr = err; }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`server at ${base} never became ready: ${lastErr}`);
}

/** Spawns a fresh dev-server.mjs instance against its own temp data dir and
 * temp port. Registers cleanup on `t.after` — call from inside a test/subtest. */
async function startServer(t, env = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "cockerel-test-"));
  const port = await getFreePort();
  const proc = spawn(process.execPath, [SERVER_SCRIPT, String(port)], {
    env: { ...process.env, COCKEREL_DATA_DIR: dataDir, DEV_TOOLS: "1", ADMIN_TOKEN: "", GOOGLE_CLIENT_ID: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    proc.kill();
    await rm(dataDir, { recursive: true, force: true });
  });
  await waitForServer(base);
  return base;
}

/** Like startServer, but seeds the data dir with a hand-written db.json first
 * — for exercising loadDb()'s on-read migrations against genuinely old data. */
async function startServerWithDb(t, dbJson, env = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "cockerel-test-"));
  await writeFile(path.join(dataDir, "db.json"), JSON.stringify(dbJson, null, 2));
  const port = await getFreePort();
  const proc = spawn(process.execPath, [SERVER_SCRIPT, String(port)], {
    env: { ...process.env, COCKEREL_DATA_DIR: dataDir, DEV_TOOLS: "1", ADMIN_TOKEN: "", GOOGLE_CLIENT_ID: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    proc.kill();
    await rm(dataDir, { recursive: true, force: true });
  });
  await waitForServer(base);
  return base;
}

async function postJson(base, path, body) {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function getJson(base, path) {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
}

// -- main suite: DEV_TOOLS on, no admin token, no google client id ----------

test("dev-server.mjs core HTTP surface", async (t) => {
  const base = await startServer(t);

  await t.test("GET /api/config reports the server's flags", async () => {
    const { status, body } = await getJson(base, "/api/config");
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, devTools: true, googleClientId: null, requireGoogleAuth: false });
  });

  // This endpoint backs the About panel's word-list credits, which exist to
  // satisfy CC BY 4.0 (Bokmålsordboka) and the WordNet license — so "every
  // active corpus has a non-empty attribution" is a legal requirement, not a
  // nice-to-have, and it must stay reachable without auth.
  await t.test("GET /api/credits returns an attribution for every active corpus", async () => {
    const { status, body } = await getJson(base, "/api/credits");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.corpora.length, LANGS.length, "one credit per configured language");
    for (const lang of LANGS) {
      const entry = body.corpora.find((c) => c.lang === lang);
      assert.ok(entry, `${lang} is credited`);
      assert.ok(entry.attribution?.length > 10, `${lang}: a real attribution string`);
      assert.ok(entry.version, `${lang}: names the version it describes`);
      assert.ok(entry.counts.words > 0, `${lang}: reports a word count`);
    }
  });

  await t.test("static file serving: index.html, unknown path 404s, path traversal is rejected", async () => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type"), /text\/html/);

    const missing = await fetch(`${base}/does-not-exist.html`);
    assert.equal(missing.status, 404);

    const traversal = await fetch(`${base}/../../../../etc/passwd`);
    assert.ok([403, 404].includes(traversal.status), "a traversal attempt must never serve a file outside ROOT");
  });

  await t.test("OPTIONS preflight returns 204 with CORS headers, for any path", async () => {
    const res = await fetch(`${base}/api/today`, { method: "OPTIONS" });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });

  await t.test("unknown /api/ route returns 404", async () => {
    const { status, body } = await getJson(base, "/api/not-a-real-endpoint");
    assert.equal(status, 404);
    assert.equal(body.ok, false);
  });

  await t.test("POST /api/auth/google 404s when GOOGLE_CLIENT_ID is unset", async () => {
    const { status, body } = await postJson(base, "/api/auth/google", { idToken: "x", userId: "u1" });
    assert.equal(status, 404);
    assert.equal(body.error, "not_configured");
  });

  await t.test("GET /api/admin/stats requires a token (401 when ADMIN_TOKEN is unset)", async () => {
    const { status, body } = await getJson(base, "/api/admin/stats");
    assert.equal(status, 401);
    assert.equal(body.error, "unauthorized");
  });

  let userId;
  await t.test("POST /api/profile + /api/set-languages establish a player", async () => {
    userId = `http-test-${Date.now()}`;
    const profileRes = await postJson(base, "/api/profile", { userId, displayName: "HTTP Test" });
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.body.ok, true);

    const langRes = await postJson(base, "/api/set-languages", { userId, enabledLangs: ["no"] });
    assert.equal(langRes.status, 200);
    assert.deepEqual(langRes.body.enabledLangs, ["no"]);
  });

  await t.test("GET /api/leaderboard is real-players-only (bots excluded) and first-name-only", async () => {
    const other = `http-test-other-${Date.now()}`;
    await postJson(base, "/api/profile", { userId: other, displayName: "Kari Nordmann" });
    await postJson(base, "/api/set-languages", { userId: other, enabledLangs: ["no"] });

    const { status, body } = await getJson(base, `/api/leaderboard?userId=${other}&lang=no`);
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    // Exactly the 2 real players created so far — ensureBotLeaderboard's 200
    // fixed bots (js/config.js LEADERBOARD.botCount) must NOT show up here,
    // or this would be 202+ instead.
    assert.equal(body.entries.length, 2);
    const mine = body.entries.find((e) => e.isYou);
    assert.equal(mine.name, "Kari"); // first name only, not "Kari Nordmann"
    assert.equal(body.entries.filter((e) => e.isYou).length, 1);
  });

  let writeWords, guessWords;
  await t.test("GET /api/today returns today's write words and yesterday's (bootstrapped) guess words", async () => {
    const { status, body } = await getJson(base, `/api/today?userId=${userId}`);
    assert.equal(status, 200);
    assert.deepEqual(body.enabledLangs, ["no"]);
    writeWords = body.byLang.no.writeWords;
    guessWords = body.byLang.no.guessWords;
    assert.equal(writeWords.length, 3);
    assert.equal(guessWords.length, 3);
    assert.ok(guessWords.every((w) => w.options.length > 0), "day-1 bootstrap already has guessable options");
    assert.ok(guessWords.every((w) => w.hintAvailable === false), "no real guesses recorded yet — bootstrap only fills decoy options, not db.guesses");
  });

  await t.test("POST /api/submit-definition: validation errors and the happy path", async () => {
    const empty = await postJson(base, "/api/submit-definition", { userId, wordId: writeWords[0].wordId, text: "   ", lang: "no" });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, "empty");

    const ok = await postJson(base, "/api/submit-definition", { userId, wordId: writeWords[0].wordId, text: "en troverdig bløff", lang: "no" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.ok, true);

    const duplicate = await postJson(base, "/api/submit-definition", { userId, wordId: writeWords[0].wordId, text: "en annen bløff", lang: "no" });
    assert.equal(duplicate.status, 400);
    assert.equal(duplicate.body.error, "already_submitted");
  });

  await t.test("POST /api/submit-guess, GET /api/vote-distribution, and immediate scoring on the 3rd guess", async () => {
    const [w1, w2, w3] = guessWords;

    const hint = await getJson(base, `/api/vote-distribution?userId=${userId}&wordId=${w1.wordId}&lang=no`);
    assert.equal(hint.status, 200);
    assert.equal(hint.body.ok, true);

    const g1 = await postJson(base, "/api/submit-guess", { userId, wordId: w1.wordId, choiceId: w1.options[0].id, lang: "no" });
    assert.equal(g1.status, 200);
    assert.equal(g1.body.guessResult, null);

    const invalidChoice = await postJson(base, "/api/submit-guess", { userId, wordId: w2.wordId, choiceId: "not-a-real-option", lang: "no" });
    assert.equal(invalidChoice.status, 400);
    assert.equal(invalidChoice.body.error, "invalid_choice");

    const g2 = await postJson(base, "/api/submit-guess", { userId, wordId: w2.wordId, choiceId: w2.options[0].id, lang: "no" });
    assert.equal(g2.status, 200);

    const skip = await postJson(base, "/api/skip-guess", { userId, wordId: w3.wordId, lang: "no" });
    assert.equal(skip.status, 200);
    assert.ok(skip.body.guessResult, "the 3rd guess slot (via skip) finalizes the round");
    assert.equal(typeof skip.body.guessResult.points, "number");

    const repeat = await postJson(base, "/api/submit-guess", { userId, wordId: w1.wordId, choiceId: w1.options[0].id, lang: "no" });
    assert.equal(repeat.status, 400);
    assert.equal(repeat.body.error, "already_guessed");

    // A second user's own /api/today now sees hintAvailable flip to true for
    // all three words — a guess (or the w3 skip) was just recorded for each.
    const other = `http-test-hint-${Date.now()}`;
    await postJson(base, "/api/profile", { userId: other, displayName: "Hint Checker" });
    await postJson(base, "/api/set-languages", { userId: other, enabledLangs: ["no"] });
    const { body: otherToday } = await getJson(base, `/api/today?userId=${other}`);
    assert.ok(otherToday.byLang.no.guessWords.every((w) => w.hintAvailable === true));
  });

  await t.test("POST /api/ack-recap and /api/reset-player", async () => {
    const ack = await postJson(base, "/api/ack-recap", { userId, lang: "no" });
    assert.equal(ack.status, 200);
    assert.equal(ack.body.ok, true);

    const reset = await postJson(base, "/api/reset-player", { userId });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.ok, true);

    const missingUserId = await postJson(base, "/api/reset-player", {});
    assert.equal(missingUserId.status, 400);
    assert.equal(missingUserId.body.error, "missing_userId");
  });

  await t.test("dev-only endpoints: /api/dev/days, /api/dev/players, /api/dev/advance-day, /api/dev/gallery-feedback", async () => {
    const days = await getJson(base, "/api/dev/days");
    assert.equal(days.status, 200);
    assert.ok(Array.isArray(days.body.days));

    const players = await getJson(base, "/api/dev/players");
    assert.equal(players.status, 200);
    assert.ok(Array.isArray(players.body.players));

    const beforeAdvance = days.body.current;
    const advance = await postJson(base, "/api/dev/advance-day", {});
    assert.equal(advance.status, 200);
    assert.notEqual(advance.body.todayKey, beforeAdvance);

    const missingFields = await postJson(base, "/api/dev/gallery-feedback", { screenId: "score" });
    assert.equal(missingFields.status, 400);

    const feedback = await postJson(base, "/api/dev/gallery-feedback", { screenId: "score", screenLabel: "Score", theme: "light", lang: "no", note: "looks great" });
    assert.equal(feedback.status, 200);
    assert.equal(feedback.body.entry.note, "looks great");
  });

  await t.test("GET /gallery.html is served when DEV_TOOLS is on", async () => {
    const res = await fetch(`${base}/gallery.html`);
    assert.equal(res.status, 200);
  });
});

// -- DEV_TOOLS=0: everything dev-only must be unreachable -------------------

test("dev-server.mjs with DEV_TOOLS=0 hides every dev-only surface", async (t) => {
  const base = await startServer(t, { DEV_TOOLS: "0" });

  await t.test("/api/config reports devTools: false", async () => {
    const { body } = await getJson(base, "/api/config");
    assert.equal(body.devTools, false);
  });

  await t.test("every /api/dev/* endpoint 404s regardless of method", async () => {
    for (const path of ["/api/dev/days", "/api/dev/players"]) {
      const { status } = await getJson(base, path);
      assert.equal(status, 404, `${path} must 404 when DEV_TOOLS=0`);
    }
    const advance = await postJson(base, "/api/dev/advance-day", {});
    assert.equal(advance.status, 404);
  });

  await t.test("gallery.html 404s server-side, not just client-side hidden", async () => {
    const res = await fetch(`${base}/gallery.html`);
    assert.equal(res.status, 404);
  });

  await t.test("normal gameplay endpoints still work", async () => {
    const userId = `http-test-devoff-${Date.now()}`;
    const res = await postJson(base, "/api/profile", { userId, displayName: "Still Works" });
    assert.equal(res.status, 200);
  });
});

// -- admin surface: ADMIN_TOKEN set --------------------------------------

test("dev-server.mjs admin endpoints with ADMIN_TOKEN set", async (t) => {
  const token = "test-admin-token";
  const base = await startServer(t, { ADMIN_TOKEN: token });

  await t.test("GET /api/admin/stats: wrong token still 401s, right token succeeds", async () => {
    const wrong = await getJson(base, "/api/admin/stats?token=nope");
    assert.equal(wrong.status, 401);

    const right = await getJson(base, `/api/admin/stats?token=${token}`);
    assert.equal(right.status, 200);
    assert.equal(right.body.ok, true);
    assert.ok(Array.isArray(right.body.days));
    assert.ok(Array.isArray(right.body.players));
  });

  await t.test("POST /api/admin/wipe-all requires the exact confirmation body, even with a valid token", async () => {
    const noConfirm = await postJson(base, `/api/admin/wipe-all?token=${token}`, {});
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.error, "confirmation_required");

    const confirmed = await postJson(base, `/api/admin/wipe-all?token=${token}`, { confirm: "WIPE" });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.ok, true);
  });
});


// -- loadDb migrations against genuinely old data ---------------------------

test("an old average-based profile is converted to a points total ONCE, not on every request", async (t) => {
  // A pre-PROFILE_VERSION-4 profile: `ratingSum` is an average's numerator on
  // the old ~4x point scale, with no `pointsTotal` at all.
  const base = await startServerWithDb(t, {
    batches: [], submissions: [], guesses: [], dayResults: {}, devClock: null, identities: {},
    profiles: {
      veteran: {
        displayName: "Gammel Ravn",
        enabledLangs: ["no"],
        langs: {
          no: {
            v: 3, displayName: "Gammel Ravn", ratingSum: 1200,
            countedDays: ["2026-07-20", "2026-07-21"], participatedDays: ["2026-07-20", "2026-07-21"],
            lastResultSeenDate: null,
          },
        },
      },
    },
  });

  // 1200 old-scale points / 4 = 300 on the current scale.
  const first = await getJson(base, "/api/today?userId=veteran");
  assert.equal(first.body.byLang.no.profile.points, 300);

  // loadDb() runs on EVERY request, and this migration is arithmetic rather
  // than a shape change — without its version gate, each request would divide
  // the total by 4 again (300 -> 75 -> 19 -> ...). This is the assertion that
  // catches that regression.
  for (let i = 0; i < 4; i++) {
    const again = await getJson(base, "/api/today?userId=veteran");
    assert.equal(again.body.byLang.no.profile.points, 300, `request ${i + 2} must still report 300`);
  }
});

test("a pre-dual-language, pre-points-total profile survives BOTH migrations in one read", async (t) => {
  // The oldest shape on record: flat freshProfile() fields at the top level
  // (no `langs`), and a `ratingSum` on the old scale. migrateToMultiLang has
  // to run before migrateToPointsTotal for this to work at all.
  const base = await startServerWithDb(t, {
    batches: [], submissions: [], guesses: [], dayResults: {}, devClock: null, identities: {},
    profiles: {
      ancient: {
        v: 3, displayName: "Urgammel Ugle", ratingSum: 800,
        countedDays: ["2026-07-20"], participatedDays: ["2026-07-20"], lastResultSeenDate: null,
      },
    },
  });

  const { body } = await getJson(base, "/api/today?userId=ancient");
  assert.deepEqual(body.enabledLangs, ["no"], "an old flat profile becomes a Norwegian-only player");
  assert.equal(body.byLang.no.profile.points, 200); // 800 / 4
  assert.equal(body.byLang.no.profile.displayName, "Urgammel Ugle");
});

test("an old profile whose average was net-negative lands at the floor, not below it", async (t) => {
  const base = await startServerWithDb(t, {
    batches: [], submissions: [], guesses: [], dayResults: {}, devClock: null, identities: {},
    profiles: {
      unlucky: {
        displayName: "Uheldig Hare", enabledLangs: ["no"],
        langs: {
          no: {
            v: 3, displayName: "Uheldig Hare", ratingSum: -150,
            countedDays: ["2026-07-20"], participatedDays: ["2026-07-20"], lastResultSeenDate: null,
          },
        },
      },
    },
  });

  const { body } = await getJson(base, "/api/today?userId=unlucky");
  assert.equal(body.byLang.no.profile.points, 0);
});
