import '@babylonjs/core/Physics/joinedPhysicsEngineComponent.js';
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import type { Scene } from '@babylonjs/core/scene.js';
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { GRAVITY_Y } from './constants.ts';

export type HavokInitOptions = Parameters<typeof HavokPhysics>[0];

/**
 * Facade managing Havok WASM initialization and physics body creation
 * for static island ground, the Z-locked player capsule, and bouncing props.
 */
export class PhysicsWorld {
  private readonly scene: Scene;
  private readonly havokOptions: HavokInitOptions;
  private initialized = false;

  /**
   * Creates a physics world facade bound to a Babylon `Scene`.
   *
   * @param scene Target Babylon `Scene`.
   * @param havokOptions Optional Havok Emscripten init overrides (e.g. `wasmBinary` for tests).
   * @example
   * const physics = new PhysicsWorld(scene);
   * await physics.initialize();
   */
  public constructor(
    scene: Scene,
    havokOptions: HavokInitOptions = { locateFile: () => havokWasmUrl },
  ) {
    this.scene = scene;
    this.havokOptions = havokOptions;
  }

  /**
   * Loads the Havok WASM binary and enables Babylon v2 physics on the scene.
   *
   * @returns Promise resolving when Havok is active on `scene`.
   * @throws {Error} When Havok fails to initialize or enable on the scene.
   * @example
   * await physics.initialize();
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    const havokInstance = await HavokPhysics(this.havokOptions);
    const plugin = new HavokPlugin(true, havokInstance);
    const enabled = this.scene.enablePhysics(new Vector3(0, GRAVITY_Y, 0), plugin);
    if (!enabled) {
      throw new Error('Failed to enable Havok physics plugin on Babylon scene');
    }
    this.initialized = true;
  }

  /**
   * Attaches an immovable static box collider to a terrain or road node.
   *
   * @param node Terrain or road `TransformNode` / `Mesh`.
   * @param friction Surface friction coefficient. Defaults to `0.45`.
   * @param restitution Bounce factor. Defaults to `0.05`.
   * @returns Created static `PhysicsAggregate`.
   * @example
   * physics.attachStaticBox(roadMesh);
   */
  public attachStaticBox(
    node: TransformNode,
    friction = 0.45,
    restitution = 0.05,
  ): PhysicsAggregate {
    return new PhysicsAggregate(
      node,
      PhysicsShapeType.BOX,
      { mass: 0, friction, restitution },
      this.scene,
    );
  }

  /**
   * Attaches a dynamic non-tipping capsule body for the 1D character controller.
   *
   * @param node Invisible collider mesh.
   * @param mass Dynamic body mass in kg. Defaults to `1`.
   * @returns Configured `PhysicsAggregate` with zero angular inertia.
   * @example
   * const agg = physics.attachDynamicCapsule(colliderMesh, 1);
   */
  public attachDynamicCapsule(node: TransformNode, mass = 1): PhysicsAggregate {
    const agg = new PhysicsAggregate(
      node,
      PhysicsShapeType.CAPSULE,
      { mass, friction: 0, restitution: 0 },
      this.scene,
    );
    agg.body.setMassProperties({ mass, inertia: Vector3.Zero() });
    agg.body.disablePreStep = false;
    agg.body.setLinearDamping(0.05);
    return agg;
  }

  /**
   * Attaches a dynamic rigidbody collider to a road prop (crate, pebble, crate).
   *
   * @param node Prop mesh node.
   * @param shapeType Collision shape (`BOX` or `SPHERE`).
   * @param mass Body mass in kg. Defaults to `0.55`.
   * @param restitution Bounce coefficient. Defaults to `0.48`.
   * @returns Dynamic `PhysicsAggregate`.
   * @example
   * physics.attachDynamicProp(pebbleMesh, PhysicsShapeType.SPHERE, 0.35, 0.6);
   */
  public attachDynamicProp(
    node: AbstractMesh,
    shapeType: PhysicsShapeType = PhysicsShapeType.BOX,
    mass = 0.55,
    restitution = 0.48,
  ): PhysicsAggregate {
    const agg = new PhysicsAggregate(
      node,
      shapeType,
      { mass, friction: 0.45, restitution },
      this.scene,
    );
    agg.body.disablePreStep = false;
    return agg;
  }

  /**
   * Applies an instantaneous world-space impulse at the body's position.
   *
   * @param aggregate Target `PhysicsAggregate`.
   * @param impulse Impulse vector in N*s.
   * @example
   * physics.applyImpulse(playerAgg, new Vector3(0, 11, 0));
   */
  public applyImpulse(aggregate: PhysicsAggregate, impulse: Vector3): void {
    aggregate.body.applyImpulse(impulse, aggregate.transformNode.getAbsolutePosition());
  }

  /**
   * Sets the linear velocity vector of a dynamic physics aggregate.
   *
   * @param aggregate Target `PhysicsAggregate`.
   * @param velocity World-space linear velocity in m/s.
   * @example
   * physics.setLinearVelocity(playerAgg, new Vector3(6, vel.y, 0));
   */
  public setLinearVelocity(aggregate: PhysicsAggregate, velocity: Vector3): void {
    aggregate.body.setLinearVelocity(velocity);
  }

  /**
   * Reads the current linear velocity of a dynamic physics aggregate.
   *
   * @param aggregate Target `PhysicsAggregate`.
   * @returns Linear velocity `Vector3`.
   * @example
   * const v = physics.getLinearVelocity(playerAgg);
   */
  public getLinearVelocity(aggregate: PhysicsAggregate): Vector3 {
    return aggregate.body.getLinearVelocity();
  }
}
