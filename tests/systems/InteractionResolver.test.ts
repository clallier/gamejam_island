import { describe, expect, it } from 'vitest';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import { INTERACT_RANGE } from '../../src/systems/constants.ts';
import { DefenseStructureSystem } from '../../src/systems/DefenseStructureSystem.ts';
import { InteractionResolver } from '../../src/systems/InteractionResolver.ts';
import { DEFENSE_SLOT_XS } from '../../src/world/constants.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
import { InventoryStore } from '../../src/world/InventoryStore.ts';
import { IslandStrip } from '../../src/world/IslandStrip.ts';
import { ResourceNodeCatalog } from '../../src/world/ResourceNodeCatalog.ts';

describe('InteractionResolver (bitECS SoA)', () => {
  it('prioritizes dollhouses, then active pollution mounds, then harvestable nodes', () => {
    const ecs = new IslandEcsWorld();
    const resolver = new InteractionResolver();
    const strip = new IslandStrip();
    const nodes = new ResourceNodeCatalog([
      { id: 'tree-near-house', kind: 'tree_pine', x: 13.5, z: 3.5, scale: 1 },
      { id: 'flower-right', kind: 'wildflower', x: 24, z: 2.3, scale: 1 },
      { id: 'boulder-near-mound', kind: 'boulder', x: 37.5, z: 3.2, scale: 1 },
    ]);
    const corruption = new CorruptionField();

    strip.getDollhousePlots().forEach((p, idx) =>
      ecs.registerDollhouse(idx, `house-${p.roleId}`, p.x, INTERACT_RANGE),
    );
    nodes.getAllNodes().forEach((n, idx) =>
      ecs.registerResourceNode(idx, n.id, n.x, n.z, INTERACT_RANGE),
    );
    corruption.getMounds().forEach((m, idx) =>
      ecs.registerPollutionMound(idx, m.id, m.x, INTERACT_RANGE),
    );

    const houseTarget = resolver.resolve(13, ecs, strip, nodes, corruption);
    expect(houseTarget?.type).toBe('dollhouse');
    if (houseTarget?.type === 'dollhouse') {
      expect(houseTarget.label).toBe('Milo');
    }

    const flowerTarget = resolver.resolve(24, ecs, strip, nodes, corruption);
    expect(flowerTarget?.type).toBe('resource');
    expect(flowerTarget?.label).toBe('Forage');

    const moundTarget = resolver.resolve(37, ecs, strip, nodes, corruption);
    expect(moundTarget?.type).toBe('mound');
    expect(moundTarget?.label).toBe('Scrub');

    corruption.scrubMound('mound-right-inner');
    ecs.setInteractableActive('mound-right-inner', false);
    const fallbackBoulder = resolver.resolve(37, ecs, strip, nodes, corruption);
    expect(fallbackBoulder?.type).toBe('resource');
    expect(fallbackBoulder?.label).toBe('Mine');
  });

  it('enforces priority hierarchy, exact boundary distances, tie-breaking, defense prompts, and stale/unregistered filtering', () => {
    const ecs = new IslandEcsWorld();
    const resolver = new InteractionResolver();
    const strip = new IslandStrip();
    const nodes = new ResourceNodeCatalog([
      { id: 'tree-at-slot', kind: 'tree_pine', x: DEFENSE_SLOT_XS[0]!, z: 3.2, scale: 1 },
      { id: 'boulder-left', kind: 'boulder', x: 60, z: 3.2, scale: 1 },
      { id: 'flower-right', kind: 'wildflower', x: 61, z: 3.2, scale: 1 },
    ]);
    const corruption = new CorruptionField();
    const defenses = new DefenseStructureSystem(ecs, DEFENSE_SLOT_XS);
    const inventory = new InventoryStore({ wood: 20, stone: 20, petals: 10, shards: 10 });

    strip.getDollhousePlots().forEach((p, idx) =>
      ecs.registerDollhouse(idx, `house-${p.roleId}`, p.x, INTERACT_RANGE),
    );
    DEFENSE_SLOT_XS.forEach((slotX, idx) =>
      ecs.registerDefenseSlot(idx, `slot-${idx}`, slotX, INTERACT_RANGE),
    );
    // Unregistered slot index out of strip bounds
    ecs.registerDefenseSlot(99, 'slot-99', 72, INTERACT_RANGE);
    nodes.getAllNodes().forEach((n, idx) =>
      ecs.registerResourceNode(idx, n.id, n.x, n.z, INTERACT_RANGE),
    );
    corruption.getMounds().forEach((m, idx) =>
      ecs.registerPollutionMound(idx, m.id, m.x, INTERACT_RANGE),
    );

    // DEFENSE_SLOT (priority 2) beats RESOURCE (priority 1) at the exact same X
    const slotTarget = resolver.resolve(DEFENSE_SLOT_XS[0]!, ecs, strip, nodes, corruption, defenses);
    expect(slotTarget).toMatchObject({ type: 'defense', slotIndex: 0, label: 'Turret' });

    // Building and upgrading updates defense prompt through InteractionResolver with Pip Bond research gating
    defenses.interactSlot(0, inventory, 1);
    expect(resolver.resolve(DEFENSE_SLOT_XS[0]!, ecs, strip, nodes, corruption, defenses, 1)?.label).toBe('Pip Lv2');
    expect(resolver.resolve(DEFENSE_SLOT_XS[0]!, ecs, strip, nodes, corruption, defenses, 2)?.label).toBe('Lv2');
    defenses.interactSlot(0, inventory, 2);
    expect(resolver.resolve(DEFENSE_SLOT_XS[0]!, ecs, strip, nodes, corruption, defenses, 2)?.label).toBe('Pip Lv3');
    expect(resolver.resolve(DEFENSE_SLOT_XS[0]!, ecs, strip, nodes, corruption, defenses, 3)?.label).toBe('Lv3');
    defenses.interactSlot(0, inventory, 3);
    expect(resolver.resolve(DEFENSE_SLOT_XS[0]!, ecs, strip, nodes, corruption, defenses, 3)?.label).toBe('Max');
    ecs.getComponents().Defense.hp[ecs.getEntityId('slot-0')!] = 10;
    expect(resolver.resolve(DEFENSE_SLOT_XS[0]!, ecs, strip, nodes, corruption, defenses, 1)?.label).toBe('Repair');

    // Equal-priority tie-break selects closer resource
    const closerResource = resolver.resolve(60.8, ecs, strip, nodes, corruption, defenses);
    expect(closerResource).toMatchObject({ type: 'resource', id: 'flower-right' });

    // Boundary distance: exact range matches, epsilon beyond range returns null
    const exactBoundary = resolver.resolve(61 + INTERACT_RANGE, ecs, strip, nodes, corruption, defenses);
    expect(exactBoundary).toMatchObject({ type: 'resource', id: 'flower-right' });
    expect(resolver.resolve(61 + INTERACT_RANGE + 0.001, ecs, strip, nodes, corruption, defenses)).toBeNull();
    expect(resolver.resolve(Number.NaN, ecs, strip, nodes, corruption, defenses)).toBeNull();

    // Unregistered slot returns null, and depleted node without ECS deactivation still filters to null
    expect(resolver.resolve(72, ecs, strip, nodes, corruption, defenses)).toBeNull();
    nodes.hitNode('flower-right', 5);
    expect(resolver.resolve(61 + INTERACT_RANGE, ecs, strip, nodes, corruption, defenses)).toBeNull();
  });
});
