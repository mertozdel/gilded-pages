/**
 * How a cup looks, from how it was made: each stage's signed error (-1 early … 1 late)
 * becomes the parameters the renderer draws.
 *   e1 (the shot): crema hue and darkness — early pale and thin, late dark with a bitter rim.
 *   e2 (the milk): bubbles — early big bubbles, late scalded, stiff foam (small bubbles, lumpy).
 *   e3 (the pour): pattern scale, symmetry, wobble, blur, the cut-through, and spill — early a
 *   small unfinished pattern, late a spreading blob that spills on the saucer.
 */
import type { CupGrade } from './model';

export interface LatteVisual {
  /** Crema hue (deg) and lightness (%). */
  cremaHue: number;
  cremaLight: number;
  /** 0..1: thin, patchy crema (an early shot). */
  cremaThin: number;
  /** 0..1: a dark bitter ring at the rim (a late shot). */
  bitterRim: number;
  bubbleCount: number;
  /** Bubble radius, in % of the crema radius. */
  bubbleSize: number;
  /** 0..1: scalded, stiff foam. */
  stiff: number;
  /** Pattern size, 1 = the outline guide. */
  scale: number;
  /** 1 = perfectly symmetric. */
  symmetry: number;
  /** 0..1 shaky edges. */
  wobble: number;
  /** Soft edges, px at 320 px. */
  blur: number;
  /** 1 = a straight cut-through. */
  cutStraight: number;
  /** 0..1: how much of the pattern is missing (poured too short). */
  unfinished: number;
  /** 0..1: spread into a blob. */
  blob: number;
  /** 0..1: spilled on the saucer. */
  spill: number;
  /** 0..1 glossy highlight. */
  gloss: number;
  sparkle: boolean;
}

const pos = (x: number) => Math.max(0, x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function visualFor(e1: number, e2: number, e3: number, grade: CupGrade): LatteVisual {
  const early2 = pos(-e2);
  const late2 = pos(e2);
  return {
    cremaHue: 27 + 9 * pos(-e1) - 9 * pos(e1),
    cremaLight: 38 + 16 * pos(-e1) - 17 * pos(e1),
    cremaThin: clamp01(pos(-e1) * 1.2),
    bitterRim: clamp01(pos(e1) * 1.2),
    bubbleCount: Math.round(3 + 30 * early2 + 14 * late2),
    bubbleSize: 1.6 + 5 * early2 - 0.6 * late2,
    stiff: clamp01(late2 * 1.2),
    scale: 1 + 0.5 * Math.max(-1, Math.min(1, e3)),
    symmetry: 1 - clamp01(0.85 * Math.abs(e3) + 0.3 * Math.abs(e2)),
    wobble: clamp01(0.7 * Math.abs(e3) + 0.45 * Math.abs(e2)),
    blur: 0.25 + 3 * Math.abs(e3) + 1.2 * late2,
    cutStraight: 1 - clamp01(Math.abs(e3) * 1.3),
    unfinished: clamp01(pos(-e3) * 1.1),
    blob: clamp01((pos(e3) - 0.15) / 0.85),
    spill: clamp01((pos(e3) - 0.35) / 0.65),
    gloss: grade === 'perfect' ? 1 : grade === 'good' ? 0.5 : 0.15,
    sparkle: grade === 'perfect',
  };
}

/** A clean cup (no errors) — the guide and the live preview start from it. */
export const CLEAN: LatteVisual = visualFor(0, 0, 0, 'good');

/**
 * The real pour draws each shape as it came out (render's `poured`), so the pour's error no
 * longer sizes the whole pattern, leaves its end off or melts it into a blob; a step that ran
 * over spills on the saucer.
 */
export function pouredVisual(v: LatteVisual, overflow: boolean): LatteVisual {
  return { ...v, scale: 1, unfinished: 0, blob: 0, spill: overflow ? Math.max(v.spill, 0.5) : 0 };
}
