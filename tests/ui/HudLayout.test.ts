import { describe, expect, it } from 'vitest';
import { HudLayout } from '../../src/ui/HudLayout.ts';

describe('HudLayout', () => {
  it('fits bottom directional pads and three action buttons on a single portrait row', () => {
    const layout = new HudLayout();
    for (const width of [320, 390]) {
      const m = layout.compute(width, 844);
      expect(m.isCompact).toBe(true);
      expect(m.showDesktopPrompt).toBe(false);
      expect(m.padButtonSize).toBeGreaterThanOrEqual(48);
      expect(m.actionButtonWidth).toBeGreaterThanOrEqual(46);
      expect(m.actionButtonHeight).toBeGreaterThanOrEqual(48);
      const totalDockWidth =
        m.edgePadX * 2 +
        m.padButtonSize * 2 +
        m.dockGap +
        m.actionButtonWidth * 3 +
        m.dockGap * 2;
      expect(totalDockWidth).toBeLessThan(width - 10);
      expect(m.cardWidth).toBeLessThanOrEqual(width - m.edgePadX * 2);
      expect(m.cardAlignRight).toBe(false);
    }
  });

  it('places desktop prompt and aligns dollhouse card bottom-right', () => {
    const m = new HudLayout().compute(1280, 800);
    expect(m.isCompact).toBe(false);
    expect(m.showDesktopPrompt).toBe(true);
    expect(m.cardAlignRight).toBe(true);
    expect(m.padButtonSize).toBe(52);
    expect(m.cardBottomOffset).toBeGreaterThan(m.actionButtonHeight);
  });

  it('rejects non-positive dimensions', () => {
    const layout = new HudLayout();
    expect(() => layout.compute(0, 800)).toThrow(RangeError);
    expect(() => layout.compute(390, -10)).toThrow(RangeError);
  });
});
