import fs from 'node:fs';
import path from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BlueprintRegistry } from '../../src/assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../../src/assets/GltfPartProvider.ts';
import { ModularAssemblyFactory } from '../../src/assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../../src/assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import { DayNightRig } from '../../src/engine/DayNightRig.ts';
import { DioramaCamera } from '../../src/engine/DioramaCamera.ts';
import type { InputSnapshot } from '../../src/engine/InputController.ts';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld.ts';
import { PLAYER_MAX_PEBBLES } from '../../src/entities/constants.ts';
import { LootDropSystem } from '../../src/entities/LootDropSystem.ts';
import { PlayerController } from '../../src/entities/PlayerController.ts';
import { IslandEnvironment } from '../../src/scene/IslandEnvironment.ts';
import { INTERACT_RANGE } from '../../src/systems/constants.ts';
import { PlantingSystem } from '../../src/systems/PlantingSystem.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
import { InventoryStore } from '../../src/world/InventoryStore.ts';
import { IslandStrip } from '../../src/world/IslandStrip.ts';
import { ResourceNodeCatalog } from '../../src/world/ResourceNodeCatalog.ts';
import { TimeCycle } from '../../src/world/TimeCycle.ts';

const IDLE_INPUT: InputSnapshot = {
  moveX: 0,
  jumpPressed: false,
  interactPressed: false,
  tossPressed: false,
  plantPressed: false,
};

