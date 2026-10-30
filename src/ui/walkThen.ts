import { bus } from '../bus/events';
import { useStore } from '../store';

let seq = 0;

/**
 * "Clicking a hotspot sends Roxy walking to it first." Emits companion:goto and calls
 * `then` when she arrives — or straight away in Text-only mode, or after a timeout.
 */
export function walkThen(cssX: number, then: () => void, opts: { run?: boolean; admire?: boolean; timeoutMs?: number } = {}): () => void {
  if (useStore.getState().settings.readingMode === 'text') {
    then();
    return () => undefined;
  }
  const tag = `walk-${++seq}`;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    off();
    window.clearTimeout(timer);
    then();
  };
  const off = bus.on('companion:arrived', (e) => e.tag === tag && finish());
  const timer = window.setTimeout(finish, opts.timeoutMs ?? 3000);
  bus.emit('companion:goto', { x: cssX, tag, run: opts.run, admire: opts.admire });
  return () => {
    done = true;
    off();
    window.clearTimeout(timer);
  };
}
