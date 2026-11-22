import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { CameraFraming, type CameraPose } from './CameraFraming.ts';
import { CAMERA_DAMP_SPEED, CAMERA_ZOOM_DAMP_SPEED } from './constants.ts';

/**
 * Elevated 3/4 miniature tabletop camera controller with smooth exponential
 * damping and automatic portrait/landscape/dollhouse-zoom framing.
 */
export class DioramaCamera {
  private readonly camera: FreeCamera;
  private readonly framing: CameraFraming;
  private readonly currentTarget = new Vector3(0, 1.4, 0.9);
  private smoothedLeadX = 0;

  /**
   * Creates and registers the active diorama `FreeCamera` on the scene.
   *
   * @param scene Target Babylon `Scene`.
   * @param framing Framing calculator. Defaults to `new CameraFraming()`.
   * @example
   * const cam = new DioramaCamera(scene);
   */
  public constructor(scene: Scene, framing = new CameraFraming()) {
    this.framing = framing;
    this.camera = new FreeCamera('diorama-camera', new Vector3(0, 7, -15), scene);
    this.camera.minZ = 0.4;
    this.camera.maxZ = 180;
    scene.activeCamera = this.camera;
  }

  /**
   * Immediately snaps the camera to the target framing without damping.
   *
   * @param aspectRatio Canvas width / height ratio.
   * @param playerX Initial player X position.
   * @param facing Optional initial facing direction (`-1`, `0`, `1`) for lead framing. Defaults to `0`.
   * @throws Error Propagates `RangeError` if `aspectRatio` is invalid.
   * @example
   * cam.snap(canvas.width / canvas.height, 0, 1);
   */
  public snap(aspectRatio: number, playerX: number, facing: -1 | 0 | 1 = 0): void {
    const pose = this.framing.compute(aspectRatio, playerX, null, false, facing);
    this.smoothedLeadX = pose.position.x - playerX;
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.currentTarget.set(pose.target.x, pose.target.y, pose.target.z);
    this.camera.fov = pose.fov;
    this.camera.setTarget(this.currentTarget);
  }

  /**
   * Smoothly advances camera position, look target, and FOV toward ideal pose.
   *
   * @param deltaSeconds Elapsed frame time in seconds.
   * @param aspectRatio Current viewport aspect ratio (`width / height`).
   * @param playerX Current player X coordinate.
   * @param focusDollhouseX Focused dollhouse X coordinate, or `null` when roaming.
   * @param inCombat When `true`, zooms out during battle to frame approaching enemies.
   * @param facing Facing direction (`-1`, `0`, `1`) shifting camera ahead of player during roam and combat.
   * @throws Error Propagates `RangeError` if `aspectRatio` is invalid.
   * @example
   * cam.update(dt, aspect, player.getX(), activeDollhouseX, true, 1);
   */
  public update(
    deltaSeconds: number,
    aspectRatio: number,
    playerX: number,
    focusDollhouseX: number | null,
    inCombat = false,
    facing: -1 | 0 | 1 = 0,
  ): void {
    const pose = this.framing.compute(aspectRatio, playerX, focusDollhouseX, inCombat, facing);
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const followAlpha = 1 - Math.exp(-CAMERA_DAMP_SPEED * dt);
    const zoomAlpha = 1 - Math.exp(-CAMERA_ZOOM_DAMP_SPEED * dt);
    const anchorX = focusDollhouseX ?? playerX;
    this.smoothedLeadX = Scalar.Lerp(this.smoothedLeadX, pose.position.x - anchorX, zoomAlpha);
    this._lerpCamera(pose, anchorX + this.smoothedLeadX, followAlpha, zoomAlpha);
  }

  private _lerpCamera(pose: CameraPose, targetX: number, followAlpha: number, zoomAlpha: number): void {
    this.camera.position.x = Scalar.Lerp(this.camera.position.x, targetX, followAlpha);
    this.camera.position.y = Scalar.Lerp(this.camera.position.y, pose.position.y, zoomAlpha);
    this.camera.position.z = Scalar.Lerp(this.camera.position.z, pose.position.z, zoomAlpha);
    this.currentTarget.x = Scalar.Lerp(this.currentTarget.x, targetX, followAlpha);
    this.currentTarget.y = Scalar.Lerp(this.currentTarget.y, pose.target.y, zoomAlpha);
    this.currentTarget.z = Scalar.Lerp(this.currentTarget.z, pose.target.z, zoomAlpha);
    this.camera.fov = Scalar.Lerp(this.camera.fov, pose.fov, zoomAlpha);
    this.camera.setTarget(this.currentTarget);
  }
}
