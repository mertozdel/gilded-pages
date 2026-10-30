/**
 * Café Machorn placeholder art, isometric, in the 2026 palette sampled from the reference:
 * mauve walls, cream tiles on a dark slab, navy banquette, honey oak and walnut, brick-red
 * armchairs, sage cups, steel, soft black, cool window light and warm lamp glow.
 *
 * Tilesets and furniture sprites are generated here and registered under the names the
 * Tiled map (src/content/rooms/cafe.tmj) uses, so real art can replace any one of them.
 */
import type Phaser from 'phaser';
import { IsoPainter, fillPoly, hexMix, isoSprite, makeCanvas, px, shade, type Ctx, type IsoSprite } from './iso';

export const PAL26 = {
  wall: '#A38C88',
  floor: '#E9DFCC',
  slab: '#4A2F27',
  navy: '#2E4268',
  oak: '#C99A5E',
  walnut: '#6B4C3B',
  brick: '#A9443B',
  leaf: '#4E8B3E',
  sage: '#BCCB9F',
  steel: '#B9C0C6',
  black: '#1F1F24',
  sky: '#DCE3E8',
  glow: '#F2D59B',
  beige: '#CDBA9C',
};

/** Wall height in px; wall tiles are 32 × (16 + WALL_H). */
export const WALL_H = 90;
/** Floor tiles hang a 10 px slab edge below the diamond. */
export const FLOOR_TILE_H = 26;

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type DayTime = 'morning' | 'afternoon' | 'evening' | 'night';

export function seasonOf(d = new Date()): Season {
  const m = d.getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

export function dayTimeOf(d = new Date()): DayTime {
  const h = d.getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ellipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: string): void {
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    if (half > 0 || Math.abs(y) < ry) px(c, cx - half, cy + y, col, half * 2 + 1, 1);
  }
}

// ---------- floor ----------

/** Five 32×26 tiles: plain, alternate, front-left slab edge, front-right edge, front corner. */
export function floorTileset(): HTMLCanvasElement {
  const [cv, c] = makeCanvas(32 * 5, FLOOR_TILE_H);
  const diamond = (o: number, col: string, inset: number) =>
    fillPoly(c, [{ x: o + 16, y: inset }, { x: o + 32 - inset * 2, y: 8 }, { x: o + 16, y: 16 - inset }, { x: o + inset * 2, y: 8 }], col);
  for (let i = 0; i < 5; i++) {
    const o = i * 32;
    diamond(o, '#CDBFA6', 0);
    diamond(o, i === 1 ? '#E3D8C3' : PAL26.floor, 1);
    px(c, o + 13, 3, '#F4EDDF', 6, 1);
    px(c, o + 11, 4, '#F4EDDF', 3, 1);
    if (i === 2 || i === 4) {
      fillPoly(c, [{ x: o, y: 8 }, { x: o + 16, y: 16 }, { x: o + 16, y: 26 }, { x: o, y: 18 }], '#5E3D33');
      for (let x = 0; x < 16; x++) px(c, o + x, 8 + Math.floor((x + 1) / 2), '#7A5446');
    }
    if (i === 3 || i === 4) {
      fillPoly(c, [{ x: o + 16, y: 16 }, { x: o + 32, y: 8 }, { x: o + 32, y: 18 }, { x: o + 16, y: 26 }], PAL26.slab);
      for (let x = 16; x < 32; x++) px(c, o + x, 16 - Math.floor((x - 16 + 1) / 2), '#6A4538');
    }
  }
  return cv;
}

// ---------- walls (flat art, sliced into wall tiles) ----------

function plaster(c: Ctx, x: number, w: number, seed: number): void {
  px(c, x, 0, PAL26.wall, w, WALL_H);
  const r = rng(seed);
  for (let i = 0; i < w * 3; i++) px(c, x + r() * w, 4 + r() * (WALL_H - 8), r() > 0.5 ? '#AA9490' : '#9C8581', 1 + Math.floor(r() * 2), 1);
  for (let y = 3; y < 18; y++) px(c, x, y, `rgba(60,40,36,${(0.12 * (18 - y)) / 15})`, w, 1);
}

function wallCap(c: Ctx, w: number): void {
  px(c, 0, 0, PAL26.slab, w, 2);
  px(c, 0, 2, '#6A4538', w, 1);
}

