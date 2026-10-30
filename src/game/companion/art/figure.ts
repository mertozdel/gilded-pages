/**
 * Small isometric pixel people (32×48 frames, figure ≈ 44 px), in the style of the café
 * reference: realistic proportions, soft 2–3 tone shading, outlines in a darker shade of
 * each colour. One articulated skeleton per pose, drawn in two facings — SE (front
 * three-quarter) and NE (back three-quarter); SW/NW are flips at runtime.
 *
 * Roxy is drawn layer by layer (body, bottoms, blouse, apron, hair, accessories) so a blouse
 * or the era's bottoms are just another sheet; NPCs use the same code as one composite.
 */
import type { BlouseDef, BlouseDetail, CollarStyle } from '../../../content';
import { fillPoly, hexMix, outlineTinted } from '../../iso/iso';
import { ANIMS, FRAME_H, FRAME_W, LAYERS, ROWS, SHEET_COLS, SHEET_ROWS, type AnimKey, type Facing2, type LayerName } from './animations';

type Ctx = CanvasRenderingContext2D;
interface Pt {
  x: number;
  y: number;
}

// ---------- looks ----------

export interface Tones {
  base: string;
  shade: string;
  light: string;
}

export type HairStyle = 'curls' | 'long' | 'bun' | 'puff' | 'short' | 'cap' | 'braids' | 'bob';
export type Bottoms = 'jeans' | 'pleated' | 'wideLeg' | 'trousers' | 'skirt';
export type Shoes = 'sneakers' | 'tstrap' | 'boots' | 'flats';

export interface Look {
  skin: Tones;
  /** `shine` catches the light on top of the head (Roxy's honey curls). */
  hair: Tones & { deep: string; shine?: string };
  hairStyle: HairStyle;
  top: Tones & { trim: string; collar?: CollarStyle; detail?: BlouseDetail };
  /** Romantic puff sleeves, a short puff to the elbow, or plain long ones. */
  sleeve: 'puff' | 'elbow' | 'long';
  bottoms: Bottoms;
  bottomTones: Tones;
  shoes: Shoes;
  /** A belt over the waistband of jeans or trousers. */
  belt?: string;
  eye?: string;
  apron?: boolean;
  pearls?: boolean;
  glasses?: boolean;
  beard?: string;
}

/*
 * Roxy follows the character mockup "The Light-Brown/Yellow Barista" (model B-001): fair,
 * pink-toned skin; honey-caramel ringlets pulled half up; the cream Peter Pan blouse; muted
 * denim with a dark belt and rolled cuffs; burgundy ballet flats. Colours sampled from it.
 */
export const ROXY_SKIN: Tones = { base: '#EBCFC0', shade: '#CDA394', light: '#F6E3D7' };
/** Honey-caramel curls, inked dark brown between the ringlets, with a yellow sheen on top. */
export const ROXY_HAIR = { base: '#A26A36', shade: '#7C4C26', light: '#C48C4C', deep: '#663A1E', shine: '#DCAE62' };
const ROXY_EYE = '#3E2A2C';
const ROXY_BELT = '#3E2E2E';
const JEANS: Tones = { base: '#4B5E76', shade: '#36475E', light: '#6E8299' };
const NAVY_PLEATS: Tones = { base: '#24315A', shade: '#151D38', light: '#3E5288' };

/** Roxy in a given blouse and era: jeans and burgundy flats in 2026, a pleated skirt, T-straps and pearls in 1925. */
export function roxyLook(blouse: BlouseDef, era: '2026' | '1925', apron = false): Look {
  return {
    skin: ROXY_SKIN,
    hair: ROXY_HAIR,
    hairStyle: 'curls',
    top: { ...blouse.colors, collar: blouse.collar, detail: blouse.detail },
    sleeve: blouse.sleeve === 'elbowPuff' ? 'elbow' : 'puff',
    bottoms: era === '2026' ? 'jeans' : 'pleated',
    bottomTones: era === '2026' ? JEANS : NAVY_PLEATS,
    shoes: era === '2026' ? 'flats' : 'tstrap',
    belt: era === '2026' ? ROXY_BELT : undefined,
    eye: ROXY_EYE,
    apron,
    pearls: era === '1925',
  };
}

// ---------- poses ----------

/** Elbow and hand, relative to the shoulder. */
interface Arm {
  ex: number;
  ey: number;
  hx: number;
  hy: number;
}

/** Foot offset from rest and lift off the ground. */
interface Leg {
  dx: number;
  lift: number;
}

type Prop =
  | { kind: 'cloth' | 'cup' | 'latte' | 'jug' | 'pen' | 'apron'; at: 'L' | 'R' }
  | { kind: 'notebook'; at: 'L' | 'R' }
  | { kind: 'book'; open: boolean; ribbon?: boolean; turn?: number }
  | { kind: 'steam' | 'pour' | 'notes' | 'z'; t: number };

export interface Pose {
  bob: number;
  sit: boolean;
  lean: number;
  headDx: number;
  headDy: number;
  armL: Arm;
  armR: Arm;
  legL: Leg;
  legR: Leg;
  eyes: 'open' | 'closed' | 'down' | 'happy';
  mouth: 'smile' | 'open' | 'flat';
  sway: number;
  apron: 'on' | 'held' | 'none';
  props: Prop[];
}

const REST_L: Arm = { ex: -1, ey: 5, hx: -1, hy: 9 };
const REST_R: Arm = { ex: 1, ey: 5, hx: 1, hy: 9 };

function base(): Pose {
  return {
    bob: 0,
    sit: false,
    lean: 0,
    headDx: 0,
    headDy: 0,
    armL: { ...REST_L },
    armR: { ...REST_R },
    legL: { dx: 0, lift: 0 },
    legR: { dx: 0, lift: 0 },
    eyes: 'open',
    mouth: 'smile',
    sway: 0,
    apron: 'on',
    props: [],
  };
}

function seated(): Pose {
  const p = base();
  p.sit = true;
  p.armL = { ex: 1, ey: 4, hx: 4, hy: 6 };
  p.armR = { ex: 0, ey: 4, hx: -2, hy: 6 };
  return p;
}

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

