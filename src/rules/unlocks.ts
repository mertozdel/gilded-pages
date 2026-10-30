import type { LocationDef, UnlockRule } from '../content';

export interface ReadingStats {
  pagesCounted: number;
  chaptersFinished: number;
  booksFinished: number;
  gilt: number;
  level: number;
}

/**
 * Everything is open from the start: every place on Roxy's map, every museum, record and top in
 * her wardrobe, and every one of Jason's latte arts. Reading still earns Gilt and Jason's cups
 * still earn tips. Set to false to bring the unlocks back (the rules below are kept for that).
 */
export const EVERYTHING_OPEN = true;

type Progress = { done: boolean; have: number; need: number; label: string };

export function ruleProgress(rule: UnlockRule, stats: ReadingStats): Progress {
  const p = progress(rule, stats);
  return EVERYTHING_OPEN ? { ...p, done: true } : p;
}

function progress(rule: UnlockRule, stats: ReadingStats): Progress {
  switch (rule.kind) {
    case 'start':
      return { done: true, have: 1, need: 1, label: 'Open from the start' };
    case 'pages':
      return { done: stats.pagesCounted >= rule.count, have: stats.pagesCounted, need: rule.count, label: `Read ${rule.count} pages` };
    case 'chapters':
      return { done: stats.chaptersFinished >= rule.count, have: stats.chaptersFinished, need: rule.count, label: `Finish ${rule.count} chapters` };
    case 'books':
      return { done: stats.booksFinished >= rule.count, have: stats.booksFinished, need: rule.count, label: `Finish ${rule.count} book${rule.count > 1 ? 's' : ''}` };
    case 'gilt':
      return { done: stats.gilt >= rule.count, have: stats.gilt, need: rule.count, label: `Hold ${rule.count} Gilt` };
    case 'level':
      return { done: stats.level >= rule.count, have: stats.level, need: rule.count, label: `Reach reader level ${rule.count}` };
    case 'all': {
      const parts = rule.rules.map((r) => progress(r, stats));
      const firstOpen = parts.find((p) => !p.done) ?? parts[parts.length - 1];
      return { done: parts.every((p) => p.done), have: firstOpen.have, need: firstOpen.need, label: parts.map((p) => p.label).join(' and ') };
    }
  }
}

export function isUnlocked(loc: LocationDef, stats: ReadingStats): boolean {
  return ruleProgress(loc.unlock, stats).done;
}
