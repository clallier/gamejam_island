import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
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

describe('EnemyVisualSystem (GPU ThinInstance Horde)', () => {
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

  it('batches 260 enemies across Sprite, Brute, and Rusher ThinInstance prototypes and preserves shared materials', () => {
    const { scene, ecs, materials, system } = createHarness();
    const eids: number[] = [];
    for (let i = 0; i < 260; i++) {
      const kind = i % 5 === 4 ? ENEMY_KIND.GLOOM_BRUTE : i % 3 === 1 ? ENEMY_KIND.GLOOM_RUSHER : ENEMY_KIND.GLOOM_SPRITE;
      eids.push(ecs.spawnEnemyEntity(kind, -50 + i * 0.3, i % 2 === 0 ? -1 : 1, 24, 3));
    }

    expect(system.getVisualCount()).toBe(260);
    ecs.getComponents().Enemy.hitFlash[eids[0]!] = 0.1;
    system.update(0.5, 0.016);

    const spriteProto = scene.getMeshByName('enemy-proto-sprite') as Mesh;
    const bruteProto = scene.getMeshByName('enemy-proto-brute') as Mesh;
    const rusherProto = scene.getMeshByName('enemy-proto-rusher') as Mesh;
    expect(spriteProto.thinInstanceCount + bruteProto.thinInstanceCount + rusherProto.thinInstanceCount).toBe(260);

    const neonMat = materials.getMaterial('corruptionNeon');
    const darkMat = materials.getMaterial('corruptionDark');
    const heroMat = materials.getMaterial('hero');
    for (const eid of eids) ecs.despawnEntity(eid);
    system.update(0.6, 0.016);

    expect(system.getVisualCount()).toBe(0);
    expect(spriteProto.thinInstanceCount).toBe(0);
    expect(scene.materials).toContain(neonMat);
    expect(scene.materials).toContain(darkMat);
    expect(scene.materials).toContain(heroMat);
  });

  it('pools tracer beams, parabolic bow arrows, and firework sparks cleanly through spawn, flight, fade, and dispose', () => {
    const { scene, system } = createHarness();
    system.spawnTracer(-20, -28, 'turret');
    system.spawnTracer(0, 8, 'player');
    system.spawnFirework(8);
    expect(system.getActiveTracerCount()).toBe(1);
    expect(system.getActiveArrowCount()).toBe(1);
    expect(system.getActiveSparkCount()).toBe(4);
    expect(scene.getMeshByName('tracer-0')).not.toBeNull();
    const arrowMesh = scene.getMeshByName('arrow-0')!;
    expect(arrowMesh).not.toBeNull();
    expect(scene.getMeshByName('spark-0')).not.toBeNull();

    // Mid-flight bow arrow arcs upward above release height (y > 1.5) before landing
    system.update(0.1, 0.11);
    expect(arrowMesh.position.y).toBeGreaterThan(1.5);
    expect(system.getActiveArrowCount()).toBe(1);

    system.update(0.25, 0.15);
    expect(system.getActiveTracerCount()).toBe(0);
    expect(system.getActiveArrowCount()).toBe(0);
    expect(system.getActiveSparkCount()).toBe(4);

    // Reuses pooled turret tracer & player bow arrow without allocating new meshes
    system.spawnTracer(-20, -25, 'turret');
    system.spawnTracer(0, -8, 'player');
    expect(system.getActiveTracerCount()).toBe(1);
    expect(system.getActiveArrowCount()).toBe(1);
    expect(scene.getMeshByName('tracer-1')).toBeNull();
    expect(scene.getMeshByName('arrow-1')).toBeNull();

    system.update(0.4, 0.25);
    expect(system.getActiveSparkCount()).toBe(0);

    system.dispose();
    expect(scene.getMeshByName('enemy-proto-sprite')).toBeNull();
    expect(scene.getMeshByName('tracer-0')).toBeNull();
    expect(scene.getMeshByName('arrow-0')).toBeNull();
    expect(scene.getMeshByName('spark-0')).toBeNull();
  });
});
