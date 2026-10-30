import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { DecoPanel } from './DecoPanel';

const SHORTCUTS: [string, string][] = [
  ['→  Space  PgDn', 'Next page'],
  ['←  Shift+Space  PgUp', 'Previous page'],
  ['↑  ↓', 'Scroll a zoomed page'],
  ['Home  End', 'First / last page'],
  ['G', 'Go to page number'],
  ['C', 'Chapters'],
  ['B', 'Bookmark this page'],
  ['K', 'Bookmarks list'],
  ['H', 'Make a Quote Pearl from selected text'],
  ['P', 'Quote Pearls list'],
  ['/  Ctrl+F', 'Search the book'],
  ['+  −  0', 'Zoom in / out / reset'],
  ['N', 'Night mode (Speakeasy)'],
  ['M', 'Reading mode: Full Gala → Calm → Text only'],
  ['Esc', 'Close a panel, or close the book (back to the café)'],
  ['U', 'Café: add a PDF'],
  ['1–6', 'Morning Rush: serve the matching drink'],
  ['Tab', 'Move between buttons and books (arrows move along the shelf)'],
  ['?', 'This help'],
];

export function HelpOverlay() {
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <DecoPanel title="Keyboard shortcuts" unfold className="help-panel">
          <dl className="shortcut-list">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <button ref={closeRef} className="deco-btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </DecoPanel>
      </div>
    </div>
  );
}
