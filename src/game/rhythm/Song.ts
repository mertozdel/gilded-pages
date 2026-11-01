/**
 * Placeholder songs as data: a tempo, a meter, sections, and per-pattern step tracks. The Synth
 * plays them and ChartGen charts them from the SAME expansion (`songEvents`), so the audio and
 * every difficulty's chart can never drift apart.
 *
 * A track is a string of whitespace-separated tokens, one per step (it loops if shorter than
 * its pattern): `.` rest, `-` holds the previous note one more step, `x` a drum hit, a number
 * (or comma-separated numbers, a chord) semitones from the track's root, and for `fx`: `w` a
 * filter sweep, `s` a scratch, `<` / `>` a crossfade, `r` a riser, `c` a crash.
 */
import type { CharacterId } from '../../content/characters';

export type TrackName = 'kick' | 'snare' | 'clap' | 'hat' | 'bass' | 'pah' | 'lead' | 'pluck' | 'fx';
/** synth: a bright J-pop lead · trumpet: the brass band's. */
export type LeadVoice = 'accordion' | 'clarinet' | 'erhu' | 'dizi' | 'synth' | 'trumpet';
export type SongStyle = 'polka' | 'waltz' | 'march' | 'edm' | 'jpop' | 'schlager';

export interface PatternDef {
  bars: number;
  tracks: Partial<Record<TrackName, string>>;
}

export interface SectionDef {
  name: string;
  bars: number;
  pattern: string;
  /** EDM: a build-up into a drop. */
  tag?: 'build' | 'drop' | 'break';
}

export interface SongDef {
  id: string;
  title: string;
  composer: string;
  /** Originals, or public-domain folk tunes. Never a copyrighted recording or song. */
  source: 'original' | 'public-domain';
  character: CharacterId;
  style: SongStyle;
  bpm: number;
  beatsPerBar: number;
  stepsPerBeat: number;
  /** MIDI note of the lead's root; bass is two octaves under it and the chords one. */
  key: number;
  voices: { lead: LeadVoice; bass: 'tuba' | 'synth' };
  /** Count-in clicks before the first bar. */
  leadInBeats: number;
  sections: SectionDef[];
  patterns: Record<string, PatternDef>;
}

export interface SongEvent {
  /** Song time, ms from the song's start (the count-in included). */
  t: number;
  dur: number;
  track: TrackName;
  /** MIDI notes (pitched tracks). */
  pitch?: number[];
  /** The raw token (fx: w s < > r c). */
  token: string;
  bar: number;
  beat: number;
  /** Step within its beat. */
  sub: number;
  section: number;
}

export const stepMs = (s: SongDef) => 60_000 / s.bpm / s.stepsPerBeat;
export const beatMs = (s: SongDef) => 60_000 / s.bpm;
export const leadInMs = (s: SongDef) => s.leadInBeats * beatMs(s);
export const totalBars = (s: SongDef) => s.sections.reduce((n, x) => n + x.bars, 0);
/** The whole song, the count-in and a bar of tail included. */
export const durationMs = (s: SongDef) => leadInMs(s) + (totalBars(s) + 1) * s.beatsPerBar * beatMs(s);

const ROOTS: Partial<Record<TrackName, number>> = { bass: -36, pah: -12, lead: 0, pluck: 0 };

function tokens(track: string): string[] {
  return track.trim().split(/\s+/);
}

/** Every note and hit of the song, in time order. */
export function songEvents(song: SongDef): SongEvent[] {
  const out: SongEvent[] = [];
  const sm = stepMs(song);
  const perBar = song.beatsPerBar * song.stepsPerBeat;
  const lead = leadInMs(song);
  let bar = 0;
  song.sections.forEach((sec, si) => {
    const pat = song.patterns[sec.pattern];
    if (!pat) throw new Error(`${song.id}: no pattern ${sec.pattern}`);
    const patSteps = pat.bars * perBar;
    for (const [name, raw] of Object.entries(pat.tracks) as [TrackName, string][]) {
      const toks = tokens(raw);
      let open: SongEvent | null = null;
      for (let s = 0; s < sec.bars * perBar; s++) {
        const tok = toks[(s % patSteps) % toks.length];
        const globalBar = bar + Math.floor(s / perBar);
        const inBar = s % perBar;
        if (tok === '-') {
          if (open) open.dur += sm;
          continue;
        }
        open = null;
        if (tok === '.') continue;
        const ev: SongEvent = {
          t: lead + (globalBar * perBar + inBar) * sm,
          dur: sm,
          track: name,
          token: tok,
          bar: globalBar,
          beat: Math.floor(inBar / song.stepsPerBeat),
          sub: inBar % song.stepsPerBeat,
          section: si,
        };
        if (/^-?\d/.test(tok)) ev.pitch = tok.split(',').map((n) => song.key + (ROOTS[name] ?? 0) + Number(n));
        out.push(ev);
        open = ev;
      }
    }
    bar += sec.bars;
  });
  return out.sort((a, b) => a.t - b.t || a.track.localeCompare(b.track));
}

/** Builds a track string from bars of tokens (each bar a string), for readable song files. */
export function bars(...b: string[]): string {
  return b.join('  ');
}

/** Repeats a token string n times. */
export function rep(s: string, n: number): string {
  return Array(n).fill(s.trim()).join(' ');
}

/**
 * A melody (or any track) written as notes with lengths, `token/steps`: `4/2 7/2 9/4` is a 4 held
 * for two steps, a 7 for two, a 9 for four. A token without a length lasts one step; a rest
 * (`.`) of n steps is n rests.
 */
export function line(spec: string): string {
  return spec
    .trim()
    .split(/\s+/)
    .map((item) => {
      const [tok, len = '1'] = item.split('/');
      const n = Number(len);
      if (!tok || !Number.isInteger(n) || n < 1) throw new Error(`bad note "${item}"`);
      return [tok, ...Array(n - 1).fill(tok === '.' ? '.' : '-')].join(' ');
    })
    .join(' ');
}

/** How many steps a track string spans. */
export function stepCount(track: string): number {
  return track.trim().split(/\s+/).length;
}
