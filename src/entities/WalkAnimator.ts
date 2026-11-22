import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { AssembledModel } from '../assets/ModularAssemblyFactory.ts';

/**
 * Per-frame procedural walk metrics emitted by `WalkAnimator.update`.
 */
export interface WalkFrameState {
  readonly moving: boolean;
  readonly stepped: boolean;
  readonly bounceY: number;
  readonly strideScaleY: number;
}

/**
 * Shared procedural 2-legged walk cycle animator driving alternating leg swing,
 * subtle waddle roll, step-trigger events, and stride squash-and-stretch.
 */
export class WalkAnimator {
  private static readonly MIN_MOVE_SPEED = 0.25;
  private static readonly LEG_SWING_RAD = 0.55;
  private static readonly WADDLE_ROLL_RAD = 0.06;
  private static readonly BOUNCE_HEIGHT = 0.08;
  private static readonly STRIDE_STRETCH = 0.08;
  private static readonly DAMP_SPEED = 14;

  private readonly root: TransformNode;
  private readonly legL: AbstractMesh | null;
  private readonly legR: AbstractMesh | null;
  private stridePhase = 0;
  private lastStepIndex = 0;

  /**
   * Resolves left/right leg child meshes on an assembled modular character.
   *
   * @param model Target `AssembledModel` containing optional `-leg-l` and `-leg-r` meshes.
   * @throws Error Never thrown; safely skips missing leg meshes.
   * @example
   * const walk = new WalkAnimator(standeeModel);
   */
  public constructor(model: AssembledModel) {
    this.root = model.root;
    const meshes = model.getMeshes();
    this.legL = meshes.find((m) => m.name.endsWith('-leg-l')) ?? null;
    this.legR = meshes.find((m) => m.name.endsWith('-leg-r')) ?? null;
  }

  /**
   * Advances the procedural walk cycle when moving on ground, or damps back to rest pose.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @param speed Horizontal travel speed in world units/sec.
   * @param grounded Whether the character is on the ground. Defaults to `true`.
   * @returns Immutable `WalkFrameState` containing step pulse, vertical bounce, and Y stretch.
   * @throws Error Never thrown.
   * @example
   * const walk = walkAnim.update(dt, 4.5, true);
   */
  public update(deltaSeconds: number, speed: number, grounded = true): WalkFrameState {
    const safeDt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const absSpeed = Number.isFinite(speed) ? Math.abs(speed) : 0;
    if (!grounded || absSpeed < WalkAnimator.MIN_MOVE_SPEED) {
      return this._dampToRest(safeDt);
    }
    this.stridePhase += safeDt * Math.min(18, 8 + absSpeed * 1.1);
    const stepIndex = Math.floor(this.stridePhase / Math.PI);
    const stepped = stepIndex > this.lastStepIndex;
    if (stepped) this.lastStepIndex = stepIndex;
    const swing = Math.sin(this.stridePhase);
    this._applyStridePose(swing * WalkAnimator.LEG_SWING_RAD, swing * WalkAnimator.WADDLE_ROLL_RAD);
    const lift = Math.abs(swing);
    return {
      moving: true,
      stepped,
      bounceY: lift * WalkAnimator.BOUNCE_HEIGHT,
      strideScaleY: 1 + lift * WalkAnimator.STRIDE_STRETCH,
    };
  }

  private _dampToRest(dt: number): WalkFrameState {
    const alpha = 1 - Math.exp(-WalkAnimator.DAMP_SPEED * dt);
    if (this.legL) this.legL.rotation.x = Scalar.Lerp(this.legL.rotation.x, 0, alpha);
    if (this.legR) this.legR.rotation.x = Scalar.Lerp(this.legR.rotation.x, 0, alpha);
    this.root.rotation.z = Scalar.Lerp(this.root.rotation.z, 0, alpha);
    return { moving: false, stepped: false, bounceY: 0, strideScaleY: 1 };
  }

  private _applyStridePose(legRad: number, rollRad: number): void {
    if (this.legL) this.legL.rotation.x = legRad;
    if (this.legR) this.legR.rotation.x = -legRad;
    this.root.rotation.z = rollRad;
  }
}
