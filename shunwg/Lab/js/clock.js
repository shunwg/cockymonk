// clock.js — phase deadlines for the browser build (PRD §5.2a). Segment 5.
//
// The engine has no clock and never will (LANES.md contract 1). This module
// decides WHEN; the engine then receives an ordinary action it cannot tell
// apart from a player acting. That split is why every timeout rule is provable
// by a vector with no timing in it.
//
// Everything here is built around ONE number: an absolute epoch-ms deadline.
// "45 seconds left" cannot survive a network hop — by the time it arrives it is
// a lie. "Expires at 1774400045000" is still true on every device, so the host
// broadcasts the deadline and each client derives its own display from it.
//
// NO DOM in this file. The per-second repaint is a callback the caller supplies,
// because ui.js must update surgically — a full render() would wipe the bluff
// textarea 60 times a minute. Keeping the DOM out also means the whole module
// runs under `node --test` with no browser.
//
// BUNDLE NOTE: Tools/build-standalone.mjs concatenates every Lab module into
// ONE IIFE, so module-private names here become top-level names shared with
// every other module. state.js already owns `timers`, `later` and `clearTimers`
// — this file must never declare those. Private names are prefixed `ck`.
// (Lab/js/online.test.mjs asserts this, so the rule cannot rot silently.)

export const TIMERS = Object.freeze({
  // Phase lengths in ms. The host picks one per phase at game setup; three
  // choices each so screen 06 reuses the existing `.seg` control rather than
  // inventing a slider. Defaults are PRD §5.2a.
  BLUFF: Object.freeze({ choices: [30000, 60000, 120000], default: 60000 }),
  DECOY: Object.freeze({ choices: [30000, 45000, 90000], default: 45000 }),
  VOTE: Object.freeze({ choices: [30000, 45000, 90000], default: 45000 }),
  REVEAL: Object.freeze({ choices: [15000, 25000, 45000], default: 25000 }),

  TICK_MS: 250,        // 4 Hz so the last second never visibly stutters — but the
                       // DOM is only touched when the displayed integer changes.
  WARN_MS: 10000,      // bar → action colour, and one VoiceOver announcement
  URGENT_MS: 5000,     // bar → alert colour (never colour alone)
  PULSE_MS: 15000,     // the closing window: the screen starts breathing here
  SKEW_CLAMP_MS: 5000, // a peer whose clock is wilder than this gets no say
  GRACE_MS: 400,       // someone who tapped at 0:00.1 experienced making it
});

// Bot pacing lives in bots.js TUNING; phase deadlines live here. Two blocks
// because they answer to different masters — see LANES.md contract 5.

// The `timers` slice of G. Defaults OFF: hotseat passes one phone and paces
// itself, and C6 wires the clock in before C7 turns it on anywhere.
export const defaultTimers = () => ({
  on: false,
  bluffMs: TIMERS.BLUFF.default,
  decoyMs: TIMERS.DECOY.default,
  voteMs: TIMERS.VOTE.default,
  revealMs: TIMERS.REVEAL.default,
});

// A deadline is a fact about the round, not a countdown. It rides the host's
// broadcast unchanged; `round` and `phase` let a late-arriving expiry prove it
// still refers to the situation it was armed for.
export function clockDeadline(phase, ms, round, now = Date.now()) {
  return { at: now + ms, phase, round, totalMs: ms };
}

// ms remaining, clamped at 0. Pure.
export function clockLeft(deadline, skewMs = 0, now = Date.now()) {
  if (!deadline?.at) return null;
  return Math.max(0, deadline.at - (now + skewMs));
}

// What the player is shown. Ceil, so "1" means "you still have time".
export const clockSeconds = (leftMs) => (leftMs === null ? null : Math.ceil(leftMs / 1000));

export function clockLevel(leftMs) {
  if (leftMs === null) return null;
  if (leftMs <= TIMERS.URGENT_MS) return "urgent";
  if (leftMs <= TIMERS.WARN_MS) return "warn";
  return "calm";
}