const POSES: Record<AnimKey, (i: number, f: Facing2) => Pose> = {
  idle: (i) => ({ ...base(), bob: pick([0, 0, 1, 0], i), sway: pick([0, 0, 1, 0], i) }),
  blink: (i) => ({ ...base(), eyes: i === 1 ? 'closed' : 'down' }),
  walk: (i) => {
    const s = pick([2, 1, -1, -2, -1, 1], i);
    const p = base();
    p.bob = pick([0, -1, 0, 0, -1, 0], i);
    p.legL = { dx: -s, lift: pick([0, 0, 1, 0, 0, 0], i) };
    p.legR = { dx: s, lift: pick([0, 0, 0, 0, 0, 1], i) };
    p.armL = { ex: -1 + Math.round(s / 2), ey: 5, hx: -1 + s, hy: 9 };
    p.armR = { ex: 1 - Math.round(s / 2), ey: 5, hx: 1 - s, hy: 9 };
    p.sway = pick([0, 1, 1, 0, -1, -1], i);
    return p;
  },
  run: (i) => {
    const s = pick([3, 2, -2, -3, -2, 2], i);
    const p = base();
    p.lean = 1;
    p.bob = pick([0, -1, -2, 0, -1, -2], i);
    p.legL = { dx: -s, lift: pick([0, 1, 2, 0, 0, 0], i) };
    p.legR = { dx: s, lift: pick([0, 0, 0, 0, 1, 2], i) };
    p.armL = { ex: -2 + s, ey: 4, hx: s, hy: 6 };
    p.armR = { ex: 2 - s, ey: 4, hx: -s, hy: 6 };
    p.sway = pick([1, 2, 1, -1, -2, -1], i);
    p.mouth = 'open';
    return p;
  },
  wipeCounter: (i) => ({ ...base(), armR: { ex: 2, ey: 4, hx: 4 + pick([0, 1, 2, 1, 0, -1], i), hy: 7 }, eyes: 'down', props: [{ kind: 'cloth', at: 'R' }] }),
  takeOrder: (i) => ({
    ...base(),
    armL: { ex: 1, ey: 4, hx: 3, hy: 5 },
    armR: { ex: 0, ey: 4, hx: 1 + (i % 2), hy: 5 },
    eyes: i < 2 ? 'open' : 'down',
    mouth: i < 2 ? 'open' : 'smile',
    props: [
      { kind: 'notebook', at: 'L' },
      { kind: 'pen', at: 'R' },
    ],
  }),
  pullShot: (i) => {
    const p = base();
    p.armR = i < 4 ? { ex: 2, ey: 3, hx: 5, hy: 3 + (i > 1 ? 1 : 0) } : { ex: 2, ey: 4, hx: 4, hy: 7 };
    if (i >= 6) p.props = [{ kind: 'cup', at: 'R' }];
    p.eyes = 'down';
    return p;
  },
  steamMilk: (i) => ({
    ...base(),
    armR: { ex: 2, ey: 3, hx: 4, hy: 4 + (i % 2) },
    armL: { ex: 1, ey: 4, hx: 3, hy: 6 },
    eyes: 'down',
    props: [
      { kind: 'jug', at: 'R' },
      { kind: 'steam', t: i },
    ],
  }),
  latteArt: (i) => ({
    ...base(),
    armL: { ex: 1, ey: 4, hx: 3, hy: 7 },
    armR: { ex: 2, ey: 3, hx: 4, hy: i >= 2 && i <= 5 ? 4 : 5 },
    eyes: 'down',
    props: [{ kind: 'latte', at: 'L' }, { kind: 'jug', at: 'R' }, ...(i >= 2 && i <= 5 ? [{ kind: 'pour' as const, t: i }] : [])],
  }),
  serve: (i) => ({
    ...base(),
    armR: { ex: 2 + (i > 1 ? 1 : 0), ey: 3, hx: 3 + Math.min(i, 3) * 1.5, hy: 5 },
    eyes: i >= 4 ? 'happy' : 'open',
    props: i <= 4 ? [{ kind: 'latte', at: 'R' }] : [],
  }),
  untieApron: (i) => {
    const p = base();
    if (i <= 3) {
      p.armL = { ex: -2, ey: 4, hx: 1, hy: 8 };
      p.armR = { ex: 2, ey: 4, hx: -1, hy: 8 };
      p.headDy = 1;
    } else {
      p.apron = 'held';
      p.armR = { ex: 2, ey: 1 - (i - 4), hx: 4, hy: -1 - (i - 4) };
      p.props = [{ kind: 'apron', at: 'R' }];
    }
    p.eyes = i <= 3 ? 'down' : 'open';
    return p;
  },
  wave: (i) => ({ ...base(), armR: { ex: 2, ey: -2, hx: 3 + pick([0, 1, 2, 1, 0, -1], i), hy: -7 }, mouth: 'open', eyes: i === 2 || i === 3 ? 'happy' : 'open' }),
  charleston: (i) => {
    const p = base();
    const kick = pick([0, 3, 2, 0, 0, -3, -2, 0, 0, 3, 2, 0], i);
    p.legL = { dx: kick < 0 ? kick : 0, lift: kick < 0 ? 2 : 0 };
    p.legR = { dx: kick > 0 ? kick : 0, lift: kick > 0 ? 2 : 0 };
    p.bob = pick([0, -1, -1, 0, 0, -1, -1, 0, 0, -1, -1, 0], i);
    const up = i % 6 < 3;
    p.armL = up ? { ex: -2, ey: -1, hx: -3, hy: -6 } : { ex: -2, ey: 4, hx: -4, hy: 7 };
    p.armR = up ? { ex: 2, ey: 4, hx: 4, hy: 7 } : { ex: 2, ey: -1, hx: 3, hy: -6 };
    p.sway = pick([-1, 0, 1, 1, 0, -1], i);
    p.eyes = 'happy';
    p.mouth = 'open';
    return p;
  },
  admireArt: (i) => ({
    ...base(),
    armL: { ex: 1, ey: 5, hx: 3, hy: 8 },
    armR: { ex: -1, ey: 5, hx: -3, hy: 8 },
    headDx: pick([0, 0, 1, 1, 1, 0], i),
    headDy: pick([0, -1, -1, 0, 0, 0], i),
  }),
  sitRead: (i) => ({ ...seated(), headDy: 1, eyes: 'down', props: [{ kind: 'book', open: true, turn: i === 3 ? 0.5 : 0 }], bob: pick([0, 0, 1, 1, 0, 0], i) }),
  turnPage: (i) => {
    const p = seated();
    p.headDy = 1;
    p.eyes = 'down';
    p.armR = { ex: 0, ey: 3, hx: -1 + Math.min(i, 3), hy: 4 - Math.min(i, 3) };
    p.props = [{ kind: 'book', open: true, turn: i / 5 }];
    return p;
  },
  sipCoffee: (i) => {
    const p = seated();
    const lift = pick([0, 2, 4, 4, 2, 0], i);
    p.armR = { ex: 1, ey: 3, hx: 1, hy: 6 - lift };
    p.eyes = i >= 2 && i <= 3 ? 'closed' : 'open';
    p.mouth = 'flat';
    p.props = [{ kind: 'book', open: false }, { kind: 'cup', at: 'R' }];
    return p;
  },
  note: (i) => {
    const p = seated();
    p.headDy = 1;
    p.eyes = 'down';
    p.armR = { ex: 1, ey: 3, hx: 2 + (i % 2), hy: 5 + ((i + 1) % 2) };
    p.props = [{ kind: 'notebook', at: 'L' }, { kind: 'pen', at: 'R' }];
    return p;
  },
  ribbonBookmark: (i) => ({ ...seated(), headDy: 1, eyes: i >= 3 ? 'happy' : 'down', props: [{ kind: 'book', open: i < 4, ribbon: true }], armR: { ex: 0, ey: 3, hx: 1 + Math.min(i, 2), hy: 5 } }),
  doze: (i) => ({ ...seated(), headDx: 1, headDy: 2, eyes: 'closed', mouth: 'flat', bob: i >= 2 ? 1 : 0, props: [{ kind: 'book', open: false }, { kind: 'z', t: i }] }),
  playPiano: (i) => {
    const p = seated();
    p.armL = { ex: 1, ey: 3, hx: 3, hy: 3 + (i % 2) };
    p.armR = { ex: -1, ey: 3, hx: -3, hy: 3 + ((i + 1) % 2) };
    p.sway = pick([0, 1, 1, 0, -1, -1, 0, 0], i);
    p.headDx = pick([0, 0, 1, 1, 0, 0, 0, 0], i);
    p.props = [{ kind: 'notes', t: i }];
    return p;
  },
};

