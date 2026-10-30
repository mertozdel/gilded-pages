/**
 * The latte art patterns, each a drawing (shapes in pour order, in units of the crema's
 * radius, y down) plus a stage-3 pour curve set by its difficulty (easy, medium, hard,
 * master). Unlocked by Jason's tips, from the Heart through the Fitzgerald specials (The Green
 * Light, Daisy, Gatsby G) up to the master pours: Phoenix, Dragon and Unicorn.
 */
import { PATTERNS, pourCurve, type GaugeCurve, type PatternDifficulty } from './model';

export type Pt = [number, number];
export type Tone = 'foam' | 'matcha' | 'crema';

export type Prim =
  /** A closed, smoothed shape of poured foam. */
  | { k: 'blob'; pts: Pt[]; tone?: Tone }
  /** An open, smoothed line (a neck, a monogram, the cut-through). */
  | { k: 'stroke'; pts: Pt[]; w: number; tone?: Tone; cut?: boolean }
  | { k: 'dot'; x: number; y: number; r: number; tone?: Tone };

export interface PatternDef {
  id: string;
  name: string;
  difficulty: PatternDifficulty;
  curve: GaugeCurve;
  /** Shapes in the order they are poured (an early release leaves the last ones out). */
  shapes: () => Prim[];
}

const TAU = Math.PI * 2;

/** The classic heart curve, `size` wide, centred at (cx, cy), rotated by `rot`. */
export function heartPts(cx: number, cy: number, size: number, rot = 0, n = 48): Pt[] {
  const pts: Pt[] = [];
  const k = size / 32;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const x = 16 * Math.sin(t) ** 3 * k;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * k + 2.5 * k;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}

/** A crescent arching upwards (∩): one layer of a tulip or a rosetta leaf. */
function crescent(cx: number, cy: number, rx: number, ry: number, thick: number, rot = 0, n = 18): Pt[] {
  const pts: Pt[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const put = (x: number, y: number) => pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    put(Math.cos(a) * rx, Math.sin(a) * ry);
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI + (i / n) * Math.PI;
    put(Math.cos(a) * rx * 0.86, Math.sin(a) * ry * (1 - thick) + ry * thick * 0.35);
  }
  return pts;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, rot: number, n = 20): Pt[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    return [cx + x * c - y * s, cy + x * s + y * c] as Pt;
  });
}

/** A star with `n` points, outer radius `r1`, inner `r2`. */
function starPts(cx: number, cy: number, r1: number, r2: number, n: number): Pt[] {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i / (n * 2)) * TAU;
    const r = i % 2 ? r2 : r1;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
}

/** Points along an arc. */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 14): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
}

/** A curl: an inward spiral of `turns` turns. */
function spiralPts(cx: number, cy: number, r: number, turns: number, n = 22): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = Math.PI + t * turns * TAU;
    const rr = r * (1 - t * 0.85);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as Pt;
  });
}

const cut = (x0: number, y0: number, x1: number, y1: number): Prim => ({ k: 'stroke', pts: [[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]], w: 0.035, tone: 'crema', cut: true });

function rosettaLeaves(cx: number, cy: number, scale: number, rot: number, count: number): Prim[] {
  const out: Prim[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < count; i++) {
    const f = i / count;
    const ly = (0.58 - f * 1.05) * scale;
    const rx = (0.62 - f * 0.4) * scale;
    const ry = (0.2 - f * 0.08) * scale;
    out.push({ k: 'blob', pts: crescent(cx - ly * s, cy + ly * c, rx, ry, 0.55, rot) });
  }
  return out;
}

