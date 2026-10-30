import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';
import { onDocClosed, textOf } from './pdfLoader';

/**
 * Rendered pages are kept as ready canvases (small LRU) and neighbours are rendered
 * ahead of time, so a page turn only has to move an existing canvas into the DOM.
 */
export interface RenderedPage {
  canvas: HTMLCanvasElement;
  viewport: PageViewport;
}

const MAX_RENDERS = 8;
const pending = new Map<string, Promise<RenderedPage>>();
const settled = new Map<string, RenderedPage>();
const sizes = new Map<string, { width: number; height: number }>();
const texts = new Map<string, Promise<TextContent>>();

const dpr = () => Math.min(window.devicePixelRatio || 1, 3);
const renderKey = (bookId: string, page: number, scale: number) => `${bookId}:${page}@${scale.toFixed(3)}x${dpr()}`;

onDocClosed((bookId) => {
  for (const map of [pending, settled, sizes, texts] as Map<string, unknown>[]) {
    for (const k of [...map.keys()]) if (k.startsWith(`${bookId}:`)) map.delete(k);
  }
});

function touch<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
}

function evict(): void {
  while (settled.size > MAX_RENDERS) settled.delete(settled.keys().next().value as string);
  while (pending.size > MAX_RENDERS * 2) pending.delete(pending.keys().next().value as string);
}

/** Size of a page at scale 1, in PDF points. */
export async function pageSize(bookId: string, doc: PDFDocumentProxy, page: number): Promise<{ width: number; height: number }> {
  const key = `${bookId}:${page}`;
  const hit = sizes.get(key);
  if (hit) return hit;
  const p = await doc.getPage(page);
  const vp = p.getViewport({ scale: 1 });
  const size = { width: vp.width, height: vp.height };
  sizes.set(key, size);
  return size;
}

export function peekRender(bookId: string, page: number, scale: number): RenderedPage | null {
  const key = renderKey(bookId, page, scale);
  const hit = settled.get(key);
  if (hit) touch(settled, key, hit);
  return hit ?? null;
}

export function renderPage(bookId: string, doc: PDFDocumentProxy, page: number, scale: number): Promise<RenderedPage> {
  const key = renderKey(bookId, page, scale);
  const done = settled.get(key);
  if (done) return Promise.resolve(done);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const ratio = dpr();
  const p = (async () => {
    const pdfPage = await doc.getPage(page);
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.className = 'page-canvas';
    await pdfPage.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
    const result = { canvas, viewport };
    settled.set(key, result);
    evict();
    return result;
  })();
  pending.set(key, p);
  p.finally(() => pending.delete(key)).catch(() => undefined);
  return p;
}

/** Warms the cache for pages the reader is likely to see next. */
export function prefetch(bookId: string, doc: PDFDocumentProxy, pages: number[], scale: number): void {
  const run = () => {
    for (const n of pages) if (n >= 1 && n <= doc.numPages) renderPage(bookId, doc, n, scale).catch(() => undefined);
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 300 });
  else setTimeout(run, 60);
}

export function textContent(bookId: string, doc: PDFDocumentProxy, page: number): Promise<TextContent> {
  const key = `${bookId}:${page}`;
  let p = texts.get(key);
  if (!p) {
    p = doc.getPage(page).then((pg) => pg.getTextContent());
    texts.set(key, p);
    p.catch(() => texts.delete(key));
  }
  return p;
}

export async function pageText(bookId: string, doc: PDFDocumentProxy, page: number): Promise<string> {
  return textOf(await textContent(bookId, doc, page));
}
