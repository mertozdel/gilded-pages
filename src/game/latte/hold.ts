/**
 * The latte art's one action, Hold: a big round button, Space, gamepad A, or touch-and-hold on
 * the cup. Press and release carry the input events' own timestamps (the performance.now()
 * clock), never frame counts. pointercancel, the window losing focus and the tab being hidden
 * all count as a release; key auto-repeat is ignored.
 */
export interface HoldHandlers {
  onPress: (t: number) => void;
  /** `cancelled`: released by blur, visibility or pointercancel rather than by letting go. */
  onRelease: (t: number, cancelled: boolean) => void;
}

export interface HoldTargets {
  /** The round Hold button. */
  button?: HTMLElement | null;
  /** The cup (touch-and-hold). */
  surface?: HTMLElement | null;
}

export class HoldInput {
  private down = false;
  private pointer: number | null = null;
  private key = false;
  private pad = false;
  private raf = 0;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly targets: HoldTargets,
    private readonly handlers: HoldHandlers,
    private readonly keys: readonly string[] = ['Space'],
    private readonly win: Window = window,
  ) {}

  get held(): boolean {
    return this.down;
  }

  attach(): this {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      this.offs.push(() => t.removeEventListener(type, fn, opts));
    };
    for (const el of [this.targets.button, this.targets.surface]) {
      if (!el) continue;
      on(el, 'pointerdown', (e) => {
        const p = e as PointerEvent;
        if (p.pointerType === 'mouse' && p.button !== 0) return;
        p.preventDefault();
        this.pointer = p.pointerId;
        try {
          el.setPointerCapture?.(p.pointerId);
        } catch {
          // a synthetic pointer can't be captured
        }
        this.press(p.timeStamp);
      });
    }
    on(this.win, 'pointerup', (e) => {
      const p = e as PointerEvent;
      if (this.pointer === null || p.pointerId !== this.pointer) return;
      this.pointer = null;
      this.release(p.timeStamp, false);
    });
    on(this.win, 'pointercancel', (e) => {
      const p = e as PointerEvent;
      if (this.pointer === null || p.pointerId !== this.pointer) return;
      this.pointer = null;
      this.release(p.timeStamp, true);
    });
    on(
      this.win,
      'keydown',
      (e) => {
        const k = e as KeyboardEvent;
        if (!this.keys.includes(k.code)) return;
        k.preventDefault();
        if (k.repeat || this.key) return;
        this.key = true;
        this.press(k.timeStamp);
      },
      { capture: true },
    );
    on(
      this.win,
      'keyup',
      (e) => {
        const k = e as KeyboardEvent;
        if (!this.keys.includes(k.code) || !this.key) return;
        k.preventDefault();
        this.key = false;
        this.release(k.timeStamp, false);
      },
      { capture: true },
    );
    on(this.win, 'blur', () => this.cancelAll());
    on(this.win.document, 'visibilitychange', () => this.win.document.hidden && this.cancelAll());
    if (typeof this.win.navigator?.getGamepads === 'function') {
      const poll = () => {
        const pads = this.win.navigator.getGamepads?.() ?? [];
        const a = pads.some((g) => g?.buttons[0]?.pressed);
        if (a && !this.pad) {
          this.pad = true;
          this.press(this.win.performance.now());
        } else if (!a && this.pad) {
          this.pad = false;
          this.release(this.win.performance.now(), false);
        }
        this.raf = this.win.requestAnimationFrame(poll);
      };
      this.raf = this.win.requestAnimationFrame(poll);
    }
    return this;
  }

  private cancelAll(): void {
    this.pointer = null;
    this.key = false;
    this.pad = false;
    this.release(this.win.performance.now(), true);
  }

  private press(t: number): void {
    if (this.down) return;
    this.down = true;
    this.handlers.onPress(t);
  }

  private release(t: number, cancelled: boolean): void {
    if (!this.down) return;
    this.down = false;
    this.handlers.onRelease(t, cancelled);
  }

  detach(): void {
    this.win.cancelAnimationFrame?.(this.raf);
    this.offs.splice(0).forEach((off) => off());
    this.down = false;
  }
}
