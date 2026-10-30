import { db, type BookRow, type BookmarkRow, type HighlightRow, type NormRect, type PlayerRow, type ProgressRow, type SettingsRow } from './schema';
import { GILT_BOOK_BONUS, GILT_CHAPTER_BONUS, GILT_PER_PAGE } from '../rules/gilt';
import { XP_PER_BOOK, XP_PER_CHAPTER, XP_PER_PAGE, XP_PER_STREAK_DAY, levelForXp } from '../rules/xp';
import { applyCountedPage, rollStreakDay } from '../rules/streak';
import { defaultPlayer } from '../store/playerSlice';
import { BLOUSES, DEFAULT_BLOUSE } from '../content';
import { defaultSettings, type Settings } from '../store/settingsSlice';
import type { ReadingStats } from '../rules/unlocks';

export function newId(): string {
  return crypto.randomUUID();
}

// ---------- Books ----------

export async function addBook(book: BookRow): Promise<void> {
  await db.transaction('rw', db.books, db.progress, async () => {
    await db.books.put(book);
    await db.progress.put(emptyProgress(book.id));
  });
}

export async function deleteBook(bookId: string): Promise<void> {
  await db.transaction('rw', [db.books, db.progress, db.highlights, db.bookmarks], async () => {
    await db.books.delete(bookId);
    await db.progress.delete(bookId);
    await db.highlights.where('bookId').equals(bookId).delete();
    await db.bookmarks.where('bookId').equals(bookId).delete();
  });
}

export async function touchBook(bookId: string): Promise<void> {
  await db.books.update(bookId, { lastOpenedAt: Date.now() });
}

// ---------- Progress ----------

export function emptyProgress(bookId: string): ProgressRow {
  return {
    bookId,
    currentPage: 1,
    countedPages: [],
    pagesCounted: 0,
    chaptersCelebrated: [],
    percent: 0,
    finishedAt: null,
    updatedAt: Date.now(),
  };
}

export async function getProgress(bookId: string): Promise<ProgressRow> {
  return (await db.progress.get(bookId)) ?? emptyProgress(bookId);
}

export async function saveCurrentPage(bookId: string, page: number, pageCount: number): Promise<void> {
  const p = await getProgress(bookId);
  await db.progress.put({ ...p, currentPage: page, percent: pageCount ? page / pageCount : 0, updatedAt: Date.now() });
}

export interface CountResult {
  counted: boolean;
  giltEarned: number;
  player: PlayerRow;
  bookFinished: boolean;
  streakEarned: boolean;
}

/** Counts a page that passed the reading timer: Gilt, XP and streak, once per page per book. */
export async function recordCountedPage(bookId: string, page: number, pageCount: number): Promise<CountResult> {
  return db.transaction('rw', db.progress, db.player, async () => {
    const p = await getProgress(bookId);
    const player = await loadPlayer();
    if (p.countedPages.includes(page)) {
      return { counted: false, giltEarned: 0, player, bookFinished: false, streakEarned: false };
    }
    const countedPages = [...p.countedPages, page].sort((a, b) => a - b);
    // A book is finished when its last page is counted and most of it has been read.
    const bookFinished = !p.finishedAt && page === pageCount && countedPages.length >= pageCount * 0.6;
    const { state, streakEarned } = applyCountedPage(player);
    let gilt = GILT_PER_PAGE;
    let xp = XP_PER_PAGE + (streakEarned ? XP_PER_STREAK_DAY : 0);
    if (bookFinished) {
      gilt += GILT_BOOK_BONUS;
      xp += XP_PER_BOOK;
    }
    const nextPlayer: PlayerRow = { ...player, ...state, gilt: player.gilt + gilt, xp: player.xp + xp };
    await db.player.put(nextPlayer);
    await db.progress.put({
      ...p,
      countedPages,
      pagesCounted: countedPages.length,
      finishedAt: bookFinished ? Date.now() : p.finishedAt,
      updatedAt: Date.now(),
    });
    return { counted: true, giltEarned: gilt, player: nextPlayer, bookFinished, streakEarned };
  });
}

/** Pays the chapter-end bonus once per chapter. Returns the bonus (0 if already celebrated). */
export async function celebrateChapter(bookId: string, chapterIndex: number): Promise<{ bonus: number; player: PlayerRow }> {
  return db.transaction('rw', db.progress, db.player, async () => {
    const p = await getProgress(bookId);
    const player = await loadPlayer();
    if (p.chaptersCelebrated.includes(chapterIndex)) return { bonus: 0, player };
    const nextPlayer = { ...player, gilt: player.gilt + GILT_CHAPTER_BONUS, xp: player.xp + XP_PER_CHAPTER };
    await db.player.put(nextPlayer);
    await db.progress.put({ ...p, chaptersCelebrated: [...p.chaptersCelebrated, chapterIndex], updatedAt: Date.now() });
    return { bonus: GILT_CHAPTER_BONUS, player: nextPlayer };
  });
}

// ---------- Highlights (Quote Pearls) & bookmarks ----------

export async function addHighlight(bookId: string, page: number, text: string, rects: NormRect[]): Promise<HighlightRow> {
  const row: HighlightRow = { id: newId(), bookId, page, text, rects, createdAt: Date.now() };
  await db.highlights.add(row);
  return row;
}

export async function deleteHighlight(id: string): Promise<void> {
  await db.highlights.delete(id);
}

