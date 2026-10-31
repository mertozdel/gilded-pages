/**
 * The walkable floor of a painted room, without Phaser: polygons in px of the painting, a grid of
 * CELL-px cells (0 open, 1 blocked), and only the floor that can be reached from the door. The
 * painted room paths over it with EasyStar; the unit tests check routes on it.
 */
export type Poly = { x: number; y: number }[];

/** Path cells, in px of the painting. */
export const CELL = 6;

/** Something that blocks feet: a polygon, wholly, or only the band `foot` px above its lowest edge. */
export interface Blocker {
  poly: Poly;
  foot: number | null;
}

export interface WalkGrid {
  grid: number[][];
  /** The painting px of cell (0, 0)'s corner. */
  gx: number;
  gy: number;
}

export function polygonOf(o: { x: number; y: number; polygon?: { x: number; y: number }[] }): Poly {
  return (o.polygon ?? []).map((p) => ({ x: o.x + p.x, y: o.y + p.y }));
}

export function inside(poly: Poly, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The lowest point of a shape in column x — its front edge on the floor — or -Infinity outside it. */
export function lowestAt(poly: Poly, x: number): number {
  let low = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.x > x !== b.x > x) low = Math.max(low, a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
  }
  return low;
}

export function bbox(poly: Poly): { x: number; y: number; w: number; h: number } {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return { x, y, w: Math.ceil(Math.max(...xs)) - x, h: Math.ceil(Math.max(...ys)) - y };
}

export function isBlocked(blockers: readonly Blocker[], x: number, y: number): boolean {
  return blockers.some((f) => inside(f.poly, x, y) && (f.foot === null || y >= lowestAt(f.poly, x) - f.foot));
}

/**
 * The grid over the walk polygons, minus the blockers; with a `start` (the door), floor that
 * can't be reached from it (corners sealed off by furniture) is closed too, so a click there
 * sends a walker to the nearest point they can actually get to.
 */
export function buildWalkGrid(walk: readonly Poly[], blockers: readonly Blocker[], start?: { u: number; v: number }): WalkGrid {
  if (!walk.length) return { grid: [], gx: 0, gy: 0 };
  const b = bbox(walk.flat());
  const cols = Math.ceil(b.w / CELL) + 1;
  const rows = Math.ceil(b.h / CELL) + 1;
  const grid: number[][] = [];
  for (let j = 0; j < rows; j++) {
    const row: number[] = [];
    for (let i = 0; i < cols; i++) {
      const x = b.x + (i + 0.5) * CELL;
      const y = b.y + (j + 0.5) * CELL;
      row.push(walk.some((w) => inside(w, x, y)) && !isBlocked(blockers, x, y) ? 0 : 1);
    }
    grid.push(row);
  }
  const g = { grid, gx: b.x, gy: b.y };
  if (start) keepReachable(g, nearestCell(g, start.u, start.v));
  return g;
}

export function cellOf(g: WalkGrid, u: number, v: number): { i: number; j: number } {
  return { i: Math.floor((u - g.gx) / CELL), j: Math.floor((v - g.gy) / CELL) };
}

export function isOpen(g: WalkGrid, u: number, v: number): boolean {
  const { i, j } = cellOf(g, u, v);
  return g.grid[j]?.[i] === 0;
}

export function nearestCell(g: WalkGrid, u: number, v: number): { i: number; j: number } {
  const c = cellOf(g, u, v);
  if (g.grid[c.j]?.[c.i] === 0) return c;
  let best = { i: 0, j: 0, d: Infinity };
  g.grid.forEach((row, j) =>
    row.forEach((cell, i) => {
      if (cell !== 0) return;
      const d = (i - c.i) ** 2 + (j - c.j) ** 2;
      if (d < best.d) best = { i, j, d };
    }),
  );
  return best;
}

export function cellCentre(g: WalkGrid, c: { i: number; j: number }): { u: number; v: number } {
  return { u: g.gx + (c.i + 0.5) * CELL, v: g.gy + (c.j + 0.5) * CELL };
}

/** Closes every open cell that can't be reached from `start` (the same moves as the path finder). */
function keepReachable(g: WalkGrid, start: { i: number; j: number }): void {
  const grid = g.grid;
  const open = (i: number, j: number) => grid[j]?.[i] === 0;
  const seen = grid.map((row) => row.map(() => false));
  if (!open(start.i, start.j)) return;
  const queue = [start];
  seen[start.j][start.i] = true;
  while (queue.length) {
    const { i, j } = queue.pop()!;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        // Diagonals, but not across a blocked corner.
        if (!open(ni, nj) || seen[nj][ni] || (di && dj && (!open(ni, j) || !open(i, nj)))) continue;
        seen[nj][ni] = true;
        queue.push({ i: ni, j: nj });
      }
  }
  grid.forEach((row, j) => row.forEach((_, i) => !seen[j][i] && (row[i] = 1)));
}
