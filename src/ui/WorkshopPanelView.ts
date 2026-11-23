import { Button } from '@babylonjs/gui/2D/controls/button.js';
import { Control } from '@babylonjs/gui/2D/controls/control.js';
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel.js';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock.js';
import { DEFENSE_KIND } from '../ecs/constants.ts';
import type { DefenseSlotState } from '../systems/DefenseStructureSystem.ts';
import { HUD_THEME } from './constants.ts';
import type { HudLayoutMetrics } from './HudLayout.ts';

/**
 * Interactive build, upgrade, repair, or salvage command emitted by Pip's Workshop panel.
 */
export type WorkshopActionKind = 'barricade' | 'turret' | 'upgrade' | 'repair' | 'salvage';

/**
 * Live HUD snapshot populating Pip's defense commissioning controls inside his dollhouse card.
 */
export interface WorkshopPanelSnapshot {
  readonly researchLevel: number;
  readonly slots: readonly DefenseSlotState[];
  readonly canAffordBarricade: boolean;
  readonly canAffordTurret: boolean;
  readonly canAffordRepair: boolean;
  readonly canAffordUpgradeBySlot: readonly boolean[];
}

interface ButtonSlot {
  readonly button: Button;
  readonly label: TextBlock;
  action: WorkshopActionKind | null;
}

/**
 * Renders Pip's interactive Workshop blueprint selector inside his cutaway dollhouse card,
 * connecting his Bond research level directly to defense plinths along the island road.
 */
export class WorkshopPanelView {
  private static readonly SLOT_TAGS: readonly string[] = ['L2', 'L1', 'R1', 'R2'];
  private static readonly RESEARCH_NAMES: readonly string[] = ['Basic Tech', 'Reinforced Tech', 'Smart Tech'];
  private static readonly DISABLED_ALPHA = 0.45;

  private readonly panel: StackPanel;
  private readonly researchLabel: TextBlock;
  private readonly slotButtons: ButtonSlot[] = [];
  private readonly actionButtons: ButtonSlot[] = [];
  private selectedSlot = 0;
  private lastSnapshot: WorkshopPanelSnapshot | null = null;
  private onAction: ((slotIndex: number, action: WorkshopActionKind) => void) | null = null;

  /**
   * Builds Pip's Workshop Babylon GUI panel ready to mount inside `DollhouseCardView`.
   *
   * @throws Error Never thrown during control construction.
   * @example
   * const workshop = new WorkshopPanelView();
   */
  public constructor() {
    this.panel = this._createRootStack();
    this.researchLabel = this._createResearchLabel();
    this.panel.addControl(this.researchLabel);
    this.panel.addControl(this._createSlotRow());
    this.panel.addControl(this._createActionRow());
  }

  /**
   * Returns the root `StackPanel` container to be mounted inside the dollhouse card.
   *
   * @returns Root Babylon GUI `StackPanel`.
   * @throws Error Never thrown.
   * @example
   * stack.addControl(workshop.getControl());
   */
  public getControl(): StackPanel {
    return this.panel;
  }

  /**
   * Registers the callback invoked when the player clicks a build, upgrade, repair, or salvage button.
   *
   * @param callback Handler receiving `(slotIndex, action)`.
   * @throws Error Never thrown.
   * @example
   * workshop.setOnAction((slot, action) => applyAction(slot, action));
   */
  public setOnAction(callback?: (slotIndex: number, action: WorkshopActionKind) => void): void {
    this.onAction = callback ?? null;
  }

  /**
   * Resizes slot and action buttons responsively for portrait mobile vs desktop cards.
   *
   * @param metrics Computed `HudLayoutMetrics`.
   * @throws Error Never thrown.
   * @example
   * workshop.applyLayout(metrics);
   */
  public applyLayout(metrics: HudLayoutMetrics): void {
    const innerWidth = Math.max(240, metrics.cardWidth - 36);
    const slotW = Math.floor((innerWidth - 18) / 4);
    const actW = Math.floor((innerWidth - 12) / 3);
    this.slotButtons.forEach((b) => this._sizeButton(b, slotW, metrics.fontSizeSm));
    this.actionButtons.forEach((b) => this._sizeButton(b, actW, metrics.fontSizeSm));
    this.researchLabel.fontSizeInPixels = metrics.fontSizeSm;
  }

