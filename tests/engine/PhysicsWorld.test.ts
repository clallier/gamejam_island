import fs from 'node:fs';
import path from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld.ts';

function loadHavokWasm(): ArrayBuffer {
  const wasmPath = path.resolve('node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm');
  const bytes = fs.readFileSync(wasmPath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('PhysicsWorld', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('initializes idempotently, creates static/dynamic bodies, and applies impulses', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    cleanups.push(() => {
      scene.dispose();
      engine.dispose();
    });

    const physics = new PhysicsWorld(scene, { wasmBinary: loadHavokWasm() });
    await physics.initialize();
    await physics.initialize();
    expect(scene.isPhysicsEnabled()).toBe(true);

    const floor = MeshBuilder.CreateBox('floor', { width: 10, height: 1, depth: 4 }, scene);
    floor.position.y = -0.5;
    const staticAgg = physics.attachStaticBox(floor);
    expect(staticAgg.body).toBeDefined();

    const capsule = MeshBuilder.CreateCapsule('cap', { height: 1.6, radius: 0.35 }, scene);
    capsule.position.y = 2;
    const capAgg = physics.attachDynamicCapsule(capsule, 1.5);
    expect(capAgg.body).toBeDefined();

    const prop = MeshBuilder.CreateSphere('prop', { diameter: 0.4 }, scene);
    prop.position.y = 3;
    const propAgg = physics.attachDynamicProp(prop);
    physics.applyImpulse(propAgg, new Vector3(2, 4, 0));
    scene.getPhysicsEngine()?._step(1 / 60);
    expect(physics.getLinearVelocity(propAgg).y).toBeGreaterThan(0);

    physics.setLinearVelocity(propAgg, new Vector3(-3, 1, 0));
    expect(physics.getLinearVelocity(propAgg).x).toBeCloseTo(-3, 2);
  });

  it('throws when scene.enablePhysics fails', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    cleanups.push(() => {
      scene.dispose();
      engine.dispose();
    });

    vi.spyOn(scene, 'enablePhysics').mockReturnValue(false);
    const physics = new PhysicsWorld(scene, { wasmBinary: loadHavokWasm() });
    await expect(physics.initialize()).rejects.toThrow('Failed to enable Havok physics plugin on Babylon scene');
  });
});
