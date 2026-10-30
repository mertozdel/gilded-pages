import type { StateCreator } from 'zustand';
import type { SettingsRow } from '../db/schema';
import type { AppState } from './index';

export type Settings = Omit<SettingsRow, 'id'>;

export function defaultSettings(): Settings {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return {
    // If the device asks for reduced motion, the app starts in Calm.
    readingMode: reduced ? 'calm' : 'gala',
    fontZoom: 1,
    nightMode: false,
    sound: true,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    layout: 'auto',
    lastCharacter: 'roxy',
    reduceFlashing: true,
    rhythmAudioOffsetMs: 0,
    rhythmVisualOffsetMs: 0,
    rhythmCalibrated: false,
    noteSpeed: 1,
    leftHanded: false,
    laneShapes: true,
    noFail: false,
    laneKeys: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    starPowerKey: 'Space',
    latteDifficulty: 'normal',
    slowPour: false,
  };
}

/** Reduce flashing is forced on while the device asks for reduced motion. */
export function flashingReduced(s: Settings): boolean {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return s.reduceFlashing || !!reduced;
}

export interface SettingsSlice {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set) => ({
  settings: defaultSettings(),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
});