  /**
   * Populates or hides Pip's Workshop controls from a live `WorkshopPanelSnapshot`.
   *
   * @param snapshot Live workshop snapshot when focused on Pip, or `null` to hide.
   * @throws Error Never thrown.
   * @example
   * workshop.render(snapshot);
   */
  public render(snapshot: WorkshopPanelSnapshot | null): void {
    this.lastSnapshot = snapshot;
    if (!snapshot || snapshot.slots.length === 0) {
      this.panel.isVisible = false;
      return;
    }
    this.panel.isVisible = true;
    this.selectedSlot = Math.max(0, Math.min(snapshot.slots.length - 1, this.selectedSlot));
    const safeLv = Number.isFinite(snapshot.researchLevel) ? Math.min(3, Math.max(1, Math.floor(snapshot.researchLevel))) : 1;
    const tierName = WorkshopPanelView.RESEARCH_NAMES[safeLv - 1] ?? WorkshopPanelView.RESEARCH_NAMES[0]!;
    this.researchLabel.text = `Workshop Research Lv ${safeLv}/3 · ${tierName}`;
    this._renderSlots(snapshot);
    this._renderActions(snapshot);
  }

  private _renderSlots(snapshot: WorkshopPanelSnapshot): void {
    for (let i = 0; i < this.slotButtons.length; i++) {
      const btn = this.slotButtons[i]!;
      const slot = snapshot.slots[i];
      const tag = WorkshopPanelView.SLOT_TAGS[i] ?? `S${i}`;
      btn.label.text = slot ? `${tag} ${this._formatSlotGlyph(slot)}` : tag;
      btn.button.color = i === this.selectedSlot ? HUD_THEME.accentAmber : HUD_THEME.borderWarm;
      btn.button.isVisible = Boolean(slot);
    }
  }

  private _renderActions(snapshot: WorkshopPanelSnapshot): void {
    const slot = snapshot.slots[this.selectedSlot];
    if (!slot) return;
    if (slot.kind === DEFENSE_KIND.EMPTY) {
      this._setActBtn(0, '🧱 Wall', snapshot.canAffordBarricade, 'barricade', HUD_THEME.accentSage);
      this._setActBtn(1, '🗼 Turret', snapshot.canAffordTurret, 'turret', HUD_THEME.accentAmber);
      this._setActBtn(2, 'Lv1 Open', false, null, HUD_THEME.borderWarm);
      return;
    }
    this._renderUpgradeOrRepairBtn(snapshot, slot);
    this._setActBtn(1, '♻ Salvage', true, 'salvage', HUD_THEME.accentNeon);
    const kindGlyph = slot.kind === DEFENSE_KIND.BARRICADE ? '🧱' : '🗼';
    this._setActBtn(2, `${kindGlyph} ${Math.round(slot.hp)}/${Math.round(slot.maxHp)}`, false, null, HUD_THEME.borderWarm);
  }

  private _renderUpgradeOrRepairBtn(snapshot: WorkshopPanelSnapshot, slot: DefenseSlotState): void {
    if (slot.hp < slot.maxHp) {
      this._setActBtn(0, '🔧 Repair', snapshot.canAffordRepair, 'repair', HUD_THEME.accentSage);
      return;
    }
    if (slot.level >= 3) {
      this._setActBtn(0, '★ Max Lv3', false, null, HUD_THEME.borderWarm);
      return;
    }
    if (slot.level < snapshot.researchLevel) {
      const canUp = snapshot.canAffordUpgradeBySlot[slot.slotIndex] ?? false;
      this._setActBtn(0, `⬆ Lv ${slot.level + 1}`, canUp, 'upgrade', HUD_THEME.accentAmber);
      return;
    }
    this._setActBtn(0, `🔒 Pip Lv${slot.level + 1}`, false, null, HUD_THEME.borderWarm);
  }

