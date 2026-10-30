/**
 * Character-sized placeholder art shared by the rooms: the café regulars (chibi 32×48:
 * walk, stand, sit), the bike courier, the parcel and a latte cup. The rooms themselves live
 * in src/game/iso/. Pure canvas; replace with Aseprite exports under the same texture keys.
 */
import type { RegularDef } from '../../content';
import { PAL, mix } from '../companion/art/palette';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  return [cv, c];
}

function px(c: Ctx, x: number, y: number, color: string, w = 1, h = 1): void {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** Paints a 1px outline around everything opaque on the canvas (per frame for sheets). */
function outline(c: Ctx, w: number, h: number, color: string, frameW = w): void {
  const src = c.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (on(x, y)) continue;
      const fx = x % frameW;
      if ((fx > 0 && on(x - 1, y)) || (fx < frameW - 1 && on(x + 1, y)) || on(x, y - 1) || on(x, y + 1)) px(c, x, y, color);
    }
  }
}

/** Bike courier with a parcel (PDF delivery), two frames. */
export function courier(): HTMLCanvasElement {
  const [cv, c] = canvas(64, 30);
  for (let f = 0; f < 2; f++) {
    const o = f * 32;
    for (const wx of [o + 6, o + 24]) {
      px(c, wx - 5, 20, '#0B0B0F', 11, 1);
      px(c, wx - 5, 29, '#0B0B0F', 11, 1);
      px(c, wx - 5, 20, '#0B0B0F', 1, 10);
      px(c, wx + 5, 20, '#0B0B0F', 1, 10);
      px(c, wx, 24 + (f ? 1 : 0), '#8A8580', 1, 1);
    }
    px(c, o + 7, 22, '#E8B83A', 16, 2);
    px(c, o + 14, 6, '#2E8B6A', 6, 12);
    px(c, o + 15, 1, '#A97C64', 5, 5);
    px(c, o + 14, 0, '#E8B83A', 7, 2);
    px(c, o + 4, 10, PAL.paperShade, 9, 8);
    px(c, o + 4, 13, '#8A5A2A', 9, 1);
    px(c, o + (f ? 15 : 17), 18, '#2A3352', 2, 6);
  }
  return cv;
}

/** A latte with a little heart, on its saucer. */
export function latteCup(): HTMLCanvasElement {
  const [cv, c] = canvas(8, 6);
  px(c, 1, 0, '#D9B48A', 5, 1);
  px(c, 3, 0, PAL.ivoryPearl);
  px(c, 1, 1, PAL.ivoryPearl, 5, 3);
  px(c, 6, 2, PAL.ivoryPearl);
  px(c, 0, 4, PAL.paperShade, 8, 1);
  return cv;
}

export function parcel(): HTMLCanvasElement {
  const [cv, c] = canvas(10, 8);
  px(c, 0, 0, PAL.paperShade, 10, 8);
  px(c, 0, 3, '#8A5A2A', 10, 1);
  px(c, 4, 0, '#8A5A2A', 1, 8);
  return cv;
}

// ---------- the regulars: chibi 32×48 characters ----------

type HairStyle = 'long' | 'bun' | 'puff' | 'cap' | 'braids';
const HAIR_STYLE: Record<string, HairStyle> = { writer: 'long', odile: 'bun', guide: 'puff', busker: 'cap', florist: 'braids' };

/** The round face: [row, left, right]. */
const NPC_FACE: [number, number, number][] = [
  [9, 12, 20],
  [10, 10, 22],
  [11, 9, 23],
  [12, 9, 23],
  [13, 9, 23],
  [14, 9, 23],
  [15, 9, 23],
  [16, 9, 23],
  [17, 9, 23],
  [18, 9, 23],
  [19, 9, 23],
  [20, 10, 22],
  [21, 11, 21],
  [22, 13, 19],
];

/**
 * A regular as a Stardew-style chibi: a big round head with shiny eyes and rosy cheeks on a
 * small body. Frames 0–3 walk, 4 stands, 5 sits; all face right (SE). Each has their own hair.
 */
