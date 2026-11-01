import { useEffect, useMemo, useRef, useState } from 'react';
import { bus, type StageRect } from '../bus/events';
import { CURRENCIES, characterForVenue, type VenueId } from '../content/characters';
import { LATER_VENUES, VENUES } from '../content/venues';
import { addUnlock, earn, raiseBest } from '../db/profiles';
import { DIFFICULTIES, type Difficulty } from '../game/rhythm/Chart';
import type { ChartMode } from '../game/rhythm/ChartGen';
import { bestKey, loadPlayable, playableSongs, type Loaded, type Playable } from '../game/rhythm/playable';
import { RhythmSession, type SessionSnapshot, type SongResult } from '../game/rhythm/Session';
import { beatMs, leadInMs } from '../game/rhythm/Song';
import { EVERYTHING_OPEN } from '../rules/unlocks';
import { useStore } from '../store';
import { flashingReduced } from '../store/settingsSlice';
import { PixelIcon } from '../ui/PixelIcon';
import { CalibrationPanel } from './venue/CalibrationPanel';

type Phase = 'title' | 'calibrate' | 'select' | 'loading' | 'playing' | 'results';

const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Easy · 2 lanes', normal: 'Normal · 3 lanes', hard: 'Hard · 4 lanes', expert: 'Expert · 4 + specials' };
const PRACTICE_RATE = 0.75;
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Sections to practise: a Synth song's own, or 8-bar stretches. */
function sectionsOf(p: Playable, loaded: Loaded | null): { name: string; fromMs: number; toMs: number }[] {
  if (p.source.kind === 'synth') {
    const s = p.source.song;
    const bar = beatMs(s) * s.beatsPerBar;
    let at = leadInMs(s);
    return s.sections.map((sec) => {
      const from = at;
      at += sec.bars * bar;
      return { name: sec.name, fromMs: from, toMs: at };
    });
  }
  if (!loaded) return [];
  const bar = (60_000 / loaded.chart.bpm) * (Number(loaded.chart.timeSignature.split('/')[0]) || 4);
  const out = [];
  for (let at = loaded.chart.offsetMs, i = 1; at < loaded.chart.durationMs; at += bar * 8, i++) out.push({ name: `Bars ${(i - 1) * 8 + 1}–${i * 8}`, fromMs: at, toMs: at + bar * 8 });
  return out;
}

/**
 * A break venue: the village fest (Jonas, bass) or the neon festival (Joel, DJ). The festival
 * scene plays behind; this screen is the title card, the song select (the stage's chalkboard or
 * the big LED screen), the note highway with its HUD, pausing (Esc or a hidden tab; resuming
 * counts 3-2-1), the results with the currency earned, and the way back to the café.
 */
