/**
 * @fileoverview Canonical grid unit conversion helpers and schema definitions
 * for Hearthline's live runtime balance spreadsheet (`1 tile = 2.5m`).
 */

export const GRID_UNIT_M = 2.5;

export type BalanceGroup = 'Scale' | 'Player' | 'Bram' | 'Defenses' | 'Enemies';
export type BalanceUnit = 'm/tile' | 'toggle' | 'tiles' | 'tiles/s' | 'HP' | 'sec';

export type BalanceKey =
  | 'gridUnitMeters'
  | 'showGridRuler'
  | 'playerMoveSpeedTiles'
  | 'bowRangeTiles'
  | 'bowDamage'
  | 'bowCooldownSec'
  | 'bowKnockbackTiles'
  | 'autoDodgeRadiusTiles'
  | 'autoDodgeBaseCooldownSec'
  | 'npcMoveSpeedTiles'
  | 'bramGuardRadiusTiles'
  | 'bramSpearRangeTiles'
  | 'bramSpearDamage'
  | 'bramSpearCooldownSec'
  | 'bramSpearKnockbackTiles'
  | 'turretRangeTiles'
  | 'turretDamage'
  | 'turretCooldownSec'
  | 'crateImpactRadiusTiles'
  | 'crateKnockbackTiles'
  | 'spriteSpeedTiles'
  | 'spriteHp'
  | 'rusherSpeedTiles'
  | 'rusherHp'
  | 'bruteSpeedTiles'
  | 'bruteHp';

export interface BalanceFieldSpec {
  readonly key: BalanceKey;
  readonly group: BalanceGroup;
  readonly label: string;
  readonly unit: BalanceUnit;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly isSpatial: boolean;
}

/**
 * Converts a grid tile measurement into world-space meters.
 *
 * @param tiles Distance or speed measured in grid units.
 * @param unitMeters World meters per tile (defaults to `GRID_UNIT_M`).
 * @returns Equivalent value in Babylon world units.
 * @throws Error Never thrown.
 * @example
 * const widthMeters = gridToWorld(2); // 5.0
 */
export function gridToWorld(tiles: number, unitMeters = GRID_UNIT_M): number {
  return tiles * unitMeters;
}

/**
 * Converts a world-space meter measurement into grid tile units.
 *
 * @param meters Distance or speed measured in Babylon world units.
 * @param unitMeters World meters per tile (defaults to `GRID_UNIT_M`).
 * @returns Equivalent value in grid tiles.
 * @throws Error Never thrown.
 * @example
 * const tiles = worldToGrid(5.0); // 2.0
 */
export function worldToGrid(meters: number, unitMeters = GRID_UNIT_M): number {
  return unitMeters > 0 ? meters / unitMeters : meters;
}

