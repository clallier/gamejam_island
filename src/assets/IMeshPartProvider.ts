import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { PaletteKey, PartId } from './constants.ts';

/**
 * Inversion-of-Control contract for supplying modular 3D part subtrees.
 *
 * Allows swapping procedural toybox kitbash geometry for `.glb`/`.gltf`
 * assets without modifying character, dollhouse, or world assembly code.
 */
export interface IMeshPartProvider {
  /**
   * Instantiates a 3D part subtree rooted at a `TransformNode`.
   *
   * @param partId Logical modular part identifier.
   * @param instanceName Unique scene node name prefix.
   * @param paletteKey Semantic material swatch key.
   * @returns Root `TransformNode` containing the part's meshes.
   */
  createPart(partId: PartId, instanceName: string, paletteKey: PaletteKey): TransformNode;
}