/** Bubble letters for the mural, rasterised and hard-edged, with a dark outline. */
function bubbleText(c: Ctx, text: string, x: number, y: number, maxW: number, size: number): void {
  const [, tc] = makeCanvas(maxW, size + 6);
  tc.fillStyle = '#fff';
  tc.strokeStyle = '#fff';
  tc.lineWidth = 1.5;
  tc.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  const fit = maxW / tc.measureText(text).width;
  if (fit < 1) tc.font = `900 ${Math.floor(size * fit)}px Impact, "Arial Black", sans-serif`;
  tc.textBaseline = 'middle';
  tc.fillText(text, 1, (size + 6) / 2);
  tc.strokeText(text, 1, (size + 6) / 2);
  const d = tc.getImageData(0, 0, maxW, size + 6).data;
  const ink = (a: number, b: number) => a >= 0 && b >= 0 && a < maxW && b < size + 6 && d[(b * maxW + a) * 4 + 3] > 90;
  for (let b = 0; b < size + 6; b++) {
    for (let a = 0; a < maxW; a++) {
      if (ink(a, b)) px(c, x + a, y + b, ink(a, b - 1) ? (ink(a + 1, b + 1) ? '#9FD0EA' : '#5A8AC0') : '#EAF7FD');
      else if (ink(a - 1, b) || ink(a + 1, b) || ink(a, b - 1) || ink(a, b + 1)) px(c, x + a, y + b, '#1E2A44');
    }
  }
}

/** The back wall (u = 0 plane), left to right from the back corner: mural, frame, apron hook. */
function backWallFlat(V: number): HTMLCanvasElement {
  const W = V * 16;
  const [cv, c] = makeCanvas(W, WALL_H);
  plaster(c, 0, W, 3);
  // track-light rail with spotlights washing the mural
  px(c, 4, 7, PAL26.black, W - 34, 2);
  for (const a of [18, 42, 66, 88]) {
    px(c, a, 9, '#2B2B30', 3, 3);
    px(c, a + 1, 12, PAL26.glow);
    for (let y = 13; y < 40; y++) {
      const half = Math.round((y - 13) * 0.45);
      px(c, a + 1 - half, y, `rgba(242,213,155,${(0.16 * (40 - y)) / 27})`, half * 2 + 1, 1);
    }
  }
  // the graffiti mural: colour bursts, "Café Machorn" in bubble letters, a hummingbird
  const mx = 8;
  const my = 16;
  const mw = 84;
  const mh = 40;
  px(c, mx, my, '#F0E2C8', mw, mh);
  const r = rng(41);
  const bursts = ['#E8823A', '#C93A3A', '#E8C23A', '#3E9A5A', '#3A6AB0', '#8A4AA8', '#E87AA8'];
  for (let i = 0; i < 260; i++) {
    const x = r() * mw;
    px(c, mx + x, my + r() * mh, bursts[Math.floor((x / mw) * bursts.length + r() * 1.6) % bursts.length], 2 + r() * 4, 1 + r() * 3);
  }
  bubbleText(c, 'Café', mx + 3, my + 2, 34, 14);
  bubbleText(c, 'Machorn', mx + 3, my + 18, 56, 15);
  const bx = mx + 70;
  const by = my + 16;
  px(c, bx - 4, by, '#3E9A5A', 8, 3);
  px(c, bx - 7, by + 2, '#2E6A8A', 4, 2);
  px(c, bx + 3, by - 2, '#8A4AA8', 3, 3);
  px(c, bx + 4, by - 1, '#FFFFFF');
  px(c, bx + 6, by - 1, '#2B2B2E', 6, 1);
  px(c, bx - 2, by - 6, '#5AC8A0', 2, 6);
  px(c, bx, by - 9, '#8A4AA8', 2, 8);
  px(c, bx - 10, by + 4, '#2E6A8A', 5, 1);
  c.strokeStyle = '#3A2A26';
  c.strokeRect(mx - 0.5, my - 0.5, mw + 1, mh + 1);
  // a small framed photo and the apron hook
  px(c, 97, 22, PAL26.walnut, 11, 13);
  px(c, 98, 23, '#E8DCC0', 9, 11);
  px(c, 99, 28, '#7A9AB0', 7, 5);
  px(c, 101, 25, '#C9787A', 3, 3);
  px(c, 110, 40, '#C9A14A', 2, 2);
  px(c, 111, 42, '#C9A14A', 1, 3);
  // baseboard, cap, the cut end of the wall at the front
  px(c, 0, WALL_H - 4, PAL26.walnut, W, 4);
  wallCap(c, W);
  px(c, W - 2, 0, PAL26.slab, 2, WALL_H);
  return cv;
}

