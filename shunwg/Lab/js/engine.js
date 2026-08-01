// engine.js — pure Snifferoo rules engine. Lane A owns this file (LANES.md).
// No DOM, no timers, no Math.random — randomness comes in via an injected rng.
// Rules authority: Tools/engine-vectors.json (PRD §5.3–§5.5). The SwiftUI
// GameEngine must mirror these functions 1:1; keep every rule in a named,
// separately testable export.

export const PHASES = Object.freeze([
  "setup", "card", "bluffing", "voting", "reveal", "board", "omkamp", "winner",
]);

// -- text rules ---------------------------------------------------------------

// Normalization used for dobbeltreff detection and identical-bluff merging.
export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[.,!?;:«»"'’`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidBluff(text) {
  return normalize(text).length > 0;
}

// -- option pool --------------------------------------------------------------

// Build the vote pool from submitted bluffs + GM decoys + the truth.
// Dobbeltreff (bluff ≈ truth) is pulled out (author gets +3 later, D3);
// identical bluffs merge into one option with all authors (PRD §5.5).
export function buildOptions({ truth, bluffs, decoys, gm, rng }) {
  const doubles = [];
  const byText = new Map(); // normalized text -> option
  for (const [player, text] of Object.entries(bluffs)) {
    const idx = Number(player);
    const norm = normalize(text);
    if (norm === normalize(truth)) { doubles.push(idx); continue; }
    if (byText.has(norm)) byText.get(norm).authors.push(idx);
    else byText.set(norm, { kind: "bluff", authors: [idx], text });
  }
  const options = [...byText.values()];
  for (const text of decoys) options.push({ kind: "decoy", authors: [gm], text });
  options.push({ kind: "truth", authors: [], text: truth });
  shuffle(options, rng);
  options.forEach((o, i) => { o.id = String.fromCharCode(97 + i); });
  return { options, doubles };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// A voter never sees an option they authored (PRD §5.2#4).
export function visibleOptionsFor(options, voter) {
  return options.filter((o) => !o.authors.includes(voter));
}

// -- who is expected to act (PRD §5.2a, §5.5) ---------------------------------
//
// These three are the single source of truth for "is this round waiting on
// anyone?". ui.js imports them for the live game; dispatch() calls them for the
// reducer. Written once on purpose: when the rule lived in two places, a vector
// could pass while the shipped game did something else.
//
// A timed-out player is skipped for THIS ROUND ONLY (D4). They are not dropped:
// they keep their score, still count toward playerCount and the win check, and
// are expected again after the next drawCard.

const egTimedOut = (t) => ({ bluff: t?.bluff ?? [], vote: t?.vote ?? [] });
const egUnion = (a, b) => [...new Set([...a, ...b])].sort((x, y) => x - y);

// Seats that still owe a bluff. In omkamp only the tied players write (PRD §5.4).
export function bluffersExpected({ players, gm, inOmkamp = false, omkampParticipants = [], timedOut = null }) {
  const skipped = egTimedOut(timedOut).bluff;
  const base = inOmkamp
    ? omkampParticipants
    : players.map((_, i) => i).filter((i) => i !== gm && !players[i].dropped);
  return base.filter((i) => !skipped.includes(i));
}

// Seats that still owe a vote. In omkamp everyone but the GM votes, including
// players who aren't bluffing this round — mirrors voteOrder() in ui.js.
export function votersExpected({ players, gm, inOmkamp = false, timedOut = null }) {
  const skipped = egTimedOut(timedOut).vote;
  const base = players
    .map((_, i) => i)
    .filter((i) => i !== gm && (inOmkamp || !players[i].dropped));
  return base.filter((i) => !skipped.includes(i));
}

// The shuffle may never fire before every expected bluff is in AND the GM's
// decoy state is settled (PRD §5.5 decoy gating).
export function readyToOpenVote({ expected, bluffs, gmDecoyDone }) {
  return Boolean(gmDecoyDone) && expected.every((i) => i in bluffs);
}

// -- scoring (PRD §5.3) -------------------------------------------------------

// votes: {voterIndex: optionId}. Returns per-player deltas, the Gullnese
// bluff-vote tally, and whether the GM stole the round.
export function scoreRound({ playerCount, gm, options, votes, doubles = [] }) {
  const deltas = Array(playerCount).fill(0);
  const bluffVotes = Array(playerCount).fill(0);
  for (const d of doubles) deltas[d] += 3; // dobbeltreff (+3, merged with truth)

  const votersByOption = new Map();
  for (const [voter, optId] of Object.entries(votes)) {
    if (!votersByOption.has(optId)) votersByOption.set(optId, []);
    votersByOption.get(optId).push(Number(voter));
  }

  let truthFound = false;
  for (const opt of options) {
    const voters = votersByOption.get(opt.id) ?? [];
    if (opt.kind === "truth") {
      for (const v of voters) deltas[v] += 2; // +2 truth vote
      if (voters.length > 0) truthFound = true;
    } else if (voters.length > 0) {
      // +1 per vote to the author; merged options split rounding up (D1),
      // but each author's Gullnese tally is credited the full vote count.
      const share = Math.ceil(voters.length / opt.authors.length);
      for (const a of opt.authors) {
        deltas[a] += share;
        bluffVotes[a] += voters.length;
      }
    }
  }

  const gmStole = !truthFound;
  if (gmStole) deltas[gm] += 2; // "Spillmesteren vant runden!"
  return { deltas, gmStole, bluffVotes };
}

// -- game length & fairness (PRD §5.4) ----------------------------------------

// The win check fires only when a full GM rotation completes (D2).
export function winCheck({ scores, round, playerCount, target }) {
  if (round % playerCount !== 0) return { checked: false, winners: null, omkamp: null };
  const past = scores.map((s, i) => ({ s, i })).filter(({ s }) => s >= target);
  if (past.length === 0) return { checked: true, winners: null, omkamp: null };
  const max = Math.max(...past.map(({ s }) => s));
  const leaders = past.filter(({ s }) => s === max).map(({ i }) => i);
  if (leaders.length === 1) return { checked: true, winners: leaders, omkamp: null };
  // Tie past the line → omkamp: tied players bluff, next-highest scorer is GM.
  let omkampGm = null, best = -Infinity;
  scores.forEach((s, i) => {
    if (!leaders.includes(i) && s > best) { best = s; omkampGm = i; }
  });
  return { checked: true, winners: null, omkamp: { participants: leaders, gm: omkampGm } };
}

// Sudden-death resolution: still tied → shared victory, shared confetti.
export function omkampResolve({ scores, participants, deltas }) {
  const next = scores.map((s, i) => s + (deltas[i] ?? deltas[String(i)] ?? 0));
  const max = Math.max(...participants.map((i) => next[i]));
  const winners = participants.filter((i) => next[i] === max);
  return { scores: next, winners, shared: winners.length > 1 };
}

// -- state machine ------------------------------------------------------------

export function createGame({ players, target, rng }) {
  return {
    phase: "card",
    players: players.map((name) => ({ name, score: 0, bluffVotes: 0, dropped: false })),
    target,
    round: 1,
    gm: 0,
    card: null,
    bluffs: {},
    decoys: [],
    gmDecoyDone: false,
    options: null,
    doubles: [],
    votes: {},
    timedOut: { bluff: [], vote: [] }, // per-round, cleared on drawCard (D4)
    lastResult: null,
    omkamp: null,
    winners: null,
    shared: false,
    rng: rng ?? (() => 0.5),
  };
}

export function activeBluffers(state) {
  return bluffersExpected({ players: state.players, gm: state.gm, timedOut: state.timedOut });
}

export function allBluffsIn(state) {
  return activeBluffers(state).every((i) => i in state.bluffs);
}

// The shuffle may never fire before the GM decoy state is settled (PRD §5.5).
export function canOpenVote(state) {
  return readyToOpenVote({
    expected: activeBluffers(state), bluffs: state.bluffs, gmDecoyDone: state.gmDecoyDone,
  });
}

export function allVotesIn(state) {
  return votersExpected({ players: state.players, gm: state.gm, timedOut: state.timedOut })
    .every((i) => i in state.votes);
}

export function gmForRound(round, playerCount, firstGm = 0) {
  return (firstGm + round - 1) % playerCount;
}

export function dispatch(state, action) {
  switch (action.type) {
    case "drawCard":
      return { ...state, phase: "bluffing", card: action.card, bluffs: {}, decoys: [], gmDecoyDone: false, votes: {}, options: null, doubles: [], timedOut: { bluff: [], vote: [] } };

    case "submitBluff": {
      if (action.player === state.gm) return { ...state, rejected: true };
      if (egTimedOut(state.timedOut).bluff.includes(action.player)) return { ...state, rejected: true }; // window closed
      if (!isValidBluff(action.text)) return { ...state, rejected: true }; // "Selv en dårlig løgn er bedre enn ingen."
      return { ...state, rejected: false, bluffs: { ...state.bluffs, [action.player]: action.text } };
    }

    // -- timeouts (PRD §5.2a). The clock lives outside the engine; expiry
    // arrives as an ordinary action, so every rule below is provable by a
    // vector with no timing in it. Only the host dispatches these.

    case "timeoutBluffs": {
      // Bluff window closed. Whoever hasn't submitted is skipped for this round:
      // their answer never reaches the option pool, so scoreRound sees exactly
      // what it sees for a dropped player — no scoring change needed (R8).
      const pending = action.players
        ?? bluffersExpected({ players: state.players, gm: state.gm, timedOut: state.timedOut })
             .filter((i) => !(i in state.bluffs));
      const bluffs = { ...state.bluffs };
      for (const i of pending) delete bluffs[i];
      const t = egTimedOut(state.timedOut);
      return { ...state, rejected: false, bluffs, timedOut: { ...t, bluff: egUnion(t.bluff, pending) } };
    }

    case "timeoutDecoys":
      // GM ran out of time composing. Whatever they typed stands; the gate opens
      // regardless, which is the same settled state a manual "done" produces (E8).
      return { ...state, rejected: false, decoys: action.decoys ?? state.decoys ?? [], gmDecoyDone: true };

    case "timeoutVotes": {
      // Vote window closed. A missing vote is simply absent from `votes`, which
      // scoreRound already handles — including flipping gmStole if the only
      // truth-voter was the one who timed out (R9).
      const pending = action.players
        ?? votersExpected({ players: state.players, gm: state.gm, timedOut: state.timedOut })
             .filter((i) => !(i in state.votes));
      const votes = { ...state.votes };
      for (const i of pending) delete votes[i];
      const t = egTimedOut(state.timedOut);
      return { ...state, rejected: false, votes, timedOut: { ...t, vote: egUnion(t.vote, pending) } };
    }

    case "gmDecoysDone":
      return { ...state, rejected: false, decoys: action.decoys ?? [], gmDecoyDone: true };

    case "openVote": {
      if (!canOpenVote(state)) return { ...state, rejected: true };
      const { options, doubles } = buildOptions({
        truth: state.card.truth, bluffs: state.bluffs, decoys: state.decoys, gm: state.gm, rng: state.rng,
      });
      return { ...state, rejected: false, phase: "voting", options, doubles };
    }

    case "castVote": {
      if (action.player === state.gm) return { ...state, rejected: true }; // the GM never votes
      if (state.players[action.player]?.dropped) return { ...state, rejected: true };
      if (egTimedOut(state.timedOut).vote.includes(action.player)) return { ...state, rejected: true }; // window closed
      const visible = visibleOptionsFor(state.options ?? [], action.player);
      if (!visible.some((o) => o.id === action.option)) return { ...state, rejected: true };
      return { ...state, rejected: false, votes: { ...state.votes, [action.player]: action.option } };
    }

    case "finishVoting": {
      const result = scoreRound({
        playerCount: state.players.length, gm: state.gm,
        options: state.options, votes: state.votes, doubles: state.doubles,
      });
      const players = state.players.map((p, i) => ({
        ...p, score: p.score + result.deltas[i], bluffVotes: p.bluffVotes + result.bluffVotes[i],
      }));
      return { ...state, phase: "reveal", players, lastResult: result };
    }

    case "completeRound": {
      const scores = state.players.map((p) => p.score);
      const check = winCheck({ scores, round: state.round, playerCount: state.players.length, target: state.target });
      if (check.winners) return { ...state, phase: "winner", winners: check.winners, shared: false };
      if (check.omkamp) return { ...state, phase: "omkamp", omkamp: check.omkamp };
      const round = state.round + 1;
      return { ...state, phase: "card", round, gm: gmForRound(round, state.players.length) };
    }

    case "removePlayer": {
      const players = state.players.map((p, i) => (i === action.player ? { ...p, dropped: true } : p));
      if (action.player === state.gm) {
        // GM dropped → role passes to the next active player, round restarts with a fresh card (PRD §5.5).
        let gm = state.gm;
        do { gm = (gm + 1) % players.length; } while (players[gm].dropped);
        return {
          ...state, players, gm, phase: "card", roundRestarted: true,
          card: null, bluffs: {}, decoys: [], gmDecoyDone: false, votes: {}, options: null, doubles: [],
        };
      }
      const bluffs = { ...state.bluffs }; delete bluffs[action.player];
      const votes = { ...state.votes }; delete votes[action.player];
      return { ...state, players, bluffs, votes, roundRestarted: false };
    }

    default:
      return state;
  }
}

export const selectors = {
  activeBluffers, allBluffsIn, canOpenVote, allVotesIn, visibleOptionsFor,
  bluffersExpected, votersExpected, readyToOpenVote,
};
