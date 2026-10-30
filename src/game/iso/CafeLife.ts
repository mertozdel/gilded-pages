import type Phaser from 'phaser';
import { REGULARS } from '../../content';
import { WALK_INS } from '../companion/art/people';
import type { HotspotDef } from '../../content/rooms';
import type { PixelBursts } from '../fx/confetti';
import { dayTimeOf, seasonOf } from './cafeArt';
import { cafeSurround } from './surround';
import { IsoNpc } from './IsoNpc';
import { IsoRoom } from './IsoRoom';
import type { Room, Sortable, Spot } from './Room';
import type { IsoRoxy } from './IsoRoxy';
import { BRISK_SPEED } from './IsoWalker';

interface Customer {
  npc: IsoNpc;
  state: 'in' | 'queued' | 'served' | 'toSeat' | 'seated' | 'leaving' | 'gone';
  queue: number;
  seat: Spot | null;
  timer: number;
}

const QUEUE = ['queue-0', 'queue-1', 'queue-2'];
const SEATS = ['seat-a1', 'seat-a2', 'seat-b1', 'seat-b2', 'seat-arm1', 'seat-arm2'];
const MAX_CUSTOMERS = 3;
/** What she does between stretches of work at the bar, turned to the room. */
const BAR_BREAKS = ['sip', 'hairSwipe', 'think'] as const;

const seatBox = (s: { u: number; v: number }) => ({ u0: s.u - 0.25, v0: s.v - 0.25, u1: s.u + 0.25, v1: s.v + 0.25 });

/**
 * Life at Café Machorn. Roxy works the bar (wipe → take order → pull shot → steam milk →
 * latte art → serve → wave), walk-in customers queue at the counter, take their cup to a
 * table and leave; two regulars type away on the banquette. Between orders she works the
 * counter facing the way the bar spot says, now and then turning to the room for a sip of
 * coffee, a hair swipe or a think. Hotspots, clicks on the floor, the reading break, Morning
 * Rush and the courier all borrow Roxy from the routine.
 */
