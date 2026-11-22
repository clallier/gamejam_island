import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { CameraFraming, type CameraPose } from './CameraFraming.ts';
import { CAMERA_DAMP_SPEED } from './constants.ts';

/**
 * Elevated 3/4 miniature tabletop camera controller with smooth exponential
 * damping and automatic portrait/landscape/dollhouse-zoom framing.
 */
export class DioramaCamera {
  private readonly camera: FreeCamera;
  private readonly framing: CameraFraming;
  private readonly currentTarget = new Vector3(0, 1.4, 0.9);

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
   * @example
   * cam.snap(canvas.width / canvas.height, 0);
   */
  public snap(aspectRatio: number, playerX: number): void {
    const pose = this.framing.compute(aspectRatio, playerX, null);
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
   * @example
   * cam.update(dt, aspect, player.getX(), activeDollhouseX);
   */
  public update(
    deltaSeconds: number,
    aspectRatio: number,
    playerX: number,
    focusDollhouseX: number | null,
  ): void {
    const pose = this.framing.compute(aspectRatio, playerX, focusDollhouseX);
    const alpha = 1 - Math.exp(-CAMERA_DAMP_SPEED * Math.max(0, deltaSeconds));
    this._lerpCamera(pose, alpha);
  }

  private _lerpCamera(pose: CameraPose, alpha: number): void {
    this.camera.position.x = Scalar.Lerp(this.camera.position.x, pose.position.x, alpha);
    this.camera.position.y = Scalar.Lerp(this.camera.position.y, pose.position.y, alpha);
    this.camera.position.z = Scalar.Lerp(this.camera.position.z, pose.position.z, alpha);
    this.currentTarget.x = Scalar.Lerp(this.currentTarget.x, pose.target.x, alpha);
    this.currentTarget.y = Scalar.Lerp(this.currentTarget.y, pose.target.y, alpha);
    this.currentTarget.z = Scalar.Lerp(this.currentTarget.z, pose.target.z, alpha);
    this.camera.fov = Scalar.Lerp(this.camera.fov, pose.fov, alpha);
    this.camera.setTarget(this.currentTarget);
  }
}
