import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { StylizedMaterialFactory } from '../../src/assets/StylizedMaterialFactory.ts';
import { DustPuffSystem } from '../../src/entities/DustPuffSystem.ts';

describe('DustPuffSystem', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('spawns pooled low-poly dust puffs up to MAX_PUFFS, animates, recycles, and preserves shared materials', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const materials = new StylizedMaterialFactory(scene);
    const clayMat = materials.getMaterial('clayCream');
    const dust = new DustPuffSystem(scene, materials);
    cleanups.push(() => {
      dust.dispose();
      scene.dispose();
      engine.dispose();
    });

    dust.spawnBurst(4, 0.2, 0, 5, 0.8, 2.2);
    expect(dust.getActiveCount()).toBe(5);
    expect(dust.getPooledCount()).toBe(0);

    // Mid-flight step moves puffs upward & keeps them active
    dust.update(0.15);
    expect(dust.getActiveCount()).toBe(5);

    // Expiring lifetime recycles all puffs cleanly into pool
    dust.update(0.3);
    expect(dust.getActiveCount()).toBe(0);
    expect(dust.getPooledCount()).toBe(5);

    // Subsequent burst reuses pooled meshes and enforces MAX_PUFFS (48)
    dust.spawnBurst(0, 0.2, 0, 60, 1.0, 2.0);
    expect(dust.getActiveCount()).toBe(48);
    expect(dust.getPooledCount()).toBe(0);

    // Negative / NaN dt does not corrupt puff state
    dust.update(Number.NaN);
    expect(dust.getActiveCount()).toBe(48);

    dust.dispose();
    expect(dust.getActiveCount()).toBe(0);
    expect(dust.getPooledCount()).toBe(0);
    expect(scene.materials).toContain(clayMat);
  });
});
