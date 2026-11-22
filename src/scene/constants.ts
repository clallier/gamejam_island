/**
 * @fileoverview Layout coordinates and dimensions for the 1D island terrain,
 * shoreline water, flora, road physics props, and corruption border markers.
 */

import { ISLAND_HALF_LENGTH } from '../world/constants.ts';

export interface FloraPlacement {
  readonly x: number;
  readonly z: number;
  readonly kind: 'tree_pine' | 'tree_broadleaf' | 'boulder';
  readonly scale: number;
}

export const TERRAIN_WIDTH = ISLAND_HALF_LENGTH * 2;
export const TERRAIN_HEIGHT = 1.4;
export const TERRAIN_DEPTH = 10.2;
export const TERRAIN_CENTER_Z = 2.0;
export const ROAD_WIDTH = 112;
export const ROAD_DEPTH = 2.6;
export const ROAD_COLLIDER_HEIGHT = 1.0;

export const WATER_WIDTH = 220;
export const WATER_DEPTH = 80;
export const WATER_Y = -0.68;

export const SHRINE_Z = 2.9;
export const DOLLHOUSE_Z = 3.15;

export const FLORA_PLACEMENTS: readonly FloraPlacement[] = [
  { x: -49, z: 3.6, kind: 'tree_pine', scale: 1.05 },
  { x: -43, z: 3.9, kind: 'boulder', scale: 0.95 },
  { x: -39, z: 3.2, kind: 'tree_broadleaf', scale: 0.9 },
  { x: -32, z: 3.5, kind: 'tree_pine', scale: 1.15 },
  { x: -29, z: 2.8, kind: 'boulder', scale: 0.8 },
  { x: -23, z: 3.9, kind: 'tree_broadleaf', scale: 1.0 },
  { x: 23, z: 3.9, kind: 'tree_broadleaf', scale: 1.0 },
  { x: 29, z: 2.8, kind: 'boulder', scale: 0.85 },
  { x: 32, z: 3.5, kind: 'tree_pine', scale: 1.15 },
  { x: 39, z: 3.2, kind: 'tree_broadleaf', scale: 0.95 },
  { x: 44, z: 3.8, kind: 'boulder', scale: 1.0 },
  { x: 49, z: 3.6, kind: 'tree_pine', scale: 1.1 },
];

export const LILYPAD_XS: readonly number[] = [-35, -21, -9, 8, 22, 36];
export const ROAD_PROP_XS: readonly number[] = [-17.5, -9.2, 9.2, 17.5];
