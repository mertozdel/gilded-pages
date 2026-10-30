import { useStore } from '../store';
import type { Settings } from '../store/settingsSlice';
import { ScreenFrame } from '../ui/ScreenFrame';
import { DecoPanel } from '../ui/DecoPanel';
import { GameSettings } from './settings/GameSettings';

const MODES: { id: Settings['readingMode']; name: string; desc: string }[] = [
  { id: 'gala', name: 'Full Gala', desc: 'Scenery, reactions, transitions, music and effects. For leisure reading.' },
  { id: 'calm', name: 'Calm', desc: 'Roxy only, slow idle, still scenery, quiet music. For focused reading.' },
  { id: 'text', name: 'Text only', desc: 'No strip, no character, no sound. For study or a low battery.' },
];

export function SettingsScreen() {
  const s = useStore((st) => st.settings);
  const set = useStore((st) => st.setSettings);
  const setHelpOpen = useStore((st) => st.setHelpOpen);
  return (
    <ScreenFrame className="settings" title="Settings" subtitle="Roxy holds still while you choose" footer={<span>Everything is stored on this device (IndexedDB). Nothing goes to a server.</span>}>
      <div className="settings-wrap">
        <DecoPanel title="Reading mode">
          <div className="mode-cards" role="radiogroup" aria-label="Reading mode">
            {MODES.map((m) => (
              <label key={m.id} className={`mode-card ${s.readingMode === m.id ? 'active' : ''}`}>
                <input type="radio" name="mode" checked={s.readingMode === m.id} onChange={() => set({ readingMode: m.id })} />
                <strong>{m.name}</strong>
                <span className="small">{m.desc}</span>
              </label>
            ))}
          </div>
        </DecoPanel>
        <DecoPanel title="Page">
          <label className="field">
            <span>Font zoom · {Math.round(s.fontZoom * 100)}%</span>
            <input type="range" min={0.6} max={2.5} step={0.05} value={s.fontZoom} onChange={(e) => set({ fontZoom: Number(e.target.value) })} />
          </label>
          <label className="field check">
            <input type="checkbox" checked={s.nightMode} onChange={(e) => set({ nightMode: e.target.checked })} />
            <span>Night mode (“Speakeasy”) — dark pages, night scenery</span>
          </label>
          <label className="field check">
            <input type="checkbox" checked={s.layout === 'auto'} onChange={(e) => set({ layout: e.target.checked ? 'auto' : 'single' })} />
            <span>Two-page spread on wide screens</span>
          </label>
        </DecoPanel>
        <DecoPanel title="Sound">
          <label className="field check">
            <input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} />
            <span>Sound on</span>
          </label>
          <label className="field">
            <span>Music · {Math.round(s.musicVolume * 100)}%</span>
            <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} disabled={!s.sound} onChange={(e) => set({ musicVolume: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Effects · {Math.round(s.sfxVolume * 100)}%</span>
            <input type="range" min={0} max={1} step={0.05} value={s.sfxVolume} disabled={!s.sound} onChange={(e) => set({ sfxVolume: Number(e.target.value) })} />
          </label>
          <p className="muted small">Music is quieter in Calm and off in Text only. Effects play in Full Gala; Calm keeps a soft page flip.</p>
        </DecoPanel>
        <GameSettings />
        <DecoPanel title="Keyboard">
          <p>Everything works without a mouse.</p>
          <button className="deco-btn" onClick={() => setHelpOpen(true)}>
            Show keyboard shortcuts <kbd>?</kbd>
          </button>
        </DecoPanel>
      </div>
    </ScreenFrame>
  );
}
