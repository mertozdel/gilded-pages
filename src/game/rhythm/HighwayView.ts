/**
 * The note highway, drawn on a 2D canvas over the venue. Themable: the village fest's wooden
 * fretboard (frets, strings, gold note heads, blue-and-white diamond edges) or the neon
 * festival's LED grid (glowing notes, turntables at the strike line). Notes fall towards the
 * strike line at the bottom; each lane can also carry a shape (colour-blind safe).
 */
import type { ChartNote } from './Chart';
import type { Grade, Judge } from './Judge';

export type HighwayThemeId = 'bavaria' | 'neon-china';
type Shape = 'circle' | 'diamond' | 'square' | 'triangle';
const SHAPES: Shape[] = ['circle', 'diamond', 'square', 'triangle'];
/** Okabe–Ito based: told apart by colour-blind players too (and the shapes help). */
const NEON = ['#FF6FD8', '#56B4E9', '#F0E442', '#3DDC97'];
const GRADE_COLOR: Record<Grade, string> = { perfect: '#F6E3A1', great: '#8FE3FF', good: '#B7F5A0', miss: '#FF7A8A' };

export interface HighwayFrame {
  /** Song time to draw (the visual offset applied). */
  songMs: number;
  notes: ChartNote[];
  judge: Judge;
  lanes: number;
  flip: boolean;
  shapes: boolean;
  /** Scroll speed multiplier. */
  speed: number;
  laneDown: boolean[];
  flashes: { lane: number; grade: Grade; at: number }[];
  beatMs: number;
  offsetMs: number;
  beatsPerBar: number;
  star: boolean;
  reduceFlashing: boolean;
  /** Lane labels at the strike line (keys). */
  labels: string[];
}

/** Note-head sprites: drawn at radius HEAD_R on a HEAD_SPRITE-px canvas (room for the glow). */
const HEAD_R = 48;
const HEAD_SPRITE = 192;

