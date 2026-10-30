import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

/** The v1 schema exactly as it shipped before the crew. */
const V1 = {
  books: 'id, addedAt, lastOpenedAt',
  progress: 'bookId',
  highlights: 'id, bookId, [bookId+page]',
  bookmarks: 'id, bookId, [bookId+page]',
  player: 'id',
  inventory: 'itemId, type',
  unlocks: 'locationId',
  questStates: 'questId',
  settings: 'id',
};

describe('Dexie v2 migration (profiles)', () => {
  it("keeps every one of Roxy's rows and links her profile", async () => {
    const old = new Dexie('gilded-pages');
    old.version(1).stores(V1);
    await old.open();
    await old.table('books').put({ id: 'b1', title: 'Gatsby', author: 'F. Scott Fitzgerald', fileBlob: null, pageCount: 3, addedAt: 1, lastOpenedAt: 2 });
    await old.table('progress').put({ bookId: 'b1', currentPage: 2, countedPages: [1, 2], pagesCounted: 2, chaptersCelebrated: [0], percent: 0.66, finishedAt: null, updatedAt: 3 });
    await old.table('highlights').put({ id: 'h1', bookId: 'b1', page: 1, text: 'So we beat on', rects: [], createdAt: 4 });
    await old.table('bookmarks').put({ id: 'k1', bookId: 'b1', page: 2, label: 'p2', createdAt: 5 });
    await old.table('player').put({ id: 'me', gilt: 123, xp: 40, streakDays: 2, lastReadDate: null, lastStreakDate: null, pagesToday: 0, currentBlouse: 'emerald-bow', firstLaunchAt: 1 });
    await old.table('inventory').put({ itemId: 'blouse:emerald-bow', type: 'blouse', acquiredAt: 6 });
    await old.table('settings').put({ id: 'settings', readingMode: 'calm', fontZoom: 1.2, nightMode: true, sound: true, musicVolume: 0.3, sfxVolume: 0.7, layout: 'auto' });
    old.close();

    const { db } = await import('../../src/db/schema');
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.books.get('b1')).toMatchObject({ title: 'Gatsby' });
    expect(await db.progress.get('b1')).toMatchObject({ currentPage: 2, pagesCounted: 2 });
    expect(await db.highlights.count()).toBe(1);
    expect(await db.bookmarks.count()).toBe(1);
    expect(await db.player.get('me')).toMatchObject({ gilt: 123, currentBlouse: 'emerald-bow' });
    expect(await db.inventory.get('blouse:emerald-bow')).toBeTruthy();
    expect(await db.settings.get('settings')).toMatchObject({ readingMode: 'calm', fontZoom: 1.2 });

    const roxy = await db.profiles.get('roxy');
    expect(roxy).toMatchObject({ characterId: 'roxy', linked: 'player:me', currency: 0 });
    for (const id of ['jason', 'joel', 'jonas'] as const) expect(await db.profiles.get(id)).toMatchObject({ characterId: id, currency: 0, unlocks: [] });

    // Old settings rows get the new shared settings from the defaults.
    const { loadSettings } = await import('../../src/db/queries');
    const s = await loadSettings();
    expect(s).toMatchObject({ readingMode: 'calm', fontZoom: 1.2, lastCharacter: 'roxy', reduceFlashing: true, laneKeys: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'] });

    // Earning a crew currency never touches Roxy's Gilt.
    const { earn, loadProfiles, weekBest } = await import('../../src/db/profiles');
    const r = await earn('joel', 42, 9000, 'song:test');
    expect(r.profile.currency).toBe(42);
    expect(r.newBest).toBe(true);
    expect(weekBest(r.profile)).toBe(42);
    expect((await db.player.get('me'))!.gilt).toBe(123);
    const all = await loadProfiles();
    expect(Object.keys(all).sort()).toEqual(['jason', 'joel', 'jonas', 'roxy']);
  });
});
