/**
 * Judges inputs against a chart, in song time (ms) — never in frames. Pure: give it press /
 * release / fade inputs with their song times and call `update` with the clock; it returns
 * judgments. Windows: Perfect ±45 ms, Great ±90, Good ±135, else Miss (× 1.3 on Easy).
 *   tap: one hit.          hold: the hit, then held until 100 ms before its end.
 *   double: both lanes.    slide: hold, then reach the next lane at its end.
 *   scratch: the hit, then keep tapping the lane (at most 320 ms apart) until it ends.
 *   fade: the crossfade in its direction.
 * A press with no note in reach is ignored (no penalty).
 */
import type { ChartNote } from './Chart';

export type Grade = 'perfect' | 'great' | 'good' | 'miss';
export const WINDOWS = { perfect: 45, great: 90, good: 135 } as const;
export const EASY_WINDOW_SCALE = 1.3;
/** A hold may be let go this long before its end. */
export const HOLD_SLACK_MS = 100;
/** A scratch fails if the taps stop for longer than this. */
export const SCRATCH_GAP_MS = 320;

export interface Judgment {
  note: number;
  lane: number;
  grade: Grade;
  /** Signed, early < 0. */
  deltaMs: number;
  part: 'head' | 'second' | 'tail';
}

type Part = 'pending' | 'hit' | 'missed';
interface NoteState {
  head: Part;
  /** double: the second lane; slide: reaching lane2. */
  second: Part;
  tail: 'none' | 'active' | 'done' | 'failed';
  lastTap: number;
}

/** How many judgments a chart produces (for accuracy and the full combo). */
export function judgmentCount(notes: ChartNote[]): number {
  return notes.reduce((n, x) => n + (x.type === 'tap' || x.type === 'fade' ? 1 : 2), 0);
}

export class Judge {
  private readonly st: NoteState[];
  private readonly held = new Set<number>();
  /** First note not yet fully settled (notes are in time order). */
  private from = 0;
  readonly win: { perfect: number; great: number; good: number };

  constructor(
    readonly notes: ChartNote[],
    /** 1.3 on Easy; also × the playback rate in practice (windows are in song ms). */
    windowScale = 1,
  ) {
    this.st = notes.map(() => ({ head: 'pending', second: 'pending', tail: 'none', lastTap: 0 }));
    this.win = { perfect: WINDOWS.perfect * windowScale, great: WINDOWS.great * windowScale, good: WINDOWS.good * windowScale };
  }

  grade(delta: number): Grade | null {
    const a = Math.abs(delta);
    if (a <= this.win.perfect) return 'perfect';
    if (a <= this.win.great) return 'great';
    if (a <= this.win.good) return 'good';
    return null;
  }

  isHeld(lane: number): boolean {
    return this.held.has(lane);
  }

