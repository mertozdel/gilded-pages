import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { bus, type NavSource } from '../bus/events';
import { db, type BookRow } from '../db/schema';
import { addHighlight, celebrateChapter, deleteBookmark, deleteHighlight, getProgress, recordCountedPage, saveCurrentPage, toggleBookmark } from '../db/queries';
import { useLive } from '../db/useLive';
import { PageView } from '../reader/PageView';
import { ProgressLine } from '../reader/ProgressLine';
import { ReaderPanel, type PanelTab } from '../reader/ReaderPanel';
import { readSelection, type SelectionInfo } from '../reader/highlights';
import { pageSize, prefetch } from '../reader/pageCache';
import { usePageClock } from '../reader/pageTimer';
import { chapterIndexAt } from '../reader/pdfLoader';
import { useBookDoc } from '../reader/useBookDoc';
import { leisureReadMs, requiredDwellMs } from '../rules/pageCount';
import { GILT_BOOK_BONUS } from '../rules/gilt';
import { useStore } from '../store';
import type { Settings } from '../store/settingsSlice';
import { PixelIcon } from '../ui/PixelIcon';
import { ScreenFrame } from '../ui/ScreenFrame';
import { usePhone } from '../ui/usePhone';
import { isActivatable, isTypingTarget } from '../ui/keys';

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5];
const MODES: Settings['readingMode'][] = ['gala', 'calm', 'text'];
const MODE_LABEL = { gala: 'Full Gala', calm: 'Calm', text: 'Text only' } as const;

export function ReaderScreen({ bookId }: { bookId: string }) {
  const { book, doc, initialProgress, error, loading } = useBookDoc(bookId);
  const navigate = useStore((s) => s.navigate);

  if (loading) {
    return (
      <ScreenFrame title="Reading Room" subtitle="1925 · opening the book…">
        <div className="center-fill">
          <span className="sunburst-spinner" />
        </div>
      </ScreenFrame>
    );
  }
  if (error || !book || !doc) {
    return (
      <ScreenFrame title="Reading Room" subtitle="1925">
        <div className="center-fill">
          <p>{error ?? 'This book could not be opened.'}</p>
          <button className="deco-btn" onClick={() => navigate({ name: 'cafe' })}>
            Back to the café
          </button>
        </div>
      </ScreenFrame>
    );
  }
  const start = Math.min(Math.max(1, initialProgress?.currentPage ?? 1), doc.numPages);
  return <Reader book={book} doc={doc} initialPage={start} />;
}

