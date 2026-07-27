// fakepool.js — where a bot's lie comes from. Pure, DOM-free, no imports.
//
// THE PROBLEM THIS SOLVES
// The deck's truths (PRD §9: ≤140 chars, written to surprise) and the old bot
// fake pools ("generic-but-plausible", ≤120) were authored to different specs.
// Nobody chose the consequence: nb truths average 75 characters and the fakes
// average 48. So "vote for the longest option" won 87.2% of a 4-option practice
// lineup against 25% chance. A player who noticed that never had to learn a
// Norwegian word again. Tools/check-fake-parity.mjs is the gate that measures it.
//
// THE FIX, borrowed from Edvard's Ordkrig (src/bots/answerPool.ts)
// A fake explanation for word X is a REAL explanation — of some other word Y.
// Length, punctuation, register, clause shape and voice then match the truth by
// CONSTRUCTION rather than by tuning, because both sides came out of the same
// pen. There is no synthetic tell to detect because nothing is synthetic.
//
// Ordkrig harvests ~9,000 such rows from Bokmålsordboka. We don't need to: we
// already own 150 nb / 100 en definitions, and the definition of card A is a
// perfect fake for card B. We ported the method, not their data — their corpus
// is CC BY 4.0 and carries attribution obligations.
//
// WHY ONLY HALF THE FAKES ARE "CLOSE"
// The non-obvious half of the idea, and Ordkrig's own comment makes the point:
// if every decoy is close to the truth, the truth becomes the one that ISN'T
// like the others, and you have rebuilt the leak with the sign flipped. So
// CLOSE_SHARE of the lineup is chosen by a similarity score and the rest at
// random. See the game-feel skill, principle 8 ("half-close, never all-close").

export const FAKEPOOL = Object.freeze({
  CLOSE_SHARE: 0.5,        // fraction of a lineup picked by closeness; rest random
  LEN_RATIO_LO: 0.6,       // "near the truth's length" band, as a ratio
  LEN_RATIO_HI: 1.6,
  SHORT_BAND: 60,          // chars. Our nb p25 is 68, so this is genuinely "short"
  DRAW_LOOKAHEAD: 16,      // upcoming cards barred as fakes — longer than any game
  MIN_POOL: 12,            // below this, relax the lookahead rather than starve (file:// mini-deck is 6 cards)

  // Closeness weights. Deliberately small integers: this is a preference order,
  // not a calibrated model, and rng() jitter in [0,1) is a term of its own so
  // the same word does not draw the same lineup twice.
  W_FIRST_LETTER: 1.5,     // source word shares the target's initial
  W_PREFIX2: 1.0,          // ...and its first two letters
  W_SHORT_PAIR: 2.5,       // short truth + short fake sharing an initial (bavle→bable)
  W_LEN_NEAR: 1.0,         // explanation length inside the ratio band
  W_LEARNED: 0.5,          // same register: latinate/greek vs. folk
  W_THEME: 1.1,            // per shared content word, capped
  THEME_CAP: 2,
});

// Latin/Greek-flavoured morphology. A word wearing one of these suffixes reads
// learned and should be lied about in a learned voice; a folk compound should be
// lied about in a folk voice. Register is half of why a bluff is believable.
//
// Endings are chosen to be WRONG rarely rather than RIGHT often. Ordkrig's nb
// list included -ikk, -isk, -ur and -at, which on this deck tagged boknafisk,
// havblikk, aur and lur as latinate — those are ordinary Norwegian endings
// (fisk, blikk), not learned ones, and a signal that misfires most of the time
// is worse than no signal. MIN_LEN then excludes short native words outright.
//
// Honest limitation: after tightening, only ~1% of the nb deck reads as learned,
// so for Norwegian this term is close to a constant and contributes almost
// nothing to the ranking. It earns its place on the en deck (~9%) and it is
// cheap. Do not widen it to raise the hit rate — that is how it broke before.
const LEARNED_MIN_LEN = 6;
const LEARNED = {
  nb: /(sjon|isme|itet|logi|ium|ase|ose|yse|ent|ant)$/i,
  en: /(tion|sion|ism|ity|ology|ium|ent|ant|ase|osis|ysis|ure|ate)$/i,
};

// Function words plus the lexicographer's own filler. "brukt", "betegnelse",
// "especially" and friends appear in half the deck and would make every pair
// look thematically related, which would make the theme term meaningless.
const STOP = {
  nb: new Set(("og i på som til av for med den det de en et er at om fra har hadde ble blir bli seg sin sitt sine der når hvor ikke kan må skal vil var ved etter over under mot mellom uten eller men så bare noe noen alle hver hele slags brukt bruk gammel gammelt gamle ord uttrykk betegnelse særlig gjerne person ting man én ens selv annen andre samme mye lite stor liten små").split(" ")),
  en: new Set(("the a an of to in on for with that which who whom whose is are was were be been being by as at from or and but not no it its this these those when where while someone somebody something one any used use especially usually often kind sort thing person people other another same much little large small very more most").split(" ")),
};

