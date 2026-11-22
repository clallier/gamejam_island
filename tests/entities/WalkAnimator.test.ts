import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BlueprintRegistry } from '../../src/assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../../src/assets/GltfPartProvider.ts';
import { AssembledModel, ModularAssemblyFactory } from '../../src/assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../../src/assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import { WalkAnimator } from '../../src/entities/WalkAnimator.ts';

describe('WalkAnimator', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  function createCharacterModel() {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const materials = new StylizedMaterialFactory(scene);
    const blueprints = new BlueprintRegistry();
    const procedural = new ProceduralPartProvider(scene, materials);
    const gltf = new GltfPartProvider(scene, procedural);
    const assembly = new ModularAssemblyFactory(scene, gltf);
    const model = assembly.assemble(blueprints.getNpcBlueprint('defender'), 'walk-defender');
    cleanups.push(() => {
      scene.dispose();
      engine.dispose();
    });
    return { scene, gltf, model };
  }

  it('drives alternating leg swing, waddle roll, step events, bounce, and damps smoothly to rest', () => {
    const { model } = createCharacterModel();
    const walk = new WalkAnimator(model);
    const meshes = model.getMeshes();
    const legL = meshes.find((m) => m.name.endsWith('-leg-l'))!;
    const legR = meshes.find((m) => m.name.endsWith('-leg-r'))!;

    const idle = walk.update(0.05, 0, true);
    expect(idle.moving).toBe(false);
    expect(idle.stepped).toBe(false);
    expect(idle.bounceY).toBe(0);
    expect(idle.strideScaleY).toBe(1);

    let sawStep = false;
    let peakSwing = 0;
    for (let i = 0; i < 6; i++) {
      const state = walk.update(0.06, 5.2, true);
      expect(state.moving).toBe(true);
      expect(state.bounceY).toBeGreaterThan(0);
      expect(state.strideScaleY).toBeGreaterThan(1);
      if (state.stepped) sawStep = true;
      peakSwing = Math.max(peakSwing, Math.abs(legL.rotation.x));
      expect(legR.rotation.x).toBeCloseTo(-legL.rotation.x, 5);
    }
    expect(sawStep).toBe(true);
    expect(peakSwing).toBeGreaterThan(0.2);
    expect(Math.abs(model.root.rotation.z)).toBeGreaterThan(0.005);

    // Stopping or going airborne damps legs and waddle roll back toward zero
    for (let i = 0; i < 20; i++) {
      const rest = walk.update(0.05, 0, false);
      expect(rest.moving).toBe(false);
    }
    expect(legL.rotation.x).toBeCloseTo(0, 3);
    expect(legR.rotation.x).toBeCloseTo(0, 3);
    expect(model.root.rotation.z).toBeCloseTo(0, 3);
  });

  it('safely handles legless models and invalid delta/speed inputs', () => {
    const { scene, gltf } = createCharacterModel();
    const bareRoot = new TransformNode('bare-walk', scene);
    const bareModel = new AssembledModel(bareRoot, gltf, new Map());
    const walk = new WalkAnimator(bareModel);

    expect(walk.update(Number.NaN, Number.NaN, true).moving).toBe(false);
    const step = walk.update(0.1, 4, true);
    expect(step.moving).toBe(true);
    expect(walk.update(0.2, 0, true).moving).toBe(false);
  });
});
