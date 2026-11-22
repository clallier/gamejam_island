/**
 * @fileoverview Tunable constants for 1D player locomotion, Havok auto-dodge physics,
 * and grid-scaled cozy NPC walk speeds.
 */

import { BALANCE_DEFAULTS, gridToWorld } from '../config/constants.ts';

export const PLAYER_MOVE_SPEED = gridToWorld(BALANCE_DEFAULTS.playerMoveSpeedTiles);
export const PLAYER_JUMP_IMPULSE = 10.6;
export const PLAYER_AUTODODGE_JUMP_SCALE = 0.92;
export const PLAYER_AUTODODGE_HOP_SPEED = 6.2;
export const PLAYER_COYOTE_SECONDS = 0.12;
export const PLAYER_START_X = 0;
export const PLAYER_START_Y = 1.1;

export const PLAYER_TOSS_SPEED_X = 8.2;
export const PLAYER_TOSS_SPEED_Y = 5.4;
export const PLAYER_MAX_PEBBLES = 6;

export const NPC_LOOK_DISTANCE = gridToWorld(1.8);
export const NPC_MOVE_SPEED = gridToWorld(BALANCE_DEFAULTS.npcMoveSpeedTiles);
export const NPC_BOB_AMPLITUDE = 0.04;
export const NPC_BOB_SPEED = 2.6;
