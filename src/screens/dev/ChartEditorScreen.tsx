import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS, type CharacterId } from '../../content/characters';
import { AudioClock } from '../../game/rhythm/AudioClock';
import { DIFFICULTIES, LANES, validateChart, type Chart, type ChartNote, type Difficulty } from '../../game/rhythm/Chart';
import { generateChart } from '../../game/rhythm/ChartGen';
import { keysForLanes } from '../../game/rhythm/InputRouter';
import { playableSongs } from '../../game/rhythm/playable';
import { leadInMs, type SongDef } from '../../game/rhythm/Song';
import { AudioTrackPlayer, SynthPlayer } from '../../game/rhythm/Synth';
import { useStore } from '../../store';

const GIGS = CHARACTERS.flatMap((c) => (c.break?.type === 'rhythm' ? [{ id: c.id, mode: c.break.mode }] : []));
const emptyDiffs = (): Record<Difficulty, ChartNote[]> => ({ easy: [], normal: [], hard: [], expert: [] });

/**
 * Dev: make a chart. Load a Synth song or an audio file, play it, record taps per lane (the
 * lane keys; a long press is a hold), quantise to 1/8 or 1/16 at the tempo, fix notes on the
 * grid (click a cell), and export the chart JSON (validated) for src/content/songs.ts.
 */
