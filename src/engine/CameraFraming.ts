import {
  CAMERA_COMBAT_LEAD_RATIO,
  CAMERA_FOV_FOCUS,
  CAMERA_FOV_LANDSCAPE,
  CAMERA_FOV_LANDSCAPE_COMBAT,
  CAMERA_FOV_PORTRAIT,
  CAMERA_FOV_PORTRAIT_COMBAT,
  CAMERA_PORTRAIT_COMBAT_HALF_WIDTH,
  CAMERA_PORTRAIT_THRESHOLD,
} from './constants.ts';

export interface CameraVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CameraPose {
  readonly position: CameraVector;
  readonly target: CameraVector;
  readonly fov: number;
}

/**
 * Pure deterministic framing calculator for the elevated 3/4 miniature
 * tabletop camera across mobile portrait, desktop landscape, and combat zoom-out.
 */
export class CameraFraming {
  private static readonly LANDSCAPE_OFFSET = { y: 6.9, z: -15.4, targetY: 1.25 };
  private static readonly PORTRAIT_OFFSET = { y: 9.8, z: -24.0, targetY: 1.15 };
  private static readonly FOCUS_OFFSET = { y: 2.95, z: -8.6, targetY: 1.55 };

  /**
   * Computes ideal camera position, target, and vertical FOV for a viewport.
   *
   * @param aspectRatio Canvas width divided by height.
   * @param playerX Player X position along the 1D road.
   * @param focusDollhouseX Optional dollhouse X to zoom inside its cutaway room.
   * @param inCombat When `true`, zooms out during combat so auto-shoot targets stay framed in portrait mode.
   * @param facing Facing direction (`-1`, `0`, `1`) shifting the camera ahead of the hero during roam and combat.
   * @returns Immutable `CameraPose`.
   * @throws {RangeError} When `aspectRatio` is not finite or non-positive.
   * @example
   * const pose = new CameraFraming().compute(0.46, 0, null, true, 1);
   */
  public compute(
    aspectRatio: number,
    playerX: number,
    focusDollhouseX: number | null = null,
    inCombat = false,
    facing: -1 | 0 | 1 = 0,
  ): CameraPose {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      throw new RangeError('aspectRatio must be a positive finite number');
    }
    if (focusDollhouseX !== null) {
      return this._computeFocusPose(aspectRatio, focusDollhouseX);
    }
    return this._computeRoamPose(aspectRatio, playerX, inCombat, facing);
  }

  private _computeRoamPose(
    aspectRatio: number,
    playerX: number,
    inCombat: boolean,
    facing: -1 | 0 | 1,
  ): CameraPose {
    const isPortrait = aspectRatio < CAMERA_PORTRAIT_THRESHOLD;
    if (inCombat) return this._computeCombatPose(aspectRatio, playerX, isPortrait, facing);
    const base = isPortrait ? CameraFraming.PORTRAIT_OFFSET : CameraFraming.LANDSCAPE_OFFSET;
    const extraBack = isPortrait ? Math.max(0, 0.6 - aspectRatio) * 10 : 0;
    const z = base.z - extraBack;
    const fov = isPortrait ? CAMERA_FOV_PORTRAIT : CAMERA_FOV_LANDSCAPE;
    const leadX = this._computeLeadX(Math.abs(z), aspectRatio, fov, facing);
    return {
      position: { x: playerX + leadX, y: base.y + extraBack * 0.25, z },
      target: { x: playerX + leadX, y: base.targetY, z: 0.9 },
      fov,
    };
  }

  private _computeCombatPose(
    aspectRatio: number,
    playerX: number,
    isPortrait: boolean,
    combatFacing: -1 | 0 | 1,
  ): CameraPose {
    if (isPortrait) {
      return this._computePortraitCombatPose(aspectRatio, playerX, combatFacing);
    }
    const l = CameraFraming.LANDSCAPE_OFFSET;
    const dist = Math.abs(l.z - 6.0);
    const leadX = this._computeLeadX(dist, aspectRatio, CAMERA_FOV_LANDSCAPE_COMBAT, combatFacing);
    return {
      position: { x: playerX + leadX, y: l.y + 2.4, z: l.z - 6.0 },
      target: { x: playerX + leadX, y: l.targetY, z: 0.9 },
      fov: CAMERA_FOV_LANDSCAPE_COMBAT,
    };
  }

  private _computePortraitCombatPose(
    aspectRatio: number,
    playerX: number,
    combatFacing: -1 | 0 | 1,
  ): CameraPose {
    const base = CameraFraming.PORTRAIT_OFFSET;
    const fov = CAMERA_FOV_PORTRAIT_COMBAT;
    const neededDist = CAMERA_PORTRAIT_COMBAT_HALF_WIDTH / (aspectRatio * Math.tan(fov * 0.5));
    const combatDist = Math.min(62, Math.max(26, neededDist));
    const leadX = this._computeLeadX(combatDist, aspectRatio, fov, combatFacing);
    return {
      position: { x: playerX + leadX, y: base.y + (combatDist - Math.abs(base.z)) * 0.34, z: -combatDist },
      target: { x: playerX + leadX, y: base.targetY, z: 0.9 },
      fov,
    };
  }

  private _computeLeadX(
    dist: number,
    aspectRatio: number,
    fov: number,
    combatFacing: -1 | 0 | 1,
  ): number {
    if (combatFacing === 0) return 0;
    const visibleHalfWidth = dist * aspectRatio * Math.tan(fov * 0.5);
    return combatFacing * visibleHalfWidth * CAMERA_COMBAT_LEAD_RATIO;
  }

  private _computeFocusPose(aspectRatio: number, dollhouseX: number): CameraPose {
    const isPortrait = aspectRatio < CAMERA_PORTRAIT_THRESHOLD;
    const pullBack = isPortrait ? 2.6 : 0;
    const f = CameraFraming.FOCUS_OFFSET;
    return {
      position: { x: dollhouseX, y: f.y + pullBack * 0.2, z: f.z - pullBack },
      target: { x: dollhouseX, y: f.targetY, z: 2.8 },
      fov: CAMERA_FOV_FOCUS,
    };
  }
}
