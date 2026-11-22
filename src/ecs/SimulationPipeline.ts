import { pipe } from 'bitecs';
import type { LootDropSystem } from '../entities/LootDropSystem.ts';
import type { IslandEnvironment } from '../scene/IslandEnvironment.ts';
import type { InteractionResolver, InteractionTarget } from '../systems/InteractionResolver.ts';
import type { CorruptionField } from '../world/CorruptionField.ts';
import type { InventoryStore } from '../world/InventoryStore.ts';
import type { IslandStrip } from '../world/IslandStrip.ts';
import type { ResourceNodeCatalog } from '../world/ResourceNodeCatalog.ts';
import type { ResourceKey } from '../world/constants.ts';
import type { IslandEcsWorld } from './IslandEcsWorld.ts';

/**
 * Mutable per-frame state threaded through the bitECS `pipe` pipeline without allocating.
 */
export interface SimulationFrameContext {
  dt: number;
  elapsedSeconds: number;
  playerX: number;
  target: InteractionTarget | null;
  collectedLoot: Partial<Record<ResourceKey, number>>;
}

/**
 * Collaborators injected into `SimulationPipeline`.
 */
export interface SimulationPipelineDeps {
  ecs: IslandEcsWorld;
  strip: IslandStrip;
  resources: ResourceNodeCatalog;
  corruption: CorruptionField;
  inventory: InventoryStore;
  resolver: InteractionResolver;
  lootDrops: LootDropSystem;
  environment: IslandEnvironment;
}

/**
 * Composes per-frame simulation stages using bitECS `pipe` over a pre-allocated context object.
 */
export class SimulationPipeline {
  private readonly deps: SimulationPipelineDeps;
  private readonly ctx: SimulationFrameContext;
  private readonly pipeline: (ctx: SimulationFrameContext) => SimulationFrameContext;

  /**
   * Builds a reusable bitECS `pipe` runner for per-frame simulation updates.
   * @param deps World stores, resolver, loot system, and environment bound to the pipeline.
   * @throws Error Never thrown during construction.
   * @example const sim = new SimulationPipeline(deps);
   */
  public constructor(deps: SimulationPipelineDeps) {
    this.deps = deps;
    this.ctx = {
      dt: 0,
      elapsedSeconds: 0,
      playerX: 0,
      target: null,
      collectedLoot: {},
    };
    this.pipeline = pipe(
      (ctx: SimulationFrameContext) => this._stepLoot(ctx),
      (ctx: SimulationFrameContext) => this._resolveTarget(ctx),
      (ctx: SimulationFrameContext) => this._updateEnvironment(ctx),
    );
  }

  /**
   * Runs one deterministic simulation frame over the pre-allocated context.
   * @param dt Clamped frame delta in seconds.
   * @param elapsedSeconds Total elapsed simulation time in seconds.
   * @param playerX Current player horizontal coordinate along the 1D strip.
   * @returns The reused `SimulationFrameContext` populated with target and collected loot.
   * @throws Error Propagates any error from injected collaborators.
   * @example const frame = sim.run(0.016, 12.4, -3.5);
   */
  public run(dt: number, elapsedSeconds: number, playerX: number): SimulationFrameContext {
    this.ctx.dt = dt;
    this.ctx.elapsedSeconds = elapsedSeconds;
    this.ctx.playerX = playerX;
    this.ctx.target = null;
    this.ctx.collectedLoot = {};
    return this.pipeline(this.ctx);
  }

  private _stepLoot(ctx: SimulationFrameContext): SimulationFrameContext {
    ctx.collectedLoot = this.deps.lootDrops.update(ctx.dt, ctx.playerX, this.deps.inventory);
    return ctx;
  }

  private _resolveTarget(ctx: SimulationFrameContext): SimulationFrameContext {
    ctx.target = this.deps.resolver.resolve(
      ctx.playerX,
      this.deps.ecs,
      this.deps.strip,
      this.deps.resources,
      this.deps.corruption,
    );
    return ctx;
  }

  private _updateEnvironment(ctx: SimulationFrameContext): SimulationFrameContext {
    this.deps.environment.update(ctx.elapsedSeconds, ctx.dt, ctx.playerX, this.deps.corruption);
    return ctx;
  }
}
