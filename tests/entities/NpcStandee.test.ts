import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { BlueprintRegistry } from '../../src/assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../../src/assets/GltfPartProvider.ts';
import { ModularAssemblyFactory } from '../../src/assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../../src/assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import { NPC_LOOK_DISTANCE } from '../../src/entities/constants.ts';
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

  it('lerps onto the road during night patrol and returns to porch when patrol clears', () => {
    const { standee, model, plot } = createStandee();

    standee.setPatrolX(-18);
    for (let i = 0; i < 20; i++) {
      standee.update(i * 0.1, 0.1, 0);
    }
    expect(model.root.position.x).toBeCloseTo(-18, 1);
    expect(model.root.position.z).toBeCloseTo(0.4, 1);

    standee.setPatrolX(null);
    for (let i = 0; i < 20; i++) {
      standee.update(2 + i * 0.1, 0.1, 0);
    }
    expect(model.root.position.x).toBeCloseTo(plot.x + 0.75, 1);
    expect(model.root.position.z).toBeCloseTo(1.6, 1);
  });
});
