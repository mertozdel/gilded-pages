/**
 * Reaction bubbles over the crowd painted in the venue art: hearts, notes, stars, faces and
 * raised mugs (lightning at the neon festival) pop up over people's heads as the notes land.
 * A combo, star power and a cleared song set off celebration bubbles with a burst of confetti;
 * a run of misses gets a worried face. Pictures only, no words. Between songs the crowd still
 * chats now and then. Each kind is drawn once into a texture; bubbles and confetti come from
 * small pools and are moved by hand every frame (no tweens to pile up).
 */
import Phaser from 'phaser';
import type { Pt } from './FestivalMap';

type Kind = 'heart' | 'note' | 'star' | 'smile' | 'wow' | 'sad' | 'mug' | 'clink' | 'bolt' | 'stick' | 'fire' | 'party';
export type BubbleLook = 'paper' | 'neon';

const KINDS: Record<BubbleLook, { react: Kind[]; hype: Kind[]; party: Kind[] }> = {
  paper: { react: ['heart', 'note', 'star', 'smile', 'wow', 'mug'], hype: ['mug', 'clink', 'heart', 'star'], party: ['party', 'clink', 'star', 'heart'] },
  neon: { react: ['heart', 'note', 'star', 'smile', 'wow', 'bolt'], hype: ['stick', 'bolt', 'fire'], party: ['party', 'fire', 'stick', 'star'] },
};

/** The bubble, in frame px. */
const W = 46;
const H = 38;
const TAIL = 9;
const PAD = 5;
const SS = 3;
const TAU = Math.PI * 2;
const MAX_ALIVE = 8;
const MIN_GAP_MS = 160;
/** Two bubbles never pop up this close together. */
const SPACING = 64;
const DEPTH = 10_000;
const GRAVITY = 900;

interface Bubble {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  t: number;
  life: number;
  scale: number;
  pulse: number;
  sway: number;
}

interface Bit {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  vr: number;
  t: number;
  life: number;
}

