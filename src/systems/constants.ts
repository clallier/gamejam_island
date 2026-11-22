/**
 * @fileoverview Tunable interaction, harvesting, pollution scrubbing, flora
 * planting, and magnetic Havok loot constants for Milestone 2.
 */

import type { PaletteKey, PartId } from '../assets/constants.ts';
import type { NpcRoleId, ResourceKey } from '../world/constants.ts';

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

export const BOND_MAX_LEVEL = 3;
export const BOND_LEVEL_THRESHOLDS: readonly number[] = [0, 30, 80];
export const HANGOUT_XP = 15;
export const FURNISH_XP = 20;

export interface FurnitureTierSpec {
  readonly partId: PartId;
  readonly paletteKey: PaletteKey;
  readonly cost: Partial<Record<ResourceKey, number>>;
  readonly label: string;
}

export interface VillagerRoleConfig {
  readonly hangoutVerb: string;
  readonly giftCost: Partial<Record<ResourceKey, number>>;
  readonly giftLabel: string;
  readonly giftXp: number;
  readonly perkLv2Label: string;
  readonly perkLv3Label: string;
  readonly furnitureTiers: readonly [FurnitureTierSpec, FurnitureTierSpec];
}

export const VILLAGER_CONFIGS: Record<NpcRoleId, VillagerRoleConfig> = {
  engineer: {
    hangoutVerb: 'Tinker',
    giftCost: { wood: 2 },
    giftLabel: '🪵2',
    giftXp: 25,
    perkLv2Label: 'Lv2: +1 Harvest Drop',
    perkLv3Label: 'Lv3: +1 Harvest & +25% Turrets',
    furnitureTiers: [
      { partId: 'furniture_tool_chest', paletteKey: 'woodWarm', cost: { wood: 3, stone: 1 }, label: 'Tool Chest (🪵3 🪨1)' },
      { partId: 'furniture_hearth_stove', paletteKey: 'amberGlow', cost: { wood: 4, stone: 2 }, label: 'Hearth Stove (🪵4 🪨2)' },
    ],
  },
  medic: {
    hangoutVerb: 'Sun-Tea',
    giftCost: { petals: 2 },
    giftLabel: '🌸2',
    giftXp: 25,
    perkLv2Label: 'Lv2: 1.5× Bloom Push',
    perkLv3Label: 'Lv3: 1.8× Push & +2 Dawn 🌸',
    furnitureTiers: [
      { partId: 'furniture_herb_shelf', paletteKey: 'foliageLeaf', cost: { wood: 2, petals: 2 }, label: 'Herb Shelf (🪵2 🌸2)' },
      { partId: 'furniture_tea_table', paletteKey: 'clayCream', cost: { wood: 3, petals: 3 }, label: 'Tea Table (🪵3 🌸3)' },
    ],
  },
  defender: {
    hangoutVerb: 'Spar',
    giftCost: { stone: 2 },
    giftLabel: '🪨2',
    giftXp: 25,
    perkLv2Label: 'Lv2: 2× Scrub Power',
    perkLv3Label: 'Lv3: 2× Scrub & Patrol Ready',
    furnitureTiers: [
      { partId: 'furniture_training_dummy', paletteKey: 'woodWarm', cost: { wood: 2, stone: 2 }, label: 'Spar Dummy (🪵2 🪨2)' },
      { partId: 'furniture_banner_stand', paletteKey: 'defender', cost: { stone: 3, shards: 1 }, label: 'Crest Banner (🪨3 ✨1)' },
    ],
  },
  merchant: {
    hangoutVerb: 'Stories',
    giftCost: { shards: 1 },
    giftLabel: '✨1',
    giftXp: 30,
    perkLv2Label: 'Lv2: Hang-out +1 🌸 Bonus',
    perkLv3Label: 'Lv3: +1 Mound ✨ & Barter',
    furnitureTiers: [
      { partId: 'furniture_curio_shelf', paletteKey: 'merchant', cost: { wood: 3, shards: 1 }, label: 'Curio Shelf (🪵3 ✨1)' },
      { partId: 'furniture_plush_rug', paletteKey: 'amberGlow', cost: { wood: 3, petals: 2, shards: 1 }, label: 'Plush Rug (🪵3 🌸2 ✨1)' },
    ],
  },
};
