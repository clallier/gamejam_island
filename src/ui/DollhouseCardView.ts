import { Button } from '@babylonjs/gui/2D/controls/button.js';
import { Control } from '@babylonjs/gui/2D/controls/control.js';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle.js';
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel.js';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock.js';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture.js';
import type { VillagerBondSnapshot } from '../systems/VillagerBondSystem.ts';
import type { DollhousePlot } from '../world/constants.ts';
import { HUD_THEME } from './constants.ts';
import type { HudLayoutMetrics } from './HudLayout.ts';

/**
 * Callbacks emitted by interactive cutaway dollhouse card controls.
 */
export interface DollhouseCardCallbacks {
  readonly onClose: () => void;
  readonly onHangOut?: () => void;
  readonly onGift?: () => void;
  readonly onFurnish?: () => void;
}

interface ActionButtonSlot {
  readonly button: Button;
  readonly label: TextBlock;
}

/**
 * Renders the non-blocking cutaway dollhouse inspection card inside Babylon GUI,
 * supporting Hang-out, Affinity Gifting, and Cutaway Furnishing actions.
 */
export class DollhouseCardView {
  private static readonly WORD_WRAP = 1;
  private static readonly CARD_HEIGHT = 172;
  private static readonly DISABLED_ALPHA = 0.45;

  private readonly card: Rectangle;
  private readonly stack: StackPanel;
  private readonly roomTitle: TextBlock;
  private readonly npcMeta: TextBlock;
  private readonly perkText: TextBlock;
  private readonly affinityText: TextBlock;
  private readonly hangOutBtn: ActionButtonSlot;
  private readonly giftBtn: ActionButtonSlot;
  private readonly furnishBtn: ActionButtonSlot;
  private callbacks: DollhouseCardCallbacks = { onClose: () => undefined };

  /**
   * Builds the dollhouse card controls and attaches them to `adt`.
   *
   * @param adt Target `AdvancedDynamicTexture`.
   * @throws Error Never thrown during GUI control construction.
   * @example
   * const card = new DollhouseCardView(adt);
   */
  public constructor(adt: AdvancedDynamicTexture) {
    this.card = this._createCardContainer();
    this.stack = this._createBodyStack();
    const header = this._createHeaderRow();
    this.roomTitle = header.title;
    this.npcMeta = this._createBodyLine('card-npc-meta', HUD_THEME.textMuted, 20);
    this.perkText = this._createPerkLine();
    this.affinityText = this._createBodyLine('card-affinity-text', HUD_THEME.textMuted, 18);
    this.hangOutBtn = this._createActionButton('btn-card-hangout', 'Hang Out', HUD_THEME.accentSage, () => this.callbacks.onHangOut?.());
    this.giftBtn = this._createActionButton('btn-card-gift', 'Gift', HUD_THEME.accentAmber, () => this.callbacks.onGift?.());
    this.furnishBtn = this._createActionButton('btn-card-furnish', 'Decorate', HUD_THEME.borderAccent, () => this.callbacks.onFurnish?.());
    this._mountChildren(header.row);
    adt.addControl(this.card);
  }

  /**
   * Registers the callback invoked when the card close button is tapped.
   *
   * @param callback Close/exit zoom handler.
   * @throws Error Never thrown.
   * @example
   * card.setOnClose(() => clearFocus());
   */
  public setOnClose(callback: () => void): void {
    this.callbacks = { ...this.callbacks, onClose: callback };
  }

  /**
   * Registers close, hang-out, gift, and room-furnishing callbacks.
   *
   * @param callbacks Handler bundle for all card buttons.
   * @throws Error Never thrown.
   * @example
   * card.setCallbacks({ onClose, onHangOut, onGift, onFurnish });
   */
  public setCallbacks(callbacks: DollhouseCardCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Adapts card dimensions, alignment, button widths, and typography to viewport metrics.
   *
   * @param metrics Computed `HudLayoutMetrics`.
   * @throws Error Never thrown.
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
    this._applyTypography(metrics);
    const btnWidth = Math.max(82, Math.floor((metrics.cardWidth - 44) / 3));
    for (const slot of [this.hangOutBtn, this.giftBtn, this.furnishBtn]) {
      slot.button.widthInPixels = btnWidth;
      slot.label.fontSizeInPixels = metrics.fontSizeSm;
    }
  }

  /**
   * Shows and populates the card for `plot` and optional live `bond`, or hides when `null`.
   *
   * @param plot Focused `DollhousePlot`, or `null` when roaming.
   * @param bond Optional live `VillagerBondSnapshot`.
   * @throws Error Never thrown.
   * @example
   * card.renderPlot(focusedPlot, bondSnapshot);
   */
  public renderPlot(plot: DollhousePlot | null, bond?: VillagerBondSnapshot | null): void {
    if (!plot) {
      this.card.isVisible = false;
      return;
    }
    this.card.isVisible = true;
    this.roomTitle.text = plot.roomTitle;
    this.npcMeta.text = bond
      ? `${plot.npcName} · ${plot.roleId.toUpperCase()} · ♥ Lv ${bond.level} (${bond.xpText})`
      : `${plot.npcName} · ${plot.roleId.toUpperCase()} · Bond Lv 1`;
    this.perkText.text = bond ? bond.activePerkLabel : plot.perkTeaser;
    this.affinityText.text = `Affinity: ${plot.affinityLabel}`;
    this._renderActions(bond ?? null);
  }

