import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import { INTERIOR_DAY_INTENSITY, INTERIOR_NIGHT_INTENSITY } from '../../src/engine/constants.ts';
import { DayNightRig } from '../../src/engine/DayNightRig.ts';
import { TimeCycle } from '../../src/world/TimeCycle.ts';

describe('DayNightRig', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('transitions sky, fog, interior lights, and emissive materials across day, dusk, night, and dawn', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const materials = new StylizedMaterialFactory(scene);
    const rig = new DayNightRig(scene, materials);
    const roomLight = new PointLight('room-1', new Vector3(-13, 2, 2.5), scene);
    rig.registerInteriorLight(roomLight);

    cleanups.push(() => {
      scene.dispose();
      engine.dispose();
    });

    const clock = new TimeCycle();
    const daySnap = clock.jumpToPhase('day');
    rig.update(daySnap, -13);
    expect(roomLight.intensity).toBeCloseTo(INTERIOR_DAY_INTENSITY, 3);
    const dayAmberR = materials.getMaterial('amberGlow').emissiveColor.r;
    const daySkyB = scene.clearColor.b;

    const duskSnap = clock.jumpToPhase('dusk');
    rig.update(duskSnap, 0);
    expect(roomLight.intensity).toBeGreaterThan(INTERIOR_DAY_INTENSITY);
    expect(roomLight.intensity).toBeLessThan(INTERIOR_NIGHT_INTENSITY);

    const nightSnap = clock.jumpToPhase('night');
    rig.update(nightSnap, 15);
    expect(roomLight.intensity).toBeCloseTo(INTERIOR_NIGHT_INTENSITY, 3);
    expect(materials.getMaterial('amberGlow').emissiveColor.r).toBeGreaterThan(dayAmberR);
    expect(scene.clearColor.b).toBeLessThan(daySkyB);

    const dawnSnap = clock.jumpToPhase('dawn');
    rig.update(dawnSnap, 5);
    expect(roomLight.intensity).toBeGreaterThan(INTERIOR_DAY_INTENSITY);
    expect(roomLight.intensity).toBeLessThan(INTERIOR_NIGHT_INTENSITY);
  });
});
