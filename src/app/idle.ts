import { bus } from '../bus/events';

/** Emits `idle:tick` once a second with the time since the last keyboard, pointer or scroll input. */
export function initIdleTicker(): void {
  let last = performance.now();
  const reset = () => {
    last = performance.now();
  };
  for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) {
    window.addEventListener(type, reset, { passive: true, capture: true });
  }
  document.addEventListener('scroll', reset, { passive: true, capture: true });
  window.setInterval(() => {
    if (document.hidden) return;
    bus.emit('idle:tick', { idleMs: performance.now() - last });
  }, 1000);
}
