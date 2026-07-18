// audio.js — sound grammar for the Lab. Lane B may restyle voices; event NAMES
// are the contract (LANES.md seam #4) and mirror tokens.json → sound.grammar.
// The Lab uses a procedural WebAudio synth (like the frozen demo) so it works
// offline; the iOS app plays the promoted Kenney/.caf files for the same events.

let ctx = null;
let muted = false;

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function ac() {
  if (!ctx) ctx = new (window.AudioContext ?? window.webkitAudioContext)();
  return ctx;
}

function beep(freq, dur = 0.08, type = "square", gain = 0.04, when = 0) {
  if (muted) return;
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime + when);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + when + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + when);
  o.stop(a.currentTime + when + dur + 0.02);
}

// Event grammar — names match tokens.json sound.grammar keys.
const VOICES = {
  voteCast:   () => beep(660, 0.06, "square", 0.05),
  confirm:    () => beep(520, 0.09, "triangle", 0.05),
  cardDraw:   () => { beep(420, 0.07, "triangle"); beep(560, 0.07, "triangle", 0.04, 0.07); },
  cardShuffle:() => { for (let i = 0; i < 6; i++) beep(240 + Math.random() * 500, 0.05, "square", 0.03, i * 0.045); },
  tickIn:     () => beep(760, 0.05, "triangle", 0.05),
  pawnHop:    () => beep(340, 0.06, "sine", 0.06),
  truthReveal:() => { beep(523, 0.12, "triangle", 0.05); beep(659, 0.12, "triangle", 0.05, 0.12); beep(784, 0.2, "triangle", 0.05, 0.24); },
  gmSting:    () => { beep(196, 0.3, "sawtooth", 0.05); beep(185, 0.35, "sawtooth", 0.05, 0.18); },
  noseGrow:   (notch = 1) => beep(300 + notch * 90, 0.07, "square", 0.05),
  error:      () => { beep(220, 0.09, "sawtooth", 0.04); beep(180, 0.12, "sawtooth", 0.04, 0.09); },
  toggle:     () => beep(480, 0.05, "square", 0.04),
  back:       () => beep(360, 0.06, "triangle", 0.04),
};

export function play(event, arg) {
  const voice = VOICES[event];
  if (voice) voice(arg);
}

export const EVENTS = Object.freeze(Object.keys(VOICES));
