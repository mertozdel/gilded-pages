/**
 * What a venue can play: the registered songs (src/content/songs.ts) of its character and, in
 * dev builds, the plain test pattern. Loading gives the chart plus what plays the audio.
 */
import { SONGS, songCharacter, songId, songStyle, songTitle, type SongSource } from '../../content/songs';
import type { CharacterId } from '../../content/characters';
import { fetchChart, type Chart } from './Chart';
import { generateChart, type ChartMode } from './ChartGen';
import type { SongDef } from './Song';
import { testPattern } from './testPattern';

export interface Playable {
  id: string;
  title: string;
  composer: string;
  style: string;
  dev: boolean;
  /** The character's currency needed to play it (0: open). */
  unlock: number;
  source: SongSource;
}

export function playableSongs(character: CharacterId, includeDev = import.meta.env.DEV): Playable[] {
  const own: Playable[] = SONGS.filter((s) => songCharacter(s) === character).map((s) => ({
    id: songId(s),
    title: songTitle(s),
    composer: s.kind === 'synth' ? s.song.composer : s.composer,
    style: songStyle(s),
    dev: false,
    unlock: s.unlock ?? 0,
    source: s,
  }));
  if (!includeDev) return own;
  const t = testPattern(character);
  return [...own, { id: t.id, title: t.title, composer: t.composer, style: t.style, dev: true, unlock: 0, source: { kind: 'synth', song: t } }];
}

export interface Loaded {
  chart: Chart;
  song?: SongDef;
  audioUrl?: string;
}

export async function loadPlayable(p: Playable, mode: ChartMode): Promise<Loaded> {
  const s = p.source;
  if (s.kind === 'synth') return { chart: generateChart(s.song, mode), song: s.song };
  const base = import.meta.env.BASE_URL;
  const chart = await fetchChart(`${base}${s.chartUrl}`);
  return { chart, audioUrl: chart.audio ? `${base}${chart.audio}` : undefined };
}

/** The best-score key of a song at a difficulty, in the character's profile. */
export const bestKey = (songId: string, difficulty: string) => `song:${songId}:${difficulty}`;
