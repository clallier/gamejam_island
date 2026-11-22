import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';

interface DustPuffParticle {
  readonly mesh: Mesh;
  readonly velocity: Vector3;
  remaining: number;
}

/**
 * Pooled low-poly dust puff particle system for footsteps, auto-dodge landings,
 * rolling road-crate impacts, and enemy defeat bursts.
 */
export class DustPuffSystem {
  private static readonly MAX_PUFFS = 48;
  private static readonly PUFF_LIFE = 0.36;
  private static readonly PUFF_BASE_SCALE = 0.7;
  private static readonly PUFF_DRAG = 3.2;

  private readonly scene: Scene;
  private readonly materials: StylizedMaterialFactory;
  private readonly activePuffs: DustPuffParticle[] = [];
  private readonly puffPool: Mesh[] = [];
  private puffCounter = 0;

  /**
   * Initializes the pooled dust puff VFX system.
   *
   * @param scene Target Babylon `Scene`.
   * @param materials Shared stylized material factory providing `clayCream`.
   * @throws Error Never thrown during construction.
   * @example
   * const dust = new DustPuffSystem(scene, materials);
   */
  public constructor(scene: Scene, materials: StylizedMaterialFactory) {
    this.scene = scene;
    this.materials = materials;
  }

  /**
   * Spawns a radial burst of low-poly dust puffs at `(x, y, z)` using pooled meshes.
   *
   * @param x World X origin.
   * @param y World Y origin.
   * @param z World Z origin.
   * @param count Number of puff particles to spawn.
   * @param spread Horizontal radial speed scale (defaults to `0.7`).
   * @param riseSpeed Initial upward velocity in world units/sec (defaults to `2.4`).
   * @throws Error Never thrown.
   * @example
   * dust.spawnBurst(0, 0.12, 0, 5, 0.9, 2.0);
   */
  public spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    spread = 0.7,
    riseSpeed = 2.4,
  ): void {
    const safeCount = Math.max(0, Math.floor(count));
    for (let i = 0; i < safeCount; i++) {
      if (this.activePuffs.length >= DustPuffSystem.MAX_PUFFS) return;
      const mesh = this._acquirePuff();
      mesh.position.set(x, y, z);
      mesh.scaling.setAll(DustPuffSystem.PUFF_BASE_SCALE);
      const angle = (i / Math.max(1, safeCount)) * Math.PI * 2;
      const velocity = new Vector3(Math.cos(angle) * spread, riseSpeed, Math.sin(angle) * spread * 0.55);
      this.activePuffs.push({ mesh, velocity, remaining: DustPuffSystem.PUFF_LIFE });
    }
  }

  /**
   * Advances active dust puffs, applies exponential velocity drag, and recycles expired meshes.
   *
   * @param dt Frame delta in seconds.
   * @throws Error Never thrown.
   * @example
   * dust.update(1 / 60);
   */
  public update(dt: number): void {
    const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const damp = Math.exp(-DustPuffSystem.PUFF_DRAG * safeDt);
    for (let i = this.activePuffs.length - 1; i >= 0; i--) {
      const puff = this.activePuffs[i]!;
      puff.remaining -= safeDt;
      if (puff.remaining <= 0) {
        this._recyclePuff(i);
        continue;
      }
      this._stepPuff(puff, safeDt, damp);
    }
  }

  /**
   * Returns count of currently animating dust puffs.
   *
   * @returns Active puff count in `[0, MAX_PUFFS]`.
   * @throws Error Never thrown.
   * @example
   * expect(dust.getActiveCount()).toBe(4);
   */
  public getActiveCount(): number {
    return this.activePuffs.length;
  }

  /**
   * Returns count of disabled puff meshes waiting in the pool for reuse.
   *
   * @returns Pooled mesh count.
   * @throws Error Never thrown.
   * @example
   * expect(dust.getPooledCount()).toBe(4);
   */
  public getPooledCount(): number {
    return this.puffPool.length;
  }

  /**
   * Disposes all active and pooled puff meshes without disposing shared materials.
   *
   * @throws Error Never thrown during disposal.
   * @example
   * dust.dispose();
   */
  public dispose(): void {
    while (this.activePuffs.length > 0) this.activePuffs.pop()?.mesh.dispose(false, false);
    while (this.puffPool.length > 0) this.puffPool.pop()?.dispose(false, false);
  }

  private _acquirePuff(): Mesh {
    const pooled = this.puffPool.pop();
    if (pooled) {
      pooled.setEnabled(true);
      return pooled;
    }
    const mesh = MeshBuilder.CreateSphere(
      `dust-puff-${this.puffCounter++}`,
      { diameter: 0.28, segments: 4 },
      this.scene,
    );
    mesh.isPickable = false;
    mesh.material = this.materials.getMaterial('clayCream');
    return mesh;
  }

  private _recyclePuff(index: number): void {
    const puff = this.activePuffs[index]!;
    puff.mesh.setEnabled(false);
    this.puffPool.push(puff.mesh);
    this.activePuffs.splice(index, 1);
  }

  private _stepPuff(puff: DustPuffParticle, dt: number, damp: number): void {
    puff.mesh.position.addInPlaceFromFloats(
      puff.velocity.x * dt,
      puff.velocity.y * dt,
      puff.velocity.z * dt,
    );
    puff.velocity.scaleInPlace(damp);
    const lifeRatio = puff.remaining / DustPuffSystem.PUFF_LIFE;
    const grow = 1 + (1 - lifeRatio) * 0.45;
    const scale = Math.max(0.05, DustPuffSystem.PUFF_BASE_SCALE * grow * lifeRatio);
    puff.mesh.scaling.setAll(scale);
  }
}
