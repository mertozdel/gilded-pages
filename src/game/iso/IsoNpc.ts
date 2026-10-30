import type Phaser from 'phaser';
import type { Facing } from '../../content/rooms';
import type { Room } from './Room';
import { IsoWalker } from './IsoWalker';

/** NPC sheet: row 0 faces SE, row 1 NE (10 frames each): 0 stand, 1–6 walk, 7 sit, 8–9 type. */
const COLS = 10;
const STAND = 0;
const SIT = 7;
const TYPE = 8;

/** A café customer or regular: walks, queues, sits, leaves. */
export class IsoNpc extends IsoWalker {
  readonly img: Phaser.GameObjects.Image;
  private clock = 0;
  private walking = false;
  /** Seated with a laptop: a little typing bob. */
  typing = false;

  constructor(scene: Phaser.Scene, texture: string, room: Room) {
    super();
    this.room = room;
    this.img = scene.add.image(0, 0, texture, STAND).setOrigin(0.5, 1);
  }

  setDepth(d: number): void {
    this.img.setDepth(d);
  }

  protected applyFacing(): void {
    this.img.setFlipX(this.facing === 'SW' || this.facing === 'NW');
  }

  protected onMoveChange(moving: boolean): void {
    this.walking = moving;
  }

  sitAt(u: number, v: number, facing: Facing, seat: { u0: number; v0: number; u1: number; v1: number }): void {
    this.sitOn(u, v, facing, seat);
  }

  standUp(): void {
    this.stand();
  }

  update(dt: number): void {
    if (!this.room) return;
    this.step(dt);
    this.clock += dt;
    const row = this.facing === 'NE' || this.facing === 'NW' ? COLS : 0;
    let frame = STAND;
    if (this.walking) frame = 1 + (Math.floor(this.clock / 110) % 6);
    else if (this.seat) frame = this.typing ? TYPE + (Math.floor(this.clock / 380) % 2) : SIT;
    this.img.setFrame(row + frame);
    const s = this.room.toScreen(this.u, this.v);
    this.img.setPosition(Math.round(s.x), Math.round(s.y) + 1);
  }

  destroy(): void {
    this.img.destroy();
  }
}
