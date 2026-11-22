import { describe, expect, it } from 'vitest';
import {
  MAX_CORRUPTION_HALF_WIDTH,
  MIN_CORRUPTION_HALF_WIDTH,
} from '../../src/world/constants.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';

describe('CorruptionField', () => {
  it('pushes and encroaches borders within island clamp limits', () => {
    const field = new CorruptionField();
    expect(field.pushBorder('left', 100)).toBe(-MAX_CORRUPTION_HALF_WIDTH);
    expect(field.encroachBorder('right', 100)).toBe(MIN_CORRUPTION_HALF_WIDTH);
  });

  it('computes corruption membership and smooth edge intensity', () => {
    const field = new CorruptionField(-34, 34);
    expect(field.isCorrupted(0)).toBe(false);
    expect(field.isCorrupted(-36)).toBe(true);
    expect(field.getCorruptionIntensity(0)).toBe(0);
    expect(field.getCorruptionIntensity(-34)).toBeCloseTo(0.5, 5);
    expect(field.getCorruptionIntensity(-45)).toBe(1);
  });

  it('scrubs pollution mounds once and increases island purity ratio', () => {
    const field = new CorruptionField();
    const initialPurity = field.getPurityRatio();
    expect(field.scrubMound('mound-left-inner')).toBe(true);
    expect(field.scrubMound('mound-left-inner')).toBe(false);
    expect(field.scrubMound('missing-id')).toBe(false);
    field.pushBorder('right', 6);
    expect(field.getPurityRatio()).toBeGreaterThan(initialPurity);
  });
});
