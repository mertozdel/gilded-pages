/**
 * The neon festival's lights: moving-head beams sweeping on the bar, the LED dance floor's
 * tiles pulsing on the beat, and the LED screens flashing on the drop. With Reduce flashing:
 * no strobe, at most three flashes a second, slower beams and a dimmer floor.
 */
import Phaser from 'phaser';
import type { FestivalObject, Pt } from './FestivalMap';
import { bbox } from './FestivalMap';

const BEAM_COLORS = [0x56b4e9, 0x3fe0ff, 0xff6fd8, 0xf0e442, 0xb48cff, 0x3ddc97, 0x56b4e9, 0x7cff6b];
const TILE_COLORS = [0xff6fd8, 0x56b4e9, 0xf0e442, 0x3ddc97, 0xb48cff, 0xff8a5b];
/** Gaps over a third of a second: never more than three flashes in any one second. */
const MIN_FLASH_GAP_MS = 340;

interface Beam {
  at: Pt;
  aim: number;
  g: Phaser.GameObjects.Graphics;
  color: number;
}

export class LightRig {
  private readonly beams: Beam[] = [];
  private readonly floor: Phaser.GameObjects.Graphics;
  private readonly tiles: { pts: Pt[]; color: number; level: number }[] = [];
  private readonly flash: Phaser.GameObjects.Image[] = [];
  private sweep = 0;
  private sweepTarget = 0;
  private wild = false;
  private lastFlash = -Infinity;
  private clock = 0;
  /** When each screen flash happened (scene time, ms) — the reduce-flashing test reads it. */
  readonly flashTimes: number[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    root: Phaser.GameObjects.Container,
    objects: FestivalObject[],
    /** The screens' textures (for the drop flash). */
    screens: Phaser.GameObjects.Image[],
    private reduced: boolean,
  ) {
    objects
      .filter((o) => o.type === 'moving-head')
      .forEach((o, i) => {
        const g = scene.add.graphics().setDepth(0.8).setBlendMode(Phaser.BlendModes.ADD);
        root.add(g);
        this.beams.push({ at: o.at, aim: Number(o.props.aim ?? 0), g, color: BEAM_COLORS[i % BEAM_COLORS.length] });
      });
    this.floor = scene.add.graphics().setDepth(0.6).setBlendMode(Phaser.BlendModes.ADD);
    root.add(this.floor);
    const led = objects.find((o) => o.type === 'led-floor');
    if (led?.poly) {
      // An isometric grid of tiles inside the floor's outline.
      const b = bbox(led.poly);
      const tw = 64;
      const th = 32;
      let k = 0;
      for (let y = b.y; y < b.y + b.h; y += th / 2) {
        const row = Math.round((y - b.y) / (th / 2));
        for (let x = b.x + (row % 2 ? tw / 2 : 0); x < b.x + b.w; x += tw) {
          const c = { x, y };
          if (!pointIn(led.poly, c)) continue;
          this.tiles.push({
            pts: [
              { x, y: y - th / 2 + 2 },
              { x: x + tw / 2 - 2, y },
              { x, y: y + th / 2 - 2 },
              { x: x - tw / 2 + 2, y },
            ],
            color: TILE_COLORS[k++ % TILE_COLORS.length],
            level: 0,
          });
        }
      }
    }
    for (const s of screens) {
      const f = scene.add.image(s.x, s.y, s.texture.key).setOrigin(0, 0).setScale(s.scaleX).setDepth(s.depth + 0.01).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      root.add(f);
      this.flash.push(f);
    }
  }

  setReduced(on: boolean): void {
    this.reduced = on;
  }

  get isReduced(): boolean {
    return this.reduced;
  }

  /** The drop: everything goes wild (star power). */
  setWild(on: boolean): void {
    this.wild = on;
    if (on) this.flashScreens(0.9);
  }

  beat(downbeat: boolean, beatInBar: number): void {
    // The floor: a few tiles light up on every beat.
    const lit = this.wild ? 0.6 : 0.3;
    for (let i = 0; i < this.tiles.length; i++) if ((i + beatInBar * 3) % (this.wild ? 2 : 4) === 0) this.tiles[i].level = Math.random() < lit + 0.4 ? 1 : 0.5;
    // Beams sweep to a new angle on each bar (and on every beat in the drop).
    if (downbeat || (this.wild && !this.reduced)) this.sweepTarget = (Math.random() - 0.5) * (this.wild ? 1.1 : 0.7);
    if (this.wild && !this.reduced) this.flashScreens(0.5);
    else if (this.wild && downbeat) this.flashScreens(0.35);
  }

  private flashScreens(strength: number): void {
    const now = this.scene.time.now;
    // At most three flashes a second with Reduce flashing (no strobe).
    if (this.reduced && now - this.lastFlash < MIN_FLASH_GAP_MS) return;
    this.lastFlash = now;
    this.flashTimes.push(now);
    if (this.flashTimes.length > 200) this.flashTimes.splice(0, 100);
    const a = this.reduced ? strength * 0.4 : strength;
    for (const f of this.flash) {
      this.scene.tweens.killTweensOf(f);
      f.setAlpha(a);
      this.scene.tweens.add({ targets: f, alpha: 0, duration: this.reduced ? 500 : 220 });
    }
  }

  update(dt: number): void {
    this.clock += dt;
    const ease = 1 - Math.exp(-dt / (this.reduced ? 900 : 300));
    this.sweep += (this.sweepTarget - this.sweep) * ease;
    const sway = Math.sin(this.clock / (this.reduced ? 2400 : 1100)) * (this.reduced ? 0.08 : 0.15);
    for (const [i, b] of this.beams.entries()) {
      const a = b.aim + (i % 2 ? -this.sweep : this.sweep) + sway;
      const len = 330;
      const spread = 0.07;
      const end = (d: number) => ({ x: b.at.x + Math.sin(a + d) * len, y: b.at.y + Math.cos(a + d) * len });
      const p1 = end(-spread);
      const p2 = end(spread);
      b.g.clear();
      const alpha = (this.reduced ? 0.12 : 0.2) * (this.wild ? 1.5 : 1);
      b.g.fillStyle(b.color, alpha);
      b.g.fillTriangle(b.at.x, b.at.y, p1.x, p1.y, p2.x, p2.y);
      b.g.fillStyle(b.color, alpha * 1.6);
      const q1 = end(-spread / 3);
      const q2 = end(spread / 3);
      b.g.fillTriangle(b.at.x, b.at.y, q1.x, q1.y, q2.x, q2.y);
    }
    this.floor.clear();
    const decay = Math.exp(-dt / (this.reduced ? 500 : 220));
    const dim = this.reduced ? 0.22 : 0.45;
    for (const t of this.tiles) {
      t.level *= decay;
      if (t.level < 0.02) continue;
      this.floor.fillStyle(t.color, t.level * dim);
      this.floor.beginPath();
      t.pts.forEach((p, i) => (i ? this.floor.lineTo(p.x, p.y) : this.floor.moveTo(p.x, p.y)));
      this.floor.closePath();
      this.floor.fillPath();
    }
  }

  destroy(): void {
    for (const b of this.beams) b.g.destroy();
    this.floor.destroy();
    for (const f of this.flash) f.destroy();
  }
}

function pointIn(poly: Pt[], p: Pt): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
