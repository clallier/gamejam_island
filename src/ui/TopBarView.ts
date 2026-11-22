import { Button } from '@babylonjs/gui/2D/controls/button.js';
import { Control } from '@babylonjs/gui/2D/controls/control.js';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle.js';
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel.js';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock.js';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture.js';
import type { IslandZone, ResourceKey } from '../world/constants.ts';
import type { TimeSnapshot } from '../world/TimeCycle.ts';
import {
  HUD_THEME,
  NEXT_PHASE_MAP,
  PHASE_LABELS,
  ZONE_LABELS,
} from './constants.ts';
import type { HudLayoutMetrics } from './HudLayout.ts';

/**
 * Renders the top HUD clusters inside `AdvancedDynamicTexture`:
 * Day/Phase badge, active zone chip, phase preview button, purity bar,
 * and the four compact resource counters.
 */
export class TopBarView {
  private static readonly TRACK_WIDTH_DESKTOP = 74;
  private static readonly TRACK_WIDTH_COMPACT = 52;

  private readonly statusRow: StackPanel;
  private readonly metricsRow: StackPanel;
  private readonly phaseText: TextBlock;
  private readonly zoneText: TextBlock;
  private readonly cycleBtn: Button;
  private readonly cycleBtnText: TextBlock;
  private readonly purityLabel: TextBlock;
  private readonly purityTrack: Rectangle;
  private readonly purityFill: Rectangle;
  private readonly purityText: TextBlock;
  private readonly resourceTexts: Record<ResourceKey, TextBlock>;
  private readonly pillBoxes: Rectangle[] = [];
  private readonly toastPill: Rectangle;
  private readonly toastText: TextBlock;
  private toastRemaining = 0;
  private onCyclePhase: (() => void) | null = null;
  private currentTrackWidth = TopBarView.TRACK_WIDTH_DESKTOP;

  /**
   * Builds top-bar HUD controls and adds them to the fullscreen GUI texture.
   *
   * @param adt Target `AdvancedDynamicTexture`.
   * @example
   * const topBar = new TopBarView(adt);
   */
  public constructor(adt: AdvancedDynamicTexture) {
    this.statusRow = this._createRow('hud-status-row', Control.HORIZONTAL_ALIGNMENT_LEFT);
    this.metricsRow = this._createRow('hud-metrics-row', Control.HORIZONTAL_ALIGNMENT_RIGHT);
    this.phaseText = this._addTextPill(this.statusRow, 'hud-phase', 'Day 1 · Day', HUD_THEME.accentAmber, HUD_THEME.borderAccent);
    this.zoneText = this._addTextPill(this.statusRow, 'hud-zone', 'Town Center', HUD_THEME.textPrimary, HUD_THEME.borderWarm);
    const cyclePair = this._createCycleButton();
    this.cycleBtn = cyclePair.button;
    this.cycleBtnText = cyclePair.label;
    this.statusRow.addControl(this.cycleBtn);
    const purity = this._createPurityPill();
    this.purityLabel = purity.label;
    this.purityTrack = purity.track;
    this.purityFill = purity.fill;
    this.purityText = purity.percent;
    this.metricsRow.addControl(purity.container);
    this.resourceTexts = this._createResourceStrip();
    const toast = this._createToastPill();
    this.toastPill = toast.pill;
    this.toastText = toast.text;
    adt.addControl(this.statusRow);
    adt.addControl(this.metricsRow);
    adt.addControl(this.toastPill);
  }

  /**
   * Displays a temporary non-blocking toast message below the top bar.
   *
   * @param message Short feedback string.
   * @param color Optional border/text accent hex. Defaults to `HUD_THEME.accentAmber`.
   * @example
   * topBar.showToast('+2 Wood');
   */
  public showToast(message: string, color = HUD_THEME.accentAmber): void {
    this.toastText.text = message;
    this.toastText.color = color;
    this.toastPill.color = color;
    this.toastPill.alpha = 1;
    this.toastPill.isVisible = true;
    this.toastRemaining = 1.8;
  }

  /**
   * Updates toast auto-fade timer once per frame.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @example
   * topBar.tick(dt);
   */
  public tick(deltaSeconds: number): void {
    if (!this.toastPill.isVisible) return;
    this.toastRemaining -= Math.max(0, deltaSeconds);
    if (this.toastRemaining <= 0) {
      this.toastPill.isVisible = false;
      return;
    }
    this.toastPill.alpha = Math.min(1, this.toastRemaining * 2);
  }

  /**
   * Registers the callback fired when the user clicks/taps `Preview Phase`.
   *
   * @param callback Handler cycling the solar preview phase.
   * @example
   * topBar.setOnCyclePhase(() => cycleNextPhase());
   */
  public setOnCyclePhase(callback: () => void): void {
    this.onCyclePhase = callback;
  }

