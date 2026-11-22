import { describe, expect, it } from 'vitest';
import { InventoryStore } from '../../src/world/InventoryStore.ts';

describe('InventoryStore', () => {
  it('adds resources and prevents spending when balance is insufficient', () => {
    const store = new InventoryStore({ wood: 2, stone: 1, petals: 1, shards: 0 });
    expect(store.add('wood', 3)).toBe(5);
    expect(store.add('wood', -5)).toBe(5);

    expect(store.canAfford({ petals: 2 })).toBe(false);
    expect(store.spend({ petals: 2 })).toBe(false);
    expect(store.getAmount('petals')).toBe(1);

    expect(store.spend({ wood: 3, stone: 1 })).toBe(true);
    expect(store.getSnapshot()).toEqual({ wood: 2, stone: 0, petals: 1, shards: 0 });
  });
});