export function ChartEditorScreen() {
  const settings = useStore((s) => s.settings);
  const [character, setCharacter] = useState<CharacterId>(GIGS[0]?.id ?? 'joel');
  const mode = GIGS.find((g) => g.id === character)?.mode ?? 'dj';
  const songs = useMemo(() => playableSongs(character, true), [character]);
  const [songId, setSongId] = useState<string>('');
  const [audio, setAudio] = useState<{ name: string; url: string } | null>(null);
  const [meta, setMeta] = useState({ id: 'my-song', title: 'My song', composer: 'Original', bpm: 120, offsetMs: 0, beats: 4 });
  const [difficulty, setDifficulty] = useState<Difficulty>('hard');
  const [grid, setGrid] = useState<8 | 16>(16);
  const [diffs, setDiffs] = useState<Record<Difficulty, ChartNote[]>>(emptyDiffs);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [now, setNow] = useState(0);
  const clock = useRef<AudioClock | null>(null);
  const player = useRef<SynthPlayer | AudioTrackPlayer | null>(null);
  const downAt = useRef(new Map<number, number>());
  const lanes = LANES[difficulty];
  const notes = diffs[difficulty];
  const song: SongDef | null = useMemo(() => {
    const p = songs.find((x) => x.id === songId);
    return p?.source.kind === 'synth' ? p.source.song : null;
  }, [songs, songId]);

  // A Synth song brings its tempo, count-in and generated chart.
  useEffect(() => {
    if (!song) return;
    setAudio(null);
    setMeta({ id: song.id, title: song.title, composer: song.composer, bpm: song.bpm, offsetMs: leadInMs(song), beats: song.beatsPerBar });
    setDiffs(generateChart(song, mode).difficulties);
  }, [song, mode]);

  const stop = () => {
    player.current?.stop();
    player.current = null;
    setPlaying(false);
    setRecording(false);
  };

  const play = async (record: boolean) => {
    stop();
    const c = new AudioClock();
    c.userOffsetMs = settings.rhythmAudioOffsetMs;
    await c.ctx.resume();
    clock.current = c;
    c.start(0, 1, 0.2);
    if (song) player.current = new SynthPlayer(c, song, 0.6);
    else if (audio) player.current = await AudioTrackPlayer.load(c, audio.url, 0.8);
    player.current?.play(0);
    if (record) setDiffs((d) => ({ ...d, [difficulty]: [] }));
    setPlaying(true);
    setRecording(record);
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      setNow(clock.current?.songTimeMs() ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Recording: lane keys down and up.
  useEffect(() => {
    if (!recording) return;
    const keys = keysForLanes(settings.laneKeys, lanes);
    const beat = 60_000 / meta.bpm;
    const down = (e: KeyboardEvent) => {
      const lane = keys.indexOf(e.code);
      if (lane < 0 || e.repeat) return;
      e.preventDefault();
      downAt.current.set(lane, clock.current!.eventToSongMs(e.timeStamp));
    };
    const up = (e: KeyboardEvent) => {
      const lane = keys.indexOf(e.code);
      const t = downAt.current.get(lane);
      if (lane < 0 || t === undefined) return;
      downAt.current.delete(lane);
      const len = clock.current!.eventToSongMs(e.timeStamp) - t;
      const n: ChartNote = len >= beat / 2 ? { t, lane, type: 'hold', len } : { t, lane, type: 'tap' };
      setDiffs((d) => ({ ...d, [difficulty]: [...d[difficulty], n].sort((a, b) => a.t - b.t) }));
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [recording, settings.laneKeys, lanes, meta.bpm, difficulty]);
  useEffect(() => () => stop(), []);

  const stepMs = 60_000 / meta.bpm / (grid / 4);
  const snap = (t: number) => meta.offsetMs + Math.round((t - meta.offsetMs) / stepMs) * stepMs;
  const quantise = () =>
    setDiffs((d) => {
      const seen = new Set<string>();
      const q = d[difficulty]
        .map((n) => ({ ...n, t: snap(n.t), ...(n.len ? { len: Math.max(stepMs, Math.round(n.len / stepMs) * stepMs) } : {}) }))
        .filter((n) => {
          const k = `${n.lane}@${Math.round(n.t)}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      return { ...d, [difficulty]: q };
    });

  const lastT = Math.max(meta.offsetMs + 8 * meta.beats * (60_000 / meta.bpm), ...notes.map((n) => n.t + (n.len ?? 0))) + stepMs * 4;
  const rows = Math.ceil((lastT - meta.offsetMs) / stepMs);
  const toggle = (row: number, lane: number) => {
    const t = meta.offsetMs + row * stepMs;
    setDiffs((d) => {
      const list = d[difficulty];
      const hit = list.find((n) => (n.lane === lane || n.lane2 === lane) && Math.abs(n.t - t) < stepMs / 2);
      return { ...d, [difficulty]: hit ? list.filter((n) => n !== hit) : [...list, { t, lane, type: 'tap' as const }].sort((a, b) => a.t - b.t) };
    });
  };

  const chart: Chart = {
    id: meta.id,
    title: meta.title,
    composer: meta.composer,
    bpm: meta.bpm,
    offsetMs: meta.offsetMs,
    durationMs: Math.round(lastT + 2000),
    timeSignature: `${meta.beats}/4`,
    ...(song ? { synth: song.id } : { audio: audio ? `assets/audio/songs/${audio.name}` : 'assets/audio/songs/my-song.mp3' }),
    difficulties: diffs,
  };
  const errors = validateChart(chart);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(chart, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    const c = JSON.parse(await f.text()) as Chart;
    setMeta({ id: c.id, title: c.title, composer: c.composer, bpm: c.bpm, offsetMs: c.offsetMs, beats: Number(c.timeSignature?.split('/')[0]) || 4 });
    setDiffs({ ...emptyDiffs(), ...c.difficulties });
    setSongId('');
  };
  const nowRow = Math.floor((now - meta.offsetMs) / stepMs);

  return (
    <div className="dev-screen chart-editor">
      <h1>Chart editor</h1>
      <p>
        <a href="#/dev/rhythm-test">← Rhythm test</a> · <a href="#/">Café</a>
      </p>
      <div className="dev-controls">
        <label>
          For{' '}
          <select value={character} onChange={(e) => setCharacter(e.target.value as CharacterId)}>
            {GIGS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.id} ({g.mode})
              </option>
            ))}
          </select>
        </label>
        <label>
          Synth song{' '}
          <select value={songId} onChange={(e) => setSongId(e.target.value)}>
            <option value="">—</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          …or audio{' '}
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setSongId('');
              setAudio({ name: f.name, url: URL.createObjectURL(f) });
              setDiffs(emptyDiffs());
            }}
          />
        </label>
        <label>
          Import chart <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
        </label>
      </div>
      <div className="dev-controls">
        {(['id', 'title', 'composer'] as const).map((k) => (
          <label key={k}>
            {k} <input value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} />
          </label>
        ))}
        <label>
          bpm <input type="number" value={meta.bpm} onChange={(e) => setMeta({ ...meta, bpm: Number(e.target.value) || 120 })} />
        </label>
        <label>
          offset ms <input type="number" value={meta.offsetMs} onChange={(e) => setMeta({ ...meta, offsetMs: Number(e.target.value) || 0 })} />
        </label>
        <label>
          beats/bar <input type="number" value={meta.beats} onChange={(e) => setMeta({ ...meta, beats: Number(e.target.value) || 4 })} />
        </label>
        <label>
          difficulty{' '}
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {DIFFICULTIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          grid{' '}
          <select value={grid} onChange={(e) => setGrid(Number(e.target.value) as 8 | 16)}>
            <option value={8}>1/8</option>
            <option value={16}>1/16</option>
          </select>
        </label>
      </div>
      <div className="dev-controls">
        <button className="deco-btn" disabled={!song && !audio} onClick={() => void play(false)}>
          Play
        </button>
        <button className="deco-btn" disabled={!song && !audio} onClick={() => void play(true)}>
          Record taps ({keysForLanes(settings.laneKeys, lanes).map((k) => k.replace('Key', '')).join(' ')})
        </button>
        <button className="deco-btn" onClick={stop} disabled={!playing}>
          Stop
        </button>
        <button className="deco-btn" onClick={quantise}>
          Quantise to 1/{grid}
        </button>
        <button className="deco-btn" onClick={exportJson} disabled={errors.length > 0}>
          Export JSON
        </button>
        <span className="small">
          {notes.length} notes · {playing ? `${(now / 1000).toFixed(1)} s${recording ? ' · recording' : ''}` : 'stopped'}
        </span>
      </div>
      {errors.length > 0 && (
        <ul className="dev-errors">
          {errors.slice(0, 8).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="chart-grid" style={{ ['--lanes' as string]: lanes }}>
        {Array.from({ length: rows }, (_, row) => {
          const t = meta.offsetMs + row * stepMs;
          const barStart = row % ((grid / 4) * meta.beats) === 0;
          return (
            <div key={row} className={`chart-row ${barStart ? 'bar' : ''} ${row === nowRow ? 'now' : ''}`}>
              <span className="chart-time">{barStart ? `bar ${row / ((grid / 4) * meta.beats) + 1}` : ''}</span>
              {Array.from({ length: lanes }, (_, lane) => {
                const on = notes.find((n) => (n.lane === lane || n.lane2 === lane) && t >= n.t - stepMs / 2 && t < n.t + Math.max(n.len ?? 0, 1) + stepMs / 2 - 1);
                const head = on && Math.abs(on.t - t) < stepMs / 2;
                return <button key={lane} className={`chart-cell ${on ? (head ? `head ${on.type}` : 'tail') : ''}`} onClick={() => toggle(row, lane)} aria-label={`${Math.round(t)} ms lane ${lane + 1}`} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
