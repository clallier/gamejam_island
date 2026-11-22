import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BlueprintRegistry } from '../../src/assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../../src/assets/GltfPartProvider.ts';
import { AssembledModel, ModularAssemblyFactory } from '../../src/assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../../src/assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import { AttackAnimator } from '../../src/entities/AttackAnimator.ts';

describe('AttackAnimator', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  function createDefenderModel() {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const materials = new StylizedMaterialFactory(scene);
    const blueprints = new BlueprintRegistry();
    const procedural = new ProceduralPartProvider(scene, materials);
    const gltf = new GltfPartProvider(scene, procedural);
    const assembly = new ModularAssemblyFactory(scene, gltf);
    const model = assembly.assemble(blueprints.getNpcBlueprint('defender'), 'npc-defender');
    cleanups.push(() => {
      scene.dispose();
      engine.dispose();
    });
    return { scene, gltf, model };
  }

  it('animates wind-up, forward thrust lunge, recovery, swing variant, and clean reset', () => {
    const { model } = createDefenderModel();
    const anim = new AttackAnimator(model);
    const hand = model.getSocket('hand_right')!;

    expect(anim.isActive()).toBe(false);
    expect(anim.update(0.1)).toBe(0);

    // Thrust attack (+1): pure front slide (no wind-up pullback or torso pitch tilt)
    anim.trigger(1, 'thrust', 0.2);
    expect(anim.isActive()).toBe(true);
    expect(anim.getDirection()).toBe(1);

    const earlyLunge = anim.update(0.03); // progress 0.15 < 0.35
    expect(earlyLunge).toBeGreaterThan(0.1);
    expect(hand.position.z).toBeGreaterThan(0.4);
    expect(hand.rotation.x).toBeCloseTo(Math.PI * 0.5, 4);
    expect(model.root.rotation.x).toBe(0);

    const peakLunge = anim.update(0.04); // total 0.07s -> progress 0.35 peak
    expect(peakLunge).toBeGreaterThan(0.38);
    expect(hand.position.z).toBeGreaterThan(0.95);
    expect(model.root.rotation.x).toBe(0);

    // Recovery phase stays positive & decays cleanly back to zero on finish
    const recoverLunge = anim.update(0.06);
    expect(recoverLunge).toBeGreaterThan(0);
    expect(recoverLunge).toBeLessThan(peakLunge);

    expect(anim.update(0.1)).toBe(0);
    expect(anim.isActive()).toBe(false);
    expect(hand.position.z).toBe(0);
    expect(hand.rotation.x).toBe(0);
    expect(model.root.rotation.x).toBe(0);

    // Swing attack (-1) covers wind-up (<0.25), strike (0.25..0.55), and recovery (>0.55)
    anim.trigger(-1, 'swing', 0.2);
    const swingWindup = anim.update(0.02); // progress 0.10 < 0.25
    expect(swingWindup).toBeCloseTo(0, 5);
    expect(hand.position.z).toBeLessThan(0);

    const swingLunge = anim.update(0.09); // total 0.11 -> progress 0.55 peak
    expect(swingLunge).toBeLessThan(-0.3);
    expect(hand.rotation.y).toBeLessThan(-0.5);
    expect(model.root.rotation.x).toBeGreaterThan(0.1);

    const swingRecovery = anim.update(0.05); // total 0.16 -> progress 0.80 recovery
    expect(swingRecovery).toBeLessThan(0);
    expect(swingRecovery).toBeGreaterThan(swingLunge);
    expect(anim.update(Number.NaN)).toBeCloseTo(swingRecovery, 5);
  });

  it('safely handles models missing hand_right socket and resets cleanly', () => {
    const { scene, gltf } = createDefenderModel();
    const bareRoot = new TransformNode('bare-root', scene);
    const bareModel = new AssembledModel(bareRoot, gltf, new Map());
    const anim = new AttackAnimator(bareModel);

    anim.trigger(1, 'thrust', 0.1);
    expect(anim.update(0.055)).toBeGreaterThan(0);
    expect(anim.update(0.1)).toBe(0);
    expect(anim.isActive()).toBe(false);
  });
});
