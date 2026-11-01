/**
 * The songs Joel and Jonas can play. Add yours here — either kind works with the whole rhythm
 * engine (venues, song select, bests, the sync test):
 *
 *   { kind: 'synth', song: MY_SONG }
 *       A SongDef (src/game/rhythm/Song.ts): tempo, meter, sections and step tracks. The Synth
 *       plays it and ChartGen charts all four difficulties from the same pattern data.
 *
 *   { kind: 'audio', id, title, composer, character, style, chartUrl }
 *       An audio file plus a chart JSON under public/ (make one in #/dev/chart-editor). The
 *       chart's `audio` field names the file.
 *
 * Optional `unlock`: the Fans (Joel) or Applause (Jonas) needed before the song can be played.
 * Only originals or public-domain tunes — never copyrighted recordings or songs, and never a
 * real song's melody (a melody is copyrighted on its own): write new ones in a genre's style.
 * The sets so far are in src/content/setlists/: Joel's J-pop, Jonas's German party hits.
 * In dev builds every venue also lists a plain test pattern (src/game/rhythm/testPattern.ts).
 */
import type { SongDef, SongStyle } from '../game/rhythm/Song';
import type { CharacterId } from './characters';
import { JOEL_SONGS } from './setlists/joel';
import { JONAS_SONGS } from './setlists/jonas';

export type SongSource =
  | { kind: 'synth'; song: SongDef; unlock?: number }
  | { kind: 'audio'; id: string; title: string; composer: string; character: CharacterId; style: SongStyle; chartUrl: string; unlock?: number };

export const SONGS: SongSource[] = [...JOEL_SONGS, ...JONAS_SONGS].map(({ song, unlock }) => ({ kind: 'synth', song, unlock }));

export function songId(s: SongSource): string {
  return s.kind === 'synth' ? s.song.id : s.id;
}

export function songTitle(s: SongSource): string {
  return s.kind === 'synth' ? s.song.title : s.title;
}

export function songCharacter(s: SongSource): CharacterId {
  return s.kind === 'synth' ? s.song.character : s.character;
}

export function songStyle(s: SongSource): SongStyle {
  return s.kind === 'synth' ? s.song.style : s.style;
}
