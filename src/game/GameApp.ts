import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { BlueprintRegistry } from '../assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../assets/GltfPartProvider.ts';
import { ModularAssemblyFactory } from '../assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import { SimulationPipeline } from '../ecs/SimulationPipeline.ts';
import { DayNightRig } from '../engine/DayNightRig.ts';
import { DioramaCamera } from '../engine/DioramaCamera.ts';
import { InputController, type InputSnapshot } from '../engine/InputController.ts';
import { PhysicsWorld } from '../engine/PhysicsWorld.ts';
import { LootDropSystem } from '../entities/LootDropSystem.ts';
import { PlayerController } from '../entities/PlayerController.ts';
import { IslandEnvironment } from '../scene/IslandEnvironment.ts';
import {
  INTERACT_RANGE,
  MOUND_BORDER_PUSH,
  MOUND_PETAL_DROP,
  MOUND_SHARD_DROP,
} from '../systems/constants.ts';
import { InteractionResolver, type InteractionTarget } from '../systems/InteractionResolver.ts';
import { type PlantBlockReason, PlantingSystem } from '../systems/PlantingSystem.ts';
import { VillagerBondSystem } from '../systems/VillagerBondSystem.ts';
import { BabylonHud } from '../ui/BabylonHud.ts';
import { HUD_THEME, NEXT_PHASE_MAP } from '../ui/constants.ts';
import type { DollhousePlot, ResourceKey } from '../world/constants.ts';
import { CorruptionField } from '../world/CorruptionField.ts';
import { InventoryStore } from '../world/InventoryStore.ts';
import { IslandStrip } from '../world/IslandStrip.ts';
import { ResourceNodeCatalog } from '../world/ResourceNodeCatalog.ts';
import { TimeCycle } from '../world/TimeCycle.ts';

/**
 * Top-level composition root orchestrating Babylon rendering, Havok physics,
 * 1D island simulation, modular 3D assemblies, gathering, and Babylon GUI.
 */
export class GameApp {
  private static readonly MAX_DPR = 2;
  private static readonly MAX_FRAME_DT = 0.05;
  private static readonly RESOURCE_LABELS: Record<ResourceKey, string> = {
    wood: '🪵 Wood',
    stone: '🪨 Stone',
    petals: '🌸 Petals',
    shards: '✨ Shards',
  };

  private readonly canvas: HTMLCanvasElement;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly timeCycle = new TimeCycle();
  private readonly strip = new IslandStrip();
  private readonly corruption = new CorruptionField();
  private readonly inventory = new InventoryStore();
  private readonly resourceNodes = new ResourceNodeCatalog();
  private readonly ecs = new IslandEcsWorld();
  private readonly bonds = new VillagerBondSystem(this.ecs);
  private readonly resolver = new InteractionResolver();
  private readonly planting = new PlantingSystem();
  private readonly input = new InputController();
  private readonly hud: BabylonHud;

  private camera!: DioramaCamera;
  private lighting!: DayNightRig;
  private player!: PlayerController;
  private environment!: IslandEnvironment;
  private lootDrops!: LootDropSystem;
  private pipeline!: SimulationPipeline;
  private focusedDollhouse: DollhousePlot | null = null;
  private elapsedSeconds = 0;
  private lastDayNumber = 1;

  /**
   * Initializes the Babylon engine, scene, and fullscreen Babylon GUI HUD.
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
   * Releases listeners, loot drops, HUD bindings, scene resources, and engine.
   *
   * @example
   * app.dispose();
   */
  public dispose(): void {
    window.removeEventListener('resize', this._handleResize);
    this.lootDrops?.dispose();
    this.environment?.dispose();
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
    this._registerEcsEntities();
    this.lootDrops = new LootDropSystem(this.scene, this.ecs, physics, materials, this.lighting);
    this.environment = new IslandEnvironment(
      this.scene, assembly, blueprints, materials, physics, this.lighting,
      this.ecs, this.strip, this.corruption, this.resourceNodes,
    );
    this.pipeline = new SimulationPipeline({
      ecs: this.ecs,
      strip: this.strip,
      resources: this.resourceNodes,
      corruption: this.corruption,
      inventory: this.inventory,
      resolver: this.resolver,
      lootDrops: this.lootDrops,
      environment: this.environment,
    });
    const hero = assembly.assemble(blueprints.getHeroBlueprint(), 'player-hero');
    this.lighting.addShadowCasters(hero.getMeshes());
    this.player = new PlayerController(this.scene, physics, this.strip, materials, hero);
  }

