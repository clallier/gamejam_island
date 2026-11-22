import '@babylonjs/core/Layers/layer.js';
import '@babylonjs/core/Layers/layerSceneComponent.js';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture.js';
import type { Control } from '@babylonjs/gui/2D/controls/control.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { InputController } from '../engine/InputController.ts';
import type { DollhousePlot, IslandZone, ResourceKey } from '../world/constants.ts';
import type { TimeSnapshot } from '../world/TimeCycle.ts';
import { DollhouseCardView } from './DollhouseCardView.ts';
import { HudLayout } from './HudLayout.ts';
import { TopBarView } from './TopBarView.ts';
import { TouchDockView } from './TouchDockView.ts';

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
   * @example
   * hud.bindControls(input, () => cycleNextPhase(), () => clearFocus());
   */
  public bindControls(
    input: InputController,
    onCyclePhase: () => void,
    onCloseCard: () => void,
  ): void {
    this.dock.bindInput(input);
    this.topBar.setOnCyclePhase(onCyclePhase);
    this.card.setOnClose(onCloseCard);
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
    const safeWidth = Math.max(320, Math.round(width));
    const safeHeight = Math.max(320, Math.round(height));
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
   * @example
   * hud.updateStatus(timeSnap, 'town', 0.55, inventory);
   */
  public updateStatus(
    time: TimeSnapshot,
    zone: IslandZone,
    purityRatio: number,
    inventory: Record<ResourceKey, number>,
  ): void {
    this.topBar.updateStatus(time, zone, purityRatio, inventory);
  }

  /**
   * Updates contextual dollhouse inspect button and cutaway preview card.
   *
   * @param nearbyPlot Nearest `DollhousePlot` within interaction range, or `null`.
   * @param focusedPlot Currently zoomed `DollhousePlot`, or `null`.
   * @example
   * hud.updateDollhouseContext(nearby, focused);
   */
  public updateDollhouseContext(
    nearbyPlot: DollhousePlot | null,
    focusedPlot: DollhousePlot | null,
  ): void {
    this.dock.updateInspectButton(nearbyPlot, focusedPlot);
    this.card.renderPlot(focusedPlot);
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
