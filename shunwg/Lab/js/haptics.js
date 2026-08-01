// haptics.js — the phone itself, not the screen. Vibration and the screen-wake
// lock. Segment 7 (LANES.md), alongside audio.js and bots.js.
//
// This is the ONLY file that may touch navigator.vibrate or the Wake Lock API.
// Same shape as Ordkrig's src/lib/sfx.ts, which is the model worth copying: the
// rest of the app imports named intents and never an API, every intent has a
// degraded path, and nothing here can ever throw into game logic.
//
// WHAT IT REPLACES
// DesignSystem/tokens.json names a haptic on four springs (chipFlip → light,
// pawnHop → soft, truthReveal → success, gmStealPulse → heavy) and PRD §10
// promises "every meaningful beat has one". The Lab shipped exactly one: a bare
// navigator.vibrate(10) inlined in animateBoard(), neither mute-guarded nor
// named. Five intents, one file, wired to the beats the tokens already annotate.
//
// HONEST LIMITATION, stated once so nobody re-discovers it as a bug:
// Safari does not implement the Vibration API — on iPhone every call here is a
// no-op, and iOS gets its real haptics from the SwiftUI app via
// UIImpactFeedbackGenerator. So this layer is Android-web only. It is still
// worth having (Android is most of the shared-link audience), but a beat must
// never DEPEND on the haptic leg: see the game-feel skill, principle 4 — where a
// platform cannot deliver one leg, the other two get stronger.

// Durations in ms. An array is a vibrate/pause/vibrate pattern.
//
// The point of separating these is that the DURATION carries the semantic weight
// even though the web has no impact-style API to carry it — Ordkrig does the
// same thing with 100/150/300 in its fallback path. Ours are much shorter
// because these fire mid-tap, several times a second during a board ceremony,
// and a 100 ms buzz per pawn hop reads as a malfunction rather than a beat.
export const HAPTICS = Object.freeze({
  light: 10,              // chip flips in, a vote lands — the lightest possible ack
  soft: 14,               // one pawn hop. Fires up to 5× at 330 ms, so it must stay tiny
  success: [12, 30, 24],  // the truth. Two pulses: an event, not a tick
  heavy: 40,              // the GM stole the round. The only one meant to feel like a thud
  warning: [24, 48, 24],  // the clock has gone urgent and you have not acted
  // The clock has entered its closing window (15 s) and you have not acted. One
  // short tap, lighter than `warning`, because it is the quieter half of a
  // two-beat escalation: this says "moving", warning says "nearly gone". Fired
  // once on entry — the pulse that follows is a visual state, and buzzing at
  // 2.5 Hz for fifteen seconds would drain the battery and the goodwill.
  closing: 16,
});

// Suppressed by mute, and ONLY by mute. A muted party game means "be discreet",
// and a phone buzzing on a hard table is audible across a room — so mute has to
// cover this too or the setting does not do what it says.
//
// Deliberately NOT gated on prefers-reduced-motion. That setting is about
// vestibular comfort, not sensory volume, and killing the haptic there would
// leave a Reduced-Motion player with the weakest version of every beat — the
// opposite of what the game-feel skill requires (principle 10: a variant lands
// the beat with sound and haptics carrying MORE, never by removing things).
let mutedFn = () => false;

/** Called once at boot so this module can ask about mute without importing audio.js. */
export function hapticsBindMute(fn) { if (typeof fn === "function") mutedFn = fn; }

export const hapticsSupported = () =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/**
 * Fire a named intent. Unknown names are a silent no-op, matching play() in
 * audio.js — a typo must never break a round.
 */
export function haptic(intent) {
  const pattern = HAPTICS[intent];
  if (pattern === undefined || mutedFn() || !hapticsSupported()) return;
  try { navigator.vibrate(pattern); } catch { /* some engines throw on rapid calls */ }
}

/** Stop any pattern mid-flight — used when a phase is cut short. */
export function hapticsCancel() {
  if (!hapticsSupported()) return;
  try { navigator.vibrate(0); } catch { /* nothing to undo */ }
}

/* ---------- screen wake lock ----------
   A party game gets passed around a table for twenty minutes and stared at
   between taps. Without this the screen dims mid-round and the GM has to wake
   the phone to open the vote. Chromium-only for now (Safari has no Wake Lock
   API), acquired on game start and released on exit.

   The visibilitychange re-acquire is not optional: the browser drops the
   sentinel whenever the tab is backgrounded, and it does NOT come back on its
   own — so without this, one glance at a notification silently ends the lock
   for the rest of the evening. */

let sentinel = null;
let reacquire = null;

export const wakeSupported = () =>
  typeof navigator !== "undefined" && "wakeLock" in navigator;

export async function wakeOn() {
  if (!wakeSupported() || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener?.("release", () => { sentinel = null; });
  } catch { sentinel = null; return; }   // denied on an inactive tab or by policy

  if (!reacquire) {
    reacquire = () => {
      if (document.visibilityState === "visible" && !sentinel) wakeOn();
    };
    document.addEventListener("visibilitychange", reacquire);
  }
}

export async function wakeOff() {
  if (reacquire) { document.removeEventListener("visibilitychange", reacquire); reacquire = null; }
  const s = sentinel;
  sentinel = null;
  try { await s?.release(); } catch { /* already gone */ }
}
