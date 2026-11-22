import type { PaletteKey, PartId } from '../assets/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import type { NpcRoleId } from '../world/constants.ts';
import type { InventoryStore } from '../world/InventoryStore.ts';
import {
  BOND_LEVEL_THRESHOLDS,
  BOND_MAX_LEVEL,
  FURNISH_XP,
  type FurnitureTierSpec,
  HANGOUT_XP,
  VILLAGER_CONFIGS,
  type VillagerRoleConfig,
} from './constants.ts';

/**
 * Immutable UI snapshot of a villager's live bitECS bond state and action affordability.
 */
export interface VillagerBondSnapshot {
  readonly roleId: NpcRoleId;
  readonly level: number;
  readonly xp: number;
  readonly xpText: string;
  readonly furnitureStage: number;
  readonly hangoutLabel: string;
  readonly giftLabel: string;
  readonly canGift: boolean;
  readonly furnishLabel: string;
  readonly canFurnish: boolean;
  readonly isFurnishMaxed: boolean;
  readonly activePerkLabel: string;
}

/**
 * Result returned after hanging out with a villager.
 */
export interface HangOutOutcome {
  readonly roleId: NpcRoleId;
  readonly xpGained: number;
  readonly bonusPetal: number;
  readonly leveledUp: boolean;
  readonly newLevel: number;
}

/**
 * Result returned after giving a resource gift to a villager.
 */
export interface GiftOutcome {
  readonly roleId: NpcRoleId;
  readonly xpGained: number;
  readonly leveledUp: boolean;
  readonly newLevel: number;
}

/**
 * Result returned after furnishing a cutaway dollhouse tier.
 */
export interface FurnishOutcome {
  readonly roleId: NpcRoleId;
  readonly tier: number;
  readonly partId: PartId;
  readonly paletteKey: PaletteKey;
  readonly label: string;
  readonly leveledUp: boolean;
  readonly newLevel: number;
}

/**
 * Manages villager bond levels, hang-outs, affinity gifting, cutaway room
 * furnishing tiers, and active town-wide perk queries backed by bitECS `NpcBond` SoA buffers.
 */
export class VillagerBondSystem {
  private readonly ecs: IslandEcsWorld;

  /**
   * Binds villager bond progression to the shared `IslandEcsWorld`.
   *
   * @param ecs Initialized `IslandEcsWorld` containing registered villagers.
   * @throws Error Never thrown during construction.
   * @example
   * const bonds = new VillagerBondSystem(ecs);
   */
  public constructor(ecs: IslandEcsWorld) {
    this.ecs = ecs;
  }

  /**
   * Builds a UI-friendly snapshot of bond level, XP progress, furnishing state, and actions.
   *
   * @param roleId Villager role identifier.
   * @param inventory Live player inventory used to evaluate gift/furnish affordability.
   * @returns Immutable `VillagerBondSnapshot`.
   * @throws Error Never thrown; falls back to level 1 if villager is unregistered.
   * @example
   * const snap = bonds.getSnapshot('engineer', inventory);
   */
  public getSnapshot(roleId: NpcRoleId, inventory: InventoryStore): VillagerBondSnapshot {
    const eid = this.ecs.getEntityId(`npc-${roleId}`);
    const cfg = VILLAGER_CONFIGS[roleId];
    const level = this._getLevel(roleId);
    const xp = eid !== undefined ? (this.ecs.getComponents().NpcBond.xp[eid] ?? 0) : 0;
    const stage = eid !== undefined ? (this.ecs.getComponents().NpcBond.furnitureStage[eid] ?? 0) : 0;
    const nextTier = cfg.furnitureTiers[stage];
    return {
      roleId,
      level,
      xp,
      xpText: this._formatXpProgress(level, xp),
      furnitureStage: stage,
      hangoutLabel: cfg.hangoutVerb,
      giftLabel: `Gift ${cfg.giftLabel}`,
      canGift: inventory.canAfford(cfg.giftCost),
      furnishLabel: nextTier ? `Decorate (${stage + 1}/2)` : 'Decor Maxed',
      canFurnish: Boolean(nextTier && inventory.canAfford(nextTier.cost)),
      isFurnishMaxed: !nextTier,
      activePerkLabel: this._describePerk(cfg, level),
    };
  }

