import type { CSSProperties } from 'react';
import type { BookRow, ProgressRow } from '../../db/schema';
import { PixelIcon } from '../../ui/PixelIcon';

/** A PDF being imported (shown as a spine filling up). */
export interface ImportJob {
  id: string;
  name: string;
  label: string;
  pct: number;
}

interface Props {
  books: BookRow[];
  progress: Map<string, ProgressRow>;
  imports: ImportJob[];
  onOpen: (book: BookRow) => void;
  onRemove: (book: BookRow) => void;
  onAdd: () => void;
}

/** The window-sofa bookshelf: every uploaded PDF as a book spine. Pick one to start reading. */
export function BookSpines({ books, progress, imports, onOpen, onRemove, onAdd }: Props) {
  return (
    <div className="book-spines-panel">
      <ul className="book-spines" aria-label="Bookshelf">
        {books.map((b) => {
          const p = progress.get(b.id);
          const pct = Math.round((p?.percent ?? 0) * 100);
          const style = { '--spine': b.spineColor || '#7A2E35', '--h': `${150 + (b.pageCount % 5) * 8}px` } as CSSProperties;
          return (
            <li key={b.id} className={`spine-slot ${p?.finishedAt ? 'finished' : ''}`}>
              <button className="spine" style={style} onClick={() => onOpen(b)} title={`${b.title}${b.author ? ` — ${b.author}` : ''} · ${pct}%`}>
                <span className="spine-title">{b.title}</span>
                {b.author && <span className="spine-author">{b.author}</span>}
                <span className="spine-progress" style={{ height: `${pct}%` }} aria-hidden="true" />
              </button>
              <button className="spine-remove" onClick={() => onRemove(b)} aria-label={`Remove ${b.title}`}>
                <PixelIcon name="close" scale={1} />
              </button>
            </li>
          );
        })}
        {imports.map((j) => (
          <li key={j.id} className="spine-slot importing">
            <div className="spine" style={{ '--spine': '#3A3A42', '--h': '150px' } as CSSProperties} title={j.label}>
              <span className="spine-title">{j.name}</span>
              <span className="spine-progress" style={{ height: `${Math.round(j.pct * 100)}%` }} />
            </div>
          </li>
        ))}
        <li className="spine-slot">
          <button className="spine add" onClick={onAdd} title="Add a PDF (U)">
            <PixelIcon name="upload" scale={2} />
            <span className="spine-title">Add a PDF</span>
          </button>
        </li>
      </ul>
      <p className="muted small">Pick a book: Roxy hangs up her apron, settles on the sofa, and the Reading Room opens. Add more with the + spine (or drop PDFs anywhere on a computer).</p>
    </div>
  );
}
