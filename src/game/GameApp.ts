import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { BlueprintRegistry } from '../assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../assets/GltfPartProvider.ts';
import { ModularAssemblyFactory } from '../assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import { DayNightRig } from '../engine/DayNightRig.ts';
import { DioramaCamera } from '../engine/DioramaCamera.ts';
import { InputController } from '../engine/InputController.ts';
import { PhysicsWorld } from '../engine/PhysicsWorld.ts';
import { PlayerController } from '../entities/PlayerController.ts';
import { IslandEnvironment } from '../scene/IslandEnvironment.ts';
import { BabylonHud } from '../ui/BabylonHud.ts';
import { NEXT_PHASE_MAP } from '../ui/constants.ts';
import { type DollhousePlot, INITIAL_INVENTORY } from '../world/constants.ts';
import { CorruptionField } from '../world/CorruptionField.ts';
import { IslandStrip } from '../world/IslandStrip.ts';
import { TimeCycle } from '../world/TimeCycle.ts';

/**
 * Top-level composition root orchestrating Babylon rendering, Havok physics,
 * 1D island simulation, modular 3D assemblies, and responsive mobile HUD.
 */
export class GameApp {
  private static readonly MAX_DPR = 2;
  private static readonly MAX_FRAME_DT = 0.05;

  private readonly canvas: HTMLCanvasElement;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly timeCycle = new TimeCycle();
  private readonly strip = new IslandStrip();
  private readonly corruption = new CorruptionField();
  private readonly input = new InputController();
  private readonly hud: BabylonHud;
  private readonly inventory = { ...INITIAL_INVENTORY };

  private camera!: DioramaCamera;
  private lighting!: DayNightRig;
  private player!: PlayerController;
  private environment!: IslandEnvironment;
  private focusedDollhouse: DollhousePlot | null = null;
  private elapsedSeconds = 0;

  /**
   * Initializes the Babylon engine and scene bound to the target canvas.
   *
   * @param canvas Target HTML `<canvas>` element.
   * @example
   * const app = new GameApp(canvas);
   * await app.start();
   */
  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, GameApp.MAX_DPR);
    this.engine = new Engine(canvas, true, { adaptToDeviceRatio: true });
    this.engine.setHardwareScalingLevel(1 / dpr);
    this.scene = new Scene(this.engine);
    this.hud = new BabylonHud(this.scene);
  }

  /**
   * Boots Havok physics, builds the modular diorama scene, and starts rendering.
   *
   * @returns Promise settling once the render loop is running.
   * @example
   * await app.start();
   */
  public async start(): Promise<void> {
    const physics = new PhysicsWorld(this.scene);
    await physics.initialize();
    await this._composeScene(physics);
    this._bindEvents();
    this._resizeHud();
    this.camera.snap(this._getAspectRatio(), this.player.getX());
    this.engine.runRenderLoop(() => this._tick());
  }

  /**
   * Releases listeners, HUD bindings, scene resources, and Babylon engine.
   *
   * @example
   * app.dispose();
   */
  public dispose(): void {
    window.removeEventListener('resize', this._handleResize);
    this.input.dispose();
    this.hud.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  private async _composeScene(physics: PhysicsWorld): Promise<void> {
    const materials = new StylizedMaterialFactory(this.scene);
    const blueprints = new BlueprintRegistry();
    const procedural = new ProceduralPartProvider(this.scene, materials);
    const gltf = new GltfPartProvider(this.scene, procedural);
    await gltf.preloadAll();
    const assembly = new ModularAssemblyFactory(this.scene, gltf);
    this.lighting = new DayNightRig(this.scene, materials);
    this.camera = new DioramaCamera(this.scene);
    this.environment = new IslandEnvironment(
      this.scene, assembly, blueprints, materials, physics, this.lighting, this.strip, this.corruption,
    );
    const hero = assembly.assemble(blueprints.getHeroBlueprint(), 'player-hero');
    this.lighting.addShadowCasters(hero.getMeshes());
    this.player = new PlayerController(this.scene, physics, this.strip, materials, hero);
  }

  private _bindEvents(): void {
    this.input.attachKeyboard(window);
    this.hud.bindControls(this.input, () => this._cyclePhasePreview(), () => this._clearFocus());
    window.addEventListener('resize', this._handleResize);
  }

  private readonly _handleResize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, GameApp.MAX_DPR);
    this.engine.setHardwareScalingLevel(1 / dpr);
    this.engine.resize();
    this._resizeHud();
  };

  private _tick(): void {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, GameApp.MAX_FRAME_DT);
    this.elapsedSeconds += dt;
    const frameInput = this.input.consumeSnapshot();
    this.player.update(dt, frameInput);
    const playerX = this.player.getX();
    const nearby = this.strip.findNearestDollhouse(playerX);
    this._updateDollhouseFocus(frameInput.interactPressed, nearby);
    const timeSnap = this.timeCycle.advance(dt);
    this.lighting.update(timeSnap, playerX);
    this.environment.update(this.elapsedSeconds, dt, playerX, this.corruption);
    this.camera.update(dt, this._getAspectRatio(), playerX, this.focusedDollhouse?.x ?? null);
    this.hud.updateStatus(timeSnap, this.strip.classifyZone(playerX), this.corruption.getPurityRatio(), this.inventory);
    this.hud.updateDollhouseContext(nearby, this.focusedDollhouse);
    this.scene.render();
  }

  private _updateDollhouseFocus(interactPressed: boolean, nearby: DollhousePlot | null): void {
    if (this.focusedDollhouse && (!nearby || nearby.roleId !== this.focusedDollhouse.roleId)) {
      this.focusedDollhouse = null;
    }
    if (!interactPressed) return;
    if (this.focusedDollhouse) {
      this.focusedDollhouse = null;
      return;
    }
    if (nearby) this.focusedDollhouse = nearby;
  }

  private _cyclePhasePreview(): void {
    const current = this.timeCycle.getSnapshot().phase;
    this.timeCycle.jumpToPhase(NEXT_PHASE_MAP[current]);
  }

  private _clearFocus(): void {
    this.focusedDollhouse = null;
  }

  private _getAspectRatio(): number {
    const width = this.canvas.clientWidth || window.innerWidth || 1;
    const height = this.canvas.clientHeight || window.innerHeight || 1;
    return width / height;
  }

  private _resizeHud(): void {
    const width = this.canvas.clientWidth || window.innerWidth || 390;
    const height = this.canvas.clientHeight || window.innerHeight || 844;
    this.hud.resize(width, height);
  }
}
