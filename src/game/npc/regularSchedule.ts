/**
 * The regular's day at his table, without Phaser (so it can be tested): which animation he plays
 * and when, his mug, and what the café hears about it. RegularNpc plays it.
 *
 *   type 6–12 s ⇄ idle 3–6 s, and every 20–40 s a sip (once; then back to what he was doing).
 *   look: a glance round the room (once) when something happens, at most every 15 s.
 *   Six sips empty the mug: waitRefill. He keeps typing and idling, but stops sipping.
 *   A refill: a look, then a sip, a fresh steaming mug. Jason's flat white: a sip at once.
 *   Weekends on the sofa: chill, nothing else.
 *
 * No sip starts while another one-shot (a sip or a look) plays: it waits for it to end.
 */
import { regularMood, type RegularMood } from '../../content/regular';

export type RegularState = 'type' | 'idle' | 'sip' | 'look' | 'waitRefill' | 'chill';
/** What to play: the loops and the one-shots of his sit_* animations, or chill on the sofa. */
export type RegularAnim = 'type' | 'idle' | 'sip' | 'look' | 'chill';
export type NoticeReason = 'door' | 'near' | 'music' | 'talk';

export const SCHEDULE = {
  typeMs: [6000, 12000],
  idleMs: [3000, 6000],
  sipEveryMs: [20000, 40000],
  lookCooldownMs: 15000,
  sipsPerMug: 6,
  steamMs: 20000,
} as const;

/** What the schedule asks of the sprite and tells the café. */
export interface RegularEffects {
  play(anim: RegularAnim, loop: boolean): void;
  /** A sip starts. */
  sip(): void;
  /** The sixth sip is done: the mug is empty, he waits for a refill. */
  empty(): void;
  refilled(by: string, via: 'table' | 'latte'): void;
  /** The steam over a fresh mug. */
  steam(on: boolean): void;
  /** Waiting for a refill (the cup bubble over his head, the refill hotspot). */
  waiting(on: boolean): void;
}

type Loop = 'type' | 'idle';
type OneShot = 'sip' | 'look';

export class RegularSchedule {
  private clock = 0;
  private loop: Loop = 'type';
  private loopLeft = 0;
  private sipIn = 0;
  private sipDue = false;
  private sips = 0;
  private oneShot: OneShot | null = null;
  /** One-shots to play next (after a refill: look, then sip). */
  private queue: OneShot[] = [];
  private lookReadyAt = 0;
  private emptySince: number | null = null;
  private steamLeft = 0;
  private started = false;

  constructor(
    private readonly fx: RegularEffects,
    readonly chilling = false,
    private readonly rng: () => number = Math.random,
  ) {}

  private between([a, b]: readonly [number, number]): number {
    return a + this.rng() * (b - a);
  }

  /** He sits down: typing with a fresh, steaming mug (or lounging on the sofa). */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.chilling) return this.fx.play('chill', true);
    this.loop = 'type';
    this.loopLeft = this.between(SCHEDULE.typeMs);
    this.sipIn = this.between(SCHEDULE.sipEveryMs);
    this.fx.play('type', true);
    this.freshMug();
  }

  get state(): RegularState {
    if (this.chilling) return 'chill';
    if (this.oneShot) return this.oneShot;
    return this.emptySince !== null ? 'waitRefill' : this.loop;
  }

  get empty(): boolean {
    return this.emptySince !== null;
  }

  /** Sips taken from this mug. */
  get sipsTaken(): number {
    return this.sips;
  }

  get steaming(): boolean {
    return this.steamLeft > 0;
  }

  /** How he feels now, for the dialogue (the hour is the device clock's). */
  mood(hour: number): RegularMood {
    const typing = !this.chilling && !this.oneShot && this.loop === 'type';
    return regularMood({ hour, typing, emptyForMs: this.emptySince === null ? null : this.clock - this.emptySince });
  }

  update(dt: number): void {
    if (!this.started) return;
    this.clock += dt;
    if (this.steamLeft > 0) {
      this.steamLeft -= dt;
      if (this.steamLeft <= 0) this.fx.steam(false);
    }
    if (this.chilling) return;
    // The loop runs on under a one-shot, but only switches when he's back to it.
    this.loopLeft -= dt;
    if (!this.oneShot && this.loopLeft <= 0) {
      this.loop = this.loop === 'type' ? 'idle' : 'type';
      this.loopLeft = this.between(this.loop === 'type' ? SCHEDULE.typeMs : SCHEDULE.idleMs);
      this.fx.play(this.loop, true);
    }
    if (this.emptySince !== null) return;
    this.sipIn -= dt;
    if (this.sipIn <= 0) {
      this.sipIn = this.between(SCHEDULE.sipEveryMs);
      this.sipDue = true;
    }
    if (this.sipDue && !this.oneShot) this.begin('sip');
  }

  /** Something to glance at. False when he can't now (a one-shot playing, the cooldown, the sofa). */
  notice(_reason: NoticeReason): boolean {
    if (!this.started || this.chilling || this.oneShot || this.clock < this.lookReadyAt) return false;
    this.begin('look');
    return true;
  }

  /** A refill brought to his table (only while he waits for one). */
  refill(by: string): boolean {
    if (!this.started || this.chilling || this.emptySince === null) return false;
    this.newMug(by, 'table');
    this.queue = ['look', 'sip'];
    if (!this.oneShot) this.next();
    return true;
  }

  /** Jason serves him his usual: a fresh mug, and he tastes it at once (whether or not he was waiting). */
  serve(by: string): boolean {
    if (!this.started || this.chilling) return false;
    this.newMug(by, 'latte');
    this.queue = ['sip'];
    if (!this.oneShot) this.next();
    return true;
  }

  /** The sprite finished a one-shot. */
  oneShotDone(): void {
    const done = this.oneShot;
    if (!done) return;
    this.oneShot = null;
    if (done === 'sip') {
      this.sips++;
      if (this.sips >= SCHEDULE.sipsPerMug && this.emptySince === null) this.emptyMug();
    }
    this.next();
  }

  /** Tests and dev tools: the mug drunk to the bottom now, as if by six sips. */
  drain(): void {
    if (!this.started || this.chilling || this.emptySince !== null) return;
    this.sips = SCHEDULE.sipsPerMug;
    this.emptyMug();
  }

  private emptyMug(): void {
    this.emptySince = this.clock;
    this.sipDue = false;
    this.queue = this.queue.filter((q) => q !== 'sip');
    this.steamLeft = 0;
    this.fx.steam(false);
    this.fx.empty();
    this.fx.waiting(true);
  }

  private next(): void {
    const q = this.queue.shift();
    if (q) return this.begin(q);
    if (this.sipDue && this.emptySince === null) return this.begin('sip');
    this.fx.play(this.loop, true);
  }

  private begin(shot: OneShot): void {
    this.oneShot = shot;
    if (shot === 'sip') {
      this.sipDue = false;
      this.fx.sip();
    } else this.lookReadyAt = this.clock + SCHEDULE.lookCooldownMs;
    this.fx.play(shot, false);
  }

  private newMug(by: string, via: 'table' | 'latte'): void {
    const waited = this.emptySince !== null;
    this.sips = 0;
    this.emptySince = null;
    this.sipDue = false;
    this.sipIn = this.between(SCHEDULE.sipEveryMs);
    if (waited) this.fx.waiting(false);
    this.fx.refilled(by, via);
    this.freshMug();
  }

  private freshMug(): void {
    this.steamLeft = SCHEDULE.steamMs;
    this.fx.steam(true);
  }
}
