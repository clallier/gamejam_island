/**
 * @fileoverview Canonical grid-normalized constants defining the 1D island topology
 * (`1 tile = 2.5m`), dollhouse plots, defense slots, pollution layout, and day/night pacing.
 */

import { gridToWorld } from '../config/constants.ts';

export type NpcRoleId = 'engineer' | 'medic' | 'defender' | 'merchant';
export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';
export type IslandZone = 'town' | 'defense' | 'frontier' | 'portal';
export type IslandSide = 'left' | 'right';
export type ResourceKey = 'wood' | 'stone' | 'petals' | 'shards';
export type ResourceNodeKind = 'tree_pine' | 'tree_broadleaf' | 'boulder' | 'wildflower';

export interface ResourceNodeSeed {
  readonly id: string;
  readonly kind: ResourceNodeKind;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
}

export interface DollhousePlot {
  readonly roleId: NpcRoleId;
  readonly npcName: string;
  readonly roomTitle: string;
  readonly x: number;
  readonly themeKey: string;
  readonly perkTeaser: string;
  readonly affinityLabel: string;
}

export interface PollutionMoundSeed {
  readonly id: string;
  readonly side: IslandSide;
  readonly x: number;
}

export const ISLAND_HALF_TILES = 23;
export const ROAD_HALF_TILES = 21;
export const PORTAL_TILES = 22;
export const TOWN_CENTER_HALF_TILES = 6.5;
export const DEFENSE_RING_HALF_TILES = 12;

export const ISLAND_HALF_LENGTH = gridToWorld(ISLAND_HALF_TILES);
export const ROAD_HALF_LIMIT = gridToWorld(ROAD_HALF_TILES);
export const PORTAL_X = gridToWorld(PORTAL_TILES);
export const TOWN_CENTER_HALF = gridToWorld(TOWN_CENTER_HALF_TILES);
export const DEFENSE_RING_HALF = gridToWorld(DEFENSE_RING_HALF_TILES);

export const DAY_CYCLE_SECONDS = 120;
export const PHASE_DAY_END = 0.48;
export const PHASE_DUSK_END = 0.6;
export const PHASE_NIGHT_END = 0.88;

export const INITIAL_CORRUPTION_TILES = 14;
export const INITIAL_LEFT_CORRUPTION_X = -gridToWorld(INITIAL_CORRUPTION_TILES);
export const INITIAL_RIGHT_CORRUPTION_X = gridToWorld(INITIAL_CORRUPTION_TILES);
export const MIN_CORRUPTION_HALF_WIDTH = gridToWorld(5);
export const MAX_CORRUPTION_HALF_WIDTH = gridToWorld(ROAD_HALF_TILES);
export const CORRUPTION_EDGE_FEATHER = gridToWorld(1.6);

export const DEFENSE_SLOT_TILES: readonly number[] = [-11, -8, 8, 11];
export const DEFENSE_SLOT_XS: readonly number[] = DEFENSE_SLOT_TILES.map((tiles) => gridToWorld(tiles));

export const DOLLHOUSE_PLOTS: readonly DollhousePlot[] = [
  {
    roleId: 'engineer',
    npcName: 'Pip',
    roomTitle: 'Cozy Workshop',
    x: gridToWorld(-5),
    themeKey: 'engineer',
    perkTeaser: '+20% Turret Fire Rate & Sturdy Barricades',
    affinityLabel: 'Wood + Stone',
  },
  {
    roleId: 'medic',
    npcName: 'Sage',
    roomTitle: 'Sunny Greenhouse',
    x: gridToWorld(-2),
    themeKey: 'medic',
    perkTeaser: 'Town Heart Regen & Purifying Petal Aura',
    affinityLabel: 'Sun-Petals + Wood',
  },
  {
    roleId: 'defender',
    npcName: 'Bram',
    roomTitle: 'Mini Watchtower',
    x: gridToWorld(2),
    themeKey: 'defender',
    perkTeaser: 'Night Road Patrol & Slingshot Power Mod',
    affinityLabel: 'Stone + Gloom Shards',
  },
  {
    roleId: 'merchant',
    npcName: 'Milo',
    roomTitle: 'Curio Shop',
    x: gridToWorld(5),
    themeKey: 'merchant',
    perkTeaser: 'Resource Barter & Rare Toybox Modules',
    affinityLabel: 'Any Surplus / Shards',
  },
];

export const INITIAL_POLLUTION_MOUNDS: readonly PollutionMoundSeed[] = [
  { id: 'mound-left-inner', side: 'left', x: -37 },
  { id: 'mound-left-outer', side: 'left', x: -46 },
  { id: 'mound-right-inner', side: 'right', x: 37 },
  { id: 'mound-right-outer', side: 'right', x: 46 },
];

export const INITIAL_INVENTORY: Record<ResourceKey, number> = {
  wood: 8,
  stone: 5,
  petals: 6,
  shards: 2,
};

export const MOUND_MAX_HP = 3;

export const INITIAL_RESOURCE_NODES: readonly ResourceNodeSeed[] = [
  { id: 'node-left-pine-outer', kind: 'tree_pine', x: -49, z: 3.6, scale: 1.05 },
  { id: 'node-left-boulder-outer', kind: 'boulder', x: -43, z: 3.9, scale: 0.95 },
  { id: 'node-left-leaf-mid', kind: 'tree_broadleaf', x: -39, z: 3.2, scale: 0.9 },
  { id: 'node-left-flower-outer', kind: 'wildflower', x: -35, z: 2.35, scale: 1.0 },
  { id: 'node-left-pine-mid', kind: 'tree_pine', x: -32, z: 3.5, scale: 1.15 },
  { id: 'node-left-boulder-inner', kind: 'boulder', x: -29, z: 2.8, scale: 0.8 },
  { id: 'node-left-flower-inner', kind: 'wildflower', x: -24, z: 2.35, scale: 1.0 },
  { id: 'node-left-leaf-inner', kind: 'tree_broadleaf', x: -23, z: 3.9, scale: 1.0 },
  { id: 'node-right-leaf-inner', kind: 'tree_broadleaf', x: 23, z: 3.9, scale: 1.0 },
  { id: 'node-right-flower-inner', kind: 'wildflower', x: 24, z: 2.35, scale: 1.0 },
  { id: 'node-right-boulder-inner', kind: 'boulder', x: 29, z: 2.8, scale: 0.85 },
  { id: 'node-right-pine-mid', kind: 'tree_pine', x: 32, z: 3.5, scale: 1.15 },
  { id: 'node-right-flower-outer', kind: 'wildflower', x: 35, z: 2.35, scale: 1.0 },
  { id: 'node-right-leaf-mid', kind: 'tree_broadleaf', x: 39, z: 3.2, scale: 0.95 },
  { id: 'node-right-boulder-outer', kind: 'boulder', x: 44, z: 3.8, scale: 1.0 },
  { id: 'node-right-pine-outer', kind: 'tree_pine', x: 49, z: 3.6, scale: 1.1 },
];
