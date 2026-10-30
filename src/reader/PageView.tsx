import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { HighlightRow } from '../db/schema';
import { peekRender, renderPage, textContent } from './pageCache';

interface Props {
  bookId: string;
  doc: PDFDocumentProxy;
  page: number;
  scale: number;
  width: number;
  height: number;
  highlights: HighlightRow[];
  bookmarked: boolean;
  enter: 'next' | 'prev' | 'none';
}

/**
 * One PDF page: the pdf.js canvas at native device resolution (never pixelated), a
 * selectable text layer on top, and Quote Pearl highlights in between.
 */
export function PageView({ bookId, doc, page, scale, width, height, highlights, bookmarked, enter }: Props) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    let alive = true;
    const hit = peekRender(bookId, page, scale);
    if (hit) {
      host.replaceChildren(hit.canvas);
      setReady(true);
    } else {
      setReady(false);
      renderPage(bookId, doc, page, scale)
        .then((r) => {
          if (!alive) return;
          host.replaceChildren(r.canvas);
          setReady(true);
        })
        .catch((e) => console.warn('[PageView] render failed', e));
    }
    return () => {
      alive = false;
    };
  }, [bookId, doc, page, scale]);

  useEffect(() => {
    const host = textHost.current;
    if (!host) return;
    let alive = true;
    let layer: TextLayer | null = null;
    host.replaceChildren();
    Promise.all([textContent(bookId, doc, page), doc.getPage(page)])
      .then(async ([content, pdfPage]) => {
        if (!alive) return;
        layer = new TextLayer({ textContentSource: content, container: host, viewport: pdfPage.getViewport({ scale }) });
        await layer.render();
        if (!alive) return;
        const end = document.createElement('div');
        end.className = 'endOfContent';
        host.append(end);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      layer?.cancel();
    };
  }, [bookId, doc, page, scale]);

  // Mirrors pdf.js's viewer: keeps drag-selection from jumping across the page.
  const onPointerDown = () => textHost.current?.classList.add('selecting');
  const onPointerUp = () => textHost.current?.classList.remove('selecting');

  const style = { width, height, '--total-scale-factor': scale } as CSSProperties;
  return (
    <div className={`page enter-${enter}`} data-page={page} style={style} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="page-canvas-host" ref={canvasHost} />
      {!ready && (
        <div className="page-placeholder" aria-hidden="true">
          <span className="sunburst-spinner" />
        </div>
      )}
      <div className="hl-layer" aria-hidden="true">
        {highlights.map((h) =>
          h.rects.map((r, i) => (
            <span
              key={`${h.id}-${i}`}
              className="hl"
              title={h.text}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
            />
          )),
        )}
      </div>
      <div className="textLayer" ref={textHost} />
      {bookmarked && <span className="page-ribbon" aria-label="Bookmarked page" />}
    </div>
  );
}
