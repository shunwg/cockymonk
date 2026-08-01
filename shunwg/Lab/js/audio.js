// audio.js — sound grammar for the Lab. Lane B may restyle voices; event NAMES
// are the contract (LANES.md seam #4) and mirror tokens.json → sound.grammar.
// A procedural WebAudio "sound designer" (no files) so it works offline; the iOS
// app plays the promoted Kenney/.caf files for the same events.
//
// Design intent (emil-design-eng: "match the motion to the mood"): this is a
// playful quiz-show, so voices lean theatrical — a gong when the vote opens, a
// rising boing per liar's-nose notch, a comedic wah-wah when the GM steals, a
// triumphant chord for the truth. Everything ducks quiet; nothing screeches.

import { haptic } from "./haptics.js";

let ctx = null;
let muted = false;
let noiseBuf = null;
let bus = null;

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function ac() {
  if (!ctx) ctx = new (window.AudioContext ?? window.webkitAudioContext)();
  return ctx;
}

/* One master bus, and every voice goes through it. Two reasons, both real:

   1. HEADROOM. voteOpen fires five oscillators inside 200 ms and truthReveal
      four; wired straight to destination those sum past 1.0 and clip, which on a
      phone speaker is a crackle exactly on the game's biggest beat. The
      compressor catches the sum instead of us hand-balancing every gain.
   2. DESIGN.md §7 says "all audio ducks under, never over, the room". That was
      an unimplemented sentence while there was no bus to duck. Now it is one
      gain node.

   Threshold/ratio are gentle: this is a limiter for peaks, not a pumping
   loudness effect. Cheap enough to build once and leave in the graph. */
function master() {
  if (bus) return bus;
  const a = ac();
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  const g = a.createGain();
  g.gain.value = 0.9;                 // a hair below unity: the room is louder than us
  comp.connect(g).connect(a.destination);
  bus = comp;
  return bus;
}

/* iOS suspends the AudioContext whenever the tab loses focus and does NOT resume
   it on return, so before this the game went permanently silent the first time
   you switched apps — and stayed silent through every later round. Autoplay
   policy also starts the context suspended until a gesture touches it.

   Called from a real event handler in ui.js (a bare resume() outside a gesture
   is ignored), and again on visibilitychange. Safe to call repeatedly. */
export function audioUnlock() {
  try {
    const a = ac();
    if (a.state !== "running") a.resume?.();
  } catch { /* no audio on this device; the game is still playable */ }
}

export function audioSuspended() {
  try { return !!ctx && ctx.state !== "running"; } catch { return false; }
}

// A short white-noise buffer, reused for whooshes/riffles.
function noise() {
  if (!noiseBuf) {
    const a = ac();
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// One tone with an ADSR-ish gain envelope. freq may be [from, to] to glide.
function tone(freq, { dur = 0.12, type = "triangle", gain = 0.05, when = 0, attack = 0.006 } = {}) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  if (Array.isArray(freq)) { o.frequency.setValueAtTime(freq[0], t); o.frequency.exponentialRampToValueAtTime(Math.max(1, freq[1]), t + dur); }
  else o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master());
  o.start(t); o.stop(t + dur + 0.03);
}

// Filtered noise burst — card whoosh / riffle / shuffle.
function whoosh({ dur = 0.18, when = 0, gain = 0.05, from = 1200, to = 400, q = 0.7 } = {}) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + when;
  const src = a.createBufferSource(); src.buffer = noise();
  const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master());
  src.start(t); src.stop(t + dur + 0.02);
}

const CHORD = [523.25, 659.25, 783.99]; // C major, the "truth" chord

