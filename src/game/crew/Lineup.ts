import Phaser from 'phaser';
import { bus } from '../../bus/events';
import { CHARACTERS, cafeTexture, type CharacterDef, type CharacterId } from '../../content/characters';
import { useStore } from '../../store';
import { ROOM_FIGURE_HEIGHT, ROXY_ANIMS, ROXY_ATLAS, ROXY_HEIGHT, ROXY_ORIGIN, roxyTexture } from '../companion/art/roxyFrames';
import type { Room } from '../iso/Room';
import { gameToCss } from '../pixelScale';
import { animKey, ensureCrewPack } from './CrewPack';

/** Where the line stands, in px of the café painting: side by side on the floor. */
const ROW_V = 522;
const ROW_U0 = 360;
const ROW_STEP = 112;
/** Two steps forward, towards us. */
const STEP_FORWARD = 30;
const STEP_MS = 520;
const DEPTH = 9000;

interface Member {
  def: CharacterDef;
  sprite: Phaser.GameObjects.Sprite;
  /** Animation keys for idle / walking towards us / walking away. */
  keys: { idle: string; fwd: string; back: string };
  u: number;
  v: number;
  out: boolean;
}

/** Roxy's pack animations as Phaser animations, for the line-up only (her café self is IsoRoxy). */
function roxyAnims(scene: Phaser.Scene, texture: string): Member['keys'] {
  const make = (name: string) => {
    const key = `lineup:${texture}:${name}`;
    if (!scene.anims.exists(key)) {
      const a = ROXY_ANIMS[name];
      scene.anims.create({ key, frames: a.steps.map((s) => ({ key: texture, frame: s.frame, duration: s.duration })), repeat: -1 });
    }
    return key;
  };
  return { idle: make('idle_s'), fwd: make('walk_s'), back: make('walk_n') };
}

/**
 * The character select line-up: the café dimmed, and the four baristas standing side by side
 * on its floor in their front idles. The focused one walks two steps forward. Reports where
 * each stands (`lineup:layout`) so the screen can put a button and a card on them.
 */
export class Lineup {
  private readonly members: Member[] = [];
  private readonly dim: Phaser.GameObjects.Rectangle;
  private focused: CharacterId | null = null;
  private sig = '';
  private destroyed = false;
  private readonly off: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly room: Room,
  ) {
    this.dim = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x0b0b0f, 0.58).setOrigin(0, 0).setDepth(-2900);
    CHARACTERS.forEach((def, i) => {
      const u = ROW_U0 + i * ROW_STEP;
      if (def.rig === 'roxy') {
        const wanted = roxyTexture(useStore.getState().player.currentBlouse).key;
        const tex = scene.textures.exists(wanted) ? wanted : ROXY_ATLAS;
        const keys = roxyAnims(scene, tex);
        const sprite = scene.add.sprite(0, 0, tex).setOrigin(ROXY_ORIGIN.x, ROXY_ORIGIN.y);
        sprite.play(keys.idle);
        this.members.push({ def, sprite, keys, u, v: ROW_V, out: false });
        return;
      }
      const tex = cafeTexture(def);
      void ensureCrewPack(scene, tex).then((pack) => {
        if (this.destroyed) return;
        const sprite = scene.add.sprite(0, 0, tex).setOrigin(pack.origin.x, pack.origin.y).setAlpha(0);
        const keys = { idle: animKey(tex, 'idle_s'), fwd: animKey(tex, 'walk_s'), back: animKey(tex, 'walk_n') };
        sprite.play(keys.idle);
        scene.tweens.add({ targets: sprite, alpha: 1, duration: 250 });
        const m: Member = { def, sprite, keys, u, v: ROW_V, out: false };
        this.members.push(m);
        if (this.focused === def.id) this.stepOut(m);
      });
    });
    this.off = bus.on('lineup:focus', ({ id }) => this.focus(id));
    const last = bus.last('lineup:focus');
    if (last) this.focused = last.id;
  }

  /** The line's middle, in painting px (a panned view centres on it). */
  get centerU(): number {
    return ROW_U0 + ((CHARACTERS.length - 1) * ROW_STEP) / 2;
  }

  focus(id: CharacterId | null): void {
    this.focused = id;
    for (const m of this.members) {
      if (m.def.id === id && !m.out) this.stepOut(m);
      else if (m.def.id !== id && m.out) this.stepBack(m);
    }
  }

  private stepOut(m: Member): void {
    m.out = true;
    this.walk(m, ROW_V + STEP_FORWARD, m.keys.fwd);
  }

  private stepBack(m: Member): void {
    m.out = false;
    this.walk(m, ROW_V, m.keys.back);
  }

  private walk(m: Member, v: number, anim: string): void {
    this.scene.tweens.killTweensOf(m);
    m.sprite.play(anim, true);
    this.scene.tweens.add({ targets: m, v, duration: STEP_MS * (Math.abs(v - m.v) / STEP_FORWARD || 0.01), onComplete: () => m.sprite.play(m.keys.idle, true) });
  }

  update(): void {
    const k = (this.room.actorScaleSmooth * ROOM_FIGURE_HEIGHT) / ROXY_HEIGHT;
    this.dim.setSize(this.scene.scale.width, this.scene.scale.height);
    const rects: { id: CharacterId; x: number; y: number; w: number; h: number }[] = [];
    for (const m of this.members) {
      const s = this.room.toScreen(m.u, m.v);
      m.sprite.setScale(k).setPosition(s.x, s.y).setDepth(DEPTH + s.y);
      const a = gameToCss(s.x - 62 * k, s.y - 206 * k);
      const b = gameToCss(s.x + 62 * k, s.y + 6 * k);
      rects.push({ id: m.def.id, x: Math.round(a.x), y: Math.round(a.y), w: Math.round(b.x - a.x), h: Math.round(b.y - a.y) });
    }
    rects.sort((p, q) => CHARACTERS.findIndex((c) => c.id === p.id) - CHARACTERS.findIndex((c) => c.id === q.id));
    const sig = rects.map((r) => `${r.id}${r.x},${r.y},${r.w},${r.h}`).join(';');
    if (sig === this.sig) return;
    this.sig = sig;
    bus.emit('lineup:layout', { spots: rects });
  }

  destroy(): void {
    this.destroyed = true;
    this.off();
    for (const m of this.members) {
      this.scene.tweens.killTweensOf(m);
      m.sprite.destroy();
    }
    this.dim.destroy();
    bus.emit('lineup:layout', { spots: [] });
  }
}