  private _registerEcsEntities(): void {
    this.strip.getDollhousePlots().forEach((plot, idx) => {
      this.ecs.registerDollhouse(idx, `house-${plot.roleId}`, plot.x, INTERACT_RANGE);
      this.ecs.registerVillager(plot.roleId, `house-${plot.roleId}`, plot.x);
    });
    this.resourceNodes.getAllNodes().forEach((node, idx) =>
      this.ecs.registerResourceNode(idx, node.id, node.x, node.z, INTERACT_RANGE),
    );
    this.corruption.getMounds().forEach((mound, idx) =>
      this.ecs.registerPollutionMound(idx, mound.id, mound.x, INTERACT_RANGE),
    );
  }

  private _bindEvents(): void {
    this.input.attachKeyboard(window);
    this.hud.bindControls(this.input, () => this._cyclePhasePreview(), () => this._clearFocus(), {
      onHangOut: () => this._handleHangOut(),
      onGift: () => this._handleGift(),
      onFurnish: () => this._handleFurnish(),
    });
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
    const frame = this.pipeline.run(dt, this.elapsedSeconds, playerX);
    this._handleActions(frameInput, playerX, frame.target);
    this._notifyCollectedLoot(frame.collectedLoot);
    this._updateWorldAndHud(dt, playerX, frame.target);
    this.scene.render();
  }

  private _updateWorldAndHud(dt: number, playerX: number, target: InteractionTarget | null): void {
    const timeSnap = this.timeCycle.advance(dt);
    this._checkDayRegrowth(timeSnap.dayNumber);
    this.lighting.update(timeSnap, playerX);
    this.camera.update(dt, this._getAspectRatio(), playerX, this.focusedDollhouse?.x ?? null);
    this.hud.tick(dt);
    this.hud.updateStatus(
      timeSnap, this.strip.classifyZone(playerX), this.corruption.getPurityRatio(), this.inventory.getSnapshot(),
    );
    const focusedBond = this.focusedDollhouse
      ? this.bonds.getSnapshot(this.focusedDollhouse.roleId, this.inventory)
      : null;
    this.hud.updateInteractionContext(
      target, this.focusedDollhouse, this.planting.canPlantAt(playerX, this.inventory), focusedBond,
    );
  }

  private _handleActions(
    frameInput: InputSnapshot,
    playerX: number,
    target: InteractionTarget | null,
  ): void {
    if (this.focusedDollhouse && (target?.type !== 'dollhouse' || target.plot.roleId !== this.focusedDollhouse.roleId)) {
      this.focusedDollhouse = null;
    }
    if (frameInput.interactPressed) this._handleInteract(target);
    if (frameInput.plantPressed) this._handlePlant(playerX);
  }

  private _handleInteract(target: InteractionTarget | null): void {
    if (this.focusedDollhouse) {
      this.focusedDollhouse = null;
      return;
    }
    if (!target) return;
    if (target.type === 'dollhouse') {
      this.focusedDollhouse = target.plot;
      return;
    }
    if (target.type === 'resource') {
      this._harvestNode(target.id);
      return;
    }
    this._scrubMound(target.id);
  }

  private _harvestNode(id: string): void {
    const outcome = this.resourceNodes.hitNode(id);
    if (!outcome) return;
    if (outcome.depleted) this.ecs.setInteractableActive(id, false);
    this.environment.animateNodeHit(id, outcome.depleted);
    const dropCount = outcome.dropAmount + this.bonds.getHarvestBonus();
    this.lootDrops.spawnBurst(outcome.dropResource, dropCount, outcome.x, outcome.z, this.inventory);
  }

  private _scrubMound(id: string): void {
    const outcome = this.corruption.hitMound(id, this.bonds.getMoundHitDamage(), MOUND_BORDER_PUSH);
    if (!outcome) return;
    if (outcome.scrubbed) this.ecs.setInteractableActive(id, false);
    this.environment.animateMoundHit(id, outcome.scrubbed);
    if (!outcome.scrubbed) {
      this.hud.showToast('Scrubbing Corruption…', HUD_THEME.accentNeon);
      return;
    }
    const shards = MOUND_SHARD_DROP + this.bonds.getMoundShardBonus();
    this.lootDrops.spawnBurst('shards', shards, outcome.x, 2.2, this.inventory);
    this.lootDrops.spawnBurst('petals', MOUND_PETAL_DROP, outcome.x, 2.2, this.inventory);
    this.hud.showToast('Corruption Scrubbed! Border Pushed', HUD_THEME.accentSage);
  }

