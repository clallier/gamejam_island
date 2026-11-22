import {
  addComponent,
  addEntity,
  createWorld,
  observe,
  onAdd,
  onRemove,
  type QueryResult,
  type QueryTerm,
  query,
  removeComponent,
  removeEntity,
  type World,
} from 'bitecs';
import type { ResourceKey } from '../world/constants.ts';
import {
  INTERACTABLE_KIND,
  INTERACTABLE_PRIORITY,
  LOOT_STATE,
  MAX_ENTITIES,
  RESOURCE_TO_CODE,
} from './constants.ts';

export interface IslandEcsComponents {
  readonly Position: {
    readonly x: Float32Array;
    readonly y: Float32Array;
    readonly z: Float32Array;
  };
  readonly Interactable: {
    readonly kind: Uint8Array;
    readonly priority: Uint8Array;
    readonly range: Float32Array;
    readonly active: Uint8Array;
    readonly payloadIndex: Uint16Array;
  };
  readonly LootDrop: {
    readonly resourceCode: Uint8Array;
    readonly age: Float32Array;
    readonly state: Uint8Array;
  };
  readonly Wobble: {
    readonly remaining: Float32Array;
  };
}

/**
 * Data-oriented Structure-of-Arrays (SoA) entity world backed by `bitecs` v0.4
 * typed arrays for zero-allocation queries, interactions, wobbles, and loot recycling.
 */
export class IslandEcsWorld {
  private readonly components: IslandEcsComponents;
  private readonly world: World<{ components: IslandEcsComponents }>;
  private readonly idToEid = new Map<string, number>();
  private readonly eidToId = new Map<number, string>();
  private readonly finishedWobbles: number[] = [];

  /**
   * Pre-allocates fixed typed-array component buffers and initializes the bitECS world.
   *
   * @example
   * const ecs = new IslandEcsWorld();
   */
  public constructor() {
    this.components = this._createComponents();
    this.world = createWorld({ components: this.components });
  }

  /**
   * Registers an interactive cutaway dollhouse plot in the ECS world.
   *
   * @param plotIndex Index inside `IslandStrip.getDollhousePlots()`.
   * @param stringId Unique dollhouse string identifier.
   * @param x World X coordinate.
   * @param range Maximum X interaction range.
   * @returns Allocated bitECS numeric entity ID.
   * @example
   * ecs.registerDollhouse(0, 'house-engineer', -13, 3.2);
   */
  public registerDollhouse(
    plotIndex: number,
    stringId: string,
    x: number,
    range: number,
  ): number {
    return this._registerInteractable(
      stringId, x, 0, 0, INTERACTABLE_KIND.DOLLHOUSE, INTERACTABLE_PRIORITY.DOLLHOUSE, range, plotIndex,
    );
  }

  /**
   * Registers a harvestable frontier resource node in the ECS world.
   *
   * @param nodeIndex Index inside `ResourceNodeCatalog.getAllNodes()`.
   * @param stringId Unique node identifier.
   * @param x World X coordinate.
   * @param z World Z coordinate.
   * @param range Maximum X interaction range.
   * @returns Allocated bitECS numeric entity ID.
   * @example
   * ecs.registerResourceNode(0, 'node-left-pine-outer', -49, 3.6, 3.2);
   */
  public registerResourceNode(
    nodeIndex: number,
    stringId: string,
    x: number,
    z: number,
    range: number,
  ): number {
    return this._registerInteractable(
      stringId, x, 0, z, INTERACTABLE_KIND.RESOURCE, INTERACTABLE_PRIORITY.RESOURCE, range, nodeIndex,
    );
  }

  /**
   * Registers a scrubbable pollution mound in the ECS world.
   *
   * @param moundIndex Index inside `CorruptionField.getMounds()`.
   * @param stringId Unique mound identifier.
   * @param x World X coordinate.
   * @param range Maximum X interaction range.
   * @returns Allocated bitECS numeric entity ID.
   * @example
   * ecs.registerPollutionMound(0, 'mound-left-inner', -37, 3.2);
   */
  public registerPollutionMound(
    moundIndex: number,
    stringId: string,
    x: number,
    range: number,
  ): number {
    return this._registerInteractable(
      stringId, x, 0, 2.4, INTERACTABLE_KIND.MOUND, INTERACTABLE_PRIORITY.MOUND, range, moundIndex,
    );
  }

