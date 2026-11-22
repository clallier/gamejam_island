import { CODE_TO_RESOURCE, LOOT_STATE } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import type { ResourceKey } from '../world/constants.ts';
import type { InventoryStore } from '../world/InventoryStore.ts';
import {
  LOOT_COLLECT_RADIUS,
  LOOT_MAGNET_RADIUS,
  LOOT_PICKUP_DELAY,
} from './constants.ts';

/**
 * Pure bitECS data-oriented system advancing loot age, magnet state, and
 * collection into `InventoryStore` over typed SoA buffers with zero heap churn.
 */
export class LootCollectionSystem {
  private readonly collectedBuffer: number[] = [];

  /**
   * Advances all active loot entities and marks collected entities.
   *
   * @param ecs Active `IslandEcsWorld`.
   * @param deltaSeconds Frame delta in seconds.
   * @param playerX Current player X position along `z = 0`.
   * @param inventory Live `InventoryStore` receiving collected units.
   * @param summary Output map populated with collected counts for toast feedback.
   * @returns Reusable scratch array of entity IDs marked `COLLECTED` this frame.
   * @example
   * const collectedEids = system.step(ecs, dt, playerX, inventory, gained);
   */
  public step(
    ecs: IslandEcsWorld,
    deltaSeconds: number,
    playerX: number,
    inventory: InventoryStore,
    summary: Partial<Record<ResourceKey, number>>,
  ): readonly number[] {
    this.collectedBuffer.length = 0;
    const { Position, LootDrop } = ecs.getComponents();
    for (const eid of ecs.queryEntities([Position, LootDrop])) {
      const nextAge = (LootDrop.age[eid] ?? 0) + deltaSeconds;
      LootDrop.age[eid] = nextAge;
      this._evaluateLootEntity(eid, nextAge, playerX, Position, LootDrop, inventory, summary);
    }
    return this.collectedBuffer;
  }

  private _evaluateLootEntity(
    eid: number,
    age: number,
    playerX: number,
    pos: { readonly x: Float32Array; readonly y: Float32Array },
    loot: { readonly resourceCode: Uint8Array; readonly state: Uint8Array },
    inventory: InventoryStore,
    summary: Partial<Record<ResourceKey, number>>,
  ): void {
    if (age < LOOT_PICKUP_DELAY) return;
    const dist = Math.abs(playerX - (pos.x[eid] ?? 0));
    if (dist <= LOOT_COLLECT_RADIUS && (pos.y[eid] ?? 0) <= 2.5) {
      loot.state[eid] = LOOT_STATE.COLLECTED;
      const resource = CODE_TO_RESOURCE[loot.resourceCode[eid] ?? 0]!;
      inventory.add(resource, 1);
      summary[resource] = (summary[resource] ?? 0) + 1;
      this.collectedBuffer.push(eid);
      return;
    }
    loot.state[eid] = dist <= LOOT_MAGNET_RADIUS ? LOOT_STATE.MAGNETIZED : LOOT_STATE.FALLING;
  }
}
