import { afterEach, describe, expect, it } from 'vitest';
import { bus } from '../../src/bus/events';
import { CHARACTER_IDS, characterById, type CharacterId } from '../../src/content/characters';
import { EXCHANGES, MOODS, linesFor, type Mood, type Situation } from '../../src/content/chatter';
import chatterJson from '../../src/content/chatter.json';
import { Chatter, type Voice } from '../../src/game/crew/Chatter';

const SITUATIONS: Situation[] = ['idle', 'perfect', 'messy', 'rushStart', 'rushGood', 'rushOops', 'rushEnd', 'welcomeBack'];
/** About two lines' worth of bubble width at the bubble's font size. */
const MAX_LINE = 44;

describe('chatter lines', () => {
  it('only uses known moods and situations', () => {
    for (const [id, book] of Object.entries(chatterJson.lines)) {
      expect(CHARACTER_IDS).toContain(id);
      for (const [situation, byMood] of Object.entries(book)) {
        expect(SITUATIONS).toContain(situation);
        for (const mood of Object.keys(byMood)) expect(MOODS).toContain(mood);
      }
    }
    for (const x of EXCHANGES) for (const l of x) expect(MOODS).toContain(l.mood);
  });

  it('gives everyone idle lines in many moods and something for every cup and rush', () => {
    for (const id of CHARACTER_IDS) {
      const idle = linesFor(id, 'idle');
      expect(new Set(idle.map((l) => l.mood)).size).toBeGreaterThanOrEqual(6);
      for (const s of ['perfect', 'messy', 'rushStart', 'rushGood', 'rushOops', 'rushEnd'] as const) {
        expect(linesFor(id, s).length).toBeGreaterThan(0);
        // About their own cup the player picks a line that isn't teasing: there must be one.
        if (s !== 'rushStart') expect(linesFor(id, s).some((l) => l.mood !== 'cheeky')).toBe(true);
      }
    }
  });

  it('has a welcome back only from those with no twin to greet', () => {
    for (const id of CHARACTER_IDS) expect(linesFor(id, 'welcomeBack').length > 0).toBe(!characterById(id).twin);
  });

  it('keeps every line short enough for a bubble, with no repeats', () => {
    for (const id of CHARACTER_IDS) {
      const all = SITUATIONS.flatMap((s) => linesFor(id, s).map((l) => `${s}:${l.text}`));
      expect(new Set(all).size).toBe(all.length);
      for (const s of all) expect(s.slice(s.indexOf(':') + 1).length).toBeLessThanOrEqual(MAX_LINE);
    }
    for (const x of EXCHANGES) for (const l of x) expect(l.text.length).toBeLessThanOrEqual(MAX_LINE);
  });

  it('has exchanges between different people', () => {
    for (const x of EXCHANGES) {
      expect(x.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < x.length; i++) expect(x[i].who).not.toBe(x[i - 1].who);
    }
  });
});

interface Said {
  id: CharacterId;
  text: string;
  mood: Mood;
}

/** Voices that are always free and write down what they say. */
function cafe(player: CharacterId) {
  const said: Said[] = [];
  const voices: Voice[] = CHARACTER_IDS.map((id) => ({ id, npc: id !== player, free: () => true, say: (text, _ms, mood) => said.push({ id, text, mood }) }));
  return { said, voices: () => voices };
}

/** A repeatable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function run(c: Chatter, ms: number, step = 100): void {
  for (let t = 0; t < ms; t += step) c.update(step);
}

describe('Chatter', () => {
  let chatter: Chatter | null = null;
  afterEach(() => chatter?.destroy());

  it('has the NPCs chat now and then, never the player', () => {
    const { said, voices } = cafe('jason');
    chatter = new Chatter(voices, { rand: seeded(1) });
    run(chatter, 120_000);
    expect(said.length).toBeGreaterThanOrEqual(5);
    expect(said.some((s) => s.id === 'jason')).toBe(false);
    expect(new Set(said.map((s) => s.id)).size).toBeGreaterThanOrEqual(2);
  });

  it('keeps idle chatter for after the rush, but reacts to it', () => {
    const { said, voices } = cafe('roxy');
    chatter = new Chatter(voices, { rand: () => 0 });
    bus.emit('rush:start', {});
    run(chatter, 1000);
    expect(said).toHaveLength(1);
    expect(linesFor(said[0].id, 'rushStart').map((l) => l.text)).toContain(said[0].text);
    run(chatter, 60_000);
    expect(said).toHaveLength(1);
    bus.emit('rush:end', { served: 3 });
    run(chatter, 3000);
    const after = said.slice(1);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((s) => linesFor(s.id, 'rushEnd').some((l) => l.text === s.text))).toBe(true);
    // A second rush:end (the screen unmounting) says nothing more.
    const n = said.length;
    bus.emit('rush:end', { served: 3 });
    run(chatter, 1000);
    expect(said).toHaveLength(n);
  });

  it('reacts to a messy cup, and the player never teases themself', () => {
    const { said, voices } = cafe('joel');
    chatter = new Chatter(voices, { rand: () => 0 });
    bus.emit('latte:begin', { id: 'o1', drink: 'latte' });
    for (let i = 0; i < 6; i++) {
      bus.emit('latte:result', { id: `o${i}`, quality: 20, pattern: 'heart', grade: 'messy' });
      run(chatter, 3000);
    }
    const mine = said.filter((s) => s.id === 'joel');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((s) => s.mood !== 'cheeky')).toBe(true);
    expect(said.some((s) => s.id !== 'joel')).toBe(true);
    bus.emit('latte:shiftEnd', {});
  });

  it('plays an exchange in order, each by its speaker', () => {
    const { said, voices } = cafe('roxy');
    // 0 → always an exchange, and the first one that fits.
    chatter = new Chatter(voices, { rand: () => 0 });
    run(chatter, 30_000);
    const x = EXCHANGES.find((e) => e.every((l) => l.who !== 'roxy'))!;
    expect(said.slice(0, x.length).map((s) => [s.id, s.text])).toEqual(x.map((l) => [l.who, l.text]));
  });

  it('welcomes back whoever returns, from someone who is not their twin', () => {
    const { said, voices } = cafe('jonas');
    chatter = new Chatter(voices, { returning: 'jonas', rand: () => 0 });
    run(chatter, 5000);
    expect(said).toHaveLength(0);
    run(chatter, 4000);
    expect(said).toHaveLength(1);
    expect(['jason', 'roxy']).toContain(said[0].id);
    expect(linesFor(said[0].id, 'welcomeBack').map((l) => l.text)).toContain(said[0].text);
  });

  it('stops listening once destroyed', () => {
    const { said, voices } = cafe('roxy');
    const c = new Chatter(voices, { rand: () => 0 });
    c.destroy();
    bus.emit('rush:start', {});
    run(c, 2000);
    expect(said).toHaveLength(0);
    bus.emit('rush:end', { served: 0 });
  });
});
