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
import { DayNightRig } from '../../src/engine/DayNightRig.ts';
import { DioramaCamera } from '../../src/engine/DioramaCamera.ts';
import type { InputSnapshot } from '../../src/engine/InputController.ts';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld.ts';
import { PLAYER_MAX_PEBBLES } from '../../src/entities/constants.ts';
import { PlayerController } from '../../src/entities/PlayerController.ts';
import { IslandEnvironment } from '../../src/scene/IslandEnvironment.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
import { IslandStrip } from '../../src/world/IslandStrip.ts';
import { TimeCycle } from '../../src/world/TimeCycle.ts';

const IDLE_INPUT: InputSnapshot = {
  moveX: 0,
  jumpPressed: false,
  interactPressed: false,
  tossPressed: false,
};

describe('PhysicsWorld + IslandEnvironment + PlayerController integration', () => {
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
    const strip = new IslandStrip();
    const corruption = new CorruptionField();
    const clock = new TimeCycle();
    const env = new IslandEnvironment(scene, assembly, blueprints, materials, physics, lighting, strip, corruption);
    const hero = assembly.assemble(blueprints.getHeroBlueprint(), 'player-hero');
    const player = new PlayerController(scene, physics, strip, materials, hero);

    camera.snap(390 / 844, player.getX());
    disposables.push(() => {
      scene.dispose();
      engine.dispose();
    });
    return { scene, player, env, lighting, corruption, clock };
  }

  function stepFrames(
    ctx: Awaited<ReturnType<typeof bootScene>>,
    frames: number,
    input: InputSnapshot,
  ): void {
    const dt = 1 / 60;
    for (let i = 0; i < frames; i++) {
      ctx.player.update(dt, input);
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
});