  /** A lane went down at song time `t`. */
  press(lane: number, t: number): Judgment[] {
    this.held.add(lane);
    // Keeping a scratch going: a tap on its lane while it runs.
    for (let i = this.from; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t + this.win.good) break;
      const s = this.st[i];
      if (n.type === 'scratch' && s.tail === 'active' && n.lane === lane) {
        s.lastTap = t;
        return [];
      }
      // Reaching a slide's next lane.
      if (n.type === 'slide' && s.tail === 'active' && n.lane2 === lane && s.second === 'pending') {
        const d = t - (n.t + n.len!);
        const g = this.grade(d);
        if (g || d > 0) {
          s.second = 'hit';
          s.tail = 'done';
          return [{ note: i, lane, grade: g ?? 'good', deltaMs: d, part: 'second' }];
        }
      }
    }
    // The earliest note in reach on this lane (a double's second lane counts).
    let best = -1;
    let part: 'head' | 'second' = 'head';
    for (let i = this.from; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t + this.win.good) break;
      if (Math.abs(t - n.t) > this.win.good || n.type === 'fade') continue;
      const s = this.st[i];
      if (n.lane === lane && s.head === 'pending') {
        best = i;
        part = 'head';
        break;
      }
      if (n.type === 'double' && n.lane2 === lane && s.second === 'pending') {
        best = i;
        part = 'second';
        break;
      }
    }
    if (best < 0) return [];
    const n = this.notes[best];
    const s = this.st[best];
    const d = t - n.t;
    const g = this.grade(d)!;
    if (part === 'second') s.second = 'hit';
    else {
      s.head = 'hit';
      if (n.type === 'hold' || n.type === 'scratch' || n.type === 'slide') {
        s.tail = 'active';
        s.lastTap = t;
      }
    }
    return [{ note: best, lane, grade: g, deltaMs: d, part }];
  }

  /** A lane came up at song time `t`. */
  release(lane: number, t: number): Judgment[] {
    this.held.delete(lane);
    const out: Judgment[] = [];
    for (let i = this.from; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t) break;
      const s = this.st[i];
      if (s.tail !== 'active' || n.lane !== lane) continue;
      const end = n.t + n.len!;
      if (n.type === 'hold' && t < end - HOLD_SLACK_MS) {
        s.tail = 'failed';
        out.push({ note: i, lane, grade: 'miss', deltaMs: t - end, part: 'tail' });
      } else if (n.type === 'hold') {
        s.tail = 'done';
        out.push({ note: i, lane, grade: 'perfect', deltaMs: 0, part: 'tail' });
      } else if (n.type === 'slide' && s.second === 'pending' && t < end - this.win.good && !this.held.has(n.lane2!)) {
        // Let go of a slide before moving to the next lane.
        s.tail = 'failed';
        s.second = 'missed';
        out.push({ note: i, lane: n.lane2!, grade: 'miss', deltaMs: t - end, part: 'second' });
      }
    }
    return out;
  }

  /** A crossfade (← or →) at song time `t`. */
  fade(dir: 'L' | 'R', t: number): Judgment[] {
    for (let i = this.from; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t + this.win.good) break;
      if (n.type !== 'fade' || n.dir !== dir || this.st[i].head !== 'pending') continue;
      const d = t - n.t;
      const g = this.grade(d);
      if (!g) continue;
      this.st[i].head = 'hit';
      return [{ note: i, lane: -1, grade: g, deltaMs: d, part: 'head' }];
    }
    return [];
  }

  /** Advances to song time `t`: misses for notes gone by, holds and scratches that finished or broke. */
  update(t: number): Judgment[] {
    const out: Judgment[] = [];
    for (let i = this.from; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t + this.win.good) break;
      const s = this.st[i];
      const late = t > n.t + this.win.good;
      if (late && s.head === 'pending') {
        s.head = 'missed';
        out.push({ note: i, lane: n.lane, grade: 'miss', deltaMs: t - n.t, part: 'head' });
        // A missed head loses the rest of the note.
        if (n.type !== 'tap' && n.type !== 'fade' && n.type !== 'double') {
          s.tail = 'failed';
          out.push({ note: i, lane: n.lane, grade: 'miss', deltaMs: 0, part: 'tail' });
        }
      }
      if (late && n.type === 'double' && s.second === 'pending') {
        s.second = 'missed';
        out.push({ note: i, lane: n.lane2!, grade: 'miss', deltaMs: t - n.t, part: 'second' });
      }
      if (s.tail === 'active') {
        const end = n.t + n.len!;
        if (n.type === 'hold' && t >= end - HOLD_SLACK_MS && this.held.has(n.lane)) {
          s.tail = 'done';
          out.push({ note: i, lane: n.lane, grade: 'perfect', deltaMs: 0, part: 'tail' });
        } else if (n.type === 'scratch') {
          if (t >= end) {
            s.tail = 'done';
            out.push({ note: i, lane: n.lane, grade: 'perfect', deltaMs: 0, part: 'tail' });
          } else if (t - s.lastTap > SCRATCH_GAP_MS) {
            s.tail = 'failed';
            out.push({ note: i, lane: n.lane, grade: 'miss', deltaMs: t - s.lastTap, part: 'tail' });
          }
        } else if (n.type === 'slide' && t > end + this.win.good) {
          s.tail = 'failed';
          s.second = 'missed';
          out.push({ note: i, lane: n.lane2!, grade: 'miss', deltaMs: t - end, part: 'second' });
        }
      }
    }
    // Skip past notes that are settled for good.
    while (this.from < this.notes.length) {
      const s = this.st[this.from];
      const n = this.notes[this.from];
      const settled = s.head !== 'pending' && (n.type !== 'double' || s.second !== 'pending') && s.tail !== 'active';
      if (!settled || n.t + (n.len ?? 0) > t + 1000) break;
      this.from++;
    }
    return out;
  }

  /** Where each note is, for drawing. */
  state(i: number): Readonly<NoteState> {
    return this.st[i];
  }
}
