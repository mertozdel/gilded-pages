/**
 * A small Web Audio sequencer for placeholder songs (no audio files): it plays a SongDef's
 * `songEvents` — the same list ChartGen charts — scheduled ahead on the AudioContext clock.
 * Drums, a tuba or synth bass, brass "pah" chords, plucks and a lead voice (accordion,
 * clarinet, an erhu-like bowed voice or a dizi-like flute), plus risers, crashes, sweeps and
 * scratches for the DJ sets. Practice at 75% plays everything slower at the same pitch.
 */
import type { AudioClock } from './AudioClock';
import { beatMs, songEvents, type LeadVoice, type SongDef, type SongEvent } from './Song';

const LOOKAHEAD_S = 0.25;
const TICK_MS = 25;
const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** Plays instrument hits into a destination at context times. */
export class Instruments {
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {}

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.out);
    return g;
  }

  private noiseSrc(t: number, dur: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = noise(this.ctx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
    return s;
  }

  kick(t: number, v = 1): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(this.env(t, 0.9 * v, 0.003, 0.35));
    o.start(t);
    o.stop(t + 0.4);
  }

  snare(t: number, v = 1): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    this.noiseSrc(t, 0.2).connect(f);
    f.connect(this.env(t, 0.5 * v, 0.002, 0.16));
    const o = this.ctx.createOscillator();
    o.frequency.value = 190;
    o.connect(this.env(t, 0.25 * v, 0.002, 0.08));
    o.start(t);
    o.stop(t + 0.12);
  }

  clap(t: number, v = 1): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 1.4;
    for (const dt of [0, 0.012, 0.024]) {
      const s = this.noiseSrc(t + dt, 0.15);
      s.connect(f);
    }
    f.connect(this.env(t, 0.55 * v, 0.002, 0.14));
  }

  hat(t: number, v = 1): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    this.noiseSrc(t, 0.06).connect(f);
    f.connect(this.env(t, 0.22 * v, 0.001, 0.045));
  }

  crash(t: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4000;
    this.noiseSrc(t, 1.6).connect(f);
    f.connect(this.env(t, 0.35, 0.003, 1.5));
  }

  /** A tuba "oom" (round, soft attack) or a filtered synth bass. */
  bass(t: number, dur: number, pitch: number, kind: 'tuba' | 'synth'): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    const o = this.ctx.createOscillator();
    o.frequency.value = midiHz(pitch);
    if (kind === 'tuba') {
      o.type = 'triangle';
      f.frequency.value = 700;
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = midiHz(pitch);
      sub.connect(f);
      sub.start(t);
      sub.stop(t + dur + 0.2);
    } else {
      o.type = 'sawtooth';
      f.frequency.setValueAtTime(1600, t);
      f.frequency.exponentialRampToValueAtTime(260, t + Math.min(0.25, dur));
      f.Q.value = 6;
    }
    o.connect(f);
    f.connect(this.env(t, kind === 'tuba' ? 0.55 : 0.4, kind === 'tuba' ? 0.03 : 0.005, Math.max(0.12, dur * 0.9)));
    o.start(t);
    o.stop(t + dur + 0.2);
  }

  /** Brass offbeat chords. */
  pah(t: number, pitches: number[]): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2000;
    f.connect(this.env(t, 0.16, 0.01, 0.16));
    for (const p of pitches) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(p);
      o.connect(f);
      o.start(t);
      o.stop(t + 0.25);
    }
  }

  pluck(t: number, pitch: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = midiHz(pitch);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.18);
    o.connect(f);
    f.connect(this.env(t, 0.14, 0.003, 0.22));
    o.start(t);
    o.stop(t + 0.3);
  }

  /** The melody voice. */
  lead(t: number, dur: number, pitch: number, voice: LeadVoice): void {
    const hz = midiHz(pitch);
    const out = this.env(t, voice === 'dizi' ? 0.2 : 0.16, voice === 'erhu' ? 0.06 : 0.02, Math.max(0.1, dur));
    const f = this.ctx.createBiquadFilter();
    f.connect(out);
    const vib = this.ctx.createOscillator();
    const vibAmt = this.ctx.createGain();
    vib.frequency.value = voice === 'accordion' ? 6.5 : 5.5;
    vib.connect(vibAmt);
    vib.start(t);
    vib.stop(t + dur + 0.2);
    const voices: [OscillatorType, number][] =
      voice === 'accordion' ? [['sawtooth', -6], ['square', 6]] : voice === 'clarinet' ? [['square', 0]] : voice === 'erhu' ? [['sawtooth', 0]] : [['triangle', 0]];
    if (voice === 'accordion') {
      f.type = 'lowpass';
      f.frequency.value = 2600;
      vibAmt.gain.value = 0;
    } else if (voice === 'clarinet') {
      f.type = 'lowpass';
      f.frequency.value = 1800;
      vibAmt.gain.value = 4;
    } else if (voice === 'erhu') {
      f.type = 'bandpass';
      f.frequency.value = Math.min(3000, hz * 2.2);
      f.Q.value = 0.9;
      vibAmt.gain.value = 18;
    } else {
      f.type = 'lowpass';
      f.frequency.value = 5000;
      vibAmt.gain.value = 10;
      // The flute's breath.
      const bf = this.ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.frequency.value = hz * 2;
      this.noiseSrc(t, dur).connect(bf);
      const bg = this.ctx.createGain();
      bg.gain.value = 0.05;
      bf.connect(bg);
      bg.connect(out);
    }
    for (const [type, cents] of voices) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      o.detune.value = cents;
      vibAmt.connect(o.detune);
      if (voice === 'erhu') {
        // A bowed note slides up into pitch.
        o.frequency.setValueAtTime(hz * 0.97, t);
        o.frequency.exponentialRampToValueAtTime(hz, t + 0.06);
      }
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.2);
    }
  }

  riser(t: number, dur: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    this.noiseSrc(t, dur).connect(f);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + dur);
    g.gain.setValueAtTime(0.0001, t + dur + 0.01);
    f.connect(g);
    g.connect(this.out);
  }

  /** A filter sweep (the FX lane's hold). */
  sweep(t: number, dur: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(5000, t + dur);
    this.noiseSrc(t, dur).connect(f);
    f.connect(this.env(t, 0.12, 0.02, dur));
  }

  /** A record scratch: noise through a wobbling band. */
  scratch(t: number, dur: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    const steps = Math.max(2, Math.round(dur / 0.06));
    for (let i = 0; i <= steps; i++) f.frequency.setValueAtTime(i % 2 ? 2600 : 700, t + (i * dur) / steps);
    this.noiseSrc(t, dur).connect(f);
    f.connect(this.env(t, 0.35, 0.005, dur));
  }

  /** The count-in and calibration metronome. */
  click(t: number, accent = false): void {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = accent ? 1760 : 1320;
    o.connect(this.env(t, 0.25, 0.001, 0.04));
    o.start(t);
    o.stop(t + 0.06);
  }

  /** Star power: an accordion flourish (Prost!) or a crash and a sweep (DROP). */
  flourish(t: number, kind: 'prost' | 'drop', root: number): void {
    if (kind === 'drop') {
      this.crash(t);
      this.sweep(t, 0.8);
      this.kick(t, 1.2);
      return;
    }
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.lead(t + i * 0.055, 0.12, root + n, 'accordion'));
  }
}