  /**
   * Advances bond XP via a free hangout beat and applies Merchant barter bonus when unlocked.
   *
   * @param roleId Target villager role.
   * @param inventory Inventory receiving optional Lv2 Merchant petal bonus.
   * @returns Outcome details, or `null` if the villager entity is unregistered.
   * @throws Error Never thrown for valid role identifiers.
   * @example
   * const result = bonds.hangOut('merchant', inventory);
   */
  public hangOut(roleId: NpcRoleId, inventory: InventoryStore): HangOutOutcome | null {
    const eid = this.ecs.getEntityId(`npc-${roleId}`);
    if (eid === undefined) return null;
    const { NpcBond } = this.ecs.getComponents();
    NpcBond.hangoutCount[eid] = (NpcBond.hangoutCount[eid] ?? 0) + 1;
    const bonusPetal = roleId === 'merchant' && (NpcBond.level[eid] ?? 1) >= 2 ? 1 : 0;
    if (bonusPetal > 0) inventory.add('petals', bonusPetal);
    const prog = this._grantXp(eid, HANGOUT_XP);
    return { roleId, xpGained: HANGOUT_XP, bonusPetal, ...prog };
  }

  /**
   * Spends affinity resources to grant bond XP to the specified villager.
   *
   * @param roleId Target villager role.
   * @param inventory Live player inventory.
   * @returns Gift outcome details, or `null` if unaffordable or unregistered.
   * @throws Error Never thrown during gifting checks.
   * @example
   * const gift = bonds.giveGift('medic', inventory);
   */
  public giveGift(roleId: NpcRoleId, inventory: InventoryStore): GiftOutcome | null {
    const eid = this.ecs.getEntityId(`npc-${roleId}`);
    const cfg = VILLAGER_CONFIGS[roleId];
    if (eid === undefined || !inventory.spend(cfg.giftCost)) return null;
    const prog = this._grantXp(eid, cfg.giftXp);
    return { roleId, xpGained: cfg.giftXp, ...prog };
  }

  /**
   * Purchases the next cutaway room furniture module, advancing room decor and bond XP.
   *
   * @param roleId Target villager role.
   * @param inventory Live player inventory.
   * @returns Furnishing outcome with the spawned `PartId`, or `null` when maxed or unaffordable.
   * @throws Error Never thrown during furnishing checks.
   * @example
   * const decor = bonds.furnishRoom('engineer', inventory);
   */
  public furnishRoom(roleId: NpcRoleId, inventory: InventoryStore): FurnishOutcome | null {
    const eid = this.ecs.getEntityId(`npc-${roleId}`);
    if (eid === undefined) return null;
    const { NpcBond } = this.ecs.getComponents();
    const stage = NpcBond.furnitureStage[eid] ?? 0;
    const tierSpec = VILLAGER_CONFIGS[roleId].furnitureTiers[stage];
    if (!tierSpec || !inventory.spend(tierSpec.cost)) return null;
    NpcBond.furnitureStage[eid] = stage + 1;
    const prog = this._grantXp(eid, FURNISH_XP);
    return this._buildFurnishOutcome(roleId, stage + 1, tierSpec, prog);
  }

  /**
   * Returns bonus drop units per harvested resource node unlocked by Pip (`engineer` Lv 2+).
   *
   * @returns Extra loot drop units (`1` at Engineer Lv 2+, else `0`).
   * @throws Error Never thrown.
   * @example
   * const extraDrops = bonds.getHarvestBonus();
   */
  public getHarvestBonus(): number {
    return this._getLevel('engineer') >= 2 ? 1 : 0;
  }