export function poseFor(anim: AnimKey, frame: number, facing: Facing2): Pose {
  return POSES[anim](frame, facing);
}

// ---------- pixel primitives ----------

function px(c: Ctx, x: number, y: number, col: string, w = 1, h = 1): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

function line(c: Ctx, a: Pt, b: Pt, col: string, size = 1): void {
  let x0 = Math.round(a.x);
  let y0 = Math.round(a.y);
  const x1 = Math.round(b.x);
  const y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const off = Math.floor((size - 1) / 2);
  for (;;) {
    px(c, x0 - off, y0 - off, col, size, size);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
}

// ---------- skeleton ----------

interface Skel {
  hx: number;
  hy: number;
  sL: Pt;
  sR: Pt;
  eL: Pt;
  eR: Pt;
  hL: Pt;
  hR: Pt;
  waist: number;
  hip: number;
  hipL: Pt;
  hipR: Pt;
  kneeL: Pt | null;
  kneeR: Pt | null;
  footL: Pt;
  footR: Pt;
}

/** Seated, the upper body drops onto the seat (hips at y 33, ≈ 13 px above the floor). */
const SIT_DROP = 8;

function skeleton(p: Pose): Skel {
  const up = p.bob + (p.sit ? SIT_DROP : 0);
  const sy = 13 + up;
  const sL = { x: 12 + p.lean, y: sy };
  const sR = { x: 20 + p.lean, y: sy };
  const arm = (s: Pt, a: Arm) => ({ e: { x: s.x + a.ex, y: s.y + a.ey }, h: { x: s.x + a.hx, y: s.y + a.hy } });
  const L = arm(sL, p.armL);
  const R = arm(sR, p.armR);
  const hip = 25 + up;
  const hipL = { x: 14 + Math.round(p.lean / 2), y: hip };
  const hipR = { x: 18 + Math.round(p.lean / 2), y: hip };
  if (p.sit) {
    return {
      hx: 15 + p.lean + p.headDx,
      hy: 7 + up + p.headDy,
      sL,
      sR,
      eL: L.e,
      eR: R.e,
      hL: L.h,
      hR: R.h,
      waist: 21 + up,
      hip,
      hipL,
      hipR,
      kneeL: { x: 19, y: hip + 1 },
      kneeR: { x: 21, y: hip + 2 },
      footL: { x: 19, y: 44 },
      footR: { x: 21, y: 45 },
    };
  }
  return {
    hx: 15 + p.lean + p.headDx,
    hy: 7 + up + p.headDy,
    sL,
    sR,
    eL: L.e,
    eR: R.e,
    hL: L.h,
    hR: R.h,
    waist: 21 + up,
    hip,
    hipL,
    hipR,
    kneeL: null,
    kneeR: null,
    footL: { x: 14 + p.legL.dx, y: 44 - p.legL.lift },
    footR: { x: 18 + p.legR.dx, y: 45 - p.legR.lift },
  };
}

// ---------- hair ----------

interface Blob {
  x: number;
  y: number;
  r: number;
  /** Behind the body (drawn on the body layer, under the clothes). */
  back?: boolean;
}

function hairBlobs(style: HairStyle, f: Facing2, hx: number, hy: number, sway: number): Blob[] {
  const cx = hx + 1.5;
  const s = sway * 0.5;
  if (f === 'NE') {
    switch (style) {
      case 'curls':
        return [
          { x: cx, y: hy - 1, r: 5 },
          { x: cx - 1.5 + s, y: hy + 3.5, r: 4.4 },
          { x: cx + 2 + s, y: hy + 4, r: 3.8 },
          { x: cx - 1 + s, y: hy + 8, r: 3.6 },
          { x: cx + 2.5 + s, y: hy + 8, r: 2.9 },
          { x: cx + s, y: hy + 11, r: 2.8 },
        ];
      case 'long':
      case 'braids':
        return [
          { x: cx, y: hy - 1, r: 4.4 },
          { x: cx + s, y: hy + 5, r: 3.6 },
          { x: cx + s, y: hy + 9, r: 3 },
        ];
      case 'bun':
        return [
          { x: cx, y: hy - 0.5, r: 4.2 },
          { x: cx, y: hy - 4.5, r: 2.2 },
        ];
      case 'puff':
        return [{ x: cx, y: hy - 1, r: 5.4 }];
      case 'bob':
        return [
          { x: cx, y: hy - 0.5, r: 4.4 },
          { x: cx, y: hy + 2.5, r: 3.8 },
        ];
      default:
        return [{ x: cx, y: hy - 0.5, r: 4.1 }];
    }
  }
  switch (style) {
    case 'curls':
      return [
        { x: cx - 0.3, y: hy - 2, r: 4.7 },
        // the half-up ponytail: a puff of curls at the back of the crown (no taller than the crown)
        { x: cx - 3.9, y: hy - 3.4, r: 2.5 },
        { x: cx - 3.6, y: hy + 0.5, r: 3.2 },
        { x: cx - 3.8 + s, y: hy + 4.2, r: 3, back: true },
        { x: cx - 3.4 + s, y: hy + 7.8, r: 2.7, back: true },
        { x: cx - 1.2 + s, y: hy + 9.5, r: 2.2, back: true },
        { x: cx + 3.7, y: hy + 1.2, r: 1.9 },
        { x: cx + 3.9 + s, y: hy + 4.6, r: 1.9 },
        { x: cx + 3.5 + s, y: hy + 7.8, r: 1.7 },
      ];
    case 'long':
      return [
        { x: cx - 0.3, y: hy - 2, r: 4.3 },
        { x: cx - 3.3, y: hy + 2, r: 2.4 },
        { x: cx - 3.4 + s, y: hy + 6.5, r: 2.4, back: true },
        { x: cx + 3.2, y: hy + 3, r: 1.7 },
        { x: cx + 3.2 + s, y: hy + 6.5, r: 1.7 },
      ];
    case 'braids':
      return [
        { x: cx - 0.3, y: hy - 2, r: 4.3 },
        { x: cx - 3.4, y: hy + 3, r: 1.6 },
        { x: cx - 3.4 + s, y: hy + 6, r: 1.4 },
        { x: cx + 3.3, y: hy + 3, r: 1.5 },
        { x: cx + 3.3 + s, y: hy + 6, r: 1.4 },
        { x: cx + 3.3 + s, y: hy + 8.5, r: 1.2 },
      ];
    case 'bun':
      return [
        { x: cx - 0.5, y: hy - 2, r: 4 },
        { x: cx - 2.5, y: hy - 5, r: 2.2 },
      ];
    case 'puff':
      return [
        { x: cx - 0.3, y: hy - 2, r: 5.2 },
        { x: cx - 3.8, y: hy + 1, r: 2.8 },
      ];
    case 'bob':
      return [
        { x: cx - 0.3, y: hy - 2, r: 4.3 },
        { x: cx - 3, y: hy + 2.5, r: 2.6 },
        { x: cx + 3.2, y: hy + 2.5, r: 2 },
      ];
    case 'cap':
    case 'short':
      return [
        { x: cx - 0.6, y: hy - 2, r: 4 },
        { x: cx - 3, y: hy + 0.5, r: 2 },
      ];
  }
}

/** Mini ringlets for curls; soft bands for straighter hair. Above `crown` the ringlets catch the light. */
function hairTone(look: Look, x: number, y: number, crown: number): string {
  const H = look.hair;
  if (look.hairStyle === 'curls' || look.hairStyle === 'puff') {
    const row = Math.round(y / 2.4);
    const off = row % 2 ? 1.25 : 0;
    const col = Math.round((x - off) / 2.5);
    const dx = x + 0.5 - (col * 2.5 + off);
    const dy = y + 0.5 - row * 2.4;
    const d = Math.hypot(dx, dy);
    if (d > 1.25) return H.deep;
    if (dy < -0.2 && dx < 0.6) return H.shine && y < crown ? H.shine : H.light;
    return H.base;
  }
  if ((x * 3 + y) % 7 === 0) return H.light;
  if ((x + y * 5) % 9 === 0) return H.shade;
  return H.base;
}

// ---------- drawing ----------

function drawFace(c: Ctx, look: Look, p: Pose, k: Skel): void {
  const S = look.skin;
  const cx = k.hx + 1.5;
  const cy = k.hy;
  for (let y = Math.floor(cy - 4); y <= Math.ceil(cy + 4); y++) {
    for (let x = Math.floor(cx - 4); x <= Math.ceil(cx + 4); x++) {
      if (!inEllipse(x, y, cx, cy, 3.2, 3.8)) continue;
      px(c, x, y, x <= cx - 2.2 ? S.shade : x >= cx + 2 && y < cy ? S.light : S.base);
    }
  }
  const E = look.eye ?? '#2A1A1E';
  const ey = Math.round(cy);
  const ex = Math.round(cx);
  switch (p.eyes) {
    case 'open':
      px(c, ex - 1, ey, E);
      px(c, ex + 1, ey, E);
      break;
    case 'down':
      px(c, ex - 1, ey + 1, E);
      px(c, ex + 1, ey + 1, E);
      break;
    case 'closed':
      px(c, ex - 2, ey + 1, E, 2, 1);
      px(c, ex + 1, ey + 1, E, 2, 1);
      break;
    case 'happy':
      px(c, ex - 1, ey - 1, E);
      px(c, ex + 1, ey - 1, E);
      break;
  }
  px(c, ex - 1, ey - 1 - (p.eyes === 'happy' ? 1 : 0), look.hair.shade);
  px(c, ex + 1, ey - 1 - (p.eyes === 'happy' ? 1 : 0), look.hair.shade);
  px(c, ex + 2, ey + 1, S.shade);
  px(c, ex + 2, ey + 2, '#E39B8B');
  px(c, ex - 2, ey + 2, '#E39B8B');
  if (p.mouth === 'open') px(c, ex, ey + 3, '#7A2E34', 2, 1);
  else px(c, ex, ey + 3, p.mouth === 'smile' ? '#B05A5A' : '#9A5A50', 2, 1);
  if (look.glasses) {
    px(c, ex - 2, ey - 1, '#2A2A30', 2, 2);
    px(c, ex + 1, ey - 1, '#2A2A30', 2, 2);
    px(c, ex - 1, ey - 1, '#2A2A30', 2, 1);
  }
  if (look.beard) {
    for (let x = ex - 2; x <= ex + 3; x++) px(c, x, ey + 2 + (x === ex - 2 || x === ex + 3 ? 0 : 1), look.beard, 1, 2);
    px(c, ex, ey + 3, '#7A3A34', 2, 1);
  }
}

function drawHair(c: Ctx, look: Look, p: Pose, k: Skel, f: Facing2, back: boolean): void {
  const blobs = hairBlobs(look.hairStyle, f, k.hx, k.hy, p.sway).filter((b) => !!b.back === back);
  if (!blobs.length) return;
  const cx = k.hx + 1.5;
  const cy = k.hy;
  for (let y = Math.floor(cy - 10); y <= Math.ceil(cy + 14); y++) {
    for (let x = Math.floor(cx - 10); x <= Math.ceil(cx + 10); x++) {
      if (!blobs.some((b) => (x + 0.5 - b.x) ** 2 + (y + 0.5 - b.y) ** 2 <= b.r * b.r)) continue;
      // The face stays clear below the hairline (front views).
      if (f === 'SE' && inEllipse(x, y, cx, cy, 2.9, 3.7) && y >= cy - 1.5) continue;
      px(c, x, y, hairTone(look, x, y, cy - 1));
    }
  }
  if (look.hairStyle === 'cap' && !back) {
    const top = cy - 5;
    for (let x = Math.floor(cx - 4); x <= Math.ceil(cx + 3); x++) px(c, x, top + (x < cx - 3 || x > cx + 2 ? 1 : 0), '#3A3A42', 1, 3);
    if (f === 'SE') px(c, cx + 2, top + 2, '#2A2A30', 4, 1);
  }
}

function drawLegsSkin(c: Ctx, look: Look, k: Skel): void {
  // Only seen below a skirt.
  if (look.bottoms !== 'pleated' && look.bottoms !== 'skirt') return;
  const col = look.skin.shade;
  for (const [hip, knee, foot] of [
    [k.hipL, k.kneeL, k.footL],
    [k.hipR, k.kneeR, k.footR],
  ] as [Pt, Pt | null, Pt][]) {
    if (knee) {
      line(c, hip, knee, col, 2);
      line(c, knee, foot, col, 2);
    } else line(c, hip, foot, col, 2);
  }
}

function drawBottoms(c: Ctx, look: Look, p: Pose, k: Skel, f: Facing2): void {
  const T = look.bottomTones;
  const legs: [Pt, Pt | null, Pt][] = [
    [k.hipL, k.kneeL, k.footL],
    [k.hipR, k.kneeR, k.footR],
  ];
  if (look.bottoms === 'jeans' || look.bottoms === 'trousers' || look.bottoms === 'wideLeg') {
    const w = look.bottoms === 'wideLeg' ? 4 : 3;
    // hips and waistband
    fillPoly(c, [{ x: 13, y: k.waist }, { x: 20, y: k.waist }, { x: 20.5, y: k.hip + 2 }, { x: 12.5, y: k.hip + 2 }], T.base);
    px(c, 13, k.waist, T.shade, 7, 1);
    if (f === 'SE') px(c, 17, k.waist, '#C9A04A');
    // the blouse is tucked in to the row above, so the belt shows just under it
    if (look.belt) {
      px(c, 13, k.waist + 1, look.belt, 7, 1);
      if (f === 'SE') px(c, 16, k.waist + 1, '#8C7A5A');
    }
    legs.forEach(([hip, knee, foot], i) => {
      const col = i === 0 ? T.shade : T.base;
      const end = { x: foot.x, y: foot.y - 1 };
      if (knee) {
        line(c, hip, knee, col, w);
        line(c, knee, end, col, w);
      } else line(c, hip, end, col, w);
      px(c, end.x - 1, end.y, T.light, w, 1);
    });
    if (look.bottoms === 'jeans') {
      // seams and, from behind, the back pockets
      if (f === 'NE') {
        px(c, 13, k.hip, T.shade, 3, 2);
        px(c, 17, k.hip, T.shade, 3, 2);
      } else if (!p.sit) px(c, 16, k.hip + 1, T.shade, 1, 4);
    }
    return;
  }
  // skirts: a pleated A-line to mid-calf
  const hem = p.sit ? k.hip + 4 : look.bottoms === 'pleated' ? 37 + Math.min(0, p.bob) : 34;
  const top = k.waist;
  for (let y = top; y <= hem; y++) {
    const t = (y - top) / Math.max(1, hem - top);
    const l = Math.round(13 - 2.5 * t);
    const r = Math.round(20 + 2.5 * t + (p.sit ? 4 * t : 0));
    for (let x = l; x <= r; x++) {
      const pleat = ((x - l) % 3 === 0 && y > top + 2) || x === l;
      px(c, x, y, pleat ? T.shade : y === hem ? T.light : T.base);
    }
  }
  px(c, 13, top, T.shade, 8, 1);
}

function drawBlouse(c: Ctx, look: Look, p: Pose, k: Skel, f: Facing2): void {
  const T = look.top;
  const sy = k.sL.y;
  const elbow = look.sleeve === 'elbow';
  // sleeves first for the arm behind
  const sleeve = (s: Pt, e: Pt, h: Pt, back: boolean) => {
    const col = back ? T.shade : T.base;
    line(c, s, e, col, 2);
    // A short sleeve leaves the forearm bare (same pixels either way, so the baked outline fits every blouse).
    line(c, e, { x: h.x + (h.x > e.x ? -1 : h.x < e.x ? 1 : 0), y: h.y - 1 }, elbow ? (back ? look.skin.shade : look.skin.base) : col, 2);
    if (look.sleeve !== 'long') {
      px(c, s.x - 1, s.y - 1, back ? T.shade : T.light, 3, 2);
      px(c, s.x - 1, s.y + 1, T.shade, 3, 1);
    }
    // the gathered band: at the elbow on a short sleeve, else the wrist
    if (elbow) px(c, e.x, e.y, back ? T.shade : T.light, 2, 1);
    else px(c, h.x - 1, h.y - 1, T.light, 2, 1);
  };
  sleeve(k.sL, k.eL, k.hL, true);
  // torso: shoulders to waist
  fillPoly(c, [{ x: 12 + p.lean, y: sy }, { x: 21 + p.lean, y: sy }, { x: 20, y: k.waist + 1 }, { x: 13, y: k.waist + 1 }], T.base);
  for (let y = sy; y <= k.waist; y++) {
    px(c, 12 + p.lean + Math.round((y - sy) * 0.1), y, T.shade);
    px(c, 20 + p.lean - Math.round((y - sy) * 0.1), y, f === 'SE' ? T.light : T.shade);
  }
  if (f === 'SE') {
    if (T.collar === 'peterPan') drawPeterPan(c, T, k.hx, sy, k.waist);
    else {
      // a ruffled neckline, a placket with tiny buttons
      px(c, k.hx + 1, sy - 1, T.light, 3, 1);
      px(c, k.hx, sy, T.light, 1, 1);
      px(c, k.hx + 3, sy, T.light, 1, 1);
      for (let y = sy + 2; y < k.waist; y += 2) px(c, k.hx + 2, y, T.trim);
    }
    if (T.detail === 'embroidery') drawEmbroidery(c, T, k.hx, sy);
  } else {
    px(c, 14, sy + 3, T.shade, 5, 1);
  }
  sleeve(k.sR, k.eR, k.hR, false);
}

/** Two rounded collar lobes meeting under the chin, and a soft ruffle down the placket. */
function drawPeterPan(c: Ctx, T: Look['top'], hx: number, sy: number, waist: number): void {
  const collar = hexMix(T.light, '#FFFFFF', 0.5);
  px(c, hx + 1, sy - 1, collar, 3, 1);
  px(c, hx - 1, sy, collar, 3, 1);
  px(c, hx + 2, sy, collar, 3, 1);
  px(c, hx - 1, sy + 1, T.shade);
  px(c, hx, sy + 1, collar);
  px(c, hx + 3, sy + 1, collar);
  px(c, hx + 4, sy + 1, T.shade);
  px(c, hx + 1, sy + 2, T.light, 1, waist - sy - 2);
  for (let y = sy + 3; y < waist; y += 2) px(c, hx + 2, y, T.shade);
}

/** A leaf sprig either side of the placket, in the trim colour. */
function drawEmbroidery(c: Ctx, T: Look['top'], hx: number, sy: number): void {
  px(c, hx - 1, sy + 4, T.trim);
  px(c, hx - 2, sy + 3, T.trim);
  px(c, hx + 4, sy + 4, T.trim);
  px(c, hx + 5, sy + 3, T.trim);
}

function drawApron(c: Ctx, p: Pose, k: Skel, f: Facing2): void {
  const L = { base: '#EFE6D2', shade: '#CDBE9C', dark: '#A8987A' };
  if (p.apron !== 'on') return;
  const sy = k.sL.y;
  if (f === 'NE') {
    px(c, 12, k.waist, L.dark, 9, 1);
    px(c, 15, k.waist - 1, L.base, 3, 3);
    px(c, 16, k.waist + 1, L.shade, 1, 3);
    return;
  }
  line(c, { x: k.hx + 1, y: sy - 1 }, { x: 15, y: sy + 2 }, L.dark);
  line(c, { x: k.hx + 3, y: sy - 1 }, { x: 18, y: sy + 2 }, L.dark);
  fillPoly(c, [{ x: 14.5, y: sy + 2 }, { x: 19, y: sy + 2 }, { x: 19.5, y: k.waist }, { x: 14, y: k.waist }], L.base);
  const hem = p.sit ? k.hip + 3 : k.hip + 7;
  fillPoly(c, [{ x: 13, y: k.waist }, { x: 20.5, y: k.waist }, { x: 21 + (p.sit ? 3 : 0), y: hem }, { x: 12.5, y: hem }], L.base);
  px(c, 13, k.waist, L.dark, 8, 1);
  px(c, 13, k.waist + 1, L.shade, 1, hem - k.waist);
  px(c, 16, sy + 4, '#C9A04A');
}

function drawShoes(c: Ctx, look: Look, k: Skel, f: Facing2): void {
  const feet = [k.footL, k.footR];
  feet.forEach((ft, i) => {
    const x = Math.round(ft.x);
    const y = Math.round(ft.y);
    if (look.shoes === 'sneakers') {
      px(c, x - 1, y, '#F2F0EA', 4, 2);
      px(c, x - 1, y + 1, '#B8B4AC', 4, 1);
      if (f === 'SE') px(c, x + 1, y, '#D8D4CC');
      if (i === 0) px(c, x - 1, y, '#E2DED6');
    } else if (look.shoes === 'flats') {
      // burgundy ballet flats, the top of the foot showing above the toe
      px(c, x - 1, y, '#6A1E34', 4, 2);
      px(c, x - 1, y + 1, '#45101F', 4, 1);
      if (f === 'SE') {
        px(c, x + 1, y, look.skin.base);
        px(c, x + 2, y, '#94405A');
      }
    } else if (look.shoes === 'tstrap') {
      px(c, x - 1, y, '#4A2328', 4, 2);
      px(c, x, y - 1, '#7A3A40', 2, 1);
    } else {
      px(c, x - 1, y - 1, '#3A2420', 4, 3);
      px(c, x - 1, y - 1, '#5A3A30', 4, 1);
    }
  });
}

function drawHands(c: Ctx, look: Look, k: Skel): void {
  for (const h of [k.hL, k.hR]) {
    px(c, h.x - 1, h.y - 1, look.skin.base, 2, 2);
    px(c, h.x - 1, h.y, look.skin.shade);
  }
}

function drawProps(c: Ctx, p: Pose, k: Skel): void {
  const at = (side: 'L' | 'R') => (side === 'L' ? k.hL : k.hR);
  for (const pr of p.props) {
    switch (pr.kind) {
      case 'cloth': {
        const h = at(pr.at);
        // the sage-green cleaning cloth
        px(c, h.x - 1, h.y + 1, '#9AA882', 3, 1);
        px(c, h.x, h.y + 2, '#6E7C5A', 2, 1);
        break;
      }
      case 'cup': {
        // an ivory mug of black coffee
        const h = at(pr.at);
        px(c, h.x - 1, h.y - 3, '#F2EDE4', 3, 3);
        px(c, h.x - 1, h.y - 3, '#6B4226', 3, 1);
        px(c, h.x - 1, h.y - 1, '#D8CBAE', 3, 1);
        break;
      }
      case 'latte': {
        // a latte on its saucer, like the cups set down on the tables
        const h = at(pr.at);
        px(c, h.x - 1, h.y - 3, '#F2EDE4', 3, 2);
        px(c, h.x - 1, h.y - 3, '#C99A6A', 3, 1);
        px(c, h.x - 2, h.y - 1, '#D8CBAE', 5, 1);
        break;
      }
      case 'jug': {
        const h = at(pr.at);
        px(c, h.x - 1, h.y - 3, '#C9CED4', 2, 3);
        px(c, h.x + 1, h.y - 3, '#9AA0A8');
        break;
      }
      case 'pen': {
        const h = at(pr.at);
        px(c, h.x, h.y - 3, '#2A2A30', 1, 3);
        break;
      }
      case 'notebook': {
        const h = at(pr.at);
        px(c, h.x - 2, h.y - 3, '#F4ECD8', 4, 4);
        px(c, h.x - 2, h.y - 3, '#C9A04A', 1, 4);
        break;
      }
      case 'apron': {
        const h = at(pr.at);
        px(c, h.x - 1, h.y, '#EFE6D2', 4, 6);
        px(c, h.x - 1, h.y + 5, '#CDBE9C', 4, 1);
        break;
      }
      case 'book': {
        const bx = Math.round((k.hL.x + k.hR.x) / 2) - 3;
        const by = Math.round((k.hL.y + k.hR.y) / 2) - 2;
        if (pr.open) {
          px(c, bx, by + 2, '#7A2E35', 7, 1);
          px(c, bx, by, '#F4ECD8', 3, 2);
          px(c, bx + 4, by, '#F4ECD8', 3, 2);
          px(c, bx + 3, by, '#D8CBAE', 1, 2);
          if (pr.turn && pr.turn > 0 && pr.turn < 1) px(c, bx + 3 + Math.round(pr.turn * 3), by - 1, '#FFFFFF', 1, 2);
        } else {
          px(c, bx + 1, by + 1, '#7A2E35', 5, 2);
          px(c, bx + 1, by + 1, '#9A3E45', 5, 1);
        }
        if (pr.ribbon) px(c, bx + 4, by + 2, '#C93A3A', 1, 4);
        break;
      }
      case 'steam':
        for (let k2 = 0; k2 < 3; k2++) px(c, k.hR.x + ((k2 + pr.t) % 2), k.hR.y - 5 - k2 * 2, 'rgba(242,237,228,0.7)');
        break;
      case 'pour':
        px(c, k.hR.x - 2, k.hR.y - 2, '#C99A6A', 1, 2);
        break;
      case 'notes':
        for (const [dx, ph] of [
          [8, 0],
          [12, 4],
        ]) {
          const t = (pr.t + ph) % 8;
          const x = k.hx + dx - (t % 3);
          const y = k.hy + 4 - t * 1.5;
          px(c, x, y + 2, '#E3C16F', 2, 1);
          px(c, x + 1, y, '#E3C16F', 1, 2);
        }
        break;
      case 'z':
        for (let n = 0; n <= (pr.t >= 2 ? 1 : 0); n++) {
          const x = k.hx + 6 + n * 3;
          const y = k.hy - 2 - n * 3 - (pr.t % 2);
          px(c, x, y, '#F2EDE4', 3, 1);
          px(c, x + 1, y + 1, '#F2EDE4');
          px(c, x, y + 2, '#F2EDE4', 3, 1);
        }
        break;
    }
  }
}

function drawPearls(c: Ctx, k: Skel): void {
  const y = k.sL.y;
  for (let x = k.hx; x <= k.hx + 3; x++) px(c, x, y + 1 + (x === k.hx || x === k.hx + 3 ? 0 : 1), (x % 2 ? '#F2EDE4' : '#C8C0B0'));
}

/** Draws one layer of one frame (or every layer when `layer` is 'all'). */
export function drawFigure(c: Ctx, layer: LayerName | 'all', look: Look, p: Pose, f: Facing2): void {
  const k = skeleton(p);
  const want = (l: LayerName) => layer === 'all' || layer === l;
  if (want('body')) {
    drawHair(c, look, p, k, f, true);
    drawLegsSkin(c, look, k);
    px(c, k.hx + 1, k.hy + 3, look.skin.shade, 2, k.sL.y - k.hy - 2);
    if (f === 'SE') drawFace(c, look, p, k);
  }
  if (want('bottoms')) drawBottoms(c, look, p, k, f);
  if (want('blouse')) drawBlouse(c, look, p, k, f);
  if (want('apron') && look.apron) drawApron(c, p, k, f);
  if (want('hair')) drawHair(c, look, p, k, f, false);
  if (want('accessories')) {
    drawShoes(c, look, k, f);
    if (f === 'SE' && look.pearls) drawPearls(c, k);
    drawHands(c, look, k);
    drawProps(c, p, k);
  }
}

// ---------- sheets ----------

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  return [cv, c];
}

