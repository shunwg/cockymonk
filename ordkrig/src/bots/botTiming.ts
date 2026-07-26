import { BOT_TIMING } from '../config/gameConfig';

/** Tilfeldig heltall (ms) i et [min, max]-intervall. */
export function randMs([min, max]: [number, number]): number {
  return Math.round(min + Math.random() * (max - min));
}

/** Når en bot trykker "klar til neste runde" i lobbyen. */
export function botReadyMs(): number {
  return randMs(BOT_TIMING.readyMs);
}

/** Når en bot leverer svaret sitt (ms inn i skrivefasen). */
export function botSubmitMs(writingMs: number): number {
  const t = randMs(BOT_TIMING.submitMs);
  return Math.min(t, writingMs - 500);
}

/** Når en bot låser stemmen sin (ms inn i stemmefasen). */
export function botVoteMs(votingMs: number): number {
  const t = randMs(BOT_TIMING.voteMs);
  return Math.min(t, votingMs - 500);
}

/**
 * Auto-generert skrivemønster: veksler mellom "drypp" (prikkene beveger seg) og
 * "tenkepauser" (prikkene stopper), fram til boten leverer. Kaller onChange(true/false)
 * for typing-på/av, og returnerer en opprydder som stopper mønsteret.
 */
export function startTypingPattern(
  submitAtMs: number,
  onChange: (typing: boolean) => void
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let elapsed = 0;
  let stopped = false;

  const step = (typing: boolean) => {
    if (stopped || elapsed >= submitAtMs) {
      onChange(false);
      return;
    }
    onChange(typing);
    const span = typing ? randMs(BOT_TIMING.typingBurstMs) : randMs(BOT_TIMING.thinkPauseMs);
    elapsed += span;
    timers.push(setTimeout(() => step(!typing), span));
  };

  // Liten forsinkelse før boten "begynner å skrive"
  timers.push(setTimeout(() => step(true), randMs([300, 1500])));

  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
    onChange(false);
  };
}
