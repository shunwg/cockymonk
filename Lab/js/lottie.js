// lottie.js — celebration overlay player. Lane B owns this file.
// Plays the ORIGINAL Lottie assets (Resources/Lottie/, authored by motion-designer)
// for celebration MOMENTS only: confetti, Gullnese shimmer, GM-steal sting, board
// landmarks. Core game motion stays native (CSS springs here / SwiftUI springs in
// the app). Mirrors the future MotionPlayer protocol.
//
// Reduced Motion (DESIGN.md §9): every play() is a silent no-op — the static UI
// underneath IS the poster frame. If lottie-web isn't present, also a no-op, so the
// game degrades gracefully to the CSS confetti fallback in ui.js.

const CACHE = {};
const CANON = ["confetti_win", "gullnese_shimmer", "gm_steal_sting",
               "celebration_salongen", "celebration_fjellet", "celebration_verdensrommet"];

export const reduceMotion = () =>
  !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

const lib = () => window.lottie || null;

// Load one asset: inlined standalone bundle first (window.__COCKY__.lottie),
// then http fetch (served Lab). Returns null if neither is available.
async function load(name) {
  if (CACHE[name]) return CACHE[name];
  const inlined = window.__COCKY__?.lottie?.[name];
  if (inlined) return (CACHE[name] = inlined);
  try {
    const res = await fetch(`/Resources/Lottie/${name}.json`);
    if (res.ok) return (CACHE[name] = await res.json());
  } catch { /* file:// without inlined data → celebration silently absent */ }
  return null;
}

export function preloadCelebrations() { CANON.forEach(load); }

// Full-screen one-shot overlay (confetti, sting, landmark). Auto-removes on complete.
// fit: "slice" fills+crops the viewport (confetti/landmarks); "meet" letterboxes.
export async function playCelebration(name, { loop = false, fit = "slice" } = {}) {
  if (!lib() || reduceMotion()) return;
  const data = await load(name);
  if (!data) return;
  const overlay = document.createElement("div");
  overlay.className = "lottie-overlay";
  document.body.appendChild(overlay);
  const anim = lib().loadAnimation({
    container: overlay, renderer: "svg", loop, autoplay: true, animationData: data,
    rendererSettings: { preserveAspectRatio: `xMidYMid ${fit}` },
  });
  const cleanup = () => { try { anim.destroy(); } catch {} overlay.remove(); };
  if (!loop) anim.addEventListener("complete", cleanup);
  return cleanup;
}

// Mount a (looping) asset inside a specific element — e.g. the Gullnese badge.
export async function mountLottie(el, name, { loop = true, fit = "meet" } = {}) {
  if (!lib() || reduceMotion() || !el) return;
  const data = await load(name);
  if (!data) return;
  lib().loadAnimation({
    container: el, renderer: "svg", loop, autoplay: true, animationData: data,
    rendererSettings: { preserveAspectRatio: `xMidYMid ${fit}` },
  });
}

// Remove any leftover overlays — call on every screen change so a celebration
// never bleeds into the next screen.
export function clearCelebrations() {
  document.querySelectorAll(".lottie-overlay").forEach((o) => o.remove());
}

// Theme id (salongen/fjellet/rom) → landmark celebration asset name.
export const LANDMARK_FOR = Object.freeze({
  salongen: "celebration_salongen",
  fjellet: "celebration_fjellet",
  rom: "celebration_verdensrommet",
});
