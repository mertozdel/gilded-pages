import Phaser from 'phaser';
import { js as EasyStar } from 'easystarjs';
import { ROOM_MAPS, objectLayer, propsOf, roomHotspots, type Facing, type HotspotDef, type RoomId, type TiledObject } from '../../content/rooms';
import type { Pt } from './iso';
import type { Footprint, Room, Sortable, Spot } from './Room';

/** Path cells, in px of the painting. */
const CELL = 6;
/** Walk speed in px of the painting per tile, for a painting whose figures are 1× (the 45 px people). */
const SPEED_PER_FIGURE_SCALE = 34 / 3.6;
/** Half a character's width in px of the painting, for 1× figures. */
const FIGURE_HALF_WIDTH = 14;
/** Cut-outs nobody stands behind sit just over the painting and its overlays, under every character. */
const DEPTH_BEHIND_ALL = -2980;
/** A view this much shorter than the painting fitted whole would be (a phone held upright) fills its height and pans instead. */
const PAN_BELOW = 0.75;
/** Panning, at least this much of the painting's width stays in view. */
const MIN_SHOWN = 0.3;

type Poly = { x: number; y: number }[];

/** A piece of furniture: what it blocks on the floor, and its cut-out of the painting. */
interface Furniture {
  poly: Poly;
  box: { x: number; y: number; w: number; h: number };
  /** Px above its lowest edge that feet can't enter; null blocks the whole shape. */
  foot: number | null;
  /** Drawn over whoever stands behind it; null when nobody can (it stands against a wall). */
  img: Phaser.GameObjects.Image | null;
}

function polygonOf(o: TiledObject & { polygon?: { x: number; y: number }[] }): Poly {
  return (o.polygon ?? []).map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
}

function inside(poly: Poly, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The lowest point of a shape in column x — its front edge on the floor — or -Infinity outside it. */
function lowestAt(poly: Poly, x: number): number {
  let low = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.x > x !== b.x > x) low = Math.max(low, a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
  }
  return low;
}

function bbox(poly: Poly): { x: number; y: number; w: number; h: number } {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return { x, y, w: Math.ceil(Math.max(...xs)) - x, h: Math.ceil(Math.max(...ys)) - y };
}

/**
 * A room that is a painted illustration (the reference look): the painting, scaled smoothly
 * to fit, with Roxy walking on it inside the Walk polygons (EasyStar on a grid of the
 * painting's px), only on floor she can reach from the door. Furniture polygons trace each
 * piece's silhouette: feet can't enter the band `foot` px above its lowest edge (or any of
 * it, without `foot`), and its cut-out of the painting is drawn over whoever stands behind
 * that edge (unless `occlude` is false). Overlays repaint small details (signs); Anchors
 * mark where the screen puts its real UI panels. Units are px of the painting.
 *
 * A view much narrower than the painting (a phone held upright) shows it at the view's full
 * height instead of as a thin strip, and pans across it: dragged by the player, or easing
 * along to keep Roxy in view while she walks.
 */
export class PaintedRoom implements Room {
  readonly kind = 'painted' as const;
  readonly id: RoomId;
  readonly hotspots: HotspotDef[];
  readonly spots = new Map<string, Spot>();
  readonly speedScale: number;
  actorScale = 1;
  actorScaleSmooth = 1;
  readonly W: number;
  readonly H: number;
  readonly cropTop: number;
  readonly anchors: { id: string; x: number; y: number; w: number; h: number }[] = [];
  private readonly figureScale: number;
  private readonly painting: Phaser.GameObjects.Image;
  private readonly furniture: Furniture[] = [];
  private readonly overlays: { img: Phaser.GameObjects.Image; x: number; y: number; ss: number }[] = [];
  private readonly walk: Poly[];
  private readonly finder = new EasyStar();
  private grid: number[][] = [];
  private gx = 0;
  private gy = 0;
  private scale = 1;
  private origin: Pt = { x: 0, y: 0 };
  /** The view it is fitted into (game px), and the painting's left edge from the view's (≤ 0 while panning). */
  private view = { x: 0, y: 0, w: 0, h: 0 };
  private pan = 0;
  private minPan = 0;

