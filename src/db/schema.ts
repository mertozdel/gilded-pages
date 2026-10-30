import Dexie, { type EntityTable } from 'dexie';
import type { BlouseId } from '../content';
import type { ReadingMode } from '../bus/events';
import { CHARACTER_IDS, type CharacterId } from '../content/characters';

export interface OutlineEntry {
  title: string;
  page: number;
  depth: number;
}

export interface Chapter {
  title: string;
  /** First page of the chapter, 1-based. */
  page: number;
}

export interface BookRow {
  id: string;
  title: string;
  author: string;
  fileName: string;
  fileSize: number;
  /** The PDF itself. Stays on the device; nothing goes to a server in v1. */
  fileBlob: Blob;
  pageCount: number;
  outline: OutlineEntry[];
  chapters: Chapter[];
  wordsPerPage: number[];
  coverThumb: Blob | null;
  spineColor: string;
  addedAt: number;
  lastOpenedAt: number | null;
}

export interface ProgressRow {
  bookId: string;
  currentPage: number;
  /** Pages that passed the honest-reading timer, so Gilt is earned once per page. */
  countedPages: number[];
  pagesCounted: number;
  /** Chapter indexes whose end has been celebrated (bonus Gilt paid). */
  chaptersCelebrated: number[];
  percent: number;
  finishedAt: number | null;
  updatedAt: number;
}

/** A rectangle normalised to the page box (0..1), so highlights survive zoom changes. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HighlightRow {
  id: string;
  bookId: string;
  page: number;
  text: string;
  rects: NormRect[];
  createdAt: number;
}

export interface BookmarkRow {
  id: string;
  bookId: string;
  page: number;
  label: string;
  createdAt: number;
}

export interface PlayerRow {
  id: 'me';
  gilt: number;
  xp: number;
  streakDays: number;
  /** Local date (YYYY-MM-DD) of the last day with at least one counted page. */
  lastReadDate: string | null;
  /** Local date of the last day that reached the streak minimum. */
  lastStreakDate: string | null;
  pagesToday: number;
  currentBlouse: BlouseId;
  firstLaunchAt: number;
  /** Morning Rush tips are capped per day so reading stays the main path. */
  rushPaidDate?: string | null;
  rushPaidCount?: number;
}

export interface InventoryRow {
  itemId: string;
  type: 'blouse' | 'decor' | 'record' | 'artCard' | 'badge';
  acquiredAt: number;
}

export interface UnlockRow {
  locationId: string;
  unlockedAt: number;
}

export interface QuestStateRow {
  questId: string;
  progress: number;
  done: boolean;
  claimedAt: number | null;
}

export interface SettingsRow {
  id: 'settings';
  readingMode: ReadingMode;
  /** Multiplier on the fit-to-screen page size. */
  fontZoom: number;
  nightMode: boolean;
  /** Master switch for all audio. */
  sound: boolean;
  musicVolume: number;
  sfxVolume: number;
  layout: 'auto' | 'single';
  // ---- shared by every character (added with the crew) ----
  /** Preselected on the character select screen. */
  lastCharacter: CharacterId;
  /** No strobes, at most 3 flashes a second, slower beams, a dimmer floor. Forced on by prefers-reduced-motion. */
  reduceFlashing: boolean;
  /** Rhythm games: measured audio offset (ms, + = the player hears late) and a visual offset. */
  rhythmAudioOffsetMs: number;
  rhythmVisualOffsetMs: number;
  rhythmCalibrated: boolean;
  /** Highway scroll speed multiplier. */
  noteSpeed: number;
  leftHanded: boolean;
  /** A shape per lane as well as a colour (colour-blind safe). */
  laneShapes: boolean;
  noFail: boolean;
  /** Lane keys, left to right (event.code). */
  laneKeys: string[];
  starPowerKey: string;
  latteDifficulty: 'easy' | 'normal' | 'hard';
  /** Latte art assist: the pour gauge fills 30% slower. */
  slowPour: boolean;
}

/** A cup Jason was proud of, pinned to his photo board. */
export interface PhotoRow {
  id: string;
  pattern: string;
  quality: number;
  drink: string;
  /** PNG data URL of the cup (320×320). */
  image: string;
  takenAt: number;
}

/** One finished gig or cup, for weekly bests (the Twin Battle board). */
export interface ResultLogRow {
  at: number;
  /** ISO week, e.g. 2026-W44. */
  week: string;
  score: number;
  earned: number;
  key: string;
}

/**
 * Per-character progress. Roxy's profile is only a link: her Gilt, books, progress,
 * highlights, bookmarks and inventory stay in their own tables (`linked: 'player:me'`).
 */
export interface ProfileRow {
  characterId: CharacterId;
  /** Tips / Fans / Applause. Unused for Roxy, whose Gilt lives in player.gilt. */
  currency: number;
  linked?: 'player:me';
  unlocks: string[];
  bests: Record<string, number>;
  stats: Record<string, number>;
  collection: PhotoRow[];
  log: ResultLogRow[];
  lastPlayed: number | null;
}

export function emptyProfile(characterId: CharacterId): ProfileRow {
  return {
    characterId,
    currency: 0,
    ...(characterId === 'roxy' ? { linked: 'player:me' as const } : {}),
    unlocks: [],
    bests: {},
    stats: {},
    collection: [],
    log: [],
    lastPlayed: null,
  };
}

export class GildedDB extends Dexie {
  books!: EntityTable<BookRow, 'id'>;
  progress!: EntityTable<ProgressRow, 'bookId'>;
  highlights!: EntityTable<HighlightRow, 'id'>;
  bookmarks!: EntityTable<BookmarkRow, 'id'>;
  player!: EntityTable<PlayerRow, 'id'>;
  inventory!: EntityTable<InventoryRow, 'itemId'>;
  unlocks!: EntityTable<UnlockRow, 'locationId'>;
  questStates!: EntityTable<QuestStateRow, 'questId'>;
  settings!: EntityTable<SettingsRow, 'id'>;
  profiles!: EntityTable<ProfileRow, 'characterId'>;

  constructor() {
    super('gilded-pages');
    this.version(1).stores({
      books: 'id, addedAt, lastOpenedAt',
      progress: 'bookId',
      highlights: 'id, bookId, [bookId+page]',
      bookmarks: 'id, bookId, [bookId+page]',
      player: 'id',
      inventory: 'itemId, type',
      unlocks: 'locationId',
      questStates: 'questId',
      settings: 'id',
    });
    // v2 (the crew): one profile per character. Nothing is moved: Roxy's profile only links her
    // existing tables, so every book, page, highlight, bookmark, item and Gilt stays where it was.
    this.version(2)
      .stores({ profiles: 'characterId' })
      .upgrade(async (tx) => {
        const profiles = tx.table<ProfileRow, CharacterId>('profiles');
        for (const id of CHARACTER_IDS) if (!(await profiles.get(id))) await profiles.put(emptyProfile(id));
      });
  }
}

export const db = new GildedDB();
