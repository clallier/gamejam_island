import { DEFENSE_KIND, ENEMY_KIND } from '../ecs/constants.ts';
import type { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import type { DayPhase } from '../world/constants.ts';
import type { CorruptionField } from '../world/CorruptionField.ts';
import {
  DEFENDER_ATTACK_COOLDOWN,
  DEFENDER_ATTACK_DAMAGE,
  DEFENDER_ATTACK_RANGE,
  DEFENDER_PATROL_SPEED,
  ENEMY_BREACH_BORDER_PULL,
  ENEMY_BRUTE_COOLDOWN,
  ENEMY_BRUTE_DAMAGE,
  ENEMY_BRUTE_HP,
  ENEMY_BRUTE_SPEED,
  ENEMY_HIT_FLASH_SECONDS,
  ENEMY_RUSHER_COOLDOWN,
  ENEMY_RUSHER_DAMAGE,
  ENEMY_RUSHER_HP,
  ENEMY_RUSHER_SPEED,
  ENEMY_SPRITE_COOLDOWN,
  ENEMY_SPRITE_DAMAGE,
  ENEMY_SPRITE_HP,
  ENEMY_SPRITE_SPEED,
  PLAYER_AUTOSHOOT_COOLDOWN,
  PLAYER_AUTOSHOOT_DAMAGE,
  PLAYER_AUTOSHOOT_RANGE,
  PLAYER_SHOT_DAMAGE,
  PLAYER_SHOT_KNOCKBACK,
  PLAYER_SHOT_RANGE,
  TOWN_HEART_MAX_HP,
  TURRET_BASE_COOLDOWN,
  TURRET_BASE_DAMAGE,
  TURRET_RANGE,
  TURRET_SHOT_KNOCKBACK,
  WAVE_COUNTS_BY_DAY,
} from './constants.ts';

/**
 * Emitted when a turret or player auto-shoot bolt strikes an enemy entity.
 */
export interface CombatShotEvent {
  readonly fromX: number;
  readonly toX: number;
  readonly source: 'turret' | 'player';
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
   * @throws Error Never thrown during construction.
   * @example
   * const combat = new WaveCombatSystem(ecs);
   */
  public constructor(ecs: IslandEcsWorld) {
    this.ecs = ecs;
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
    if (this.isGameOver) return this._buildResult([], [], false, phase);
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const safeRate = Number.isFinite(turretFireRateMultiplier) ? Math.max(0, turretFireRateMultiplier) : 1;
    this._tickSpawning(safeDt, phase, dayNumber);
    const defenseDestroyed = this._stepEnemies(safeDt, corruption);
    const shots = this._stepTurrets(safeDt, safeRate);
    if (playerX !== undefined) {
      this._stepPlayerAutoShoot(safeDt, playerX, playerFacing, playerAutoShootMultiplier, shots);
    }
    this._stepDefenderPatrol(safeDt, phase, defenderDamageBonus);
    const slain = this._collectAndDespawnSlain();
    this._checkTownHeartDefeat();
    return this._buildResult(shots, slain, defenseDestroyed, phase);
  }

  /**
   * Fires a manual slingshot pebble along `facing`, applying knockback and hit-flash.
   *
   * @param playerX Current player X coordinate.
   * @param facing Normalized facing sign (`1` right, `-1` left).
   * @param damage Damage inflicted on hit. Defaults to `PLAYER_SHOT_DAMAGE`.
   * @returns Hit descriptor if an enemy was in range, else `null`.
   * @throws Error Never thrown.
   * @example
   * const hit = combat.applyPlayerShot(player.getX(), player.getFacing());
   */
  public applyPlayerShot(
    playerX: number,
    facing: 1 | -1,
    damage = PLAYER_SHOT_DAMAGE,
  ): PlayerShotHit | null {
    if (this.isGameOver) return null;
    const targetEid = this._findEnemyInDirection(playerX, facing, PLAYER_SHOT_RANGE);
    if (targetEid === -1) return null;
    const killed = this._damageEnemy(targetEid, damage, playerX, PLAYER_SHOT_KNOCKBACK);
    const hitX = this.ecs.getComponents().Position.x[targetEid] ?? playerX;
    if (killed) this.ecs.despawnEntity(targetEid);
    return { x: hitX, killed };
  }

  /**
   * Returns total enemies scheduled for night wave `dayNumber`.
   *
   * @param dayNumber 1-based day index.
   * @returns Total enemy count (`12` Day 1 → `260` Day 5, `+60` per day beyond).
   * @throws Error Never thrown.
   * @example
   * expect(combat.getWaveTotalForDay(5)).toBe(260);
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
    this.townHeartHp = Math.min(TOWN_HEART_MAX_HP, this.townHeartHp + Math.max(0, amount));
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
      if (this.ecs.isEntityAlive(eid)) this.ecs.despawnEntity(eid);
    }
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
    if (idx % 5 === 4) return { kind: ENEMY_KIND.GLOOM_BRUTE, hp: ENEMY_BRUTE_HP, speed: ENEMY_BRUTE_SPEED };
    if (dayNumber >= 2 && idx % 3 === 1) {
      return { kind: ENEMY_KIND.GLOOM_RUSHER, hp: ENEMY_RUSHER_HP, speed: ENEMY_RUSHER_SPEED };
    }
    return { kind: ENEMY_KIND.GLOOM_SPRITE, hp: ENEMY_SPRITE_HP, speed: ENEMY_SPRITE_SPEED };
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
      Position.x[eid] = x + (x < 0 ? 1 : -1) * (Enemy.speed[eid] ?? ENEMY_SPRITE_SPEED) * dt;
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
    const nextHp = (Defense.hp[defEid] ?? 0) - profile.damage;
    Defense.hp[defEid] = Math.max(0, nextHp);
    if (nextHp > 0) return false;
    Defense.kind[defEid] = DEFENSE_KIND.EMPTY;
    Defense.level[defEid] = 0;
    Defense.maxHp[defEid] = 0;
    Defense.fireCooldown[defEid] = 0;
    return true;
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
    for (const defEid of this.ecs.queryDefenses()) {
      if ((Defense.kind[defEid] ?? DEFENSE_KIND.EMPTY) !== DEFENSE_KIND.TURRET) continue;
      const cd = Math.max(0, (Defense.fireCooldown[defEid] ?? 0) - dt * rateMultiplier);
      Defense.fireCooldown[defEid] = cd;
      if (cd > 0) continue;
      const fromX = Position.x[defEid] ?? 0;
      const enemyEid = this._findNearestLivingEnemy(fromX, TURRET_RANGE);
      if (enemyEid === -1) continue;
      this.ecs.setTurretTarget(defEid, enemyEid);
      const dmg = TURRET_BASE_DAMAGE * ((Defense.level[defEid] ?? 1) >= 2 ? 1.5 : 1);
      this._damageEnemy(enemyEid, dmg, fromX, TURRET_SHOT_KNOCKBACK);
      Defense.fireCooldown[defEid] = TURRET_BASE_COOLDOWN;
      shots.push({ fromX, toX: Position.x[enemyEid] ?? fromX, source: 'turret' });
    }
    return shots;
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
    const enemyEid = this._findEnemyInDirection(playerX, facing, PLAYER_AUTOSHOOT_RANGE);
    if (enemyEid === -1) return;
    this._damageEnemy(enemyEid, PLAYER_AUTOSHOOT_DAMAGE, playerX, PLAYER_SHOT_KNOCKBACK);
    this.playerShootCooldown = PLAYER_AUTOSHOOT_COOLDOWN;
    shots.push({ fromX: playerX, toX: this.ecs.getComponents().Position.x[enemyEid] ?? playerX, source: 'player' });
  }

  private _damageEnemy(enemyEid: number, damage: number, originX: number, knockback: number): boolean {
    const { Position, Enemy } = this.ecs.getComponents();
    const nextHp = (Enemy.hp[enemyEid] ?? 0) - damage;
    Enemy.hp[enemyEid] = nextHp;
    Enemy.hitFlash[enemyEid] = ENEMY_HIT_FLASH_SECONDS;
    const enemyX = Position.x[enemyEid] ?? originX;
    const pushDir = enemyX >= originX ? 1 : -1;
    const pushScale = Enemy.kind[enemyEid] === ENEMY_KIND.GLOOM_BRUTE ? 0.25 : 1;
    Position.x[enemyEid] = enemyX + pushDir * knockback * pushScale;
    return nextHp <= 0;
  }

  private _stepDefenderPatrol(dt: number, phase: DayPhase, bonusDamage: number): void {
    this.defenderCooldown = Math.max(0, this.defenderCooldown - dt);
    const targetEid = phase === 'night' ? this._findNearestLivingEnemy(this.defenderX, 60) : -1;
    if (targetEid === -1) {
      const dxHome = WaveCombatSystem.DEFENDER_HOME_X - this.defenderX;
      this.defenderX += Math.sign(dxHome) * Math.min(Math.abs(dxHome), DEFENDER_PATROL_SPEED * dt);
      return;
    }
    const dx = (this.ecs.getComponents().Position.x[targetEid] ?? 0) - this.defenderX;
    if (Math.abs(dx) > DEFENDER_ATTACK_RANGE) {
      this.defenderX += Math.sign(dx) * Math.min(Math.abs(dx), DEFENDER_PATROL_SPEED * dt);
      return;
    }
    if (this.defenderCooldown > 0) return;
    this._damageEnemy(targetEid, DEFENDER_ATTACK_DAMAGE + bonusDamage, this.defenderX, 0);
    this.defenderCooldown = DEFENDER_ATTACK_COOLDOWN;
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
    phase: DayPhase,
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
      defenderPatrolX: phase === 'night' && activeEnemies > 0 ? this.defenderX : null,
    };
  }
}