export class Reactions {
  private readonly alive: Bubble[] = [];
  private readonly spareBubbles: Bubble[] = [];
  private readonly bits: Bit[] = [];
  private readonly spareBits: Bit[] = [];
  private readonly recent: number[] = [];
  private now = 0;
  private last = -Infinity;
  private ambientIn = 900;
  private ambient = true;
  private hype = false;
  private count = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly root: Phaser.GameObjects.Container,
    private readonly anchors: Pt[],
    private readonly look: BubbleLook,
    private readonly colors: string[],
    private reduced: boolean,
  ) {}

  /** How many bubbles have popped up so far (for the tests). */
  get shown(): number {
    return this.count;
  }

  setReduced(on: boolean): void {
    this.reduced = on;
  }

  /** Between songs (select, results) the crowd chats on its own now and then. */
  setAmbient(on: boolean): void {
    this.ambient = on;
  }

  /** Star power: the crowd raises its mugs (glow sticks), and reacts more. */
  setHype(on: boolean): void {
    this.hype = on;
  }

  /** Someone in the crowd reacts. Returns false when it's too busy for another bubble. */
  react(): boolean {
    const set = KINDS[this.look];
    const kinds = this.hype && Math.random() < 0.6 ? set.hype : set.react;
    return this.pop(pick(kinds), false);
  }

  /** A celebration: `n` bubbles, a little apart, each with a burst of confetti. */
  celebrate(n: number): void {
    const kinds = KINDS[this.look].party;
    for (let i = 0; i < n; i++) this.scene.time.delayedCall(i * 140, () => this.pop(pick(kinds), true, true));
  }

  /** A run of misses: someone looks worried. */
  sad(): void {
    this.pop('sad', false, true);
  }

  /** On the beat the bubbles give a little bounce. */
  beat(downbeat: boolean): void {
    for (const b of this.alive) b.pulse = downbeat ? 1 : 0.6;
  }

  private pop(kind: Kind, party: boolean, force = false): boolean {
    if (!this.anchors.length) return false;
    if (!force && (this.alive.length >= MAX_ALIVE || this.now - this.last < MIN_GAP_MS)) return false;
    const at = this.freeAnchor();
    if (at < 0) return false;
    this.last = this.now;
    this.recent.push(at);
    if (this.recent.length > 5) this.recent.shift();
    const { x, y } = this.anchors[at];
    const b = this.spareBubbles.pop() ?? this.newBubble();
    b.img.setTexture(this.texture(kind, party)).setVisible(true).setAlpha(1).setDepth(DEPTH + y / 1000);
    Object.assign(b, { x, y, t: 0, life: party ? 1900 : 1500, scale: party ? 1.15 : 1, pulse: 0, sway: Math.random() * TAU });
    this.alive.push(b);
    this.count++;
    if (party) this.confetti(x, y - H * 0.9, this.reduced ? 6 : 14);
    return true;
  }

  /** A head nobody is reacting over yet (and not one of the last few). */
  private freeAnchor(): number {
    for (let tries = 0; tries < 12; tries++) {
      const i = Math.floor(Math.random() * this.anchors.length);
      if (this.recent.includes(i) && tries < 8) continue;
      const a = this.anchors[i];
      if (this.alive.every((b) => Math.hypot(b.x - a.x, b.y - a.y) > SPACING)) return i;
    }
    return -1;
  }

  private newBubble(): Bubble {
    const img = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    // The tail's tip sits on the head.
    img.setOrigin((PAD + W * 0.38 - 3) / (W + PAD * 2), (PAD + H + TAIL) / (H + TAIL + PAD * 2));
    this.root.add(img);
    return { img, x: 0, y: 0, t: 0, life: 1, scale: 1, pulse: 0, sway: 0 };
  }

  private confetti(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const bit = this.spareBits.pop() ?? this.newBit();
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 220 + Math.random() * 260;
      const key = this.bitTexture(i % this.colors.length);
      bit.img.setTexture(key).setVisible(true).setAlpha(1).setDepth(DEPTH + 1);
      Object.assign(bit, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vr: (Math.random() - 0.5) * (this.reduced ? 4 : 16), t: 0, life: 900 + Math.random() * 500 });
      bit.img.setRotation(Math.random() * TAU);
      this.bits.push(bit);
    }
  }

  private newBit(): Bit {
    const img = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false).setScale(1 / SS);
    this.root.add(img);
    return { img, x: 0, y: 0, vx: 0, vy: 0, vr: 0, t: 0, life: 1 };
  }

  update(dt: number): void {
    this.now += dt;
    if (this.ambient) {
      this.ambientIn -= dt;
      if (this.ambientIn <= 0) {
        this.react();
        this.ambientIn = 1500 + Math.random() * 2200;
      }
    }
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const b = this.alive[i];
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) {
        b.img.setVisible(false);
        this.alive.splice(i, 1);
        this.spareBubbles.push(b);
        continue;
      }
      const grow = b.t < 200 ? Phaser.Math.Easing.Back.Out(b.t / 200) : 1;
      b.pulse = Math.max(0, b.pulse - dt / 150);
      const rise = 18 * Phaser.Math.Easing.Sine.Out(k);
      const sway = this.reduced ? 0 : Math.sin(b.sway + b.t / 260) * 1.5;
      b.img
        .setPosition(b.x + sway, b.y - rise)
        .setScale((b.scale * grow * (1 + 0.07 * b.pulse)) / SS)
        .setAlpha(k > 0.78 ? 1 - (k - 0.78) / 0.22 : 1);
    }
    const s = dt / 1000;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const p = this.bits[i];
      p.t += dt;
      if (p.t >= p.life) {
        p.img.setVisible(false);
        this.bits.splice(i, 1);
        this.spareBits.push(p);
        continue;
      }
      p.vy += GRAVITY * s;
      p.vx *= 1 - 1.6 * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      const k = p.t / p.life;
      p.img.setPosition(p.x, p.y).setRotation(p.img.rotation + p.vr * s).setAlpha(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
  }

  destroy(): void {
    for (const b of [...this.alive, ...this.spareBubbles]) b.img.destroy();
    for (const p of [...this.bits, ...this.spareBits]) p.img.destroy();
    this.alive.length = this.spareBubbles.length = this.bits.length = this.spareBits.length = 0;
  }

  // ---------- drawing (once per kind) ----------

  private texture(kind: Kind, party: boolean): string {
    const key = `bubble-${this.look}-${kind}-${party ? 'party' : 'plain'}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, drawBubble(this.look, kind, party))?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return key;
  }

  private bitTexture(i: number): string {
    const key = `confetti-${this.colors[i]}`;
    if (!this.scene.textures.exists(key)) {
      const cv = document.createElement('canvas');
      cv.width = 8 * SS;
      cv.height = 4 * SS;
      const c = cv.getContext('2d')!;
      c.fillStyle = this.colors[i];
      c.beginPath();
      c.roundRect(0, 0, cv.width, cv.height, SS);
      c.fill();
      this.scene.textures.addCanvas(key, cv)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    return key;
  }
}

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

/** A speech bubble (tail down to the head) with a picture inside. */
function drawBubble(look: BubbleLook, kind: Kind, party: boolean): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = (W + PAD * 2) * SS;
  cv.height = (H + TAIL + PAD * 2) * SS;
  const c = cv.getContext('2d')!;
  c.scale(SS, SS);
  const tx = PAD + W * 0.38;
  const path = (dy: number) => {
    const x = PAD;
    const y = PAD + dy;
    const r = 13;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + W - r, y);
    c.arcTo(x + W, y, x + W, y + r, r);
    c.lineTo(x + W, y + H - r);
    c.arcTo(x + W, y + H, x + W - r, y + H, r);
    c.lineTo(tx + 6, y + H);
    c.lineTo(tx - 3, y + H + TAIL);
    c.lineTo(tx - 5, y + H);
    c.lineTo(x + r, y + H);
    c.arcTo(x, y + H, x, y + H - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  };
  if (look === 'paper') {
    path(2);
    c.fillStyle = 'rgba(40,24,12,0.22)';
    c.fill();
    path(0);
    c.fillStyle = party ? '#FFF0B3' : '#FFFDF7';
    c.fill();
    c.strokeStyle = party ? '#B07A12' : '#3A2A1E';
    c.lineWidth = 2;
    c.stroke();
  } else {
    path(0);
    c.fillStyle = 'rgba(16,10,40,0.92)';
    c.fill();
    c.shadowColor = party ? '#FF6FD8' : '#56B4E9';
    c.shadowBlur = 5;
    c.strokeStyle = party ? '#FF9BE6' : '#8FD8FF';
    c.lineWidth = 2;
    c.stroke();
    c.shadowBlur = 0;
  }
  ICONS[kind](c, PAD + W / 2, PAD + H / 2, 12.5, look);
  return cv;
}

type Icon = (c: CanvasRenderingContext2D, x: number, y: number, r: number, look: BubbleLook) => void;

function starPath(c: CanvasRenderingContext2D, x: number, y: number, r: number, inner = 0.45, points = 5): void {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

function face(c: CanvasRenderingContext2D, x: number, y: number, r: number, mood: 'smile' | 'wow' | 'sad'): void {
  c.fillStyle = '#FFD34D';
  c.strokeStyle = '#B98512';
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = c.strokeStyle = '#4A2A14';
  c.lineCap = 'round';
  c.lineWidth = 1.6;
  if (mood === 'smile') {
    // Laughing eyes ^ ^ and an open grin.
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(x + s * r * 0.38, y - r * 0.12, r * 0.18, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
    c.beginPath();
    c.arc(x, y + r * 0.12, r * 0.48, 0.1, Math.PI - 0.1);
    c.closePath();
    c.fillStyle = '#8A2E1E';
    c.fill();
  } else if (mood === 'wow') {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(x + s * r * 0.36, y - r * 0.2, r * 0.13, 0, TAU);
      c.fill();
    }
    c.beginPath();
    c.ellipse(x, y + r * 0.38, r * 0.2, r * 0.26, 0, 0, TAU);
    c.fillStyle = '#8A2E1E';
    c.fill();
  } else {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(x + s * r * 0.36, y - r * 0.12, r * 0.11, 0, TAU);
      c.fill();
    }
    c.beginPath();
    c.arc(x, y + r * 0.62, r * 0.32, Math.PI * 1.2, Math.PI * 1.8);
    c.stroke();
    // A sweat drop.
    c.fillStyle = '#6EC6FF';
    c.beginPath();
    c.moveTo(x + r * 0.78, y - r * 0.75);
    c.quadraticCurveTo(x + r * 1.05, y - r * 0.3, x + r * 0.78, y - r * 0.22);
    c.quadraticCurveTo(x + r * 0.5, y - r * 0.3, x + r * 0.78, y - r * 0.75);
    c.fill();
  }
}

function mug(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const w = r * 1.05;
  const h = r * 1.35;
  const x0 = x - w / 2 - r * 0.12;
  const y0 = y - h / 2 + r * 0.15;
  // The handle.
  c.strokeStyle = '#C9D3DA';
  c.lineWidth = r * 0.2;
  c.beginPath();
  c.arc(x0 + w, y0 + h * 0.5, r * 0.32, -1.3, 1.3);
  c.stroke();
  const g = c.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0, '#E79A1F');
  g.addColorStop(0.5, '#F7C548');
  g.addColorStop(1, '#D98A16');
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(x0, y0, w, h, 2);
  c.fill();
  c.strokeStyle = '#7A4E10';
  c.lineWidth = 1.1;
  c.stroke();
  // Bubbles in the beer, and the foam spilling over.
  c.fillStyle = 'rgba(255,255,255,0.6)';
  for (const [bx, by] of [
    [0.3, 0.55],
    [0.6, 0.75],
    [0.45, 0.85],
  ]) {
    c.beginPath();
    c.arc(x0 + w * bx, y0 + h * by, r * 0.06, 0, TAU);
    c.fill();
  }
  c.fillStyle = '#FFFFFF';
  c.strokeStyle = '#D9CDB8';
  c.lineWidth = 0.8;
  c.beginPath();
  for (const [fx, fr] of [
    [0.1, 0.24],
    [0.4, 0.3],
    [0.72, 0.26],
    [0.98, 0.2],
  ]) c.arc(x0 + w * fx, y0 + r * 0.02, r * fr, 0, TAU);
  c.fill();
}

const ICONS: Record<Kind, Icon> = {
  heart(c, x, y, r) {
    c.fillStyle = '#E0475B';
    c.beginPath();
    c.moveTo(x, y + r * 0.85);
    c.bezierCurveTo(x - r * 1.35, y - r * 0.05, x - r * 0.7, y - r * 1.1, x, y - r * 0.38);
    c.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.35, y - r * 0.05, x, y + r * 0.85);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.ellipse(x - r * 0.45, y - r * 0.3, r * 0.18, r * 0.11, -0.6, 0, TAU);
    c.fill();
  },
  note(c, x, y, r, look) {
    c.fillStyle = c.strokeStyle = look === 'neon' ? '#BDEBFF' : '#2F4E8A';
    for (const [hx, hy] of [
      [-0.55, 0.55],
      [0.55, 0.35],
    ]) {
      c.beginPath();
      c.ellipse(x + r * hx, y + r * hy, r * 0.32, r * 0.23, -0.4, 0, TAU);
      c.fill();
    }
    c.lineWidth = r * 0.14;
    c.beginPath();
    c.moveTo(x - r * 0.26, y + r * 0.5);
    c.lineTo(x - r * 0.26, y - r * 0.7);
    c.moveTo(x + r * 0.84, y + r * 0.3);
    c.lineTo(x + r * 0.84, y - r * 0.9);
    c.stroke();
    c.beginPath();
    c.moveTo(x - r * 0.33, y - r * 0.72);
    c.lineTo(x + r * 0.91, y - r * 0.95);
    c.lineTo(x + r * 0.91, y - r * 0.62);
    c.lineTo(x - r * 0.33, y - r * 0.4);
    c.closePath();
    c.fill();
  },
  star(c, x, y, r) {
    starPath(c, x, y + r * 0.05, r * 1.05);
    c.fillStyle = '#F6C945';
    c.fill();
    c.strokeStyle = '#A8780C';
    c.lineWidth = 1.2;
    c.stroke();
    starPath(c, x - r * 0.12, y - r * 0.05, r * 0.42);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fill();
  },
  smile: (c, x, y, r) => face(c, x, y, r, 'smile'),
  wow: (c, x, y, r) => face(c, x, y, r, 'wow'),
  sad: (c, x, y, r) => face(c, x, y, r, 'sad'),
  mug: (c, x, y, r) => mug(c, x, y, r),
  clink(c, x, y, r) {
    // Two mugs knocked together, a spark between them.
    for (const s of [-1, 1]) {
      c.save();
      c.translate(x + s * r * 0.52, y + r * 0.12);
      c.rotate(s * 0.32);
      c.scale(-s, 1);
      mug(c, 0, 0, r * 0.72);
      c.restore();
    }
    c.strokeStyle = '#E8A21C';
    c.lineWidth = 1.3;
    c.lineCap = 'round';
    c.beginPath();
    for (const a of [-2.1, -1.57, -1.05]) {
      c.moveTo(x + Math.cos(a) * r * 0.62, y - r * 0.55 + Math.sin(a) * r * 0.62);
      c.lineTo(x + Math.cos(a) * r * 0.95, y - r * 0.55 + Math.sin(a) * r * 0.95);
    }
    c.stroke();
  },
  bolt(c, x, y, r) {
    c.beginPath();
    c.moveTo(x + r * 0.2, y - r);
    c.lineTo(x - r * 0.6, y + r * 0.12);
    c.lineTo(x - r * 0.02, y + r * 0.12);
    c.lineTo(x - r * 0.25, y + r);
    c.lineTo(x + r * 0.62, y - r * 0.2);
    c.lineTo(x + r * 0.05, y - r * 0.2);
    c.closePath();
    c.shadowColor = '#FFE14D';
    c.shadowBlur = 6;
    c.fillStyle = '#FFE14D';
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = '#C99A00';
    c.lineWidth = 1;
    c.stroke();
  },
  stick(c, x, y, r) {
    // A glow stick waved overhead: the stick, and the arcs of its swing.
    c.lineCap = 'round';
    c.shadowColor = '#7CFFB2';
    c.shadowBlur = 7;
    c.strokeStyle = '#7CFFB2';
    c.lineWidth = r * 0.32;
    c.beginPath();
    c.moveTo(x - r * 0.35, y + r * 0.85);
    c.lineTo(x + r * 0.25, y - r * 0.75);
    c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = r * 0.1;
    c.stroke();
    c.strokeStyle = '#FF6FD8';
    c.lineWidth = 1.4;
    for (const k of [0.75, 1.05]) {
      c.beginPath();
      c.arc(x - r * 0.35, y + r * 0.85, r * 1.6 * k, -1.05, -0.6);
      c.stroke();
    }
  },
  fire(c, x, y, r) {
    const flame = (s: number, col: string) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x, y + r * s);
      c.bezierCurveTo(x - r * 0.95 * s, y + r * s, x - r * 0.85 * s, y - r * 0.1 * s, x - r * 0.15 * s, y - r * s);
      c.bezierCurveTo(x - r * 0.05 * s, y - r * 0.45 * s, x + r * 0.35 * s, y - r * 0.55 * s, x + r * 0.4 * s, y - r * 0.85 * s);
      c.bezierCurveTo(x + r * 0.95 * s, y - r * 0.2 * s, x + r * 0.9 * s, y + r * s, x, y + r * s);
      c.fill();
    };
    c.shadowColor = '#FF8A3D';
    c.shadowBlur = 6;
    flame(1.05, '#FF6A2B');
    c.shadowBlur = 0;
    c.save();
    c.translate(0, r * 0.25);
    flame(0.62, '#FFD34D');
    c.restore();
  },
  party(c, x, y, r, look) {
    // A party popper going off.
    const bx = x - r * 0.75;
    const by = y + r * 0.8;
    c.save();
    c.beginPath();
    c.moveTo(bx, by);
    c.lineTo(x + r * 0.05, y - r * 0.55);
    c.lineTo(x + r * 0.55, y - r * 0.05);
    c.closePath();
    c.fillStyle = '#C9374F';
    c.fill();
    c.clip();
    c.strokeStyle = '#F6C945';
    c.lineWidth = r * 0.16;
    c.beginPath();
    for (const k of [0.35, 0.65]) {
      c.moveTo(bx + (x + r * 0.05 - bx) * k - r * 0.3, by + (y - r * 0.55 - by) * k - r * 0.3);
      c.lineTo(bx + (x + r * 0.55 - bx) * k + r * 0.3, by + (y - r * 0.05 - by) * k + r * 0.3);
    }
    c.stroke();
    c.restore();
    const colors = look === 'neon' ? ['#FF6FD8', '#56B4E9', '#3DDC97', '#F0E442'] : ['#2F6DB5', '#E0475B', '#3E8A3A', '#F6C945'];
    const bits: [number, number, number][] = [
      [0.55, -0.85, 0.4],
      [0.95, -0.45, -0.6],
      [0.2, -1.0, 1.1],
      [0.95, 0.15, 0.2],
      [0.6, -0.3, -1.2],
    ];
    bits.forEach(([dx, dy, rot], i) => {
      c.save();
      c.translate(x + r * dx, y + r * dy);
      c.rotate(rot);
      c.fillStyle = colors[i % colors.length];
      c.fillRect(-r * 0.14, -r * 0.07, r * 0.28, r * 0.14);
      c.restore();
    });
    c.strokeStyle = colors[0];
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x + r * 0.15, y - r * 0.45);
    c.quadraticCurveTo(x + r * 0.2, y - r * 1.05, x + r * 0.55, y - r * 0.95);
    c.stroke();
  },
};
