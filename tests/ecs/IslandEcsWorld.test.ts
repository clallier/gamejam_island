import { describe, expect, it, vi } from 'vitest';
import { ENEMY_KIND } from '../../src/ecs/constants.ts';
import { type EcsGuardError, IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import { DefenseStructureSystem } from '../../src/systems/DefenseStructureSystem.ts';
import { LOOT_MAX_ACTIVE } from '../../src/systems/constants.ts';
import { WaveCombatSystem } from '../../src/systems/WaveCombatSystem.ts';
import { DEFENSE_SLOT_XS, DOLLHOUSE_PLOTS } from '../../src/world/constants.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
import { InventoryStore } from '../../src/world/InventoryStore.ts';

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

  it('registers defense slots, spawns IsA enemyPrefab entities, and supports turret targeting', () => {
    const ecs = new IslandEcsWorld();
    const { Position, Enemy, Defense } = ecs.getComponents();
    const slotEid = ecs.registerDefenseSlot(0, 'slot-0', -26, 3.2);
    const enemyEid = ecs.spawnEnemyEntity(1, -54, -1, 56, 1.9);

    expect([...ecs.queryDefenses()]).toEqual([slotEid]);
    expect([...ecs.queryEnemies()]).toEqual([enemyEid]);
    expect(Defense.slotIndex[slotEid]).toBe(0);
    expect(Position.x[enemyEid]).toBe(-54);
    expect(Enemy.hp[enemyEid]).toBe(56);
    expect(() => ecs.setTurretTarget(slotEid, enemyEid)).not.toThrow();
  });

  it('guards missing or despawned entities without throwing while logging diagnostic errors', () => {
    const errors: EcsGuardError[] = [];
    const ecs = new IslandEcsWorld((err) => errors.push(err));
    const slotEid = ecs.registerDefenseSlot(0, 'slot-0', -26, 3.2);
    const enemyEid = ecs.spawnEnemyEntity(0, -40, -1, 24, 3.2);
    expect(ecs.isEntityAlive(enemyEid)).toBe(true);

    ecs.despawnEntity(enemyEid);
    expect(ecs.isEntityAlive(enemyEid)).toBe(false);

    expect(() => ecs.setTurretTarget(slotEid, enemyEid)).not.toThrow();
    expect(() => ecs.despawnEntity(enemyEid)).not.toThrow();

    const nodeEid = ecs.registerResourceNode(0, 'node-wobble', 22, 3, 3.2);
    ecs.triggerWobble('node-wobble', 0.1);
    ecs.tickWobbles(0.15, () => {
      if (ecs.isEntityAlive(nodeEid)) ecs.despawnEntity(nodeEid);
    });

    expect(errors.map((e) => e.operation)).toEqual([
      'setTurretTarget.enemy',
      'despawnEntity',
      'tickWobbles.removeComponent',
    ]);
    expect(errors[0]?.eid).toBe(enemyEid);
    expect(errors[0]?.targetEid).toBe(slotEid);
    expect(errors[2]?.eid).toBe(nodeEid);
  });

  it('stress-tests entity ID recycling across multi-wave loot bursts and exclusive turret targeting with zero guard errors', () => {
    const errors: EcsGuardError[] = [];
    const ecs = new IslandEcsWorld((err) => errors.push(err));
    DEFENSE_SLOT_XS.forEach((x, idx) => ecs.registerDefenseSlot(idx, `slot-${idx}`, x, 3.2));
    const defenses = new DefenseStructureSystem(ecs, DEFENSE_SLOT_XS);
    const combat = new WaveCombatSystem(ecs);
    const corruption = new CorruptionField();
    const inventory = new InventoryStore({ wood: 50, stone: 50, petals: 50, shards: 50 });

    defenses.interactSlot(0, inventory);
    defenses.interactSlot(1, inventory);
    defenses.interactSlot(2, inventory);
    defenses.interactSlot(3, inventory);

    const slot0Eid = ecs.getEntityId('slot-0')!;
    const eA = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, -25, -1, 24, 3.2);
    const eB = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, -23, -1, 24, 3.2);
    ecs.setTurretTarget(slot0Eid, eA);
    expect(ecs.getTurretTarget(slot0Eid)).toBe(eA);
    ecs.setTurretTarget(slot0Eid, eB);
    expect(ecs.getTurretTarget(slot0Eid)).toBe(eB);
    ecs.despawnEntity(eA);
    ecs.despawnEntity(eB);
    expect(ecs.getTurretTarget(slot0Eid)).toBeUndefined();

    // Simulate multi-wave combat + loot bursts beyond LOOT_MAX_ACTIVE + simultaneous kills + defense destruction + reset
    const activeLoot: number[] = [];
    for (let wave = 1; wave <= 4; wave++) {
      for (let i = 0; i < LOOT_MAX_ACTIVE + 12; i++) {
        if (activeLoot.length >= LOOT_MAX_ACTIVE) {
          ecs.despawnEntity(activeLoot.shift()!);
        }
        activeLoot.push(ecs.spawnLootEntity('shards', -20 + i, 1, 0));
      }
      // Spawn two weak enemies near slot-1 so turret/defender can slay them simultaneously
      ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, -20.5, -1, 10, 3.2);
      ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, -19.5, -1, 10, 3.2);
      // Spawn a brute on slot-3 to test defense destruction mid-wave
      ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, 26, 1, 200, 1.9);
      for (let f = 0; f < 40; f++) {
        combat.step(0.2, 'night', wave, 1.25, 6, corruption);
      }
      combat.step(0.1, 'dawn', wave + 1, 1, 0, corruption);
    }

    while (activeLoot.length > 0) ecs.despawnEntity(activeLoot.pop()!);
    combat.reset();
    defenses.resetAll();

    expect(errors).toEqual([]);
    expect(combat.getActiveEnemyCount()).toBe(0);
    expect(ecs.queryEntities([ecs.getComponents().LootDrop])).toHaveLength(0);
  });

  it('tracks wobble observer lifecycles across nodes, mounds, planted blooms, and dollhouses and cleans duplicate registrations', () => {
    const errors: EcsGuardError[] = [];
    const ecs = new IslandEcsWorld((err) => errors.push(err));
    const { Wobble } = ecs.getComponents();
    const removedIds: string[] = [];
    const unsub = ecs.observeRemoved([Wobble], (eid) => {
      const id = ecs.getStringId(eid);
      if (id) removedIds.push(id);
    });

    ecs.registerDollhouse(0, `house-${DOLLHOUSE_PLOTS[0]!.roleId}`, DOLLHOUSE_PLOTS[0]!.x, 3.2);
    ecs.registerResourceNode(0, 'node-test', 22, 3.5, 3.2);
    ecs.registerPollutionMound(0, 'mound-test', 37, 3.2);
    ecs.registerPlantedBloom('bloom-1', 25, 2.15);

    ecs.triggerWobble('house-engineer', 0.2);
    ecs.triggerWobble('node-test', 0.1);
    ecs.triggerWobble('mound-test', 0.2);
    ecs.triggerWobble('bloom-1', 0.1);
    expect(ecs.queryEntities([Wobble])).toHaveLength(4);

    ecs.tickWobbles(0.12, () => undefined);
    expect(ecs.queryEntities([Wobble])).toHaveLength(2);
    expect(removedIds.sort()).toEqual(['bloom-1', 'node-test']);

    ecs.tickWobbles(0.15, () => undefined);
    expect(ecs.queryEntities([Wobble])).toHaveLength(0);
    expect(removedIds.sort()).toEqual(['bloom-1', 'house-engineer', 'mound-test', 'node-test']);

    // Re-registering same stringId despawns the previous entity cleanly without guard errors
    const firstEid = ecs.getEntityId('bloom-1')!;
    const secondEid = ecs.registerPlantedBloom('bloom-1', 28, 2.15);
    expect(secondEid).toBe(firstEid);
    expect(ecs.getEntityId('bloom-1')).toBe(secondEid);
    expect(errors).toEqual([]);
    unsub();

    // Unknown stringId helpers and default error logger fallback
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const defaultEcs = new IslandEcsWorld();
    defaultEcs.setInteractableActive('unknown-id', false);
    defaultEcs.triggerWobble('unknown-id', 0.2);
    expect(defaultEcs.getTurretTarget(999)).toBeUndefined();
    defaultEcs.despawnEntity(999);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
