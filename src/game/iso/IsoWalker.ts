import type { Facing } from '../../content/rooms';
import type { Footprint, Room, Sortable } from './Room';

export const WALK_SPEED = 1.8;
export const BRISK_SPEED = 3;
export const RUN_SPEED = 5;

/** Facing from a move in tiles: screen-down is front (SE/SW), screen-up is back (NE/NW). */
export function facingFor(du: number, dv: number): Facing {
  const dx = du - dv;
  const dy = du + dv;
  if (dy >= 0) return dx >= 0 ? 'SE' : 'SW';
  return dx >= 0 ? 'NE' : 'NW';
}

/**
 * A character that walks on a room's floor: follows A* waypoints at a speed (tiles/s),
 * turns to face where it goes, can sit on a seat footprint, and depth-sorts by its feet.
 */
export abstract class IsoWalker implements Sortable {
  u = 0;
  v = 0;
  facing: Facing = 'SE';
  protected room: Room | null = null;
  protected path: { u: number; v: number }[] = [];
  protected speed = WALK_SPEED;
  private onArrive: (() => void) | null = null;
  /** The seat footprint while seated (sorts with the seat). */
  protected seat: Footprint | null = null;

  get moving(): boolean {
    return this.path.length > 0;
  }

  get currentRoom(): Room | null {
    return this.room;
  }

  foot(): Footprint {
    if (this.seat) return this.seat;
    const r = 0.12;
    return { u0: this.u - r, v0: this.v - r, u1: this.u + r, v1: this.v + r };
  }

  bias(): number {
    if (!this.seat) return 0;
    // Facing the room, they sit in front of the seat back; facing away, behind it.
    return this.facing === 'SE' || this.facing === 'SW' ? 0.5 : -0.5;
  }

  abstract setDepth(d: number): void;
  /** Called when the walker starts or stops moving. */
  protected abstract onMoveChange(moving: boolean, run: boolean): void;
  protected abstract applyFacing(): void;

  face(f: Facing): void {
    this.facing = f;
    this.applyFacing();
  }

  place(u: number, v: number, facing?: Facing): void {
    this.u = u;
    this.v = v;
    this.path = [];
    this.onArrive = null;
    if (facing) this.face(facing);
  }

  /** Walks there around the furniture. Returns false (and calls nothing) when unreachable. */
  walkTo(u: number, v: number, onArrive?: () => void, speed = WALK_SPEED): boolean {
    if (!this.room) return false;
    this.seat = null;
    const path = this.room.findPath(this.u, this.v, u, v);
    if (!path) return false;
    this.path = path;
    this.onArrive = onArrive ?? null;
    this.speed = speed;
    if (!path.length) {
      this.arrive();
      return true;
    }
    this.onMoveChange(true, speed >= RUN_SPEED);
    return true;
  }

  /** Straight there, off the walkable floor: the last step onto a seat behind a table, or off it. */
  glideTo(u: number, v: number, onArrive?: () => void, speed = WALK_SPEED): void {
    this.seat = null;
    this.path = [{ u, v }];
    this.onArrive = onArrive ?? null;
    this.speed = speed;
    this.onMoveChange(true, speed >= RUN_SPEED);
  }

  stop(): void {
    if (!this.path.length) return;
    this.path = [];
    this.onArrive = null;
    this.onMoveChange(false, false);
  }

  /** Snaps onto a seat (the seat furniture is solid, so walkers stop beside it first). */
  sitOn(u: number, v: number, facing: Facing, seat: Footprint): void {
    this.place(u, v, facing);
    this.seat = seat;
  }

  stand(): void {
    this.seat = null;
  }

  private arrive(): void {
    this.onMoveChange(false, false);
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  protected step(dt: number): void {
    const t = this.path[0];
    if (!t) return;
    const du = t.u - this.u;
    const dv = t.v - this.v;
    const dist = Math.hypot(du, dv);
    const stepLen = (this.speed * (this.room?.speedScale ?? 1) * dt) / 1000;
    if (dist > 1e-4) {
      const f = this.room ? this.room.facingFor(du, dv) : facingFor(du, dv);
      if (f !== this.facing) this.face(f);
    }
    if (dist <= stepLen) {
      this.u = t.u;
      this.v = t.v;
      this.path.shift();
      if (!this.path.length) this.arrive();
    } else {
      this.u += (du / dist) * stepLen;
      this.v += (dv / dist) * stepLen;
    }
  }
}
