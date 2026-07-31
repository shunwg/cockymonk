// Shapes returned by server/db.mjs via server/dev-server.mjs's REST API —
// mirrors what cockerel/js/ui.js consumes. Keep in sync by hand if the
// server's response shapes ever change (there's no schema/codegen today on
// the web side either).

export interface Identity {
  userId: string;
  displayName: string;
}

export interface Profile {
  displayName: string;
  rating: number;
  rank: number;
  streakDays: number;
  streakBonusPct: number;
}

export interface GuessOption {
  id: string;
  text: string;
}

export interface GuessWord {
  wordId: string;
  word: string;
  alreadyGuessed: boolean;
  options: GuessOption[];
}

export interface WriteWord {
  wordId: string;
  word: string;
  alreadySubmitted: boolean;
}

export interface WriteRecap {
  fooledByWord: unknown[];
  writeStreakPct: number;
  writePoints: number;
  writeBasePoints?: number;
}

export interface TodayState {
  profile: Profile;
  guessWords: GuessWord[];
  writeWords: WriteWord[];
  recap: WriteRecap | null;
}

export interface ReviewOption {
  text: string;
  pct: number;
  isTruth: boolean;
  isMine: boolean;
}

export interface ReviewWord {
  word: string;
  correct: boolean;
  options: ReviewOption[];
}

export interface GuessScoreResult {
  points: number;
  correctCount: number;
  guessTotal: number;
  pct: number;
  profile: Profile;
  words: ReviewWord[];
}

export interface ActionResult {
  ok: boolean;
  guessResult?: GuessScoreResult;
  error?: string;
}

export interface VoteDistributionResult {
  ok: boolean;
  noData?: boolean;
  distribution?: { id: string; pct: number }[];
}

export type Theme = "dark" | "light";
