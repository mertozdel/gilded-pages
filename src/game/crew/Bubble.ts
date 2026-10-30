import Phaser from 'phaser';

/**
 * A speech bubble over someone's head: rounded card, a tail, crisp text. `scale` follows the
 * speaker's sprite so it reads the same at every room size.
 */
export class Bubble {
  readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private timer: Phaser.Time.TimerEvent | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.text = scene.add
      .text(0, 0, '', { fontFamily: '"EB Garamond", Georgia, serif', fontSize: '26px', color: '#241811', align: 'center', wordWrap: { width: 320 } })
      .setOrigin(0.5, 1);
    this.container = scene.add.container(0, 0, [this.bg, this.text]).setVisible(false);
  }

  /** Shows `text` (a heart for '♥') for `ms`, then fades. */
  say(text: string, ms = 2600, tone: 'plain' | 'heart' = 'plain'): void {
    this.timer?.remove();
    this.scene.tweens.killTweensOf(this.container);
    const heart = tone === 'heart';
    this.text.setText(text).setColor(heart ? '#C9374F' : '#241811').setFontSize(heart ? 40 : 26);
    const w = Math.max(56, this.text.width + 28);
    const h = this.text.height + 16;
    const g = this.bg.clear();
    g.fillStyle(0xfffaf0, 0.97).lineStyle(3, 0x3b2418, 1);
    g.fillRoundedRect(-w / 2, -h - 14, w, h, 14).strokeRoundedRect(-w / 2, -h - 14, w, h, 14);
    g.fillTriangle(-9, -15, 9, -15, 0, 0).lineBetween(-9, -14, 0, 0).lineBetween(9, -14, 0, 0);
    this.text.setPosition(0, -22);
    this.container.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 140 });
    this.timer = this.scene.time.delayedCall(ms, () => this.scene.tweens.add({ targets: this.container, alpha: 0, duration: 260, onComplete: () => this.container.setVisible(false) }));
  }

  get visible(): boolean {
    return this.container.visible;
  }

  /** Puts the tail's tip at (x, y), drawn at `scale`. */
  place(x: number, y: number, scale: number, depth: number): void {
    this.container.setPosition(x, y).setScale(scale).setDepth(depth);
  }

  destroy(): void {
    this.timer?.remove();
    this.container.destroy();
  }
}
