import { type BalanceSheet, defaultBalanceSheet } from '../config/BalanceSheet.ts';
import { DEFENSE_KIND } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import { DEFENSE_SLOT_XS, type ResourceKey } from '../world/constants.ts';
import type { InventoryStore } from '../world/InventoryStore.ts';
import {
  BARRICADE_BUILD_COST,
  BARRICADE_UPGRADE_LV2_COST,
  BARRICADE_UPGRADE_LV3_COST,
  DEFENSE_SALVAGE_REFUND,
  TURRET_BUILD_COST,
  TURRET_MAX_HP,
  TURRET_REPAIR_COST,
  TURRET_UPGRADE_COST,
  TURRET_UPGRADE_LV3_COST,
} from './constants.ts';

/**
 * Snapshot of a defense plinth's current ECS structure state.
 */
export interface DefenseSlotState {
  readonly slotIndex: number;
  readonly x: number;
  readonly kind: number;
  readonly level: number;
  readonly hp: number;
  readonly maxHp: number;
}

/**
 * Outcome returned after building, repairing, upgrading, or salvaging a defense plinth.
 */
export interface DefenseBuildOutcome {
  readonly slotIndex: number;
  readonly x: number;
  readonly kind: number;
  readonly action: 'built' | 'upgraded' | 'repaired' | 'salvaged';
  readonly level: number;
}

/**
 * Manages dual-choice defense structures (Turrets & Barricades), bond-gated
 * research upgrades (Lv 1–3), repair, and salvage on defense plinths.
 */
export class DefenseStructureSystem {
  private static readonly MAX_DEFENSE_LEVEL = 3;

  private readonly ecs: IslandEcsWorld;
  private readonly slotXs: readonly number[];
  private readonly balance: BalanceSheet;

  /**
   * Initializes defense management over registered bitECS defense slot entities.
   *
   * @param ecs Shared `IslandEcsWorld`.
   * @param slotXs Plinth X coordinates matching registered `slot-0..N` IDs.
   * @param balance Runtime `BalanceSheet` driving barricade HP scaling.
   * @throws Error Never thrown during construction.
   * @example
   * const defenses = new DefenseStructureSystem(ecs);
   */
  public constructor(
    ecs: IslandEcsWorld,
    slotXs: readonly number[] = DEFENSE_SLOT_XS,
    balance: BalanceSheet = defaultBalanceSheet,
  ) {
    this.ecs = ecs;
    this.slotXs = slotXs;
    this.balance = balance;
  }

  /**
   * Reads the current state of defense plinth `slotIndex` from bitECS `Defense` arrays.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @returns Immutable `DefenseSlotState`.
   * @throws Error Never thrown; defaults to empty state if unregistered.
   * @example
   * const state = defenses.getSlotState(0);
   */
  public getSlotState(slotIndex: number): DefenseSlotState {
    const eid = this.ecs.getEntityId(`slot-${slotIndex}`);
    const x = this.slotXs[slotIndex] ?? 0;
    if (eid === undefined) return { slotIndex, x, kind: DEFENSE_KIND.EMPTY, level: 0, hp: 0, maxHp: 0 };
    const { Defense } = this.ecs.getComponents();
    return {
      slotIndex,
      x,
      kind: Defense.kind[eid] ?? DEFENSE_KIND.EMPTY,
      level: Defense.level[eid] ?? 0,
      hp: Defense.hp[eid] ?? 0,
      maxHp: Defense.maxHp[eid] ?? 0,
    };
  }

  /**
   * Returns snapshots of all registered defense plinths in strip order (`L2..R2`).
   *
   * @returns Ordered array of `DefenseSlotState` entries.
   * @throws Error Never thrown.
   * @example
   * const slots = defenses.getAllSlotStates();
   */
  public getAllSlotStates(): DefenseSlotState[] {
    return this.slotXs.map((_, idx) => this.getSlotState(idx));
  }

  /**
   * Returns contextual action prompt icon and label for the HUD inspect button.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @param researchLevel Pip's current Bond / Engineering Research level (`1..3`).
   * @returns Prompt icon and label pair.
   * @throws Error Never thrown.
   * @example
   * const prompt = defenses.getSlotPrompt(1, 2);
   */
  public getSlotPrompt(slotIndex: number, researchLevel = 2): { icon: string; label: string } {
    const state = this.getSlotState(slotIndex);
    if (state.kind === DEFENSE_KIND.EMPTY) return { icon: '🗼', label: 'Turret' };
    if (state.hp < state.maxHp) return { icon: '🔧', label: 'Repair' };
    if (state.level >= DefenseStructureSystem.MAX_DEFENSE_LEVEL) return { icon: '🛡', label: 'Max' };
    if (state.level < researchLevel) return { icon: '⬆', label: `Lv${state.level + 1}` };
    return { icon: '🔒', label: `Pip Lv${state.level + 1}` };
  }