/** The view through the glass: sky by time of day, trees by season, the street below. */
function outside(c: Ctx, x0: number, w: number, y0: number, h: number, time: DayTime, season: Season): void {
  const sky = { morning: ['#DCE3E8', '#C9D6E0'], afternoon: ['#E6E2D6', '#D8D2C2'], evening: ['#E8B48C', '#B27C8E'], night: ['#1E2A44', '#2A3658'] }[time];
  for (let y = 0; y < h; y++) px(c, x0, y0 + y, y < h * 0.4 ? sky[0] : sky[1], w, 1);
  const r = rng(77);
  // far buildings
  for (let x = 0; x < w; ) {
    const bw = 10 + Math.floor(r() * 14);
    const top = Math.floor(h * (0.28 + r() * 0.2));
    const tone = time === 'night' ? '#141C30' : time === 'evening' ? '#8A6A78' : '#B8BEC6';
    px(c, x0 + x, y0 + top, tone, bw, h * 0.75 - top);
    for (let wy = top + 4; wy < h * 0.7; wy += 6) {
      for (let wx = x + 2; wx < x + bw - 3; wx += 5) {
        const lit = time === 'night' || time === 'evening' ? r() > 0.4 : false;
        px(c, x0 + wx, y0 + wy, lit ? PAL26.glow : time === 'night' ? '#1E2A44' : '#A4ACB6', 2, 3);
      }
    }
    x += bw;
  }
  // ground: snow, or a pavement with a strip of grass
  const ground = season === 'winter' ? '#EEF2F6' : season === 'autumn' ? '#9A8E70' : '#7FA060';
  px(c, x0, y0 + h * 0.75, time === 'night' ? '#3A3E4A' : '#A8A6A0', w, h * 0.08);
  px(c, x0, y0 + h * 0.83, time === 'night' ? hexMix(ground, '#000000', 0.55) : ground, w, h * 0.17);
  // trees
  const canopy = { winter: null, spring: ['#E8AABE', '#F2C8D4'], summer: ['#4E8B3E', '#6AA858'], autumn: ['#C8642E', '#E0A040'] }[season];
  for (const tx of [0.12, 0.42, 0.7, 0.93]) {
    const x = x0 + Math.floor(w * tx);
    const base = y0 + Math.floor(h * 0.86);
    const top = y0 + Math.floor(h * 0.18);
    const trunk = time === 'night' ? '#2A2228' : '#5A4A40';
    px(c, x, top + 8, trunk, 2, base - top - 8);
    for (let k = 0; k < 5; k++) {
      const y = top + 12 + k * 6;
      const dir = k % 2 ? 1 : -1;
      for (let s = 0; s < 6 + k; s++) px(c, x + dir * s, y - Math.floor(s / 2), trunk);
    }
    if (canopy) {
      for (let i = 0; i < 70; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r());
        px(c, x + Math.cos(a) * d * 12, top + 14 + Math.sin(a) * d * 11, canopy[i % 2], 2, 1);
      }
    } else if (season === 'winter') {
      for (let k = 0; k < 5; k++) px(c, x - 5 + k * 2, top + 10 + k * 5, '#F6F8FA', 3, 1);
    }
  }
  if (time === 'night') {
    for (const lx of [0.28, 0.6]) {
      px(c, x0 + w * lx, y0 + h * 0.4, '#3A3E4A', 1, h * 0.38);
      px(c, x0 + w * lx - 1, y0 + h * 0.38, PAL26.glow, 3, 2);
    }
  }
}

