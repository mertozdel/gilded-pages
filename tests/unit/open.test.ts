import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '../../src/content';
import { PATTERNS, artistPatterns, unlockedPatterns } from '../../src/game/latte/model';
import { EVERYTHING_OPEN, ruleProgress } from '../../src/rules/unlocks';

const nothingRead = { pagesCounted: 0, chaptersFinished: 0, booksFinished: 0, gilt: 0, level: 1 };

describe('everything open (Roxy and Jason)', () => {
  it('is switched on', () => {
    expect(EVERYTHING_OPEN).toBe(true);
  });

  it('opens every place, museum and record on Roxy’s map with nothing read', () => {
    for (const l of LOCATIONS) expect(ruleProgress(l.unlock, nothingRead).done, l.id).toBe(true);
  });

  it('still reports the real progress (for when the unlocks come back)', () => {
    expect(ruleProgress({ kind: 'pages', count: 50 }, nothingRead)).toMatchObject({ done: true, have: 0, need: 50 });
  });

  it('gives Jason every latte art with no tips; the tips ladder is kept', () => {
    expect(artistPatterns(0)).toEqual(PATTERNS);
    expect(unlockedPatterns(0).map((p) => p.id)).toEqual(['heart']);
  });
});
