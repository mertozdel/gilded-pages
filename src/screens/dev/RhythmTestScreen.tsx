import { useEffect, useRef, useState } from 'react';
import { CHARACTERS } from '../../content/characters';
import { runVirtual } from '../../game/rhythm/Autoplay';
import { DIFFICULTIES, type Difficulty } from '../../game/rhythm/Chart';
import { judgmentCount } from '../../game/rhythm/Judge';
import { loadPlayable, playableSongs } from '../../game/rhythm/playable';
import { ScoreModel } from '../../game/rhythm/ScoreModel';
import { RhythmSession, type SongResult } from '../../game/rhythm/Session';
import { useStore } from '../../store';

interface Row {
  id: string;
  title: string;
  character: string;
  mode: 'dj' | 'bass';
  difficulty: Difficulty;
  notes: number;
  accuracy?: number;
  perfect?: boolean;
  realtime?: SongResult;
}

/** Every rhythm character, with their mode. */
const GIGS = CHARACTERS.flatMap((c) => (c.break?.type === 'rhythm' ? [{ id: c.id, mode: c.break.mode }] : []));

/**
 * Dev: the Autoplay bot plays every chart. "Virtual" runs each one through the Judge with no
 * clock (instant); "real time" plays an excerpt through the AudioClock, the Synth and the
 * Judge frame by frame — the sync check. Results are also on `window.__rhythmTest`.
 */
export function RhythmTestScreen() {
  const settings = useStore((s) => s.settings);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);

  const virtual = async (): Promise<Row[]> => {
    const out: Row[] = [];
    for (const g of GIGS) {
      for (const p of playableSongs(g.id, true)) {
        const { chart } = await loadPlayable(p, g.mode);
        for (const d of DIFFICULTIES) {
          const notes = chart.difficulties[d];
          const js = runVirtual(notes, d === 'easy' ? 1.3 : 1);
          const score = new ScoreModel(judgmentCount(notes));
          js.forEach((j) => score.apply(j));
          out.push({ id: p.id, title: p.title, character: g.id, mode: g.mode, difficulty: d, notes: notes.length, accuracy: score.finalAccuracy, perfect: js.every((j) => j.grade === 'perfect') });
        }
      }
    }
    setRows(out);
    return out;
  };

  const realtime = async (id: string, character: string, difficulty: Difficulty, excerptMs = 9000): Promise<SongResult> => {
    const g = GIGS.find((x) => x.id === character)!;
    const p = playableSongs(g.id, true).find((x) => x.id === id)!;
    const loaded = await loadPlayable(p, g.mode);
    setBusy(`${p.title} · ${difficulty} (real time)`);
    return new Promise<SongResult>((resolve) => {
      const session = new RhythmSession({
        ...loaded,
        difficulty,
        mode: g.mode,
        canvas: canvas.current!,
        surface: null,
        theme: g.mode === 'dj' ? 'neon-china' : 'bavaria',
        settings: { ...settings, audioOffsetMs: 0, visualOffsetMs: 0, volume: 0.3, laneKeys: settings.laneKeys, starPowerKey: settings.starPowerKey, reduceFlashing: true, noteSpeed: 1, noFail: true },
        autoplay: true,
        untilMs: loaded.chart.offsetMs + excerptMs,
        onEnd: (r) => {
          session.dispose();
          setBusy('');
          setRows((rs) => rs.map((row) => (row.id === id && row.difficulty === difficulty && row.character === character ? { ...row, realtime: r } : row)));
          resolve(r);
        },
      });
      void session.start();
    });
  };

  useEffect(() => {
    void virtual();
    (window as unknown as { __rhythmTest?: unknown }).__rhythmTest = { virtual, realtime };
    return () => {
      delete (window as unknown as { __rhythmTest?: unknown }).__rhythmTest;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dev-screen">
      <h1>Rhythm test — Autoplay</h1>
      <p className="muted">The bot hits every note. Virtual: through the Judge with no clock. Real time: a 9 s excerpt through the AudioClock, the Synth and the Judge (the sync check).</p>
      <p>
        <button className="deco-btn" onClick={() => void virtual()}>
          Run virtual again
        </button>{' '}
        <a href="#/dev/chart-editor">Chart editor →</a> · <a href="#/">Back to the café</a>
      </p>
      {busy && <p role="status">Playing {busy}…</p>}
      <canvas ref={canvas} className="dev-highway" />
      <table className="dev-table" data-testid="rhythm-table">
        <thead>
          <tr>
            <th>Song</th>
            <th>Who</th>
            <th>Difficulty</th>
            <th>Notes</th>
            <th>Virtual</th>
            <th>Real time</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.character}-${r.id}-${r.difficulty}`}>
              <td>{r.title}</td>
              <td>{r.character}</td>
              <td>{r.difficulty}</td>
              <td>{r.notes}</td>
              <td className={r.perfect ? 'ok' : 'bad'}>{r.accuracy?.toFixed(1)}%</td>
              <td className={r.realtime ? (r.realtime.counts.perfect && !r.realtime.counts.great && !r.realtime.counts.good && !r.realtime.counts.miss ? 'ok' : 'bad') : ''}>
                {r.realtime ? `${r.realtime.accuracy.toFixed(1)}% (${r.realtime.counts.perfect}P ${r.realtime.counts.great}Gr ${r.realtime.counts.good}G ${r.realtime.counts.miss}M)` : '—'}
              </td>
              <td>
                <button className="deco-btn small" disabled={!!busy} onClick={() => void realtime(r.id, r.character, r.difficulty)}>
                  Real time
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
