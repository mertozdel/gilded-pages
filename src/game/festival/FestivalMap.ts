/**
 * Reads the festival map (an isometric Tiled map, 64×32 tiles) into the 1920×1080 frame the
 * venue art is fitted into, for one theme: objects without a `theme` belong to both.
 */
import festivalTmj from '../../content/rooms/festival.tmj?raw';
import { propsOf, type TiledMap, type TiledObject } from '../../content/rooms';
import type { VenueId } from '../../content/characters';

export type Pt = { x: number; y: number };

export interface FestivalObject {
  name: string;
  type: string;
  layer: string;
  /** Frame px (1920×1080). */
  at: Pt;
  poly: Pt[] | null;
  props: Record<string, unknown>;
}

interface IsoObject extends TiledObject {
  polygon?: { x: number; y: number }[];
}

export const FESTIVAL_MAP = JSON.parse(festivalTmj) as TiledMap;
const P = propsOf(FESTIVAL_MAP);
export const FRAME = { w: Number(P.frameWidth ?? 1920), h: Number(P.frameHeight ?? 1080) };
export const ART = { w: Number(P.artWidth ?? 1024), h: Number(P.artHeight ?? 906) };
/** The art fitted into the frame (contain). */
export const ART_FIT = Math.min(FRAME.w / ART.w, FRAME.h / ART.h);
export const ART_X = (FRAME.w - ART.w * ART_FIT) / 2;
export const ART_Y = (FRAME.h - ART.h * ART_FIT) / 2;
export const FIGURE_SCALE = Number(P.figureScale ?? 1);

/** Tiled isometric object coordinates → frame px. */
export function isoToFrame(x: number, y: number): Pt {
  const m = FESTIVAL_MAP;
  const originX = (m.height * m.tilewidth) / 2;
  const sx = originX + ((x - y) * (m.tilewidth / 2)) / m.tileheight;
  const sy = ((x + y) * (m.tileheight / 2)) / m.tileheight;
  return { x: sx - Number(P.frameX ?? 0), y: sy - Number(P.frameY ?? 0) };
}

/** Frame px → px of the venue art (for cutting overlays out of it). */
export function frameToArt(p: Pt): Pt {
  return { x: (p.x - ART_X) / ART_FIT, y: (p.y - ART_Y) / ART_FIT };
}

export function festivalObjects(theme: VenueId): FestivalObject[] {
  const out: FestivalObject[] = [];
  for (const l of FESTIVAL_MAP.layers) {
    if (l.type !== 'objectgroup') continue;
    for (const o of (l.objects ?? []) as IsoObject[]) {
      const props = propsOf(o);
      if (props.theme && props.theme !== theme) continue;
      out.push({
        name: o.name,
        type: o.type,
        layer: l.name,
        at: isoToFrame(o.x, o.y),
        poly: o.polygon ? o.polygon.map((q) => isoToFrame(o.x + q.x, o.y + q.y)) : null,
        props,
      });
    }
  }
  return out;
}

export function bbox(poly: Pt[]): { x: number; y: number; w: number; h: number } {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return { x, y, w: Math.ceil(Math.max(...xs)) - x, h: Math.ceil(Math.max(...ys)) - y };
}

export function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The lowest point of a shape in column x (its front edge), or -Infinity outside it. */
export function lowestAt(poly: Pt[], x: number): number {
  let low = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.x > x !== b.x > x) low = Math.max(low, a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
  }
  return low;
}
