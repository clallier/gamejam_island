import { describe, expect, it } from 'vitest';
import { PLANT_BORDER_PUSH } from '../../src/systems/constants.ts';
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
});
