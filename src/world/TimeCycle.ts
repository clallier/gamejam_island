import {
  DAY_CYCLE_SECONDS,
  type DayPhase,
  PHASE_DAY_END,
  PHASE_DUSK_END,
  PHASE_NIGHT_END,
} from './constants.ts';

export interface TimeSnapshot {
  readonly dayNumber: number;
  readonly normalizedTime: number;
  readonly phase: DayPhase;
  readonly nightFactor: number;
  readonly sunElevation: number;
  readonly timeScale: number;
}

/**
 * Deterministic day/dusk/night/dawn clock driving lighting and wave cadence.
 *
 * Maps elapsed seconds into a normalized `[0, 1)` solar cycle, exposes smooth
 * `nightFactor` blending for shaders/lights, and allows instant phase jumps.
 */
export class TimeCycle {
  private static readonly PHASE_MIDPOINTS: Record<DayPhase, number> = {
    day: 0.22,
    dusk: 0.54,
    night: 0.74,
    dawn: 0.94,
  };

  private dayNumber = 1;
  private normalizedTime: number;
  private timeScale = 1;
  private readonly cycleDurationSeconds: number;

  /**
   * Initializes a new cycle clock.
   *
   * @param initialNormalizedTime Starting cycle fraction in `[0, 1)`. Defaults to `0.22` (bright morning).
   * @param cycleDurationSeconds Total real-time seconds per full day. Defaults to `DAY_CYCLE_SECONDS`.
   * @throws {RangeError} When `cycleDurationSeconds` is not positive.
   * @example
   * const clock = new TimeCycle(0.22, 120);
   */
  public constructor(
    initialNormalizedTime = TimeCycle.PHASE_MIDPOINTS.day,
    cycleDurationSeconds = DAY_CYCLE_SECONDS,
  ) {
    if (cycleDurationSeconds <= 0) {
      throw new RangeError('cycleDurationSeconds must be positive');
    }
    this.cycleDurationSeconds = cycleDurationSeconds;
    this.normalizedTime = this._wrapUnit(initialNormalizedTime);
  }

  /**
   * Advances the solar clock by a frame delta in seconds.
   *
   * @param deltaSeconds Frame duration in seconds (clamped to >= 0).
   * @returns Updated immutable snapshot of the time state.
   * @example
   * const snap = clock.advance(0.016);
   */
  public advance(deltaSeconds: number): TimeSnapshot {
    const safeDelta = Math.max(0, deltaSeconds) * this.timeScale;
    const next = this.normalizedTime + safeDelta / this.cycleDurationSeconds;
    if (next >= 1) {
      this.dayNumber += Math.floor(next);
    }
    this.normalizedTime = this._wrapUnit(next);
    return this.getSnapshot();
  }

  /**
   * Adjusts playback speed multiplier (0 pauses automatic passage).
   *
   * @param scale Non-negative multiplier applied to `deltaSeconds`.
   * @returns Nothing.
   * @example
   * clock.setTimeScale(2);
   */
  public setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
  }

  /**
   * Jumps immediately to the midpoint of a target phase for preview or testing.
   *
   * @param phase Target phase (`'day' | 'dusk' | 'night' | 'dawn'`).
   * @returns Updated immutable snapshot of the time state.
   * @example
   * const nightSnap = clock.jumpToPhase('night');
   */
  public jumpToPhase(phase: DayPhase): TimeSnapshot {
    this.normalizedTime = TimeCycle.PHASE_MIDPOINTS[phase];
    return this.getSnapshot();
  }

  /**
   * Computes a read-only view of the current solar phase and lighting curves.
   *
   * @returns Current `TimeSnapshot`.
   * @example
   * const { phase, nightFactor } = clock.getSnapshot();
   */
  public getSnapshot(): TimeSnapshot {
    return {
      dayNumber: this.dayNumber,
      normalizedTime: this.normalizedTime,
      phase: this._resolvePhase(this.normalizedTime),
      nightFactor: this._computeNightFactor(this.normalizedTime),
      sunElevation: this._computeSunElevation(this.normalizedTime),
      timeScale: this.timeScale,
    };
  }

  private _wrapUnit(value: number): number {
    const mod = value % 1;
    return mod < 0 ? mod + 1 : mod;
  }

  private _resolvePhase(t: number): DayPhase {
    if (t < PHASE_DAY_END) return 'day';
    if (t < PHASE_DUSK_END) return 'dusk';
    if (t < PHASE_NIGHT_END) return 'night';
    return 'dawn';
  }

  private _computeNightFactor(t: number): number {
    if (t < PHASE_DAY_END) return 0;
    if (t < PHASE_DUSK_END) {
      return this._smoothstep((t - PHASE_DAY_END) / (PHASE_DUSK_END - PHASE_DAY_END));
    }
    if (t < PHASE_NIGHT_END) return 1;
    return 1 - this._smoothstep((t - PHASE_NIGHT_END) / (1 - PHASE_NIGHT_END));
  }

  private _computeSunElevation(t: number): number {
    const shifted = this._wrapUnit(t + 0.06);
    return Math.sin(shifted * Math.PI * 2) * 0.5 + 0.5;
  }

  private _smoothstep(edge: number): number {
    const c = Math.max(0, Math.min(1, edge));
    return c * c * (3 - 2 * c);
  }
}
