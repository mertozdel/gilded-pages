import Phaser from 'phaser';
import { useStore } from '../store';
import { bus, type BusEvents } from '../bus/events';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { FestivalScene } from './scenes/FestivalScene';

let game: Phaser.Game | null = null;

/**
 * Creates the single Phaser instance: a 640×360-based canvas at a whole-number zoom, filling
 * the window under the React UI (transparent, click-through), alive for the whole session.
 */
export function mountGame(parent: HTMLElement): Phaser.Game {
  if (game) return game;
  const ps = useStore.getState().pixel!;

  game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    transparent: true,
    pixelArt: true,
    roundPixels: true,
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: {
      mode: Phaser.Scale.NONE,
      width: ps.gameWidth,
      height: ps.gameHeight,
      zoom: ps.cssZoom,
    },
    scene: [BootScene, WorldScene, FestivalScene],
  });

  const g = game;

  // Follow the shared pixel scale (one resize listener lives in pixelScale.ts): a
  // whole-number zoom, with the canvas filling the window at that zoom.
  useStore.subscribe((s, prev) => {
    const p = s.pixel;
    if (!p || p === prev.pixel) return;
    g.scale.resize(p.gameWidth, p.gameHeight);
    g.scale.setZoom(p.cssZoom);
  });

  // Text-only mode: no world, no character — hide the canvas and stop the loop entirely.
  const applyMode = () => {
    const textOnly = useStore.getState().settings.readingMode === 'text';
    parent.style.visibility = textOnly ? 'hidden' : 'visible';
    if (textOnly) g.loop.sleep();
    else if (!document.hidden) g.loop.wake();
  };
  bus.on('mode:change', applyMode);
  applyMode();

  // A venue screen shows the festival scene (over the world, which has no room there).
  const showVenue = ({ venue, setlist }: BusEvents['venue:show']) => {
    if (g.scene.getScene('festival') && (g.scene.isActive('festival') || g.scene.isPaused('festival'))) g.scene.stop('festival');
    if (venue) g.scene.start('festival', { venue, setlist });
  };
  bus.on('venue:show', showVenue);
  const pendingVenue = bus.last('venue:show');
  if (pendingVenue?.venue) showVenue(pendingVenue);

  // The loop pauses whenever the tab is hidden (Phaser does this too; we make it explicit).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) g.loop.sleep();
    else applyMode();
  });

  return game;
}

export function getGame(): Phaser.Game | null {
  return game;
}
