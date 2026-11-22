import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { ModularBlueprint, PartAttachment, Vec3Tuple } from './BlueprintTypes.ts';
import type { PaletteKey, PartId, SocketName } from './constants.ts';
import type { IMeshPartProvider } from './IMeshPartProvider.ts';

/**
 * Runtime instance of an assembled modular 3D object with named sockets.
 *
 * Supports hot-swapping any modular slot (hat, weapon, furniture, roof)
 * without rebuilding the parent entity or its physics collider.
 */
export class AssembledModel {
  public readonly root: TransformNode;

  private readonly provider: IMeshPartProvider;
  private readonly sockets: Map<SocketName, TransformNode>;
  private readonly attached = new Map<SocketName, TransformNode>();

  /**
   * Wraps an assembled modular node hierarchy.
   *
   * @param root Root `TransformNode` of the assembled entity.
   * @param provider Part provider used to instantiate replacement parts.
   * @param sockets Map of socket names to child `TransformNode` anchors.
   * @example
   * model.swapPart('hat', 'hat_helm', 'defender');
   */
  public constructor(
    root: TransformNode,
    provider: IMeshPartProvider,
    sockets: Map<SocketName, TransformNode>,
  ) {
    this.root = root;
    this.provider = provider;
    this.sockets = sockets;
  }

  /**
   * Attaches or replaces a modular part in the specified socket.
   *
   * @param socket Target socket name.
   * @param partId Replacement `PartId`.
   * @param paletteKey Material swatch key.
   * @param attachment Optional local transform offsets.
   * @returns Newly created part `TransformNode`.
   * @throws {Error} When `socket` does not exist on this model.
   * @example
   * model.swapPart('hand_right', 'tool_wrench', 'engineer');
   */
  public swapPart(
    socket: SocketName,
    partId: PartId,
    paletteKey: PaletteKey,
    attachment?: Partial<PartAttachment>,
  ): TransformNode {
    const socketNode = this.sockets.get(socket);
    if (!socketNode) {
      throw new Error(`Unknown socket "${socket}" on model "${this.root.name}"`);
    }
    this.attached.get(socket)?.dispose(false, true);
    const part = this.provider.createPart(partId, `${this.root.name}-${socket}`, paletteKey);
    part.parent = socketNode;
    this._applyOffset(part, attachment);
    this.attached.set(socket, part);
    return part;
  }

  /**
   * Returns all Babylon `AbstractMesh` children currently under this assembly.
   *
   * @returns Array of child meshes (useful for shadow-caster registration).
   * @example
   * model.getMeshes().forEach((m) => shadowGen.addShadowCaster(m));
   */
  public getMeshes(): AbstractMesh[] {
    return this.root.getChildMeshes(false);
  }

  /**
   * Looks up a socket `TransformNode` by name if present.
   *
   * @param socket Socket name.
   * @returns `TransformNode` or `undefined`.
   * @example
   * const hatNode = model.getSocket('hat');
   */
  public getSocket(socket: SocketName): TransformNode | undefined {
    return this.sockets.get(socket);
  }

  private _applyOffset(node: TransformNode, attachment?: Partial<PartAttachment>): void {
    this._setTuple(node.position, attachment?.position);
    this._setTuple(node.rotation, attachment?.rotation);
    if (attachment?.scale) {
      const [sx, sy, sz] = attachment.scale;
      node.scaling.set(sx, sy, sz);
    }
  }

  private _setTuple(
    target: { set(x: number, y: number, z: number): unknown },
    tuple?: Vec3Tuple,
  ): void {
    if (!tuple) return;
    target.set(tuple[0], tuple[1], tuple[2]);
  }
}

/**
 * Factory assembling declarative `ModularBlueprint` specs via an injected `IMeshPartProvider`.
 */
export class ModularAssemblyFactory {
  private readonly scene: Scene;
  private readonly provider: IMeshPartProvider;

  /**
   * Initializes the factory with a Babylon scene and modular part provider.
   *
   * @param scene Target Babylon `Scene`.
   * @param provider Concrete `IMeshPartProvider` (procedural or glTF).
   * @example
   * const factory = new ModularAssemblyFactory(scene, proceduralProvider);
   */
  public constructor(scene: Scene, provider: IMeshPartProvider) {
    this.scene = scene;
    this.provider = provider;
  }

  /**
   * Instantiates an `AssembledModel` from a `ModularBlueprint`.
   *
   * @param blueprint Blueprint defining sockets and attachments.
   * @param instanceName Unique scene root name.
   * @returns Ready-to-render `AssembledModel`.
   * @example
   * const hero = factory.assemble(registry.getHeroBlueprint(), 'player-hero');
   */
  public assemble(blueprint: ModularBlueprint, instanceName: string): AssembledModel {
    const root = new TransformNode(instanceName, this.scene);
    const sockets = this._createSockets(root, blueprint.sockets, instanceName);
    const model = new AssembledModel(root, this.provider, sockets);
    for (const item of blueprint.attachments) {
      model.swapPart(item.socket, item.partId, item.paletteKey, item);
    }
    return model;
  }

  private _createSockets(
    root: TransformNode,
    socketNames: readonly SocketName[],
    prefix: string,
  ): Map<SocketName, TransformNode> {
    const sockets = new Map<SocketName, TransformNode>();
    for (const name of socketNames) {
      const node = new TransformNode(`${prefix}-socket-${name}`, this.scene);
      node.parent = root;
      sockets.set(name, node);
    }
    return sockets;
  }
}
