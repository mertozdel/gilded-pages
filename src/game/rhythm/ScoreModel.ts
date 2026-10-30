/**
 * Score, combo, accuracy, stars, the meter and star power — pure, fed with judgments.
 *   100 / 70 / 40 per Perfect / Great / Good × the combo multiplier (×2 at 10, ×3 at 20,
 *   ×4 at 30) × 2 during star power. Accuracy weighs hits 1 / 0.7 / 0.4. Stars 1–5 at
 *   50 / 65 / 80 / 90 / 97 %. The meter (Stimmung / crowd energy) falls on misses and rises
 *   on hits; empty means the song failed, unless No-fail.
 */
import type { Grade, Judgment } from './Judge';

export const POINTS: Record<Grade, number> = { perfect: 100, great: 70, good: 40, miss: 0 };
const WEIGHT: Record<Grade, number> = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
export const STAR_THRESHOLDS = [50, 65, 80, 90, 97];
const METER_GAIN: Record<Grade, number> = { perfect: 0.025, great: 0.02, good: 0.01, miss: -0.08 };
/** Star power needs at least half a gauge; streaks fill it. */
export const STAR_MIN = 0.5;

export function multiplierFor(combo: number): number {
  return combo >= 30 ? 4 : combo >= 20 ? 3 : combo >= 10 ? 2 : 1;
}

export function starsFor(accuracy: number): number {
  return STAR_THRESHOLDS.filter((s) => accuracy >= s).length;
}

export class ScoreModel {
  score = 0;
  combo = 0;
  maxCombo = 0;
  /** Misses in a row (Jonas's "uh-oh" at three). */
  missStreak = 0;
  readonly counts: Record<Grade, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  meter = 0.5;
  failed = false;
  star = 0;
  starActive = false;
  private weighted = 0;

  constructor(
    readonly total: number,
    readonly noFail = false,
  ) {}

  get judged(): number {
    return this.counts.perfect + this.counts.great + this.counts.good + this.counts.miss;
  }

  get multiplier(): number {
    return multiplierFor(this.combo);
  }

  /** Accuracy so far, in %. */
  get accuracy(): number {
    return this.judged ? (this.weighted / this.judged) * 100 : 100;
  }

  /** Accuracy over the whole chart (unplayed notes count as misses). */
  get finalAccuracy(): number {
    return this.total ? (this.weighted / Math.max(this.total, this.judged)) * 100 : 0;
  }

  get stars(): number {
    return starsFor(this.finalAccuracy);
  }

  get fullCombo(): boolean {
    return this.counts.miss === 0 && this.judged >= this.total && this.total > 0;
  }

  apply(j: Judgment): void {
    this.counts[j.grade]++;
    this.weighted += WEIGHT[j.grade];
    if (j.grade === 'miss') {
      this.combo = 0;
      this.missStreak++;
    } else {
      this.combo++;
      this.missStreak = 0;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += POINTS[j.grade] * multiplierFor(this.combo) * (this.starActive ? 2 : 1);
      if (this.combo >= 5 && !this.starActive) this.star = Math.min(1, this.star + 0.02);
    }
    this.meter = Math.min(1, Math.max(0, this.meter + METER_GAIN[j.grade]));
    if (this.meter <= 0 && !this.noFail) this.failed = true;
  }

  canStar(): boolean {
    return !this.starActive && this.star >= STAR_MIN;
  }

  startStar(): boolean {
    if (!this.canStar()) return false;
    this.starActive = true;
    return true;
  }

  endStar(): void {
    this.starActive = false;
    this.star = 0;
  }
}
