/**
 * Charts: what the player hits. A chart is JSON (loaded, or made by ChartGen from a song) and
 * is validated on load — notes in range, the right fields per type, and no two notes
 * overlapping in one lane (a hold, scratch or slide occupies its lane until it ends).
 */
export type NoteType = 'tap' | 'hold' | 'scratch' | 'fade' | 'double' | 'slide';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
/** Easy 2 lanes, Normal 3, Hard 4, Expert 4 plus the special notes. */
export const LANES: Record<Difficulty, number> = { easy: 2, normal: 3, hard: 4, expert: 4 };

export interface ChartNote {
  /** Song time, ms. */
  t: number;
  lane: number;
  type: NoteType;
  /** hold, scratch, slide. */
  len?: number;
  /** fade: the crossfade's direction. */
  dir?: 'L' | 'R';
  /** double: the second string; slide: the lane it slides to. */
  lane2?: number;
}

export interface Chart {
  id: string;
  title: string;
  composer: string;
  bpm: number;
  /** Where the first bar starts (after the count-in). */
  offsetMs: number;
  durationMs: number;
  timeSignature: string;
  /** An audio file under public/ … */
  audio?: string;
  /** … or a Synth song id. */
  synth?: string;
  difficulties: Record<Difficulty, ChartNote[]>;
}

const NEEDS_LEN: NoteType[] = ['hold', 'scratch', 'slide'];

/** Every problem with a chart (empty when it is fine). */
export function validateChart(c: Chart): string[] {
  const errs: string[] = [];
  if (!c.id) errs.push('no id');
  if (!(c.bpm > 0)) errs.push('bpm must be > 0');
  if (!c.audio && !c.synth) errs.push('needs audio or synth');
  for (const d of DIFFICULTIES) {
    const notes = c.difficulties?.[d];
    if (!Array.isArray(notes)) {
      errs.push(`${d}: missing`);
      continue;
    }
    const lanes = LANES[d];
    const busyUntil = new Array<number>(lanes).fill(-Infinity);
    const lastStart = new Array<number>(lanes).fill(-Infinity);
    const sorted = [...notes].sort((a, b) => a.t - b.t);
    sorted.forEach((n, i) => {
      const at = `${d}[${i}] @${Math.round(n.t)}ms`;
      if (!Number.isFinite(n.t) || n.t < 0) errs.push(`${at}: bad time`);
      if (!['tap', 'hold', 'scratch', 'fade', 'double', 'slide'].includes(n.type)) errs.push(`${at}: unknown type ${n.type}`);
      if (n.type === 'fade') {
        if (n.dir !== 'L' && n.dir !== 'R') errs.push(`${at}: fade needs dir L or R`);
        return;
      }
      if (!(n.lane >= 0 && n.lane < lanes)) errs.push(`${at}: lane ${n.lane} out of 0..${lanes - 1}`);
      if (NEEDS_LEN.includes(n.type) && !(n.len! > 0)) errs.push(`${at}: ${n.type} needs len > 0`);
      if ((n.type === 'double' || n.type === 'slide') && !(n.lane2! >= 0 && n.lane2! < lanes && n.lane2 !== n.lane)) errs.push(`${at}: ${n.type} needs another lane2`);
      if ((n.type === 'double' || n.type === 'slide') && (d === 'easy' || d === 'normal')) errs.push(`${at}: ${n.type} is for Hard and Expert`);
      if ((n.type === 'scratch' || n.type === 'slide') && d !== 'expert') errs.push(`${at}: ${n.type} is for Expert`);
      for (const lane of noteLanes(n)) {
        if (lane < 0 || lane >= lanes) continue;
        // Overlapping, or two notes at the same moment in one lane.
        if (n.t < busyUntil[lane] - 0.5 || n.t - lastStart[lane] < 1) errs.push(`${at}: overlaps the note before it in lane ${lane}`);
        busyUntil[lane] = Math.max(busyUntil[lane], noteEnd(n));
        lastStart[lane] = n.t;
      }
    });
  }
  return errs;
}

/** The lanes a note occupies. */
export function noteLanes(n: ChartNote): number[] {
  if (n.type === 'fade') return [];
  return n.type === 'double' || n.type === 'slide' ? [n.lane, n.lane2!] : [n.lane];
}

export function noteEnd(n: ChartNote): number {
  return n.t + (n.len ?? 0);
}

/** Parses and validates; throws with every problem listed. */
export function loadChart(json: unknown): Chart {
  const c = (typeof json === 'string' ? JSON.parse(json) : json) as Chart;
  const errs = validateChart(c);
  if (errs.length) throw new Error(`Invalid chart ${c?.id ?? '?'}:\n${errs.slice(0, 20).join('\n')}`);
  for (const d of DIFFICULTIES) c.difficulties[d].sort((a, b) => a.t - b.t);
  return c;
}

/** Fetches a chart JSON from public/ and validates it. */
export async function fetchChart(url: string): Promise<Chart> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`chart ${url}: ${r.status}`);
  return loadChart(await r.json());
}
