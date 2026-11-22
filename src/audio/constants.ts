/**
 * @fileoverview Declarative Web Audio synthesizer recipes for Hearthline's tactile
 * chimes, harvesting knocks, Patapon-inspired night drums, and bond fanfares.
 */

export type SfxKey =
  | 'jump'
  | 'toss'
  | 'bowShot'
  | 'harvest'
  | 'pickup'
  | 'plant'
  | 'scrub'
  | 'build'
  | 'turretShot'
  | 'bond'
  | 'levelUp'
  | 'nightDrum'
  | 'dawnChime'
  | 'gameOver';

export interface ToneStep {
  readonly freq: number;
  readonly duration: number;
  readonly type: OscillatorType;
  readonly gain: number;
  readonly slideTo?: number;
  readonly delay?: number;
}

export const SFX_RECIPES: Record<SfxKey, readonly ToneStep[]> = {
  jump: [{ freq: 260, slideTo: 520, duration: 0.12, type: 'sine', gain: 0.12 }],
  toss: [{ freq: 440, slideTo: 240, duration: 0.08, type: 'triangle', gain: 0.1 }],
  bowShot: [
    { freq: 340, slideTo: 185, duration: 0.09, type: 'triangle', gain: 0.1 },
    { freq: 720, slideTo: 420, duration: 0.06, type: 'sine', gain: 0.05, delay: 0.02 },
  ],
  harvest: [{ freq: 185, slideTo: 120, duration: 0.09, type: 'triangle', gain: 0.15 }],
  pickup: [
    { freq: 587.33, duration: 0.07, type: 'sine', gain: 0.1 },
    { freq: 880, duration: 0.11, type: 'sine', gain: 0.11, delay: 0.05 },
  ],
  plant: [
    { freq: 440, duration: 0.09, type: 'sine', gain: 0.11 },
    { freq: 659.25, duration: 0.15, type: 'sine', gain: 0.12, delay: 0.06 },
  ],
  scrub: [{ freq: 310, slideTo: 620, duration: 0.14, type: 'sawtooth', gain: 0.08 }],
  build: [
    { freq: 220, duration: 0.08, type: 'square', gain: 0.09 },
    { freq: 330, duration: 0.14, type: 'triangle', gain: 0.13, delay: 0.06 },
  ],
  turretShot: [{ freq: 620, slideTo: 280, duration: 0.06, type: 'triangle', gain: 0.07 }],
  bond: [
    { freq: 523.25, duration: 0.1, type: 'sine', gain: 0.11 },
    { freq: 659.25, duration: 0.14, type: 'sine', gain: 0.11, delay: 0.08 },
  ],
  levelUp: [
    { freq: 523.25, duration: 0.1, type: 'triangle', gain: 0.13 },
    { freq: 659.25, duration: 0.1, type: 'triangle', gain: 0.13, delay: 0.08 },
    { freq: 783.99, duration: 0.18, type: 'sine', gain: 0.15, delay: 0.16 },
  ],
  nightDrum: [
    { freq: 110, slideTo: 65, duration: 0.16, type: 'sine', gain: 0.2 },
    { freq: 110, slideTo: 65, duration: 0.16, type: 'sine', gain: 0.2, delay: 0.18 },
    { freq: 146.83, slideTo: 82, duration: 0.22, type: 'triangle', gain: 0.18, delay: 0.36 },
  ],
  dawnChime: [
    { freq: 587.33, duration: 0.14, type: 'sine', gain: 0.11 },
    { freq: 739.99, duration: 0.14, type: 'sine', gain: 0.11, delay: 0.1 },
    { freq: 880, duration: 0.24, type: 'sine', gain: 0.13, delay: 0.2 },
  ],
  gameOver: [
    { freq: 293.66, slideTo: 196, duration: 0.22, type: 'sawtooth', gain: 0.11 },
    { freq: 196, slideTo: 110, duration: 0.35, type: 'triangle', gain: 0.14, delay: 0.2 },
  ],
};
