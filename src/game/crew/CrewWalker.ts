import Phaser from 'phaser';
import type { CharacterId } from '../../content/characters';
import type { Facing } from '../../content/rooms';
import { ROOM_FIGURE_HEIGHT, ROXY_HEIGHT } from '../companion/art/roxyFrames';
import { BRISK_SPEED, IsoWalker, RUN_SPEED, WALK_SPEED } from '../iso/IsoWalker';
import type { Room } from '../iso/Room';
import { Bubble } from './Bubble';
import { animKey, crewDef } from './CrewPack';

type View = 's' | 'e' | 'n';

/** Bubbles and effects draw over the whole room. */
const DEPTH_OVER = 8000;
/** The crew's own paces (tiles/s) for the shared walk / brisk / run speeds: a little quicker than Roxy's. */
const CREW_PACE = new Map<number, number>([
  [WALK_SPEED, 2.8],
  [BRISK_SPEED, 3.6],
  [RUN_SPEED, 6],
]);
/**
 * Screen speed (game px/s, at sprite scale 1) at which each cycle's feet keep up with the
 * ground. The animation runs faster or slower than drawn to match the real speed, so nobody
 * slides along the floor.
 */
const STRIDE_SPEED: Record<string, number> = { walk_s: 170, walk_n: 170, walk_e: 200, run_s: 380, run_e: 420 };

/**
 * A crew member (Jason, Joel, Jonas) on a room's floor, drawn from their sprite pack: a Phaser
 * sprite with the pack's origin (between the feet), at the same scale as Roxy, depth-sorted by
 * the feet. Walking, the view follows the move on screen (front, side — mirrored for west —
 * or back); standing, the way they face. Actions are the pack's animations by short name
 * (`gesture_s`), played once or looped.
 */
export class CrewWalker extends IsoWalker {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly bubble: Bubble;
  private view: View = 's';
  private flip = false;
  private running = false;
  private action: { name: string; loop: boolean; onEnd: (() => void) | null } | null = null;
  private fx: Phaser.GameObjects.Sprite | null = null;
  private fxAtHands = false;

