import Phaser from 'phaser';
import { PAL, hexToNumber } from '../companion/art/palette';

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
  w: number;
}

const CONFETTI = [PAL.champagneGold, PAL.giltShine, PAL.ivoryPearl, PAL.dustyRose, PAL.signalGreen].map(hexToNumber);
const SPARKLE = [PAL.champagneGold, PAL.giltShine, PAL.ivoryPearl].map(hexToNumber);

/** Whole-pixel particles drawn into one Graphics object (no textures, no blur). */
export class PixelBursts {
  private readonly g: Phaser.GameObjects.Graphics;
  private bits: Bit[] = [];

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  /** Chapter-end confetti: a fountain of gold and ivory. */
  confetti(x: number, y: number, count = 70): void {
    for (let i = 0; i < count; i++) {
      this.bits.push({
        x: x + (Math.random() - 0.5) * 20,
        y,
        vx: (Math.random() - 0.5) * 140,
        vy: -60 - Math.random() * 110,
        life: 1.6 + Math.random() * 1.2,
        color: CONFETTI[i % CONFETTI.length],
        w: Math.random() > 0.6 ? 2 : 1,
      });
    }
  }

  /** A small ring of sparkles (outfit change, page counted). */
  sparkle(x: number, y: number, count = 14): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const s = 30 + Math.random() * 25;
      this.bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: 0.6 + Math.random() * 0.3, color: SPARKLE[i % 3], w: 1 });
    }
  }

  update(dtMs: number): void {
    if (!this.bits.length) return;
    const dt = Math.min(0.05, dtMs / 1000);
    this.g.clear();
    this.bits = this.bits.filter((b) => (b.life -= dt) > 0);
    for (const b of this.bits) {
      b.vy += 160 * dt;
      b.vx *= 1 - 0.8 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      this.g.fillStyle(b.color, Math.min(1, b.life * 2));
      this.g.fillRect(Math.round(b.x), Math.round(b.y), b.w, 1);
    }
    if (!this.bits.length) this.g.clear();
  }
}
