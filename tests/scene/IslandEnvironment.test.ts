import fs from 'node:fs';
import path from 'node:path';
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
import { BalanceSheet } from '../../src/config/BalanceSheet.ts';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import { DayNightRig } from '../../src/engine/DayNightRig.ts';
import { PhysicsWorld } from '../../src/engine/PhysicsWorld.ts';
import { IslandEnvironment } from '../../src/scene/IslandEnvironment.ts';
import { INTERACT_RANGE } from '../../src/systems/constants.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
import { IslandStrip } from '../../src/world/IslandStrip.ts';
import { ResourceNodeCatalog } from '../../src/world/ResourceNodeCatalog.ts';

function loadHavokWasm(): ArrayBuffer {
  const wasmPath = path.resolve('node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm');
  const bytes = fs.readFileSync(wasmPath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('IslandEnvironment', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('animates node hits, regrowth, mound scrubbing, furnishing, defenses, patrol, and wobbles cleanly', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('cam', new Vector3(0, 5, -10), scene);
    const physics = new PhysicsWorld(scene, { wasmBinary: loadHavokWasm() });
    await physics.initialize();

    const materials = new StylizedMaterialFactory(scene);
    const blueprints = new BlueprintRegistry();
    const procedural = new ProceduralPartProvider(scene, materials);
    const gltf = new GltfPartProvider(scene, procedural);
    const assembly = new ModularAssemblyFactory(scene, gltf);
    const lighting = new DayNightRig(scene, materials);
    const ecs = new IslandEcsWorld();
    const strip = new IslandStrip();
    const corruption = new CorruptionField();
    const nodes = new ResourceNodeCatalog();
    const balance = new BalanceSheet();

    strip.getDollhousePlots().forEach((p, idx) =>
      ecs.registerDollhouse(idx, `house-${p.roleId}`, p.x, INTERACT_RANGE),
    );
    nodes.getAllNodes().forEach((n, idx) =>
      ecs.registerResourceNode(idx, n.id, n.x, n.z, INTERACT_RANGE),
    );
    corruption.getMounds().forEach((m, idx) =>
      ecs.registerPollutionMound(idx, m.id, m.x, INTERACT_RANGE),
    );

    const env = new IslandEnvironment(
      scene, assembly, blueprints, materials, physics, lighting, ecs, strip, corruption, nodes, balance,
    );
    cleanups.push(() => {
      env.dispose();
      scene.dispose();
      engine.dispose();
    });

    // Missing IDs are safe no-ops
    env.animateNodeHit('missing-node', false);
    env.animateMoundHit('missing-mound', false);
    env.furnishDollhouse('missing' as never, 'furniture_tool_chest', 'woodWarm');

    // Node hit non-depleted vs depleted + regrowth restoration
    const targetNode = nodes.getAllNodes()[0]!;
    const nodeRoot = scene.getTransformNodeByName(targetNode.id)!;
    env.animateNodeHit(targetNode.id, false);
    env.update(0.1, 0.05, 0, corruption);
    expect(nodeRoot.rotation.z).not.toBe(0);

    nodes.hitNode(targetNode.id, 10);
    env.animateNodeHit(targetNode.id, true);
    expect(nodeRoot.scaling.y).toBeLessThan(targetNode.scale * 0.5);
    nodes.regrowAll();
    env.syncRegrowth(nodes);
    expect(nodeRoot.scaling.y).toBeCloseTo(targetNode.scale, 4);

    // Mound partial hit vs scrubbed disables root
    const mound = corruption.getMounds()[0]!;
    const moundRoot = scene.getTransformNodeByName(mound.id)!;
    env.animateMoundHit(mound.id, false);
    expect(moundRoot.isEnabled()).toBe(true);
    env.animateMoundHit(mound.id, true);
    expect(moundRoot.isEnabled()).toBe(false);

    // Wobble finishes and resets rotation.z to 0 via observer
    env.update(0.5, 0.4, 0, corruption);
    expect(nodeRoot.rotation.z).toBe(0);

    // Turret Lv1 -> Lv2 -> removed + Defender patrol + road tile ruler toggle
    const gridMarker = scene.getMeshByName('road-grid-marker')! as Mesh;
    expect(gridMarker).not.toBeNull();
    expect(gridMarker.thinInstanceCount).toBeGreaterThan(20);
    env.setGridRulerVisible(false);
    expect(gridMarker.isVisible).toBe(false);
    env.setGridRulerVisible(true);
    expect(gridMarker.isVisible).toBe(true);
    balance.set('showGridRuler', 0);
    balance.set('gridUnitMeters', 3.0);
    env.syncGridRuler();
    expect(gridMarker.isVisible).toBe(false);
    balance.set('showGridRuler', 1);
    env.syncGridRuler();
    expect(gridMarker.isVisible).toBe(true);

    env.syncDefenseVisual(0, -26, 1);
    expect(scene.getTransformNodeByName('defense-slot-0')!.scaling.x).toBe(1);
    env.syncDefenseVisual(0, -26, 2);
    expect(scene.getTransformNodeByName('defense-slot-0')!.scaling.x).toBeCloseTo(1.2, 4);
    env.syncDefenseVisual(0, -26, 0);
    expect(scene.getTransformNodeByName('defense-slot-0')).toBeNull();
    env.setDefenderPatrolX(-15);
    env.celebrateNpc('defender');
    env.update(1.0, 0.1, 0, corruption);
  });
});