function eachFrame(fn: (key: AnimKey, facing: Facing2, frame: number, ox: number, oy: number) => void): void {
  ROWS.forEach((r, row) => {
    for (let f = 0; f < ANIMS[r.key].frames; f++) fn(r.key, r.facing, f, f * FRAME_W, row * FRAME_H);
  });
}

function clipFrame(c: Ctx, ox: number, oy: number, draw: () => void): void {
  c.save();
  c.translate(ox, oy);
  c.beginPath();
  c.rect(0, 0, FRAME_W, FRAME_H);
  c.clip();
  draw();
  c.restore();
}

/** One layer for every frame of every animation (Roxy). */
export function renderLayerSheet(layer: LayerName, look: Look): HTMLCanvasElement {
  const [cv, c] = makeCanvas(SHEET_COLS * FRAME_W, SHEET_ROWS * FRAME_H);
  eachFrame((key, facing, frame, ox, oy) => clipFrame(c, ox, oy, () => drawFigure(c, layer, look, poseFor(key, frame, facing), facing)));
  return cv;
}

/**
 * All of Roxy's layer sheets for a look, with the outline (a darker shade of whatever it
 * touches) baked into the body sheet so it sits under every layer.
 */
export function renderRoxySheets(look: Look): Record<LayerName, HTMLCanvasElement> {
  const sheets = {} as Record<LayerName, HTMLCanvasElement>;
  for (const l of LAYERS) sheets[l] = renderLayerSheet(l, look);
  sheets.body = withOutline(sheets, look);
  return sheets;
}

