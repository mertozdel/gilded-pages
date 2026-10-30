/**
 * Placeholder pixel renditions of museum pieces, generated from a motif and a four-colour
 * palette per work (museums.json). Real pixel art drawn from open-access reference images
 * replaces these later, keyed by piece id.
 */
import type { MuseumPiece } from '../../content';

const SIZES: Record<string, [number, number]> = { portrait: [18, 24], landscape: [28, 20], square: [22, 22], wide: [40, 16] };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
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

export function renderPieceArt(piece: MuseumPiece): HTMLCanvasElement {
  const [w, h] = SIZES[piece.art.shape] ?? SIZES.square;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const [p0, p1, p2, p3] = piece.art.palette;
  const r = rng(hash(piece.id));
  const px = (x: number, y: number, col: string, ww = 1, hh = 1) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(ww)), Math.max(1, Math.round(hh)));
  };
  const dabs = (n: number, cols: string[], y0 = 0, y1 = h) => {
    for (let i = 0; i < n; i++) px(r() * w, y0 + r() * (y1 - y0), cols[Math.floor(r() * cols.length)]);
  };
  const figure = (x: number, y: number, s: number, body: string, head: string) => {
    px(x, y, head, s, s);
    px(x - Math.floor(s / 2), y + s, body, s * 2, s * 3);
  };
  const statue = (col: string, shade: string) => {
    const cx = Math.floor(w / 2);
    px(cx - 2, 3, col, 4, 4);
    px(cx - 3, 7, col, 6, 8);
    px(cx - 3, 7, shade, 1, 8);
    px(cx - 3, 15, col, 2, 5);
    px(cx + 1, 15, col, 2, 5);
    px(cx - 5, h - 3, shade, 10, 3);
  };

  switch (piece.art.motif) {
    case 'portrait':
      px(0, 0, p0, w, h);
      dabs(w * 2, [p0, p3]);
      px(w / 2 - 4, h * 0.55, p1, 9, h * 0.45);
      px(w / 2 - 3, h * 0.25, p2, 6, 7);
      px(w / 2 - 4, h * 0.2, p3, 8, 3);
      px(w / 2 + 1, h * 0.35, '#0B0B0F');
      break;
    case 'figures':
      px(0, 0, p0, w, h * 0.5);
      px(0, h * 0.5, p1, w, h * 0.5);
      dabs(w * 3, [p0, p1, p3]);
      for (let i = 0; i < 4; i++) figure(3 + i * (w / 4.5) + r() * 2, h * 0.35 + r() * 3, 2, [p2, p3, p1][i % 3], p3);
      break;
    case 'landscape':
      px(0, 0, p0, w, h * 0.45);
      px(0, h * 0.45, p1, w, h * 0.55);
      dabs(w * 4, [p1, p3], h * 0.45, h);
      dabs(w * 2, [p0, p3], 0, h * 0.45);
      px(w * 0.7, h * 0.1, p2, 3, h * 0.7);
      px(w * 0.7 - 1, h * 0.3, p2, 5, h * 0.4);
      break;
    case 'water':
      for (let y = 0; y < h; y++) px(0, y, y % 3 ? p0 : p1, w, 1);
      dabs(w * 2, [p2]);
      for (let i = 0; i < w / 3; i++) px(r() * w, r() * h, p3, 2, 1);
      if (piece.id.includes('bridge')) for (let x = 0; x < w; x++) px(x, 5 + Math.round(Math.abs(x - w / 2) / 4), p2, 1, 2);
      break;
    case 'night':
      px(0, 0, p0, w, h);
      dabs(w * 2, [p1]);
      for (let i = 0; i < 7; i++) {
        const x = r() * w;
        const y = r() * h * 0.45;
        px(x, y, p2);
        px(x - 1, y, 'rgba(246,227,161,0.4)');
        px(x + 1, y, 'rgba(246,227,161,0.4)');
      }
      for (let i = 0; i < 5; i++) px(3 + i * (w / 5), h * 0.65, p2, 1, h * 0.3);
      px(0, h * 0.6, p3, w, 1);
      break;
    case 'interior':
      px(0, 0, p0, w, h * 0.6);
      px(0, h * 0.6, p1, w, h * 0.4);
      px(w * 0.15, h * 0.4, p2, w * 0.35, h * 0.35);
      px(w * 0.6, h * 0.2, p3, w * 0.2, h * 0.25);
      dabs(w * 2, [p0, p1, p3]);
      break;
    case 'street':
      px(0, 0, p0, w, h * 0.45);
      px(0, h * 0.45, p3, w, h * 0.55);
      dabs(w * 3, [p0, p2], h * 0.45, h);
      for (const x of [w * 0.2, w * 0.55, w * 0.8]) {
        px(x - 3, h * 0.42, p1, 7, 2);
        px(x, h * 0.44, p1, 1, 6);
        px(x - 1, h * 0.55, p1, 3, 6);
      }
      break;
    case 'still':
      px(0, 0, p0, w, h * 0.55);
      px(0, h * 0.55, p3, w, h * 0.45);
      for (let i = 0; i < 5; i++) {
        const x = 3 + i * (w / 5.5);
        px(x, h * 0.5, p1, 3, 3);
        px(x + 1, h * 0.5, '#E86A4A');
      }
      px(w * 0.55, h * 0.62, p2, 6, 2);
      break;
    case 'ship':
      px(0, 0, p1, w, h * 0.55);
      px(0, h * 0.55, p3, w, h * 0.45);
      dabs(w * 3, [p1, p3, p0]);
      px(w * 0.25, h * 0.55, p0, w * 0.45, 3);
      px(w * 0.45, h * 0.1, p0, 1, h * 0.45);
      px(w * 0.45, h * 0.15, p2, 5, h * 0.3);
      for (let i = 0; i < 4; i++) px(w * 0.28 + i * 3, h * 0.42, p2, 1, 3);
      break;
    case 'temple':
      px(0, 0, p2, w, h * 0.5);
      px(0, h * 0.5, p1, w, h * 0.5);
      px(w * 0.15, h * 0.2, p0, w * 0.25, h * 0.6);
      px(w * 0.45, h * 0.3, p0, w * 0.4, h * 0.5);
      px(w * 0.45, h * 0.3, p3, w * 0.4, 1);
      for (let x = w * 0.5; x < w * 0.85; x += 3) px(x, h * 0.35, p1, 1, h * 0.45);
      break;
    case 'bear':
      px(0, 0, p0, w, h);
      px(w * 0.2, h * 0.35, p1, w * 0.55, h * 0.3);
      px(w * 0.7, h * 0.4, p1, w * 0.15, h * 0.2);
      for (const x of [0.22, 0.35, 0.55, 0.66]) px(w * x, h * 0.62, p1, 2, h * 0.18);
      px(0, h * 0.82, p3, w, h * 0.18);
      break;
    case 'gate':
      px(0, 0, p3, w, h);
      px(2, 4, p0, w - 4, h - 6);
      px(w / 2, 6, p3, 1, h - 8);
      dabs(w * 6, [p1, p2], 5, h - 3);
      px(w / 2 - 1, 1, p2, 3, 3);
      break;
    case 'swirl':
      // A night sky of rolling eddies over a dark village and a flame-like cypress.
      px(0, 0, p0, w, h);
      for (let k = 0; k < 3; k++) {
        const cx = w * (0.25 + k * 0.25);
        const cy = h * (0.25 + (k % 2) * 0.1);
        for (let a = 0; a < 14; a++) {
          const t = (a / 14) * Math.PI * 2;
          const rr = 2 + a / 5;
          px(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.6, a % 3 ? p1 : p2);
        }
      }
      px(w * 0.85, h * 0.12, p2, 3, 3);
      for (let i = 0; i < 6; i++) px(r() * w, r() * h * 0.45, p2);
      px(0, h * 0.68, p1, w, h * 0.32);
      for (let x = 2; x < w; x += 4) px(x, h * 0.7, '#0B0B0F', 2, 2);
      for (let y = h * 0.15; y < h; y++) px(w * 0.12 - (h - y) / 8, y, p3, 2 + (y - h * 0.15) / 6, 1);
      break;
    case 'clocks':
      px(0, 0, p1, w, h * 0.6);
      px(0, h * 0.6, p0, w, h * 0.4);
      px(w * 0.05, h * 0.45, p3, w * 0.3, h * 0.15);
      px(w * 0.15, h * 0.2, p3, 1, h * 0.25);
      for (const [x, y, ww] of [[w * 0.12, h * 0.25, 6], [w * 0.4, h * 0.62, 7], [w * 0.65, h * 0.4, 6]] as [number, number, number][]) {
        px(x, y, p2, ww, 3);
        px(x + ww - 2, y + 3, p2, 2, 3);
        px(x + 2, y + 1, '#0B0B0F');
      }
      break;
    case 'cans':
      px(0, 0, p0, w, h);
      for (let y = 1; y < h - 4; y += 7) {
        for (let x = 1; x < w - 3; x += 5) {
          px(x, y, p1, 4, 3);
          px(x, y + 3, p0, 4, 1);
          px(x, y + 4, p3, 4, 1);
          px(x + 1, y + 1, p2, 2, 1);
        }
      }
      break;
    case 'grid':
      px(0, 0, p0, w, h);
      for (let k = 2; k < w; k += 5) px(k, 0, p1, 1, h);
      for (let k = 3; k < h; k += 6) px(0, k, p1, w, 1);
      for (let i = 0; i < w; i++) {
        const x = Math.floor(r() * w);
        const y = Math.floor(r() * h);
        px(x, y, [p2, p3, '#BDB8B0'][i % 3]);
      }
      px(w * 0.3, h * 0.35, p2, 4, 3);
      px(w * 0.6, h * 0.6, p3, 3, 4);
      break;
    case 'stone':
      px(0, 0, p0, w, h);
      for (let y = 3; y < h - 2; y++) {
        const inset = y < h * 0.3 ? Math.round((h * 0.3 - y) / 2) : 0;
        px(3 + inset, y, p1, w - 6 - inset * 2, 1);
      }
      for (let y = 5; y < h - 3; y += 2) {
        const band = y < h * 0.4 ? p3 : y < h * 0.65 ? p2 : p3;
        for (let x = 5; x < w - 5; x++) if (r() > 0.45) px(x, y, band);
      }
      break;
    case 'wave':
      px(0, 0, p0, w, h);
      px(w * 0.68, h * 0.55, p3, 6, 3);
      px(w * 0.7, h * 0.48, p2, 3, 2);
      for (let x = 0; x < w * 0.55; x++) {
        const top = h * 0.25 + Math.abs(x - w * 0.3) * 0.5;
        px(x, top, p1, 1, h - top);
      }
      for (let k = 0; k < 7; k++) px(w * 0.15 + k * 2, h * 0.2 + (k % 2), p2, 2, 2);
      px(0, h * 0.8, p1, w, h * 0.2);
      dabs(w, [p2, p3], h * 0.6, h);
      for (const x of [0.2, 0.5, 0.75]) px(w * x, h * 0.72, p0, 5, 1);
      break;
    case 'helmet':
      px(0, 0, p0, w, h);
      px(w * 0.25, h * 0.15, p1, w * 0.5, h * 0.7);
      px(w * 0.25, h * 0.15, p2, w * 0.5, 2);
      px(w * 0.48, h * 0.15, p2, 2, h * 0.5);
      px(w * 0.32, h * 0.4, '#0B0B0F', 4, 2);
      px(w * 0.56, h * 0.4, '#0B0B0F', 4, 2);
      px(w * 0.47, h * 0.45, p2, 3, 6);
      px(w * 0.3, h * 0.66, p3, w * 0.4, h * 0.19);
      dabs(w * 2, [p3, p1], h * 0.15, h * 0.85);
      break;
    case 'horse':
      px(0, 0, p0, w, h);
      px(w * 0.3, h * 0.35, p1, w * 0.45, h * 0.22);
      px(w * 0.62, h * 0.12, p1, 4, h * 0.3);
      px(w * 0.66, h * 0.1, p1, 4, 3);
      px(w * 0.6, h * 0.15, p2, 2, h * 0.2);
      for (const x of [0.33, 0.42]) px(w * x, h * 0.55, p1, 2, h * 0.35);
      for (const x of [0.62, 0.7]) px(w * x, h * 0.4 - 4, p1, 2, 5);
      px(w * 0.25, h * 0.4, p2, 2, h * 0.3);
      break;
    case 'bird':
      px(0, 0, p0, w, h);
      dabs(w * 2, [p2, p3]);
      px(w * 0.4, h * 0.45, p1, w * 0.25, h * 0.2);
      for (let k = 0; k < 8; k++) px(w * 0.2 + k * 1.5, h * 0.2 + k * 0.8, p1, 3, 2);
      for (let k = 0; k < 6; k++) px(w * 0.62 + k, h * 0.25 + k, p1, 2, 2);
      px(w * 0.62, h * 0.25, p1, 1, h * 0.2);
      px(w * 0.6, h * 0.22, '#E8A03A', 2, 1);
      px(0, h * 0.8, p3, w, h * 0.2);
      break;
    case 'shell':
      px(0, 0, p0, w, h * 0.55);
      px(0, h * 0.55, p3, w, h * 0.45);
      for (let y = h * 0.55; y < h; y += 3) px(0, y, p0, w, 1);
      for (let k = 0; k < 9; k++) px(w * 0.35 + k, h * 0.85 - Math.abs(k - 4), p2, 1, 2 + Math.abs(k - 4));
      px(w * 0.45, h * 0.3, p1, 3, h * 0.45);
      px(w * 0.44, h * 0.18, p1, 4, 4);
      px(w * 0.42, h * 0.16, p2, 6, h * 0.35);
      px(w * 0.1, h * 0.15, p1, 4, 6);
      px(w * 0.82, h * 0.25, p3, 3, h * 0.4);
      break;
    case 'fresco':
      // Two reclining figures reaching across a gap.
      px(0, 0, p0, w, h);
      dabs(w * 2, [p0, p3]);
      px(w * 0.05, h * 0.55, p1, w * 0.3, 3);
      px(w * 0.08, h * 0.45, p1, 3, 3);
      px(w * 0.3, h * 0.48, p1, w * 0.15, 1);
      px(w * 0.55, h * 0.3, p2, w * 0.38, h * 0.45);
      px(w * 0.82, h * 0.4, '#E8E2D0', 3, 3);
      px(w * 0.48, h * 0.45, p1, w * 0.1, 1);
      break;
    case 'sculpture':
    default:
      px(0, 0, p0, w, h);
      statue(p1, p2);
      break;
  }
  return cv;
}
