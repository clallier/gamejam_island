import {
  ACTION_BUTTON_HEIGHT,
  COMPACT_ACTION_WIDTH,
  COMPACT_PAD_SIZE,
  COMPACT_WIDTH_BREAKPOINT,
  DESKTOP_ACTION_WIDTH,
  DESKTOP_PAD_SIZE,
} from './constants.ts';

export interface HudLayoutMetrics {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly isCompact: boolean;
  readonly edgePadX: number;
  readonly edgePadTop: number;
  readonly edgePadBottom: number;
  readonly padButtonSize: number;
  readonly actionButtonWidth: number;
  readonly actionButtonHeight: number;
  readonly dockGap: number;
  readonly showDesktopPrompt: boolean;
  readonly cardWidth: number;
  readonly cardBottomOffset: number;
  readonly cardAlignRight: boolean;
  readonly fontSizeSm: number;
  readonly fontSizeMd: number;
  readonly fontSizeLg: number;
}

/**
 * Pure deterministic layout calculator mapping viewport dimensions to
 * responsive Babylon.js GUI coordinates across mobile portrait and desktop.
 */
export class HudLayout {
  private static readonly BASE_EDGE_X = 14;
  private static readonly COMPACT_EDGE_X = 10;
  private static readonly EDGE_TOP = 12;
  private static readonly EDGE_BOTTOM = 14;

  /**
   * Computes pixel metrics for the top bar, dollhouse card, and touch dock.
   *
   * @param viewportWidth Logical CSS viewport width in pixels.
   * @param viewportHeight Logical CSS viewport height in pixels.
   * @returns Immutable `HudLayoutMetrics` descriptor.
   * @throws {RangeError} When dimensions are non-positive or non-finite.
   * @example
   * const metrics = new HudLayout().compute(390, 844);
   */
  public compute(viewportWidth: number, viewportHeight: number): HudLayoutMetrics {
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
      throw new RangeError('Viewport dimensions must be positive finite numbers');
    }
    const isCompact = viewportWidth < COMPACT_WIDTH_BREAKPOINT;
    const edgePadX = isCompact ? HudLayout.COMPACT_EDGE_X : HudLayout.BASE_EDGE_X;
    const actionButtonHeight = ACTION_BUTTON_HEIGHT;
    return {
      viewportWidth,
      viewportHeight,
      isCompact,
      edgePadX,
      edgePadTop: HudLayout.EDGE_TOP,
      edgePadBottom: HudLayout.EDGE_BOTTOM,
      padButtonSize: isCompact ? COMPACT_PAD_SIZE : DESKTOP_PAD_SIZE,
      actionButtonWidth: this._computeActionWidth(viewportWidth, edgePadX, isCompact),
      actionButtonHeight,
      dockGap: isCompact ? 6 : 8,
      showDesktopPrompt: !isCompact,
      cardWidth: Math.min(340, Math.round(viewportWidth - edgePadX * 2)),
      cardBottomOffset: HudLayout.EDGE_BOTTOM + actionButtonHeight + 12,
      cardAlignRight: !isCompact,
      fontSizeSm: isCompact ? 11 : 13,
      fontSizeMd: isCompact ? 12 : 14,
      fontSizeLg: isCompact ? 15 : 17,
    };
  }

  private _computeActionWidth(width: number, edgeX: number, isCompact: boolean): number {
    if (!isCompact) return DESKTOP_ACTION_WIDTH;
    const reservedLeft = COMPACT_PAD_SIZE * 2 + 6;
    const availableForActions = width - edgeX * 2 - reservedLeft - 14 - 12;
    return Math.min(COMPACT_ACTION_WIDTH, Math.max(46, Math.floor(availableForActions / 3)));
  }
}
