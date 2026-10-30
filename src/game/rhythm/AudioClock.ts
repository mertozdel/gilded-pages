/**
 * Song time from the Web Audio clock — the only clock the rhythm games judge by.
 *   songTimeMs = (ctx.currentTime − startTime) × 1000 − outputLatency − userAudioOffset
 * (× the playback rate in practice). Input events carry performance.now() timestamps; they
 * become song time through ctx.getOutputTimestamp(), which pairs the audio being heard with
 * the performance clock. Frame deltas never enter into it.
 */
let shared: AudioContext | null = null;

/** The one AudioContext of the app. */
export function audioContext(): AudioContext {
  shared ??= new AudioContext({ latencyHint: 'interactive' });
  return shared;
}

export class AudioClock {
  readonly ctx: AudioContext;
  /** Context time at which song time `fromMs` plays. */
  private startCtx = 0;
  private fromMs = 0;
  rate = 1;
  /** + = the player hears (and hits) late; from the calibration. */
  userOffsetMs = 0;

  constructor(ctx: AudioContext = audioContext()) {
    this.ctx = ctx;
  }

  /** Song time `fromMs` will play `delaySec` from now; returns that context time. */
  start(fromMs: number, rate = 1, delaySec = 0.15): number {
    this.fromMs = fromMs;
    this.rate = rate;
    this.startCtx = this.ctx.currentTime + delaySec;
    return this.startCtx;
  }

  get outputLatencyMs(): number {
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return ((c.outputLatency || 0) + (c.baseLatency || 0)) * 1000;
  }

  /** The song time being heard now (drawing uses this). */
  songTimeMs(): number {
    return this.fromMs + ((this.ctx.currentTime - this.startCtx) * 1000 - this.outputLatencyMs - this.userOffsetMs) * this.rate;
  }

  /** Song time of an input event (`event.timeStamp`, the performance.now() clock). */
  eventToSongMs(ts: number): number {
    const o = this.ctx.getOutputTimestamp?.();
    let heard: number;
    if (o && o.contextTime! > 0 && o.performanceTime! > 0) heard = o.contextTime! + (ts - o.performanceTime!) / 1000;
    else heard = this.ctx.currentTime - this.outputLatencyMs / 1000 + (ts - performance.now()) / 1000;
    return this.fromMs + ((heard - this.startCtx) * 1000 - this.userOffsetMs) * this.rate;
  }

  /** The context time at which song time `ms` is scheduled. */
  ctxTimeFor(ms: number): number {
    return this.startCtx + (ms - this.fromMs) / 1000 / this.rate;
  }
}
