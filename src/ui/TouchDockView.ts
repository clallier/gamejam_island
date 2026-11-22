import { Button } from '@babylonjs/gui/2D/controls/button.js';
import { Control } from '@babylonjs/gui/2D/controls/control.js';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle.js';
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel.js';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock.js';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture.js';
import type { HoldAction, InputController, TapAction } from '../engine/InputController.ts';
import type { DollhousePlot } from '../world/constants.ts';
import { HUD_THEME } from './constants.ts';
import type { HudLayoutMetrics } from './HudLayout.ts';

interface ActionButtonParts {
  readonly button: Button;
  readonly stack: StackPanel;
  readonly icon: TextBlock;
  readonly label: TextBlock;
}

/**
 * Renders the bottom mobile-friendly touch dock and desktop keyboard hint
 * inside Babylon's fullscreen `AdvancedDynamicTexture`.
 */
export class TouchDockView {
  private readonly movePanel: StackPanel;
  private readonly actionsPanel: StackPanel;
  private readonly leftBtn: Button;
  private readonly rightBtn: Button;
  private readonly tossBtn: ActionButtonParts;
  private readonly inspectBtn: ActionButtonParts;
  private readonly jumpBtn: ActionButtonParts;
  private readonly promptPill: Rectangle;

  /**
   * Builds directional touch pads, action buttons, and desktop keyboard prompt.
   *
   * @param adt Target `AdvancedDynamicTexture`.
   * @example
   * const dock = new TouchDockView(adt);
   */
  public constructor(adt: AdvancedDynamicTexture) {
    this.movePanel = this._createDockPanel('dock-move', Control.HORIZONTAL_ALIGNMENT_LEFT);
    this.actionsPanel = this._createDockPanel('dock-actions', Control.HORIZONTAL_ALIGNMENT_RIGHT);
    this.leftBtn = this._createPadButton('btn-left', '◀');
    this.rightBtn = this._createPadButton('btn-right', '▶');
    this.movePanel.addControl(this.leftBtn);
    this.movePanel.addControl(this.rightBtn);
    this.tossBtn = this._createActionButton('btn-toss', '🎯', 'Toss');
    this.inspectBtn = this._createActionButton('btn-inspect', '🏠', 'Room');
    this.jumpBtn = this._createActionButton('btn-jump', '⬆', 'Jump');
    this.actionsPanel.addControl(this.tossBtn.button);
    this.actionsPanel.addControl(this.inspectBtn.button);
    this.actionsPanel.addControl(this.jumpBtn.button);
    this.promptPill = this._createPromptPill();
    adt.addControl(this.movePanel);
    adt.addControl(this.promptPill);
    adt.addControl(this.actionsPanel);
  }

  /**
   * Connects pointer hold/tap events on dock buttons to `InputController`.
   *
   * @param input Shared `InputController` instance.
   * @example
   * dock.bindInput(input);
   */
  public bindInput(input: InputController): void {
    this._wireHold(this.leftBtn, 'left', input);
    this._wireHold(this.rightBtn, 'right', input);
    this._wireTap(this.tossBtn.button, 'toss', input);
    this._wireTap(this.inspectBtn.button, 'interact', input);
    this._wireTap(this.jumpBtn.button, 'jump', input);
  }

  /**
   * Repositions and resizes bottom dock controls for portrait or desktop widths.
   *
   * @param metrics Computed `HudLayoutMetrics`.
   * @example
   * dock.applyLayout(metrics);
   */
  public applyLayout(metrics: HudLayoutMetrics): void {
    this._applyPanelOffsets(this.movePanel, metrics.edgePadX, metrics.edgePadBottom, metrics.dockGap);
    this._applyPanelOffsets(this.actionsPanel, -metrics.edgePadX, metrics.edgePadBottom, metrics.dockGap);
    [this.leftBtn, this.rightBtn].forEach((btn) => {
      btn.widthInPixels = metrics.padButtonSize;
      btn.heightInPixels = metrics.padButtonSize;
    });
    [this.tossBtn, this.inspectBtn, this.jumpBtn].forEach((parts) => {
      this._styleActionButton(parts, metrics);
    });
    this.promptPill.isVisible = metrics.showDesktopPrompt;
    this.promptPill.topInPixels = -metrics.edgePadBottom - 8;
  }

  /**
   * Updates contextual inspect button state, border glow, and label.
   *
   * @param nearbyPlot Nearby `DollhousePlot` or `null`.
   * @param focusedPlot Active zoomed `DollhousePlot` or `null`.
   * @example
   * dock.updateInspectButton(nearby, focused);
   */
  public updateInspectButton(
    nearbyPlot: DollhousePlot | null,
    focusedPlot: DollhousePlot | null,
  ): void {
    const enabled = Boolean(nearbyPlot || focusedPlot);
    const btn = this.inspectBtn.button;
    btn.isEnabled = enabled;
    btn.alpha = enabled ? 1 : 0.48;
    btn.color = enabled ? HUD_THEME.borderAccent : HUD_THEME.borderWarm;
    btn.background = enabled ? HUD_THEME.surfaceButton : HUD_THEME.surfaceDisabled;
    this.inspectBtn.icon.color = enabled ? HUD_THEME.accentAmber : HUD_THEME.textMuted;
    this.inspectBtn.label.color = enabled ? HUD_THEME.accentAmber : HUD_THEME.textMuted;
    this.inspectBtn.label.text = focusedPlot ? 'Exit' : nearbyPlot ? nearbyPlot.npcName : 'Room';
  }

