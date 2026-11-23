import '@babylonjs/core/Layers/layer.js';
import '@babylonjs/core/Layers/layerSceneComponent.js';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture.js';
import type { Control } from '@babylonjs/gui/2D/controls/control.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { InputController } from '../engine/InputController.ts';
import type { InteractionTarget } from '../systems/InteractionResolver.ts';
import type { VillagerBondSnapshot } from '../systems/VillagerBondSystem.ts';
import type { DollhousePlot, IslandZone, ResourceKey } from '../world/constants.ts';
import type { TimeSnapshot } from '../world/TimeCycle.ts';
import { type DollhouseCardCallbacks, DollhouseCardView } from './DollhouseCardView.ts';
import { HudLayout } from './HudLayout.ts';
import { TopBarView } from './TopBarView.ts';
import { TouchDockView } from './TouchDockView.ts';
import type { WorkshopPanelSnapshot } from './WorkshopPanelView.ts';

/**
 * Babylon.js 2D GUI HUD coordinator composing top status pills, responsive
 * mobile/desktop touch dock, and cutaway dollhouse inspection card inside
 * `AdvancedDynamicTexture.CreateFullscreenUI`.
 */
export class BabylonHud {
  private readonly adt: AdvancedDynamicTexture;
  private readonly layout: HudLayout;
  private readonly topBar: TopBarView;
  private readonly card: DollhouseCardView;
  private readonly dock: TouchDockView;

  /**
   * Creates the fullscreen Babylon GUI texture and mounts all HUD subviews.
   *
   * @param scene Target Babylon `Scene`.
   * @param layout Optional `HudLayout` calculator. Defaults to `new HudLayout()`.
   * @example
   * const hud = new BabylonHud(scene);
   */
  public constructor(scene: Scene, layout = new HudLayout()) {
    this.layout = layout;
    this.adt = AdvancedDynamicTexture.CreateFullscreenUI('hearthline-hud', true, scene);
    this.adt.renderAtIdealSize = false;
    this.topBar = new TopBarView(this.adt);
    this.card = new DollhouseCardView(this.adt);
    this.dock = new TouchDockView(this.adt);
  }

  /**
   * Connects touch dock controls and HUD action callbacks.
   *
   * @param input Shared `InputController` driven by dock buttons.
   * @param onCyclePhase Callback fired when `Preview Phase` is clicked.
   * @param onCloseCard Callback fired when the dollhouse card close button is clicked.
   * @param cardActions Optional handlers for dollhouse Hang-out, Gift, and Furnish buttons.
   * @throws Error Never thrown.
   * @example
   * hud.bindControls(input, () => cycleNextPhase(), () => clearFocus(), { onHangOut });
   */
  public bindControls(
    input: InputController,
    onCyclePhase: () => void,
    onCloseCard: () => void,
    cardActions?: Omit<DollhouseCardCallbacks, 'onClose'>,
  ): void {
    this.dock.bindInput(input);
    this.topBar.setOnCyclePhase(onCyclePhase);
    this.card.setCallbacks({ onClose: onCloseCard, ...cardActions });
  }

  /**
   * Updates `idealWidth` to match logical CSS width and reapplies responsive metrics.
   *
   * @param width Logical viewport width in CSS pixels.
   * @param height Logical viewport height in CSS pixels.
   * @example
   * hud.resize(canvas.clientWidth, canvas.clientHeight);
   */
  public resize(width: number, height: number): void {
    const safeWidth = Math.max(320, Math.round(Number.isFinite(width) ? width : 320));
    const safeHeight = Math.max(320, Math.round(Number.isFinite(height) ? height : 320));
    this.adt.idealWidth = safeWidth;
    const metrics = this.layout.compute(safeWidth, safeHeight);
    this.topBar.applyLayout(metrics);
    this.card.applyLayout(metrics);
    this.dock.applyLayout(metrics);
  }

  /**
   * Refreshes top-bar phase, active zone, island purity, and resource counters.
   *
   * @param time Current `TimeSnapshot`.
   * @param zone Active `IslandZone`.
   * @param purityRatio Island purity ratio in `[0, 1]`.
   * @param inventory Resource amounts by `ResourceKey`.
   * @param heartHp Current Town Heart hit points.
   * @param activeEnemies Total living and queued night wave enemies.
   * @example
   * hud.updateStatus(timeSnap, 'town', 0.55, inventory);
   */
  public updateStatus(
    time: TimeSnapshot,
    zone: IslandZone,
    purityRatio: number,
    inventory: Record<ResourceKey, number>,
    heartHp = 100,
    activeEnemies = 0,
  ): void {
    this.topBar.updateStatus(time, zone, purityRatio, inventory, heartHp, activeEnemies);
  }

