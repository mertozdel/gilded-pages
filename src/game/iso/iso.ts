/**
 * Isometric (2:1 dimetric) helpers for the pixel-art rooms.
 *
 * A floor tile is 32×16 game px. `u` runs down-right along the right-hand wall, `v` runs
 * down-left along the left-hand wall, `z` is height in pixels; (0, 0) is the back corner.
 * Everything is rasterised by hand (scanline polygons, sheared wall art, outline passes) so
 * edges stay as crisp as the character sprites.
 */
export const TILE_W = 32;
export const TILE_H = 16;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

export interface Pt {
  x: number;
  y: number;
}

export type Ctx = CanvasRenderingContext2D;

/** Floor/room coordinates to screen pixels, relative to the room's back corner. */
export function project(u: number, v: number, z = 0): Pt {
  return { x: (u - v) * HW, y: (u + v) * HH - z };
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  return [cv, c];
}

export function px(c: Ctx, x: number, y: number, color: string, w = 1, h = 1): void {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** Scanline polygon fill sampled at pixel centres, so iso edges come out as clean 2:1 steps. */
export function fillPoly(c: Ctx, pts: Pt[], color: string): void {
  const ys = pts.map((p) => p.y);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys)) - 1;
  c.fillStyle = color;
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) xs.push(a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]);
      const xb = Math.round(xs[k + 1]);
      if (xb > xa) c.fillRect(xa, y, xb - xa, 1);
    }
  }
}

export function hexMix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (n: number, s: number) => (n >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return '#' + [16, 8, 0].map((s) => m(s).toString(16).padStart(2, '0')).join('');
}

export interface Faces {
  top: string;
  /** The +v face: turned down-left, toward the viewer's left. */
  left: string;
  /** The +u face: turned down-right. */
  right: string;
}

/** Top lit, the left face in half light, the right face in shadow. */
export function shade(base: string): Faces {
  return { top: hexMix(base, '#FFFFFF', 0.12), left: base, right: hexMix(base, '#000000', 0.22) };
}

/** A drawing surface for one object: maps room-local (u, v, z) to canvas pixels. */
export class IsoPainter {
  constructor(
    readonly c: Ctx,
    readonly origin: Pt,
  ) {}

  at(u: number, v: number, z = 0): Pt {
    const p = project(u, v, z);
    return { x: this.origin.x + p.x, y: this.origin.y + p.y };
  }

  /** A box from (u, v, z) of size (du, dv, dz); only the three visible faces are drawn. */
  box(u: number, v: number, z: number, du: number, dv: number, dz: number, f: Faces): void {
    const u1 = u + du;
    const v1 = v + dv;
    const z1 = z + dz;
    const P = (a: number, b: number, h: number) => this.at(a, b, h);
    if (dz > 0) {
      fillPoly(this.c, [P(u, v1, z), P(u1, v1, z), P(u1, v1, z1), P(u, v1, z1)], f.left);
      fillPoly(this.c, [P(u1, v, z), P(u1, v1, z), P(u1, v1, z1), P(u1, v, z1)], f.right);
    }
    fillPoly(this.c, [P(u, v, z1), P(u1, v, z1), P(u1, v1, z1), P(u, v1, z1)], f.top);
  }

  /** A flat quad on the floor or a top surface. */
  tile(u: number, v: number, du: number, dv: number, z: number, color: string): void {
    fillPoly(this.c, [this.at(u, v, z), this.at(u + du, v, z), this.at(u + du, v + dv, z), this.at(u, v + dv, z)], color);
  }

  /** A line between two room points (1px). */
  line(a: Pt, b: Pt, color: string): void {
    const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
    for (let i = 0; i <= n; i++) px(this.c, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, color);
  }

  /**
   * Pastes flat art onto a vertical face. `axis` 'u' = a face running along u (its normal is
   * ±v: the right-hand wall, fronts of things against it); 'v' = a face running along v.
   * The art's left column starts at room point (u, v), its bottom row at height z.
   */
  shear(art: HTMLCanvasElement, axis: 'u' | 'v', u: number, v: number, z: number): void {
    const base = this.at(u, v, z);
    for (let a = 0; a < art.width; a++) {
      const x = axis === 'u' ? base.x + a : base.x - a - 1;
      const y = base.y - art.height + Math.floor((a + (axis === 'u' ? 0 : 1)) / 2);
      this.c.drawImage(art, a, 0, 1, art.height, x, y, 1, art.height);
    }
  }
}

/** Paints a 1px outline around every opaque pixel (the soft dark rim the characters have too). */
export function outline(c: Ctx, w: number, h: number, color: string): void {
  const src = c.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 40;
  c.fillStyle = color;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (on(x, y)) continue;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) c.fillRect(x, y, 1, 1);
    }
  }
}

/**
 * Outlines every solid shape in a darker shade of its own colour (not black): each empty
 * pixel touching an opaque one takes that neighbour's colour, darkened.
 */
export function outlineTinted(c: Ctx, w: number, h: number, darken = 0.5): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] >= 200;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] >= 200) continue;
      const n = [
        [x, y - 1],
        [x - 1, y],
        [x + 1, y],
        [x, y + 1],
      ].find(([nx, ny]) => solid(nx, ny));
      if (!n) continue;
      const j = (n[1] * w + n[0]) * 4;
      d[i] = src[j] * (1 - darken);
      d[i + 1] = src[j + 1] * (1 - darken);
      d[i + 2] = src[j + 2] * (1 - darken);
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
}

/** A furniture sprite: the canvas plus where its room-local (0, 0, 0) corner sits on it. */
export interface IsoSprite {
  canvas: HTMLCanvasElement;
  origin: Pt;
}

/**
 * Builds one object's sprite. The canvas is sized to its footprint (du × dv tiles) and
 * height, plus room for anything drawn above (`over`) or overhanging; `draw` paints it in
 * room-local coordinates and an outline is added around the result.
 */
export function isoSprite(du: number, dv: number, height: number, draw: (p: IsoPainter) => void, opts: { over?: number; pad?: number; outline?: boolean } = {}): IsoSprite {
  const pad = opts.pad ?? 3;
  const over = opts.over ?? 0;
  const w = Math.ceil((du + dv) * HW + pad * 2);
  const h = Math.ceil((du + dv) * HH + height + over + pad * 2);
  const [cv, c] = makeCanvas(w, h);
  const origin = { x: Math.round(dv * HW + pad), y: Math.round(height + over + pad) };
  draw(new IsoPainter(c, origin));
  if (opts.outline !== false) outlineTinted(c, cv.width, cv.height);
  return { canvas: cv, origin };
}