/** The window wall (v = 0 plane): a strip of plaster, then floor-to-ceiling glass and the door. */
function windowWallFlat(U: number, time: DayTime, season: Season): HTMLCanvasElement {
  const W = U * 16;
  const [cv, c] = makeCanvas(W, WALL_H);
  const g0 = 44;
  const g1 = W - 16;
  plaster(c, 0, g0, 9);
  plaster(c, g1, W - g1, 10);
  // a round wall clock and a little menu frame
  px(c, 18, 24, PAL26.black, 9, 9);
  px(c, 19, 25, '#F2EADB', 7, 7);
  px(c, 22, 26, PAL26.black, 1, 3);
  px(c, 22, 28, PAL26.black, 2, 1);
  px(c, 6, 40, PAL26.oak, 12, 16);
  px(c, 7, 41, '#2B2B30', 10, 14);
  for (let y = 43; y < 54; y += 3) px(c, 9, y, '#E8DCC0', 6, 1);
  // glass from the floor nearly to the ceiling
  outside(c, g0, g1 - g0, 4, WALL_H - 8, time, season);
  const F = PAL26.black;
  px(c, g0, 2, F, g1 - g0, 2);
  px(c, g0, WALL_H - 5, F, g1 - g0, 3);
  px(c, g0, 26, F, g1 - g0, 2);
  for (let a = g0; a <= g1; a += 16) px(c, a - (a === g1 ? 2 : 0), 2, F, 2, WALL_H - 4);
  // the glass door (one bay before the last), with a steel pull and an "open" sign
  const d0 = W - 40;
  px(c, d0, 2, F, 3, WALL_H - 4);
  px(c, d0 + 13, 2, F, 3, WALL_H - 4);
  px(c, d0, 26, F, 16, 2);
  px(c, d0 + 4, 46, PAL26.steel, 1, 10);
  px(c, d0 + 6, 34, '#F2EADB', 6, 4);
  px(c, d0 + 7, 35, '#A9443B', 4, 2);
  // reflections
  for (let a = g0 + 4; a < g1; a += 16) {
    for (let k = 0; k < 6; k++) px(c, a + k, 30 + k * 2, 'rgba(255,255,255,0.22)', 1, 4);
  }
  px(c, 0, WALL_H - 4, PAL26.walnut, g0, 4);
  px(c, g1, WALL_H - 4, PAL26.walnut, W - g1, 4);
  wallCap(c, W);
  px(c, W - 2, 0, PAL26.slab, 2, WALL_H);
  return cv;
}

/**
 * Wall tiles, 32 × (16 + WALL_H): one per back-wall cell (index v), one per window-wall
 * cell (index V + u), and the corner (index V + U), each a slice of the flat wall art sheared
 * onto the cell's upper edge.
 */
export function wallTileset(U: number, V: number, time: DayTime, season: Season): HTMLCanvasElement {
  const back = backWallFlat(V);
  const win = windowWallFlat(U, time, season);
  const TH = 16 + WALL_H;
  const [cv, c] = makeCanvas((U + V + 1) * 32, TH);
  const left = (k: number, ox: number) => {
    for (let j = 0; j < 16; j++) c.drawImage(back, k * 16 + j, 0, 1, WALL_H, ox + 15 - j, Math.floor((j + 1) / 2), 1, WALL_H);
  };
  const right = (k: number, ox: number) => {
    for (let j = 0; j < 16; j++) c.drawImage(win, k * 16 + j, 0, 1, WALL_H, ox + 16 + j, Math.floor(j / 2), 1, WALL_H);
  };
  for (let v = 0; v < V; v++) left(v, v * 32);
  for (let u = 0; u < U; u++) right(u, (V + u) * 32);
  const corner = (U + V) * 32;
  left(0, corner);
  right(0, corner);
  px(c, corner + 15, 0, '#7E6A66', 2, WALL_H);
  return cv;
}

// ---------- furniture ----------

const S = {
  navy: shade(PAL26.navy),
  navyLight: shade('#3A5384'),
  oak: shade(PAL26.oak),
  walnut: shade(PAL26.walnut),
  brick: shade(PAL26.brick),
  brickLight: shade('#BE5A4C'),
  steel: shade(PAL26.steel),
  black: shade(PAL26.black),
  blackSoft: shade('#2E2E36'),
  sage: shade(PAL26.sage),
  beige: shade(PAL26.beige),
  beigeLight: shade('#DDCCB0'),
  pot: shade('#B9B4AC'),
  white: shade('#ECE8E0'),
  hopper: shade('#6B4226'),
  grey: shade('#6A6A74'),
  mustard: shade('#C9A040'),
};

