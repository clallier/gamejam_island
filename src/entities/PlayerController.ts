import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import type { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AssembledModel } from '../assets/ModularAssemblyFactory.ts';
import type { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import {
  PLAYER_CAPSULE_HEIGHT,
  PLAYER_CAPSULE_RADIUS,
} from '../engine/constants.ts';
import type { InputSnapshot } from '../engine/InputController.ts';
import type { PhysicsWorld } from '../engine/PhysicsWorld.ts';
import type { IslandStrip } from '../world/IslandStrip.ts';
import {
  PLAYER_COYOTE_SECONDS,
  PLAYER_JUMP_IMPULSE,
  PLAYER_MAX_PEBBLES,
  PLAYER_MOVE_SPEED,
  PLAYER_START_X,
  PLAYER_START_Y,
  PLAYER_TOSS_SPEED_X,
  PLAYER_TOSS_SPEED_Y,
} from './constants.ts';

/**
 * 1D Havok physics player controller pairing an invisible Z-locked capsule
 * collider with a separate animated modular hero `AssembledModel`.
 */
export class PlayerController {
  private static readonly ROAD_LOCK_Z = 0;

  private readonly scene: Scene;
  private readonly physics: PhysicsWorld;
  private readonly strip: IslandStrip;
  private readonly materials: StylizedMaterialFactory;
  private readonly collider: Mesh;
  private readonly aggregate: PhysicsAggregate;
  private readonly visualRoot: TransformNode;
  private readonly pebbles: Mesh[] = [];
  private facing = 1;
  private coyoteTimer = 0;
  private stridePhase = 0;

  /**
   * Spawns the player Havok capsule and parents the modular visual hero.
   *
   * @param scene Target Babylon `Scene`.
   * @param physics Initialized `PhysicsWorld`.
   * @param strip `IslandStrip` providing road bounds.
   * @param materials Shared material factory for thrown physics pebbles.
   * @param model Assembled modular hero model.
   * @example
   * const player = new PlayerController(scene, physics, strip, materials, heroModel);
   */
  public constructor(
    scene: Scene,
    physics: PhysicsWorld,
    strip: IslandStrip,
    materials: StylizedMaterialFactory,
    model: AssembledModel,
  ) {
    this.scene = scene;
    this.physics = physics;
    this.strip = strip;
    this.materials = materials;
    this.collider = this._createColliderMesh();
    this.aggregate = this.physics.attachDynamicCapsule(this.collider, 1);
    this.visualRoot = this._attachVisualModel(model);
  }

  /**
   * Advances 1D movement, jumping, pebble tossing, Z-lock, and toybox bounce.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @param input Current `InputSnapshot` from keyboard and touch HUD.
   * @example
   * player.update(dt, input.consumeSnapshot());
   */
  public update(deltaSeconds: number, input: InputSnapshot): void {
    this._enforceOneAxisBounds();
    const vel = this.physics.getLinearVelocity(this.aggregate);
    const grounded = this._updateGroundedState(deltaSeconds, vel.y);
    this._applyHorizontalVelocity(input.moveX, vel.y);
    if (input.jumpPressed && grounded) this._triggerJump();
    if (input.tossPressed) this._tossPebble();
    this._animateVisual(deltaSeconds, input.moveX, grounded);
  }

  /**
   * Returns current player X coordinate along the 1D road.
   *
   * @returns World X coordinate.
   * @example
   * const x = player.getX();
   */
  public getX(): number {
    return this.collider.position.x;
  }

  /**
   * Returns the player's current horizontal facing direction.
   *
   * @returns `1` when facing right, `-1` when facing left.
   * @throws Error Never thrown.
   * @example
   * const facing = player.getFacing();
   */
  public getFacing(): 1 | -1 {
    return this.facing === 1 ? 1 : -1;
  }

  private _createColliderMesh(): Mesh {
    const capsule = MeshBuilder.CreateCapsule(
      'player-physics-capsule',
      { height: PLAYER_CAPSULE_HEIGHT, radius: PLAYER_CAPSULE_RADIUS },
      this.scene,
    );
    capsule.position.set(PLAYER_START_X, PLAYER_START_Y, PlayerController.ROAD_LOCK_Z);
    capsule.isVisible = false;
    return capsule;
  }

  private _attachVisualModel(model: AssembledModel): TransformNode {
    const visual = new TransformNode('player-visual-root', this.scene);
    model.root.parent = visual;
    model.root.position.set(0, -PLAYER_CAPSULE_HEIGHT * 0.5, 0);
    model.root.rotation.y = Math.PI / 2;
    return visual;
  }

  private _enforceOneAxisBounds(): void {
    const clampedX = this.strip.clampRoadX(this.collider.position.x);
    this.collider.position.x = clampedX;
    this.collider.position.z = PlayerController.ROAD_LOCK_Z;
    this.collider.rotation.set(0, 0, 0);
  }

  private _updateGroundedState(deltaSeconds: number, vy: number): boolean {
    const nearFloor = this.collider.position.y <= PLAYER_CAPSULE_HEIGHT * 0.56 && Math.abs(vy) < 0.8;
    this.coyoteTimer = nearFloor ? PLAYER_COYOTE_SECONDS : Math.max(0, this.coyoteTimer - deltaSeconds);
    return this.coyoteTimer > 0;
  }

  private _applyHorizontalVelocity(moveX: number, currentVy: number): void {
    const vx = moveX * PLAYER_MOVE_SPEED;
    this.physics.setLinearVelocity(this.aggregate, new Vector3(vx, currentVy, 0));
    if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
  }

  private _triggerJump(): void {
    this.coyoteTimer = 0;
    const vel = this.physics.getLinearVelocity(this.aggregate);
    this.physics.setLinearVelocity(this.aggregate, new Vector3(vel.x, PLAYER_JUMP_IMPULSE, 0));
  }

  private _tossPebble(): void {
    if (this.pebbles.length >= PLAYER_MAX_PEBBLES) {
      this.pebbles.shift()?.dispose();
    }
    const pebble = MeshBuilder.CreateSphere('hero-pebble', { diameter: 0.32, segments: 8 }, this.scene);
    pebble.position.set(this.collider.position.x + this.facing * 0.65, this.collider.position.y + 0.35, 0);
    pebble.material = this.materials.getMaterial('amberGlow');
    const agg = this.physics.attachDynamicProp(pebble, PhysicsShapeType.SPHERE, 0.3, 0.58);
    this.physics.setLinearVelocity(agg, new Vector3(this.facing * PLAYER_TOSS_SPEED_X, PLAYER_TOSS_SPEED_Y, 0));
    this.pebbles.push(pebble);
  }

  private _animateVisual(deltaSeconds: number, moveX: number, grounded: boolean): void {
    this.visualRoot.position.copyFrom(this.collider.position);
    const targetYaw = this.facing > 0 ? 0 : Math.PI;
    const alpha = 1 - Math.exp(-14 * Math.max(0, deltaSeconds));
    this.visualRoot.rotation.y = Scalar.Lerp(this.visualRoot.rotation.y, targetYaw, alpha);
    this._applySquashAndStride(deltaSeconds, moveX, grounded);
  }

  private _applySquashAndStride(deltaSeconds: number, moveX: number, grounded: boolean): void {
    if (Math.abs(moveX) > 0.1 && grounded) {
      this.stridePhase += deltaSeconds * 13;
      const bounce = Math.abs(Math.sin(this.stridePhase));
      this.visualRoot.scaling.set(1 - bounce * 0.06, 1 + bounce * 0.08, 1 - bounce * 0.06);
      return;
    }
    this.visualRoot.scaling.set(1, 1, 1);
  }
}
