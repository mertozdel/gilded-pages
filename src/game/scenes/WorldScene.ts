import Phaser from 'phaser';
import { bus, type SceneId, type StageRect } from '../../bus/events';
import type { CharacterId } from '../../content/characters';
import { paintingOf, roomKind, ROOM_MAPS, propsOf, type RoomId } from '../../content/rooms';
import { useStore } from '../../store';
import { CrewLife } from '../crew/CrewLife';
import { Lineup } from '../crew/Lineup';
import { PixelBursts } from '../fx/confetti';
import { CafeLife } from '../iso/CafeLife';
import { dayTimeOf, refreshCafeWalls, registerCafeArt, seasonOf } from '../iso/cafeArt';
import { IsoRoom } from '../iso/IsoRoom';
import { IsoRoxy } from '../iso/IsoRoxy';
import { PaintedRoom } from '../iso/PaintedRoom';
import type { Room } from '../iso/Room';
import { cssToGame, gameToCss, setPixelMode } from '../pixelScale';
import { ensureNpcTextures } from '../textures';

/**
 * The one persistent game scene. Screens ask for a room by mounting a RoomView, which
 * reports where the room should sit (`room:layout`); the scene builds that room from its
 * Tiled map, moves Roxy into it and keeps everything depth-sorted. Roxy is created once and
 * lives for the whole session. Screens without a room show no world (for now).
 *
 * The crew: whoever is playing gets the clicks and hotspot walks — Roxy through CafeLife as
 * always, or a crew member through CrewLife, while Roxy keeps her barista loop as an NPC.
 * The select screen's room is the same café, dimmed, with the four standing in a line.
 */
export class WorldScene extends Phaser.Scene {
  private roxy!: IsoRoxy;
  private bursts!: PixelBursts;
  private origins = new Map<string, { x: number; y: number }>();
  private room: Room | null = null;
  private loading: RoomId | null = null;
  private artReady = false;
  private life: CafeLife | null = null;
  private crew: CrewLife | null = null;
  private lineup: Lineup | null = null;
  /** Who the crew routine was built for. */
  private crewFor: CharacterId | null = null;
  private rect: StageRect | null = null;
  private backdrop!: Phaser.GameObjects.Rectangle;
  private scenePrev: SceneId | null = null;
  private sceneNow: SceneId = 'cafe';
  private firstRoom = true;
  private hotspotSig = '';
  private anchorSig = '';
  private windowKey = '';
  /** When the player last dragged the room; the view only follows Roxy a while after. */
  private userPanAt = -Infinity;

  constructor() {
    super({ key: 'world' });
  }

  create(): void {
    const { player } = useStore.getState();
    ensureNpcTextures(this);
    this.windowKey = `${dayTimeOf()}|${seasonOf()}`;
    this.roxy = new IsoRoxy(this, player.currentBlouse);
    this.bursts = new PixelBursts(this, 5000);
    // A warm dark surround behind a room, like the reference's diorama.
    this.backdrop = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x2a1d18).setOrigin(0, 0).setDepth(-5000).setVisible(false);
    this.scale.on('resize', () => this.backdrop.setSize(this.scale.width, this.scale.height));

