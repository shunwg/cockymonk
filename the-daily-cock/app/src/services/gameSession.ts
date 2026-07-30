// Ported orchestration logic from the-daily-cock/js/ui.js — the parts that
// aren't DOM manipulation. Kept as plain functions/types (no JSX) so this
// reads as a near-line-by-line port of ui.js's non-rendering functions,
// with App.tsx as the thin, stateful React glue around it.
import type { GuessScoreResult, Profile, TodayState, WriteRecap } from "../lib/types";

export type ScreenState =
  | { kind: "boot" }
  | { kind: "name"; suggestedName: string }
  | { kind: "howToPlay"; displayName: string }
  | { kind: "welcome"; displayName: string; state: TodayState }
  | { kind: "ready"; state: TodayState }
  | { kind: "writeRecap"; recap: WriteRecap; profile: Profile }
  | { kind: "guess"; state: TodayState }
  | { kind: "score"; result: GuessScoreResult }
  | { kind: "write"; state: TodayState; skippedIds: string[] }
  | { kind: "done"; state: TodayState }
  | { kind: "timeoutGuess"; state: TodayState; wordId: string }
  | { kind: "timeoutWrite"; state: TodayState; skippedIds: string[]; wordId: string };

// Direct port of ui.js's resumeFlowFromState — decides the next screen from
// a fresh /api/today snapshot. The original also calls updateHeader(profile)
// here as a side effect; callers of this pure function handle that
// separately (setHeaderProfile), since header timing discipline is the
// caller's job, not this function's.
export function resumeFlowFromState(state: TodayState): ScreenState {
  const allGuessed = state.guessWords.length > 0 && state.guessWords.every((w) => w.alreadyGuessed);
  const allWritten = state.writeWords.every((w) => w.alreadySubmitted);
  if (state.guessWords.length > 0 && !allGuessed) return { kind: "guess", state };
  if (!allWritten) return { kind: "write", state, skippedIds: [] };
  return { kind: "done", state };
}

// -- small, shared adjective+animal suggested-name generator, same SHAPE as
// ordkrig/src/config/usernames.ts (not its word lists) — see CLAUDE.md
// Provenance on the web side for why only the pattern is reused.
const ADJ = ["Lur", "Rask", "Sky", "Kvass", "Vill", "Snill", "Sur", "Gretten"];
const ANIMAL = ["Gaupe", "Jerv", "Elg", "Rev", "Ugle", "Bjørn", "Hare", "Nise"];
export function suggestName(): string {
  return ADJ[Math.floor(Math.random() * ADJ.length)] + ANIMAL[Math.floor(Math.random() * ANIMAL.length)];
}

export function streakText(days: number, pct: number): string {
  const unit = days === 1 ? "dag" : "dager";
  const bonus = pct ? ` (+${pct}% poengbonus)` : "";
  return `${days} ${unit}${bonus}`;
}
