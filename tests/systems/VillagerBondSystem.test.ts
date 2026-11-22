import { describe, expect, it } from 'vitest';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import { BOND_LEVEL_THRESHOLDS } from '../../src/systems/constants.ts';
import { VillagerBondSystem } from '../../src/systems/VillagerBondSystem.ts';
import { DOLLHOUSE_PLOTS, type NpcRoleId } from '../../src/world/constants.ts';
import { InventoryStore } from '../../src/world/InventoryStore.ts';

function setupBonds(): { ecs: IslandEcsWorld; bonds: VillagerBondSystem; inventory: InventoryStore } {
  const ecs = new IslandEcsWorld();
  DOLLHOUSE_PLOTS.forEach((plot, idx) => {
    ecs.registerDollhouse(idx, `house-${plot.roleId}`, plot.x, 3.2);
    ecs.registerVillager(plot.roleId, `house-${plot.roleId}`, plot.x);
  });
  return { ecs, bonds: new VillagerBondSystem(ecs), inventory: new InventoryStore() };
}

describe('VillagerBondSystem', () => {
  it('levels villagers via hang-outs and affinity gifts and activates Engineer/Defender/Medic perks', () => {
    const { bonds, inventory } = setupBonds();
    expect(bonds.getHarvestBonus()).toBe(0);
    expect(bonds.getMoundHitDamage()).toBe(1);
    expect(bonds.getPlantPushMultiplier()).toBe(1);
    expect(bonds.getDawnPetalBonus()).toBe(0);

    // Engineer reaches Lv 2 at 30 XP (15 hangout + 25 gift = 40 XP)
    const engHang = bonds.hangOut('engineer', inventory);
    expect(engHang?.xpGained).toBe(15);
    expect(engHang?.leveledUp).toBe(false);

    const engGift = bonds.giveGift('engineer', inventory);
    expect(engGift?.leveledUp).toBe(true);
    expect(engGift?.newLevel).toBe(2);
    expect(bonds.getHarvestBonus()).toBe(1);

    // Medic reaches Lv 2 (30 XP -> 1.5x) then Lv 3 (80+ XP -> 1.8x & +2 Dawn Petals)
    bonds.hangOut('medic', inventory);
    bonds.giveGift('medic', inventory);
    expect(bonds.getPlantPushMultiplier()).toBe(1.5);
    bonds.hangOut('medic', inventory);
    bonds.giveGift('medic', inventory);
    expect(bonds.getPlantPushMultiplier()).toBe(1.8);
    expect(bonds.getDawnPetalBonus()).toBe(2);

    // Defender reaches Lv 2 (30 XP -> 2x Scrub Power & 3.25s Auto-Dodge)
    bonds.hangOut('defender', inventory);
    bonds.giveGift('defender', inventory);
    expect(bonds.getMoundHitDamage()).toBe(2);
    expect(bonds.getAutoDodgeCooldown()).toBe(3.25);
  });

  it('grants Merchant hangout petal bonus at Lv 2 and Shard bonus at Lv 3, and blocks unaffordable gifts', () => {
    const { bonds, inventory } = setupBonds();
    inventory.spend({ shards: inventory.getAmount('shards') });
    expect(bonds.giveGift('merchant', inventory)).toBeNull();

    // Two hang-outs grant 30 XP -> Lv 2; third hang-out awards +1 petal
    expect(bonds.hangOut('merchant', inventory)?.bonusPetal).toBe(0);
    expect(bonds.hangOut('merchant', inventory)?.newLevel).toBe(2);
    const petalsBefore = inventory.getAmount('petals');
    const thirdHang = bonds.hangOut('merchant', inventory);
    expect(thirdHang?.bonusPetal).toBe(1);
    expect(inventory.getAmount('petals')).toBe(petalsBefore + 1);

    // Level 3 at 80+ XP grants +1 Mound Shard bonus
    bonds.hangOut('merchant', inventory);
    bonds.hangOut('merchant', inventory);
    bonds.hangOut('merchant', inventory);
    expect(bonds.getSnapshot('merchant', inventory).level).toBe(3);
    expect(bonds.getMoundShardBonus()).toBe(1);
  });

  it('unlocks cutaway room furniture tiers 1 and 2 and caps at stage 2', () => {
    const { bonds, inventory } = setupBonds();
    inventory.add('wood', 10);
    inventory.add('stone', 10);

    const tier1 = bonds.furnishRoom('engineer', inventory);
    expect(tier1?.tier).toBe(1);
    expect(tier1?.partId).toBe('furniture_tool_chest');

    const tier2 = bonds.furnishRoom('engineer', inventory);
    expect(tier2?.tier).toBe(2);
    expect(tier2?.partId).toBe('furniture_hearth_stove');

    expect(bonds.furnishRoom('engineer', inventory)).toBeNull();
    const snap = bonds.getSnapshot('engineer', inventory);
    expect(snap.isFurnishMaxed).toBe(true);
    expect(snap.canFurnish).toBe(false);
    expect(snap.furnishLabel).toBe('Decor Maxed');
  });

  it('exercises all 4 roles, Lv1->2->3 thresholds, all 7 perk getters, and furniture tiers', () => {
    const { bonds, inventory } = setupBonds();
    inventory.add('wood', 50);
    inventory.add('stone', 50);
    inventory.add('petals', 50);
    inventory.add('shards', 50);

    // Baseline Lv1 perks across all getters including skill-scaled auto-dodge cooldown
    expect(bonds.getHarvestBonus()).toBe(0);
    expect(bonds.getPlantPushMultiplier()).toBe(1);
    expect(bonds.getMoundHitDamage()).toBe(1);
    expect(bonds.getMoundShardBonus()).toBe(0);
    expect(bonds.getDawnPetalBonus()).toBe(0);
    expect(bonds.getTurretFireRateMultiplier()).toBe(1);
    expect(bonds.getDefenderBonusDamage()).toBe(0);
    expect(bonds.getAutoDodgeCooldown()).toBe(4.0);

    // Exact Lv 2 (30 XP) and Lv 3 (80 XP) thresholds via hangOuts & furnish/gift
    const roles: NpcRoleId[] = ['engineer', 'medic', 'defender', 'merchant'];
    for (const role of roles) {
      expect(bonds.getSnapshot(role, inventory).xpText).toBe(`0/${BOND_LEVEL_THRESHOLDS[1]} XP`);
      const t1 = bonds.furnishRoom(role, inventory);
      const t2 = bonds.furnishRoom(role, inventory);
      expect(t1?.tier).toBe(1);
      expect(t2?.tier).toBe(2);
      expect(bonds.furnishRoom(role, inventory)).toBeNull();
      // 20 + 20 = 40 XP -> Lv 2
      const lv2Snap = bonds.getSnapshot(role, inventory);
      expect(lv2Snap.level).toBe(2);
      expect(lv2Snap.xpText).toBe(`40/${BOND_LEVEL_THRESHOLDS[2]} XP`);

      // Reach 80+ XP for Lv 3
      bonds.giveGift(role, inventory);
      bonds.hangOut(role, inventory);
      const lv3Snap = bonds.getSnapshot(role, inventory);
      expect(lv3Snap.level).toBe(3);
      expect(lv3Snap.xpText).toBe('MAX');
      expect(lv3Snap.activePerkLabel).toContain('★');
    }

    // All 7 perks active at Lv 3
    expect(bonds.getHarvestBonus()).toBe(1);
    expect(bonds.getPlantPushMultiplier()).toBe(1.8);
    expect(bonds.getMoundHitDamage()).toBe(2);
    expect(bonds.getMoundShardBonus()).toBe(1);
    expect(bonds.getDawnPetalBonus()).toBe(2);
    expect(bonds.getTurretFireRateMultiplier()).toBe(1.25);
    expect(bonds.getDefenderBonusDamage()).toBe(6);
    expect(bonds.getAutoDodgeCooldown()).toBe(2.5);

    // Further hangOut at Lv 3 does not report leveledUp
    expect(bonds.hangOut('engineer', inventory)?.leveledUp).toBe(false);
  });

  it('handles unregistered villagers and unaffordable gifts or furnishings gracefully', () => {
    const ecs = new IslandEcsWorld();
    const bonds = new VillagerBondSystem(ecs);
    const emptyInv = new InventoryStore({ wood: 0, stone: 0, petals: 0, shards: 0 });

    expect(bonds.hangOut('engineer', emptyInv)).toBeNull();
    expect(bonds.giveGift('medic', emptyInv)).toBeNull();
    expect(bonds.furnishRoom('defender', emptyInv)).toBeNull();
    const fallbackSnap = bonds.getSnapshot('merchant', emptyInv);
    expect(fallbackSnap.level).toBe(1);
    expect(fallbackSnap.canGift).toBe(false);
    expect(fallbackSnap.canFurnish).toBe(false);

    // Registered villager with empty inventory cannot gift or furnish
    ecs.registerDollhouse(0, 'house-engineer', -13, 3.2);
    ecs.registerVillager('engineer', 'house-engineer', -13);
    expect(bonds.giveGift('engineer', emptyInv)).toBeNull();
    expect(bonds.furnishRoom('engineer', emptyInv)).toBeNull();
  });
});
