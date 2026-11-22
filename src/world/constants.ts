/**
 * @fileoverview Canonical constants defining the 1D island topology,
 * dollhouse plots, defense slots, pollution layout, and day/night pacing.
 */

export type NpcRoleId = 'engineer' | 'medic' | 'defender' | 'merchant';
export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';
export type IslandZone = 'town' | 'defense' | 'frontier' | 'portal';
export type IslandSide = 'left' | 'right';
export type ResourceKey = 'wood' | 'stone' | 'petals' | 'shards';

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

export const ISLAND_HALF_LENGTH = 58;
export const ROAD_HALF_LIMIT = 53;
export const PORTAL_X = 56;
export const TOWN_CENTER_HALF = 16;
export const DEFENSE_RING_HALF = 28;

export const DAY_CYCLE_SECONDS = 120;
export const PHASE_DAY_END = 0.48;
export const PHASE_DUSK_END = 0.6;
export const PHASE_NIGHT_END = 0.88;

export const INITIAL_LEFT_CORRUPTION_X = -34;
export const INITIAL_RIGHT_CORRUPTION_X = 34;
export const MIN_CORRUPTION_HALF_WIDTH = 12;
export const MAX_CORRUPTION_HALF_WIDTH = 52;
export const CORRUPTION_EDGE_FEATHER = 4;

export const DEFENSE_SLOT_XS: readonly number[] = [-26, -20, 20, 26];

export const DOLLHOUSE_PLOTS: readonly DollhousePlot[] = [
  {
    roleId: 'engineer',
    npcName: 'Pip',
    roomTitle: 'Cozy Workshop',
    x: -13,
    themeKey: 'engineer',
    perkTeaser: '+20% Turret Fire Rate & Sturdy Barricades',
    affinityLabel: 'Wood + Stone',
  },
  {
    roleId: 'medic',
    npcName: 'Sage',
    roomTitle: 'Sunny Greenhouse',
    x: -5,
    themeKey: 'medic',
    perkTeaser: 'Town Heart Regen & Purifying Petal Aura',
    affinityLabel: 'Sun-Petals + Wood',
  },
  {
    roleId: 'defender',
    npcName: 'Bram',
    roomTitle: 'Mini Watchtower',
    x: 5,
    themeKey: 'defender',
    perkTeaser: 'Night Road Patrol & Slingshot Power Mod',
    affinityLabel: 'Stone + Gloom Shards',
  },
  {
    roleId: 'merchant',
    npcName: 'Milo',
    roomTitle: 'Curio Shop',
    x: 13,
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