/** Adds a bookmark on `page`, or removes it if one is there. Returns the new row or null. */
export async function toggleBookmark(bookId: string, page: number, label: string): Promise<BookmarkRow | null> {
  const existing = await db.bookmarks.where('[bookId+page]').equals([bookId, page]).first();
  if (existing) {
    await db.bookmarks.delete(existing.id);
    return null;
  }
  const row: BookmarkRow = { id: newId(), bookId, page, label, createdAt: Date.now() };
  await db.bookmarks.add(row);
  return row;
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id);
}

// ---------- Player & settings ----------

export async function loadPlayer(): Promise<PlayerRow> {
  const row = await db.player.get('me');
  // A blouse that has left the wardrobe gives way to her default one.
  if (row) return { ...row, ...rollStreakDay(row), currentBlouse: BLOUSES.some((b) => b.id === row.currentBlouse) ? row.currentBlouse : DEFAULT_BLOUSE };
  const fresh = defaultPlayer();
  await db.player.put(fresh);
  return fresh;
}

export async function savePlayerBlouse(blouseId: PlayerRow['currentBlouse']): Promise<PlayerRow> {
  const player = await loadPlayer();
  const next = { ...player, currentBlouse: blouseId };
  await db.player.put(next);
  return next;
}

export async function loadSettings(): Promise<Settings | null> {
  const row = await db.settings.get('settings');
  if (!row) return null;
  const { id: _id, ...rest } = row;
  return { ...defaultSettings(), ...rest };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const row: SettingsRow = { id: 'settings', ...settings };
  await db.settings.put(row);
}

// ---------- Inventory: Art Cards, badges, blouses ----------

export const itemKey = {
  artCard: (pieceId: string) => `art:${pieceId}`,
  badge: (museumId: string) => `badge:${museumId}`,
  blouse: (blouseId: string) => `blouse:${blouseId}`,
};

export interface ArtCardResult {
  newCard: boolean;
  badgeEarned: boolean;
  blouseEarned: string | null;
}

/** Studies a piece: adds its Art Card; seeing every piece in the museum earns the badge (and its blouse, if it has one). */
export async function collectArtCard(pieceId: string, museumPieceIds: string[], museumId: string, rewardBlouse?: string): Promise<ArtCardResult> {
  return db.transaction('rw', db.inventory, async () => {
    const key = itemKey.artCard(pieceId);
    const had = await db.inventory.get(key);
    if (!had) await db.inventory.put({ itemId: key, type: 'artCard', acquiredAt: Date.now() });
    const seen = await db.inventory.bulkGet(museumPieceIds.map(itemKey.artCard));
    const complete = seen.every(Boolean);
    const hasBadge = await db.inventory.get(itemKey.badge(museumId));
    if (complete && !hasBadge) {
      await db.inventory.put({ itemId: itemKey.badge(museumId), type: 'badge', acquiredAt: Date.now() });
      if (rewardBlouse) await db.inventory.put({ itemId: itemKey.blouse(rewardBlouse), type: 'blouse', acquiredAt: Date.now() });
      return { newCard: !had, badgeEarned: true, blouseEarned: rewardBlouse ?? null };
    }
    return { newCard: !had, badgeEarned: false, blouseEarned: null };
  });
}

/** Buys a blouse with Gilt. Returns the new player, or null if Gilt is short. */
export async function buyBlouse(blouseId: string, price: number): Promise<PlayerRow | null> {
  return db.transaction('rw', db.player, db.inventory, async () => {
    const player = await loadPlayer();
    if (player.gilt < price) return null;
    const next = { ...player, gilt: player.gilt - price };
    await db.player.put(next);
    await db.inventory.put({ itemId: itemKey.blouse(blouseId), type: 'blouse', acquiredAt: Date.now() });
    return next;
  });
}

export const RUSH_GILT_PER_ROUND = 1;
export const RUSH_PAID_ROUNDS_PER_DAY = 3;

/**
 * Morning Rush tips: at most 1 Gilt per 60-second round and three paid rounds a day —
 * below what the same minutes of reading earn, so reading stays the main path.
 */
export async function payRushTips(served: number, today: string): Promise<{ gilt: number; player: PlayerRow }> {
  return db.transaction('rw', db.player, async () => {
    const player = await loadPlayer();
    const count = player.rushPaidDate === today ? (player.rushPaidCount ?? 0) : 0;
    const gilt = served >= 6 && count < RUSH_PAID_ROUNDS_PER_DAY ? RUSH_GILT_PER_ROUND : 0;
    const next = { ...player, gilt: player.gilt + gilt, rushPaidDate: today, rushPaidCount: count + (gilt ? 1 : 0) };
    await db.player.put(next);
    return { gilt, player: next };
  });
}

// ---------- Stats ----------

export async function readingStats(): Promise<ReadingStats & { books: number; highlights: number; bookmarks: number }> {
  const [progress, player, books, highlights, bookmarks] = await Promise.all([
    db.progress.toArray(),
    loadPlayer(),
    db.books.count(),
    db.highlights.count(),
    db.bookmarks.count(),
  ]);
  return {
    pagesCounted: progress.reduce((n, p) => n + p.pagesCounted, 0),
    chaptersFinished: progress.reduce((n, p) => n + p.chaptersCelebrated.length, 0),
    booksFinished: progress.filter((p) => p.finishedAt).length,
    gilt: player.gilt,
    level: levelForXp(player.xp).level,
    books,
    highlights,
    bookmarks,
  };
}
