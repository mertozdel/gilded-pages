import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

/** Routes whose arrival or departure fades in from black (a whole new place). */
const FADED = new Set(['select', 'venue']);

/**
 * A short fade from black when the select screen or a venue opens or closes, or the player
 * switches character: it hides the moment the game rebuilds its scene, so changing places
 * never cuts hard. Roxy's own screens change as they always did.
 */
export function RouteFade() {
  const route = useStore((s) => s.route);
  const character = useStore((s) => s.character);
  const [dark, setDark] = useState(false);
  const prev = useRef({ name: route.name as string, character });

  useEffect(() => {
    const p = prev.current;
    prev.current = { name: route.name, character };
    const changedPlace = p.name !== route.name && (FADED.has(p.name) || FADED.has(route.name));
    if (!changedPlace && p.character === character) return;
    setDark(true);
    // Two frames of black, then the fade (the scene builds behind it).
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => setDark(false))));
    return () => cancelAnimationFrame(raf);
  }, [route, character]);

  return <div className={`route-fade ${dark ? 'dark' : ''}`} aria-hidden="true" />;
}
