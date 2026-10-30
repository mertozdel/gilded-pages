import { useEffect, useRef, useState } from 'react';
import { CALIBRATION_CLICKS, Calibration } from '../../game/rhythm/Calibration';
import { useStore } from '../../store';

/**
 * Tap along to eight metronome clicks: the median of how late the taps land is the audio
 * offset. A slider sets the visual offset (notes drawn earlier or later). Shown before the
 * first rhythm game, and from Settings.
 */
export function CalibrationPanel({ onDone }: { onDone: () => void }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [phase, setPhase] = useState<'ready' | 'tapping' | 'done'>('ready');
  const [taps, setTaps] = useState(0);
  const [offset, setOffset] = useState<number | null>(null);
  const cal = useRef<Calibration | null>(null);
  const pad = useRef<HTMLButtonElement>(null);

  const start = async () => {
    cal.current?.dispose();
    const c = new Calibration(settings.sound ? settings.sfxVolume : 0);
    cal.current = c;
    setTaps(0);
    setOffset(null);
    setPhase('tapping');
    const ms = await c.start();
    pad.current?.focus();
    window.setTimeout(() => {
      const r = c.result();
      setOffset(r);
      setPhase('done');
    }, ms);
  };

  useEffect(() => {
    if (phase !== 'tapping') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.code !== 'Space' && e.code !== 'Enter' && !settings.laneKeys.includes(e.code))) return;
      e.preventDefault();
      cal.current?.tap(e.timeStamp);
      setTaps((n) => n + 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, settings.laneKeys]);
  useEffect(() => () => cal.current?.dispose(), []);

  const save = () => {
    if (offset !== null) setSettings({ rhythmAudioOffsetMs: offset, rhythmCalibrated: true });
    else setSettings({ rhythmCalibrated: true });
    onDone();
  };

  return (
    <div className="calibration" data-testid="calibration">
      {phase === 'ready' && (
        <>
          <p>Tap along to {CALIBRATION_CLICKS} clicks — Space, any lane key, or the pad. This measures how late your speakers or headphones play.</p>
          <button className="deco-btn big" onClick={() => void start()} autoFocus>
            Start the clicks
          </button>
          <button className="deco-btn ghost" onClick={save}>
            Skip
          </button>
        </>
      )}
      {phase === 'tapping' && (
        <button
          ref={pad}
          className="calibration-pad"
          onPointerDown={(e) => {
            cal.current?.tap(e.timeStamp);
            setTaps((n) => n + 1);
          }}
        >
          Tap! <small>{taps}/{CALIBRATION_CLICKS}</small>
        </button>
      )}
      {phase === 'done' && (
        <>
          <p role="status">{offset === null ? 'Not enough taps landed near the clicks — try again.' : `Your taps land ${Math.abs(offset)} ms ${offset >= 0 ? 'late' : 'early'}: the audio offset is ${offset} ms.`}</p>
          <button className="deco-btn" onClick={() => void start()}>
            Again
          </button>{' '}
          <button className="deco-btn big" onClick={save}>
            Save
          </button>
        </>
      )}
      <label className="field">
        <span>Visual offset · {settings.rhythmVisualOffsetMs} ms (notes drawn {settings.rhythmVisualOffsetMs >= 0 ? 'later' : 'earlier'})</span>
        <input type="range" min={-150} max={150} step={5} value={settings.rhythmVisualOffsetMs} onChange={(e) => setSettings({ rhythmVisualOffsetMs: Number(e.target.value) })} />
      </label>
      <p className="muted small">Audio offset now: {settings.rhythmAudioOffsetMs} ms</p>
    </div>
  );
}
