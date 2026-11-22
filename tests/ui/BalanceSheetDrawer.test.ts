// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BalanceSheet } from '../../src/config/BalanceSheet.ts';
import { BALANCE_DEFAULTS } from '../../src/config/constants.ts';
import { BalanceSheetDrawer } from '../../src/ui/BalanceSheetDrawer.ts';

describe('BalanceSheetDrawer', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('toggles visibility, updates BalanceSheet via sliders/inputs, exports CSV, imports overrides, and disposes', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const sheet = new BalanceSheet();
    const drawer = new BalanceSheetDrawer(sheet, host);
    cleanups.push(() => {
      drawer.dispose();
      host.remove();
    });

    const aside = host.querySelector('.balance-drawer') as HTMLElement;
    expect(aside).not.toBeNull();
    expect(drawer.isVisible()).toBe(false);
    expect(aside.hidden).toBe(true);

    // Hotkey F2 & Backquote toggle visibility; keystroke inside input/textarea is ignored
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F2' }));
    expect(drawer.isVisible()).toBe(true);
    expect(aside.hidden).toBe(false);

    const numInputs = host.querySelectorAll('.balance-drawer__num');
    const rangeInputs = host.querySelectorAll('.balance-drawer__range');
    const bowIdx = Array.from(numInputs).findIndex((el) => (el as HTMLInputElement).max === '8');
    const bowRangeInput = numInputs[bowIdx] as HTMLInputElement;
    const bowSlider = rangeInputs[bowIdx] as HTMLInputElement;
    bowRangeInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'F2', bubbles: true }));
    expect(drawer.isVisible()).toBe(true);

    // Clearing the number input while typing does not snap to spec.min; change snaps back to live value
    bowRangeInput.value = '5.2';
    bowRangeInput.dispatchEvent(new Event('input'));
    expect(sheet.get('bowRangeTiles')).toBe(5.2);
    expect(bowSlider.value).toBe('5.2');

    bowRangeInput.value = '';
    bowRangeInput.dispatchEvent(new Event('input'));
    expect(sheet.get('bowRangeTiles')).toBe(5.2);
    expect(bowRangeInput.value).toBe('');

    bowRangeInput.value = '999';
    bowRangeInput.dispatchEvent(new Event('input'));
    expect(sheet.get('bowRangeTiles')).toBe(8.0);
    bowRangeInput.dispatchEvent(new Event('change'));
    expect(bowRangeInput.value).toBe('8');

    bowSlider.value = '4.4';
    bowSlider.dispatchEvent(new Event('input'));
    expect(sheet.get('bowRangeTiles')).toBe(4.4);
    expect(bowRangeInput.value).toBe('4.4');

    // Copy CSV populates textarea and safely absorbs clipboard promise rejection
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const buttons = Array.from(host.querySelectorAll('.balance-drawer__btn')) as HTMLButtonElement[];
    buttons.find((b) => b.textContent === 'Copy CSV')!.click();
    await Promise.resolve();
    const textarea = host.querySelector('.balance-drawer__textarea') as HTMLTextAreaElement;
    expect(textarea.value).toContain('bowRangeTiles');
    textarea.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', bubbles: true }));
    expect(drawer.isVisible()).toBe(true);

    // Paste CSV/JSON applies overrides and invalid paste shows error status without crash
    textarea.value = 'bowDamage,22';
    buttons.find((b) => b.textContent === 'Apply CSV/JSON')!.click();
    expect(sheet.get('bowDamage')).toBe(22);

    buttons.find((b) => b.textContent === 'Import')!.click();
    textarea.value = 'bad_key_only';
    buttons.find((b) => b.textContent === 'Apply CSV/JSON')!.click();
    expect(host.querySelector('.balance-drawer__status')!.textContent).toBe('No valid keys');

    // Reset restores defaults and Backquote/Close hides drawer
    buttons.find((b) => b.textContent === 'Reset')!.click();
    expect(sheet.get('bowRangeTiles')).toBe(BALANCE_DEFAULTS.bowRangeTiles);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
    expect(drawer.isVisible()).toBe(false);
    drawer.setVisible(true);
    expect(drawer.isVisible()).toBe(true);
    buttons.find((b) => b.textContent === '✕')!.click();
    expect(drawer.isVisible()).toBe(false);

    drawer.dispose();
    drawer.dispose();
    expect(host.querySelector('.balance-drawer')).toBeNull();
  });
});
