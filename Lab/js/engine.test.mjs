// engine.test.mjs — runs every vector in Tools/engine-vectors.json against engine.js.
// Usage: node --test Lab/js/engine.test.mjs   (from the repo root)
// Lane A owns this file. If a vector fails, the engine is wrong — not the vector
// (vectors change only via a PRD amendment).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  scoreRound, winCheck, omkampResolve, buildOptions, visibleOptionsFor,
  createGame, dispatch, canOpenVote, gmForRound, normalize,
  bluffersExpected, votersExpected, readyToOpenVote,
} from "./engine.js";

const vectors = JSON.parse(
  await readFile(new URL("../../Tools/engine-vectors.json", import.meta.url), "utf8"),
);

const toArray = (obj, n) => Array.from({ length: n }, (_, i) => obj[String(i)] ?? 0);

// -- round scoring vectors ----------------------------------------------------
for (const v of vectors.rounds) {
  test(`round ${v.id}`, () => {
    const n = v.players.length;
    const result = scoreRound({
      playerCount: n,
      gm: 0,
      options: v.options,
      votes: v.votes,
      doubles: v.doubles ?? [],
    });
    assert.deepEqual(result.deltas, toArray(v.expected.deltas, n), "deltas");
    assert.equal(result.gmStole, v.expected.gmStole, "gmStole");
    assert.deepEqual(result.bluffVotes, toArray(v.expected.bluffVotes, n), "bluffVotes");
  });
}

// -- game-level vectors (rotation, win, omkamp) -------------------------------
test("game G1-win-only-at-rotation-end", () => {
  const g = vectors.games.find((x) => x.id === "G1-win-only-at-rotation-end");
  const n = g.players.length;
  const scores = Array(n).fill(0);
  g.roundDeltas.forEach((deltas, r) => {
    for (let i = 0; i < n; i++) scores[i] += deltas[String(i)] ?? 0;
    const check = winCheck({ scores, round: r + 1, playerCount: n, target: g.target });
    assert.equal(check.checked, g.expected.winCheckAfterRound[r], `checked after round ${r + 1}`);
    const winner = check.winners ? g.players[check.winners[0]] : null;
    assert.equal(winner, g.expected.winnerAfterRound[r], `winner after round ${r + 1}`);
  });
  assert.deepEqual(scores, toArray(g.expected.finalScores, n), "final scores");
});

test("game G2-tie-triggers-omkamp", () => {
  const g = vectors.games.find((x) => x.id === "G2-tie-triggers-omkamp");
  const n = g.players.length;
  const scores = Array(n).fill(0);
  let omkamp = null;
  g.roundDeltas.forEach((deltas, r) => {
    for (let i = 0; i < n; i++) scores[i] += deltas[String(i)] ?? 0;
    const check = winCheck({ scores, round: r + 1, playerCount: n, target: g.target });
    if (r + 1 === g.expected.omkampAfterRound) {
      assert.ok(check.omkamp, "omkamp triggered");
      omkamp = check.omkamp;
    } else {
      assert.equal(check.omkamp, null, `no omkamp after round ${r + 1}`);
    }
  });
  assert.deepEqual(omkamp.participants.map((i) => g.players[i]), g.expected.omkampParticipants);
  assert.equal(g.players[omkamp.gm], g.expected.omkampGm);
  assert.deepEqual(scores, toArray(g.expected.finalScores, n));
});

test("game G3-omkamp-still-tied-shared-victory", () => {
  const g = vectors.games.find((x) => x.id === "G3-omkamp-still-tied-shared-victory");
  const n = g.players.length;
  const result = omkampResolve({
    scores: toArray(g.setup.scores, n),
    participants: g.setup.participants,
    deltas: g.omkampDeltas,
  });
  assert.equal(result.shared, g.expected.sharedVictory, "shared victory");
  assert.deepEqual(result.winners.map((i) => g.players[i]), g.expected.winners);
});

