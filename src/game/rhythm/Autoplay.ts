/**
 * The Autoplay bot: the inputs that hit every note of a chart exactly. `runVirtual` plays them
 * through a Judge with no clock at all (instant); the rhythm-test page feeds the same inputs
 * through the real AudioClock frame by frame, which is the sync check.
 */
import type { ChartNote } from './Chart';
import { Judge, type Judgment } from './Judge';

export type BotInput = { t: number; kind: 'down' | 'up'; lane: number } | { t: number; kind: 'fade'; dir: 'L' | 'R' };

const TAP_MS = 40;
/** Scratching: a tap this often (well inside the 320 ms gap). */
const SCRATCH_EVERY = 120;

export function autoplayInputs(notes: ChartNote[]): BotInput[] {
  const out: BotInput[] = [];
  for (const n of notes) {
    switch (n.type) {
      case 'tap':
        out.push({ t: n.t, kind: 'down', lane: n.lane }, { t: n.t + TAP_MS, kind: 'up', lane: n.lane });
        break;
      case 'double':
        out.push({ t: n.t, kind: 'down', lane: n.lane }, { t: n.t, kind: 'down', lane: n.lane2! });
        out.push({ t: n.t + TAP_MS, kind: 'up', lane: n.lane }, { t: n.t + TAP_MS, kind: 'up', lane: n.lane2! });
        break;
      case 'hold':
        out.push({ t: n.t, kind: 'down', lane: n.lane }, { t: n.t + n.len!, kind: 'up', lane: n.lane });
        break;
      case 'slide': {
        const end = n.t + n.len!;
        out.push({ t: n.t, kind: 'down', lane: n.lane }, { t: end, kind: 'down', lane: n.lane2! });
        out.push({ t: end + 1, kind: 'up', lane: n.lane }, { t: end + TAP_MS, kind: 'up', lane: n.lane2! });
        break;
      }
      case 'scratch': {
        const end = n.t + n.len!;
        out.push({ t: n.t, kind: 'down', lane: n.lane });
        for (let t = n.t + SCRATCH_EVERY; t < end; t += SCRATCH_EVERY) out.push({ t: t - 20, kind: 'up', lane: n.lane }, { t, kind: 'down', lane: n.lane });
        out.push({ t: end, kind: 'up', lane: n.lane });
        break;
      }
      case 'fade':
        out.push({ t: n.t, kind: 'fade', dir: n.dir! });
        break;
    }
  }
  // Ups before downs at the same moment (a lane released and pressed again).
  return out.sort((a, b) => a.t - b.t || (a.kind === 'up' ? -1 : b.kind === 'up' ? 1 : 0));
}

/** Applies one bot input to a judge at song time `t` (its own, or the clock's in real time). */
export function applyInput(judge: Judge, input: BotInput, t: number): Judgment[] {
  if (input.kind === 'fade') return judge.fade(input.dir, t);
  return input.kind === 'down' ? judge.press(input.lane, t) : judge.release(input.lane, t);
}

/** Plays a chart with the bot and no clock: every judgment, in order. */
export function runVirtual(notes: ChartNote[], windowScale = 1): Judgment[] {
  const judge = new Judge(notes, windowScale);
  const out: Judgment[] = [];
  for (const input of autoplayInputs(notes)) {
    out.push(...judge.update(input.t), ...applyInput(judge, input, input.t));
  }
  const end = notes.reduce((m, n) => Math.max(m, n.t + (n.len ?? 0)), 0) + 1000;
  out.push(...judge.update(end));
  return out;
}
