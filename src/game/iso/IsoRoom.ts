import Phaser from 'phaser';
import { js as EasyStar } from 'easystarjs';
import { ROOM_MAPS, objectLayer, propsOf, roomHotspots, type Facing, type HotspotDef, type RoomId, type TiledMap } from '../../content/rooms';
import { TILE_W, project, type Pt } from './iso';
import { facingFor } from './IsoWalker';
import type { Room, Sortable, Spot } from './Room';

export type { Footprint, Sortable, Spot } from './Room';

interface Piece extends Sortable {
  name: string;
  img: Phaser.GameObjects.Image;
  u: number;
  v: number;
  solid: boolean;
}

/** Path cells per tile. */
const GRID = 2;
/** How far solid furniture keeps walkers off, in tiles. */
const CLEARANCE = 0.12;

/**
 * Is `a` in front of `b`? Footprints separated along an axis decide it; overlapping ones are
 * someone sitting on something, so the sitter's bias decides (facing the room: in front);
 * otherwise the footprints' centres.
 */
function inFront(a: Sortable, b: Sortable): boolean {
  const fa = a.foot();
  const fb = b.foot();
  if (fa.u0 >= fb.u1 - 1e-6) return true;
  if (fb.u0 >= fa.u1 - 1e-6) return false;
  if (fa.v0 >= fb.v1 - 1e-6) return true;
  if (fb.v0 >= fa.v1 - 1e-6) return false;
  if (a.bias() !== b.bias()) return a.bias() > b.bias();
  return fa.u0 + fa.u1 + fa.v0 + fa.v1 > fb.u0 + fb.u1 + fb.v0 + fb.v1;
}

/**
 * One isometric room built from its Tiled map: the Floor and Walls tile layers, a sprite per
 * Furniture object, named Spots and Hotspots, and an EasyStar grid made from the solid
 * footprints. The room is drawn with its back corner at `origin` (game px).
 */
