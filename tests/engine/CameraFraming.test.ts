import { describe, expect, it } from 'vitest';
import { CameraFraming } from '../../src/engine/CameraFraming.ts';
import { PLAYER_AUTOSHOOT_RANGE } from '../../src/systems/constants.ts';

describe('CameraFraming', () => {
  it('pulls camera further back and widens FOV in mobile portrait aspect ratios', () => {
    const framing = new CameraFraming();
    const portrait = framing.compute(390 / 844, 4);
    const landscape = framing.compute(1280 / 800, 4);

    expect(portrait.position.x).toBe(4);
    expect(portrait.position.z).toBeLessThan(landscape.position.z);
    expect(portrait.position.y).toBeGreaterThan(landscape.position.y);
    expect(portrait.fov).toBeGreaterThan(landscape.fov);
  });

  it('zooms into the open-front cutaway dollhouse room when focused', () => {
    const framing = new CameraFraming();
    const roam = framing.compute(1.6, -12.5, null);
    const zoomed = framing.compute(1.6, -12.5, -13);

    expect(zoomed.position.x).toBe(-13);
    expect(zoomed.position.z).toBeGreaterThan(roam.position.z);
    expect(zoomed.target.z).toBeGreaterThan(roam.target.z);
    expect(zoomed.fov).toBeLessThan(roam.fov);
  });

  it('rejects non-positive or non-finite aspect ratios and handles portrait focus pullback', () => {
    const framing = new CameraFraming();
    expect(() => framing.compute(0, 0)).toThrow(RangeError);
    expect(() => framing.compute(-1, 0)).toThrow(RangeError);
    expect(() => framing.compute(Number.NaN, 0)).toThrow(RangeError);
    expect(() => framing.compute(Number.POSITIVE_INFINITY, 0)).toThrow(RangeError);

    const portraitFocus = framing.compute(0.45, 0, -13);
    const landscapeFocus = framing.compute(1.6, 0, -13);
    expect(portraitFocus.position.z).toBeLessThan(landscapeFocus.position.z);
  });

  it('zooms out during combat so portrait viewports frame full auto-shoot range', () => {
    const framing = new CameraFraming();
    const portraitAspect = 390 / 844;
    const peacePortrait = framing.compute(portraitAspect, 0, null, false);
    const combatPortrait = framing.compute(portraitAspect, 0, null, true);

    expect(combatPortrait.position.z).toBeLessThan(peacePortrait.position.z - 15);
    expect(combatPortrait.fov).toBeGreaterThan(peacePortrait.fov);
    const visibleHalfWidth = Math.abs(combatPortrait.position.z) * portraitAspect * Math.tan(combatPortrait.fov * 0.5);
    expect(visibleHalfWidth).toBeGreaterThanOrEqual(PLAYER_AUTOSHOOT_RANGE);

    const peaceLandscape = framing.compute(16 / 9, 0, null, false);
    const combatLandscape = framing.compute(16 / 9, 0, null, true);
    expect(combatLandscape.position.z).toBeLessThan(peaceLandscape.position.z);

    // Focusing a dollhouse still zooms in even during combat
    const focusCombat = framing.compute(portraitAspect, -13, -13, true);
    expect(focusCombat.position.z).toBeGreaterThan(combatPortrait.position.z);
  });
});
