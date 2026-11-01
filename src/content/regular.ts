/**
 * Mert, the café regular (a customer, never a player character): his entry in npcs.json and the
 * rules the café and his dialogue share. His id, textures and events say `matt` (his sprite pack's
 * name); what players read says his name, Mert.
 */
import npcs from './npcs.json';

export type RegularMood = 'calm' | 'busy' | 'stressed';
export type CupGrade = 'perfect' | 'good' | 'messy';
/** What a line is about: the room or the music turn his head (matt_cu_look); a missed deadline is the sad still. */
export type LineAbout = 'room' | 'music' | 'deadline' | 'missed';

export interface RegularLine {
  text: string;
  about?: LineAbout;
}

type RawLine = string | RegularLine;

interface RegularDef {
  id: 'matt';
  name: string;
  role: string;
  /** His folder under assets/sprites/ and the start of his texture keys. */
  portraitBase: string;
  /** Jason's recurring order for him: about one in `every` orders. */
  usual: { drink: string; every: number };
  lines: Record<RegularMood | 'thanks', RawLine[]> & { latte: Record<CupGrade, RawLine[]> };
}

export const REGULAR = npcs.matt as RegularDef;

/** Jason's recurring order, named after him ("Mert's usual"). */
export const USUAL_NAME = `${REGULAR.name}'s usual`;

/**
 * A table refill's tip, in the player's own currency: a quarter of a Morning Rush order. A good
 * cup tips 5, so a quarter is about 1, which is also the smallest coin there is.
 */
export const REFILL_TIP = 1;

/** After 21:00 on the device clock he's stressed, whatever he's doing. */
export const STRESSED_FROM_HOUR = 21;
/** An empty mug for longer than this stresses him too. */
export const STRESSED_EMPTY_MS = 2 * 60_000;
/** A line longer than this gets the close-up with body movement (matt_cu_micro). */
export const LONG_LINE = 90;
/** Talking to him this soon after a refill, he's still sipping (matt_cu_sip). */
export const JUST_REFILLED_MS = 20_000;

export function asLine(raw: RawLine): RegularLine {
  return typeof raw === 'string' ? { text: raw } : raw;
}

export function linesFor(kind: RegularMood | 'thanks'): RegularLine[] {
  return REGULAR.lines[kind].map(asLine);
}

export function latteLines(grade: CupGrade): RegularLine[] {
  return REGULAR.lines.latte[grade].map(asLine);
}

/** Stressed late in the evening or after a long wait with an empty mug; busy while he types; calm otherwise. */
export function regularMood(o: { hour: number; typing: boolean; emptyForMs: number | null }): RegularMood {
  if (o.hour >= STRESSED_FROM_HOUR || (o.emptyForMs !== null && o.emptyForMs > STRESSED_EMPTY_MS)) return 'stressed';
  return o.typing ? 'busy' : 'calm';
}

/**
 * The device clock his day follows. Dev builds can start it elsewhere for a test, with
 * `localStorage['gp.regularClock']` = an ISO time (it runs on from there).
 */
const clockShift = (() => {
  if (!import.meta.env?.DEV || typeof localStorage === 'undefined') return 0;
  try {
    const at = localStorage.getItem('gp.regularClock');
    const t = at ? Date.parse(at) : NaN;
    return Number.isFinite(t) ? t - Date.now() : 0;
  } catch {
    return 0;
  }
})();

export function regularNow(): Date {
  return new Date(Date.now() + clockShift);
}

/** The close-ups (texture matt_closeup) and the emotion stills (under assets/sprites/matt/portraits/). */
export type CloseUp = { kind: 'anim'; anim: 'matt_cu_idle' | 'matt_cu_look' | 'matt_cu_sip' | 'matt_cu_micro' } | { kind: 'still'; still: 'anxious' | 'stressed' | 'sad' };

/**
 * The picture beside a line. Busy and stressed lines show a still (anxious, stressed, sad for a
 * missed deadline) instead of the animated close-up; calm ones sip right after a refill, look
 * around for a line about the room or the music, move a little on a long line, and idle otherwise.
 */
export function closeUpFor(mood: RegularMood, line: RegularLine, justRefilled: boolean): CloseUp {
  if (line.about === 'missed') return { kind: 'still', still: 'sad' };
  if (mood === 'busy') return { kind: 'still', still: 'anxious' };
  if (mood === 'stressed') return { kind: 'still', still: 'stressed' };
  if (justRefilled) return { kind: 'anim', anim: 'matt_cu_sip' };
  if (line.about === 'room' || line.about === 'music') return { kind: 'anim', anim: 'matt_cu_look' };
  if (line.text.length > LONG_LINE) return { kind: 'anim', anim: 'matt_cu_micro' };
  return { kind: 'anim', anim: 'matt_cu_idle' };
}

/**
 * Lines without repeats: no line comes again until every other line of its pool has been said
 * since. The first time round the order is random; after that it keeps that order (the only
 * way never to repeat early).
 */
export class LineBag {
  private order = new Map<string, number[]>();
  private at = new Map<string, number>();

  constructor(private readonly rng: () => number = Math.random) {}

  next<T>(key: string, pool: readonly T[]): T {
    if (!pool.length) throw new Error(`no lines for ${key}`);
    let order = this.order.get(key);
    if (!order || order.length !== pool.length) {
      order = pool.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      this.order.set(key, order);
      this.at.set(key, 0);
    }
    const at = this.at.get(key) ?? 0;
    this.at.set(key, (at + 1) % order.length);
    return pool[order[at]];
  }
}

/** What he says in the dialogue panel and over his head, shared by the whole café. */
export const regularLines = new LineBag();
