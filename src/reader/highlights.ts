import type { NormRect } from '../db/schema';

export interface SelectionInfo {
  page: number;
  text: string;
  rects: NormRect[];
  anchor: DOMRect;
}

/** Reads the current text selection inside a page's text layer as page-relative rects. */
export function readSelection(): SelectionInfo | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (text.length < 2) return null;
  const range = sel.getRangeAt(0);
  const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const pageEl = startEl?.closest<HTMLElement>('.page');
  if (!pageEl || !startEl?.closest('.textLayer')) return null;
  const box = pageEl.getBoundingClientRect();
  const raw = [...range.getClientRects()]
    .filter((r) => r.width > 1 && r.height > 1)
    .filter((r) => r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right)
    .map((r) => ({
      x: (Math.max(r.left, box.left) - box.left) / box.width,
      y: (r.top - box.top) / box.height,
      w: (Math.min(r.right, box.right) - Math.max(r.left, box.left)) / box.width,
      h: r.height / box.height,
    }));
  if (!raw.length) return null;
  return { page: Number(pageEl.dataset.page), text, rects: mergeLines(raw), anchor: range.getBoundingClientRect() };
}

/** Joins rects that sit on the same line and touch, so a highlight is one bar per line. */
function mergeLines(rects: NormRect[]): NormRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: NormRect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - r.y) < last.h * 0.5 && r.x <= last.x + last.w + 0.01) {
      const right = Math.max(last.x + last.w, r.x + r.w);
      last.y = Math.min(last.y, r.y);
      last.h = Math.max(last.h, r.h);
      last.w = right - last.x;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}
