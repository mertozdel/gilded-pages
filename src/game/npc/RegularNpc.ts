import Phaser from 'phaser';
import { bus } from '../../bus/events';
import type { CharacterId } from '../../content/characters';
import { JUST_REFILLED_MS, latteLines, linesFor, regularLines, regularNow, REGULAR, type CupGrade, type RegularMood } from '../../content/regular';
import { ROOM_FIGURE_HEIGHT, ROXY_HEIGHT } from '../companion/art/roxyFrames';
import { Bubble, DEPTH_OVER } from '../crew/Bubble';
import { ensureCrewPack } from '../crew/CrewPack';
import type { RegularSpot, Room, Sortable } from '../iso/Room';
import { RegularSchedule, type NoticeReason, type RegularAnim, type RegularState } from './regularSchedule';

const ID = REGULAR.id;
const FADE_MS = 300;
/** Half his table set's width, and his sofa's (frame px): furniture sorts against all of it. */
const HALF_WIDTH = { sit: 100, chill: 96 } as const;
/** Over the mug on his table (frame px from the floor point), where its steam rises. */
const MUG = { x: 9, y: -94 };
/** Over his head at the table and on the sofa (frame px from the floor point): bubbles point here. */
const HEAD = { sit: { x: -26, y: -166 }, chill: { x: -50, y: -178 } } as const;
/** He glances up when the player comes this close (floor tiles from his table's edge). */
const NEAR_TILES = 2;
/** The cup in his "please, a refill" bubble: his own mug, from his pack's cards. */
const CUP_ICON = 'icon_cup';
const CUP_ICON_URL = 'assets/sprites/matt/cards/matt_card_mug.png';

/**
 * Mert, the café regular: a customer at his own table, never a player character, the same for
 * every barista. Not a walker (the art for walking off has no back view yet, and no getting up):
 * he sits where the map's Regulars layer says, `matt_seat` on weekdays, the window sofa
 * (`matt_sofa`) at weekends, his `sit_*` frames bringing their own chair, table, laptop and mug
 * (`matt_chill` its own sofa). Sorted by the floor point under his table set, like furniture.
 *
 * RegularSchedule decides what he does; this plays it: his animations, the steam over a fresh
 * mug, the cup bubble while he waits for a refill, a speech bubble for his thanks, and the room
 * tags that follow him (his footprint and hotspots, the sofa he hides).
 */
export class RegularNpc implements Sortable {
  readonly u: number;
  readonly v: number;
  readonly spot: RegularSpot;
  readonly chill: boolean;
  private readonly schedule: RegularSchedule;
  private sprite: Phaser.GameObjects.Sprite | null = null;
  private steam: Phaser.GameObjects.Sprite | null = null;
  private steamOn = false;
  private readonly cup: Phaser.GameObjects.Container;
  private readonly bubble: Bubble;
  private wasNear = false;
  private refilledAt = -Infinity;
  private clock = 0;
  private destroyed = false;

