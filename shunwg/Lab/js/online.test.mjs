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
  clockPulseHz,
} from "./clock.js";
import {
  RATING, ratingDeltas, ratingExpected, ratingApply, ratingFresh, ratingLoad,
  ratingSave, ratingReset, ratingNoseCap, ratingTier,
} from "./rating.js";

import {
  NET, NET_CONFIG, netProject, netLoopback, netRoomCode, netShareLink,
  netRoomFromUrl, netTally, netVotesIn, netJoinOpen, netSeatKind, netStartScore,
} from "./net.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A mid-round game, seat 0 GM, seats 1-3 bluffers.
const gameAt = (phase) => ({
  phase,
  gm: 0,
  round: 2,
  players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, pid: `p${i}`, score: i, bluffVotes: 0, dropped: false, kind: "human" })),
  card: { prompt: "gane", truth: "DEN HEMMELIGE SANNHETEN" },
  decoys: ["gm sitt utkast", ""],
  bluffs: { 1: "løgn fra 1", 2: "løgn fra 2" },
  votes: { 1: "a", 2: "b", 3: "a" },
  options: [{ id: "a", kind: "bluff", authors: [1] }, { id: "b", kind: "truth", authors: [] }],
});

// -- state projection: the test that matters most ------------------------------

test("THE TRUTH NEVER REACHES A NON-GM SEAT BEFORE THE REVEAL", () => {
  for (const phase of ["card", "bluffing", "voting"]) {
    const G = gameAt(phase);
    for (const seat of [1, 2, 3]) {
      const p = netProject(G, seat);
      assert.equal(p.card.truth, null, `${phase}: seat ${seat} must not see the truth`);
      assert.equal(p.card.prompt, "gane", `${phase}: the word itself is public`);
      assert.ok(!JSON.stringify(p).includes("DEN HEMMELIGE SANNHETEN"),
        `${phase}: the truth leaked somewhere else in the payload for seat ${seat}`);
    }
    assert.equal(netProject(G, 0).card.truth, "DEN HEMMELIGE SANNHETEN", `${phase}: the GM still sees it`);
  }
});

test("the truth becomes public at the reveal, and only then", () => {
  const G = gameAt("reveal");
  for (const seat of [0, 1, 2, 3]) {
    assert.equal(netProject(G, seat).card.truth, "DEN HEMMELIGE SANNHETEN", `seat ${seat}`);
  }
});

test("the GM's decoy drafts never leave the GM", () => {
  for (const phase of ["card", "bluffing", "voting", "reveal"]) {
    const G = gameAt(phase);
    for (const seat of [1, 2, 3]) {
      assert.deepEqual(netProject(G, seat).decoys, [], `${phase}: seat ${seat}`);
      assert.ok(!JSON.stringify(netProject(G, seat)).includes("gm sitt utkast"), `${phase}: draft leaked`);
    }
    assert.deepEqual(netProject(G, 0).decoys, ["gm sitt utkast", ""], "the GM keeps their own drafts");
  }
});

test("other players' lies are unreadable until voting opens", () => {
  for (const phase of ["card", "bluffing"]) {
    const p = netProject(gameAt(phase), 3);
    assert.deepEqual(p.bluffs, {}, `${phase}: no lie text`);
    assert.deepEqual(p.bluffsIn, [1, 2], `${phase}: but the chips know who is done`);
    assert.ok(!JSON.stringify(p).includes("løgn fra 1"), `${phase}: text leaked`);
  }
  // Once the pool is built the texts are public by definition — they're on screen.
  assert.deepEqual(netProject(gameAt("voting"), 3).bluffsIn, undefined);
});

test("the live tally is anonymous, but you can see your own vote", () => {
  const p = netProject(gameAt("voting"), 3);
  assert.deepEqual(p.voteCounts, { a: 2, b: 1 }, "counts travel");
  assert.equal(p.votesIn, 3);
  assert.deepEqual(p.votes, { 3: "a" }, "only my own vote, so my screen knows I voted");
  const p1 = netProject(gameAt("voting"), 1);
  assert.deepEqual(Object.keys(p1.votes), ["1"], "seat 1 likewise sees only its own");
  // Full attribution only at the reveal, where the ceremony shows it deliberately.
  assert.deepEqual(netProject(gameAt("reveal"), 3).votes, { 1: "a", 2: "b", 3: "a" });
});

