import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pageText } from './pageCache';

export interface SearchHit {
  page: number;
  snippet: string;
  matchStart: number;
  matchLength: number;
}

const MAX_HITS = 300;

/** Case-insensitive search through every page's text, yielding to the UI between pages. */
export async function searchBook(
  bookId: string,
  doc: PDFDocumentProxy,
  query: string,
  onProgress: (page: number, hits: SearchHit[]) => void,
  signal: AbortSignal,
): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  if (q.length < 2) return hits;
  for (let page = 1; page <= doc.numPages; page++) {
    if (signal.aborted) break;
    const text = (await pageText(bookId, doc, page)).replace(/\s+/g, ' ');
    const lower = text.toLowerCase();
    let at = lower.indexOf(q);
    while (at !== -1 && hits.length < MAX_HITS) {
      const start = Math.max(0, at - 40);
      const end = Math.min(text.length, at + q.length + 40);
      hits.push({
        page,
        snippet: (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''),
        matchStart: at - start + (start > 0 ? 1 : 0),
        matchLength: q.length,
      });
      at = lower.indexOf(q, at + q.length);
    }
    if (page % 10 === 0 || page === doc.numPages) {
      onProgress(page, [...hits]);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}
