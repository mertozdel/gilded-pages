/**
 * The animation catalogue of the procedurally drawn figures (figure.ts: the NPC sheets and
 * the old generated Roxy). Roxy herself now plays her sprite pack's animations, mapped in
 * roxyFrames.ts. Frames are 32×48 (the figure is about 44 px tall). Each animation is drawn in the facings it needs: SE (front three-quarter) and
 * NE (back three-quarter); SW and NW are horizontal flips. Every layer sheet uses this exact
 * layout — one row per (animation, facing), one column per frame — so Aseprite art can
 * replace the generated sheets as long as it keeps these rows.
 */
export const FRAME_W = 32;
export const FRAME_H = 48;
export const SHEET_COLS = 12;

/** The two drawn facings. */
export type Facing2 = 'SE' | 'NE';

export type AnimKey =
  | 'idle'
  | 'blink'
  | 'walk'
  | 'run'
  // the barista, behind the counter facing the room (SE)
  | 'wipeCounter'
  | 'takeOrder'
  | 'pullShot'
  | 'steamMilk'
  | 'latteArt'
  | 'serve'
  | 'untieApron'
  | 'wave'
  | 'charleston'
  // looking at art, back to us (NE/NW)
  | 'admireArt'
  // on the sofa (drawn SE, shown SW)
  | 'sitRead'
  | 'turnPage'
  | 'sipCoffee'
  | 'note'
  | 'ribbonBookmark'
  | 'doze'
  // at the apartment piano, back to us
  | 'playPiano';

export interface AnimDef {
  key: AnimKey;
  frames: number;
  fps: number;
  loop: boolean;
  /** One-shot animations can play more than once before finishing. */
  repeat?: number;
  facings: Facing2[];
}

const A = (key: AnimKey, frames: number, fps: number, loop: boolean, facings: Facing2[], repeat?: number): AnimDef => ({ key, frames, fps, loop, facings, repeat });

export const ANIMS: Record<AnimKey, AnimDef> = {
  idle: A('idle', 4, 4, true, ['SE', 'NE']),
  blink: A('blink', 3, 12, false, ['SE']),
  walk: A('walk', 6, 10, true, ['SE', 'NE']),
  run: A('run', 6, 14, true, ['SE', 'NE']),
  wipeCounter: A('wipeCounter', 6, 8, true, ['SE']),
  takeOrder: A('takeOrder', 6, 8, false, ['SE'], 2),
  pullShot: A('pullShot', 8, 10, false, ['SE']),
  steamMilk: A('steamMilk', 6, 10, true, ['SE']),
  latteArt: A('latteArt', 8, 10, false, ['SE']),
  serve: A('serve', 6, 10, false, ['SE']),
  /** Played in reverse to tie the apron back on. */
  untieApron: A('untieApron', 8, 12, false, ['SE']),
  wave: A('wave', 6, 10, false, ['SE'], 2),
  charleston: A('charleston', 12, 12, false, ['SE'], 2),
  admireArt: A('admireArt', 6, 5, true, ['NE']),
  sitRead: A('sitRead', 6, 5, true, ['SE']),
  turnPage: A('turnPage', 6, 10, false, ['SE']),
  sipCoffee: A('sipCoffee', 6, 7, false, ['SE']),
  note: A('note', 6, 8, false, ['SE'], 2),
  ribbonBookmark: A('ribbonBookmark', 6, 8, false, ['SE']),
  doze: A('doze', 4, 3, true, ['SE']),
  playPiano: A('playPiano', 8, 8, true, ['NE']),
};

/** Sheet rows, in order: one per (animation, facing). */
export const ROWS: { key: AnimKey; facing: Facing2 }[] = Object.values(ANIMS).flatMap((a) => a.facings.map((facing) => ({ key: a.key, facing })));
export const SHEET_ROWS = ROWS.length;

const ROW_INDEX = new Map(ROWS.map((r, i) => [`${r.key}:${r.facing}`, i]));

/** The drawn facing used for an animation: its own if drawn, otherwise the one it has. */
export function drawnFacing(key: AnimKey, want: Facing2): Facing2 {
  return ANIMS[key].facings.includes(want) ? want : ANIMS[key].facings[0];
}

export function frameIndex(key: AnimKey, facing: Facing2, frame: number): number {
  return ROW_INDEX.get(`${key}:${drawnFacing(key, facing)}`)! * SHEET_COLS + frame;
}

/** Back to front. Bottoms and accessories (shoes) change with the era; the apron is shift-only. */
export const LAYERS = ['body', 'bottoms', 'blouse', 'apron', 'hair', 'accessories'] as const;
export type LayerName = (typeof LAYERS)[number];
