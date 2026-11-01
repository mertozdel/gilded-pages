import { describe, expect, it } from 'vitest';
import { SONGS } from '../../src/content/songs';
import { durationMs, line, songEvents, stepCount, type SongDef } from '../../src/game/rhythm/Song';

const songs = SONGS.flatMap((s) => (s.kind === 'synth' ? [s.song] : []));

describe('line', () => {
  it('writes notes with lengths as steps', () => {
    expect(line('4/2 . 7/3 ./2 0,4,7')).toBe('4 - . 7 - - . . 0,4,7');
    expect(() => line('4/0')).toThrow(/bad note/);
  });
});

describe('the setlists', () => {
  it('has three songs each for Joel and Jonas, all originals', () => {
    expect(songs.filter((s) => s.character === 'joel')).toHaveLength(3);
    expect(songs.filter((s) => s.character === 'jonas')).toHaveLength(3);
    for (const s of songs) expect(s.source).toBe('original');
    expect(new Set(songs.map((s) => s.id)).size).toBe(songs.length);
  });

  for (const song of songs) {
    describe(song.title, () => {
      it('fills every pattern exactly: each track is its pattern long (no drifting parts)', () => {
        const perBar = song.beatsPerBar * song.stepsPerBeat;
        for (const [name, p] of Object.entries(song.patterns)) {
          for (const [track, steps] of Object.entries(p.tracks)) expect(stepCount(steps!), `${name}.${track}`).toBe(p.bars * perBar);
        }
        for (const sec of song.sections) expect(sec.bars % song.patterns[sec.pattern].bars, sec.name).toBe(0);
      });

      it('keeps its melody and bass in range', () => {
        const ev = songEvents(song);
        const lead = ev.filter((e) => e.track === 'lead').flatMap((e) => e.pitch!);
        const bass = ev.filter((e) => e.track === 'bass').flatMap((e) => e.pitch!);
        expect(Math.min(...lead)).toBeGreaterThanOrEqual(55);
        expect(Math.max(...lead)).toBeLessThanOrEqual(91);
        expect(Math.min(...bass)).toBeGreaterThanOrEqual(28);
        expect(Math.max(...bass)).toBeLessThanOrEqual(64);
      });

      it('lasts about two minutes', () => {
        const s = durationMs(song as SongDef) / 1000;
        expect(s).toBeGreaterThan(90);
        expect(s).toBeLessThan(150);
      });
    });
  }
});
