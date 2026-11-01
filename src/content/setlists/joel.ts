/**
 * Joel's set at the 电音节: three original songs in the style of J-pop (idol pop, city pop, an
 * anime opening), played as DJ sets. The chart comes from the drums and the FX: kicks on the
 * decks, sweeps on the FX lanes, claps from Hard, scratches and crossfades on Expert. Melodies,
 * chords and titles are all new; none is taken from a real song.
 */
import { line, type SongDef } from '../../game/rhythm/Song';
import { bars, chord, perBar } from './kit';

/** Drum bars at four steps a beat (16 a bar). */
const KICK4 = 'x . . . x . . . x . . . x . . .';
const KICK_VERSE = 'x . . . . . x . x . . . x . . .';
const KICK_ONE = 'x . . . . . . . . . . . . . . .';
const CLAP = '. . . . x . . . . . . . x . . .';
const HAT_OFF = '. . x . . . x . . . x . . . x .';
const HAT_8 = 'x . x . x . x . x . x . x . x .';
const REST = '. . . . . . . . . . . . . . . .';

/** Chords on the offbeat eighths. */
const offbeatChords = (kind: 'triad' | 'seventh') => (r: number) => {
  const c = chord(r, kind);
  return `. . ${c} . . . ${c} . . . ${c} . . . ${c} .`;
};
/** A synth bass bouncing between its root and the octave. */
const octaveBass = (r: number) => {
  const a = r + 12;
  const b = r + 24;
  return `${a} . ${b} . ${a} . ${b} . ${a} . ${b} . ${a} . ${b} .`;
};
/** City-pop funk bass. */
const funkBass = (r: number) => {
  const a = r;
  return `${a} . ${a} . . ${a + 12} . ${a} . . ${a} . ${a + 12} . ${a + 7} .`;
};
/** Driving rock eighths. */
const rockBass = (r: number) => `${r + 12} . `.repeat(8);

