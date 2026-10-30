import { create } from 'zustand';
import { createCharacterSlice, type CharacterSlice } from './characterSlice';
import { createPlayerSlice, type PlayerSlice } from './playerSlice';
import { createRouteSlice, type RouteSlice } from './routeSlice';
import { createSettingsSlice, type SettingsSlice } from './settingsSlice';
import { createUiSlice, type UiSlice } from './uiSlice';

export type AppState = SettingsSlice & PlayerSlice & RouteSlice & UiSlice & CharacterSlice;

/** One small store that both React (hooks) and Phaser (`useStore.subscribe`) read. */
export const useStore = create<AppState>()((...a) => ({
  ...createSettingsSlice(...a),
  ...createPlayerSlice(...a),
  ...createRouteSlice(...a),
  ...createUiSlice(...a),
  ...createCharacterSlice(...a),
}));

export type { Route } from './routeSlice';
export type { Settings } from './settingsSlice';
