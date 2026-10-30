import type Phaser from 'phaser';
import { bus } from '../../bus/events';
import { CHARACTERS, cafeTexture, characterById, type CharacterDef, type CharacterId } from '../../content/characters';
import npcs from '../../content/npcs.json';
import type { HotspotDef } from '../../content/rooms';
import type { PixelBursts } from '../fx/confetti';
import { BRISK_SPEED, RUN_SPEED } from '../iso/IsoWalker';
import type { Room, Sortable } from '../iso/Room';
import { ensureCrewPack } from './CrewPack';
import { CrewWalker } from './CrewWalker';

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const between = (a: number, b: number) => a + Math.random() * (b - a);

interface Npc {
  def: CharacterDef;
  w: CrewWalker;
  step: number;
  timer: number;
  /** Talking to someone (a greeting): the routine waits. */
  holdUntil: number;
}

/**
 * The crew in the café. Whoever isn't the player works as an NPC barista: Jason at the
 * espresso machine, Joel chatting at the counter, Jonas going back and forth to the tables
 * (Roxy's own routine is CafeLife). A crew player walks where you click, works the Morning
 * Rush and makes coffee at the machine (the shot, the steam and the pour as you hold). Back
 * from a gig, the twin in the café says hello.
 */
export class CrewLife {
  private readonly npcs: Npc[] = [];
  player: CrewWalker | null = null;
  private readonly playerDef: CharacterDef;
  private rush = false;
  private token = 0;
  private clock = 0;
  private destroyed = false;
  private readonly unsubs: (() => void)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room,
    private readonly bursts: PixelBursts,
    playerId: CharacterId,
    /** Who just came back from a gig (walks in from the door; the twin says hello). */
    private readonly returning: CharacterId | null = null,
  ) {
    this.playerDef = characterById(playerId);
    for (const c of CHARACTERS) {
      if (c.rig !== 'crew') continue;
      void ensureCrewPack(scene, cafeTexture(c)).then(() => !this.destroyed && this.spawn(c));
    }
    this.unsubs.push(
      bus.on('latte:begin', () => this.beginCup()),
      bus.on('latte:result', ({ grade }) => this.served(grade)),
      bus.on('crew:say', ({ id, text, ms }) => this.say(id, text, ms)),
      bus.on('latte:shiftEnd', () => this.player?.stopFx()),
      bus.on('latte:hold', ({ stage, holding }) => this.workMachine(stage, holding)),
    );
  }

  /** True while the player is one of the crew (Roxy is drawn by IsoRoxy). */
  get playerIsCrew(): boolean {
    return this.playerDef.rig === 'crew';
  }

  private spawn(c: CharacterDef): void {
    const w = new CrewWalker(this.scene, c.id, cafeTexture(c));
    const home = this.room.spots.get(c.npc.home);
    const door = this.room.spots.get('door');
    if (c.id === this.playerDef.id) {
      this.player = w;
      if (this.returning === c.id && door && home) {
        // Back from a gig: in through the door, the twin says hello, then back to work.
        w.attach(this.room, door.u, door.v, 'SW');
        this.scene.time.delayedCall(1400, () => !this.destroyed && this.greetReturning());
        this.scene.time.delayedCall(600, () => !this.destroyed && w.goToSpot(c.npc.home));
      } else w.attach(this.room, home?.u ?? 0, home?.v ?? 0, home?.facing ?? 'SE');
      return;
    }
    w.attach(this.room, home?.u ?? 0, home?.v ?? 0, home?.facing ?? 'SE');
    w.sprite.setAlpha(0);
    this.scene.tweens.add({ targets: w.sprite, alpha: 1, duration: 400 });
    this.npcs.push({ def: c, w, step: 0, timer: between(500, 2500), holdUntil: 0 });
  }

  actors(): Sortable[] {
    const out: Sortable[] = this.npcs.map((n) => n.w);
    if (this.player) out.push(this.player);
    return out;
  }

  // ---------- the player ----------

  walkTo(u: number, v: number): void {
    const p = this.player;
    if (!p || this.rush) return;
    ++this.token;
    const t = this.room.nearestWalkable(u, v);
    p.walkTo(t.u, t.v);
  }

  goToHotspot(h: HotspotDef, onArrive: () => void): void {
    const p = this.player;
    if (!p) return onArrive();
    const tok = ++this.token;
    p.stopAction();
    // Across the café at a run (the door is a long way from the counter).
    const far = Math.hypot(h.stand.u - p.u, h.stand.v - p.v) > 250;
    const ok = p.walkTo(
      h.stand.u,
      h.stand.v,
      () => {
        if (tok !== this.token) return;
        p.face(h.facing);
        onArrive();
      },
      far ? RUN_SPEED : BRISK_SPEED,
    );
    if (!ok) onArrive();
  }

  /** Morning Rush: to the counter, then a reaction per order. */
  setRush(on: boolean): void {
    this.rush = on;
    const p = this.player;
    if (!p) return;
    ++this.token;
    p.stopAction();
    if (on) p.goToSpot(this.playerDef.npc.home);
  }

  rushOrder(correct: boolean): void {
    if (!this.rush || !this.player) return;
    if (correct) {
      this.player.perform('gesture_s');
      this.sparkleAtCounter();
    } else this.player.perform('oops_s');
  }

  // ---------- making coffee ----------

  /** Making the coffee at the machine: the shot running, the milk steaming, the pour. */
  private workMachine(stage: 1 | 2 | 3, holding: boolean): void {
    const p = this.player;
    if (!p) return;
    if (!holding) {
      // The shot and the pour finish on their own; the steam stops when the wand closes.
      if (stage === 2) p.stopFx();
      return;
    }
    p.stopAction();
    p.face('NE');
    p.playFx(stage === 1 ? 'fx_espresso' : stage === 2 ? 'fx_steam' : 'fx_latte', stage === 2, true);
  }

  /** A cup starts: back to the machine if the barista wandered off, facing it. */
  private beginCup(): void {
    const p = this.player;
    if (!p) return;
    const tok = ++this.token;
    const atMachine = () => {
      if (tok !== this.token) return;
      p.stopAction();
      p.face('NE');
    };
    const home = this.room.spots.get(this.playerDef.npc.home);
    if (home && Math.hypot(p.u - home.u, p.v - home.v) > 4) p.goToSpot(this.playerDef.npc.home, atMachine);
    else atMachine();
  }

  /** A cup is served: the barista turns round with it — a heart and sparkles for a perfect one. */
  private served(grade: 'perfect' | 'good' | 'messy'): void {
    const p = this.player;
    if (!p) return;
    ++this.token;
    p.face('SE');
    if (grade === 'perfect') {
      p.perform('celebrate_s');
      p.playFx('fx_heart');
      this.sparkleAtCounter();
    } else p.perform(grade === 'good' ? 'gesture_s' : 'oops_s');
  }

  // ---------- talking ----------

  private walkerOf(id: CharacterId): CrewWalker | null {
    if (this.player?.id === id) return this.player;
    return this.npcs.find((n) => n.def.id === id)?.w ?? null;
  }

  say(id: CharacterId, text: string, ms = 2800): void {
    const w = this.walkerOf(id);
    if (!w) return;
    const npc = this.npcs.find((n) => n.w === w);
    if (npc) {
      npc.holdUntil = this.clock + ms;
      w.stop();
      w.face('SE');
      w.loop('talk_s');
    }
    w.say(text, ms);
  }

  /** The twin in the café greets whoever came back from a gig; the player answers. */
  private greetReturning(): void {
    const me = this.playerDef;
    const twin = me.twin ? this.npcs.find((n) => n.def.id === me.twin) : null;
    if (!twin) return;
    const greet = (npcs.twinBanter as Record<string, string[]>)[twin.def.id];
    const reply = (npcs.twinReply as Record<string, string[]>)[me.id];
    if (greet?.length) this.say(twin.def.id, pick(greet), 3200);
    if (reply?.length) this.scene.time.delayedCall(3300, () => !this.destroyed && this.player?.say(pick(reply), 2600));
  }

  private sparkleAtCounter(): void {
    const t = this.room.spots.get('counter-top');
    if (!t) return;
    const s = this.room.toScreen(t.u, t.v);
    this.bursts.sparkle(s.x, s.y, 8);
  }

  // ---------- the NPC routines ----------

  private runRoutine(n: Npc): void {
    const w = n.w;
    const home = n.def.npc.home;
    switch (n.def.npc.routine) {
      case 'machine': {
        // Back to the room at the machine, now and then a word with the room.
        const steps = [
          () => (w.stopAction(), w.face('NE'), between(5000, 9000)),
          () => (w.face('SE'), w.loop('calm_s'), between(2500, 4000)),
          () => (w.perform('gesture_s'), 2000),
        ];
        n.timer = steps[n.step++ % steps.length]();
        return;
      }
      case 'chat': {
        const steps = [
          () => (w.face('SE'), w.loop('talk_s'), between(3000, 5000)),
          () => (w.stopAction(), between(2000, 4000)),
          () => (w.loop('calm_s'), between(3000, 5000)),
          () => (w.perform('gesture_s'), 2000),
          () => (w.stopAction(), w.face('NE'), between(3000, 5000)),
        ];
        n.timer = steps[n.step++ % steps.length]();
        return;
      }
      case 'tables': {
        const steps = [
          () => (w.stopAction(), w.face('NE'), between(4000, 6500)),
          () => {
            n.timer = Infinity;
            if (!w.goToSpot('crew-tables', () => (n.timer = 0), false)) n.timer = 0;
            return n.timer;
          },
          () => (w.face('SE'), w.loop('talk_s'), between(3000, 4500)),
          () => {
            w.stopAction();
            n.timer = Infinity;
            if (!w.goToSpot(home, () => (n.timer = 0), false)) n.timer = 0;
            return n.timer;
          },
        ];
        n.timer = steps[n.step++ % steps.length]();
        return;
      }
      default:
        n.timer = 5000;
    }
  }

  update(dt: number): void {
    this.clock += dt;
    for (const n of this.npcs) {
      n.w.update(dt);
      if (this.clock < n.holdUntil) continue;
      if (n.holdUntil) {
        n.holdUntil = 0;
        n.w.stopAction();
        n.timer = 0;
      }
      if (n.w.moving) continue;
      n.timer -= dt;
      if (n.timer <= 0) this.runRoutine(n);
    }
    this.player?.update(dt);
  }

  destroy(): void {
    this.destroyed = true;
    ++this.token;
    this.unsubs.forEach((u) => u());
    for (const n of this.npcs) n.w.destroy();
    this.player?.destroy();
    this.npcs.length = 0;
    this.player = null;
  }
}
