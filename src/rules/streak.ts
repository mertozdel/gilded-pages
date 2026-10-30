import { daysBetween, localDate } from './dates';

/** The green light glows brighter each day in a row with at least this many pages. */
export const STREAK_MIN_PAGES = 10;

export interface StreakState {
  streakDays: number;
  lastReadDate: string | null;
  lastStreakDate: string | null;
  pagesToday: number;
}

/** Resets `pagesToday` on a new day and breaks the streak after a missed day. */
export function rollStreakDay(s: StreakState, today: string = localDate()): StreakState {
  let { streakDays, pagesToday } = s;
  if (s.lastReadDate !== today) pagesToday = 0;
  if (s.lastStreakDate && daysBetween(s.lastStreakDate, today) > 1) streakDays = 0;
  return { ...s, streakDays, pagesToday };
}

/** Applies one counted page. Returns the new state and whether today's streak was just earned. */
export function applyCountedPage(
  s: StreakState,
  today: string = localDate(),
): { state: StreakState; streakEarned: boolean } {
  const rolled = rollStreakDay(s, today);
  const pagesToday = rolled.pagesToday + 1;
  let { streakDays, lastStreakDate } = rolled;
  let streakEarned = false;
  if (pagesToday >= STREAK_MIN_PAGES && lastStreakDate !== today) {
    streakDays += 1;
    lastStreakDate = today;
    streakEarned = true;
  }
  return { state: { streakDays, lastStreakDate, pagesToday, lastReadDate: today }, streakEarned };
}

/** 0..1 brightness for the green-light lamp. */
export function lampGlow(streakDays: number): number {
  return Math.min(1, 0.25 + streakDays * 0.11);
}
