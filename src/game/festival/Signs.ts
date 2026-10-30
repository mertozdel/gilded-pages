/**
 * Clean lettering over the venue art: each sign is drawn flat, then mapped onto its quad of
 * the picture (top-left, top-right, bottom-right, bottom-left — signs sit at an angle in the
 * isometric art), covering the art's own garbled lettering.
 */
import type { Pt } from './FestivalMap';

export type SignStyle = 'wood' | 'neon-v' | 'led' | 'banner';

/** Supersampling of the sign canvases (frame px → canvas px). */
const SS = 3;

/**
 * Draws a sign into a canvas covering the quad's bounding box. Returns the canvas and its
 * top-left in frame px.
 */
export function signCanvas(quad: Pt[], style: SignStyle, text: string, opts: { glow?: number } = {}): { canvas: HTMLCanvasElement; x: number; y: number } {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)) - 4;
  const y0 = Math.floor(Math.min(...ys)) - 4;
  const w = Math.ceil(Math.max(...xs)) - x0 + 8;
  const h = Math.ceil(Math.max(...ys)) - y0 + 8;
  const cv = document.createElement('canvas');
  cv.width = w * SS;
  cv.height = h * SS;
  const c = cv.getContext('2d')!;
  const [tl, tr, , bl] = quad;
  // Flat sign of size (W, H), mapped onto the quad: u along TL→TR, v along TL→BL.
  const W = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const H = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  c.scale(SS, SS);
  c.translate(-x0, -y0);
  c.transform((tr.x - tl.x) / W, (tr.y - tl.y) / W, (bl.x - tl.x) / H, (bl.y - tl.y) / H, tl.x, tl.y);
  drawFlat(c, style, text, W, H, opts.glow ?? 1);
  return { canvas: cv, x: x0, y: y0 };
}

export const SIGN_SUPERSAMPLE = SS;

function drawFlat(c: CanvasRenderingContext2D, style: SignStyle, text: string, W: number, H: number, glow: number): void {
  const lines = text.split('|');
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  switch (style) {
    case 'wood': {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#6B4A2E');
      g.addColorStop(1, '#4A3020');
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(0, 0, W, H, 2);
      c.fill();
      c.strokeStyle = '#2A1A10';
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = '#F2E2C4';
      fitText(c, lines[0], W * 0.88, H * 0.66, '600', '"EB Garamond", Georgia, "Noto Serif SC", serif');
      c.fillText(lines[0], W / 2, H / 2 + 0.5);
      break;
    }
    case 'banner': {
      c.fillStyle = '#5A3A22';
      c.beginPath();
      c.roundRect(0, 0, W, H, 6);
      c.fill();
      // Blue-and-white diamonds along the top and bottom.
      const d = H * 0.14;
      for (let x = 0, i = 0; x < W; x += d * 2, i++) {
        for (const y of [d * 0.9, H - d * 0.9]) {
          c.beginPath();
          c.moveTo(x + d, y - d * 0.7);
          c.lineTo(x + d * 2, y);
          c.lineTo(x + d, y + d * 0.7);
          c.lineTo(x, y);
          c.closePath();
          c.fillStyle = i % 2 ? '#F4F4F4' : '#2F6DB5';
          c.fill();
        }
      }
      c.fillStyle = '#F6E3A1';
      fitText(c, lines[0], W * 0.84, H * 0.5, '400', 'Limelight, Georgia, serif');
      c.fillText(lines[0], W / 2, H / 2 + 1);
      break;
    }
    case 'neon-v': {
      c.fillStyle = 'rgba(14,10,34,0.96)';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,111,216,0.8)';
      c.lineWidth = 1;
      c.strokeRect(1, 1, W - 2, H - 2);
      const chars = [...lines[0]].filter((ch) => ch.trim());
      const step = H / chars.length;
      const size = Math.min(W * 0.8, step * 0.82);
      c.font = `700 ${size}px "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif`;
      c.shadowColor = '#FF6FD8';
      c.shadowBlur = 6 * glow;
      c.fillStyle = '#FFD1F4';
      chars.forEach((ch, i) => c.fillText(ch, W / 2, step * (i + 0.5)));
      c.shadowBlur = 0;
      break;
    }
    case 'led': {
      c.fillStyle = '#07061A';
      c.fillRect(0, 0, W, H);
      // The LED dot grid.
      c.fillStyle = 'rgba(120,90,200,0.35)';
      for (let y = 3; y < H; y += 4) for (let x = 3; x < W; x += 4) c.fillRect(x, y, 1.2, 1.2);
      c.shadowColor = '#FF6FD8';
      c.shadowBlur = 8 * glow;
      c.fillStyle = '#FF9BE6';
      const size = Math.min(H * 0.62, (W * 0.9) / Math.max(1, [...lines[0]].length));
      c.font = `700 ${size}px "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif`;
      c.fillText(lines[0], W / 2, H / 2);
      if (lines[1]) {
        c.shadowColor = '#56B4E9';
        c.fillStyle = '#BDEBFF';
        c.font = `600 ${H * 0.12}px Silkscreen, monospace`;
        c.fillText(lines[1], W / 2, H * 0.86);
      }
      c.shadowBlur = 0;
      break;
    }
  }
}

/** Shrinks the font until the text fits the width. */
function fitText(c: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: string, family: string): void {
  let s = size;
  c.font = `${weight} ${s}px ${family}`;
  while (s > 4 && c.measureText(text).width > maxW) {
    s *= 0.92;
    c.font = `${weight} ${s}px ${family}`;
  }
}
