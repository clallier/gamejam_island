import { describe, expect, it } from 'vitest';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import { INTERACT_RANGE } from '../../src/systems/constants.ts';
import { InteractionResolver } from '../../src/systems/InteractionResolver.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
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
});
