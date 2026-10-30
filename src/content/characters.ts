/**
 * The four baristas of the café. Everything character-specific (HUD buttons, hotspots, the
 * break, the currency) reads this registry's feature flags — never a character's name.
 */
import charactersJson from './characters.json';

export type CharacterId = 'roxy' | 'jason' | 'joel' | 'jonas';
/** coffee: makes a cup at the counter any time · latteArt: a latte artist's shift (customers, tips, patterns). */
export type Feature = 'reading' | 'wardrobe' | 'museums' | 'worldMap' | 'morningRush' | 'latteArt' | 'coffee';
export type CurrencyId = 'gilt' | 'tips' | 'fans' | 'applause';
export type VenueId = 'bavaria' | 'neon-china';

/** barista: Roxy's own loop · machine: at the espresso machine · chat: talking at the counter · tables: back and forth to the tables. */
export type NpcRoutine = 'barista' | 'machine' | 'chat' | 'tables';

export type BreakDef = { type: 'reading' } | { type: 'rhythm'; mode: 'dj' | 'bass'; venue: VenueId } | null;

export interface HotspotOverride {
  label?: string;
  hint?: string;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  twin?: CharacterId;
  /** One texture, or one in the café and another on stage (Jonas's lederhosen). */
  texture: string | { cafe: string; stage: string };
  /** What draws them: Roxy's own sprite pack and state machine, or a crew pack. */
  rig: 'roxy' | 'crew';
  /** As a café NPC: where they work and their loop (Roxy's is her barista routine). */
  npc: { home: string; routine: NpcRoutine };
  /** Under public/. */
  portrait: string;
  /** One line about how they play. */
  blurb: string;
  features: Partial<Record<Feature, boolean>>;
  currency: CurrencyId;
  break: BreakDef;
  breakLabel: string;
  /** The HUD's action button in the café (none for Roxy, whose HUD is unchanged). */
  action?: string;
  /** Said at the door by someone who never takes a break. */
  breakLine?: string;
  /** Café hotspots relabelled for this character (a hotspot whose feature they lack is hidden). */
  hotspots: Partial<Record<string, HotspotOverride>>;
}

export const CHARACTERS = charactersJson as CharacterDef[];
/** The order on the character select screen. */
export const CHARACTER_IDS: CharacterId[] = CHARACTERS.map((c) => c.id);
export const DEFAULT_CHARACTER: CharacterId = 'roxy';

export function isCharacterId(id: unknown): id is CharacterId {
  return typeof id === 'string' && CHARACTERS.some((c) => c.id === id);
}

export function characterById(id: CharacterId): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function hasFeature(c: CharacterDef, f: Feature): boolean {
  return !!c.features[f];
}

export function cafeTexture(c: CharacterDef): string {
  return typeof c.texture === 'string' ? c.texture : c.texture.cafe;
}

export function stageTexture(c: CharacterDef): string {
  return typeof c.texture === 'string' ? c.texture : c.texture.stage;
}

/** The character who plays a venue (each venue belongs to one break). */
export function characterForVenue(venue: VenueId): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.break?.type === 'rhythm' && c.break.venue === venue);
}

export const CURRENCIES: Record<CurrencyId, { name: string; one: string; icon: string }> = {
  gilt: { name: 'Gilt', one: 'Gilt', icon: '🪙' },
  tips: { name: 'Tips', one: 'tip', icon: '☕' },
  fans: { name: 'Fans', one: 'fan', icon: '★' },
  applause: { name: 'Applause', one: 'applause', icon: '👏' },
};

/**
 * Which feature a café hotspot belongs to. A hotspot that needs a feature the player lacks is
 * hidden, unless the character relabels it (Jason's photo board on the mural wall, the door
 * that starts a break).
 */
export const HOTSPOT_FEATURE: Record<string, Feature> = {
  sofa: 'reading',
  silo: 'reading',
  banquette: 'reading',
  mural: 'museums',
  door: 'worldMap',
  counter: 'morningRush',
};

/** The café hotspots this character sees, with their labels. */
export function hotspotVisible(c: CharacterDef, id: string): boolean {
  const need = HOTSPOT_FEATURE[id];
  return !need || hasFeature(c, need) || !!c.hotspots[id];
}
