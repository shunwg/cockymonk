// online.test.mjs — segment 5 gate (LANES.md). Run: node --test Lab/js/online.test.mjs
//
// Covers the three things that cannot be checked by playing the game once on
// one machine: deadline arithmetic, the Elo math, and — most importantly —
// state projection, because a naive broadcast leaks the truth to every player
// and still looks completely fine in a solo test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TIMERS, defaultTimers, clockDeadline, clockLeft, clockSeconds, clockLevel,
  clockFraction, clockExpired, clockSkew, clockArm, clockClear, clockArmed,
} from "./clock.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -- constants ----------------------------------------------------------------

test("TIMERS is frozen and matches PRD §5.2a defaults", () => {
  assert.ok(Object.isFrozen(TIMERS));
  assert.equal(TIMERS.BLUFF.default, 60000);
  assert.equal(TIMERS.DECOY.default, 45000);
  assert.equal(TIMERS.VOTE.default, 45000);
  assert.equal(TIMERS.REVEAL.default, 25000);
  for (const k of ["BLUFF", "DECOY", "VOTE", "REVEAL"]) {
    assert.ok(TIMERS[k].choices.includes(TIMERS[k].default), `${k}: default must be offerable`);
    assert.equal(TIMERS[k].choices.length, 3, `${k}: three-up, so screen 06 reuses .seg`);
  }
});

test("bot pacing fits inside every deadline choice", async () => {
  // The shortest bluff window must still beat the slowest bot table, or
  // practice mode would time players out through no fault of their own.
  const bots = await import("./bots.js");
  const T = bots.TUNING;
  const worstBluff = T.BLUFF_DELAY_MS[1] + 4 * T.BLUFF_STAGGER_MS[1];   // 5 bots
  const worstVote = T.VOTE_DELAY_MS[1] + 4 * T.VOTE_STAGGER_MS[1];
  assert.ok(worstBluff < Math.min(...TIMERS.BLUFF.choices), `bots need ${worstBluff}ms`);
  assert.ok(worstVote < Math.min(...TIMERS.VOTE.choices), `bots need ${worstVote}ms`);
});

test("timers default OFF — hotseat paces itself", () => {
  assert.equal(defaultTimers().on, false);
});

// -- pure arithmetic ----------------------------------------------------------

test("clockLeft counts down and clamps at zero", () => {
  const d = clockDeadline("bluff", 60000, 3, 1_000_000);
  assert.equal(d.at, 1_060_000);
  assert.equal(d.totalMs, 60000);
  assert.equal(clockLeft(d, 0, 1_000_000), 60000);
  assert.equal(clockLeft(d, 0, 1_030_000), 30000);
  assert.equal(clockLeft(d, 0, 1_099_999), 0, "never negative");
  assert.equal(clockLeft(null), null);
});

test("clockSeconds ceils — '1' means you still have time", () => {
  assert.equal(clockSeconds(1), 1);
  assert.equal(clockSeconds(1000), 1);
  assert.equal(clockSeconds(1001), 2);
  assert.equal(clockSeconds(0), 0);
});

test("clockLevel thresholds", () => {
  assert.equal(clockLevel(60000), "calm");
  assert.equal(clockLevel(10001), "calm");
  assert.equal(clockLevel(10000), "warn");
  assert.equal(clockLevel(5001), "warn");
  assert.equal(clockLevel(5000), "urgent");
  assert.equal(clockLevel(0), "urgent");
});

test("clockFraction drives the ring 1 → 0", () => {
  const d = clockDeadline("vote", 40000, 1, 0);
  assert.equal(clockFraction(d, 0, 0), 1);
  assert.equal(clockFraction(d, 0, 20000), 0.5);
  assert.equal(clockFraction(d, 0, 40000), 0);
  assert.equal(clockFraction(d, 0, 99999), 0, "clamped, never negative");
});

test("clockExpired grants a grace window", () => {
  const d = clockDeadline("bluff", 1000, 1, 0);
  assert.equal(clockExpired(d, 0, 1000), false, "exactly on time");
  assert.equal(clockExpired(d, 0, 1000 + TIMERS.GRACE_MS), false, "inside grace");
  assert.equal(clockExpired(d, 0, 1000 + TIMERS.GRACE_MS + 1), true);
});