/**
 * Plays a song on a clock: schedules its events a little ahead (a lookahead timer), from a
 * song time to another (practice loops a section), with the count-in clicked.
 */
export class SynthPlayer {
  readonly events: SongEvent[];
  readonly gain: GainNode;
  readonly inst: Instruments;
  private timer = 0;
  private idx = 0;
  private toMs = Infinity;

  constructor(
    private readonly clock: AudioClock,
    readonly song: SongDef,
    volume = 0.8,
  ) {
    this.events = songEvents(song);
    this.gain = clock.ctx.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(clock.ctx.destination);
    this.inst = new Instruments(clock.ctx, this.gain);
  }

  /** Starts scheduling from song time `fromMs` (the clock must already be started there). */
  play(fromMs: number, toMs = Infinity): void {
    this.stop();
    this.toMs = toMs;
    this.idx = this.events.findIndex((e) => e.t >= fromMs - 1);
    if (this.idx < 0) this.idx = this.events.length;
    // The count-in, when starting from the top.
    if (fromMs <= 0) for (let b = 0; b < this.song.leadInBeats; b++) this.inst.click(this.clock.ctxTimeFor(b * beatMs(this.song)), b === 0);
    const tick = () => {
      const horizon = this.clock.ctx.currentTime + LOOKAHEAD_S;
      while (this.idx < this.events.length) {
        const e = this.events[this.idx];
        if (e.t >= this.toMs) break;
        const at = this.clock.ctxTimeFor(e.t);
        if (at > horizon) break;
        if (at >= this.clock.ctx.currentTime - 0.02) this.playEvent(e, at, e.dur / 1000 / this.clock.rate);
        this.idx++;
      }
    };
    tick();
    this.timer = window.setInterval(tick, TICK_MS);
  }

