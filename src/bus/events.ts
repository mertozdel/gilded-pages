/**
 * The typed event bus — the only channel between React screens and the Phaser world.
 *
 * React screens emit; the companion (Roxy) and the backdrop scenes listen. Screens never
 * touch game objects directly, which is what lets Roxy survive every route change.
 */
import type { BlouseId } from '../content';
import type { RoomId } from '../content/rooms';
import type { CharacterId, VenueId } from '../content/characters';

export type SceneId = 'cafe' | 'reader' | 'map' | 'museum' | 'apartment' | 'ledger' | 'settings' | 'select' | 'venue' | 'dev';
export type ReadingMode = 'gala' | 'calm' | 'text';

/** Roxy lives in 2026; the books (the Reading Room) take her to 1925. */
export function eraOf(scene: SceneId): '2026' | '1925' {
  return scene === 'reader' ? '1925' : '2026';
}
export type NavSource = 'key' | 'click' | 'swipe' | 'wheel' | 'button';

/** A rectangle in CSS pixels, relative to the viewport. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BusEvents {
  /** The reader moved forward. `page` is the new (left-hand) page, 1-based. */
  'page:next': { page: number; pageCount: number; source: NavSource };
  /** The reader moved back. */
  'page:prev': { page: number; pageCount: number; source: NavSource };
  /** A jump that skips pages (chapter list, bookmark, search, Home/End). Roxy takes a taxi. */
  'page:jump': { from: number; to: number; pageCount: number };
  /** How far the reader is through the current page, 0..1 (scroll + time on page). */
  'scroll:progress': { progress: number };
  /** A passage was saved as a Quote Pearl. */
  'highlight:add': { page: number; text: string };
  /** A bookmark was planted on a page. */
  'bookmark:add': { page: number };
  /** The reader crossed into a new chapter; `title` is the chapter just finished. */
  'chapter:end': { title: string; page: number; bonusGilt: number };
  /** A screen became active. Roxy steps through a door; the backdrop changes around her. */
  'scene:enter': { scene: SceneId };
  /** A screen's room view: which isometric room to show and where (CSS px). `null` = none. */
  'room:layout': { room: RoomId | null; rect: StageRect | null };
  /** Game → React: where each hotspot of the current room sits on screen (CSS px). */
  'room:hotspots': { room: RoomId | null; spots: { id: string; x: number; y: number }[] };
  /** Game → React: where a painted room wants the screen's own panels (CSS px rects). */
  'room:anchors': { room: RoomId | null; anchors: { id: string; x: number; y: number; w: number; h: number }[] };
  /** A click on the room's floor (CSS px): Roxy walks there. */
  'room:click': { x: number; y: number };
  /** A drag across a room too wide for its view (a phone held upright): look along it (CSS px). */
  'room:pan': { dx: number };
  /** Walk Roxy to a room hotspot before it opens; she answers with `companion:arrived`. */
  'room:goto': { id: string; tag: string };
  /** Roxy changes top. Swaps her atlas for that top's sheet (same frames); every animation keeps working. */
  'outfit:change': { blouseId: BlouseId };
  /** Milliseconds since the last user input; emitted about once a second. */
  'idle:tick': { idleMs: number };
  /** The reading mode changed (Full Gala / Calm / Text only). */
  'mode:change': { mode: ReadingMode };
  /** A page passed the honest-reading timer and earned Gilt. */
  'page:counted': { page: number; gilt: number };

  // ---- Café Machorn, museums (2026) ----
  /** Walk Roxy to a spot (CSS x) before something opens; she answers with `companion:arrived`. */
  'companion:goto': { x: number; tag: string; run?: boolean; admire?: boolean };
  /** Game → React: Roxy reached the spot requested by `companion:goto` (or by a break). */
  'companion:arrived': { tag: string };
  /**
   * A break starts. Roxy's reading break: a book was picked from the sofa shelf (apron off at
   * the hook, settle on the window sofa). A rhythm break: Joel or Jonas leaves for a venue.
   */
  'break:start': { bookId: string } | { venue: VenueId };
  /** Game → React: she is settled on the sofa; the Reading Room can open. */
  'break:seated': { bookId: string };
  /** Skip the rest of the break animation. */
  'break:skip': Record<string, never>;
  /** A PDF was dropped on the café: a bike courier delivers the parcel. */
  'cafe:delivery': Record<string, never>;
  /** Morning Rush mini-game: Roxy switches to fast barista moves. */
  'rush:start': Record<string, never>;
  'rush:order': { drink: string; correct: boolean };
  'rush:end': { served: number };
  /** Roxy sits down at the café piano and plays `trackId`; the music switches to solo piano. */
  'piano:play': { trackId: string };
  /** She stands up from the piano and goes back to the bar; the café playlist resumes. */
  'piano:stop': Record<string, never>;

  // ---- The crew: character select, latte art, rhythm breaks ----
  /** A character was picked on the select screen. */
  'character:selected': { id: CharacterId };
  /** Game → React: where each character of the select line-up stands (CSS px rects). */
  'lineup:layout': { spots: { id: CharacterId; x: number; y: number; w: number; h: number }[] };
  /** React → game: the focused character steps forward (null: everyone back in line). */
  'lineup:focus': { id: CharacterId | null };
  /** A cup starts: the barista goes to the machine, then the cup panel opens. */
  'latte:begin': { id: string; drink: string };
  /** The coffee's Hold went down or up in a stage (the café shows the barista working the machine). */
  'latte:hold': { stage: 1 | 2 | 3; holding: boolean };
  /** A latte stage was released. `error` is signed, -1 (early) … 1 (late / overflow). */
  'latte:stage': { stage: 1 | 2 | 3; error: number; grade: 'perfect' | 'good' | 'miss' };
  /** A cup was served: the barista reacts (Jason: a heart and sparkles for a perfect one). */
  'latte:result': { id: string; quality: number; pattern: string; grade: 'perfect' | 'good' | 'messy' };
  /** The latte art shift closed. */
  'latte:shiftEnd': Record<string, never>;
  /** A crew member says something in a speech bubble (twin banter, Jason at the door). */
  'crew:say': { id: CharacterId; text: string; ms?: number };
  /** Back from a venue: the twin in the café greets whoever came back. */
  'break:end': { character: CharacterId; venue: VenueId };
  /** A note was judged. `deltaMs` is signed (early < 0). */
  'rhythm:judge': { lane: number; grade: 'perfect' | 'great' | 'good' | 'miss'; deltaMs: number };
  /** Star power (Prost! / DROP) started or ended. */
  'rhythm:starPower': { active: boolean };
  /** A song ended (cleared, or failed when the meter emptied). */
  'rhythm:songEnd': { score: number; accuracy: number; stars: number; cleared: boolean };
  /** Every beat of the playing song (the lights, the band and the reaction bubbles bob on it). */
  'rhythm:beat': { beat: number; bar: number; downbeat: boolean; bpm: number; beatsPerBar: number };
  /** A venue screen opened (or closed, `null`): the festival scene shows it behind the UI. */
  'venue:show': { venue: VenueId | null; setlist: string[] };
  /** Game → React: where the venue's setlist sign sits on screen (CSS px), for the song select. */
  'venue:anchors': { setlist: StageRect | null };
  /** Where the venue's rhythm game is: the stage animates to match. */
  'rhythm:state': { phase: 'select' | 'countdown' | 'playing' | 'paused' | 'results'; songId?: string; bpm?: number; style?: string };
}

type Handler<T> = (payload: T) => void;

class TypedBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();
  private lastPayload = new Map<keyof E, unknown>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    this.lastPayload.set(type, payload);
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E[K]>)(payload);
  }

  /** The most recent payload for an event, so late subscribers (the game boots after React) can catch up. */
  last<K extends keyof E>(type: K): E[K] | undefined {
    return this.lastPayload.get(type) as E[K] | undefined;
  }
}

export const bus = new TypedBus<BusEvents>();