// -- behavior vectors ---------------------------------------------------------
const rng = () => 0.5;
const baseGame = () => {
  let s = createGame({ players: ["GM", "Anne", "Bo", "Cam"], target: 15, rng });
  s = dispatch(s, { type: "drawCard", card: { prompt: "dvergmål", truth: "Gammelt og poetisk ord for ekko." } });
  return s;
};

test("E1-empty-bluff-rejected", () => {
  const v = vectors.behaviors.find((x) => x.id === "E1-empty-bluff-rejected");
  const before = baseGame();
  const after = dispatch(before, v.action);
  assert.equal(after.rejected, v.expected.rejected);
  assert.deepEqual(after.bluffs, before.bluffs, "state unchanged");
});

test("E2-decoy-gating", () => {
  let s = baseGame();
  s = dispatch(s, { type: "submitBluff", player: 1, text: "en slags fiskesuppe" });
  s = dispatch(s, { type: "submitBluff", player: 2, text: "gammelt mål for ved" });
  s = dispatch(s, { type: "submitBluff", player: 3, text: "dans fra Setesdal" });
  assert.equal(canOpenVote(s), false, "all bluffs in but GM decoys unsettled");
  assert.equal(dispatch(s, { type: "openVote" }).rejected, true, "openVote blocked");
  s = dispatch(s, { type: "gmDecoysDone", decoys: ["det lille hullet i en ostehøvel"] });
  assert.equal(canOpenVote(s), true, "decoys settled → vote can open");
  assert.equal(dispatch(s, { type: "openVote" }).phase, "voting");
});

test("E3-gm-drop-restarts-round", () => {
  const v = vectors.behaviors.find((x) => x.id === "E3-gm-drop-restarts-round");
  let s = createGame({ players: ["A", "B", "C", "D"], target: 15, rng });
  s = { ...s, gm: v.given.gm, phase: v.given.phase };
  s = dispatch(s, { type: "drawCard", card: { prompt: "x", truth: "y" } });
  s = { ...s, gm: v.given.gm };
  const after = dispatch(s, v.action);
  assert.equal(after.gm, v.expected.newGm, "GM role passes to next player");
  assert.equal(after.roundRestarted, v.expected.roundRestarted);
  assert.equal(after.card, null, "fresh card required");
});

test("E4-own-answer-hidden", () => {
  const v = vectors.behaviors.find((x) => x.id === "E4-own-answer-hidden");
  const round = vectors.rounds.find((x) => x.id === v.given);
  for (const [voter, ids] of Object.entries(v.expected.visibleOptionsFor)) {
    const visible = visibleOptionsFor(round.options, Number(voter)).map((o) => o.id);
    assert.deepEqual(visible.sort(), [...ids].sort(), `voter ${voter}`);
  }
});

test("E5-gm-does-not-vote", () => {
  let s = baseGame();
  for (const [i, t] of [[1, "aaa"], [2, "bbb"], [3, "ccc"]]) s = dispatch(s, { type: "submitBluff", player: i, text: t });
  s = dispatch(s, { type: "gmDecoysDone", decoys: [] });
  s = dispatch(s, { type: "openVote" });
  const after = dispatch(s, { type: "castVote", player: 0, option: s.options[0].id });
  assert.equal(after.rejected, true);
});

test("E6-gm-rotation-order", () => {
  const v = vectors.behaviors.find((x) => x.id === "E6-gm-rotation-order");
  const got = v.expected.gmByRound.map((_, r) => gmForRound(r + 1, v.given.players));
  assert.deepEqual(got, v.expected.gmByRound);
});

// -- phase timeouts (PRD §5.2a) ----------------------------------------------

test("E7-late-bluff-rejected", () => {
  const v = vectors.behaviors.find((x) => x.id === "E7-late-bluff-rejected");
  let s = baseGame();
  s = dispatch(s, { type: "submitBluff", player: 1, text: "en slags fiskesuppe" });
  s = dispatch(s, { type: "submitBluff", player: 2, text: "gammelt mål for ved" });
  s = dispatch(s, { type: "timeoutBluffs" });                 // Cam (3) never submitted
  assert.deepEqual(s.timedOut.bluff, [3], "only the pending seat is timed out");
  const after = dispatch(s, v.action);
  assert.equal(after.rejected, v.expected.rejected);
  assert.deepEqual(after.bluffs, s.bluffs, "state unchanged — the pool is settled");
});

