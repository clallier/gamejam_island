import { describe, expect, it } from 'vitest';
import { LOOT_STATE } from '../../src/ecs/constants.ts';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import {
  LOOT_COLLECT_RADIUS,
  LOOT_MAGNET_RADIUS,
  LOOT_PICKUP_DELAY,
} from '../../src/systems/constants.ts';
import { LootCollectionSystem } from '../../src/systems/LootCollectionSystem.ts';
import type { ResourceKey } from '../../src/world/constants.ts';
import { InventoryStore } from '../../src/world/InventoryStore.ts';

describe('LootCollectionSystem', () => {
  it('enforces pickup delay before magnetizing or collecting', () => {
    const ecs = new IslandEcsWorld();
    const system = new LootCollectionSystem();
    const inventory = new InventoryStore({ wood: 0, stone: 0, petals: 0, shards: 0 });
    const eid = ecs.spawnLootEntity('wood', 0.2, 0.5, 0);
    const { LootDrop } = ecs.getComponents();

    const summary: Partial<Record<ResourceKey, number>> = {};
    const early = system.step(ecs, LOOT_PICKUP_DELAY - 0.05, 0, inventory, summary);
    expect(early).toHaveLength(0);
    expect(LootDrop.state[eid]).toBe(LOOT_STATE.FALLING);
    expect(inventory.getAmount('wood')).toBe(0);

    const ready = system.step(ecs, 0.05, 0, inventory, summary);
    expect([...ready]).toEqual([eid]);
    expect(LootDrop.state[eid]).toBe(LOOT_STATE.COLLECTED);
    expect(inventory.getAmount('wood')).toBe(1);
    expect(summary).toEqual({ wood: 1 });
  });

  it('separates collect radius, magnet radius, falling radius, and high-Y filtering', () => {
    const ecs = new IslandEcsWorld();
    const system = new LootCollectionSystem();
    const inventory = new InventoryStore({ wood: 0, stone: 0, petals: 0, shards: 0 });
    const { LootDrop } = ecs.getComponents();

    const collectEid = ecs.spawnLootEntity('wood', LOOT_COLLECT_RADIUS, 2.5, 0);
    const highYEid = ecs.spawnLootEntity('stone', 0.1, 2.51, 0);
    const magnetEid = ecs.spawnLootEntity('petals', LOOT_MAGNET_RADIUS, 0.5, 0);
    const farEid = ecs.spawnLootEntity('shards', LOOT_MAGNET_RADIUS + 0.01, 0.5, 0);

    const summary: Partial<Record<ResourceKey, number>> = {};
    const firstPass = system.step(ecs, LOOT_PICKUP_DELAY, 0, inventory, summary);
    expect([...firstPass]).toEqual([collectEid]);
    expect(LootDrop.state[highYEid]).toBe(LOOT_STATE.MAGNETIZED);
    expect(LootDrop.state[magnetEid]).toBe(LOOT_STATE.MAGNETIZED);
    expect(LootDrop.state[farEid]).toBe(LOOT_STATE.FALLING);

    // Drop high-Y stone below threshold and verify multi-resource summary aggregation & buffer reuse
    ecs.despawnEntity(collectEid);
    ecs.getComponents().Position.y[highYEid] = 1.0;
    ecs.getComponents().Position.x[magnetEid] = 0.5;
    const secondPass = system.step(ecs, 0.016, 0, inventory, summary);
    expect(secondPass).toBe(firstPass);
    expect([...secondPass].sort((a, b) => a - b)).toEqual([highYEid, magnetEid].sort((a, b) => a - b));
    expect(summary).toEqual({ wood: 1, stone: 1, petals: 1 });
  });
});