  /**
   * Builds a Lv 1 `TURRET` or `BARRICADE` on an empty plinth if resources allow.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @param kind Structure kind (`DEFENSE_KIND.TURRET` or `DEFENSE_KIND.BARRICADE`).
   * @param inventory Live player `InventoryStore`.
   * @returns Build outcome, or `null` if occupied, invalid, or unaffordable.
   * @throws Error Never thrown.
   * @example
   * defenses.buildStructure(0, DEFENSE_KIND.BARRICADE, inventory);
   */
  public buildStructure(
    slotIndex: number,
    kind: number,
    inventory: InventoryStore,
  ): DefenseBuildOutcome | null {
    const eid = this.ecs.getEntityId(`slot-${slotIndex}`);
    if (eid === undefined || (kind !== DEFENSE_KIND.TURRET && kind !== DEFENSE_KIND.BARRICADE)) return null;
    const state = this.getSlotState(slotIndex);
    if (state.kind !== DEFENSE_KIND.EMPTY) return null;
    const cost = kind === DEFENSE_KIND.BARRICADE ? BARRICADE_BUILD_COST : TURRET_BUILD_COST;
    if (!inventory.spend(cost)) return null;
    const maxHp = this._computeMaxHp(kind, 1);
    this._writeSlot(eid, kind, 1, maxHp);
    return { slotIndex, x: state.x, kind, action: 'built', level: 1 };
  }

  /**
   * Upgrades an existing defense to `level + 1` when unlocked by Pip's `researchLevel`.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @param inventory Live player `InventoryStore`.
   * @param researchLevel Pip's Bond / Research level (`1..3`).
   * @returns Upgrade outcome, or `null` when maxed, research-locked, or unaffordable.
   * @throws Error Never thrown.
   * @example
   * defenses.upgradeSlot(0, inventory, 2);
   */
  public upgradeSlot(
    slotIndex: number,
    inventory: InventoryStore,
    researchLevel = 2,
  ): DefenseBuildOutcome | null {
    const eid = this.ecs.getEntityId(`slot-${slotIndex}`);
    if (eid === undefined) return null;
    const state = this.getSlotState(slotIndex);
    const cap = Math.min(DefenseStructureSystem.MAX_DEFENSE_LEVEL, Math.max(1, researchLevel));
    if (state.kind === DEFENSE_KIND.EMPTY || state.level >= cap) return null;
    const nextLevel = state.level + 1;
    if (!inventory.spend(this._getUpgradeCost(state.kind, nextLevel))) return null;
    this._writeSlot(eid, state.kind, nextLevel, this._computeMaxHp(state.kind, nextLevel));
    return { slotIndex, x: state.x, kind: state.kind, action: 'upgraded', level: nextLevel };
  }

  /**
   * Repairs a damaged defense structure back to its current tier `maxHp`.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @param inventory Live player `InventoryStore`.
   * @returns Repair outcome, or `null` when empty, full HP, or unaffordable.
   * @throws Error Never thrown.
   * @example
   * defenses.repairSlot(0, inventory);
   */
  public repairSlot(slotIndex: number, inventory: InventoryStore): DefenseBuildOutcome | null {
    const eid = this.ecs.getEntityId(`slot-${slotIndex}`);
    if (eid === undefined) return null;
    const state = this.getSlotState(slotIndex);
    if (state.kind === DEFENSE_KIND.EMPTY || state.hp >= state.maxHp) return null;
    if (!inventory.spend(TURRET_REPAIR_COST)) return null;
    this.ecs.getComponents().Defense.hp[eid] = state.maxHp;
    return { slotIndex, x: state.x, kind: state.kind, action: 'repaired', level: state.level };
  }

  /**
   * Autonomously restores a damaged defense plinth to `maxHp` when Pip reaches it with his wrench.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @returns Repair outcome, or `null` when unregistered, empty, or already at full HP.
   * @throws Error Never thrown.
   * @example
   * const fixed = defenses.repairSlotFree(1);
   */
  public repairSlotFree(slotIndex: number): DefenseBuildOutcome | null {
    const eid = this.ecs.getEntityId(`slot-${slotIndex}`);
    if (eid === undefined) return null;
    const state = this.getSlotState(slotIndex);
    if (state.kind === DEFENSE_KIND.EMPTY || state.hp >= state.maxHp) return null;
    this.ecs.getComponents().Defense.hp[eid] = state.maxHp;
    return { slotIndex, x: state.x, kind: state.kind, action: 'repaired', level: state.level };
  }

