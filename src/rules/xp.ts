export const XP_PER_PAGE = 1;
export const XP_PER_CHAPTER = 10;
export const XP_PER_BOOK = 50;
export const XP_PER_STREAK_DAY = 5;

export interface ReaderLevel {
  level: number;
  title: string;
  minXp: number;
}

export const LEVELS: ReaderLevel[] = [
  { level: 1, title: 'Bookish Flapper', minXp: 0 },
  { level: 2, title: 'Café Regular', minXp: 60 },
  { level: 3, title: 'Literary Socialite', minXp: 150 },
  { level: 4, title: 'Salon Wit', minXp: 300 },
  { level: 5, title: 'Gallery Habituée', minXp: 500 },
  { level: 6, title: 'Belle of West Egg', minXp: 800 },
];

export function levelForXp(xp: number): ReaderLevel & { next: ReaderLevel | null } {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.minXp) current = l;
  const next = LEVELS.find((l) => l.minXp > xp) ?? null;
  return { ...current, next };
}
