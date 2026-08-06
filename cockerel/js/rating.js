// rating.js — points total + streak, ported in spirit from ordkrig/src/
// services/profileStore.ts, with three deliberate differences: NO quit
// penalty (see CLAUDE.md Provenance), a PERCENTAGE streak bonus (see
// config.js STREAK_BONUS) instead of a flat add, and — the reason this file
// is no longer really about a "rating" at all — a running SUM of daily points
// instead of Ordkrig's `base + average(per-day performance)`.
//
// Why the sum: the average made the two numbers a player sees contradict each
// other. The score screen said "+390 today" while the header moved +23 (or
// DOWN, if 390 was below your average), because the header was an average
// around a base of 800 and the score screen was raw points. One currency, one
// arithmetic — `totalPoints` is now literally the sum of every day's shown
// points, and nothing converts between the two. See config.js POINTS.
//
// Two separate day-sets, tracking two separate things:
//  - `participatedDays`: touched IMMEDIATELY when a user writes or guesses —
//    "streak = at least submitting or guessing words," full stop, whether or
//    not they did all 6 of the day's word-interactions. Drives the streak
//    display and the streak bonus %.
//  - `countedDays`: touched only when POINTS for a day are actually known —
//    which, because of the write-today/guess-tomorrow pipeline, happens at
//    TWO different times for the same day (see db.mjs). It no longer divides
//    anything (that was the average's denominator); it survives as the record
//    of which days have actually settled, which is what the admin dashboard
//    and any future per-day history would be built from. A day can be in
//    participatedDays long before (or even without ever fully) landing in
//    countedDays — don't merge the two back together.
import { isNextDay, addDays } from "./engine.js";
import { STREAK_BONUS, POINTS } from "./config.js";

// 4: `ratingSum` (an average's numerator, on the old ~4x point scale) became
// `pointsTotal` (a running sum on the current scale). Migrated on read — see
// server/db.mjs loadDb.
const PROFILE_VERSION = 4;

export function freshProfile(displayName) {
  return {
    v: PROFILE_VERSION,
    displayName,
    pointsTotal: POINTS.start,
    countedDays: [],
    participatedDays: [],
    lastResultSeenDate: null,
  };
}

export { PROFILE_VERSION };

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
 * How many points crediting `points` would ACTUALLY move this profile's
 * total, once config.js POINTS.floor is taken into account — i.e. a penalty
 * larger than the points you have is trimmed to what you have.
 *
 * Callers must credit this value AND show this value (see db.mjs), never the
 * raw one: the whole contract of the points system is that the number on the
 * score screen is exactly the number the header goes up by, and a silently
 * clamped penalty would be the one place that stopped being true.
 */
export function effectivePoints(profile, points) {
  return Math.max(POINTS.floor, profile.pointsTotal + points) - profile.pointsTotal;
}

/**
 * Credit `points` (already streak-multiplied and floor-clamped — see
 * effectivePoints and db.mjs settleBatch) for calendar day `dayKey`.
 * Idempotent on `countedDays`: a day already settled once (guess-points and
 * write-points for the same calendar day settle a rollover apart) just gets
 * more points added to the total, and is never listed twice.
 */
export function creditPoints(profile, { dayKey, points }) {
  const pointsTotal = Math.max(POINTS.floor, profile.pointsTotal + points);
  if (profile.countedDays.includes(dayKey)) return { ...profile, pointsTotal };
  return { ...profile, pointsTotal, countedDays: [...profile.countedDays, dayKey].sort() };
}

/** The one headline number: the running sum of every day's points. */
export function totalPoints(profile) {
  return profile.pointsTotal;
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
