import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import type { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { BlueprintRegistry } from '../assets/BlueprintRegistry.ts';
import type { PaletteKey, PartId } from '../assets/constants.ts';
import type { AssembledModel, ModularAssemblyFactory } from '../assets/ModularAssemblyFactory.ts';
import type { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import { type BalanceSheet, defaultBalanceSheet } from '../config/BalanceSheet.ts';
import { gridToWorld } from '../config/constants.ts';
import type { DayNightRig } from '../engine/DayNightRig.ts';
import type { PhysicsWorld } from '../engine/PhysicsWorld.ts';
import { DEFENSE_KIND } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import { NpcStandee } from '../entities/NpcStandee.ts';
import type { PlantedFlora } from '../systems/PlantingSystem.ts';
import { type NpcRoleId, PORTAL_X, ROAD_HALF_TILES } from '../world/constants.ts';
import type { CorruptionField } from '../world/CorruptionField.ts';
import type { IslandStrip } from '../world/IslandStrip.ts';
import type { ResourceNodeCatalog } from '../world/ResourceNodeCatalog.ts';
import {
  DOLLHOUSE_Z,
  LILYPAD_XS,
  ROAD_COLLIDER_HEIGHT,
  ROAD_CRATE_DUST_COOLDOWN,
  ROAD_CRATE_IMPACT_SPEED,
  ROAD_CRATE_MAX_ABS_X,
  ROAD_DEPTH,
  ROAD_PROP_XS,
  ROAD_WIDTH,
  SHRINE_Z,
  TERRAIN_CENTER_Z,
  TERRAIN_DEPTH,
  TERRAIN_HEIGHT,
  TERRAIN_WIDTH,
  WATER_DEPTH,
  WATER_WIDTH,
  WATER_Y,
} from './constants.ts';

interface NodeVisualEntry {
  readonly root: TransformNode;
  readonly baseScale: number;
  depleted: boolean;
}

interface RoadCrateEntry {
  readonly mesh: Mesh;
  readonly aggregate: PhysicsAggregate;
  dustCooldown: number;
}

/**
 * Snapshot of a moving road crate returned for impact damage and dust puffs.
 */
export interface MovingRoadCrate {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly emitDust: boolean;
}

/**
 * Constructs and animates the 3D 1D island diorama: terrain slab, road collider,
 * shoreline water, cutaway dollhouses, NPC standees, harvestable flora,
 * scrubbable pollution mounds, purifying blooms, and Havok road props.
 */
export class IslandEnvironment {
  private static readonly WOBBLE_DURATION = 0.28;

  private readonly scene: Scene;
  private readonly assembly: ModularAssemblyFactory;
  private readonly blueprints: BlueprintRegistry;
  private readonly materials: StylizedMaterialFactory;
  private readonly physics: PhysicsWorld;
  private readonly lighting: DayNightRig;
  private readonly ecs: IslandEcsWorld;
  private readonly balance: BalanceSheet;
  private readonly npcStandees: NpcStandee[] = [];
  private readonly npcByRole = new Map<NpcRoleId, NpcStandee>();
  private readonly dollhouseModels = new Map<NpcRoleId, AssembledModel>();
  private readonly defenseVisuals = new Map<number, AssembledModel>();
  private readonly lilyPads: Mesh[] = [];
  private readonly roadCrates: RoadCrateEntry[] = [];
  private readonly nodeEntries = new Map<string, NodeVisualEntry>();
  private readonly moundEntries = new Map<string, TransformNode>();
  private readonly corruptionBorders: { left: TransformNode; right: TransformNode };
  private readonly unsubWobbleRemove: () => void;
  private shrineNode: TransformNode | null = null;
  private roadGridMesh: Mesh | null = null;

  /**
   * Builds all static and animated 3D elements of the 1D diorama island.
   *
   * @param scene Target Babylon `Scene`.
   * @param assembly Modular assembly factory.
   * @param blueprints Blueprint catalog.
   * @param materials Shared stylized material factory.
   * @param physics Initialized Havok physics facade.
   * @param lighting Day/Night lighting and shadow manager.
   * @param ecs Shared bitECS world driving hit wobbles.
   * @param strip 1D island topology model.
   * @param corruption Initial corruption state.
   * @param resourceNodes Harvestable frontier resource catalog.
   * @param balance Runtime `BalanceSheet` driving live grid scale and ruler visibility.
   * @example
   * const env = new IslandEnvironment(scene, assembly, blueprints, materials, physics, lighting, ecs, strip, corruption, nodes);
   */
  public constructor(
    scene: Scene,
    assembly: ModularAssemblyFactory,
    blueprints: BlueprintRegistry,
    materials: StylizedMaterialFactory,
    physics: PhysicsWorld,
    lighting: DayNightRig,
    ecs: IslandEcsWorld,
    strip: IslandStrip,
    corruption: CorruptionField,
    resourceNodes: ResourceNodeCatalog,
    balance: BalanceSheet = defaultBalanceSheet,
  ) {
    this.scene = scene;
    this.assembly = assembly;
    this.blueprints = blueprints;
    this.materials = materials;
    this.physics = physics;
    this.lighting = lighting;
    this.ecs = ecs;
    this.balance = balance;
    this._buildTerrainAndWater();
    this._buildShrine();
    this._buildDollhousesAndNpcs(strip);
    this._buildDefenseSlots(strip);
    this._buildFloraAndCorruption(resourceNodes, corruption);
    this._buildRoadPhysicsProps();
    this.corruptionBorders = this._buildBorderMarkers(corruption);
    const { Wobble } = this.ecs.getComponents();
    this.unsubWobbleRemove = this.ecs.observeRemoved([Wobble], (eid) => this._resetWobble(eid));
  }

  /**
   * Unsubscribes ECS wobble observers owned by the environment.
   *
   * @throws Error Never thrown during disposal.
   * @example
   * env.dispose();
   */
  public dispose(): void {
    this.unsubWobbleRemove();
  }

  /**
   * Animates lily pads, NPC standees, hit wobbles, shrine, and mist border posts.
   *
   * @param elapsedSeconds Total elapsed simulation seconds.
   * @param deltaSeconds Frame delta in seconds.
   * @param playerX Current player X coordinate.
   * @param corruption Live `CorruptionField` state.
   * @example
   * env.update(elapsed, dt, player.getX(), corruptionField);
   */
  public update(
    elapsedSeconds: number,
    deltaSeconds: number,
    playerX: number,
    corruption: CorruptionField,
  ): void {
    this._animateLilyPads(elapsedSeconds);
    for (const npc of this.npcStandees) {
      npc.update(elapsedSeconds, deltaSeconds, playerX);
    }
    if (this.shrineNode) {
      this.shrineNode.rotation.y = elapsedSeconds * 0.4;
    }
    this._updateWobbles(deltaSeconds);
    this._containRoadCrates();
    this._syncCorruptionBorders(elapsedSeconds, corruption);
  }

  /**
   * Plays a snappy wobble on a harvested node and shrinks it when depleted.
   *
   * @param id Target node identifier.
   * @param depleted Whether the node reached 0 HP.
   * @example
   * env.animateNodeHit('node-right-leaf-inner', true);
   */
  public animateNodeHit(id: string, depleted: boolean): void {
    const entry = this.nodeEntries.get(id);
    if (!entry) return;
    entry.depleted = depleted;
    this.ecs.triggerWobble(id, IslandEnvironment.WOBBLE_DURATION);
    if (depleted) {
      entry.root.scaling.set(entry.baseScale * 0.55, entry.baseScale * 0.22, entry.baseScale * 0.55);
    }
  }

  /**
   * Restores depleted resource node meshes back to full scale on dawn regrowth.
   *
   * @param catalog Updated `ResourceNodeCatalog`.
   * @example
   * env.syncRegrowth(resourceNodes);
   */
  public syncRegrowth(catalog: ResourceNodeCatalog): void {
    for (const node of catalog.getAllNodes()) {
      const entry = this.nodeEntries.get(node.id);
      if (!entry) continue;
      entry.depleted = node.depleted;
      if (!node.depleted) {
        entry.root.scaling.setAll(entry.baseScale);
      }
    }
  }

  /**
   * Plays a hit shake on a pollution mound and collapses it once scrubbed.
   *
   * @param id Mound identifier.
   * @param scrubbed Whether the mound was fully cleared.
   * @example
   * env.animateMoundHit('mound-right-inner', true);
   */
  public animateMoundHit(id: string, scrubbed: boolean): void {
    const root = this.moundEntries.get(id);
    if (!root) return;
    this.ecs.triggerWobble(id, IslandEnvironment.WOBBLE_DURATION);
    if (scrubbed) {
      root.setEnabled(false);
    }
  }

  /**
   * Instantiates a glowing 3D purifying flower bloom at a planted location.
   *
   * @param flora Descriptor returned by `PlantingSystem.plantAt`.
   * @example
   * env.spawnPlantedFlora(bloom);
   */
  public spawnPlantedFlora(flora: PlantedFlora): void {
    const model = this.assembly.assemble(this.blueprints.getPropBlueprint('purifier_flower'), flora.id);
    model.root.position.set(flora.x, 0, flora.z);
    model.root.scaling.setAll(1.1);
    this.lighting.addShadowCasters(model.getMeshes());
    this.nodeEntries.set(flora.id, { root: model.root, baseScale: 1.1, depleted: false });
    this.ecs.registerPlantedBloom(flora.id, flora.x, flora.z);
    this.ecs.triggerWobble(flora.id, IslandEnvironment.WOBBLE_DURATION);
  }

  /**
   * Installs a modular furniture piece inside the target dollhouse's `interior_left` socket.
   *
   * @param roleId Owning villager role.
   * @param partId Furniture `PartId`.
   * @param paletteKey Stylized material palette key.
   * @throws Error Never thrown; ignores unknown roles gracefully.
   * @example
   * env.furnishDollhouse('engineer', 'furniture_tool_chest', 'woodWarm');
   */
  public furnishDollhouse(roleId: NpcRoleId, partId: PartId, paletteKey: PaletteKey): void {
    const house = this.dollhouseModels.get(roleId);
    if (!house) return;
    const partNode = house.swapPart('interior_left', partId, paletteKey, { position: [0.95, 0.25, 0.25] });
    this.lighting.addShadowCasters(partNode.getChildMeshes(false));
    this.ecs.triggerWobble(`house-${roleId}`, IslandEnvironment.WOBBLE_DURATION);
    this.celebrateNpc(roleId);
  }

  /**
   * Triggers a celebratory hop animation on the specified villager standee.
   *
   * @param roleId Villager role identifier.
   * @throws Error Never thrown.
   * @example
   * env.celebrateNpc('medic');
   */
  public celebrateNpc(roleId: NpcRoleId): void {
    this.npcByRole.get(roleId)?.triggerCelebrate();
  }

  /**
   * Builds, upgrades, or removes a modular turret or barricade visual on plinth `slotIndex`.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @param x Plinth X coordinate.
   * @param level Structure level (`0` removes visual, `1..3` scales tier silhouette).
   * @param kind Structure kind (`DEFENSE_KIND.TURRET` or `DEFENSE_KIND.BARRICADE`).
   * @throws Error Never thrown.
   * @example
   * env.syncDefenseVisual(0, -27.5, 2, DEFENSE_KIND.BARRICADE);
   */
  public syncDefenseVisual(
    slotIndex: number,
    x: number,
    level: number,
    kind: number = DEFENSE_KIND.TURRET,
  ): void {
    this.defenseVisuals.get(slotIndex)?.root.dispose(false, false);
    this.defenseVisuals.delete(slotIndex);
    if (level <= 0) return;
    const propKind = kind === DEFENSE_KIND.BARRICADE ? 'defense_barricade' : 'defense_turret';
    const model = this.assembly.assemble(this.blueprints.getPropBlueprint(propKind), `defense-slot-${slotIndex}`);
    model.root.position.set(x, 0.24, 1.55);
    const tierScale = level >= 3 ? 1.34 : level >= 2 ? 1.18 : 1;
    model.root.scaling.setAll(tierScale);
    model.root.rotation.y = x < 0 ? Math.PI : 0;
    this.lighting.addShadowCasters(model.getMeshes());
    this.defenseVisuals.set(slotIndex, model);
  }

  /**
   * Updates Defender (`bram`) road patrol X coordinate while monsters are present.
   *
   * @param x Active road X coordinate, or `null` to return beside his watchtower.
   * @throws Error Never thrown.
   * @example
   * env.setDefenderPatrolX(-18);
   */
  public setDefenderPatrolX(x: number | null): void {
    this.npcByRole.get('defender')?.setPatrolX(x);
  }

  /**
   * Updates Engineer (`pip`) road X coordinate during workshop construction trips.
   *
   * @param x Active road X coordinate, or `null` to return to his workshop porch.
   * @throws Error Never thrown.
   * @example
   * env.setEngineerPatrolX(-27.5);
   */
  public setEngineerPatrolX(x: number | null): void {
    this.npcByRole.get('engineer')?.setPatrolX(x);
  }

  /**
   * Plays an NPC's procedural weapon attack animation toward `direction`.
   *
   * @param roleId Target villager role identifier.
   * @param direction Horizontal world X strike sign (`1` right, `-1` left).
   * @throws Error Never thrown.
   * @example
   * env.triggerNpcAttack('defender', 1);
   */
  public triggerNpcAttack(roleId: NpcRoleId, direction: 1 | -1): void {
    this.npcByRole.get(roleId)?.triggerAttack(direction);
  }

  /**
   * Shows or hides the thin-instanced 1-tile road ruler markers along the strip.
   *
   * @param visible `true` to show tile tick markers on the road, `false` to hide them.
   * @throws Error Never thrown.
   * @example
   * env.setGridRulerVisible(true);
   */
  public setGridRulerVisible(visible: boolean): void {
    if (this.roadGridMesh) this.roadGridMesh.isVisible = visible;
  }

  /**
   * Synchronizes road tile ruler visibility and spacing from the live `BalanceSheet`.
   *
   * @throws Error Never thrown.
   * @example
   * env.syncGridRuler();
   */
  public syncGridRuler(): void {
    if (!this.roadGridMesh) return;
    this.roadGridMesh.isVisible = this.balance.get('showGridRuler') >= 0.5;
    this._writeRoadGridMatrices(this.roadGridMesh);
  }

  /**
   * Samples dynamic road crates moving fast enough to bowl over enemies or kick up dust.
   *
   * @param dt Frame delta in seconds used to tick per-crate dust emission cooldowns.
   * @returns Moving crates exceeding `ROAD_CRATE_IMPACT_SPEED`.
   * @throws Error Never thrown.
   * @example
   * const crates = env.sampleMovingRoadCrates(dt);
   */
  public sampleMovingRoadCrates(dt: number): MovingRoadCrate[] {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const moving: MovingRoadCrate[] = [];
    for (const entry of this.roadCrates) {
      entry.dustCooldown = Math.max(0, entry.dustCooldown - safeDt);
      const vel = this.physics.getLinearVelocity(entry.aggregate);
      if (Math.hypot(vel.x, vel.z) < ROAD_CRATE_IMPACT_SPEED) continue;
      const emitDust = entry.dustCooldown <= 0;
      if (emitDust) entry.dustCooldown = ROAD_CRATE_DUST_COOLDOWN;
      moving.push({ x: entry.mesh.position.x, z: entry.mesh.position.z, vx: vel.x, emitDust });
    }
    return moving;
  }

  private _buildTerrainAndWater(): void {
    const soil = MeshBuilder.CreateBox('island-soil', {
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
      depth: TERRAIN_DEPTH,
    }, this.scene);
    soil.position.set(0, -TERRAIN_HEIGHT * 0.5 - 0.25, TERRAIN_CENTER_Z);
    soil.material = this.materials.getMaterial('woodDark');
    this._buildGrassAndRoad();
    this._buildWaterAndLilies();
  }

  private _buildGrassAndRoad(): void {
    const grass = MeshBuilder.CreateBox('island-grass', {
      width: TERRAIN_WIDTH - 0.4,
      height: 0.22,
      depth: TERRAIN_DEPTH - 0.4,
    }, this.scene);
    grass.position.set(0, -0.14, TERRAIN_CENTER_Z);
    grass.material = this.materials.getMaterial('grassSage');
    grass.receiveShadows = true;
    const road = MeshBuilder.CreateBox('island-road', {
      width: ROAD_WIDTH,
      height: ROAD_COLLIDER_HEIGHT,
      depth: ROAD_DEPTH,
    }, this.scene);
    road.position.set(0, -ROAD_COLLIDER_HEIGHT * 0.5, 0);
    road.material = this.materials.getMaterial('clayCream');
    road.receiveShadows = true;
    this.physics.attachStaticBox(road, 0.4, 0.05);
    this._buildRoadGridMarkers();
  }

  private _buildRoadGridMarkers(): void {
    const marker = MeshBuilder.CreateBox(
      'road-grid-marker',
      { width: 0.07, height: 0.015, depth: ROAD_DEPTH - 0.18 },
      this.scene,
    );
    marker.material = this.materials.getMaterial('stoneWarm');
    marker.isPickable = false;
    marker.isVisible = this.balance.get('showGridRuler') >= 0.5;
    this._writeRoadGridMatrices(marker);
    this.roadGridMesh = marker;
  }

  private _writeRoadGridMatrices(marker: Mesh): void {
    const unitMeters = this.balance.get('gridUnitMeters');
    const count = ROAD_HALF_TILES * 2 + 1;
    const buffer = new Float32Array(count * 16);
    for (let idx = 0; idx < count; idx++) {
      const tile = idx - ROAD_HALF_TILES;
      const scaleX = tile === 0 || tile % 5 === 0 ? 1.8 : 1;
      Matrix.Scaling(scaleX, 1, 1)
        .multiply(Matrix.Translation(gridToWorld(tile, unitMeters), 0.008, 0))
        .copyToArray(buffer, idx * 16);
    }
    marker.thinInstanceSetBuffer('matrix', buffer, 16, true);
  }

  private _buildWaterAndLilies(): void {
    const water = MeshBuilder.CreateGround('ocean-water', {
      width: WATER_WIDTH,
      height: WATER_DEPTH,
    }, this.scene);
    water.position.set(0, WATER_Y, 6);
    water.material = this.materials.getMaterial('waterTeal');
    for (const x of LILYPAD_XS) {
      const pad = MeshBuilder.CreateCylinder(`lily-${x}`, {
        height: 0.08,
        diameter: 1.35,
        tessellation: 10,
      }, this.scene);
      pad.position.set(x, WATER_Y + 0.06, -4.2 - Math.abs(x % 2) * 0.7);
      pad.material = this.materials.getMaterial('foliageLeaf');
      this.lilyPads.push(pad);
    }
  }

  private _buildShrine(): void {
    const shrine = this.assembly.assemble(this.blueprints.getPropBlueprint('shrine'), 'town-heart');
    shrine.root.position.set(0, 0, SHRINE_Z);
    this.lighting.addShadowCasters(shrine.getMeshes());
    const light = new PointLight('shrine-light', new Vector3(0, 2.8, SHRINE_Z - 0.8), this.scene);
    light.diffuse = Color3.FromHexString('#ffd166');
    light.range = 11;
    this.lighting.registerInteriorLight(light);
    this.shrineNode = shrine.root;
  }

  private _buildDollhousesAndNpcs(strip: IslandStrip): void {
    strip.getDollhousePlots().forEach((plot, index) => {
      const house = this.assembly.assemble(this.blueprints.getDollhouseBlueprint(plot.roleId), `house-${plot.roleId}`);
      house.root.position.set(plot.x, 0, DOLLHOUSE_Z);
      this.lighting.addShadowCasters(house.getMeshes());
      this.dollhouseModels.set(plot.roleId, house);
      this._addRoomLight(plot.roleId, plot.x);
      const npcModel = this.assembly.assemble(this.blueprints.getNpcBlueprint(plot.roleId), `npc-${plot.roleId}`);
      this.lighting.addShadowCasters(npcModel.getMeshes());
      const standee = new NpcStandee(plot, npcModel, index, this.balance);
      this.npcStandees.push(standee);
      this.npcByRole.set(plot.roleId, standee);
    });
  }

  private _addRoomLight(roleId: string, x: number): void {
    const light = new PointLight(`room-light-${roleId}`, new Vector3(x, 2.2, DOLLHOUSE_Z - 0.5), this.scene);
    light.diffuse = Color3.FromHexString('#ffbe55');
    light.range = 7.5;
    this.lighting.registerInteriorLight(light);
  }

  private _buildDefenseSlots(strip: IslandStrip): void {
    for (const x of strip.getDefenseSlots()) {
      const plinth = MeshBuilder.CreateCylinder(`slot-${x}`, {
        height: 0.24,
        diameterTop: 1.5,
        diameterBottom: 1.75,
        tessellation: 8,
      }, this.scene);
      plinth.position.set(x, 0.12, 1.55);
      plinth.material = this.materials.getMaterial('stoneWarm');
      plinth.receiveShadows = true;
    }
  }

  private _buildFloraAndCorruption(
    resourceNodes: ResourceNodeCatalog,
    corruption: CorruptionField,
  ): void {
    for (const node of resourceNodes.getAllNodes()) {
      const prop = this.assembly.assemble(this.blueprints.getPropBlueprint(node.kind), node.id);
      prop.root.position.set(node.x, 0, node.z);
      prop.root.scaling.setAll(node.scale);
      this.lighting.addShadowCasters(prop.getMeshes());
      this.nodeEntries.set(node.id, { root: prop.root, baseScale: node.scale, depleted: false });
    }
    for (const mound of corruption.getMounds()) {
      const model = this.assembly.assemble(this.blueprints.getPropBlueprint('mound'), mound.id);
      model.root.position.set(mound.x, 0, 2.4);
      this.lighting.addShadowCasters(model.getMeshes());
      this.moundEntries.set(mound.id, model.root);
    }
    this._buildPortals();
  }

  private _buildPortals(): void {
    for (const sideX of [-PORTAL_X, PORTAL_X]) {
      const portal = this.assembly.assemble(this.blueprints.getPropBlueprint('portal'), `portal-${sideX}`);
      portal.root.position.set(sideX, 0, 0.2);
      portal.root.rotation.y = sideX < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.lighting.addShadowCasters(portal.getMeshes());
    }
  }

  private _buildRoadPhysicsProps(): void {
    ROAD_PROP_XS.forEach((x, idx) => {
      const crate = MeshBuilder.CreateBox(`road-crate-${idx}`, { size: 0.65 }, this.scene);
      crate.position.set(x, 0.36, 0.45);
      crate.material = this.materials.getMaterial('woodWarm');
      this.lighting.addShadowCasters([crate]);
      const agg = this.physics.attachDynamicProp(crate, PhysicsShapeType.BOX, 0.45, 0.3);
      agg.body.setLinearDamping(1.4);
      agg.body.setAngularDamping(2.0);
      this.roadCrates.push({ mesh: crate, aggregate: agg, dustCooldown: 0 });
    });
  }

  private _containRoadCrates(): void {
    for (const entry of this.roadCrates) {
      entry.mesh.position.x = Scalar.Clamp(
        entry.mesh.position.x,
        -ROAD_CRATE_MAX_ABS_X,
        ROAD_CRATE_MAX_ABS_X,
      );
      entry.mesh.position.z = Scalar.Clamp(entry.mesh.position.z, -0.85, 0.85);
    }
  }

  private _buildBorderMarkers(corruption: CorruptionField): { left: TransformNode; right: TransformNode } {
    const left = this._createMistPost('corruption-border-left', corruption.getLeftBorderX(), -1);
    const right = this._createMistPost('corruption-border-right', corruption.getRightBorderX(), 1);
    return { left, right };
  }

  private _createMistPost(name: string, x: number, sideSign: number): TransformNode {
    const post = MeshBuilder.CreateCylinder(name, { height: 2.2, diameterTop: 0.2, diameterBottom: 0.65, tessellation: 8 }, this.scene);
    post.position.set(x, 1.1, 2.0);
    post.material = this.materials.getMaterial('corruptionNeon');
    const strip = MeshBuilder.CreateBox(`${name}-line`, { width: 0.24, height: 0.08, depth: 5.2 }, this.scene);
    strip.parent = post;
    strip.position.set(sideSign * 0.2, -1.04, -1.6);
    strip.material = this.materials.getMaterial('corruptionNeon');
    return post;
  }

  private _updateWobbles(deltaSeconds: number): void {
    this.ecs.tickWobbles(deltaSeconds, (id, remaining) => {
      if (remaining <= 0) return;
      const root = this._findWobbleRoot(id);
      if (!root) return;
      root.rotation.z = Math.sin(remaining * 45) * 0.14;
    });
  }

  private _resetWobble(eid: number): void {
    const id = this.ecs.getStringId(eid);
    if (!id) return;
    const root = this._findWobbleRoot(id);
    if (root) root.rotation.z = 0;
  }

  private _findWobbleRoot(id: string): TransformNode | undefined {
    const direct = this.nodeEntries.get(id)?.root ?? this.moundEntries.get(id);
    if (direct || !id.startsWith('house-')) return direct;
    return this.dollhouseModels.get(id.slice(6) as NpcRoleId)?.root;
  }

  private _animateLilyPads(elapsedSeconds: number): void {
    this.lilyPads.forEach((pad, idx) => {
      pad.position.y = WATER_Y + 0.06 + Math.sin(elapsedSeconds * 1.6 + idx) * 0.04;
    });
  }

  private _syncCorruptionBorders(elapsedSeconds: number, corruption: CorruptionField): void {
    const pulse = 1 + Math.sin(elapsedSeconds * 3.2) * 0.12;
    this.corruptionBorders.left.position.x = corruption.getLeftBorderX();
    this.corruptionBorders.right.position.x = corruption.getRightBorderX();
    this.corruptionBorders.left.scaling.set(pulse, 1, pulse);
    this.corruptionBorders.right.scaling.set(pulse, 1, pulse);
  }
}
