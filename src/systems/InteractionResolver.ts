import { INTERACTABLE_KIND } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import type { DollhousePlot, ResourceNodeKind } from '../world/constants.ts';
import type { CorruptionField } from '../world/CorruptionField.ts';
import type { IslandStrip } from '../world/IslandStrip.ts';
import type { ResourceNodeCatalog } from '../world/ResourceNodeCatalog.ts';

export type InteractionTarget =
  | { readonly type: 'dollhouse'; readonly plot: DollhousePlot; readonly icon: '🏠'; readonly label: string }
  | { readonly type: 'mound'; readonly id: string; readonly x: number; readonly icon: '✨'; readonly label: 'Scrub' }
  | { readonly type: 'resource'; readonly id: string; readonly x: number; readonly kind: ResourceNodeKind; readonly icon: string; readonly label: string };

/**
 * Resolves the highest-priority interactive target near the player using a
 * single allocation-free bitECS query over `[Position, Interactable]`.
 */
export class InteractionResolver {
  private static readonly RESOURCE_PROMPTS: Record<ResourceNodeKind, { icon: string; label: string }> = {
    tree_pine: { icon: '🪓', label: 'Chop' },
    tree_broadleaf: { icon: '🪓', label: 'Chop' },
    boulder: { icon: '⛏', label: 'Mine' },
    wildflower: { icon: '🌸', label: 'Forage' },
  };

  /**
   * Scans bitECS interactables and returns the best active target within range.
   *
   * @param playerX Current player X coordinate.
   * @param ecs Active `IslandEcsWorld`.
   * @param strip `IslandStrip` owning dollhouse definitions.
   * @param resources `ResourceNodeCatalog` owning resource node metadata.
   * @param corruption `CorruptionField` owning pollution mound metadata.
   * @returns Resolved `InteractionTarget` or `null` when none are in range.
   * @example
   * const target = resolver.resolve(playerX, ecs, strip, nodes, corruption);
   */
  public resolve(
    playerX: number,
    ecs: IslandEcsWorld,
    strip: IslandStrip,
    resources: ResourceNodeCatalog,
    corruption: CorruptionField,
  ): InteractionTarget | null {
    const bestEid = this._findBestEntity(playerX, ecs);
    if (bestEid === -1) return null;
    const { Interactable } = ecs.getComponents();
    const kind = Interactable.kind[bestEid] ?? 0;
    const payloadIndex = Interactable.payloadIndex[bestEid] ?? 0;
    return this._mapTarget(kind, payloadIndex, strip, resources, corruption);
  }

  private _findBestEntity(playerX: number, ecs: IslandEcsWorld): number {
    const { Position, Interactable } = ecs.getComponents();
    let bestEid = -1;
    let bestPriority = -1;
    let bestDist = Infinity;
    for (const eid of ecs.queryEntities([Position, Interactable])) {
      if ((Interactable.active[eid] ?? 0) === 0) continue;
      const dist = Math.abs((Position.x[eid] ?? 0) - playerX);
      const priority = Interactable.priority[eid] ?? 0;
      if (dist <= (Interactable.range[eid] ?? 0) && this._isBetter(priority, dist, bestPriority, bestDist)) {
        bestEid = eid;
        bestPriority = priority;
        bestDist = dist;
      }
    }
    return bestEid;
  }

  private _isBetter(p: number, d: number, bestP: number, bestD: number): boolean {
    return p > bestP || (p === bestP && d < bestD);
  }

  private _mapTarget(
    kind: number,
    index: number,
    strip: IslandStrip,
    resources: ResourceNodeCatalog,
    corruption: CorruptionField,
  ): InteractionTarget | null {
    if (kind === INTERACTABLE_KIND.DOLLHOUSE) {
      const plot = strip.getDollhousePlots()[index];
      return plot ? { type: 'dollhouse', plot, icon: '🏠', label: plot.npcName } : null;
    }
    if (kind === INTERACTABLE_KIND.MOUND) {
      const mound = corruption.getMounds()[index];
      return mound && !mound.scrubbed ? { type: 'mound', id: mound.id, x: mound.x, icon: '✨', label: 'Scrub' } : null;
    }
    const node = resources.getAllNodes()[index];
    if (!node || node.depleted) return null;
    return { type: 'resource', id: node.id, x: node.x, kind: node.kind, ...InteractionResolver.RESOURCE_PROMPTS[node.kind] };
  }
}
