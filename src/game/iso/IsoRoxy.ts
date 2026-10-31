import type Phaser from 'phaser';
import type { BlouseId } from '../../content';
import type { Facing } from '../../content/rooms';
import { carryArt, lookForFacing, lookForHeading, roxyArt, ROXY_HEIGHT, type Look, type RoxyArt } from '../companion/art/roxyFrames';
import { transition, type Reaction, type VEvent, type VState } from '../companion/roxyMachine';
import { RoxySprite } from '../companion/RoxySprite';
import { Bubble, DEPTH_OVER } from '../crew/Bubble';
import type { Room } from './Room';
import { BRISK_SPEED, IsoWalker, RUN_SPEED, WALK_SPEED } from './IsoWalker';

/**
 * Roxy in a room: the walker for movement plus her sprite and animation state machine. One
 * instance lives for the whole session and moves between rooms. Each state plays its sprite
 * pack animation (per-frame durations) in the view she is seen from: walking, the direction
 * she moves on screen; standing, the way she faces.
 */
export class IsoRoxy extends IsoWalker {
  readonly sprite: RoxySprite;
  readonly bubble: Bubble;
  private state: VState = 'idle';
  private look: Look = { view: 'se', flip: false };
  private art: RoxyArt = roxyArt('idle', this.look);
  /** The animation step on show, how long it has shown, and finished plays of a one-shot. */
  private index = 0;
  private clock = 0;
  private plays = 0;
  private reverse = false;
  private onAnimEnd: (() => void) | null = null;
  /** Carrying a cup across the room (a refill for the regular): walking and standing hold it. */
  private carrying = false;

  constructor(scene: Phaser.Scene, blouse: BlouseId) {
    super();
    this.sprite = new RoxySprite(scene, blouse);
    this.sprite.container.setVisible(false);
    this.bubble = new Bubble(scene);
  }

  get currentState(): VState {
    return this.state;
  }

  /** Puts her in a room at a floor point (or hides her with `null`). */
  attach(room: Room | null, u = 0, v = 0, facing: Facing = 'SE'): void {
    this.room = room;
    this.seat = null;
    this.sprite.container.setVisible(!!room);
    this.bubble.hide();
    if (!room) return;
    this.sprite.setActorScale(room.actorScaleSmooth);
    this.place(u, v, facing);
    this.enter('idle');
  }

  setDepth(d: number): void {
    this.sprite.container.setDepth(d);
  }

  protected applyFacing(): void {
    // While walking the view follows the move itself (see update).
    if (!this.moving) this.setLook(lookForFacing(this.facing));
  }

  protected onMoveChange(moving: boolean, run: boolean): void {
    if (moving) this.send({ type: run ? 'RUN' : 'WALK' });
    else this.send({ type: 'ARRIVE' });
  }

  walkTo(u: number, v: number, onArrive?: () => void, speed = WALK_SPEED): boolean {
    if (this.state !== 'walk' && this.state !== 'run') this.send({ type: 'STOP' });
    return super.walkTo(u, v, onArrive, speed);
  }

