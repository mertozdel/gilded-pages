import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { bus } from '../bus/events';
import { CURRENCIES, characterById, hasFeature, hotspotVisible } from '../content/characters';
import { roomHotspots } from '../content/rooms';
import { raiseBest } from '../db/profiles';
import { db, type BookRow, type ProgressRow } from '../db/schema';
import { addBook, deleteBook } from '../db/queries';
import { useLive } from '../db/useLive';
import { dayTimeOf } from '../game/iso/cafeArt';
import { closeBookDoc, importPdf, type ImportProgress } from '../reader/pdfLoader';
import { useStore } from '../store';
import { DecoPanel } from '../ui/DecoPanel';
import { PixelIcon } from '../ui/PixelIcon';
import { RoomView, walkToHotspot } from '../ui/RoomView';
import { ScreenFrame } from '../ui/ScreenFrame';
import { isTypingTarget } from '../ui/keys';
import { useCompact, usePhone } from '../ui/usePhone';
import { BookSpines, type ImportJob } from './cafe/BookSpines';
import { ContinueReading, QuietReads } from './cafe/CafePanels';
import { MorningRush } from './cafe/MorningRush';
import { MuralPanel } from './cafe/MuralPanel';
import { RegularsPanel } from './cafe/RegularsPanel';
import { TwinBattleBoard } from './cafe/TwinBattleBoard';
import { LatteShift } from './cafe/latte/LatteShift';
import { PhotoBoard } from './cafe/latte/PhotoBoard';

type Panel = 'shelf' | 'quests' | 'mural' | 'rush' | 'photos' | null;

const CAFE_HOTSPOTS = roomHotspots('cafe').map((h) => h.id);

