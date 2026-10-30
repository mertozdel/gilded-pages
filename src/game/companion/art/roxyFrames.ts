/**
 * Roxy is her sprite pack (v2): 88 frames cut from her three character mockups and finished
 * in code, built by `scripts/build-roxy-sheet.py` into `public/assets/sprites/roxy/roxy_sheet.png`
 * + `.json`, a Phaser atlas (JSON hash) of 192×240 frames, Roxy 192 px tall with her feet on
 * the pivot. The build adds full-figure copies (`*_full`) of the behind-the-counter poses: in
 * the painted café she works on the near side of the counter, where nothing hides her legs.
 * The pack's animations (with per-frame durations) and effects are in roxyPack.json.
 *
 * She is drawn in four views: S (front), SE (three-quarter), E (side) and N (back). SW and W
 * are SE and E mirrored; NE and NW both use the back view.
 */
import pack from './roxyPack.json';
import { BLOUSES, DEFAULT_BLOUSE, type BlouseId } from '../../../content';
import type { Facing } from '../../../content/rooms';
import type { VState } from '../roxyMachine';

export const ROXY_ATLAS = 'roxy';
export const ROXY_SHEET_URL = 'assets/sprites/roxy/roxy_sheet.png';
export const ROXY_ATLAS_URL = 'assets/sprites/roxy/roxy_sheet.json';

/**
 * Her atlas in a top. The pack is drawn in the Cream Peter Pan; every other top is the same
 * sheet repainted by `scripts/dress-roxy.py` (same frames, so they all share ROXY_ATLAS_URL).
 */
export function roxyTexture(blouse: BlouseId): { key: string; url: string } {
  if (blouse === DEFAULT_BLOUSE || !BLOUSES.some((b) => b.id === blouse)) return { key: ROXY_ATLAS, url: ROXY_SHEET_URL };
  return { key: `${ROXY_ATLAS}:${blouse}`, url: `assets/sprites/roxy/roxy_sheet.${blouse}.png` };
}
export const FX_ATLAS = 'roxy_fx';
export const FX_SHEET_URL = 'assets/sprites/roxy/fx_sheet.png';
export const FX_ATLAS_URL = 'assets/sprites/roxy/fx_sheet.json';
/** Between her feet (the atlas pivot). */
export const ROXY_ORIGIN = pack.roxy.origin;
export const ROXY_FRAME = pack.roxy.frameSize;
/** Her standing height in the frames, and the figure height the rooms' actor scale is tuned for. */
export const ROXY_HEIGHT = pack.roxy.standHeight;
export const ROOM_FIGURE_HEIGHT = 45;

export type View = 's' | 'se' | 'e' | 'n';
/** A drawn view, mirrored or not. */
export interface Look {
  view: View;
  flip: boolean;
}

export interface RoxyStep {
  frame: string;
  duration: number;
}

export interface RoxyAnim {
  name: string;
  steps: RoxyStep[];
  /** What the pack made it for. */
  use: string;
}

/** An effect from the pack's fx sheet, its bottom centre this far from her feet (frame px, facing right). */
export interface FxCue {
  key: string;
  x: number;
  y: number;
  /** The step that starts it (default the first). */
  at?: number;
  /** The step that ends it early. */
  until?: number;
  /** In a loop, only every n-th time round. */
  every?: number;
}

export const FX_ANIMS: { key: string; frames: string[]; frameRate: number; repeat: number }[] = pack.fx;

const named = (a: { key: string; frames: RoxyStep[]; use?: string }): [string, RoxyAnim] => {
  const name = a.key.replace(/^roxy_/, '');
  return [name, { name, steps: a.frames, use: a.use ?? '' }];
};
const PACK: Record<string, RoxyAnim> = Object.fromEntries(pack.roxy.anims.map(named));

/** The same animation on the full-figure frames. */
const full = (name: string, use: string): [string, RoxyAnim] => [
  `${name}_full`,
  { name: `${name}_full`, steps: PACK[name].steps.map((s) => ({ ...s, frame: `${s.frame}_full` })), use },
];

/** Every animation: the pack's, keyed without the `roxy_` prefix, and the full-figure ones. */
export const ROXY_ANIMS: Record<string, RoxyAnim> = {
  ...PACK,
  ...Object.fromEntries([
    full('serve_se', 'hands a cup over, standing in front of the counter'),
    full('serve_idle_se', 'holding a cup on its saucer'),
    full('machine_n', 'working the espresso machine, standing in front of the counter'),
  ]),
  work_n_full: {
    name: 'work_n_full',
    use: 'busy at the machine and the grinders between orders',
    steps: [
      { frame: 'roxy_reach_n_full', duration: 450 },
      { frame: 'roxy_reach_n_up_full', duration: 250 },
      { frame: 'roxy_reach_n_full', duration: 450 },
      { frame: 'roxy_reach_n_up_full', duration: 250 },
      { frame: 'roxy_reach_n_full', duration: 1100 },
      { frame: 'roxy_reach_n_br_full', duration: 700 },
    ],
  },
};

const views = (kind: string): Record<View, string> => ({ s: `${kind}_s`, se: `${kind}_se`, e: `${kind}_e`, n: `${kind}_n` });

