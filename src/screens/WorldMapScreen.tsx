import { useState } from 'react';
import { LOCATIONS, type Era, type LocationDef } from '../content';
import { useStats } from '../db/useStats';
import { EVERYTHING_OPEN, ruleProgress } from '../rules/unlocks';
import { useStore } from '../store';
import { ScreenFrame } from '../ui/ScreenFrame';

const TODAY_CITIES = [...new Set(LOCATIONS.filter((l) => l.era === '2026').map((l) => l.district))].join(', ');

/** The world map, in two eras: Roxy's 2026 (café, apartment, real museums) and 1925 inside the books. */
export function WorldMapScreen() {
  const [era, setEra] = useState<Era>('2026');
  const stats = useStats();
  const navigate = useStore((s) => s.navigate);
  const places = LOCATIONS.filter((l) => l.era === era);

  const open = (l: LocationDef) => {
    if (l.route) navigate({ name: l.route });
    else if (l.museum) navigate({ name: 'museum', museumId: l.museum });
    else if (l.id === 'reading-room') navigate({ name: 'cafe' });
  };

  return (
    <ScreenFrame
      className="map"
      title="The Map"
      subtitle={era === '2026' ? `Today · ${TODAY_CITIES}` : '1925 · inside the books'}
      footer={<span>{EVERYTHING_OPEN ? 'Every place is open to you. Reading still earns Gilt.' : 'Reading opens the world: pages, chapters and finished books unlock every place.'}</span>}
    >
      <div className="map-wrap">
        <div className="era-tabs" role="tablist" aria-label="Era">
          {(['2026', '1925'] as Era[]).map((e) => (
            <button key={e} role="tab" aria-selected={era === e} className={`panel-tab ${era === e ? 'active' : ''}`} onClick={() => setEra(e)}>
              {e === '2026' ? 'Today (2026)' : '1925 (inside the books)'}
            </button>
          ))}
        </div>
        <ul className="place-grid">
          {places.map((l) => {
            const p = stats ? ruleProgress(l.unlock, stats) : null;
            const unlocked = !!p?.done;
            const built = !!(l.route || l.museum || l.id === 'reading-room');
            return (
              <li key={l.id} className={`place ${unlocked ? 'open' : 'locked'}`}>
                <div className="place-head">
                  <h3>{l.name}</h3>
                  <span className="muted small">{l.district}</span>
                </div>
                <p>{l.does}</p>
                {!unlocked && p && (
                  <>
                    <p className="small">
                      {p.label} · {Math.min(p.have, p.need)}/{p.need}
                    </p>
                    <div className="meter">
                      <span style={{ width: `${Math.min(100, (p.have / p.need) * 100)}%` }} />
                    </div>
                  </>
                )}
                {unlocked && built && (
                  <button className="deco-btn" onClick={() => open(l)}>
                    {l.id === 'reading-room' ? 'Pick a book in the café' : 'Go'}
                  </button>
                )}
                {unlocked && !built && <p className="muted small">Unlocked — this place opens in phase {l.phase} of the build.</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </ScreenFrame>
  );
}
