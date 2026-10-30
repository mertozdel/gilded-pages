import { db } from './schema';
import { readingStats } from './queries';
import { useLive } from './useLive';

/** Live reading stats (pages, chapters, books, Gilt, level) for unlocks and the ledger. */
export function useStats() {
  return useLive(() => readingStats(), []);
}

/** Item ids the player owns (Art Cards, badges, blouses). */
export function useOwned(): Set<string> | undefined {
  const rows = useLive(() => db.inventory.toArray(), []);
  return rows ? new Set(rows.map((r) => r.itemId)) : undefined;
}
