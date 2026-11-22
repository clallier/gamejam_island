import { describe, expect, it } from 'vitest';
import { ResourceNodeCatalog } from '../../src/world/ResourceNodeCatalog.ts';

describe('ResourceNodeCatalog', () => {
  it('hits multi-hit trees and single-hit wildflowers until depleted, then regrows at dawn', () => {
    const catalog = new ResourceNodeCatalog([
      { id: 'tree-1', kind: 'tree_pine', x: 25, z: 3.5, scale: 1 },
      { id: 'flower-1', kind: 'wildflower', x: 20, z: 2.3, scale: 1 },
    ]);

    expect(catalog.findNearestHarvestable(20.5, 3)?.id).toBe('flower-1');
    const flowerHit = catalog.hitNode('flower-1');
    expect(flowerHit?.depleted).toBe(true);
    expect(flowerHit?.dropResource).toBe('petals');
    expect(flowerHit?.dropAmount).toBe(2);
    expect(catalog.hitNode('flower-1')).toBeNull();

    const hit1 = catalog.hitNode('tree-1');
    const hit2 = catalog.hitNode('tree-1');
    const hit3 = catalog.hitNode('tree-1');
    expect(hit1?.depleted).toBe(false);
    expect(hit2?.depleted).toBe(false);
    expect(hit3?.depleted).toBe(true);
    expect(hit3?.dropResource).toBe('wood');
    expect(catalog.findNearestHarvestable(25, 3)).toBeNull();

    expect(catalog.regrowAll()).toBe(2);
    expect(catalog.findNearestHarvestable(25, 3)?.id).toBe('tree-1');
  });
});
