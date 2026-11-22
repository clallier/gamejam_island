import { INITIAL_INVENTORY, type ResourceKey } from './constants.ts';

/**
 * Mutable inventory state managing the four core resources (`wood`, `stone`,
 * `petals`, `shards`) with atomic affordability checks and spending.
 */
export class InventoryStore {
  private readonly counts: Record<ResourceKey, number>;

  /**
   * Initializes the inventory from starting resource amounts.
   *
   * @param initial Optional starting amounts. Defaults to `INITIAL_INVENTORY`.
   * @example
   * const store = new InventoryStore();
   */
  public constructor(initial: Record<ResourceKey, number> = INITIAL_INVENTORY) {
    this.counts = { ...initial };
  }

  /**
   * Returns a shallow read-only copy of all resource counts.
   *
   * @returns Snapshot keyed by `ResourceKey`.
   * @example
   * const inv = store.getSnapshot();
   */
  public getSnapshot(): Record<ResourceKey, number> {
    return { ...this.counts };
  }

  /**
   * Reads the current amount of a single resource.
   *
   * @param key Resource identifier.
   * @returns Non-negative integer count.
   * @example
   * const petals = store.getAmount('petals');
   */
  public getAmount(key: ResourceKey): number {
    return this.counts[key];
  }

  /**
   * Adds positive resource units to the inventory.
   *
   * @param key Target `ResourceKey`.
   * @param amount Units to add (non-positive values are ignored).
   * @returns Updated balance for `key`.
   * @example
   * store.add('wood', 2);
   */
  public add(key: ResourceKey, amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return this.counts[key];
    this.counts[key] += Math.floor(amount);
    return this.counts[key];
  }

  /**
   * Checks whether all resource costs in `cost` are currently covered.
   *
   * @param cost Partial map of required resource quantities.
   * @returns `true` if every required resource meets or exceeds its cost.
   * @example
   * const ok = store.canAfford({ petals: 2 });
   */
  public canAfford(cost: Partial<Record<ResourceKey, number>>): boolean {
    for (const [key, amount] of Object.entries(cost) as Array<[ResourceKey, number | undefined]>) {
      if (amount === undefined || amount <= 0) continue;
      if (!Number.isFinite(amount) || this.counts[key] < amount) return false;
    }
    return true;
  }

  /**
   * Atomically deducts `cost` from inventory when affordable.
   *
   * @param cost Partial map of resource costs to spend.
   * @returns `true` if spent successfully, `false` when insufficient.
   * @example
   * if (store.spend({ petals: 2 })) plantFlower();
   */
  public spend(cost: Partial<Record<ResourceKey, number>>): boolean {
    if (!this.canAfford(cost)) return false;
    for (const [key, amount] of Object.entries(cost) as Array<[ResourceKey, number | undefined]>) {
      if (amount === undefined || amount <= 0) continue;
      this.counts[key] -= amount;
    }
    return true;
  }
}
