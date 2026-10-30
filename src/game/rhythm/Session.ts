/**
 * One play of one chart: the AudioClock, the Synth (or an audio file), the InputRouter, the
 * Judge, the ScoreModel and the HighwayView, run by one animation loop that only draws and
 * collects misses — inputs are judged the moment they arrive. Announces judgments, beats,
 * star power and the song's end on the bus for the venue. Pauses when the tab is hidden.
 */
import { bus } from '../../bus/events';
import { AudioClock, audioContext } from './AudioClock';
import { applyInput, autoplayInputs, type BotInput } from './Autoplay';
import { LANES, type Chart, type ChartNote, type Difficulty } from './Chart';
import { HighwayView, type HighwayThemeId } from './HighwayView';
import { InputRouter, keysForLanes } from './InputRouter';
import { EASY_WINDOW_SCALE, Judge, judgmentCount, type Grade, type Judgment } from './Judge';
import { ScoreModel } from './ScoreModel';
import type { SongDef } from './Song';
import { AudioTrackPlayer, SynthPlayer } from './Synth';

export interface SessionSettings {
  audioOffsetMs: number;
  visualOffsetMs: number;
  noteSpeed: number;
  leftHanded: boolean;
  laneShapes: boolean;
  noFail: boolean;
  laneKeys: string[];
  starPowerKey: string;
  reduceFlashing: boolean;
  volume: number;
}

export interface SessionOptions {
  chart: Chart;
  difficulty: Difficulty;
  mode: 'dj' | 'bass';
  /** A Synth song (or `audioUrl` for an audio chart). */
  song?: SongDef;
  audioUrl?: string;
  canvas: HTMLCanvasElement;
  surface: HTMLElement | null;
  theme: HighwayThemeId;
  settings: SessionSettings;
  /** Practice: loop a stretch, slower. */
  practice?: { fromMs: number; toMs: number; rate: number };
  autoplay?: boolean;
  /** The song's style (polka, waltz, march, edm…): how the player moves on stage. */
  style?: string;
  /** Stop (cleared) at this song time — a short excerpt for the real-time sync check. */
  untilMs?: number;
  onSnapshot?: (s: SessionSnapshot) => void;
  onEnd?: (r: SongResult) => void;
  onPause?: () => void;
}

export interface SessionSnapshot {
  score: number;
  combo: number;
  multiplier: number;
  accuracy: number;
  meter: number;
  star: number;
  starActive: boolean;
  canStar: boolean;
  songMs: number;
  endMs: number;
  counts: Record<Grade, number>;
  missStreak: number;
}

export interface SongResult {
  score: number;
  accuracy: number;
  stars: number;
  cleared: boolean;
  fullCombo: boolean;
  maxCombo: number;
  counts: Record<Grade, number>;
}

const STAR_BEATS = 8;
const KEY_LABEL = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', '␣');

export class RhythmSession {
  readonly clock = new AudioClock(audioContext());
  readonly notes: ChartNote[];
  readonly lanes: number;
  private judge!: Judge;
  score!: ScoreModel;
  private router: InputRouter | null = null;
  private readonly view: HighwayView;
  private player: SynthPlayer | AudioTrackPlayer | null = null;
  private raf = 0;
  private bot: BotInput[] = [];
  private botIdx = 0;
  private readonly laneDown: boolean[];
  private flashes: { lane: number; grade: Grade; at: number }[] = [];
  private beat = -1;
  private starEnds = 0;
  private fromMs = 0;
  private endMs: number;
  private readonly beatMs: number;
  private readonly beatsPerBar: number;
  private lastSnap = 0;
  paused = false;
  done = false;
  private readonly onVisibility = () => document.hidden && this.pause();