test("E8-decoy-timeout-opens-vote", () => {
  const v = vectors.behaviors.find((x) => x.id === "E8-decoy-timeout-opens-vote");
  let s = baseGame();
  for (const [i, t] of [[1, "aaa"], [2, "bbb"], [3, "ccc"]]) s = dispatch(s, { type: "submitBluff", player: i, text: t });
  assert.equal(canOpenVote(s), false, "all bluffs in but the GM's decoy state is unsettled");
  s = dispatch(s, v.action);
  assert.equal(s.gmDecoyDone, v.expected.gmDecoyDone);
  assert.equal(s.decoys.length, v.expected.decoysKept, "a partial draft survives the timeout");
  assert.equal(canOpenVote(s), v.expected.canOpenVote);
  assert.equal(dispatch(s, { type: "openVote" }).phase, v.expected.phaseAfterOpen);
});

test("E9-timeout-is-not-dropped", () => {
  const v = vectors.behaviors.find((x) => x.id === "E9-timeout-is-not-dropped");
  const seat = v.given.player;
  let s = baseGame();
  s = dispatch(s, { type: "timeoutBluffs", players: [seat] });
  assert.equal(s.players[seat].dropped, v.expected.dropped, "timeout must never set dropped");
  assert.equal(s.players.length, 4, "still counted in playerCount");
  assert.ok(!bluffersExpected(s).includes(seat), "not waited on for the rest of this round");
  assert.ok(votersExpected(s).includes(seat), "a missed bluff does not forfeit the vote (D4)");

  // The next card clears the slate — this is what makes it per-round, not a drop.
  const next = dispatch(s, { type: "drawCard", card: { prompt: "x", truth: "y" } });
  assert.deepEqual(next.timedOut, { bluff: [], vote: [] });
  assert.ok(bluffersExpected(next).includes(seat), "expected again next round");
});

test("timeout gates: readyToOpenVote ignores seats that timed out", () => {
  let s = baseGame();
  s = dispatch(s, { type: "submitBluff", player: 1, text: "aaa" });
  s = dispatch(s, { type: "submitBluff", player: 2, text: "bbb" });
  s = dispatch(s, { type: "gmDecoysDone", decoys: [] });
  assert.equal(canOpenVote(s), false, "still waiting on Cam");
  s = dispatch(s, { type: "timeoutBluffs" });
  assert.equal(canOpenVote(s), true, "the window closing unblocks the shuffle");
  // The same rule, called the way ui.js calls it.
  assert.equal(readyToOpenVote({ expected: bluffersExpected(s), bluffs: s.bluffs, gmDecoyDone: s.gmDecoyDone }), true);
});

// -- structural sanity: dobbeltreff + merge via buildOptions ------------------
test("buildOptions merges identical bluffs and extracts dobbeltreff", () => {
  const { options, doubles } = buildOptions({
    truth: "Gammelt og poetisk ord for ekko.",
    bluffs: {
      1: "En slags fiskesuppe",
      2: "gammelt og poetisk ord for ekko",   // ≈ truth → dobbeltreff
      3: "en slags fiskesuppe!",              // ≈ bluff 1 → merge
    },
    decoys: ["Sjømannsuttrykk for slakk i et tau"],
    gm: 0,
    rng,
  });
  assert.deepEqual(doubles, [2]);
  const merged = options.find((o) => o.kind === "bluff");
  assert.deepEqual(merged.authors.sort(), [1, 3]);
  assert.equal(options.filter((o) => o.kind === "truth").length, 1);
  assert.equal(options.filter((o) => o.kind === "decoy").length, 1);
  assert.equal(options.length, 3, "merged bluff + decoy + truth");
  assert.ok(options.every((o) => o.id), "options are lettered");
});

test("normalize strips punctuation, case and whitespace", () => {
  assert.equal(normalize("  En SLAGS   fiskesuppe! "), "en slags fiskesuppe");
});
