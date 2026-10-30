import { useEffect, useRef } from 'react';

/**
 * Measures how long the current page(s) have been on screen, pausing while the tab is
 * hidden. Calls `onTick(elapsedMs)` twice a second; restarts whenever `key` changes.
 */
export function usePageClock(key: string, onTick: (elapsedMs: number) => void, enabled = true): void {
  const tick = useRef(onTick);
  tick.current = onTick;

  useEffect(() => {
    if (!enabled) return;
    let elapsed = 0;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) elapsed += Math.min(now - last, 2000);
      last = now;
      tick.current(elapsed);
    }, 500);
    tick.current(0);
    return () => window.clearInterval(id);
  }, [key, enabled]);
}
