import { type BalanceSheet, defaultBalanceSheet } from '../config/BalanceSheet.ts';
import { DEFENSE_KIND, ENEMY_KIND } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import type { DayPhase } from '../world/constants.ts';
import type { CorruptionField } from '../world/CorruptionField.ts';
import {
  ENEMY_BREACH_BORDER_PULL,
  ENEMY_BRUTE_COOLDOWN,
  ENEMY_BRUTE_DAMAGE,
  ENEMY_HIT_FLASH_SECONDS,
  ENEMY_RUSHER_COOLDOWN,
  ENEMY_RUSHER_DAMAGE,
  ENEMY_SPRITE_COOLDOWN,
  ENEMY_SPRITE_DAMAGE,
  ROAD_CRATE_IMPACT_DAMAGE,
  TOWN_HEART_MAX_HP,
  TURRET_SHOT_KNOCKBACK,
  WAVE_COUNTS_BY_DAY,
} from './constants.ts';

/**
 * Emitted when a turret, player bow, or Defender spear strikes an enemy entity.
 */
export interface CombatShotEvent {
  readonly fromX: number;
  readonly toX: number;
  readonly source: 'turret' | 'player' | 'defender';
}

export type TurretShotEvent = CombatShotEvent;

/**
 * Emitted when an enemy entity is defeated and despawned.
 */
export interface SlainEnemyEvent {
  readonly eid: number;
  readonly x: number;
  readonly kind: number;
}

/**
 * Emitted when a player slingshot shot lands on an enemy.
 */
export interface PlayerShotHit {
  readonly x: number;
  readonly killed: boolean;
}

/**
 * Per-frame summary returned by `WaveCombatSystem.step`.
 */
export interface WaveCombatFrameResult {
  readonly shots: readonly CombatShotEvent[];
  readonly slain: readonly SlainEnemyEvent[];
  readonly defenseDestroyed: boolean;
  readonly heartHp: number;
  readonly heartMaxHp: number;
  readonly activeEnemies: number;
  readonly totalRemaining: number;
  readonly gameOver: boolean;
  readonly defenderPatrolX: number | null;
}

/**
 * Coordinates escalating night horde waves (up to 260+ enemies on Day 5),
 * player auto-shoot, turret targeting, knockback/hit-flash, Defender patrol, and Town Heart HP.
 */
export class WaveCombatSystem {
  private static readonly SPAWN_ABS_X = 54;
  private static readonly HEART_HIT_RADIUS = 2.2;
  private static readonly STRUCTURE_HIT_RADIUS = 1.5;
  private static readonly DEFENDER_HOME_X = 5;

  private readonly ecs: IslandEcsWorld;
  private readonly balance: BalanceSheet;
  private readonly slainEids: number[] = [];
  private townHeartHp = TOWN_HEART_MAX_HP;
  private activeWaveDay = 0;
  private remainingToSpawn = 0;
  private spawnTimer = 0;
  private spawnIndex = 0;
  private defenderX = WaveCombatSystem.DEFENDER_HOME_X;
  private defenderCooldown = 0;
  private playerShootCooldown = 0;
  private isGameOver = false;

  /**
   * Initializes the night wave and combat coordinator over `ecs`.
   *
   * @param ecs Shared `IslandEcsWorld`.
   * @param balance Runtime `BalanceSheet` driving live speeds, ranges, and damages.
   * @throws Error Never thrown during construction.
   * @example
   * const combat = new WaveCombatSystem(ecs);
   */
  public constructor(ecs: IslandEcsWorld, balance: BalanceSheet = defaultBalanceSheet) {
    this.ecs = ecs;
    this.balance = balance;
  }

