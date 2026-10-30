/**
 * Not a song: a plain test beat for the dev tools and the sync test. Eight bars of kicks,
 * claps, a bass line that crosses all four strings (with a long note into the next string, for
 * slides), filter sweeps, a scratch and both crossfades — so every note type of both charts
 * shows up. Real songs go in src/content/songs.ts.
 */
import type { CharacterId } from '../../content/characters';
import type { SongDef } from './Song';

export function testPattern(character: CharacterId): SongDef {
  return {
    id: `test-pattern-${character}`,
    title: 'Test pattern',
    composer: 'Dev tools',
    source: 'original',
    character,
    style: character === 'joel' ? 'edm' : 'march',
    bpm: 120,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    key: 64,
    voices: { lead: character === 'joel' ? 'erhu' : 'accordion', bass: character === 'joel' ? 'synth' : 'tuba' },
    leadInBeats: 4,
    sections: [
      { name: 'Groove', bars: 4, pattern: 'groove' },
      { name: 'Specials', bars: 4, pattern: 'specials', tag: 'drop' },
    ],
    patterns: {
      groove: {
        bars: 1,
        tracks: {
          kick: 'x . . . x . . . x . . . x . . .',
          hat: '. . x . . . x . . . x . . . x .',
          bass: '0 . . . 5 . . . 10 . . . 15 . . .',
        },
      },
      specials: {
        bars: 2,
        tracks: {
          kick: 'x . . . x . . . x . . . x . . .',
          clap: '. . . . x . . . . . . . x . . .',
          bass: '0 - - - 5 . . . 10 - - - 15 . . .  0 . 5 . 10 - - - 15 - - - 10 . . .',
          fx: 'w - - - - - - - . . . . . . s -  . . . . . . . . < . . . > . . .',
        },
      },
    },
  };
}