/** Composites every layer frame by frame, outlines it, and keeps only the outline + body. */
function withOutline(sheets: Record<LayerName, HTMLCanvasElement>, look: Look): HTMLCanvasElement {
  const W = sheets.body.width;
  const H = sheets.body.height;
  const [all, ac] = makeCanvas(W, H);
  for (const l of LAYERS) if (l !== 'apron' || look.apron) ac.drawImage(sheets[l], 0, 0);
  const before = ac.getImageData(0, 0, W, H).data.slice();
  // Outline per frame so neighbouring frames never bleed into each other.
  eachFrame((_k, _f, _fr, ox, oy) => {
    const [fc, fctx] = makeCanvas(FRAME_W + 2, FRAME_H + 2);
    fctx.drawImage(all, ox, oy, FRAME_W, FRAME_H, 1, 1, FRAME_W, FRAME_H);
    outlineTinted(fctx, fc.width, fc.height, 0.62);
    ac.clearRect(ox, oy, FRAME_W, FRAME_H);
    ac.drawImage(fc, 1, 1, FRAME_W, FRAME_H, ox, oy, FRAME_W, FRAME_H);
  });
  const after = ac.getImageData(0, 0, W, H);
  const [out, oc] = makeCanvas(W, H);
  const outData = oc.createImageData(W, H);
  for (let i = 0; i < before.length; i += 4) {
    // outline pixels: empty before, filled after
    if (before[i + 3] === 0 && after.data[i + 3] > 0) {
      outData.data[i] = after.data[i];
      outData.data[i + 1] = after.data[i + 1];
      outData.data[i + 2] = after.data[i + 2];
      outData.data[i + 3] = 255;
    }
  }
  oc.putImageData(outData, 0, 0);
  oc.drawImage(sheets.body, 0, 0);
  return out;
}