function fronds(p: IsoPainter, u: number, v: number, z: number, size: number, seed: number): void {
  const base = p.at(u, v, z);
  const r = rng(seed);
  const greens = ['#3E7A34', PAL26.leaf, '#6AA858', '#2F5A28'];
  for (let k = 0; k < 9 + size; k++) {
    const ang = -Math.PI / 2 + (r() - 0.5) * 2.6;
    const len = size * (0.6 + r() * 0.5);
    for (let s = 0; s < len; s++) {
      const x = base.x + Math.cos(ang) * s;
      const y = base.y + Math.sin(ang) * s + (s * s) / (len * 2.2);
      px(p.c, x, y, greens[(k + (s > len / 2 ? 1 : 0)) % 4], s > 2 && s < len - 2 ? 2 : 1, 1);
    }
  }
}

function cupTower(p: IsoPainter, u: number, v: number, z: number, h: number): void {
  for (let k = 0; k < h; k += 3) {
    p.box(u, v, z + k, 0.2, 0.2, 3, S.sage);
    const a = p.at(u, v + 0.2, z + k);
    px(p.c, a.x, a.y - 1, '#8FA27A', 4, 1);
  }
}

/** A black metal café chair with a slatted back; `backU` puts the back at its -u or +u side. */
function chair(backU: number): IsoSprite {
  return isoSprite(0.5, 0.5, 26, (p) => {
    const legs = [[0.04, 0.04], [0.4, 0.04], [0.04, 0.4], [0.4, 0.4]];
    const back = () => {
      for (const v of [0.04, 0.4]) p.box(backU, v, 10, 0.06, 0.06, 16, S.black);
      for (const z of [17, 23]) p.box(backU, 0.04, z, 0.06, 0.42, 2, S.blackSoft);
    };
    if (backU === 0) back();
    for (const [u, v] of legs) p.box(u, v, 0, 0.06, 0.06, 10, S.black);
    p.box(0.02, 0.02, 10, 0.46, 0.46, 2, S.blackSoft);
    if (backU !== 0) back();
  });
}