export function VenueScreen({ venue: venueId }: { venue: VenueId }) {
  const venue = VENUES[venueId];
  const who = characterForVenue(venueId)!;
  const mode: ChartMode = who.break?.type === 'rhythm' && who.break.mode === 'dj' ? 'dj' : 'bass';
  const settings = useStore((s) => s.settings);
  const profile = useStore((s) => s.profiles[who.id]);
  const setProfile = useStore((s) => s.setProfile);
  const setTravel = useStore((s) => s.setTravel);
  const toast = useStore((s) => s.toast);
  const songs = useMemo(() => playableSongs(who.id), [who.id]);
  const [phase, setPhase] = useState<Phase>('title');
  const [pick, setPick] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [practice, setPractice] = useState(false);
  const [section, setSection] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [snap, setSnap] = useState<SessionSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<(SongResult & { earned: number; newBest: boolean }) | null>(null);
  const [anchor, setAnchor] = useState<StageRect | null>(() => bus.last('venue:anchors')?.setlist ?? null);
  const highway = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const session = useRef<RhythmSession | null>(null);
  const cur = CURRENCIES[who.currency];
  const song = songs[pick];

  // The festival scene behind this screen.
  useEffect(() => {
    bus.emit('venue:show', { venue: venueId, setlist: songs.map((s) => s.title) });
    bus.emit('rhythm:state', { phase: 'select' });
    const off = bus.on('venue:anchors', (e) => setAnchor(e.setlist));
    const t = window.setTimeout(() => setPhase(useStore.getState().settings.rhythmCalibrated ? 'select' : 'calibrate'), 1700);
    return () => {
      off();
      window.clearTimeout(t);
      session.current?.dispose();
      bus.emit('venue:show', { venue: null, setlist: [] });
    };
  }, [venueId, songs]);

  // Practice sections need the chart (audio songs).
  useEffect(() => {
    setLoaded(null);
    if (song) void loadPlayable(song, mode).then(setLoaded);
  }, [song, mode]);

  // While everything is open (src/rules/unlocks.ts), so is every song; the prices stay for later.
  const locked = (p: Playable | undefined) => !EVERYTHING_OPEN && !!p && p.unlock > profile.currency;

  const start = async () => {
    if (!song || locked(song)) return;
    setPhase('loading');
    const l = loaded ?? (await loadPlayable(song, mode));
    const secs = sectionsOf(song, l);
    const sec = practice ? secs[Math.min(section, secs.length - 1)] : null;
    setPhase('playing');
    setPaused(false);
    setResult(null);
    // Wait a frame so the highway canvas has its size.
    await new Promise((r) => requestAnimationFrame(r));
    const s = useStore.getState().settings;
    session.current?.dispose();
    const run = new RhythmSession({
      ...l,
      difficulty,
      mode,
      style: song.style,
      canvas: highway.current!,
      surface: surface.current,
      theme: venue.highway,
      settings: {
        audioOffsetMs: s.rhythmAudioOffsetMs,
        visualOffsetMs: s.rhythmVisualOffsetMs,
        noteSpeed: s.noteSpeed,
        leftHanded: s.leftHanded,
        laneShapes: s.laneShapes,
        noFail: s.noFail,
        laneKeys: s.laneKeys,
        starPowerKey: s.starPowerKey,
        reduceFlashing: flashingReduced(s),
        volume: s.sound ? s.musicVolume : 0,
      },
      practice: sec ? { fromMs: sec.fromMs, toMs: sec.toMs, rate: PRACTICE_RATE } : undefined,
      onSnapshot: setSnap,
      onPause: () => setPaused(true),
      onEnd: (r) => void finish(r, !!sec),
    });
    session.current = run;
    await run.start();
  };

  const finish = async (r: SongResult, practiced: boolean) => {
    setPhase('results');
    bus.emit('rhythm:state', { phase: 'results' });
    if (practiced) {
      setResult({ ...r, earned: 0, newBest: false });
      return;
    }
    // Applause / Fans: for the score, more for stars. Never Gilt.
    const earned = r.cleared ? Math.round(r.score / 200) + r.stars * 5 : Math.round(r.score / 400);
    const e = await earn(who.id, earned, r.score, bestKey(song.id, difficulty), { gigs: 1, cleared: r.cleared ? 1 : 0, fullCombos: r.fullCombo ? 1 : 0 });
    let p = await raiseBest(who.id, `stars:${song.id}:${difficulty}`, r.stars);
    // Their currency opens songs and, later, new venues.
    for (const v of LATER_VENUES[who.id] ?? []) {
      if (p.currency >= v.unlock && !p.unlocks.includes(`venue:${v.id}`)) {
        p = await addUnlock(who.id, `venue:${v.id}`);
        toast(`New venue unlocked: ${v.name} (coming soon)`, 'gold');
      }
    }
    if (!EVERYTHING_OPEN) for (const s of songs) if (s.unlock && p.currency >= s.unlock && e.profile.currency - earned < s.unlock) toast(`New song unlocked: ${s.title}`, 'gold');
    setProfile(p);
    setResult({ ...r, earned, newBest: e.newBest });
  };

  const resume = () => {
    setPaused(false);
    setCount(3);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        window.clearInterval(id);
        void session.current?.resume();
      }
    }, 1000);
  };

  const quit = () => {
    session.current?.dispose();
    session.current = null;
    setPaused(false);
    setPhase('select');
    bus.emit('rhythm:state', { phase: 'select' });
  };

  const goBack = () => {
    session.current?.dispose();
    setTravel({ venue: venueId, dir: 'back' });
  };

  // Keys on the select screen and the results.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'select' && songs.length) {
        if (e.key === 'ArrowDown') setPick((p) => (p + 1) % songs.length);
        else if (e.key === 'ArrowUp') setPick((p) => (p - 1 + songs.length) % songs.length);
        else if (e.key === 'ArrowRight') setDifficulty((d) => DIFFICULTIES[Math.min(3, DIFFICULTIES.indexOf(d) + 1)]);
        else if (e.key === 'ArrowLeft') setDifficulty((d) => DIFFICULTIES[Math.max(0, DIFFICULTIES.indexOf(d) - 1)]);
        else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) void start();
        else return;
        e.preventDefault();
      } else if (phase === 'playing' && paused && e.key === 'Escape') {
        e.preventDefault();
        resume();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const best = (id: string, d: Difficulty) => profile.bests[`stars:${id}:${d}`] ?? 0;
  const secs = song ? sectionsOf(song, loaded) : [];
  const progress = snap ? Math.min(1, Math.max(0, snap.songMs / snap.endMs)) : 0;
  const selectStyle = anchor && mode === 'dj' ? { left: Math.max(16, anchor.x + anchor.width / 2 - 230), top: Math.max(70, anchor.y) } : undefined;

  return (
    <div className={`venue-screen venue-${venueId}`} data-testid="venue">
      <header className="venue-bar">
        <h1>{venue.title}</h1>
        <span className="venue-sub">{venue.subtitle}</span>
        <span className="hud-gilt hud-currency" title={cur.name}>
          {cur.icon} {profile.currency} {cur.name}
        </span>
        {phase === 'playing' && !paused && (
          <button className="hud-btn" onClick={() => session.current?.pause()} title="Pause (Esc)">
            ❚❚ <span className="hud-label">Pause</span>
          </button>
        )}
        <button className="hud-btn" onClick={goBack} title={venue.back}>
          <PixelIcon name="home" scale={2} /> <span className="hud-label">{venue.back}</span>
        </button>
      </header>

      {phase === 'title' && (
        <div className="venue-title-card" role="status">
          <strong>{venue.title}</strong>
          <span>{venue.subtitle}</span>
        </div>
      )}

      {phase === 'calibrate' && (
        <div className="venue-panel venue-calibrate">
          <h2>Before the first song: calibration</h2>
          <CalibrationPanel onDone={() => setPhase('select')} />
        </div>
      )}

      {phase === 'select' && (
        <div className={`venue-panel venue-select ${mode === 'dj' ? 'led' : 'chalk'}`} style={selectStyle} data-testid="song-select">
          <h2>{mode === 'dj' ? 'Tonight' : 'Heute spielt'}</h2>
          {songs.length === 0 ? (
            <p>No songs yet. Add them in src/content/songs.ts (or make a chart at #/dev/chart-editor).</p>
          ) : (
            <ol className="song-list" role="listbox" aria-label="Songs">
              {songs.map((s, i) => (
                <li key={s.id}>
                  <button role="option" aria-selected={i === pick} className={`${i === pick ? 'on' : ''} ${locked(s) ? 'locked' : ''}`} onClick={() => setPick(i)} onDoubleClick={() => void start()}>
                    <span className="song-title">
                      {s.title}
                      {s.dev && <small> (dev)</small>}
                    </span>
                    <span className="song-best">{locked(s) ? `🔒 ${s.unlock} ${cur.name}` : stars(best(s.id, difficulty))}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="diff-row" role="radiogroup" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button key={d} role="radio" aria-checked={difficulty === d} className={difficulty === d ? 'on' : ''} onClick={() => setDifficulty(d)} title={DIFF_LABEL[d]}>
                {d}
              </button>
            ))}
          </div>
          <p className="small">{DIFF_LABEL[difficulty]}</p>
          <label className="field check small">
            <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
            <span>Practice: loop a section at 75%</span>
          </label>
          {practice && secs.length > 0 && (
            <select value={section} onChange={(e) => setSection(Number(e.target.value))} aria-label="Section">
              {secs.map((s, i) => (
                <option key={i} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button className="deco-btn big" disabled={!song || locked(song)} onClick={() => void start()} data-testid="play-song">
            Play <kbd>Enter</kbd>
          </button>
          {(() => {
            const next = (LATER_VENUES[who.id] ?? []).find((v) => !profile.unlocks.includes(`venue:${v.id}`));
            return next ? (
              <p className="small">
                Next venue: {next.name} at {next.unlock} {cur.name} (you have {profile.currency})
              </p>
            ) : null;
          })()}
          <p className="muted small">
            Lanes {mode === 'dj' ? 'L deck · L FX · R FX · R deck' : 'E · A · D · G'} on {settings.laneKeys.map((k) => k.replace('Key', '')).join(' ')} · {venue.star} with{' '}
            {settings.starPowerKey === 'Space' ? 'Space' : settings.starPowerKey} or two fingers{mode === 'dj' ? ' · crossfades ← →' : ''}
          </p>
        </div>
      )}

      {phase === 'loading' && <div className="venue-title-card">Tuning up…</div>}

      <div className={`venue-play ${phase === 'playing' ? '' : 'hidden'}`}>
        <div className="venue-highway" ref={surface}>
          <canvas ref={highway} aria-label="Note highway" />
        </div>
        {snap && phase === 'playing' && (
          <aside className="venue-hud" aria-live="off">
            <div className="venue-score">{snap.score.toLocaleString()}</div>
            <div>
              Combo {snap.combo} · ×{snap.multiplier}
            </div>
            <div>Accuracy {snap.accuracy.toFixed(1)}%</div>
            <div className="venue-meter" title={venue.meter}>
              <span>{venue.meter}</span>
              <i style={{ width: `${snap.meter * 100}%` }} className={snap.meter < 0.25 ? 'low' : ''} />
            </div>
            <div className={`venue-meter star ${snap.starActive ? 'active' : ''}`} title={venue.star}>
              <span>{venue.star}</span>
              <i style={{ width: `${snap.star * 100}%` }} />
            </div>
            <button className="deco-btn" disabled={!snap.canStar} onClick={() => session.current?.triggerStar()}>
              {venue.star}
            </button>
            <div className="venue-progress">
              <i style={{ width: `${progress * 100}%` }} />
            </div>
          </aside>
        )}
      </div>

      {phase === 'playing' && paused && (
        <div className="venue-panel venue-pause" role="dialog" aria-label="Paused">
          <h2>Paused</h2>
          <button className="deco-btn big" onClick={resume} autoFocus>
            Resume <kbd>Esc</kbd>
          </button>
          <button className="deco-btn" onClick={() => void start()}>
            Restart
          </button>
          <button className="deco-btn" onClick={quit}>
            Song select
          </button>
        </div>
      )}
      {count > 0 && <div className="venue-count">{count}</div>}

      {phase === 'results' && result && (
        <div className="venue-panel venue-results" role="dialog" aria-label="Results" data-testid="results">
          <h2>{result.cleared ? 'Cleared!' : 'Song failed'}</h2>
          <div className="venue-stars">{stars(result.stars)}</div>
          <p>
            {result.score.toLocaleString()} points · {result.accuracy.toFixed(1)}% · max combo {result.maxCombo}
            {result.fullCombo && <strong className="fc"> FULL COMBO</strong>}
          </p>
          <p className="small">
            Perfect {result.counts.perfect} · Great {result.counts.great} · Good {result.counts.good} · Miss {result.counts.miss}
          </p>
          <p className="venue-earned">
            {result.earned > 0 ? `+${result.earned} ${cur.name} earned` : practice ? 'Practice — nothing earned' : `No ${cur.name} this time`}
            {result.newBest && ' · new best!'}
          </p>
          <button className="deco-btn" onClick={() => void start()}>
            Play again
          </button>
          <button className="deco-btn" onClick={quit}>
            Song select
          </button>
          <button className="deco-btn big" onClick={goBack}>
            {venue.back}
          </button>
        </div>
      )}
    </div>
  );
}