  /** Walks to a named spot in the current room and turns the way it says. */
  goToSpot(name: string, onArrive?: () => void, brisk = true): boolean {
    if (!this.room) return false;
    const s = this.room.spot(name);
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

  // ---------- animation ----------

  private enter(next: VState): void {
    this.state = next;
    this.reverse = false;
    this.onAnimEnd = null;
    this.art = this.artFor(next, this.look);
    this.restart();
  }

  private artFor(state: VState, look: Look): RoxyArt {
    return (this.carrying && carryArt(state, look)) || roxyArt(state, look);
  }

  /** Picks up (or puts down) a cup to carry: her walk and stance change at once. */
  setCarry(on: boolean): void {
    if (this.carrying === on) return;
    this.carrying = on;
    const prev = this.art.anim;
    this.art = this.artFor(this.state, this.look);
    if (this.art.anim === prev) return;
    if (this.state === 'walk' || this.state === 'run') this.index %= this.art.anim.steps.length;
    else this.restart();
  }

  private restart(): void {
    this.index = 0;
    this.clock = 0;
    this.plays = 0;
    this.sprite.stopFx();
    this.cueFx();
  }

  private setLook(look: Look): void {
    if (look.view === this.look.view && look.flip === this.look.flip) return;
    this.look = look;
    const prev = this.art.anim;
    this.art = this.artFor(this.state, look);
    if (this.art.anim === prev) return;
    // Turning mid-stride keeps the stride; anything else starts the new view's animation.
    if (this.state === 'walk' || this.state === 'run') this.index %= this.art.anim.steps.length;
    else this.restart();
  }

  /** Starts or ends the state's effect on the step that cues it. */
  private cueFx(): void {
    const cue = this.art.fx;
    if (!cue) return;
    if (this.index === (cue.at ?? 0) && this.plays % (cue.every ?? 1) === 0) this.sprite.playFx(cue);
    if (this.index === cue.until) this.sprite.stopFx();
  }

  private send(e: VEvent): boolean {
    const next = transition(this.state, e);
    if (!next) return false;
    this.enter(next);
    return true;
  }

  /** Plays a reaction (a one-shot or a loop). */
  perform(r: Reaction, onEnd?: () => void, reverse = false): boolean {
    if (!this.send({ type: 'REACT', reaction: r })) return false;
    this.onAnimEnd = onEnd ?? null;
    this.reverse = reverse;
    return true;
  }

  stopLoop(): void {
    this.send({ type: 'STOP' });
  }

  /** Sits on a seat spot (sitRead loop). */
  sit(u: number, v: number, facing: Facing, seat: { u0: number; v0: number; u1: number; v1: number }): void {
    this.sitOn(u, v, facing, seat);
    this.enter('sitRead');
  }

  standUp(): void {
    this.stand();
    if (this.state === 'sitRead' || this.state === 'doze') this.send({ type: 'WAKE' });
  }

  setApron(on: boolean): void {
    this.sprite.setApron(on);
  }

  get apronOn(): boolean {
    return this.sprite.apronOn;
  }

  setBlouse(id: BlouseId): void {
    this.sprite.setBlouse(id);
  }

  /** Says something in a bubble over her head. */
  say(text: string, ms = 2600): void {
    this.bubble.say(text, ms);
    this.placeBubble();
  }

  private placeBubble(): void {
    if (!this.room || !this.bubble.visible) return;
    const s = this.room.toScreen(this.u, this.v);
    const k = this.sprite.container.scale;
    this.bubble.place(s.x, s.y - (ROXY_HEIGHT + 9) * k, k, DEPTH_OVER + s.y);
  }

  /** Free for the café routine: not walking, not mid-action. */
  isIdle(): boolean {
    return !this.moving && (this.state === 'idle' || this.state === 'wipeCounter');
  }

  update(dt: number): void {
    if (!this.room) return;
    // Walking, she is drawn facing where she goes on screen (eight ways).
    const to = this.path[0];
    if (to) {
      const a = this.room.toScreen(this.u, this.v);
      const b = this.room.toScreen(to.u, to.v);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) this.setLook(lookForHeading(b.x - a.x, b.y - a.y));
    }
    this.step(dt);
    this.clock += dt;
    let steps = this.art.anim.steps;
    while (this.clock >= steps[this.index].duration) {
      this.clock -= steps[this.index].duration;
      this.index++;
      if (this.index >= steps.length) {
        this.plays++;
        if (this.art.plays && this.plays >= this.art.plays) {
          // A one-shot holds its last step while whatever comes next starts.
          this.index = steps.length - 1;
          this.clock = 0;
          const cb = this.onAnimEnd;
          this.send({ type: 'ANIM_END' });
          // A one-shot she wouldn't cut short (a dance) ended on the move: she walks on.
          if (this.moving && this.state === 'idle') this.send({ type: this.speed >= RUN_SPEED ? 'RUN' : 'WALK' });
          cb?.();
          break;
        }
        this.index = 0;
      }
      this.cueFx();
      steps = this.art.anim.steps;
    }
    const n = this.art.anim.steps.length;
    const shown = Math.min(n - 1, this.reverse ? n - 1 - this.index : this.index);
    this.sprite.setFrame(this.art.anim.steps[shown].frame);
    this.sprite.setFlip(this.art.flip);
    const s = this.room.toScreen(this.u, this.v);
    this.sprite.setActorScale(this.room.actorScaleSmooth);
    // The sprite's origin is between her feet.
    this.sprite.container.setPosition(Math.round(s.x), Math.round(s.y));
    this.placeBubble();
  }
}