export class HighwayView {
  private w = 0;
  private h = 0;
  private readonly heads = new Map<string, HTMLCanvasElement>();
  private dots: HTMLCanvasElement | null = null;
  private dotsKey = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly theme: HighwayThemeId,
  ) {}

  private fit(): CanvasRenderingContext2D {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.w = r.width;
    this.h = r.height;
    const c = this.canvas.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  render(f: HighwayFrame): void {
    const c = this.fit();
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    const strikeY = h * 0.86;
    const topY = h * 0.02;
    const lookahead = 1700 / f.speed;
    const laneW = Math.min(110, (w * 0.86) / f.lanes);
    const half = (laneW * f.lanes) / 2;
    const cx = w / 2;
    /** Perspective: narrower towards the top. */
    const k = (y: number) => 0.62 + 0.38 * Math.min(1, Math.max(0, (y - topY) / (strikeY - topY)));
    const yOf = (t: number) => strikeY - ((t - f.songMs) / lookahead) * (strikeY - topY);
    const col = (lane: number) => (f.flip ? f.lanes - 1 - lane : lane);
    const xOf = (lane: number, y: number) => cx + (col(lane) - (f.lanes - 1) / 2) * laneW * k(y);
    const edge = (side: -1 | 1, y: number) => cx + side * half * k(y);

    // The board.
    c.save();
    c.beginPath();
    c.moveTo(edge(-1, topY), topY);
    c.lineTo(edge(1, topY), topY);
    c.lineTo(edge(1, h), h);
    c.lineTo(edge(-1, h), h);
    c.closePath();
    if (this.theme === 'bavaria') {
      const g = c.createLinearGradient(0, topY, 0, h);
      g.addColorStop(0, 'rgba(58,36,20,0.55)');
      g.addColorStop(1, 'rgba(92,58,32,0.92)');
      c.fillStyle = g;
    } else {
      const g = c.createLinearGradient(0, topY, 0, h);
      g.addColorStop(0, 'rgba(8,6,28,0.45)');
      g.addColorStop(1, 'rgba(10,8,36,0.9)');
      c.fillStyle = g;
    }
    c.fill();
    c.clip();

    // Beat lines: frets on the fretboard, LED rows on the grid.
    const firstBeat = Math.floor((f.songMs - f.offsetMs) / f.beatMs);
    for (let b = firstBeat; ; b++) {
      const t = f.offsetMs + b * f.beatMs;
      const y = yOf(t);
      if (y < topY) break;
      if (y > h) continue;
      const bar = ((b % f.beatsPerBar) + f.beatsPerBar) % f.beatsPerBar === 0;
      c.beginPath();
      c.moveTo(edge(-1, y), y);
      c.lineTo(edge(1, y), y);
      if (this.theme === 'bavaria') {
        c.strokeStyle = bar ? 'rgba(227,193,111,0.75)' : 'rgba(200,170,120,0.35)';
        c.lineWidth = bar ? 3 : 1.5;
      } else {
        c.strokeStyle = bar ? 'rgba(86,180,233,0.6)' : 'rgba(255,111,216,0.22)';
        c.lineWidth = bar ? 2 : 1;
      }
      c.stroke();
    }
    if (this.theme === 'neon-china') {
      // The LED dots, brighter on the beat.
      const phase = ((f.songMs - f.offsetMs) / f.beatMs) % 1;
      const glow = f.reduceFlashing ? 0.18 : 0.12 + 0.25 * Math.max(0, 1 - phase * 3);
      const key = `${w}x${h}`;
      if (this.dotsKey !== key) {
        // The dot grid is drawn once per size, then shown at the beat's brightness.
        const dpr = window.devicePixelRatio || 1;
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        const d = cv.getContext('2d')!;
        d.scale(dpr, dpr);
        d.fillStyle = 'rgb(180,140,255)';
        for (let y = topY + 8; y < h; y += 22) for (let x = edge(-1, y) + 8; x < edge(1, y); x += 22 * k(y)) d.fillRect(x, y, 2, 2);
        this.dots = cv;
        this.dotsKey = key;
      }
      c.globalAlpha = glow;
      c.drawImage(this.dots!, 0, 0, w, h);
      c.globalAlpha = 1;
    }
    // Strings / lane lines.
    for (let l = 0; l < f.lanes; l++) {
      c.beginPath();
      c.moveTo(xOf(l, topY), topY);
      c.lineTo(xOf(l, h), h);
      if (this.theme === 'bavaria') {
        c.strokeStyle = 'rgba(232,226,214,0.75)';
        c.lineWidth = 1 + (f.lanes - 1 - col(l)) * 0.7;
      } else {
        c.strokeStyle = NEON[l % 4];
        c.globalAlpha = 0.35;
        c.lineWidth = 1.5;
      }
      c.stroke();
      c.globalAlpha = 1;
    }
    c.restore();

    // The edges: blue-and-white diamonds (Bavaria) or neon rails.
    for (const side of [-1, 1] as const) {
      if (this.theme === 'bavaria') {
        const size = 12;
        const scroll = ((f.songMs / 6) % (size * 2)) - size * 2;
        for (let y = topY + scroll, i = 0; y < h + size; y += size, i++) {
          const x = edge(side, y) + side * 7 * k(y);
          const s = size * 0.55 * k(y);
          c.beginPath();
          c.moveTo(x, y - s);
          c.lineTo(x + s, y);
          c.lineTo(x, y + s);
          c.lineTo(x - s, y);
          c.closePath();
          c.fillStyle = i % 2 ? '#F4F4F4' : '#2F6DB5';
          c.fill();
        }
      } else {
        c.beginPath();
        c.moveTo(edge(side, topY), topY);
        c.lineTo(edge(side, h), h);
        c.strokeStyle = side < 0 ? '#FF6FD8' : '#56B4E9';
        // The glow: a wide faint line under the bright one (cheaper than a canvas blur).
        c.globalAlpha = f.reduceFlashing ? 0.15 : 0.28;
        c.lineWidth = 12;
        c.stroke();
        c.globalAlpha = 1;
        c.lineWidth = 3;
        c.stroke();
      }
    }

    // The strike line: brass targets, or turntables (decks) and knobs (FX).
    c.beginPath();
    c.moveTo(edge(-1, strikeY), strikeY);
    c.lineTo(edge(1, strikeY), strikeY);
    c.strokeStyle = this.theme === 'bavaria' ? '#E3C16F' : 'rgba(255,255,255,0.8)';
    c.lineWidth = 3;
    c.stroke();
    for (let l = 0; l < f.lanes; l++) {
      const x = xOf(l, strikeY);
      const r = laneW * 0.36;
      const down = f.laneDown[l];
      if (this.theme === 'neon-china') {
        const deck = l === 0 || l === f.lanes - 1;
        c.beginPath();
        c.arc(x, strikeY, deck ? r : r * 0.7, 0, Math.PI * 2);
        c.fillStyle = down ? 'rgba(255,255,255,0.25)' : 'rgba(12,10,30,0.8)';
        c.fill();
        c.strokeStyle = NEON[l % 4];
        c.lineWidth = 2;
        c.stroke();
        if (deck) {
          // A spinning record.
          const a = (f.songMs / 600) * Math.PI * 2 * (l === 0 ? 1 : -1);
          c.beginPath();
          c.moveTo(x, strikeY);
          c.lineTo(x + Math.cos(a) * r * 0.85, strikeY + Math.sin(a) * r * 0.85);
          c.stroke();
          c.beginPath();
          c.arc(x, strikeY, r * 0.22, 0, Math.PI * 2);
          c.fillStyle = NEON[l % 4];
          c.fill();
        }
      } else {
        c.beginPath();
        c.arc(x, strikeY, r, 0, Math.PI * 2);
        c.fillStyle = down ? 'rgba(246,227,161,0.45)' : 'rgba(30,20,12,0.55)';
        c.fill();
        c.strokeStyle = '#E3C16F';
        c.lineWidth = 2;
        c.stroke();
      }
      if (f.shapes) this.shape(c, SHAPES[l % 4], x, strikeY, r * 0.38, 'rgba(255,255,255,0.55)', false);
      if (f.labels[l]) {
        c.fillStyle = 'rgba(242,237,228,0.85)';
        c.font = `600 ${Math.round(laneW * 0.15)}px Silkscreen, monospace`;
        c.textAlign = 'center';
        c.fillText(f.labels[l], x, strikeY + r + 16);
      }
    }

    // The notes, far ones first.
    const until = f.songMs + lookahead;
    for (let i = f.notes.length - 1; i >= 0; i--) {
      const n = f.notes[i];
      if (n.t > until) continue;
      const end = n.t + (n.len ?? 0);
      if (end < f.songMs - 300) continue;
      const s = f.judge.state(i);
      const y = yOf(n.t);
      const headDone = s.head === 'hit';
      if (n.type === 'fade') {
        if (s.head !== 'pending') continue;
        this.fadeArrow(c, n.dir!, y, edge(-1, y), edge(1, y), k(y));
        continue;
      }
      const color = this.theme === 'bavaria' ? '#E3C16F' : NEON[n.lane % 4];
      const r = laneW * 0.32 * k(y);
      if (n.len) {
        // The tail: held, scratched, or sliding to the next lane.
        const y2 = yOf(end);
        const from = headDone ? Math.min(y, strikeY) : y;
        const lane2 = n.type === 'slide' ? n.lane2! : n.lane;
        const failed = s.tail === 'failed';
        c.save();
        c.globalAlpha = failed ? 0.25 : 0.85;
        c.strokeStyle = color;
        c.lineCap = 'round';
        c.lineWidth = r * 0.7;
        c.beginPath();
        if (n.type === 'scratch') {
          const steps = Math.max(4, Math.round((from - y2) / 14));
          for (let j = 0; j <= steps; j++) {
            const yy = from + ((y2 - from) * j) / steps;
            const xx = xOf(n.lane, yy) + (j % 2 ? 1 : -1) * r * 0.5;
            if (j) c.lineTo(xx, yy);
            else c.moveTo(xx, yy);
          }
        } else {
          c.moveTo(xOf(n.lane, from), from);
          c.lineTo(xOf(lane2, y2), y2);
        }
        if (this.theme === 'neon-china') {
          // The neon glow, faked with a wider faint stroke underneath.
          const a = c.globalAlpha;
          c.globalAlpha = a * (f.reduceFlashing ? 0.18 : 0.3);
          c.lineWidth = r * 1.5;
          c.stroke();
          c.globalAlpha = a;
          c.lineWidth = r * 0.7;
        }
        c.stroke();
        c.restore();
        if (n.type === 'slide' && s.second === 'pending') this.head(c, f, lane2, y2, r * 0.8, NEON[lane2 % 4], xOf);
      }
      if (!headDone && s.head === 'pending') {
        this.head(c, f, n.lane, y, r, color, xOf);
        if (n.type === 'double') {
          c.beginPath();
          c.moveTo(xOf(n.lane, y), y);
          c.lineTo(xOf(n.lane2!, y), y);
          c.strokeStyle = color;
          c.lineWidth = 3;
          c.stroke();
          if (s.second === 'pending') this.head(c, f, n.lane2!, y, r, this.theme === 'bavaria' ? color : NEON[n.lane2! % 4], xOf);
        }
      }
    }

    // Judgments over the strike line.
    for (const fl of f.flashes) {
      const age = f.songMs - fl.at;
      if (age < 0 || age > 450) continue;
      const x = fl.lane < 0 ? cx : xOf(fl.lane, strikeY);
      c.globalAlpha = 1 - age / 450;
      c.fillStyle = GRADE_COLOR[fl.grade];
      c.font = `400 ${Math.round(laneW * 0.22)}px Limelight, Georgia, serif`;
      c.textAlign = 'center';
      c.fillText(fl.grade === 'perfect' ? 'Perfect' : fl.grade === 'great' ? 'Great' : fl.grade === 'good' ? 'Good' : 'Miss', x, strikeY - laneW * 0.55 - age / 12);
      c.globalAlpha = 1;
    }

    // Star power: a steady glow around the board (no strobe).
    if (f.star) {
      c.save();
      c.strokeStyle = this.theme === 'bavaria' ? 'rgba(246,227,161,0.9)' : 'rgba(255,111,216,0.9)';
      c.lineWidth = 6;
      c.shadowColor = c.strokeStyle;
      c.shadowBlur = f.reduceFlashing ? 8 : 24;
      c.beginPath();
      c.moveTo(edge(-1, topY), topY);
      c.lineTo(edge(-1, h), h);
      c.moveTo(edge(1, topY), topY);
      c.lineTo(edge(1, h), h);
      c.stroke();
      c.restore();
    }
  }

  /** A note head drawn once (gradient, glow, shape) at a large size, then scaled for every note. */
  private headSprite(f: HighwayFrame, lane: number, color: string): HTMLCanvasElement {
    const shape = f.shapes ? SHAPES[lane % 4] : 'none';
    const key = `${this.theme}|${color}|${shape}|${f.reduceFlashing ? 1 : 0}`;
    let cv = this.heads.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = HEAD_SPRITE;
    const c = cv.getContext('2d')!;
    const R = HEAD_R;
    const x = HEAD_SPRITE / 2;
    const y = HEAD_SPRITE / 2;
    if (this.theme === 'bavaria') {
      const g = c.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
      g.addColorStop(0, '#FFF4C8');
      g.addColorStop(0.6, '#E3C16F');
      g.addColorStop(1, '#8A6A2A');
      c.beginPath();
      c.arc(x, y, R, 0, Math.PI * 2);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = '#4A3218';
      c.lineWidth = 2 * (R / 24);
      c.stroke();
    } else {
      c.shadowColor = color;
      c.shadowBlur = (f.reduceFlashing ? 6 : 16) * (R / 24);
      c.beginPath();
      c.roundRect(x - R * 1.1, y - R * 0.55, R * 2.2, R * 1.1, R * 0.4);
      c.fillStyle = color;
      c.fill();
      c.shadowBlur = 0;
    }
    if (f.shapes) this.shape(c, SHAPES[lane % 4], x, y, R * 0.42, this.theme === 'bavaria' ? '#4A3218' : '#0B0B1E', true);
    this.heads.set(key, cv);
    return cv;
  }

  private head(c: CanvasRenderingContext2D, f: HighwayFrame, lane: number, y: number, r: number, color: string, xOf: (l: number, y: number) => number): void {
    const x = xOf(lane, y);
    const size = (HEAD_SPRITE * r) / HEAD_R;
    c.drawImage(this.headSprite(f, lane, color), x - size / 2, y - size / 2, size, size);
  }

  private shape(c: CanvasRenderingContext2D, s: Shape, x: number, y: number, r: number, color: string, fill: boolean): void {
    c.beginPath();
    if (s === 'circle') c.arc(x, y, r, 0, Math.PI * 2);
    else if (s === 'square') c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    else if (s === 'diamond') {
      c.moveTo(x, y - r * 1.15);
      c.lineTo(x + r * 1.15, y);
      c.lineTo(x, y + r * 1.15);
      c.lineTo(x - r * 1.15, y);
      c.closePath();
    } else {
      c.moveTo(x, y - r * 1.1);
      c.lineTo(x + r * 1.1, y + r * 0.9);
      c.lineTo(x - r * 1.1, y + r * 0.9);
      c.closePath();
    }
    if (fill) {
      c.fillStyle = color;
      c.fill();
    } else {
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.stroke();
    }
  }

  /** A crossfade: an arrow band across the whole highway. */
  private fadeArrow(c: CanvasRenderingContext2D, dir: 'L' | 'R', y: number, x0: number, x1: number, k: number): void {
    const hgt = 26 * k;
    const s = dir === 'R' ? 1 : -1;
    const [a, b] = dir === 'R' ? [x0 + 10, x1 - 10] : [x1 - 10, x0 + 10];
    c.save();
    c.fillStyle = 'rgba(240,228,66,0.85)';
    c.shadowColor = '#F0E442';
    c.shadowBlur = 10;
    c.beginPath();
    c.moveTo(a, y - hgt * 0.3);
    c.lineTo(b - s * hgt, y - hgt * 0.3);
    c.lineTo(b - s * hgt, y - hgt * 0.6);
    c.lineTo(b, y);
    c.lineTo(b - s * hgt, y + hgt * 0.6);
    c.lineTo(b - s * hgt, y + hgt * 0.3);
    c.lineTo(a, y + hgt * 0.3);
    c.closePath();
    c.fill();
    c.fillStyle = '#1A1A2E';
    c.font = `700 ${Math.round(hgt * 0.55)}px Silkscreen, monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(dir === 'R' ? '→ CROSSFADE' : 'CROSSFADE ←', (a + b) / 2, y);
    c.restore();
  }
}