    this.sceneNow = bus.last('scene:enter')?.scene ?? 'cafe';
    const pending = bus.last('room:layout');
    const unsubs = [
      bus.on('scene:enter', ({ scene }) => {
        this.scenePrev = this.sceneNow;
        this.sceneNow = scene;
      }),
      bus.on('room:layout', ({ room, rect }) => this.showRoom(room, rect)),
      bus.on('room:click', ({ x, y }) => {
        if (!this.room || !this.life) return;
        const g = cssToGame(x, y);
        const f = this.room.toFloor(g.x, g.y);
        if (!this.room.inBounds(f.u, f.v)) return;
        this.userPanAt = -Infinity;
        if (this.crew?.playerIsCrew) this.crew.walkTo(f.u, f.v);
        else this.life.walkTo(f.u, f.v);
      }),
      bus.on('room:pan', ({ dx }) => {
        if (!(this.room instanceof PaintedRoom)) return;
        this.room.panBy(cssToGame(dx, 0).x - cssToGame(0, 0).x);
        this.userPanAt = this.time.now;
        this.emitHotspots(this.room);
        this.emitAnchors(this.room);
      }),
      bus.on('room:goto', ({ id, tag }) => {
        const h = this.room?.hotspots.find((s) => s.id === id);
        if (!h || !this.life) return bus.emit('companion:arrived', { tag });
        this.userPanAt = -Infinity;
        if (this.crew?.playerIsCrew) this.crew.goToHotspot(h, () => bus.emit('companion:arrived', { tag }));
        else this.life.goToHotspot(h, () => bus.emit('companion:arrived', { tag }));
      }),
      // Screens without a room (museums for now) don't wait for a walk.
      bus.on('companion:goto', ({ tag }) => bus.emit('companion:arrived', { tag })),
      bus.on('outfit:change', ({ blouseId }) => {
        this.roxy.setBlouse(blouseId);
        if (this.room) {
          const s = this.room.toScreen(this.roxy.u, this.roxy.v, 30);
          this.bursts.sparkle(s.x, s.y);
        }
      }),
      bus.on('break:start', (e) => {
        // A venue break is the screen's (a cutscene), not a walk to the reading bench.
        if (!('bookId' in e)) return;
        const { bookId } = e;
        if (!this.life) return bus.emit('break:seated', { bookId });
        this.life.startBreak(() => bus.emit('break:seated', { bookId }));
      }),
      bus.on('break:skip', () => this.life?.skipBreak()),
      bus.on('cafe:delivery', () => this.life?.delivery()),
      bus.on('rush:start', () => (this.crew?.playerIsCrew ? this.crew.setRush(true) : this.life?.setRush(true))),
      bus.on('rush:order', ({ correct }) => (this.crew?.playerIsCrew ? this.crew.rushOrder(correct) : this.life?.rushOrder(correct))),
      bus.on('rush:end', () => (this.crew?.playerIsCrew ? this.crew.setRush(false) : this.life?.setRush(false))),
      // Roxy making a coffee: her barista moves at the bar (the crew's are CrewLife's).
      bus.on('latte:begin', () => !this.crew?.playerIsCrew && this.life?.setRush(true)),
      bus.on('latte:result', ({ grade }) => !this.crew?.playerIsCrew && this.life?.rushOrder(grade !== 'messy')),
      bus.on('latte:shiftEnd', () => !this.crew?.playerIsCrew && this.life?.setRush(false)),
      // …and each stage while it's held: pull the shot, steam the milk, pour the art.
      bus.on('latte:hold', ({ stage, holding }) => {
        if (this.crew?.playerIsCrew || !this.life) return;
        if (!holding) {
          if (stage === 2) this.roxy.stopLoop();
          return;
        }
        this.roxy.face('NE');
        this.roxy.perform(stage === 1 ? 'pullShot' : stage === 2 ? 'steamMilk' : 'latteArt');
      }),
      useStore.subscribe((s, prev) => {
        if (s.pixel !== prev.pixel && this.rect) this.showRoom(this.room?.id ?? null, this.rect);
        // A new player in the same café (the hash changed): the crew routine is rebuilt around them.
        if (s.character !== prev.character && this.room && this.life && this.crewFor !== s.character) this.buildCrew(this.room, null);
      }),
    ];
    // The café windows follow the clock and the season.
    const clock = this.time.addEvent({
      delay: 30_000,
      loop: true,
      callback: () => {
        const key = `${dayTimeOf()}|${seasonOf()}`;
        if (key === this.windowKey) return;
        this.windowKey = key;
        if (this.artReady) refreshCafeWalls(this, 14, 10);
      },
    });
    this.events.once('shutdown', () => {
      unsubs.forEach((u) => u());
      clock.remove();
    });
    if (pending) this.showRoom(pending.room, pending.rect);
  }

  private showRoom(id: RoomId | null, rect: StageRect | null): void {
    this.rect = rect;
    if (!id || !rect) {
      this.life?.destroy();
      this.crew?.destroy();
      this.lineup?.destroy();
      this.room?.destroy();
      this.life = null;
      this.crew = null;
      this.lineup = null;
      this.room = null;
      this.roxy.attach(null);
      this.backdrop.setVisible(false);
      this.emitHotspots(null);
      this.emitAnchors(null);
      return;
    }
    const painted = roomKind(id) === 'painted';
    // A painted room needs its painting loaded first (once).
    if (painted) {
      const key = `painting-${paintingOf(id)}`;
      if (!this.textures.exists(key)) {
        if (this.loading === id) return;
        this.loading = id;
        this.load.image(key, `${import.meta.env.BASE_URL}${String(propsOf(ROOM_MAPS[id]).image)}`);
        this.load.once(Phaser.Loader.Events.COMPLETE, () => {
          this.loading = null;
          this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
          if (this.rect) this.showRoom(id, this.rect);
        });
        this.load.start();
        return;
      }
    }
    // Painted rooms draw at device resolution; tile rooms on the 640×360 grid. Changing it
    // resizes the canvas, and the room view reports again.
    setPixelMode(painted ? 'native' : 'grid');
    const fresh = this.room?.id !== id;
    if (this.room?.id !== id) {
      this.life?.destroy();
      this.crew?.destroy();
      this.lineup?.destroy();
      this.room?.destroy();
      this.life = null;
      this.crew = null;
      this.lineup = null;
      if (painted) this.room = new PaintedRoom(this, id, `painting-${paintingOf(id)}`);
      else {
        if (!this.artReady) {
          this.origins = registerCafeArt(this, 14, 10);
          this.artReady = true;
        }
        this.room = new IsoRoom(this, id, this.origins);
      }
      if (id === 'cafe-select') {
        // The line-up: Roxy's café self steps out while the four stand in a row.
        this.roxy.attach(null);
        this.lineup = new Lineup(this, this.room);
      } else {
        this.life = new CafeLife(this, this.room, this.roxy, this.bursts);
        const player = useStore.getState().character;
        const back = this.scenePrev === 'venue' ? (bus.last('break:end')?.character ?? null) : null;
        if (player !== 'roxy') this.life.startAtBar();
        else if (this.scenePrev === 'reader') this.life.returnFromBreak();
        else if (this.firstRoom) this.life.startAtBar();
        else this.life.enterFromDoor();
        this.firstRoom = false;
        this.buildCrew(this.room, back);
      }
    }
    const a = cssToGame(rect.x, rect.y);
    const b = cssToGame(rect.x + rect.width, rect.y + rect.height);
    this.room.fit({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
    // A room wider than its view opens on the player (or the middle of the line-up).
    if (fresh && this.room instanceof PaintedRoom) this.room.centerOn(this.lineup ? this.lineup.centerU : this.playerU());
    this.backdrop.setVisible(true);
    this.emitHotspots(this.room);
    this.emitAnchors(this.room);
  }

  /** The crew in the café, built around whoever is playing. */
  private buildCrew(room: Room, returning: CharacterId | null): void {
    this.crew?.destroy();
    const player = useStore.getState().character;
    this.crewFor = player;
    this.crew = new CrewLife(this, room, this.bursts, player, returning);
  }

  /** Where the player stands (a panned view follows them). */
  private playerU(): number {
    return this.crew?.playerIsCrew ? (this.crew.player?.u ?? this.roxy.u) : this.roxy.u;
  }

  private playerMoving(): boolean {
    return this.crew?.playerIsCrew ? !!this.crew.player?.moving : this.roxy.moving;
  }

  private emitAnchors(room: Room | null): void {
    const anchors =
      room instanceof PaintedRoom
        ? room.anchorRects().map((r) => {
            const a = gameToCss(r.x, r.y);
            const b = gameToCss(r.x + r.w, r.y + r.h);
            return { id: r.id, x: Math.round(a.x), y: Math.round(a.y), w: Math.round(b.x - a.x), h: Math.round(b.y - a.y) };
          })
        : [];
    const sig = `${room?.id ?? ''}|${anchors.map((r) => `${r.id},${r.x},${r.y},${r.w},${r.h}`).join(';')}`;
    if (sig === this.anchorSig) return;
    this.anchorSig = sig;
    bus.emit('room:anchors', { room: room?.id ?? null, anchors });
  }

  private emitHotspots(room: Room | null): void {
    const spots = room
      ? room.hotspots.map((h) => {
          const s = room.toScreen(h.u, h.v, h.z);
          const c = gameToCss(s.x, s.y);
          return { id: h.id, x: Math.round(c.x), y: Math.round(c.y) };
        })
      : [];
    const sig = `${room?.id ?? ''}|${spots.map((s) => `${s.x},${s.y}`).join(';')}`;
    if (sig === this.hotspotSig) return;
    this.hotspotSig = sig;
    bus.emit('room:hotspots', { room: room?.id ?? null, spots });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    this.life?.update(dt);
    this.crew?.update(dt);
    // A room wider than its view keeps the player in its middle stretch while they walk (unless the player is looking around).
    if (this.room instanceof PaintedRoom && this.playerMoving() && this.time.now - this.userPanAt > 1500 && this.room.follow(this.playerU(), 0.3, 0.7, dt)) {
      this.emitHotspots(this.room);
      this.emitAnchors(this.room);
    }
    this.roxy.update(dt);
    this.lineup?.update();
    if (this.room) this.room.sortDepth(this.lineup ? [] : [this.roxy, ...(this.life?.actors() ?? []), ...(this.crew?.actors() ?? [])]);
    this.bursts.update(dt);
  }
}