  private _handlePlant(playerX: number): void {
    const flora = this.planting.plantAt(playerX, this.inventory, this.corruption, this.bonds.getPlantPushMultiplier());
    if (flora) {
      this.environment.spawnPlantedFlora(flora);
      this.hud.showToast('Purifying Bloom Planted!', HUD_THEME.accentSage);
      return;
    }
    this._showPlantBlockReason(this.planting.getPlantBlockReason(playerX, this.inventory));
  }

  private _handleHangOut(): void {
    const plot = this.focusedDollhouse;
    if (!plot) return;
    const outcome = this.bonds.hangOut(plot.roleId, this.inventory);
    if (!outcome) return;
    this.environment.celebrateNpc(plot.roleId);
    const petalNote = outcome.bonusPetal > 0 ? ' · +1 🌸' : '';
    const msg = outcome.leveledUp
      ? `${plot.npcName} Bond Lv ${outcome.newLevel} Unlocked!`
      : `${plot.npcName} +${outcome.xpGained} XP${petalNote}`;
    this.hud.showToast(msg, outcome.leveledUp ? HUD_THEME.accentAmber : HUD_THEME.accentSage);
  }

  private _handleGift(): void {
    const plot = this.focusedDollhouse;
    if (!plot) return;
    const outcome = this.bonds.giveGift(plot.roleId, this.inventory);
    if (!outcome) {
      this.hud.showToast(`Need ${plot.affinityLabel}`, HUD_THEME.accentAmber);
      return;
    }
    this.environment.celebrateNpc(plot.roleId);
    const msg = outcome.leveledUp
      ? `${plot.npcName} Bond Lv ${outcome.newLevel} Unlocked!`
      : `Gifted ${plot.npcName} (+${outcome.xpGained} XP)`;
    this.hud.showToast(msg, HUD_THEME.accentAmber);
  }

  private _handleFurnish(): void {
    const plot = this.focusedDollhouse;
    if (!plot) return;
    const outcome = this.bonds.furnishRoom(plot.roleId, this.inventory);
    if (!outcome) return;
    this.environment.furnishDollhouse(plot.roleId, outcome.partId, outcome.paletteKey);
    const msg = outcome.leveledUp
      ? `${outcome.label} Built · Bond Lv ${outcome.newLevel}!`
      : `Placed ${outcome.label} in ${plot.roomTitle}`;
    this.hud.showToast(msg, HUD_THEME.accentSage);
  }

  private _showPlantBlockReason(reason: PlantBlockReason): void {
    const messages: Record<Exclude<PlantBlockReason, null>, string> = {
      town: 'Walk past Town Center to plant',
      spacing: 'Too close to another bloom',
      resources: 'Need 2 🌸 Petals to plant',
    };
    if (reason) this.hud.showToast(messages[reason], HUD_THEME.accentAmber);
  }

  private _notifyCollectedLoot(collected: Partial<Record<ResourceKey, number>>): void {
    const parts = (Object.entries(collected) as Array<[ResourceKey, number]>)
      .map(([key, count]) => `+${count} ${GameApp.RESOURCE_LABELS[key]}`);
    if (parts.length > 0) {
      this.hud.showToast(parts.join(' · '), HUD_THEME.accentAmber);
    }
  }

  private _checkDayRegrowth(dayNumber: number): void {
    if (dayNumber <= this.lastDayNumber) return;
    this.lastDayNumber = dayNumber;
    const count = this.resourceNodes.regrowAll();
    const dawnPetals = this.bonds.getDawnPetalBonus();
    if (dawnPetals > 0) this.inventory.add('petals', dawnPetals);
    if (count > 0) {
      for (const node of this.resourceNodes.getAllNodes()) {
        this.ecs.setInteractableActive(node.id, true);
      }
      this.environment.syncRegrowth(this.resourceNodes);
      const giftNote = dawnPetals > 0 ? ` (+${dawnPetals} 🌸)` : '';
      this.hud.showToast(`Dawn — Frontier Regrew!${giftNote}`, HUD_THEME.accentSage);
    }
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