  /**
   * Advances wave spawning, enemy movement, turret & player auto-fire, and Defender patrol.
   *
   * @param dt Clamped frame delta in seconds.
   * @param phase Current solar `DayPhase`.
   * @param dayNumber Current integer day number.
   * @param turretFireRateMultiplier Speed multiplier unlocked by Pip (`>= 1`).
   * @param defenderDamageBonus Bonus strike damage unlocked by Bram Lv 3.
   * @param corruption Live `CorruptionField` pulled inward on Town Heart breaches.
   * @param playerX Optional live player X coordinate enabling automatic range fire.
   * @param playerFacing Player facing sign (`1` right, `-1` left); auto-shoot only fires ahead.
   * @param playerAutoShootMultiplier Auto-shoot fire-rate multiplier (`>= 1`).
   * @returns Immutable per-frame `WaveCombatFrameResult`.
   * @throws Error Never thrown during frame updates.
   * @example
   * const frame = combat.step(dt, 'night', 5, 1.25, 6, corruption, player.getX(), player.getFacing());
   */
  public step(
    dt: number,
    phase: DayPhase,
    dayNumber: number,
    turretFireRateMultiplier: number,
    defenderDamageBonus: number,
    corruption: CorruptionField,
    playerX?: number,
    playerFacing: 1 | -1 = 1,
    playerAutoShootMultiplier = 1,
  ): WaveCombatFrameResult {
    if (this.isGameOver) return this._buildResult([], [], false);
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const safeRate = Number.isFinite(turretFireRateMultiplier) ? Math.max(0, turretFireRateMultiplier) : 1;
    const safeBonus = Number.isFinite(defenderDamageBonus) ? Math.max(0, defenderDamageBonus) : 0;
    this._tickSpawning(safeDt, phase, dayNumber);
    const defenseDestroyed = this._stepEnemies(safeDt, corruption);
    const shots = this._stepTurrets(safeDt, safeRate);
    if (playerX !== undefined) {
      this._stepPlayerAutoShoot(safeDt, playerX, playerFacing, playerAutoShootMultiplier, shots);
    }
    this._stepDefenderPatrol(safeDt, safeBonus, shots);
    const slain = this._collectAndDespawnSlain();
    this._checkTownHeartDefeat();
    return this._buildResult(shots, slain, defenseDestroyed);
  }

  /**
   * Fires a manual slingshot pebble along `facing`, applying knockback and hit-flash.
   *
   * @param playerX Current player X coordinate.
   * @param facing Normalized facing sign (`1` right, `-1` left).
   * @param damage Damage inflicted on hit. Defaults to `balance.get('bowDamage')`.
   * @returns Hit descriptor if an enemy was in range, else `null`.
   * @throws Error Never thrown.
   * @example
   * const hit = combat.applyPlayerShot(player.getX(), player.getFacing());
   */
  public applyPlayerShot(
    playerX: number,
    facing: 1 | -1,
    damage = this.balance.get('bowDamage'),
  ): PlayerShotHit | null {
    if (this.isGameOver) return null;
    const targetEid = this._findEnemyInDirection(playerX, facing, this.balance.getWorld('bowRangeTiles'));
    if (targetEid === -1) return null;
    const killed = this._damageEnemy(targetEid, damage, playerX, this.balance.getWorld('bowKnockbackTiles'));
    const hitX = this.ecs.getComponents().Position.x[targetEid] ?? playerX;
    if (killed) this.ecs.despawnEntity(targetEid);
    return { x: hitX, killed };
  }

  /**
   * Bowls moving Havok road crates through enemies along the road, applying impact damage and knockback.
   *
   * @param crates Active fast-moving crate positions and horizontal velocities.
   * @returns List of enemies defeated by crate impacts.
   * @throws Error Never thrown.
   * @example
   * const slain = combat.applyPropImpacts([{ x: 9.2, vx: 4.5 }]);
   */
  public applyPropImpacts(
    crates: ReadonlyArray<{ readonly x: number; readonly vx: number }>,
  ): SlainEnemyEvent[] {
    if (this.isGameOver || crates.length === 0) return [];
    const slain: SlainEnemyEvent[] = [];
    for (const crate of crates) {
      this._hitEnemiesWithCrate(crate.x, crate.vx, slain);
    }
    return slain;
  }