/** One composited, outlined frame — for the wardrobe preview and the dev sprite viewer. */
export function renderComposite(anim: AnimKey, frame: number, facing: Facing2, look: Look): HTMLCanvasElement {
  const [cv, c] = makeCanvas(FRAME_W + 2, FRAME_H + 2);
  c.translate(1, 1);
  drawFigure(c, 'all', look, poseFor(anim, frame, facing), facing);
  c.setTransform(1, 0, 0, 1, 0, 0);
  outlineTinted(c, cv.width, cv.height, 0.62);
  const [out, oc] = makeCanvas(FRAME_W, FRAME_H);
  oc.drawImage(cv, 1, 1, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  return out;
}

// ---------- NPC sheets ----------

/** NPC sheet columns: 0 stand, 1–6 walk, 7 sit, 8–9 type. Row 0 = SE, row 1 = NE. */
export const NPC_COLS = 10;

export function renderNpcSheet(look: Look): HTMLCanvasElement {
  const [cv, c] = makeCanvas(NPC_COLS * FRAME_W, 2 * FRAME_H);
  (['SE', 'NE'] as Facing2[]).forEach((facing, row) => {
    const poses: Pose[] = [
      poseFor('idle', 0, facing),
      ...[0, 1, 2, 3, 4, 5].map((i) => poseFor('walk', i, facing)),
      { ...seated(), apron: 'none' as const },
      ...[0, 1].map((i) => ({ ...seated(), apron: 'none' as const, armL: { ex: 2, ey: 3, hx: 5, hy: 4 + i }, armR: { ex: 1, ey: 3, hx: 2, hy: 5 - i }, eyes: 'down' as const })),
    ];
    poses.forEach((p, col) => {
      const [fc, fctx] = makeCanvas(FRAME_W + 2, FRAME_H + 2);
      fctx.translate(1, 1);
      drawFigure(fctx, 'all', { ...look, apron: false }, { ...p, apron: 'none' }, facing);
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      outlineTinted(fctx, fc.width, fc.height, 0.62);
      c.drawImage(fc, 1, 1, FRAME_W, FRAME_H, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H);
    });
  });
  return cv;
}
