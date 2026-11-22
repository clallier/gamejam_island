import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { AssembledModel } from '../assets/ModularAssemblyFactory.ts';

export type AttackStyle = 'thrust' | 'swing';

/**
 * Procedural 3-phase weapon strike animator operating on a modular `AssembledModel`'s
 * `hand_right` socket and root lean without touching physics colliders.
 */
export class AttackAnimator {
  private static readonly DEFAULT_DURATION = 0.22;
  private static readonly THRUST_EXTEND_Z = 1.15;
  private static readonly THRUST_PITCH_X = Math.PI * 0.44;
  private static readonly LUNGE_DISTANCE = 0.42;

  private readonly root: TransformNode;
  private readonly handSocket: TransformNode | null;
  private active = false;
  private elapsed = 0;
  private duration = AttackAnimator.DEFAULT_DURATION;
  private direction: 1 | -1 = 1;
  private style: AttackStyle = 'thrust';

  /**
   * Binds an `AttackAnimator` to an assembled modular character hierarchy.
   *
   * @param model Target `AssembledModel` exposing a `hand_right` weapon socket.
   * @throws Error Never thrown; safely no-ops socket transforms if missing.
   * @example
   * const anim = new AttackAnimator(npcModel);
   */
  public constructor(model: AssembledModel) {
    this.root = model.root;
    this.handSocket = model.getSocket('hand_right') ?? null;
  }

  /**
   * Starts or restarts a procedural wind-up, strike, and recovery animation.
   *
   * @param direction World horizontal strike sign (`1` right, `-1` left).
   * @param style Motion profile (`'thrust'` for spears or `'swing'` for blades/tools). Defaults to `'thrust'`.
   * @param duration Total animation length in seconds. Defaults to `0.22`.
   * @throws Error Never thrown.
   * @example
   * anim.trigger(1, 'thrust');
   */
  public trigger(
    direction: 1 | -1,
    style: AttackStyle = 'thrust',
    duration = AttackAnimator.DEFAULT_DURATION,
  ): void {
    this.active = true;
    this.elapsed = 0;
    this.direction = direction;
    this.style = style;
    this.duration = Math.max(0.05, Number.isFinite(duration) ? duration : AttackAnimator.DEFAULT_DURATION);
  }

  /**
   * Advances the active strike pose and returns the current horizontal lunge offset.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @returns Signed world X lunge offset (`0` when idle).
   * @throws Error Never thrown.
   * @example
   * const lungeX = anim.update(dt);
   */
  public update(deltaSeconds: number): number {
    if (!this.active) return 0;
    const safeDt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.elapsed += safeDt;
    if (this.elapsed >= this.duration) {
      this._resetPose();
      return 0;
    }
    const progress = this.elapsed / this.duration;
    const factor = this.style === 'thrust'
      ? this._evaluateSlideCurve(progress)
      : this._evaluateSwingCurve(progress);
    this._applyPose(factor);
    return this.direction * AttackAnimator.LUNGE_DISTANCE * Math.max(0, factor);
  }

  /**
   * Reports whether an attack animation is currently in progress.
   *
   * @returns `true` while winding up, striking, or recovering.
   * @throws Error Never thrown.
   * @example
   * if (anim.isActive()) faceTarget();
   */
  public isActive(): boolean {
    return this.active;
  }

  /**
   * Returns the horizontal direction of the active or most recent attack.
   *
   * @returns `1` for `+X` or `-1` for `-X`.
   * @throws Error Never thrown.
   * @example
   * const dir = anim.getDirection();
   */
  public getDirection(): 1 | -1 {
    return this.direction;
  }

  private _evaluateSlideCurve(progress: number): number {
    if (progress < 0.35) return progress / 0.35;
    return 1 - (progress - 0.35) / 0.65;
  }

  private _evaluateSwingCurve(progress: number): number {
    if (progress < 0.25) return -0.22 * (progress / 0.25);
    if (progress < 0.55) return -0.22 + 1.22 * ((progress - 0.25) / 0.3);
    return 1 - (progress - 0.55) / 0.45;
  }

  private _applyPose(factor: number): void {
    const isSwing = this.style === 'swing';
    this.root.rotation.x = isSwing ? 0.22 * factor : 0;
    if (!this.handSocket) return;
    this.handSocket.position.z = AttackAnimator.THRUST_EXTEND_Z * (isSwing ? 0.55 : 1) * factor;
    this.handSocket.rotation.x = isSwing ? AttackAnimator.THRUST_PITCH_X * factor : Math.PI * 0.5;
    this.handSocket.rotation.y = isSwing ? -0.9 * factor : 0;
    this.handSocket.rotation.z = isSwing ? -0.35 * factor : 0;
  }

  private _resetPose(): void {
    this.active = false;
    this.elapsed = 0;
    this.root.rotation.x = 0;
    if (!this.handSocket) return;
    this.handSocket.position.z = 0;
    this.handSocket.rotation.set(0, 0, 0);
  }
}
