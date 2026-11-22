import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { PaletteKey } from './constants.ts';

export interface PaletteSwatch {
  readonly diffuse: Color3;
  readonly emissive: Color3;
  readonly rimIntensity: number;
}

/**
 * Provides cohesive warm toybox clay/wood colors contrasted against
 * warm amber interiors and electric neon-purple corruption tones.
 */
export class ColorPalette {
  private static readonly SWATCH_HEX: Record<
    PaletteKey,
    { diffuse: string; emissive?: string; rim?: number }
  > = {
    hero: { diffuse: '#e76f51', rim: 0.45 },
    engineer: { diffuse: '#f4a261', rim: 0.4 },
    medic: { diffuse: '#52b788', rim: 0.4 },
    defender: { diffuse: '#457b9d', rim: 0.4 },
    merchant: { diffuse: '#e9c46a', rim: 0.4 },
    woodWarm: { diffuse: '#c98a5b', rim: 0.2 },
    woodDark: { diffuse: '#734a32', rim: 0.12 },
    clayCream: { diffuse: '#e6d3b8', rim: 0.12 },
    stoneWarm: { diffuse: '#968f86', rim: 0.15 },
    grassSage: { diffuse: '#79ab61', rim: 0.1 },
    foliagePine: { diffuse: '#448252', rim: 0.28 },
    foliageLeaf: { diffuse: '#69ad53', rim: 0.28 },
    waterTeal: { diffuse: '#42a3ad', rim: 0.08 },
    amberGlow: { diffuse: '#ffd166', emissive: '#ffaa2b', rim: 0.6 },
    heartAmber: { diffuse: '#ffe08a', emissive: '#ff9f1c', rim: 0.7 },
    corruptionDark: { diffuse: '#2b193d', emissive: '#1e0b36', rim: 0.35 },
    corruptionNeon: { diffuse: '#b832ff', emissive: '#d946ef', rim: 0.9 },
    skinPeach: { diffuse: '#f3c6a5', rim: 0.22 },
    leather: { diffuse: '#6f452d', rim: 0.18 },
  };

  /**
   * Resolves a semantic palette key into diffuse, emissive, and rim values.
   *
   * @param key Semantic material palette identifier.
   * @returns Immutable `PaletteSwatch` with Babylon `Color3` values.
   * @example
   * const swatch = new ColorPalette().getSwatch('corruptionNeon');
   */
  public getSwatch(key: PaletteKey): PaletteSwatch {
    const entry = ColorPalette.SWATCH_HEX[key];
    return {
      diffuse: Color3.FromHexString(entry.diffuse),
      emissive: entry.emissive ? Color3.FromHexString(entry.emissive) : Color3.Black(),
      rimIntensity: entry.rim ?? 0.2,
    };
  }
}
