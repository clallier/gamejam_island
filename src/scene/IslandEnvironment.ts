import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { BlueprintRegistry } from '../assets/BlueprintRegistry.ts';
import type { ModularAssemblyFactory } from '../assets/ModularAssemblyFactory.ts';
import type { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import type { DayNightRig } from '../engine/DayNightRig.ts';
import type { PhysicsWorld } from '../engine/PhysicsWorld.ts';
import { NpcStandee } from '../entities/NpcStandee.ts';
import { PORTAL_X } from '../world/constants.ts';
import type { CorruptionField } from '../world/CorruptionField.ts';
import type { IslandStrip } from '../world/IslandStrip.ts';
import {
  DOLLHOUSE_Z,
  FLORA_PLACEMENTS,
  LILYPAD_XS,
  ROAD_COLLIDER_HEIGHT,
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

/**
 * Constructs and animates the 3D 1D island diorama: terrain slab, road collider,
 * shoreline water, cutaway dollhouses, NPC standees, flora, corruption borders,
 * and interactive Havok road props.
 */
export class IslandEnvironment {
  private readonly scene: Scene;
  private readonly assembly: ModularAssemblyFactory;
  private readonly blueprints: BlueprintRegistry;
  private readonly materials: StylizedMaterialFactory;
  private readonly physics: PhysicsWorld;
  private readonly lighting: DayNightRig;
  private readonly npcStandees: NpcStandee[] = [];
  private readonly lilyPads: Mesh[] = [];
  private readonly roadCrates: Mesh[] = [];
  private readonly corruptionBorders: { left: TransformNode; right: TransformNode };
  private shrineNode: TransformNode | null = null;

  /**
   * Builds all static and animated 3D elements of the 1D diorama island.
   *
   * @param scene Target Babylon `Scene`.
   * @param assembly Modular assembly factory.
   * @param blueprints Blueprint catalog.
   * @param materials Shared stylized material factory.
   * @param physics Initialized Havok physics facade.
   * @param lighting Day/Night lighting and shadow manager.
   * @param strip 1D island topology model.
   * @param corruption Initial corruption state.
   * @example
   * const env = new IslandEnvironment(scene, assembly, blueprints, materials, physics, lighting, strip, corruption);
   */
  public constructor(
    scene: Scene,
    assembly: ModularAssemblyFactory,
    blueprints: BlueprintRegistry,
    materials: StylizedMaterialFactory,
    physics: PhysicsWorld,
    lighting: DayNightRig,
    strip: IslandStrip,
    corruption: CorruptionField,
  ) {
    this.scene = scene;
    this.assembly = assembly;
    this.blueprints = blueprints;
    this.materials = materials;
    this.physics = physics;
    this.lighting = lighting;
    this._buildTerrainAndWater();
    this._buildShrine();
    this._buildDollhousesAndNpcs(strip);
    this._buildDefenseSlots(strip);
    this._buildFloraAndCorruption(corruption);
    this._buildRoadPhysicsProps();
    this.corruptionBorders = this._buildBorderMarkers(corruption);
  }

  /**
   * Animates lily pads, NPC standees, Town Heart shrine, and mist border posts.
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
    this._containRoadCrates();
    this._syncCorruptionBorders(elapsedSeconds, corruption);
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
      this._addRoomLight(plot.roleId, plot.x);
      const npcModel = this.assembly.assemble(this.blueprints.getNpcBlueprint(plot.roleId), `npc-${plot.roleId}`);
      this.lighting.addShadowCasters(npcModel.getMeshes());
      this.npcStandees.push(new NpcStandee(plot, npcModel, index));
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

  private _buildFloraAndCorruption(corruption: CorruptionField): void {
    FLORA_PLACEMENTS.forEach((f, idx) => {
      const prop = this.assembly.assemble(this.blueprints.getPropBlueprint(f.kind), `flora-${idx}`);
      prop.root.position.set(f.x, 0, f.z);
      prop.root.scaling.setAll(f.scale);
      this.lighting.addShadowCasters(prop.getMeshes());
    });
    for (const mound of corruption.getMounds()) {
      const model = this.assembly.assemble(this.blueprints.getPropBlueprint('mound'), mound.id);
      model.root.position.set(mound.x, 0, 2.4);
      this.lighting.addShadowCasters(model.getMeshes());
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
      this.roadCrates.push(crate);
    });
  }

  private _containRoadCrates(): void {
    for (const crate of this.roadCrates) {
      crate.position.z = Scalar.Clamp(crate.position.z, -0.85, 0.85);
    }
  }

  private _buildBorderMarkers(corruption: CorruptionField): { left: TransformNode; right: TransformNode } {
    const left = this._createMistPost('corruption-border-left', corruption.getLeftBorderX());
    const right = this._createMistPost('corruption-border-right', corruption.getRightBorderX());
    return { left, right };
  }

  private _createMistPost(name: string, x: number): TransformNode {
    const post = MeshBuilder.CreateCylinder(name, { height: 2.2, diameterTop: 0.2, diameterBottom: 0.65, tessellation: 8 }, this.scene);
    post.position.set(x, 1.1, 2.0);
    post.material = this.materials.getMaterial('corruptionNeon');
    return post;
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
