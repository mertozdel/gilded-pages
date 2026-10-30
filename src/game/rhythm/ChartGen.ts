/**
 * Builds every difficulty of a chart from a song's pattern data — the same `songEvents` the
 * Synth plays — so audio and chart are always in sync.
 *   bass (Jonas): bass notes → the string they're played on (E A D G); long notes are holds,
 *     doubles from Hard, slides on Expert.
 *   dj (Joel): kicks → the decks, filter sweeps → FX holds, claps → FX taps (Hard+),
 *     scratches and crossfades (Expert).
 */
import { DIFFICULTIES, LANES, noteEnd, noteLanes, type Chart, type ChartNote, type Difficulty } from './Chart';
import { beatMs, durationMs, leadInMs, songEvents, type SongDef, type SongEvent } from './Song';

export type ChartMode = 'bass' | 'dj';

/** Open strings of a 4-string bass, as MIDI notes: E1 A1 D2 G2. */
const STRINGS = [28, 33, 38, 43];

/** The string a note is played on: the highest one whose open note is at or under it. */
export function stringFor(pitch: number): number {
  let s = 0;
  STRINGS.forEach((open, i) => pitch >= open && (s = i));
  return s;
}

/** Four strings folded onto fewer lanes. */
function fold(s: number, lanes: number): number {
  if (lanes === 4) return s;
  return lanes === 3 ? [0, 0, 1, 2][s] : [0, 0, 1, 1][s];
}

/** Drops notes that would overlap one already in a lane (the earlier note wins). */
export function dedupe(notes: ChartNote[], lanes: number): ChartNote[] {
  const busy = new Array<number>(lanes).fill(-Infinity);
  const last = new Array<number>(lanes).fill(-Infinity);
  const out: ChartNote[] = [];
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    const ls = noteLanes(n);
    if (ls.some((l) => n.t < busy[l] - 0.5 || n.t - last[l] < 1)) continue;
    ls.forEach((l) => {
      busy[l] = Math.max(busy[l], noteEnd(n));
      last[l] = n.t;
    });
    out.push(n);
  }
  return out;
}

function bassNotes(song: SongDef, events: SongEvent[], d: Difficulty): ChartNote[] {
  const lanes = LANES[d];
  const beat = beatMs(song);
  const bass = events.filter((e) => e.track === 'bass' && e.pitch?.length);
  const kept = bass.filter((e) => (d === 'easy' ? e.sub === 0 && e.beat === 0 : d === 'normal' ? e.sub === 0 : true));
  let notes: ChartNote[] = kept.map((e) => {
    const lane = fold(stringFor(e.pitch![0]), lanes);
    return e.dur >= beat * 0.99 ? { t: e.t, lane, type: 'hold', len: e.dur } : { t: e.t, lane, type: 'tap' };
  });
  if (d === 'hard' || d === 'expert') {
    // Accents on downbeats: two strings at once.
    const every = d === 'expert' ? 2 : 4;
    notes = notes.map((n, i) => {
      const e = kept[i];
      if (n.type !== 'tap' || e.sub !== 0 || e.beat !== 0 || e.bar % every !== 0) return n;
      return { ...n, type: 'double', lane2: n.lane < lanes - 1 ? n.lane + 1 : n.lane - 1 };
    });
  }
  if (d === 'expert') {
    // A long note straight into one on the next string: slide there.
    const out: ChartNote[] = [];
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const next = notes[i + 1];
      if (n.type === 'hold' && next && Math.abs(next.t - noteEnd(n)) < 1 && Math.abs(next.lane - n.lane) === 1 && next.type === 'tap') {
        out.push({ t: n.t, lane: n.lane, type: 'slide', len: n.len, lane2: next.lane });
        i++;
      } else out.push(n);
    }
    notes = out;
  }
  return dedupe(notes, lanes);
}

function djNotes(song: SongDef, events: SongEvent[], d: Difficulty): ChartNote[] {
  const lanes = LANES[d];
  const right = lanes - 1;
  const notes: ChartNote[] = [];
  for (const e of events) {
    if (e.track === 'kick') {
      if (d === 'easy' && e.beat % 2 !== 0) continue;
      if (e.sub !== 0) continue;
      notes.push({ t: e.t, lane: e.beat % 2 === 0 ? 0 : right, type: 'tap' });
    } else if (e.track === 'fx' && e.token === 'w' && d !== 'easy') {
      const lane = lanes === 3 ? 1 : e.bar % 2 === 0 ? 1 : 2;
      notes.push({ t: e.t, lane, type: 'hold', len: e.dur });
    } else if (e.track === 'clap' && (d === 'hard' || d === 'expert')) {
      notes.push({ t: e.t, lane: 2, type: 'tap' });
    } else if (e.track === 'fx' && e.token === 's' && d === 'expert') {
      notes.push({ t: e.t, lane: e.beat % 2 === 0 ? right : 0, type: 'scratch', len: Math.max(e.dur, beatMs(song) / 2) });
    } else if (e.track === 'fx' && (e.token === '<' || e.token === '>') && d === 'expert') {
      notes.push({ t: e.t, lane: 0, type: 'fade', dir: e.token === '<' ? 'L' : 'R' });
    }
  }
  // Scratches win over the kicks they cover.
  const scratches = notes.filter((n) => n.type === 'scratch');
  const clear = notes.filter((n) => n.type !== 'tap' || !scratches.some((s) => s.lane === n.lane && n.t >= s.t - 0.5 && n.t < noteEnd(s) - 0.5));
  return dedupe(clear, lanes);
}

/** The full chart (all four difficulties) of a Synth song. */
export function generateChart(song: SongDef, mode: ChartMode): Chart {
  const events = songEvents(song);
  const difficulties = Object.fromEntries(DIFFICULTIES.map((d) => [d, mode === 'bass' ? bassNotes(song, events, d) : djNotes(song, events, d)])) as Record<Difficulty, ChartNote[]>;
  return {
    id: song.id,
    title: song.title,
    composer: song.composer,
    bpm: song.bpm,
    offsetMs: leadInMs(song),
    durationMs: durationMs(song),
    timeSignature: `${song.beatsPerBar}/4`,
    synth: song.id,
    difficulties,
  };
}

/** Which song events a chart's notes come from (for the sync test). */
export function sourceTracks(mode: ChartMode): string[] {
  return mode === 'bass' ? ['bass'] : ['kick', 'fx', 'clap'];
}
