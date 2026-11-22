import type { AssembledModel } from '../assets/ModularAssemblyFactory.ts';
import { type BalanceSheet, defaultBalanceSheet } from '../config/BalanceSheet.ts';
import type { DollhousePlot } from '../world/constants.ts';
import { AttackAnimator } from './AttackAnimator.ts';
import {
  NPC_BOB_AMPLITUDE,
  NPC_BOB_SPEED,
  NPC_LOOK_DISTANCE,
} from './constants.ts';
import { WalkAnimator } from './WalkAnimator.ts';

/**
 * Cozy villager standee placed at an open-front dollhouse porch/room,
 * idling gently and turning to greet the player when nearby.
 */
export class NpcStandee {
  private static readonly BASE_Y = 0.28;
  private static readonly BASE_Z = 1.6;

  private readonly plot: DollhousePlot;
  private readonly model: AssembledModel;
  private readonly balance: BalanceSheet;
  private readonly attackAnim: AttackAnimator;
  private readonly walkAnim: WalkAnimator;
  private readonly phaseOffset: number;
  private celebrateTimer = 0;
  private patrolX: number | null = null;
  private visualBaseX: number;

  /**
   * Positions an assembled modular NPC inside/in front of their dollhouse plot.
   *
   * @param plot Owning `DollhousePlot` metadata and X coordinate.
   * @param model Assembled modular villager model.
   * @param index Ordering index used to desynchronize idle breathing phase.
   * @param balance Runtime `BalanceSheet` providing live villager walk speed.
   * @example
   * const standee = new NpcStandee(plot, npcModel, 0);
   */
  public constructor(
    plot: DollhousePlot,
    model: AssembledModel,
    index: number,
    balance: BalanceSheet = defaultBalanceSheet,
  ) {
    this.plot = plot;
    this.model = model;
    this.balance = balance;
    this.attackAnim = new AttackAnimator(model);
    this.walkAnim = new WalkAnimator(model);
    this.phaseOffset = index * 1.4;
    this.visualBaseX = plot.x + 0.75;
    this.model.root.position.set(this.visualBaseX, NpcStandee.BASE_Y, NpcStandee.BASE_Z);
    this.model.root.rotation.y = Math.PI;
  }

  /**
   * Updates idle bobbing, walk leg cycles, celebration hops, weapon strikes, and facing rotation.
   *
   * @param elapsedSeconds Total elapsed simulation seconds.
   * @param deltaSeconds Frame delta in seconds.
   * @param playerX Current player X coordinate.
   * @throws Error Never thrown during animation updates.
   * @example
   * standee.update(elapsed, dt, player.getX());
   */
  public update(elapsedSeconds: number, deltaSeconds: number, playerX: number): void {
    const safeDt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const bob = Math.sin(elapsedSeconds * NPC_BOB_SPEED + this.phaseOffset) * NPC_BOB_AMPLITUDE;
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - safeDt);
    const hop = this.celebrateTimer > 0 ? Math.abs(Math.sin(this.celebrateTimer * Math.PI * 3)) * 0.35 : 0;
    const lungeX = this.attackAnim.update(safeDt);
    const alpha = 1 - Math.exp(-6 * safeDt);
    const moveDx = this._stepLocomotion(safeDt, bob + hop, lungeX);
    this._updateFacing(alpha, playerX, Math.abs(moveDx) > 0.001 ? moveDx : 0);
  }

  /**
   * Assigns an active road X coordinate while defending against monsters, or `null` to return home.
   *
   * @param x Target road X coordinate, or `null` for porch rest position.
   * @throws Error Never thrown.
   * @example
   * standee.setPatrolX(22);
   */
  public setPatrolX(x: number | null): void {
    this.patrolX = x !== null && Number.isFinite(x) ? x : null;
  }

  /**
   * Plays a procedural spear-thrust attack animation toward `direction`.
   *
   * @param direction World X attack sign (`1` right, `-1` left).
   * @throws Error Never thrown.
   * @example
   * standee.triggerAttack(1);
   */
  public triggerAttack(direction: 1 | -1): void {
    this.attackAnim.trigger(direction, 'thrust', 0.16);
  }

  /**
   * Triggers a brief joyful double-hop animation during hang-outs or room decorating.
   *
   * @throws Error Never thrown.
   * @example
   * standee.triggerCelebrate();
   */
  public triggerCelebrate(): void {
    this.celebrateTimer = 0.65;
  }

  /**
   * Exposes the `DollhousePlot` represented by this villager.
   *
   * @returns Read-only `DollhousePlot`.
   * @example
   * const info = standee.getPlot();
   */
  public getPlot(): DollhousePlot {
    return this.plot;
  }

  private _stepLocomotion(dt: number, yOffset: number, lungeX: number): number {
    const targetX = this.patrolX ?? (this.plot.x + 0.75);
    const targetZ = this.patrolX !== null ? 0.4 : NpcStandee.BASE_Z;
    const deltaX = targetX - this.visualBaseX;
    const deltaZ = targetZ - this.model.root.position.z;
    const dist = Math.hypot(deltaX, deltaZ);
    const moveSpeed = this.balance.getWorld('npcMoveSpeedTiles');
    const ratio = dist > 0 ? Math.min(1, (moveSpeed * dt) / dist) : 0;
    const dx = deltaX * ratio;
    const dz = deltaZ * ratio;
    this.visualBaseX += dx;
    this.model.root.position.x = this.visualBaseX + lungeX;
    this.model.root.position.z += dz;
    const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    const walk = this.walkAnim.update(dt, speed, true);
    this.model.root.position.y = NpcStandee.BASE_Y + yOffset + walk.bounceY;
    const invXZ = 1 / Math.sqrt(walk.strideScaleY);
    this.model.root.scaling.set(invXZ, walk.strideScaleY, invXZ);
    return walk.moving ? dx : 0;
  }

  private _updateFacing(alpha: number, playerX: number, walkDx: number): void {
    let targetYaw = Math.PI;
    if (this.attackAnim.isActive()) {
      targetYaw = this.attackAnim.getDirection() > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (walkDx !== 0) {
      targetYaw = walkDx > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (Math.abs(playerX - this.visualBaseX) <= NPC_LOOK_DISTANCE) {
      targetYaw = Math.atan2(playerX - this.visualBaseX, -1.6);
    }
    this.model.root.rotation.y = this._lerpAngle(this.model.root.rotation.y, targetYaw, alpha);
  }

  private _lerpAngle(from: number, to: number, alpha: number): number {
    const diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return from + diff * alpha;
  }
}
