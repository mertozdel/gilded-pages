import { CHARACTERS, CURRENCIES } from '../../content/characters';
import { weekBest } from '../../db/profiles';
import { useStore } from '../../store';

/**
 * The Twin Battle chalkboard in the café: this week's best gig of each twin (Fans for the DJ,
 * Applause for the bassist), read from their profiles.
 * TODO: a twin collab song (DJ + bass) — both twins on one stage, one chart per instrument.
 */
export function TwinBattleBoard() {
  const profiles = useStore((s) => s.profiles);
  const twins = CHARACTERS.filter((c) => c.twin);
  if (twins.length < 2) return null;
  const scores = twins.map((c) => ({ c, best: weekBest(profiles[c.id]) }));
  const lead = scores[0].best === scores[1].best ? null : scores[0].best > scores[1].best ? scores[0].c.id : scores[1].c.id;
  return (
    <div className="twin-board" title="Twin Battle: this week's best gig" data-testid="twin-battle">
      <span className="twin-board-title">Twin Battle</span>
      {scores.map(({ c, best }, i) => (
        <span key={c.id} className={`twin-board-row ${lead === c.id ? 'lead' : ''}`}>
          {i > 0 && <span className="twin-vs">vs</span>}
          {c.name} {best} {CURRENCIES[c.currency].icon}
        </span>
      ))}
    </div>
  );
}
