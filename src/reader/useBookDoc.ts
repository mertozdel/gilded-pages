import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { db, type BookRow, type ProgressRow } from '../db/schema';
import { getProgress, touchBook } from '../db/queries';
import { openBookDoc } from './pdfLoader';

export interface BookDocState {
  book: BookRow | null;
  doc: PDFDocumentProxy | null;
  /** Progress as stored when the book was opened (where to resume). */
  initialProgress: ProgressRow | null;
  error: string | null;
  loading: boolean;
}

export function useBookDoc(bookId: string): BookDocState {
  const [state, setState] = useState<BookDocState>({ book: null, doc: null, initialProgress: null, error: null, loading: true });

  useEffect(() => {
    let alive = true;
    setState({ book: null, doc: null, initialProgress: null, error: null, loading: true });
    (async () => {
      const book = await db.books.get(bookId);
      if (!book) throw new Error('This book is no longer on the shelf.');
      const [progress, doc] = await Promise.all([getProgress(bookId), openBookDoc(bookId, book.fileBlob)]);
      await touchBook(bookId);
      if (alive) setState({ book, doc, initialProgress: progress, error: null, loading: false });
    })().catch((e: unknown) => {
      if (alive) setState({ book: null, doc: null, initialProgress: null, error: e instanceof Error ? e.message : String(e), loading: false });
    });
    return () => {
      alive = false;
    };
  }, [bookId]);

  return state;
}