  /**
   * Registers a planted purifying bloom so it participates in ECS wobble queries.
   *
   * @param stringId Unique bloom identifier.
   * @param x World X coordinate.
   * @param z World Z coordinate.
   * @returns Allocated bitECS numeric entity ID.
   * @example
   * ecs.registerPlantedBloom('bloom-1', 24, 2.15);
   */
  public registerPlantedBloom(stringId: string, x: number, z: number): number {
    const eid = this._createNamedEntity(stringId, x, 0, z);
    return eid;
  }

  /**
   * Spawns a transient bouncing loot entity with recycled numeric `eid`.
   *
   * @param resource Resource type dropped.
   * @param x Initial X coordinate.
   * @param y Initial Y coordinate.
   * @param z Initial Z coordinate.
   * @returns Recycled numeric bitECS `eid`.
   * @example
   * const eid = ecs.spawnLootEntity('wood', 23, 1.05, 0.5);
   */
  public spawnLootEntity(resource: ResourceKey, x: number, y: number, z: number): number {
    const eid = addEntity(this.world);
    const { Position, LootDrop } = this.components;
    Position.x[eid] = x;
    Position.y[eid] = y;
    Position.z[eid] = z;
    LootDrop.resourceCode[eid] = RESOURCE_TO_CODE[resource];
    LootDrop.age[eid] = 0;
    LootDrop.state[eid] = LOOT_STATE.FALLING;
    addComponent(this.world, eid, Position);
    addComponent(this.world, eid, LootDrop);
    return eid;
  }

  /**
   * Removes an entity from the bitECS world and recycles its numeric ID.
   * Deletes string-ID mappings after `removeEntity` so `onRemove` observers can read them.
   *
   * @param eid Entity ID to remove.
   * @throws Error Never thrown for valid numeric entity IDs.
   * @example
   * ecs.despawnEntity(eid);
   */
  public despawnEntity(eid: number): void {
    removeEntity(this.world, eid);
    const strId = this.eidToId.get(eid);
    if (strId !== undefined) {
      this.eidToId.delete(eid);
      this.idToEid.delete(strId);
    }
  }

  /**
   * Toggles whether a named interactable is eligible for interaction queries.
   *
   * @param stringId Registered entity string identifier.
   * @param active `true` to enable interaction, `false` when depleted/scrubbed.
   * @example
   * ecs.setInteractableActive('node-right-flower-inner', false);
   */
  public setInteractableActive(stringId: string, active: boolean): void {
    const eid = this.idToEid.get(stringId);
    if (eid === undefined) return;
    this.components.Interactable.active[eid] = active ? 1 : 0;
  }

  /**
   * Attaches or resets a hit-shake wobble timer on a named entity.
   *
   * @param stringId Registered entity string identifier.
   * @param duration Wobble duration in seconds.
   * @example
   * ecs.triggerWobble('node-right-leaf-inner', 0.28);
   */
  public triggerWobble(stringId: string, duration: number): void {
    const eid = this.idToEid.get(stringId);
    if (eid === undefined) return;
    this.components.Wobble.remaining[eid] = Math.max(0, duration);
    addComponent(this.world, eid, this.components.Wobble);
  }

  /**
   * Advances all active wobble timers in a typed-array query and notifies listeners.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @param onTick Callback invoked for each active or newly finished wobbling entity.
   * @example
   * ecs.tickWobbles(dt, (id, rem) => rotateRoot(id, rem));
   */
  public tickWobbles(
    deltaSeconds: number,
    onTick: (stringId: string, remaining: number) => void,
  ): void {
    const { Wobble } = this.components;
    this.finishedWobbles.length = 0;
    for (const eid of query(this.world, [Wobble])) {
      const next = (Wobble.remaining[eid] ?? 0) - deltaSeconds;
      const id = this.eidToId.get(eid);
      Wobble.remaining[eid] = Math.max(0, next);
      if (id) onTick(id, Math.max(0, next));
      if (next <= 0) this.finishedWobbles.push(eid);
    }
    for (const eid of this.finishedWobbles) {
      removeComponent(this.world, eid, Wobble);
    }
  }