  /**
   * Registers the callback invoked when clicking `Restart Island` after Town Heart defeat.
   *
   * @param callback Restart handler.
   * @throws Error Never thrown.
   * @example
   * hud.setOnRestart(() => app.restart());
   */
  public setOnRestart(callback: () => void): void {
    this.topBar.setOnRestart(callback);
  }

  /**
   * Registers the callback invoked when toggling the audio mute button.
   *
   * @param callback Mute toggle handler.
   * @throws Error Never thrown.
   * @example
   * hud.setOnToggleMute(() => hud.setMuted(audio.toggleMute()));
   */
  public setOnToggleMute(callback: () => void): void {
    this.topBar.setOnToggleMute(callback);
  }

  /**
   * Registers the callback invoked when toggling the live balance spreadsheet drawer.
   *
   * @param callback Balance drawer toggle handler.
   * @throws Error Never thrown.
   * @example
   * hud.setOnToggleTune(() => drawer.toggle());
   */
  public setOnToggleTune(callback: () => void): void {
    this.topBar.setOnToggleTune(callback);
  }

  /**
   * Updates the mute toggle icon to reflect audible (`🔊`) vs muted (`🔇`) state.
   *
   * @param muted Whether audio playback is muted.
   * @throws Error Never thrown.
   * @example
   * hud.setMuted(true);
   */
  public setMuted(muted: boolean): void {
    this.topBar.setMuted(muted);
  }

  /**
   * Shows or hides the Town Heart fallen restart banner.
   *
   * @param visible `true` when game over.
   * @throws Error Never thrown.
   * @example
   * hud.setGameOver(combat.isOver());
   */
  public setGameOver(visible: boolean): void {
    this.topBar.setGameOver(visible);
  }

  /**
   * Updates contextual interact button, plant button, and cutaway dollhouse card.
   *
   * @param target Nearest resolved `InteractionTarget` or `null`.
   * @param focusedPlot Currently zoomed `DollhousePlot`, or `null`.
   * @param canPlant Whether a purifying flower can currently be planted.
   * @param focusedBond Optional live `VillagerBondSnapshot` for the focused plot.
   * @param workshop Optional live `WorkshopPanelSnapshot` when visiting Pip's Workshop.
   * @throws Error Never thrown.
   * @example
   * hud.updateInteractionContext(target, focused, true, focusedBond, workshopSnap);
   */
  public updateInteractionContext(
    target: InteractionTarget | null,
    focusedPlot: DollhousePlot | null,
    canPlant: boolean,
    focusedBond: VillagerBondSnapshot | null = null,
    workshop: WorkshopPanelSnapshot | null = null,
  ): void {
    this.dock.updateInteractionContext(target, focusedPlot, canPlant);
    this.card.renderPlot(focusedPlot, focusedBond, workshop);
  }

  /**
   * Displays a short non-blocking feedback toast below the top bar.
   *
   * @param message Message to display.
   * @param color Optional border/text accent hex.
   * @example
   * hud.showToast('Purifying Bloom Planted!');
   */
  public showToast(message: string, color?: string): void {
    this.topBar.showToast(message, color);
  }

  /**
   * Advances time-based HUD feedback animations such as toast fade-out.
   *
   * @param deltaSeconds Frame delta in seconds.
   * @example
   * hud.tick(dt);
   */
  public tick(deltaSeconds: number): void {
    this.topBar.tick(deltaSeconds);
  }

  /**
   * Retrieves a named Babylon GUI control from the underlying `AdvancedDynamicTexture`.
   *
   * @param name Registered control name.
   * @returns Matching `Control` or `null`.
   * @example
   * const inspectBtn = hud.getControlByName('btn-inspect');
   */
  public getControlByName(name: string): Control | null {
    return this.adt.getControlByName(name);
  }

  /**
   * Disposes the Babylon GUI texture and all child controls.
   *
   * @example
   * hud.dispose();
   */
  public dispose(): void {
    this.adt.dispose();
  }
}