  constructor(private readonly o: SessionOptions) {
    this.lanes = LANES[o.difficulty];
    const all = o.chart.difficulties[o.difficulty];
    const p = o.practice;
    this.notes = p ? all.filter((n) => n.t >= p.fromMs && n.t < p.toMs) : o.untilMs ? all.filter((n) => n.t + (n.len ?? 0) < o.untilMs! - 400) : all;
    this.laneDown = new Array(this.lanes).fill(false);
    this.beatMs = 60_000 / o.chart.bpm;
    this.beatsPerBar = Number(o.chart.timeSignature.split('/')[0]) || 4;
    const lastEnd = all.reduce((m, n) => Math.max(m, n.t + (n.len ?? 0)), 0);
    this.endMs = o.untilMs ?? (p ? p.toMs : Math.max(lastEnd + 1200, o.chart.durationMs));
    this.view = new HighwayView(o.canvas, o.theme);
    this.clock.userOffsetMs = o.settings.audioOffsetMs;
    this.reset();
  }

  private reset(): void {
    const scale = (this.o.difficulty === 'easy' ? EASY_WINDOW_SCALE : 1) * (this.o.practice?.rate ?? 1);
    this.judge = new Judge(this.notes, scale);
    this.score = new ScoreModel(judgmentCount(this.notes), this.o.settings.noFail || !!this.o.practice);
    this.bot = this.o.autoplay ? autoplayInputs(this.notes) : [];
    this.botIdx = 0;
    this.flashes = [];
    this.beat = -1;
  }

  async start(): Promise<void> {
    const ctx = this.clock.ctx;
    await ctx.resume();
    const s = this.o.settings;
    if (this.o.song) this.player = new SynthPlayer(this.clock, this.o.song, s.volume);
    else if (this.o.audioUrl) this.player = await AudioTrackPlayer.load(this.clock, this.o.audioUrl, s.volume);
    this.fromMs = this.o.practice?.fromMs ?? 0;
    this.clock.start(this.fromMs, this.o.practice?.rate ?? 1, 0.2);
    this.player?.play(this.fromMs, this.o.practice?.toMs);
    if (!this.o.autoplay) {
      this.router = new InputRouter(
        { lanes: this.lanes, keys: s.laneKeys, starKey: s.starPowerKey, leftHanded: s.leftHanded, mode: this.o.mode, surface: this.o.surface },
        {
          lane: (lane, down, ts) => this.onLane(lane, down, ts),
          fade: (dir, ts) => !this.paused && this.applyAll(this.judge.fade(dir, this.clock.eventToSongMs(ts))),
          star: () => this.triggerStar(),
          pause: () => (this.paused ? undefined : this.pause()),
        },
      ).attach();
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    bus.emit('rhythm:state', { phase: 'playing', songId: this.o.chart.id, bpm: this.o.chart.bpm, style: this.o.style ?? this.o.song?.style });
    this.loop();
  }

  private onLane(lane: number, down: boolean, ts: number): void {
    this.laneDown[lane] = down;
    if (this.paused || this.done) return;
    const t = this.clock.eventToSongMs(ts);
    this.applyAll(down ? this.judge.press(lane, t) : this.judge.release(lane, t));
  }

  private applyAll(js: Judgment[]): void {
    const now = this.clock.songTimeMs();
    for (const j of js) {
      this.score.apply(j);
      this.flashes.push({ lane: j.lane, grade: j.grade, at: now });
      bus.emit('rhythm:judge', { lane: j.lane, grade: j.grade, deltaMs: j.deltaMs });
    }
    if (this.flashes.length > 24) this.flashes = this.flashes.slice(-24);
  }

  /** Star power (Prost! / DROP): ×2 for eight beats. */
  triggerStar(): boolean {
    if (this.paused || this.done || !this.score.startStar()) return false;
    const now = this.clock.songTimeMs();
    this.starEnds = now + STAR_BEATS * this.beatMs;
    const p = this.player;
    if (p instanceof SynthPlayer) p.inst.flourish(this.clock.ctx.currentTime + 0.02, this.o.mode === 'bass' ? 'prost' : 'drop', (this.o.song?.key ?? 64) - 12);
    bus.emit('rhythm:starPower', { active: true });
    return true;
  }

  pause(): void {
    if (this.paused || this.done) return;
    this.paused = true;
    this.router?.releaseAll();
    if (this.router) this.router.enabled = false;
    void this.clock.ctx.suspend();
    bus.emit('rhythm:state', { phase: 'paused', songId: this.o.chart.id });
    this.o.onPause?.();
  }

  /** Call after the 3-2-1 countdown. */
  async resume(): Promise<void> {
    if (!this.paused || this.done) return;
    await this.clock.ctx.resume();
    this.paused = false;
    if (this.router) this.router.enabled = true;
    bus.emit('rhythm:state', { phase: 'playing', songId: this.o.chart.id, bpm: this.o.chart.bpm, style: this.o.style ?? this.o.song?.style });
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.done) return;
    const now = this.clock.songTimeMs();
    if (!this.paused) {
      // The bot hits on the frame, at the clock's own time: the real-time sync check.
      while (this.botIdx < this.bot.length && this.bot[this.botIdx].t <= now) {
        const input = this.bot[this.botIdx++];
        if (input.kind !== 'fade') this.laneDown[input.lane] = input.kind === 'down';
        this.applyAll(applyInput(this.judge, input, now));
      }
      this.applyAll(this.judge.update(now));
      if (this.score.starActive && now >= this.starEnds) {
        this.score.endStar();
        bus.emit('rhythm:starPower', { active: false });
      }
      const b = Math.floor((now - this.o.chart.offsetMs) / this.beatMs);
      if (b !== this.beat && b >= 0) {
        this.beat = b;
        bus.emit('rhythm:beat', { beat: b, bar: Math.floor(b / this.beatsPerBar), downbeat: b % this.beatsPerBar === 0, bpm: this.o.chart.bpm, beatsPerBar: this.beatsPerBar });
      }
      if (this.score.failed) return this.finish(false);
      if (now >= this.endMs) {
        if (this.o.practice) return this.loopPractice();
        return this.finish(true);
      }
    }
    const s = this.o.settings;
    this.view.render({
      // A positive visual offset draws the notes later.
      songMs: now - s.visualOffsetMs,
      notes: this.notes,
      judge: this.judge,
      lanes: this.lanes,
      flip: s.leftHanded,
      shapes: s.laneShapes,
      speed: s.noteSpeed,
      laneDown: this.laneDown,
      flashes: this.flashes,
      beatMs: this.beatMs,
      offsetMs: this.o.chart.offsetMs,
      beatsPerBar: this.beatsPerBar,
      star: this.score.starActive,
      reduceFlashing: s.reduceFlashing,
      labels: this.o.autoplay ? [] : keysForLanes(s.laneKeys, this.lanes).map(KEY_LABEL),
    });
    if (performance.now() - this.lastSnap > 66) {
      this.lastSnap = performance.now();
      this.o.onSnapshot?.(this.snapshot());
    }
  };

