import {
  CORRUPTION_EDGE_FEATHER,
  INITIAL_LEFT_CORRUPTION_X,
  INITIAL_POLLUTION_MOUNDS,
  INITIAL_RIGHT_CORRUPTION_X,
  type IslandSide,
  MAX_CORRUPTION_HALF_WIDTH,
  MIN_CORRUPTION_HALF_WIDTH,
  MOUND_MAX_HP,
  type PollutionMoundSeed,
} from './constants.ts';

export interface PollutionMoundState extends PollutionMoundSeed {
  hp: number;
  readonly maxHp: number;
  scrubbed: boolean;
}

export interface MoundHitOutcome {
  readonly hit: boolean;
  readonly scrubbed: boolean;
  readonly side: IslandSide;
  readonly x: number;
}

/**
 * Tracks the hybrid 1D ecological tug-of-war: continuous left/right
 * corruption borders and scrubbable frontier pollution mounds.
 */
export class CorruptionField {
  private static readonly SAFE_SPAN_MIN = MIN_CORRUPTION_HALF_WIDTH;
  private static readonly SAFE_SPAN_MAX = MAX_CORRUPTION_HALF_WIDTH;

  private leftBorderX: number;
  private rightBorderX: number;
  private readonly mounds: PollutionMoundState[];

  /**
   * Initializes left/right corruption borders and frontier mounds.
   *
   * @param leftBorderX Initial left corruption X. Defaults to `INITIAL_LEFT_CORRUPTION_X`.
   * @param rightBorderX Initial right corruption X. Defaults to `INITIAL_RIGHT_CORRUPTION_X`.
   * @param moundSeeds Initial mound descriptors. Defaults to `INITIAL_POLLUTION_MOUNDS`.
   * @throws {RangeError} When `leftBorderX` is non-negative or `rightBorderX` is non-positive.
   * @example
   * const field = new CorruptionField();
   */
  public constructor(
    leftBorderX = INITIAL_LEFT_CORRUPTION_X,
    rightBorderX = INITIAL_RIGHT_CORRUPTION_X,
    moundSeeds = INITIAL_POLLUTION_MOUNDS,
  ) {
    if (leftBorderX >= 0 || rightBorderX <= 0) {
      throw new RangeError('Corruption borders must flank origin (left < 0, right > 0)');
    }
    this.leftBorderX = this._clampLeft(leftBorderX);
    this.rightBorderX = this._clampRight(rightBorderX);
    this.mounds = moundSeeds.map((seed) => ({
      ...seed,
      hp: MOUND_MAX_HP,
      maxHp: MOUND_MAX_HP,
      scrubbed: false,
    }));
  }

  /**
   * Returns current left corruption boundary X (negative coordinate).
   *
   * @returns Left border X.
   * @example
   * const leftX = field.getLeftBorderX();
   */
  public getLeftBorderX(): number {
    return this.leftBorderX;
  }

  /**
   * Returns current right corruption boundary X (positive coordinate).
   *
   * @returns Right border X.
   * @example
   * const rightX = field.getRightBorderX();
   */
  public getRightBorderX(): number {
    return this.rightBorderX;
  }

  /**
   * Returns read-only state snapshots of all frontier pollution mounds.
   *
   * @returns Array of `PollutionMoundState`.
   * @example
   * const mounds = field.getMounds();
   */
  public getMounds(): readonly PollutionMoundState[] {
    return this.mounds;
  }

  /**
   * Pushes the corruption border outward toward the portal (purification).
   *
   * @param side Which flank (`'left' | 'right'`) to purify.
   * @param amount Non-negative distance to push outward.
   * @returns Updated border X on that flank.
   * @example
   * field.pushBorder('left', 3.5);
   */
  public pushBorder(side: IslandSide, amount: number): number {
    const delta = Math.max(0, amount);
    if (side === 'left') {
      this.leftBorderX = this._clampLeft(this.leftBorderX - delta);
      return this.leftBorderX;
    }
    this.rightBorderX = this._clampRight(this.rightBorderX + delta);
    return this.rightBorderX;
  }

  /**
   * Pulls the corruption border inward toward the town center (breach).
   *
   * @param side Which flank (`'left' | 'right'`) suffered encroachment.
   * @param amount Non-negative distance to pull inward.
   * @returns Updated border X on that flank.
   * @example
   * field.encroachBorder('right', 2);
   */
  public encroachBorder(side: IslandSide, amount: number): number {
    const delta = Math.max(0, amount);
    if (side === 'left') {
      this.leftBorderX = this._clampLeft(this.leftBorderX + delta);
      return this.leftBorderX;
    }
    this.rightBorderX = this._clampRight(this.rightBorderX - delta);
    return this.rightBorderX;
  }

