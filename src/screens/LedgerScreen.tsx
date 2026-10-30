import { MUSEUMS } from '../content';
import { itemKey } from '../db/queries';
import { useOwned, useStats } from '../db/useStats';
import { STREAK_MIN_PAGES } from '../rules/streak';
import { levelForXp } from '../rules/xp';
import { useStore } from '../store';
import { ScreenFrame } from '../ui/ScreenFrame';

/** The ledger: pages, streaks, books, Art Cards — read by lamplight. */
export function LedgerScreen() {
  const stats = useStats();
  const owned = useOwned();
  const player = useStore((s) => s.player);
  const level = levelForXp(player.xp);
  const totalPieces = MUSEUMS.reduce((n, m) => n + m.pieces.length, 0);
  const cards = owned ? [...owned].filter((k) => k.startsWith('art:')).length : 0;
  const tiles: [string, string | number, string?][] = [
    ['Gilt', player.gilt],
    ['Reader level', `${level.level} · ${level.title}`, level.next ? `${player.xp}/${level.next.minXp} XP to ${level.next.title}` : `${player.xp} XP`],
    ['Green light streak', `${player.streakDays} days`, `${Math.min(player.pagesToday, STREAK_MIN_PAGES)}/${STREAK_MIN_PAGES} pages today`],
    ['Pages read', stats?.pagesCounted ?? '…', 'Counted by the honest-reading timer'],
    ['Chapters finished', stats?.chaptersFinished ?? '…'],
    ['Books', stats ? `${stats.booksFinished} finished of ${stats.books}` : '…'],
    ['Quote Pearls', stats?.highlights ?? '…'],
    ['Bookmarks', stats?.bookmarks ?? '…'],
    ['Art Cards', `${cards}/${totalPieces}`],
  ];
  return (
    <ScreenFrame className="ledger" title="The Ledger" subtitle="By lamplight" footer={<span>Everything here was earned by reading.</span>}>
      <div className="ledger-wrap">
        <ul className="stat-tiles">
          {tiles.map(([label, value, hint]) => (
            <li key={label} className="stat-tile">
              <span className="stat-label">{label}</span>
              <span className="stat-value">{value}</span>
              {hint && <span className="muted small">{hint}</span>}
            </li>
          ))}
        </ul>
        <h2 className="section-title">Museum badges</h2>
        <ul className="badges">
          {MUSEUMS.map((m) => {
            const got = owned?.has(itemKey.badge(m.id));
            const seen = m.pieces.filter((p) => owned?.has(itemKey.artCard(p.id))).length;
            return (
              <li key={m.id} className={`badge ${got ? 'got' : ''}`}>
                <strong>{m.reward.badge}</strong>
                <span className="muted small">
                  {m.short} · {seen}/{m.pieces.length}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </ScreenFrame>
  );
}