export class CafeLife {
  private customers: Customer[] = [];
  private regulars: IsoNpc[] = [];
  private phase: 'idle' | 'toBar' | 'order' | 'glance' | 'visit' | 'break' | 'returning' | 'rush' = 'idle';
  private token = 0;
  private spawnIn = 3500;
  private orders = 0;
  private visitTimer = 0;
  private barTimer = 0;
  private readonly hook: Phaser.GameObjects.Image | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room,
    private readonly roxy: IsoRoxy,
    private readonly bursts: PixelBursts,
  ) {
    for (const [spotName, id] of [
      ['regular-1', 'writer'],
      ['regular-2', 'guide'],
    ] as const) {
      // A painted room has its regulars painted in.
      if (!room.spots.has(spotName)) continue;
      const s = room.spot(spotName);
      const npc = new IsoNpc(scene, `npc-${id}`, room);
      npc.sitAt(s.u, s.v, s.facing, seatBox(s));
      npc.typing = true;
      this.regulars.push(npc);
    }
    // Tile rooms get the street around them, the apron hook and window light drawn in;
    // a painted room has all of that in its painting.
    if (!(room instanceof IsoRoom)) return;
    // The street around the café: under the room and, for the front pavement, over it.
    const street = cafeSurround(room.U, room.V, room.wallH, dayTimeOf(), seasonOf());
    for (const [key, sprite, depth] of [
      ['cafe-street-back', street.back, -2000],
      ['cafe-street-front', street.front, 9000],
    ] as const) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.addCanvas(key, sprite.canvas);
      const img = scene.add.image(0, 0, key);
      img.setOrigin(sprite.origin.x / img.width, sprite.origin.y / img.height);
      room.addExtra(img, 0, 0, 0, depth);
    }
    // The apron waits on its hook on the back wall while she is off shift.
    this.hook = room.addExtra(scene.add.image(0, 0, 'cafe-apron-hook').setOrigin(0.5, 0), 0, 6.95, 49, -1000);
    // Cool daylight through the windows (by day).
    if (dayTimeOf() === 'morning' || dayTimeOf() === 'afternoon') {
      const light = scene.add.image(0, 0, 'cafe-window-light');
      light.setOrigin((room.V * 16 + 1) / light.width, 1 / light.height);
      room.addExtra(light, 0, 0, 0, -1000);
    }
  }

  /** Everything this routine adds that the room must depth-sort. */
  actors(): Sortable[] {
    return [...this.regulars, ...this.customers.filter((c) => c.state !== 'gone').map((c) => c.npc)];
  }

  // ---------- arriving ----------

  /** Coming in from the street (the map, the apartment, a museum): door → bar. */
  enterFromDoor(): void {
    const d = this.room.spot('door');
    this.roxy.attach(this.room, d.u, d.v, 'SW');
    this.roxy.setApron(true);
    this.phase = 'idle';
  }

  /** First thing in the morning: already behind the bar. */
  startAtBar(): void {
    const b = this.room.spot('roxy-bar');
    this.roxy.attach(this.room, b.u, b.v, b.facing);
    this.roxy.setApron(true);
  }

  /** Closing a book: she is on the sofa; stand, tie the apron back on at the hook, back to work. */
  returnFromBreak(): void {
    const tok = ++this.token;
    this.phase = 'returning';
    const s = this.room.spot('roxy-sofa');
    this.roxy.attach(this.room, s.u, s.v, s.facing);
    this.roxy.setApron(false);
    this.roxy.sit(s.u, s.v, s.facing, this.sofaSeat());
    this.scene.time.delayedCall(700, () => {
      if (tok !== this.token) return;
      this.roxy.standUp();
      const toHook = () =>
        tok === this.token &&
        this.roxy.goToSpot('hook', () => {
          if (tok !== this.token) return;
          this.roxy.setApron(true);
          const started = this.roxy.perform('untieApron', () => tok === this.token && (this.phase = 'idle'), true);
          if (!started) this.phase = 'idle';
        });
      const front = this.room.spots.get('sofa-front');
      if (front) this.roxy.glideTo(front.u, front.v, toHook);
      else toHook();
    });
  }

  private sofaSeat() {
    return seatBox(this.room.spot('roxy-sofa'));
  }

  // ---------- borrowing Roxy ----------

  /** A hotspot was clicked: she walks to its spot first, then it opens. */
  goToHotspot(h: HotspotDef, onArrive: () => void): void {
    const tok = ++this.token;
    this.phase = 'visit';
    this.visitTimer = 9000;
    this.roxy.stopLoop();
    this.roxy.standUp();
    const ok = this.roxy.walkTo(
      h.stand.u,
      h.stand.v,
      () => {
        if (tok !== this.token) return;
        this.roxy.face(h.facing);
        if (h.id === 'counter') this.phase = 'idle';
        onArrive();
      },
      BRISK_SPEED,
    );
    if (!ok) onArrive();
  }

  /** A click on the floor: she strolls there, then drifts back to the bar after a while. */
  walkTo(u: number, v: number): void {
    if (this.phase === 'break' || this.phase === 'rush') return;
    const tok = ++this.token;
    this.phase = 'visit';
    this.visitTimer = 8000;
    this.roxy.stopLoop();
    this.roxy.standUp();
    const p = this.room.nearestWalkable(u, v);
    this.roxy.walkTo(p.u, p.v, () => tok === this.token && (this.visitTimer = 6000));
  }

  // ---------- the reading break ----------

  /** A book was picked: hook (apron off) → sofa → sit; `onSeated` opens the Reading Room. */
  startBreak(onSeated: () => void): void {
    const tok = ++this.token;
    this.phase = 'break';
    const r = this.roxy;
    r.stopLoop();
    r.standUp();
    const toSofa = () => {
      if (tok !== this.token) return;
      const s = this.room.spot('roxy-sofa');
      const front = this.room.spots.get('sofa-front') ?? s;
      const sit = () => {
        if (tok !== this.token) return;
        r.sit(s.u, s.v, s.facing, this.sofaSeat());
        this.scene.time.delayedCall(450, () => tok === this.token && onSeated());
      };
      // The seat may be behind a table, off the floor: the last step goes straight to it.
      r.walkTo(front.u, front.v, () => tok === this.token && r.glideTo(s.u, s.v, sit), BRISK_SPEED);
    };
    if (!r.apronOn) return toSofa();
    r.goToSpot('hook', () => {
      if (tok !== this.token) return;
      const done = () => {
        r.setApron(false);
        toSofa();
      };
      if (!r.perform('untieApron', done)) done();
    });
  }

  skipBreak(): void {
    ++this.token;
    this.phase = 'break';
    const s = this.room.spot('roxy-sofa');
    this.roxy.setApron(false);
    this.roxy.sit(s.u, s.v, s.facing, this.sofaSeat());
  }

  // ---------- Morning Rush & deliveries ----------

  setRush(on: boolean): void {
    ++this.token;
    this.phase = on ? 'rush' : 'idle';
    if (on) {
      for (const c of this.customers) if (c.state !== 'seated') this.leave(c);
      this.roxy.stopLoop();
      this.roxy.goToSpot('roxy-bar');
    }
  }

  rushOrder(correct: boolean): void {
    if (this.phase !== 'rush') return;
    if (correct) this.roxy.perform('pullShot', () => this.roxy.perform('serve', () => this.sparkleAtCounter()));
    else this.roxy.perform('flustered');
  }

  delivery(): void {
    const d = this.room.spot('door');
    const p = this.room.spot('parcel');
    const at = this.room.toScreen(d.u, d.v);
    const bike = this.scene.add.image(at.x, at.y, 'courier', 0).setOrigin(0.5, 1).setDepth(4000).setAlpha(0);
    const spin = this.scene.time.addEvent({ delay: 110, loop: true, callback: () => bike.setFrame(bike.frame.name === '0' ? 1 : 0) });
    this.scene.tweens.add({
      targets: bike,
      alpha: 1,
      duration: 300,
      onComplete: () => {
        const pt = this.room.toScreen(p.u, p.v);
        const box = this.scene.add.image(pt.x, pt.y, 'parcel').setOrigin(0.5, 1).setDepth(4000);
        this.bursts.sparkle(pt.x, pt.y - 6, 12);
        this.scene.tweens.add({ targets: bike, alpha: 0, delay: 700, duration: 400, onComplete: () => (spin.remove(), bike.destroy()) });
        this.scene.tweens.add({ targets: box, alpha: 0, delay: 2600, duration: 500, onComplete: () => box.destroy() });
      },
    });
  }

  // ---------- frame loop ----------

  update(dt: number): void {
    for (const n of this.regulars) n.update(dt);
    this.updateCustomers(dt);
    this.hook?.setVisible(!this.roxy.apronOn);

    if (this.phase === 'break' || this.phase === 'returning' || this.phase === 'rush' || this.phase === 'glance') return;
    if (this.phase === 'visit') {
      this.visitTimer -= dt;
      if (this.visitTimer > 0 || this.roxy.moving) return;
      this.phase = 'idle';
    }

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = 9000 + Math.random() * 9000;
      if (this.customers.filter((c) => c.state !== 'gone').length < MAX_CUSTOMERS) this.spawnCustomer();
    }

    if (this.phase === 'order') return;
    if (!this.roxy.isIdle()) return;
    const bar = this.room.spot('roxy-bar');
    if (Math.hypot(this.roxy.u - bar.u, this.roxy.v - bar.v) > 0.1) {
      this.phase = 'toBar';
      this.roxy.goToSpot('roxy-bar', () => (this.phase = 'idle'));
      return;
    }
    this.phase = 'idle';
    const waiting = this.customers.find((c) => c.state === 'queued' && c.queue === 0);
    if (waiting) return this.startOrder(waiting);
    if (this.roxy.currentState === 'wipeCounter') {
      this.barTimer -= dt;
      if (this.barTimer > 0) return;
      this.roxy.stopLoop();
      this.roxy.face('SE');
      this.roxy.perform(BAR_BREAKS[Math.floor(Math.random() * BAR_BREAKS.length)]);
      return;
    }
    this.roxy.face(bar.facing);
    this.roxy.perform('wipeCounter');
    this.barTimer = 12000 + Math.random() * 10000;
  }

  private startOrder(c: Customer): void {
    const tok = ++this.token;
    const ok = () => tok === this.token;
    const r = this.roxy;
    this.phase = 'order';
    r.stopLoop();
    r.face('SE');
    const step = (name: Parameters<IsoRoxy['perform']>[0], next: () => void) => {
      if (!ok()) return;
      if (!r.perform(name, () => ok() && next())) this.phase = 'idle';
    };
    step('takeOrder', () =>
      step('pullShot', () => {
        if (!r.perform('steamMilk')) return void (this.phase = 'idle');
        this.scene.time.delayedCall(1400, () =>
          step('latteArt', () =>
            step('serve', () => {
              this.sparkleAtCounter();
              c.state = 'served';
              c.timer = 600;
              step('wave', () => {
                this.phase = 'idle';
                if (++this.orders % 3 === 0) this.glance();
              });
            }),
          ),
        );
      }),
    );
  }

  /** Every few orders she looks across at the window sofa and the shelf of books. */
  private glance(): void {
    const tok = ++this.token;
    this.phase = 'glance';
    this.roxy.face('NE');
    this.roxy.perform('admireArt');
    this.scene.time.delayedCall(1800, () => {
      if (tok !== this.token) return;
      this.roxy.stopLoop();
      this.roxy.face('SE');
      this.phase = 'idle';
    });
  }

  private sparkleAtCounter(): void {
    const t = this.room.spots.get('counter-top');
    const s = t ? this.room.toScreen(t.u, t.v) : this.room.toScreen(3.25, 7.75, 24);
    this.bursts.sparkle(s.x, s.y, 8);
  }

  // ---------- customers ----------

  private spawnCustomer(): void {
    // Painted rooms have their guests painted in.
    if (!this.room.spots.has('queue-0')) return;
    const pool = [...REGULARS.filter((r) => r.id !== 'writer' && r.id !== 'guide').map((r) => r.id), ...WALK_INS.map((w) => w.id)];
    const pick = { id: pool[Math.floor(Math.random() * pool.length)] };
    const npc = new IsoNpc(this.scene, `npc-${pick.id}`, this.room);
    const d = this.room.spot('door');
    npc.place(d.u, d.v, 'SW');
    npc.img.setAlpha(0);
    this.scene.tweens.add({ targets: npc.img, alpha: 1, duration: 300 });
    const c: Customer = { npc, state: 'in', queue: -1, seat: null, timer: 0 };
    this.customers.push(c);
    this.joinQueue(c);
  }

  private joinQueue(c: Customer): void {
    const taken = new Set(this.customers.filter((o) => o !== c && (o.state === 'in' || o.state === 'queued')).map((o) => o.queue));
    const slot = [0, 1, 2].find((q) => !taken.has(q));
    if (slot === undefined) return this.leave(c);
    c.queue = slot;
    const s = this.room.spot(QUEUE[slot]);
    c.npc.walkTo(s.u, s.v, () => {
      c.npc.face(s.facing);
      c.state = 'queued';
    });
  }

  private updateCustomers(dt: number): void {
    for (const c of this.customers) {
      if (c.state === 'gone') continue;
      c.npc.update(dt);
      if (c.state === 'served') {
        c.timer -= dt;
        if (c.timer <= 0) this.findSeat(c);
      } else if (c.state === 'seated') {
        c.timer -= dt;
        if (c.timer <= 0) this.leave(c);
      } else if (c.state === 'queued' && c.queue > 0) {
        // Move up when the place in front frees.
        const ahead = this.customers.some((o) => o !== c && (o.state === 'queued' || o.state === 'in') && o.queue === c.queue - 1);
        if (!ahead) {
          c.queue--;
          const s = this.room.spot(QUEUE[c.queue]);
          c.state = 'in';
          c.npc.walkTo(s.u, s.v, () => {
            c.npc.face(s.facing);
            c.state = 'queued';
          });
        }
      }
    }
    this.customers = this.customers.filter((c) => c.state !== 'gone' || c.npc.img.active);
  }

  private findSeat(c: Customer): void {
    const used = new Set(this.customers.filter((o) => o.seat).map((o) => o.seat!.name));
    const free = SEATS.filter((n) => !used.has(n));
    if (!free.length) return this.leave(c);
    const seat = this.room.spot(free[Math.floor(Math.random() * free.length)]);
    c.seat = seat;
    c.state = 'toSeat';
    c.queue = -1;
    const near = this.room.nearestWalkable(seat.u, seat.v);
    c.npc.walkTo(near.u, near.v, () => {
      c.npc.sitAt(seat.u, seat.v, seat.facing, seatBox(seat));
      c.state = 'seated';
      c.timer = 18000 + Math.random() * 16000;
    });
  }

  private leave(c: Customer): void {
    c.state = 'leaving';
    c.queue = -1;
    c.npc.standUp();
    const d = this.room.spot('door');
    const go = () => {
      c.state = 'gone';
      this.scene.tweens.add({ targets: c.npc.img, alpha: 0, duration: 300, onComplete: () => c.npc.destroy() });
    };
    c.seat = null;
    if (!c.npc.walkTo(d.u, d.v, go)) go();
  }

  destroy(): void {
    ++this.token;
    for (const n of this.regulars) n.destroy();
    for (const c of this.customers) c.npc.destroy();
    this.customers = [];
    this.regulars = [];
  }
}