  private playEvent(e: SongEvent, t: number, dur: number): void {
    const s = this.song;
    const p = e.pitch ?? [];
    switch (e.track) {
      case 'kick':
        return this.inst.kick(t);
      case 'snare':
        return this.inst.snare(t);
      case 'clap':
        return this.inst.clap(t);
      case 'hat':
        return this.inst.hat(t);
      case 'bass':
        return p.forEach((n) => this.inst.bass(t, dur, n, s.voices.bass));
      case 'pah':
        return this.inst.pah(t, p);
      case 'pluck':
        return p.forEach((n) => this.inst.pluck(t, n));
      case 'lead':
        return p.forEach((n) => this.inst.lead(t, dur, n, s.voices.lead));
      case 'fx':
        if (e.token === 'w') return this.inst.sweep(t, dur);
        if (e.token === 's') return this.inst.scratch(t, dur);
        if (e.token === 'r') return this.inst.riser(t, dur);
        if (e.token === 'c') return this.inst.crash(t);
        if (e.token === '<' || e.token === '>') return this.inst.sweep(t, 0.25);
    }
  }

  setVolume(v: number): void {
    this.gain.gain.setTargetAtTime(v, this.clock.ctx.currentTime, 0.05);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  dispose(): void {
    this.stop();
    // Notes already scheduled fade out with the gain.
    this.gain.gain.setTargetAtTime(0, this.clock.ctx.currentTime, 0.03);
    window.setTimeout(() => this.gain.disconnect(), 400);
  }
}

/** Plays an audio-file chart's track on the same clock. */
export class AudioTrackPlayer {
  private src: AudioBufferSourceNode | null = null;
  readonly gain: GainNode;

  constructor(
    private readonly clock: AudioClock,
    private readonly buffer: AudioBuffer,
    volume = 0.8,
  ) {
    this.gain = clock.ctx.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(clock.ctx.destination);
  }

  static async load(clock: AudioClock, url: string, volume?: number): Promise<AudioTrackPlayer> {
    const data = await (await fetch(url)).arrayBuffer();
    return new AudioTrackPlayer(clock, await clock.ctx.decodeAudioData(data), volume);
  }

  play(fromMs: number, toMs = Infinity): void {
    this.stop();
    const s = this.clock.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.playbackRate.value = this.clock.rate;
    s.connect(this.gain);
    const at = this.clock.ctxTimeFor(fromMs);
    s.start(Math.max(at, this.clock.ctx.currentTime), Math.max(0, fromMs / 1000));
    if (toMs < Infinity) s.stop(this.clock.ctxTimeFor(toMs));
    this.src = s;
  }

  setVolume(v: number): void {
    this.gain.gain.setTargetAtTime(v, this.clock.ctx.currentTime, 0.05);
  }

  stop(): void {
    try {
      this.src?.stop();
    } catch {
      // never started
    }
    this.src = null;
  }

  dispose(): void {
    this.stop();
    this.gain.disconnect();
  }
}