  /** The regular's place in this room, or null when the room has none. */
  static spotIn(room: Room, chill: boolean): RegularSpot | null {
    return room.regularSpot?.(chill ? `${ID}_sofa` : `${ID}_seat`) ?? null;
  }

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room,
    spot: RegularSpot,
    /** Hotspots changed (the refill hotspot comes and goes): the scene reports them again. */
    private readonly onTags: () => void,
  ) {
    this.spot = spot;
    this.u = spot.u;
    this.v = spot.v;
    this.chill = spot.props.anim === 'chill';
    this.bubble = new Bubble(scene);
    this.cup = this.makeCup();
    this.schedule = new RegularSchedule(
      {
        play: (anim, loop) => this.play(anim, loop),
        sip: () => bus.emit('npc:matt:sip', {}),
        empty: () => bus.emit('npc:matt:empty', {}),
        refilled: (by, via) => {
          this.refilledAt = this.clock;
          bus.emit('npc:matt:refilled', { by: by as CharacterId, via });
        },
        steam: (on) => (this.steamOn = on),
        waiting: (on) => {
          this.cup.setVisible(on);
          this.room.setShown?.(`${ID}_waiting`, on);
          this.onTags();
        },
      },
      this.chill,
    );
    // His close-ups are the dialogue panel's (drawn in the page), not the game's.
    void Promise.all([ensureCrewPack(scene, ID), this.loadCupIcon()]).then(
      () => !this.destroyed && this.appear(),
      (e: unknown) => console.warn('Mert could not load', e),
    );
  }

  // ---------- in the room ----------

  private appear(): void {
    const def = this.scene.cache.json.get(`${ID}_anims`) as { origin: { x: number; y: number } };
    this.sprite = this.scene.add.sprite(0, 0, ID).setOrigin(def.origin.x, def.origin.y).setAlpha(0);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (a: Phaser.Animations.Animation) => {
      if (a.key === `${ID}_sit_sip` || a.key === `${ID}_sit_look`) this.schedule.oneShotDone();
    });
    if (this.scene.anims.exists('fx_steam')) this.steam = this.scene.add.sprite(0, 0, 'roxy_fx').setOrigin(0.5, 1).setVisible(false).play({ key: 'fx_steam', repeat: -1 });
    this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: FADE_MS });
    // His footprint blocks feet, his hotspots appear, the sofa he brings hides the room's.
    this.room.setShown?.(this.spot.name, true);
    this.onTags();
    this.schedule.start();
    this.update(0, null);
  }

  get ready(): boolean {
    return !!this.sprite;
  }

  get state(): RegularState {
    return this.schedule.state;
  }

  get empty(): boolean {
    return this.schedule.empty;
  }

  get sipsTaken(): number {
    return this.schedule.sipsTaken;
  }

  get waitingBubble(): boolean {
    return this.cup.visible;
  }

  /** Half his width on the floor (room units), for sorting against furniture. */
  get span(): number {
    return HALF_WIDTH[this.chill ? 'chill' : 'sit'] * this.unitsPerFramePx();
  }

  foot() {
    return { u0: this.u - this.span, v0: this.v - 1, u1: this.u + this.span, v1: this.v };
  }

  bias(): number {
    return 0;
  }

  setDepth(d: number): void {
    this.sprite?.setDepth(d);
    this.steam?.setDepth(d + 0.1);
  }

  /** The sprite's scale: the crew's (and Roxy's), so everyone in the café is one size. */
  private get k(): number {
    return (this.room.actorScaleSmooth * ROOM_FIGURE_HEIGHT) / ROXY_HEIGHT;
  }

  private unitsPerFramePx(): number {
    const a = this.room.toScreen(0, 0);
    const b = this.room.toScreen(1, 0);
    return this.k / Math.max(1e-6, b.x - a.x);
  }

  private play(anim: RegularAnim, loop: boolean): void {
    const key = anim === 'chill' ? `${ID}_chill` : `${ID}_sit_${anim}`;
    if (!this.sprite || !this.scene.anims.exists(key)) return;
    this.sprite.play({ key, repeat: loop ? -1 : 0 }, loop);
  }

  // ---------- what happens around him ----------

  /** The door bell, the music, the player coming close or over to talk: a glance round (if he can). */
  notice(reason: NoticeReason): boolean {
    return this.schedule.notice(reason);
  }

  /** A refill brought to his table by the player's barista. */
  refill(by: CharacterId): boolean {
    if (!this.schedule.refill(by)) return false;
    this.say(regularLines.next(`${ID}:thanks`, linesFor('thanks')).text);
    return true;
  }

  /** Jason served him his usual: a sip at once and a word on the cup. */
  serveUsual(grade: CupGrade): boolean {
    if (!this.schedule.serve('jason')) return false;
    this.say(regularLines.next(`${ID}:latte:${grade}`, latteLines(grade)).text);
    return true;
  }

  /** The player came over to talk: he looks up; how he feels decides the dialogue's lines. */
  talk(): { mood: RegularMood; justRefilled: boolean } {
    this.notice('talk');
    return { mood: this.schedule.mood(regularNow().getHours()), justRefilled: this.clock - this.refilledAt < JUST_REFILLED_MS };
  }

  /** Tests and dev tools: his mug empty now. */
  drainForTest(): void {
    this.schedule.drain();
  }

  say(text: string, ms = 3400): void {
    this.bubble.say(text, ms);
    this.placeOver();
  }

  // ---------- frame loop ----------

  /** `player`: where the player's barista stands (he glances up when they come close). */
  update(dt: number, player: { u: number; v: number } | null): void {
    if (!this.sprite) return;
    this.clock += dt;
    this.schedule.update(dt);
    if (player) {
      const near = this.tilesFrom(player.u, player.v) <= NEAR_TILES;
      if (near && !this.wasNear) this.notice('near');
      this.wasNear = near;
    }
    const s = this.room.toScreen(this.u, this.v);
    const k = this.k;
    this.sprite.setScale(k).setPosition(s.x, s.y);
    // Steam over a fresh mug, except while it's at his lips.
    if (this.steam) this.steam.setVisible(this.steamOn && !this.chill && this.state !== 'sip').setScale(k).setPosition(s.x + MUG.x * k, s.y + MUG.y * k);
    this.placeOver();
  }

  /** Floor tiles from the edge of his table's footprint (from his floor point without one). */
  private tilesFrom(u: number, v: number): number {
    const tile = this.room.floorTile ?? 52;
    const fp = this.spot.footprint;
    const cu = fp ? fp.reduce((a, p) => a + p.x, 0) / fp.length : this.u;
    const cv = fp ? fp.reduce((a, p) => a + p.y, 0) / fp.length : this.v;
    // Along the floor's two tile axes (a tile is twice as wide as it is deep).
    const a = (u - cu) / (tile / 2);
    const b = (v - cv) / (tile / 4);
    const tu = (a + b) / 2;
    const tv = (b - a) / 2;
    return Math.max(Math.abs(tu), Math.abs(tv)) - (fp ? 1 : 0);
  }

  private placeOver(): void {
    if (!this.sprite) return;
    const s = this.room.toScreen(this.u, this.v);
    const k = this.k;
    const head = HEAD[this.chill ? 'chill' : 'sit'];
    const x = s.x + head.x * k;
    const y = s.y + head.y * k;
    if (this.bubble.visible) this.bubble.place(x, y, k, DEPTH_OVER + s.y);
    if (this.cup.visible) this.cup.setPosition(x, y + Math.sin(this.clock / 260) * 3 * k).setScale(k).setDepth(DEPTH_OVER + s.y - 1);
  }

  // ---------- the cup bubble ----------

  private loadCupIcon(): Promise<void> {
    if (this.scene.textures.exists(CUP_ICON)) return Promise.resolve();
    return new Promise((resolve) => {
      this.scene.load.image(CUP_ICON, `${import.meta.env.BASE_URL}${CUP_ICON_URL}`);
      this.scene.load.once(`filecomplete-image-${CUP_ICON}`, () => resolve());
      this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      if (!this.scene.load.isLoading()) this.scene.load.start();
    });
  }

  /** A small round bubble with his mug in it, its tail pointing at his head. */
  private makeCup(): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    const w = 64;
    const h = 56;
    g.fillStyle(0xfffaf0, 0.97).lineStyle(3, 0x3b2418, 1);
    g.fillRoundedRect(-w / 2, -h - 14, w, h, 16).strokeRoundedRect(-w / 2, -h - 14, w, h, 16);
    g.fillTriangle(-8, -15, 8, -15, 0, 0).lineBetween(-8, -14, 0, 0).lineBetween(8, -14, 0, 0);
    const parts: Phaser.GameObjects.GameObject[] = [g];
    const add = () => parts.push(this.scene.add.image(0, -14 - h / 2, CUP_ICON).setScale(1.15));
    if (this.scene.textures.exists(CUP_ICON)) add();
    const c = this.scene.add.container(0, 0, parts).setVisible(false);
    if (!this.scene.textures.exists(CUP_ICON)) this.scene.load.once(`filecomplete-image-${CUP_ICON}`, () => !this.destroyed && c.add(this.scene.add.image(0, -14 - h / 2, CUP_ICON).setScale(1.15)));
    return c;
  }

  /** Leaving the café (the scene closes): he fades out, his tags with him. */
  destroy(fade = true): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const tag of [this.spot.name, `${ID}_waiting`]) this.room.setShown?.(tag, false);
    const parts = [this.sprite, this.steam, this.cup, this.bubble.container].filter((p): p is NonNullable<typeof p> => !!p);
    const done = () => {
      this.sprite?.destroy();
      this.steam?.destroy();
      this.cup.destroy();
      this.bubble.destroy();
    };
    if (!fade || !this.sprite) return done();
    this.scene.tweens.add({ targets: parts, alpha: 0, duration: FADE_MS, onComplete: done });
  }
}
