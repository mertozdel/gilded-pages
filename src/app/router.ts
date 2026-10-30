import { useStore } from '../store';
import { hashToRoute, routeToHash } from '../store/routeSlice';

/**
 * A tiny hash router kept in the store. The URL holds the open book, so reloading the tab
 * drops you straight back into the Reading Room on the saved page.
 */
export function initRouter(): void {
  const sync = () => {
    const route = hashToRoute(window.location.hash);
    const current = useStore.getState().route;
    if (routeToHash(route) !== routeToHash(current)) useStore.getState().syncRoute(route);
  };
  window.addEventListener('hashchange', sync);
  if (!window.location.hash) window.history.replaceState(null, '', routeToHash(useStore.getState().route));
  sync();
}
