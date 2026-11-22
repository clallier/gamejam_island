import {
  addComponent,
  addEntity,
  createRelation,
  createWorld,
  entityExists,
  getRelationTargets,
  makeExclusive,
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
import type { NpcRoleId, ResourceKey } from '../world/constants.ts';
import {
  DEFENSE_KIND,
  INTERACTABLE_KIND,
  INTERACTABLE_PRIORITY,
  LOOT_STATE,
  MAX_ENTITIES,
  NPC_ROLE_TO_CODE,
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
  readonly NpcBond: {
    readonly roleCode: Uint8Array;
    readonly level: Uint8Array;
    readonly xp: Uint16Array;
    readonly furnitureStage: Uint8Array;
    readonly hangoutCount: Uint16Array;
  };
  readonly Enemy: {
    readonly kind: Uint8Array;
    readonly hp: Float32Array;
    readonly maxHp: Float32Array;
    readonly speed: Float32Array;
    readonly side: Int8Array;
    readonly attackCooldown: Float32Array;
  };
  readonly Defense: {
    readonly slotIndex: Uint8Array;
    readonly kind: Uint8Array;
    readonly level: Uint8Array;
    readonly hp: Float32Array;
    readonly maxHp: Float32Array;
    readonly fireCooldown: Float32Array;
  };
}

export interface EcsGuardError {
  readonly operation: string;
  readonly eid: number;
  readonly targetEid?: number;
  readonly stringId?: string;
  readonly detail: string;
}

export type EcsErrorLogger = (error: EcsGuardError) => void;

/**
 * Data-oriented Structure-of-Arrays (SoA) entity world backed by `bitecs` v0.4
 * typed arrays for zero-allocation queries, interactions, wobbles, and loot recycling.
 */
export class IslandEcsWorld {
  private readonly components: IslandEcsComponents;
  private readonly world: World<{ components: IslandEcsComponents }>;
  private readonly npcTag = {};
  private readonly enemyTag = {};
  private readonly housedIn = createRelation();
  private readonly targeting = createRelation(makeExclusive);
  private readonly idToEid = new Map<string, number>();
  private readonly eidToId = new Map<number, string>();
  private readonly finishedWobbles: number[] = [];
  private readonly errorLogger: EcsErrorLogger;

  /**
   * Pre-allocates fixed typed-array component buffers and initializes the bitECS world.
   *
   * @param errorLogger Optional logger called when a guarded ECS operation sees a missing entity.
   * @throws Error Never thrown during world initialization.
   * @example
   * const ecs = new IslandEcsWorld();
   */
  public constructor(errorLogger: EcsErrorLogger = IslandEcsWorld._defaultErrorLogger) {
    this.components = this._createComponents();
    this.world = createWorld({ components: this.components });
    this.errorLogger = errorLogger;
  }

  private static _defaultErrorLogger(error: EcsGuardError): void {
    console.error('[IslandEcsWorld] Guarded invalid entity operation:', error, new Error(error.detail).stack);
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
    if (this._assertAlive('spawnLootEntity.LootDrop', eid)) addComponent(this.world, eid, LootDrop);
    return eid;
  }

  /**
   * Removes an entity from the bitECS world and recycles its numeric ID.
   * Deletes string-ID mappings after `removeEntity` so `onRemove` observers can read them.
   *
   * @param eid Entity ID to remove.
   * @throws Error Never thrown; logs via `errorLogger` if `eid` is already absent.
   * @example
   * ecs.despawnEntity(eid);
   */
  public despawnEntity(eid: number): void {
    const strId = this.eidToId.get(eid);
    if (!this._assertAlive('despawnEntity', eid, { stringId: strId })) {
      this._deleteStringMapping(eid, strId);
      return;
    }
    removeEntity(this.world, eid);
    this._deleteStringMapping(eid, strId);
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
    if (eid === undefined || !this._assertAlive('setInteractableActive', eid, { stringId })) return;
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
    if (!this._assertAlive('triggerWobble', eid, { stringId })) return;
    this.components.Wobble.remaining[eid] = Math.max(0, duration);
    addComponent(this.world, eid, this.components.Wobble);
  }

  /**
   * Advances all active wobble timers in a typed-array query and notifies listeners.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @param onTick Callback invoked for each active or newly finished wobbling entity.
   * @throws Error Never thrown; logs if a finished wobble entity disappeared before `removeComponent`.
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
      if (this._assertAlive('tickWobbles.removeComponent', eid, { stringId: this.eidToId.get(eid) })) {
        removeComponent(this.world, eid, Wobble);
      }
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

  /**
   * Checks whether `eid` currently exists in the bitECS world.
   *
   * @param eid Numeric entity ID to test.
   * @returns `true` if `eid` is alive in the world.
   * @throws Error Never thrown.
   * @example
   * if (ecs.isEntityAlive(eid)) ecs.despawnEntity(eid);
   */
  public isEntityAlive(eid: number): boolean {
    return entityExists(this.world, eid);
  }

  /**
   * Registers a villager entity using `npcTag`, `NpcBond` SoA buffers, and `HousedIn`.
   *
   * @param roleId Villager role identifier (`'engineer' | 'medic' | 'defender' | 'merchant'`).
   * @param houseStringId Registered string ID of the villager's dollhouse.
   * @param x World X coordinate along the town strip.
   * @returns Allocated bitECS numeric entity ID.
   * @throws Error Never thrown for valid role and coordinates.
   * @example
   * const npcEid = ecs.registerVillager('engineer', 'house-engineer', -13);
   */
  public registerVillager(roleId: NpcRoleId, houseStringId: string, x: number): number {
    const eid = this._createNamedEntity(`npc-${roleId}`, x, 0, 1.6);
    const { NpcBond } = this.components;
    NpcBond.roleCode[eid] = NPC_ROLE_TO_CODE[roleId];
    NpcBond.level[eid] = 1;
    NpcBond.xp[eid] = 0;
    NpcBond.furnitureStage[eid] = 0;
    NpcBond.hangoutCount[eid] = 0;
    addComponent(this.world, eid, NpcBond);
    addComponent(this.world, eid, this.npcTag);
    const houseEid = this.idToEid.get(houseStringId);
    if (houseEid !== undefined && this._assertAlive('registerVillager.house', houseEid, { stringId: houseStringId })) {
      addComponent(this.world, eid, this.housedIn(houseEid));
    }
    return eid;
  }

  /**
   * Queries all villager entities marked with `npcTag`.
   *
   * @returns Packed bitECS query result of villager entity IDs.
   * @throws Error Never thrown during queries.
   * @example
   * const villagerEids = ecs.queryVillagers();
   */
  public queryVillagers(): QueryResult {
    return query(this.world, [this.npcTag]);
  }

  /**
   * Resolves the linked dollhouse entity ID from a villager's `HousedIn` relation.
   *
   * @param npcEid Numeric bitECS entity ID of the villager.
   * @returns Linked dollhouse `eid`, or `undefined` if none is attached.
   * @throws Error Never thrown during relation lookup.
   * @example
   * const houseEid = ecs.getVillagerHouseEid(npcEid);
   */
  public getVillagerHouseEid(npcEid: number): number | undefined {
    return getRelationTargets(this.world, npcEid, this.housedIn)[0];
  }

  /**
   * Registers an interactive defense plinth slot with an initial `EMPTY` `Defense` component.
   *
   * @param slotIndex Zero-based slot index inside `DEFENSE_SLOT_XS`.
   * @param stringId Unique slot string ID (`'slot-0'`, etc.).
   * @param x World X coordinate.
   * @param range Maximum X interaction range.
   * @returns Allocated bitECS numeric entity ID.
   * @throws Error Never thrown for valid slot parameters.
   * @example
   * const eid = ecs.registerDefenseSlot(0, 'slot-0', -26, 3.2);
   */
  public registerDefenseSlot(
    slotIndex: number,
    stringId: string,
    x: number,
    range: number,
  ): number {
    const eid = this._registerInteractable(
      stringId, x, 0, 1.55, INTERACTABLE_KIND.DEFENSE_SLOT, INTERACTABLE_PRIORITY.DEFENSE_SLOT, range, slotIndex,
    );
    const { Defense } = this.components;
    Defense.slotIndex[eid] = slotIndex;
    Defense.kind[eid] = DEFENSE_KIND.EMPTY;
    Defense.level[eid] = 0;
    Defense.hp[eid] = 0;
    Defense.maxHp[eid] = 0;
    Defense.fireCooldown[eid] = 0;
    addComponent(this.world, eid, Defense);
    return eid;
  }

  /**
   * Spawns a transient night enemy entity tagged with `enemyTag`, writing SoA fields before `addComponent`.
   *
   * @param kind Enemy archetype code from `ENEMY_KIND`.
   * @param x Initial X position along the road.
   * @param side Origin flank sign (`-1` left, `1` right).
   * @param hp Starting hit points.
   * @param speed Approach speed toward Town Heart in world units/sec.
   * @returns Recycled numeric bitECS `eid`.
   * @throws Error Never thrown for valid parameters.
   * @example
   * const eid = ecs.spawnEnemyEntity(0, -54, -1, 24, 3.2);
   */
  public spawnEnemyEntity(
    kind: number,
    x: number,
    side: -1 | 1,
    hp: number,
    speed: number,
  ): number {
    const eid = addEntity(this.world);
    const { Position, Enemy } = this.components;
    Position.x[eid] = x;
    Position.y[eid] = 0;
    Position.z[eid] = 0;
    Enemy.kind[eid] = kind;
    Enemy.hp[eid] = hp;
    Enemy.maxHp[eid] = hp;
    Enemy.speed[eid] = speed;
    Enemy.side[eid] = side;
    Enemy.attackCooldown[eid] = 0;
    addComponent(this.world, eid, Position);
    addComponent(this.world, eid, Enemy);
    if (this._assertAlive('spawnEnemyEntity.enemyTag', eid)) addComponent(this.world, eid, this.enemyTag);
    return eid;
  }

  /**
   * Queries all active enemy entities matching `[enemyTag, Position, Enemy]`.
   *
   * @returns Packed bitECS query result of enemy entity IDs.
   * @throws Error Never thrown during queries.
   * @example
   * for (const eid of ecs.queryEnemies()) stepEnemy(eid);
   */
  public queryEnemies(): QueryResult {
    return query(this.world, [this.enemyTag, this.components.Position, this.components.Enemy]);
  }

  /**
   * Queries all defense slot entities matching `[Position, Defense]`.
   *
   * @returns Packed bitECS query result of defense entity IDs.
   * @throws Error Never thrown during queries.
   * @example
   * for (const eid of ecs.queryDefenses()) stepTurret(eid);
   */
  public queryDefenses(): QueryResult {
    return query(this.world, [this.components.Position, this.components.Defense]);
  }

  /**
   * Records an exclusive bitECS `targeting` relation edge from a turret entity to an enemy entity.
   *
   * @param defenseEid Defense entity ID.
   * @param enemyEid Target enemy entity ID.
   * @throws Error Never thrown for valid entity IDs.
   * @example
   * ecs.setTurretTarget(turretEid, enemyEid);
   */
  public setTurretTarget(defenseEid: number, enemyEid: number): void {
    if (!this._assertAlive('setTurretTarget.defense', defenseEid, { targetEid: enemyEid })) return;
    if (!this._assertAlive('setTurretTarget.enemy', enemyEid, { targetEid: defenseEid })) return;
    addComponent(this.world, defenseEid, this.targeting(enemyEid));
  }

  /**
   * Resolves the enemy entity ID currently targeted by `defenseEid`, if any.
   *
   * @param defenseEid Defense entity ID.
   * @returns Targeted enemy `eid` or `undefined` when no target is attached.
   * @throws Error Never thrown.
   * @example
   * const targetEid = ecs.getTurretTarget(turretEid);
   */
  public getTurretTarget(defenseEid: number): number | undefined {
    if (!entityExists(this.world, defenseEid)) return undefined;
    return getRelationTargets(this.world, defenseEid, this.targeting)[0];
  }

  private _assertAlive(
    operation: string,
    eid: number,
    meta?: { targetEid?: number; stringId?: string },
  ): boolean {
    if (entityExists(this.world, eid)) return true;
    this.errorLogger({
      operation,
      eid,
      ...meta,
      detail: `Entity ${eid} does not exist in world during ${operation}`,
    });
    return false;
  }

  private _deleteStringMapping(eid: number, strId: string | undefined): void {
    if (strId === undefined) return;
    this.eidToId.delete(eid);
    this.idToEid.delete(strId);
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
      NpcBond: {
        roleCode: new Uint8Array(MAX_ENTITIES),
        level: new Uint8Array(MAX_ENTITIES),
        xp: new Uint16Array(MAX_ENTITIES),
        furnitureStage: new Uint8Array(MAX_ENTITIES),
        hangoutCount: new Uint16Array(MAX_ENTITIES),
      },
      Enemy: {
        kind: new Uint8Array(MAX_ENTITIES),
        hp: new Float32Array(MAX_ENTITIES),
        maxHp: new Float32Array(MAX_ENTITIES),
        speed: new Float32Array(MAX_ENTITIES),
        side: new Int8Array(MAX_ENTITIES),
        attackCooldown: new Float32Array(MAX_ENTITIES),
      },
      Defense: {
        slotIndex: new Uint8Array(MAX_ENTITIES),
        kind: new Uint8Array(MAX_ENTITIES),
        level: new Uint8Array(MAX_ENTITIES),
        hp: new Float32Array(MAX_ENTITIES),
        maxHp: new Float32Array(MAX_ENTITIES),
        fireCooldown: new Float32Array(MAX_ENTITIES),
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
    const prev = this.idToEid.get(stringId);
    if (prev !== undefined) this.despawnEntity(prev);
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