  /**
   * Dismantles an occupied defense plinth and refunds `DEFENSE_SALVAGE_REFUND`.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @param inventory Inventory receiving salvaged resources.
   * @returns Salvage outcome, or `null` when plinth is already empty.
   * @throws Error Never thrown.
   * @example
   * defenses.salvageSlot(0, inventory);
   */
  public salvageSlot(slotIndex: number, inventory: InventoryStore): DefenseBuildOutcome | null {
    const eid = this.ecs.getEntityId(`slot-${slotIndex}`);
    if (eid === undefined) return null;
    const state = this.getSlotState(slotIndex);
    if (state.kind === DEFENSE_KIND.EMPTY) return null;
    this._writeSlot(eid, DEFENSE_KIND.EMPTY, 0, 0);
    for (const [key, amount] of Object.entries(DEFENSE_SALVAGE_REFUND) as Array<[ResourceKey, number]>) {
      if (amount > 0) inventory.add(key, amount);
    }
    return { slotIndex, x: state.x, kind: DEFENSE_KIND.EMPTY, action: 'salvaged', level: 0 };
  }

  /**
   * Quick road interaction: builds Lv 1 turret if empty, repairs if damaged, or upgrades if unlocked.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @param inventory Live player `InventoryStore`.
   * @param researchLevel Pip's current Bond / Research level (`1..3`, defaults to `2`).
   * @returns Action outcome, or `null` when unaffordable, locked, maxed, or unregistered.
   * @throws Error Never thrown during build/upgrade validation.
   * @example
   * const built = defenses.interactSlot(0, inventory, 2);
   */
  public interactSlot(
    slotIndex: number,
    inventory: InventoryStore,
    researchLevel = 2,
  ): DefenseBuildOutcome | null {
    const state = this.getSlotState(slotIndex);
    if (state.kind === DEFENSE_KIND.EMPTY) return this.buildStructure(slotIndex, DEFENSE_KIND.TURRET, inventory);
    if (state.hp < state.maxHp) return this.repairSlot(slotIndex, inventory);
    return this.upgradeSlot(slotIndex, inventory, researchLevel);
  }

  /**
   * Returns the resource cost object required to upgrade `slotIndex` to its next tier.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @returns Cost map for next tier upgrade, or empty object when maxed/empty.
   * @throws Error Never thrown.
   * @example
   * const cost = defenses.getUpgradeCostForSlot(0);
   */
  public getUpgradeCostForSlot(slotIndex: number): Partial<Record<ResourceKey, number>> {
    const state = this.getSlotState(slotIndex);
    if (state.kind === DEFENSE_KIND.EMPTY || state.level >= DefenseStructureSystem.MAX_DEFENSE_LEVEL) {
      return {};
    }
    return this._getUpgradeCost(state.kind, state.level + 1);
  }

  /**
   * Restores Lv 3 Smart Rune-Pulse Barricades back to full HP at dawn.
   *
   * @returns Count of Lv 3 barricades regenerated.
   * @throws Error Never thrown.
   * @example
   * const healed = defenses.healSmartBarricadesAtDawn();
   */
  public healSmartBarricadesAtDawn(): number {
    const { Defense } = this.ecs.getComponents();
    let healed = 0;
    for (const eid of this.ecs.queryDefenses()) {
      const isSmartWall =
        Defense.kind[eid] === DEFENSE_KIND.BARRICADE &&
        (Defense.level[eid] ?? 0) >= DefenseStructureSystem.MAX_DEFENSE_LEVEL;
      if (!isSmartWall || (Defense.hp[eid] ?? 0) >= (Defense.maxHp[eid] ?? 0)) continue;
      Defense.hp[eid] = Defense.maxHp[eid] ?? 0;
      healed += 1;
    }
    return healed;
  }

  /**
   * Clears all built defense slots back to `EMPTY` for an island restart.
   *
   * @throws Error Never thrown.
   * @example
   * defenses.resetAll();
   */
  public resetAll(): void {
    for (const eid of this.ecs.queryDefenses()) {
      this._writeSlot(eid, DEFENSE_KIND.EMPTY, 0, 0);
    }
  }

  private _writeSlot(eid: number, kind: number, level: number, maxHp: number): void {
    const { Defense } = this.ecs.getComponents();
    Defense.kind[eid] = kind;
    Defense.level[eid] = level;
    Defense.hp[eid] = maxHp;
    Defense.maxHp[eid] = maxHp;
    Defense.fireCooldown[eid] = 0;
  }

  private _computeMaxHp(kind: number, level: number): number {
    const base = kind === DEFENSE_KIND.BARRICADE ? this.balance.get('barricadeBaseHp') : TURRET_MAX_HP;
    if (level <= 1) return Math.round(base);
    if (level === 2) return Math.round(base * (kind === DEFENSE_KIND.BARRICADE ? 1.45 : 1.4));
    return Math.round(base * (kind === DEFENSE_KIND.BARRICADE ? 2.0 : 1.85));
  }

  private _getUpgradeCost(kind: number, nextLevel: number): Partial<Record<ResourceKey, number>> {
    if (kind === DEFENSE_KIND.BARRICADE) {
      return nextLevel >= 3 ? BARRICADE_UPGRADE_LV3_COST : BARRICADE_UPGRADE_LV2_COST;
    }
    return nextLevel >= 3 ? TURRET_UPGRADE_LV3_COST : TURRET_UPGRADE_COST;
  }
}