  /**
   * Marks an unscrubbed pollution mound as cleared.
   *
   * @param id Unique mound identifier.
   * @returns `true` if the mound existed and transitioned from active to scrubbed.
   * @example
   * const cleared = field.scrubMound('mound-left-inner');
   */
  public scrubMound(id: string): boolean {
    const target = this.mounds.find((m) => m.id === id);
    if (!target || target.scrubbed) return false;
    target.hp = 0;
    target.scrubbed = true;
    return true;
  }

  /**
   * Finds the nearest active (unscrubbed) pollution mound within `maxDistance` of `x`.
   *
   * @param x Query X coordinate along the road.
   * @param maxDistance Maximum X separation to match.
   * @returns Closest active `PollutionMoundState` or `null`.
   * @example
   * const mound = field.findNearestActiveMound(-36.5, 3.2);
   */
  public findNearestActiveMound(x: number, maxDistance: number): PollutionMoundState | null {
    let best: PollutionMoundState | null = null;
    let bestDist = maxDistance;
    for (const mound of this.mounds) {
      const dist = Math.abs(mound.x - x);
      if (!mound.scrubbed && dist <= bestDist) {
        best = mound;
        bestDist = dist;
      }
    }
    return best;
  }

  /**
   * Scrubs an active pollution mound, clearing it and pushing its border on 0 HP.
   *
   * @param id Target mound identifier.
   * @param damage Hit damage applied. Defaults to `1`.
   * @param borderPush Outward border push distance on scrub completion. Defaults to `4.5`.
   * @returns `MoundHitOutcome` or `null` when missing or already scrubbed.
   * @example
   * const outcome = field.hitMound('mound-right-inner');
   */
  public hitMound(id: string, damage = 1, borderPush = 4.5): MoundHitOutcome | null {
    const target = this.mounds.find((m) => m.id === id);
    if (!target || target.scrubbed) return null;
    target.hp = Math.max(0, target.hp - Math.max(1, damage));
    const scrubbed = target.hp === 0;
    if (scrubbed) {
      target.scrubbed = true;
      this.pushBorder(target.side, borderPush);
    }
    return { hit: true, scrubbed, side: target.side, x: target.x };
  }

  /**
   * Checks whether coordinate `x` lies inside the corrupted zone.
   *
   * @param x World X coordinate.
   * @returns `true` if beyond either active corruption border.
   * @example
   * const danger = field.isCorrupted(-40);
   */
  public isCorrupted(x: number): boolean {
    return x <= this.leftBorderX || x >= this.rightBorderX;
  }

  /**
   * Computes smooth corruption intensity (`0` = pure, `1` = deep mist) at `x`.
   *
   * @param x World X coordinate.
   * @returns Clamped intensity in `[0, 1]`.
   * @example
   * const haze = field.getCorruptionIntensity(-35);
   */
  public getCorruptionIntensity(x: number): number {
    const depth = x < 0 ? this.leftBorderX - x : x - this.rightBorderX;
    if (depth <= -CORRUPTION_EDGE_FEATHER) return 0;
    const t = (depth + CORRUPTION_EDGE_FEATHER) / (CORRUPTION_EDGE_FEATHER * 2);
    return Math.max(0, Math.min(1, t));
  }

  /**
   * Computes overall island purity percentage `[0, 1]` from safe span and mounds.
   *
   * @returns Weighted purity ratio between `0` and `1`.
   * @example
   * const pct = Math.round(field.getPurityRatio() * 100);
   */
  public getPurityRatio(): number {
    const span = this.rightBorderX - this.leftBorderX;
    const minSpan = CorruptionField.SAFE_SPAN_MIN * 2;
    const maxSpan = CorruptionField.SAFE_SPAN_MAX * 2;
    const borderRatio = (span - minSpan) / (maxSpan - minSpan);
    const moundRatio = this._computeScrubbedMoundRatio();
    return Math.max(0, Math.min(1, borderRatio * 0.8 + moundRatio * 0.2));
  }

  private _clampLeft(x: number): number {
    return Math.max(
      -CorruptionField.SAFE_SPAN_MAX,
      Math.min(-CorruptionField.SAFE_SPAN_MIN, x),
    );
  }

  private _clampRight(x: number): number {
    return Math.min(
      CorruptionField.SAFE_SPAN_MAX,
      Math.max(CorruptionField.SAFE_SPAN_MIN, x),
    );
  }

  private _computeScrubbedMoundRatio(): number {
    if (this.mounds.length === 0) return 1;
    const scrubbedCount = this.mounds.filter((m) => m.scrubbed).length;
    return scrubbedCount / this.mounds.length;
  }
}
