import { useEffect, useState, type MouseEvent, type RefObject } from 'react';
import type { Chapter } from '../db/schema';

interface Props {
  page: number;
  pageCount: number;
  visibleCount: number;
  chapters: Chapter[];
  onJump: (page: number) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

/** The footer: a gold progress line with chapter markers, and the page number (editable). */
export function ProgressLine({ page, pageCount, visibleCount, chapters, onJump, inputRef }: Props) {
  const lastVisible = Math.min(pageCount, page + visibleCount - 1);
  const pct = pageCount ? (lastVisible / pageCount) * 100 : 0;
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);

  const onBarClick = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width;
    onJump(Math.max(1, Math.min(pageCount, Math.round(t * pageCount) || 1)));
  };

  return (
    <div className="progress-line">
      <div className="progress-track" onClick={onBarClick} aria-hidden="true">
        <span className="progress-fill" style={{ width: `${pct}%` }} />
        {chapters.map((c, i) => (
          <span key={i} className={`progress-marker ${c.page <= page ? 'passed' : ''}`} style={{ left: `${((c.page - 1) / pageCount) * 100}%` }} title={c.title} />
        ))}
      </div>
      <form
        className="page-jump"
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseInt(draft, 10);
          if (Number.isFinite(n)) onJump(Math.max(1, Math.min(pageCount, n)));
          inputRef.current?.blur();
        }}
      >
        <label htmlFor="page-input" className="sr-only">
          Page number
        </label>
        <input
          id="page-input"
          ref={inputRef}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setDraft(String(page))}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
          aria-describedby="page-of"
          size={Math.max(2, String(pageCount).length)}
        />
        <span id="page-of">
          {visibleCount > 1 && lastVisible > page ? `–${lastVisible}` : ''} of {pageCount} · {Math.round(pct)}%
        </span>
      </form>
    </div>
  );
}
