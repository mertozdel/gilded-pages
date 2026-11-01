/**
 * Writing songs as data, by chord: a chord is its root in semitones above the song's key, and
 * a part is one bar per chord, built by a small function. Melodies are written with `line`
 * (src/game/rhythm/Song.ts). Every song here is an original, only in the style of its genre.
 */

/** Triads of a major key, by root: I ii iii IV V vi vii°. */
const TRIADS: Record<number, number[]> = { 0: [0, 4, 7], 2: [2, 5, 9], 4: [4, 7, 11], 5: [5, 9, 12], 7: [7, 11, 14], 9: [9, 12, 16], 11: [11, 14, 17] };
/** The same with their sevenths (city pop's colour). */
const SEVENTHS: Record<number, number[]> = { 0: [0, 4, 7, 11], 2: [2, 5, 9, 12], 4: [4, 7, 11, 14], 5: [5, 9, 12, 16], 7: [7, 11, 14, 17], 9: [9, 12, 16, 19], 11: [11, 14, 17, 21] };
/** Dominant sevenths (the blues and the boogie): I7, IV7, V7. */
const DOMINANTS: Record<number, number[]> = { 0: [0, 4, 7, 10], 5: [5, 9, 12, 15], 7: [7, 11, 14, 17] };

/** A chord as a track token: its notes joined by commas. */
export function chord(root: number, kind: 'triad' | 'seventh' | 'dominant' = 'triad'): string {
  const table = kind === 'triad' ? TRIADS : kind === 'seventh' ? SEVENTHS : DOMINANTS;
  const notes = table[((root % 12) + 12) % 12];
  if (!notes) throw new Error(`no ${kind} on ${root}`);
  const up = root - (((root % 12) + 12) % 12);
  return notes.map((n) => n + up).join(',');
}

/** One bar per chord, joined into a track. */
export function perBar(chords: number[], bar: (root: number, i: number) => string): string {
  return chords.map((c, i) => bar(c, i).trim()).join('  ');
}

/** The same bar n times (drums). */
export function bars(n: number, bar: string): string {
  return Array(n).fill(bar.trim()).join('  ');
}