  /**
   * Returns border-push multiplier for purifying blooms unlocked by Sage (`medic` Lv 2/3).
   *
   * @returns Multiplier (`1`, `1.5`, or `1.8`).
   * @throws Error Never thrown.
   * @example
   * const pushScale = bonds.getPlantPushMultiplier();
   */
  public getPlantPushMultiplier(): number {
    const level = this._getLevel('medic');
    if (level >= 3) return 1.8;
    return level >= 2 ? 1.5 : 1;
  }

  /**
   * Returns mound scrub damage per hit unlocked by Bram (`defender` Lv 2+).
   *
   * @returns Hit damage (`2` at Defender Lv 2+, else `1`).
   * @throws Error Never thrown.
   * @example
   * const damage = bonds.getMoundHitDamage();
   */
  public getMoundHitDamage(): number {
    return this._getLevel('defender') >= 2 ? 2 : 1;
  }

  /**
   * Returns bonus Gloom Shards per scrubbed mound unlocked by Milo (`merchant` Lv 3).
   *
   * @returns Extra shards (`1` at Merchant Lv 3+, else `0`).
   * @throws Error Never thrown.
   * @example
   * const bonusShards = bonds.getMoundShardBonus();
   */
  public getMoundShardBonus(): number {
    return this._getLevel('merchant') >= 3 ? 1 : 0;
  }

  /**
   * Returns Sun-Petals gifted at dawn by Sage (`medic` Lv 3).
   *
   * @returns Bonus dawn petals (`2` at Medic Lv 3+, else `0`).
   * @throws Error Never thrown.
   * @example
   * const dawnPetals = bonds.getDawnPetalBonus();
   */
  public getDawnPetalBonus(): number {
    return this._getLevel('medic') >= 3 ? 2 : 0;
  }

  private _getLevel(roleId: NpcRoleId): number {
    const eid = this.ecs.getEntityId(`npc-${roleId}`);
    if (eid === undefined) return 1;
    return Math.max(1, this.ecs.getComponents().NpcBond.level[eid] ?? 1);
  }

  private _grantXp(eid: number, amount: number): { leveledUp: boolean; newLevel: number } {
    const { NpcBond } = this.ecs.getComponents();
    const prevLevel = NpcBond.level[eid] ?? 1;
    const nextXp = (NpcBond.xp[eid] ?? 0) + amount;
    NpcBond.xp[eid] = nextXp;
    const nextLevel = this._computeLevel(nextXp);
    NpcBond.level[eid] = nextLevel;
    return { leveledUp: nextLevel > prevLevel, newLevel: nextLevel };
  }

  private _computeLevel(xp: number): number {
    let level = 1;
    for (let i = 1; i < BOND_LEVEL_THRESHOLDS.length; i++) {
      if (xp >= BOND_LEVEL_THRESHOLDS[i]!) level = i + 1;
    }
    return Math.min(BOND_MAX_LEVEL, level);
  }

  private _formatXpProgress(level: number, xp: number): string {
    if (level >= BOND_MAX_LEVEL) return 'MAX';
    const nextThreshold = BOND_LEVEL_THRESHOLDS[level] ?? BOND_LEVEL_THRESHOLDS[BOND_MAX_LEVEL - 1]!;
    return `${xp}/${nextThreshold} XP`;
  }

  private _describePerk(cfg: VillagerRoleConfig, level: number): string {
    if (level >= BOND_MAX_LEVEL) return `★ ${cfg.perkLv3Label}`;
    if (level === 2) return `✓ ${cfg.perkLv2Label} · Next ${cfg.perkLv3Label}`;
    return `Unlock ${cfg.perkLv2Label}`;
  }

  private _buildFurnishOutcome(
    roleId: NpcRoleId,
    tier: number,
    spec: FurnitureTierSpec,
    prog: { leveledUp: boolean; newLevel: number },
  ): FurnishOutcome {
    return {
      roleId,
      tier,
      partId: spec.partId,
      paletteKey: spec.paletteKey,
      label: spec.label,
      ...prog,
    };
  }
}
