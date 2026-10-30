import Phaser from 'phaser';
import { REGULARS } from '../content';
import { FRAME_H, FRAME_W } from './companion/art/animations';
import { NPC_COLS, renderNpcSheet } from './companion/art/figure';
import { WALK_INS, regularLook } from './companion/art/people';
import * as C from './fx/cafeTextures';

/** Registers a canvas as a texture with numbered frames laid out in a grid. */
function addGridTexture(scene: Phaser.Scene, key: string, cv: HTMLCanvasElement, fw: number, fh: number, cols: number, rows: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, cv);
  if (!tex) return;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) tex.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
  }
}

function addPlain(scene: Phaser.Scene, key: string, cv: HTMLCanvasElement): void {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, cv);
}

/** Everyone else: the regulars and walk-ins (stand, walk, sit, type; SE and NE), the courier, a parcel. */
export function ensureNpcTextures(scene: Phaser.Scene): void {
  addPlain(scene, 'parcel', C.parcel());
  addPlain(scene, 'cup', C.latteCup());
  addGridTexture(scene, 'courier', C.courier(), 32, 30, 2, 1);
  for (const r of REGULARS) addGridTexture(scene, `npc-${r.id}`, renderNpcSheet(regularLook(r)), FRAME_W, FRAME_H, NPC_COLS, 2);
  for (const w of WALK_INS) addGridTexture(scene, `npc-${w.id}`, renderNpcSheet(w.look), FRAME_W, FRAME_H, NPC_COLS, 2);
}

/** Textures that depend on size or time are generated on demand and cached by key. */
export function ensureDynamic(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string {
  addPlain(scene, key, make());
  return key;
}
