/**
 * Sound effects, synthesised in code as tiny WAVs and played through Howler.
 * Real recordings can replace them later (public/assets/audio) under the same names.
 * Effects play in Full Gala; Calm keeps only a soft page flip; Text-only is silent.
 */
import { Howl } from 'howler';
import { bus } from '../bus/events';
import { useStore } from '../store';

type SfxName = 'flip' | 'pop' | 'pluck' | 'scribble' | 'chime' | 'coin';

const RATE = 22050;

function toWavDataUri(samples: Float32Array): string {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function synth(seconds: number, fn: (t: number, i: number) => number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / RATE, i);
  return out;
}

/** One-pole low-pass over white noise: soft, papery. */
function noiseSource(cut: number): () => number {
  let y = 0;
  return () => {
    y += cut * (Math.random() * 2 - 1 - y);
    return y;
  };
}

const RECIPES: Record<SfxName, () => Float32Array> = {
  flip: () => {
    const n = noiseSource(0.35);
    return synth(0.22, (t) => {
      const env = Math.sin(Math.min(1, t / 0.22) * Math.PI) * (0.6 + 0.4 * Math.sin(t * 60));
      return n() * env * 0.9;
    });
  },
  pop: () => {
    const n = noiseSource(0.9);
    const fizz = noiseSource(0.6);
    let phase = 0;
    return synth(0.7, (t) => {
      const click = t < 0.012 ? n() * (1 - t / 0.012) : 0;
      const f = 620 - 420 * Math.min(1, t / 0.12);
      phase += (2 * Math.PI * f) / RATE;
      const thoop = t < 0.14 ? Math.sin(phase) * (1 - t / 0.14) * 0.6 : 0;
      const bubbles = t > 0.05 ? fizz() * 0.25 * Math.exp(-(t - 0.05) * 4) * (Math.random() > 0.7 ? 1 : 0.2) : 0;
      return click + thoop + bubbles;
    });
  },
  pluck: () => {
    // Karplus–Strong string at A4.
    const period = Math.round(RATE / 440);
    const ring = Float32Array.from({ length: period }, () => Math.random() * 2 - 1);
    let k = 0;
    return synth(0.45, () => {
      const a = ring[k % period];
      const b = ring[(k + 1) % period];
      ring[k % period] = (a + b) * 0.497;
      k++;
      return a * 0.5;
    });
  },
  scribble: () => {
    const n = noiseSource(0.5);
    return synth(0.5, (t) => n() * (Math.sin(t * 2 * Math.PI * 11) > 0.2 ? 0.5 : 0.08) * (1 - t / 0.5));
  },
  chime: () =>
    synth(0.8, (t) => {
      const e = Math.exp(-t * 5);
      return (Math.sin(2 * Math.PI * 1318.5 * t) * e + Math.sin(2 * Math.PI * 1975.5 * Math.max(0, t - 0.09)) * (t > 0.09 ? Math.exp(-(t - 0.09) * 5) : 0)) * 0.3;
    }),
  coin: () =>
    synth(0.16, (t) => {
      const f = t < 0.06 ? 987.8 : 1318.5;
      return (Math.sin(2 * Math.PI * f * t) > 0 ? 0.18 : -0.18) * (1 - t / 0.16);
    }),
};

const cache = new Map<SfxName, Howl>();

function get(name: SfxName): Howl {
  let h = cache.get(name);
  if (!h) {
    h = new Howl({ src: [toWavDataUri(RECIPES[name]())], format: ['wav'] });
    cache.set(name, h);
  }
  return h;
}

export function play(name: SfxName, volume = 1): void {
  const { sound, readingMode, sfxVolume } = useStore.getState().settings;
  if (!sound || readingMode === 'text') return;
  volume *= sfxVolume;
  if (readingMode === 'calm') {
    if (name !== 'flip') return;
    volume *= 0.4;
  }
  const h = get(name);
  h.volume(volume);
  h.play();
}

/** Effects follow the same bus events Roxy does. */
export function initSfx(): void {
  bus.on('page:next', () => play('flip', 0.7));
  bus.on('page:prev', () => play('flip', 0.6));
  bus.on('page:jump', () => play('flip', 0.5));
  bus.on('chapter:end', () => play('pop', 0.9));
  bus.on('bookmark:add', () => play('pluck', 0.6));
  bus.on('highlight:add', () => play('scribble', 0.5));
  bus.on('outfit:change', () => play('chime', 0.5));
  bus.on('page:counted', () => play('coin', 0.25));
}
