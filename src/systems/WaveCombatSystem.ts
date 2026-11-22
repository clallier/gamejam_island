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
  ENEMY_SPRITE_COOLDOWN,
  ENEMY_SPRITE_DAMAGE,
  ENEMY_SPRITE_HP,
  ENEMY_SPRITE_SPEED,
  PLAYER_SHOT_DAMAGE,
  PLAYER_SHOT_RANGE,
  TOWN_HEART_MAX_HP,
  TURRET_BASE_COOLDOWN,
  TURRET_BASE_DAMAGE,
  TURRET_RANGE,
} from './constants.ts';

/**
 * Emitted when a built turret fires at an enemy entity.
 */
export interface TurretShotEvent {
  readonly fromX: number;
  readonly toX: number;
}

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
  readonly shots: readonly TurretShotEvent[];
  readonly slain: readonly SlainEnemyEvent[];
  readonly defenseDestroyed: boolean;
  readonly heartHp: number;
  readonly heartMaxHp: number;
  readonly activeEnemies: number;
  readonly gameOver: boolean;
  readonly defenderPatrolX: number | null;
}

/**
 * Coordinates night wave spawning, enemy approach & breaches, turret targeting,
 * Defender AI road patrols, player slingshot combat, and Town Heart HP via bitECS.
 */
export class WaveCombatSystem {
  private static readonly SPAWN_ABS_X = 54;
  private static readonly SPAWN_INTERVAL = 1.65;
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
   * Advances wave spawning, enemy movement, turret fire, and Defender patrol for one frame.
   *
   * @param dt Clamped frame delta in seconds.
   * @param phase Current solar `DayPhase`.
   * @param dayNumber Current integer day number.
   * @param turretFireRateMultiplier Speed multiplier unlocked by Pip (`>= 1`).
   * @param defenderDamageBonus Bonus strike damage unlocked by Bram Lv 3.
   * @param corruption Live `CorruptionField` pulled inward on Town Heart breaches.
   * @returns Immutable per-frame `WaveCombatFrameResult`.
   * @throws Error Never thrown during frame updates.
   * @example
   * const frame = combat.step(dt, timeSnap.phase, timeSnap.dayNumber, 1.25, 6, corruption);
   */
  public step(
    dt: number,
    phase: DayPhase,
    dayNumber: number,
    turretFireRateMultiplier: number,
    defenderDamageBonus: number,
    corruption: CorruptionField,
  ): WaveCombatFrameResult {
    if (this.isGameOver) return this._buildResult([], [], false, phase);
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const safeRate = Number.isFinite(turretFireRateMultiplier) ? Math.max(0, turretFireRateMultiplier) : 1;
    this._tickSpawning(safeDt, phase, dayNumber);
    const defenseDestroyed = this._stepEnemies(safeDt, corruption);
    const shots = this._stepTurrets(safeDt, safeRate);
    this._stepDefenderPatrol(safeDt, phase, defenderDamageBonus);
    const slain = this._collectAndDespawnSlain();
    if (this.townHeartHp <= 0) {
      this.townHeartHp = 0;
      this.isGameOver = true;
    }
    return this._buildResult(shots, slain, defenseDestroyed, phase);
  }

