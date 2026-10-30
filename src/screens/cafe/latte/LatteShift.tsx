import { useCallback, useEffect, useRef, useState } from 'react';
import { bus } from '../../../bus/events';
import { REGULARS } from '../../../content';
import { CURRENCIES, characterById, hasFeature } from '../../../content/characters';
import npcs from '../../../content/npcs.json';
import { earn, pinPhoto, updateProfile } from '../../../db/profiles';
import { HoldInput } from '../../../game/latte/hold';
import {
  ESPRESSO,
  MENU,
  MILK,
  PATTERNS,
  PATTERN_DIFFICULTY,
  RUSH,
  WINDOW_SCALE,
  PERFECT_WINDOW,
  GOOD_WINDOW,
  cupGrade,
  cupQuality,
  curveFor,
  fillAt,
  fillToTemp,
  gradeRelease,
  holdMsFor,
  latteLevel,
  patternInfo,
  tipsFor,
  unlockedPatterns,
  artistPatterns,
  baristaPatterns,
  BARISTA_MAX,
  type CupGrade,
  type PatternDifficulty,
  type StageNo,
  type StageResult,
} from '../../../game/latte/model';
import { patternDef } from '../../../game/latte/patterns';
import { CUP_SIZE, renderCup } from '../../../game/latte/render';
import { visualFor } from '../../../game/latte/visuals';
import { localDate } from '../../../rules/dates';
import { EVERYTHING_OPEN } from '../../../rules/unlocks';
import { useStore } from '../../../store';
import { PixelIcon } from '../../../ui/PixelIcon';
import { drawCupFx } from '../../../game/latte/cupFx';
import { ArtPicker, type ArtChoice } from './ArtPicker';

interface Order {
  id: string;
  drink: { id: string; name: string; desc: string };
  /** What the customer asked for. */
  wanted: string;
  /** What is being poured (the barista may pick another). */
  pattern: string;
  /** A customer is waiting for it (Jason's shift); otherwise it's a cup made just because. */
  customer: boolean;
}

type Phase = 'greeting' | 'stage' | 'feedback' | 'result' | 'verdict';

const STAGE_LABEL: Record<StageNo, { name: string; button: string }> = {
  1: { name: 'Pull the shot', button: 'Pull' },
  2: { name: 'Steam the milk', button: 'Steam' },
  3: { name: 'Pour', button: 'Pour' },
};
const GRADE_TEXT = { perfect: 'Perfect!', good: 'Good', miss: 'Miss' } as const;
const CUP_TEXT: Record<CupGrade, string> = { perfect: 'Perfect cup!', good: 'Good cup', messy: 'Messy… but cute' };
const DIFF_STARS: Record<PatternDifficulty, string> = { easy: '★', medium: '★★', hard: '★★★', master: '★★★★' };
/** Taking the order, and the pause after each stage. */
const GREET_MS = 700;
const FEEDBACK_MS = 450;
/** Baristas who aren't latte artists pour these: up to medium; hard and master are Jason's. */
const FREE_PATTERNS = baristaPatterns();

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const todayNum = () => Number(localDate().replace(/-/g, ''));

/**
 * Making coffee at the counter — any barista, any time. A cup is three stages, one action
 * (Hold): pull the shot, steam the milk, pour the pattern; the cup is drawn from how each stage
 * went. The next cup starts as soon as you want it: no waiting for a customer or a rush.
 *
 * A latte artist (Jason) works a shift: orders from the Fitzgerald menu queue up in the panel;
 * tips grow with the pattern's difficulty (easy → master); new patterns unlock with his tips
 * (all open while EVERYTHING_OPEN); rush hour runs the gauges faster; once a day the Daily
 * Throwdown pins the best of three cups to his photo board. Anyone else pours the easy and
 * medium patterns (FREE_PATTERNS), and their best cup is kept — no currency is paid for it.
 */
