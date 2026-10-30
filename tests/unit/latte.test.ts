import { describe, expect, it } from 'vitest';
import {
  ESPRESSO,
  MILK,
  PATTERNS,
  PATTERN_DIFFICULTY,
  baristaPatterns,
  cupGrade,
  cupQuality,
  fillAt,
  fillToTemp,
  gradeRelease,
  holdMsFor,
  latteLevel,
  tipsFor,
  unlockedPatterns,
} from '../../src/game/latte/model';
import { PATTERN_DEFS } from '../../src/game/latte/patterns';
import { visualFor } from '../../src/game/latte/visuals';

describe('latte grading', () => {
  it('grades Perfect within ±4% of the target, Good within ±10%, otherwise Miss', () => {
    const t = ESPRESSO.target;
    expect(gradeRelease(t, t).grade).toBe('perfect');
    expect(gradeRelease(t + 0.04, t).grade).toBe('perfect');
    expect(gradeRelease(t - 0.0401, t).grade).toBe('good');
    expect(gradeRelease(t + 0.1, t).grade).toBe('good');
    expect(gradeRelease(t - 0.11, t).grade).toBe('miss');
  });

  it('puts the espresso band at 70–78% and the milk target at 60–65 °C', () => {
    expect(gradeRelease(0.7, ESPRESSO.target).grade).toBe('perfect');
    expect(gradeRelease(0.78, ESPRESSO.target).grade).toBe('perfect');
    expect(fillToTemp(MILK.target)).toBeCloseTo(62.5);
    expect(gradeRelease((60 - 20) / 60, MILK.target).grade).not.toBe('miss');
  });

  it('treats holding to 100% as an overflow (Miss, error +1)', () => {
    expect(gradeRelease(1, 0.74)).toEqual({ fill: 1, error: 1, grade: 'miss', overflow: true });
  });

  it('signs the error: early < 0, late > 0, clamped to -1..1', () => {
    expect(gradeRelease(0.5, 0.74).error).toBeLessThan(0);
    expect(gradeRelease(0.9, 0.74).error).toBeGreaterThan(0);
    expect(gradeRelease(0, 0.74).error).toBe(-1);
  });

  it('scales the windows by difficulty (Easy ×1.5, Hard ×0.7)', () => {
    const t = 0.5;
    expect(gradeRelease(t + 0.055, t, 'easy').grade).toBe('perfect');
    expect(gradeRelease(t + 0.055, t, 'normal').grade).toBe('good');
    expect(gradeRelease(t + 0.035, t, 'hard').grade).toBe('good');
  });

  it('computes Q = 100 − (25|e1| + 30|e2| + 45|e3|)', () => {
    expect(cupQuality(0, 0, 0)).toBe(100);
    expect(cupQuality(1, 1, 1)).toBe(0);
    expect(cupQuality(-0.2, 0.5, 0)).toBe(80);
    // Every stage on the edge of its Perfect window is exactly 90.
    const edge = gradeRelease(0.5 + 0.04, 0.5).error;
    expect(cupQuality(edge, edge, edge)).toBe(90);
  });

  it('calls a cup Perfect (Q ≥ 90, no miss), Good (Q ≥ 65) or Messy', () => {
    expect(cupGrade(95, ['perfect', 'perfect', 'good'])).toBe('perfect');
    expect(cupGrade(95, ['perfect', 'miss', 'perfect'])).toBe('good');
    expect(cupGrade(65, ['good', 'good', 'miss'])).toBe('good');
    expect(cupGrade(64.9, ['good', 'good', 'good'])).toBe('messy');
  });

  it('pays tips 10 / 5 / 1 with a streak bonus', () => {
    expect(tipsFor('perfect', 1)).toBe(10);
    expect(tipsFor('good', 1)).toBe(5);
    expect(tipsFor('messy', 9)).toBe(1);
    expect(tipsFor('perfect', 3)).toBe(15);
    expect(tipsFor('perfect', 6)).toBe(20);
  });

  it('inverts the gauge curves exactly (holdMsFor ∘ fillAt)', () => {
    for (const c of [ESPRESSO, MILK, ...Object.values(PATTERN_DEFS).map((p) => p.curve)]) {
      for (const speed of [1, 1.1, 0.7]) {
        const ms = holdMsFor(c, c.target, speed);
        expect(fillAt(c, ms, speed)).toBeCloseTo(c.target, 4);
      }
    }
  });

  it('runs 10% faster in rush hour', () => {
    expect(holdMsFor(ESPRESSO, 0.74, 1.1)).toBeCloseTo(holdMsFor(ESPRESSO, 0.74, 1) / 1.1, 3);
  });

  it('lets every other barista pour up to medium; hard and master are Jason’s', () => {
    const ids = baristaPatterns().map((p) => p.id);
    expect(ids).toEqual(['heart', 'tulip', 'star', 'rosetta', 'bear', 'green-light', 'cat', 'daisy']);
    expect(ids).not.toContain('swan');
    expect(ids).not.toContain('unicorn');
  });

  it('unlocks the patterns with Jason’s tips, Heart first and the Unicorn last', () => {
    expect(unlockedPatterns(0).map((p) => p.id)).toEqual(['heart']);
    expect(latteLevel(0)).toBe(1);
    const all = unlockedPatterns(10_000).map((p) => p.id);
    expect(all).toHaveLength(15);
    expect(all.at(-1)).toBe('unicorn');
    // The original order holds: Heart, Tulip, Rosetta, Swan, then the Fitzgerald specials.
    const order = ['heart', 'tulip', 'rosetta', 'swan', 'green-light', 'daisy', 'gatsby-g'].map((id) => all.indexOf(id));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const p of Object.values(PATTERN_DEFS)) expect(p.shapes().length).toBeGreaterThan(0);
  });

  it('gives every pattern a difficulty; harder pours are faster, steeper, tighter and pay more', () => {
    for (const p of PATTERNS) expect(['easy', 'medium', 'hard', 'master']).toContain(p.difficulty);
    expect(PATTERNS.filter((p) => p.difficulty === 'master').map((p) => p.id)).toEqual(['phoenix', 'dragon', 'unicorn']);
    const heart = PATTERN_DEFS.heart.curve;
    const unicorn = PATTERN_DEFS.unicorn.curve;
    expect(unicorn.durationMs).toBeLessThan(heart.durationMs);
    expect(unicorn.ease(0.5)).toBeLessThan(heart.ease(0.5));
    const t = 0.8;
    expect(gradeRelease(t + 0.03, t, 'normal', PATTERN_DIFFICULTY.easy.window).grade).toBe('perfect');
    expect(gradeRelease(t + 0.03, t, 'normal', PATTERN_DIFFICULTY.master.window).grade).toBe('good');
    expect(tipsFor('perfect', 1, PATTERN_DIFFICULTY.master.tips)).toBe(30);
    expect(tipsFor('good', 1, PATTERN_DIFFICULTY.hard.tips)).toBe(10);
    expect(tipsFor('messy', 1, PATTERN_DIFFICULTY.master.tips)).toBe(1);
  });
});

