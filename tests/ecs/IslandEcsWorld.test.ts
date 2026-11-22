import { describe, expect, it } from 'vitest';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';

describe('IslandEcsWorld (bitECS SoA)', () => {
  it('registers interactables, filters inactive entities, and ticks wobbles to removal', () => {
    const ecs = new IslandEcsWorld();
    const houseEid = ecs.registerDollhouse(0, 'house-engineer', -13, 3.2);
    const nodeEid = ecs.registerResourceNode(0, 'node-1', 24, 3.5, 3.2);
    const { Interactable, Wobble } = ecs.getComponents();

    expect(ecs.getEntityId('house-engineer')).toBe(houseEid);
    expect(ecs.getStringId(nodeEid)).toBe('node-1');
    expect(Interactable.active[nodeEid]).toBe(1);

    ecs.setInteractableActive('node-1', false);
    expect(Interactable.active[nodeEid]).toBe(0);

    ecs.triggerWobble('node-1', 0.25);
    expect(ecs.queryEntities([Wobble])).toHaveLength(1);

    const ticks: number[] = [];
    ecs.tickWobbles(0.15, (_id, rem) => ticks.push(rem));
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toBeCloseTo(0.1, 4);

    ecs.tickWobbles(0.2, (_id, rem) => ticks.push(rem));
    expect(ecs.queryEntities([Wobble])).toHaveLength(0);
  });

  it('recycles numeric entity IDs when transient loot drops despawn', () => {
    const ecs = new IslandEcsWorld();
    const { Position, LootDrop } = ecs.getComponents();
    const e1 = ecs.spawnLootEntity('wood', 10, 1, 0);
    const e2 = ecs.spawnLootEntity('stone', 12, 1, 0);
    expect(ecs.queryEntities([Position, LootDrop])).toHaveLength(2);

    ecs.despawnEntity(e1);
    const recycled = ecs.spawnLootEntity('petals', 15, 1, 0);
    expect(recycled).toBe(e1);
    expect(Position.x[recycled]).toBe(15);
    expect(e2).not.toBe(recycled);
  });

  it('fires reactive observeAdded and observeRemoved hooks with populated SoA values and unsubscribe', () => {
    const ecs = new IslandEcsWorld();
    const { Position, LootDrop, Wobble } = ecs.getComponents();
    ecs.registerResourceNode(0, 'node-tree', 20, 3, 3.2);
    const events: string[] = [];

    const unsubAdd = ecs.observeAdded([LootDrop], (eid) => {
      events.push(`loot-add:${eid}:x=${Position.x[eid]}`);
    });
    const unsubRemLoot = ecs.observeRemoved([LootDrop], (eid) => {
      events.push(`loot-rem:${eid}`);
    });
    const unsubRemWobble = ecs.observeRemoved([Wobble], (eid) => {
      events.push(`wobble-rem:${ecs.getStringId(eid)}`);
    });

    const lootEid = ecs.spawnLootEntity('wood', 18, 1.5, 0.25);
    ecs.despawnEntity(lootEid);
    ecs.triggerWobble('node-tree', 0.1);
    ecs.tickWobbles(0.15, () => undefined);

    expect(events).toEqual([
      `loot-add:${lootEid}:x=18`,
      `loot-rem:${lootEid}`,
      'wobble-rem:node-tree',
    ]);

    unsubAdd();
    unsubRemLoot();
    unsubRemWobble();
    const secondEid = ecs.spawnLootEntity('stone', 9, 1, 0);
    ecs.despawnEntity(secondEid);
    expect(events).toHaveLength(3);
  });

  it('registers villagers with IsA(npcPrefab), NpcBond SoA fields, and HousedIn relation', () => {
    const ecs = new IslandEcsWorld();
    const { NpcBond } = ecs.getComponents();
    const houseEid = ecs.registerDollhouse(0, 'house-engineer', -13, 3.2);
    const npcEid = ecs.registerVillager('engineer', 'house-engineer', -13);
    const secondNpcEid = ecs.registerVillager('medic', 'house-missing', -5);

    expect([...ecs.queryVillagers()]).toEqual([npcEid, secondNpcEid]);
    expect(ecs.getVillagerHouseEid(npcEid)).toBe(houseEid);
    expect(ecs.getVillagerHouseEid(secondNpcEid)).toBeUndefined();
    expect(NpcBond.roleCode[npcEid]).toBe(0);
    expect(NpcBond.level[npcEid]).toBe(1);
    expect(NpcBond.xp[npcEid]).toBe(0);
    expect(NpcBond.furnitureStage[npcEid]).toBe(0);
  });
});
