import { useEffect, useRef, useState } from 'react';
import { bus } from '../bus/events';
import { BLOUSES, DEFAULT_BLOUSE, LOCATIONS, MUSEUMS, blouseArtUrl, type BlouseDef } from '../content';
import { db } from '../db/schema';
import { buyBlouse, itemKey, savePlayerBlouse } from '../db/queries';
import { useLive } from '../db/useLive';
import { useOwned } from '../db/useStats';
import { EVERYTHING_OPEN } from '../rules/unlocks';
import { useStore } from '../store';
import { ScreenFrame } from '../ui/ScreenFrame';
import { RecordPlayerPanel } from './cafe/RecordPlayerPanel';

function earnedAtName(id: string): string {
  return MUSEUMS.find((m) => m.id === id)?.name ?? LOCATIONS.find((l) => l.id === id)?.name ?? id;
}

/** Roxy's apartment: the blouse wardrobe (try on, buy with Gilt, wear), the record player, her Quote Pearl journal. */
export function ApartmentScreen() {
  const player = useStore((s) => s.player);
  const setPlayer = useStore((s) => s.setPlayer);
  const toast = useStore((s) => s.toast);
  const owned = useOwned();
  const pearls = useLive(async () => (await db.highlights.toArray()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6), []) ?? [];
  const [tryOn, setTryOn] = useState<string | null>(null);
  const worn = useRef(player.currentBlouse);
  worn.current = player.currentBlouse;

  // Trying on is temporary: leaving the wardrobe puts her own blouse back on.
  useEffect(
    () => () => {
      bus.emit('outfit:change', { blouseId: worn.current });
    },
    [],
  );

  // Free starter blouses (price 0, not a reward) are always in the wardrobe; with everything open, every top is.
  const has = (b: BlouseDef) => EVERYTHING_OPEN || b.id === DEFAULT_BLOUSE || (b.price === 0 && !b.earnedAt) || !!owned?.has(itemKey.blouse(b.id));

  const wear = async (b: BlouseDef) => {
    const p = await savePlayerBlouse(b.id);
    setPlayer(p);
    setTryOn(null);
    bus.emit('outfit:change', { blouseId: b.id });
  };
  const preview = (b: BlouseDef) => {
    setTryOn(b.id);
    bus.emit('outfit:change', { blouseId: b.id });
  };
  const buy = async (b: BlouseDef) => {
    const p = await buyBlouse(b.id, b.price);
    if (!p) return toast(`Not enough Gilt — ${b.price - player.gilt} more pages to go`, 'rose');
    setPlayer(p);
    toast(`${b.name} is yours`, 'gold');
    await wear(b);
  };

  return (
    <ScreenFrame className="apartment" title="Roxy's Apartment" subtitle="New York · 2026" footer={<span>Tops are purely cosmetic. {EVERYTHING_OPEN ? 'Every one is yours to wear.' : 'Every one is earned by reading.'}</span>}>
      <div className="apartment-grid">
        <section aria-label="Wardrobe">
          <h2 className="section-title">The wardrobe</h2>
          <ul className="wardrobe">
            {BLOUSES.map((b) => {
              const mine = has(b);
              const wearing = player.currentBlouse === b.id;
              const trying = tryOn === b.id;
              const reward = !!b.earnedAt;
              return (
                <li key={b.id} className={`blouse-card ${wearing ? 'wearing' : ''} ${mine ? 'owned' : ''}`}>
                  <img className={`roxy-preview ${wearing || trying ? 'live' : ''}`} src={blouseArtUrl(b.id)} width={128} height={160} alt={`Roxy in the ${b.name}`} />
                  <div>
                    <h3>{b.name}</h3>
                    <p className="small">{b.details}</p>
                    <p className="muted small">Shines: {b.shines}</p>
                    <div className="blouse-actions">
                      {wearing ? (
                        <span className="tag">Wearing</span>
                      ) : mine ? (
                        <button className="deco-btn" onClick={() => void wear(b)}>
                          Wear
                        </button>
                      ) : reward ? (
                        <span className="tag locked">Earned at {earnedAtName(b.earnedAt!)}</span>
                      ) : (
                        <button className="deco-btn" onClick={() => void buy(b)} disabled={player.gilt < b.price}>
                          Buy · {b.price} Gilt
                        </button>
                      )}
                      {!wearing && !trying && (
                        <button className="deco-btn ghost" onClick={() => preview(b)}>
                          Try on
                        </button>
                      )}
                      {trying && <span className="tag">Trying on</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <aside>
          <h2 className="section-title">Record player</h2>
          <RecordPlayerPanel />
          <h2 className="section-title">Quote Pearl journal</h2>
          {pearls.length ? (
            <ul className="journal">
              {pearls.map((p) => (
                <li key={p.id}>
                  <blockquote>“{p.text.length > 160 ? `${p.text.slice(0, 160)}…` : p.text}”</blockquote>
                  <span className="muted small">p. {p.page}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Highlight a line while reading and it becomes a pearl on Roxy's necklace.</p>
          )}
        </aside>
      </div>
    </ScreenFrame>
  );
}
