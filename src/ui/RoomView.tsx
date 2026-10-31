import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { bus } from '../bus/events';
import { roomHotspots, type RoomId } from '../content/rooms';
import { useStore } from '../store';
import { newRoomClaim, releaseRoom, reportRoom } from './roomClaim';

interface Props {
  room: RoomId;
  /** A hotspot was activated (after Roxy walked there, the screen opens it). */
  onHotspot: (id: string) => void;
  /** Extra text under a hotspot's label (e.g. today's special on the silo). */
  hints?: Partial<Record<string, string>>;
  /** A painted room marks where the screen's own panels go; this renders each one. */
  renderAnchor?: (id: string) => ReactNode;
  /** Hotspots the player can't use (a feature their character lacks). */
  hidden?: readonly string[];
  /** Hotspots relabelled for the player's character. */
  labels?: Partial<Record<string, { label?: string; hint?: string }>>;
  children?: ReactNode;
}

/** Px a press may travel before it is a drag (looking along the room) rather than a tap. */
const DRAG_SLOP = 8;

/**
 * Where a screen shows an isometric room. Reports its rectangle so the game centres the room
 * in it, places a button over each hotspot the game reports, and turns clicks on the floor
 * into click-to-move. A room wider than its view (a phone held upright) is dragged sideways
 * to look along it; a drag never counts as a tap. In Text-only mode the room is hidden and
 * the hotspots become a list.
 */
export function RoomView({ room, onHotspot, hints, renderAnchor, hidden, labels, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const textOnly = useStore((s) => s.settings.readingMode === 'text');
  const pixel = useStore((s) => s.pixel);
  const [spots, setSpots] = useState<{ id: string; x: number; y: number }[]>([]);
  const [anchors, setAnchors] = useState<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const [box, setBox] = useState({ left: 0, top: 0 });
  // A hotspot can be in the map more than once (a regular's, at each of his places): one entry each.
  const defs = roomHotspots(room)
    .filter((d, i, all) => !hidden?.includes(d.id) && all.findIndex((x) => x.id === d.id) === i)
    .map((d) => ({ ...d, ...labels?.[d.id] }));
  const press = useRef<{ id: number; x: number; dragging: boolean } | null>(null);
  const dragged = useRef(false);

  const [claim] = useState(newRoomClaim);
  useLayoutEffect(() => {
    if (textOnly) {
      reportRoom(claim, null, null);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let last = '';
    const report = () => {
      const r = el.getBoundingClientRect();
      const sig = `${r.left}|${r.top}|${r.width}|${r.height}`;
      if (sig === last) return;
      last = sig;
      setBox({ left: r.left, top: r.top });
      reportRoom(claim, room, { x: r.left, y: r.top, width: r.width, height: r.height });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [claim, room, textOnly, pixel]);
  // Only leaving the screen (or changing room) takes the room away — not a re-measure, and not
  // when the next screen has already asked for its own.
  useEffect(() => () => releaseRoom(claim, room), [claim, room]);

  useEffect(() => {
    const last = bus.last('room:hotspots');
    if (last?.room === room) setSpots(last.spots);
    return bus.on('room:hotspots', (e) => setSpots(e.room === room ? e.spots : []));
  }, [room]);
  useEffect(() => {
    const last = bus.last('room:anchors');
    if (last?.room === room) setAnchors(last.anchors);
    return bus.on('room:anchors', (e) => setAnchors(e.room === room ? e.anchors : []));
  }, [room]);

  if (textOnly) {
    return (
      <div className="room-view text-only">
        <div className="room-text-hotspots">
          {defs.map((d) => (
            <button key={d.id} className="deco-btn" onClick={() => onHotspot(d.id)}>
              {d.label}
              <small>{hints?.[d.id] ?? d.hint}</small>
            </button>
          ))}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div
      className="room-view"
      ref={ref}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        press.current = { id: e.pointerId, x: e.clientX, dragging: false };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p || p.id !== e.pointerId) return;
        const dx = e.clientX - p.x;
        if (!p.dragging) {
          if (Math.abs(dx) < DRAG_SLOP) return;
          p.dragging = dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        p.x = e.clientX;
        bus.emit('room:pan', { dx });
      }}
      onPointerUp={() => (press.current = null)}
      onPointerCancel={() => (press.current = null)}
      onClickCapture={(e) => {
        // The click that ends a drag opens nothing and sends Roxy nowhere.
        if (!dragged.current) return;
        dragged.current = false;
        e.stopPropagation();
      }}
      onClick={(e) => bus.emit('room:click', { x: e.clientX, y: e.clientY })}
    >
      {spots.map((s) => {
        const d = defs.find((x) => x.id === s.id);
        if (!d) return null;
        return (
          <button
            key={s.id}
            className="room-hotspot"
            style={{ left: s.x - box.left, top: s.y - box.top }}
            onClick={(e) => {
              e.stopPropagation();
              onHotspot(s.id);
            }}
            aria-label={`${d.label}: ${hints?.[d.id] ?? d.hint}`}
          >
            <span className="room-hotspot-dot" aria-hidden="true" />
            <span className="room-hotspot-label">
              {d.label}
              <small>{hints?.[d.id] ?? d.hint}</small>
            </span>
          </button>
        );
      })}
      {renderAnchor &&
        anchors.map((a) => (
          <div key={a.id} className={`room-anchor anchor-${a.id}`} style={{ left: a.x - box.left, top: a.y - box.top, width: a.w, height: a.h }} onClick={(e) => e.stopPropagation()}>
            {renderAnchor(a.id)}
          </div>
        ))}
      {children}
    </div>
  );
}

let seq = 0;

/**
 * Walks the player to a hotspot of the current room, then runs `then` once they arrive. The
 * timeout is only a safety net (a walk that never ends), long enough for the longest walk.
 */
export function walkToHotspot(id: string, then: () => void, timeoutMs = 15000): () => void {
  if (useStore.getState().settings.readingMode === 'text') {
    then();
    return () => undefined;
  }
  const tag = `hotspot-${++seq}`;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    off();
    window.clearTimeout(timer);
    then();
  };
  const off = bus.on('companion:arrived', (e) => e.tag === tag && finish());
  const timer = window.setTimeout(finish, timeoutMs);
  bus.emit('room:goto', { id, tag });
  return () => {
    done = true;
    off();
    window.clearTimeout(timer);
  };
}