export class IsoRoom implements Room {
  readonly kind = 'iso' as const;
  readonly speedScale = 1;
  readonly actorScale = 1;
  readonly actorScaleSmooth = 1;
  readonly id: RoomId;
  readonly U: number;
  readonly V: number;
  readonly wallH: number;
  readonly hotspots: HotspotDef[];
  readonly spots = new Map<string, Spot>();
  readonly pieces: Piece[] = [];
  private readonly map: Phaser.Tilemaps.Tilemap;
  private readonly layers: Phaser.Tilemaps.TilemapLayer[] = [];
  private readonly extras: { obj: Phaser.GameObjects.Image; u: number; v: number; z: number }[] = [];
  private readonly finder = new EasyStar();
  private grid: number[][] = [];
  origin: Pt = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    id: RoomId,
    origins: Map<string, Pt>,
  ) {
    this.id = id;
    // Phaser's parser keeps references into the data, so give it its own copy.
    const data = JSON.parse(JSON.stringify(ROOM_MAPS[id])) as TiledMap;
    this.U = data.width;
    this.V = data.height;
    this.wallH = Number(propsOf(data).wallHeight ?? 90);
    const key = `room-${id}`;
    if (scene.cache.tilemap.exists(key)) scene.cache.tilemap.remove(key);
    scene.cache.tilemap.add(key, { format: Phaser.Tilemaps.Formats.TILED_JSON, data });
    this.map = scene.make.tilemap({ key });
    const tilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const raw of data.tilesets) {
      const ts = this.map.addTilesetImage(raw.name, raw.name);
      if (!ts) continue;
      // Tiled bottom-aligns tall tiles and offsets downward; Phaser draws a tile from its
      // top-left and offsets upward. Convert so the .tmj looks the same in both.
      ts.tileOffset.set(-(raw.tileoffset?.x ?? 0), raw.tileheight - data.tileheight - (raw.tileoffset?.y ?? 0));
      tilesets.push(ts);
    }
    for (const [name, depth] of [
      ['Floor', -1002],
      ['Walls', -1001],
    ] as const) {
      // Isometric maps need the CPU TilemapLayer (the GPU layer is orthogonal only).
      const layer = this.map.createLayer(name, tilesets) as Phaser.Tilemaps.TilemapLayer | null;
      if (!layer) continue;
      layer.setDepth(depth);
      this.layers.push(layer);
    }

    const t = data.tileheight;
    for (const o of objectLayer(data, 'Furniture')) {
      const p = propsOf(o);
      const art = String(p.art);
      const img = scene.add.image(0, 0, art);
      const org = origins.get(art) ?? { x: img.width / 2, y: img.height };
      img.setOrigin(org.x / img.width, org.y / img.height);
      const f = { u0: o.x / t, v0: o.y / t, u1: (o.x + o.width) / t, v1: (o.y + o.height) / t };
      this.pieces.push({
        name: o.name,
        img,
        u: f.u0,
        v: f.v0,
        solid: p.solid !== false,
        foot: () => f,
        bias: () => 0,
        setDepth: (d) => img.setDepth(d),
      });
    }
    for (const o of objectLayer(data, 'Spots')) {
      const p = propsOf(o);
      this.spots.set(o.name, { name: o.name, kind: o.type, u: o.x / t, v: o.y / t, facing: (p.facing as Facing) ?? 'SE' });
    }
    this.hotspots = roomHotspots(id);
    this.buildGrid();
  }

  // ---------- placement ----------

  /** The room's screen bounds relative to its back corner. */
  bounds(): { x0: number; y0: number; x1: number; y1: number } {
    return { x0: -this.V * 16 - 2, y0: -this.wallH - 4, x1: this.U * 16 + 2, y1: (this.U + this.V) * 8 + 12 };
  }

  /** Centres the room in a rectangle of game px. */
  fit(r: { x: number; y: number; w: number; h: number }): void {
    const b = this.bounds();
    this.setOrigin(Math.round(r.x + r.w / 2 - (b.x0 + b.x1) / 2), Math.round(r.y + r.h / 2 - (b.y0 + b.y1) / 2));
  }

  setOrigin(x: number, y: number): void {
    this.origin = { x, y };
    for (const l of this.layers) l.setPosition(x - TILE_W / 2, y);
    for (const p of this.pieces) {
      const s = this.toScreen(p.u, p.v);
      p.img.setPosition(Math.round(s.x), Math.round(s.y));
    }
    for (const e of this.extras) {
      const s = this.toScreen(e.u, e.v, e.z);
      e.obj.setPosition(Math.round(s.x), Math.round(s.y));
    }
  }

  /** Adds an image pinned to a room point (decals, light pools). Not depth-sorted. */
  addExtra(obj: Phaser.GameObjects.Image, u: number, v: number, z: number, depth: number): Phaser.GameObjects.Image {
    obj.setDepth(depth);
    this.extras.push({ obj, u, v, z });
    const s = this.toScreen(u, v, z);
    obj.setPosition(Math.round(s.x), Math.round(s.y));
    return obj;
  }

  toScreen(u: number, v: number, z = 0): Pt {
    const p = project(u, v, z);
    return { x: this.origin.x + p.x, y: this.origin.y + p.y };
  }

  /** Screen (game px) to a floor position in tiles. */
  toFloor(x: number, y: number): { u: number; v: number } {
    const rx = (x - this.origin.x) / 16;
    const ry = (y - this.origin.y) / 8;
    return { u: (ry + rx) / 2, v: (ry - rx) / 2 };
  }

  inBounds(u: number, v: number): boolean {
    return u >= 0 && v >= 0 && u <= this.U && v <= this.V;
  }

  facingFor(du: number, dv: number): Facing {
    return facingFor(du, dv);
  }

  spot(name: string): Spot {
    const s = this.spots.get(name);
    if (!s) throw new Error(`Room ${this.id} has no spot "${name}"`);
    return s;
  }

  // ---------- walking ----------

  private buildGrid(): void {
    const gw = this.U * GRID;
    const gh = this.V * GRID;
    const solid = this.pieces.filter((p) => p.solid).map((p) => p.foot());
    this.grid = [];
    for (let j = 0; j < gh; j++) {
      const row: number[] = [];
      for (let i = 0; i < gw; i++) {
        const u = (i + 0.5) / GRID;
        const v = (j + 0.5) / GRID;
        const blocked = solid.some((f) => u > f.u0 - CLEARANCE && u < f.u1 + CLEARANCE && v > f.v0 - CLEARANCE && v < f.v1 + CLEARANCE);
        row.push(blocked ? 1 : 0);
      }
      this.grid.push(row);
    }
    this.finder.setGrid(this.grid);
    this.finder.setAcceptableTiles([0]);
    this.finder.enableDiagonals();
    this.finder.disableCornerCutting();
    this.finder.enableSync();
  }

  isWalkable(u: number, v: number): boolean {
    const i = Math.floor(u * GRID);
    const j = Math.floor(v * GRID);
    return this.grid[j]?.[i] === 0;
  }

  /** The nearest free path cell to a floor point (breadth-first outward). */
  private nearestCell(u: number, v: number): { i: number; j: number } {
    const gw = this.U * GRID;
    const gh = this.V * GRID;
    const si = Math.max(0, Math.min(gw - 1, Math.floor(u * GRID)));
    const sj = Math.max(0, Math.min(gh - 1, Math.floor(v * GRID)));
    if (this.grid[sj][si] === 0) return { i: si, j: sj };
    let best = { i: si, j: sj, d: Infinity };
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        if (this.grid[j][i] !== 0) continue;
        const d = (i + 0.5 - u * GRID) ** 2 + (j + 0.5 - v * GRID) ** 2;
        if (d < best.d) best = { i, j, d };
      }
    }
    return best;
  }

  /** Nearest walkable floor point (for clicks on furniture or off the floor). */
  nearestWalkable(u: number, v: number): { u: number; v: number } {
    if (this.isWalkable(u, v)) return { u, v };
    const c = this.nearestCell(u, v);
    return { u: (c.i + 0.5) / GRID, v: (c.j + 0.5) / GRID };
  }

  /**
   * A* (EasyStar) from one floor point to another, around solid furniture. Returns waypoints
   * in tiles ending exactly on the target when it is free, or null when there is no way.
   */
  findPath(fu: number, fv: number, tu: number, tv: number): { u: number; v: number }[] | null {
    const s = this.nearestCell(fu, fv);
    const e = this.nearestCell(tu, tv);
    const out: { path: { x: number; y: number }[] | null } = { path: null };
    this.finder.findPath(s.i, s.j, e.i, e.j, (p) => (out.path = p));
    this.finder.calculate();
    if (!out.path) return null;
    const cells = out.path;
    // Keep only the corners of the path.
    const pts: { u: number; v: number }[] = [];
    for (let k = 1; k < cells.length; k++) {
      const prev = cells[k - 1];
      const cur = cells[k];
      const next = cells[k + 1];
      const turn = !next || next.x - cur.x !== cur.x - prev.x || next.y - cur.y !== cur.y - prev.y;
      if (turn) pts.push({ u: (cur.x + 0.5) / GRID, v: (cur.y + 0.5) / GRID });
    }
    const free = this.isWalkable(tu, tv);
    if (pts.length) pts[pts.length - 1] = free ? { u: tu, v: tv } : pts[pts.length - 1];
    else if (free) pts.push({ u: tu, v: tv });
    return pts;
  }

  // ---------- drawing order ----------

  /** Orders furniture and characters back to front (insertion sort; a few dozen items). */
  sortDepth(actors: Sortable[]): void {
    const items: Sortable[] = [...this.pieces, ...actors];
    const sorted: Sortable[] = [];
    for (const it of items) {
      let k = sorted.length;
      while (k > 0 && inFront(sorted[k - 1], it)) k--;
      sorted.splice(k, 0, it);
    }
    sorted.forEach((it, i) => it.setDepth(i + 1));
  }

  destroy(): void {
    for (const p of this.pieces) p.img.destroy();
    for (const e of this.extras) e.obj.destroy();
    for (const l of this.layers) l.destroy();
    this.map.destroy();
  }
}
