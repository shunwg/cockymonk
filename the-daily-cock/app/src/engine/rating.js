// GENERATED FILE — copied verbatim from the-daily-cock/js/rating.js by
// app/Tools/sync-engine.mjs. Do not hand-edit; re-run the script instead.

// rating.js — rating + streak, ported in spirit from ordkrig/src/services/
// profileStore.ts (rating = base + avg(per-day performance)), with two
// deliberate differences: NO quit penalty (see CLAUDE.md Provenance), and a
// PERCENTAGE streak bonus (see config.js STREAK_BONUS) instead of a flat add.
//
// Two separate day-sets, tracking two separate things:
//  - `participatedDays`: touched IMMEDIATELY when a user writes or guesses —
//    "streak = at least submitting or guessing words," full stop, whether or
//    not they did all 6 of the day's word-interactions. Drives the streak
//    display and the streak bonus %.
//  - `countedDays`: touched only when POINTS for a day are actually known —
//    which, because of the write-today/guess-tomorrow pipeline, happens at
//    TWO different times for the same day (see db.mjs). Drives the rating
//    average's denominator. A day can be in participatedDays long before
//    (or even without ever fully) landing in countedDays.
import { isNextDay, addDays } from "./engine.js";
import { STREAK_BONUS, RATING } from "./config.js";

const PROFILE_VERSION = 3;

export function freshProfile(displayName) {
  return {
    v: PROFILE_VERSION,
    displayName,
    ratingSum: 0,
    countedDays: [],
    participatedDays: [],
    lastResultSeenDate: null,
  };
}

/** Consecutive-day streak ending at the LAST entry of a sorted day-key array. */
export function currentStreak(days) {
  if (!days.length) return 0;
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (isNextDay(days[i - 1], days[i])) streak++; else break;
  }
  return streak;
}

/** Consecutive-day streak ending AT a specific day (which must be in `days`) —
 * used to size that day's bonus regardless of what happens on later days. */
export function streakEndingAt(days, dayKey) {
  if (!days.includes(dayKey)) return 0;
  const set = new Set(days);
  let streak = 1;
  let cur = dayKey;
  while (set.has(addDays(cur, -1))) { streak++; cur = addDays(cur, -1); }
  return streak;
}

/** % bonus for a given streak length — see config.js STREAK_BONUS. Day N of
 * a streak is worth N * stepPct, capped at maxPct (day 1 = +10%, ..., day 7
 * and beyond = +70%) — deliberately N, not N-1: "day 2 = 20%" is easier to
 * hold in your head than an off-by-one "day 2 = 10%." */
export function streakBonusPct(streakDays) {
  return Math.min(Math.max(0, streakDays) * STREAK_BONUS.stepPct, STREAK_BONUS.maxPct);
}

/**
 * Applies a streak bonus % to BASE points earned for one day — but only if
 * they're positive. A bad day (see config.js SCORING.guessScoreByCorrectCount,
 * which can be negative) is never made WORSE by having a long streak; the
 * bonus only ever amplifies a genuine gain. This is what "skill primary,
 * streak secondary" means in practice once negative outcomes exist.
 */
export function applyStreakBonus(basePoints, pct) {
  return basePoints > 0 ? Math.round(basePoints * (1 + pct / 100)) : basePoints;
}

/** Mark that the user did SOMETHING (wrote or guessed) on `dayKey`, right now —
 * decoupled from whether/when the resulting points get credited. */
export function markParticipated(profile, dayKey) {
  if (profile.participatedDays.includes(dayKey)) return profile;
  return { ...profile, participatedDays: [...profile.participatedDays, dayKey].sort() };
}

/**
 * Credit `points` (already streak-multiplied — see db.mjs settleBatch) for
 * calendar day `dayKey`. Idempotent on the rating average's denominator: a
 * day already in countedDays just gets more points added, never double-counts.
 */
export function creditPoints(profile, { dayKey, points }) {
  const ratingSum = profile.ratingSum + points;
  if (profile.countedDays.includes(dayKey)) return { ...profile, ratingSum };
  return { ...profile, ratingSum, countedDays: [...profile.countedDays, dayKey].sort() };
}

export function currentRating(profile) {
  const days = profile.countedDays.length;
  if (days === 0) return RATING.base;
  return Math.round(RATING.base + profile.ratingSum / days);
}

/**
 * Whether `profile` has an unacknowledged result to show as a recap.
 * `resultMarker` is server/db.mjs's dayResults[userId].asOfDayKey — a
 * settlement can carry a write-day AND a guess-day result together, which is
 * why this isn't derived from countedDays/participatedDays directly.
 */
export function hasUnseenResult(profile, resultMarker) {
  return Boolean(resultMarker) && profile.lastResultSeenDate !== resultMarker;
}

export function markResultSeen(profile, resultMarker) {
  return { ...profile, lastResultSeenDate: resultMarker };
}