  /**
   * Fires a player slingshot pebble along `facing` and damages the nearest enemy ahead.
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
    const { Position, Enemy } = this.ecs.getComponents();
    const hitX = Position.x[targetEid] ?? playerX;
    const nextHp = (Enemy.hp[targetEid] ?? 0) - damage;
    Enemy.hp[targetEid] = nextHp;
    const killed = nextHp <= 0;
    if (killed) this.ecs.despawnEntity(targetEid);
    return { x: hitX, killed };
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
   * Resets wave state, Town Heart HP, Defender patrol position, and clears all enemies.
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
    this.isGameOver = false;
  }

  private _tickSpawning(dt: number, phase: DayPhase, dayNumber: number): void {
    if (phase === 'night' && dayNumber > this.activeWaveDay) {
      this.activeWaveDay = dayNumber;
      this.remainingToSpawn = 3 + dayNumber * 2;
      this.spawnTimer = 0.2;
    }
    if (phase !== 'night' || this.remainingToSpawn <= 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = WaveCombatSystem.SPAWN_INTERVAL;
    this.remainingToSpawn -= 1;
    this._spawnNextEnemy();
  }

  private _spawnNextEnemy(): void {
    const idx = this.spawnIndex++;
    const side: -1 | 1 = idx % 2 === 0 ? -1 : 1;
    const isBrute = idx % 3 === 2;
    const kind = isBrute ? ENEMY_KIND.GLOOM_BRUTE : ENEMY_KIND.GLOOM_SPRITE;
    const hp = isBrute ? ENEMY_BRUTE_HP : ENEMY_SPRITE_HP;
    const speed = isBrute ? ENEMY_BRUTE_SPEED : ENEMY_SPRITE_SPEED;
    this.ecs.spawnEnemyEntity(kind, side * WaveCombatSystem.SPAWN_ABS_X, side, hp, speed);
  }

  private _stepEnemies(dt: number, corruption: CorruptionField): boolean {
    const { Position, Enemy, Defense } = this.ecs.getComponents();
    let defenseDestroyed = false;
    for (const eid of this.ecs.queryEnemies()) {
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
      const dir = x < 0 ? 1 : -1;
      Position.x[eid] = x + dir * (Enemy.speed[eid] ?? ENEMY_SPRITE_SPEED) * dt;
    }
    return defenseDestroyed;
  }

  private _findBlockingDefense(enemyX: number): number {
    const { Position, Defense } = this.ecs.getComponents();
    for (const defEid of this.ecs.queryDefenses()) {
      if ((Defense.kind[defEid] ?? DEFENSE_KIND.EMPTY) === DEFENSE_KIND.EMPTY) continue;
      if (Math.abs((Position.x[defEid] ?? 0) - enemyX) <= WaveCombatSystem.STRUCTURE_HIT_RADIUS) {
        return defEid;
      }
    }
    return -1;
  }

  private _attackDefense(
    enemyEid: number,
    defEid: number,
    dt: number,
    Enemy: { readonly kind: Uint8Array; readonly attackCooldown: Float32Array },
    Defense: {
      readonly kind: Uint8Array;
      readonly level: Uint8Array;
      readonly hp: Float32Array;
      readonly maxHp: Float32Array;
      readonly fireCooldown: Float32Array;
    },
  ): boolean {
    const cd = (Enemy.attackCooldown[enemyEid] ?? 0) - dt;
    if (cd > 0) {
      Enemy.attackCooldown[enemyEid] = cd;
      return false;
    }
    const brute = Enemy.kind[enemyEid] === ENEMY_KIND.GLOOM_BRUTE;
    Enemy.attackCooldown[enemyEid] = brute ? ENEMY_BRUTE_COOLDOWN : ENEMY_SPRITE_COOLDOWN;
    const nextHp = (Defense.hp[defEid] ?? 0) - (brute ? ENEMY_BRUTE_DAMAGE : ENEMY_SPRITE_DAMAGE);
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
    const brute = Enemy.kind[enemyEid] === ENEMY_KIND.GLOOM_BRUTE;
    Enemy.attackCooldown[enemyEid] = brute ? ENEMY_BRUTE_COOLDOWN : ENEMY_SPRITE_COOLDOWN;
    this.townHeartHp = Math.max(0, this.townHeartHp - (brute ? ENEMY_BRUTE_DAMAGE : ENEMY_SPRITE_DAMAGE));
    const flank = (Enemy.side[enemyEid] ?? -1) < 0 ? 'left' : 'right';
    corruption.encroachBorder(flank, ENEMY_BREACH_BORDER_PULL);
  }

  private _stepTurrets(dt: number, rateMultiplier: number): TurretShotEvent[] {
    const { Position, Defense, Enemy } = this.ecs.getComponents();
    const shots: TurretShotEvent[] = [];
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
      Enemy.hp[enemyEid] = (Enemy.hp[enemyEid] ?? 0) - dmg;
      Defense.fireCooldown[defEid] = TURRET_BASE_COOLDOWN;
      shots.push({ fromX, toX: Position.x[enemyEid] ?? fromX });
    }
    return shots;
  }

  private _stepDefenderPatrol(dt: number, phase: DayPhase, bonusDamage: number): void {
    this.defenderCooldown = Math.max(0, this.defenderCooldown - dt);
    const targetEid = phase === 'night' ? this._findNearestLivingEnemy(this.defenderX, 60) : -1;
    if (targetEid === -1) {
      const dxHome = WaveCombatSystem.DEFENDER_HOME_X - this.defenderX;
      this.defenderX += Math.sign(dxHome) * Math.min(Math.abs(dxHome), DEFENDER_PATROL_SPEED * dt);
      return;
    }
    const { Position, Enemy } = this.ecs.getComponents();
    const dx = (Position.x[targetEid] ?? 0) - this.defenderX;
    if (Math.abs(dx) > DEFENDER_ATTACK_RANGE) {
      this.defenderX += Math.sign(dx) * Math.min(Math.abs(dx), DEFENDER_PATROL_SPEED * dt);
      return;
    }
    if (this.defenderCooldown > 0) return;
    Enemy.hp[targetEid] = (Enemy.hp[targetEid] ?? 0) - (DEFENDER_ATTACK_DAMAGE + bonusDamage);
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
      const inFront = delta * facing >= -0.75;
      const dist = Math.abs(delta);
      if (inFront && dist <= bestDist) {
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
      if (!this.ecs.isEntityAlive(eid)) continue;
      if ((Enemy.hp[eid] ?? 0) <= 0) {
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
    shots: readonly TurretShotEvent[],
    slain: readonly SlainEnemyEvent[],
    defenseDestroyed: boolean,
    phase: DayPhase,
  ): WaveCombatFrameResult {
    return {
      shots,
      slain,
      defenseDestroyed,
      heartHp: this.townHeartHp,
      heartMaxHp: TOWN_HEART_MAX_HP,
      activeEnemies: this.ecs.queryEnemies().length,
      gameOver: this.isGameOver,
      defenderPatrolX: phase === 'night' && this.ecs.queryEnemies().length > 0 ? this.defenderX : null,
    };
  }
}
