import { describe, expect, it, vi } from 'vitest';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import { SimulationPipeline } from '../../src/ecs/SimulationPipeline.ts';
import type { LootDropSystem } from '../../src/entities/LootDropSystem.ts';
import type { IslandEnvironment } from '../../src/scene/IslandEnvironment.ts';
import { InteractionResolver } from '../../src/systems/InteractionResolver.ts';
import { DefenseStructureSystem } from '../../src/systems/DefenseStructureSystem.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
import { InventoryStore } from '../../src/world/InventoryStore.ts';
import { IslandStrip } from '../../src/world/IslandStrip.ts';
import { ResourceNodeCatalog } from '../../src/world/ResourceNodeCatalog.ts';

describe('SimulationPipeline (bitECS pipe)', () => {
  it('executes loot -> target -> environment in order and reuses the context object across frames', () => {
    const ecs = new IslandEcsWorld();
    const strip = new IslandStrip();
    const resources = new ResourceNodeCatalog();
    const corruption = new CorruptionField();
    const inventory = new InventoryStore();
    const resolver = new InteractionResolver();
    const callOrder: string[] = [];

    strip.getDollhousePlots().forEach((plot, idx) =>
      ecs.registerDollhouse(idx, `house-${plot.roleId}`, plot.x, 3.2),
    );

    const resolveSpy = vi.spyOn(resolver, 'resolve').mockImplementation((...args) => {
      callOrder.push('resolve');
      return InteractionResolver.prototype.resolve.apply(resolver, args);
    });

    const lootDrops = {
      update: vi.fn(() => {
        callOrder.push('loot');
        return { wood: 2 };
      }),
    } as unknown as LootDropSystem;

    const environment = {
      update: vi.fn(() => {
        callOrder.push('env');
      }),
    } as unknown as IslandEnvironment;

    const defenses = new DefenseStructureSystem(ecs);
    const pipeline = new SimulationPipeline({
      ecs,
      strip,
      resources,
      corruption,
      inventory,
      resolver,
      lootDrops,
      environment,
      defenses,
    });

    const firstPlotX = strip.getDollhousePlots()[0]!.x;
    const frame1 = pipeline.run(0.016, 1.5, firstPlotX);
    expect(callOrder).toEqual(['loot', 'resolve', 'env']);
    expect(frame1.collectedLoot).toEqual({ wood: 2 });
    expect(frame1.target?.type).toBe('dollhouse');
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    const frame2 = pipeline.run(0.016, 1.516, 0);
    expect(frame2).toBe(frame1);
    expect(frame2.target).toBeNull();
    expect(environment.update).toHaveBeenLastCalledWith(1.516, 0.016, 0, corruption);
  });
});
