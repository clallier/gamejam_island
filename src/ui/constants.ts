/**
 * @fileoverview Centralized theme colors, typography, breakpoints, and labels
 * for the Babylon.js 2D GUI (`@babylonjs/gui`) HUD.
 */

import type { DayPhase, IslandZone } from '../world/constants.ts';

export interface HudThemeTokens {
  readonly surfaceGlass: string;
  readonly surfaceCard: string;
  readonly surfaceButton: string;
  readonly surfaceButtonActive: string;
  readonly surfaceDisabled: string;
  readonly borderWarm: string;
  readonly borderAccent: string;
  readonly textPrimary: string;
  readonly textMuted: string;
  readonly textDark: string;
  readonly accentAmber: string;
  readonly accentSage: string;
  readonly accentNeon: string;
  readonly trackBg: string;
  readonly fontFamily: string;
}

export const HUD_THEME: HudThemeTokens = {
  surfaceGlass: 'rgba(34, 24, 20, 0.78)',
  surfaceCard: 'rgba(42, 29, 24, 0.92)',
  surfaceButton: 'rgba(68, 48, 38, 0.92)',
  surfaceButtonActive: 'rgba(244, 162, 97, 0.96)',
  surfaceDisabled: 'rgba(54, 38, 30, 0.55)',
  borderWarm: 'rgba(255, 224, 178, 0.35)',
  borderAccent: 'rgba(255, 209, 102, 0.82)',
  textPrimary: '#fff7eb',
  textMuted: '#e2cbb4',
  textDark: '#231610',
  accentAmber: '#ffd166',
  accentSage: '#6fcf97',
  accentNeon: '#d946ef',
  trackBg: 'rgba(255, 255, 255, 0.18)',
  fontFamily: 'Nunito, "Avenir Next", system-ui, -apple-system, sans-serif',
};

export const COMPACT_WIDTH_BREAKPOINT = 720;
export const COMPACT_PAD_SIZE = 48;
export const DESKTOP_PAD_SIZE = 52;
export const COMPACT_ACTION_WIDTH = 56;
export const DESKTOP_ACTION_WIDTH = 90;
export const ACTION_BUTTON_HEIGHT = 52;

export const PHASE_LABELS: Record<DayPhase, string> = {
  day: 'Day',
  dusk: 'Dusk',
  night: 'Night',
  dawn: 'Dawn',
};

export const NEXT_PHASE_MAP: Record<DayPhase, DayPhase> = {
  day: 'dusk',
  dusk: 'night',
  night: 'dawn',
  dawn: 'day',
};

export const ZONE_LABELS: Record<IslandZone, string> = {
  town: 'Town Center',
  defense: 'Defense Ring',
  frontier: 'Frontier Wilds',
  portal: 'Corruption Gate',
};