test("netTally works from either full votes or projected counts", () => {
  const host = gameAt("voting");
  const client = netProject(host, 3);
  assert.equal(netTally(host, "a"), 2);
  assert.equal(netTally(client, "a"), 2, "same answer from the redacted copy");
  assert.equal(netVotesIn(host), 3);
  assert.equal(netVotesIn(client), 3);
  assert.equal(netTally(client, "zz"), 0);
});

test("netProject tolerates a half-built round", () => {
  assert.equal(netProject(null, 0), null);
  const bare = { phase: "card", gm: 0, players: [], card: null };
  assert.doesNotThrow(() => netProject(bare, 1));
});

// -- room codes and links -----------------------------------------------------

test("room codes avoid characters people mishear", () => {
  for (const ch of "01OI") assert.ok(!NET_CONFIG.CODE_ALPHABET.includes(ch), `${ch} is ambiguous aloud`);
  let seq = 0;
  const code = netRoomCode(() => (seq++ % NET_CONFIG.CODE_ALPHABET.length) / NET_CONFIG.CODE_ALPHABET.length);
  assert.equal(code.length, NET_CONFIG.CODE_LEN);
  assert.match(netRoomCode(), /^[A-Z2-9]{6}$/);
});

test("share links round-trip, and file:// honestly has none", () => {
  const loc = { protocol: "https:", origin: "https://example.test", pathname: "/snifferoo/", search: "" };
  const link = netShareLink("ABC234", loc);
  assert.equal(link, "https://example.test/snifferoo/?room=ABC234");
  assert.equal(netRoomFromUrl({ search: "?room=abc234" }), "ABC234", "case-insensitive, normalised");
  assert.equal(netRoomFromUrl({ search: "" }), null);
  assert.equal(netRoomFromUrl({ search: "?room=<script>" }), null, "rejects junk");
  assert.equal(netShareLink("ABC234", { protocol: "file:", origin: "null", pathname: "/x.html" }), null);
});

test("loopback is a real transport, not a special case", () => {
  const t = netLoopback();
  assert.equal(t.isHost, true, "local play is its own host");
  assert.equal(t.kind, "loopback");
  assert.equal(t.roomCode, null);
  assert.doesNotThrow(() => { t.send({ t: "state" }); t.sendTo("p1", {}); t.close(); });
  assert.equal(NET.peers.length, 0);
});


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

// The closing pulse is a RATE, not a level: the ask is a heart rate that climbs
// as the deadline approaches, and clockLevel only knows three values.
test("clockPulseHz climbs over the closing window, and is capped for safety", () => {
  assert.equal(clockPulseHz(null), 0, "no deadline, no pulse");
  assert.equal(clockPulseHz(TIMERS.PULSE_MS + 1), 0, "silent outside the window");
  assert.equal(clockPulseHz(TIMERS.PULSE_MS), 0.8, "starts at a slow beat, not a jolt");
  assert.equal(clockPulseHz(0), 2.5, "fastest exactly at zero");

  // Monotonic all the way in — a rate that dipped would read as the deadline
  // receding, which is the one thing it must never say.
  let prev = -1;
  for (let left = TIMERS.PULSE_MS; left >= 0; left -= 250) {
    const hz = clockPulseHz(left);
    assert.ok(hz >= prev, `hz must never fall (at ${left}ms: ${hz} < ${prev})`);
    prev = hz;
  }

  // WCAG 2.3.1 puts the photosensitive-seizure threshold at three flashes per
  // second. A full-screen pulse is exactly that stimulus, so the ceiling is a
  // safety limit rather than taste. Overshoot must be impossible, including
  // past zero when a late tick arrives with a negative remainder.
  for (const left of [0, -1, -5000, -60000]) {
    assert.ok(clockPulseHz(left) <= 2.5, `never above 2.5 Hz (at ${left}ms)`);
  }
  assert.ok(clockPulseHz(0) < 3, "strictly under the WCAG three-per-second line");
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

// -- rating (PRD §2.1) --------------------------------------------------------

const rated = (pid, rating, score, games = 50) => ({ pid, rating, score, games, isBot: false });

test("beating a higher-rated player is worth more — the whole point", () => {
  // Same win, different opponent strength.
  const vsStrong = ratingDeltas([rated("me", 1000, 20), rated("them", 1600, 10)]);
  const vsWeak = ratingDeltas([rated("me", 1000, 20), rated("them", 400, 10)]);
  assert.ok(vsStrong.me > vsWeak.me, `${vsStrong.me} should beat ${vsWeak.me}`);
  assert.ok(vsWeak.me >= 0, "beating a weaker player is never a penalty");
});

test("losing to a stronger player costs less than losing to a weaker one", () => {
  const toStrong = ratingDeltas([rated("me", 1000, 5), rated("them", 1600, 20)]);
  const toWeak = ratingDeltas([rated("me", 1000, 5), rated("them", 400, 20)]);
  assert.ok(toStrong.me > toWeak.me, "an upset loss should hurt more");
  assert.ok(toWeak.me < 0);
});

test("equal ratings, equal scores → nobody moves", () => {
  const d = ratingDeltas([rated("a", 1200, 12), rated("b", 1200, 12), rated("c", 1200, 12)]);
  assert.deepEqual(Object.values(d), [0, 0, 0]);
});

test("an 8-player swing stays comparable to a 3-player one", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => rated(`p${i}`, 1000, n - i));
  const three = ratingDeltas(mk(3));
  const eight = ratingDeltas(mk(8));
  // Winner of each. Without the /(N-1) normalisation the 8-player winner would
  // gain ~3.5x as much for the same achievement.
  assert.ok(Math.abs(eight.p0 - three.p0) <= 6, `3p ${three.p0} vs 8p ${eight.p0}`);
});