  /**
   * Repositions and resizes top-bar rows for compact portrait or desktop widths.
   *
   * @param metrics Computed `HudLayoutMetrics`.
   * @example
   * topBar.applyLayout(layout.compute(390, 844));
   */
  public applyLayout(metrics: HudLayoutMetrics): void {
    this.statusRow.leftInPixels = metrics.edgePadX;
    this.statusRow.topInPixels = metrics.edgePadTop;
    this.metricsRow.horizontalAlignment = metrics.isCompact
      ? Control.HORIZONTAL_ALIGNMENT_LEFT
      : Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.metricsRow.leftInPixels = metrics.isCompact ? metrics.edgePadX : -metrics.edgePadX;
    this.metricsRow.topInPixels = metrics.isCompact ? metrics.edgePadTop + 40 : metrics.edgePadTop;
    this.currentTrackWidth = metrics.isCompact ? TopBarView.TRACK_WIDTH_COMPACT : TopBarView.TRACK_WIDTH_DESKTOP;
    this.purityTrack.widthInPixels = this.currentTrackWidth;
    this.toastPill.topInPixels = metrics.isCompact ? metrics.edgePadTop + 78 : metrics.edgePadTop + 42;
    this.toastPill.widthInPixels = Math.min(280, metrics.viewportWidth - 32);
    this.toastText.fontSizeInPixels = metrics.fontSizeMd;
    this._applyFontAndWidths(metrics);
  }

  /**
   * Updates phase label, zone label, purity meter fill, and resource counts.
   *
   * @param time Current `TimeSnapshot`.
   * @param zone Active `IslandZone`.
   * @param purityRatio Island purity in `[0, 1]`.
   * @param inventory Resource amounts keyed by `ResourceKey`.
   * @example
   * topBar.updateStatus(snap, 'town', 0.55, inventory);
   */
  public updateStatus(
    time: TimeSnapshot,
    zone: IslandZone,
    purityRatio: number,
    inventory: Record<ResourceKey, number>,
  ): void {
    const nextPhase = NEXT_PHASE_MAP[time.phase];
    this.phaseText.text = `Day ${time.dayNumber} · ${PHASE_LABELS[time.phase]}`;
    this.zoneText.text = ZONE_LABELS[zone];
    this.cycleBtnText.text = `☀ Preview ${PHASE_LABELS[nextPhase]}`;
    const clamped = Math.max(0, Math.min(1, purityRatio));
    this.purityFill.widthInPixels = Math.max(4, Math.round(this.currentTrackWidth * clamped));
    this.purityText.text = `${Math.round(clamped * 100)}%`;
    this._updateResourceCounts(inventory);
  }

  private _createRow(name: string, align: number): StackPanel {
    const row = new StackPanel(name);
    row.isVertical = false;
    row.heightInPixels = 34;
    row.spacing = 6;
    row.horizontalAlignment = align;
    row.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    row.isHitTestVisible = false;
    return row;
  }

  private _addTextPill(
    parent: StackPanel,
    name: string,
    initialText: string,
    color: string,
    border: string,
  ): TextBlock {
    const pill = this._makePillRect(`${name}-pill`, 112, border, HUD_THEME.surfaceGlass);
    const label = this._makeLabel(name, initialText, color);
    pill.addControl(label);
    parent.addControl(pill);
    return label;
  }

  private _createCycleButton(): { button: Button; label: TextBlock } {
    const button = new Button('btn-cycle-phase');
    button.widthInPixels = 128;
    button.heightInPixels = 32;
    button.cornerRadius = 16;
    button.thickness = 1.5;
    button.color = HUD_THEME.borderAccent;
    button.background = HUD_THEME.surfaceButton;
    button.isPointerBlocker = true;
    const label = this._makeLabel('phase-btn-label', '☀ Preview Dusk', HUD_THEME.textPrimary);
    button.addControl(label);
    button.onPointerClickObservable.add(() => this.onCyclePhase?.());
    this.pillBoxes.push(button);
    return { button, label };
  }

  private _createPurityPill(): {
    container: Rectangle;
    label: TextBlock;
    track: Rectangle;
    fill: Rectangle;
    percent: TextBlock;
  } {
    const container = this._makePillRect('purity-pill', 166, HUD_THEME.borderWarm, HUD_THEME.surfaceGlass);
    const row = this._makeInnerRow('purity-row', 6);
    const label = this._makeFixedText('purity-label', 'Purity', 42, HUD_THEME.textPrimary);
    row.addControl(label);
    const track = this._makeTrackRect();
    const fill = this._makeFillRect();
    track.addControl(fill);
    row.addControl(track);
    const percent = this._makeFixedText('purity-text', '50%', 34, HUD_THEME.accentSage);
    row.addControl(percent);
    container.addControl(row);
    return { container, label, track, fill, percent };
  }