/**
 * Beats per second for the closing pulse. 0 outside the window, then climbing
 * from a slow 0.8 Hz at 15 s to 2.5 Hz at zero.
 *
 * A RATE, not a level. clockLevel knows three values and steps between them;
 * what the closing seconds want is something that tightens continuously, so
 * that the acceleration itself is the information.
 *
 * CAPPED AT 2.5 Hz DELIBERATELY, AND THE CAP IS NOT A TASTE DECISION.
 * WCAG 2.3.1 draws the photosensitive-seizure line at three flashes per second,
 * and a full-screen pulse is precisely the stimulus that guideline exists for.
 * Do not raise this to make the ending feel more urgent — if it needs more
 * pressure, spend it on the sound or the haptic, which have no such ceiling.
 *
 * Pure, so the curve is provable without a browser. WHETHER it fires at all is
 * a separate question and deliberately not asked here: ui.js gates it on the
 * player still owing an answer, because a pulse aimed at someone who already
 * submitted tells them a lie about their own state.
 */
export function clockPulseHz(leftMs) {
  if (leftMs === null || leftMs === undefined) return 0;
  if (leftMs > TIMERS.PULSE_MS) return 0;
  const t = 1 - Math.max(0, leftMs) / TIMERS.PULSE_MS;   // 0 at the window edge → 1 at zero
  return 0.8 + t * 1.7;
}

// Fraction still to run, 1 → 0. Drives the depleting bar.
export function clockFraction(deadline, skewMs = 0, now = Date.now()) {
  const left = clockLeft(deadline, skewMs, now);
  if (left === null || !deadline.totalMs) return null;
  return Math.max(0, Math.min(1, left / deadline.totalMs));
}

// Is an arriving submission late? The grace window exists because a player who
// tapped as the ring emptied experienced sending it in time, and a party game
// should resolve that in the player's favour.
export function clockExpired(deadline, skewMs = 0, now = Date.now()) {
  if (!deadline?.at) return false;
  return now + skewMs > deadline.at + TIMERS.GRACE_MS;
}

// Offset between this device's clock and the host's, from the timestamp on
// every broadcast. Clamped, and cosmetic by construction: clients never fire
// expiry, so a bad clock can skew a display but never a rule.
export function clockSkew(hostNowMs, localNowMs = Date.now(), halfRttMs = 0) {
  const raw = hostNowMs + halfRttMs - localNowMs;
  return Math.max(-TIMERS.SKEW_CLAMP_MS, Math.min(TIMERS.SKEW_CLAMP_MS, raw));
}

// -- the single interval ------------------------------------------------------
// One timer for the whole app, and it is idempotent: clockArm always clears
// first, so a double-arm can never leave two intervals racing.

let ckHandle = null;
let ckArmed = null;
let ckShown = -1;

export const clockArmed = () => ckArmed;

/**
 * Arm the phase clock.
 * @param at        absolute epoch ms (from clockDeadline)
 * @param onTick    (leftMs, level) — called only when the displayed second
 *                  changes. This is where the caller does its surgical DOM
 *                  write; it must never trigger a full re-render.
 * @param onExpire  fired once at 0:00. **Pass null unless you are the host.**
 *                  Clients paint and nothing else, which is what makes
 *                  double-advance structurally impossible rather than a race
 *                  we hope to win.
 */
export function clockArm({ at, phase, round, totalMs, skewMs = 0, onTick = null, onExpire = null }) {
  clockClear();
  ckArmed = { at, phase, round, totalMs, skewMs, onTick, onExpire };
  ckShown = -1;
  ckTick();                                   // paint now, don't wait 250 ms
  if (ckArmed) ckHandle = setInterval(ckTick, TIMERS.TICK_MS);
  return ckArmed;
}

export function clockClear() {
  if (ckHandle !== null) { clearInterval(ckHandle); ckHandle = null; }
  ckArmed = null;
  ckShown = -1;
}

function ckTick() {
  const a = ckArmed;
  if (!a) return;
  const left = clockLeft({ at: a.at }, a.skewMs);
  const secs = clockSeconds(left);
  if (secs !== ckShown) {
    ckShown = secs;
    a.onTick?.(left, clockLevel(left));
  }
  if (left <= 0) {
    const fire = a.onExpire;
    clockClear();          // clear BEFORE firing — onExpire usually re-arms us
    fire?.();
  }
}