const DRAWINGS: Record<string, { power: number; durationMs: number; target: number; shapes: () => Prim[] }> = {
  heart: { power: 2, durationMs: 2600, target: 0.8, shapes: () => [{ k: 'blob', pts: heartPts(0, 0.02, 1.15) }, cut(0, -0.42, 0, 0.5)] },
  tulip: {
    power: 2.2,
    durationMs: 2800,
    target: 0.78,
    shapes: () => [
      { k: 'blob', pts: crescent(0, 0.5, 0.6, 0.24, 0.5) },
      { k: 'blob', pts: crescent(0, 0.22, 0.52, 0.22, 0.5) },
      { k: 'blob', pts: crescent(0, -0.04, 0.44, 0.2, 0.5) },
      { k: 'blob', pts: heartPts(0, -0.36, 0.62) },
      cut(0, -0.62, 0, 0.66),
    ],
  },
  rosetta: {
    power: 1.8,
    durationMs: 3000,
    target: 0.82,
    shapes: () => [...rosettaLeaves(0, 0, 1, 0, 8), { k: 'blob', pts: heartPts(0, -0.56, 0.28) }, cut(0, -0.7, 0, 0.74)],
  },
  swan: {
    power: 2.4,
    durationMs: 3000,
    target: 0.8,
    shapes: () => [
      ...rosettaLeaves(-0.16, 0.12, 0.78, -0.55, 7),
      { k: 'stroke', pts: [[0.42, 0.5], [0.5, 0.1], [0.38, -0.3], [0.2, -0.42]], w: 0.09 },
      { k: 'blob', pts: heartPts(0.12, -0.5, 0.26, -0.9) },
    ],
  },
  'green-light': {
    power: 2,
    durationMs: 2500,
    target: 0.76,
    shapes: () => [{ k: 'blob', pts: heartPts(0, 0, 1.1) }, cut(0, -0.4, 0, 0.42), { k: 'dot', x: 0, y: 0.5, r: 0.085, tone: 'matcha' }],
  },
  daisy: {
    power: 1.6,
    durationMs: 2700,
    target: 0.8,
    shapes: () => [
      ...Array.from({ length: 8 }, (_, i): Prim => {
        const a = (i / 8) * TAU - Math.PI / 2;
        return { k: 'blob', pts: ellipsePts(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.2, 0.09, a) };
      }),
      { k: 'dot', x: 0, y: 0, r: 0.15 },
      { k: 'dot', x: 0, y: 0, r: 0.07, tone: 'crema' },
    ],
  },
  'gatsby-g': {
    power: 2.6,
    durationMs: 3200,
    target: 0.82,
    shapes: () => {
      const ring: Prim[] = Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * TAU;
        return { k: 'dot', x: Math.cos(a) * 0.76, y: Math.sin(a) * 0.76, r: 0.045 };
      });
      const arc: Pt[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = (-45 - (i / 24) * 300) * (Math.PI / 180);
        arc.push([Math.cos(a) * 0.42, Math.sin(a) * 0.42]);
      }
      return [
        ...ring,
        { k: 'stroke', pts: arc, w: 0.12 },
        { k: 'stroke', pts: [[0.42, 0.06], [0.27, 0.06], [0.1, 0.06]], w: 0.1 },
        { k: 'stroke', pts: [[0.41, 0.04], [0.41, 0.16], [0.4, 0.28]], w: 0.1 },
      ];
    },
  },
  star: {
    power: 1.9,
    durationMs: 2800,
    target: 0.8,
    shapes: () => [{ k: 'blob', pts: starPts(0, 0.04, 0.6, 0.26, 5) }, { k: 'dot', x: 0, y: 0.04, r: 0.07, tone: 'crema' }],
  },
  bear: {
    power: 2.2,
    durationMs: 2600,
    target: 0.8,
    shapes: () => [
      { k: 'dot', x: -0.34, y: -0.32, r: 0.16 },
      { k: 'dot', x: 0.34, y: -0.32, r: 0.16 },
      { k: 'dot', x: -0.34, y: -0.32, r: 0.07, tone: 'crema' },
      { k: 'dot', x: 0.34, y: -0.32, r: 0.07, tone: 'crema' },
      { k: 'blob', pts: ellipsePts(0, 0.06, 0.44, 0.4, 0, 28) },
      { k: 'dot', x: -0.15, y: -0.03, r: 0.045, tone: 'crema' },
      { k: 'dot', x: 0.15, y: -0.03, r: 0.045, tone: 'crema' },
      { k: 'blob', pts: ellipsePts(0, 0.2, 0.17, 0.12, 0), tone: 'foam' },
      { k: 'dot', x: 0, y: 0.15, r: 0.05, tone: 'crema' },
    ],
  },
  cat: {
    power: 2.2,
    durationMs: 2600,
    target: 0.8,
    shapes: () => [
      { k: 'blob', pts: [[-0.42, -0.08], [-0.34, -0.58], [-0.08, -0.26]] },
      { k: 'blob', pts: [[0.42, -0.08], [0.34, -0.58], [0.08, -0.26]] },
      { k: 'blob', pts: ellipsePts(0, 0.1, 0.45, 0.38, 0, 28) },
      { k: 'dot', x: -0.16, y: 0.02, r: 0.05, tone: 'crema' },
      { k: 'dot', x: 0.16, y: 0.02, r: 0.05, tone: 'crema' },
      { k: 'dot', x: 0, y: 0.16, r: 0.035, tone: 'crema' },
      ...[-1, 1].flatMap((s): Prim[] =>
        [-0.05, 0.05].map((dy): Prim => ({ k: 'stroke', pts: [[s * 0.1, 0.2 + dy], [s * 0.28, 0.17 + dy * 1.6], [s * 0.42, 0.14 + dy * 2.2]], w: 0.018, tone: 'crema' })),
      ),
    ],
  },
  butterfly: {
    power: 2.6,
    durationMs: 2400,
    target: 0.8,
    shapes: () => [
      { k: 'blob', pts: ellipsePts(-0.3, -0.16, 0.3, 0.2, 0.55) },
      { k: 'blob', pts: ellipsePts(0.3, -0.16, 0.3, 0.2, -0.55) },
      { k: 'blob', pts: ellipsePts(-0.22, 0.24, 0.2, 0.14, -0.5) },
      { k: 'blob', pts: ellipsePts(0.22, 0.24, 0.2, 0.14, 0.5) },
      { k: 'dot', x: -0.32, y: -0.18, r: 0.06, tone: 'crema' },
      { k: 'dot', x: 0.32, y: -0.18, r: 0.06, tone: 'crema' },
      { k: 'stroke', pts: [[0, -0.32], [0, 0.02], [0, 0.42]], w: 0.07 },
      { k: 'stroke', pts: [[0, -0.32], [-0.08, -0.48], [-0.15, -0.58]], w: 0.025 },
      { k: 'stroke', pts: [[0, -0.32], [0.08, -0.48], [0.15, -0.58]], w: 0.025 },
    ],
  },
  wave: {
    power: 2.6,
    durationMs: 2400,
    target: 0.78,
    shapes: () => [
      { k: 'stroke', pts: arcPts(0.05, 0.62, 0.62, Math.PI * 1.05, Math.PI * 1.95), w: 0.11 },
      { k: 'stroke', pts: arcPts(0.05, 0.62, 0.44, Math.PI * 1.1, Math.PI * 1.9), w: 0.1 },
      { k: 'stroke', pts: arcPts(0.05, 0.62, 0.27, Math.PI * 1.15, Math.PI * 1.85), w: 0.09 },
      // The curl at the crest.
      { k: 'stroke', pts: spiralPts(0.38, -0.12, 0.22, 1.6), w: 0.07 },
      { k: 'dot', x: -0.5, y: -0.3, r: 0.05 },
      { k: 'dot', x: -0.36, y: -0.42, r: 0.035 },
    ],
  },
  phoenix: {
    power: 3,
    durationMs: 2200,
    target: 0.82,
    shapes: () => [
      ...rosettaLeaves(-0.3, 0.05, 0.62, -1.0, 6),
      ...rosettaLeaves(0.3, 0.05, 0.62, 1.0, 6),
      { k: 'stroke', pts: [[0, 0.62], [0.06, 0.35], [0, 0.1], [-0.04, -0.2]], w: 0.09 },
      { k: 'stroke', pts: [[0, 0.55], [-0.18, 0.72], [-0.3, 0.8]], w: 0.05 },
      { k: 'stroke', pts: [[0, 0.55], [0.18, 0.72], [0.3, 0.8]], w: 0.05 },
      { k: 'blob', pts: heartPts(0, -0.36, 0.3, Math.PI) },
      { k: 'dot', x: 0.04, y: -0.4, r: 0.03, tone: 'crema' },
    ],
  },
  dragon: {
    power: 3,
    durationMs: 2200,
    target: 0.8,
    shapes: () => {
      // A serpent body in an S, spines along it, the head at the top right.
      const body: Pt[] = Array.from({ length: 11 }, (_, i) => {
        const t = i / 10;
        return [-0.55 + t * 1.0, 0.55 - t * 1.0 + Math.sin(t * Math.PI * 2) * 0.2];
      });
      const spines: Prim[] = body.slice(1, 9).map(([x, y], i) => ({ k: 'dot', x: x - 0.07, y: y - 0.1 - (i % 2) * 0.02, r: 0.035 }));
      return [
        { k: 'stroke', pts: body, w: 0.13 },
        ...spines,
        { k: 'blob', pts: ellipsePts(0.5, -0.47, 0.17, 0.11, -0.5) },
        { k: 'stroke', pts: [[0.44, -0.55], [0.38, -0.7], [0.32, -0.78]], w: 0.03 },
        { k: 'stroke', pts: [[0.52, -0.57], [0.52, -0.72], [0.5, -0.82]], w: 0.03 },
        { k: 'stroke', pts: [[0.62, -0.42], [0.74, -0.38], [0.8, -0.3]], w: 0.02 },
        { k: 'dot', x: 0.52, y: -0.5, r: 0.03, tone: 'crema' },
      ];
    },
  },
  unicorn: {
    power: 3.1,
    durationMs: 2200,
    target: 0.82,
    shapes: () => [
      // The mane, then the head in profile, the horn, an eye.
      { k: 'dot', x: -0.38, y: -0.3, r: 0.1 },
      { k: 'dot', x: -0.45, y: -0.06, r: 0.1 },
      { k: 'dot', x: -0.42, y: 0.18, r: 0.09 },
      {
        k: 'blob',
        pts: [
          [-0.32, 0.5],
          [-0.38, 0.08],
          [-0.26, -0.3],
          [0.0, -0.44],
          [0.22, -0.32],
          [0.42, -0.06],
          [0.48, 0.12],
          [0.32, 0.22],
          [0.08, 0.14],
          [0.02, 0.5],
        ],
      },
      { k: 'stroke', pts: [[0.02, -0.42], [0.14, -0.62], [0.24, -0.82]], w: 0.07 },
      { k: 'stroke', pts: [[0.06, -0.52], [0.13, -0.5]], w: 0.015, tone: 'crema' },
      { k: 'stroke', pts: [[0.12, -0.63], [0.18, -0.61]], w: 0.015, tone: 'crema' },
      { k: 'dot', x: 0.14, y: -0.14, r: 0.04, tone: 'crema' },
      { k: 'dot', x: 0.4, y: 0.08, r: 0.025, tone: 'crema' },
    ],
  },
};

/**
 * The pour by difficulty: harder patterns ease in more steeply (the pattern rushes to its size
 * at the end) and fill sooner, on top of their narrower windows (model.ts).
 */
const TIER_CURVE: Record<PatternDifficulty, { power: number; durationMs: number }> = {
  easy: { power: 1.9, durationMs: 2800 },
  medium: { power: 2.2, durationMs: 2600 },
  hard: { power: 2.6, durationMs: 2400 },
  master: { power: 3.1, durationMs: 2200 },
};

export const PATTERN_DEFS: Record<string, PatternDef> = Object.fromEntries(
  PATTERNS.map((p) => {
    const d = DRAWINGS[p.id] ?? DRAWINGS.heart;
    const tier = TIER_CURVE[p.difficulty];
    return [p.id, { id: p.id, name: p.name, difficulty: p.difficulty, curve: pourCurve(tier.power, tier.durationMs, d.target), shapes: d.shapes }];
  }),
);

export function patternDef(id: string): PatternDef {
  return PATTERN_DEFS[id] ?? PATTERN_DEFS.heart;
}
