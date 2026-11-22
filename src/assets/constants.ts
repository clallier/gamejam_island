/**
 * @fileoverview Socket names, modular part IDs, and stylized palette tokens
 * shared across procedural and glTF modular asset providers.
 */

export type SocketName =
  | 'root'
  | 'torso'
  | 'head'
  | 'hat'
  | 'back'
  | 'hand_right'
  | 'hand_left'
  | 'roof'
  | 'facade'
  | 'interior_left'
  | 'interior_center'
  | 'interior_right';

export type PartId =
  | 'body_tunic'
  | 'head_round'
  | 'hat_explorer'
  | 'hat_goggles'
  | 'hat_flower'
  | 'hat_helm'
  | 'hat_beret'
  | 'pack_satchel'
  | 'weapon_slingshot'
  | 'tool_wrench'
  | 'tool_watering_can'
  | 'tool_shield'
  | 'prop_coin_pouch'
  | 'dollhouse_shell'
  | 'dollhouse_roof'
  | 'dollhouse_awning'
  | 'furniture_workbench'
  | 'furniture_planter'
  | 'furniture_rack'
  | 'furniture_counter'
  | 'furniture_tool_chest'
  | 'furniture_hearth_stove'
  | 'furniture_herb_shelf'
  | 'furniture_tea_table'
  | 'furniture_training_dummy'
  | 'furniture_banner_stand'
  | 'furniture_curio_shelf'
  | 'furniture_plush_rug'
  | 'prop_lantern'
  | 'shrine_heart'
  | 'tree_pine'
  | 'tree_broadleaf'
  | 'rock_boulder'
  | 'mound_corruption'
  | 'portal_monolith'
  | 'wildflower_patch'
  | 'purifier_flower';

export type PaletteKey =
  | 'hero'
  | 'engineer'
  | 'medic'
  | 'defender'
  | 'merchant'
  | 'woodWarm'
  | 'woodDark'
  | 'clayCream'
  | 'stoneWarm'
  | 'grassSage'
  | 'foliagePine'
  | 'foliageLeaf'
  | 'waterTeal'
  | 'amberGlow'
  | 'heartAmber'
  | 'corruptionDark'
  | 'corruptionNeon'
  | 'skinPeach'
  | 'leather';

export const MATERIAL_RIM_BIAS = 0.25;
export const MATERIAL_RIM_POWER = 2.6;
export const MATERIAL_SPECULAR_SCALE = 0.08;
export const DOLLHOUSE_WIDTH = 4.4;
export const DOLLHOUSE_HEIGHT = 3.1;
export const DOLLHOUSE_DEPTH = 3.0;