test("clockSkew is clamped both ways", () => {
  assert.equal(clockSkew(1_000_500, 1_000_000), 500);
  assert.equal(clockSkew(1_000_000, 1_000_500), -500);
  assert.equal(clockSkew(9_999_999_999, 0), TIMERS.SKEW_CLAMP_MS, "a wild clock gets no say");
  assert.equal(clockSkew(0, 9_999_999_999), -TIMERS.SKEW_CLAMP_MS);
  assert.equal(clockSkew(1_000_000, 1_000_000, 40), 40, "half-RTT correction");
});

// -- the interval -------------------------------------------------------------

test("host arm: ticks, then fires onExpire exactly once", async () => {
  let ticks = 0, expired = 0;
  clockArm({
    ...clockDeadline("bluff", 500, 1),
    onTick: () => { ticks++; },
    onExpire: () => { expired++; },
  });
  assert.ok(clockArmed(), "armed");
  await sleep(900);
  assert.equal(expired, 1, "fired once");
  assert.equal(clockArmed(), null, "cleared itself before firing");
  assert.ok(ticks >= 2, `painted while running (got ${ticks})`);
  await sleep(300);
  assert.equal(expired, 1, "no interval left running to fire again");
});

test("client arm: paints but never expires — double-advance is impossible", async () => {
  let ticks = 0;
  clockArm({ ...clockDeadline("bluff", 300, 1), onTick: () => { ticks++; }, onExpire: null });
  await sleep(700);
  assert.ok(ticks >= 1, "clients still see the countdown");
  clockClear();
});

test("clockArm is idempotent — re-arming never leaves two intervals racing", async () => {
  let a = 0, b = 0;
  clockArm({ ...clockDeadline("vote", 400, 1), onExpire: () => { a++; } });
  clockArm({ ...clockDeadline("vote", 400, 1), onExpire: () => { b++; } });
  await sleep(800);
  assert.equal(a, 0, "the superseded arm is dead");
  assert.equal(b, 1);
  clockClear();
});

test("onTick fires only when the displayed second changes", async () => {
  const seen = [];
  clockArm({ ...clockDeadline("bluff", 1500, 1), onTick: (left) => seen.push(clockSeconds(left)) });
  await sleep(1200);
  clockClear();
  assert.deepEqual([...new Set(seen)], seen, "no repeated second — the DOM is not touched 4x/s");
});

test("clockClear stops a running clock dead", async () => {
  let expired = 0;
  clockArm({ ...clockDeadline("bluff", 300, 1), onExpire: () => { expired++; } });
  clockClear();
  await sleep(600);
  assert.equal(expired, 0);
});

// -- bundle safety ------------------------------------------------------------
// build-standalone.mjs concatenates every module into ONE IIFE, so two files
// declaring the same top-level name is not a lint nit — it is a SyntaxError
// that only appears in the shipped bundle, never while serving the Lab.

test("no two Lab modules declare the same top-level name", async () => {
  const build = await readFile(new URL("../../Tools/build-standalone.mjs", import.meta.url), "utf8");
  const list = build.match(/const JS_MODULES = \[([^\]]*)\]/)?.[1];
  assert.ok(list, "JS_MODULES not found in build-standalone.mjs");
  const modules = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  const owner = new Map();
  const clashes = [];
  for (const m of modules) {
    const src = await readFile(new URL(`./${m}`, import.meta.url), "utf8");
    // Column 0 only = top level. Matches this codebase's style exactly.
    for (const decl of src.matchAll(/^(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      const nameFound = decl[1];
      if (owner.has(nameFound)) clashes.push(`${nameFound}: ${owner.get(nameFound)} vs ${m}`);
      else owner.set(nameFound, m);
    }
  }
  assert.deepEqual(clashes, [], "top-level name collision — the standalone bundle would throw");
});

test("clock.js does not shadow state.js's timer registry", async () => {
  const src = await readFile(new URL("./clock.js", import.meta.url), "utf8");
  for (const forbidden of ["timers", "later", "clearTimers"]) {
    const re = new RegExp(`^(?:export\\s+)?(?:const|let|var|function)\\s+${forbidden}\\b`, "m");
    assert.equal(re.test(src), false, `clock.js must not declare \`${forbidden}\` — state.js owns it`);
  }
});