  constructor(
    scene: Phaser.Scene,
    id: RoomId,
    textureKey: string,
  ) {
    this.id = id;
    const map = ROOM_MAPS[id];
    const p = propsOf(map);
    this.W = Number(p.imageWidth);
    this.H = Number(p.imageHeight);
    this.cropTop = Number(p.cropTop ?? 0);
    this.figureScale = Number(p.figureScale ?? 1);
    this.speedScale = SPEED_PER_FIGURE_SCALE * this.figureScale;
    this.hotspots = roomHotspots(id);
    for (const o of objectLayer(map, 'Spots')) {
      const sp = propsOf(o);
      this.spots.set(o.name, { name: o.name, kind: o.type, u: o.x, v: o.y, facing: (sp.facing as Facing) ?? 'SE' });
    }
    for (const o of objectLayer(map, 'Anchors')) this.anchors.push({ id: o.name, x: o.x, y: o.y, w: o.width, h: o.height });

    // The painting, minus its top strip (the mockup's own header).
    this.painting = scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDepth(-3000);
    this.painting.setCrop(0, this.cropTop, this.W, this.H - this.cropTop);
    const src = scene.textures.get(textureKey).getSourceImage() as HTMLImageElement;

    for (const o of objectLayer(map, 'Furniture')) {
      const poly = polygonOf(o);
      const fp = propsOf(o);
      const box = bbox(poly);
      let img: Phaser.GameObjects.Image | null = null;
      if (fp.occlude !== false) {
        const key = `${id}-furniture-${o.name}`;
        // Cut once and kept: coming back to the room reuses it (the painting and the shape never change).
        if (!scene.textures.exists(key)) {
          const cv = document.createElement('canvas');
          cv.width = box.w;
          cv.height = box.h;
          const c = cv.getContext('2d')!;
          c.beginPath();
          poly.forEach((pt, i) => (i ? c.lineTo(pt.x - box.x, pt.y - box.y) : c.moveTo(pt.x - box.x, pt.y - box.y)));
          c.closePath();
          c.clip();
          c.drawImage(src, -box.x, -box.y);
          scene.textures.addCanvas(key, cv)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
        }
        img = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH_BEHIND_ALL);
      }
      this.furniture.push({ poly, box, foot: fp.foot === undefined ? null : Number(fp.foot), img });
    }
    for (const o of objectLayer(map, 'Overlays')) {
      const op = propsOf(o);
      const ss = 3;
      const key = `${id}-overlay-${o.name}`;
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, overlayCanvas(String(op.kind), String(op.text), o.width, o.height, ss))?.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.overlays.push({ img: scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-2990), x: o.x, y: o.y, ss });
    }

    this.walk = objectLayer(map, 'Walk').map(polygonOf);
    this.buildGrid();
  }

  // ---------- placement ----------

  fit(r: { x: number; y: number; w: number; h: number }): void {
    const visH = this.H - this.cropTop;
    const contain = Math.min(r.w / this.W, r.h / visH);
    const cover = r.h / visH;
    const s = contain < cover * PAN_BELOW ? Math.min(cover, r.w / (this.W * MIN_SHOWN)) : contain;
    // Refitting keeps the same part of the painting in the middle of the view.
    const mid = this.view.w ? (this.view.w / 2 - this.pan) / this.scale : this.W / 2;
    this.view = r;
    this.scale = s;
    this.actorScaleSmooth = this.figureScale * s;
    this.actorScale = Math.max(1, Math.round(this.actorScaleSmooth));
    this.minPan = r.w - this.W * s < -0.5 ? r.w - this.W * s : 0;
    this.pan = this.pannable ? Phaser.Math.Clamp(r.w / 2 - mid * s, this.minPan, 0) : (r.w - this.W * s) / 2;
    this.place();
  }

  /** Wider than its view: it pans. */
  get pannable(): boolean {
    return this.minPan < 0;
  }

  /** Drags the painting across the view by `dx` game px, up to its edges. */
  panBy(dx: number): void {
    if (!this.pannable) return;
    this.pan = Phaser.Math.Clamp(this.pan + dx, this.minPan, 0);
    this.place();
  }

  /** Puts painting x `u` in the middle of the view (as far as the edges allow). */
  centerOn(u: number): void {
    if (!this.pannable) return;
    this.pan = Phaser.Math.Clamp(this.view.w / 2 - u * this.scale, this.minPan, 0);
    this.place();
  }

  /** Eases the pan so painting x `u` stays between `lo` and `hi` of the view's width. True if it moved. */
  follow(u: number, lo: number, hi: number, dt: number): boolean {
    if (!this.pannable) return false;
    const x = this.pan + u * this.scale;
    const target = x < lo * this.view.w ? this.pan + lo * this.view.w - x : x > hi * this.view.w ? this.pan - (x - hi * this.view.w) : this.pan;
    const next = Phaser.Math.Clamp(this.pan + (target - this.pan) * (1 - Math.exp(-dt / 220)), this.minPan, 0);
    if (Math.abs(next - this.pan) < 0.05) return false;
    this.pan = next;
    this.place();
    return true;
  }

  private place(): void {
    const s = this.scale;
    const r = this.view;
    const visH = this.H - this.cropTop;
    this.origin = { x: Math.round(r.x + this.pan), y: Math.round(r.y + (r.h - visH * s) / 2 - this.cropTop * s) };
    this.painting.setScale(s).setPosition(this.origin.x, this.origin.y);
    for (const f of this.furniture) f.img?.setScale(s).setPosition(this.origin.x + f.box.x * s, this.origin.y + f.box.y * s);
    for (const o of this.overlays) o.img.setScale(s / o.ss).setPosition(this.origin.x + o.x * s, this.origin.y + o.y * s);
  }

  /** Screen rects (game px) of the anchors, for the screen's real UI panels. */
  anchorRects(): { id: string; x: number; y: number; w: number; h: number }[] {
    return this.anchors.map((a) => ({ id: a.id, x: this.origin.x + a.x * this.scale, y: this.origin.y + a.y * this.scale, w: a.w * this.scale, h: a.h * this.scale }));
  }

  toScreen(u: number, v: number, z = 0): Pt {
    return { x: this.origin.x + u * this.scale, y: this.origin.y + (v - z) * this.scale };
  }

  toFloor(x: number, y: number): { u: number; v: number } {
    return { u: (x - this.origin.x) / this.scale, v: (y - this.origin.y) / this.scale };
  }

  inBounds(u: number, v: number): boolean {
    return u >= 0 && u <= this.W && v >= this.cropTop && v <= this.H;
  }

  spot(name: string): Spot {
    const s = this.spots.get(name);
    if (!s) throw new Error(`Room ${this.id} has no spot "${name}"`);
    return s;
  }

  /** In a painting, screen-down is towards us: down-right is SE, up-left is NW. */
  facingFor(du: number, dv: number): Facing {
    if (dv >= 0) return du >= 0 ? 'SE' : 'SW';
    return du >= 0 ? 'NE' : 'NW';
  }

  // ---------- walking ----------

  private blocked(x: number, y: number): boolean {
    return this.furniture.some((f) => inside(f.poly, x, y) && (f.foot === null || y >= lowestAt(f.poly, x) - f.foot));
  }

  private buildGrid(): void {
    if (!this.walk.length) return;
    const b = bbox(this.walk.flat());
    this.gx = b.x;
    this.gy = b.y;
    const cols = Math.ceil(b.w / CELL) + 1;
    const rows = Math.ceil(b.h / CELL) + 1;
    this.grid = [];
    for (let j = 0; j < rows; j++) {
      const row: number[] = [];
      for (let i = 0; i < cols; i++) {
        const x = this.gx + (i + 0.5) * CELL;
        const y = this.gy + (j + 0.5) * CELL;
        row.push(this.walk.some((w) => inside(w, x, y)) && !this.blocked(x, y) ? 0 : 1);
      }
      this.grid.push(row);
    }
    const door = this.spots.get('door');
    if (door) this.keepReachable(this.nearestCell(door.u, door.v));
    this.finder.setGrid(this.grid);
    this.finder.setAcceptableTiles([0]);
    this.finder.enableDiagonals();
    this.finder.disableCornerCutting();
    this.finder.enableSync();
  }

  /**
   * Closes floor that can't be reached from `start` (corners sealed off by furniture), so a
   * click there sends her to the nearest point she can actually get to.
   */
  private keepReachable(start: { i: number; j: number }): void {
    const open = (i: number, j: number) => this.grid[j]?.[i] === 0;
    const seen = this.grid.map((row) => row.map(() => false));
    const queue = [start];
    seen[start.j][start.i] = true;
    while (queue.length) {
      const { i, j } = queue.pop()!;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ni = i + di;
          const nj = j + dj;
          // The same moves as the path finder: diagonals, but not across a blocked corner.
          if (!open(ni, nj) || seen[nj][ni] || (di && dj && (!open(ni, j) || !open(i, nj)))) continue;
          seen[nj][ni] = true;
          queue.push({ i: ni, j: nj });
        }
    }
    this.grid.forEach((row, j) => row.forEach((_, i) => !seen[j][i] && (row[i] = 1)));
  }

  private cellOf(u: number, v: number): { i: number; j: number } {
    return { i: Math.floor((u - this.gx) / CELL), j: Math.floor((v - this.gy) / CELL) };
  }

  isWalkable(u: number, v: number): boolean {
    const { i, j } = this.cellOf(u, v);
    return this.grid[j]?.[i] === 0;
  }

  private nearestCell(u: number, v: number): { i: number; j: number } {
    const c = this.cellOf(u, v);
    if (this.grid[c.j]?.[c.i] === 0) return c;
    let best = { i: 0, j: 0, d: Infinity };
    this.grid.forEach((row, j) =>
      row.forEach((cell, i) => {
        if (cell !== 0) return;
        const d = (i - c.i) ** 2 + (j - c.j) ** 2;
        if (d < best.d) best = { i, j, d };
      }),
    );
    return best;
  }

  nearestWalkable(u: number, v: number): { u: number; v: number } {
    if (this.isWalkable(u, v)) return { u, v };
    const c = this.nearestCell(u, v);
    return { u: this.gx + (c.i + 0.5) * CELL, v: this.gy + (c.j + 0.5) * CELL };
  }

  findPath(fu: number, fv: number, tu: number, tv: number): { u: number; v: number }[] | null {
    if (!this.grid.length) return [{ u: tu, v: tv }];
    const s = this.nearestCell(fu, fv);
    const e = this.nearestCell(tu, tv);
    const out: { path: { x: number; y: number }[] | null } = { path: null };
    this.finder.findPath(s.i, s.j, e.i, e.j, (p) => (out.path = p));
    this.finder.calculate();
    if (!out.path) return null;
    const cells = out.path;
    const pts: { u: number; v: number }[] = [];
    for (let k = 1; k < cells.length; k++) {
      const prev = cells[k - 1];
      const cur = cells[k];
      const next = cells[k + 1];
      if (!next || next.x - cur.x !== cur.x - prev.x || next.y - cur.y !== cur.y - prev.y) pts.push({ u: this.gx + (cur.x + 0.5) * CELL, v: this.gy + (cur.y + 0.5) * CELL });
    }
    // The last stretch goes exactly to the target (seats and spots may sit just off the floor).
    if (pts.length) pts[pts.length - 1] = { u: tu, v: tv };
    else pts.push({ u: tu, v: tv });
    return pts;
  }

  // ---------- drawing order ----------

  /**
   * Characters by the y of their feet. A piece of furniture is drawn over the characters
   * beside it whose feet are above its front edge (behind it), and under everyone else.
   */
  sortDepth(actors: Sortable[]): void {
    for (const a of actors) a.setDepth(this.toScreen(a.u ?? 0, a.v ?? 0).y);
    const reach = FIGURE_HALF_WIDTH * this.figureScale;
    for (const f of this.furniture) {
      if (!f.img) continue;
      let depth = DEPTH_BEHIND_ALL;
      for (const a of actors) {
        const u = a.u ?? 0;
        const v = a.v ?? 0;
        if (u < f.box.x - reach || u > f.box.x + f.box.w + reach) continue;
        const edge = lowestAt(f.poly, Phaser.Math.Clamp(u, f.box.x + 0.5, f.box.x + f.box.w - 0.5));
        if (v < edge) depth = Math.max(depth, this.toScreen(u, v).y + 0.5);
      }
      f.img.setDepth(depth);
    }
  }

  destroy(): void {
    this.painting.destroy();
    for (const f of this.furniture) f.img?.destroy();
    for (const o of this.overlays) o.img.destroy();
  }
}

