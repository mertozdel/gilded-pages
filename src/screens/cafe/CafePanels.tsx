import type { BookRow, ProgressRow } from '../../db/schema';
import { PixelIcon } from '../../ui/PixelIcon';
import { useObjectUrl } from '../../ui/useObjectUrl';

/** "Continue reading": the last book, how far along, and a button straight back in. */
export function ContinueReading({ book, progress, onOpen }: { book: BookRow | undefined; progress: ProgressRow | undefined; onOpen: (b: BookRow) => void }) {
  if (!book) {
    return (
      <div className="cafe-card continue">
        <p className="card-eyebrow">Continue reading</p>
        <p className="card-title muted">Your shelf is empty — add a PDF.</p>
      </div>
    );
  }
  const pct = Math.round((progress?.percent ?? 0) * 100);
  return (
    <button className="cafe-card continue" onClick={() => onOpen(book)} title={`${book.title} — ${pct}%`}>
      <p className="card-eyebrow">Continue reading:</p>
      <p className="card-title">“{book.title}”</p>
      <span className="card-progress" aria-label={`${pct}% read`}>
        <span style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

function Cover({ book, onOpen }: { book: BookRow; onOpen: (b: BookRow) => void }) {
  const url = useObjectUrl(book.coverThumb);
  return (
    <button className="quiet-cover" style={{ background: book.spineColor || '#7A2E35' }} onClick={() => onOpen(book)} title={book.title}>
      {url ? <img src={url} alt="" /> : <span>{book.title}</span>}
    </button>
  );
}

/** "Quiet reads": a few books from the shelf as little covers. */
export function QuietReads({ books, onOpen, onAdd }: { books: BookRow[]; onOpen: (b: BookRow) => void; onAdd: () => void }) {
  const shown = books.slice(0, 4);
  return (
    <div className="cafe-card quiet">
      <p className="card-eyebrow">Quiet reads</p>
      <div className="quiet-row">
        {shown.map((b) => (
          <Cover key={b.id} book={b} onOpen={onOpen} />
        ))}
        {shown.length < 5 && (
          <button className="quiet-cover empty" onClick={onAdd} title="Add a PDF (U)">
            <PixelIcon name="plus" scale={2} />
          </button>
        )}
      </div>
    </div>
  );
}
