import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { ColorPalette, type PaletteSwatch } from './ColorPalette.ts';
import {
  MATERIAL_RIM_BIAS,
  MATERIAL_RIM_POWER,
  MATERIAL_SPECULAR_SCALE,
  type PaletteKey,
} from './constants.ts';

/**
 * Factory and cache for warm toybox clay/wood Babylon materials with subtle
 * cel-inspired Fresnel rim shading and crisp emissive night accents.
 */
export class StylizedMaterialFactory {
  private static readonly RIM_HEX = '#fff4e0';
  private static readonly MAX_LIGHTS = 8;
  private static readonly MATTE_FLAT_KEYS = new Set<PaletteKey>([
    'clayCream',
    'grassSage',
    'waterTeal',
    'woodDark',
    'stoneWarm',
  ]);

  private readonly scene: Scene;
  private readonly palette: ColorPalette;
  private readonly cache = new Map<PaletteKey, StandardMaterial>();

  /**
   * Initializes the stylized material factory for a Babylon scene.
   *
   * @param scene Target Babylon `Scene` owning created materials.
   * @param palette Palette provider. Defaults to `new ColorPalette()`.
   * @example
   * const materials = new StylizedMaterialFactory(scene);
   */
  public constructor(scene: Scene, palette = new ColorPalette()) {
    this.scene = scene;
    this.palette = palette;
  }

  /**
   * Returns a cached `StandardMaterial` matching the requested `PaletteKey`.
   *
   * @param key Semantic color token.
   * @returns Configured `StandardMaterial` instance.
   * @example
   * mesh.material = materials.getMaterial('amberGlow');
   */
  public getMaterial(key: PaletteKey): StandardMaterial {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const mat = this._createMaterial(key, this.palette.getSwatch(key));
    this.cache.set(key, mat);
    return mat;
  }

  /**
   * Exposes all currently instantiated materials for glow/night adjustments.
   *
   * @returns Read-only array of cached `StandardMaterial` instances.
   * @example
   * const mats = materials.getAllMaterials();
   */
  public getAllMaterials(): readonly StandardMaterial[] {
    return Array.from(this.cache.values());
  }

  private _createMaterial(key: PaletteKey, swatch: PaletteSwatch): StandardMaterial {
    const mat = new StandardMaterial(`mat-${key}`, this.scene);
    const isFlatSurface = StylizedMaterialFactory.MATTE_FLAT_KEYS.has(key);
    mat.diffuseColor = swatch.diffuse;
    mat.emissiveColor = swatch.emissive;
    mat.maxSimultaneousLights = StylizedMaterialFactory.MAX_LIGHTS;
    mat.specularColor = isFlatSurface ? Color3.Black() : Color3.White().scale(MATERIAL_SPECULAR_SCALE);
    mat.specularPower = 18;
    if (!isFlatSurface) {
      mat.emissiveFresnelParameters = this._buildRimFresnel(swatch);
    }
    return mat;
  }

  private _buildRimFresnel(swatch: PaletteSwatch): FresnelParameters {
    const fresnel = new FresnelParameters();
    fresnel.bias = MATERIAL_RIM_BIAS;
    fresnel.power = MATERIAL_RIM_POWER;
    fresnel.leftColor = Color3.FromHexString(StylizedMaterialFactory.RIM_HEX).scale(
      swatch.rimIntensity * 0.35,
    );
    fresnel.rightColor = Color3.Black();
    return fresnel;
  }
}
