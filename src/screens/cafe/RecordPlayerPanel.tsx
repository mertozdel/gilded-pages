import { useEffect, useState } from 'react';
import { isMissing, nowPlaying, onMusicChange, playRecord, recordPlaying, stopRecord, unlockedTracks } from '../../audio/music';
import { useStats } from '../../db/useStats';
import { useStore } from '../../store';
import { SOUNDTRACK } from '../../content';

/** The record player (HUD → Music): pick any unlocked track. Tracks play your own audio files. */
export function RecordPlayerPanel() {
  const stats = useStats();
  const sound = useStore((s) => s.settings.sound);
  const [, force] = useState(0);
  useEffect(() => onMusicChange(() => force((n) => n + 1)), []);
  const playing = nowPlaying();
  const record = recordPlaying();
  const tracks = stats ? unlockedTracks(stats) : [];
  const locked = SOUNDTRACK.tracks.length - tracks.length;

  return (
    <div className="record-player">
      <p className="muted">
        {playing ? (
          <>
            Now playing: <strong>{playing.title}</strong> — {playing.composer}, {playing.year} {record ? '(on the record player)' : ''}
          </>
        ) : (
          'The needle is up.'
        )}
        {!sound && ' · Sound is off in Settings.'}
      </p>
      <ol className="panel-list">
        {tracks.map(({ track, from }) => (
          <li key={track.id}>
            <button data-list-item className={`list-btn ${record === track.id ? 'current' : ''}`} onClick={() => playRecord(track.id)}>
              <span className="list-main">
                {track.title} <span className="muted small">— {track.composer}, {track.year}</span>
                {track.gatsby && <span className="tag">named in Gatsby</span>}
              </span>
              <span className="list-page">{isMissing(track.id) ? 'no file yet' : from}</span>
            </button>
          </li>
        ))}
      </ol>
      {record && (
        <button className="deco-btn" onClick={() => stopRecord()}>
          Lift the needle (back to the café playlist)
        </button>
      )}
      <p className="muted small">
        {locked > 0 ? `${locked} more records unlock as you read — museums, and places inside the books. ` : ''}Add your own recordings as
        public/assets/audio/music/&lt;track-id&gt;.mp3 (ids in soundtrack.json); tracks without a file stay silent.
      </p>
    </div>
  );
}