  private _createResourceStrip(): Record<ResourceKey, TextBlock> {
    const pill = this._makePillRect('resource-strip', 220, HUD_THEME.borderWarm, HUD_THEME.surfaceGlass);
    const row = this._makeInnerRow('resource-row', 4);
    const wood = this._makeFixedText('res-wood', '🪵8', 48, HUD_THEME.textPrimary);
    const stone = this._makeFixedText('res-stone', '🪨5', 48, HUD_THEME.textPrimary);
    const petals = this._makeFixedText('res-petals', '🌸6', 48, HUD_THEME.textPrimary);
    const shards = this._makeFixedText('res-shards', '✨2', 48, HUD_THEME.textPrimary);
    [wood, stone, petals, shards].forEach((t) => row.addControl(t));
    pill.addControl(row);
    this.metricsRow.addControl(pill);
    return { wood, stone, petals, shards };
  }

  private _makePillRect(name: string, width: number, border: string, bg: string): Rectangle {
    const rect = new Rectangle(name);
    rect.widthInPixels = width;
    rect.heightInPixels = 32;
    rect.cornerRadius = 16;
    rect.thickness = 1;
    rect.color = border;
    rect.background = bg;
    rect.isHitTestVisible = false;
    this.pillBoxes.push(rect);
    return rect;
  }

  private _makeInnerRow(name: string, spacing: number): StackPanel {
    const row = new StackPanel(name);
    row.isVertical = false;
    row.spacing = spacing;
    row.isHitTestVisible = false;
    return row;
  }

  private _makeTrackRect(): Rectangle {
    const track = new Rectangle('purity-bar');
    track.widthInPixels = TopBarView.TRACK_WIDTH_DESKTOP;
    track.heightInPixels = 8;
    track.cornerRadius = 4;
    track.thickness = 0;
    track.background = HUD_THEME.trackBg;
    track.isHitTestVisible = false;
    return track;
  }

  private _makeFillRect(): Rectangle {
    const fill = new Rectangle('purity-fill');
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    fill.widthInPixels = 36;
    fill.heightInPixels = 8;
    fill.cornerRadius = 4;
    fill.thickness = 0;
    fill.background = HUD_THEME.accentSage;
    fill.isHitTestVisible = false;
    return fill;
  }

  private _makeLabel(name: string, text: string, color: string): TextBlock {
    const tb = new TextBlock(name, text);
    tb.color = color;
    tb.fontFamily = HUD_THEME.fontFamily;
    tb.fontWeight = '700';
    tb.fontSizeInPixels = 13;
    tb.isHitTestVisible = false;
    return tb;
  }

  private _makeFixedText(name: string, text: string, width: number, color: string): TextBlock {
    const tb = this._makeLabel(name, text, color);
    tb.widthInPixels = width;
    return tb;
  }

  private _applyFontAndWidths(metrics: HudLayoutMetrics): void {
    const compact = metrics.isCompact;
    const scale = compact ? Math.min(1, (metrics.viewportWidth - 20) / 364) : 1;
    this.pillBoxes[0]!.widthInPixels = Math.round((compact ? 102 : 114) * scale);
    this.pillBoxes[1]!.widthInPixels = Math.round((compact ? 112 : 124) * scale);
    this.cycleBtn.widthInPixels = Math.round((compact ? 124 : 140) * scale);
    this.pillBoxes[3]!.widthInPixels = Math.round((compact ? 154 : 176) * scale);
    this.pillBoxes[4]!.widthInPixels = Math.round((compact ? 186 : 220) * scale);
    this.purityLabel.widthInPixels = compact ? 38 : 42;
    this._scaleAllTextFonts(metrics.fontSizeSm, compact ? 41 : 48);
  }

  private _scaleAllTextFonts(size: number, resWidth: number): void {
    const labels = [
      this.phaseText,
      this.zoneText,
      this.cycleBtnText,
      this.purityLabel,
      this.purityText,
    ];
    for (const tb of labels) tb.fontSizeInPixels = size;
    for (const tb of Object.values(this.resourceTexts)) {
      tb.fontSizeInPixels = size;
      tb.widthInPixels = resWidth;
    }
  }

  private _createToastPill(): { pill: Rectangle; text: TextBlock } {
    const pill = this._makePillRect('hud-toast', 240, HUD_THEME.borderAccent, HUD_THEME.surfaceCard);
    pill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    pill.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    pill.isVisible = false;
    const text = this._makeLabel('hud-toast-text', '', HUD_THEME.accentAmber);
    pill.addControl(text);
    return { pill, text };
  }

  private _updateResourceCounts(inv: Record<ResourceKey, number>): void {
    this.resourceTexts.wood.text = `🪵${inv.wood}`;
    this.resourceTexts.stone.text = `🪨${inv.stone}`;
    this.resourceTexts.petals.text = `🌸${inv.petals}`;
    this.resourceTexts.shards.text = `✨${inv.shards}`;
  }
}
