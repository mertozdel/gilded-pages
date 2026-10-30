import type { StateCreator } from 'zustand';
import type { VenueId } from '../content/characters';
import type { AppState } from './index';

export interface Toast {
  id: number;
  text: string;
  tone: 'gold' | 'green' | 'rose';
}

export interface PixelScale {
  /** Device pixels per game pixel (always a whole number, so pixels stay crisp). */
  devicePxPerGamePx: number;
  /** CSS pixels per game pixel. */
  cssZoom: number;
  gameWidth: number;
  gameHeight: number;
  /** Where the (centred, letterboxed) canvas starts in the viewport, CSS px. */
  offsetX: number;
  offsetY: number;
}

export interface UiSlice {
  booted: boolean;
  setBooted: (v: boolean) => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  pixel: PixelScale | null;
  setPixel: (p: PixelScale) => void;
  /** The HUD's character action (latte art, a break) was pressed; the café answers. */
  cafeAction: number;
  requestCafeAction: () => void;
  /** A travel cutscene on show: to a venue, or back to the café. */
  travel: { venue: VenueId; dir: 'out' | 'back' } | null;
  setTravel: (t: { venue: VenueId; dir: 'out' | 'back' } | null) => void;
}

let nextToastId = 1;

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  booted: false,
  setBooted: (booted) => set({ booted }),
  toasts: [],
  toast: (text, tone = 'gold') => {
    const id = nextToastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    window.setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  helpOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  pixel: null,
  setPixel: (pixel) => set({ pixel }),
  cafeAction: 0,
  requestCafeAction: () => set((s) => ({ cafeAction: s.cafeAction + 1 })),
  travel: null,
  setTravel: (travel) => set({ travel }),
});