describe('PhysicsWorld + bitECS + IslandEnvironment + PlayerController + Pooled Loot', () => {
  const disposables: Array<() => void> = [];

  afterEach(() => {
    while (disposables.length > 0) disposables.pop()?.();
  });

  async function bootScene() {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const wasmPath = path.resolve('node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm');
    const wasmBytes = fs.readFileSync(wasmPath);
    const wasmBinary = wasmBytes.buffer.slice(
      wasmBytes.byteOffset,
      wasmBytes.byteOffset + wasmBytes.byteLength,
    ) as ArrayBuffer;
    const physics = new PhysicsWorld(scene, { wasmBinary });
    await physics.initialize();

    const materials = new StylizedMaterialFactory(scene);
    const blueprints = new BlueprintRegistry();
    const procedural = new ProceduralPartProvider(scene, materials);
    const gltf = new GltfPartProvider(scene, procedural);
    const assembly = new ModularAssemblyFactory(scene, gltf);
    const lighting = new DayNightRig(scene, materials);
    const camera = new DioramaCamera(scene);
    const ecs = new IslandEcsWorld();
    const strip = new IslandStrip();
    const corruption = new CorruptionField();
    const resourceNodes = new ResourceNodeCatalog();
    const inventory = new InventoryStore();
    const planting = new PlantingSystem();
    const clock = new TimeCycle();

    strip.getDollhousePlots().forEach((p, idx) =>
      ecs.registerDollhouse(idx, `house-${p.roleId}`, p.x, INTERACT_RANGE),
    );
    resourceNodes.getAllNodes().forEach((n, idx) =>
      ecs.registerResourceNode(idx, n.id, n.x, n.z, INTERACT_RANGE),
    );
    corruption.getMounds().forEach((m, idx) =>
      ecs.registerPollutionMound(idx, m.id, m.x, INTERACT_RANGE),
    );

    const loot = new LootDropSystem(scene, ecs, physics, materials, lighting);
    const env = new IslandEnvironment(
      scene, assembly, blueprints, materials, physics, lighting, ecs, strip, corruption, resourceNodes,
    );
    const hero = assembly.assemble(blueprints.getHeroBlueprint(), 'player-hero');
    const player = new PlayerController(scene, physics, strip, materials, hero);

    camera.snap(390 / 844, player.getX());
    disposables.push(() => {
      loot.dispose();
      env.dispose();
      scene.dispose();
      engine.dispose();
    });
    return { scene, ecs, player, env, lighting, corruption, resourceNodes, inventory, planting, loot, clock };
  }

  function stepFrames(
    ctx: Awaited<ReturnType<typeof bootScene>>,
    frames: number,
    input: InputSnapshot,
  ): void {
    const dt = 1 / 60;
    for (let i = 0; i < frames; i++) {
      ctx.player.update(dt, input);
      ctx.loot.update(dt, ctx.player.getX(), ctx.inventory);
      ctx.lighting.update(ctx.clock.advance(dt), ctx.player.getX());
      ctx.env.update(i * dt, dt, ctx.player.getX(), ctx.corruption);
      ctx.scene.getPhysicsEngine()?._step(dt);
    }
  }

  it('enables Havok on Babylon scene, lands player on road, moves, jumps, and tosses pebbles', async () => {
    const ctx = await bootScene();
    expect(ctx.scene.isPhysicsEnabled()).toBe(true);

    const grass = ctx.scene.getMeshByName('island-grass')!;
    const road = ctx.scene.getMeshByName('island-road')!;
    grass.computeWorldMatrix(true);
    road.computeWorldMatrix(true);
    expect(grass.getBoundingInfo().boundingBox.maximumWorld.y).toBeLessThan(
      road.getBoundingInfo().boundingBox.maximumWorld.y,
    );
    const clayMat = ctx.scene.getMaterialByName('mat-clayCream') as { maxSimultaneousLights?: number };
    expect(clayMat.maxSimultaneousLights).toBeGreaterThanOrEqual(8);

    stepFrames(ctx, 35, IDLE_INPUT);
    const collider = ctx.scene.getMeshByName('player-physics-capsule')!;
    expect(collider).toBeDefined();
    expect(collider.position.y).toBeGreaterThan(0.5);
    expect(collider.position.y).toBeLessThan(1.3);
    expect(Math.abs(collider.position.z)).toBeLessThan(0.01);

    const startX = ctx.player.getX();
    stepFrames(ctx, 25, { ...IDLE_INPUT, moveX: 1 });
    expect(ctx.player.getX()).toBeGreaterThan(startX + 1.5);
    expect(Math.abs(collider.position.z)).toBeLessThan(0.01);

    const groundY = collider.position.y;
    stepFrames(ctx, 1, { ...IDLE_INPUT, jumpPressed: true });
    stepFrames(ctx, 8, IDLE_INPUT);
    expect(collider.position.y).toBeGreaterThan(groundY + 0.4);

    for (let i = 0; i < PLAYER_MAX_PEBBLES + 3; i++) {
      stepFrames(ctx, 1, { ...IDLE_INPUT, tossPressed: true });
    }
    const pebbleMeshes = ctx.scene.meshes.filter((m) => m.name === 'hero-pebble');
    expect(pebbleMeshes.length).toBe(PLAYER_MAX_PEBBLES);
    const latestPebble = pebbleMeshes[pebbleMeshes.length - 1]!;
    expect(latestPebble.position.x - ctx.player.getX()).toBeLessThan(5);
  });

  it('spawns pooled Havok + bitECS loot, collects into inventory, reuses meshes, and plants blooms', async () => {
    const ctx = await bootScene();
    stepFrames(ctx, 20, IDLE_INPUT);

    const woodBefore = ctx.inventory.getAmount('wood');
    const hit = ctx.resourceNodes.hitNode('node-right-leaf-inner');
    expect(hit).not.toBeNull();
    ctx.env.animateNodeHit('node-right-leaf-inner', hit!.depleted);
    ctx.loot.spawnBurst('wood', 2, ctx.player.getX() + 0.4, 2.2, ctx.inventory);
    expect(ctx.loot.getActiveCount()).toBe(2);

    stepFrames(ctx, 45, IDLE_INPUT);
    expect(ctx.loot.getActiveCount()).toBe(0);
    expect(ctx.loot.getPooledCount()).toBe(2);
    expect(ctx.inventory.getAmount('wood')).toBe(woodBefore + 2);

    // Respawning reuses pooled meshes instead of creating new ones
    ctx.loot.spawnBurst('wood', 2, ctx.player.getX() + 0.4, 2.2, ctx.inventory);
    expect(ctx.loot.getPooledCount()).toBe(0);
    expect(ctx.loot.getActiveCount()).toBe(2);

    const petalsBefore = ctx.inventory.getAmount('petals');
    const rightBorderBefore = ctx.corruption.getRightBorderX();
    const bloom = ctx.planting.plantAt(24, ctx.inventory, ctx.corruption);
    expect(bloom).not.toBeNull();
    ctx.env.spawnPlantedFlora(bloom!);
    expect(ctx.inventory.getAmount('petals')).toBe(petalsBefore - 2);
    expect(ctx.corruption.getRightBorderX()).toBeGreaterThan(rightBorderBefore);
    expect(ctx.scene.getTransformNodeByName(bloom!.id)).not.toBeNull();
  });
});
