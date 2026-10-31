import Phaser from 'phaser';
import { js as EasyStar } from 'easystarjs';
import { ROOM_MAPS, objectLayer, propsOf, roomHotspots, type Facing, type HotspotDef, type RoomId } from '../../content/rooms';
import type { Pt } from './iso';
import type { Footprint, RegularSpot, Room, Sortable, Spot } from './Room';
import { bbox, buildWalkGrid, cellCentre, isOpen, lowestAt, nearestCell, polygonOf, type Blocker, type Poly, type WalkGrid } from './walkGrid';

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

/** The texture of an image overlay (a painted-out patch), loaded with the painting. */
export const overlayTextureKey = (src: string) => `room-overlay:${src}`;

/** The image overlays a painted room needs loaded (painted-out patches): their paths under public/. */
export function overlayImages(id: RoomId): string[] {
  return objectLayer(ROOM_MAPS[id], 'Overlays')
    .map((o) => propsOf(o))
    .filter((p) => p.kind === 'image' && p.src)
    .map((p) => String(p.src));
}

/** A piece of furniture: what it blocks on the floor, and its cut-out of the painting. */
interface Furniture extends Blocker {
  box: { x: number; y: number; w: number; h: number };
  /** Drawn over whoever stands behind it; null when nobody can (it stands against a wall). */
  img: Phaser.GameObjects.Image | null;
  /** Hidden while this tag is on (the window sofa while Mert brings his own). */
  hideWith: string | null;
}

/**
 * A room that is a painted illustration (the reference look): the painting, scaled smoothly
 * to fit, with Roxy walking on it inside the Walk polygons (EasyStar on a grid of the
 * painting's px, see walkGrid.ts), only on floor she can reach from the door. Furniture
 * polygons trace each piece's silhouette: feet can't enter the band `foot` px above its lowest
 * edge (or any of it, without `foot`), and its cut-out of the painting is drawn over whoever
 * stands behind that edge (unless `occlude` is false). Overlays repaint small details (signs)
 * or, as images, paint furniture out (patches made by scripts/paint-out.py); Anchors mark
 * where the screen puts its real UI panels; Regulars place the regular NPCs. Units are px of
 * the painting.
 *
 * Tags switch parts of the map on and off: an overlay or hotspot with `with: <tag>` is there
 * only while the tag is on, furniture with `hideWith: <tag>` hides, and a regular's footprint
 * blocks feet while its spot's name is on.
 *
 * A view much narrower than the painting (a phone held upright) shows it at the view's full
 * height instead of as a thin strip, and pans across it: dragged by the player, or easing
 * along to keep Roxy in view while she walks.
 */
export class PaintedRoom implements Room {
  readonly kind = 'painted' as const;
  readonly id: RoomId;
  readonly spots = new Map<string, Spot>();
  readonly speedScale: number;
  actorScale = 1;
  actorScaleSmooth = 1;
  readonly W: number;
  readonly H: number;
  readonly cropTop: number;
  readonly floorTile: number | undefined;
  readonly anchors: { id: string; x: number; y: number; w: number; h: number }[] = [];
  private readonly allHotspots: HotspotDef[];
  private readonly regulars = new Map<string, RegularSpot>();
  private readonly shown = new Set<string>();
  private readonly figureScale: number;
  private readonly painting: Phaser.GameObjects.Image;
  private readonly furniture: Furniture[] = [];
  private readonly overlays: { img: Phaser.GameObjects.Image; x: number; y: number; ss: number; with: string | null }[] = [];
  private readonly walk: Poly[];
  private readonly finder = new EasyStar();
  private nav: WalkGrid = { grid: [], gx: 0, gy: 0 };
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
    this.floorTile = p.floorTile ? Number(p.floorTile) : undefined;
    this.speedScale = SPEED_PER_FIGURE_SCALE * this.figureScale;
    this.allHotspots = roomHotspots(id);
    for (const o of objectLayer(map, 'Spots')) {
      const sp = propsOf(o);
      this.spots.set(o.name, { name: o.name, kind: o.type, u: o.x, v: o.y, facing: (sp.facing as Facing) ?? 'SE' });
    }
    for (const o of objectLayer(map, 'Regulars')) {
      // An object switched off in the map is an alternative kept for later.
      if (o.visible === false) continue;
      const rp = propsOf(o);
      const footprint = o.polygon?.length ? polygonOf(o) : null;
      this.regulars.set(o.name, { name: o.name, kind: o.type, u: o.x, v: o.y, facing: (rp.facing as Facing) ?? 'SE', props: rp, footprint });
    }
    for (const o of objectLayer(map, 'Anchors')) this.anchors.push({ id: o.name, x: o.x, y: o.y, w: o.width, h: o.height });

    // The painting, minus its top strip (the mockup's own header).
    this.painting = scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDepth(-3000);
    this.painting.setCrop(0, this.cropTop, this.W, this.H - this.cropTop);
    const src = this.withPatches(scene, textureKey);

