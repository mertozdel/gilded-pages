import { useSyncExternalStore } from 'react';

/**
 * The phone layout (a portrait phone): bottom tab bar, the café filling the screen with a
 * dock under it, the reader edge to edge. Keep in step with `@media (max-width: 760px)` in
 * theme.css and reader.css.
 */
export const PHONE_QUERY = '(max-width: 760px)';
/**
 * A phone either way up, or any screen narrower than 5:4 (a tablet upright): too small for
 * the café's cards to sit on the painting, or so narrow the painting pans them out of view,
 * so they go in a dock (under the room upright, beside it on its side). Keep in step with
 * theme.css.
 */
export const COMPACT_QUERY = '(max-width: 760px), (max-height: 500px) and (orientation: landscape), (max-aspect-ratio: 5/4)';

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

export function usePhone(): boolean {
  return useMedia(PHONE_QUERY);
}

export function useCompact(): boolean {
  return useMedia(COMPACT_QUERY);
}
