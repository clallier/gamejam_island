import { Axis } from '@babylonjs/core/Maths/math.axis.js';
import { Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import {
  DOLLHOUSE_DEPTH,
  DOLLHOUSE_HEIGHT,
  DOLLHOUSE_WIDTH,
  type PaletteKey,
  type PartId,
} from './constants.ts';
import type { IMeshPartProvider } from './IMeshPartProvider.ts';
import type { StylizedMaterialFactory } from './StylizedMaterialFactory.ts';

type PartBuilder = (root: TransformNode, prefix: string, key: PaletteKey) => void;
type Vec3 = readonly [number, number, number];

/**
 * Generates stylized low-poly kitbashed 3D modular parts for Milestone 1.
 *
 * Implements `IMeshPartProvider` so procedural geometry can be seamlessly
 * replaced or mixed with `.glb`/`.gltf` parts via `GltfPartProvider`.
 */
export class ProceduralPartProvider implements IMeshPartProvider {
  private static readonly DEFAULT_VEC: Vec3 = [0, 0, 0];

  private readonly scene: Scene;
  private readonly materials: StylizedMaterialFactory;
  private readonly builders: Record<PartId, PartBuilder>;

  /**
   * Initializes the procedural part builder with a scene and material factory.
   *
   * @param scene Target Babylon `Scene`.
   * @param materials Shared `StylizedMaterialFactory`.
   * @example
   * const provider = new ProceduralPartProvider(scene, materials);
   */
  public constructor(scene: Scene, materials: StylizedMaterialFactory) {
    this.scene = scene;
    this.materials = materials;
    this.builders = this._createBuilderTable();
  }

  /**
   * Builds a stylized kitbashed 3D subtree for the requested `PartId`.
   *
   * @param partId Logical modular part identifier.
   * @param instanceName Unique scene node prefix.
   * @param paletteKey Semantic material color swatch.
   * @returns Root `TransformNode` holding the generated meshes.
   * @example
   * const head = provider.createPart('head_round', 'hero-head', 'skinPeach');
   */
  public createPart(
    partId: PartId,
    instanceName: string,
    paletteKey: PaletteKey,
  ): TransformNode {
    const root = new TransformNode(`${instanceName}-${partId}`, this.scene);
    this.builders[partId](root, instanceName, paletteKey);
    return root;
  }

  private _createBuilderTable(): Record<PartId, PartBuilder> {
    return {
      body_tunic: (r, p, k) => this._buildBodyTunic(r, p, k),
      head_round: (r, p, k) => this._buildHeadRound(r, p, k),
      hat_explorer: (r, p, k) => this._buildHatExplorer(r, p, k),
      hat_goggles: (r, p, k) => this._buildHatGoggles(r, p, k),
      hat_flower: (r, p, k) => this._buildHatFlower(r, p, k),
      hat_helm: (r, p, k) => this._buildHatHelm(r, p, k),
      hat_beret: (r, p, k) => this._buildHatBeret(r, p, k),
      pack_satchel: (r, p, k) => this._box(r, `${p}-pack`, 0.42, 0.48, 0.24, [0, 0, 0], k),
      weapon_slingshot: (r, p, k) => this._buildSlingshot(r, p, k),
      tool_wrench: (r, p, k) => this._buildWrench(r, p, k),
      tool_watering_can: (r, p, k) => this._buildWateringCan(r, p, k),
      tool_shield: (r, p, k) => this._box(r, `${p}-shield`, 0.14, 0.62, 0.52, [0, 0, 0], k),
      prop_coin_pouch: (r, p) => this._sphere(r, `${p}-pouch`, 0.34, [0, 0, 0], 'amberGlow'),
      dollhouse_shell: (r, p, k) => this._buildDollhouseShell(r, p, k),
      dollhouse_roof: (r, p, k) => this._buildDollhouseRoof(r, p, k),
      dollhouse_awning: (r, p, k) => this._buildDollhouseAwning(r, p, k),
      furniture_workbench: (r, p, k) => this._buildWorkbench(r, p, k),
      furniture_planter: (r, p, k) => this._buildPlanter(r, p, k),
      furniture_rack: (r, p, k) => this._buildWeaponRack(r, p, k),
      furniture_counter: (r, p, k) => this._buildCounter(r, p, k),
      prop_lantern: (r, p, k) => this._buildLantern(r, p, k),
      shrine_heart: (r, p, k) => this._buildShrine(r, p, k),
      tree_pine: (r, p, k) => this._buildPineTree(r, p, k),
      tree_broadleaf: (r, p, k) => this._buildBroadleafTree(r, p, k),
      rock_boulder: (r, p, k) => this._buildBoulder(r, p, k),
      mound_corruption: (r, p, k) => this._buildCorruptionMound(r, p, k),
      portal_monolith: (r, p, k) => this._buildPortal(r, p, k),
      wildflower_patch: (r, p, k) => this._buildWildflowerPatch(r, p, k),
      purifier_flower: (r, p, k) => this._buildPurifierFlower(r, p, k),
    };
  }

  private _buildBodyTunic(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-torso`, 0.68, 0.5, 0.68, [0, 0.68, 0], k);
    this._cyl(r, `${p}-leg-l`, 0.34, 0.2, 0.22, [-0.17, 0.17, 0], 'woodDark');
    this._cyl(r, `${p}-leg-r`, 0.34, 0.2, 0.22, [0.17, 0.17, 0], 'woodDark');
  }

  private _buildHeadRound(r: TransformNode, p: string, k: PaletteKey): void {
    this._sphere(r, `${p}-head`, 0.64, [0, 0, 0], k);
    this._sphere(r, `${p}-eye-l`, 0.1, [-0.14, 0.06, 0.28], 'corruptionDark');
    this._sphere(r, `${p}-eye-r`, 0.1, [0.14, 0.06, 0.28], 'corruptionDark');
  }

  private _buildHatExplorer(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-brim`, 0.08, 0.92, 0.96, [0, 0, 0], k);
    this._cyl(r, `${p}-crown`, 0.26, 0.54, 0.64, [0, 0.16, 0], k);
  }

  private _buildHatGoggles(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-cap`, 0.22, 0.64, 0.68, [0, 0, 0], k);
    this._box(r, `${p}-lens-l`, 0.2, 0.14, 0.1, [-0.14, -0.02, 0.32], 'amberGlow');
    this._box(r, `${p}-lens-r`, 0.2, 0.14, 0.1, [0.14, -0.02, 0.32], 'amberGlow');
  }

  private _buildHatFlower(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-stem`, 0.16, 0.18, 0.24, [0, 0, 0], k);
    this._sphere(r, `${p}-bloom`, 0.44, [0, 0.14, 0], 'amberGlow');
  }

  private _buildHatHelm(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-dome`, 0.28, 0.62, 0.72, [0, 0.02, 0], k);
    this._box(r, `${p}-crest`, 0.14, 0.24, 0.56, [0, 0.22, -0.02], 'hero');
  }

  private _buildHatBeret(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-beret`, 0.16, 0.84, 0.62, [0.06, 0.02, 0], k);
    this._sphere(r, `${p}-pom`, 0.14, [0.06, 0.14, 0], 'clayCream');
  }

  private _buildSlingshot(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-grip`, 0.34, 0.1, 0.12, [0, 0, 0], k);
    const prongL = this._cyl(r, `${p}-pl`, 0.28, 0.08, 0.08, [-0.1, 0.24, 0], k);
    const prongR = this._cyl(r, `${p}-pr`, 0.28, 0.08, 0.08, [0.1, 0.24, 0], k);
    prongL.rotation.z = 0.35;
    prongR.rotation.z = -0.35;
  }

  private _buildWrench(r: TransformNode, p: string, k: PaletteKey): void {
    this._box(r, `${p}-shaft`, 0.1, 0.58, 0.08, [0, 0.16, 0], 'stoneWarm');
    this._box(r, `${p}-head`, 0.26, 0.16, 0.12, [0, 0.46, 0], k);
  }

  private _buildWateringCan(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-can`, 0.34, 0.28, 0.32, [0, 0.08, 0], 'waterTeal');
    const spout = this._cyl(r, `${p}-spout`, 0.32, 0.07, 0.1, [0, 0.14, 0.24], k);
    spout.rotation.x = 0.85;
  }

  private _buildDollhouseShell(r: TransformNode, p: string, k: PaletteKey): void {
    const w = DOLLHOUSE_WIDTH;
    const h = DOLLHOUSE_HEIGHT;
    const d = DOLLHOUSE_DEPTH;
    const wallH = h - 0.28;
    const wallY = 0.28 + wallH / 2;
    this._box(r, `${p}-floor`, w - 0.08, 0.28, d - 0.08, [0, 0.14, 0], 'woodDark');
    this._box(r, `${p}-back`, w, wallH, 0.24, [0, wallY, d / 2 - 0.12], k);
    this._box(r, `${p}-wall-l`, 0.24, wallH, d, [-w / 2 + 0.12, wallY, 0], k);
    this._box(r, `${p}-wall-r`, 0.24, wallH, d, [w / 2 - 0.12, wallY, 0], k);
    this._box(r, `${p}-window`, 1.1, 0.95, 0.1, [0.75, 1.65, d / 2 - 0.24], 'amberGlow');
    this._box(r, `${p}-rug`, 2.2, 0.05, 1.4, [0, 0.305, -0.05], 'woodWarm');
  }

  private _buildDollhouseRoof(r: TransformNode, p: string, k: PaletteKey): void {
    const w = DOLLHOUSE_WIDTH + 0.55;
    const leftSlope = this._box(r, `${p}-roof-l`, w * 0.54, 0.2, 3.4, [-1.08, 0.48, 0], k);
    const rightSlope = this._box(r, `${p}-roof-r`, w * 0.54, 0.2, 3.4, [1.08, 0.48, 0], k);
    leftSlope.rotation.z = 0.42;
    rightSlope.rotation.z = -0.42;
    this._buildRoofGable(r, p);
    this._box(r, `${p}-chimney`, 0.48, 0.9, 0.48, [1.3, 0.85, 0.65], 'stoneWarm');
  }

  private _buildRoofGable(r: TransformNode, p: string): void {
    const gable = MeshBuilder.CreateCylinder(
      `${p}-gable`,
      { height: 0.24, diameter: 2, tessellation: 3 },
      this.scene,
    );
    gable.parent = r;
    gable.position.set(0, 0.285, DOLLHOUSE_DEPTH / 2 - 0.12);
    gable.rotationQuaternion = Quaternion.RotationAxis(Axis.X, Math.PI / 2).multiply(
      Quaternion.RotationAxis(Axis.Y, Math.PI / 2),
    );
    gable.scaling.set(0.57, 1, 2.42);
    gable.material = this.materials.getMaterial('clayCream');
    gable.receiveShadows = true;
  }

  private _buildDollhouseAwning(r: TransformNode, p: string, k: PaletteKey): void {
    const awning = this._box(r, `${p}-awning`, 2.6, 0.14, 0.72, [0, 0, 0], k);
    awning.rotation.x = 0.32;
    this._box(r, `${p}-sign`, 1.4, 0.42, 0.12, [0, 0.42, 0.08], 'woodWarm');
  }

  private _buildWorkbench(r: TransformNode, p: string, k: PaletteKey): void {
    this._box(r, `${p}-top`, 1.35, 0.14, 0.7, [0, 0.72, 0], k);
    this._box(r, `${p}-base`, 1.1, 0.68, 0.55, [0, 0.34, 0], 'woodDark');
    this._box(r, `${p}-gear`, 0.35, 0.22, 0.28, [0.25, 0.88, 0], 'stoneWarm');
  }

  private _buildPlanter(r: TransformNode, p: string, k: PaletteKey): void {
    this._box(r, `${p}-box`, 1.25, 0.62, 0.65, [0, 0.31, 0], k);
    this._sphere(r, `${p}-bush-a`, 0.46, [-0.28, 0.74, 0], 'foliageLeaf');
    this._sphere(r, `${p}-bush-b`, 0.52, [0.22, 0.78, 0], 'medic');
  }

  private _buildWeaponRack(r: TransformNode, p: string, k: PaletteKey): void {
    this._box(r, `${p}-frame`, 1.15, 1.35, 0.26, [0, 0.68, 0], k);
    this._box(r, `${p}-shield-a`, 0.44, 0.54, 0.12, [-0.24, 0.82, -0.15], 'defender');
    this._cyl(r, `${p}-spear`, 1.2, 0.08, 0.08, [0.28, 0.72, -0.12], 'stoneWarm');
  }

  private _buildCounter(r: TransformNode, p: string, k: PaletteKey): void {
    this._box(r, `${p}-desk`, 1.35, 0.78, 0.66, [0, 0.39, 0], k);
    this._sphere(r, `${p}-jar`, 0.3, [-0.28, 0.94, 0], 'amberGlow');
    this._box(r, `${p}-crate`, 0.38, 0.32, 0.36, [0.3, 0.94, 0], 'merchant');
  }

  private _buildLantern(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-cord`, 0.35, 0.05, 0.05, [0, 0.18, 0], 'woodDark');
    this._sphere(r, `${p}-bulb`, 0.34, [0, -0.05, 0], k);
  }

  private _buildShrine(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-pedestal`, 1.0, 1.4, 1.9, [0, 0.5, 0], 'stoneWarm');
    this._cyl(r, `${p}-pillar`, 1.1, 0.85, 1.05, [0, 1.45, 0], 'clayCream');
    this._sphere(r, `${p}-heart`, 0.85, [0, 2.45, 0], k);
  }

  private _buildPineTree(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-trunk`, 1.4, 0.34, 0.46, [0, 0.7, 0], 'woodDark');
    this._cyl(r, `${p}-tier-1`, 1.7, 0.1, 1.75, [0, 1.85, 0], k);
    this._cyl(r, `${p}-tier-2`, 1.4, 0.08, 1.3, [0, 2.85, 0], k);
  }

  private _buildBroadleafTree(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-trunk`, 1.6, 0.38, 0.52, [0, 0.8, 0], 'woodDark');
    this._sphere(r, `${p}-canopy-c`, 1.85, [0, 2.3, 0], k);
    this._sphere(r, `${p}-canopy-l`, 1.2, [-0.65, 2.05, 0.2], k);
  }

  private _buildBoulder(r: TransformNode, p: string, k: PaletteKey): void {
    const main = this._sphere(r, `${p}-rock-main`, 1.45, [0, 0.55, 0], k);
    main.scaling.set(1.2, 0.82, 0.95);
    this._sphere(r, `${p}-rock-side`, 0.85, [0.58, 0.34, 0.18], k);
  }

  private _buildCorruptionMound(r: TransformNode, p: string, k: PaletteKey): void {
    const mound = this._sphere(r, `${p}-sludge`, 1.65, [0, 0.35, 0], 'corruptionDark');
    mound.scaling.set(1.25, 0.55, 1.1);
    const spikeA = this._cyl(r, `${p}-spike-a`, 1.35, 0.04, 0.38, [-0.25, 0.95, 0], k);
    const spikeB = this._cyl(r, `${p}-spike-b`, 1.05, 0.04, 0.3, [0.3, 0.8, 0.15], k);
    spikeA.rotation.z = 0.22;
    spikeB.rotation.z = -0.3;
  }

  private _buildPortal(r: TransformNode, p: string, k: PaletteKey): void {
    const postL = this._box(r, `${p}-post-l`, 0.72, 4.2, 0.72, [-1.35, 2.1, 0], 'corruptionDark');
    const postR = this._box(r, `${p}-post-r`, 0.72, 4.2, 0.72, [1.35, 2.1, 0], 'corruptionDark');
    postL.rotation.z = -0.08;
    postR.rotation.z = 0.08;
    this._box(r, `${p}-lintel`, 3.5, 0.7, 0.82, [0, 4.25, 0], 'corruptionDark');
    const gate = this._cyl(r, `${p}-gate`, 0.28, 2.2, 2.2, [0, 2.15, 0], k);
    gate.rotation.x = Math.PI / 2;
  }

  private _buildWildflowerPatch(r: TransformNode, p: string, k: PaletteKey): void {
    const tuft = this._sphere(r, `${p}-tuft`, 0.9, [0, 0.12, 0], 'foliageLeaf');
    tuft.scaling.set(1.2, 0.35, 0.9);
    this._sphere(r, `${p}-bloom-a`, 0.34, [-0.26, 0.36, -0.05], k);
    this._sphere(r, `${p}-bloom-b`, 0.3, [0.22, 0.4, 0.08], 'hero');
    this._sphere(r, `${p}-bloom-c`, 0.28, [0.02, 0.45, -0.15], 'merchant');
  }

  private _buildPurifierFlower(r: TransformNode, p: string, k: PaletteKey): void {
    this._cyl(r, `${p}-stem`, 1.05, 0.1, 0.14, [0, 0.52, 0], 'foliagePine');
    const leafL = this._box(r, `${p}-leaf-l`, 0.42, 0.08, 0.22, [-0.22, 0.42, 0], 'foliageLeaf');
    const leafR = this._box(r, `${p}-leaf-r`, 0.42, 0.08, 0.22, [0.22, 0.52, 0], 'foliageLeaf');
    leafL.rotation.z = 0.35;
    leafR.rotation.z = -0.35;
    this._sphere(r, `${p}-lantern-core`, 0.56, [0, 1.15, 0], k);
    this._cyl(r, `${p}-halo`, 0.1, 0.84, 0.35, [0, 1.0, 0], 'clayCream');
  }

  private _box(
    parent: TransformNode,
    name: string,
    w: number,
    h: number,
    d: number,
    pos: Vec3 = ProceduralPartProvider.DEFAULT_VEC,
    key: PaletteKey = 'clayCream',
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    return this._finalizeMesh(mesh, parent, pos, key);
  }

  private _cyl(
    parent: TransformNode,
    name: string,
    h: number,
    dTop: number,
    dBot: number,
    pos: Vec3 = ProceduralPartProvider.DEFAULT_VEC,
    key: PaletteKey = 'woodWarm',
  ): Mesh {
    const opts = { height: h, diameterTop: dTop, diameterBottom: dBot, tessellation: 10 };
    const mesh = MeshBuilder.CreateCylinder(name, opts, this.scene);
    return this._finalizeMesh(mesh, parent, pos, key);
  }

  private _sphere(
    parent: TransformNode,
    name: string,
    diameter: number,
    pos: Vec3 = ProceduralPartProvider.DEFAULT_VEC,
    key: PaletteKey = 'clayCream',
  ): Mesh {
    const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 10 }, this.scene);
    return this._finalizeMesh(mesh, parent, pos, key);
  }

  private _finalizeMesh(
    mesh: Mesh,
    parent: TransformNode,
    pos: Vec3,
    key: PaletteKey,
  ): Mesh {
    mesh.parent = parent;
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.material = this.materials.getMaterial(key);
    mesh.receiveShadows = true;
    return mesh;
  }
}
