import { SCORING } from '../config/gameConfig';

/**
 * Ren poengberegning for en runde – identisk på vert (persistering) og klient
 * (visning), så alle telefoner viser samme tall gitt samme svar/stemmer.
 */
export interface ScoreAnswer {
  id: string;
  author_id: string | null; // null = fasit
  is_correct: boolean;
  is_empty: boolean;
}

export function computeRoundScores(
  playerIds: string[],
  answers: ScoreAnswer[],
  votesByAnswer: Record<string, string[]>
): Record<string, number> {
  const guess: Record<string, number> = {};
  const fool: Record<string, number> = {};
  for (const [answerId, voters] of Object.entries(votesByAnswer)) {
    const ans = answers.find((a) => a.id === answerId);
    if (!ans) continue;
    for (const voterId of voters) {
      if (ans.is_correct) {
        guess[voterId] = (guess[voterId] ?? 0) + SCORING.correctGuess;
      } else if (ans.author_id && ans.author_id !== voterId) {
        fool[ans.author_id] = (fool[ans.author_id] ?? 0) + SCORING.perVoteReceived;
      }
    }
  }
  // Leverte du ikke svar i tide → halv uttelling for riktig gjetting
  const submitted = new Set(answers.filter((a) => a.author_id && !a.is_empty).map((a) => a.author_id as string));
  const rs: Record<string, number> = {};
  for (const id of playerIds) {
    const g = guess[id] ?? 0;
    rs[id] = (submitted.has(id) ? g : Math.round(g * 0.5)) + (fool[id] ?? 0);
  }
  // Stemte du ikke → halve poeng totalt (spec §18.2)
  const votersSet = new Set(Object.values(votesByAnswer).flat());
  for (const id of playerIds) {
    if (!votersSet.has(id)) rs[id] = Math.round((rs[id] ?? 0) * 0.5);
  }
  return rs;
}

/** Poeng generert per svar (til fly-animasjonen på reveal). */
export function computeAnswerPoints(
  answers: ScoreAnswer[],
  votesByAnswer: Record<string, string[]>
): Record<string, number> {
  const per: Record<string, number> = {};
  for (const [answerId, voters] of Object.entries(votesByAnswer)) {
    const ans = answers.find((a) => a.id === answerId);
    if (!ans) continue;
    for (const voterId of voters) {
      if (ans.is_correct) per[answerId] = (per[answerId] ?? 0) + SCORING.correctGuess;
      else if (ans.author_id && ans.author_id !== voterId) per[answerId] = (per[answerId] ?? 0) + SCORING.perVoteReceived;
    }
  }
  return per;
}
