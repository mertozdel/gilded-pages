import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { BookRow, Chapter, OutlineEntry } from '../db/schema';
import { newId } from '../db/queries';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const BASE = import.meta.env.BASE_URL;

/** Local asset URLs (copied by scripts/copy-pdfjs-assets.mjs) so everything works offline. */
const DOC_OPTIONS = {
  cMapUrl: `${BASE}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${BASE}pdfjs/standard_fonts/`,
  wasmUrl: `${BASE}pdfjs/wasm/`,
  iccUrl: `${BASE}pdfjs/iccs/`,
};

// pdf.js 6 tears documents down through their loading task.
const tasks = new WeakMap<PDFDocumentProxy, PDFDocumentLoadingTask>();

export async function openPdfData(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data), ...DOC_OPTIONS });
  const doc = await task.promise;
  tasks.set(doc, task);
  return doc;
}

export function destroyDoc(doc: PDFDocumentProxy): void {
  tasks.get(doc)?.destroy().catch(() => undefined);
}

// ---------- open documents (one per book, at most two kept alive) ----------

const openDocs = new Map<string, Promise<PDFDocumentProxy>>();
const closeListeners = new Set<(bookId: string) => void>();

export function onDocClosed(fn: (bookId: string) => void): () => void {
  closeListeners.add(fn);
  return () => closeListeners.delete(fn);
}

export function openBookDoc(bookId: string, blob: Blob): Promise<PDFDocumentProxy> {
  let p = openDocs.get(bookId);
  if (p) {
    // Refresh recency.
    openDocs.delete(bookId);
    openDocs.set(bookId, p);
    return p;
  }
  p = blob.arrayBuffer().then(openPdfData);
  openDocs.set(bookId, p);
  p.catch(() => openDocs.delete(bookId));
  while (openDocs.size > 2) {
    const oldest = openDocs.keys().next().value as string;
    closeBookDoc(oldest);
  }
  return p;
}

export function closeBookDoc(bookId: string): void {
  const p = openDocs.get(bookId);
  if (!p) return;
  openDocs.delete(bookId);
  closeListeners.forEach((fn) => fn(bookId));
  p.then(destroyDoc).catch(() => undefined);
}

// ---------- text helpers ----------

export function textOf(content: TextContent): string {
  let out = '';
  for (const item of content.items) {
    const t = item as TextItem;
    if (typeof t.str !== 'string') continue;
    out += t.str;
    out += t.hasEOL ? '\n' : ' ';
  }
  return out;
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

// ---------- outline → chapters ----------

type OutlineNode = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number];

async function resolveDestPage(doc: PDFDocumentProxy, dest: OutlineNode['dest']): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit[0] == null) return null;
    const ref = explicit[0];
    if (typeof ref === 'number') return ref + 1;
    return (await doc.getPageIndex(ref)) + 1;
  } catch {
    return null;
  }
}

export async function readOutline(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const outline = await doc.getOutline();
  if (!outline) return [];
  const out: OutlineEntry[] = [];
  const walk = async (items: OutlineNode[], depth: number) => {
    for (const item of items) {
      const page = await resolveDestPage(doc, item.dest);
      if (page != null) out.push({ title: item.title.trim() || `Page ${page}`, page, depth });
      if (item.items?.length) await walk(item.items as OutlineNode[], depth + 1);
    }
  };
  await walk(outline, 0);
  return out;
}

/**
 * Picks the outline level that reads as chapters: the top level, unless the outline is a
 * single wrapper entry (e.g. the book title) with the real chapters one level down.
 */
export function chaptersFromOutline(outline: OutlineEntry[]): Chapter[] {
  if (!outline.length) return [];
  const top = outline.filter((e) => e.depth === 0);
  const level = top.length <= 1 && outline.some((e) => e.depth === 1) ? 1 : 0;
  const seen = new Set<number>();
  return outline
    .filter((e) => e.depth === level)
    .sort((a, b) => a.page - b.page)
    .filter((e) => (seen.has(e.page) ? false : (seen.add(e.page), true)))
    .map((e) => ({ title: e.title, page: e.page }));
}

/** Index of the chapter containing `page`, or -1 before the first chapter. */
export function chapterIndexAt(chapters: Chapter[], page: number): number {
  let idx = -1;
  for (let i = 0; i < chapters.length; i++) if (chapters[i].page <= page) idx = i;
  return idx;
}

// ---------- import ----------

export interface ImportProgress {
  stage: 'opening' | 'cover' | 'pages' | 'saving';
  done: number;
  total: number;
}

async function renderCover(doc: PDFDocumentProxy): Promise<{ blob: Blob | null; color: string }> {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  // Small on purpose: the shelf shows covers as chunky pixel books.
  const viewport = page.getViewport({ scale: 96 / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  const color = spineColorFrom(canvas);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  return { blob, color };
}

/** A deep, saturated version of the cover's average colour. */
function spineColorFrom(canvas: HTMLCanvasElement): string {
  const c = canvas.getContext('2d')!;
  const { data } = c.getImageData(0, 0, canvas.width, canvas.height);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    const lum = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
    if (lum > 235) continue; // skip paper white
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  if (!n) return '#7A2E35';
  r /= n;
  g /= n;
  b /= n;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const sat = max === 0 ? 0 : (max - min) / max;
  return `hsl(${Math.round(h)} ${Math.round(Math.max(0.3, Math.min(0.6, sat + 0.2)) * 100)}% 30%)`;
}

function fallbackTitle(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';
}

/** Reads a PDF into a BookRow: metadata, cover, words per page and chapters. */
export async function importPdf(file: File, onProgress: (p: ImportProgress) => void): Promise<BookRow> {
  onProgress({ stage: 'opening', done: 0, total: 1 });
  const doc = await openPdfData(await file.arrayBuffer());
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    const dcTitle = meta?.metadata?.get('dc:title');
    const dcCreator = meta?.metadata?.get('dc:creator');
    const title = String(info.Title || dcTitle || '').trim() || fallbackTitle(file.name);
    const author = String(info.Author || (Array.isArray(dcCreator) ? dcCreator.join(', ') : dcCreator) || '').trim();

    onProgress({ stage: 'cover', done: 0, total: 1 });
    const cover = await renderCover(doc);

    const wordsPerPage: number[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      wordsPerPage.push(countWords(textOf(content)));
      page.cleanup();
      if (i % 4 === 0 || i === doc.numPages) onProgress({ stage: 'pages', done: i, total: doc.numPages });
    }

    const outline = await readOutline(doc).catch(() => []);
    onProgress({ stage: 'saving', done: 1, total: 1 });
    return {
      id: newId(),
      title,
      author,
      fileName: file.name,
      fileSize: file.size,
      fileBlob: file,
      pageCount: doc.numPages,
      outline,
      chapters: chaptersFromOutline(outline),
      wordsPerPage,
      coverThumb: cover.blob,
      spineColor: cover.color,
      addedAt: Date.now(),
      lastOpenedAt: null,
    };
  } finally {
    destroyDoc(doc);
  }
}
