import {
  DEFENSE_RING_HALF,
  DEFENSE_SLOT_XS,
  DOLLHOUSE_PLOTS,
  type DollhousePlot,
  type IslandZone,
  ROAD_HALF_LIMIT,
  TOWN_CENTER_HALF,
} from './constants.ts';

/**
 * Spatial model of the 1D island road (`x`-axis) and its named zones/plots.
 *
 * Provides deterministic clamping, zone classification, and proximity lookup
 * for open-front dollhouse cottages and defense plinths.
 */
export class IslandStrip {
  private static readonly DEFAULT_MAX_DISTANCE = 3.2;

  private readonly roadHalfLimit: number;
  private readonly dollhouses: readonly DollhousePlot[];
  private readonly defenseSlots: readonly number[];

  /**
   * Constructs the 1D island strip descriptor.
   *
   * @param roadHalfLimit Walkable half-length along X. Defaults to `ROAD_HALF_LIMIT`.
   * @param dollhouses Ordered dollhouse plot definitions. Defaults to `DOLLHOUSE_PLOTS`.
   * @param defenseSlots Ordered defense plinth X positions. Defaults to `DEFENSE_SLOT_XS`.
   * @throws {RangeError} When `roadHalfLimit` is not positive.
   * @example
   * const strip = new IslandStrip();
   */
  public constructor(
    roadHalfLimit = ROAD_HALF_LIMIT,
    dollhouses = DOLLHOUSE_PLOTS,
    defenseSlots = DEFENSE_SLOT_XS,
  ) {
    if (roadHalfLimit <= 0) {
      throw new RangeError('roadHalfLimit must be positive');
    }
    this.roadHalfLimit = roadHalfLimit;
    this.dollhouses = dollhouses;
    this.defenseSlots = defenseSlots;
  }

  /**
   * Clamps any world X coordinate strictly within walkable road bounds.
   *
   * @param x Candidate X coordinate.
   * @returns Clamped X inside `[-roadHalfLimit, +roadHalfLimit]`.
   * @example
   * const safeX = strip.clampRoadX(999);
   */
  public clampRoadX(x: number): number {
    return Math.max(-this.roadHalfLimit, Math.min(this.roadHalfLimit, x));
  }

  /**
   * Classifies which functional ring a given X coordinate falls into.
   *
   * @param x World X coordinate along the island.
   * @returns Zone name (`'town' | 'defense' | 'frontier' | 'portal'`).
   * @example
   * const zone = strip.classifyZone(-10); // 'town'
   */
  public classifyZone(x: number): IslandZone {
    const absX = Math.abs(x);
    if (absX <= TOWN_CENTER_HALF) return 'town';
    if (absX <= DEFENSE_RING_HALF) return 'defense';
    if (absX <= this.roadHalfLimit) return 'frontier';
    return 'portal';
  }

  /**
   * Finds the closest dollhouse plot within `maxDistance` of `x`.
   *
   * @param x Query X coordinate (typically player X).
   * @param maxDistance Maximum X separation to match. Defaults to `3.2`.
   * @returns Nearest `DollhousePlot` or `null` when none are in range.
   * @example
   * const nearby = strip.findNearestDollhouse(-12.2);
   */
  public findNearestDollhouse(
    x: number,
    maxDistance = IslandStrip.DEFAULT_MAX_DISTANCE,
  ): DollhousePlot | null {
    let best: DollhousePlot | null = null;
    let bestDist = maxDistance;
    for (const plot of this.dollhouses) {
      const dist = Math.abs(plot.x - x);
      if (dist <= bestDist) {
        best = plot;
        bestDist = dist;
      }
    }
    return best;
  }

  /**
   * Returns all configured dollhouse plots along the central town strip.
   *
   * @returns Read-only list of `DollhousePlot` entries.
   * @example
   * const plots = strip.getDollhousePlots();
   */
  public getDollhousePlots(): readonly DollhousePlot[] {
    return this.dollhouses;
  }

  /**
   * Returns all defense slot X positions flanking the central town.
   *
   * @returns Read-only array of X coordinates.
   * @example
   * const slots = strip.getDefenseSlots();
   */
  public getDefenseSlots(): readonly number[] {
    return this.defenseSlots;
  }

  /**
   * Returns the maximum absolute X reachable on foot.
   *
   * @returns Walkable road half-length.
   * @example
   * const limit = strip.getRoadHalfLimit();
   */
  public getRoadHalfLimit(): number {
    return this.roadHalfLimit;
  }
}
