import { patternDef } from '../../../game/latte/patterns';
import { useStore } from '../../../store';

/** The latte artist's only collection: the best cup of each Daily Throwdown, pinned to the wall. */
export function PhotoBoard() {
  const photos = useStore((s) => s.profiles[s.character].collection);
  if (!photos.length) {
    return <p className="muted">No photos yet. Win a Daily Throwdown (three cups for a regular, once a day) and the best cup goes up here.</p>;
  }
  return (
    <ul className="photo-board">
      {photos.map((p) => (
        <li key={p.id}>
          <img src={p.image} alt={`${patternDef(p.pattern).name}, quality ${Math.round(p.quality)}`} width={140} height={140} />
          <span className="small">
            {patternDef(p.pattern).name} · {Math.round(p.quality)}/100
          </span>
          <span className="small muted">
            {p.drink} · {new Date(p.takenAt).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
