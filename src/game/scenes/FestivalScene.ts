import Phaser from 'phaser';
import { bus } from '../../bus/events';
import { characterForVenue, stageTexture, type VenueId } from '../../content/characters';
import { VENUES, type VenueTheme } from '../../content/venues';
import { useStore } from '../../store';
import { flashingReduced } from '../../store/settingsSlice';
import { animKey, ensureCrewPack } from '../crew/CrewPack';
import { ART_FIT, ART_X, ART_Y, FIGURE_SCALE, FRAME, bbox, festivalObjects, frameToArt, lowestAt, type FestivalObject, type Pt } from '../festival/FestivalMap';
import { LightRig } from '../festival/LightRig';
import { Reactions } from '../festival/Reactions';
import { SIGN_SUPERSAMPLE, signCanvas, type SignStyle } from '../festival/Signs';
import { gameToCss, setPixelMode } from '../pixelScale';

/** Where each cached sign texture goes. */
const signAt = new Map<string, { x: number; y: number }>();
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7).toString(36);

const DEPTH_ART = 0;
const DEPTH_SIGNS = 0.5;
/** Overlays nobody stands behind sit just over the art. */
const DEPTH_OVERLAY_BASE = 0.9;
/** Play loops last two beats. */
const LOOP_BEATS = 2;
/** How often a hit gets a reaction bubble from the crowd. */
const REACT_CHANCE: Record<string, number> = { perfect: 0.3, great: 0.18, good: 0.08 };

interface Overlay {
  img: Phaser.GameObjects.Image;
  poly: Pt[];
  box: { x: number; y: number; w: number; h: number };
}

/**
 * A break venue: the festival map in one of its themes (the village fest or the neon
 * festival), fitted into a 1920×1080 frame that fills the screen behind the venue's UI. Until
 * the empty-venue art exists the venue picture is the background; the stage front, the DJ
 * booth and the front tables are cut out of it as overlays so the characters stand behind
 * and in front of them (depth by the feet). The player is on stage at scale 1; the band (cut
 * out of the picture) bob on every beat, reaction bubbles pop up over the painted crowd as the
 * notes land, and at the neon festival the lights run.
 */
export class FestivalScene extends Phaser.Scene {
  private venue!: VenueTheme;
  private root!: Phaser.GameObjects.Container;
  private backdrop!: Phaser.GameObjects.Image;
  private shade!: Phaser.GameObjects.Rectangle;
  private objects: FestivalObject[] = [];
  private overlays: Overlay[] = [];
  private band: { img: Phaser.GameObjects.Image; y: number }[] = [];
  private reactions: Reactions | null = null;
  private rig: LightRig | null = null;
  private player: Phaser.GameObjects.Sprite | null = null;
  private playerAt: Pt = { x: 960, y: 700 };
  private texture = '';
  private phase = 'select';
  private style = '';
  private bpm = 120;
  private missStreak = 0;
  private combo = 0;
  private unsubs: (() => void)[] = [];

  constructor() {
    super({ key: 'festival' });
  }

  init(data: { venue: VenueId }): void {
    this.venue = VENUES[data.venue];
  }

  preload(): void {
    const key = this.artKey;
    if (!this.textures.exists(key)) this.load.image(key, `${import.meta.env.BASE_URL}${this.venue.art}`);
  }

  private get artKey(): string {
    return `venue-${this.venue.id}`;
  }

