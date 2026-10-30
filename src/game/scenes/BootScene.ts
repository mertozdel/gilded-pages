import Phaser from 'phaser';
import { useStore } from '../../store';
import { FX_ANIMS, FX_ATLAS, FX_ATLAS_URL, FX_SHEET_URL, ROXY_ATLAS, ROXY_ATLAS_URL, ROXY_SHEET_URL, roxyTexture } from '../companion/art/roxyFrames';

/**
 * Loads Roxy's sprite pack (and the sheet of the top she has on, so she appears dressed) and
 * its effects, then starts the world (the other textures and rooms are generated there).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'boot' });
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.atlas(ROXY_ATLAS, `${base}${ROXY_SHEET_URL}`, `${base}${ROXY_ATLAS_URL}`);
    const top = roxyTexture(useStore.getState().player.currentBlouse);
    if (top.key !== ROXY_ATLAS) this.load.atlas(top.key, `${base}${top.url}`, `${base}${ROXY_ATLAS_URL}`);
    this.load.atlas(FX_ATLAS, `${base}${FX_SHEET_URL}`, `${base}${FX_ATLAS_URL}`);
  }

  create(): void {
    // The pack's art is full-colour and soft-edged, shown at a fractional scale like the painted room.
    const top = roxyTexture(useStore.getState().player.currentBlouse).key;
    for (const key of [ROXY_ATLAS, top, FX_ATLAS]) if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const a of FX_ANIMS) {
      if (this.anims.exists(a.key)) continue;
      this.anims.create({ key: a.key, frames: a.frames.map((frame) => ({ key: FX_ATLAS, frame })), frameRate: a.frameRate, repeat: a.repeat });
    }
    this.scene.launch('world');
    this.scene.stop();
  }
}
