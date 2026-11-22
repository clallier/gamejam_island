/**
 * @fileoverview Fixed typed-array capacity and numeric SoA component codes
 * for the bitECS simulation world.
 */

import type { ResourceKey, ResourceNodeKind } from '../world/constants.ts';

export const MAX_ENTITIES = 2048;

export const INTERACTABLE_KIND = {
  DOLLHOUSE: 1,
  MOUND: 2,
  RESOURCE: 3,
} as const;

export const INTERACTABLE_PRIORITY = {
  DOLLHOUSE: 3,
  MOUND: 2,
  RESOURCE: 1,
} as const;

export const LOOT_STATE = {
  FALLING: 0,
  MAGNETIZED: 1,
  COLLECTED: 2,
} as const;

export const RESOURCE_TO_CODE: Record<ResourceKey, number> = {
  wood: 0,
  stone: 1,
  petals: 2,
  shards: 3,
};

export const CODE_TO_RESOURCE: readonly ResourceKey[] = [
  'wood',
  'stone',
  'petals',
  'shards',
];

export const NODE_KIND_TO_CODE: Record<ResourceNodeKind, number> = {
  tree_pine: 0,
  tree_broadleaf: 1,
  boulder: 2,
  wildflower: 3,
};

export const CODE_TO_NODE_KIND: readonly ResourceNodeKind[] = [
  'tree_pine',
  'tree_broadleaf',
  'boulder',
  'wildflower',
];