export function regularSheet(r: RegularDef): HTMLCanvasElement {
  const [cv, c] = canvas(32 * 6, 48);
  const { hair, top, bottom, skin } = r.colors;
  const style = HAIR_STYLE[r.id] ?? 'long';
  const hairDark = mix(hair, '#000000', 0.32);
  const hairLight = mix(hair, '#FFFFFF', 0.28);
  const skinShade = mix(skin, '#7A3A2A', 0.22);
  const topShade = mix(top, '#000000', 0.28);
  const topLight = mix(top, '#FFFFFF', 0.2);
  const bottomShade = mix(bottom, '#000000', 0.3);
  for (let f = 0; f < 6; f++) {
    const o = f * 32;
    const sitting = f === 5;
    const stride = f >= 4 ? 0 : [2, 0, -2, 0][f];
    // Seated, the whole upper body drops onto the seat.
    const bob = sitting ? 7 : f === 4 ? 0 : f % 2;
    const P = (x: number, y: number, col: string, w = 1, h = 1) => px(c, o + x, y + bob, col, w, h);
    const blob = (cx: number, cy: number, rx: number, ry: number, col: string, shade?: string) => {
      for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
        for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
          const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
          if (d <= 1) P(cx + x, cy + y, shade && d > 0.6 && y > 0 ? shade : col);
        }
      }
    };

    // hair that falls behind the head and shoulders
    if (style === 'long') {
      P(8, 10, hair, 17, 19);
      P(8, 26, hairDark, 3, 3);
      P(22, 26, hairDark, 3, 3);
    } else if (style === 'puff') {
      blob(16, 10, 11, 9, hair, hairDark);
    } else if (style === 'braids') {
      for (let y = 12; y < 32; y++) {
        const col = y % 3 === 0 ? hairDark : hair;
        P(7, y, col, 3, 1);
        P(23, y, col, 3, 1);
      }
      P(7, 32, '#C9787A', 3, 2);
      P(23, 32, '#C9787A', 3, 2);
    }

    // legs and shoes (seated: thighs forward, shins down)
    if (sitting) {
      px(c, o + 13, 41, bottomShade, 9, 3);
      px(c, o + 15, 40, bottom, 8, 3);
      px(c, o + 20, 43, bottomShade, 3, 3);
      px(c, o + 22, 42, bottom, 3, 4);
      px(c, o + 20, 46, '#3A2420', 6, 2);
    } else {
      px(c, o + 13 - stride, 37, bottomShade, 3, 8);
      px(c, o + 17 + stride, 37, bottom, 3, 8);
      px(c, o + 12 - stride, 45, '#3A2420', 5, 2);
      px(c, o + 16 + stride, 45, '#3A2420', 5, 2);
      px(c, o + 19 + stride, 45, '#5A3A30');
    }

    // body: a rounded top over shorts/skirt
    P(12, 24, top, 9, 1);
    P(11, 25, top, 11, 9);
    P(11, 25, topShade, 2, 9);
    P(20, 26, topLight, 1, 6);
    P(11, 34, bottom, 11, 4);
    P(11, 34, bottomShade, 2, 4);
    // arms: the back one tucked behind, the front one swinging
    P(10, 26, topShade, 2, 7);
    P(10, 33, skinShade, 2, 2);
    const sw = Math.round(stride / 2);
    P(19 - sw, 26, top, 3, 7);
    P(19 - sw, 26, topShade, 1, 7);
    P(19 - sw, 33, skin, 3, 2);
    // neck
    P(14, 23, skinShade, 4, 2);

    // the big round face
    for (const [y, a, b] of NPC_FACE) {
      P(a, y, skin, b - a + 1, 1);
      P(a, y, skinShade);
    }
    // eyes: dark with a white sparkle, lashes for the women
    for (const ex of [13, 18]) {
      P(ex, 15, '#2A1A1E', 2, 1);
      P(ex, 16, '#FFFFFF');
      P(ex + 1, 16, '#2A1A1E');
      P(ex, 17, '#2A1A1E', 2, 1);
    }
    if (r.id !== 'busker' && r.id !== 'guide') {
      P(12, 15, '#2A1A1E');
      P(20, 15, '#2A1A1E');
    }
    P(11, 19, '#F3A5A0', 2, 1);
    P(20, 19, '#F3A5A0', 2, 1);
    P(15, 20, '#7A2E34');
    P(16, 21, '#7A2E34', 2, 1);
    P(18, 20, '#7A2E34');

    // hair on top: a rounded cap with a fringe, then each regular's own touch
    if (style !== 'cap') {
      blob(16, 9, 8.5, 5.5, hair);
      for (let x = 9; x <= 23; x++) P(x, 11 + (x % 3 === 0 ? 1 : 0), hair);
      P(12, 6, hairLight, 4, 1);
      P(11, 7, hairLight, 1, 1);
    }
    if (style === 'long') {
      P(8, 11, hair, 2, 14);
      P(23, 11, hair, 2, 12);
    } else if (style === 'bun') {
      blob(16, 3, 3.5, 3, hair, hairDark);
      P(15, 2, hairLight, 2, 1);
      P(9, 12, hairDark, 1, 3);
    } else if (style === 'puff') {
      for (let x = 8; x <= 24; x += 3) P(x, 4 + (x % 2), hairLight);
      P(9, 12, hair, 1, 5);
      P(23, 12, hair, 1, 5);
    } else if (style === 'braids') {
      P(20, 6, '#E8AAA6', 3, 2);
      P(21, 5, '#C9787A');
      P(21, 8, '#F6E3A1');
    } else if (style === 'cap') {
      // short hair under a flat cap with a brim to the front
      P(9, 9, hair, 2, 6);
      P(22, 10, hair, 1, 4);
      blob(15, 7, 7.5, 3.5, '#4A4A52');
      P(8, 8, '#4A4A52', 16, 2);
      P(20, 9, '#3A3A40', 7, 2);
      P(10, 5, '#6A6A72', 6, 1);
    }
  }
  outline(c, cv.width, 48, '#33201F', 32);
  return cv;
}