/** A footprint unused by painted rooms (characters sort by their feet), kept for the interface. */
export const NO_FOOT: Footprint = { u0: 0, v0: 0, u1: 0, v1: 0 };

/**
 * Small repainted details at `ss`× the painting's resolution: the café's own signs in place
 * of the reference's lettering.
 */
function overlayCanvas(kind: string, text: string, w: number, h: number, ss: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * ss);
  cv.height = Math.round(h * ss);
  const c = cv.getContext('2d')!;
  c.scale(ss, ss);
  const lines = text.split('|');
  const round = (x: number, y: number, ww: number, hh: number, r: number, fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.roundRect(x, y, ww, hh, r);
    c.fill();
  };
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  switch (kind) {
    case 'script':
      round(0, 0, w, h, 4, '#1C1C21');
      c.fillStyle = '#F2EDE4';
      c.font = `italic 600 ${Math.round(h * 0.55)}px "Segoe Script", "Brush Script MT", Georgia, serif`;
      c.fillText(lines[0], w / 2, h / 2 + 1, w - 6);
      break;
    case 'sign':
    case 'board': {
      round(0, 0, w, h, 3, kind === 'sign' ? '#B9A6E8' : '#1E2236');
      c.fillStyle = kind === 'sign' ? '#FFFFFF' : '#F2EDE4';
      const fs = Math.min(13, (h * 0.62) / lines.length);
      c.font = `700 ${fs}px "Arial Narrow", "Segoe UI", sans-serif`;
      lines.forEach((l, i) => c.fillText(l, w / 2, 6 + fs * 0.6 + i * fs * 1.15, w - 6));
      // a little snowy mountain, like the reference's poster
      const my = h - 6;
      c.fillStyle = kind === 'sign' ? '#5A4AA0' : '#3A4A88';
      c.beginPath();
      c.moveTo(6, my);
      c.lineTo(w * 0.38, h * 0.62);
      c.lineTo(w * 0.55, h * 0.74);
      c.lineTo(w * 0.72, h * 0.6);
      c.lineTo(w - 6, my);
      c.fill();
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.moveTo(w * 0.32, h * 0.67);
      c.lineTo(w * 0.38, h * 0.62);
      c.lineTo(w * 0.44, h * 0.67);
      c.fill();
      break;
    }
    case 'chalk': {
      round(0, 0, w, h, 4, '#1F2A26');
      c.fillStyle = '#F2EDE4';
      const fs = Math.min(20, (h * 0.78) / lines.length);
      lines.forEach((l, i) => {
        const y = 10 + fs * 0.6 + i * fs * 1.1;
        if (l === '~') {
          c.fillRect(w * 0.25, y, w * 0.5, 1.2);
          return;
        }
        c.font = `italic ${i < 2 ? 600 : 400} ${fs}px "Segoe Script", "Brush Script MT", Georgia, serif`;
        c.fillText(l, w / 2, y, w - 8);
      });
      break;
    }
  }
  return cv;
}
