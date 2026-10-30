import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HoldInput } from '../../src/game/latte/hold';

/** Just enough of a window for HoldInput: events, a document that can hide, a clock. */
class FakeWindow extends EventTarget {
  document = Object.assign(new EventTarget(), { hidden: false });
  performance = { now: () => 9999 };
  navigator = {};
  requestAnimationFrame = () => 0;
  cancelAnimationFrame = () => undefined;
}

/** An event with its own timestamp (the input event's, as the browser gives it). */
function ev(type: string, timeStamp: number, props: Record<string, unknown> = {}): Event {
  const e = new Event(type, { cancelable: true });
  Object.defineProperty(e, 'timeStamp', { value: timeStamp });
  return Object.assign(e, props);
}

describe('HoldInput', () => {
  let win: FakeWindow;
  let button: EventTarget & { setPointerCapture?: () => void };
  let log: string[];
  let input: HoldInput;

  beforeEach(() => {
    win = new FakeWindow();
    button = Object.assign(new EventTarget(), { setPointerCapture: () => undefined });
    log = [];
    input = new HoldInput(
      { button: button as unknown as HTMLElement },
      { onPress: (t) => log.push(`press@${t}`), onRelease: (t, cancelled) => log.push(`${cancelled ? 'cancel' : 'release'}@${t}`) },
      ['Space'],
      win as unknown as Window,
    ).attach();
  });
  afterEach(() => input.detach());

  it('presses on Space and releases on its keyup, with the events’ own timestamps', () => {
    win.dispatchEvent(ev('keydown', 100, { code: 'Space' }));
    win.dispatchEvent(ev('keyup', 350, { code: 'Space' }));
    expect(log).toEqual(['press@100', 'release@350']);
  });

  it('ignores key auto-repeat', () => {
    win.dispatchEvent(ev('keydown', 100, { code: 'Space' }));
    win.dispatchEvent(ev('keydown', 130, { code: 'Space', repeat: true }));
    win.dispatchEvent(ev('keydown', 160, { code: 'Space', repeat: true }));
    expect(log).toEqual(['press@100']);
    expect(input.held).toBe(true);
  });

  it('ignores other keys', () => {
    win.dispatchEvent(ev('keydown', 100, { code: 'KeyA' }));
    expect(log).toEqual([]);
  });

  it('counts pointercancel as a release', () => {
    button.dispatchEvent(ev('pointerdown', 100, { pointerId: 1, pointerType: 'touch', button: 0 }));
    win.dispatchEvent(ev('pointercancel', 220, { pointerId: 1 }));
    expect(log).toEqual(['press@100', 'cancel@220']);
  });

  it('releases on pointerup anywhere, only for the pointer that pressed', () => {
    button.dispatchEvent(ev('pointerdown', 100, { pointerId: 7, pointerType: 'touch', button: 0 }));
    win.dispatchEvent(ev('pointerup', 150, { pointerId: 8 }));
    expect(input.held).toBe(true);
    win.dispatchEvent(ev('pointerup', 300, { pointerId: 7 }));
    expect(log).toEqual(['press@100', 'release@300']);
  });

  it('ignores a right-click', () => {
    button.dispatchEvent(ev('pointerdown', 100, { pointerId: 1, pointerType: 'mouse', button: 2 }));
    expect(log).toEqual([]);
  });

  it('counts the window losing focus as a release (at the clock’s time)', () => {
    win.dispatchEvent(ev('keydown', 100, { code: 'Space' }));
    win.dispatchEvent(new Event('blur'));
    expect(log).toEqual(['press@100', 'cancel@9999']);
    // The key's own keyup afterwards changes nothing.
    win.dispatchEvent(ev('keyup', 10_100, { code: 'Space' }));
    expect(log).toEqual(['press@100', 'cancel@9999']);
  });

  it('counts the tab being hidden as a release', () => {
    button.dispatchEvent(ev('pointerdown', 100, { pointerId: 1, pointerType: 'touch', button: 0 }));
    win.document.hidden = true;
    win.document.dispatchEvent(new Event('visibilitychange'));
    expect(log).toEqual(['press@100', 'cancel@9999']);
  });

  it('is one action: a second source while held does not press again', () => {
    button.dispatchEvent(ev('pointerdown', 100, { pointerId: 1, pointerType: 'touch', button: 0 }));
    win.dispatchEvent(ev('keydown', 120, { code: 'Space' }));
    expect(log).toEqual(['press@100']);
  });

  it('stops listening once detached', () => {
    input.detach();
    win.dispatchEvent(ev('keydown', 100, { code: 'Space' }));
    expect(log).toEqual([]);
  });
});
