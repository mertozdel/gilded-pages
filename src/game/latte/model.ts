/**
 * Jason's latte art, as numbers: three hold-and-release stages, each a gauge that fills while
 * held along its own curve. Releasing grades the stage against its target; holding to 100%
 * overflows. Pure functions, so the game and the tests share them.
 */
import latte from '../../content/latte.json';
import { EVERYTHING_OPEN } from '../../rules/unlocks';

export type StageNo = 1 | 2 | 3;
export type StageGrade = 'perfect' | 'good' | 'miss';
export type CupGrade = 'perfect' | 'good' | 'messy';
export type LatteDifficulty = 'easy' | 'normal' | 'hard';

/** Window sizes per difficulty. */
export const WINDOW_SCALE: Record<LatteDifficulty, number> = { easy: 1.5, normal: 1, hard: 0.7 };
/** Perfect within ±4% of the target, Good within ±10%. */
export const PERFECT_WINDOW = 0.04;
export const GOOD_WINDOW = 0.1;
/**
 * How far off (in gauge) counts as a fully wrong stage, |e| = 1. At 0.4 a release on the edge
 * of every Perfect window scores exactly Q = 90.
 */
export const ERROR_SPAN = 0.4;

export interface GaugeCurve {
  /** Time to fill from 0 to 100% at speed 1. */
  durationMs: number;
  /** Fill (0..1) at a fraction of that time. */
  ease: (x: number) => number;
  /** Where to release, 0..1. */
  target: number;
}

/** 1: the espresso shot (extraction, target band 70–78%). */
export const ESPRESSO: GaugeCurve = { durationMs: 3000, ease: (x) => x ** 1.15, target: 0.74 };

/** Stage 2's needle runs 20–80 °C; the target is 60–65 °C. */
export const TEMP_MIN = 20;
export const TEMP_MAX = 80;
export const tempToFill = (c: number) => (c - TEMP_MIN) / (TEMP_MAX - TEMP_MIN);
export const fillToTemp = (f: number) => TEMP_MIN + f * (TEMP_MAX - TEMP_MIN);

/** 2: steaming milk: slow to warm, quick through the middle, slower again near scalding. */
export const MILK: GaugeCurve = { durationMs: 2800, ease: (x) => x * x * (3 - 2 * x), target: tempToFill(62.5) };

/** 3: the pour: an ease-in per pattern (the pattern grows faster and faster while held). */
export function pourCurve(power: number, durationMs: number, target: number): GaugeCurve {
  return { durationMs, ease: (x) => x ** power, target };
}

export function curveFor(stage: StageNo, pour: GaugeCurve): GaugeCurve {
  return stage === 1 ? ESPRESSO : stage === 2 ? MILK : pour;
}

/** Gauge fill after holding `heldMs` at `speed` (1 normal, 1.1 rush hour, 0.7 slow pour). */
export function fillAt(curve: GaugeCurve, heldMs: number, speed = 1): number {
  const x = Math.max(0, (heldMs * speed) / curve.durationMs);
  return x >= 1 ? 1 : Math.min(1, Math.max(0, curve.ease(x)));
}

/** How long to hold to reach `fill` (the inverse of fillAt; for the tests and the autoplay). */
export function holdMsFor(curve: GaugeCurve, fill: number, speed = 1): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (curve.ease(mid) < fill) lo = mid;
    else hi = mid;
  }
  return (((lo + hi) / 2) * curve.durationMs) / speed;
}

export interface StageResult {
  fill: number;
  /** Signed, -1 (early) … 1 (late); an overflow is +1. */
  error: number;
  grade: StageGrade;
  overflow: boolean;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * Grades a release. `patternScale` narrows (or widens) the windows for the pour of a harder
 * (or easier) pattern.
 */
export function gradeRelease(fill: number, target: number, difficulty: LatteDifficulty = 'normal', patternScale = 1): StageResult {
  if (fill >= 1) return { fill: 1, error: 1, grade: 'miss', overflow: true };
  const w = WINDOW_SCALE[difficulty] * patternScale;
  const d = fill - target;
  const grade: StageGrade = Math.abs(d) <= PERFECT_WINDOW * w + 1e-9 ? 'perfect' : Math.abs(d) <= GOOD_WINDOW * w + 1e-9 ? 'good' : 'miss';
  return { fill, error: clamp(d / (ERROR_SPAN * w), -1, 1), grade, overflow: false };
}

/** Q = 100 − (25|e1| + 30|e2| + 45|e3|), clamped to 0..100. */
export function cupQuality(e1: number, e2: number, e3: number): number {
  return clamp(Math.round((100 - (25 * Math.abs(e1) + 30 * Math.abs(e2) + 45 * Math.abs(e3))) * 10) / 10, 0, 100);
}

/** Perfect: Q ≥ 90 and no stage missed. Good: Q ≥ 65. Otherwise Messy. */
export function cupGrade(quality: number, grades: StageGrade[]): CupGrade {
  if (quality >= 90 && !grades.includes('miss')) return 'perfect';
  return quality >= 65 ? 'good' : 'messy';
}

/** The streak bonus: ×1 for the first cups in a row, ×1.5 from 3, ×2 from 6 (Messy breaks it). */
export function streakMultiplier(streak: number): number {
  return streak >= 6 ? 2 : streak >= 3 ? 1.5 : 1;
}

/** Tips for a cup: Perfect 10, Good 5, Messy 1, times the streak bonus and the pattern's difficulty. */
export function tipsFor(grade: CupGrade, streak: number, patternTips = 1): number {
  return Math.round(latte.tips[grade] * (grade === 'messy' ? 1 : streakMultiplier(streak) * patternTips));
}

export type PatternDifficulty = 'easy' | 'medium' | 'hard' | 'master';

export interface PatternInfo {
  id: string;
  name: string;
  /** Total tips that unlock it. */
  tips: number;
  difficulty: PatternDifficulty;
}

/** What a pattern's difficulty does: the pour's windows (×) and the tips (×). */
export const PATTERN_DIFFICULTY = latte.difficulty as Record<PatternDifficulty, { label: string; window: number; tips: number }>;

export const PATTERNS = latte.patterns as PatternInfo[];

export function patternInfo(id: string): PatternInfo {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}
export const MENU = latte.menu as { id: string; name: string; desc: string }[];
export const RUSH = latte.rush;

/** Jason's level: one per pattern his lifetime tips have unlocked. */
export function latteLevel(totalTips: number): number {
  return PATTERNS.filter((p) => totalTips >= p.tips).length;
}

export function unlockedPatterns(totalTips: number): PatternInfo[] {
  return PATTERNS.filter((p) => totalTips >= p.tips);
}

/** What a latte artist can pour: every pattern while everything is open, else what his tips have unlocked. */
export function artistPatterns(totalTips: number): PatternInfo[] {
  return EVERYTHING_OPEN ? PATTERNS : unlockedPatterns(totalTips);
}

const DIFFICULTY_RANK: Record<PatternDifficulty, number> = { easy: 0, medium: 1, hard: 2, master: 3 };
/** The hardest pattern a barista who isn't a latte artist pours (latte.json `baristaMax`); the rest is Jason's. */
export const BARISTA_MAX = latte.baristaMax as PatternDifficulty;

/** What every other barista can pour: the patterns up to BARISTA_MAX, all of them open. */
export function baristaPatterns(): PatternInfo[] {
  return PATTERNS.filter((p) => DIFFICULTY_RANK[p.difficulty] <= DIFFICULTY_RANK[BARISTA_MAX]);
}
