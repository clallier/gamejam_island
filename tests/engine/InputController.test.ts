// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { InputController } from '../../src/engine/InputController.ts';

describe('InputController', () => {
  const controllers: InputController[] = [];

  afterEach(() => {
    while (controllers.length > 0) controllers.pop()?.dispose();
  });

  it('tracks keyboard horizontal axis, opposing key cancellation, and one-shot taps', () => {
    const input = new InputController();
    controllers.push(input);
    input.attachKeyboard(window);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    const first = input.consumeSnapshot();
    expect(first.moveX).toBe(1);
    expect(first.jumpPressed).toBe(true);
    expect(first.plantPressed).toBe(true);

    const second = input.consumeSnapshot();
    expect(second.moveX).toBe(1);
    expect(second.jumpPressed).toBe(false);
    expect(second.plantPressed).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    expect(input.consumeSnapshot().moveX).toBe(0);

    window.dispatchEvent(new Event('blur'));
    expect(input.consumeSnapshot().moveX).toBe(0);
  });

  it('supports UI-agnostic hold states and tap triggers from Babylon GUI', () => {
    const input = new InputController();
    controllers.push(input);

    input.setHoldState('left', true);
    input.triggerTap('toss');
    input.triggerTap('interact');
    input.triggerTap('plant');
    const snap = input.consumeSnapshot();
    expect(snap.moveX).toBe(-1);
    expect(snap.tossPressed).toBe(true);
    expect(snap.interactPressed).toBe(true);
    expect(snap.plantPressed).toBe(true);
    expect(snap.jumpPressed).toBe(false);

    input.setHoldState('left', false);
    const next = input.consumeSnapshot();
    expect(next.moveX).toBe(0);
    expect(next.tossPressed).toBe(false);
  });
});
