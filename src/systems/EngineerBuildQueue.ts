import { type BalanceSheet, defaultBalanceSheet } from '../config/BalanceSheet.ts';

/**
 * Distinguishes player-commissioned builds/upgrades from autonomous wrench repairs.
 */
export type EngineerJobKind = 'commission' | 'repair';

/**
 * Queued road construction destination for Pip along the strip.
 */
interface BuildJob {
  readonly slotIndex: number;
  readonly targetX: number;
  readonly kind: EngineerJobKind;
}

/**
 * Per-frame step output driving Pip's road walk, wrench hammer swing, and dust/chime cue.
 */
export interface EngineerBuildStep {
  readonly patrolX: number | null;
  readonly hammerDir: 1 | -1 | 0;
  readonly completedSlot: number | null;
  readonly completedX: number | null;
  readonly completedKind: EngineerJobKind | null;
}

/**
 * Drives Pip (`engineer`) along the 1D road to physically hammer newly commissioned,
 * upgraded, or damaged defenses at plinths before walking back to his workshop porch.
 */
export class EngineerBuildQueue {
  private static readonly ARRIVE_EPSILON = 0.85;
  private static readonly HAMMER_DURATION = 0.35;
  private static readonly SPEED_MULTIPLIER = 1.35;
  private static readonly IDLE_STEP: EngineerBuildStep = {
    patrolX: null,
    hammerDir: 0,
    completedSlot: null,
    completedX: null,
    completedKind: null,
  };

  private readonly homeX: number;
  private readonly balance: BalanceSheet;
  private readonly queue: BuildJob[] = [];
  private activeJob: BuildJob | null = null;
  private currentX: number;
  private hammerTimer = 0;
  private returning = false;

  /**
   * Creates Pip's construction and field-repair trip coordinator anchored at `homeX`.
   *
   * @param homeX Workshop plot X coordinate (`-12.5` by default).
   * @param balance Runtime `BalanceSheet` providing base villager walk speed.
   * @throws Error Never thrown during construction.
   * @example
   * const jobs = new EngineerBuildQueue(-12.5);
   */
  public constructor(homeX = -12.5, balance: BalanceSheet = defaultBalanceSheet) {
    this.homeX = homeX;
    this.balance = balance;
    this.currentX = homeX;
  }

  /**
   * Returns whether Pip is currently walking to a plinth, hammering, or has queued jobs.
   *
   * @returns `true` while any build or repair job or hammer animation is active.
   * @throws Error Never thrown.
   * @example
   * if (!jobs.isBusy()) dispatchAutoRepair();
   */
  public isBusy(): boolean {
    return this.activeJob !== null || this.queue.length > 0 || this.hammerTimer > 0;
  }

  /**
   * Returns Pip's current tracked X coordinate along the road.
   *
   * @returns World X coordinate of Pip's active road position.
   * @throws Error Never thrown.
   * @example
   * const pipX = jobs.getCurrentX();
   */
  public getCurrentX(): number {
    return this.currentX;
  }

  /**
   * Queues a road construction or repair trip for Pip to walk out and hammer `slotIndex`.
   *
   * @param slotIndex Defense plinth index.
   * @param targetX World X coordinate of the plinth.
   * @param kind Job category (`'commission'` or `'repair'`).
   * @throws Error Never thrown; ignores non-finite coordinates.
   * @example
   * jobs.enqueue(0, -27.5, 'repair');
   */
  public enqueue(slotIndex: number, targetX: number, kind: EngineerJobKind = 'commission'): void {
    if (!Number.isFinite(targetX)) return;
    if (this.activeJob?.slotIndex === slotIndex || this.queue.some((j) => j.slotIndex === slotIndex)) return;
    this.returning = false;
    if (!this.activeJob) {
      this.activeJob = { slotIndex, targetX, kind };
      return;
    }
    this.queue.push({ slotIndex, targetX, kind });
  }

  /**
   * Advances Pip's movement and wrench swing timer by `dt` seconds.
   *
   * @param dt Frame delta in seconds.
   * @returns Current road `patrolX` (`null` once idle at home), `hammerDir`, and arrival cue.
   * @throws Error Never thrown.
   * @example
   * const step = jobs.step(dt);
   */
  public step(dt: number): EngineerBuildStep {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (this.hammerTimer > 0) return this._stepHammerPause(safeDt);
    if (this.activeJob) return this._stepToActiveJob(safeDt);
    if (this.returning) return this._stepReturnHome(safeDt);
    return EngineerBuildQueue.IDLE_STEP;
  }

  /**
   * Cancels any queued or active road trip targeting `slotIndex` (e.g., on salvage or destruction).
   *
   * @param slotIndex Defense plinth index to remove from Pip's queue.
   * @throws Error Never thrown.
   * @example
   * jobs.cancel(1);
   */
  public cancel(slotIndex: number): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]!.slotIndex === slotIndex) this.queue.splice(i, 1);
    }
    if (this.activeJob?.slotIndex !== slotIndex) return;
    this.hammerTimer = 0;
    this.activeJob = this.queue.shift() ?? null;
    this.returning = this.activeJob === null && Math.abs(this.currentX - this.homeX) > 0.05;
  }

  /**
   * Clears all pending construction trips and snaps Pip back to his workshop porch.
   *
   * @throws Error Never thrown.
   * @example
   * jobs.reset();
   */
  public reset(): void {
    this.queue.length = 0;
    this.activeJob = null;
    this.hammerTimer = 0;
    this.returning = false;
    this.currentX = this.homeX;
  }

  private _stepHammerPause(dt: number): EngineerBuildStep {
    this.hammerTimer = Math.max(0, this.hammerTimer - dt);
    if (this.hammerTimer <= 0) {
      this.activeJob = this.queue.shift() ?? null;
      this.returning = this.activeJob === null;
    }
    return { ...EngineerBuildQueue.IDLE_STEP, patrolX: this.currentX };
  }

  private _stepToActiveJob(dt: number): EngineerBuildStep {
    const job = this.activeJob!;
    const speed = this.balance.getWorld('npcMoveSpeedTiles') * EngineerBuildQueue.SPEED_MULTIPLIER;
    const dx = job.targetX - this.currentX;
    if (Math.abs(dx) <= EngineerBuildQueue.ARRIVE_EPSILON) {
      this.hammerTimer = EngineerBuildQueue.HAMMER_DURATION;
      const hammerDir: 1 | -1 = dx >= 0 ? 1 : -1;
      return {
        patrolX: this.currentX,
        hammerDir,
        completedSlot: job.slotIndex,
        completedX: job.targetX,
        completedKind: job.kind,
      };
    }
    this.currentX += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
    return { ...EngineerBuildQueue.IDLE_STEP, patrolX: this.currentX };
  }

  private _stepReturnHome(dt: number): EngineerBuildStep {
    const speed = this.balance.getWorld('npcMoveSpeedTiles') * EngineerBuildQueue.SPEED_MULTIPLIER;
    const dx = this.homeX - this.currentX;
    if (Math.abs(dx) <= speed * dt + 0.05) {
      this.currentX = this.homeX;
      this.returning = false;
      return EngineerBuildQueue.IDLE_STEP;
    }
    this.currentX += Math.sign(dx) * speed * dt;
    return { ...EngineerBuildQueue.IDLE_STEP, patrolX: this.currentX };
  }
}
