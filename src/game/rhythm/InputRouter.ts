/**
 * Turns keys and touches into lane presses, crossfades, star power and pause — passing each
 * input event's own timestamp on, and handling it synchronously (no frame in between).
 *   Keys: the lane keys (remappable; D F J K by default; F J on 2 lanes, F J K on 3), ← / →
 *   crossfades (DJ), Space star power, Esc pause. Auto-repeat is ignored.
 *   Touch: one tap zone per lane. DJ: a quick sideways swipe is a crossfade, rubbing up and
 *   down a lane scratches. Bass: moving across zones slides to the next string. Two fingers
 *   at once: star power. Left-handed flips the lanes.
 */
export interface RouterOptions {
  lanes: number;
  /** The four lane keys (event.code), left to right. */
  keys: string[];
  starKey: string;
  leftHanded: boolean;
  mode: 'dj' | 'bass';
  surface: HTMLElement | null;
}

export interface RouterHandlers {
  lane: (lane: number, down: boolean, ts: number) => void;
  fade: (dir: 'L' | 'R', ts: number) => void;
  star: (ts: number) => void;
  pause: () => void;
}

/** The keys used for a lane count. */
export function keysForLanes(keys: string[], lanes: number): string[] {
  return lanes >= 4 ? keys.slice(0, 4) : lanes === 3 ? keys.slice(1, 4) : keys.slice(1, 3);
}

const SWIPE_PX = 70;
const SWIPE_MS = 320;
const RUB_PX = 16;
const TWO_FINGER_MS = 150;

interface Touch {
  lane: number;
  x0: number;
  y0: number;
  t0: number;
  lastY: number;
  dirY: number;
  swiped: boolean;
}

export class InputRouter {
  private readonly offs: (() => void)[] = [];
  private readonly downKeys = new Set<string>();
  private readonly touches = new Map<number, Touch>();
  private lastTouchDown = -Infinity;
  enabled = true;

  constructor(
    private readonly opts: RouterOptions,
    private readonly h: RouterHandlers,
  ) {}

  /** Logical lane of a physical position (left-handed flips them). */
  private logical(p: number): number {
    return this.opts.leftHanded ? this.opts.lanes - 1 - p : p;
  }

  attach(): this {
    const keys = keysForLanes(this.opts.keys, this.opts.lanes);
    const on = (t: EventTarget, type: string, fn: (e: Event) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, o);
      this.offs.push(() => t.removeEventListener(type, fn, o));
    };
    on(
      window,
      'keydown',
      (ev) => {
        const e = ev as KeyboardEvent;
        if (e.code === 'Escape') {
          e.preventDefault();
          return this.h.pause();
        }
        if (!this.enabled) return;
        const p = keys.indexOf(e.code);
        const isFade = this.opts.mode === 'dj' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight');
        if (p < 0 && e.code !== this.opts.starKey && !isFade) return;
        e.preventDefault();
        if (e.repeat || this.downKeys.has(e.code)) return;
        this.downKeys.add(e.code);
        if (p >= 0) this.h.lane(this.logical(p), true, e.timeStamp);
        else if (isFade) this.h.fade(e.code === 'ArrowLeft' ? 'L' : 'R', e.timeStamp);
        else this.h.star(e.timeStamp);
      },
      { capture: true },
    );
    on(
      window,
      'keyup',
      (ev) => {
        const e = ev as KeyboardEvent;
        if (!this.downKeys.delete(e.code)) return;
        const p = keys.indexOf(e.code);
        if (p >= 0) this.h.lane(this.logical(p), false, e.timeStamp);
      },
      { capture: true },
    );
    // Losing the window lets every key go (no lane stays stuck down).
    on(window, 'blur', () => this.releaseAll());
    const el = this.opts.surface;
    if (el) {
      const zone = (x: number) => {
        const r = el.getBoundingClientRect();
        return Math.min(this.opts.lanes - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * this.opts.lanes)));
      };
      on(el, 'pointerdown', (ev) => {
        const e = ev as PointerEvent;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        if (!this.enabled) return;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // synthetic pointer
        }
        // Two fingers at once: star power.
        if (e.pointerType === 'touch' && e.timeStamp - this.lastTouchDown < TWO_FINGER_MS && this.touches.size === 1) this.h.star(e.timeStamp);
        if (e.pointerType === 'touch') this.lastTouchDown = e.timeStamp;
        const lane = this.logical(zone(e.clientX));
        this.touches.set(e.pointerId, { lane, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, lastY: e.clientY, dirY: 0, swiped: false });
        this.h.lane(lane, true, e.timeStamp);
      });
      on(el, 'pointermove', (ev) => {
        const e = ev as PointerEvent;
        const t = this.touches.get(e.pointerId);
        if (!t || !this.enabled) return;
        const dx = e.clientX - t.x0;
        if (this.opts.mode === 'dj') {
          if (!t.swiped && Math.abs(dx) > SWIPE_PX && e.timeStamp - t.t0 < SWIPE_MS) {
            t.swiped = true;
            this.h.fade(dx < 0 ? 'L' : 'R', e.timeStamp);
          }
          // Rubbing up and down: each change of direction is another scratch tap.
          const dy = e.clientY - t.lastY;
          if (Math.abs(dy) > RUB_PX) {
            const dir = Math.sign(dy);
            if (dir !== t.dirY && t.dirY !== 0) {
              this.h.lane(t.lane, false, e.timeStamp);
              this.h.lane(t.lane, true, e.timeStamp);
            }
            t.dirY = dir;
            t.lastY = e.clientY;
          }
        } else {
          const lane = this.logical(zone(e.clientX));
          if (lane !== t.lane) {
            // Sliding to the next string: the new one goes down before the old one comes up.
            this.h.lane(lane, true, e.timeStamp);
            this.h.lane(t.lane, false, e.timeStamp);
            t.lane = lane;
          }
        }
      });
      const up = (ev: Event) => {
        const e = ev as PointerEvent;
        const t = this.touches.get(e.pointerId);
        if (!t) return;
        this.touches.delete(e.pointerId);
        this.h.lane(t.lane, false, e.timeStamp);
      };
      on(el, 'pointerup', up);
      on(el, 'pointercancel', up);
    }
    return this;
  }

  /** Lets go of everything held (pause, blur). */
  releaseAll(): void {
    const now = performance.now();
    const keys = keysForLanes(this.opts.keys, this.opts.lanes);
    for (const code of this.downKeys) {
      const p = keys.indexOf(code);
      if (p >= 0) this.h.lane(this.logical(p), false, now);
    }
    this.downKeys.clear();
    for (const t of this.touches.values()) this.h.lane(t.lane, false, now);
    this.touches.clear();
  }

  detach(): void {
    this.offs.splice(0).forEach((off) => off());
  }
}
