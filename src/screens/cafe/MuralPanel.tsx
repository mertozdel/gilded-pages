import { LOCATIONS, MUSEUMS } from '../../content';
import { itemKey } from '../../db/queries';
import { useOwned, useStats } from '../../db/useStats';
import { ruleProgress } from '../../rules/unlocks';
import { useStore } from '../../store';

/** The mural: your Art Card collection, museum by museum, and the way in to each one. */
export function MuralPanel() {
  const owned = useOwned();
  const stats = useStats();
  const navigate = useStore((s) => s.navigate);
  const total = MUSEUMS.reduce((n, m) => n + m.pieces.length, 0);
  const have = MUSEUMS.reduce((n, m) => n + m.pieces.filter((p) => owned?.has(itemKey.artCard(p.id))).length, 0);
  return (
    <div className="mural-panel">
      <p className="muted">
        {have}/{total} Art Cards collected. Every museum's last card earns its badge; the Met's also earns the Vermeer Blue blouse.
      </p>
      <ol className="panel-list">
        {MUSEUMS.map((m) => {
          const loc = LOCATIONS.find((l) => l.museum === m.id);
          const gate = loc && stats ? ruleProgress(loc.unlock, stats) : null;
          const open = !!gate?.done;
          const cards = m.pieces.filter((p) => owned?.has(itemKey.artCard(p.id))).length;
          return (
            <li key={m.id}>
              <button data-list-item className="list-btn" disabled={!open} onClick={() => navigate({ name: 'museum', museumId: m.id })}>
                <span className="list-main">
                  {m.name} <span className="muted small">— {m.city}</span>
                  {owned?.has(itemKey.badge(m.id)) && <span className="tag">{m.reward.badge}</span>}
                </span>
                <span className="list-page">{open ? `${cards}/${m.pieces.length}` : gate ? `${gate.label}` : '…'}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