test("provisional players move faster than settled ones", () => {
  const newbie = ratingDeltas([rated("me", 1000, 20, 0), rated("them", 1000, 10, 0)]);
  const veteran = ratingDeltas([rated("me", 1000, 20, 99), rated("them", 1000, 10, 99)]);
  assert.ok(newbie.me > veteran.me, `${newbie.me} vs ${veteran.me}`);
});

test("bots and solo games are worth nothing — practice cannot be farmed", () => {
  const withBots = ratingDeltas([
    rated("me", 1000, 20),
    { pid: "bot:1", rating: 1000, score: 5, games: 0, isBot: true },
    { pid: "bot:2", rating: 1000, score: 3, games: 0, isBot: true },
  ]);
  assert.deepEqual(withBots, {}, "one rated human is not a rated game");
  assert.deepEqual(ratingDeltas([]), {});
  assert.deepEqual(ratingDeltas([rated("solo", 1000, 9)]), {});
});

test("no delta ever exceeds MAX_DELTA, however lopsided", () => {
  const d = ratingDeltas([rated("me", 100, 99, 0), rated("them", 2800, 0, 0)]);
  for (const v of Object.values(d)) assert.ok(Math.abs(v) <= RATING.MAX_DELTA, `${v}`);
});

test("ratingApply clamps a hostile delta and never drops below the floor", () => {
  const p = ratingFresh("Åse");
  const cheated = ratingApply(p, 99999, { nose: 3, won: true });
  assert.equal(cheated.rating, RATING.START + RATING.MAX_DELTA, "clamped on receipt");
  assert.equal(cheated.games, 1);
  assert.equal(cheated.wins, 1);
  assert.equal(cheated.nose, 3);
  let low = { ...ratingFresh(), rating: RATING.FLOOR + 5 };
  low = ratingApply(low, -500);
  assert.equal(low.rating, RATING.FLOOR, "floored, not negative");
});

test("history is bounded and best is a high-water mark", () => {
  let p = ratingFresh();
  for (let i = 0; i < RATING.HISTORY_MAX + 12; i++) p = ratingApply(p, 5);
  assert.equal(p.history.length, RATING.HISTORY_MAX);
  const peak = p.best;
  p = ratingApply(p, -40);
  assert.equal(p.best, peak, "best does not fall back");
});

test("nose cap is the most anyone could honestly have collected", () => {
  assert.equal(ratingNoseCap(4, 6), 18);   // 3 opponents x 6 rounds
  assert.equal(ratingNoseCap(1, 6), 0);
  assert.equal(ratingNoseCap(4, 0), 0);
});

test("a corrupt or absent profile reseeds instead of throwing", () => {
  const store = {};
  const orig = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    assert.equal(ratingLoad().rating, RATING.START, "absent → fresh");
    store[RATING.KEY] = "{ not json";
    assert.equal(ratingLoad().rating, RATING.START, "corrupt → fresh");
    store[RATING.KEY] = JSON.stringify({ v: 99, pid: "x", rating: 9999, name: "Åse" });
    const migrated = ratingLoad();
    assert.equal(migrated.rating, RATING.START, "unknown version → reseeded, not half-read");
    assert.equal(migrated.name, "Åse", "but the name is worth keeping");

    const saved = ratingApply(ratingFresh("Bo"), 12);
    ratingSave(saved);
    assert.equal(ratingLoad().rating, saved.rating, "round-trips");
    assert.equal(ratingReset().games, 0, "reset wipes the career");
  } finally { globalThis.localStorage = orig; }
});

