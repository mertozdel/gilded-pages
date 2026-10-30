import { useEffect, useRef } from 'react';
import { LOCATIONS, REGULARS, type RegularDef } from '../../content';
import { useStats } from '../../db/useStats';
import { regularSheet } from '../../game/fx/cafeTextures';
import { ruleProgress, type ReadingStats } from '../../rules/unlocks';
import { useStore } from '../../store';

function Portrait({ regular }: { regular: RegularDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 64, 96);
    c.drawImage(regularSheet(regular), 4 * 32, 0, 32, 48, 0, 0, 64, 96);
  }, [regular]);
  return <canvas ref={ref} className="regular-portrait" width={64} height={96} aria-hidden="true" />;
}

function offer(r: RegularDef, stats: ReadingStats, pagesToday: number): { text: string; done: boolean; action?: { label: string; to: string } } {
  const loc = (id: string) => LOCATIONS.find((l) => l.id === id)!;
  switch (r.id) {
    case 'writer':
      return { text: `Today's quest: read 15 pages (${Math.min(15, pagesToday)}/15).`, done: pagesToday >= 15 };
    case 'odile': {
      return { text: 'Her records go on the record player as you unlock places.', done: true };
    }
    case 'guide': {
      const p = ruleProgress(loc('the-met').unlock, stats);
      if (!p.done) return { text: `${p.label} for a trip to The Met (${p.have}/${p.need}).`, done: false };
      // Once The Met is open she talks up the next museum on the map.
      const next = LOCATIONS.filter((l) => l.museum).find((l) => !ruleProgress(l.unlock, stats).done);
      const n = next && ruleProgress(next.unlock, stats);
      return {
        text: next && n ? `The Met is open to you. Next: ${next.name} — ${n.label} (${Math.min(n.have, n.need)}/${n.need}).` : 'Every museum on the map is open to you.',
        done: true,
        action: { label: 'Visit The Met', to: 'the-met' },
      };
    }
    case 'busker': {
      const p = ruleProgress(loc('speakeasy').unlock, stats);
      return { text: p.done ? 'A speakeasy table inside the books is waiting for you.' : `${p.label} for a speakeasy table inside the books (${Math.min(p.have, p.need)}/${p.need}).`, done: p.done };
    }
    case 'florist': {
      const p = ruleProgress(loc('mansion-lawn-party').unlock, stats);
      return { text: p.done ? 'A gilt-edged party invitation is waiting for you.' : 'Finish a book and she brings a mansion party invitation.', done: p.done };
    }
    default:
      return { text: r.brings, done: false };
  }
}

/** The café regulars and what each of them brings. */
export function RegularsPanel() {
  const stats = useStats();
  const pagesToday = useStore((s) => s.player.pagesToday);
  const navigate = useStore((s) => s.navigate);
  if (!stats) return null;
  return (
    <ul className="regulars">
      {REGULARS.map((r) => {
        const o = offer(r, stats, pagesToday);
        return (
          <li key={r.id} className="regular">
            <Portrait regular={r} />
            <div>
              <h3>{r.name}</h3>
              <p className="muted small">{r.who}</p>
              <blockquote>“{r.line}”</blockquote>
              <p className={`offer ${o.done ? 'done' : ''}`}>{o.text}</p>
              {o.action && (
                <button className="deco-btn" onClick={() => navigate({ name: 'museum', museumId: o.action!.to })}>
                  {o.action.label}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
