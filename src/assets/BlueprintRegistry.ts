import type { NpcRoleId } from '../world/constants.ts';
import type {
  DollhouseBlueprint,
  ModularBlueprint,
  PartAttachment,
} from './BlueprintTypes.ts';
import type { PaletteKey, PartId, SocketName } from './constants.ts';

export type WorldPropKind =
  | 'shrine'
  | 'tree_pine'
  | 'tree_broadleaf'
  | 'boulder'
  | 'mound'
  | 'portal'
  | 'wildflower'
  | 'purifier_flower'
  | 'defense_turret'
  | 'defense_barricade'
  | 'enemy_gloom_sprite'
  | 'enemy_gloom_brute';

interface NpcSpec {
  readonly hat: PartId;
  readonly tool: PartId;
  readonly palette: PaletteKey;
  readonly furniture: PartId;
}

/**
 * Pure declarative catalog of modular 3D blueprints for the hero, NPCs,
 * open-front cutaway dollhouses, flora, and neon corruption landmarks.
 */
export class BlueprintRegistry {
  private static readonly CHARACTER_SOCKETS: readonly SocketName[] = [
    'root',
    'torso',
    'head',
    'hat',
    'back',
    'hand_right',
    'hand_left',
  ];

  private static readonly DOLLHOUSE_SOCKETS: readonly SocketName[] = [
    'root',
    'roof',
    'facade',
    'interior_left',
    'interior_center',
    'interior_right',
  ];

  private static readonly NPC_SPECS: Record<NpcRoleId, NpcSpec> = {
    engineer: {
      hat: 'hat_goggles',
      tool: 'tool_wrench',
      palette: 'engineer',
      furniture: 'furniture_workbench',
    },
    medic: {
      hat: 'hat_flower',
      tool: 'tool_watering_can',
      palette: 'medic',
      furniture: 'furniture_planter',
    },
    defender: {
      hat: 'hat_helm',
      tool: 'tool_shield',
      palette: 'defender',
      furniture: 'furniture_rack',
    },
    merchant: {
      hat: 'hat_beret',
      tool: 'prop_coin_pouch',
      palette: 'merchant',
      furniture: 'furniture_counter',
    },
  };

  /**
   * Returns the modular blueprint for the playable 1D island hero.
   *
   * @returns `ModularBlueprint` for the player explorer.
   * @example
   * const heroBp = new BlueprintRegistry().getHeroBlueprint();
   */
  public getHeroBlueprint(): ModularBlueprint {
    return {
      id: 'hero',
      sockets: BlueprintRegistry.CHARACTER_SOCKETS,
      attachments: [
        ...this._baseBody('hero'),
        { socket: 'hat', partId: 'hat_explorer', paletteKey: 'woodWarm', position: [0, 1.56, 0] },
        { socket: 'back', partId: 'pack_satchel', paletteKey: 'leather', position: [0, 0.78, -0.34] },
        { socket: 'hand_right', partId: 'weapon_slingshot', paletteKey: 'woodWarm', position: [0.42, 0.78, 0.14] },
      ],
    };
  }

  /**
   * Returns the modular character blueprint for one of the 4 villager roles.
   *
   * @param roleId Role identifier (`'engineer' | 'medic' | 'defender' | 'merchant'`).
   * @returns `ModularBlueprint` customized with role hat, tool, and palette.
   * @example
   * const bp = new BlueprintRegistry().getNpcBlueprint('engineer');
   */
  public getNpcBlueprint(roleId: NpcRoleId): ModularBlueprint {
    const spec = BlueprintRegistry.NPC_SPECS[roleId];
    return {
      id: `npc-${roleId}`,
      sockets: BlueprintRegistry.CHARACTER_SOCKETS,
      attachments: [
        ...this._baseBody(spec.palette),
        { socket: 'hat', partId: spec.hat, paletteKey: spec.palette, position: [0, 1.54, 0] },
        { socket: 'hand_right', partId: spec.tool, paletteKey: 'woodWarm', position: [0.4, 0.76, 0.15] },
      ],
    };
  }

  /**
   * Returns an open-front cutaway dollhouse blueprint for a villager plot.
   *
   * @param roleId Role identifier matching the resident NPC.
   * @returns `DollhouseBlueprint` with shell, roof, awning, lantern, and starter furniture.
   * @example
   * const houseBp = new BlueprintRegistry().getDollhouseBlueprint('medic');
   */
  public getDollhouseBlueprint(roleId: NpcRoleId): DollhouseBlueprint {
    const spec = BlueprintRegistry.NPC_SPECS[roleId];
    return {
      id: `dollhouse-${roleId}`,
      roleId,
      sockets: BlueprintRegistry.DOLLHOUSE_SOCKETS,
      attachments: [
        { socket: 'root', partId: 'dollhouse_shell', paletteKey: 'clayCream' },
        { socket: 'roof', partId: 'dollhouse_roof', paletteKey: spec.palette, position: [0, 3.05, 0] },
        { socket: 'facade', partId: 'dollhouse_awning', paletteKey: spec.palette, position: [0, 2.55, -1.45] },
        { socket: 'interior_center', partId: spec.furniture, paletteKey: 'woodWarm', position: [-0.8, 0.25, 0.3] },
        { socket: 'interior_right', partId: 'prop_lantern', paletteKey: 'amberGlow', position: [0, 2.58, 0.2] },
      ],
    };
  }

  /**
   * Returns the blueprint for a world landmark, tree, boulder, mound, or portal.
   *
   * @param kind World prop category.
   * @returns `ModularBlueprint` rooted at `'root'`.
   * @example
   * const treeBp = new BlueprintRegistry().getPropBlueprint('tree_pine');
   */
  public getPropBlueprint(kind: WorldPropKind): ModularBlueprint {
    const map: Record<WorldPropKind, PartAttachment> = {
      shrine: { socket: 'root', partId: 'shrine_heart', paletteKey: 'heartAmber' },
      tree_pine: { socket: 'root', partId: 'tree_pine', paletteKey: 'foliagePine' },
      tree_broadleaf: { socket: 'root', partId: 'tree_broadleaf', paletteKey: 'foliageLeaf' },
      boulder: { socket: 'root', partId: 'rock_boulder', paletteKey: 'stoneWarm' },
      mound: { socket: 'root', partId: 'mound_corruption', paletteKey: 'corruptionNeon' },
      portal: { socket: 'root', partId: 'portal_monolith', paletteKey: 'corruptionNeon' },
      wildflower: { socket: 'root', partId: 'wildflower_patch', paletteKey: 'amberGlow' },
      purifier_flower: { socket: 'root', partId: 'purifier_flower', paletteKey: 'amberGlow' },
      defense_turret: { socket: 'root', partId: 'defense_turret', paletteKey: 'woodWarm' },
      defense_barricade: { socket: 'root', partId: 'defense_barricade', paletteKey: 'stoneWarm' },
      enemy_gloom_sprite: { socket: 'root', partId: 'enemy_gloom_sprite', paletteKey: 'corruptionNeon' },
      enemy_gloom_brute: { socket: 'root', partId: 'enemy_gloom_brute', paletteKey: 'corruptionDark' },
    };
    return { id: `prop-${kind}`, sockets: ['root'], attachments: [map[kind]] };
  }

  private _baseBody(paletteKey: PaletteKey): PartAttachment[] {
    return [
      { socket: 'torso', partId: 'body_tunic', paletteKey, position: [0, 0, 0] },
      { socket: 'head', partId: 'head_round', paletteKey: 'skinPeach', position: [0, 1.18, 0] },
    ];
  }
}