/** Lowercased 4+ character non-stopword tokens — the words that carry meaning. */
export function contentWords(text, lang = "nb") {
  const stop = STOP[lang] ?? STOP.nb;
  const out = new Set();
  for (const raw of String(text ?? "").toLowerCase().split(/[^a-zæøåäöéèüA-Z]+/)) {
    if (raw.length >= 4 && !stop.has(raw)) out.add(raw);
  }
  return out;
}

export const isLearned = (word, lang = "nb") => {
  const w = String(word ?? "");
  return w.length >= LEARNED_MIN_LEN && (LEARNED[lang] ?? LEARNED.nb).test(w);
};

/**
 * Which deck cards may donate their explanation as a fake this round.
 *
 * Barred: the card in play, every card already played, and the next
 * DRAW_LOOKAHEAD cards. That last one is the interesting exclusion — without
 * it a bluff could resurface two rounds later AS the truth, which is worse than
 * the leak we set out to fix. `remaining` is ui.js's U.deck, popped from the
 * END, so the imminent draws are its tail.
 *
 * The lookahead RELAXES rather than starving. state.js's file:// mini-deck is
 * six cards, so a fixed 16-card exclusion would empty the pool and silently
 * drop the whole game back to the hand-written filler — the exact bug this
 * module exists to remove, reappearing only in the one build nobody tests.
 * A smaller guarantee on a tiny deck beats no pool at all.
 */
export function safePool({ deck, remaining = [], card, lookahead = FAKEPOOL.DRAW_LOOKAHEAD,
                          minPool = FAKEPOOL.MIN_POOL }) {
  const alive = new Set((remaining ?? []).map((c) => c.prompt));
  const usable = (deck ?? []).filter((c) =>
    c && c.prompt !== card?.prompt &&   // never the word we are defining
    alive.has(c.prompt));               // never a word already played

  const tail = (n) => new Set((remaining ?? []).slice(-n).map((c) => c.prompt));
  for (let look = Math.max(0, lookahead); look > 0; look--) {
    const soon = tail(look);
    const pool = usable.filter((c) => !soon.has(c.prompt));
    if (pool.length >= minPool) return pool;
  }
  return usable;   // deck too small to promise anything — hand back what there is
}

/** Similarity of one candidate to the card in play. Higher = better camouflage. */
export function closeness(cand, { card, lang = "nb", rng = Math.random }) {
  const word = String(card?.prompt ?? "").toLowerCase();
  const truth = String(card?.truth ?? "");
  const cw = String(cand.prompt ?? "").toLowerCase();
  const cd = String(cand.truth ?? "");

  let s = rng();                                                     // jitter
  if (cw[0] && cw[0] === word[0]) s += FAKEPOOL.W_FIRST_LETTER;
  if (cw.slice(0, 2) === word.slice(0, 2)) s += FAKEPOOL.W_PREFIX2;
  if (truth.length < FAKEPOOL.SHORT_BAND && cd.length < FAKEPOOL.SHORT_BAND
      && cd[0]?.toLowerCase() === word[0]) s += FAKEPOOL.W_SHORT_PAIR;

  const ratio = cd.length / Math.max(1, truth.length);
  if (ratio > FAKEPOOL.LEN_RATIO_LO && ratio < FAKEPOOL.LEN_RATIO_HI) s += FAKEPOOL.W_LEN_NEAR;
  if (isLearned(cw, lang) === isLearned(word, lang)) s += FAKEPOOL.W_LEARNED;

  const theme = contentWords(truth, lang);
  if (theme.size) {
    let shared = 0;
    for (const w of contentWords(cd, lang)) if (theme.has(w)) shared++;
    s += Math.min(FAKEPOOL.THEME_CAP, shared) * FAKEPOOL.W_THEME;
  }
  return s;
}

/**
 * n fake explanations for the card in play, as plain strings.
 *
 * Half by closeness, half at random from what's left (never all-close). Falls
 * back to `filler` — the hand-written fakes_*.json — only when the deck cannot
 * supply enough, which for a 150-card deck means the mini-deck on file://.
 * Duplicates are impossible: candidates are consumed as they are chosen.
 */
export function pickFakes({ n, card, pool, filler = [], lang = "nb", rng = Math.random }) {
  const want = Math.max(0, n | 0);
  if (!want) return [];

  const left = [...(pool ?? [])];
  const out = [];
  const closeCount = Math.min(left.length, Math.ceil(want * FAKEPOOL.CLOSE_SHARE));

  if (closeCount) {
    const scored = left
      .map((c) => ({ c, s: closeness(c, { card, lang, rng }) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, closeCount);
    for (const { c } of scored) {
      out.push(c.truth);
      left.splice(left.indexOf(c), 1);
    }
  }

  while (out.length < want && left.length) {
    out.push(left.splice(Math.floor(rng() * left.length), 1)[0].truth);
  }

  // Emergency fill. Shuffled so a short deck doesn't always show the same tail.
  const spare = [...filler];
  while (out.length < want && spare.length) {
    out.push(spare.splice(Math.floor(rng() * spare.length), 1)[0]);
  }
  while (out.length < want) out.push("…");   // never hand the UI undefined

  // One last shuffle: without it the close picks always arrive first, and
  // whoever notices that the earliest bot answers are the plausible ones has a
  // new exploit. Bot submission order is a tell too.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
