import { describe, expect, it } from 'vitest';
import { SONGS } from '../../src/content/songs';
import { autoplayInputs, runVirtual } from '../../src/game/rhythm/Autoplay';
import { calibrationOffset } from '../../src/game/rhythm/Calibration';
import { DIFFICULTIES, LANES, loadChart, validateChart, type Chart, type ChartNote } from '../../src/game/rhythm/Chart';
import { generateChart, sourceTracks, stringFor } from '../../src/game/rhythm/ChartGen';
import { HOLD_SLACK_MS, Judge, SCRATCH_GAP_MS, judgmentCount } from '../../src/game/rhythm/Judge';
import { ScoreModel, multiplierFor, starsFor } from '../../src/game/rhythm/ScoreModel';
import { songEvents, type SongDef } from '../../src/game/rhythm/Song';
import { testPattern } from '../../src/game/rhythm/testPattern';

/** A fake clock: song time only moves when the test says so. */
class FakeClock {
  t = 0;
  advance(ms: number) {
    this.t += ms;
    return this.t;
  }
}

const tap = (t: number, lane = 0): ChartNote => ({ t, lane, type: 'tap' });

describe('Judge windows', () => {
  it('grades ±45 Perfect, ±90 Great, ±135 Good, beyond that nothing', () => {
    for (const [delta, grade] of [
      [0, 'perfect'],
      [45, 'perfect'],
      [-45, 'perfect'],
      [46, 'great'],
      [-90, 'great'],
      [91, 'good'],
      [-135, 'good'],
    ] as const) {
      const j = new Judge([tap(1000)]);
      expect(j.press(0, 1000 + delta)[0]?.grade, `delta ${delta}`).toBe(grade);
    }
    expect(new Judge([tap(1000)]).press(0, 1136)).toEqual([]);
  });

  it('widens every window ×1.3 on Easy', () => {
    expect(new Judge([tap(1000)], 1.3).press(0, 1058)[0].grade).toBe('perfect');
    expect(new Judge([tap(1000)], 1.3).press(0, 1175)[0].grade).toBe('good');
  });

  it('misses a note once the clock passes its Good window', () => {
    const clock = new FakeClock();
    const j = new Judge([tap(1000)]);
    expect(j.update(clock.advance(1135))).toEqual([]);
    const m = j.update(clock.advance(1));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ grade: 'miss', part: 'head' });
  });

  it('takes the earliest note in reach and ignores presses with none (no penalty)', () => {
    const j = new Judge([tap(1000), tap(1100)]);
    expect(j.press(0, 1060)[0]).toMatchObject({ note: 0, grade: 'great' });
    expect(j.press(1, 1060)).toEqual([]);
    expect(j.press(0, 1100)[0]).toMatchObject({ note: 1, grade: 'perfect' });
  });

  it('signs the delta: early is negative', () => {
    expect(new Judge([tap(1000)]).press(0, 970)[0].deltaMs).toBe(-30);
  });

  it(`needs a hold held until ${HOLD_SLACK_MS} ms before its end`, () => {
    const notes: ChartNote[] = [{ t: 1000, lane: 1, type: 'hold', len: 800 }];
    const ok = new Judge(notes);
    ok.press(1, 1000);
    expect(ok.release(1, 1700)[0]).toMatchObject({ part: 'tail', grade: 'perfect' });
    const early = new Judge(notes);
    early.press(1, 1000);
    expect(early.release(1, 1699)[0]).toMatchObject({ part: 'tail', grade: 'miss' });
    const held = new Judge(notes);
    held.press(1, 1000);
    expect(held.update(1700)[0]).toMatchObject({ part: 'tail', grade: 'perfect' });
  });

  it('needs both strings of a double', () => {
    const j = new Judge([{ t: 1000, lane: 0, type: 'double', lane2: 1 }]);
    expect(j.press(0, 1000)[0].part).toBe('head');
    expect(j.update(1200)).toMatchObject([{ part: 'second', grade: 'miss' }]);
  });

  it('judges a slide when the next lane is reached at its end', () => {
    const j = new Judge([{ t: 1000, lane: 1, type: 'slide', len: 500, lane2: 2 }]);
    j.press(1, 1000);
    expect(j.press(2, 1520)[0]).toMatchObject({ part: 'second', grade: 'perfect', deltaMs: 20 });
  });

  it(`breaks a scratch when the taps stop for more than ${SCRATCH_GAP_MS} ms`, () => {
    const notes: ChartNote[] = [{ t: 1000, lane: 3, type: 'scratch', len: 1000 }];
    const j = new Judge(notes);
    j.press(3, 1000);
    j.press(3, 1250);
    expect(j.update(1500)).toEqual([]);
    expect(j.update(1600)[0]).toMatchObject({ part: 'tail', grade: 'miss' });
    const k = new Judge(notes);
    k.press(3, 1000);
    for (let t = 1200; t < 2000; t += 200) k.press(3, t);
    expect(k.update(2000)[0]).toMatchObject({ part: 'tail', grade: 'perfect' });
  });

  it('judges crossfades by direction', () => {
    const j = new Judge([{ t: 1000, lane: 0, type: 'fade', dir: 'R' }]);
    expect(j.fade('L', 1000)).toEqual([]);
    expect(j.fade('R', 1010)[0].grade).toBe('perfect');
  });
});

