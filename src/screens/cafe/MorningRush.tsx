import { useCallback, useEffect, useRef, useState } from 'react';
import { bus } from '../../bus/events';
import { CAFE } from '../../content';
import { payRushTips, RUSH_PAID_ROUNDS_PER_DAY } from '../../db/queries';
import { localDate } from '../../rules/dates';
import { useStore } from '../../store';

const ROUND_MS = 60_000;

/**
 * Morning Rush: up to 60 seconds of matching orders. Optional, never needed to progress.
 * Tips are capped (1 Gilt a round, three paid rounds a day) — below what a minute of reading earns.
 */
export function MorningRush({ onClose, payout }: { onClose: () => void; payout?: (served: number) => Promise<string> }) {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'done'>('ready');
  const [queue, setQueue] = useState<string[]>([]);
  const [served, setServed] = useState(0);
  const [missed, setMissed] = useState(0);
  const [left, setLeft] = useState(ROUND_MS);
  const [result, setResult] = useState<string | null>(null);
  const setPlayer = useStore((s) => s.setPlayer);
  const startRef = useRef(0);
  const servedRef = useRef(0);

  const randomDrink = () => CAFE.drinks[Math.floor(Math.random() * CAFE.drinks.length)].id;

  const finish = useCallback(async () => {
    setPhase('done');
    bus.emit('rush:end', { served: servedRef.current });
    // A crew member's shift pays in their own way (Gilt is Roxy's).
    if (payout) return setResult(await payout(servedRef.current));
    const { gilt, player } = await payRushTips(servedRef.current, localDate());
    setPlayer(player);
    setResult(
      gilt > 0
        ? `${servedRef.current} orders served · +${gilt} Gilt in tips`
        : servedRef.current >= 6
          ? `${servedRef.current} orders served · today's tip jar is full (${RUSH_PAID_ROUNDS_PER_DAY} paid rounds a day)`
          : `${servedRef.current} orders served · serve 6 for a tip`,
    );
  }, [setPlayer, payout]);

  const start = () => {
    servedRef.current = 0;
    setServed(0);
    setMissed(0);
    setQueue([randomDrink(), randomDrink(), randomDrink()]);
    startRef.current = performance.now();
    setLeft(ROUND_MS);
    setPhase('playing');
    bus.emit('rush:start', {});
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = window.setInterval(() => {
      const remaining = ROUND_MS - (performance.now() - startRef.current);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(id);
        void finish();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  // Leaving mid-round ends it.
  useEffect(() => () => bus.emit('rush:end', { served: servedRef.current }), []);

  const serve = useCallback(
    (drink: string) => {
      if (phase !== 'playing' || !queue.length) return;
      const correct = queue[0] === drink;
      bus.emit('rush:order', { drink, correct });
      if (correct) {
        servedRef.current += 1;
        setServed(servedRef.current);
        setQueue((q) => [...q.slice(1), randomDrink()]);
      } else {
        setMissed((m) => m + 1);
        startRef.current -= 2000;
      }
    },
    [phase, queue],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = CAFE.drinks.find((x) => x.key === e.key);
      if (d && phase === 'playing') {
        e.preventDefault();
        e.stopPropagation();
        serve(d.id);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [serve, phase]);

  const name = (id: string) => CAFE.drinks.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="rush">
      {phase === 'ready' && (
        <>
          <p>Orders pile up on the rail. Press the matching drink — or its number key — as fast as you can for 60 seconds.</p>
          <p className="muted small">Optional. Tips: 1 Gilt for a round of 6+ orders, up to {RUSH_PAID_ROUNDS_PER_DAY} paid rounds a day. Reading always earns more.</p>
          <button className="deco-btn big" onClick={start} autoFocus>
            Open the bar
          </button>
        </>
      )}
      {phase !== 'ready' && (
        <>
          <div className="rush-status">
            <span>⏱ {Math.ceil(left / 1000)}s</span>
            <span>Served {served}</span>
            <span>Mix-ups {missed}</span>
          </div>
          <ol className="rush-rail" aria-label="Orders">
            {queue.map((d, i) => (
              <li key={`${d}-${i}`} className={i === 0 ? 'next' : ''}>
                {name(d)}
              </li>
            ))}
          </ol>
          <div className="rush-drinks">
            {CAFE.drinks.map((d) => (
              <button key={d.id} className="deco-btn" disabled={phase !== 'playing'} onClick={() => serve(d.id)}>
                <kbd>{d.key}</kbd> {d.name}
              </button>
            ))}
          </div>
          {phase === 'done' && (
            <div className="rush-result" role="status">
              <p>{result ?? 'Counting the tip jar…'}</p>
              <button className="deco-btn" onClick={start}>
                Another round
              </button>{' '}
              <button className="deco-btn" onClick={onClose}>
                Done
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
