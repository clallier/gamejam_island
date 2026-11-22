import { DEFENSE_KIND } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import { DEFENSE_SLOT_XS } from '../world/constants.ts';
import type { InventoryStore } from '../world/InventoryStore.ts';
import {
  TURRET_BUILD_COST,
  TURRET_MAX_HP,
  TURRET_REPAIR_COST,
  TURRET_UPGRADE_COST,
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
 * Outcome returned after building, repairing, or upgrading a turret slot.
 */
export interface DefenseBuildOutcome {
  readonly slotIndex: number;
  readonly x: number;
  readonly action: 'built' | 'upgraded' | 'repaired';
  readonly level: number;
}

/**
 * Manages turret construction, repair, upgrades, and contextual prompts on the
 * island's defense plinths backed by bitECS `Defense` SoA arrays.
 */
export class DefenseStructureSystem {
  private static readonly MAX_TURRET_LEVEL = 2;

  private readonly ecs: IslandEcsWorld;
  private readonly slotXs: readonly number[];

  /**
   * Initializes defense management over registered bitECS defense slot entities.
   *
   * @param ecs Shared `IslandEcsWorld`.
   * @param slotXs Plinth X coordinates matching registered `slot-0..N` IDs.
   * @throws Error Never thrown during construction.
   * @example
   * const defenses = new DefenseStructureSystem(ecs);
   */
  public constructor(ecs: IslandEcsWorld, slotXs: readonly number[] = DEFENSE_SLOT_XS) {
    this.ecs = ecs;
    this.slotXs = slotXs;
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
   * Returns contextual action prompt icon and label for the HUD inspect button.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @returns Prompt icon and label pair.
   * @throws Error Never thrown.
   * @example
   * const prompt = defenses.getSlotPrompt(1);
   */
  public getSlotPrompt(slotIndex: number): { icon: string; label: string } {
    const state = this.getSlotState(slotIndex);
    if (state.kind === DEFENSE_KIND.EMPTY) return { icon: '🗼', label: 'Turret' };
    if (state.hp < state.maxHp) return { icon: '🔧', label: 'Repair' };
    if (state.level < DefenseStructureSystem.MAX_TURRET_LEVEL) return { icon: '⬆', label: 'Lv2' };
    return { icon: '🛡', label: 'Max' };
  }

  /**
   * Builds, repairs, or upgrades the structure at `slotIndex` if resources allow.
   *
   * @param slotIndex Zero-based defense plinth index.
   * @param inventory Live player `InventoryStore`.
   * @returns Action outcome, or `null` when unaffordable, maxed, or unregistered.
   * @throws Error Never thrown during build/upgrade validation.
   * @example
   * const built = defenses.interactSlot(0, inventory);
   */
  public interactSlot(slotIndex: number, inventory: InventoryStore): DefenseBuildOutcome | null {
    const eid = this.ecs.getEntityId(`slot-${slotIndex}`);
    if (eid === undefined) return null;
    const state = this.getSlotState(slotIndex);
    if (state.kind === DEFENSE_KIND.EMPTY) return this._buildTurret(eid, slotIndex, state.x, inventory);
    if (state.hp < state.maxHp) return this._repairTurret(eid, slotIndex, state.x, state.level, inventory);
    if (state.level < DefenseStructureSystem.MAX_TURRET_LEVEL) {
      return this._upgradeTurret(eid, slotIndex, state.x, inventory);
    }
    return null;
  }

  /**
   * Clears all built defense slots back to `EMPTY` for an island restart.
   *
   * @throws Error Never thrown.
   * @example
   * defenses.resetAll();
   */
  public resetAll(): void {
    const { Defense } = this.ecs.getComponents();
    for (const eid of this.ecs.queryDefenses()) {
      Defense.kind[eid] = DEFENSE_KIND.EMPTY;
      Defense.level[eid] = 0;
      Defense.hp[eid] = 0;
      Defense.maxHp[eid] = 0;
      Defense.fireCooldown[eid] = 0;
    }
  }

  private _buildTurret(
    eid: number,
    slotIndex: number,
    x: number,
    inventory: InventoryStore,
  ): DefenseBuildOutcome | null {
    if (!inventory.spend(TURRET_BUILD_COST)) return null;
    const { Defense } = this.ecs.getComponents();
    Defense.kind[eid] = DEFENSE_KIND.TURRET;
    Defense.level[eid] = 1;
    Defense.hp[eid] = TURRET_MAX_HP;
    Defense.maxHp[eid] = TURRET_MAX_HP;
    Defense.fireCooldown[eid] = 0;
    return { slotIndex, x, action: 'built', level: 1 };
  }

  private _repairTurret(
    eid: number,
    slotIndex: number,
    x: number,
    level: number,
    inventory: InventoryStore,
  ): DefenseBuildOutcome | null {
    if (!inventory.spend(TURRET_REPAIR_COST)) return null;
    const { Defense } = this.ecs.getComponents();
    Defense.hp[eid] = Defense.maxHp[eid] ?? TURRET_MAX_HP;
    return { slotIndex, x, action: 'repaired', level };
  }

  private _upgradeTurret(
    eid: number,
    slotIndex: number,
    x: number,
    inventory: InventoryStore,
  ): DefenseBuildOutcome | null {
    if (!inventory.spend(TURRET_UPGRADE_COST)) return null;
    const { Defense } = this.ecs.getComponents();
    const maxHp = Math.round(TURRET_MAX_HP * 1.4);
    Defense.level[eid] = 2;
    Defense.maxHp[eid] = maxHp;
    Defense.hp[eid] = maxHp;
    return { slotIndex, x, action: 'upgraded', level: 2 };
  }
}