export const CAFE_FURNITURE: Record<string, () => IsoSprite> = {
  'cafe-silo': () =>
    isoSprite(1.5, 1.5, 86, (p) => {
      const c = p.c;
      const b = p.at(0.75, 0.75, 0);
      const rx = 12;
      const ry = 6;
      for (let dx = -rx; dx <= rx; dx++) {
        const e = Math.round(Math.sqrt(1 - (dx * dx) / (rx * rx)) * ry);
        const t = (dx + rx) / (2 * rx);
        const col = t < 0.22 ? '#3C3C46' : t < 0.68 ? '#26262C' : '#18181C';
        px(c, b.x + dx, b.y - 80 + e, col, 1, 78);
      }
      ellipse(c, b.x, b.y - 80, rx, ry, '#34343C');
      ellipse(c, b.x, b.y - 80, rx - 3, ry - 2, '#2A2A30');
      px(c, b.x - 2, b.y - 85, '#3C3C46', 5, 3);
      // the glass bean window
      for (let dx = -9; dx <= 9; dx++) {
        const e = Math.round(Math.sqrt(1 - (dx * dx) / (rx * rx)) * ry);
        px(c, b.x + dx, b.y - 72 + e, '#4A2E1E', 1, 14);
      }
      const r = rng(5);
      for (let i = 0; i < 70; i++) px(c, b.x - 9 + r() * 18, b.y - 70 + r() * 14, r() > 0.5 ? '#7A4E2E' : '#9C6A40', 2, 1);
      px(c, b.x - 6, b.y - 70, 'rgba(255,255,255,0.35)', 2, 10);
      // the vertical digital screen: today's special
      px(c, b.x - 5, b.y - 50, '#141C30', 10, 36);
      px(c, b.x - 4, b.y - 49, '#2E4268', 8, 34);
      px(c, b.x - 3, b.y - 46, PAL26.glow, 6, 2);
      for (let y = -42; y < -30; y += 3) px(c, b.x - 3, b.y + y, '#F2EADB', 6, 1);
      px(c, b.x - 2, b.y - 26, PAL26.sage, 4, 4);
      px(c, b.x + 2, b.y - 25, PAL26.sage, 1, 2);
      px(c, b.x - 3, b.y - 21, '#E8AAA6', 6, 1);
      // a steel base ring
      for (let dx = -rx; dx <= rx; dx++) {
        const e = Math.round(Math.sqrt(1 - (dx * dx) / (rx * rx)) * ry);
        px(c, b.x + dx, b.y - 4 + e, dx < 0 ? '#C9CED4' : '#9AA0A8', 1, 3);
      }
    }),
  'cafe-banquette': () =>
    isoSprite(1.25, 5.25, 30, (p) => {
      p.box(0, 0, 0, 0.4, 5.25, 30, S.navy);
      for (let v = 0.75; v < 5.25; v += 0.75) p.line(p.at(0.4, v, 14), p.at(0.4, v, 28), '#22304F');
      for (let v = 0.38; v < 5.25; v += 0.75) {
        const a = p.at(0.4, v, 22);
        px(p.c, a.x, a.y, '#22304F');
      }
      p.box(0.4, 0, 0, 0.85, 5.25, 11, S.navy);
      p.box(0.42, 0.02, 11, 0.8, 5.21, 2, S.navyLight);
      for (let v = 1.75; v < 5.25; v += 1.75) p.line(p.at(0.42, v, 13), p.at(1.22, v, 13), '#2E4268');
      p.box(0.42, 0.5, 13, 0.25, 0.7, 9, S.grey);
      p.box(0.42, 2.9, 13, 0.25, 0.7, 9, S.mustard);
      p.box(0.42, 4.3, 13, 0.25, 0.6, 8, S.grey);
    }),
  'cafe-two-top': () =>
    isoSprite(0.875, 0.875, 22, (p) => {
      p.box(0.3, 0.3, 0, 0.3, 0.3, 2, S.black);
      p.box(0.4, 0.4, 2, 0.1, 0.1, 15, S.black);
      p.box(0, 0, 17, 0.875, 0.875, 2, S.oak);
      // an open laptop facing the banquette, and a cup
      p.box(0.1, 0.2, 19, 0.4, 0.4, 1, S.steel);
      p.box(0.5, 0.2, 20, 0.05, 0.4, 8, shade('#8A9098'));
      p.box(0.6, 0.62, 19, 0.15, 0.15, 3, S.sage);
    }),
  'cafe-chair-se': () => chair(0),
  'cafe-chair-nw': () => chair(0.44),
  'cafe-counter-run': () =>
    isoSprite(1, 3, 40, (p) => {
      p.box(0.06, 0, 0, 0.94, 3, 20, S.walnut);
      for (const v of [0.75, 1.5, 2.25]) p.line(p.at(1, v, 1), p.at(1, v, 19), '#4E3628');
      for (const v of [0.2, 0.95, 1.7, 2.45]) {
        const a = p.at(1, v, 15);
        const b = p.at(1, v + 0.35, 15);
        p.line(a, b, PAL26.steel);
        p.line({ x: a.x, y: a.y + 1 }, { x: b.x, y: b.y + 1 }, '#8A9098');
      }
      p.box(0, 0, 20, 1, 3, 2, S.oak);
      // two black grinders with bean hoppers
      for (const v of [0.15, 0.6]) {
        p.box(0.35, v, 22, 0.32, 0.32, 9, S.black);
        p.box(0.38, v + 0.03, 31, 0.26, 0.26, 7, S.hopper);
      }
      // the steel two-group espresso machine, sage cups stacked on top
      p.box(0.2, 1.2, 22, 0.7, 1.15, 14, S.steel);
      p.box(0.2, 1.2, 36, 0.7, 1.15, 1, shade('#D6DBE0'));
      for (const v of [1.4, 1.9]) {
        const a = p.at(0.9, v, 30);
        px(p.c, a.x - 1, a.y, '#2B2B30', 4, 3);
        px(p.c, a.x + 3, a.y + 2, PAL26.black, 3, 1);
      }
      for (const [u, v] of [[0.28, 1.28], [0.28, 1.65], [0.28, 2.02], [0.55, 1.28], [0.55, 1.65], [0.55, 2.02]]) p.box(u, v, 37, 0.2, 0.2, 3, S.sage);
      p.box(0.7, 2.5, 22, 0.15, 0.15, 3, S.white);
    }),
  'cafe-counter-return': () =>
    isoSprite(2, 0.75, 52, (p) => {
      p.box(0, 0.06, 0, 2, 0.69, 20, S.walnut);
      for (const u of [0.66, 1.33]) p.line(p.at(u, 0.75, 1), p.at(u, 0.75, 19), '#4E3628');
      p.box(0, 0, 20, 2, 0.75, 2, S.oak);
      cupTower(p, 0.3, 0.25, 22, 27);
      cupTower(p, 0.6, 0.3, 22, 21);
      cupTower(p, 0.95, 0.22, 22, 30);
      cupTower(p, 1.3, 0.3, 22, 18);
      p.box(1.6, 0.25, 22, 0.25, 0.25, 4, S.white);
    }),
  'cafe-bin': () =>
    isoSprite(0.44, 0.44, 16, (p) => {
      p.box(0, 0, 0, 0.44, 0.44, 14, S.steel);
      p.box(0, 0, 14, 0.44, 0.44, 2, S.black);
    }),
  'cafe-plant-small': () =>
    isoSprite(0.5, 0.5, 34, (p) => {
      p.box(0.08, 0.08, 0, 0.34, 0.34, 10, S.pot);
      fronds(p, 0.25, 0.25, 10, 10, 3);
    }),
  'cafe-table': () =>
    isoSprite(1, 1, 22, (p) => {
      p.box(0.3, 0.3, 0, 0.4, 0.4, 2, S.black);
      p.box(0.45, 0.45, 2, 0.1, 0.1, 15, S.black);
      p.box(0, 0, 17, 1, 1, 2, S.oak);
      p.box(0.35, 0.6, 19, 0.16, 0.16, 3, S.sage);
    }),
  'cafe-armchair': () =>
    isoSprite(1, 1, 26, (p) => {
      p.box(0, 0, 0, 1, 0.32, 26, S.brick);
      p.box(0, 0.32, 0, 1, 0.68, 10, S.brick);
      p.box(0, 0.32, 10, 0.18, 0.68, 7, S.brick);
      p.box(0.18, 0.34, 10, 0.64, 0.64, 3, S.brickLight);
      p.box(0.82, 0.32, 10, 0.18, 0.68, 7, S.brick);
      for (const [u, v] of [[0.05, 0.92], [0.88, 0.92]]) p.box(u, v, 0, 0.07, 0.07, 2, S.oak);
    }),
  'cafe-side-table': () =>
    isoSprite(0.75, 0.625, 24, (p) => {
      p.box(0.3, 0.25, 0, 0.12, 0.12, 15, S.walnut);
      p.box(0, 0, 15, 0.75, 0.625, 2, S.oak);
      p.box(0.1, 0.1, 17, 0.35, 0.25, 2, shade('#7A2E35'));
      p.box(0.5, 0.35, 17, 0.14, 0.14, 3, S.sage);
    }),
  'cafe-sofa': () =>
    isoSprite(2.75, 1.125, 28, (p) => {
      p.box(0, 0, 0, 2.75, 0.35, 26, S.beige);
      p.box(0, 0.35, 0, 2.75, 0.775, 11, S.beige);
      p.box(0, 0.35, 11, 0.25, 0.775, 8, S.beige);
      p.box(0.25, 0.37, 11, 1.12, 0.73, 3, S.beigeLight);
      p.box(1.38, 0.37, 11, 1.12, 0.73, 3, S.beigeLight);
      // a zigzag cushion and a dark one
      p.box(0.35, 0.36, 14, 0.5, 0.2, 9, S.white);
      for (let k = 0; k < 4; k++) {
        const a = p.at(0.38 + k * 0.11, 0.56, 16 + (k % 2) * 3);
        px(p.c, a.x, a.y, PAL26.black, 2, 1);
      }
      p.box(1.95, 0.36, 14, 0.45, 0.2, 8, S.grey);
      p.box(2.5, 0.35, 11, 0.25, 0.775, 8, S.beige);
      for (const [u, v] of [[0.05, 1.04], [2.62, 1.04]]) p.box(u, v, 0, 0.08, 0.08, 2, S.oak);
    }),
  'cafe-side-plant': () =>
    isoSprite(0.5, 0.5, 44, (p) => {
      p.box(0, 0, 0, 0.5, 0.5, 16, S.oak);
      p.box(0.12, 0.12, 16, 0.26, 0.26, 7, S.white);
      fronds(p, 0.25, 0.25, 23, 9, 8);
    }),
  'cafe-plant-tall': () =>
    isoSprite(0.7, 0.7, 70, (p) => {
      p.box(0.1, 0.1, 0, 0.5, 0.5, 14, S.pot);
      const t = p.at(0.35, 0.35, 14);
      px(p.c, t.x, t.y - 26, '#6A4A30', 1, 26);
      fronds(p, 0.35, 0.35, 34, 16, 11);
      fronds(p, 0.35, 0.35, 52, 13, 12);
    }),
  'cafe-pendant': () =>
    isoSprite(0.2, 0.2, 0, (p) => {
      const c = p.c;
      const b = p.at(0.1, 0.1, 0);
      // a warm cone of light down to just above the floor
      for (let y = 0; y < 52; y++) {
        const half = 4 + Math.round(y * 0.42);
        px(c, b.x - half, b.y - 66 + y, `rgba(242,213,155,${((0.2 * (52 - y)) / 52).toFixed(3)})`, half * 2 + 1, 1);
      }
      px(c, b.x, b.y - 170, '#2B2B30', 1, 96);
      const rows: [number, number][] = [[2, 0], [4, 1], [5, 2], [6, 3], [6, 4], [7, 5]];
      for (const [half, dy] of rows) px(c, b.x - half, b.y - 74 + dy, dy < 2 ? '#3A3A42' : PAL26.black, half * 2 + 1, 1);
      px(c, b.x - 6, b.y - 68, PAL26.glow, 13, 1);
      px(c, b.x - 3, b.y - 68, '#FFF4D6', 7, 1);
    }, { over: 170, outline: false }),
};

