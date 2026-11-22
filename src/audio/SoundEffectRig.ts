import { SFX_RECIPES, type SfxKey, type ToneStep } from './constants.ts';

export type AudioContextFactory = () => AudioContext | null;

/**
 * Dependency-free procedural Web Audio synthesizer generating chimes, wooden knocks,
 * and Patapon-style war drums without external sound files, safe in headless tests.
 */
export class SoundEffectRig {
  private static readonly MIN_GAIN = 0.0001;

  private readonly contextFactory: AudioContextFactory;
  private ctx: AudioContext | null = null;
  private muted = false;

  /**
   * Initializes the sound rig with an optional `AudioContext` factory.
   *
   * @param contextFactory Custom factory for testing or browser compatibility.
   * @throws Error Never thrown during construction.
   * @example
   * const audio = new SoundEffectRig();
   */
  public constructor(contextFactory: AudioContextFactory = SoundEffectRig._createBrowserAudioContext) {
    this.contextFactory = contextFactory;
  }

  /**
   * Schedules procedural oscillator steps for `key`, respecting mute and headless safety.
   *
   * @param key Semantic sound effect recipe key.
   * @throws Error Never thrown; ignores environments without Web Audio.
   * @example
   * audio.play('nightDrum');
   */
  public play(key: SfxKey): void {
    if (this.muted) return;
    const ctx = this._ensureContext();
    if (!ctx) return;
    const baseTime = ctx.currentTime;
    for (const step of SFX_RECIPES[key]) {
      this._scheduleTone(ctx, baseTime, step);
    }
  }

  /**
   * Sets explicit mute state without closing the underlying `AudioContext`.
   *
   * @param muted `true` to silence playback, `false` to re-enable.
   * @throws Error Never thrown.
   * @example
   * audio.setMuted(true);
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /**
   * Toggles mute state and returns the updated boolean flag.
   *
   * @returns `true` if now muted, `false` if audible.
   * @throws Error Never thrown.
   * @example
   * const muted = audio.toggleMute();
   */
  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * Reports whether sound effects are currently muted.
   *
   * @returns `true` when muted.
   * @throws Error Never thrown.
   * @example
   * expect(audio.isMuted()).toBe(false);
   */
  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Closes any open `AudioContext` and releases audio resources.
   *
   * @throws Error Never thrown.
   * @example
   * audio.dispose();
   */
  public dispose(): void {
    if (!this.ctx) return;
    const target = this.ctx;
    this.ctx = null;
    if (typeof target.close === 'function' && target.state !== 'closed') {
      void target.close();
    }
  }

  private _ensureContext(): AudioContext | null {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
    }
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private _scheduleTone(ctx: AudioContext, baseTime: number, step: ToneStep): void {
    const start = baseTime + (step.delay ?? 0);
    const end = start + step.duration;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = step.type;
    osc.frequency.setValueAtTime(step.freq, start);
    if (step.slideTo) osc.frequency.exponentialRampToValueAtTime(step.slideTo, end);
    gain.gain.setValueAtTime(step.gain, start);
    gain.gain.exponentialRampToValueAtTime(SoundEffectRig.MIN_GAIN, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
  }

  private static _createBrowserAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const win = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Ctor = win.AudioContext ?? win.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  }
}
