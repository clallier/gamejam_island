import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import type { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { type BalanceSheet, defaultBalanceSheet } from '../config/BalanceSheet.ts';
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
  PLAYER_AUTODODGE_HOP_SPEED,
  PLAYER_AUTODODGE_JUMP_SCALE,
  PLAYER_COYOTE_SECONDS,
  PLAYER_JUMP_IMPULSE,
  PLAYER_MAX_PEBBLES,
  PLAYER_START_X,
  PLAYER_START_Y,
  PLAYER_TOSS_SPEED_X,
  PLAYER_TOSS_SPEED_Y,
} from './constants.ts';
import { WalkAnimator } from './WalkAnimator.ts';

/**
 * Per-frame locomotion events emitted by `PlayerController.update` for dust VFX.
 */
export interface PlayerFrameEvents {
  readonly stepped: boolean;
  readonly landed: boolean;
}

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
  private readonly balance: BalanceSheet;
  private readonly collider: Mesh;
  private readonly aggregate: PhysicsAggregate;
  private readonly visualRoot: TransformNode;
  private readonly walkAnim: WalkAnimator;
  private readonly pebbles: Mesh[] = [];
  private facing = 1;
  private coyoteTimer = 0;
  private autoDodgeCooldown = 0;
  private squashY = 1;
  private wasGrounded = true;

  /**
   * Spawns the player Havok capsule and parents the modular visual hero.
   *
   * @param scene Target Babylon `Scene`.
   * @param physics Initialized `PhysicsWorld`.
   * @param strip `IslandStrip` providing road bounds.
   * @param materials Shared material factory for thrown physics pebbles.
   * @param model Assembled modular hero model.
   * @param balance Runtime `BalanceSheet` providing live grid-scaled player speed.
   * @example
   * const player = new PlayerController(scene, physics, strip, materials, heroModel);
   */
  public constructor(
    scene: Scene,
    physics: PhysicsWorld,
    strip: IslandStrip,
    materials: StylizedMaterialFactory,
    model: AssembledModel,
    balance: BalanceSheet = defaultBalanceSheet,
  ) {
    this.scene = scene;
    this.physics = physics;
    this.strip = strip;
    this.materials = materials;
    this.balance = balance;
    this.collider = this._createColliderMesh();
    this.aggregate = this.physics.attachDynamicCapsule(this.collider, 1);
    this.visualRoot = this._attachVisualModel(model);
    this.walkAnim = new WalkAnimator(model);
  }

  /**
   * Advances 1D movement, pebble tossing, Z-lock, auto-dodge cooldown, and toybox bounce.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @param input Current `InputSnapshot` from keyboard and touch HUD.
   * @returns Frame locomotion events (`stepped`, `landed`) for footstep and landing dust VFX.
   * @throws Error Never thrown.
   * @example
   * const events = player.update(dt, input.consumeSnapshot());
   */
  public update(deltaSeconds: number, input: InputSnapshot): PlayerFrameEvents {
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.autoDodgeCooldown = Math.max(0, this.autoDodgeCooldown - dt);
    this._enforceOneAxisBounds();
    const vel = this.physics.getLinearVelocity(this.aggregate);
    const grounded = this._updateGroundedState(dt, vel.y);
    const landed = grounded && !this.wasGrounded;
    if (landed) this.squashY = 0.78;
    this.wasGrounded = grounded;
    const moveSpeed = this.balance.getWorld('playerMoveSpeedTiles');
    this._applyHorizontalVelocity(input.moveX, vel.y, moveSpeed);
    if (input.tossPressed) this._tossPebble();
    const walk = this.walkAnim.update(dt, Math.abs(input.moveX) * moveSpeed, grounded);
    this._animateVisual(dt, walk.strideScaleY);
    return { stepped: walk.stepped, landed };
  }

  /**
   * Automatically vaults the hero away from an incoming enemy lunge when grounded and off cooldown.
   *
   * @param threatSide Incoming threat side (`-1` left, `1` right).
   * @param cooldownSeconds Cooldown duration in seconds after triggering.
   * @returns `true` if auto-dodge vault fired, else `false`.
   * @throws Error Never thrown.
   * @example
   * const dodged = player.triggerAutoDodge(1, 2.5);
   */
  public triggerAutoDodge(threatSide: -1 | 1, cooldownSeconds: number): boolean {
    if (this.autoDodgeCooldown > 0 || !this.wasGrounded) return false;
    this.coyoteTimer = 0;
    this.wasGrounded = false;
    this.squashY = 1.28;
    const safeCooldown = Number.isFinite(cooldownSeconds) ? Math.max(0.5, cooldownSeconds) : 0.5;
    this.autoDodgeCooldown = safeCooldown;
    this.physics.setLinearVelocity(
      this.aggregate,
      new Vector3(-threatSide * PLAYER_AUTODODGE_HOP_SPEED, PLAYER_JUMP_IMPULSE * PLAYER_AUTODODGE_JUMP_SCALE, 0),
    );
    return true;
  }

  /**
   * Returns remaining cooldown seconds before the next auto-dodge vault can trigger.
   *
   * @returns Remaining cooldown in seconds (`0` when ready).
   * @throws Error Never thrown.
   * @example
   * expect(player.getAutoDodgeCooldown()).toBeGreaterThan(0);
   */
  public getAutoDodgeCooldown(): number {
    return this.autoDodgeCooldown;
  }

  /**
   * Returns current vertical squash-and-stretch factor (`1` at rest, `> 1` on jump).
   *
   * @returns Current Y scale multiplier.
   * @throws Error Never thrown.
   * @example
   * expect(player.getSquashY()).toBeGreaterThan(1.05);
   */
  public getSquashY(): number {
    return this.squashY;
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

  private _applyHorizontalVelocity(moveX: number, currentVy: number, moveSpeed: number): void {
    const vx = moveX * moveSpeed;
    this.physics.setLinearVelocity(this.aggregate, new Vector3(vx, currentVy, 0));
    if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
  }

  private _tossPebble(): void {
    this.squashY = 0.88;
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

  private _animateVisual(deltaSeconds: number, strideScaleY: number): void {
    this.visualRoot.position.copyFrom(this.collider.position);
    const targetYaw = this.facing > 0 ? 0 : Math.PI;
    const alpha = 1 - Math.exp(-14 * Math.max(0, deltaSeconds));
    this.visualRoot.rotation.y = Scalar.Lerp(this.visualRoot.rotation.y, targetYaw, alpha);
    this._applySquashAndStride(deltaSeconds, strideScaleY);
  }

  private _applySquashAndStride(deltaSeconds: number, strideScaleY: number): void {
    const damp = 1 - Math.exp(-14 * Math.max(0, deltaSeconds));
    this.squashY = Scalar.Lerp(this.squashY, 1, damp);
    const targetY = this.squashY * strideScaleY;
    const invXZ = 1 / Math.sqrt(Math.max(0.5, targetY));
    this.visualRoot.scaling.set(invXZ, targetY, invXZ);
  }
}
