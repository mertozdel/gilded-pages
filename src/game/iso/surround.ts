/**
 * The street around Café Machorn, so the room sits in its block instead of a black void:
 * sky, a row of houses across the street behind the window wall, the neighbouring building
 * behind the back wall, pavements and the road, trees and lamp posts — and on the front
 * pavement an A-frame chalkboard, bags of beans, someone's keys and phone.
 *
 * Two canvases in room-local coordinates: `back` goes under the room, `front` over it.
 */
import { PAL26, type DayTime, type Season } from './cafeArt';
import { IsoPainter, makeCanvas, px, shade, type IsoSprite } from './iso';

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

const SKY: Record<DayTime, [string, string]> = {
  morning: ['#B8CCDA', '#DCE3E8'],
  afternoon: ['#C9D2D6', '#E6E2D6'],
  evening: ['#5A4A6A', '#D89A7A'],
  night: ['#141B2D', '#24315A'],
};

/** How far the street reaches beyond the room, in px. */
const EXT_X = 420;
const EXT_TOP = 260;
const EXT_BOTTOM = 240;

interface Box {
  u: number;
  v: number;
  du: number;
  dv: number;
  h: number;
  color: string;
}

function windowsOnFace(p: IsoPainter, axis: 'u' | 'v', b: Box, lit: boolean, r: () => number): void {
  // A grid of windows on a facade: `axis` 'v' = the +v face (along u), 'u' = the +u face (along v).
  const len = axis === 'v' ? b.du : b.dv;
  for (let k = 0.4; k < len - 0.3; k += 0.8) {
    for (let z = 18; z < b.h - 12; z += 22) {
      const on = lit && r() > 0.45;
      const glass = on ? PAL26.glow : lit ? '#1E2A44' : '#8FA2B4';
      const at =
        axis === 'v'
          ? (zz: number, kk: number) => p.at(b.u + kk, b.v + b.dv, zz)
          : (zz: number, kk: number) => p.at(b.u + b.du, b.v + kk, zz);
      const a = at(z, k);
      const c = at(z, k + 0.45);
      for (let row = 0; row < 12; row++) {
        const y0 = a.y - row;
        const y1 = c.y - row;
        const steps = Math.abs(c.x - a.x);
        for (let s = 0; s <= steps; s++) px(p.c, a.x + Math.sign(c.x - a.x) * s, y0 + ((y1 - y0) * s) / Math.max(1, steps), row === 11 ? '#E8E2D8' : glass);
      }
    }
  }
}

function building(p: IsoPainter, b: Box, lit: boolean, seed: number): void {
  const f = shade(b.color);
  p.box(b.u, b.v, 0, b.du, b.dv, b.h, f);
  // cornice
  p.box(b.u - 0.05, b.v - 0.05, b.h, b.du + 0.1, b.dv + 0.1, 3, shade('#6A5A54'));
  const r = rng(seed);
  windowsOnFace(p, 'v', b, lit, r);
  windowsOnFace(p, 'u', b, lit, r);
}

function tree(p: IsoPainter, u: number, v: number, season: Season, seed: number): void {
  const b = p.at(u, v, 0);
  const r = rng(seed);
  px(p.c, b.x - 1, b.y - 34, '#4A3A30', 3, 34);
  px(p.c, b.x - 1, b.y - 34, '#6A5444', 1, 34);
  const canopy = { winter: null, spring: ['#E8AABE', '#F2C8D4', '#6AA858'], summer: ['#3E7A34', '#4E8B3E', '#6AA858'], autumn: ['#C8642E', '#E0A040', '#A8442A'] }[season];
  for (let k = 0; k < 6; k++) {
    const y = b.y - 30 - k * 5;
    const dir = k % 2 ? 1 : -1;
    for (let s = 0; s < 6 + k; s++) px(p.c, b.x + dir * s, y - Math.floor(s / 2), '#4A3A30');
  }
  if (canopy) {
    for (let i = 0; i < 220; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      px(p.c, b.x + Math.cos(a) * d * 15, b.y - 46 + Math.sin(a) * d * 13, canopy[i % 3], 2, 2);
    }
  } else if (season === 'winter') {
    for (let k = 0; k < 6; k++) px(p.c, b.x - 6 + k * 2, b.y - 40 - k * 4, '#F2F6FA', 3, 1);
  }
  // tree pit
  p.tile(u - 0.35, v - 0.35, 0.7, 0.7, 0, '#5A4A3A');
}

function lamp(p: IsoPainter, u: number, v: number, lit: boolean): void {
  const b = p.at(u, v, 0);
  px(p.c, b.x, b.y - 46, '#2B2B30', 1, 46);
  px(p.c, b.x - 2, b.y - 49, '#2B2B30', 5, 3);
  px(p.c, b.x - 1, b.y - 46, lit ? PAL26.glow : '#C9CED4', 3, 1);
}

