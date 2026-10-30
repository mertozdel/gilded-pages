import { describe, expect, it } from 'vitest';
import { CHARACTERS, characterById, characterForVenue, hasFeature, hotspotVisible } from '../../src/content/characters';
import { characterForRoute, hashToRoute, routeToHash } from '../../src/store/routeSlice';

describe('character registry', () => {
  it('has the four baristas in select order', () => {
    expect(CHARACTERS.map((c) => c.id)).toEqual(['roxy', 'jason', 'joel', 'jonas']);
  });

  it('gives reading, the wardrobe, museums, the map and Gilt to Roxy only', () => {
    for (const c of CHARACTERS) {
      const roxy = c.id === 'roxy';
      for (const f of ['reading', 'wardrobe', 'museums', 'worldMap'] as const) expect(hasFeature(c, f)).toBe(roxy);
      expect(c.currency === 'gilt').toBe(roxy);
    }
  });

  it('shows each player the café hotspots their features allow', () => {
    const roxy = characterById('roxy');
    for (const id of ['sofa', 'silo', 'banquette', 'mural', 'counter', 'door']) expect(hotspotVisible(roxy, id)).toBe(true);
    const jason = characterById('jason');
    expect(['sofa', 'silo', 'banquette'].map((id) => hotspotVisible(jason, id))).toEqual([false, false, false]);
    expect(['mural', 'counter', 'door'].map((id) => hotspotVisible(jason, id))).toEqual([true, true, true]);
    const joel = characterById('joel');
    expect(hotspotVisible(joel, 'counter')).toBe(true);
    expect(hotspotVisible(joel, 'mural')).toBe(false);
  });

  it('maps each venue to its gig', () => {
    expect(characterForVenue('bavaria')?.id).toBe('jonas');
    expect(characterForVenue('neon-china')?.id).toBe('joel');
    expect(characterById('jason').break).toBeNull();
  });
});

describe('routes', () => {
  it('opens the character select on #/ and the café with ?c=', () => {
    expect(hashToRoute('')).toEqual({ name: 'select' });
    expect(hashToRoute('#/')).toEqual({ name: 'select' });
    expect(hashToRoute('#/cafe?c=jason')).toEqual({ name: 'cafe', c: 'jason' });
    expect(hashToRoute('#/cafe?c=nobody')).toEqual({ name: 'cafe', c: 'roxy' });
    expect(routeToHash({ name: 'cafe', c: 'joel' })).toBe('#/cafe?c=joel');
    expect(routeToHash({ name: 'select' })).toBe('#/');
  });

  it("keeps Roxy's deep links", () => {
    expect(hashToRoute('#/reader/abc')).toEqual({ name: 'reader', bookId: 'abc' });
    expect(hashToRoute('#/museum/met')).toEqual({ name: 'museum', museumId: 'met' });
    expect(characterForRoute({ name: 'reader', bookId: 'abc' })).toBe('roxy');
    expect(characterForRoute({ name: 'apartment' })).toBe('roxy');
  });

  it('knows the venues and dev tools', () => {
    expect(hashToRoute('#/venue/bavaria')).toEqual({ name: 'venue', venue: 'bavaria' });
    expect(characterForRoute({ name: 'venue', venue: 'neon-china' })).toBe('joel');
    expect(hashToRoute('#/dev/chart-editor')).toEqual({ name: 'dev', tool: 'chart-editor' });
    expect(hashToRoute('#/venue/moon')).toEqual({ name: 'select' });
  });
});