interface StateArt {
  /** The animation per drawn view; a view she isn't drawn in falls back to the first listed. */
  views: Partial<Record<View, string>>;
  /** One-shots finish after this many plays; without it the animation loops. */
  plays?: number;
  /** An effect played with it, per drawn view. */
  fx?: Partial<Record<View, FxCue>>;
}

/**
 * What every state looks like. At the bar, the counter in front of her (SE, the tile café)
 * gets polished; facing the counter from the near side (N, the painted café) she works the
 * machine. Not drawn yet: seated sipping and note-taking (seated reading stands in), the
 * piano (her back view) and the apron, which the pack doesn't have.
 */
const STATE_ART: Record<VState, StateArt> = {
  idle: { views: views('idle') },
  walk: { views: views('walk') },
  run: { views: views('run') },
  wipeCounter: { views: { se: 'wipe_counter_se', n: 'work_n_full' }, fx: { se: { key: 'fx_sparkle', x: 66, y: -102, at: 2, every: 3 } } },
  takeOrder: { views: { se: 'take_order_se' }, plays: 1 },
  pullShot: { views: { n: 'machine_n_full' }, plays: 3, fx: { n: { key: 'fx_espresso', x: 58, y: -112 } } },
  steamMilk: { views: { n: 'machine_n_full' }, fx: { n: { key: 'fx_steam', x: 58, y: -112 } } },
  latteArt: { views: { se: 'serve_idle_se_full' }, plays: 1, fx: { se: { key: 'fx_latte', x: 58, y: -122 } } },
  serve: { views: { se: 'serve_se_full' }, plays: 1 },
  untieApron: { views: { s: 'hair_swipe_s' }, plays: 1 },
  wave: { views: { s: 'happy_s' }, plays: 1, fx: { s: { key: 'fx_heart', x: 30, y: -192, at: 2 } } },
  charleston: { views: { s: 'celebrate_s' }, plays: 2, fx: { s: { key: 'fx_confetti', x: 0, y: -150, every: 2 } } },
  admireArt: { views: { n: 'idle_n' } },
  sitRead: { views: { se: 'sit_read' } },
  turnPage: { views: { se: 'sit_turn_page' }, plays: 1 },
  sipCoffee: { views: { se: 'sit_read' }, plays: 1 },
  note: { views: { se: 'sit_read' }, plays: 1 },
  ribbonBookmark: { views: { se: 'sit_turn_page' }, plays: 1 },
  doze: { views: { se: 'sit_doze' }, fx: { se: { key: 'fx_zzz', x: 30, y: -120 } } },
  playPiano: { views: { n: 'idle_n' } },
  hairSwipe: { views: { s: 'hair_swipe_s' }, plays: 1 },
  sip: { views: { s: 'sip_s' }, plays: 1, fx: { s: { key: 'fx_steam', x: 18, y: -150, at: 1, until: 4 } } },
  think: { views: { se: 'take_order_se' }, plays: 1 },
  flustered: { views: { s: 'flustered_s' }, plays: 1, fx: { s: { key: 'fx_sweat', x: 24, y: -168 } } },
};

export interface RoxyArt {
  anim: RoxyAnim;
  flip: boolean;
  plays?: number;
  fx?: FxCue;
}

/** The animation for a state seen from a view (or the nearest view it is drawn in). */
export function roxyArt(state: VState, look: Look): RoxyArt {
  const art = STATE_ART[state];
  const view = art.views[look.view] ? look.view : (Object.keys(art.views)[0] as View);
  // The front view is never mirrored: she turns to face us.
  return { anim: ROXY_ANIMS[art.views[view]!], flip: view !== 's' && look.flip, plays: art.plays, fx: art.fx?.[view] };
}

/** Standing at a spot: SE/SW three-quarter front, NE/NW her back. */
export function lookForFacing(f: Facing): Look {
  return { view: f === 'SE' || f === 'SW' ? 'se' : 'n', flip: f === 'SW' || f === 'NW' };
}

/**
 * Walking, the view follows the move on screen (x right, y down): the side view within
 * 22.5° of level, the front view within 22.5° of straight down, the back view for anything
 * heading up.
 */
export function lookForHeading(dx: number, dy: number): Look {
  const a = Math.atan2(dy, Math.abs(dx));
  const view: View = a > (3 * Math.PI) / 8 ? 's' : a > Math.PI / 8 ? 'se' : a > -Math.PI / 8 ? 'e' : 'n';
  return { view, flip: dx < 0 };
}

interface AtlasJson {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}

export interface RoxyAtlas {
  image: HTMLImageElement;
  rect(frame: string): { x: number; y: number; w: number; h: number };
}

let atlas: Promise<RoxyAtlas> | null = null;

/** The atlas outside Phaser (the dev sprite viewer). */
export function loadRoxyAtlas(): Promise<RoxyAtlas> {
  atlas ??= (async () => {
    const base = import.meta.env.BASE_URL;
    const [json, image] = await Promise.all([
      fetch(`${base}${ROXY_ATLAS_URL}`).then((r) => r.json() as Promise<AtlasJson>),
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `${base}${ROXY_SHEET_URL}`;
      }),
    ]);
    return { image, rect: (f: string) => json.frames[f].frame };
  })().catch((e: unknown) => {
    atlas = null;
    throw e;
  });
  return atlas;
}
