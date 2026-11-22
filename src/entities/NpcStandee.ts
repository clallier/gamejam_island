import type { AssembledModel } from '../assets/ModularAssemblyFactory.ts';
import type { DollhousePlot } from '../world/constants.ts';
import {
  NPC_BOB_AMPLITUDE,
  NPC_BOB_SPEED,
  NPC_LOOK_DISTANCE,
} from './constants.ts';

/**
 * Cozy villager standee placed at an open-front dollhouse porch/room,
 * idling gently and turning to greet the player when nearby.
 */
export class NpcStandee {
  private static readonly BASE_Y = 0.28;
  private static readonly BASE_Z = 1.6;

  private readonly plot: DollhousePlot;
  private readonly model: AssembledModel;
  private readonly phaseOffset: number;
  private celebrateTimer = 0;
  private patrolX: number | null = null;

  /**
   * Positions an assembled modular NPC inside/in front of their dollhouse plot.
   *
   * @param plot Owning `DollhousePlot` metadata and X coordinate.
   * @param model Assembled modular villager model.
   * @param index Ordering index used to desynchronize idle breathing phase.
   * @example
   * const standee = new NpcStandee(plot, npcModel, 0);
   */
  public constructor(plot: DollhousePlot, model: AssembledModel, index: number) {
    this.plot = plot;
    this.model = model;
    this.phaseOffset = index * 1.4;
    this.model.root.position.set(plot.x + 0.75, NpcStandee.BASE_Y, NpcStandee.BASE_Z);
    this.model.root.rotation.y = Math.PI;
  }

  /**
   * Updates idle bobbing, celebration hops, and gently rotates to face the player when close.
   *
   * @param elapsedSeconds Total elapsed simulation seconds.
   * @param deltaSeconds Frame delta in seconds.
   * @param playerX Current player X coordinate.
   * @throws Error Never thrown during animation updates.
   * @example
   * standee.update(elapsed, dt, player.getX());
   */
  public update(elapsedSeconds: number, deltaSeconds: number, playerX: number): void {
    const bob = Math.sin(elapsedSeconds * NPC_BOB_SPEED + this.phaseOffset) * NPC_BOB_AMPLITUDE;
    if (this.celebrateTimer > 0) this.celebrateTimer = Math.max(0, this.celebrateTimer - deltaSeconds);
    const hop = this.celebrateTimer > 0 ? Math.abs(Math.sin(this.celebrateTimer * Math.PI * 3)) * 0.35 : 0;
    const alpha = 1 - Math.exp(-6 * Math.max(0, deltaSeconds));
    this._updatePosition(alpha, bob + hop);
    const dx = playerX - this.model.root.position.x;
    const targetYaw = Math.abs(dx) <= NPC_LOOK_DISTANCE ? Math.atan2(dx, -1.6) : Math.PI;
    this.model.root.rotation.y = this._lerpAngle(this.model.root.rotation.y, targetYaw, alpha);
  }

  /**
   * Assigns an active road X coordinate for night patrol, or `null` to return home.
   *
   * @param x Target road X coordinate, or `null` for porch rest position.
   * @throws Error Never thrown.
   * @example
   * standee.setPatrolX(22);
   */
  public setPatrolX(x: number | null): void {
    this.patrolX = x;
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

  private _updatePosition(alpha: number, yOffset: number): void {
    const targetX = this.patrolX ?? (this.plot.x + 0.75);
    const targetZ = this.patrolX !== null ? 0.4 : NpcStandee.BASE_Z;
    this.model.root.position.x += (targetX - this.model.root.position.x) * alpha;
    this.model.root.position.z += (targetZ - this.model.root.position.z) * alpha;
    this.model.root.position.y = NpcStandee.BASE_Y + yOffset;
  }

  private _lerpAngle(from: number, to: number, alpha: number): number {
    const diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return from + diff * alpha;
  }
}
