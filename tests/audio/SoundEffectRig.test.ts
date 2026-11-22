import { describe, expect, it, vi } from 'vitest';
import { SFX_RECIPES, type SfxKey } from '../../src/audio/constants.ts';
import { SoundEffectRig } from '../../src/audio/SoundEffectRig.ts';

function createMockAudioContext() {
  const oscillators: Array<{
    type: OscillatorType;
    frequency: { setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];

  const mockCtx = {
    currentTime: 10,
    state: 'suspended' as AudioContextState,
    destination: {} as AudioDestinationNode,
    resume: vi.fn(async () => {
      mockCtx.state = 'running';
    }),
    close: vi.fn(async () => {
      mockCtx.state = 'closed';
    }),
    createOscillator: vi.fn(() => {
      const osc = {
        type: 'sine' as OscillatorType,
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
  };

  return { mockCtx: mockCtx as unknown as AudioContext, raw: mockCtx, oscillators };
}

describe('SoundEffectRig', () => {
  it('operates safely in headless environments when AudioContext is unavailable', () => {
    const rig = new SoundEffectRig(() => null);
    expect(() => rig.play('jump')).not.toThrow();
    expect(rig.toggleMute()).toBe(true);
    expect(rig.isMuted()).toBe(true);
    rig.setMuted(false);
    expect(rig.isMuted()).toBe(false);
    expect(() => rig.dispose()).not.toThrow();
  });

  it('plays all SFX recipes via Web Audio, suppresses playback when muted, and closes on dispose', () => {
    const { mockCtx, raw, oscillators } = createMockAudioContext();
    const rig = new SoundEffectRig(() => mockCtx);

    const keys = Object.keys(SFX_RECIPES) as SfxKey[];
    let expectedOscCount = 0;
    for (const key of keys) {
      rig.play(key);
      expectedOscCount += SFX_RECIPES[key].length;
    }

    expect(raw.resume).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(expectedOscCount);
    expect(oscillators[0]?.start).toHaveBeenCalledWith(10);

    expect(rig.toggleMute()).toBe(true);
    rig.play('nightDrum');
    expect(oscillators).toHaveLength(expectedOscCount);

    rig.dispose();
    expect(raw.close).toHaveBeenCalledTimes(1);
  });
});
