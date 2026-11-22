import type { IslandSide } from '../world/constants.ts';
import type { CorruptionField } from '../world/CorruptionField.ts';
import type { InventoryStore } from '../world/InventoryStore.ts';
import {
  PLANT_BORDER_PUSH,
  PLANT_COST,
  PLANT_MAX_X,
  PLANT_MIN_SPACING,
  PLANT_MIN_X,
  PLANT_Z,
} from './constants.ts';

export type PlantBlockReason = 'town' | 'spacing' | 'resources' | null;

export interface PlantedFlora {
  readonly id: string;
  readonly side: IslandSide;
  readonly x: number;
  readonly z: number;
}

/**
 * Manages planting glowing purifying flora outside the town center to
 * physically push back left/right neon corruption borders.
 */
export class PlantingSystem {
  private readonly planted: PlantedFlora[] = [];
  private nextId = 1;

  /**
   * Returns why planting is currently blocked at `x`, or `null` if allowed.
   *
   * @param x Candidate world X coordinate along the road.
   * @param inventory Live `InventoryStore`.
   * @returns Block reason (`'town' | 'spacing' | 'resources'`) or `null`.
   * @example
   * const reason = planting.getPlantBlockReason(20, inventory);
   */
  public getPlantBlockReason(x: number, inventory: InventoryStore): PlantBlockReason {
    if (!Number.isFinite(x)) return 'town';
    const absX = Math.abs(x);
    if (absX < PLANT_MIN_X || absX > PLANT_MAX_X) return 'town';
    if (this._hasNearbyBloom(x)) return 'spacing';
    if (!inventory.canAfford(PLANT_COST)) return 'resources';
    return null;
  }

  /**
   * Convenience check returning `true` when planting is currently valid at `x`.
   *
   * @param x Candidate world X coordinate.
   * @param inventory Live `InventoryStore`.
   * @returns `true` if a purifying bloom can be planted at `x`.
   * @example
   * const ready = planting.canPlantAt(player.getX(), inventory);
   */
  public canPlantAt(x: number, inventory: InventoryStore): boolean {
    return this.getPlantBlockReason(x, inventory) === null;
  }

  /**
   * Spends Sun-Petals, records a new purifying bloom, and pushes the flank border.
   *
   * @param x World X coordinate where the bloom is planted.
   * @param inventory Live `InventoryStore`.
   * @param corruption Live `CorruptionField` to push outward.
   * @param borderPushMultiplier Multiplier applied by Medic bond perks (defaults to `1`).
   * @returns Created `PlantedFlora` descriptor, or `null` when blocked.
   * @throws Error Never thrown during planting checks.
   * @example
   * const bloom = planting.plantAt(25, inventory, corruption, 1.5);
   */
  public plantAt(
    x: number,
    inventory: InventoryStore,
    corruption: CorruptionField,
    borderPushMultiplier = 1,
  ): PlantedFlora | null {
    if (!this.canPlantAt(x, inventory) || !inventory.spend(PLANT_COST)) {
      return null;
    }
    const safeMultiplier = Number.isFinite(borderPushMultiplier) ? Math.max(0, borderPushMultiplier) : 1;
    const side: IslandSide = x < 0 ? 'left' : 'right';
    const flora: PlantedFlora = { id: `bloom-${this.nextId++}`, side, x, z: PLANT_Z };
    this.planted.push(flora);
    corruption.pushBorder(side, PLANT_BORDER_PUSH * safeMultiplier);
    return flora;
  }

  /**
   * Returns all planted purifying flora descriptors.
   *
   * @returns Read-only list of `PlantedFlora`.
   * @example
   * const blooms = planting.getPlantedFlora();
   */
  public getPlantedFlora(): readonly PlantedFlora[] {
    return this.planted;
  }

  private _hasNearbyBloom(x: number): boolean {
    return this.planted.some((item) => Math.abs(item.x - x) < PLANT_MIN_SPACING);
  }
}