  create(): void {
    // The venue art is drawn at device resolution, like the painted café.
    setPixelMode('native');
    this.textures.get(this.artKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    const reduced = flashingReduced(useStore.getState().settings);
    // Behind the frame: the art again, covering the screen, blurred and darkened (no bars at the
    // sides, and no lettering to read there): drawn tiny, then scaled up smoothly.
    const blurKey = `${this.artKey}-blur`;
    if (!this.textures.exists(blurKey)) {
      const src = this.textures.get(this.artKey).getSourceImage() as HTMLImageElement;
      const cv = document.createElement('canvas');
      cv.width = Math.round(src.width / 16);
      cv.height = Math.round(src.height / 16);
      const c = cv.getContext('2d')!;
      c.imageSmoothingQuality = 'high';
      c.drawImage(src, 0, 0, cv.width, cv.height);
      this.textures.addCanvas(blurKey, cv)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.backdrop = this.add.image(0, 0, blurKey).setOrigin(0.5).setAlpha(0.6).setDepth(-20);
    this.shade = this.add.rectangle(0, 0, 10, 10, 0x0b0b0f, 0.55).setOrigin(0).setDepth(-19);
    this.root = this.add.container(0, 0).setDepth(0);
    this.objects = festivalObjects(this.venue.id);

    const art = this.add.image(ART_X, ART_Y, this.artKey).setOrigin(0, 0).setScale(ART_FIT).setDepth(DEPTH_ART);
    this.root.add(art);
    this.buildOverlays();
    const screens = this.buildSigns();
    this.buildBand();
    const heads = this.objects.filter((o) => o.type === 'cheer').map((o) => o.at);
    this.reactions = new Reactions(this, this.root, heads, this.venue.lights === 'neon' ? 'neon' : 'paper', this.venue.confetti, reduced);
    if (this.venue.lights === 'neon') this.rig = new LightRig(this, this.root, this.objects, screens, reduced);
    void this.buildPlayer();

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.unsubs.push(
      bus.on('rhythm:beat', ({ beat, downbeat, beatsPerBar }) => this.onBeat(beat, downbeat, beatsPerBar)),
      bus.on('rhythm:judge', ({ grade }) => this.onJudge(grade)),
      bus.on('rhythm:starPower', ({ active }) => this.onStar(active)),
      bus.on('rhythm:state', (s) => this.onState(s.phase, s.bpm, s.style)),
      bus.on('rhythm:songEnd', ({ cleared }) => this.onEnd(cleared)),
      useStore.subscribe((s, prev) => {
        if (s.settings === prev.settings) return;
        this.rig?.setReduced(flashingReduced(s.settings));
        this.reactions?.setReduced(flashingReduced(s.settings));
      }),
    );
    this.events.once('shutdown', () => this.teardown());
    // For the end-to-end tests (dev builds only).
    if (import.meta.env.DEV) {
      (window as unknown as { __festival?: unknown }).__festival = {
        venue: this.venue.id,
        now: () => this.time.now,
        flashes: () => [...(this.rig?.flashTimes ?? [])],
        reduced: () => this.rig?.isReduced ?? null,
        bubbles: () => this.reactions?.shown ?? 0,
        player: () => this.player?.anims.currentAnim?.key ?? null,
      };
    }
  }

  // ---------- building ----------

  /** Pieces of the art drawn over whoever stands behind them: the stage front, the booth, the front tables. */
  private buildOverlays(): void {
    const src = this.textures.get(this.artKey).getSourceImage() as HTMLImageElement;
    for (const o of this.objects) {
      if (!o.poly || !(o.type === 'overlay' || o.props.overlay)) continue;
      const box = bbox(o.poly);
      const ss = 2;
      const key = `${this.venue.id}-overlay-${o.name}`;
      // Cut once, reused on every visit.
      if (!this.textures.exists(key)) {
        const cv = document.createElement('canvas');
        cv.width = box.w * ss;
        cv.height = box.h * ss;
        const c = cv.getContext('2d')!;
        c.scale(ss, ss);
        c.beginPath();
        o.poly.forEach((p, i) => (i ? c.lineTo(p.x - box.x, p.y - box.y) : c.moveTo(p.x - box.x, p.y - box.y)));
        c.closePath();
        c.clip();
        // The art, placed as in the frame.
        c.drawImage(src, ART_X - box.x, ART_Y - box.y, src.width * ART_FIT, src.height * ART_FIT);
        this.textures.addCanvas(key, cv)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      const img = this.add.image(box.x, box.y, key).setOrigin(0, 0).setScale(1 / ss).setDepth(DEPTH_OVERLAY_BASE);
      this.root.add(img);
      this.overlays.push({ img, poly: o.poly, box });
    }
  }

  /** The clean lettering on the banners and stall signs, and (neon) the LED screens. Returns the screens. */
  private buildSigns(): Phaser.GameObjects.Image[] {
    const screens: Phaser.GameObjects.Image[] = [];
    const put = (o: FestivalObject, style: SignStyle, text: string, depth = DEPTH_SIGNS) => {
      if (!o.poly || o.poly.length < 4) return null;
      // Drawn once per text, reused on every visit.
      const key = `${this.venue.id}-sign-${o.layer}-${o.name}-${hash(text)}`;
      let at = signAt.get(key);
      if (!at || !this.textures.exists(key)) {
        const { canvas, x, y } = signCanvas(o.poly, style, text);
        if (this.textures.exists(key)) this.textures.remove(key);
        this.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
        at = { x, y };
        signAt.set(key, at);
      }
      const { x, y } = at;
      const img = this.add.image(x, y, key).setOrigin(0, 0).setScale(1 / SIGN_SUPERSAMPLE).setDepth(depth);
      this.root.add(img);
      return img;
    };
    for (const o of this.objects) {
      if (o.type === 'sign') put(o, String(o.props.style ?? 'wood') as SignStyle, String(o.props.text ?? ''));
      else if (o.type === 'screen') {
        const img = put(o, 'led', String(o.props.text ?? ''), 0.55);
        if (img) screens.push(img);
      } else if (o.type === 'title' && this.venue.lights !== 'neon') put(o, 'banner', String(o.props.text ?? this.venue.title));
    }
    return screens;
  }

  /** The band, cut out of the art so they can bob on the beat. */
  private buildBand(): void {
    const src = this.textures.get(this.artKey).getSourceImage() as HTMLImageElement;
    for (const o of this.objects) {
      if (o.type !== 'band' || !o.poly) continue;
      const box = bbox(o.poly);
      const a = frameToArt({ x: box.x, y: box.y });
      const b = frameToArt({ x: box.x + box.w, y: box.y + box.h });
      const key = `${this.venue.id}-band-${o.name}`;
      if (!this.textures.exists(key)) {
        const cv = document.createElement('canvas');
        cv.width = Math.round(b.x - a.x);
        cv.height = Math.round(b.y - a.y);
        cv.getContext('2d')!.drawImage(src, a.x, a.y, cv.width, cv.height, 0, 0, cv.width, cv.height);
        this.textures.addCanvas(key, cv)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      const img = this.add
        .image(box.x + box.w / 2, box.y + box.h, key)
        .setOrigin(0.5, 1)
        .setScale(ART_FIT)
        .setDepth(box.y + box.h);
      this.root.add(img);
      this.band.push({ img, y: box.y + box.h });
    }
  }

  private async buildPlayer(): Promise<void> {
    const who = characterForVenue(this.venue.id);
    const spot = this.objects.find((o) => o.type === 'player');
    if (!who || !spot) return;
    this.texture = stageTexture(who);
    this.playerAt = spot.at;
    const pack = await ensureCrewPack(this, this.texture);
    if (!this.sys.isActive()) return;
    this.player = this.add.sprite(spot.at.x, spot.at.y, this.texture).setOrigin(pack.origin.x, pack.origin.y).setScale(FIGURE_SCALE).setDepth(spot.at.y);
    this.root.add(this.player);
    this.idle();
  }

  // ---------- the player on stage ----------

  private has(name: string): boolean {
    return this.anims.exists(animKey(this.texture, name));
  }

  private play(name: string, timeScale = 1, once = false, then?: () => void): void {
    const p = this.player;
    if (!p || !this.has(name)) return then?.();
    p.anims.timeScale = timeScale;
    p.play({ key: animKey(this.texture, name), repeat: once ? 0 : -1 }, !once);
    if (once && then) p.once(Phaser.Animations.Events.ANIMATION_COMPLETE, then);
  }

  private idle(): void {
    this.play(this.has('dj_idle_s') ? 'dj_idle_s' : 'idle_s');
  }

  /** The playing loop for the song: one loop = two beats. */
  private playing(): void {
    const beatMs = 60_000 / this.bpm;
    const pick = (names: string[]) => names.find((n) => this.has(n));
    // The bassist: a groove for polkas and marches, slow for waltzes. The DJ: a DJ loop when the sheet has one.
    const name = pick(this.style === 'waltz' ? ['play_slow_s', 'play_s'] : ['play_groove_s', 'play_s', 'dj_play_s', 'dj_idle_s']) ?? 'idle_s';
    const anim = this.anims.get(animKey(this.texture, name));
    const loopMs = anim ? anim.frames.reduce((n, f) => n + (f.duration || 1000 / anim.frameRate), 0) : 0;
    const playLoop = name.startsWith('play') || name.startsWith('dj_play');
    this.play(name, playLoop && loopMs ? loopMs / (LOOP_BEATS * beatMs) : 1);
  }

  private onState(phase: string, bpm?: number, style?: string): void {
    this.phase = phase;
    if (bpm) this.bpm = bpm;
    if (style !== undefined) this.style = style;
    this.missStreak = 0;
    this.combo = 0;
    this.reactions?.setAmbient(phase === 'select' || phase === 'results');
    if (phase === 'playing') this.playing();
    else if (phase === 'select' || phase === 'paused') this.idle();
  }

  private onJudge(grade: string): void {
    if (grade !== 'miss') {
      this.missStreak = 0;
      // The crowd reacts to the good ones; every 25 in a row they celebrate.
      if (++this.combo % 25 === 0) this.reactions?.celebrate(this.combo % 100 === 0 ? 5 : 3);
      else if (Math.random() < (REACT_CHANCE[grade] ?? 0)) this.reactions?.react();
      return;
    }
    this.combo = 0;
    // Three misses in a row: "uh-oh!" once (and a worried face in the crowd), then back to it.
    if (++this.missStreak === 3 && this.phase === 'playing') {
      this.reactions?.sad();
      this.play('oops_s', 1, true, () => this.phase === 'playing' && this.playing());
    }
  }

  private onStar(active: boolean): void {
    this.reactions?.setHype(active);
    if (active) this.reactions?.celebrate(5);
    this.rig?.setWild(active);
    if (active && this.has('dj_drop_s')) this.play('dj_drop_s', 1, true, () => this.playing());
    else if (active && !this.has('play_groove_s')) this.play('gesture_s', 1, true, () => this.phase === 'playing' && this.playing());
  }

  private onEnd(cleared: boolean): void {
    this.phase = 'results';
    this.reactions?.setHype(false);
    if (cleared) this.reactions?.celebrate(9);
    else this.reactions?.sad();
    this.rig?.setWild(false);
    if (cleared) this.play('celebrate_s', 1, true, () => this.idle());
    else this.play(this.has('flustered_s') && !this.has('dj_idle_s') && this.texture !== 'joel' ? 'flustered_s' : 'oops_s', 1, true, () => this.idle());
  }

  private onBeat(beat: number, downbeat: boolean, beatsPerBar: number): void {
    this.reactions?.beat(downbeat);
    this.rig?.beat(downbeat, beat % beatsPerBar);
    for (const b of this.band) {
      this.tweens.killTweensOf(b.img);
      b.img.y = b.y;
      this.tweens.add({ targets: b.img, y: b.y - 3, duration: 100, yoyo: true, ease: 'Quad.easeOut' });
    }
    // A DJ without a DJ sheet nods along: a head-bob on every beat.
    const p = this.player;
    if (p && this.phase === 'playing' && !this.has('play_groove_s') && !this.has('dj_play_s')) {
      this.tweens.killTweensOf(p);
      p.setScale(FIGURE_SCALE);
      this.tweens.add({ targets: p, scaleY: FIGURE_SCALE * 0.975, duration: 110, yoyo: true, ease: 'Sine.easeOut' });
    }
  }

  // ---------- frame ----------

  /** Fits the 1920×1080 frame into the canvas (whole frame visible), the art behind it covering. */
  private layout(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const s = Math.min(W / FRAME.w, H / FRAME.h);
    this.root.setScale(s).setPosition((W - FRAME.w * s) / 2, (H - FRAME.h * s) / 2);
    const img = this.backdrop;
    const cover = Math.max(W / img.width, H / img.height);
    img.setScale(cover).setPosition(W / 2, H / 2);
    this.shade.setSize(W, H);
    // Where the setlist sign is, for the song select.
    const sign = this.objects.find((o) => o.type === 'setlist');
    if (sign?.poly) {
      const b = bbox(sign.poly);
      const a = gameToCss(this.root.x + b.x * s, this.root.y + b.y * s);
      const z = gameToCss(this.root.x + (b.x + b.w) * s, this.root.y + (b.y + b.h) * s);
      bus.emit('venue:anchors', { setlist: { x: a.x, y: a.y, width: z.x - a.x, height: z.y - a.y } });
    }
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta, 100);
    this.rig?.update(dt);
    this.reactions?.update(dt);
    // Overlays go over the player when they stand behind the overlay's front edge.
    const a = this.player ? this.playerAt : null;
    for (const o of this.overlays) {
      let depth = DEPTH_OVERLAY_BASE;
      if (a && a.x >= o.box.x - 40 && a.x <= o.box.x + o.box.w + 40) {
        const edge = lowestAt(o.poly, Phaser.Math.Clamp(a.x, o.box.x + 0.5, o.box.x + o.box.w - 0.5));
        if (a.y < edge) depth = a.y + 0.5;
      }
      o.img.setDepth(depth);
    }
    this.root.sort('depth');
  }

  private teardown(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.scale.off('resize', this.layout, this);
    this.reactions?.destroy();
    this.rig?.destroy();
    this.reactions = null;
    this.rig = null;
    this.player = null;
    this.overlays = [];
    this.band = [];
    bus.emit('venue:anchors', { setlist: null });
  }
}
