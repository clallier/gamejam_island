/**
 * @fileoverview Constants for Havok physics, adaptive 3/4 camera framing,
 * day/night lighting curves, and glow bloom tuning.
 */

export const GRAVITY_Y = -24;
export const PLAYER_CAPSULE_HEIGHT = 1.65;
export const PLAYER_CAPSULE_RADIUS = 0.38;

export const CAMERA_PORTRAIT_THRESHOLD = 1.0;
export const CAMERA_FOV_LANDSCAPE = 0.62;
export const CAMERA_FOV_PORTRAIT = 0.78;
export const CAMERA_FOV_LANDSCAPE_COMBAT = 0.68;
export const CAMERA_FOV_PORTRAIT_COMBAT = 0.96;
export const CAMERA_PORTRAIT_COMBAT_HALF_WIDTH = 12;
export const CAMERA_FOV_FOCUS = 0.56;
export const CAMERA_DAMP_SPEED = 7.5;
export const CAMERA_ZOOM_DAMP_SPEED = 2.2;

export const SHADOW_MAP_SIZE = 1024;
export const GLOW_DAY_INTENSITY = 0.05;
export const GLOW_NIGHT_INTENSITY = 0.95;
export const INTERIOR_DAY_INTENSITY = 0.12;
export const INTERIOR_NIGHT_INTENSITY = 2.9;
