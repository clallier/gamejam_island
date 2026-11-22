import {
  INITIAL_RESOURCE_NODES,
  type ResourceKey,
  type ResourceNodeKind,
  type ResourceNodeSeed,
} from './constants.ts';

export interface ResourceNodeState extends ResourceNodeSeed {
  readonly maxHp: number;
  hp: number;
  depleted: boolean;
  readonly dropResource: ResourceKey;
  readonly dropCount: number;
}

export interface NodeHitOutcome {
  readonly hit: boolean;
  readonly depleted: boolean;
  readonly dropResource: ResourceKey;
  readonly dropAmount: number;
  readonly x: number;
  readonly z: number;
}

interface KindSpec {
  readonly maxHp: number;
  readonly dropResource: ResourceKey;
  readonly dropCount: number;
}

/**
 * Pure simulation catalog of harvestable frontier trees, boulders, and wildflowers.
 */
export class ResourceNodeCatalog {
  private static readonly KIND_SPECS: Record<ResourceNodeKind, KindSpec> = {
    tree_pine: { maxHp: 3, dropResource: 'wood', dropCount: 2 },
    tree_broadleaf: { maxHp: 3, dropResource: 'wood', dropCount: 2 },
    boulder: { maxHp: 3, dropResource: 'stone', dropCount: 2 },
    wildflower: { maxHp: 1, dropResource: 'petals', dropCount: 2 },
  };

  private readonly nodes: ResourceNodeState[];

  /**
   * Initializes harvestable resource nodes along both island flanks.
   *
   * @param seeds Initial node placements. Defaults to `INITIAL_RESOURCE_NODES`.
   * @example
   * const catalog = new ResourceNodeCatalog();
   */
  public constructor(seeds: readonly ResourceNodeSeed[] = INITIAL_RESOURCE_NODES) {
    this.nodes = seeds.map((seed) => this._createState(seed));
  }

  /**
   * Returns read-only state descriptors for all resource nodes.
   *
   * @returns Array of `ResourceNodeState`.
   * @example
   * const nodes = catalog.getAllNodes();
   */
  public getAllNodes(): readonly ResourceNodeState[] {
    return this.nodes;
  }

  /**
   * Finds the nearest non-depleted resource node within `maxDistance` of `x`.
   *
   * @param x Player X coordinate along the road.
   * @param maxDistance Maximum X distance to interact.
   * @returns Closest active `ResourceNodeState` or `null`.
   * @example
   * const node = catalog.findNearestHarvestable(24.1, 3.2);
   */
  public findNearestHarvestable(x: number, maxDistance: number): ResourceNodeState | null {
    let best: ResourceNodeState | null = null;
    let bestDist = maxDistance;
    for (const node of this.nodes) {
      const dist = Math.abs(node.x - x);
      if (!node.depleted && dist <= bestDist) {
        best = node;
        bestDist = dist;
      }
    }
    return best;
  }

  /**
   * Applies harvest damage to a node and returns its drop payload.
   *
   * @param id Node identifier.
   * @param damage Hit damage. Defaults to `1`.
   * @returns `NodeHitOutcome` or `null` when missing or already depleted.
   * @example
   * const outcome = catalog.hitNode('node-right-flower-inner');
   */
  public hitNode(id: string, damage = 1): NodeHitOutcome | null {
    const node = this.nodes.find((n) => n.id === id);
    if (!node || node.depleted) return null;
    node.hp = Math.max(0, node.hp - Math.max(1, damage));
    const depleted = node.hp === 0;
    if (depleted) node.depleted = true;
    const dropAmount = depleted ? node.dropCount : 1;
    return { hit: true, depleted, dropResource: node.dropResource, dropAmount, x: node.x, z: node.z };
  }

  /**
   * Restores all depleted nodes to full health at dawn.
   *
   * @returns Count of previously depleted nodes that regrew.
   * @example
   * const regrown = catalog.regrowAll();
   */
  public regrowAll(): number {
    let count = 0;
    for (const node of this.nodes) {
      if (node.depleted) count += 1;
      node.hp = node.maxHp;
      node.depleted = false;
    }
    return count;
  }

  private _createState(seed: ResourceNodeSeed): ResourceNodeState {
    const spec = ResourceNodeCatalog.KIND_SPECS[seed.kind];
    return {
      ...seed,
      maxHp: spec.maxHp,
      hp: spec.maxHp,
      depleted: false,
      dropResource: spec.dropResource,
      dropCount: spec.dropCount,
    };
  }
}
