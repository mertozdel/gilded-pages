import Phaser from 'phaser';
import type { BlouseId } from '../../content';
import { FX_ANIMS, FX_ATLAS, ROOM_FIGURE_HEIGHT, ROXY_ANIMS, ROXY_ATLAS, ROXY_ATLAS_URL, ROXY_HEIGHT, ROXY_ORIGIN, roxyTexture, type FxCue } from './art/roxyFrames';

const LOOPING_FX = new Set(FX_ANIMS.filter((a) => a.repeat === -1).map((a) => a.key));

/**
 * Roxy drawn from her sprite pack (see art/roxyFrames.ts): one image on the atlas of the top
 * she wears, origin between her feet, and an effect sprite (steam, espresso, zzz…) that moves
 * and scales with her. A top's sheet loads the first time she puts it on; until then she keeps
 * the one she had. The pack has no apron, so the apron is remembered (the café routine asks)
 * but doesn't change the art.
 */
export class RoxySprite {
  readonly container: Phaser.GameObjects.Container;
  private readonly image: Phaser.GameObjects.Image;
  private readonly fx: Phaser.GameObjects.Sprite;
  private frame = ROXY_ANIMS.idle_se.steps[0].frame;
  private flip = false;
  private cue: FxCue | null = null;
  private blouse: BlouseId;
  private apron = false;

  constructor(scene: Phaser.Scene, blouse: BlouseId) {
    this.blouse = blouse;
    this.image = scene.add.image(0, 0, ROXY_ATLAS, this.frame).setOrigin(ROXY_ORIGIN.x, ROXY_ORIGIN.y);
    this.fx = scene.add.sprite(0, 0, FX_ATLAS).setOrigin(0.5, 1).setVisible(false);
    this.fx.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.stopFx());
    this.container = scene.add.container(0, 0, [this.image, this.fx]);
    this.setBlouse(blouse);
  }

  setFrame(frame: string): void {
    if (frame === this.frame) return;
    this.frame = frame;
    this.image.setFrame(frame);
  }

  /** SW and W are the SE and E drawings mirrored (the effects only move across, so text stays readable). */
  setFlip(flip: boolean): void {
    if (flip === this.flip) return;
    this.flip = flip;
    this.image.setFlipX(flip);
    this.placeFx();
  }

  /** Plays an effect beside her; one already looping is left running. */
  playFx(cue: FxCue): void {
    if (this.cue?.key === cue.key && LOOPING_FX.has(cue.key)) return;
    this.cue = cue;
    this.placeFx();
    this.fx.setVisible(true).play(cue.key);
  }

  stopFx(): void {
    if (!this.cue) return;
    this.cue = null;
    this.fx.stop();
    this.fx.setVisible(false);
  }

  private placeFx(): void {
    if (this.cue) this.fx.setPosition(this.flip ? -this.cue.x : this.cue.x, this.cue.y);
  }

  /** A room's (unrounded) actor scale is for its 45 px pixel people; her frames are 192 px tall. */
  setActorScale(k: number): void {
    const s = (k * ROOM_FIGURE_HEIGHT) / ROXY_HEIGHT;
    if (this.container.scale !== s) this.container.setScale(s);
  }

  /** Puts her in a top: at once if its sheet is loaded, otherwise once it has loaded (if she still wants it). */
  setBlouse(id: BlouseId): void {
    this.blouse = id;
    const { key, url } = roxyTexture(id);
    const scene = this.image.scene;
    const wear = () => {
      if (this.blouse !== id || !scene.textures.exists(key)) return;
      if (this.image.texture.key !== key) this.image.setTexture(key, this.frame);
    };
    if (scene.textures.exists(key)) return wear();
    const base = import.meta.env.BASE_URL;
    scene.load.atlas(key, `${base}${url}`, `${base}${ROXY_ATLAS_URL}`);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      wear();
    });
    scene.load.start();
  }

  setApron(on: boolean): void {
    this.apron = on;
  }

  get apronOn(): boolean {
    return this.apron;
  }

  get currentBlouse(): BlouseId {
    return this.blouse;
  }
}
