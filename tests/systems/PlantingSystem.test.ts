import { describe, expect, it } from 'vitest';
import {
  PLANT_BORDER_PUSH,
  PLANT_MAX_X,
  PLANT_MIN_SPACING,
  PLANT_MIN_X,
} from '../../src/systems/constants.ts';
import { PlantingSystem } from '../../src/systems/PlantingSystem.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
import { InventoryStore } from '../../src/world/InventoryStore.ts';

describe('PlantingSystem', () => {
  it('validates town bounds, spacing, and petal costs, then pushes corruption outward', () => {
    const planting = new PlantingSystem();
    const inventory = new InventoryStore({ wood: 0, stone: 0, petals: 4, shards: 0 });
    const corruption = new CorruptionField(-34, 34);

    expect(planting.getPlantBlockReason(0, inventory)).toBe('town');
    expect(planting.plantAt(0, inventory, corruption)).toBeNull();

    const bloom = planting.plantAt(25, inventory, corruption);
    expect(bloom).not.toBeNull();
    expect(bloom?.side).toBe('right');
    expect(inventory.getAmount('petals')).toBe(2);
    expect(corruption.getRightBorderX()).toBe(34 + PLANT_BORDER_PUSH);

    expect(planting.getPlantBlockReason(26, inventory)).toBe('spacing');
    expect(planting.plantAt(-25, inventory, corruption)?.side).toBe('left');
    expect(corruption.getLeftBorderX()).toBe(-34 - PLANT_BORDER_PUSH);

    expect(planting.getPlantBlockReason(32, inventory)).toBe('resources');
  });

  it('enforces exact town/frontier bounds, NaN safety, spacing boundaries, and multiplier scaling', () => {
    const planting = new PlantingSystem();
    const inventory = new InventoryStore({ wood: 0, stone: 0, petals: 12, shards: 0 });
    const corruption = new CorruptionField(-34, 34);

    expect(planting.getPlantBlockReason(Number.NaN, inventory)).toBe('town');
    expect(planting.getPlantBlockReason(PLANT_MIN_X - 0.01, inventory)).toBe('town');
    expect(planting.getPlantBlockReason(PLANT_MAX_X + 0.01, inventory)).toBe('town');
    expect(planting.getPlantBlockReason(-PLANT_MIN_X + 0.01, inventory)).toBe('town');
    expect(planting.getPlantBlockReason(-PLANT_MAX_X - 0.01, inventory)).toBe('town');

    const minBloom = planting.plantAt(PLANT_MIN_X, inventory, corruption, 1.8);
    expect(minBloom).not.toBeNull();
    expect(corruption.getRightBorderX()).toBeCloseTo(34 + PLANT_BORDER_PUSH * 1.8, 5);

    expect(planting.getPlantBlockReason(PLANT_MIN_X + PLANT_MIN_SPACING - 0.01, inventory)).toBe('spacing');
    const spacedBloom = planting.plantAt(PLANT_MIN_X + PLANT_MIN_SPACING, inventory, corruption, 1.5);
    expect(spacedBloom).not.toBeNull();

    const maxBloom = planting.plantAt(-PLANT_MAX_X, inventory, corruption, Number.NaN);
    expect(maxBloom?.side).toBe('left');
    expect(corruption.getLeftBorderX()).toBeCloseTo(-34 - PLANT_BORDER_PUSH, 5);
    expect(planting.getPlantedFlora()).toHaveLength(3);
  });
});