describe('chart validation', () => {
  const chart = (notes: Partial<Record<string, ChartNote[]>>): Chart => ({
    id: 'c',
    title: 'c',
    composer: 'c',
    bpm: 120,
    offsetMs: 0,
    durationMs: 10000,
    timeSignature: '4/4',
    synth: 'x',
    difficulties: { easy: [], normal: [], hard: [], expert: [], ...notes } as Chart['difficulties'],
  });

  it('accepts a clean chart', () => {
    expect(validateChart(chart({ hard: [tap(0), { t: 100, lane: 1, type: 'hold', len: 400 }, tap(500, 1)] }))).toEqual([]);
  });

  it('rejects overlapping notes in one lane', () => {
    const errs = validateChart(chart({ hard: [{ t: 100, lane: 1, type: 'hold', len: 400 }, tap(300, 1)] }));
    expect(errs.join()).toMatch(/overlaps/);
    expect(() => loadChart(chart({ hard: [tap(100), tap(100)] }))).toThrow(/overlaps/);
  });

  it('rejects lanes out of range for the difficulty, missing fields and misplaced specials', () => {
    expect(validateChart(chart({ easy: [tap(0, 2)] })).join()).toMatch(/lane 2 out of 0..1/);
    expect(validateChart(chart({ hard: [{ t: 0, lane: 0, type: 'hold' }] })).join()).toMatch(/len/);
    expect(validateChart(chart({ expert: [{ t: 0, lane: 0, type: 'fade' }] })).join()).toMatch(/dir/);
    expect(validateChart(chart({ normal: [{ t: 0, lane: 0, type: 'double', lane2: 1 }] })).join()).toMatch(/Hard and Expert/);
    expect(validateChart(chart({ hard: [{ t: 0, lane: 0, type: 'scratch', len: 100 }] })).join()).toMatch(/Expert/);
  });
});

const PATTERNS: [SongDef, 'bass' | 'dj'][] = [
  [testPattern('jonas'), 'bass'],
  [testPattern('joel'), 'dj'],
  ...SONGS.filter((s) => s.kind === 'synth').map((s) => [s.song, s.song.character === 'joel' ? 'dj' : 'bass'] as [SongDef, 'bass' | 'dj']),
];

