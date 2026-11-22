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
   * Updates idle bobbing and gently rotates to face the player when close.
   *
   * @param elapsedSeconds Total elapsed simulation seconds.
   * @param deltaSeconds Frame delta in seconds.
   * @param playerX Current player X coordinate.
   * @example
   * standee.update(elapsed, dt, player.getX());
   */
  public update(elapsedSeconds: number, deltaSeconds: number, playerX: number): void {
    const bob = Math.sin(elapsedSeconds * NPC_BOB_SPEED + this.phaseOffset) * NPC_BOB_AMPLITUDE;
    this.model.root.position.y = NpcStandee.BASE_Y + bob;
    const dx = playerX - this.model.root.position.x;
    const targetYaw = Math.abs(dx) <= NPC_LOOK_DISTANCE ? Math.atan2(dx, -1.6) : Math.PI;
    const alpha = 1 - Math.exp(-6 * Math.max(0, deltaSeconds));
    this.model.root.rotation.y = this._lerpAngle(this.model.root.rotation.y, targetYaw, alpha);
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

  private _lerpAngle(from: number, to: number, alpha: number): number {
    const diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return from + diff * alpha;
  }
}
