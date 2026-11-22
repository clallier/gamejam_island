import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { BlueprintRegistry } from '../assets/BlueprintRegistry.ts';
import type { AssembledModel, ModularAssemblyFactory } from '../assets/ModularAssemblyFactory.ts';
import type { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import { ENEMY_KIND } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import type { DayNightRig } from '../engine/DayNightRig.ts';

interface TracerBeam {
  readonly mesh: Mesh;
  remaining: number;
}

interface EnemyVisualEntry {
  readonly model: AssembledModel;
  spawnAge: number;
}

/**
 * Reactively spawns and disposes modular 3D enemy assemblies via bitECS
 * `observeAdded`/`observeRemoved([Enemy])` and renders brief turret tracer beams.
 */
export class EnemyVisualSystem {
  private static readonly TRACER_LIFE = 0.14;
  private static readonly POP_DURATION = 0.22;

  private readonly scene: Scene;
  private readonly ecs: IslandEcsWorld;
  private readonly assembly: ModularAssemblyFactory;
  private readonly blueprints: BlueprintRegistry;
  private readonly materials: StylizedMaterialFactory;
  private readonly lighting: DayNightRig;
  private readonly visualsByEid = new Map<number, EnemyVisualEntry>();
  private readonly tracers: TracerBeam[] = [];
  private readonly unsubAdd: () => void;
  private readonly unsubRemove: () => void;
  private tracerCounter = 0;

  /**
   * Subscribes to bitECS `Enemy` lifecycle events to keep 3D enemy visuals in sync.
   *
   * @param scene Target Babylon `Scene`.
   * @param ecs Shared `IslandEcsWorld`.
   * @param assembly `ModularAssemblyFactory` used to instantiate modular enemies.
   * @param blueprints `BlueprintRegistry` providing `enemy_gloom_sprite` / `enemy_gloom_brute`.
   * @param materials Shared stylized material factory for tracer bolts.
   * @param lighting `DayNightRig` for shadow-caster registration.
   * @throws Error Never thrown during initialization.
   * @example
   * const enemyVisuals = new EnemyVisualSystem(scene, ecs, assembly, blueprints, materials, lighting);
   */
  public constructor(
    scene: Scene,
    ecs: IslandEcsWorld,
    assembly: ModularAssemblyFactory,
    blueprints: BlueprintRegistry,
    materials: StylizedMaterialFactory,
    lighting: DayNightRig,
  ) {
    this.scene = scene;
    this.ecs = ecs;
    this.assembly = assembly;
    this.blueprints = blueprints;
    this.materials = materials;
    this.lighting = lighting;
    const { Enemy } = this.ecs.getComponents();
    this.unsubAdd = this.ecs.observeAdded([Enemy], (eid) => this._onEnemyAdded(eid));
    this.unsubRemove = this.ecs.observeRemoved([Enemy], (eid) => this._onEnemyRemoved(eid));
  }

  /**
   * Syncs enemy SoA positions to 3D models and fades transient turret tracer beams.
   *
   * @param elapsedSeconds Total elapsed simulation seconds.
   * @param dt Clamped frame delta in seconds.
   * @throws Error Never thrown during updates.
   * @example
   * enemyVisuals.update(elapsed, dt);
   */
  public update(elapsedSeconds: number, dt: number): void {
    const { Position, Enemy } = this.ecs.getComponents();
    for (const [eid, entry] of this.visualsByEid) {
      entry.spawnAge = Math.min(EnemyVisualSystem.POP_DURATION, entry.spawnAge + Math.max(0, dt));
      const pop = 0.45 + 0.55 * (entry.spawnAge / EnemyVisualSystem.POP_DURATION);
      const bob = Math.abs(Math.sin(elapsedSeconds * 7 + eid)) * 0.1;
      entry.model.root.scaling.setAll(pop);
      entry.model.root.position.set(Position.x[eid] ?? 0, bob, Position.z[eid] ?? 0);
      entry.model.root.rotation.y = (Enemy.side[eid] ?? -1) < 0 ? 0 : Math.PI;
    }
    this._stepTracers(dt);
  }

  /**
   * Spawns a thin glowing amber shot beam connecting a firing turret to its target.
   *
   * @param fromX Source turret X coordinate.
   * @param toX Impacted enemy X coordinate.
   * @throws Error Never thrown.
   * @example
   * enemyVisuals.spawnTracer(-20, -28);
   */
  public spawnTracer(fromX: number, toX: number): void {
    const span = Math.max(0.5, Math.abs(toX - fromX));
    const beam = MeshBuilder.CreateBox(
      `tracer-${this.tracerCounter++}`,
      { width: span, height: 0.08, depth: 0.08 },
      this.scene,
    );
    beam.position.set((fromX + toX) * 0.5, 0.98, 0.75);
    beam.material = this.materials.getMaterial('amberGlow');
    this.tracers.push({ mesh: beam, remaining: EnemyVisualSystem.TRACER_LIFE });
  }

  /**
   * Returns count of active 3D enemy visuals currently tracked.
   *
   * @returns Visual model count matching live `Enemy` entities.
   * @throws Error Never thrown.
   * @example
   * expect(enemyVisuals.getVisualCount()).toBe(1);
   */
  public getVisualCount(): number {
    return this.visualsByEid.size;
  }

  /**
   * Unsubscribes bitECS lifecycle observers and disposes all enemy models and tracers.
   *
   * @throws Error Never thrown during disposal.
   * @example
   * enemyVisuals.dispose();
   */
  public dispose(): void {
    this.unsubAdd();
    this.unsubRemove();
    for (const entry of this.visualsByEid.values()) entry.model.root.dispose(false, false);
    this.visualsByEid.clear();
    while (this.tracers.length > 0) this.tracers.pop()?.mesh.dispose();
  }

  private _onEnemyAdded(eid: number): void {
    if (this.visualsByEid.has(eid)) return;
    const { Position, Enemy } = this.ecs.getComponents();
    const kind = Enemy.kind[eid] === ENEMY_KIND.GLOOM_BRUTE ? 'enemy_gloom_brute' : 'enemy_gloom_sprite';
    const model = this.assembly.assemble(this.blueprints.getPropBlueprint(kind), `enemy-${eid}`);
    model.root.position.set(Position.x[eid] ?? 0, 0, Position.z[eid] ?? 0);
    model.root.scaling.setAll(0.45);
    this.lighting.addShadowCasters(model.getMeshes());
    this.visualsByEid.set(eid, { model, spawnAge: 0 });
  }

  private _onEnemyRemoved(eid: number): void {
    const entry = this.visualsByEid.get(eid);
    if (!entry) return;
    entry.model.root.dispose(false, false);
    this.visualsByEid.delete(eid);
  }

  private _stepTracers(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i]!;
      tracer.remaining -= dt;
      if (tracer.remaining <= 0) {
        tracer.mesh.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
