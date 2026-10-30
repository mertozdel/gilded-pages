import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bus } from '../bus/events';
import { CHARACTERS, CHARACTER_IDS, CURRENCIES, characterById, hasFeature, type CharacterDef, type CharacterId } from '../content/characters';
import { touchProfile } from '../db/profiles';
import type { ProfileRow } from '../db/schema';
import { useStats } from '../db/useStats';
import { useStore } from '../store';
import { DecoPanel } from '../ui/DecoPanel';
import { isTypingTarget } from '../ui/keys';

type Spot = { id: CharacterId; x: number; y: number; w: number; h: number };

/** Each character's best, from their own profile (Roxy's from her reading). */
function bestStat(c: CharacterDef, p: ProfileRow, gilt: number, pages: number | null): string {
  const cur = CURRENCIES[c.currency];
  if (c.currency === 'gilt') return `${gilt} Gilt · ${pages ?? 0} pages read`;
  if (hasFeature(c, 'latteArt')) return p.bests.cup ? `Best cup: ${p.bests.cup}/100 · ${p.currency} ${cur.name}` : `No cups yet · ${p.currency} ${cur.name}`;
  const songs = Object.entries(p.bests).filter(([k]) => k.startsWith('song:'));
  const top = songs.reduce((m, [, v]) => Math.max(m, v), 0);
  return top ? `Best score: ${top.toLocaleString()} · ${p.currency} ${cur.name}` : `No gigs yet · ${p.currency} ${cur.name}`;
}

function CharacterCard({ c, onStart }: { c: CharacterDef; onStart: () => void }) {
  const profile = useStore((s) => s.profiles[c.id]);
  const gilt = useStore((s) => s.player.gilt);
  const stats = useStats();
  const twin = c.twin ? characterById(c.twin) : null;
  return (
    <DecoPanel title={c.name} unfold key={c.id}>
      <div className="select-card" data-testid={`card-${c.id}`}>
        <img className="select-portrait" src={`${import.meta.env.BASE_URL}${c.portrait}`} alt="" width={96} height={96} />
        <div>
          <p className="select-role">{c.role}</p>
          {twin && <p className="select-twin">Twin of {twin.name}</p>}
          <p className="small">{c.blurb}</p>
          <p className="small">
            <strong>Break:</strong> {c.breakLabel}
          </p>
          <p className="small muted">{bestStat(c, profile, gilt, stats?.pagesCounted ?? null)}</p>
        </div>
      </div>
      <button className="deco-btn big" onClick={onStart} data-testid={`start-${c.id}`}>
        Start the shift as {c.name} <kbd>Enter</kbd>
      </button>
    </DecoPanel>
  );
}

/**
 * Shown on every app start (route `#/`): the café, dimmed, with the four baristas standing in
 * a line on its floor. Focus or hover one (arrow keys, mouse, touch): they step forward and
 * their card opens. Enter, a click or the card's button starts their shift. The last pick is
 * preselected.
 */
export function CharacterSelectScreen() {
  const lastCharacter = useStore((s) => s.settings.lastCharacter);
  const setSettings = useStore((s) => s.setSettings);
  const setProfile = useStore((s) => s.setProfile);
  const navigate = useStore((s) => s.navigate);
  const textOnly = useStore((s) => s.settings.readingMode === 'text');
  const pixel = useStore((s) => s.pixel);
  const [focus, setFocus] = useState<CharacterId>(lastCharacter);
  const [spots, setSpots] = useState<Spot[]>(() => bus.last('lineup:layout')?.spots ?? []);
  const stage = useRef<HTMLDivElement>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;

  const choose = async (id: CharacterId) => {
    setSettings({ lastCharacter: id });
    bus.emit('character:selected', { id });
    navigate({ name: 'cafe', c: id });
    setProfile(await touchProfile(id));
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  // The café behind the line-up: report where it goes, as a room view does.
  useLayoutEffect(() => {
    if (textOnly) {
      bus.emit('room:layout', { room: null, rect: null });
      return;
    }
    const el = stage.current;
    if (!el) return;
    let last = '';
    const report = () => {
      const r = el.getBoundingClientRect();
      const sig = `${r.left}|${r.top}|${r.width}|${r.height}`;
      if (sig === last) return;
      last = sig;
      bus.emit('room:layout', { room: 'cafe-select', rect: { x: r.left, y: r.top, width: r.width, height: r.height } });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [textOnly, pixel]);
  useEffect(() => () => bus.emit('room:layout', { room: null, rect: null }), []);
  useEffect(() => bus.on('lineup:layout', (e) => setSpots(e.spots)), []);
  useEffect(() => bus.emit('lineup:focus', { id: focus }), [focus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = CHARACTER_IDS.indexOf(focusRef.current);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocus(CHARACTER_IDS[(i + 1) % CHARACTER_IDS.length]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocus(CHARACTER_IDS[(i - 1 + CHARACTER_IDS.length) % CHARACTER_IDS.length]);
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        void chooseRef.current(focusRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const focused = characterById(focus);
  /** A touch press, and whether its barista was already the focused one when it began. */
  const touchPress = useRef<{ wasFocused: boolean } | null>(null);

  return (
    <div className="screen select-screen">
      <header className="select-header">
        <h1>Café Machorn</h1>
        <p className="screen-subtitle">Who's on shift today?</p>
      </header>
      <main className="select-body">
        <div className={`select-stage ${textOnly ? 'text-only' : ''}`} ref={stage} role="radiogroup" aria-label="Characters">
          {textOnly
            ? CHARACTERS.map((c) => (
                <button key={c.id} role="radio" aria-checked={focus === c.id} className={`select-text-pick ${focus === c.id ? 'focused' : ''}`} onFocus={() => setFocus(c.id)} onClick={() => void choose(c.id)}>
                  <img src={`${import.meta.env.BASE_URL}${c.portrait}`} alt="" width={64} height={64} />
                  <strong>{c.name}</strong>
                  <small>{c.role}</small>
                </button>
              ))
            : spots.map((s) => {
                const c = characterById(s.id);
                const box = stage.current?.getBoundingClientRect();
                return (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={focus === s.id}
                    aria-label={`${c.name}, ${c.role}`}
                    data-testid={`pick-${s.id}`}
                    className={`lineup-hit ${focus === s.id ? 'focused' : ''}`}
                    style={{ left: s.x - (box?.left ?? 0), top: s.y - (box?.top ?? 0), width: s.w, height: s.h }}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setFocus(s.id)}
                    onPointerDown={(e) => (touchPress.current = e.pointerType !== 'mouse' ? { wasFocused: focusRef.current === s.id } : null)}
                    onFocus={() => setFocus(s.id)}
                    onClick={() => {
                      // A first tap on a touch screen only opens the card. The tap focuses the
                      // button before the click (Android), so ask what was focused at the press.
                      const press = touchPress.current;
                      touchPress.current = null;
                      if (press && !press.wasFocused) return setFocus(s.id);
                      void choose(s.id);
                    }}
                  >
                    <span className="lineup-name">{c.name}</span>
                  </button>
                );
              })}
        </div>
        <aside className="select-card-wrap" aria-live="polite">
          <CharacterCard c={focused} onStart={() => void choose(focused.id)} />
        </aside>
      </main>
      <footer className="screen-footer">
        <span>
          <kbd>←</kbd> <kbd>→</kbd> choose · <kbd>Enter</kbd> start · everything stays on this device
        </span>
      </footer>
    </div>
  );
}
