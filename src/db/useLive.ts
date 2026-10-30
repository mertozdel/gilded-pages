import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * Subscribes a component to a Dexie query; re-renders whenever the tables it reads change.
 * Returns `undefined` until the first result arrives.
 */
export function useLive<T>(querier: () => Promise<T> | T, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(() => v),
      error: (e) => console.error('[useLive]', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
