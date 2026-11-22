import { describe, expect, it } from 'vitest';
import { TimeCycle } from '../../src/world/TimeCycle.ts';

describe('TimeCycle', () => {
  it('starts in day phase with low nightFactor and advances across phases', () => {
    const clock = new TimeCycle(0.22, 100);
    const start = clock.getSnapshot();
    expect(start.phase).toBe('day');
    expect(start.nightFactor).toBe(0);
    expect(start.dayNumber).toBe(1);

    const dusk = clock.advance(32);
    expect(dusk.phase).toBe('dusk');
    expect(dusk.nightFactor).toBeGreaterThan(0);
    expect(dusk.nightFactor).toBeLessThan(1);

    const night = clock.advance(20);
    expect(night.phase).toBe('night');
    expect(night.nightFactor).toBe(1);
  });

  it('increments dayNumber when wrapping past full cycle', () => {
    const clock = new TimeCycle(0.9, 100);
    const next = clock.advance(15);
    expect(next.dayNumber).toBe(2);
    expect(next.phase).toBe('day');
  });

  it('jumps directly to target phase midpoints', () => {
    const clock = new TimeCycle();
    expect(clock.jumpToPhase('night').nightFactor).toBe(1);
    expect(clock.jumpToPhase('day').nightFactor).toBe(0);
    expect(clock.jumpToPhase('dawn').phase).toBe('dawn');
  });
});
