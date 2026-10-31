import type { Facing, HotspotDef, RoomId } from '../../content/rooms';
import type { Pt } from './iso';

/** A floor rectangle (iso tiles, or image px in a painted room). */
export interface Footprint {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface Spot {
  name: string;
  kind: string;
  u: number;
  v: number;
  facing: Facing;
}

/**
 * Where a regular NPC is placed (the map's Regulars layer): the floor point under their sprite,
 * the way they face, the map's properties, and their collision footprint (if they bring one).
 */
export interface RegularSpot extends Spot {
  props: Record<string, unknown>;
  footprint: { x: number; y: number }[] | null;
}

/** Anything a room depth-sorts each frame: furniture, characters. */
export interface Sortable {
  /** Where it stands on the floor (room units). */
  readonly u?: number;
  readonly v?: number;
  /** Half its width on the floor (room units), for something wide like a table set: furniture checks all of it. */
  readonly span?: number;
  foot(): Footprint;
  /** Tie-break when footprints overlap (a seated character vs. their seat): + draws later. */
  bias(): number;
  setDepth(d: number): void;
}

/**
 * What characters and the café routine need from a room, whether it is an isometric Tiled
 * tile map (IsoRoom, units = tiles) or a painted illustration (PaintedRoom, units = px of
 * the painting).
 */
export interface Room {
  readonly id: RoomId;
  readonly kind: 'iso' | 'painted';
  readonly hotspots: HotspotDef[];
  readonly spots: Map<string, Spot>;
  /** Walk speeds are given in tiles per second; this converts them to room units. */
  readonly speedScale: number;
  /** Whole-number sprite scale, so characters match the room's art. */
  readonly actorScale: number;
  /** The same before rounding, for sprites drawn smooth (Roxy's mockup art). */
  readonly actorScaleSmooth: number;
  /** A floor tile's width in room units, when the room says (a painting has no grid of its own). */
  readonly floorTile?: number;
  spot(name: string): Spot;
  /** A regular's place (painted rooms; null when the map has none by that name). */
  regularSpot?(name: string): RegularSpot | null;
  /**
   * Turns a tag on or off: map objects with `with: <tag>` (overlays, hotspots) show only while
   * it is on, furniture with `hideWith: <tag>` hides, and a regular's footprint blocks feet
   * while its spot's name is on.
   */
  setShown?(tag: string, on: boolean): void;
  toScreen(u: number, v: number, z?: number): Pt;
  toFloor(x: number, y: number): { u: number; v: number };
  inBounds(u: number, v: number): boolean;
  isWalkable(u: number, v: number): boolean;
  nearestWalkable(u: number, v: number): { u: number; v: number };
  findPath(fu: number, fv: number, tu: number, tv: number): { u: number; v: number }[] | null;
  facingFor(du: number, dv: number): Facing;
  sortDepth(actors: Sortable[]): void;
  fit(r: { x: number; y: number; w: number; h: number }): void;
  destroy(): void;
}
