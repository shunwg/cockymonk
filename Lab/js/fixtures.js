// fixtures.js — canned "posed" states for every numbered screen (Screens/SCREENS.md).
// Powers Lab/gallery.html and Tools/snap-screens.mjs via index.html?fixture=NN.
// Segment 2 (Skjermer) owns this file; gate: `node --test Lab/js/fixtures.test.mjs`.
//
// Imports ONLY DOM-free modules (state.js, engine.js) so Node can test it, and
// declares zero top-level side effects so it is inert inside the standalone
// bundle when no ?fixture param is present. Because that bundle concatenates all
// modules into ONE scope, every top-level name here is prefixed fx* (plus the
// two exports FIXTURES / getFixture) to stay collision-free.

import { freshUi, AVA, MINI_DECK, MINI_FAKES } from "./state.js";
import { buildOptions } from "./engine.js";

// The fixture cast (same four names as the playtest-panel personas).
const fxNames = ["Åse", "Markus", "Ingrid", "Jonas"];
const fxCard = MINI_DECK.nb[0]; // { prompt: "dvergmål", truth: "Gammelt og poetisk ord for ekko." }

// Mirrors the G literal in ui.js startGame() — keep the two in sync (see the
// cross-comment there). winnersIdx/shared are set by finishRound in live play,
// so only the WINNER fixture adds them.
function fxMakeG(overrides = {}) {
  return {
    players: fxNames.map((name, i) => ({
      name,
      color: AVA[i],
      score: [6, 8, 5, 3][i],
      bluffVotes: [2, 4, 1, 5][i],
      dropped: false,
      pid: `fx:${i}`,          // fixtures are posed, never networked
      kind: "human",
    })),
    target: 15,
    round: 2,
    gm: 0,
    phase: "bluffing",
    card: fxCard, bluffs: {}, decoys: ["", ""], gmDecoyDone: true,
    options: null, doubles: [], votes: {}, deltas: null, gmStole: false,
    revealIdx: 0,
    timedOut: { bluff: [], vote: [] },
    deadline: null,            // null keeps every posed screen static for snap-screens
    timers: fxTimers(),
    inOmkamp: false, omkampParticipants: [], preOmkampScores: null,
    goalCelebrated: false, celebrated: false, awaitingNext: false, ratingDone: false,
    ...overrides,
  };
}

// Inlined rather than imported from clock.js: fixtures.js deliberately imports
// only DOM-free, side-effect-free modules, and clock.js owns a live interval.
const fxTimers = () => ({ on: false, bluffMs: 60000, decoyMs: 45000, voteMs: 45000, revealMs: 25000 });

// A full vote pool the way openVote() builds it: three bluffs + one GM decoy +
// the truth, shuffled by the engine with a FIXED rng so letters (and therefore
// the gallery + PNGs) are deterministic. Returns options with .letter attached.
function fxPool(gm) {
  const bluffs = {};
  fxNames.map((_, i) => i).filter((i) => i !== gm)
    .forEach((i, k) => { bluffs[i] = MINI_FAKES.nb[k]; });
  const built = buildOptions({
    truth: fxCard.truth,
    bluffs,
    decoys: [MINI_FAKES.nb[4]],
    gm,
    rng: () => 0.5,
  });
  return {
    options: built.options.map((o) => ({ ...o, letter: o.id.toUpperCase() })),
    doubles: built.doubles,
    bluffs,
  };
}
const fxOptIdBy = (options, pred) => options.find(pred).id;
const fxTruthId = (options) => fxOptIdBy(options, (o) => o.kind === "truth");
const fxBluffIdOf = (options, author) =>
  fxOptIdBy(options, (o) => o.kind === "bluff" && o.authors.includes(author));

