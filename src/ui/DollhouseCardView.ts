import { Button } from '@babylonjs/gui/2D/controls/button.js';
import { Control } from '@babylonjs/gui/2D/controls/control.js';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle.js';
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel.js';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock.js';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture.js';
import type { DollhousePlot } from '../world/constants.ts';
import { HUD_THEME } from './constants.ts';
import type { HudLayoutMetrics } from './HudLayout.ts';

/**
 * Renders the non-blocking cutaway dollhouse inspection card inside Babylon GUI,
 * positioned unobtrusively near the bottom so the zoomed room remains clear.
 */
export class DollhouseCardView {
  private static readonly WORD_WRAP = 1;

  private readonly card: Rectangle;
  private readonly stack: StackPanel;
  private readonly roomTitle: TextBlock;
  private readonly npcMeta: TextBlock;
  private readonly perkText: TextBlock;
  private readonly affinityText: TextBlock;
  private onClose: (() => void) | null = null;

  /**
   * Builds the dollhouse card controls and attaches them to `adt`.
   *
   * @param adt Target `AdvancedDynamicTexture`.
   * @example
   * const card = new DollhouseCardView(adt);
   */
  public constructor(adt: AdvancedDynamicTexture) {
    this.card = this._createCardContainer();
    this.stack = this._createBodyStack();
    const header = this._createHeaderRow();
    this.roomTitle = header.title;
    this.npcMeta = this._createBodyLine('card-npc-meta', HUD_THEME.textMuted, 22);
    this.perkText = this._createPerkLine();
    this.affinityText = this._createBodyLine('card-affinity-text', HUD_THEME.textMuted, 20);
    this.stack.addControl(header.row);
    this.stack.addControl(this.npcMeta);
    this.stack.addControl(this.perkText);
    this.stack.addControl(this.affinityText);
    this.card.addControl(this.stack);
    adt.addControl(this.card);
  }

  /**
   * Registers the callback invoked when the card close button is tapped.
   *
   * @param callback Close/exit zoom handler.
   * @example
   * card.setOnClose(() => clearFocus());
   */
  public setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  /**
   * Adapts card width, bottom offset, and alignment for portrait vs desktop.
   *
   * @param metrics Computed `HudLayoutMetrics`.
   * @example
   * card.applyLayout(metrics);
   */
  public applyLayout(metrics: HudLayoutMetrics): void {
    this.card.widthInPixels = metrics.cardWidth;
    this.stack.widthInPixels = metrics.cardWidth - 28;
    this.card.topInPixels = -metrics.cardBottomOffset;
    this.card.horizontalAlignment = metrics.cardAlignRight
      ? Control.HORIZONTAL_ALIGNMENT_RIGHT
      : Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.card.leftInPixels = metrics.cardAlignRight ? -metrics.edgePadX : 0;
    this.roomTitle.fontSizeInPixels = metrics.fontSizeLg;
    this.npcMeta.fontSizeInPixels = metrics.fontSizeSm;
    this.perkText.fontSizeInPixels = metrics.fontSizeMd;
    this.affinityText.fontSizeInPixels = metrics.fontSizeSm;
  }

  /**
   * Shows and populates the card for `plot`, or hides it when `null`.
   *
   * @param plot Focused `DollhousePlot`, or `null` when roaming.
   * @example
   * card.renderPlot(focusedPlot);
   */
  public renderPlot(plot: DollhousePlot | null): void {
    if (!plot) {
      this.card.isVisible = false;
      return;
    }
    this.card.isVisible = true;
    this.roomTitle.text = plot.roomTitle;
    this.npcMeta.text = `${plot.npcName} · ${plot.roleId.toUpperCase()} · Bond Lv 1`;
    this.perkText.text = plot.perkTeaser;
    this.affinityText.text = `Affinity: ${plot.affinityLabel}`;
  }

  private _createCardContainer(): Rectangle {
    const rect = new Rectangle('dollhouse-card');
    rect.widthInPixels = 330;
    rect.heightInPixels = 128;
    rect.cornerRadius = 18;
    rect.thickness = 1.5;
    rect.color = HUD_THEME.borderAccent;
    rect.background = HUD_THEME.surfaceCard;
    rect.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    rect.isPointerBlocker = true;
    rect.isVisible = false;
    return rect;
  }

  private _createBodyStack(): StackPanel {
    const stack = new StackPanel('dollhouse-card-stack');
    stack.isVertical = true;
    stack.paddingTopInPixels = 10;
    stack.paddingBottomInPixels = 10;
    stack.isHitTestVisible = false;
    return stack;
  }

  private _createHeaderRow(): { row: Rectangle; title: TextBlock; closeBtn: Button } {
    const row = new Rectangle('dollhouse-card-head');
    row.heightInPixels = 32;
    row.thickness = 0;
    row.isHitTestVisible = false;
    const title = new TextBlock('card-room-title', 'Cozy Workshop');
    title.color = HUD_THEME.accentAmber;
    title.fontFamily = HUD_THEME.fontFamily;
    title.fontWeight = '800';
    title.paddingRightInPixels = 38;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.isHitTestVisible = false;
    const closeBtn = this._createCloseButton();
    row.addControl(title);
    row.addControl(closeBtn);
    return { row, title, closeBtn };
  }

  private _createCloseButton(): Button {
    const btn = new Button('btn-close-card');
    btn.widthInPixels = 32;
    btn.heightInPixels = 32;
    btn.cornerRadius = 16;
    btn.thickness = 1;
    btn.color = HUD_THEME.borderWarm;
    btn.background = HUD_THEME.surfaceButton;
    btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    btn.isPointerBlocker = true;
    const label = new TextBlock('btn-close-card-text', '✕');
    label.color = HUD_THEME.textPrimary;
    label.fontSizeInPixels = 14;
    label.isHitTestVisible = false;
    btn.addControl(label);
    btn.onPointerClickObservable.add(() => this.onClose?.());
    return btn;
  }

  private _createBodyLine(name: string, color: string, height: number): TextBlock {
    const tb = new TextBlock(name, '');
    tb.heightInPixels = height;
    tb.color = color;
    tb.fontFamily = HUD_THEME.fontFamily;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.isHitTestVisible = false;
    return tb;
  }

  private _createPerkLine(): TextBlock {
    const tb = this._createBodyLine('card-perk-text', HUD_THEME.textPrimary, 34);
    tb.fontWeight = '600';
    tb.textWrapping = DollhouseCardView.WORD_WRAP;
    return tb;
  }
}
