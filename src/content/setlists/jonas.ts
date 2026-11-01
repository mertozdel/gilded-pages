/**
 * Jonas's set at the Dorffest: three original songs in the style of the German party hits of
 * the 2000s and 2010s (Discofox Schlager, a Volks-rock'n'roll boogie, a big singalong anthem),
 * played by the brass band with Jonas on bass. The chart is his bass line: each note on its
 * string (E A D G), doubles on downbeats from Hard, slides on Expert. Melodies, chords and titles
 * are all new; none is taken from a real song.
 */
import { line, type SongDef } from '../../game/rhythm/Song';
import { bars, chord, perBar } from './kit';

/** Brass chords on the offbeats (two steps a beat). */
const pahOffbeats = (r: number) => {
  const c = chord(r);
  return `. ${c} . ${c} . ${c} . ${c}`;
};
/** On the beats: root, fifth, octave, fifth (across three strings). */
const beatBass = (r: number) => `${r} . ${r + 7} . ${r + 12} . ${r + 7} .`;
/** A long root sliding up a string into the fourth: the Expert slide. */
const slideBass = (r: number) => `${r} - - - ${r + 5} . ${r + 7} .`;
/** Discofox eighths, root and octave. */
const foxBass = (r: number) => `${r} ${r + 12} ${r + 7} ${r + 12} ${r} ${r + 12} ${r + 7} ${r + 12}`;
/** A whole bar held. */
const longBass = (r: number) => `${r} - - - - - - -`;

/** Discofox Schlager: four on the floor, an octave bass, a trumpet hook over I V vi IV. */
const morgenglut: SongDef = {
  id: 'morgenglut',
  title: 'Morgenglut',
  composer: 'Original (Schlager style)',
  source: 'original',
  character: 'jonas',
  style: 'schlager',
  bpm: 128,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  key: 65,
  voices: { lead: 'trumpet', bass: 'tuba' },
  leadInBeats: 4,
  sections: [
    { name: 'Intro', bars: 4, pattern: 'intro' },
    { name: 'Strophe', bars: 8, pattern: 'verse' },
    { name: 'Bridge', bars: 4, pattern: 'pre' },
    { name: 'Refrain', bars: 8, pattern: 'chorus' },
    { name: 'Strophe 2', bars: 8, pattern: 'verse' },
    { name: 'Bridge 2', bars: 4, pattern: 'pre' },
    { name: 'Refrain 2', bars: 8, pattern: 'chorus' },
    { name: 'Zwischenspiel', bars: 4, pattern: 'break' },
    { name: 'Refrain 3', bars: 8, pattern: 'chorus' },
    { name: 'Refrain 4', bars: 8, pattern: 'chorus' },
    { name: 'Outro', bars: 4, pattern: 'outro' },
  ],
  patterns: {
    intro: {
      bars: 4,
      tracks: {
        kick: bars(4, 'x . x . x . x .'),
        snare: bars(4, '. . x . . . x .'),
        hat: bars(4, '. x . x . x . x'),
        bass: perBar([0, 7, 9, 5], beatBass),
        pah: perBar([0, 7, 9, 5], pahOffbeats),
        lead: line('0/1 4/1 7/2 12/2 7/2  7/1 11/1 14/2 11/2 7/2  9/1 12/1 16/2 12/2 9/2  5/2 4/2 2/4'),
      },
    },
    verse: {
      bars: 8,
      tracks: {
        kick: bars(8, 'x . x . x . x .'),
        snare: bars(8, '. . x . . . x .'),
        hat: bars(8, '. x . x . x . x'),
        bass: perBar([9, 5, 0, 7, 9, 5, 0, 7], (r, i) => (i === 7 ? slideBass(r) : beatBass(r))),
        pah: perBar([9, 5, 0, 7, 9, 5, 0, 7], pahOffbeats),
        lead: line(
          '9/1 9/1 9/1 12/1 12/2 9/2  9/1 7/1 5/2 ./2 4/1 5/1  7/1 7/1 7/1 9/1 7/2 4/2  2/2 4/2 7/4 ' +
            '9/1 9/1 9/1 12/1 14/2 12/2  12/1 9/1 5/2 ./2 5/1 7/1  9/1 7/1 4/1 7/1 9/2 7/2  7/8',
        ),
      },
    },
    pre: {
      bars: 4,
      tracks: {
        kick: bars(4, 'x . x . x . x .'),
        snare: bars(3, '. . x . . . x .') + '  ' + 'x x x x x x x x',
        hat: bars(4, '. x . x . x . x'),
        bass: perBar([5, 7, 9, 7], (r, i) => (i === 3 ? slideBass(r) : beatBass(r))),
        pah: perBar([5, 7, 9, 7], pahOffbeats),
        lead: line('5/1 7/1 9/2 9/1 7/1 9/2  7/1 9/1 11/2 11/1 9/1 7/2  9/1 11/1 12/2 12/1 14/1 16/2  14/4 19/4'),
      },
    },
    chorus: {
      bars: 8,
      tracks: {
        kick: bars(8, 'x . x . x . x .'),
        snare: bars(8, '. . x . . . x .'),
        hat: bars(8, '. x . x . x . x'),
        bass: perBar([0, 7, 9, 5, 0, 7, 5, 0], foxBass),
        pah: perBar([0, 7, 9, 5, 0, 7, 5, 0], pahOffbeats),
        lead: line(
          '19/2 17/1 16/1 16/2 12/2  14/2 14/1 16/1 19/4  21/2 19/1 17/1 16/2 14/2  17/4 14/2 12/2 ' +
            '19/2 17/1 16/1 16/2 12/2  14/2 16/2 19/2 14/2  16/2 17/2 16/2 14/2  12/8',
        ),
      },
    },
    break: {
      bars: 4,
      tracks: {
        kick: bars(4, 'x . . . x . . .'),
        bass: perBar([9, 5, 0, 7], longBass),
        lead: line('21/4 19/4  17/4 16/4  16/4 14/4  14/8'),
      },
    },
    outro: {
      bars: 4,
      tracks: {
        kick: bars(3, 'x . x . x . x .') + '  ' + 'x . . . . . . .',
        snare: bars(3, '. . x . . . x .') + '  ' + '. . . . . . . .',
        hat: bars(3, '. x . x . x . x') + '  ' + '. . . . . . . .',
        bass: perBar([0, 7, 9, 0], (r, i) => (i === 3 ? longBass(r) : beatBass(r))),
        pah: perBar([0, 7, 9], pahOffbeats) + '  ' + `${chord(0)} - - - - - - -`,
        lead: line('0/1 4/1 7/2 12/2 7/2  7/1 11/1 14/2 11/2 7/2  9/1 12/1 16/2 12/2 9/2  12/8'),
      },
    },
  },
};

