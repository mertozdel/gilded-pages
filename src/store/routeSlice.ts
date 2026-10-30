import type { StateCreator } from 'zustand';
import type { SceneId } from '../bus/events';
import { characterForVenue, isCharacterId, type CharacterId, type VenueId } from '../content/characters';
import type { AppState } from './index';

export type DevTool = 'chart-editor' | 'rhythm-test';

export type Route =
  | { name: 'select' }
  | { name: 'cafe'; c?: CharacterId }
  | { name: 'reader'; bookId: string }
  | { name: 'map' }
  | { name: 'museum'; museumId: string }
  | { name: 'apartment' }
  | { name: 'ledger' }
  | { name: 'settings' }
  | { name: 'venue'; venue: VenueId }
  | { name: 'dev'; tool: DevTool };

const VENUES: VenueId[] = ['bavaria', 'neon-china'];
const DEV_TOOLS: DevTool[] = ['chart-editor', 'rhythm-test'];

export function sceneForRoute(route: Route): SceneId {
  return route.name;
}

/** Who plays on a route: the café says so; reading, the wardrobe, museums and the map are Roxy's; a venue is its gig's. */
export function characterForRoute(route: Route): CharacterId | null {
  switch (route.name) {
    case 'cafe':
      return route.c ?? null;
    case 'reader':
    case 'map':
    case 'museum':
    case 'apartment':
    case 'ledger':
      return 'roxy';
    case 'venue':
      return characterForVenue(route.venue)?.id ?? null;
    default:
      return null;
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'select':
      return '#/';
    case 'cafe':
      return `#/cafe?c=${route.c ?? 'roxy'}`;
    case 'reader':
      return `#/reader/${encodeURIComponent(route.bookId)}`;
    case 'museum':
      return `#/museum/${encodeURIComponent(route.museumId)}`;
    case 'venue':
      return `#/venue/${route.venue}`;
    case 'dev':
      return `#/dev/${route.tool}`;
    default:
      return `#/${route.name}`;
  }
}

export function hashToRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  switch (parts[0]) {
    case 'cafe': {
      const c = new URLSearchParams(query).get('c');
      return { name: 'cafe', c: isCharacterId(c) ? c : 'roxy' };
    }
    case 'reader':
      return parts[1] ? { name: 'reader', bookId: decodeURIComponent(parts[1]) } : { name: 'cafe', c: 'roxy' };
    case 'museum':
      return parts[1] ? { name: 'museum', museumId: decodeURIComponent(parts[1]) } : { name: 'map' };
    case 'venue':
      return VENUES.includes(parts[1] as VenueId) ? { name: 'venue', venue: parts[1] as VenueId } : { name: 'select' };
    case 'dev':
      return DEV_TOOLS.includes(parts[1] as DevTool) ? { name: 'dev', tool: parts[1] as DevTool } : { name: 'select' };
    case 'map':
    case 'apartment':
    case 'ledger':
    case 'settings':
      return { name: parts[0] };
    default:
      return { name: 'select' };
  }
}

export interface RouteSlice {
  route: Route;
  /** The previous route (the café uses it to play the reading break in reverse). */
  prevRoute: Route | null;
  navigate: (route: Route) => void;
  /** Used by the hash listener; does not touch location.hash. */
  syncRoute: (route: Route) => void;
}

const initialRoute: Route = typeof window !== 'undefined' ? hashToRoute(window.location.hash) : { name: 'select' };

export const createRouteSlice: StateCreator<AppState, [], [], RouteSlice> = (set, get) => {
  /** `{ name: 'cafe' }` (Roxy's screens say just that) means the café of whoever is playing. */
  const resolve = (route: Route): Route => (route.name === 'cafe' && !route.c ? { name: 'cafe', c: get().character } : route);
  const apply = (route: Route) => {
    const c = characterForRoute(route);
    set({ route, prevRoute: get().route, ...(c ? { character: c } : {}) });
  };
  return {
    route: initialRoute,
    prevRoute: null,
    navigate: (r) => {
      const route = resolve(r);
      const hash = routeToHash(route);
      if (window.location.hash !== hash) window.location.hash = hash;
      apply(route);
    },
    syncRoute: (r) => apply(resolve(r)),
  };
};

/** The character the first route implies (the store starts with it). */
export const initialCharacter = characterForRoute(initialRoute);
