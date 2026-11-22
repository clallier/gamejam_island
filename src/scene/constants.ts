/**
 * @fileoverview Layout coordinates and dimensions for the 1D island terrain,
 * shoreline water, road physics props, and landmark depth offsets.
 */

import { ISLAND_HALF_LENGTH } from '../world/constants.ts';

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

export const LILYPAD_XS: readonly number[] = [-35, -21, -9, 8, 22, 36];
export const ROAD_PROP_XS: readonly number[] = [-17.5, -9.2, 9.2, 17.5];
