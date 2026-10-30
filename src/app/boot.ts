import { bus } from '../bus/events';
import { loadPlayer, loadSettings, saveSettings } from '../db/queries';
import { loadProfiles } from '../db/profiles';
import { useStore } from '../store';
import { characterForRoute, sceneForRoute } from '../store/routeSlice';
import { initSfx } from '../audio/sfx';
import { initMusic } from '../audio/music';
import { initRouter } from './router';
import { initIdleTicker } from './idle';
import { db } from '../db/schema';
import { earn } from '../db/profiles';

/** Loads the saved profile and settings from IndexedDB and wires store ↔ bus. */
export async function boot(): Promise<void> {
  const [settings, player, profiles] = await Promise.all([loadSettings(), loadPlayer(), loadProfiles()]);
  const st = useStore.getState();
  if (settings) st.setSettings(settings);
  st.setPlayer(player);
  st.setProfiles(profiles);
  // The select screen (and Settings) have no character of their own: the last pick.
  if (!characterForRoute(st.route)) st.setCharacter(useStore.getState().settings.lastCharacter);

  // Persist settings; announce reading-mode changes to the game.
  let saveTimer = 0;
  useStore.subscribe((s, prev) => {
    if (s.settings === prev.settings) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveSettings(useStore.getState().settings), 200);
    if (s.settings.readingMode !== prev.settings.readingMode) bus.emit('mode:change', { mode: s.settings.readingMode });
  });

  // Each route is a scene Roxy walks into.
  useStore.subscribe((s, prev) => {
    if (s.route === prev.route) return;
    const scene = sceneForRoute(s.route);
    if (scene !== sceneForRoute(prev.route)) bus.emit('scene:enter', { scene });
  });
  bus.emit('scene:enter', { scene: sceneForRoute(useStore.getState().route) });
  bus.emit('mode:change', { mode: useStore.getState().settings.readingMode });

  // Dev builds: the app's own store, bus and database for the end-to-end tests and the console
  // (importing the modules again can give another copy of them after a hot reload).
  if (import.meta.env.DEV) (window as unknown as { __app?: unknown }).__app = { useStore, bus, db, earn };

  initRouter();
  initIdleTicker();
  initSfx();
  initMusic();
  st.setBooted(true);
}
