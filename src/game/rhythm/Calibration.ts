/**
 * Calibration: eight metronome clicks; the player taps along. The median of (tap − click), in
 * song time with no offset applied, is the audio offset to subtract from then on.
 */
import { AudioClock, audioContext } from './AudioClock';
import { Instruments } from './Synth';

export const CALIBRATION_CLICKS = 8;
const BPM = 100;
const LEAD_MS = 1200;

/** The median, ignoring the worst outliers (a missed click, a double tap). */
export function calibrationOffset(taps: number[], clicks: number[]): number | null {
  const deltas = taps
    .map((t) => {
      const nearest = clicks.reduce((b, c) => (Math.abs(c - t) < Math.abs(b - t) ? c : b), Infinity);
      return t - nearest;
    })
    .filter((d) => Math.abs(d) < 300)
    .sort((a, b) => a - b);
  if (deltas.length < 4) return null;
  const m = Math.floor(deltas.length / 2);
  return Math.round(deltas.length % 2 ? deltas[m] : (deltas[m - 1] + deltas[m]) / 2);
}

export class Calibration {
  readonly clock = new AudioClock();
  readonly clicks: number[] = [];
  readonly taps: number[] = [];
  private readonly out: GainNode;

  constructor(volume = 0.8) {
    const ctx = audioContext();
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    this.out.connect(ctx.destination);
  }

  /** Schedules the clicks; returns when the last one is due (ms from now). */
  async start(): Promise<number> {
    await this.clock.ctx.resume();
    this.clock.start(0, 1, 0.1);
    const inst = new Instruments(this.clock.ctx, this.out);
    const beat = 60_000 / BPM;
    for (let i = 0; i < CALIBRATION_CLICKS; i++) {
      const t = LEAD_MS + i * beat;
      this.clicks.push(t);
      inst.click(this.clock.ctxTimeFor(t), i % 4 === 0);
    }
    return LEAD_MS + CALIBRATION_CLICKS * beat + 400;
  }

  /** The song time of a click as heard right now (for drawing the pulse). */
  now(): number {
    return this.clock.songTimeMs();
  }

  tap(eventTs: number): void {
    this.taps.push(this.clock.eventToSongMs(eventTs));
  }

  result(): number | null {
    return calibrationOffset(this.taps, this.clicks);
  }

  dispose(): void {
    window.setTimeout(() => this.out.disconnect(), 300);
  }
}