function Reader({ book, doc, initialPage }: { book: BookRow; doc: PDFDocumentProxy; initialPage: number }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setPlayer = useStore((s) => s.setPlayer);
  const navigate = useStore((s) => s.navigate);
  const toast = useStore((s) => s.toast);
  const pageCount = doc.numPages;

  const [page, setPage] = useState(initialPage);
  const pageRef = useRef(initialPage);
  const [enter, setEnter] = useState<'next' | 'prev' | 'none'>('none');
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [area, setArea] = useState({ w: 800, h: 600 });
  const [base, setBase] = useState<{ width: number; height: number } | null>(null);
  const phone = usePhone();
  /** On a phone, the second row of tools (zoom, night, reading mode). */
  const [more, setMore] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const counted = useRef<Set<number>>(new Set());
  const firing = useRef<Set<number>>(new Set());
  const scrollP = useRef(0);
  const lastEmitted = useRef(-1);

  const highlights = useLive(() => db.highlights.where('bookId').equals(book.id).toArray(), [book.id]) ?? [];
  const bookmarks = useLive(() => db.bookmarks.where('bookId').equals(book.id).sortBy('page'), [book.id]) ?? [];

  useEffect(() => {
    void getProgress(book.id).then((p) => p.countedPages.forEach((n) => counted.current.add(n)));
  }, [book.id]);

  // ---------- layout: fit the page, decide on a two-page spread ----------

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    void pageSize(book.id, doc, page).then((s) => alive && setBase(s));
    return () => {
      alive = false;
    };
  }, [book.id, doc, page]);

  // A phone shows the page edge to edge.
  const PAD = phone ? 4 : 24;
  const fitSingle = base ? Math.min((area.w - PAD) / base.width, (area.h - PAD) / base.height) : 1;
  const fitSpread = base ? Math.min((area.w - PAD - 8) / (2 * base.width), (area.h - PAD) / base.height) : 1;
  const spread = settings.layout === 'auto' && !!base && area.w > 900 && fitSpread >= fitSingle * 0.9 && pageCount > 1;
  const step = spread ? 2 : 1;
  const scale = Math.max(0.2, Math.round((spread ? fitSpread : fitSingle) * settings.fontZoom * 100) / 100);
  const visible = useMemo(() => (spread && page + 1 <= pageCount ? [page, page + 1] : [page]), [spread, page, pageCount]);

  useEffect(() => {
    prefetch(book.id, doc, [page + step, page + step + 1, page - step].filter((n) => n >= 1 && n <= pageCount), scale);
  }, [book.id, doc, page, step, scale, pageCount]);

  // ---------- navigation ----------

  const saveTimer = useRef(0);
  const persist = useCallback(
    (p: number) => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveCurrentPage(book.id, p, pageCount), 150);
    },
    [book.id, pageCount],
  );
  useEffect(() => {
    const flush = () => void saveCurrentPage(book.id, pageRef.current, pageCount);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [book.id, pageCount]);

  const celebrate = useCallback(
    async (chapterIndex: number, atPage: number) => {
      const ch = book.chapters[chapterIndex];
      if (!ch) return;
      const { bonus, player } = await celebrateChapter(book.id, chapterIndex);
      setPlayer(player);
      bus.emit('chapter:end', { title: ch.title, page: atPage, bonusGilt: bonus });
      toast(bonus ? `Chapter finished: ${ch.title} · +${bonus} Gilt` : `Chapter finished: ${ch.title}`, 'gold');
    },
    [book, setPlayer, toast],
  );

  const goTo = useCallback(
    (target: number, kind: 'next' | 'prev' | 'jump', source: NavSource = 'button') => {
      const t = Math.max(1, Math.min(pageCount, target));
      const from = pageRef.current;
      if (t === from) return;
      pageRef.current = t;
      setPage(t);
      setEnter(kind === 'jump' ? 'none' : kind);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      areaRef.current?.scrollTo({ top: 0 });
      scrollP.current = 0;
      lastEmitted.current = -1;
      if (kind === 'next') bus.emit('page:next', { page: t, pageCount, source });
      else if (kind === 'prev') bus.emit('page:prev', { page: t, pageCount, source });
      else bus.emit('page:jump', { from, to: t, pageCount });
      bus.emit('scroll:progress', { progress: 0 });
      // Reading forward into a new chapter finishes the one before it.
      if (kind === 'next' && book.chapters.length) {
        const lastBefore = Math.min(pageCount, from + step - 1);
        const lastAfter = Math.min(pageCount, t + step - 1);
        const crossed = book.chapters.findIndex((c, i) => i > 0 && c.page > lastBefore && c.page <= lastAfter);
        if (crossed > 0) void celebrate(crossed - 1, t);
      }
      persist(t);
    },
    [pageCount, step, book.chapters, celebrate, persist],
  );

  const next = useCallback((source: NavSource) => goTo(pageRef.current + step, 'next', source), [goTo, step]);
  const prev = useCallback((source: NavSource) => goTo(pageRef.current - step, 'prev', source), [goTo, step]);
  const jump = useCallback(
    (p: number) => {
      setPanel(null);
      goTo(p, 'jump');
    },
    [goTo],
  );

  // ---------- honest page counting + Roxy's stroll across the strip ----------

  const words = useMemo(() => visible.map((n) => book.wordsPerPage[n - 1] ?? 0), [visible, book.wordsPerPage]);
  const onTick = useCallback(
    (elapsed: number) => {
      let need = 0;
      visible.forEach((n, i) => {
        need += requiredDwellMs(words[i]);
        if (elapsed < need || counted.current.has(n) || firing.current.has(n)) return;
        firing.current.add(n);
        void recordCountedPage(book.id, n, pageCount).then((r) => {
          firing.current.delete(n);
          counted.current.add(n);
          if (!r.counted) return;
          setPlayer(r.player);
          bus.emit('page:counted', { page: n, gilt: r.giltEarned });
          if (r.streakEarned) toast(`The green light glows brighter — ${r.player.streakDays}-day streak`, 'green');
          if (r.bookFinished) {
            toast(`You finished “${book.title}”! +${GILT_BOOK_BONUS} Gilt — the Florist has an invitation for you`, 'gold');
            const last = book.chapters.length - 1;
            if (last >= 0) void celebrate(last, n);
            else bus.emit('chapter:end', { title: book.title, page: n, bonusGilt: 0 });
          }
        });
      });
      const timeP = Math.min(1, elapsed / leisureReadMs(words.reduce((a, b) => a + b, 0)));
      const p = Math.max(scrollP.current, timeP);
      if (Math.abs(p - lastEmitted.current) >= 0.03 || (p === 1 && lastEmitted.current !== 1)) {
        lastEmitted.current = p;
        bus.emit('scroll:progress', { progress: p });
      }
    },
    [visible, words, book, pageCount, setPlayer, toast, celebrate],
  );
  usePageClock(`${book.id}:${visible.join(',')}`, onTick);

  const onScroll = () => {
    const el = areaRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    scrollP.current = max > 4 ? el.scrollTop / max : 0;
    if (Math.abs(scrollP.current - lastEmitted.current) >= 0.03) {
      lastEmitted.current = scrollP.current;
      bus.emit('scroll:progress', { progress: scrollP.current });
    }
  };

  // ---------- bookmarks & Quote Pearls ----------

  const chapterIdx = chapterIndexAt(book.chapters, page);
  const chapterTitle = chapterIdx >= 0 ? book.chapters[chapterIdx].title : null;

  const onToggleBookmark = useCallback(async () => {
    const label = chapterTitle ? `${chapterTitle} · p. ${pageRef.current}` : `Page ${pageRef.current}`;
    const row = await toggleBookmark(book.id, pageRef.current, label);
    if (row) {
      bus.emit('bookmark:add', { page: row.page });
      toast(`Bookmark planted on page ${row.page}`, 'gold');
    } else toast('Bookmark removed', 'rose');
  }, [book.id, chapterTitle, toast]);

  const makePearl = useCallback(async () => {
    const sel = readSelection() ?? selection;
    if (!sel) {
      toast('Select a line on the page first, then press H.', 'rose');
      return;
    }
    await addHighlight(book.id, sel.page, sel.text, sel.rects);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    bus.emit('highlight:add', { page: sel.page, text: sel.text });
    const count = (await db.highlights.count()) % 20 || 20;
    toast(`Quote Pearl strung — ${count}/20 on Roxy's necklace`, 'gold');
  }, [book.id, selection, toast]);

  useEffect(() => {
    const onUp = () => window.setTimeout(() => setSelection(readSelection()), 0);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keyup', onUp);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keyup', onUp);
    };
  }, []);

  // ---------- keyboard ----------

  const zoomBy = useCallback(
    (dir: number) => {
      const i = ZOOM_STEPS.findIndex((z) => z >= settings.fontZoom - 0.001);
      const ni = Math.max(0, Math.min(ZOOM_STEPS.length - 1, (i < 0 ? 3 : i) + dir));
      setSettings({ fontZoom: ZOOM_STEPS[ni] });
    },
    [settings.fontZoom, setSettings],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setPanel('search');
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const activatable = isActivatable(e.target);
      const toggle = (t: PanelTab) => setPanel((p) => (p === t ? null : t));
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
          next('key');
          break;
        case 'ArrowLeft':
        case 'PageUp':
          prev('key');
          break;
        case ' ':
          if (activatable) return;
          if (e.shiftKey) prev('key');
          else next('key');
          break;
        case 'ArrowDown':
        case 'ArrowUp':
          if (panel) return;
          areaRef.current?.scrollBy({ top: e.key === 'ArrowDown' ? 60 : -60 });
          break;
        case 'Home':
          goTo(1, 'jump', 'key');
          break;
        case 'End':
          goTo(pageCount - (spread ? 1 : 0), 'jump', 'key');
          break;
        case 'b':
        case 'B':
          void onToggleBookmark();
          break;
        case 'h':
        case 'H':
          void makePearl();
          break;
        case 'c':
        case 'C':
          toggle('chapters');
          break;
        case 'k':
        case 'K':
          toggle('bookmarks');
          break;
        case 'p':
        case 'P':
          toggle('pearls');
          break;
        case '/':
          toggle('search');
          break;
        case 'g':
        case 'G':
          pageInputRef.current?.focus();
          break;
        case '+':
        case '=':
          zoomBy(1);
          break;
        case '-':
          zoomBy(-1);
          break;
        case '0':
          setSettings({ fontZoom: 1 });
          break;
        case 'n':
        case 'N':
          setSettings({ nightMode: !settings.nightMode });
          break;
        case 'm':
        case 'M':
          setSettings({ readingMode: MODES[(MODES.indexOf(settings.readingMode) + 1) % MODES.length] });
          break;
        case 'Escape':
          if (panel) setPanel(null);
          else if (selection) {
            window.getSelection()?.removeAllRanges();
            setSelection(null);
          } else navigate({ name: 'cafe' });
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, goTo, pageCount, spread, panel, selection, onToggleBookmark, makePearl, zoomBy, settings, setSettings, navigate]);

  // ---------- touch swipe & wheel past the page edge ----------

  /** A finger: a swipe turns the page, and so does a tap on the outer third of either side. */
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: RPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    swipe.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onPointerUp = (e: RPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dt = performance.now() - s.t;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && dt < 700) {
      if (dx < 0) next('swipe');
      else prev('swipe');
      return;
    }
    const el = areaRef.current;
    if (!el || panel || Math.abs(dx) > 10 || Math.abs(dy) > 10 || dt > 350 || !(window.getSelection()?.isCollapsed ?? true)) return;
    const r = el.getBoundingClientRect();
    const at = (e.clientX - r.left) / r.width;
    if (at < 0.3) prev('click');
    else if (at > 0.7) next('click');
  };
  const wheel = useRef({ acc: 0, until: 0 });
  const onWheel = (e: WheelEvent) => {
    const el = areaRef.current;
    if (!el || panel) return;
    const now = performance.now();
    if (now < wheel.current.until) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    const atTop = el.scrollTop <= 0;
    if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) {
      wheel.current.acc += e.deltaY;
      if (Math.abs(wheel.current.acc) > 140) {
        if (wheel.current.acc > 0) next('wheel');
        else prev('wheel');
        wheel.current = { acc: 0, until: now + 450 };
      }
    } else wheel.current.acc = 0;
  };

  // ---------- render ----------

  const bookmarkedPages = new Set(bookmarks.map((b) => b.page));
  const pageW = base ? Math.floor(base.width * scale) : 0;
  const pageH = base ? Math.floor(base.height * scale) : 0;
  const isBookmarked = bookmarkedPages.has(page);
  const atEnd = page + step > pageCount;

  const header = (
    <div className="reader-head">
      <button className="icon-btn" onClick={() => navigate({ name: 'cafe' })} title="Close the book — back to the café (Esc)" aria-label="Close the book, back to the café">
        <PixelIcon name="left" scale={2} />
      </button>
      <div className="reader-titles">
        <h1 title={book.title}>{book.title}</h1>
        <p className="screen-subtitle">
          1925 · {chapterTitle ?? (book.author || 'Reading Room')}
        </p>
      </div>
      <div className="reader-tools" role="toolbar" aria-label="Reader tools">
        <button className={`icon-btn ${panel === 'chapters' ? 'active' : ''}`} onClick={() => setPanel(panel === 'chapters' ? null : 'chapters')} title="Chapters (C)">
          <PixelIcon name="list" scale={2} />
          <span className="sr-only">Chapters</span>
        </button>
        <button className={`icon-btn ${isBookmarked ? 'active' : ''}`} onClick={() => void onToggleBookmark()} title="Bookmark this page (B)" aria-pressed={isBookmarked}>
          <PixelIcon name="flag" scale={2} />
          <span className="sr-only">Bookmark</span>
        </button>
        <button className={`icon-btn ${panel === 'pearls' ? 'active' : ''}`} onClick={() => setPanel(panel === 'pearls' ? null : 'pearls')} title="Quote Pearls (P)">
          <PixelIcon name="pearl" scale={2} />
          <span className="sr-only">Quote Pearls</span>
        </button>
        <button className={`icon-btn ${panel === 'search' ? 'active' : ''}`} onClick={() => setPanel(panel === 'search' ? null : 'search')} title="Search (/)">
          <PixelIcon name="search" scale={2} />
          <span className="sr-only">Search</span>
        </button>
        <div id="reader-extra" className={`reader-extra ${more ? 'open' : ''}`}>
          <span className="tool-sep" aria-hidden="true" />
          <button className="icon-btn" onClick={() => zoomBy(-1)} title="Zoom out (−)">
            <PixelIcon name="minus" scale={2} />
            <span className="sr-only">Zoom out</span>
          </button>
          <span className="zoom-label">{Math.round(settings.fontZoom * 100)}%</span>
          <button className="icon-btn" onClick={() => zoomBy(1)} title="Zoom in (+)">
            <PixelIcon name="plus" scale={2} />
            <span className="sr-only">Zoom in</span>
          </button>
          <button className={`icon-btn ${settings.nightMode ? 'active' : ''}`} onClick={() => setSettings({ nightMode: !settings.nightMode })} title="Night mode — Speakeasy (N)" aria-pressed={settings.nightMode}>
            <PixelIcon name="moon" scale={2} />
            <span className="sr-only">Night mode</span>
          </button>
          <div className="mode-switch" role="radiogroup" aria-label="Reading mode (M)">
            {MODES.map((m) => (
              <button key={m} role="radio" aria-checked={settings.readingMode === m} className={settings.readingMode === m ? 'active' : ''} onClick={() => setSettings({ readingMode: m })}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        {phone && (
          <button className={`icon-btn ${more ? 'active' : ''}`} onClick={() => setMore((m) => !m)} title="More tools" aria-expanded={more} aria-controls="reader-extra">
            <PixelIcon name="more" scale={2} />
            <span className="sr-only">More tools</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <ScreenFrame
      immersive
      className={`reader ${settings.nightMode ? 'night' : ''}`}
      headerLeft={header}
      footer={<ProgressLine page={page} pageCount={pageCount} visibleCount={visible.length} chapters={book.chapters} onJump={(p) => jump(p)} inputRef={pageInputRef} />}
    >
      <div className="reader-body">
        <button className="nav-edge prev" onClick={() => prev('click')} disabled={page <= 1} aria-label="Previous page">
          <PixelIcon name="left" scale={3} />
        </button>
        <div
          className="reader-area"
          ref={areaRef}
          onScroll={onScroll}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          // While the page fits across, sideways swipes are ours (page turns), not the browser's.
          style={{ touchAction: pageW * visible.length > area.w ? 'auto' : 'pan-y pinch-zoom' }}
        >
          <div className={`page-frame ${spread ? 'spread' : ''}`} key={visible.join('-')}>
            {base &&
              visible.map((n) => (
                <PageView
                  key={n}
                  bookId={book.id}
                  doc={doc}
                  page={n}
                  scale={scale}
                  width={pageW}
                  height={pageH}
                  highlights={highlights.filter((h) => h.page === n)}
                  bookmarked={bookmarkedPages.has(n)}
                  enter={settings.readingMode === 'text' ? 'none' : enter}
                />
              ))}
          </div>
        </div>
        <button className="nav-edge next" onClick={() => next('click')} disabled={atEnd} aria-label="Next page">
          <PixelIcon name="right" scale={3} />
        </button>

        {selection && (
          <button
            className="pearl-btn"
            style={{ left: Math.min(window.innerWidth - 180, selection.anchor.left + selection.anchor.width / 2 - 80), top: Math.max(8, selection.anchor.top - 44) }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void makePearl()}
          >
            <PixelIcon name="pearl" scale={2} /> Make a Quote Pearl <kbd>H</kbd>
          </button>
        )}

        {panel && (
          <ReaderPanel
            tab={panel}
            setTab={setPanel}
            onClose={() => setPanel(null)}
            book={book}
            doc={doc}
            page={page}
            bookmarks={bookmarks}
            highlights={highlights}
            onJump={jump}
            onToggleBookmark={() => void onToggleBookmark()}
            onDeleteBookmark={(id) => void deleteBookmark(id)}
            onDeleteHighlight={(id) => void deleteHighlight(id)}
          />
        )}
      </div>
    </ScreenFrame>
  );
}