/** Volks-rock'n'roll: a shuffle (three steps a beat) on the 12-bar form, a walking boogie bass, accordion. */
const boogieBass = (r: number) => `${r} - ${r + 4} ${r + 7} - ${r + 9} ${r + 10} - ${r + 9} ${r + 7} - ${r + 4}`;
/** The last bar of the form: a long note sliding up a string, then a walk down. */
const turnaround = (r: number) => `${r} - - ${r + 5} - ${r + 4} ${r + 3} - ${r + 2} ${r} - -`;
const shufflePah = (r: number) => {
  const c = chord(r, 'dominant');
  return `. . ${c} . . ${c} . . ${c} . . ${c}`;
};
/** I I I I · IV IV I I · V IV I V. */
const TWELVE_BAR = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];

const lederhosenBoogie: SongDef = {
  id: 'lederhosen-boogie',
  title: 'Lederhosen-Boogie',
  composer: 'Original (Volks-rock style)',
  source: 'original',
  character: 'jonas',
  style: 'schlager',
  bpm: 138,
  beatsPerBar: 4,
  stepsPerBeat: 3,
  key: 67,
  voices: { lead: 'accordion', bass: 'tuba' },
  leadInBeats: 4,
  sections: [
    { name: 'Intro', bars: 4, pattern: 'intro' },
    { name: 'Thema', bars: 12, pattern: 'head' },
    { name: 'Solo', bars: 12, pattern: 'solo' },
    { name: 'Thema 2', bars: 12, pattern: 'head' },
    { name: 'Solo 2', bars: 12, pattern: 'solo' },
    { name: 'Thema 3', bars: 12, pattern: 'head' },
    { name: 'Schluss', bars: 4, pattern: 'outro' },
  ],
  patterns: {
    intro: {
      bars: 4,
      tracks: {
        kick: bars(4, 'x . . . . . x . . . . .'),
        snare: bars(4, '. . . x . . . . . x . .'),
        hat: bars(4, 'x . x x . x x . x x . x'),
        bass: perBar([7, 5, 0, 7], (r, i) => (i === 3 ? turnaround(r) : boogieBass(r))),
        pah: perBar([7, 5, 0, 7], shufflePah),
        lead: line('14/3 12/3 11/6  12/3 9/3 7/6  7/2 4/1 7/2 9/1 12/6  14/3 12/3 11/6'),
      },
    },
    head: {
      bars: 12,
      tracks: {
        kick: bars(12, 'x . . . . . x . . . . .'),
        snare: bars(12, '. . . x . . . . . x . .'),
        hat: bars(12, 'x . x x . x x . x x . x'),
        bass: perBar(TWELVE_BAR, (r, i) => (i === 11 ? turnaround(r) : boogieBass(r))),
        pah: perBar(TWELVE_BAR, shufflePah),
        lead: line(
          '7/2 9/1 10/2 9/1 7/3 4/3  7/2 9/1 10/2 9/1 7/6  12/2 10/1 9/2 7/1 4/2 3/1 4/3  0/6 ./3 7/2 9/1 ' +
            '12/2 12/1 12/2 14/1 12/3 9/3  10/2 9/1 7/2 5/1 9/6  7/2 9/1 10/2 9/1 7/3 4/3  7/6 ./3 14/2 12/1 ' +
            '14/2 14/1 14/2 12/1 11/3 9/3  12/2 12/1 12/2 10/1 9/3 7/3  7/2 4/1 7/2 9/1 12/6  14/3 12/3 11/6',
        ),
      },
    },
    solo: {
      bars: 12,
      tracks: {
        kick: bars(12, 'x . . . . . x . . . . .'),
        snare: bars(12, '. . . x . . . . . x . x'),
        hat: bars(12, 'x . x x . x x . x x . x'),
        bass: perBar(TWELVE_BAR, (r, i) => (i === 11 ? turnaround(r) : boogieBass(r))),
        pah: perBar(TWELVE_BAR, shufflePah),
        lead: line(
          '12/1 14/1 15/1 16/2 14/1 12/2 10/1 7/3  12/1 14/1 15/1 16/2 14/1 12/6  19/2 16/1 14/2 12/1 10/2 9/1 7/3  7/1 9/1 10/1 11/1 12/2 ./6 ' +
            '17/2 16/1 15/2 14/1 12/3 9/3  17/1 19/1 21/1 22/3 21/3 19/3  12/1 14/1 15/1 16/2 14/1 12/2 10/1 7/3  19/6 16/3 12/3 ' +
            '14/1 16/1 17/1 19/3 17/3 14/3  17/1 16/1 15/1 14/3 12/3 9/3  12/2 7/1 12/2 16/1 19/6  14/3 11/3 14/3 17/3',
        ),
      },
    },
    outro: {
      bars: 4,
      tracks: {
        kick: bars(3, 'x . . . . . x . . . . .') + '  ' + 'x . . . . . . . . . . .',
        snare: bars(3, '. . . x . . . . . x . .') + '  ' + '. . . . . . . . . . . .',
        hat: bars(3, 'x . x x . x x . x x . x') + '  ' + '. . . . . . . . . . . .',
        bass: perBar([7, 5, 0, 0], (r, i) => (i === 3 ? `${r} - - - - - - - - - - -` : boogieBass(r))),
        pah: perBar([7, 5, 0], shufflePah) + '  ' + `${chord(0, 'dominant')} - - - - - - - - - - -`,
        lead: line('14/3 12/3 11/6  12/3 9/3 7/6  7/2 4/1 7/2 9/1 12/6  12/12'),
      },
    },
  },
};

