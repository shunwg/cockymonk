// audio.js — sound grammar for the Lab. Lane B may restyle voices; event NAMES
// are the contract (LANES.md seam #4) and mirror tokens.json → sound.grammar.
// A procedural WebAudio "sound designer" (no files) so it works offline; the iOS
// app plays the promoted Kenney/.caf files for the same events.
//
// Design intent (emil-design-eng: "match the motion to the mood"): this is a
// playful quiz-show, so voices lean theatrical — a gong when the vote opens, a
// rising boing per liar's-nose notch, a comedic wah-wah when the GM steals, a
// triumphant chord for the truth. Everything ducks quiet; nothing screeches.

let ctx = null;
let muted = false;
let noiseBuf = null;

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function ac() {
  if (!ctx) ctx = new (window.AudioContext ?? window.webkitAudioContext)();
  return ctx;
}
function now() { return ac().currentTime; }

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
  o.connect(g).connect(a.destination);
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
  src.connect(f).connect(g).connect(a.destination);
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
  pawnHop:  () => tone([300, 520], { type: "sine", dur: 0.09, gain: 0.055 }),
  overtake: () => tone([700, 300], { type: "triangle", dur: 0.14, gain: 0.05 }),
  win:      () => { [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, { type: "triangle", dur: 0.4, gain: 0.05, when: i * 0.08 })); },
};

export function play(event, arg) {
  const voice = VOICES[event];
  if (voice) voice(arg);
}

export const EVENTS = Object.freeze(Object.keys(VOICES));
