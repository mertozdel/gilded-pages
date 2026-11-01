/**
 * The isometric rooms, authored as Tiled maps (.tmj, isometric, 32×16 tiles). Each has the
 * layers Floor and Walls (tiles), Furniture (objects with an `art` key and `solid` flag),
 * Hotspots (named points with a label and where Roxy stands) and Spots (named points).
 *
 * Tiled stores isometric object positions in tile-height units along both axes, so a
 * position in tiles is `u = x / tileheight`, `v = y / tileheight`.
 */
import cafeIsoTmj from './cafe.tmj?raw';
import cafePaintedTmj from './cafe-painted.tmj?raw';

/**
 * `cafe` is the painted café (the reference art); `cafe-iso` the generated tile version;
 * `cafe-select` the same painting, dimmed, behind the character select line-up.
 */
export type RoomId = 'cafe' | 'cafe-iso' | 'cafe-select';
export type Facing = 'SE' | 'SW' | 'NE' | 'NW';

export interface TiledProperty {
  name: string;
  type: string;
  value: unknown;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  /** false: kept in the map but off (Tiled's way of commenting an object out). */
  visible?: boolean;
  polygon?: { x: number; y: number }[];
  properties?: TiledProperty[];
}

export interface TiledLayer {
  id: number;
  name: string;
  type: 'tilelayer' | 'objectgroup';
  data?: number[];
  objects?: TiledObject[];
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tileoffset?: { x: number; y: number };
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation: string;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties?: TiledProperty[];
}

export const ROOM_MAPS: Record<RoomId, TiledMap> = {
  cafe: JSON.parse(cafePaintedTmj) as TiledMap,
  'cafe-iso': JSON.parse(cafeIsoTmj) as TiledMap,
  'cafe-select': JSON.parse(cafePaintedTmj) as TiledMap,
};

/** The room whose painting a room shows (the select line-up stands in the café). */
export function paintingOf(room: RoomId): RoomId {
  return room === 'cafe-select' ? 'cafe' : room;
}

/** A painted room (an illustration with a walk polygon) or an isometric tile map. */
export function roomKind(room: RoomId): 'painted' | 'iso' {
  return propsOf(ROOM_MAPS[room]).kind === 'painted' ? 'painted' : 'iso';
}

/** Tiled properties (an array of name/value pairs) as a plain object. */
export function propsOf(o: { properties?: TiledProperty[] }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of o.properties ?? []) out[p.name] = p.value;
  return out;
}

export function objectLayer(map: TiledMap, name: string): TiledObject[] {
  return map.layers.find((l) => l.name === name && l.type === 'objectgroup')?.objects ?? [];
}

export interface HotspotDef {
  id: string;
  label: string;
  hint: string;
  u: number;
  v: number;
  /** Height of the button above the floor point, in px. */
  z: number;
  stand: { u: number; v: number };
  facing: Facing;
  /** Only there while the room has this tag on (a regular's hotspot follows him: `matt_seat`, `matt_waiting`). */
  with?: string;
  /** Just the glowing dot in the room, never a name over it (the regular). */
  dot?: boolean;
}

export function roomHotspots(room: RoomId): HotspotDef[] {
  const map = ROOM_MAPS[room];
  if (roomKind(room) === 'painted') {
    // Painted rooms: positions are px of the painting.
    return objectLayer(map, 'Hotspots').map((o) => {
      const p = propsOf(o);
      return {
        id: o.name,
        label: String(p.label ?? o.name),
        hint: String(p.hint ?? ''),
        u: o.x,
        v: o.y,
        z: 0,
        stand: { u: Number(p.standX ?? o.x), v: Number(p.standY ?? o.y) },
        facing: (p.facing as Facing) ?? 'SE',
        ...(p.with ? { with: String(p.with) } : {}),
        ...(p.dot ? { dot: true } : {}),
      };
    });
  }
  const t = map.tileheight;
  return objectLayer(map, 'Hotspots').map((o) => {
    const p = propsOf(o);
    return {
      id: o.name,
      label: String(p.label ?? o.name),
      hint: String(p.hint ?? ''),
      u: o.x / t,
      v: o.y / t,
      z: Number(p.z ?? 0),
      stand: { u: Number(p.standU ?? o.x / t), v: Number(p.standV ?? o.y / t) },
      facing: (p.facing as Facing) ?? 'SE',
    };
  });
}
