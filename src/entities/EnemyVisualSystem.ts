import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { BlueprintRegistry } from '../assets/BlueprintRegistry.ts';
import type { ModularAssemblyFactory } from '../assets/ModularAssemblyFactory.ts';
import type { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import { ENEMY_KIND, MAX_ENTITIES } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import type { DayNightRig } from '../engine/DayNightRig.ts';

interface TracerEntry {
  readonly mesh: Mesh;
  remaining: number;
}

interface ArrowProjectile {
  readonly mesh: Mesh;
  readonly fromX: number;
  readonly toX: number;
  elapsed: number;
  readonly duration: number;
}

interface FireworkSpark {
  readonly mesh: Mesh;
  vx: number;
  vy: number;
  vz: number;
  remaining: number;
}

/**
 * Renders hundreds of night enemies via GPU `ThinInstance` buffers driven reactively
 * by bitECS `observeAdded`/`observeRemoved([Enemy])`, plus pooled turret tracers,
 * parabolic bow arrows, and battle fireworks.
 */
export class EnemyVisualSystem {
  private static readonly TRACER_LIFE = 0.14;
  private static readonly ARROW_FLIGHT = 0.22;
  private static readonly POP_DURATION = 0.22;
  private static readonly SPARK_LIFE = 0.28;
  private static readonly SPARK_GRAVITY = -18;
  private static readonly MAX_TRACERS = 32;
  private static readonly MAX_ARROWS = 24;
  private static readonly MAX_SPARKS = 48;
  private static readonly ARCHETYPE_COUNT = 3;

  private readonly scene: Scene;
  private readonly ecs: IslandEcsWorld;
  private readonly materials: StylizedMaterialFactory;
  private readonly prototypes: readonly [Mesh, Mesh, Mesh];
  private readonly matrices: readonly [Float32Array, Float32Array, Float32Array];
  private readonly counts = new Uint16Array(EnemyVisualSystem.ARCHETYPE_COUNT);
  private readonly spawnAgeByEid = new Map<number, number>();
  private readonly activeTracers: TracerEntry[] = [];
  private readonly tracerPool: Mesh[] = [];
  private readonly activeArrows: ArrowProjectile[] = [];
  private readonly arrowPool: Mesh[] = [];
  private readonly activeSparks: FireworkSpark[] = [];
  private readonly sparkPool: Mesh[] = [];
  private readonly scratchMatrix = Matrix.Identity();
  private readonly scratchPos = new Vector3();
  private readonly scratchScale = new Vector3();
  private readonly quatRight = Quaternion.RotationYawPitchRoll(0, 0, 0);
  private readonly quatLeft = Quaternion.RotationYawPitchRoll(Math.PI, 0, 0);
  private readonly unsubAdd: () => void;
  private readonly unsubRemove: () => void;
  private tracerCounter = 0;
  private arrowCounter = 0;
  private sparkCounter = 0;

  /**
   * Initializes GPU `ThinInstance` enemy prototypes and subscribes to bitECS `Enemy` lifecycle events.
   *
   * @param scene Target Babylon `Scene`.
   * @param ecs Shared `IslandEcsWorld`.
   * @param _assembly Preserved DI slot for modular assembly pipelines.
   * @param _blueprints Preserved DI slot for blueprint catalogs.
   * @param materials Shared stylized material factory.
   * @param lighting `DayNightRig` for shadow-caster registration.
   * @throws Error Never thrown during initialization.
   * @example
   * const enemyVisuals = new EnemyVisualSystem(scene, ecs, assembly, blueprints, materials, lighting);
   */
  public constructor(
    scene: Scene,
    ecs: IslandEcsWorld,
    _assembly: ModularAssemblyFactory,
    _blueprints: BlueprintRegistry,
    materials: StylizedMaterialFactory,
    lighting: DayNightRig,
  ) {
    this.scene = scene;
    this.ecs = ecs;
    this.materials = materials;
    this.prototypes = this._createPrototypes(lighting);
    this.matrices = [
      new Float32Array(MAX_ENTITIES * 16),
      new Float32Array(MAX_ENTITIES * 16),
      new Float32Array(MAX_ENTITIES * 16),
    ];
    const { Enemy } = this.ecs.getComponents();
    this.unsubAdd = this.ecs.observeAdded([Enemy], (eid) => this._onEnemyAdded(eid));
    this.unsubRemove = this.ecs.observeRemoved([Enemy], (eid) => this._onEnemyRemoved(eid));
  }

  /**
   * Uploads updated enemy `ThinInstance` transforms and steps tracers, arrows, and fireworks.
   *
   * @param elapsedSeconds Total elapsed simulation seconds.
   * @param dt Clamped frame delta in seconds.
   * @throws Error Never thrown during updates.
   * @example
   * enemyVisuals.update(elapsed, dt);
   */
  public update(elapsedSeconds: number, dt: number): void {
    this.counts.fill(0);
    const { Position, Enemy } = this.ecs.getComponents();
    for (const [eid, prevAge] of this.spawnAgeByEid) {
      const nextAge = Math.min(EnemyVisualSystem.POP_DURATION, prevAge + Math.max(0, dt));
      this.spawnAgeByEid.set(eid, nextAge);
      this._writeEnemyMatrix(eid, nextAge, elapsedSeconds, Position, Enemy);
    }
    this._flushThinInstances();
    this._stepTracers(dt);
    this._stepArrows(dt);
    this._stepSparks(dt);
  }

  /**
   * Spawns a pooled turret beam or delegates player shots to a parabolic bow arrow.
   *
   * @param fromX Origin X coordinate.
   * @param toX Impacted target X coordinate.
   * @param source Whether fired by a `'turret'` or `'player'`. Defaults to `'turret'`.
   * @throws Error Never thrown.
   * @example
   * enemyVisuals.spawnTracer(0, 8, 'player');
   */
  public spawnTracer(fromX: number, toX: number, source: 'turret' | 'player' = 'turret'): void {
    if (source === 'player') {
      this.spawnArrow(fromX, toX);
      return;
    }
    const mesh = this._acquireTracerMesh();
    mesh.material = this.materials.getMaterial('amberGlow');
    mesh.scaling.set(Math.max(0.5, Math.abs(toX - fromX)), 1, 1);
    mesh.position.set((fromX + toX) * 0.5, 0.98, 0.75);
    mesh.setEnabled(true);
    this.activeTracers.push({ mesh, remaining: EnemyVisualSystem.TRACER_LIFE });
  }

  /**
   * Launches a pooled parabolic bow arrow arching cleanly from `fromX` to `toX`.
   *
   * @param fromX Player release X coordinate.
   * @param toX Target enemy impact X coordinate.
   * @throws Error Never thrown.
   * @example
   * enemyVisuals.spawnArrow(0, 7.5);
   */
  public spawnArrow(fromX: number, toX: number): void {
    const mesh = this._acquireArrowMesh();
    mesh.material = this.materials.getMaterial('amberGlow');
    mesh.position.set(fromX, 1.05, 0);
    mesh.rotation.z = toX >= fromX ? 0.55 : -0.55;
    mesh.setEnabled(true);
    this.activeArrows.push({ mesh, fromX, toX, elapsed: 0, duration: EnemyVisualSystem.ARROW_FLIGHT });
  }

  /**
   * Spawns a celebratory firework burst of pooled glowing sparks at `x`.
   *
   * @param x World X coordinate of the defeated enemy.
   * @throws Error Never thrown.
   * @example
   * enemyVisuals.spawnFirework(-24);
   */
  public spawnFirework(x: number): void {
    const palettes = ['amberGlow', 'corruptionNeon', 'hero'] as const;
    for (let i = 0; i < 4; i++) {
      const mesh = this._acquireSparkMesh();
      mesh.material = this.materials.getMaterial(palettes[(this.sparkCounter + i) % palettes.length]!);
      mesh.position.set(x, 0.85, 0);
      mesh.scaling.setAll(1);
      mesh.setEnabled(true);
      const spread = (i - 1.5) * 2.4;
      this.activeSparks.push({ mesh, vx: spread, vy: 5.5 + (i % 2) * 2, vz: (i % 2 === 0 ? 1 : -1) * 1.4, remaining: EnemyVisualSystem.SPARK_LIFE });
    }
  }

  /**
   * Returns count of active night enemies tracked by `EnemyVisualSystem`.
   *
   * @returns Tracked enemy count.
   * @throws Error Never thrown.
   * @example
   * expect(enemyVisuals.getVisualCount()).toBe(260);
   */
  public getVisualCount(): number {
    return this.spawnAgeByEid.size;
  }

  /**
   * Returns count of currently active tracer beams.
   *
   * @returns Active tracer beam count.
   * @throws Error Never thrown.
   * @example
   * expect(enemyVisuals.getActiveTracerCount()).toBe(1);
   */
  public getActiveTracerCount(): number {
    return this.activeTracers.length;
  }

  /**
   * Returns count of currently mid-flight bow arrows.
   *
   * @returns Active arrow count.
   * @throws Error Never thrown.
   * @example
   * expect(enemyVisuals.getActiveArrowCount()).toBe(1);
   */
  public getActiveArrowCount(): number {
    return this.activeArrows.length;
  }

  /**
   * Returns count of currently active firework spark particles.
   *
   * @returns Active spark count.
   * @throws Error Never thrown.
   * @example
   * expect(enemyVisuals.getActiveSparkCount()).toBe(4);
   */
  public getActiveSparkCount(): number {
    return this.activeSparks.length;
  }

  /**
   * Unsubscribes bitECS lifecycle observers and disposes prototypes, tracers, arrows, and sparks cleanly.
   *
   * @throws Error Never thrown during disposal.
   * @example
   * enemyVisuals.dispose();
   */
  public dispose(): void {
    this.unsubAdd();
    this.unsubRemove();
    this.spawnAgeByEid.clear();
    for (const proto of this.prototypes) proto.dispose(false, false);
    this._disposeMeshPairs(this.activeTracers, this.tracerPool);
    this._disposeMeshPairs(this.activeArrows, this.arrowPool);
    this._disposeMeshPairs(this.activeSparks, this.sparkPool);
  }

  private _createPrototypes(lighting: DayNightRig): readonly [Mesh, Mesh, Mesh] {
    const sprite = MeshBuilder.CreateSphere('enemy-proto-sprite', { diameter: 0.78, segments: 8 }, this.scene);
    sprite.material = this.materials.getMaterial('corruptionNeon');
    const brute = MeshBuilder.CreateBox('enemy-proto-brute', { width: 1.0, height: 1.18, depth: 0.92 }, this.scene);
    brute.material = this.materials.getMaterial('corruptionDark');
    const rusher = MeshBuilder.CreateSphere('enemy-proto-rusher', { diameter: 0.62, segments: 6 }, this.scene);
    rusher.material = this.materials.getMaterial('hero');
    for (const mesh of [sprite, brute, rusher]) {
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.setEnabled(false);
    }
    lighting.addShadowCasters([sprite, brute, rusher]);
    return [sprite, brute, rusher];
  }

  private _onEnemyAdded(eid: number): void {
    if (!this.spawnAgeByEid.has(eid)) this.spawnAgeByEid.set(eid, 0);
  }

  private _onEnemyRemoved(eid: number): void {
    this.spawnAgeByEid.delete(eid);
  }

  private _writeEnemyMatrix(
    eid: number,
    spawnAge: number,
    elapsedSeconds: number,
    Position: { readonly x: Float32Array; readonly z: Float32Array },
    Enemy: { readonly kind: Uint8Array; readonly side: Int8Array; readonly hitFlash: Float32Array },
  ): void {
    const kind = Math.min(2, Enemy.kind[eid] ?? ENEMY_KIND.GLOOM_SPRITE);
    const slot = this.counts[kind] ?? 0;
    if (slot >= MAX_ENTITIES) return;
    this.counts[kind] = slot + 1;
    const pop = 0.45 + 0.55 * (spawnAge / EnemyVisualSystem.POP_DURATION);
    const flash = (Enemy.hitFlash[eid] ?? 0) > 0 ? 1.24 : 1;
    const scale = pop * flash;
    const baseY = kind === ENEMY_KIND.GLOOM_BRUTE ? 0.59 : 0.42;
    const bob = Math.abs(Math.sin(elapsedSeconds * 7 + eid)) * 0.12;
    this.scratchPos.set(Position.x[eid] ?? 0, baseY + bob, Position.z[eid] ?? 0);
    this.scratchScale.set(kind === ENEMY_KIND.GLOOM_RUSHER ? scale * 1.25 : scale, scale, scale);
    const quat = (Enemy.side[eid] ?? -1) < 0 ? this.quatRight : this.quatLeft;
    Matrix.ComposeToRef(this.scratchScale, quat, this.scratchPos, this.scratchMatrix);
    this.scratchMatrix.copyToArray(this.matrices[kind]!, slot * 16);
  }

  private _flushThinInstances(): void {
    for (let k = 0; k < EnemyVisualSystem.ARCHETYPE_COUNT; k++) {
      const proto = this.prototypes[k]!;
      const count = this.counts[k] ?? 0;
      if (count <= 0) {
        proto.thinInstanceCount = 0;
        proto.setEnabled(false);
        continue;
      }
      proto.setEnabled(true);
      proto.thinInstanceSetBuffer('matrix', this.matrices[k]!.subarray(0, count * 16), 16, false);
    }
  }

  private _acquireTracerMesh(): Mesh {
    const recycled = this.tracerPool.pop();
    if (recycled) return recycled;
    if (this.activeTracers.length >= EnemyVisualSystem.MAX_TRACERS) {
      return this.activeTracers.shift()!.mesh;
    }
    return MeshBuilder.CreateBox(`tracer-${this.tracerCounter++}`, { width: 1, height: 0.08, depth: 0.08 }, this.scene);
  }

  private _acquireArrowMesh(): Mesh {
    const recycled = this.arrowPool.pop();
    if (recycled) return recycled;
    if (this.activeArrows.length >= EnemyVisualSystem.MAX_ARROWS) {
      return this.activeArrows.shift()!.mesh;
    }
    return MeshBuilder.CreateBox(`arrow-${this.arrowCounter++}`, { width: 0.72, height: 0.06, depth: 0.06 }, this.scene);
  }

  private _acquireSparkMesh(): Mesh {
    const recycled = this.sparkPool.pop();
    if (recycled) return recycled;
    if (this.activeSparks.length >= EnemyVisualSystem.MAX_SPARKS) {
      return this.activeSparks.shift()!.mesh;
    }
    return MeshBuilder.CreateSphere(`spark-${this.sparkCounter++}`, { diameter: 0.22, segments: 6 }, this.scene);
  }

  private _stepTracers(dt: number): void {
    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const tracer = this.activeTracers[i]!;
      tracer.remaining -= dt;
      if (tracer.remaining <= 0) {
        tracer.mesh.setEnabled(false);
        this.tracerPool.push(tracer.mesh);
        this.activeTracers.splice(i, 1);
      }
    }
  }

  private _stepArrows(dt: number): void {
    for (let i = this.activeArrows.length - 1; i >= 0; i--) {
      const arrow = this.activeArrows[i]!;
      arrow.elapsed += Math.max(0, dt);
      const t = arrow.elapsed / arrow.duration;
      if (t >= 1) {
        arrow.mesh.setEnabled(false);
        this.arrowPool.push(arrow.mesh);
        this.activeArrows.splice(i, 1);
        continue;
      }
      this._poseArcArrow(arrow, t);
    }
  }

  private _poseArcArrow(arrow: ArrowProjectile, t: number): void {
    const dx = arrow.toX - arrow.fromX;
    const x = arrow.fromX + dx * t;
    const y = 1.05 * (1 - t) + 0.65 * t + Math.sin(t * Math.PI) * 1.45;
    const slopeY = -0.4 + Math.cos(t * Math.PI) * Math.PI * 1.45;
    arrow.mesh.position.set(x, y, 0);
    arrow.mesh.rotation.z = Math.atan2(slopeY, dx === 0 ? 1 : dx);
  }

  private _stepSparks(dt: number): void {
    for (let i = this.activeSparks.length - 1; i >= 0; i--) {
      const spark = this.activeSparks[i]!;
      spark.remaining -= dt;
      if (spark.remaining <= 0) {
        spark.mesh.setEnabled(false);
        this.sparkPool.push(spark.mesh);
        this.activeSparks.splice(i, 1);
        continue;
      }
      spark.vy += EnemyVisualSystem.SPARK_GRAVITY * dt;
      spark.mesh.position.addInPlaceFromFloats(spark.vx * dt, spark.vy * dt, spark.vz * dt);
      spark.mesh.scaling.setAll(Math.max(0.15, spark.remaining / EnemyVisualSystem.SPARK_LIFE));
    }
  }

  private _disposeMeshPairs(active: Array<{ readonly mesh: Mesh }>, pool: Mesh[]): void {
    while (active.length > 0) active.pop()?.mesh.dispose(false, false);
    while (pool.length > 0) pool.pop()?.dispose(false, false);
  }
}