/** The apron hanging on its hook while Roxy is off shift (drawn on the back wall). */
export function apronOnHook(): HTMLCanvasElement {
  const [cv, c] = makeCanvas(8, 16);
  for (let y = 0; y < 15; y++) px(c, 1 + (y > 4 ? 0 : 1), y, y % 4 === 0 ? '#CDBE9C' : '#EFE6D2', y > 4 ? 6 : 4, 1);
  px(c, 3, 6, '#C9A14A');
  return cv;
}

/** Cool daylight falling through the window wall onto the floor (day only). */
export function windowLight(U: number, V: number): HTMLCanvasElement {
  const w = (U + V) * 16 + 2;
  const h = (U + V) * 8 + 2;
  const [cv, c] = makeCanvas(w, h);
  const o = { x: V * 16 + 1, y: 1 };
  const P = (u: number, v: number) => ({ x: o.x + (u - v) * 16, y: o.y + (u + v) * 8 });
  for (let u = 3; u < U - 1; u++) {
    if (u === U - 3) continue;
    fillPoly(c, [P(u + 0.15, 0), P(u + 0.85, 0), P(u + 1.35, 2.6), P(u + 0.65, 2.6)], 'rgba(235,242,250,0.22)');
  }
  return cv;
}

/** Registers every café texture. Furniture origins are returned for placing the sprites. */
export function registerCafeArt(scene: Phaser.Scene, U: number, V: number): Map<string, { x: number; y: number }> {
  const origins = new Map<string, { x: number; y: number }>();
  const add = (key: string, cv: HTMLCanvasElement) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, cv);
  };
  add('cafe-floor', floorTileset());
  add('cafe-walls', wallTileset(U, V, dayTimeOf(), seasonOf()));
  add('cafe-window-light', windowLight(U, V));
  add('cafe-apron-hook', apronOnHook());
  for (const [key, make] of Object.entries(CAFE_FURNITURE)) {
    const s = make();
    add(key, s.canvas);
    origins.set(key, s.origin);
  }
  return origins;
}

/** Repaints only the walls (the windows follow the clock and the season). */
export function refreshCafeWalls(scene: Phaser.Scene, U: number, V: number): void {
  const tex = scene.textures.get('cafe-walls') as Phaser.Textures.CanvasTexture;
  const src = tex.getSourceImage() as HTMLCanvasElement;
  const next = wallTileset(U, V, dayTimeOf(), seasonOf());
  const c = src.getContext('2d')!;
  c.clearRect(0, 0, src.width, src.height);
  c.drawImage(next, 0, 0);
  tex.refresh();
}