/** Pavement: pale slabs; road: asphalt with a dashed centre line. */
function ground(p: IsoPainter, U: number, V: number, time: DayTime): void {
  const night = time === 'night' || time === 'evening';
  const slab = night ? '#6A6A70' : '#A8A49C';
  const slabAlt = night ? '#62626A' : '#9E9A92';
  const grout = night ? '#4A4A52' : '#86827A';
  for (let u = -14; u < U + 14; u++) {
    for (let v = -14; v < V + 14; v++) {
      p.tile(u, v, 1, 1, 0, grout);
      p.tile(u + 0.06, v + 0.06, 0.88, 0.88, 0, (u + v) % 2 ? slab : slabAlt);
    }
  }
  const asphalt = night ? '#26262C' : '#3A3A42';
  // the street outside the windows, and the street in front
  p.tile(-14, -7, U + 28, 3.6, 0, asphalt);
  for (let u = -14; u < U + 14; u += 2) p.tile(u, -5.3, 1, 0.12, 0, '#D8D2C2');
  p.tile(-14, V + 2.4, U + 28, 3.6, 0, asphalt);
  for (let u = -14; u < U + 14; u += 2) p.tile(u, V + 4.1, 1, 0.12, 0, '#D8D2C2');
  // kerbs
  for (const v of [-3.4, -7.1, V + 2.3, V + 6]) p.tile(-14, v, U + 28, 0.12, 0, '#C9C4BA');
}

/** Builds the street for the current time and season. */
export function cafeSurround(U: number, V: number, wallH: number, time: DayTime, season: Season): { back: IsoSprite; front: IsoSprite } {
  const w = (U + V) * 16 + EXT_X * 2;
  const h = (U + V) * 8 + wallH + EXT_TOP + EXT_BOTTOM;
  const origin = { x: V * 16 + EXT_X, y: wallH + EXT_TOP };
  const lit = time === 'evening' || time === 'night';

  const [bcv, bc] = makeCanvas(w, h);
  const [s0, s1] = SKY[time];
  for (let y = 0; y < h; y++) px(bc, 0, y, y < h * 0.22 ? s0 : s1, w, 1);
  const back = new IsoPainter(bc, origin);
  ground(back, U, V, time);
  // houses across the street, behind the window wall
  const tones = ['#B8A08A', '#C9B6A0', '#A8786A', '#D8CCB8', '#9A8A7A', '#BCA48C'];
  let u = -10;
  let k = 0;
  while (u < U + 10) {
    const du = 3 + (k % 3);
    building(back, { u, v: -14, du, dv: 6.6, h: 120 + ((k * 37) % 70), color: tones[k % tones.length] }, lit, 50 + k);
    u += du;
    k++;
  }
  // trees and lamps along the far side of the café's own pavement
  for (const tu of [-2, 3.5, 8.5, 13.5]) tree(back, tu, -2.6, season, Math.round(tu * 10));
  for (const lu of [1, 11]) lamp(back, lu, -2.8, lit);
  // the neighbouring building behind the back wall
  building(back, { u: -10, v: -2.5, du: 9.7, dv: V + 3.1, h: 128, color: '#B9A69A' }, lit, 7);

  // the front pavement, drawn over the room
  const [fcv, fc] = makeCanvas(w, h);
  const front = new IsoPainter(fc, origin);
  tree(front, U + 1.6, V + 1.4, season, 99);
  lamp(front, -1.2, V + 1.6, lit);
  // an A-frame chalkboard
  const sign = front.at(U - 1.6, V + 1.3, 0);
  for (let y = 0; y < 26; y++) {
    const inset = Math.round(y / 6);
    px(fc, sign.x - 8 + inset, sign.y - 26 + y, PAL26.walnut, 16 - inset * 2, 1);
  }
  px(fc, sign.x - 6, sign.y - 23, '#1F2A24', 12, 18);
  for (const [dy, ww] of [
    [3, 8],
    [7, 6],
    [11, 9],
    [15, 5],
  ] as [number, number][])
    px(fc, sign.x - 4, sign.y - 23 + dy, '#F2EDE4', ww, 1);
  px(fc, sign.x + 2, sign.y - 10, '#B9A6E8', 3, 2);
  // bags of beans, keys and a phone on the pavement
  for (const [bu, bv, col] of [
    [5.2, V + 1.1, '#C9A06A'],
    [5.7, V + 1.4, '#B88E58'],
  ] as [number, number, string][]) {
    const b = front.at(bu, bv, 0);
    px(fc, b.x - 3, b.y - 9, col, 6, 9);
    px(fc, b.x - 3, b.y - 9, '#E2C08C', 6, 1);
    px(fc, b.x - 1, b.y - 6, '#4A2E20', 2, 2);
  }
  const keys = front.at(2.5, V + 1.6, 0);
  px(fc, keys.x, keys.y - 1, '#C9CED4', 3, 1);
  px(fc, keys.x + 3, keys.y - 2, '#C9A14A', 2, 2);
  const phone = front.at(3.4, V + 1.9, 0);
  px(fc, phone.x, phone.y - 2, '#1F1F24', 5, 2);
  px(fc, phone.x + 1, phone.y - 2, '#3A4A78', 3, 1);
  return { back: { canvas: bcv, origin }, front: { canvas: fcv, origin } };
}
