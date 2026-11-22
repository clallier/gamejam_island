import { describe, expect, it } from 'vitest';
import { DEFENSE_KIND, ENEMY_KIND } from '../../src/ecs/constants.ts';
import { IslandEcsWorld } from '../../src/ecs/IslandEcsWorld.ts';
import {
  DEFENDER_ATTACK_DAMAGE,
  ENEMY_BREACH_BORDER_PULL,
  ENEMY_BRUTE_DAMAGE,
  ENEMY_SPRITE_DAMAGE,
  TOWN_HEART_MAX_HP,
  TURRET_BASE_DAMAGE,
  TURRET_MAX_HP,
} from '../../src/systems/constants.ts';
import { DefenseStructureSystem } from '../../src/systems/DefenseStructureSystem.ts';
import { WaveCombatSystem } from '../../src/systems/WaveCombatSystem.ts';
import { DEFENSE_SLOT_XS } from '../../src/world/constants.ts';
import { CorruptionField } from '../../src/world/CorruptionField.ts';
import { InventoryStore } from '../../src/world/InventoryStore.ts';

function setupCombatHarness() {
  const ecs = new IslandEcsWorld();
  DEFENSE_SLOT_XS.forEach((x, idx) => ecs.registerDefenseSlot(idx, `slot-${idx}`, x, 3.2));
  return {
    ecs,
    defenses: new DefenseStructureSystem(ecs, DEFENSE_SLOT_XS),
    combat: new WaveCombatSystem(ecs),
    corruption: new CorruptionField(),
    inventory: new InventoryStore(),
  };
}