// The rename from Snifferoo to Snifferoo moved the storage key. A player who
// had a rating, a career nose and 40 games behind them must not open the app to
// a blank slate — that is the app throwing away the only thing it ever asked to
// keep, and it would look exactly like a bug nobody could reproduce.
test("a pre-rename profile survives the rename, and only travels one way", () => {
  const store = {};
  const orig = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    const old = { ...ratingFresh("Ingrid"), rating: 1337, games: 42, v: RATING.VERSION };
    store[RATING.LEGACY_KEY] = JSON.stringify(old);

    const adopted = ratingLoad();
    assert.equal(adopted.rating, 1337, "the old rating is adopted, not reseeded");
    assert.equal(adopted.games, 42, "and so is the career");
    assert.equal(adopted.name, "Ingrid");

    // A CURRENT profile always wins. Otherwise someone who reset their profile
    // would find the old one resurrected on their next visit.
    store[RATING.KEY] = JSON.stringify({ ...ratingFresh("Ny"), rating: 900, v: RATING.VERSION });
    assert.equal(ratingLoad().rating, 900, "current key beats legacy");

    // Saving never writes the legacy key back.
    ratingSave(ratingApply(ratingFresh("Bo"), 5));
    assert.equal(JSON.parse(store[RATING.LEGACY_KEY]).rating, 1337, "legacy is read-only");

    // "Slett profilen" has to clear BOTH, or the deleted profile comes back.
    ratingReset();
    assert.equal(store[RATING.LEGACY_KEY], undefined, "reset clears the legacy key too");
    assert.equal(ratingLoad().games, 0, "and nothing is left to adopt");
  } finally { globalThis.localStorage = orig; }
});