export const BALANCE_FIELDS: readonly BalanceFieldSpec[] = [
  { key: 'gridUnitMeters', group: 'Scale', label: 'Meters / Tile', unit: 'm/tile', min: 1.5, max: 4.0, step: 0.1, defaultValue: GRID_UNIT_M, isSpatial: false },
  { key: 'showGridRuler', group: 'Scale', label: 'Road Tile Ruler', unit: 'toggle', min: 0, max: 1, step: 1, defaultValue: 1, isSpatial: false },
  { key: 'playerMoveSpeedTiles', group: 'Player', label: 'Walk Speed', unit: 'tiles/s', min: 1.0, max: 6.0, step: 0.1, defaultValue: 3.5, isSpatial: true },
  { key: 'bowRangeTiles', group: 'Player', label: 'Bow Range', unit: 'tiles', min: 1.0, max: 8.0, step: 0.2, defaultValue: 3.6, isSpatial: true },
  { key: 'bowDamage', group: 'Player', label: 'Bow Damage', unit: 'HP', min: 2, max: 60, step: 1, defaultValue: 14, isSpatial: false },
  { key: 'bowCooldownSec', group: 'Player', label: 'Bow Cooldown', unit: 'sec', min: 0.1, max: 1.5, step: 0.02, defaultValue: 0.42, isSpatial: false },
  { key: 'bowKnockbackTiles', group: 'Player', label: 'Bow Knockback', unit: 'tiles', min: 0, max: 2.0, step: 0.05, defaultValue: 0.6, isSpatial: true },
  { key: 'autoDodgeRadiusTiles', group: 'Player', label: 'Auto-Dodge Radius', unit: 'tiles', min: 0.4, max: 2.5, step: 0.1, defaultValue: 1.0, isSpatial: true },
  { key: 'autoDodgeBaseCooldownSec', group: 'Player', label: 'Auto-Dodge Base CD', unit: 'sec', min: 1.5, max: 8.0, step: 0.25, defaultValue: 4.0, isSpatial: false },
  { key: 'npcMoveSpeedTiles', group: 'Bram', label: 'Villager Walk Speed', unit: 'tiles/s', min: 0.5, max: 5.0, step: 0.1, defaultValue: 1.8, isSpatial: true },
  { key: 'bramGuardRadiusTiles', group: 'Bram', label: 'Guard Radius', unit: 'tiles', min: 1.0, max: 10.0, step: 0.5, defaultValue: 4.0, isSpatial: true },
  { key: 'bramSpearRangeTiles', group: 'Bram', label: 'Spear Reach', unit: 'tiles', min: 0.5, max: 4.0, step: 0.1, defaultValue: 1.6, isSpatial: true },
  { key: 'bramSpearDamage', group: 'Bram', label: 'Spear Damage', unit: 'HP', min: 2, max: 60, step: 1, defaultValue: 16, isSpatial: false },
  { key: 'bramSpearCooldownSec', group: 'Bram', label: 'Spear Cooldown', unit: 'sec', min: 0.08, max: 1.2, step: 0.02, defaultValue: 0.18, isSpatial: false },
  { key: 'bramSpearKnockbackTiles', group: 'Bram', label: 'Spear Knockback', unit: 'tiles', min: 0, max: 2.0, step: 0.05, defaultValue: 0.6, isSpatial: true },
  { key: 'turretRangeTiles', group: 'Defenses', label: 'Turret Range', unit: 'tiles', min: 2.0, max: 10.0, step: 0.2, defaultValue: 5.6, isSpatial: true },
  { key: 'turretDamage', group: 'Defenses', label: 'Turret Damage', unit: 'HP', min: 2, max: 50, step: 1, defaultValue: 12, isSpatial: false },
  { key: 'turretCooldownSec', group: 'Defenses', label: 'Turret Cooldown', unit: 'sec', min: 0.2, max: 3.0, step: 0.05, defaultValue: 1.15, isSpatial: false },
  { key: 'crateImpactRadiusTiles', group: 'Defenses', label: 'Crate Hit Radius', unit: 'tiles', min: 0.2, max: 1.5, step: 0.05, defaultValue: 0.5, isSpatial: true },
  { key: 'crateKnockbackTiles', group: 'Defenses', label: 'Crate Knockback', unit: 'tiles', min: 0, max: 3.0, step: 0.1, defaultValue: 1.2, isSpatial: true },
  { key: 'spriteSpeedTiles', group: 'Enemies', label: 'Sprite Speed', unit: 'tiles/s', min: 0.3, max: 4.0, step: 0.1, defaultValue: 1.0, isSpatial: true },
  { key: 'spriteHp', group: 'Enemies', label: 'Sprite HP', unit: 'HP', min: 5, max: 150, step: 2, defaultValue: 24, isSpatial: false },
  { key: 'rusherSpeedTiles', group: 'Enemies', label: 'Rusher Speed', unit: 'tiles/s', min: 0.5, max: 5.0, step: 0.1, defaultValue: 1.8, isSpatial: true },
  { key: 'rusherHp', group: 'Enemies', label: 'Rusher HP', unit: 'HP', min: 4, max: 100, step: 2, defaultValue: 14, isSpatial: false },
  { key: 'bruteSpeedTiles', group: 'Enemies', label: 'Brute Speed', unit: 'tiles/s', min: 0.2, max: 3.0, step: 0.05, defaultValue: 0.7, isSpatial: true },
  { key: 'bruteHp', group: 'Enemies', label: 'Brute HP', unit: 'HP', min: 15, max: 300, step: 4, defaultValue: 56, isSpatial: false },
];

export const BALANCE_DEFAULTS = Object.freeze(
  BALANCE_FIELDS.reduce<Record<BalanceKey, number>>(
    (acc, spec) => {
      acc[spec.key] = spec.defaultValue;
      return acc;
    },
    {} as Record<BalanceKey, number>,
  ),
);