function progressLabel(p: ImportProgress): string {
  switch (p.stage) {
    case 'opening':
      return 'Opening the parcel…';
    case 'cover':
      return 'Painting the cover…';
    case 'pages':
      return `Cataloguing pages ${p.done}/${p.total}`;
    case 'saving':
      return 'Shelving…';
  }
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const DAY_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Late night' } as const;

/**
 * Café Machorn — the home screen, New York 2026, an isometric room. Roxy works the bar;
 * the silo and the banquette regulars give daily quests, the mural leads to the museums,
 * the counter is Morning Rush, the reading bench holds the bookshelf (picking a book is her
 * reading break), and the glass door opens the map. Click the floor to send her anywhere.
 * On a phone the room fills the screen (drag to look along it) and the reading cards sit in
 * a dock instead of on the painting: under the room upright, beside it on its side.
 *
 * Whoever plays, it is the same café: the character's feature flags decide what shows. Without
 * reading, the shelf, the reading cards and PDF drops are gone; the counter is latte art for a
 * latte artist; the door is a break (or a polite refusal) for someone without the map; the
 * mural wall holds a latte artist's photo board.
 */
export function CafeScreen() {
  const books = useLive(() => db.books.orderBy('lastOpenedAt').reverse().toArray(), []);
  const added = useLive(() => db.books.orderBy('addedAt').reverse().toArray(), []);
  const progress = useLive(() => db.progress.toArray(), []);
  const navigate = useStore((s) => s.navigate);
  const toast = useStore((s) => s.toast);
  const mode = useStore((s) => s.settings.readingMode);
  const textOnly = mode === 'text';
  const phone = usePhone();
  const compact = useCompact();
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [onBreak, setOnBreak] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelWalk = useRef<() => void>(() => undefined);
  const character = characterById(useStore((s) => s.character));
  const reading = hasFeature(character, 'reading');
  const setTravel = useStore((s) => s.setTravel);
  const setProfile = useStore((s) => s.setProfile);
  const cafeAction = useStore((s) => s.cafeAction);
  const profile = useStore((s) => s.profiles[s.character]);
  const [shift, setShift] = useState(false);

  const progressById = new Map<string, ProgressRow>((progress ?? []).map((p) => [p.bookId, p]));
  const shelf = added ?? [];
  const lastRead = (books ?? []).find((b) => b.lastOpenedAt);

  const addFiles = async (files: File[]) => {
    const pdfs = files.filter(isPdf);
    files.filter((f) => !isPdf(f)).forEach((f) => toast(`${f.name} is not a PDF`, 'rose'));
    if (pdfs.length) bus.emit('cafe:delivery', {});
    for (const file of pdfs) {
      const jobId = crypto.randomUUID();
      setImports((j) => [...j, { id: jobId, name: file.name, label: 'Opening the parcel…', pct: 0 }]);
      try {
        const book = await importPdf(file, (p) =>
          setImports((j) => j.map((x) => (x.id === jobId ? { ...x, label: progressLabel(p), pct: p.total ? p.done / p.total : 0 } : x))),
        );
        await addBook(book);
        toast(`“${book.title}” is on the shelf`, 'gold');
      } catch (e) {
        console.error(e);
        toast(`Couldn't read ${file.name}${e instanceof Error && e.name === 'PasswordException' ? ' (password-protected)' : ''}`, 'rose');
      } finally {
        setImports((j) => j.filter((x) => x.id !== jobId));
      }
    }
  };

  const removeBook = async (book: BookRow) => {
    if (!window.confirm(`Remove “${book.title}” from the shelf? Its progress, bookmarks and Quote Pearls go too.`)) return;
    closeBookDoc(book.id);
    await deleteBook(book.id);
    toast(`“${book.title}” removed`, 'rose');
  };

  /** The reading break: apron off at the hook, settle on the reading bench — then 1925. */
  const takeBreak = (book: BookRow) => {
    if (onBreak) return;
    if (mode === 'text') return navigate({ name: 'reader', bookId: book.id });
    cancelWalk.current();
    setPanel(null);
    setOnBreak(book.id);
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      offSeated();
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('pointerdown', skip, true);
      window.clearTimeout(timer);
      navigate({ name: 'reader', bookId: book.id });
    };
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === 'Tab' || e.key === 'Shift')) return;
      bus.emit('break:skip', {});
      go();
    };
    const offSeated = bus.on('break:seated', (e) => e.bookId === book.id && go());
    const timer = window.setTimeout(go, 12000);
    window.setTimeout(() => {
      window.addEventListener('keydown', skip, true);
      window.addEventListener('pointerdown', skip, true);
    }, 150);
    bus.emit('break:start', { bookId: book.id });
  };

  /** The door without the map: a rhythm break, or a word on why there is none. */
  const takeCrewBreak = () => {
    const b = character.break;
    if (b?.type === 'rhythm') {
      bus.emit('break:start', { venue: b.venue });
      setTravel({ venue: b.venue, dir: 'out' });
    } else if (!b && character.breakLine) bus.emit('crew:say', { id: character.id, text: character.breakLine });
  };

  const activateHotspot = (id: string) => {
    cancelWalk.current();
    const open = () => {
      switch (id) {
        case 'silo':
        case 'banquette':
          return setPanel('quests');
        case 'mural':
          return setPanel(hasFeature(character, 'museums') ? 'mural' : 'photos');
        case 'counter':
          return hasFeature(character, 'latteArt') ? setShift(true) : setPanel('rush');
        case 'sofa':
          return setPanel('shelf');
        case 'door':
          return hasFeature(character, 'worldMap') ? navigate({ name: 'map' }) : takeCrewBreak();
      }
    };
    cancelWalk.current = walkToHotspot(id, open);
  };
  const activateRef = useRef(activateHotspot);
  activateRef.current = activateHotspot;
  const readingRef = useRef(reading);
  readingRef.current = reading;

  // The HUD's action: latte art at the machine, or a break through the door.
  const seenAction = useRef(cafeAction);
  useEffect(() => {
    if (cafeAction === seenAction.current) return;
    seenAction.current = cafeAction;
    activateRef.current(hasFeature(character, 'latteArt') ? 'counter' : 'door');
  }, [cafeAction, character]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!readingRef.current && e.key !== 'Escape') return;
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        fileInput.current?.click();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        activateRef.current('sofa');
      } else if (e.key === 'Escape' && panel) {
        e.preventDefault();
        setPanel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);
  useEffect(() => () => cancelWalk.current(), []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!reading) return;
    void addFiles([...e.dataTransfer.files]);
  };

  const totalPages = (progress ?? []).reduce((n, p) => n + p.pagesCounted, 0);
  const empty = added && added.length === 0 && imports.length === 0;

  const panels: Record<Exclude<Panel, null>, { title: string; body: ReactNode }> = {
    shelf: {
      title: 'The bookshelf',
      body: (
        <BookSpines books={shelf} progress={progressById} imports={imports} onOpen={takeBreak} onRemove={(b) => void removeBook(b)} onAdd={() => fileInput.current?.click()} />
      ),
    },
    quests: { title: 'Daily quests & the regulars', body: <RegularsPanel /> },
    mural: { title: 'The mural: Art Cards & museums', body: <MuralPanel /> },
    rush: {
      title: hasFeature(character, 'coffee') ? 'Espresso bar' : 'Morning Rush',
      body: (
        <>
          {hasFeature(character, 'coffee') && (
            <div className="bar-coffee">
              <p>Pull a shot, steam the milk, pour a pattern — whenever you like.</p>
              <button
                className="deco-btn big"
                onClick={() => {
                  setPanel(null);
                  setShift(true);
                }}
                data-testid="make-coffee"
              >
                Make a coffee
              </button>
              {(profile.bests.cup ?? 0) > 0 && <span className="small muted"> Best cup: {Math.round(profile.bests.cup)}/100</span>}
            </div>
          )}
          {hasFeature(character, 'morningRush') && (
        <MorningRush
          onClose={() => setPanel(null)}
          payout={
            character.currency === 'gilt'
              ? undefined
              : async (served) => {
                  // A café shift: no Gilt and no gig currency, but the best round is kept.
                  const prev = useStore.getState().profiles[character.id].bests.rush ?? 0;
                  setProfile(await raiseBest(character.id, 'rush', served));
                  return `${served} orders served${served > prev ? ' · a new best!' : ` · best ${prev}`}`;
                }
          }
        />
          )}
        </>
      ),
    },
    photos: { title: `${character.name}'s photo board`, body: <PhotoBoard /> },
  };

  const current = lastRead ?? shelf[0];
  const continueCard = <ContinueReading book={current} progress={progressById.get(current?.id ?? '')} onOpen={takeBreak} />;
  const shelfButtons = (
    <div className="anchor-buttons">
      <button className="cafe-btn" onClick={() => activateHotspot('sofa')}>
        <PixelIcon name="book" scale={2} /> Bookshelf <kbd>B</kbd>
      </button>
      <button className="cafe-btn" onClick={() => fileInput.current?.click()}>
        <PixelIcon name="upload" scale={2} /> Add a PDF <kbd>U</kbd>
      </button>
    </div>
  );
  const quietReads = <QuietReads books={shelf} onOpen={takeBreak} onAdd={() => fileInput.current?.click()} />;

  return (
    <ScreenFrame
      className="cafe"
      title="Café Machorn"
      subtitle={`Nürnberg, Bavaria · 2026 · ${DAY_LABEL[dayTimeOf()]}`}
      footer={
        reading ? (
          <span>
            PDFs stay on this device · {shelf.length} {shelf.length === 1 ? 'book' : 'books'} · {totalPages} pages read · click the floor to walk, a glowing spot to use it
          </span>
        ) : (
          <span>
            {character.name} · {character.role} · {CURRENCIES[character.currency].name}: {profile.currency} · click the floor to walk, a glowing spot to use it
          </span>
        )
      }
    >
      <div
        className={`cafe-room ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (reading) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void addFiles(files);
          }}
        />
        <div className="cafe-stage">
          <RoomView
            room="cafe"
            onHotspot={activateHotspot}
            hidden={CAFE_HOTSPOTS.filter((id) => !hotspotVisible(character, id))}
            labels={character.hotspots}
            renderAnchor={
              compact
                ? undefined
                : (id) => {
                    switch (id) {
                      case 'continue':
                        return reading ? continueCard : null;
                      case 'shelf-buttons':
                        return reading ? shelfButtons : null;
                      case 'quiet-reads':
                        return reading ? quietReads : null;
                      case 'twin-battle':
                        return <TwinBattleBoard />;
                      default:
                        return null;
                    }
                  }
            }
          />
          {onBreak && (
            <div className="break-hint" role="status">
              Roxy is taking her break… <span className="muted small">({phone ? 'tap' : 'press any key'} to skip)</span>
            </div>
          )}
        </div>
        {compact && !textOnly && reading && (
          <div className="cafe-dock">
            {continueCard}
            {shelfButtons}
            {quietReads}
          </div>
        )}

        <div className="cafe-toolbar" hidden={!textOnly || !reading}>
          <button className="deco-btn" onClick={() => activateHotspot('sofa')}>
            <PixelIcon name="book" scale={2} /> Bookshelf <kbd>B</kbd>
          </button>
          <button className="deco-btn" onClick={() => fileInput.current?.click()}>
            <PixelIcon name="upload" scale={2} /> Add a PDF <kbd>U</kbd>
          </button>
          {lastRead && (
            <button className="deco-btn" onClick={() => takeBreak(lastRead)}>
              Continue “{lastRead.title.length > 24 ? `${lastRead.title.slice(0, 24)}…` : lastRead.title}”
            </button>
          )}
        </div>

        {!reading && textOnly && character.action && (
          <div className="cafe-toolbar">
            <button className="deco-btn" onClick={() => activateHotspot(hasFeature(character, 'latteArt') ? 'counter' : 'door')}>
              {character.action}
            </button>
          </div>
        )}

        {shift && <LatteShift onClose={() => setShift(false)} />}

        {empty && !panel && textOnly && reading && (
          <div className="cafe-welcome">
            <DecoPanel title="Welcome to Café Machorn" unfold>
              <p>
                Roxy Lark pulls espresso here by day and reads every spare minute. Bring her a PDF and she will take her break with it on the reading bench — every
                book she opens is a doorway to 1925.
              </p>
              <button className="deco-btn big" onClick={() => fileInput.current?.click()}>
                <PixelIcon name="upload" scale={2} /> Add a PDF <kbd>U</kbd>
              </button>
              <p className="muted small">…or drop PDFs anywhere — a bike courier brings the parcel.</p>
            </DecoPanel>
          </div>
        )}

        {panel && (
          <div className="cafe-panel" role="dialog" aria-label={panels[panel].title}>
            <DecoPanel title={panels[panel].title} unfold>
              <button className="icon-btn panel-close" onClick={() => setPanel(null)} aria-label="Close (Esc)">
                <PixelIcon name="close" scale={2} />
              </button>
              {panels[panel].body}
            </DecoPanel>
          </div>
        )}

        {dragging && (
          <div className="drop-hint" aria-hidden="true">
            Drop PDFs — the courier is on the way
          </div>
        )}
      </div>
    </ScreenFrame>
  );
}