    for (const o of objectLayer(map, 'Furniture')) {
      const poly = polygonOf(o);
      const fp = propsOf(o);
      const box = bbox(poly);
      let img: Phaser.GameObjects.Image | null = null;
      if (fp.occlude !== false) {
        // Keyed by the painting: the café and the select screen's café share their cut-outs.
        const key = `${textureKey}-furniture-${o.name}`;
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
      this.furniture.push({ poly, box, foot: fp.foot === undefined ? null : Number(fp.foot), img, hideWith: fp.hideWith ? String(fp.hideWith) : null });
    }
    for (const o of objectLayer(map, 'Overlays')) {
      const op = propsOf(o);
      const tag = op.with ? String(op.with) : null;
      if (op.kind === 'image') {
        const key = overlayTextureKey(String(op.src));
        if (!scene.textures.exists(key)) {
          console.warn(`Room ${id}: overlay ${o.name} (${String(op.src)}) isn't loaded`);
          continue;
        }
        this.overlays.push({ img: scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-2990), x: o.x, y: o.y, ss: 1, with: tag });
        continue;
      }
      const ss = 3;
      const key = `${id}-overlay-${o.name}`;
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, overlayCanvas(String(op.kind), String(op.text), o.width, o.height, ss))?.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.overlays.push({ img: scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-2990), x: o.x, y: o.y, ss, with: tag });
    }

    this.walk = objectLayer(map, 'Walk').map(polygonOf);
    this.refreshShown();
    this.buildGrid();
  }

  /**
   * What furniture is cut from: the painting with its always-on patches, so a cut-out never
   * brings back a piece of furniture a patch painted out. Made once per room and kept.
   */
  private withPatches(scene: Phaser.Scene, textureKey: string): CanvasImageSource {
    const painting = scene.textures.get(textureKey).getSourceImage() as HTMLImageElement;
    const patches = objectLayer(ROOM_MAPS[this.id], 'Overlays').filter((o) => {
      const op = propsOf(o);
      return op.kind === 'image' && !op.with && scene.textures.exists(overlayTextureKey(String(op.src)));
    });
    if (!patches.length) return painting;
    const key = `${this.id}-painting-patched`;
    if (!scene.textures.exists(key)) {
      const cv = document.createElement('canvas');
      cv.width = this.W;
      cv.height = this.H;
      const c = cv.getContext('2d')!;
      c.drawImage(painting, 0, 0);
      for (const o of patches) c.drawImage(scene.textures.get(overlayTextureKey(String(propsOf(o).src))).getSourceImage() as HTMLImageElement, o.x, o.y);
      scene.textures.addCanvas(key, cv);
    }
    return scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  }

  // ---------- tags ----------

  /** The hotspots there now (a regular's follow him: at his table, on the sofa, waiting for a refill). */
  get hotspots(): HotspotDef[] {
    return this.allHotspots.filter((h) => !h.with || this.shown.has(h.with));
  }

  regularSpot(name: string): RegularSpot | null {
    return this.regulars.get(name) ?? null;
  }

  setShown(tag: string, on: boolean): void {
    if (this.shown.has(tag) === on) return;
    if (on) this.shown.add(tag);
    else this.shown.delete(tag);
    this.refreshShown();
    // A regular's footprint comes and goes with him.
    if (this.regulars.get(tag)?.props.blocks) this.buildGrid();
  }

  private refreshShown(): void {
    for (const o of this.overlays) o.img.setVisible(!o.with || this.shown.has(o.with));
    for (const f of this.furniture) f.img?.setVisible(!f.hideWith || !this.shown.has(f.hideWith));
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

  private buildGrid(): void {
    const blockers: Blocker[] = [...this.furniture];
    for (const r of this.regulars.values()) if (r.footprint && r.props.blocks && this.shown.has(r.name)) blockers.push({ poly: r.footprint, foot: null });
    this.nav = buildWalkGrid(this.walk, blockers, this.spots.get('door'));
    if (!this.nav.grid.length) return;
    this.finder.setGrid(this.nav.grid);
    this.finder.setAcceptableTiles([0]);
    this.finder.enableDiagonals();
    this.finder.disableCornerCutting();
    this.finder.enableSync();
  }

  isWalkable(u: number, v: number): boolean {
    return isOpen(this.nav, u, v);
  }

  nearestWalkable(u: number, v: number): { u: number; v: number } {
    if (this.isWalkable(u, v)) return { u, v };
    return cellCentre(this.nav, nearestCell(this.nav, u, v));
  }

  findPath(fu: number, fv: number, tu: number, tv: number): { u: number; v: number }[] | null {
    if (!this.nav.grid.length) return [{ u: tu, v: tv }];
    const s = nearestCell(this.nav, fu, fv);
    const e = nearestCell(this.nav, tu, tv);
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
      if (!next || next.x - cur.x !== cur.x - prev.x || next.y - cur.y !== cur.y - prev.y) pts.push(cellCentre(this.nav, { i: cur.x, j: cur.y }));
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
        // Something wide (a table set) is behind a piece if any of its width is.
        const span = a.span ?? 0;
        if (u < f.box.x - reach - span || u > f.box.x + f.box.w + reach + span) continue;
        const lo = Phaser.Math.Clamp(u - span, f.box.x + 0.5, f.box.x + f.box.w - 0.5);
        const hi = Phaser.Math.Clamp(u + span, f.box.x + 0.5, f.box.x + f.box.w - 0.5);
        let edge = -Infinity;
        for (let i = 0; i <= 8; i++) edge = Math.max(edge, lowestAt(f.poly, lo + ((hi - lo) * i) / 8));
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
