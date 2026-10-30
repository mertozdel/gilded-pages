import { useStore } from '../store';
import type { PixelScale } from '../store/uiSlice';

/** The fixed internal resolution: 3× is exactly 1920×1080. */
export const GAME_W = 640;
export const GAME_H = 360;

/**
 * The largest whole number of *device* pixels per game pixel at which 640×360 fits the
 * viewport, so the pixel art stays crisp at 125% / 150% display scaling too. At that zoom
 * the canvas then grows to fill the whole window (exactly 640×360 on a 16:9 screen), so
 * there are never bars around the world.
 */
export function computePixelScale(vw: number, vh: number, dpr: number, mode: PixelMode = 'grid'): PixelScale {
  if (mode === 'native') {
    // Painted rooms: one game px per device px, so the painting keeps all its detail.
    return { devicePxPerGamePx: 1, cssZoom: 1 / dpr, gameWidth: Math.ceil(vw * dpr), gameHeight: Math.ceil(vh * dpr), offsetX: 0, offsetY: 0 };
  }
  const devicePxPerGamePx = Math.max(1, Math.floor(Math.min((vw * dpr) / GAME_W, (vh * dpr) / GAME_H)));
  const cssZoom = devicePxPerGamePx / dpr;
  return {
    devicePxPerGamePx,
    cssZoom,
    gameWidth: Math.max(GAME_W, Math.ceil(vw / cssZoom)),
    gameHeight: Math.max(GAME_H, Math.ceil(vh / cssZoom)),
    offsetX: 0,
    offsetY: 0,
  };
}

/**
 * 'grid': the 640×360 pixel-art world at a whole-number zoom (tile rooms).
 * 'native': device resolution, for painted rooms; sprites are scaled by whole numbers.
 */
export type PixelMode = 'grid' | 'native';
let mode: PixelMode = 'grid';

function measure(): PixelScale {
  return computePixelScale(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, mode);
}

export function setPixelMode(next: PixelMode): void {
  if (next === mode) return;
  mode = next;
  apply(measure());
}

function apply(ps: PixelScale): void {
  document.documentElement.style.setProperty('--px', `${ps.cssZoom}px`);
  useStore.getState().setPixel(ps);
}

/** One resize listener shared by React (CSS variables) and Phaser (store subscription). */
export function initPixelScale(): void {
  apply(measure());
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => apply(measure()));
  });
}

/** Viewport CSS pixels to game pixels. */
export function cssToGame(x: number, y: number): { x: number; y: number } {
  const ps = useStore.getState().pixel;
  if (!ps) return { x: x / 3, y: y / 3 };
  return { x: (x - ps.offsetX) / ps.cssZoom, y: (y - ps.offsetY) / ps.cssZoom };
}

/** Game pixels to viewport CSS pixels. */
export function gameToCss(x: number, y: number): { x: number; y: number } {
  const ps = useStore.getState().pixel;
  if (!ps) return { x: x * 3, y: y * 3 };
  return { x: ps.offsetX + x * ps.cssZoom, y: ps.offsetY + y * ps.cssZoom };
}
