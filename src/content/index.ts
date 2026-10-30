import blousesJson from './blouses.json';
import locationsJson from './locations.json';
import questsJson from './quests.json';
import museumsJson from './museums.json';
import regularsJson from './regulars.json';
import cafeJson from './cafe.json';
import soundtrackJson from './soundtrack.json';

export type BlouseId = string;

export type CollarStyle = 'jabot' | 'sweetheart' | 'high' | 'bow' | 'placket' | 'round' | 'peasant' | 'peterPan' | 'crew';
/** `elbowPuff`: a short puff gathered just above the elbow, forearms bare. */
export type SleeveStyle = 'puff' | 'bigPuff' | 'gathered' | 'sheer' | 'elbowPuff' | 'short';
export type CuffStyle = 'lace' | 'plain';
export type BlouseDetail = 'pearlButtons' | 'goldButtons' | 'laceYoke' | 'embroidery' | 'paint' | 'stripes' | 'none';

export interface BlouseDef {
  id: BlouseId;
  name: string;
  details: string;
  shines: string;
  /** Gilt price; 0 with `earnedAt` means it is a reward, not for sale. */
  price: number;
  /** Location or museum that awards it. */
  earnedAt?: string;
  colors: { base: string; shade: string; light: string; trim: string };
  collar: CollarStyle;
  sleeve: SleeveStyle;
  cuff: CuffStyle;
  detail: BlouseDetail;
}

export type Era = '2026' | '1925';

export type UnlockRule =
  | { kind: 'start' }
  | { kind: 'pages'; count: number }
  | { kind: 'chapters'; count: number }
  | { kind: 'books'; count: number }
  | { kind: 'gilt'; count: number }
  | { kind: 'level'; count: number }
  | { kind: 'all'; rules: UnlockRule[] };

export interface LocationDef {
  id: string;
  name: string;
  era: Era;
  district: string;
  does: string;
  unlock: UnlockRule;
  phase: number;
  /** Screen route for places that exist now. */
  route?: 'cafe' | 'apartment';
  museum?: string;
}

export interface QuestDef {
  id: string;
  kind: 'daily' | 'book' | 'collection';
  title: string;
  goal: { metric: string; count: number };
  reward: { gilt: number };
}

export interface PieceArt {
  motif: string;
  shape: 'portrait' | 'landscape' | 'square' | 'wide';
  palette: string[];
}

export interface MuseumPiece {
  id: string;
  title: string;
  artist: string;
  year: string;
  kind: string;
  note: [string, string];
  art: PieceArt;
}

export interface MuseumDef {
  id: string;
  name: string;
  short: string;
  city: string;
  musicTrack: string;
  /** Official collection search; the work's title is appended. null = to be added. */
  searchUrl: string | null;
  wall: string;
  /** Seeing every piece earns the badge, and in some museums a blouse. */
  reward: { badge: string; blouse?: BlouseId };
  pieces: MuseumPiece[];
}

export interface RegularDef {
  id: string;
  name: string;
  who: string;
  brings: string;
  line: string;
  colors: { hair: string; top: string; bottom: string; skin: string };
}

export interface CafeHotspot {
  id: 'bar' | 'records' | 'piano' | 'tables' | 'window' | 'door';
  label: string;
  hint: string;
  /** Position across the stage strip, 0..1. Phaser draws the prop here; React puts the button here. */
  x: number;
}

export interface CafeDef {
  hotspots: CafeHotspot[];
  hookX: number;
  counter: { from: number; to: number };
  drinks: { id: string; name: string; key: string }[];
}

export type TrackStyle = 'musette' | 'impressionist' | 'hotjazz' | 'broadway';

export interface TrackDef {
  id: string;
  title: string;
  composer: string;
  year: number;
  style: TrackStyle;
  bpm: number;
  meter: 3 | 4;
  mode: 'major' | 'minor' | 'blues';
  /** MIDI note of the key centre. */
  root: number;
  gatsby?: boolean;
  copyrightNote?: string;
}

export interface SoundtrackDef {
  tracks: TrackDef[];
  scenes: Record<string, string[]>;
}

export const BLOUSES = blousesJson as BlouseDef[];
export const LOCATIONS = locationsJson as LocationDef[];
export const QUESTS = questsJson as QuestDef[];
export const MUSEUMS = museumsJson as unknown as MuseumDef[];
export const REGULARS = regularsJson as RegularDef[];
export const CAFE = cafeJson as CafeDef;
export const SOUNDTRACK = soundtrackJson as SoundtrackDef;

/** The blouse her sprite pack is drawn in. */
export const DEFAULT_BLOUSE: BlouseId = 'cream-peter-pan';

export function blouseById(id: BlouseId): BlouseDef {
  return BLOUSES.find((b) => b.id === id) ?? BLOUSES.find((b) => b.id === DEFAULT_BLOUSE)!;
}

/** Her picture in a top for the wardrobe, cut from the tops mockup by `scripts/cut-roxy-tops.py`. */
export function blouseArtUrl(id: BlouseId): string {
  return `${import.meta.env.BASE_URL}assets/sprites/roxy/tops/${id}.png`;
}

export function museumById(id: string): MuseumDef | undefined {
  return MUSEUMS.find((m) => m.id === id);
}

export function trackById(id: string): TrackDef | undefined {
  return SOUNDTRACK.tracks.find((t) => t.id === id);
}

export function hotspot(id: CafeHotspot['id']): CafeHotspot {
  return CAFE.hotspots.find((h) => h.id === id)!;
}