  private _mountChildren(headerRow: Rectangle): void {
    this.stack.addControl(headerRow);
    this.stack.addControl(this.npcMeta);
    this.stack.addControl(this.perkText);
    this.stack.addControl(this.affinityText);
    this.stack.addControl(this._createActionsRow());
    this.card.addControl(this.stack);
  }

  private _applyTypography(metrics: HudLayoutMetrics): void {
    this.roomTitle.fontSizeInPixels = metrics.fontSizeLg;
    this.npcMeta.fontSizeInPixels = metrics.fontSizeSm;
    this.perkText.fontSizeInPixels = metrics.fontSizeMd;
    this.affinityText.fontSizeInPixels = metrics.fontSizeSm;
  }

  private _renderActions(bond: VillagerBondSnapshot | null): void {
    this._updateSlot(this.hangOutBtn, bond ? bond.hangoutLabel : 'Hang Out', Boolean(bond));
    this._updateSlot(this.giftBtn, bond ? bond.giftLabel : 'Gift', Boolean(bond?.canGift));
    this._updateSlot(
      this.furnishBtn,
      bond ? bond.furnishLabel : 'Decorate',
      Boolean(bond && !bond.isFurnishMaxed && bond.canFurnish),
    );
  }

  private _updateSlot(slot: ActionButtonSlot, label: string, enabled: boolean): void {
    slot.label.text = label;
    slot.button.isEnabled = enabled;
    slot.button.alpha = enabled ? 1 : DollhouseCardView.DISABLED_ALPHA;
  }

  private _createCardContainer(): Rectangle {
    const rect = new Rectangle('dollhouse-card');
    rect.widthInPixels = 330;
    rect.heightInPixels = DollhouseCardView.CARD_HEIGHT;
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
    stack.paddingTopInPixels = 8;
    stack.paddingBottomInPixels = 8;
    stack.isHitTestVisible = false;
    return stack;
  }

  private _createHeaderRow(): { row: Rectangle; title: TextBlock; closeBtn: Button } {
    const row = new Rectangle('dollhouse-card-head');
    row.heightInPixels = 30;
    row.thickness = 0;
    row.isHitTestVisible = false;
    const title = this._createHeaderTitle();
    const closeBtn = this._createCloseButton();
    row.addControl(title);
    row.addControl(closeBtn);
    return { row, title, closeBtn };
  }

  private _createHeaderTitle(): TextBlock {
    const title = new TextBlock('card-room-title', 'Cozy Workshop');
    title.color = HUD_THEME.accentAmber;
    title.fontFamily = HUD_THEME.fontFamily;
    title.fontWeight = '800';
    title.paddingRightInPixels = 38;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.isHitTestVisible = false;
    return title;
  }

  private _createCloseButton(): Button {
    const btn = new Button('btn-close-card');
    btn.widthInPixels = 30;
    btn.heightInPixels = 30;
    btn.cornerRadius = 15;
    btn.thickness = 1;
    btn.color = HUD_THEME.borderWarm;
    btn.background = HUD_THEME.surfaceButton;
    btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    btn.isPointerBlocker = true;
    btn.addControl(this._createCenterLabel('btn-close-card-text', '✕', 13));
    btn.onPointerClickObservable.add(() => this.callbacks.onClose());
    return btn;
  }

  private _createActionsRow(): StackPanel {
    const row = new StackPanel('card-actions-row');
    row.isVertical = false;
    row.heightInPixels = 40;
    row.paddingTopInPixels = 6;
    row.isHitTestVisible = false;
    row.addControl(this.hangOutBtn.button);
    row.addControl(this.giftBtn.button);
    row.addControl(this.furnishBtn.button);
    return row;
  }

  private _createActionButton(
    id: string,
    text: string,
    borderColor: string,
    onClick: () => void,
  ): ActionButtonSlot {
    const button = new Button(id);
    button.widthInPixels = 96;
    button.heightInPixels = 34;
    button.paddingLeftInPixels = 3;
    button.paddingRightInPixels = 3;
    button.cornerRadius = 10;
    button.thickness = 1.5;
    button.color = borderColor;
    button.background = HUD_THEME.surfaceButton;
    button.isPointerBlocker = true;
    const label = this._createCenterLabel(`${id}-label`, text, 12);
    button.addControl(label);
    button.onPointerClickObservable.add(onClick);
    return { button, label };
  }

  private _createCenterLabel(id: string, text: string, fontSize: number): TextBlock {
    const label = new TextBlock(id, text);
    label.color = HUD_THEME.textPrimary;
    label.fontFamily = HUD_THEME.fontFamily;
    label.fontWeight = '700';
    label.fontSizeInPixels = fontSize;
    label.isHitTestVisible = false;
    return label;
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
    const tb = this._createBodyLine('card-perk-text', HUD_THEME.textPrimary, 32);
    tb.fontWeight = '600';
    tb.textWrapping = DollhouseCardView.WORD_WRAP;
    return tb;
  }
}
