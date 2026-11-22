import '@babylonjs/loaders/glTF/index.js';
import type { AssetContainer } from '@babylonjs/core/assetContainer.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { PaletteKey, PartId } from './constants.ts';
import type { IMeshPartProvider } from './IMeshPartProvider.ts';

/**
 * `.glb`/`.gltf` part provider with automatic fallback to procedural geometry.
 *
 * Preloads mapped glTF URLs into Babylon `AssetContainer`s so synchronous
 * `createPart` calls can instantiate models cleanly or fall back transparently.
 */
export class GltfPartProvider implements IMeshPartProvider {
  private readonly scene: Scene;
  private readonly fallback: IMeshPartProvider;
  private readonly manifest: Partial<Record<PartId, string>>;
  private readonly containers = new Map<PartId, AssetContainer>();

  /**
   * Creates a glTF part provider wrapping a fallback `IMeshPartProvider`.
   *
   * @param scene Target Babylon `Scene`.
   * @param fallback Fallback provider used when no `.glb` is loaded for a `PartId`.
   * @param manifest Optional map from `PartId` to `.glb`/`.gltf` URL.
   * @example
   * const gltf = new GltfPartProvider(scene, procedural, { hat_explorer: '/models/hat.glb' });
   */
  public constructor(
    scene: Scene,
    fallback: IMeshPartProvider,
    manifest: Partial<Record<PartId, string>> = {},
  ) {
    this.scene = scene;
    this.fallback = fallback;
    this.manifest = manifest;
  }

  /**
   * Preloads all configured `.glb`/`.gltf` URLs into cached `AssetContainer`s.
   *
   * @returns Promise settling once all configured assets have been attempted.
   * @example
   * await gltf.preloadAll();
   */
  public async preloadAll(): Promise<void> {
    const entries = Object.entries(this.manifest) as Array<[PartId, string]>;
    await Promise.all(entries.map(([partId, url]) => this._loadEntry(partId, url)));
  }

  /**
   * Instantiates a glTF asset clone if preloaded, otherwise delegates to fallback.
   *
   * @param partId Logical modular part identifier.
   * @param instanceName Unique scene node prefix.
   * @param paletteKey Semantic color key passed to fallback when needed.
   * @returns Root `TransformNode` of the instantiated part.
   * @example
   * const part = gltf.createPart('hat_explorer', 'hero-hat', 'woodWarm');
   */
  public createPart(
    partId: PartId,
    instanceName: string,
    paletteKey: PaletteKey,
  ): TransformNode {
    const container = this.containers.get(partId);
    if (!container) {
      return this.fallback.createPart(partId, instanceName, paletteKey);
    }
    return this._instantiateContainer(container, `${instanceName}-${partId}`);
  }

  private async _loadEntry(partId: PartId, url: string): Promise<void> {
    try {
      const container = await LoadAssetContainerAsync(url, this.scene);
      this.containers.set(partId, container);
    } catch {
      this.containers.delete(partId);
    }
  }

  private _instantiateContainer(container: AssetContainer, name: string): TransformNode {
    const root = new TransformNode(name, this.scene);
    const instantiated = container.instantiateModelsToScene(
      (sourceName) => `${name}-${sourceName}`,
      false,
    );
    for (const node of instantiated.rootNodes) {
      node.parent = root;
    }
    return root;
  }
}
