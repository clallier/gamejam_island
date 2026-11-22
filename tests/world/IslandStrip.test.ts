import { describe, expect, it } from 'vitest';
import { IslandStrip } from '../../src/world/IslandStrip.ts';

describe('IslandStrip', () => {
  it('clamps movement strictly inside road bounds', () => {
    const strip = new IslandStrip();
    expect(strip.clampRoadX(-999)).toBe(-strip.getRoadHalfLimit());
    expect(strip.clampRoadX(999)).toBe(strip.getRoadHalfLimit());
    expect(strip.clampRoadX(12.5)).toBe(12.5);
  });

  it('classifies town, defense, frontier, and portal zones', () => {
    const strip = new IslandStrip();
    expect(strip.classifyZone(0)).toBe('town');
    expect(strip.classifyZone(-22)).toBe('defense');
    expect(strip.classifyZone(38)).toBe('frontier');
    expect(strip.classifyZone(56)).toBe('portal');
  });

  it('locates nearest dollhouse plot within interaction range', () => {
    const strip = new IslandStrip();
    const engineer = strip.findNearestDollhouse(-12.1);
    expect(engineer?.roleId).toBe('engineer');
    expect(strip.findNearestDollhouse(0)).toBeNull();
    expect(strip.getDollhousePlots()).toHaveLength(4);
    expect(strip.getDefenseSlots()).toHaveLength(4);
  });
});