// Event grammar — names match tokens.json sound.grammar keys.
const VOICES = {
  // — UI —
  confirm:  () => { tone(560, { type: "triangle", dur: 0.09, gain: 0.05 }); tone(760, { type: "triangle", dur: 0.09, gain: 0.04, when: 0.05 }); },
  toggle:   () => tone(500, { type: "square", dur: 0.05, gain: 0.035 }),
  back:     () => tone(360, { type: "triangle", dur: 0.07, gain: 0.035 }),
  error:    () => { tone([320, 180], { type: "sawtooth", dur: 0.18, gain: 0.045 }); },

  // The last five seconds. Ordkrig's countdown is silent — visual siren plus one
  // haptic — which leaves a player looking away with nothing at all. Two soft
  // falling sines, a fourth apart, deliberately quiet: this fires while someone
  // is mid-sentence writing a lie, so it must read as a nudge from the room, not
  // an alarm. One shot on ENTERING urgency; the pulse itself is a state, not a
  // beat, and a tone every 660 ms for five seconds would be unbearable.
  urgent:   () => { tone([620, 470], { type: "sine", dur: 0.34, gain: 0.045 }); tone([466, 350], { type: "sine", dur: 0.42, gain: 0.032, when: 0.16 }); },

  // Entering the closing window at 15 s — the first of the two clock beats, and
  // deliberately the smaller one. A single soft falling sine: "the clock is
  // moving", not "you are out of time", which is what `urgent` says ten seconds
  // later. Quieter and shorter than urgent so the pair reads as an escalation
  // rather than as the same alarm twice. One shot on entry; the pulse that
  // follows is a state, and a tone per cycle for fifteen seconds is torture.
  closing:  () => { tone([540, 430], { type: "sine", dur: 0.26, gain: 0.030 }); },

  // — round —
  cardDraw: () => { whoosh({ from: 1600, to: 500, dur: 0.16, gain: 0.045 }); tone(440, { type: "triangle", dur: 0.1, gain: 0.04, when: 0.12 }); tone(587, { type: "triangle", dur: 0.12, gain: 0.04, when: 0.18 }); },
  tickIn:   () => { tone(880, { type: "triangle", dur: 0.05, gain: 0.05 }); tone(1180, { type: "sine", dur: 0.06, gain: 0.035, when: 0.03 }); },
  cardShuffle: () => { for (let i = 0; i < 7; i++) whoosh({ from: 900 + Math.random() * 700, to: 300, dur: 0.06, gain: 0.03, when: i * 0.05, q: 1.2 }); },

  // — the showstopper: GM opens the vote (PRD §11 "reaction every round") —
  voteOpen: () => {
    whoosh({ from: 300, to: 1400, dur: 0.22, gain: 0.05 });            // riser
    [523, 659, 784, 1046].forEach((f, i) => tone(f, { type: "triangle", dur: 0.5, gain: 0.05, when: 0.18 + i * 0.02 })); // gong-ish bloom
    tone(1046, { type: "sine", dur: 0.4, gain: 0.03, when: 0.2 });
  },
  voteCast: () => { tone(700, { type: "square", dur: 0.05, gain: 0.05 }); tone(520, { type: "triangle", dur: 0.06, gain: 0.03, when: 0.03 }); },

  // — reveal —
  drumroll: () => { for (let i = 0; i < 10; i++) tone(150, { type: "square", dur: 0.03, gain: 0.03, when: i * 0.045 }); },
  noseGrow: (notch = 1) => tone([260 + notch * 60, 340 + notch * 120], { type: "square", dur: 0.16, gain: 0.05 }), // rising boing
  doubleHit: () => { [784, 988, 1319].forEach((f, i) => tone(f, { type: "triangle", dur: 0.18, gain: 0.05, when: i * 0.06 })); },
  truthReveal: () => { CHORD.forEach((f, i) => tone(f, { type: "triangle", dur: 0.5, gain: 0.055, when: i * 0.11 })); tone(1046, { type: "sine", dur: 0.6, gain: 0.03, when: 0.34 }); },
  gmSting:  () => { tone([300, 150], { type: "sawtooth", dur: 0.5, gain: 0.06 }); tone([260, 130], { type: "sawtooth", dur: 0.55, gain: 0.05, when: 0.28 }); }, // wah-wah

  // — board —
  // The cha-ching, ported from Ordkrig's scripts/make-coin-sound.mjs (which
  // synthesises a 48 kB WAV; we skip the file and keep the recipe). Two sines a
  // fourth apart — B5 then E6 — and the 90 ms offset on the second is the whole
  // trick: struck together they are a chord, struck late it is a coin landing.
  points:   () => { tone(987.77, { type: "sine", dur: 0.28, gain: 0.05, attack: 0.004 }); tone(1318.51, { type: "sine", dur: 0.46, gain: 0.055, when: 0.09, attack: 0.004 }); },
  pawnHop:  () => tone([300, 520], { type: "sine", dur: 0.09, gain: 0.055 }),
  overtake: () => tone([700, 300], { type: "triangle", dur: 0.14, gain: 0.05 }),
  win:      () => { [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, { type: "triangle", dur: 0.4, gain: 0.05, when: i * 0.08 })); },
};

/* Sound and haptic are two legs of one beat (game-feel skill, principle 4), so
   they are paired HERE rather than at ~40 call sites where they would drift. The
   map is deliberately sparse — a buzz on every play() would be a malfunction.

   Two exclusion rules, both learned from Ordkrig's restraint:
   - Not for someone ELSE's action. tickIn fires when a bot or a peer submits;
     three buzzes a round for things you did not do is noise, not feedback.
   - Not for navigation. confirm/toggle/back fire on nearly every tap.

   What is left is this device's own moments (voteCast) plus the room-wide beats
   everyone is supposed to feel together (voteOpen, truthReveal, gmSting, win). */
const HAPTIC_FOR = Object.freeze({
  voteOpen: "heavy",        // the showstopper — PRD §11 wants the room to react
  voteCast: "light",        // your own vote landing
  truthReveal: "success",   // tokens.json names .success on the truthReveal spring
  gmSting: "heavy",         // ...and .heavy on gmStealPulse
  pawnHop: "soft",          // ...and .soft per hop
  points: "light",
  win: "success",
  error: "warning",
});

export function play(event, arg) {
  const voice = VOICES[event];
  if (voice) voice(arg);
  const h = HAPTIC_FOR[event];
  if (h) haptic(h);
}

export const EVENTS = Object.freeze(Object.keys(VOICES));
