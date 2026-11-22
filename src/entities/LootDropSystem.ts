import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import type { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { PaletteKey } from '../assets/constants.ts';
import type { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import { LOOT_STATE } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import type { DayNightRig } from '../engine/DayNightRig.ts';
import type { PhysicsWorld } from '../engine/PhysicsWorld.ts';
import { LOOT_MAGNET_SPEED, LOOT_MAX_ACTIVE } from '../systems/constants.ts';
import { LootCollectionSystem } from '../systems/LootCollectionSystem.ts';
import type { ResourceKey } from '../world/constants.ts';
import type { InventoryStore } from '../world/InventoryStore.ts';

interface ActiveDropBinding {
  readonly eid: number;
  readonly resource: ResourceKey;
  readonly mesh: Mesh;
  readonly aggregate: PhysicsAggregate;
}

/**
 * Coordinates Havok rigidbody loot drops with bitECS entities (`IslandEcsWorld`)
 * and pooled Babylon `Mesh` geometry for zero-churn pickup bursts.
 */
export class LootDropSystem {
  private static readonly RESOURCE_PALETTES: Record<ResourceKey, PaletteKey> = {
    wood: 'woodWarm',
    stone: 'stoneWarm',
    petals: 'amberGlow',
    shards: 'corruptionNeon',
  };

  private readonly scene: Scene;
  private readonly ecs: IslandEcsWorld;
  private readonly physics: PhysicsWorld;
  private readonly materials: StylizedMaterialFactory;
  private readonly lighting: DayNightRig;
  private readonly collection = new LootCollectionSystem();
  private readonly activeByEid = new Map<number, ActiveDropBinding>();
  private readonly activeOrder: number[] = [];
  private readonly meshPools: Record<ResourceKey, Mesh[]> = {
    wood: [],
    stone: [],
    petals: [],
    shards: [],
  };
  private readonly unsubRemove: () => void;
  private meshCounter = 0;

  /**
   * Initializes the ECS-backed, mesh-pooled Havok loot drop coordinator.
   *
   * @param scene Target Babylon `Scene`.
   * @param ecs Shared `IslandEcsWorld`.
   * @param physics Initialized `PhysicsWorld`.
   * @param materials Shared `StylizedMaterialFactory`.
   * @param lighting `DayNightRig` for shadow casting.
   * @example
   * const loot = new LootDropSystem(scene, ecs, physics, materials, lighting);
   */
  public constructor(
    scene: Scene,
    ecs: IslandEcsWorld,
    physics: PhysicsWorld,
    materials: StylizedMaterialFactory,
    lighting: DayNightRig,
  ) {
    this.scene = scene;
    this.ecs = ecs;
    this.physics = physics;
    this.materials = materials;
    this.lighting = lighting;
    const { LootDrop } = this.ecs.getComponents();
    this.unsubRemove = this.ecs.observeRemoved([LootDrop], (eid) => this._releaseMeshAndBody(eid));
  }

  /**
   * Spawns `count` bouncing Havok physics drops backed by recycled ECS IDs and pooled meshes.
   *
   * @param resource Resource type dropped.
   * @param count Number of discrete bouncing pieces to spawn.
   * @param x Origin X coordinate.
   * @param z Origin Z coordinate.
   * @param inventory Fallback store used if active cap forces auto-collect.
   * @example
   * loot.spawnBurst('wood', 2, 23, 3.9, inventory);
   */
  public spawnBurst(
    resource: ResourceKey,
    count: number,
    x: number,
    z: number,
    inventory?: InventoryStore,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.activeOrder.length >= LOOT_MAX_ACTIVE) {
        this._collectOldest(inventory);
      }
      this._spawnSingle(resource, x, z, i, count);
    }
  }

  /**
   * Syncs Havok drop positions to bitECS SoA buffers, runs `LootCollectionSystem`,
   * pulls magnetized drops toward `playerX`, and returns collected meshes to the pool.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @param playerX Current player X coordinate along `z = 0`.
   * @param inventory Live `InventoryStore` receiving collected items.
   * @returns Partial map of resources collected on this frame.
   * @example
   * const gained = loot.update(dt, player.getX(), inventory);
   */
  public update(
    deltaSeconds: number,
    playerX: number,
    inventory: InventoryStore,
  ): Partial<Record<ResourceKey, number>> {
    this._syncBodiesToEcs();
    const collectedSummary: Partial<Record<ResourceKey, number>> = {};
    const collectedEids = this.collection.step(this.ecs, deltaSeconds, playerX, inventory, collectedSummary);
    this._applyMagnetForces(playerX);
    for (const eid of collectedEids) {
      this.ecs.despawnEntity(eid);
    }
    return collectedSummary;
  }

  /**
   * Returns how many physical loot drops are currently active.
   *
   * @returns Active drop count.
   * @example
   * expect(loot.getActiveCount()).toBe(2);
   */
  public getActiveCount(): number {
    return this.activeOrder.length;
  }

  /**
   * Returns total disabled meshes waiting in object pools across all resource types.
   *
   * @returns Total pooled mesh count.
   * @example
   * expect(loot.getPooledCount()).toBe(2);
   */
  public getPooledCount(): number {
    return (
      this.meshPools.wood.length +
      this.meshPools.stone.length +
      this.meshPools.petals.length +
      this.meshPools.shards.length
    );
  }

  /**
   * Disposes all active physics bodies, pooled meshes, and active ECS loot entities.
   *
   * @example
   * loot.dispose();
   */
  public dispose(): void {
    while (this.activeOrder.length > 0) {
      this.ecs.despawnEntity(this.activeOrder[this.activeOrder.length - 1]!);
    }
    for (const pool of Object.values(this.meshPools)) {
      while (pool.length > 0) pool.pop()?.dispose();
    }
    this.unsubRemove();
  }

  private _spawnSingle(
    resource: ResourceKey,
    x: number,
    z: number,
    index: number,
    total: number,
  ): void {
    const startZ = Math.min(0.65, Math.max(-0.4, z * 0.25));
    const spread = total > 1 ? index - (total - 1) * 0.5 : 0;
    const spawnX = x + spread * 0.35;
    const mesh = this._acquireMesh(resource, spawnX, 1.05, startZ);
    const shape = resource === 'wood' ? PhysicsShapeType.BOX : PhysicsShapeType.SPHERE;
    const agg = this.physics.attachDynamicProp(mesh, shape, 0.35, 0.52);
    const vx = spread * 2.4 + (index % 2 === 0 ? 1.1 : -1.1);
    this.physics.setLinearVelocity(agg, new Vector3(vx, 5.2, -startZ * 1.1));
    const eid = this.ecs.spawnLootEntity(resource, spawnX, 1.05, startZ);
    this.activeByEid.set(eid, { eid, resource, mesh, aggregate: agg });
    this.activeOrder.push(eid);
  }

  private _acquireMesh(resource: ResourceKey, x: number, y: number, z: number): Mesh {
    const reused = this.meshPools[resource].pop();
    const mesh = reused ?? this._createLootMesh(resource);
    mesh.rotationQuaternion = null;
    mesh.rotation.set(0, 0, resource === 'wood' ? Math.PI / 2 : 0);
    mesh.position.set(x, y, z);
    mesh.setEnabled(true);
    return mesh;
  }

  private _createLootMesh(resource: ResourceKey): Mesh {
    const id = `loot-${resource}-${this.meshCounter++}`;
    const mat = this.materials.getMaterial(LootDropSystem.RESOURCE_PALETTES[resource]);
    const mesh = resource === 'wood'
      ? MeshBuilder.CreateCylinder(id, { height: 0.48, diameter: 0.24, tessellation: 8 }, this.scene)
      : MeshBuilder.CreateSphere(id, { diameter: 0.34, segments: 8 }, this.scene);
    mesh.material = mat;
    this.lighting.addShadowCasters([mesh]);
    return mesh;
  }

  private _syncBodiesToEcs(): void {
    const { Position } = this.ecs.getComponents();
    for (const [eid, binding] of this.activeByEid) {
      const pos = binding.mesh.position;
      pos.z = Scalar.Clamp(pos.z, -0.7, 0.7);
      if (pos.y < 0.16) pos.y = 0.2;
      Position.x[eid] = pos.x;
      Position.y[eid] = pos.y;
      Position.z[eid] = pos.z;
    }
  }

  private _applyMagnetForces(playerX: number): void {
    const { Position, LootDrop } = this.ecs.getComponents();
    for (const [eid, binding] of this.activeByEid) {
      if ((LootDrop.state[eid] ?? 0) !== LOOT_STATE.MAGNETIZED) continue;
      const dx = playerX - (Position.x[eid] ?? 0);
      const dir = dx >= 0 ? 1 : -1;
      const pullY = (0.7 - (Position.y[eid] ?? 0)) * 5;
      const pullZ = -(Position.z[eid] ?? 0) * 5;
      this.physics.setLinearVelocity(binding.aggregate, new Vector3(dir * LOOT_MAGNET_SPEED, pullY, pullZ));
    }
  }

  private _collectOldest(inventory?: InventoryStore): void {
    const oldestEid = this.activeOrder[0];
    if (oldestEid === undefined) return;
    const binding = this.activeByEid.get(oldestEid);
    if (binding) inventory?.add(binding.resource, 1);
    this.ecs.despawnEntity(oldestEid);
  }

  private _releaseMeshAndBody(eid: number): void {
    const binding = this.activeByEid.get(eid);
    if (!binding) return;
    binding.aggregate.dispose();
    binding.mesh.setEnabled(false);
    this.meshPools[binding.resource].push(binding.mesh);
    this.activeByEid.delete(eid);
    const idx = this.activeOrder.indexOf(eid);
    if (idx !== -1) this.activeOrder.splice(idx, 1);
  }
}