  private _createDockPanel(name: string, align: number): StackPanel {
    const panel = new StackPanel(name);
    panel.isVertical = false;
    panel.heightInPixels = 56;
    panel.horizontalAlignment = align;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.isHitTestVisible = false;
    return panel;
  }

  private _createPadButton(name: string, symbol: string): Button {
    const btn = new Button(name);
    btn.cornerRadius = 16;
    btn.thickness = 1.5;
    btn.color = HUD_THEME.borderWarm;
    btn.background = HUD_THEME.surfaceButton;
    btn.isPointerBlocker = true;
    const txt = new TextBlock(`${name}-icon`, symbol);
    txt.color = HUD_THEME.textPrimary;
    txt.fontSizeInPixels = 18;
    txt.isHitTestVisible = false;
    btn.addControl(txt);
    return btn;
  }

  private _createActionButton(name: string, iconChar: string, text: string): ActionButtonParts {
    const button = new Button(name);
    button.cornerRadius = 16;
    button.thickness = 1.5;
    button.color = HUD_THEME.borderWarm;
    button.background = HUD_THEME.surfaceButton;
    button.isPointerBlocker = true;
    const stack = new StackPanel(`${name}-stack`);
    stack.isHitTestVisible = false;
    const icon = new TextBlock(`${name}-icon`, iconChar);
    icon.color = HUD_THEME.textPrimary;
    icon.fontSizeInPixels = 16;
    icon.isHitTestVisible = false;
    const label = new TextBlock(`${name}-label`, text);
    label.color = HUD_THEME.textPrimary;
    label.fontFamily = HUD_THEME.fontFamily;
    label.fontWeight = '700';
    label.isHitTestVisible = false;
    stack.addControl(icon);
    stack.addControl(label);
    button.addControl(stack);
    return { button, stack, icon, label };
  }

  private _createPromptPill(): Rectangle {
    const pill = new Rectangle('dock-prompt');
    pill.widthInPixels = 336;
    pill.heightInPixels = 32;
    pill.cornerRadius = 16;
    pill.thickness = 1;
    pill.color = HUD_THEME.borderWarm;
    pill.background = HUD_THEME.surfaceGlass;
    pill.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    pill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    pill.isHitTestVisible = false;
    const text = new TextBlock('dock-prompt-text', 'A/D or ←/→ Move · Space Jump · E Room · Shift Toss');
    text.color = HUD_THEME.textMuted;
    text.fontFamily = HUD_THEME.fontFamily;
    text.fontSizeInPixels = 12;
    text.isHitTestVisible = false;
    pill.addControl(text);
    return pill;
  }

  private _wireHold(btn: Button, action: HoldAction, input: InputController): void {
    const activate = () => {
      btn.background = HUD_THEME.surfaceButtonActive;
      input.setHoldState(action, true);
    };
    const release = () => {
      btn.background = HUD_THEME.surfaceButton;
      input.setHoldState(action, false);
    };
    btn.onPointerDownObservable.add(activate);
    btn.onPointerUpObservable.add(release);
    btn.onPointerOutObservable.add(release);
  }

  private _wireTap(btn: Button, action: TapAction, input: InputController): void {
    btn.onPointerDownObservable.add(() => {
      if (btn.isEnabled) input.triggerTap(action);
    });
  }

  private _applyPanelOffsets(panel: StackPanel, left: number, bottom: number, gap: number): void {
    panel.leftInPixels = left;
    panel.topInPixels = -bottom;
    panel.spacing = gap;
  }

  private _styleActionButton(parts: ActionButtonParts, metrics: HudLayoutMetrics): void {
    parts.button.widthInPixels = metrics.actionButtonWidth;
    parts.button.heightInPixels = metrics.actionButtonHeight;
    parts.stack.isVertical = metrics.isCompact;
    parts.stack.widthInPixels = metrics.isCompact ? metrics.actionButtonWidth : 68;
    parts.stack.spacing = metrics.isCompact ? 1 : 4;
    parts.icon.widthInPixels = metrics.isCompact ? metrics.actionButtonWidth - 8 : 20;
    parts.icon.heightInPixels = metrics.isCompact ? 20 : 22;
    parts.label.widthInPixels = metrics.isCompact ? metrics.actionButtonWidth - 6 : 44;
    parts.label.heightInPixels = metrics.isCompact ? 16 : 22;
    parts.label.fontSizeInPixels = metrics.isCompact ? 11 : metrics.fontSizeMd;
  }
}
