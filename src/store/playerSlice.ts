import type { StateCreator } from 'zustand';
import { DEFAULT_BLOUSE } from '../content';
import type { PlayerRow } from '../db/schema';
import type { AppState } from './index';

export function defaultPlayer(): PlayerRow {
  return {
    id: 'me',
    gilt: 0,
    xp: 0,
    streakDays: 0,
    lastReadDate: null,
    lastStreakDate: null,
    pagesToday: 0,
    currentBlouse: DEFAULT_BLOUSE,
    firstLaunchAt: Date.now(),
  };
}

export interface PlayerSlice {
  player: PlayerRow;
  setPlayer: (player: PlayerRow) => void;
}

export const createPlayerSlice: StateCreator<AppState, [], [], PlayerSlice> = (set) => ({
  player: defaultPlayer(),
  setPlayer: (player) => set({ player }),
});