  snapshot(): SessionSnapshot {
    const sc = this.score;
    return {
      score: sc.score,
      combo: sc.combo,
      multiplier: sc.multiplier,
      accuracy: sc.accuracy,
      meter: sc.meter,
      star: sc.star,
      starActive: sc.starActive,
      canStar: sc.canStar(),
      songMs: this.clock.songTimeMs(),
      endMs: this.endMs,
      counts: { ...sc.counts },
      missStreak: sc.missStreak,
    };
  }

  private loopPractice(): void {
    this.reset();
    this.clock.start(this.fromMs, this.o.practice!.rate, 0.1);
    this.player?.play(this.fromMs, this.o.practice!.toMs);
  }

  private finish(cleared: boolean): void {
    if (this.done) return;
    this.done = true;
    // A song still playing out under a failure stops at once.
    if (!cleared) this.player?.stop();
    const sc = this.score;
    const r: SongResult = { score: sc.score, accuracy: sc.finalAccuracy, stars: cleared ? sc.stars : 0, cleared, fullCombo: cleared && sc.fullCombo, maxCombo: sc.maxCombo, counts: { ...sc.counts } };
    if (sc.starActive) bus.emit('rhythm:starPower', { active: false });
    bus.emit('rhythm:songEnd', { score: r.score, accuracy: r.accuracy, stars: r.stars, cleared });
    this.o.onSnapshot?.(this.snapshot());
    this.o.onEnd?.(r);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.done = true;
    this.router?.detach();
    this.player?.dispose();
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.clock.ctx.resume();
  }
}
