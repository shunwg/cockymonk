// fixtures.test.mjs — Segment 2 (Skjermer) gate. Run: node --test Lab/js/fixtures.test.mjs
// Guards the numbered-screen registry: every fixture must be renderable, engine-
// shaped, deterministic, and silent/static (gallery + snap safety).

import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXTURES, getFixture } from "./fixtures.js";

const SCREEN_IDS = [
  "HOME", "LANG", "MODE", "PLAYERS", "PARTYSETUP", "SETUP", "GM_INTRO", "GM_DASH",
  "BLUFF", "WAIT", "VOTE", "VOTEWAIT", "REVEAL", "BOARD", "OMKAMP", "WINNER", "RULES", "ABOUT",
  "PROFILE", "HOST_LOBBY", "JOIN", "LOBBY_WAIT", "CONNLOST",
];
const SCREEN_COUNT = SCREEN_IDS.length;   // numbers are permanent; new screens append
// Keys of the G literal in ui.js startGame() — fxMakeG must mirror it.
const G_KEYS = [
  "players", "target", "round", "gm", "phase", "card", "bluffs", "decoys", "gmDecoyDone",
  "options", "doubles", "votes", "deltas", "gmStole", "revealIdx", "timedOut", "deadline", "theme",
  "joinOpenUntil", "lateJoin",
  "timers", "inOmkamp", "omkampParticipants",
  "preOmkampScores", "goalCelebrated", "celebrated", "awaitingNext", "ratingDone",
];
const NEEDS_G = SCREEN_IDS.slice(SCREEN_IDS.indexOf("GM_INTRO"), SCREEN_IDS.indexOf("WINNER") + 1);

test("registry: one fixture per screen, ids 01.., screens valid and unique", () => {
  assert.equal(FIXTURES.length, SCREEN_COUNT);
  FIXTURES.forEach((f, i) => {
    assert.equal(f.id, String(i + 1).padStart(2, "0"), `fixture ${i} id`);
    assert.ok(SCREEN_IDS.includes(f.screen), `${f.id}: unknown screen ${f.screen}`);
    assert.ok(f.name?.length > 0, `${f.id}: missing bokmål name`);
  });
  assert.equal(new Set(FIXTURES.map((f) => f.screen)).size, SCREEN_COUNT, "one fixture per screen");
});

test("getFixture: resolves every id, screen applied, unknown ids → null", () => {
  for (const f of FIXTURES) {
    const fx = getFixture(f.id);
    assert.ok(fx, `${f.id} resolves`);
    assert.equal(fx.u.screen, f.screen);
    assert.equal(fx.u.lang, "nb", `${f.id}: freshUi defaults applied`);
  }
  assert.equal(getFixture("99"), null);
  assert.equal(getFixture(null), null);
});

test("game screens carry a startGame-shaped G; setup screens carry none", () => {
  for (const f of FIXTURES) {
    const { g } = getFixture(f.id);
    if (!NEEDS_G.includes(f.screen)) { assert.equal(g, null, `${f.id}: expected g=null`); continue; }
    assert.ok(g, `${f.id}: expected game state`);
    for (const k of G_KEYS) assert.ok(k in g, `${f.id}: G missing key "${k}" (drifted from startGame?)`);
    assert.ok(g.players.length >= 3 && g.players.length <= 8, `${f.id}: player count`);
    for (const p of g.players) {
      for (const k of ["name", "color", "score", "bluffVotes", "dropped", "pid", "kind"]) assert.ok(k in p, `${f.id}: player.${k}`);
    }
    assert.ok(g.gm >= 0 && g.gm < g.players.length, `${f.id}: gm in range`);
    assert.ok(g.card?.prompt && g.card?.truth, `${f.id}: card`);
  }
});

test("vote-pool screens: engine-shaped options, letters, legal votes", () => {
  for (const id of ["11", "12", "13"]) {
    const { g } = getFixture(id);
    assert.ok(Array.isArray(g.options) && g.options.length >= 4, `${id}: options built`);
    assert.equal(g.options.filter((o) => o.kind === "truth").length, 1, `${id}: exactly one truth`);
    for (const o of g.options) {
      assert.ok(o.id && o.letter === o.id.toUpperCase(), `${id}: option letter`);
      assert.ok(Array.isArray(o.authors), `${id}: option authors`);
    }
    for (const [voter, optId] of Object.entries(g.votes)) {
      const opt = g.options.find((o) => o.id === optId);
      assert.ok(opt, `${id}: vote by ${voter} targets a real option`);
      assert.ok(!opt.authors.includes(Number(voter)), `${id}: voter ${voter} voted own option`);
      assert.notEqual(Number(voter), g.gm, `${id}: the GM never votes`);
    }
  }
});

test("13 REVEAL is mid-ceremony with full votes; 12 VOTEWAIT is partial", () => {
  const reveal = getFixture("13");
  assert.equal(reveal.g.revealIdx, 2, "revealIdx lives in G — the room shares the beat");
  assert.equal(Object.keys(reveal.g.votes).length, reveal.g.players.length - 1, "all non-GM voted");
  const wait = getFixture("12");
  const voters = reveal.g.players.length - 1;
  assert.ok(Object.keys(wait.g.votes).length > 0 && Object.keys(wait.g.votes).length < voters);
});

test("14 BOARD: delta badges per player + Neste runde armed", () => {
  const { g } = getFixture("14");
  assert.equal(g.deltas.length, g.players.length);
  assert.ok(g.deltas.some((d) => d > 0), "someone earned points");
  assert.equal(g.awaitingNext, true);
});

test("15 OMKAMP: participants + pre-scores consistent", () => {
  const { g } = getFixture("15");
  assert.ok(g.inOmkamp && g.omkampParticipants.length >= 2);
  assert.equal(g.preOmkampScores.length, g.players.length);
  for (const i of g.omkampParticipants) assert.ok(i >= 0 && i < g.players.length);
});

test("16 WINNER: silent frame (celebrated) with winnersIdx set", () => {
  const { g } = getFixture("16");
  assert.equal(g.celebrated, true, "celebrated:true keeps gallery iframes silent");
  assert.ok(Array.isArray(g.winnersIdx) && g.winnersIdx.length >= 1);
  assert.equal(typeof g.shared, "boolean");
});

test("deterministic: same fixture twice → identical option order and letters", () => {
  const a = getFixture("11").g.options.map((o) => o.letter + ":" + o.kind).join("|");
  const b = getFixture("11").g.options.map((o) => o.letter + ":" + o.kind).join("|");
  assert.equal(a, b);
});
