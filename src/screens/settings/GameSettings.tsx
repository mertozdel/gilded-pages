import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { DecoPanel } from '../../ui/DecoPanel';
import { CalibrationPanel } from '../venue/CalibrationPanel';

const KEY_LABEL = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '');
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Waits for the next key and hands its code over (Esc cancels). */
function useKeyCapture(onKey: (code: string) => void): [boolean, () => void] {
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!listening) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setListening(false);
      if (e.code !== 'Escape') onKey(e.code);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [listening, onKey]);
  return [listening, () => setListening(true)];
}

function KeyButton({ label, code, onChange }: { label: string; code: string; onChange: (code: string) => void }) {
  const [listening, listen] = useKeyCapture(onChange);
  return (
    <button className={`deco-btn ${listening ? 'active' : ''}`} onClick={listen} aria-label={`${label}: ${KEY_LABEL(code)}. Press to change`}>
      {label} <kbd>{listening ? 'press a key…' : KEY_LABEL(code)}</kbd>
    </button>
  );
}

/**
 * The settings every character shares for the café games: the rhythm games (speed, lanes,
 * keys, calibration, No-fail, reduce flashing) and latte art (difficulty, Slow pour).
 */
export function GameSettings() {
  const s = useStore((st) => st.settings);
  const set = useStore((st) => st.setSettings);
  const [calibrating, setCalibrating] = useState(false);
  const forced = reducedMotion();
  return (
    <>
      <DecoPanel title="Rhythm games">
        <label className="field check">
          <input type="checkbox" checked={s.reduceFlashing || forced} disabled={forced} onChange={(e) => set({ reduceFlashing: e.target.checked })} />
          <span>Reduce flashing — no strobe, at most 3 flashes a second, slower beams, a dimmer floor{forced ? ' (on: your device asks for reduced motion)' : ''}</span>
        </label>
        <label className="field">
          <span>Note speed · {s.noteSpeed.toFixed(2)}×</span>
          <input type="range" min={0.5} max={2} step={0.05} value={s.noteSpeed} onChange={(e) => set({ noteSpeed: Number(e.target.value) })} />
        </label>
        <label className="field check">
          <input type="checkbox" checked={s.leftHanded} onChange={(e) => set({ leftHanded: e.target.checked })} />
          <span>Left-handed: flip the lanes</span>
        </label>
        <label className="field check">
          <input type="checkbox" checked={s.laneShapes} onChange={(e) => set({ laneShapes: e.target.checked })} />
          <span>A shape on every lane as well as a colour</span>
        </label>
        <label className="field check">
          <input type="checkbox" checked={s.noFail} onChange={(e) => set({ noFail: e.target.checked })} />
          <span>No-fail: the song goes on when the meter empties</span>
        </label>
        <div className="field">
          <span>Keys (lanes left to right, then star power)</span>
          <div className="key-row">
            {s.laneKeys.map((code, i) => (
              <KeyButton key={i} label={`Lane ${i + 1}`} code={code} onChange={(c) => set({ laneKeys: s.laneKeys.map((k, j) => (j === i ? c : k)) })} />
            ))}
            <KeyButton label="Star power" code={s.starPowerKey} onChange={(c) => set({ starPowerKey: c })} />
          </div>
          <p className="muted small">Crossfades are ← and →; Esc pauses. Two lanes use keys 2–3, three lanes keys 2–4.</p>
        </div>
        {calibrating ? (
          <CalibrationPanel onDone={() => setCalibrating(false)} />
        ) : (
          <button className="deco-btn" onClick={() => setCalibrating(true)}>
            Calibrate audio ({s.rhythmAudioOffsetMs} ms) and visual offset ({s.rhythmVisualOffsetMs} ms)
          </button>
        )}
      </DecoPanel>
      <DecoPanel title="Latte art">
        <div className="field" role="radiogroup" aria-label="Latte art difficulty">
          <span>Difficulty (window sizes ×1.5 / ×1 / ×0.7)</span>
          <div className="key-row">
            {(['easy', 'normal', 'hard'] as const).map((d) => (
              <label key={d} className={`mode-card small ${s.latteDifficulty === d ? 'active' : ''}`}>
                <input type="radio" name="latte-difficulty" checked={s.latteDifficulty === d} onChange={() => set({ latteDifficulty: d })} />
                <strong>{d[0].toUpperCase() + d.slice(1)}</strong>
              </label>
            ))}
          </div>
        </div>
        <label className="field check">
          <input type="checkbox" checked={s.slowPour} onChange={(e) => set({ slowPour: e.target.checked })} />
          <span>Slow pour: the pour gauge fills 30% slower</span>
        </label>
      </DecoPanel>
    </>
  );
}