  constructor(
    scene: Phaser.Scene,
    readonly id: CharacterId,
    readonly texture: string,
  ) {
    super();
    const def = crewDef(scene, texture);
    this.sprite = scene.add.sprite(0, 0, texture).setOrigin(def?.origin.x ?? 0.5, def?.origin.y ?? 0.9875).setVisible(false);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => this.animDone(anim.key));
    this.bubble = new Bubble(scene);
  }

  /** Puts them in a room at a floor point (or hides them with `null`). */
  attach(room: Room | null, u = 0, v = 0, facing: Facing = 'SE'): void {
    this.room = room;
    this.sprite.setVisible(!!room);
    if (!room) return;
    this.place(u, v, facing);
    this.refresh();
    this.update(0);
  }

  setDepth(d: number): void {
    this.sprite.setDepth(d);
  }

  protected applyFacing(): void {
    if (this.moving) return;
    this.view = this.facing === 'NE' || this.facing === 'NW' ? 'n' : 's';
    this.flip = false;
    this.refresh();
  }

  protected onMoveChange(moving: boolean, run: boolean): void {
    this.running = run;
    if (moving) this.action = null;
    else this.applyFacing();
    this.refresh();
  }

  walkTo(u: number, v: number, onArrive?: () => void, speed = WALK_SPEED): boolean {
    return super.walkTo(u, v, onArrive, CREW_PACE.get(speed) ?? speed);
  }

  /** Walks to a named spot of the room and turns the way it says. */
  goToSpot(name: string, onArrive?: () => void, brisk = true): boolean {
    const s = this.room?.spots.get(name);
    if (!s) return false;
    return this.walkTo(
      s.u,
      s.v,
      () => {
        this.face(s.facing);
        onArrive?.();
      },
      brisk ? BRISK_SPEED : WALK_SPEED,
    );
  }

  run(u: number, v: number, onArrive?: () => void): boolean {
    return this.walkTo(u, v, onArrive, RUN_SPEED);
  }

  /** Plays a pack animation (`gesture_s`) `plays` times, then back to standing. */
  perform(name: string, onEnd?: () => void, plays = 1): boolean {
    if (!this.has(name)) {
      onEnd?.();
      return false;
    }
    this.stop();
    this.action = { name, loop: false, onEnd: onEnd ?? null };
    this.sprite.setFlipX(false).play({ key: animKey(this.texture, name), repeat: plays - 1 });
    return true;
  }

  /** Loops a pack animation until `stopAction` (or a walk). */
  loop(name: string): boolean {
    if (!this.has(name)) return false;
    this.stop();
    this.action = { name, loop: true, onEnd: null };
    this.sprite.setFlipX(false).play({ key: animKey(this.texture, name), repeat: -1 }, true);
    return true;
  }

  stopAction(): void {
    if (!this.action) return;
    this.action = null;
    this.refresh();
  }

  /** Doing something other than standing or walking. */
  get busy(): boolean {
    return !!this.action;
  }

  get actionName(): string | null {
    return this.action?.name ?? null;
  }

  has(name: string): boolean {
    return this.sprite.scene.anims.exists(animKey(this.texture, name));
  }

  /** Says something in a bubble (talking while it shows, if standing). */
  say(text: string, ms = 2600, tone: 'plain' | 'heart' = 'plain'): void {
    this.bubble.say(text, ms, tone);
    this.update(0);
  }

  /**
   * Plays one of Roxy's effects (fx_heart, fx_sparkle, fx_espresso, fx_steam…) over their head,
   * or `atHands` in front of them (working the machine); `loop` keeps it going until stopFx.
   */
  playFx(key: string, loop = false, atHands = false): void {
    const scene = this.sprite.scene;
    if (!scene.anims.exists(key)) return;
    this.fx?.destroy();
    const fx = scene.add.sprite(0, 0, 'roxy_fx').setOrigin(0.5, 1);
    this.fx = fx;
    this.fxAtHands = atHands;
    fx.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      fx.destroy();
      if (this.fx === fx) this.fx = null;
    });
    fx.play({ key, repeat: loop ? -1 : 0 });
    this.update(0);
  }

  stopFx(): void {
    this.fx?.destroy();
    this.fx = null;
  }

  private animDone(key: string): void {
    const a = this.action;
    if (!a || a.loop || animKey(this.texture, a.name) !== key) return;
    this.action = null;
    this.refresh();
    a.onEnd?.();
  }

  /** The standing or walking animation for the current view. */
  private refresh(): void {
    if (this.action || !this.sprite.active) return;
    let name: string;
    if (this.moving) name = this.running && this.view !== 'n' ? `run_${this.view}` : `walk_${this.view}`;
    else name = `idle_${this.view}`;
    if (!this.has(name)) name = this.has(`idle_${this.view}`) ? `idle_${this.view}` : 'idle_s';
    this.sprite.setFlipX(this.view === 'e' && this.flip);
    this.sprite.play(animKey(this.texture, name), true);
    this.matchStride(name);
  }

  /** Walking and running animations follow the real speed on screen; everything else plays as drawn. */
  private matchStride(name = this.sprite.anims.currentAnim?.key.slice(this.texture.length + 1) ?? ''): void {
    const ref = STRIDE_SPEED[name];
    if (!ref || !this.room || !this.moving) {
      this.sprite.anims.timeScale = 1;
      return;
    }
    const a = this.room.toScreen(0, 0);
    const b = this.room.toScreen(1, 0);
    const pxPerUnit = Math.hypot(b.x - a.x, b.y - a.y);
    const screenSpeed = this.speed * this.room.speedScale * pxPerUnit;
    this.sprite.anims.timeScale = Phaser.Math.Clamp(screenSpeed / (ref * this.spriteScale), 0.55, 1.6);
  }

  /** The sprite's scale: Roxy's, so the whole crew stands at one size. */
  get spriteScale(): number {
    return ((this.room?.actorScaleSmooth ?? 1) * ROOM_FIGURE_HEIGHT) / ROXY_HEIGHT;
  }

  update(dt: number): void {
    if (!this.room) return;
    // Walking, the view follows the move on screen.
    const to = this.path[0];
    if (to && !this.action) {
      const a = this.room.toScreen(this.u, this.v);
      const b = this.room.toScreen(to.u, to.v);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) > 0.01) {
        const ang = Math.atan2(dy, Math.abs(dx));
        const view: View = ang > Math.PI / 4 ? 's' : ang > -Math.PI / 4 ? 'e' : 'n';
        const flip = dx < 0;
        if (view !== this.view || flip !== this.flip) {
          this.view = view;
          this.flip = flip;
          this.refresh();
        }
      }
    }
    if (dt > 0) this.step(dt);
    if (this.moving && !this.action) this.matchStride();
    const s = this.room.toScreen(this.u, this.v);
    const k = this.spriteScale;
    this.sprite.setScale(k).setPosition(s.x, s.y);
    const head = s.y - 205 * k;
    if (this.bubble.visible) this.bubble.place(s.x, head, k, DEPTH_OVER + s.y);
    if (this.fxAtHands) this.fx?.setPosition(s.x + 6 * k, s.y - 96 * k).setScale(k).setDepth(s.y + 1);
    else this.fx?.setPosition(s.x + 20 * k, head + 10 * k).setScale(k).setDepth(DEPTH_OVER + s.y);
  }

  destroy(): void {
    this.fx?.destroy();
    this.bubble.destroy();
    this.sprite.destroy();
  }
}