  /**
   * Executes a bitECS query returning packed matching entity IDs.
   *
   * @param terms Query component terms.
   * @returns `QueryResult` typed array or array of `eid`s.
   * @example
   * const eids = ecs.queryEntities([Position, Interactable]);
   */
  public queryEntities(terms: QueryTerm[]): QueryResult {
    return query(this.world, terms);
  }

  /**
   * Subscribes to entities gaining all specified components via bitECS `observe(onAdd(...))`.
   *
   * @param terms Component terms whose addition triggers the callback.
   * @param callback Listener receiving the matching `eid`.
   * @returns Unsubscribe function stopping future notifications.
   * @throws Error Never thrown during registration.
   * @example
   * const unsub = ecs.observeAdded([LootDrop], (eid) => trackSpawn(eid));
   */
  public observeAdded(terms: QueryTerm[], callback: (eid: number) => void): () => void {
    return observe(this.world, onAdd(...terms), callback);
  }

  /**
   * Subscribes to entities losing any specified component or despawning via `observe(onRemove(...))`.
   *
   * @param terms Component terms whose removal triggers the callback.
   * @param callback Listener receiving the matching `eid`.
   * @returns Unsubscribe function stopping future notifications.
   * @throws Error Never thrown during registration.
   * @example
   * const unsub = ecs.observeRemoved([LootDrop], (eid) => releasePool(eid));
   */
  public observeRemoved(terms: QueryTerm[], callback: (eid: number) => void): () => void {
    return observe(this.world, onRemove(...terms), callback);
  }

  /**
   * Exposes the shared typed-array SoA component buffers.
   *
   * @returns `IslandEcsComponents` dictionary.
   * @example
   * const { Position, LootDrop } = ecs.getComponents();
   */
  public getComponents(): IslandEcsComponents {
    return this.components;
  }

  /**
   * Looks up the numeric bitECS entity ID for a named entity.
   *
   * @param stringId Registered entity string identifier.
   * @returns Numeric `eid` or `undefined`.
   * @example
   * const eid = ecs.getEntityId('mound-left-inner');
   */
  public getEntityId(stringId: string): number | undefined {
    return this.idToEid.get(stringId);
  }

  /**
   * Looks up the string identifier mapped to a numeric entity ID, if any.
   *
   * @param eid Numeric bitECS entity ID.
   * @returns Registered string ID or `undefined` for ephemeral entities.
   * @example
   * const id = ecs.getStringId(eid);
   */
  public getStringId(eid: number): string | undefined {
    return this.eidToId.get(eid);
  }

  private _createComponents(): IslandEcsComponents {
    return {
      Position: {
        x: new Float32Array(MAX_ENTITIES),
        y: new Float32Array(MAX_ENTITIES),
        z: new Float32Array(MAX_ENTITIES),
      },
      Interactable: {
        kind: new Uint8Array(MAX_ENTITIES),
        priority: new Uint8Array(MAX_ENTITIES),
        range: new Float32Array(MAX_ENTITIES),
        active: new Uint8Array(MAX_ENTITIES),
        payloadIndex: new Uint16Array(MAX_ENTITIES),
      },
      LootDrop: {
        resourceCode: new Uint8Array(MAX_ENTITIES),
        age: new Float32Array(MAX_ENTITIES),
        state: new Uint8Array(MAX_ENTITIES),
      },
      Wobble: {
        remaining: new Float32Array(MAX_ENTITIES),
      },
    };
  }

  private _registerInteractable(
    stringId: string,
    x: number,
    y: number,
    z: number,
    kind: number,
    priority: number,
    range: number,
    payloadIndex: number,
  ): number {
    const eid = this._createNamedEntity(stringId, x, y, z);
    const { Interactable } = this.components;
    Interactable.kind[eid] = kind;
    Interactable.priority[eid] = priority;
    Interactable.range[eid] = range;
    Interactable.active[eid] = 1;
    Interactable.payloadIndex[eid] = payloadIndex;
    addComponent(this.world, eid, Interactable);
    return eid;
  }

  private _createNamedEntity(stringId: string, x: number, y: number, z: number): number {
    const eid = addEntity(this.world);
    const { Position } = this.components;
    this.idToEid.set(stringId, eid);
    this.eidToId.set(eid, stringId);
    Position.x[eid] = x;
    Position.y[eid] = y;
    Position.z[eid] = z;
    addComponent(this.world, eid, Position);
    return eid;
  }
}
