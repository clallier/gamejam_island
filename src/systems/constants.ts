/**
 * @fileoverview Tunable interaction, harvesting, pollution scrubbing, flora
 * planting, and magnetic Havok loot constants for Milestone 2.
 */

import type { ResourceKey } from '../world/constants.ts';

export const INTERACT_RANGE = 3.2;

export const PLANT_COST: Partial<Record<ResourceKey, number>> = {
  petals: 2,
};
export const PLANT_BORDER_PUSH = 3.5;
export const PLANT_MIN_X = 16.5;
export const PLANT_MAX_X = 50;
export const PLANT_MIN_SPACING = 2.6;
export const PLANT_Z = 2.15;

export const MOUND_BORDER_PUSH = 4.5;
export const MOUND_SHARD_DROP = 2;
export const MOUND_PETAL_DROP = 1;

export const LOOT_COLLECT_RADIUS = 1.65;
export const LOOT_MAGNET_RADIUS = 3.6;
export const LOOT_MAGNET_SPEED = 10.5;
export const LOOT_PICKUP_DELAY = 0.28;
export const LOOT_MAX_ACTIVE = 28;
