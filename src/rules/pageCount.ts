/**
 * The honest-reading rule: a page counts only after a minimum time on screen,
 * scaled to its words — the longer of 4 seconds or words ÷ 600 per minute.
 * Rewards stay honest without punishing fast readers.
 */
export const MIN_DWELL_MS = 4000;
export const FAST_READER_WPM = 600;

export function requiredDwellMs(words: number): number {
  return Math.max(MIN_DWELL_MS, (Math.max(0, words) / FAST_READER_WPM) * 60_000);
}

/** A relaxed reading pace, used to move Roxy across the stage while you read a page. */
export const LEISURE_WPM = 230;

export function leisureReadMs(words: number): number {
  return Math.max(8000, (Math.max(0, words) / LEISURE_WPM) * 60_000);
}