/** The singalong anthem: a pumping chorus over IV I V vi, the brass in the chorus, a drop to the kick alone. */
const kirchweihHymne: SongDef = {
  id: 'kirchweih-hymne',
  title: 'Kirchweih-Hymne',
  composer: 'Original (Deutschpop style)',
  source: 'original',
  character: 'jonas',
  style: 'schlager',
  bpm: 124,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  key: 64,
  voices: { lead: 'clarinet', bass: 'tuba' },
  leadInBeats: 4,
  sections: [
    { name: 'Intro', bars: 4, pattern: 'intro' },
    { name: 'Strophe', bars: 8, pattern: 'verse' },
    { name: 'Refrain', bars: 8, pattern: 'chorus' },
    { name: 'Strophe 2', bars: 8, pattern: 'verse' },
    { name: 'Refrain 2', bars: 8, pattern: 'chorus' },
    { name: 'Stille', bars: 4, pattern: 'bridge' },
    { name: 'Refrain 3', bars: 8, pattern: 'chorus' },
    { name: 'Refrain 4', bars: 8, pattern: 'chorus' },
    { name: 'Outro', bars: 4, pattern: 'outro' },
  ],
  patterns: {
    intro: {
      bars: 4,
      tracks: {
        kick: bars(4, 'x . . . x . . .'),
        snare: bars(4, '. . x . . . x .'),
        hat: bars(4, 'x x x x x x x x'),
        bass: perBar([5, 0, 7, 9], beatBass),
        pah: perBar([5, 0, 7, 9], pahOffbeats),
        lead: line('9/2 9/1 7/1 9/2 12/2  7/2 7/1 4/1 7/4  11/2 11/1 9/1 11/2 14/2  12/8'),
      },
    },
    verse: {
      bars: 8,
      tracks: {
        kick: bars(8, 'x . . . x . . .'),
        snare: bars(8, '. . x . . . x .'),
        hat: bars(8, 'x x x x x x x x'),
        bass: perBar([0, 7, 9, 5, 0, 7, 9, 5], (r, i) => (i === 7 ? slideBass(r) : `${r} . ${r} . ${r + 12} . ${r + 7} .`)),
        lead: line(
          '4/1 4/1 4/1 4/1 7/2 4/2  2/1 2/1 2/1 4/1 2/2 ./2  4/1 4/1 4/1 7/1 9/2 7/2  4/2 2/2 0/4 ' +
            '4/1 4/1 4/1 4/1 7/2 9/2  11/1 11/1 11/1 9/1 7/2 ./2  9/1 9/1 9/1 11/1 12/2 11/2  9/4 7/2 5/2',
        ),
      },
    },
    chorus: {
      bars: 8,
      tracks: {
        kick: bars(8, 'x . x . x . x .'),
        snare: bars(8, '. . x . . . x .'),
        hat: bars(8, 'x x x x x x x x'),
        bass: perBar([5, 0, 7, 9, 5, 0, 7, 9], (r) => `${r} ${r} ${r + 12} ${r} ${r + 7} ${r} ${r + 12} ${r + 7}`),
        pah: perBar([5, 0, 7, 9, 5, 0, 7, 9], pahOffbeats),
        lead: line(
          '12/2 12/1 14/1 12/2 9/2  16/3 14/1 12/4  11/2 11/1 12/1 14/2 11/2  12/6 ./2 ' +
            '12/2 12/1 14/1 12/2 17/2  16/3 14/1 12/2 11/2  11/2 12/2 14/2 11/2  12/8',
        ),
      },
    },
    bridge: {
      bars: 4,
      tracks: {
        kick: bars(4, 'x . . . . . . .'),
        bass: perBar([5, 7, 9, 9], longBass),
        lead: line('9/4 12/4  11/4 14/4  16/8  16/4 19/4'),
      },
    },
    outro: {
      bars: 4,
      tracks: {
        kick: bars(3, 'x . x . x . x .') + '  ' + 'x . . . . . . .',
        snare: bars(3, '. . x . . . x .') + '  ' + '. . . . . . . .',
        hat: bars(3, 'x x x x x x x x') + '  ' + '. . . . . . . .',
        bass: perBar([5, 0, 7, 0], (r, i) => (i === 3 ? longBass(r) : beatBass(r))),
        pah: perBar([5, 0, 7], pahOffbeats) + '  ' + `${chord(0)} - - - - - - -`,
        lead: line('12/2 12/1 14/1 12/2 9/2  16/3 14/1 12/4  11/2 11/1 12/1 14/2 11/2  12/8'),
      },
    },
  },
};

export const JONAS_SONGS: { song: SongDef; unlock: number }[] = [
  { song: morgenglut, unlock: 0 },
  { song: lederhosenBoogie, unlock: 60 },
  { song: kirchweihHymne, unlock: 150 },
];