  private _setActBtn(
    index: number,
    text: string,
    enabled: boolean,
    action: WorkshopActionKind | null,
    color: string,
  ): void {
    const slot = this.actionButtons[index];
    if (!slot) return;
    slot.label.text = text;
    slot.action = action;
    slot.button.color = color;
    slot.button.isEnabled = enabled;
    slot.button.alpha = enabled ? 1 : WorkshopPanelView.DISABLED_ALPHA;
  }

  private _formatSlotGlyph(slot: DefenseSlotState): string {
    if (slot.kind === DEFENSE_KIND.EMPTY) return '·';
    const base = slot.kind === DEFENSE_KIND.BARRICADE ? '🧱' : '🗼';
    return slot.hp < slot.maxHp ? `${base}🔧` : `${base}${slot.level}`;
  }

  private _sizeButton(slot: ButtonSlot, width: number, fontSize: number): void {
    slot.button.widthInPixels = width;
    slot.label.fontSizeInPixels = fontSize;
  }

  private _createRootStack(): StackPanel {
    const stack = new StackPanel('workshop-panel');
    stack.isVertical = true;
    stack.paddingTopInPixels = 6;
    stack.isHitTestVisible = false;
    stack.isVisible = false;
    return stack;
  }

  private _createResearchLabel(): TextBlock {
    const tb = new TextBlock('workshop-research-label', 'Workshop Research Lv 1/3');
    tb.heightInPixels = 18;
    tb.color = HUD_THEME.accentAmber;
    tb.fontFamily = HUD_THEME.fontFamily;
    tb.fontWeight = '700';
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.isHitTestVisible = false;
    return tb;
  }

  private _createSlotRow(): StackPanel {
    const row = this._createHorizontalRow('workshop-slot-row', 32);
    for (let i = 0; i < 4; i++) {
      const btn = this._makeButton(`btn-workshop-slot-${i}`, WorkshopPanelView.SLOT_TAGS[i]!, 28, () => {
        this.selectedSlot = i;
        this.render(this.lastSnapshot);
      });
      this.slotButtons.push(btn);
      row.addControl(btn.button);
    }
    return row;
  }

  private _createActionRow(): StackPanel {
    const row = this._createHorizontalRow('workshop-action-row', 36);
    for (let i = 0; i < 3; i++) {
      const btn = this._makeButton(`btn-workshop-act-${i}`, '', 32, () => {
        const slotIdx = this.lastSnapshot?.slots[this.selectedSlot]?.slotIndex ?? this.selectedSlot;
        if (btn.action) this.onAction?.(slotIdx, btn.action);
      });
      this.actionButtons.push(btn);
      row.addControl(btn.button);
    }
    return row;
  }

  private _createHorizontalRow(id: string, height: number): StackPanel {
    const row = new StackPanel(id);
    row.isVertical = false;
    row.heightInPixels = height;
    row.paddingTopInPixels = 2;
    row.isHitTestVisible = false;
    return row;
  }

  private _makeButton(id: string, text: string, height: number, onClick: () => void): ButtonSlot {
    const button = new Button(id);
    button.widthInPixels = 72;
    button.heightInPixels = height;
    button.paddingLeftInPixels = 2;
    button.paddingRightInPixels = 2;
    button.cornerRadius = 8;
    button.thickness = 1.5;
    button.color = HUD_THEME.borderWarm;
    button.background = HUD_THEME.surfaceButton;
    button.isPointerBlocker = true;
    const label = this._createButtonLabel(`${id}-label`, text);
    button.addControl(label);
    button.onPointerClickObservable.add(onClick);
    return { button, label, action: null };
  }

  private _createButtonLabel(id: string, text: string): TextBlock {
    const label = new TextBlock(id, text);
    label.color = HUD_THEME.textPrimary;
    label.fontFamily = HUD_THEME.fontFamily;
    label.fontWeight = '700';
    label.fontSizeInPixels = 11;
    label.isHitTestVisible = false;
    return label;
  }
}