test("storage that throws is survivable — never break the boot", () => {
  const orig = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceeded"); },
    removeItem() { throw new Error("nope"); },
  };
  try {
    assert.equal(ratingLoad().rating, RATING.START);
    assert.equal(ratingSave(ratingFresh()), false, "reports failure, doesn't throw");
    assert.equal(ratingReset().games, 0);
  } finally { globalThis.localStorage = orig; }
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

/* ---------------- walking into a running game (PRD §5.5, §2 stays intact) ------
 * The door used to be a 3-minute clock. It is now open for the whole game: a
 * party runs 20 minutes and a friend with the link should be able to sit down at
 * minute eighteen. Still NOT matchmaking — the code or the link is required.
 *
 * The tests below pin the two halves of the promise: you can always get in while
 * the game is live, and getting in never disturbs the round in flight.
 */

test("the door is open at any point in a live game", () => {
  const t0 = 1_000_000;
  for (const phase of ["card", "bluffing", "voting", "reveal", "board", "omkamp"]) {
    assert.equal(netJoinOpen({ phase }, t0), true, `${phase}: open`);
    // Time is no longer a factor — an hour in is as open as the first second.
    assert.equal(netJoinOpen({ phase }, t0 + 3_600_000), true, `${phase}: still open an hour later`);
  }
});

test("only a finished game shuts the door", () => {
  assert.equal(netJoinOpen({ phase: "winner" }, 1), false, "nothing left to join");
  assert.equal(netJoinOpen({ phase: "winner" }, Number.MAX_SAFE_INTEGER), false);
});

test("missing state is never joinable", () => {
  assert.equal(netJoinOpen(null, 1), false);
  assert.equal(netJoinOpen(undefined, 1), false);
});

/* The projection is the only thing between a chairless watcher and the answer.
   A pending joiner has no seat, so netBroadcastState calls netProject(G, -1) —
   and -1 must never be mistaken for the GM. This is the single most important
   assertion in the file: everything else is a worse game, this is a broken one. */
test("a seatless watcher never receives the truth", () => {
  for (const phase of ["card", "bluffing", "voting"]) {
    for (const seat of [-1, undefined, null, NaN, "0"]) {
      const seen = netProject(gameAt(phase), seat);
      assert.equal(seen.card.truth, null, `${phase}, seat ${String(seat)}: truth must be redacted`);
      assert.deepEqual(seen.decoys, [], `${phase}, seat ${String(seat)}: decoys are the GM's private drafts`);
    }
  }
});

test("a seatless watcher still gets the word, so the waiting room is not blank", () => {
  const seen = netProject(gameAt("bluffing"), -1);
  assert.ok(seen.card.prompt, "the word itself is public — it is on everyone's screen");
  assert.equal(seen.phase, "bluffing", "and enough state to render what the room is doing");
});

test("a seatless watcher never reads anyone's lie before the vote opens", () => {
  const g = { ...gameAt("bluffing"), bluffs: { 1: "en løgn", 2: "enda en" } };
  const seen = netProject(g, -1);
  assert.deepEqual(seen.bluffs, {}, "no lie text");
  assert.deepEqual(seen.bluffsIn, [1, 2], "only who is done, for the tick-in chips");
});

/* ---- which way in, and on what score ---------------------------------------
   The interesting case is the SECOND one. Taking a bot's chair is free; making a
   new chair is not, because gmForRound / winCheck / scoreRound all read
   players.length. These tests pin that a new chair can never be conjured while a
   round is in flight. */

const seatFx = ({ bots = 0, humans = 3, pending = 0, scores = null } = {}) => ({
  phase: "bluffing",
  players: [
    ...Array.from({ length: humans }, (_, i) => ({ name: `H${i}`, kind: "remote", score: scores?.[i] ?? 0 })),
    ...Array.from({ length: bots }, (_, i) => ({ name: `B${i}`, kind: "bot", score: 0 })),
  ],
  pendingSeats: Array.from({ length: pending }, (_, i) => ({ pid: `p${i}`, name: `P${i}` })),
});

test("a bot's chair is taken whenever one is free", () => {
  assert.equal(netSeatKind(seatFx({ bots: 1, humans: 3 })), "bot");
  assert.equal(netSeatKind(seatFx({ bots: 3, humans: 1 })), "bot");
  // ...but a bot that already dropped is not a chair anyone can sit in.
  const g = seatFx({ bots: 1, humans: 3 });
  g.players.at(-1).dropped = true;
  assert.equal(netSeatKind(g), "pending", "a dropped bot is not a free chair");
});

test("no bot to displace means waiting for the round boundary, never a mid-round chair", () => {
  assert.equal(netSeatKind(seatFx({ bots: 0, humans: 3 })), "pending");
  assert.equal(netSeatKind(seatFx({ bots: 0, humans: 7 })), "pending", "one short of the cap still fits");
});

test("eight is eight, and the queue counts toward it", () => {
  assert.equal(netSeatKind(seatFx({ bots: 0, humans: 8 })), "full");
  // The subtle one: seven seated + one already queued IS full. Without counting
  // the queue, two people could each be told "yes" and only one would fit.
  assert.equal(netSeatKind(seatFx({ bots: 0, humans: 7, pending: 1 })), "full");
  assert.equal(netSeatKind(seatFx({ bots: 0, humans: 6, pending: 1 })), "pending");
  // A bot chair still wins over the cap — the roster does not grow.
  assert.equal(netSeatKind(seatFx({ bots: 1, humans: 7 })), "bot");
});

test("a game with no players at all is never joinable", () => {
  assert.equal(netSeatKind({ players: [] }), "full");
  assert.equal(netSeatKind({}), "full");
  assert.equal(netSeatKind(null), "full");
});

test("a fresh chair starts level with last place, not at zero", () => {
  assert.equal(netStartScore([{ score: 7 }, { score: 3 }, { score: 11 }]), 3);
  assert.equal(netStartScore([{ score: 5 }, { score: 5 }]), 5, "everyone level → join level");
  assert.equal(netStartScore([]), 0, "no table yet → zero");
  assert.equal(netStartScore([{ score: 0 }, { score: 9 }]), 0, "someone still on zero → zero is honest");
  assert.equal(netStartScore([{}, { score: 4 }]), 0, "a missing score counts as zero, never NaN");
  assert.ok(Number.isFinite(netStartScore([{ score: 2 }])), "never Infinity from an empty reduce");
});

test("late join: timedOut reaches the client, so a seated latecomer is not shown an input screen", () => {
  // screenForSeat (ui.js) routes a timedOut seat to WAIT/VOTEWAIT instead of
  // BLUFF/VOTE. That only works if the projection carries timedOut — without it
  // the joiner is handed a box whose submission the host will reject.
  for (const phase of ["bluffing", "voting"]) {
    const g = { ...gameAt(phase), timedOut: { bluff: [3], vote: [3] } };
    const seen = netProject(g, 3);
    assert.deepEqual(seen.timedOut, { bluff: [3], vote: [3] }, `${phase}: timedOut must survive projection`);
  }
});
