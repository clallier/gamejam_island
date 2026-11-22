import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BlueprintRegistry } from '../../src/assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../../src/assets/GltfPartProvider.ts';
import { ModularAssemblyFactory } from '../../src/assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../../src/assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import { ENEMY_KIND } from '../../src/ecs/constants.ts';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import { DayNightRig } from '../../src/engine/DayNightRig.ts';
import { EnemyVisualSystem } from '../../src/entities/EnemyVisualSystem.ts';

describe('EnemyVisualSystem', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  function createHarness() {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('cam', new Vector3(0, 5, -10), scene);
    const materials = new StylizedMaterialFactory(scene);
    const blueprints = new BlueprintRegistry();
    const procedural = new ProceduralPartProvider(scene, materials);
    const gltf = new GltfPartProvider(scene, procedural);
    const assembly = new ModularAssemblyFactory(scene, gltf);
    const lighting = new DayNightRig(scene, materials);
    const ecs = new IslandEcsWorld();
    const system = new EnemyVisualSystem(scene, ecs, assembly, blueprints, materials, lighting);

    cleanups.push(() => {
      system.dispose();
      scene.dispose();
      engine.dispose();
    });
    return { scene, ecs, materials, system };
  }

  it('assembles sprite and brute visuals, syncs facing and bob, and preserves shared materials on despawn', () => {
    const { scene, ecs, materials, system } = createHarness();
    const spriteEid = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, -30, -1, 24, 3.2);
    const bruteEid = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, 32, 1, 56, 1.9);

    expect(system.getVisualCount()).toBe(2);
    expect(scene.getMeshByName(`enemy-${spriteEid}-root-core`)).not.toBeNull();
    expect(scene.getMeshByName(`enemy-${bruteEid}-root-torso`)).not.toBeNull();

    system.update(0.5, 0.016);
    const spriteRoot = scene.getTransformNodeByName(`enemy-${spriteEid}`)!;
    const bruteRoot = scene.getTransformNodeByName(`enemy-${bruteEid}`)!;
    expect(spriteRoot.position.x).toBe(-30);
    expect(spriteRoot.rotation.y).toBe(0);
    expect(bruteRoot.position.x).toBe(32);
    expect(bruteRoot.rotation.y).toBeCloseTo(Math.PI, 5);

    const neonMat = materials.getMaterial('corruptionNeon');
    const darkMat = materials.getMaterial('corruptionDark');
    ecs.despawnEntity(spriteEid);
    ecs.despawnEntity(bruteEid);
    expect(system.getVisualCount()).toBe(0);
    // Shared materials must remain registered in the scene for borders, portals, and DayNightRig
    expect(scene.materials).toContain(neonMat);
    expect(scene.materials).toContain(darkMat);
  });

  it('spawns, fades, and disposes turret tracer beams cleanly', () => {
    const { scene, ecs, system } = createHarness();
    system.spawnTracer(-20, -28);
    expect(scene.getMeshByName('tracer-0')).not.toBeNull();

    system.update(0.1, 0.08);
    expect(scene.getMeshByName('tracer-0')).not.toBeNull();

    system.update(0.2, 0.08);
    expect(scene.getMeshByName('tracer-0')).toBeNull();

    // Active tracer & enemy models are cleaned up on system.dispose()
    ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, -25, -1, 24, 3.2);
    system.spawnTracer(-20, -25);
    system.dispose();
    expect(system.getVisualCount()).toBe(0);
    expect(scene.getMeshByName('tracer-1')).toBeNull();
  });
});
