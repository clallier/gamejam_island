/**
 * @fileoverview Declarative modular 3D blueprint contracts decoupled from Babylon meshes.
 */

import type { NpcRoleId } from '../world/constants.ts';
import type { PaletteKey, PartId, SocketName } from './constants.ts';

export type Vec3Tuple = readonly [number, number, number];

export interface PartAttachment {
  readonly socket: SocketName;
  readonly partId: PartId;
  readonly paletteKey: PaletteKey;
  readonly position?: Vec3Tuple;
  readonly rotation?: Vec3Tuple;
  readonly scale?: Vec3Tuple;
}

export interface ModularBlueprint {
  readonly id: string;
  readonly sockets: readonly SocketName[];
  readonly attachments: readonly PartAttachment[];
}

export interface DollhouseBlueprint extends ModularBlueprint {
  readonly roleId: NpcRoleId;
}