  /**
   * Detects the side (`-1` left, `1` right) of the nearest enemy threatening `playerX` within `radius`.
   *
   * @param playerX Current player X coordinate.
   * @param radius Threat detection radius around `playerX` (defaults to `balance.getWorld('autoDodgeRadiusTiles')`).
   * @returns `-1` if threat is left, `1` if threat is right, or `0` when clear.
   * @throws Error Never thrown.
   * @example
   * const side = combat.findIncomingThreatSide(player.getX());
   */
  public findIncomingThreatSide(
    playerX: number,
    radius = this.balance.getWorld('autoDodgeRadiusTiles'),
  ): -1 | 1 | 0 {
    const eid = this._findNearestLivingEnemy(playerX, radius);
    if (eid === -1) return 0;
    return (this.ecs.getComponents().Position.x[eid] ?? playerX) >= playerX ? 1 : -1;
  }

  /**
   * Checks whether any living enemy is within `radius` meters of world X `x`.
   *
   * @param x World X probe center (e.g. a damaged defense plinth).
   * @param radius Maximum horizontal distance considered unsafe.
   * @returns `true` if a living enemy lies within `radius` of `x`.
   * @throws Error Never thrown.
   * @example
   * if (!combat.hasEnemyNear(-20, 5)) dispatchEngineerRepair();
   */
  public hasEnemyNear(x: number, radius: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(radius) || radius < 0) return false;
    return this._findNearestLivingEnemy(x, radius) !== -1;
  }

  /**
   * Returns total enemies scheduled for night wave `dayNumber`.
   *
   * @param dayNumber 1-based day index.
   * @returns Total enemy count (`28` Day 1 → `400` Day 5, `+100` per day beyond).
   * @throws Error Never thrown.
   * @example
   * expect(combat.getWaveTotalForDay(5)).toBe(400);
   */
  public getWaveTotalForDay(dayNumber: number): number {
    const idx = Math.max(1, Math.floor(dayNumber)) - 1;
    return WAVE_COUNTS_BY_DAY[idx] ?? 400 + (idx - (WAVE_COUNTS_BY_DAY.length - 1)) * 100;
  }

  /**
   * Returns how many enemies from the active night wave have not yet spawned.
   *
   * @returns Pending spawn count.
   * @throws Error Never thrown.
   * @example
   * const pending = combat.getRemainingToSpawn();
   */
  public getRemainingToSpawn(): number {
    return this.remainingToSpawn;
  }

  /**
   * Restores hit points to the Town Heart up to `TOWN_HEART_MAX_HP`.
   *
   * @param amount Non-negative HP to restore.
   * @throws Error Never thrown.
   * @example
   * combat.healTownHeart(20);
   */
  public healTownHeart(amount: number): void {
    if (this.isGameOver) return;
    const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    this.townHeartHp = Math.min(TOWN_HEART_MAX_HP, this.townHeartHp + safeAmount);
  }

  /**
   * Returns current Town Heart HP.
   *
   * @returns Current HP in `[0, TOWN_HEART_MAX_HP]`.
   * @throws Error Never thrown.
   * @example
   * const hp = combat.getHeartHp();
   */
  public getHeartHp(): number {
    return this.townHeartHp;
  }

  /**
   * Returns count of living night enemies currently in bitECS.
   *
   * @returns Active enemy count.
   * @throws Error Never thrown.
   * @example
   * const count = combat.getActiveEnemyCount();
   */
  public getActiveEnemyCount(): number {
    return this.ecs.queryEnemies().length;
  }

  /**
   * Returns whether the Town Heart has fallen (`hp <= 0`).
   *
   * @returns `true` after game over until `reset()` is called.
   * @throws Error Never thrown.
   * @example
   * if (combat.isOver()) showRestartBanner();
   */
  public isOver(): boolean {
    return this.isGameOver;
  }

  /**
   * Resets wave state, Town Heart HP, cooldowns, Defender patrol, and clears all enemies.
   *
   * @throws Error Never thrown.
   * @example
   * combat.reset();
   */
  public reset(): void {
    this.slainEids.length = 0;
    for (const eid of this.ecs.queryEnemies()) {
      if (this.ecs.isEntityAlive(eid)) this.slainEids.push(eid);
    }
    for (const eid of this.slainEids) {
      if (this.ecs.isEntityAlive(eid)) this.ecs.despawnEntity(eid);
    }
    this.slainEids.length = 0;
    this.townHeartHp = TOWN_HEART_MAX_HP;
    this.activeWaveDay = 0;
    this.remainingToSpawn = 0;
    this.spawnTimer = 0;
    this.spawnIndex = 0;
    this.defenderX = WaveCombatSystem.DEFENDER_HOME_X;
    this.defenderCooldown = 0;
    this.playerShootCooldown = 0;
    this.isGameOver = false;
  }

  private _checkTownHeartDefeat(): void {
    if (this.townHeartHp > 0) return;
    this.townHeartHp = 0;
    this.isGameOver = true;
  }

  private _tickSpawning(dt: number, phase: DayPhase, dayNumber: number): void {
    if (phase === 'night' && dayNumber > this.activeWaveDay) {
      this.activeWaveDay = dayNumber;
      this.remainingToSpawn = this.getWaveTotalForDay(dayNumber);
      this.spawnTimer = 0.2;
    }
    if (phase !== 'night' || this.remainingToSpawn <= 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const total = this.getWaveTotalForDay(dayNumber);
    this.spawnTimer = Math.max(0.06, 1.15 / Math.sqrt(total / 8));
    const burst = dayNumber >= 5 ? 5 : dayNumber >= 4 ? 4 : dayNumber >= 3 ? 3 : 2;
    const batch = Math.min(this.remainingToSpawn, burst);
    for (let i = 0; i < batch; i++) this._spawnNextEnemy(dayNumber);
    this.remainingToSpawn -= batch;
  }

  private _spawnNextEnemy(dayNumber: number): void {
    const idx = this.spawnIndex++;
    const side: -1 | 1 = idx % 2 === 0 ? -1 : 1;
    const spec = this._pickEnemySpec(idx, dayNumber);
    const jitter = (idx % 4) * 0.45;
    const z = ((idx % 5) - 2) * 0.24;
    this.ecs.spawnEnemyEntity(spec.kind, side * (WaveCombatSystem.SPAWN_ABS_X - jitter), side, spec.hp, spec.speed, z);
  }

  private _pickEnemySpec(idx: number, dayNumber: number): { kind: number; hp: number; speed: number } {
    if (idx % 5 === 4) {
      return { kind: ENEMY_KIND.GLOOM_BRUTE, hp: this.balance.get('bruteHp'), speed: this.balance.getWorld('bruteSpeedTiles') };
    }
    if (dayNumber >= 2 && idx % 3 === 1) {
      return { kind: ENEMY_KIND.GLOOM_RUSHER, hp: this.balance.get('rusherHp'), speed: this.balance.getWorld('rusherSpeedTiles') };
    }
    return { kind: ENEMY_KIND.GLOOM_SPRITE, hp: this.balance.get('spriteHp'), speed: this.balance.getWorld('spriteSpeedTiles') };
  }

  private _stepEnemies(dt: number, corruption: CorruptionField): boolean {
    const { Position, Enemy, Defense } = this.ecs.getComponents();
    let defenseDestroyed = false;
    for (const eid of this.ecs.queryEnemies()) {
      Enemy.hitFlash[eid] = Math.max(0, (Enemy.hitFlash[eid] ?? 0) - dt);
      const x = Position.x[eid] ?? 0;
      const blockerEid = this._findBlockingDefense(x);
      if (blockerEid !== -1) {
        if (this._attackDefense(eid, blockerEid, dt, Enemy, Defense)) defenseDestroyed = true;
        continue;
      }
      if (Math.abs(x) <= WaveCombatSystem.HEART_HIT_RADIUS) {
        this._attackHeart(eid, dt, Enemy, corruption);
        continue;
      }
      Position.x[eid] = x + (x < 0 ? 1 : -1) * (Enemy.speed[eid] ?? this.balance.getWorld('spriteSpeedTiles')) * dt;
    }
    return defenseDestroyed;
  }

  private _findBlockingDefense(enemyX: number): number {
    const { Position, Defense } = this.ecs.getComponents();
    for (const defEid of this.ecs.queryDefenses()) {
      if ((Defense.kind[defEid] ?? DEFENSE_KIND.EMPTY) === DEFENSE_KIND.EMPTY) continue;
      if (Math.abs((Position.x[defEid] ?? 0) - enemyX) <= WaveCombatSystem.STRUCTURE_HIT_RADIUS) return defEid;
    }
    return -1;
  }

  private _enemyCombatProfile(kind: number): { damage: number; cooldown: number } {
    if (kind === ENEMY_KIND.GLOOM_BRUTE) return { damage: ENEMY_BRUTE_DAMAGE, cooldown: ENEMY_BRUTE_COOLDOWN };
    if (kind === ENEMY_KIND.GLOOM_RUSHER) return { damage: ENEMY_RUSHER_DAMAGE, cooldown: ENEMY_RUSHER_COOLDOWN };
    return { damage: ENEMY_SPRITE_DAMAGE, cooldown: ENEMY_SPRITE_COOLDOWN };
  }

  private _attackDefense(
    enemyEid: number,
    defEid: number,
    dt: number,
    Enemy: { readonly kind: Uint8Array; readonly attackCooldown: Float32Array },
    Defense: { readonly kind: Uint8Array; readonly level: Uint8Array; readonly hp: Float32Array; readonly maxHp: Float32Array; readonly fireCooldown: Float32Array },
  ): boolean {
    const cd = (Enemy.attackCooldown[enemyEid] ?? 0) - dt;
    if (cd > 0) {
      Enemy.attackCooldown[enemyEid] = cd;
      return false;
    }
    const profile = this._enemyCombatProfile(Enemy.kind[enemyEid] ?? ENEMY_KIND.GLOOM_SPRITE);
    Enemy.attackCooldown[enemyEid] = profile.cooldown;
    const defKind = Defense.kind[defEid] ?? DEFENSE_KIND.EMPTY;
    const defLevel = Defense.level[defEid] ?? 1;
    const nextHp = (Defense.hp[defEid] ?? 0) - profile.damage;
    Defense.hp[defEid] = Math.max(0, nextHp);
    if (defKind === DEFENSE_KIND.BARRICADE && defLevel >= 2) this._applyBarricadeThorns(enemyEid, defEid, defLevel);
    return nextHp <= 0 ? this._clearDestroyedDefense(defEid, Defense) : false;
  }

  private _clearDestroyedDefense(
    defEid: number,
    Defense: { readonly kind: Uint8Array; readonly level: Uint8Array; readonly maxHp: Float32Array; readonly fireCooldown: Float32Array },
  ): true {
    Defense.kind[defEid] = DEFENSE_KIND.EMPTY;
    Defense.level[defEid] = 0;
    Defense.maxHp[defEid] = 0;
    Defense.fireCooldown[defEid] = 0;
    return true;
  }

  private _applyBarricadeThorns(enemyEid: number, defEid: number, level: number): void {
    const thorns = this.balance.get('barricadeThornsDamage');
    const pulse = level >= 3 ? this.balance.getWorld('barricadePulseKnockbackTiles') : 0;
    const defX = this.ecs.getComponents().Position.x[defEid] ?? 0;
    if (thorns > 0 || pulse > 0) this._damageEnemy(enemyEid, thorns, defX, pulse);
  }

  private _attackHeart(
    enemyEid: number,
    dt: number,
    Enemy: { readonly kind: Uint8Array; readonly side: Int8Array; readonly attackCooldown: Float32Array },
    corruption: CorruptionField,
  ): void {
    const cd = (Enemy.attackCooldown[enemyEid] ?? 0) - dt;
    if (cd > 0) {
      Enemy.attackCooldown[enemyEid] = cd;
      return;
    }
    const profile = this._enemyCombatProfile(Enemy.kind[enemyEid] ?? ENEMY_KIND.GLOOM_SPRITE);
    Enemy.attackCooldown[enemyEid] = profile.cooldown;
    this.townHeartHp = Math.max(0, this.townHeartHp - profile.damage);
    corruption.encroachBorder((Enemy.side[enemyEid] ?? -1) < 0 ? 'left' : 'right', ENEMY_BREACH_BORDER_PULL);
  }

  private _stepTurrets(dt: number, rateMultiplier: number): CombatShotEvent[] {
    const { Position, Defense } = this.ecs.getComponents();
    const shots: CombatShotEvent[] = [];
    const range = this.balance.getWorld('turretRangeTiles');
    for (const defEid of this.ecs.queryDefenses()) {
      if ((Defense.kind[defEid] ?? DEFENSE_KIND.EMPTY) !== DEFENSE_KIND.TURRET) continue;
      const cd = Math.max(0, (Defense.fireCooldown[defEid] ?? 0) - dt * rateMultiplier);
      Defense.fireCooldown[defEid] = cd;
      if (cd > 0) continue;
      this._fireTurret(defEid, Position.x[defEid] ?? 0, range, Defense, shots);
    }
    return shots;
  }

  private _fireTurret(
    defEid: number,
    fromX: number,
    range: number,
    Defense: { readonly level: Uint8Array; readonly fireCooldown: Float32Array },
    shots: CombatShotEvent[],
  ): void {
    const level = Defense.level[defEid] ?? 1;
    const enemyEid = level >= 3 ? this._findSmartTurretTarget(fromX, range) : this._findNearestLivingEnemy(fromX, range);
    if (enemyEid === -1) return;
    this.ecs.setTurretTarget(defEid, enemyEid);
    const dmg = this.balance.get('turretDamage') * (level >= 3 ? 1.75 : level >= 2 ? 1.5 : 1);
    this._damageEnemy(enemyEid, dmg, fromX, TURRET_SHOT_KNOCKBACK);
    Defense.fireCooldown[defEid] = this.balance.get('turretCooldownSec');
    const primaryX = this.ecs.getComponents().Position.x[enemyEid] ?? fromX;
    shots.push({ fromX, toX: primaryX, source: 'turret' });
    if (level >= 3) this._chainSmartTurretSplash(enemyEid, primaryX, Math.round(dmg * 0.6), shots);
  }

  private _findSmartTurretTarget(originX: number, maxRange: number): number {
    const { Position, Enemy } = this.ecs.getComponents();
    let bestBrute = -1;
    let bestDist = maxRange;
    for (const eid of this.ecs.queryEnemies()) {
      if (!this.ecs.isEntityAlive(eid) || (Enemy.hp[eid] ?? 0) <= 0) continue;
      if (Enemy.kind[eid] !== ENEMY_KIND.GLOOM_BRUTE) continue;
      const dist = Math.abs((Position.x[eid] ?? 0) - originX);
      if (dist <= bestDist) {
        bestDist = dist;
        bestBrute = eid;
      }
    }
    return bestBrute !== -1 ? bestBrute : this._findNearestLivingEnemy(originX, maxRange);
  }

  private _chainSmartTurretSplash(
    primaryEid: number,
    primaryX: number,
    splashDmg: number,
    shots: CombatShotEvent[],
  ): void {
    const { Position, Enemy } = this.ecs.getComponents();
    const splashRadius = this.balance.getWorld('smartTurretSplashTiles');
    let hits = 0;
    for (const eid of this.ecs.queryEnemies()) {
      if (hits >= 2) break;
      if (eid === primaryEid || !this.ecs.isEntityAlive(eid) || (Enemy.hp[eid] ?? 0) <= 0) continue;
      if (Math.abs((Position.x[eid] ?? 0) - primaryX) > splashRadius) continue;
      this._damageEnemy(eid, splashDmg, primaryX, TURRET_SHOT_KNOCKBACK * 0.5);
      shots.push({ fromX: primaryX, toX: Position.x[eid] ?? primaryX, source: 'turret' });
      hits += 1;
    }
  }

  private _stepPlayerAutoShoot(
    dt: number,
    playerX: number,
    facing: 1 | -1,
    multiplier: number,
    shots: CombatShotEvent[],
  ): void {
    const safeMult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    this.playerShootCooldown = Math.max(0, this.playerShootCooldown - dt * safeMult);
    if (this.playerShootCooldown > 0) return;
    const enemyEid = this._findEnemyInDirection(playerX, facing, this.balance.getWorld('bowRangeTiles'));
    if (enemyEid === -1) return;
    this._damageEnemy(enemyEid, this.balance.get('bowDamage'), playerX, this.balance.getWorld('bowKnockbackTiles'));
    this.playerShootCooldown = this.balance.get('bowCooldownSec');
    shots.push({ fromX: playerX, toX: this.ecs.getComponents().Position.x[enemyEid] ?? playerX, source: 'player' });
  }

  private _damageEnemy(enemyEid: number, damage: number, originX: number, knockback: number): boolean {
    const { Position, Enemy } = this.ecs.getComponents();
    const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
    const safeKnockback = Number.isFinite(knockback) ? knockback : 0;
    const nextHp = (Enemy.hp[enemyEid] ?? 0) - safeDamage;
    Enemy.hp[enemyEid] = nextHp;
    Enemy.hitFlash[enemyEid] = ENEMY_HIT_FLASH_SECONDS;
    const enemyX = Position.x[enemyEid] ?? originX;
    const pushDir = enemyX === originX ? (Enemy.side[enemyEid] || 1) : enemyX > originX ? 1 : -1;
    const pushScale = Enemy.kind[enemyEid] === ENEMY_KIND.GLOOM_BRUTE ? 0.25 : 1;
    Position.x[enemyEid] = enemyX + pushDir * safeKnockback * pushScale;
    return nextHp <= 0;
  }

  private _hitEnemiesWithCrate(crateX: number, crateVx: number, slain: SlainEnemyEvent[]): void {
    const { Position, Enemy } = this.ecs.getComponents();
    const originX = crateX - Math.sign(crateVx || 1) * 0.5;
    const hitRadius = this.balance.getWorld('crateImpactRadiusTiles');
    const knockback = this.balance.getWorld('crateKnockbackTiles');
    this.slainEids.length = 0;
    for (const eid of this.ecs.queryEnemies()) {
      if (!this.ecs.isEntityAlive(eid) || (Enemy.hp[eid] ?? 0) <= 0) continue;
      if (Math.abs((Position.x[eid] ?? 0) - crateX) > hitRadius) continue;
      if (!this._damageEnemy(eid, ROAD_CRATE_IMPACT_DAMAGE, originX, knockback)) continue;
      slain.push({ eid, x: Position.x[eid] ?? crateX, kind: Enemy.kind[eid] ?? 0 });
      this.slainEids.push(eid);
    }
    for (const eid of this.slainEids) {
      if (this.ecs.isEntityAlive(eid)) this.ecs.despawnEntity(eid);
    }
  }

  private _stepDefenderPatrol(
    dt: number,
    bonusDamage: number,
    shots: CombatShotEvent[],
  ): void {
    this.defenderCooldown = Math.max(0, this.defenderCooldown - dt);
    const guardRadius = this.balance.getWorld('bramGuardRadiusTiles');
    const spearRange = this.balance.getWorld('bramSpearRangeTiles');
    const targetEid = this._findNearestLivingEnemy(0, guardRadius + spearRange);
    if (targetEid === -1) {
      this._moveDefenderToward(WaveCombatSystem.DEFENDER_HOME_X, dt);
      return;
    }
    const enemyX = this.ecs.getComponents().Position.x[targetEid] ?? 0;
    this._moveDefenderToward(Math.max(-guardRadius, Math.min(guardRadius, enemyX)), dt);
    if (Math.abs(enemyX - this.defenderX) > spearRange || this.defenderCooldown > 0) return;
    this._executeDefenderSpearThrust(enemyX, spearRange, bonusDamage, shots);
  }

  private _executeDefenderSpearThrust(
    enemyX: number,
    spearRange: number,
    bonusDamage: number,
    shots: CombatShotEvent[],
  ): void {
    const { Position, Enemy } = this.ecs.getComponents();
    const delta = enemyX - this.defenderX;
    const thrustDir = Math.abs(delta) < 0.05 ? (enemyX >= 0 ? 1 : -1) : (delta > 0 ? 1 : -1);
    let hitAny = false;
    for (const eid of this.ecs.queryEnemies()) {
      if (!this.ecs.isEntityAlive(eid) || (Enemy.hp[eid] ?? 0) <= 0) continue;
      const ex = Position.x[eid] ?? 0;
      if ((ex - this.defenderX) * thrustDir < -0.4 || Math.abs(ex - this.defenderX) > spearRange) continue;
      this._strikeWithSpear(eid, bonusDamage);
      hitAny = true;
    }
    this.defenderCooldown = this.balance.get('bramSpearCooldownSec');
    if (hitAny) {
      shots.push({ fromX: this.defenderX, toX: this.defenderX + thrustDir * spearRange, source: 'defender' });
    }
  }

  private _strikeWithSpear(eid: number, bonusDamage: number): void {
    const isBrute = this.ecs.getComponents().Enemy.kind[eid] === ENEMY_KIND.GLOOM_BRUTE;
    const baseDmg = this.balance.get('bramSpearDamage');
    const dmg = isBrute ? Math.round((baseDmg + bonusDamage) * 0.5) : baseDmg + bonusDamage;
    const knockback = isBrute ? 0 : this.balance.getWorld('bramSpearKnockbackTiles');
    this._damageEnemy(eid, dmg, 0, knockback);
  }

  private _moveDefenderToward(targetX: number, dt: number): void {
    const dx = targetX - this.defenderX;
    const speed = this.balance.getWorld('npcMoveSpeedTiles');
    this.defenderX += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
  }

  private _findNearestLivingEnemy(originX: number, maxRange: number): number {
    const { Position, Enemy } = this.ecs.getComponents();
    let bestEid = -1;
    let bestDist = maxRange;
    for (const eid of this.ecs.queryEnemies()) {
      if (!this.ecs.isEntityAlive(eid) || (Enemy.hp[eid] ?? 0) <= 0) continue;
      const dist = Math.abs((Position.x[eid] ?? 0) - originX);
      if (dist <= bestDist) {
        bestDist = dist;
        bestEid = eid;
      }
    }
    return bestEid;
  }

  private _findEnemyInDirection(originX: number, facing: 1 | -1, maxRange: number): number {
    const { Position, Enemy } = this.ecs.getComponents();
    let bestEid = -1;
    let bestDist = maxRange;
    for (const eid of this.ecs.queryEnemies()) {
      if (!this.ecs.isEntityAlive(eid) || (Enemy.hp[eid] ?? 0) <= 0) continue;
      const delta = (Position.x[eid] ?? 0) - originX;
      const dist = Math.abs(delta);
      if (delta * facing >= 0 && dist <= bestDist) {
        bestDist = dist;
        bestEid = eid;
      }
    }
    return bestEid;
  }

  private _collectAndDespawnSlain(): SlainEnemyEvent[] {
    const { Position, Enemy } = this.ecs.getComponents();
    this.slainEids.length = 0;
    const slain: SlainEnemyEvent[] = [];
    for (const eid of this.ecs.queryEnemies()) {
      if (this.ecs.isEntityAlive(eid) && (Enemy.hp[eid] ?? 0) <= 0) {
        this.slainEids.push(eid);
        slain.push({ eid, x: Position.x[eid] ?? 0, kind: Enemy.kind[eid] ?? 0 });
      }
    }
    for (const eid of this.slainEids) {
      if (this.ecs.isEntityAlive(eid)) this.ecs.despawnEntity(eid);
    }
    return slain;
  }

  private _buildResult(
    shots: readonly CombatShotEvent[],
    slain: readonly SlainEnemyEvent[],
    defenseDestroyed: boolean,
  ): WaveCombatFrameResult {
    const activeEnemies = this.ecs.queryEnemies().length;
    return {
      shots,
      slain,
      defenseDestroyed,
      heartHp: this.townHeartHp,
      heartMaxHp: TOWN_HEART_MAX_HP,
      activeEnemies,
      totalRemaining: activeEnemies + this.remainingToSpawn,
      gameOver: this.isGameOver,
      defenderPatrolX: activeEnemies > 0 ? this.defenderX : null,
    };
  }
}
