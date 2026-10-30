import { CHARACTER_IDS, type CharacterId } from '../content/characters';
import { isoWeek } from '../rules/week';
import { db, emptyProfile, type PhotoRow, type ProfileRow, type ResultLogRow } from './schema';

export type Profiles = Record<CharacterId, ProfileRow>;

/** Every character's profile; any that is missing (a fresh install skips the v2 upgrade) is created. */
export async function loadProfiles(): Promise<Profiles> {
  return db.transaction('rw', db.profiles, async () => {
    const out = {} as Profiles;
    for (const id of CHARACTER_IDS) {
      let row = await db.profiles.get(id);
      if (!row) {
        row = emptyProfile(id);
        await db.profiles.put(row);
      }
      out[id] = { ...emptyProfile(id), ...row };
    }
    return out;
  });
}

/** Read-modify-write one profile in a transaction. */
export async function updateProfile(id: CharacterId, fn: (p: ProfileRow) => ProfileRow): Promise<ProfileRow> {
  return db.transaction('rw', db.profiles, async () => {
    const cur = { ...emptyProfile(id), ...((await db.profiles.get(id)) ?? {}) };
    const next = fn(cur);
    await db.profiles.put(next);
    return next;
  });
}

export function touchProfile(id: CharacterId): Promise<ProfileRow> {
  return updateProfile(id, (p) => ({ ...p, lastPlayed: Date.now() }));
}

const LOG_KEEP = 60;

export interface EarnResult {
  profile: ProfileRow;
  /** True when `bestKey` beat its old best. */
  newBest: boolean;
}

/**
 * Pays a character's own currency (never Roxy's Gilt) and logs the result for weekly bests.
 * `bestKey` (a song, a pattern…) keeps the highest `score` seen for it.
 */
export async function earn(id: CharacterId, amount: number, score: number, bestKey: string, stats: Record<string, number> = {}): Promise<EarnResult> {
  let newBest = false;
  const profile = await updateProfile(id, (p) => {
    const bests = { ...p.bests };
    newBest = score > (bests[bestKey] ?? 0);
    if (newBest) bests[bestKey] = score;
    const nextStats = { ...p.stats };
    for (const [k, v] of Object.entries(stats)) nextStats[k] = (nextStats[k] ?? 0) + v;
    const entry: ResultLogRow = { at: Date.now(), week: isoWeek(new Date()), score, earned: amount, key: bestKey };
    return { ...p, currency: p.currency + amount, bests, stats: nextStats, log: [...p.log, entry].slice(-LOG_KEEP), lastPlayed: Date.now() };
  });
  return { profile, newBest };
}

/** Raises a stat to at least `value` (a best that isn't tied to one key). */
export async function raiseBest(id: CharacterId, key: string, value: number): Promise<ProfileRow> {
  return updateProfile(id, (p) => (value > (p.bests[key] ?? -Infinity) ? { ...p, bests: { ...p.bests, [key]: value } } : p));
}

export async function addUnlock(id: CharacterId, unlock: string): Promise<ProfileRow> {
  return updateProfile(id, (p) => (p.unlocks.includes(unlock) ? p : { ...p, unlocks: [...p.unlocks, unlock] }));
}

const BOARD_KEEP = 12;

/** Pins a cup to Jason's photo board (newest first, the twelve best kept). */
export async function pinPhoto(id: CharacterId, photo: PhotoRow): Promise<ProfileRow> {
  return updateProfile(id, (p) => ({ ...p, collection: [photo, ...p.collection].slice(0, BOARD_KEEP) }));
}

/** This week's best earned in one go, for the Twin Battle board. */
export function weekBest(p: ProfileRow, week = isoWeek(new Date())): number {
  return p.log.filter((l) => l.week === week).reduce((m, l) => Math.max(m, l.earned), 0);
}