/** Idol pop: a bright hook, a climbing pre-chorus, the "royal road" chorus (IV V iii vi). */
const lanternHeartbeat: SongDef = {
  id: 'lantern-heartbeat',
  title: 'Lantern Heartbeat',
  composer: 'Original (J-pop style)',
  source: 'original',
  character: 'joel',
  style: 'jpop',
  bpm: 150,
  beatsPerBar: 4,
  stepsPerBeat: 4,
  key: 64,
  voices: { lead: 'synth', bass: 'synth' },
  leadInBeats: 4,
  sections: [
    { name: 'Intro', bars: 4, pattern: 'intro' },
    { name: 'Verse', bars: 8, pattern: 'verse' },
    { name: 'Pre-chorus', bars: 4, pattern: 'pre', tag: 'build' },
    { name: 'Chorus', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Verse 2', bars: 8, pattern: 'verse' },
    { name: 'Pre-chorus 2', bars: 4, pattern: 'pre', tag: 'build' },
    { name: 'Chorus 2', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Bridge', bars: 4, pattern: 'bridge', tag: 'break' },
    { name: 'Last chorus', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Outro', bars: 4, pattern: 'outro' },
  ],
  patterns: {
    intro: {
      bars: 4,
      tracks: {
        kick: bars(4, KICK4),
        clap: bars(4, CLAP),
        hat: bars(4, HAT_OFF),
        bass: perBar([5, 7, 4, 9], octaveBass),
        pluck: perBar([5, 7, 4, 9], offbeatChords('triad')),
        lead: line('12/2 16/2 19/2 16/2 12/2 16/2 19/2 21/2  19/2 14/2 11/2 14/2 19/2 14/2 23/4  16/2 11/2 19/2 16/2 23/2 19/2 16/4  21/4 19/4 16/4 12/4'),
        fx: line('c ./47 ./8 s/2 ./6'),
      },
    },
    verse: {
      bars: 8,
      tracks: {
        kick: bars(8, KICK_VERSE),
        clap: bars(8, CLAP),
        hat: bars(8, HAT_8),
        bass: perBar([0, 9, 5, 7, 0, 9, 5, 7], octaveBass),
        pluck: perBar([0, 9, 5, 7, 0, 9, 5, 7], offbeatChords('triad')),
        lead: line(
          '4/2 4/2 7/2 9/2 7/4 4/4  9/2 12/2 11/2 9/2 7/4 ./4  5/2 9/2 12/2 9/2 7/2 5/2 4/4  2/4 4/2 7/2 7/8 ' +
            '4/2 4/2 7/2 9/2 12/4 11/2 9/2  9/4 12/4 16/4 14/2 12/2  12/3 9/3 5/2 9/4 7/4  7/2 9/2 11/2 14/2 11/8',
        ),
        fx: line('./58 < ./65 s/2 ./2'),
      },
    },
    pre: {
      bars: 4,
      tracks: {
        kick: bars(2, KICK_VERSE) + '  ' + bars(2, KICK4),
        clap: bars(4, CLAP),
        hat: bars(4, HAT_8),
        bass: perBar([2, 4, 5, 7], octaveBass),
        pluck: perBar([2, 4, 5, 7], offbeatChords('triad')),
        lead: line('9/2 9/2 9/2 11/2 12/4 9/4  11/2 11/2 11/2 12/2 14/4 11/4  12/2 12/2 12/2 14/2 16/4 12/4  14/4 16/4 17/4 19/4'),
        fx: line('w/8 ./8 w/8 ./8 r/32'),
      },
    },
    chorus: {
      bars: 8,
      tracks: {
        kick: bars(8, KICK4),
        clap: bars(8, CLAP),
        hat: bars(8, HAT_OFF),
        bass: perBar([5, 7, 4, 9, 5, 7, 4, 9], octaveBass),
        pluck: perBar([5, 7, 4, 9, 5, 7, 4, 9], offbeatChords('triad')),
        lead: line(
          '16/3 14/3 12/2 12/4 14/2 16/2  14/4 11/2 14/2 19/4 17/2 16/2  16/3 14/3 11/2 11/4 12/2 14/2  16/6 12/2 9/8 ' +
            '16/3 14/3 12/2 12/2 14/2 16/2 17/2  19/4 17/2 16/2 14/4 11/4  12/2 14/2 16/4 14/2 12/2 11/4  12/12 ./4',
        ),
        fx: line('c ./61 > . ./16 w/8 ./8 ./16 ./8 s/2 ./6'),
      },
    },
    bridge: {
      bars: 4,
      tracks: {
        kick: bars(4, KICK_ONE),
        bass: perBar([9, 5, 0, 7], (r) => `${r + 12} - - - - - - - - - - - - - - -`),
        pluck: perBar([9, 5, 0, 7], offbeatChords('triad')),
        lead: line('12/8 9/4 12/4  17/8 16/4 12/4  16/8 14/4 12/4  11/8 14/8'),
        fx: line('w/16 ./16 w/16 ./16'),
      },
    },
    outro: {
      bars: 4,
      tracks: {
        kick: bars(3, KICK4) + '  ' + KICK_ONE,
        clap: bars(3, CLAP) + '  ' + REST,
        hat: bars(3, HAT_OFF) + '  ' + REST,
        bass: perBar([5, 7, 4, 0], octaveBass),
        pluck: perBar([5, 7, 4, 0], offbeatChords('triad')),
        lead: line('12/2 16/2 19/2 16/2 12/2 16/2 19/2 21/2  19/2 14/2 11/2 14/2 19/2 14/2 23/4  16/2 11/2 19/2 16/2 23/2 19/2 16/4  12/16'),
        fx: line('c ./59 s/2 ./2'),
      },
    },
  },
};

/** City pop: seventh chords, a funk bass, a syncopated melody; disco four-on-the-floor in the chorus. */
const midnightPlatform: SongDef = {
  id: 'midnight-platform',
  title: 'Midnight Platform',
  composer: 'Original (J-pop style)',
  source: 'original',
  character: 'joel',
  style: 'jpop',
  bpm: 112,
  beatsPerBar: 4,
  stepsPerBeat: 4,
  key: 69,
  voices: { lead: 'synth', bass: 'synth' },
  leadInBeats: 4,
  sections: [
    { name: 'Intro', bars: 4, pattern: 'intro' },
    { name: 'Verse', bars: 8, pattern: 'verse' },
    { name: 'Chorus', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Verse 2', bars: 8, pattern: 'verse' },
    { name: 'Chorus 2', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Bridge', bars: 4, pattern: 'bridge', tag: 'break' },
    { name: 'Last chorus', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Outro', bars: 4, pattern: 'outro' },
  ],
  patterns: {
    intro: {
      bars: 4,
      tracks: {
        kick: bars(4, 'x . . . . . . . x . . . x . x .'),
        clap: bars(4, CLAP),
        hat: bars(4, HAT_8),
        bass: perBar([5, 4, 9, 7], funkBass),
        pluck: perBar([5, 4, 9, 7], offbeatChords('seventh')),
        lead: line(
          '16/2 ./1 14/1 12/2 9/2 ./2 12/1 14/1 16/4  14/2 ./1 12/1 11/2 7/2 ./2 11/1 12/1 14/4  12/2 ./1 14/1 16/2 19/2 ./2 16/1 14/1 12/4  11/4 14/4 17/4 16/4',
        ),
        fx: line('./56 s/2 ./6'),
      },
    },
    verse: {
      bars: 8,
      tracks: {
        kick: bars(8, 'x . . . . . . . x . . . x . x .'),
        clap: bars(8, CLAP),
        hat: bars(8, HAT_8),
        bass: perBar([5, 4, 9, 0, 2, 4, 5, 7], funkBass),
        pluck: perBar([5, 4, 9, 0, 2, 4, 5, 7], offbeatChords('seventh')),
        lead: line(
          '9/2 9/2 9/1 12/3 ./4 7/2 9/2  11/2 12/2 11/1 9/3 7/8  9/2 9/2 9/1 12/3 ./4 12/2 14/2  16/4 14/2 12/2 11/8 ' +
            '9/2 9/2 12/1 14/3 ./4 12/2 14/2  16/2 14/2 12/1 11/3 ./4 11/2 12/2  14/3 12/3 9/2 12/4 14/4  14/12 ./4',
        ),
        fx: line('./58 > ./37 w/16 ./8 s/2 ./6'),
      },
    },
    chorus: {
      bars: 8,
      tracks: {
        kick: bars(8, KICK4),
        clap: bars(8, CLAP),
        hat: bars(8, HAT_OFF),
        bass: perBar([5, 7, 4, 9, 5, 7, 0, 0], funkBass),
        pluck: perBar([5, 7, 4, 9, 5, 7, 0, 0], offbeatChords('seventh')),
        lead: line(
          '16/2 16/2 17/2 16/1 14/3 12/2 14/4  14/2 14/2 16/2 14/1 12/3 11/2 7/4  11/2 12/2 14/2 16/2 19/4 16/4  16/4 14/2 12/2 12/8 ' +
            '16/2 16/2 17/2 16/1 14/3 12/2 14/4  19/4 17/2 16/2 14/4 12/2 11/2  12/2 11/2 9/2 11/2 12/4 16/4  12/16',
        ),
        fx: line('c ./61 < . ./16 w/8 ./8 ./16 ./8 s/2 ./6'),
      },
    },
    bridge: {
      bars: 4,
      tracks: {
        kick: bars(4, KICK_ONE),
        bass: perBar([2, 7, 0, 9], (r) => `${r + 12} - - - - - - - ${r + 19} - - - - - - -`),
        pluck: perBar([2, 7, 0, 9], offbeatChords('seventh')),
        lead: line('12/6 14/2 12/4 9/4  11/6 12/2 11/4 7/4  11/6 12/2 16/4 19/4  21/8 19/4 16/4'),
        fx: line('w/16 ./16 w/16 ./16'),
      },
    },
    outro: {
      bars: 4,
      tracks: {
        kick: bars(3, 'x . . . . . . . x . . . x . x .') + '  ' + KICK_ONE,
        clap: bars(3, CLAP) + '  ' + REST,
        hat: bars(3, HAT_8) + '  ' + REST,
        bass: perBar([5, 4, 9, 0], funkBass),
        pluck: perBar([5, 4, 9, 0], offbeatChords('seventh')),
        lead: line('16/2 ./1 14/1 12/2 9/2 ./2 12/1 14/1 16/4  14/2 ./1 12/1 11/2 7/2 ./2 11/1 12/1 14/4  12/2 ./1 14/1 16/2 19/2 ./2 16/1 14/1 12/4  12/16'),
        fx: line('./60 s/2 ./2'),
      },
    },
  },
};

/** An anime opening: a fast riff, a driving verse, the canon progression in a soaring chorus. */
const hoshizoraOverdrive: SongDef = {
  id: 'hoshizora-overdrive',
  title: 'Hoshizora Overdrive',
  composer: 'Original (J-pop style)',
  source: 'original',
  character: 'joel',
  style: 'jpop',
  bpm: 168,
  beatsPerBar: 4,
  stepsPerBeat: 4,
  key: 62,
  voices: { lead: 'synth', bass: 'synth' },
  leadInBeats: 4,
  sections: [
    { name: 'Intro', bars: 4, pattern: 'riff' },
    { name: 'Verse', bars: 8, pattern: 'verse' },
    { name: 'Pre-chorus', bars: 4, pattern: 'pre', tag: 'build' },
    { name: 'Chorus', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Interlude', bars: 4, pattern: 'riff' },
    { name: 'Verse 2', bars: 8, pattern: 'verse' },
    { name: 'Pre-chorus 2', bars: 4, pattern: 'pre', tag: 'build' },
    { name: 'Chorus 2', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Bridge', bars: 4, pattern: 'bridge', tag: 'break' },
    { name: 'Last chorus', bars: 8, pattern: 'chorus', tag: 'drop' },
    { name: 'Outro', bars: 4, pattern: 'outro' },
  ],
  patterns: {
    riff: {
      bars: 4,
      tracks: {
        kick: bars(4, KICK4),
        clap: bars(4, CLAP),
        hat: bars(4, HAT_8),
        bass: perBar([9, 5, 7, 0], rockBass),
        pluck: perBar([9, 5, 7, 0], offbeatChords('triad')),
        lead: line('21/2 19/2 16/2 14/2 16/2 19/2 21/4  17/2 16/2 12/2 9/2 12/2 16/2 17/4  19/2 16/2 14/2 11/2 14/2 16/2 19/4  16/4 14/4 12/8'),
        fx: line('c ./47 ./8 s/2 ./6'),
      },
    },
    verse: {
      bars: 8,
      tracks: {
        kick: bars(8, KICK_VERSE),
        clap: bars(8, CLAP),
        hat: bars(8, HAT_8),
        bass: perBar([9, 5, 7, 0, 9, 5, 2, 7], rockBass),
        pluck: perBar([9, 5, 7, 0, 9, 5, 2, 7], offbeatChords('triad')),
        lead: line(
          '9/2 9/1 9/1 9/2 12/2 11/2 9/2 7/4  5/2 5/1 5/1 7/2 9/6 ./4  7/2 7/1 7/1 7/2 11/2 9/2 7/2 4/4  4/4 2/4 0/8 ' +
            '9/2 9/1 9/1 9/2 12/2 14/2 12/2 9/4  12/2 12/1 12/1 14/2 12/2 9/4 ./4  9/2 7/2 5/2 4/2 2/4 4/4  7/8 ./4 7/2 9/2',
        ),
        fx: line('./58 < ./65 s/2 ./2'),
      },
    },
    pre: {
      bars: 4,
      tracks: {
        kick: bars(2, KICK_VERSE) + '  ' + bars(2, KICK4),
        clap: bars(4, CLAP),
        hat: bars(4, HAT_8),
        bass: perBar([5, 7, 4, 9], rockBass),
        pluck: perBar([5, 7, 4, 9], offbeatChords('triad')),
        lead: line('12/2 12/2 12/2 14/2 12/4 9/4  14/2 14/2 14/2 16/2 14/4 11/4  16/2 16/2 16/2 19/2 16/4 14/4  16/4 19/4 21/8'),
        fx: line('w/8 ./8 w/8 ./8 r/32'),
      },
    },
    chorus: {
      bars: 8,
      tracks: {
        kick: bars(8, KICK4),
        clap: bars(8, CLAP),
        hat: bars(8, HAT_OFF),
        bass: perBar([0, 7, 9, 4, 5, 0, 5, 7], rockBass),
        pluck: perBar([0, 7, 9, 4, 5, 0, 5, 7], offbeatChords('triad')),
        lead: line(
          '21/3 19/3 16/2 19/4 21/2 19/2  19/4 16/2 14/2 16/4 14/2 11/2  14/3 16/3 21/2 19/4 16/4  19/6 16/2 16/8 ' +
            '17/3 16/3 14/2 17/4 19/2 21/2  21/4 19/4 16/4 14/2 16/2  17/2 17/2 16/2 14/2 12/4 14/4  16/8 19/8',
        ),
        fx: line('c ./61 > . ./16 w/8 ./8 ./16 ./8 s/2 ./6'),
      },
    },
    bridge: {
      bars: 4,
      tracks: {
        kick: bars(4, KICK_ONE),
        bass: perBar([9, 5, 7, 7], (r) => `${r + 12} - - - - - - - - - - - - - - -`),
        pluck: perBar([9, 5, 7, 7], offbeatChords('triad')),
        lead: line('14/8 16/8  12/8 9/8  11/8 14/8  19/16'),
        fx: line('w/16 ./16 w/16 ./16'),
      },
    },
    outro: {
      bars: 4,
      tracks: {
        kick: bars(3, KICK4) + '  ' + KICK_ONE,
        clap: bars(3, CLAP) + '  ' + REST,
        hat: bars(3, HAT_8) + '  ' + REST,
        bass: perBar([9, 5, 7, 0], rockBass),
        pluck: perBar([9, 5, 7, 0], offbeatChords('triad')),
        lead: line('21/2 19/2 16/2 14/2 16/2 19/2 21/4  17/2 16/2 12/2 9/2 12/2 16/2 17/4  19/2 16/2 14/2 11/2 14/2 16/2 19/4  12/16'),
        fx: line('c ./59 s/2 ./2'),
      },
    },
  },
};

export const JOEL_SONGS: { song: SongDef; unlock: number }[] = [
  { song: lanternHeartbeat, unlock: 0 },
  { song: midnightPlatform, unlock: 60 },
  { song: hoshizoraOverdrive, unlock: 150 },
];