describe('error → visual parameters', () => {
  const clean = visualFor(0, 0, 0, 'perfect');

  it('pales the crema for an early shot and darkens it (bitter rim) for a late one', () => {
    const early = visualFor(-0.8, 0, 0, 'messy');
    const late = visualFor(0.8, 0, 0, 'messy');
    expect(early.cremaLight).toBeGreaterThan(clean.cremaLight);
    expect(early.cremaThin).toBeGreaterThan(0);
    expect(late.cremaLight).toBeLessThan(clean.cremaLight);
    expect(late.bitterRim).toBeGreaterThan(0);
    expect(clean.bitterRim).toBe(0);
  });

  it('gives under-steamed milk big bubbles and scalded milk stiff foam', () => {
    const early = visualFor(0, -0.8, 0, 'messy');
    const late = visualFor(0, 0.8, 0, 'messy');
    expect(early.bubbleCount).toBeGreaterThan(clean.bubbleCount);
    expect(early.bubbleSize).toBeGreaterThan(clean.bubbleSize);
    expect(late.stiff).toBeGreaterThan(0);
    expect(late.bubbleSize).toBeLessThan(clean.bubbleSize);
  });

  it('pours a small unfinished pattern early, a spilled blob late', () => {
    const early = visualFor(0, 0, -0.8, 'messy');
    const late = visualFor(0, 0, 0.9, 'messy');
    expect(early.scale).toBeLessThan(1);
    expect(early.unfinished).toBeGreaterThan(0);
    expect(early.spill).toBe(0);
    expect(late.scale).toBeGreaterThan(1);
    expect(late.blob).toBeGreaterThan(0);
    expect(late.spill).toBeGreaterThan(0);
    expect(late.symmetry).toBeLessThan(clean.symmetry);
    expect(late.cutStraight).toBeLessThan(1);
  });

  it('makes a perfect cup crisp and glossy, with a sparkle', () => {
    expect(clean.symmetry).toBe(1);
    expect(clean.wobble).toBe(0);
    expect(clean.cutStraight).toBe(1);
    expect(clean.gloss).toBe(1);
    expect(clean.sparkle).toBe(true);
    expect(visualFor(0, 0, 0, 'good').sparkle).toBe(false);
  });
});
