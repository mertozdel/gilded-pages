/**
 * What the baristas say in their speech bubbles between the work: lines by character, by
 * situation and by mood. Joel and Jonas slip into German, Jason into Colombian Spanish and
 * Roxy into French. The mood picks the gesture that goes with a line.
 */
import type { CharacterId } from './characters';
import chatterJson from './chatter.json';

export type Mood = 'happy' | 'proud' | 'cheeky' | 'tired' | 'dreamy' | 'grumpy' | 'stressed' | 'confused' | 'sad';
export const MOODS: readonly Mood[] = ['happy', 'proud', 'cheeky', 'tired', 'dreamy', 'grumpy', 'stressed', 'confused', 'sad'];

/**
 * idle: now and then, on their own · perfect / messy: a cup was served · rush*: the Morning
 * Rush · welcomeBack: someone is back from a gig (the twin has their own greeting).
 */
export type Situation = 'idle' | 'perfect' | 'messy' | 'rushStart' | 'rushGood' | 'rushOops' | 'rushEnd' | 'welcomeBack';

export interface Line {
  text: string;
  mood: Mood;
}

/** One line of a little back-and-forth between two or three of them. */
export interface ExchangeLine extends Line {
  who: CharacterId;
}

type LineBook = Partial<Record<CharacterId, Partial<Record<Situation, Partial<Record<Mood, string[]>>>>>>;
const data = chatterJson as unknown as { lines: LineBook; exchanges: ExchangeLine[][] };

/** Every line someone has for a situation (none: they keep quiet). */
export function linesFor(id: CharacterId, situation: Situation): Line[] {
  const byMood = data.lines[id]?.[situation] ?? {};
  return MOODS.flatMap((mood) => (byMood[mood] ?? []).map((text) => ({ text, mood })));
}

export const EXCHANGES: readonly ExchangeLine[][] = data.exchanges;

/** How long a bubble stays up: long enough to read. */
export function lineMs(text: string): number {
  return Math.min(4200, Math.max(2200, 1600 + text.length * 55));
}
