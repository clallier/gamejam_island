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

  it('ignores repeated keydown events, handles keyup and alternate bindings (AZERTY/arrows/action keys)', () => {
    const input = new InputController();
    controllers.push(input);
    input.attachKeyboard(window);

    // Non-repeat triggers jump, repeat does not re-queue after consume
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(input.consumeSnapshot().jumpPressed).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', repeat: true }));
    expect(input.consumeSnapshot().jumpPressed).toBe(false);

    // KeyQ / ArrowLeft -> -1, keyup clears, ArrowRight -> +1
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
    expect(input.consumeSnapshot().moveX).toBe(-1);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(input.consumeSnapshot().moveX).toBe(1);

    // KeyF / Enter -> interact, KeyJ / ShiftLeft -> toss, KeyZ -> jump
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
    const snap = input.consumeSnapshot();
    expect(snap.interactPressed).toBe(true);
    expect(snap.tossPressed).toBe(true);
    expect(snap.jumpPressed).toBe(true);

    // Keydowns inside form inputs / textareas do not trigger gameplay movement or actions
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
    const inputEl = document.createElement('input');
    const textareaEl = document.createElement('textarea');
    document.body.append(inputEl, textareaEl);
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
    textareaEl.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    const blocked = input.consumeSnapshot();
    expect(blocked.moveX).toBe(0);
    expect(blocked.jumpPressed).toBe(false);
    inputEl.remove();
    textareaEl.remove();
  });
});
