import { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import type { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Scalar } from '@babylonjs/core/Maths/math.scalar.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import type { TimeSnapshot } from '../world/TimeCycle.ts';
import {
  GLOW_DAY_INTENSITY,
  GLOW_NIGHT_INTENSITY,
  INTERIOR_DAY_INTENSITY,
  INTERIOR_NIGHT_INTENSITY,
  SHADOW_MAP_SIZE,
} from './constants.ts';

/**
 * Coordinates the warm toybox daylight rig, sunset/indigo sky transitions,
 * shadow casting, interior cottage warm lights, and night neon-purple glow.
 */
export class DayNightRig {
  private static readonly SKY_DAY = Color3.FromHexString('#bce4fa');
  private static readonly SKY_DUSK = Color3.FromHexString('#f09d6f');
  private static readonly SKY_NIGHT = Color3.FromHexString('#141432');
  private static readonly AMBIENT_DAY = Color3.FromHexString('#fff6e5');
  private static readonly AMBIENT_NIGHT = Color3.FromHexString('#4a3f78');

  private readonly scene: Scene;
  private readonly materials: StylizedMaterialFactory;
  private readonly hemiLight: HemisphericLight;
  private readonly sunLight: DirectionalLight;
  private readonly shadows: ShadowGenerator;
  private readonly glowLayer: GlowLayer;
  private readonly interiorLights: PointLight[] = [];

  /**
   * Initializes hemispheric fill, directional sun + PCF shadows, fog, and glow.
   *
   * @param scene Target Babylon `Scene`.
   * @param materials Shared material factory for dynamic night emissive boosting.
   * @example
   * const lighting = new DayNightRig(scene, materials);
   */
  public constructor(scene: Scene, materials: StylizedMaterialFactory) {
    this.scene = scene;
    this.materials = materials;
    this.hemiLight = this._createHemiLight();
    this.sunLight = this._createSunLight();
    this.shadows = this._createShadowGenerator(this.sunLight);
    this.glowLayer = this._createGlowLayer();
    this._configureFog();
  }

  /**
   * Registers a warm cottage interior `PointLight` for automatic night brightening.
   *
   * @param light Dollhouse `PointLight` instance.
   * @example
   * lighting.registerInteriorLight(roomLight);
   */
  public registerInteriorLight(light: PointLight): void {
    this.interiorLights.push(light);
  }

  /**
   * Registers an array of meshes to cast crisp miniature shadows onto the island.
   *
   * @param meshes Meshes produced by modular assembly or world props.
   * @example
   * lighting.addShadowCasters(heroModel.getMeshes());
   */
  public addShadowCasters(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) {
      this.shadows.addShadowCaster(mesh, false);
    }
  }

  /**
   * Updates directional shadow focus near the player and applies solar lighting.
   *
   * @param snap Current `TimeSnapshot` from `TimeCycle`.
   * @param focusX World X coordinate around which sun shadow origin tracks.
   * @example
   * lighting.update(timeCycle.getSnapshot(), player.getX());
   */
  public update(snap: TimeSnapshot, focusX: number): void {
    const night = snap.nightFactor;
    this._updateSkyAndFog(snap);
    this._updateLights(snap, focusX);
    this._updateNightGlow(night);
  }

  private _createHemiLight(): HemisphericLight {
    const hemi = new HemisphericLight('hemi-fill', new Vector3(0, 1, -0.35), this.scene);
    hemi.intensity = 0.48;
    hemi.groundColor = Color3.FromHexString('#7d6652');
    return hemi;
  }

  private _createSunLight(): DirectionalLight {
    const sun = new DirectionalLight('sun-key', new Vector3(-0.4, -0.85, 0.35), this.scene);
    sun.position = new Vector3(12, 24, -10);
    sun.intensity = 0.92;
    sun.shadowMinZ = 2;
    sun.shadowMaxZ = 65;
    return sun;
  }

  private _createShadowGenerator(sun: DirectionalLight): ShadowGenerator {
    const gen = new ShadowGenerator(SHADOW_MAP_SIZE, sun);
    gen.usePercentageCloserFiltering = true;
    gen.bias = 0.002;
    return gen;
  }

  private _createGlowLayer(): GlowLayer {
    const glow = new GlowLayer('night-glow', this.scene, { mainTextureFixedSize: 512 });
    glow.intensity = GLOW_DAY_INTENSITY;
    return glow;
  }

  private _configureFog(): void {
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.006;
  }

  private _updateSkyAndFog(snap: TimeSnapshot): void {
    const sky = this._resolveSkyColor(snap);
    this.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    this.scene.fogColor = sky;
    this.scene.fogDensity = Scalar.Lerp(0.0045, 0.011, snap.nightFactor);
  }

  private _resolveSkyColor(snap: TimeSnapshot): Color3 {
    const n = snap.nightFactor;
    if (n < 0.5) {
      return Color3.Lerp(DayNightRig.SKY_DAY, DayNightRig.SKY_DUSK, n * 2);
    }
    return Color3.Lerp(DayNightRig.SKY_DUSK, DayNightRig.SKY_NIGHT, (n - 0.5) * 2);
  }

  private _updateLights(snap: TimeSnapshot, focusX: number): void {
    const n = snap.nightFactor;
    const angle = (snap.normalizedTime - 0.22) * Math.PI * 2;
    this.sunLight.position.set(focusX + Math.sin(angle) * 16, 22, -12);
    this.sunLight.direction.set(-Math.sin(angle) * 0.45, -0.85, 0.38).normalize();
    this.sunLight.intensity = Scalar.Lerp(0.92, 0.3, n);
    this.sunLight.diffuse = Color3.Lerp(DayNightRig.AMBIENT_DAY, Color3.FromHexString('#8094ff'), n);
    this.hemiLight.diffuse = Color3.Lerp(DayNightRig.AMBIENT_DAY, DayNightRig.AMBIENT_NIGHT, n);
    this.hemiLight.intensity = Scalar.Lerp(0.48, 0.36, n);
  }

  private _updateNightGlow(night: number): void {
    this.glowLayer.intensity = Scalar.Lerp(GLOW_DAY_INTENSITY, GLOW_NIGHT_INTENSITY, night);
    const roomPower = Scalar.Lerp(INTERIOR_DAY_INTENSITY, INTERIOR_NIGHT_INTENSITY, night);
    for (const light of this.interiorLights) {
      light.intensity = roomPower;
    }
    const amberBoost = Scalar.Lerp(0.28, 1.45, night);
    const neonBoost = Scalar.Lerp(0.42, 1.85, night);
    this.materials.getMaterial('amberGlow').emissiveColor = Color3.FromHexString('#ffaa2b').scale(amberBoost);
    this.materials.getMaterial('corruptionNeon').emissiveColor = Color3.FromHexString('#d946ef').scale(neonBoost);
  }
}
