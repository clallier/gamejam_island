import { describe, expect, it } from 'vitest';
import { CameraFraming } from '../../src/engine/CameraFraming.ts';
import { PLAYER_AUTOSHOOT_RANGE } from '../../src/systems/constants.ts';

describe('CameraFraming', () => {
  it('pulls camera further back and widens FOV in mobile portrait aspect ratios', () => {
    const framing = new CameraFraming();
    const portrait = framing.compute(390 / 844, 4);
    const landscape = framing.compute(1280 / 800, 4);

    expect(portrait.position.x).toBe(4);
    expect(portrait.position.z).toBeLessThanOrEqual(-24);
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
    const focusCombat = framing.compute(portraitAspect, -13, -13, true, 1);
    expect(focusCombat.position.z).toBeGreaterThan(combatPortrait.position.z);
    expect(focusCombat.position.x).toBe(-13);
  });

  it('offsets combat camera toward incoming enemies so player sits on the opposite screen side', () => {
    const framing = new CameraFraming();
    const portraitRight = framing.compute(390 / 844, 10, null, true, 1);
    const portraitLeft = framing.compute(390 / 844, 10, null, true, -1);
    const landscapeRight = framing.compute(16 / 9, 10, null, true, 1);
    const landscapeLeft = framing.compute(16 / 9, 10, null, true, -1);

    // Facing right places camera & target ahead (> playerX) so player stands on screen left
    expect(portraitRight.position.x).toBeGreaterThan(14);
    expect(portraitRight.target.x).toBe(portraitRight.position.x);
    expect(landscapeRight.position.x).toBeGreaterThan(12);

    // Facing left mirrors camera & target behind (< playerX) so player stands on screen right
    expect(portraitLeft.position.x).toBeLessThan(6);
    expect(portraitLeft.target.x).toBe(portraitLeft.position.x);
    expect(landscapeLeft.position.x).toBeLessThan(8);

    // Forward sightline in portrait combat covers well past bow range
    const halfWidth = Math.abs(portraitRight.position.z) * (390 / 844) * Math.tan(portraitRight.fov * 0.5);
    expect(halfWidth + (portraitRight.position.x - 10)).toBeGreaterThan(PLAYER_AUTOSHOOT_RANGE * 1.4);
  });

  it('keeps directional off-center lead active during daytime roam while centering dollhouse focus', () => {
    const framing = new CameraFraming();
    const portraitDayRight = framing.compute(390 / 844, 10, null, false, 1);
    const portraitDayLeft = framing.compute(390 / 844, 10, null, false, -1);
    const landscapeDayRight = framing.compute(16 / 9, 10, null, false, 1);
    const focusPortrait = framing.compute(390 / 844, 10, -13, false, 1);

    expect(portraitDayRight.position.x).toBeGreaterThan(12);
    expect(portraitDayRight.target.x).toBe(portraitDayRight.position.x);
    expect(portraitDayLeft.position.x).toBeLessThan(8);
    expect(landscapeDayRight.position.x).toBeGreaterThan(12);
    expect(focusPortrait.position.x).toBe(-13);
  });
});