export function LatteShift({ onClose }: { onClose: () => void }) {
  const characterId = useStore((s) => s.character);
  const character = characterById(characterId);
  const artist = hasFeature(character, 'latteArt');
  const profile = useStore((s) => s.profiles[s.character]);
  const setProfile = useStore((s) => s.setProfile);
  const toast = useStore((s) => s.toast);
  const difficulty = useStore((s) => s.settings.latteDifficulty);
  const slowPour = useStore((s) => s.settings.slowPour);

  const [phase, setPhase] = useState<Phase>('greeting');
  const [order, setOrder] = useState<Order | null>(null);
  const [stage, setStage] = useState<StageNo>(1);
  const [results, setResults] = useState<StageResult[]>([]);
  const [holding, setHolding] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [rushUntil, setRushUntil] = useState(0);
  /** 'customer': pour what was ordered; otherwise a pattern id the barista picked. */
  const [choice, setChoice] = useState<string>(artist ? 'customer' : FREE_PATTERNS[0].id);
  const [last, setLast] = useState<{ quality: number; grade: CupGrade; tips: number; image: string; best: number } | null>(null);
  const [throwdown, setThrowdown] = useState<{ judge: string; line: string; cups: { quality: number; image: string; pattern: string; drink: string }[] } | null>(null);
  /** The art picker: open when the shift starts, and from "Choose art" any time. */
  const [picking, setPicking] = useState(true);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const fxCanvas = useRef<HTMLCanvasElement>(null);
  const holdingRef = useRef(false);

  const queue = useRef<Order[]>([]);
  const cupCanvas = useRef<HTMLCanvasElement>(null);
  const holdBtn = useRef<HTMLButtonElement>(null);
  const pressAt = useRef(0);
  const raf = useRef(0);
  const frame = useRef(0);
  const streak = useRef(0);
  const seed = useRef(1);
  const fill = useRef(0);
  const timers = useRef<number[]>([]);
  /** The gauge's moving parts, updated directly every frame (no re-render). */
  const gauge = useRef<{ fill?: HTMLElement | null; label?: HTMLElement | null; needle?: SVGLineElement | null; temp?: SVGTextElement | null; foam?: HTMLElement | null }>({});
  const state = useRef({ phase, stage, results, order, rushUntil, throwdown, choice });
  state.current = { phase, stage, results, order, rushUntil, throwdown, choice };

  const totalTips = profile.stats.tipsTotal ?? 0;
  const patterns = artist ? artistPatterns(totalTips) : FREE_PATTERNS;
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const speed = () => (artist && performance.now() < state.current.rushUntil ? RUSH.speed : 1);
  const pourOf = (o: Order | null) => patternDef(o?.pattern ?? 'heart').curve;
  /** The pour's windows narrow (or widen) with the pattern's difficulty. */
  const patternScale = (o: Order | null) => PATTERN_DIFFICULTY[patternInfo(o?.pattern ?? 'heart').difficulty].window;
  const curveNow = () => {
    const st = state.current;
    const c = curveFor(st.stage, pourOf(st.order));
    return { curve: c, speed: speed() * (st.stage === 3 && slowPour ? 0.7 : 1) };
  };

  // ---------- orders ----------

  const newOrder = useCallback(
    (customer: boolean): Order => {
      // Newer patterns come up more often once unlocked (with everything open, any of them as often).
      const pool = artist ? artistPatterns(useStore.getState().profiles[characterId].stats.tipsTotal ?? 0) : FREE_PATTERNS;
      const weighted = EVERYTHING_OPEN ? pool.map((p) => p.id) : pool.flatMap((p, i) => Array(i + 1).fill(p.id) as string[]);
      const wanted = pick(weighted);
      return { id: crypto.randomUUID(), drink: pick(MENU), wanted, pattern: wanted, customer };
    },
    [artist, characterId],
  );

  /** What gets poured: the barista's pick if they made one. */
  const withChoice = (o: Order, c = state.current.choice): Order => ({ ...o, pattern: c === 'customer' ? o.wanted : c });

  const spawn = useCallback(() => {
    const st = state.current;
    const rush = performance.now() < st.rushUntil;
    if (st.throwdown || queue.current.length >= (rush ? 6 : 4)) return;
    const o = newOrder(true);
    queue.current.push(o);
    setQueueSize(queue.current.length);
  }, [newOrder]);

  /** The next cup, at once: the first customer in the queue, or one made just because. */
  const begin = useCallback(() => {
    const st = state.current;
    const base = st.throwdown || !artist ? newOrder(false) : (queue.current[0] ?? newOrder(false));
    const next = withChoice(base);
    setOrder(next);
    setResults([]);
    setStage(1);
    setLast(null);
    fill.current = 0;
    seed.current = Math.floor(Math.random() * 1e9);
    setPhase('greeting');
    bus.emit('latte:begin', { id: next.id, drink: next.drink.id });
    later(() => setPhase('stage'), GREET_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artist, newOrder]);

  useEffect(() => {
    let spawnTimer = 0;
    let rushTimer = 0;
    if (artist) {
      // A latte artist's shift: customers keep coming; rush hour every 4–6 minutes.
      spawn();
      const loop = () => {
        const rush = performance.now() < state.current.rushUntil;
        spawnTimer = window.setTimeout(() => {
          spawn();
          loop();
        }, rush ? rand(3500, 5500) : rand(9000, 14000));
      };
      loop();
      const scheduleRush = () => {
        rushTimer = window.setTimeout(() => {
          setRushUntil(performance.now() + RUSH.durationMs);
          later(() => setRushUntil(0), RUSH.durationMs);
          toast('Rush hour! The queue is growing — gauges run 10% faster', 'rose');
          for (let i = 0; i < 2; i++) spawn();
          scheduleRush();
        }, rand(RUSH.everyMinMs, RUSH.everyMaxMs));
      };
      scheduleRush();
    }
    begin();
    return () => {
      window.clearTimeout(spawnTimer);
      window.clearTimeout(rushTimer);
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      cancelAnimationFrame(raf.current);
      // The queue goes home with the shift (and a remount starts a fresh one).
      queue.current = [];
      bus.emit('latte:shiftEnd', {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- drawing: the cup and the gauge, straight to the page ----------

  const draw = useCallback(
    (f: number) => {
      const cv = cupCanvas.current;
      const st = state.current;
      if (!cv || !st.order) return;
      const w = WINDOW_SCALE[difficulty];
      const e = st.results.map((r) => r.error);
      const pd = patternDef(st.order.pattern);
      if (st.stage === 1) {
        const e1 = Math.max(-1, Math.min(1, (f - ESPRESSO.target) / (0.4 * w)));
        renderCup(cv, { pattern: null, visual: visualFor(f > 0 ? e1 : -1, 0, 0, 'good'), crema: Math.min(1, f * 1.5), seed: seed.current }, 2);
      } else if (st.stage === 2) {
        renderCup(cv, { pattern: null, visual: visualFor(e[0] ?? 0, 0, 0, 'good'), crema: 1, seed: seed.current }, 2);
      } else {
        const v = visualFor(e[0] ?? 0, e[1] ?? 0, 0, 'good');
        renderCup(cv, { pattern: pd, visual: { ...v, bubbleCount: Math.round(v.bubbleCount * Math.min(1, f / pd.curve.target)) }, crema: 1, growth: f / pd.curve.target, guide: true, seed: seed.current }, 2);
      }
    },
    [difficulty],
  );

  const showFill = (f: number) => {
    fill.current = f;
    const g = gauge.current;
    const st = state.current;
    if (g.fill) g.fill.style.width = `${f * 100}%`;
    if (g.label) g.label.textContent = `${st.stage === 1 ? 'Extraction' : 'Pattern'} ${Math.round(f * 100)}%`;
    if (g.needle) {
      g.needle.setAttribute('x2', String(100 - 74 * Math.cos(f * Math.PI)));
      g.needle.setAttribute('y2', String(100 - 74 * Math.sin(f * Math.PI)));
    }
    if (g.temp) g.temp.textContent = `${Math.round(fillToTemp(f))} °C`;
    if (g.foam) g.foam.style.width = `${Math.min(100, f * 125)}%`;
  };

  // A new stage (or cup, or pattern): the gauge and the cup from empty.
  useEffect(() => {
    if (phase !== 'stage' && phase !== 'greeting') return;
    showFill(0);
    draw(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage, order, draw]);

  // ---------- one stage: hold, release ----------

  const finishCup = useCallback(
    async (rs: StageResult[]) => {
      const st = state.current;
      const o = st.order!;
      const [e1, e2, e3] = rs.map((r) => r.error);
      const quality = cupQuality(e1, e2, e3);
      const grade = cupGrade(quality, rs.map((r) => r.grade));
      const cv = cupCanvas.current!;
      renderCup(cv, { pattern: patternDef(o.pattern), visual: visualFor(e1, e2, e3, grade), crema: 1, seed: seed.current }, 4);
      // The photo: the cup at 320×320, whatever the screen.
      const photo = document.createElement('canvas');
      photo.width = photo.height = CUP_SIZE;
      renderCup(photo, { pattern: patternDef(o.pattern), visual: visualFor(e1, e2, e3, grade), crema: 1, seed: seed.current }, 4);
      const image = photo.toDataURL('image/png');
      streak.current = grade === 'messy' ? 0 : streak.current + 1;
      const diff = PATTERN_DIFFICULTY[patternInfo(o.pattern).difficulty];
      // Only a latte artist's cups pay (more for harder patterns); anyone else keeps their best cup.
      const tips = artist ? tipsFor(grade, streak.current, diff.tips) : 0;
      bus.emit('latte:result', { id: o.id, quality, pattern: o.pattern, grade });
      queue.current = queue.current.filter((q) => q.id !== o.id);
      setQueueSize(queue.current.length);
      const prevBest = useStore.getState().profiles[characterId].bests.cup ?? 0;
      setLast({ quality, grade, tips, image, best: Math.max(prevBest, quality) });
      setPhase('result');
      const cups = st.throwdown ? [...st.throwdown.cups, { quality, image, pattern: o.pattern, drink: o.drink.name }] : [];
      if (st.throwdown) setThrowdown({ ...st.throwdown, cups });
      const before = latteLevel(useStore.getState().profiles[characterId].stats.tipsTotal ?? 0);
      const { profile: p } = await earn(characterId, tips, quality, 'cup', { cups: 1, perfectCups: grade === 'perfect' ? 1 : 0, ...(artist ? { tipsTotal: tips } : {}) });
      setProfile(p);
      if (artist) {
        const after = latteLevel(p.stats.tipsTotal ?? 0);
        if (after > before) {
          const got = unlockedPatterns(p.stats.tipsTotal ?? 0).at(-1);
          toast(EVERYTHING_OPEN ? `Level ${after}!` : `Level ${after}! New pattern: ${got?.name} (${got ? PATTERN_DIFFICULTY[got.difficulty].label : ''})`, 'green');
        }
      }
      if (cups.length >= 3) {
        // The Throwdown's best cup goes on the photo board, with a bonus.
        const best = cups.reduce((a, b) => (b.quality > a.quality ? b : a));
        await pinPhoto(characterId, { id: crypto.randomUUID(), pattern: best.pattern, quality: best.quality, drink: best.drink, image: best.image, takenAt: Date.now() });
        const bonus = Math.round(best.quality / 10);
        await earn(characterId, bonus, best.quality, 'throwdown', { throwdowns: 1, tipsTotal: bonus });
        setProfile(await updateProfile(characterId, (q) => ({ ...q, stats: { ...q.stats, throwdownDay: todayNum() } })));
        setPhase('verdict');
      }
    },
    [artist, characterId, setProfile, toast],
  );

  const release = useCallback(
    (t: number) => {
      const st = state.current;
      if (st.phase !== 'stage') return;
      cancelAnimationFrame(raf.current);
      setHolding(false);
      holdingRef.current = false;
      bus.emit('latte:hold', { stage: st.stage, holding: false });
      const { curve, speed: sp } = curveNow();
      const f = fillAt(curve, t - pressAt.current, sp);
      const r = gradeRelease(f, curve.target, difficulty, st.stage === 3 ? patternScale(st.order) : 1);
      showFill(r.fill);
      draw(r.fill);
      const rs = [...st.results, r];
      setResults(rs);
      bus.emit('latte:stage', { stage: st.stage, error: r.error, grade: r.grade });
      setPhase('feedback');
      later(() => {
        if (st.stage < 3) {
          setStage((st.stage + 1) as StageNo);
          setPhase('stage');
        } else void finishCup(rs);
      }, FEEDBACK_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [difficulty, finishCup, slowPour, draw],
  );

  const next = () => {
    const st = state.current;
    if (st.throwdown && st.throwdown.cups.length >= 3) return;
    begin();
  };

  const press = useCallback(
    (t: number) => {
      const st = state.current;
      if (pickingRef.current) return;
      if (st.phase === 'result') return next();
      if (st.phase !== 'stage') return;
      pressAt.current = t;
      setHolding(true);
      holdingRef.current = true;
      bus.emit('latte:hold', { stage: st.stage, holding: true });
      const tick = () => {
        const { curve, speed: sp } = curveNow();
        const f = fillAt(curve, performance.now() - pressAt.current, sp);
        showFill(f);
        // The shot's colour changes slowly (every other frame is plenty); the pour is drawn every frame.
        frame.current++;
        if (state.current.stage === 3 || (state.current.stage === 1 && frame.current % 2 === 0)) draw(f);
        // Held to 100%: it overflows.
        if (f >= 1) return release(performance.now());
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [release, draw],
  );

  // The one action: the round button, Space, gamepad A, touch-and-hold on the cup.
  useEffect(() => {
    const input = new HoldInput({ button: holdBtn.current, surface: cupCanvas.current }, { onPress: press, onRelease: (t) => release(t) }).attach();
    return () => input.detach();
  }, [press, release]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (pickingRef.current) setPicking(false);
        else onClose();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !pickingRef.current && !holdingRef.current) {
        // ← → cycle the latte art (it applies to this cup until the pour starts).
        e.preventDefault();
        const ids = [...(artist ? ['customer'] : []), ...availableRef.current.map((p) => p.id)];
        const i = Math.max(0, ids.indexOf(state.current.choice));
        choose(ids[(i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]);
      } else if (e.key === 'Enter' && state.current.phase === 'result' && !pickingRef.current) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // For the end-to-end tests: what to hold for this stage.
  useEffect(() => {
    const w = window as unknown as { __latte?: unknown };
    w.__latte = {
      state: () => ({ phase: state.current.phase, stage: state.current.stage, order: state.current.order?.id ?? null, pattern: state.current.order?.pattern ?? null }),
      plan: () => {
        const { curve, speed: sp } = curveNow();
        return { perfect: holdMsFor(curve, curve.target, sp), early: holdMsFor(curve, Math.max(0, curve.target - 0.3), sp), overflow: curve.durationMs / sp + 200 };
      },
    };
    return () => {
      delete w.__latte;
    };
  });

  /** Picking a pattern: this cup too, while the pour hasn't started. */
  const choose = (c: string) => {
    setChoice(c);
    setPicking(false);
    const st = state.current;
    if (st.order && st.stage < 3 && st.phase !== 'result') setOrder(withChoice(st.order, c));
  };

  const startThrowdown = () => {
    const j = pick(npcs.throwdownJudges);
    const judge = REGULARS.find((r) => r.id === j.regular)?.name ?? 'A regular';
    const td = { judge, line: j.line, cups: [] };
    setThrowdown(td);
    // The judged cups start now (state.current catches up on the next render).
    state.current.throwdown = td;
    toast(`Daily Throwdown: ${judge} judges three cups`, 'gold');
    begin();
  };
  const throwdownDone = profile.stats.throwdownDay === todayNum();

  // What the picker offers: a latte artist sees every pattern (locked ones too, unless everything is open); anyone else FREE_PATTERNS.
  const pickerChoices: ArtChoice[] = artist ? PATTERNS.map((p) => ({ pattern: p, locked: !EVERYTHING_OPEN && totalTips < p.tips })) : FREE_PATTERNS.map((p) => ({ pattern: p, locked: false }));
  const availableRef = useRef(patterns);
  availableRef.current = patterns;

  // The coffee being made, drawn over the cup every frame (its own canvas, no re-render).
  useEffect(() => {
    let id = 0;
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const loop = (t: number) => {
      id = requestAnimationFrame(loop);
      const cv = fxCanvas.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      if (!w) return;
      if (cv.width !== Math.round(w * dpr)) cv.width = cv.height = Math.round(w * dpr);
      const c = cv.getContext('2d')!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = state.current;
      const mode = st.phase === 'result' || st.phase === 'verdict' ? 'cup' : st.phase === 'stage' || st.phase === 'feedback' ? 'make' : 'none';
      drawCupFx(c, w, t, { stage: st.stage, holding: holdingRef.current, fill: fill.current, mode, reduced });
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  // ---------- view ----------

  const pourScale = stage === 3 ? patternScale(order) : 1;
  const w = WINDOW_SCALE[difficulty] * pourScale;
  const curve = curveFor(stage, pourOf(order));
  const band = (half: number) => ({ left: `${(curve.target - half * w) * 100}%`, width: `${half * 2 * w * 100}%` });
  const rush = artist && performance.now() < rushUntil;
  const cur = CURRENCIES[character.currency];
  const lastResult = results.at(-1);
  const info = order ? patternInfo(order.pattern) : null;
  const diff = info ? PATTERN_DIFFICULTY[info.difficulty] : null;
  const f0 = fill.current;

  return (
    <div className="latte-panel" role="dialog" aria-label={artist ? 'Latte art' : 'Make a coffee'} data-testid="latte-panel">
      <header className="latte-head">
        <div>
          <strong>
            {throwdown ? `Throwdown · ${throwdown.judge}` : order ? order.drink.name : 'Coffee'}
            {info && (
              <span className={`latte-diff ${info.difficulty}`} title={`${diff!.label}: windows ×${diff!.window}${artist ? `, tips ×${diff!.tips}` : ''}`}>
                {' '}
                · {info.name} {DIFF_STARS[info.difficulty]}
              </span>
            )}
          </strong>
          <span className="small muted">
            {' '}
            {order?.customer ? (order.pattern === order.wanted ? `asked for a ${patternInfo(order.wanted).name}` : `asked for a ${patternInfo(order.wanted).name} — you're pouring a ${info?.name}`) : artist ? `${queueSize} in the queue` : 'a cup just because'}
            {artist && ` · Lv ${latteLevel(totalTips)}${EVERYTHING_OPEN ? '' : ` · ${patterns.length}/${PATTERNS.length} patterns`}`}
            {artist && diff && ` · tips ×${diff.tips}`}
            {rush && <span className="latte-rush"> · RUSH HOUR</span>}
          </span>
        </div>
        <div className="latte-head-actions">
          <button className="deco-btn small" onClick={() => setPicking(true)} title="Choose the latte art (← → to cycle)" data-testid="choose-art">
            🎨 {choice === 'customer' ? "Customer's choice" : patternInfo(choice).name}
          </button>
          {artist && !throwdown && !throwdownDone && (phase === 'result' || phase === 'greeting') && (
            <button className="deco-btn small" onClick={startThrowdown}>
              Daily Throwdown
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close (Esc)">
            <PixelIcon name="close" scale={2} />
          </button>
        </div>
      </header>

      <ol className="latte-stages" aria-label="Stages">
        {([1, 2, 3] as StageNo[]).map((s) => (
          <li key={s} className={`${stage === s && phase !== 'result' ? 'on' : ''} ${results[s - 1]?.grade ?? ''}`}>
            {s}. {STAGE_LABEL[s].name}
            {results[s - 1] && <em> {GRADE_TEXT[results[s - 1].grade]}</em>}
          </li>
        ))}
      </ol>

      <div className="latte-body">
        <div className="latte-cup-wrap">
          <canvas ref={cupCanvas} className="latte-cup" width={Math.round(CUP_SIZE * (window.devicePixelRatio || 1))} height={Math.round(CUP_SIZE * (window.devicePixelRatio || 1))} aria-label="The cup (touch and hold to pour)" />
          <canvas ref={fxCanvas} className="latte-fx" aria-hidden="true" />
          {phase === 'feedback' && lastResult && <div className={`latte-flash ${lastResult.grade}`}>{lastResult.overflow ? 'Overflow!' : GRADE_TEXT[lastResult.grade]}</div>}
          {last?.grade === 'perfect' && phase === 'result' && <div className="latte-sparkles" aria-hidden="true" />}
        </div>

        <div className="latte-gauge-wrap">
          {phase === 'greeting' && <p>{order?.customer ? `${character.name} takes the order…` : `${character.name} grinds the beans…`}</p>}
          {(phase === 'stage' || phase === 'feedback') && (
            <>
              {stage === 2 ? (
                <div className="latte-dial" aria-label="Milk temperature">
                  <svg viewBox="0 0 200 120" width="100%">
                    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(242,237,228,0.25)" strokeWidth="14" />
                    {(() => {
                      const arc = (a: number, b: number) => {
                        const p = (f: number) => [100 - 80 * Math.cos(f * Math.PI), 100 - 80 * Math.sin(f * Math.PI)];
                        const [x0, y0] = p(a);
                        const [x1, y1] = p(b);
                        return `M${x0} ${y0} A80 80 0 0 1 ${x1} ${y1}`;
                      };
                      return (
                        <>
                          <path d={arc(MILK.target - GOOD_WINDOW * w, MILK.target + GOOD_WINDOW * w)} fill="none" stroke="rgba(227,193,111,0.45)" strokeWidth="14" />
                          <path d={arc(MILK.target - PERFECT_WINDOW * w, MILK.target + PERFECT_WINDOW * w)} fill="none" stroke="#E3C16F" strokeWidth="14" />
                        </>
                      );
                    })()}
                    <line
                      ref={(el) => {
                        gauge.current.needle = el;
                      }}
                      x1="100"
                      y1="100"
                      x2={100 - 74 * Math.cos(f0 * Math.PI)}
                      y2={100 - 74 * Math.sin(f0 * Math.PI)}
                      stroke="#C9374F"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="100" r="7" fill="#F2EDE4" />
                    <text x="20" y="118" fontSize="11" fill="#F2EDE4">
                      20°
                    </text>
                    <text x="166" y="118" fontSize="11" fill="#F2EDE4">
                      80°
                    </text>
                    <text ref={(el) => {
                        gauge.current.temp = el;
                      }} x="100" y="84" fontSize="16" fill="#F2EDE4" textAnchor="middle">
                      {Math.round(fillToTemp(f0))} °C
                    </text>
                  </svg>
                  <div className="latte-meter small">
                    Foam <span ref={(el) => {
                        gauge.current.foam = el;
                      }} style={{ width: `${Math.min(100, f0 * 125)}%` }} />
                  </div>
                </div>
              ) : (
                <div className="latte-bar" aria-label={stage === 1 ? 'Extraction' : 'Pour'}>
                  <span className="latte-band good" style={band(GOOD_WINDOW)} />
                  <span className="latte-band perfect" style={band(PERFECT_WINDOW)} />
                  <span ref={(el) => {
                        gauge.current.fill = el;
                      }} className="latte-fill" style={{ width: `${f0 * 100}%` }} />
                  <span ref={(el) => {
                        gauge.current.label = el;
                      }} className="latte-bar-label small">
                    {stage === 1 ? 'Extraction' : 'Pattern'} {Math.round(f0 * 100)}%
                  </span>
                </div>
              )}
              <p className="small muted">
                {stage === 1 && 'Hold to pull the shot; let go in the gold band (70–78%).'}
                {stage === 2 && 'Hold to steam; let go at 60–65 °C.'}
                {stage === 3 && `Hold to pour; let go when the ${info?.name ?? 'pattern'} meets its outline.${info && info.difficulty !== 'easy' ? ` ${diff!.label}: it rushes at the end.` : ''}`}
              </p>
            </>
          )}
          {phase === 'result' && last && (
            <div className={`latte-result ${last.grade}`} role="status">
              <strong>{CUP_TEXT[last.grade]}</strong>
              <span>
                {info?.name} · quality {Math.round(last.quality)}/100
              </span>
              {artist ? (
                <span>
                  +{last.tips} {cur.name}
                  {streak.current >= 3 && ` · streak ×${streak.current >= 6 ? 2 : 1.5}`}
                </span>
              ) : (
                <span>Best cup: {Math.round(last.best)}/100</span>
              )}
              {!(throwdown && throwdown.cups.length >= 3) && <span className="small muted">Space / Enter: {artist ? 'next cup' : 'another cup'}</span>}
            </div>
          )}
          {phase === 'verdict' && throwdown && (
            <div className="latte-result perfect" role="status">
              <strong>{throwdown.judge}'s verdict</strong>
              <span>Best cup {Math.round(Math.max(...throwdown.cups.map((c) => c.quality)))}/100 — pinned to the photo board.</span>
              <button
                className="deco-btn"
                onClick={() => {
                  setThrowdown(null);
                  state.current.throwdown = null;
                  begin();
                }}
              >
                Back to the queue
              </button>
            </div>
          )}
        </div>
      </div>

      {picking && (
        <ArtPicker
          choices={pickerChoices}
          customer={artist}
          current={choice}
          tips={artist}
          note={artist ? undefined : `Up to ${PATTERN_DIFFICULTY[BARISTA_MAX].label.toLowerCase()} — the harder patterns are Jason's.`}
          onPick={choose}
          onClose={() => setPicking(false)}
        />
      )}

      <button
        ref={holdBtn}
        className={`latte-hold ${holding ? 'held' : ''}`}
        disabled={phase !== 'stage' && phase !== 'result'}
        aria-label={phase === 'result' ? 'Next cup' : `Hold: ${STAGE_LABEL[stage].name}`}
        data-testid="latte-hold"
      >
        {phase === 'result' ? 'Next' : STAGE_LABEL[stage].button}
        <small>{phase === 'result' ? 'Space' : 'hold Space'}</small>
      </button>
    </div>
  );
}
