import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BlueprintRegistry, type WorldPropKind } from '../../src/assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../../src/assets/GltfPartProvider.ts';
import { ModularAssemblyFactory } from '../../src/assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../../src/assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import type { NpcRoleId } from '../../src/world/constants.ts';

describe('ModularAssemblyFactory + Providers', () => {
  const disposables: Array<() => void> = [];

  afterEach(() => {
    while (disposables.length > 0) disposables.pop()?.();
  });

  function createAssemblyContext() {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const materials = new StylizedMaterialFactory(scene);
    const procedural = new ProceduralPartProvider(scene, materials);
    const gltf = new GltfPartProvider(scene, procedural);
    const factory = new ModularAssemblyFactory(scene, gltf);
    disposables.push(() => {
      scene.dispose();
      engine.dispose();
    });
    return { factory, registry: new BlueprintRegistry() };
  }

  it('assembles hero, all four NPCs, all dollhouses, and all world props', () => {
    const { factory, registry } = createAssemblyContext();
    const hero = factory.assemble(registry.getHeroBlueprint(), 'hero');
    expect(hero.getMeshes().length).toBeGreaterThan(5);
    expect(hero.getSocket('hat')).toBeDefined();

    const roles: NpcRoleId[] = ['engineer', 'medic', 'defender', 'merchant'];
    for (const role of roles) {
      const npc = factory.assemble(registry.getNpcBlueprint(role), `npc-${role}`);
      const house = factory.assemble(registry.getDollhouseBlueprint(role), `house-${role}`);
      expect(npc.getMeshes().length).toBeGreaterThan(3);
      expect(house.getMeshes().length).toBeGreaterThan(8);
      const gable = house.getMeshes().find((m) => m.name.endsWith('-gable'))!;
      const roofSlope = house.getMeshes().find((m) => m.name.endsWith('-roof-l'))!;
      gable.computeWorldMatrix(true);
      roofSlope.computeWorldMatrix(true);
      expect(gable.getBoundingInfo().boundingBox.maximumWorld.y).toBeLessThan(
        roofSlope.getBoundingInfo().boundingBox.maximumWorld.y,
      );
    }

    const props: WorldPropKind[] = ['shrine', 'tree_pine', 'tree_broadleaf', 'boulder', 'mound', 'portal'];
    for (const propKind of props) {
      const prop = factory.assemble(registry.getPropBlueprint(propKind), `prop-${propKind}`);
      expect(prop.getMeshes().length).toBeGreaterThan(0);
    }
  });

  it('hot-swaps modular socket parts cleanly and rejects unknown sockets', () => {
    const { factory, registry } = createAssemblyContext();
    const hero = factory.assemble(registry.getHeroBlueprint(), 'hero');
    const swapped = hero.swapPart('hat', 'hat_helm', 'defender');
    expect(swapped.getChildMeshes().length).toBeGreaterThan(0);
    expect(() => hero.swapPart('roof', 'dollhouse_roof', 'hero')).toThrow();
  });
});
