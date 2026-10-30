import { useEffect, useState } from 'react';
import { onMusicChange, pianoPlaying, pianoRepertoire } from '../../audio/music';
import { bus } from '../../bus/events';
import { trackById } from '../../content';
import { useStore } from '../../store';

/** The café piano: pick a tune and Roxy sits down to play it; stand her up to send her back to the bar. */
export function PianoPanel() {
  const sound = useStore((s) => s.settings.sound);
  const [, force] = useState(0);
  useEffect(() => onMusicChange(() => force((n) => n + 1)), []);
  const playing = pianoPlaying();
  const tune = playing ? trackById(playing) : undefined;

  return (
    <div className="record-player piano-panel">
      <p className="muted">
        {tune ? (
          <>
            Roxy is playing <strong>{tune.title}</strong> — {tune.composer}, {tune.year}
          </>
        ) : (
          'The lid is up and the bench is free.'
        )}
        {!sound && ' · Sound is off in Settings.'}
      </p>
      <ol className="panel-list">
        {pianoRepertoire().map((t) => (
          <li key={t.id}>
            <button data-list-item className={`list-btn ${playing === t.id ? 'current' : ''}`} onClick={() => bus.emit('piano:play', { trackId: t.id })}>
              <span className="list-main">
                {t.title} <span className="muted small">— {t.composer}, {t.year}</span>
              </span>
              <span className="list-page">{playing === t.id ? 'playing' : 'play'}</span>
            </button>
          </li>
        ))}
      </ol>
      {playing && (
        <button className="deco-btn" onClick={() => bus.emit('piano:stop', {})}>
          Stand up (back to the bar)
        </button>
      )}
      <p className="muted small">She keeps playing while you browse the shelf. Clicking anywhere else in the café ends her set. Placeholder solo-piano arrangements for now.</p>
    </div>
  );
}
