import {
  CAMERA_FOV_FOCUS,
  CAMERA_FOV_LANDSCAPE,
  CAMERA_FOV_PORTRAIT,
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
 * tabletop camera across mobile portrait and desktop landscape viewports.
 */
export class CameraFraming {
  private static readonly LANDSCAPE_OFFSET = { y: 6.9, z: -15.4, targetY: 1.25 };
  private static readonly PORTRAIT_OFFSET = { y: 8.2, z: -18.8, targetY: 1.1 };
  private static readonly FOCUS_OFFSET = { y: 2.95, z: -8.6, targetY: 1.55 };

  /**
   * Computes ideal camera position, target, and vertical FOV for a viewport.
   *
   * @param aspectRatio Canvas width divided by height.
   * @param playerX Player X position along the 1D road.
   * @param focusDollhouseX Optional dollhouse X to zoom inside its cutaway room.
   * @returns Immutable `CameraPose`.
   * @throws {RangeError} When `aspectRatio` is not finite or non-positive.
   * @example
   * const pose = new CameraFraming().compute(0.46, -13, -13);
   */
  public compute(
    aspectRatio: number,
    playerX: number,
    focusDollhouseX: number | null = null,
  ): CameraPose {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      throw new RangeError('aspectRatio must be a positive finite number');
    }
    if (focusDollhouseX !== null) {
      return this._computeFocusPose(aspectRatio, focusDollhouseX);
    }
    return this._computeRoamPose(aspectRatio, playerX);
  }

  private _computeRoamPose(aspectRatio: number, playerX: number): CameraPose {
    const isPortrait = aspectRatio < CAMERA_PORTRAIT_THRESHOLD;
    const base = isPortrait ? CameraFraming.PORTRAIT_OFFSET : CameraFraming.LANDSCAPE_OFFSET;
    const extraBack = isPortrait ? Math.max(0, 0.56 - aspectRatio) * 8.5 : 0;
    return {
      position: { x: playerX, y: base.y + extraBack * 0.25, z: base.z - extraBack },
      target: { x: playerX, y: base.targetY, z: 0.9 },
      fov: isPortrait ? CAMERA_FOV_PORTRAIT : CAMERA_FOV_LANDSCAPE,
    };
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
