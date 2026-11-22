import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BlueprintRegistry } from '../../src/assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../../src/assets/GltfPartProvider.ts';
import { ModularAssemblyFactory } from '../../src/assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../../src/assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import { NPC_LOOK_DISTANCE, NPC_MOVE_SPEED } from '../../src/entities/constants.ts';
import { NpcStandee } from '../../src/entities/NpcStandee.ts';
import { DOLLHOUSE_PLOTS } from '../../src/world/constants.ts';

describe('NpcStandee', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  function createStandee() {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const materials = new StylizedMaterialFactory(scene);
    const blueprints = new BlueprintRegistry();
    const procedural = new ProceduralPartProvider(scene, materials);
    const gltf = new GltfPartProvider(scene, procedural);
    const assembly = new ModularAssemblyFactory(scene, gltf);
    const defenderPlot = DOLLHOUSE_PLOTS[2]!;
    const model = assembly.assemble(blueprints.getNpcBlueprint(defenderPlot.roleId), 'npc-defender');
    const standee = new NpcStandee(defenderPlot, model, 2);

    cleanups.push(() => {
      scene.dispose();
      engine.dispose();
    });
    return { standee, model, plot: defenderPlot };
  }

  it('plays celebration hops and lerps facing toward nearby players', () => {
    const { standee, model, plot } = createStandee();
    expect(standee.getPlot()).toBe(plot);
    expect(model.root.rotation.y).toBeCloseTo(Math.PI, 5);

    // Trigger celebration hop and advance within hop window
    standee.triggerCelebrate();
    standee.update(0.1, 0.1, plot.x + 0.75 + 1.5);
    expect(model.root.position.y).toBeGreaterThan(0.32);
    // Player within NPC_LOOK_DISTANCE turns yaw away from Math.PI toward player
    expect(model.root.rotation.y).not.toBeCloseTo(Math.PI, 2);

    // After celebration expires and player leaves look distance, yaw returns toward Math.PI
    for (let i = 0; i < 20; i++) {
      standee.update(1 + i * 0.1, 0.1, plot.x + 25);
    }
    expect(Math.abs(NPC_LOOK_DISTANCE)).toBeGreaterThan(0);
    expect(model.root.rotation.y).toBeCloseTo(Math.PI, 1);
  });

  it('walks at constant linear speed during night patrol with leg swing and returns to porch when patrol clears', () => {
    const { standee, model, plot } = createStandee();
    const legL = model.getMeshes().find((m) => m.name.endsWith('-leg-l'))!;

    standee.setPatrolX(-18);
    let maxSwing = 0;
    let sawStretch = false;
    let turnedLeft = false;
    const stepDistances: number[] = [];
    for (let i = 0; i < 60; i++) {
      const prevX = model.root.position.x;
      const prevZ = model.root.position.z;
      standee.update(i * 0.1, 0.1, 0);
      stepDistances.push(Math.hypot(model.root.position.x - prevX, model.root.position.z - prevZ));
      maxSwing = Math.max(maxSwing, Math.abs(legL.rotation.x));
      if (model.root.scaling.y > 1.005) sawStretch = true;
      if (Math.sin(model.root.rotation.y) < -0.5) turnedLeft = true;
    }
    expect(stepDistances[0]).toBeCloseTo(NPC_MOVE_SPEED * 0.1, 4);
    expect(stepDistances[9]).toBeCloseTo(NPC_MOVE_SPEED * 0.1, 4);
    expect(maxSwing).toBeGreaterThan(0.05);
    expect(sawStretch).toBe(true);
    expect(turnedLeft).toBe(true);
    expect(model.root.position.x).toBeCloseTo(-18, 2);
    expect(model.root.position.z).toBeCloseTo(0.4, 2);

    standee.setPatrolX(null);
    for (let i = 0; i < 60; i++) {
      standee.update(6 + i * 0.1, 0.1, 0);
    }
    expect(model.root.position.x).toBeCloseTo(plot.x + 0.75, 2);
    expect(model.root.position.z).toBeCloseTo(1.6, 2);
    expect(legL.rotation.x).toBeCloseTo(0, 2);
  });

  it('plays procedural spear attack lunge and turns toward strike direction without drifting position', () => {
    const { standee, model, plot } = createStandee();
    const hand = model.getSocket('hand_right')!;
    const restX = plot.x + 0.75;

    standee.triggerAttack(1);
    standee.update(0, 0.056, -20);
    expect(hand.position.z).toBeGreaterThan(0.8);
    expect(model.root.position.x).toBeGreaterThan(restX + 0.3);
    expect(model.root.rotation.y).toBeLessThan(Math.PI);

    // Settling after attack returns hand socket & standee X cleanly to rest
    for (let i = 0; i < 6; i++) {
      standee.update(0.2 + i * 0.05, 0.05, -20);
    }
    expect(hand.position.z).toBe(0);
    expect(model.root.position.x).toBeCloseTo(restX, 3);

    // Zero / NaN deltaSeconds, NaN patrolX, and left-facing (-1) attack guard cleanly without NaN drift
    standee.setPatrolX(Number.NaN);
    standee.triggerAttack(-1);
    standee.update(0.5, 0, 0);
    standee.update(0.5, Number.NaN, 0);
    expect(Number.isFinite(model.root.position.x)).toBe(true);
    expect(Number.isFinite(model.root.rotation.y)).toBe(true);
  });
});