describe('ChartGen', () => {
  for (const [song, mode] of PATTERNS) {
    describe(`${song.title} (${mode})`, () => {
      const chart = generateChart(song, mode);
      const events = songEvents(song).filter((e) => sourceTracks(mode).includes(e.track));

      it('makes four valid difficulties with 2 / 3 / 4 / 4 lanes', () => {
        expect(validateChart(chart)).toEqual([]);
        for (const d of DIFFICULTIES) {
          expect(chart.difficulties[d].length, d).toBeGreaterThan(0);
          for (const n of chart.difficulties[d]) if (n.type !== 'fade') expect(n.lane).toBeLessThan(LANES[d]);
        }
      });

      it('puts every note on a note of the synth patterns (the audio and the chart agree)', () => {
        for (const d of DIFFICULTIES) {
          for (const n of chart.difficulties[d]) {
            const src = events.find((e) => Math.abs(e.t - n.t) < 0.01);
            expect(src, `${d} @${n.t}`).toBeTruthy();
            if (n.len && n.type !== 'scratch') expect(events.some((e) => Math.abs(e.t + e.dur - (n.t + n.len!)) < 0.01 || Math.abs(e.t - (n.t + n.len!)) < 0.01)).toBe(true);
          }
        }
      });

      if (mode === 'bass') {
        it('plays each bass note on its string (E A D G) on Hard', () => {
          const bass = events.filter((e) => e.track === 'bass');
          for (const n of chart.difficulties.hard) {
            const e = bass.find((x) => Math.abs(x.t - n.t) < 0.01)!;
            expect(n.lane).toBe(stringFor(e.pitch![0]));
          }
          expect(chart.difficulties.hard.some((n) => n.type === 'double')).toBe(true);
          expect(chart.difficulties.expert.some((n) => n.type === 'slide')).toBe(true);
        });
      } else {
        it('charts kicks on the decks and specials on Expert', () => {
          const kinds = new Set(chart.difficulties.expert.map((n) => n.type));
          for (const k of ['tap', 'hold', 'scratch', 'fade']) expect(kinds.has(k as never), k).toBe(true);
          expect(chart.difficulties.easy.every((n) => n.type === 'tap')).toBe(true);
        });
      }

      it('is hit 100% Perfect by Autoplay', () => {
        for (const d of DIFFICULTIES) {
          const notes = chart.difficulties[d];
          const js = runVirtual(notes);
          expect(js.length, d).toBe(judgmentCount(notes));
          expect(js.every((j) => j.grade === 'perfect'), `${d}: ${JSON.stringify(js.find((j) => j.grade !== 'perfect'))}`).toBe(true);
          const score = new ScoreModel(judgmentCount(notes));
          js.forEach((j) => score.apply(j));
          expect(score.finalAccuracy).toBe(100);
          expect(score.fullCombo).toBe(true);
          expect(score.stars).toBe(5);
          expect(autoplayInputs(notes).length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('score', () => {
  it('multiplies ×2 at 10, ×3 at 20, ×4 at 30', () => {
    expect([0, 9, 10, 19, 20, 29, 30, 99].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('gives 1–5 stars at 50 / 65 / 80 / 90 / 97%', () => {
    expect([49, 50, 64.9, 65, 80, 90, 96.9, 97, 100].map(starsFor)).toEqual([0, 1, 1, 2, 3, 4, 4, 5, 5]);
  });

  it('scores 100 / 70 / 40, doubles in star power, and fails when the meter empties', () => {
    const s = new ScoreModel(100);
    s.apply({ note: 0, lane: 0, grade: 'perfect', deltaMs: 0, part: 'head' });
    s.apply({ note: 1, lane: 0, grade: 'great', deltaMs: 60, part: 'head' });
    s.apply({ note: 2, lane: 0, grade: 'good', deltaMs: 100, part: 'head' });
    expect(s.score).toBe(210);
    s.star = 1;
    expect(s.startStar()).toBe(true);
    s.apply({ note: 3, lane: 0, grade: 'perfect', deltaMs: 0, part: 'head' });
    expect(s.score).toBe(410);
    for (let i = 0; i < 20; i++) s.apply({ note: 4, lane: 0, grade: 'miss', deltaMs: 200, part: 'head' });
    expect(s.failed).toBe(true);
    const nf = new ScoreModel(100, true);
    for (let i = 0; i < 20; i++) nf.apply({ note: 4, lane: 0, grade: 'miss', deltaMs: 200, part: 'head' });
    expect(nf.failed).toBe(false);
  });
});

describe('calibration', () => {
  it('takes the median offset and ignores stray taps', () => {
    const clicks = [1000, 1600, 2200, 2800, 3400, 4000, 4600, 5200];
    const taps = [1030, 1625, 2228, 2835, 3430, 3900 + 400, 4631, 5229];
    expect(calibrationOffset(taps, clicks)).toBe(30);
    expect(calibrationOffset([1000], clicks)).toBeNull();
  });
});