describe('DefenseStructureSystem & WaveCombatSystem', () => {
  it('builds and upgrades modular turrets on defense plinths and generates prompts', () => {
    const { defenses, inventory } = setupCombatHarness();
    inventory.add('wood', 10);
    inventory.add('stone', 10);
    inventory.add('shards', 5);

    expect(defenses.getSlotPrompt(0)).toEqual({ icon: '🗼', label: 'Turret' });
    const built = defenses.interactSlot(0, inventory);
    expect(built).toEqual({ slotIndex: 0, x: DEFENSE_SLOT_XS[0], action: 'built', level: 1 });
    expect(defenses.getSlotPrompt(0)).toEqual({ icon: '⬆', label: 'Lv2' });

    const upgraded = defenses.interactSlot(0, inventory);
    expect(upgraded?.action).toBe('upgraded');
    expect(upgraded?.level).toBe(2);
    expect(defenses.getSlotPrompt(0)).toEqual({ icon: '🛡', label: 'Max' });
    expect(defenses.interactSlot(0, inventory)).toBeNull();
  });

  it('spawns night waves, fires turrets with rate multipliers, engages Defender patrol, and handles player shots', () => {
    const { ecs, defenses, combat, corruption, inventory } = setupCombatHarness();
    defenses.interactSlot(1, inventory); // slot 1 at x = -20
    const spriteEid = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, -24, -1, 24, 3.2);

    const frame1 = combat.step(0.5, 'night', 1, 1.25, 6, corruption);
    expect(frame1.shots.length).toBeGreaterThanOrEqual(1);
    expect(frame1.defenderPatrolX).not.toBeNull();
    expect(ecs.getComponents().Defense.kind[ecs.getEntityId('slot-1')!]).toBe(DEFENSE_KIND.TURRET);

    const hit = combat.applyPlayerShot(-20, -1, 14);
    expect(hit).not.toBeNull();
    expect(hit?.killed).toBe(true);
    expect(combat.getActiveEnemyCount()).toBeGreaterThanOrEqual(1);
    expect(ecs.getComponents().Enemy.hp[spriteEid] ?? 0).toBeLessThanOrEqual(0);
  });

  it('damages Town Heart, triggers game over on breach, and resets cleanly', () => {
    const { ecs, defenses, combat, corruption, inventory } = setupCombatHarness();
    defenses.interactSlot(0, inventory);
    ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, -1.0, -1, 120, 2);

    const borderBefore = corruption.getLeftBorderX();
    for (let i = 0; i < 12; i++) {
      combat.step(1.6, 'night', 1, 1, 0, corruption);
    }

    expect(combat.getHeartHp()).toBe(0);
    expect(combat.isOver()).toBe(true);
    expect(corruption.getLeftBorderX()).toBeGreaterThan(borderBefore);

    combat.reset();
    defenses.resetAll();
    expect(combat.isOver()).toBe(false);
    expect(combat.getHeartHp()).toBe(100);
    expect(combat.getActiveEnemyCount()).toBe(0);
    expect(defenses.getSlotState(0).kind).toBe(DEFENSE_KIND.EMPTY);
  });

  it('distinguishes repair vs upgrade paths, unaffordable actions, and unregistered slots', () => {
    const { ecs, defenses, inventory } = setupCombatHarness();
    const emptyInv = new InventoryStore({ wood: 0, stone: 0, petals: 0, shards: 0 });
    expect(defenses.interactSlot(99, inventory)).toBeNull();
    expect(defenses.getSlotState(99).kind).toBe(DEFENSE_KIND.EMPTY);
    expect(defenses.interactSlot(0, emptyInv)).toBeNull();

    // Build Lv 1 turret
    inventory.add('wood', 10);
    inventory.add('stone', 10);
    inventory.add('shards', 5);
    expect(defenses.interactSlot(0, inventory)?.action).toBe('built');

    // Damage Lv 1 turret -> repairs before upgrading, and returns null when repair unaffordable
    const slotEid = ecs.getEntityId('slot-0')!;
    ecs.getComponents().Defense.hp[slotEid] = 20;
    expect(defenses.getSlotPrompt(0)).toEqual({ icon: '🔧', label: 'Repair' });
    expect(defenses.interactSlot(0, emptyInv)).toBeNull();
    const repaired = defenses.interactSlot(0, inventory);
    expect(repaired).toEqual({ slotIndex: 0, x: DEFENSE_SLOT_XS[0], action: 'repaired', level: 1 });
    expect(defenses.getSlotState(0).hp).toBe(TURRET_MAX_HP);

    // Unaffordable upgrade returns null, affordable upgrade boosts maxHp by 1.4x
    expect(defenses.interactSlot(0, emptyInv)).toBeNull();
    const upgraded = defenses.interactSlot(0, inventory);
    expect(upgraded?.action).toBe('upgraded');
    expect(defenses.getSlotState(0).maxHp).toBe(Math.round(TURRET_MAX_HP * 1.4));

    // Damaged Lv 2 turret can still be repaired back to Lv 2 maxHp
    ecs.getComponents().Defense.hp[slotEid] = 15;
    expect(defenses.getSlotPrompt(0)).toEqual({ icon: '🔧', label: 'Repair' });
    const lv2Repair = defenses.interactSlot(0, inventory);
    expect(lv2Repair).toEqual({ slotIndex: 0, x: DEFENSE_SLOT_XS[0], action: 'repaired', level: 2 });
    expect(defenses.getSlotState(0).hp).toBe(Math.round(TURRET_MAX_HP * 1.4));
  });

  it('applies Lv1/Lv2 turret damage, mid-wave turret destruction, brute vs sprite damage, flank encroachment, dawn heal, and post-game-over freeze', () => {
    const { ecs, defenses, combat, corruption, inventory } = setupCombatHarness();
    inventory.add('wood', 10);
    inventory.add('stone', 10);
    inventory.add('shards', 5);

    // Lv2 turret at slot 2 (x = 20) deals 1.5x TURRET_BASE_DAMAGE
    defenses.interactSlot(2, inventory);
    defenses.interactSlot(2, inventory);
    const enemyRight = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, 26, 1, 56, 1.9);
    const shotRes = combat.step(0.1, 'day', 1, 1, 0, corruption);
    expect(shotRes.shots).toHaveLength(1);
    expect(ecs.getComponents().Enemy.hp[enemyRight]).toBeCloseTo(56 - TURRET_BASE_DAMAGE * 1.5, 4);
    ecs.despawnEntity(enemyRight);

    // Weak Lv1 turret at slot 0 (x = -26) is destroyed mid-wave by a Brute
    defenses.interactSlot(0, inventory);
    const slot0Eid = ecs.getEntityId('slot-0')!;
    ecs.getComponents().Defense.hp[slot0Eid] = ENEMY_BRUTE_DAMAGE;
    const brute = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, -26, -1, 100, 1.9);
    const destroyRes = combat.step(0.1, 'day', 1, 1, 0, corruption);
    expect(destroyRes.defenseDestroyed).toBe(true);
    expect(defenses.getSlotState(0).kind).toBe(DEFENSE_KIND.EMPTY);
    ecs.despawnEntity(brute);

    // Right-flank sprite vs brute damage & right border encroachment
    const rightBorderBefore = corruption.getRightBorderX();
    const sprite = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, 1.0, 1, 24, 3.2);
    combat.step(0.1, 'day', 1, 1, 0, corruption);
    expect(combat.getHeartHp()).toBe(TOWN_HEART_MAX_HP - ENEMY_SPRITE_DAMAGE);
    expect(corruption.getRightBorderX()).toBe(rightBorderBefore - ENEMY_BREACH_BORDER_PULL);
    ecs.despawnEntity(sprite);

    // Dawn heal clamping
    combat.healTownHeart(-5);
    expect(combat.getHeartHp()).toBe(TOWN_HEART_MAX_HP - ENEMY_SPRITE_DAMAGE);
    combat.healTownHeart(50);
    expect(combat.getHeartHp()).toBe(TOWN_HEART_MAX_HP);

    // Defender night patrol & day return + bonus strike damage
    const nightTarget = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, 5.5, 1, 30, 0);
    const nightFrame = combat.step(0.1, 'night', 1, 1, 6, corruption);
    expect(nightFrame.defenderPatrolX).not.toBeNull();
    expect(ecs.getComponents().Enemy.hp[nightTarget]).toBe(30 - (DEFENDER_ATTACK_DAMAGE + 6));
    const dayFrame = combat.step(0.1, 'dawn', 2, 1, 6, corruption);
    expect(dayFrame.defenderPatrolX).toBeNull();

    // Negative/NaN dt does not corrupt state; game-over freezes combat & heals
    combat.step(Number.NaN, 'night', 2, Number.NaN, 0, corruption);
    ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, 0.5, 1, 200, 0);
    for (let i = 0; i < 10; i++) combat.step(1.6, 'night', 2, 1, 0, corruption);
    expect(combat.isOver()).toBe(true);
    const frozenHp = combat.getHeartHp();
    expect(frozenHp).toBe(0);
    combat.healTownHeart(20);
    expect(combat.getHeartHp()).toBe(0);
    expect(combat.applyPlayerShot(0, 1)).toBeNull();
    const frozenStep = combat.step(1, 'night', 2, 1, 0, corruption);
    expect(frozenStep.shots).toEqual([]);
    expect(frozenStep.slain).toEqual([]);
  });

  it('scales waves to 400 enemies by Day 5, spawns Rushers, and fires player auto-shoot with knockback & hitFlash', () => {
    const { ecs, combat, corruption } = setupCombatHarness();
    expect(combat.getWaveTotalForDay(1)).toBe(28);
    expect(combat.getWaveTotalForDay(2)).toBe(70);
    expect(combat.getWaveTotalForDay(3)).toBe(140);
    expect(combat.getWaveTotalForDay(4)).toBe(240);
    expect(combat.getWaveTotalForDay(5)).toBe(400);
    expect(combat.getWaveTotalForDay(6)).toBe(500);

    // Night 5 queues 400 enemies and emits burst spawns with Z spread cleanly
    const night5 = combat.step(0.25, 'night', 5, 1, 0, corruption, 0);
    expect(night5.totalRemaining).toBe(400);
    expect(combat.getActiveEnemyCount()).toBeGreaterThanOrEqual(5);
    const zValues = ecs.queryEnemies().map((eid) => ecs.getComponents().Position.z[eid]);
    expect(new Set(zValues).size).toBeGreaterThan(1);

    // Clear and test auto-shoot knockback + hitFlash on nearby enemy
    combat.reset();
    const targetEid = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_RUSHER, 8, 1, 14, 4.9);
    const autoRes = combat.step(0.05, 'day', 1, 1, 0, corruption, 0);
    expect(autoRes.shots).toHaveLength(1);
    expect(autoRes.shots[0]).toMatchObject({ fromX: 0, source: 'player' });
    expect(autoRes.shots[0]!.toX).toBeCloseTo(9.355, 3);
    expect(autoRes.slain).toHaveLength(1);
    expect(autoRes.slain[0]?.eid).toBe(targetEid);

    // Surviving Brute resists knockback (0.25x poise: 8 - 1.9*0.5 + 1.6*0.25 = 7.45) and gets hitFlash
    const bruteEid = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, 8, 1, 56, 1.9);
    combat.step(0.5, 'day', 1, 1, 0, corruption, 0);
    expect(ecs.getComponents().Position.x[bruteEid]).toBeCloseTo(7.45, 3);
    expect(ecs.getComponents().Enemy.hitFlash[bruteEid]).toBeGreaterThan(0);
  });

  it('only auto-shoots and fires directional shots at enemies in front of player facing', () => {
    const { ecs, combat, corruption } = setupCombatHarness();
    const behindEid = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, -5, -1, 24, 0);

    // Facing right (1): enemy at x = -5 is behind player at x = 0 -> ignored by both auto-shoot & manual shot
    const facingRightRes = combat.step(0.05, 'day', 1, 1, 0, corruption, 0, 1);
    expect(facingRightRes.shots).toEqual([]);
    expect(combat.applyPlayerShot(0, 1)).toBeNull();
    expect(ecs.getComponents().Enemy.hp[behindEid]).toBe(24);

    // Turning left (-1) with an enemy also behind at x = +5 -> shoots ONLY enemy ahead at x = -5
    const rightSideEid = ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, 5, 1, 24, 0);
    const facingLeftRes = combat.step(0.5, 'day', 1, 1, 0, corruption, 0, -1);
    expect(facingLeftRes.shots).toHaveLength(1);
    expect(facingLeftRes.shots[0]!.toX).toBeLessThan(0);
    expect(ecs.getComponents().Enemy.hp[behindEid]).toBeLessThan(24);
    expect(ecs.getComponents().Enemy.hp[rightSideEid]).toBe(24);

    // Turning back right (1) can manually hit enemy ahead at x = +5
    const hitAhead = combat.applyPlayerShot(0, 1, 24);
    expect(hitAhead).not.toBeNull();
    expect(hitAhead?.killed).toBe(true);
    expect(ecs.isEntityAlive(rightSideEid)).toBe(false);

    // Limited bow range: target beyond PLAYER_AUTOSHOOT_RANGE (9.5) at x = 11 is out of range, x = 8 is hit
    ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, 11, 1, 24, 0);
    const outOfRange = combat.step(0.5, 'day', 1, 1, 0, corruption, 0, 1);
    expect(outOfRange.shots).toEqual([]);
    expect(combat.applyPlayerShot(0, 1)).toBeNull();
  });
});
