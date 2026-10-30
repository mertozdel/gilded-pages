import { useEffect, useRef, type KeyboardEvent } from 'react';
import { PATTERN_DIFFICULTY, type PatternDifficulty, type PatternInfo } from '../../../game/latte/model';
import { patternDef } from '../../../game/latte/patterns';
import { renderCup } from '../../../game/latte/render';
import { visualFor } from '../../../game/latte/visuals';

const STARS: Record<PatternDifficulty, string> = { easy: '★', medium: '★★', hard: '★★★', master: '★★★★' };
const THUMB = 96;

/** Each pattern's thumbnail, rendered once (a perfect cup) and kept as an image. */
const thumbs = new Map<string, string>();
function thumb(id: string | null): string {
  const key = id ?? 'plain';
  let url = thumbs.get(key);
  if (!url) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(THUMB * Math.min(2, window.devicePixelRatio || 1));
    renderCup(cv, { pattern: id ? patternDef(id) : null, visual: { ...visualFor(0, 0, 0, 'perfect'), sparkle: false }, crema: 1, seed: 11 }, 2);
    url = cv.toDataURL('image/png');
    thumbs.set(key, url);
  }
  return url;
}

export interface ArtChoice {
  pattern: PatternInfo;
  locked: boolean;
}

interface Props {
  choices: ArtChoice[];
  /** Offer "Customer's choice" first (a latte artist's shift). */
  customer: boolean;
  current: string;
  /** Pays tips (the multiplier is shown). */
  tips: boolean;
  /** A line under the heading (who can pour what). */
  note?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

/**
 * Choosing the latte art: every pattern as a cup, with its difficulty (★ easy … ★★★★ master)
 * and what it pays; locked ones show the tips that open them. Arrow keys move, Enter picks,
 * Esc keeps the current one.
 */
export function ArtPicker({ choices, customer, current, tips, note, onPick, onClose }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)')?.focus();
  }, []);

  // Arrow keys move between the cards.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(grid.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const cols = Math.max(1, Math.round((grid.current?.clientWidth ?? 400) / 128));
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    buttons[Math.min(buttons.length - 1, Math.max(0, i + step))]?.focus();
  };

  return (
    <div className="art-picker" role="dialog" aria-label="Choose the latte art" data-testid="art-picker">
      <div className="art-picker-head">
        <strong>Choose the latte art</strong>
        <span className="small muted">
          Harder patterns pour faster, rush at the end and need a cleaner release{tips ? ' — and pay more' : ''}.{note ? ` ${note}` : ''}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Keep the current one (Esc)">
          ✕
        </button>
      </div>
      <div className="latte-art-grid" ref={grid} onKeyDown={onKeyDown}>
        {customer && (
          <button className={`latte-card ${current === 'customer' ? 'on' : ''}`} aria-pressed={current === 'customer'} onClick={() => onPick('customer')}>
            <img src={thumb(null)} alt="" width={THUMB} height={THUMB} />
            <span className="latte-art-q">?</span>
            <strong>Customer's choice</strong>
            <small>Pour what they ask for</small>
          </button>
        )}
        {choices.map(({ pattern: p, locked }) => {
          const d = PATTERN_DIFFICULTY[p.difficulty];
          return (
            <button
              key={p.id}
              className={`latte-card ${current === p.id ? 'on' : ''} ${locked ? 'locked' : ''}`}
              aria-pressed={current === p.id}
              disabled={locked}
              onClick={() => onPick(p.id)}
              data-testid={`art-${p.id}`}
              title={locked ? `Unlocks at ${p.tips} tips` : `${p.name} — ${d.label}`}
            >
              <img src={thumb(p.id)} alt="" width={THUMB} height={THUMB} />
              <strong>{p.name}</strong>
              <small className={`latte-diff ${p.difficulty}`}>
                {STARS[p.difficulty]} {d.label}
              </small>
              <small>{locked ? `🔒 ${p.tips} tips` : tips ? `tips ×${d.tips}` : ' '}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