// One entry per numbered screen. `make()` returns { u: <partial over freshUi()>,
// g: <game state or null> }. Numbers are the permanent registry contract.
export const FIXTURES = [
  { id: "01", screen: "HOME", name: "Hjem",
    make: () => ({ u: {}, g: null }) },

  { id: "02", screen: "LANG", name: "Språkvalg",
    make: () => ({ u: {}, g: null }) },

  { id: "03", screen: "MODE", name: "Spillmodus",
    make: () => ({ u: {}, g: null }) },

  { id: "04", screen: "PLAYERS", name: "Spillere",
    make: () => ({ u: { mode: "hotseat", names: fxNames.slice(0, 3) }, g: null }) },

  { id: "05", screen: "PARTYSETUP", name: "Party-oppsett",
    make: () => ({ u: { mode: "party", uname: "Åse", botCount: 3 }, g: null }) },

  { id: "06", screen: "SETUP", name: "Spilloppsett",
    // Party rather than hotseat, so the registry actually shows the phase-timer
    // controls (PRD §5.2a) — they only exist in the modes that use them, and a
    // screen nobody can review is a screen that rots.
    make: () => ({ u: { mode: "party", names: fxNames.slice() }, g: null }) },

  { id: "07", screen: "GM_INTRO", name: "Ny spillmester",
    make: () => ({ u: { mode: "hotseat" }, g: fxMakeG() }) },

  { id: "08", screen: "GM_DASH", name: "Spillmester-pulten",
    // Mixed chip states: two lies in, Jonas still composing; one decoy drafted.
    make: () => ({
      u: { mode: "hotseat" },
      g: fxMakeG({
        bluffs: { 1: MINI_FAKES.nb[0], 2: MINI_FAKES.nb[1] },
        decoys: [MINI_FAKES.nb[4], ""],
      }),
    }) },

  { id: "09", screen: "BLUFF", name: "Dikt en løgn",
    make: () => ({ u: { mode: "hotseat", cur: 1 }, g: fxMakeG() }) },

  { id: "10", screen: "WAIT", name: "Venterommet",
    // Party view: Markus is GM; Åse + Jonas delivered, Ingrid still thinking.
    make: () => ({
      u: { mode: "party" },
      g: fxMakeG({ gm: 1, bluffs: { 0: MINI_FAKES.nb[0], 3: MINI_FAKES.nb[2] } }),
    }) },

  { id: "11", screen: "VOTE", name: "Avstemning",
    make: () => {
      const pool = fxPool(1);
      return {
        u: { mode: "party" },
        g: fxMakeG({ gm: 1, bluffs: pool.bluffs, options: pool.options, doubles: pool.doubles }),
      };
    } },

  { id: "12", screen: "VOTEWAIT", name: "Stemmene tikker inn",
    // 2 of 3 votes in: Åse found the truth, Ingrid fell for Åse's lie.
    make: () => {
      const pool = fxPool(1);
      return {
        u: { mode: "party" },
        g: fxMakeG({
          gm: 1, bluffs: pool.bluffs, options: pool.options, doubles: pool.doubles,
          votes: { 0: fxTruthId(pool.options), 2: fxBluffIdOf(pool.options, 0) },
        }),
      };
    } },

  { id: "13", screen: "REVEAL", name: "Avsløringen",
    // Mid-ceremony (two lies unmasked, truth still hidden): noses visibly grown.
    make: () => {
      const pool = fxPool(0);
      return {
        u: { mode: "hotseat" },
        g: fxMakeG({
          // revealIdx moved U → G: the whole room watches the same beat, so it
          // has to travel with the game state (PRD §10 synced spectacle).
          phase: "reveal", revealIdx: 2,
          bluffs: pool.bluffs, options: pool.options, doubles: pool.doubles,
          votes: {
            1: fxTruthId(pool.options),
            2: fxBluffIdOf(pool.options, 3),
            3: fxBluffIdOf(pool.options, 1),
          },
        }),
      };
    } },

  { id: "14", screen: "BOARD", name: "Brettet",
    // Posed composite: delta badges visible AND "Neste runde" armed in one frame
    // (live play shows them sequentially — the pose packs more reference info).
    make: () => ({
      u: { mode: "hotseat" },
      g: fxMakeG({ deltas: [0, 3, 2, 0], awaitingNext: true }),
    }) },

  { id: "15", screen: "OMKAMP", name: "Omkamp",
    make: () => {
      const g = fxMakeG({
        inOmkamp: true, omkampParticipants: [1, 2], preOmkampScores: [9, 16, 16, 3],
      });
      [9, 16, 16, 3].forEach((s, i) => { g.players[i].score = s; });
      return { u: { mode: "hotseat" }, g };
    } },

  { id: "16", screen: "WINNER", name: "Vinner",
    // celebrated:true keeps the frame silent + static (no fanfare, no confetti):
    // 18 gallery iframes must not each construct an AudioContext.
    make: () => {
      const g = fxMakeG({ celebrated: true });
      g.winnersIdx = [1]; g.shared = false;
      [9, 16, 12, 3].forEach((s, i) => { g.players[i].score = s; });
      return { u: { mode: "hotseat" }, g };
    } },

  { id: "17", screen: "RULES", name: "Slik spiller du",
    make: () => ({ u: { rulesReturn: "HOME" }, g: null }) },

  { id: "18", screen: "ABOUT", name: "Om",
    make: () => ({ u: { rulesReturn: "HOME" }, g: null }) },

  // 19+ are the numbers added by the v1.1 work (PRD §2.1). PROFILE renders from
  // the live career profile in ui.js rather than from `u`, because a career
  // outlives any single game — under snap-screens that is always a fresh 1000.
  { id: "19", screen: "PROFILE", name: "Profilen din",
    make: () => ({ u: { rulesReturn: "HOME" }, g: null }) },
];

// Resolve a fixture id ("07") to boot-ready state, or null for unknown/absent ids.
export function getFixture(id) {
  const def = FIXTURES.find((f) => f.id === id);
  if (!def) return null;
  const made = def.make();
  return { u: Object.assign(freshUi(), { screen: def.screen }, made.u), g: made.g };
}
