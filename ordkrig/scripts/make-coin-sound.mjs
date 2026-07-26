// Syntetiserer mynt-plinget som spilles når poengene tildeles (assets/sounds/points.wav).
// To raske sinus-toner (B5 → E6, klassisk "coin") med myk decay – helt egenprodusert.
//   node scripts/make-coin-sound.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets', 'sounds', 'points.wav');

const SR = 44_100;
const DUR = 0.55; // sekunder totalt
const N = Math.floor(SR * DUR);
const samples = new Float64Array(N);

// tone(hz, start, lengde, styrke): sinus med rask attack og eksponentiell decay
function tone(hz, t0, len, amp) {
  const s0 = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  for (let i = 0; i < n && s0 + i < N; i++) {
    const t = i / SR;
    const attack = Math.min(1, t / 0.004);
    const decay = Math.exp(-t * 9);
    // grunnfrekvens + svak oktav for "metallisk" preg
    const v = Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(2 * Math.PI * hz * 2 * t);
    samples[s0 + i] += v * amp * attack * decay;
  }
}

tone(987.77, 0.0, 0.28, 0.5); // B5
tone(1318.51, 0.09, 0.46, 0.55); // E6 (lander litt etter – "cha-ching")

// Normaliser og skriv 16-bit mono WAV
let peak = 0;
for (const v of samples) peak = Math.max(peak, Math.abs(v));
const scale = peak > 0 ? 0.85 / peak : 1;

const data = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) data.writeInt16LE(Math.round(samples[i] * scale * 32767), i * 2);

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, data]));
console.log(`Skrev ${path.relative(process.cwd(), OUT)} (${((44 + data.length) / 1024).toFixed(1)} kB)`);
