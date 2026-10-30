import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookmarkRow, BookRow, HighlightRow } from '../db/schema';
import { DecoPanel } from '../ui/DecoPanel';
import { PixelIcon } from '../ui/PixelIcon';
import { chapterIndexAt } from './pdfLoader';
import { searchBook, type SearchHit } from './search';

export type PanelTab = 'chapters' | 'bookmarks' | 'pearls' | 'search';

const TABS: { id: PanelTab; label: string; key: string }[] = [
  { id: 'chapters', label: 'Chapters', key: 'C' },
  { id: 'bookmarks', label: 'Bookmarks', key: 'K' },
  { id: 'pearls', label: 'Pearls', key: 'P' },
  { id: 'search', label: 'Search', key: '/' },
];

interface Props {
  tab: PanelTab;
  setTab: (t: PanelTab) => void;
  onClose: () => void;
  book: BookRow;
  doc: PDFDocumentProxy;
  page: number;
  bookmarks: BookmarkRow[];
  highlights: HighlightRow[];
  onJump: (page: number) => void;
  onToggleBookmark: () => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
}

/** Up/Down move focus between the panel's list buttons. */
function onListKeys(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-list-item]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
  if (next) {
    e.preventDefault();
    e.stopPropagation();
    next.focus();
  }
}

export function ReaderPanel(props: Props) {
  const { tab, setTab, onClose } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the first useful control when the panel opens or the tab changes.
    const el = rootRef.current?.querySelector<HTMLElement>('[data-autofocus], [data-list-item], .panel-body button');
    el?.focus();
  }, [tab]);

  return (
    <div className="reader-panel" ref={rootRef} role="dialog" aria-label="Book panel" onKeyDown={onListKeys}>
      <DecoPanel unfold>
        <div className="panel-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`panel-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label} <kbd>{t.key}</kbd>
            </button>
          ))}
          <button className="icon-btn panel-close" onClick={onClose} aria-label="Close panel (Esc)">
            <PixelIcon name="close" scale={2} />
          </button>
        </div>
        <div className="panel-body">
          {tab === 'chapters' && <ChaptersTab {...props} />}
          {tab === 'bookmarks' && <BookmarksTab {...props} />}
          {tab === 'pearls' && <PearlsTab {...props} />}
          {tab === 'search' && <SearchTab {...props} />}
        </div>
      </DecoPanel>
    </div>
  );
}

function ChaptersTab({ book, page, onJump }: Props) {
  if (!book.outline.length) {
    return <p className="muted">This PDF has no outline, so there is no chapter list. Use search or go to a page number instead.</p>;
  }
  const current = chapterIndexAt(book.chapters, page);
  const currentTitle = current >= 0 ? book.chapters[current].title : null;
  return (
    <ol className="panel-list">
      {book.outline.map((e, i) => (
        <li key={i} style={{ paddingLeft: `${e.depth * 14}px` }}>
          <button data-list-item className={`list-btn ${e.title === currentTitle && e.page <= page ? 'current' : ''}`} onClick={() => onJump(e.page)}>
            <span className="list-main">{e.title}</span>
            <span className="list-page">{e.page}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function BookmarksTab({ page, bookmarks, onJump, onToggleBookmark, onDeleteBookmark }: Props) {
  const here = bookmarks.some((b) => b.page === page);
  return (
    <>
      <button className="deco-btn" data-autofocus onClick={onToggleBookmark}>
        <PixelIcon name="flag" scale={2} /> {here ? 'Remove this bookmark' : 'Bookmark this page'} <kbd>B</kbd>
      </button>
      {bookmarks.length === 0 ? (
        <p className="muted">No bookmarks yet. Roxy plants a gold flag whenever you add one.</p>
      ) : (
        <ol className="panel-list">
          {bookmarks.map((b) => (
            <li key={b.id} className="row-with-action">
              <button data-list-item className={`list-btn ${b.page === page ? 'current' : ''}`} onClick={() => onJump(b.page)}>
                <span className="list-main">{b.label}</span>
                <span className="list-page">{b.page}</span>
              </button>
              <button className="icon-btn" onClick={() => onDeleteBookmark(b.id)} aria-label={`Delete bookmark on page ${b.page}`}>
                <PixelIcon name="trash" scale={2} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function PearlsTab({ highlights, onJump, onDeleteHighlight }: Props) {
  if (!highlights.length) {
    return (
      <p className="muted">
        Select a line on the page and press <kbd>H</kbd> (or the pearl button) to string a Quote Pearl on Roxy's necklace.
      </p>
    );
  }
  const sorted = [...highlights].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  return (
    <ol className="panel-list pearls">
      {sorted.map((h) => (
        <li key={h.id} className="row-with-action">
          <button data-list-item className="list-btn quote" onClick={() => onJump(h.page)}>
            <span className="list-main">“{h.text.length > 220 ? `${h.text.slice(0, 220)}…` : h.text}”</span>
            <span className="list-page">{h.page}</span>
          </button>
          <button className="icon-btn" onClick={() => onDeleteHighlight(h.id)} aria-label="Delete Quote Pearl">
            <PixelIcon name="trash" scale={2} />
          </button>
        </li>
      ))}
    </ol>
  );
}

function SearchTab({ book, doc, onJump }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [scanned, setScanned] = useState(0);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = (q: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setHits([]);
    setScanned(0);
    if (q.trim().length < 2) return;
    setBusy(true);
    searchBook(book.id, doc, q, (p, h) => {
      if (ac.signal.aborted) return;
      setScanned(p);
      setHits(h);
    }, ac.signal)
      .then((h) => !ac.signal.aborted && setHits(h))
      .finally(() => !ac.signal.aborted && setBusy(false));
  };

  return (
    <>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <label className="sr-only" htmlFor="book-search">
          Search this book
        </label>
        <input
          id="book-search"
          data-autofocus
          type="search"
          placeholder="Search this book…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              e.currentTarget.closest('.panel-body')?.querySelector<HTMLElement>('[data-list-item]')?.focus();
            }
          }}
        />
        <button className="deco-btn" type="submit">
          <PixelIcon name="search" scale={2} />
          <span className="sr-only">Search</span>
        </button>
      </form>
      {(busy || scanned > 0) && (
        <p className="muted small" aria-live="polite">
          {busy ? `Searching… page ${scanned} of ${doc.numPages}` : `${hits.length}${hits.length >= 300 ? '+' : ''} matches`}
        </p>
      )}
      <ol className="panel-list">
        {hits.map((h, i) => (
          <li key={i}>
            <button data-list-item className="list-btn" onClick={() => onJump(h.page)}>
              <span className="list-main">
                {h.snippet.slice(0, h.matchStart)}
                <mark>{h.snippet.slice(h.matchStart, h.matchStart + h.matchLength)}</mark>
                {h.snippet.slice(h.matchStart + h.matchLength)}
              </span>
              <span className="list-page">{h.page}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
