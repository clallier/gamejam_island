import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, describe, expect, it } from 'vitest';
import { CAMERA_FOV_FOCUS, CAMERA_FOV_LANDSCAPE, CAMERA_FOV_PORTRAIT } from '../../src/engine/constants.ts';
import { DioramaCamera } from '../../src/engine/DioramaCamera.ts';

describe('DioramaCamera', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('snaps and smoothly damps between landscape, portrait, and dollhouse focus poses', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    cleanups.push(() => {
      scene.dispose();
      engine.dispose();
    });

    const cam = new DioramaCamera(scene);
    expect(scene.activeCamera).toBeDefined();

    cam.snap(16 / 9, 10);
    expect(scene.activeCamera!.position.x).toBeCloseTo(10, 4);
    expect(scene.activeCamera!.fov).toBeCloseTo(CAMERA_FOV_LANDSCAPE, 4);

    // Zero or negative dt leaves pose unchanged
    cam.update(0, 9 / 16, 20, null);
    expect(scene.activeCamera!.position.x).toBeCloseTo(10, 4);

    // Portrait roam pulls camera back and widens FOV
    for (let i = 0; i < 30; i++) cam.update(0.1, 9 / 16, 20, null);
    expect(scene.activeCamera!.position.x).toBeCloseTo(20, 1);
    expect(scene.activeCamera!.fov).toBeCloseTo(CAMERA_FOV_PORTRAIT, 2);

    // Focusing a dollhouse zooms into interior FOV
    for (let i = 0; i < 30; i++) cam.update(0.1, 16 / 9, 20, -13);
    expect(scene.activeCamera!.position.x).toBeCloseTo(-13, 1);
    expect(scene.activeCamera!.fov).toBeCloseTo(CAMERA_FOV_FOCUS, 2);
  });
});
