import Phaser from 'phaser';

/**
 * The character sprite packs (Joel, Jonas, Jason, Jonas the bassist, Mert the regular): a Phaser
 * atlas (`<name>_sheet.png` + `.json`) plus `<name>_anims.json`, whose animations carry a duration
 * per frame (never a frameRate) and whose origin every sprite uses. A pack's folder is its name,
 * unless it shares one (Mert's `matt_closeup` lives in `matt/`). Packs load on first use and stay
 * loaded.
 */
export interface CrewAnimsDef {
  texture: string;
  frameSize: { w: number; h: number };
  origin: { x: number; y: number };
  standHeight?: number;
  anims: { key: string; repeat: number; frames: { frame: string; duration: number }[]; use?: string }[];
  bass_on?: string[];
}

const base = () => `${import.meta.env.BASE_URL}assets/sprites`;
const pending = new Map<string, Promise<CrewAnimsDef>>();

export function crewDef(scene: Phaser.Scene, name: string): CrewAnimsDef | null {
  return (scene.cache.json.get(`${name}_anims`) as CrewAnimsDef | undefined) ?? null;
}

function register(scene: Phaser.Scene, name: string): CrewAnimsDef {
  const def = crewDef(scene, name)!;
  scene.textures.get(name).setFilter(Phaser.Textures.FilterMode.LINEAR);
  for (const a of def.anims) {
    if (scene.anims.exists(a.key)) continue;
    scene.anims.create({ key: a.key, frames: a.frames.map((f) => ({ key: def.texture, frame: f.frame, duration: f.duration })), repeat: a.repeat });
  }
  return def;
}

/** Loads a pack (once) from `assets/sprites/<dir>/` and registers its animations. */
export function ensureCrewPack(scene: Phaser.Scene, name: string, dir = name): Promise<CrewAnimsDef> {
  if (scene.textures.exists(name) && crewDef(scene, name)) return Promise.resolve(register(scene, name));
  let p = pending.get(name);
  if (p) return p;
  p = new Promise<CrewAnimsDef>((resolve, reject) => {
    const load = scene.load;
    load.atlas(name, `${base()}/${dir}/${name}_sheet.png`, `${base()}/${dir}/${name}_sheet.json`);
    load.json(`${name}_anims`, `${base()}/${dir}/${name}_anims.json`);
    const check = () => {
      if (scene.textures.exists(name) && crewDef(scene, name)) {
        load.off(Phaser.Loader.Events.COMPLETE, check);
        resolve(register(scene, name));
      } else if (!load.isLoading()) {
        load.off(Phaser.Loader.Events.COMPLETE, check);
        pending.delete(name);
        reject(new Error(`crew pack ${name} failed to load`));
      }
    };
    load.on(Phaser.Loader.Events.COMPLETE, check);
    if (!load.isLoading()) load.start();
  });
  pending.set(name, p);
  return p;
}

/** The animation key for a pack: `jason` + `idle_s` → `jason_idle_s`. */
export function animKey(texture: string, name: string): string {
  return `${texture}_${name}`;
}
