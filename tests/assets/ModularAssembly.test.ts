import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlueprintRegistry, type WorldPropKind } from '../../src/assets/BlueprintRegistry.ts';
import { ColorPalette } from '../../src/assets/ColorPalette.ts';
import type { PaletteKey, PartId } from '../../src/assets/constants.ts';
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
    return { scene, materials, procedural, factory, registry: new BlueprintRegistry() };
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

    const props: WorldPropKind[] = [
      'shrine',
      'tree_pine',
      'tree_broadleaf',
      'boulder',
      'mound',
      'portal',
      'wildflower',
      'purifier_flower',
    ];
    for (const propKind of props) {
      const prop = factory.assemble(registry.getPropBlueprint(propKind), `prop-${propKind}`);
      expect(prop.getMeshes().length).toBeGreaterThan(0);
    }
  });

  it('hot-swaps modular socket parts cleanly and rejects unknown sockets', () => {
    const { factory, registry } = createAssemblyContext();
    const hero = factory.assemble(registry.getHeroBlueprint(), 'hero');
    const swapped = hero.swapPart('hat', 'hat_helm', 'defender', {
      position: [0, 0.1, 0],
      rotation: [0, 0.2, 0],
      scale: [1.1, 1.1, 1.1],
    });
    expect(swapped.getChildMeshes().length).toBeGreaterThan(0);
    expect(swapped.rotation.y).toBeCloseTo(0.2, 5);
    expect(swapped.scaling.x).toBeCloseTo(1.1, 5);
    expect(() => hero.swapPart('roof', 'dollhouse_roof', 'hero')).toThrow();
  });

  it('builds every furniture, defense, enemy, and prop part and covers ColorPalette, StylizedMaterialFactory, and GltfPartProvider', async () => {
    const { scene, materials, procedural, factory, registry } = createAssemblyContext();
    const palette = new ColorPalette();
    const keys: PaletteKey[] = [
      'hero', 'engineer', 'medic', 'defender', 'merchant', 'woodWarm', 'woodDark',
      'clayCream', 'stoneWarm', 'grassSage', 'foliagePine', 'foliageLeaf', 'waterTeal',
      'amberGlow', 'heartAmber', 'corruptionDark', 'corruptionNeon', 'skinPeach', 'leather',
    ];
    for (const key of keys) {
      expect(palette.getSwatch(key).diffuse).toBeDefined();
      materials.getMaterial(key);
    }
    expect(materials.getAllMaterials()).toHaveLength(keys.length);

    const extraParts: PartId[] = [
      'furniture_tool_chest', 'furniture_hearth_stove', 'furniture_herb_shelf', 'furniture_tea_table',
      'furniture_training_dummy', 'furniture_banner_stand', 'furniture_curio_shelf', 'furniture_plush_rug',
      'prop_lantern', 'defense_turret', 'defense_barricade', 'enemy_gloom_sprite', 'enemy_gloom_brute',
    ];
    for (const partId of extraParts) {
      const node = procedural.createPart(partId, `part-${partId}`, 'amberGlow');
      expect(node.getChildMeshes().length).toBeGreaterThan(0);
    }

    const extraProps: WorldPropKind[] = ['defense_turret', 'defense_barricade', 'enemy_gloom_sprite', 'enemy_gloom_brute'];
    for (const propKind of extraProps) {
      expect(factory.assemble(registry.getPropBlueprint(propKind), `extra-${propKind}`).getMeshes().length).toBeGreaterThan(0);
    }

    // GltfPartProvider falls back cleanly on failed manifest URL and instantiates cached AssetContainers when loaded
    const gltf = new GltfPartProvider(scene, procedural, { hat_explorer: '/nonexistent/hat.glb' });
    await gltf.preloadAll();
    const fallbackNode = gltf.createPart('hat_explorer', 'fallback-hat', 'woodWarm');
    expect(fallbackNode.getChildMeshes().length).toBeGreaterThan(0);

    const fakeRoot = new TransformNode('glb-node', scene);
    const fakeContainer = {
      instantiateModelsToScene: vi.fn(() => ({ rootNodes: [fakeRoot] })),
    };
    (gltf as unknown as { containers: Map<PartId, unknown> }).containers.set('hat_explorer', fakeContainer);
    const glbPart = gltf.createPart('hat_explorer', 'loaded-hat', 'woodWarm');
    expect(fakeContainer.instantiateModelsToScene).toHaveBeenCalledTimes(1);
    expect(glbPart.getChildren()).toContain(fakeRoot);
  });
});
