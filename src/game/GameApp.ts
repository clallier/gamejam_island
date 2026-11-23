import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { BlueprintRegistry } from '../assets/BlueprintRegistry.ts';
import { GltfPartProvider } from '../assets/GltfPartProvider.ts';
import { ModularAssemblyFactory } from '../assets/ModularAssemblyFactory.ts';
import { ProceduralPartProvider } from '../assets/ProceduralPartProvider.ts';
import { StylizedMaterialFactory } from '../assets/StylizedMaterialFactory.ts';
import { SoundEffectRig } from '../audio/SoundEffectRig.ts';
import { BalanceSheet } from '../config/BalanceSheet.ts';
import { DEFENSE_KIND } from '../ecs/constants.ts';
import { IslandEcsWorld } from '../ecs/IslandEcsWorld.ts';
import { SimulationPipeline } from '../ecs/SimulationPipeline.ts';
import { DayNightRig } from '../engine/DayNightRig.ts';
import { DioramaCamera } from '../engine/DioramaCamera.ts';
import { InputController, type InputSnapshot } from '../engine/InputController.ts';
import { PhysicsWorld } from '../engine/PhysicsWorld.ts';
import { DustPuffSystem } from '../entities/DustPuffSystem.ts';
import { EnemyVisualSystem } from '../entities/EnemyVisualSystem.ts';
import { LootDropSystem } from '../entities/LootDropSystem.ts';
import { PlayerController } from '../entities/PlayerController.ts';
import { IslandEnvironment } from '../scene/IslandEnvironment.ts';
import {
  BARRICADE_BUILD_COST,
  INTERACT_RANGE,
  MOUND_BORDER_PUSH,
  MOUND_PETAL_DROP,
  MOUND_SHARD_DROP,
  TOWN_HEART_DAWN_HEAL,
  TURRET_BUILD_COST,
  TURRET_REPAIR_COST,
} from '../systems/constants.ts';
import { type DefenseBuildOutcome, DefenseStructureSystem } from '../systems/DefenseStructureSystem.ts';
import { EngineerBuildQueue } from '../systems/EngineerBuildQueue.ts';
import { InteractionResolver, type InteractionTarget } from '../systems/InteractionResolver.ts';
import { type PlantBlockReason, PlantingSystem } from '../systems/PlantingSystem.ts';
import { VillagerBondSystem } from '../systems/VillagerBondSystem.ts';
import { WaveCombatSystem } from '../systems/WaveCombatSystem.ts';
import { BabylonHud } from '../ui/BabylonHud.ts';
import { BalanceSheetDrawer } from '../ui/BalanceSheetDrawer.ts';
import { HUD_THEME, NEXT_PHASE_MAP } from '../ui/constants.ts';
import type { WorkshopActionKind, WorkshopPanelSnapshot } from '../ui/WorkshopPanelView.ts';
import type { DayPhase, DollhousePlot, ResourceKey } from '../world/constants.ts';
import { CorruptionField } from '../world/CorruptionField.ts';
import { InventoryStore } from '../world/InventoryStore.ts';
import { IslandStrip } from '../world/IslandStrip.ts';
import { ResourceNodeCatalog } from '../world/ResourceNodeCatalog.ts';
import { TimeCycle, type TimeSnapshot } from '../world/TimeCycle.ts';

/**
 * Top-level composition root orchestrating Babylon rendering, Havok physics,
 * 1D island simulation, modular 3D assemblies, gathering, and Babylon GUI.
 */
export class GameApp {
  private static readonly MAX_DPR = 2;
  private static readonly MAX_FRAME_DT = 0.05;
  private static readonly ENGINEER_SAFE_REPAIR_RADIUS = 5.0;
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
  private readonly balance = new BalanceSheet();
  private readonly bonds = new VillagerBondSystem(this.ecs, this.balance);
  private readonly defenses = new DefenseStructureSystem(this.ecs, this.strip.getDefenseSlots(), this.balance);
  private readonly waveCombat = new WaveCombatSystem(this.ecs, this.balance);
  private readonly engineerQueue = new EngineerBuildQueue(this.strip.getDollhousePlots()[0]?.x ?? -12.5, this.balance);
  private readonly resolver = new InteractionResolver();
  private readonly planting = new PlantingSystem();
  private readonly input = new InputController();
  private readonly audio = new SoundEffectRig();
  private readonly hud: BabylonHud;

  private camera!: DioramaCamera;
  private lighting!: DayNightRig;
  private player!: PlayerController;
  private environment!: IslandEnvironment;
  private lootDrops!: LootDropSystem;
  private enemyVisuals!: EnemyVisualSystem;
  private dustPuffs!: DustPuffSystem;
  private pipeline!: SimulationPipeline;
  private tuneDrawer: BalanceSheetDrawer | null = null;
  private unsubBalance: (() => void) | null = null;
  private focusedDollhouse: DollhousePlot | null = null;
  private elapsedSeconds = 0;
  private lastDayNumber = 1;
  private lastPhase: DayPhase = 'day';
  private shotAudioCooldown = 0;

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
    this.camera.snap(this._getAspectRatio(), this.player.getX(), this.player.getFacing());
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
    this.unsubBalance?.();
    this.unsubBalance = null;
    this.tuneDrawer?.dispose();
    this.tuneDrawer = null;
    this.lootDrops?.dispose();
    this.enemyVisuals?.dispose();
    this.dustPuffs?.dispose();
    this.environment?.dispose();
    this.input.dispose();
    this.audio.dispose();
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
    this.enemyVisuals = new EnemyVisualSystem(this.scene, this.ecs, assembly, blueprints, materials, this.lighting);
    this.dustPuffs = new DustPuffSystem(this.scene, materials);
    this.environment = new IslandEnvironment(
      this.scene, assembly, blueprints, materials, physics, this.lighting,
      this.ecs, this.strip, this.corruption, this.resourceNodes, this.balance,
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
      defenses: this.defenses,
    });
    const hero = assembly.assemble(blueprints.getHeroBlueprint(), 'player-hero');
    this.lighting.addShadowCasters(hero.getMeshes());
    this.player = new PlayerController(this.scene, physics, this.strip, materials, hero, this.balance);
  }

  private _registerEcsEntities(): void {
    this.strip.getDollhousePlots().forEach((plot, idx) => {
      this.ecs.registerDollhouse(idx, `house-${plot.roleId}`, plot.x, INTERACT_RANGE);
      this.ecs.registerVillager(plot.roleId, `house-${plot.roleId}`, plot.x);
    });
    this.strip.getDefenseSlots().forEach((slotX, idx) =>
      this.ecs.registerDefenseSlot(idx, `slot-${idx}`, slotX, INTERACT_RANGE),
    );
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
      onWorkshopAction: (slotIndex, action) => this._handleWorkshopAction(slotIndex, action),
    });
    this.hud.setOnRestart(() => this._restartIsland());
    this.hud.setOnToggleMute(() => this.hud.setMuted(this.audio.toggleMute()));
    this.tuneDrawer = new BalanceSheetDrawer(this.balance, this.canvas.parentElement);
    this.hud.setOnToggleTune(() => this.tuneDrawer?.toggle());
    this.unsubBalance = this.balance.subscribe(() => {
      this.environment.syncGridRuler();
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
    const frameInput = this.input.consumeSnapshot();
    if (this.waveCombat.isOver()) {
      this.hud.tick(dt);
      this.scene.render();
      return;
    }
    this.elapsedSeconds += dt;
    if (frameInput.tossPressed) this.audio.play('toss');
    const playerEvents = this.player.update(dt, frameInput);
    const playerX = this.player.getX();
    if (playerEvents.stepped) this.dustPuffs.spawnBurst(playerX, 0.12, 0, 2, 0.45, 1.4);
    if (playerEvents.landed) this.dustPuffs.spawnBurst(playerX, 0.12, 0, 5, 0.9, 2.0);
    const frame = this.pipeline.run(
      dt, this.elapsedSeconds, playerX, this.bonds.getEngineerResearchLevel(),
    );
    this._handleActions(frameInput, playerX, frame.target);
    this._notifyCollectedLoot(frame.collectedLoot);
    this._updateWorldAndHud(dt, frameInput, playerX, frame.target);
    this.scene.render();
  }

  private _updateWorldAndHud(
    dt: number,
    frameInput: InputSnapshot,
    playerX: number,
    target: InteractionTarget | null,
  ): void {
    const timeSnap = this.timeCycle.advance(dt);
    this._checkPhaseTransitions(timeSnap.phase, timeSnap.dayNumber);
    this._stepCombat(dt, frameInput, playerX, timeSnap);
    const inCombat = timeSnap.phase === 'night' || this.waveCombat.getActiveEnemyCount() > 0;
    this.lighting.update(timeSnap, playerX);
    this.camera.update(
      dt,
      this._getAspectRatio(),
      playerX,
      this.focusedDollhouse?.x ?? null,
      inCombat,
      this.player.getFacing(),
    );
    this.hud.tick(dt);
    const hudEnemyCount = this.waveCombat.getActiveEnemyCount() + this.waveCombat.getRemainingToSpawn();
    this.hud.updateStatus(
      timeSnap, this.strip.classifyZone(playerX), this.corruption.getPurityRatio(),
      this.inventory.getSnapshot(), this.waveCombat.getHeartHp(), hudEnemyCount,
    );
    this._refreshFocusedHud(target, playerX);
  }

  private _refreshFocusedHud(target: InteractionTarget | null, playerX: number): void {
    const focusedBond = this.focusedDollhouse
      ? this.bonds.getSnapshot(this.focusedDollhouse.roleId, this.inventory)
      : null;
    this.hud.updateInteractionContext(
      target, this.focusedDollhouse, this.planting.canPlantAt(playerX, this.inventory),
      focusedBond, this._buildWorkshopSnapshot(),
    );
  }

  private _stepCombat(
    dt: number,
    frameInput: InputSnapshot,
    playerX: number,
    timeSnap: TimeSnapshot,
  ): void {
    this.shotAudioCooldown = Math.max(0, this.shotAudioCooldown - dt);
    if (frameInput.tossPressed) {
      const hit = this.waveCombat.applyPlayerShot(playerX, this.player.getFacing());
      if (hit?.killed) this._spawnKillJuice(hit.x);
    }
    const res = this.waveCombat.step(
      dt, timeSnap.phase, timeSnap.dayNumber,
      this.bonds.getTurretFireRateMultiplier(), this.bonds.getDefenderBonusDamage(),
      this.corruption, playerX, this.player.getFacing(),
    );
    if (res.shots.length > 0 && this.shotAudioCooldown <= 0) {
      const hasBowShot = res.shots.some((s) => s.source === 'player');
      this.audio.play(hasBowShot ? 'bowShot' : 'turretShot');
      this.shotAudioCooldown = 0.08;
    }
    res.shots.forEach((s) => {
      this.enemyVisuals.spawnTracer(s.fromX, s.toX, s.source);
      if (s.source === 'defender') this.environment.triggerNpcAttack('defender', s.toX >= s.fromX ? 1 : -1);
    });
    res.slain.forEach((k) => this._spawnKillJuice(k.x));
    this._tryPlayerAutoDodge(playerX);
    this._stepRoadPropImpacts(dt);
    if (res.defenseDestroyed) this._syncAllDefenseVisuals('Defense Destroyed!');
    this.environment.setDefenderPatrolX(res.defenderPatrolX);
    this._stepEngineerQueue(dt);
    this.enemyVisuals.update(this.elapsedSeconds, dt);
    this.dustPuffs.update(dt);
    if (res.gameOver) this.audio.play('gameOver');
    this.hud.setGameOver(res.gameOver);
  }

  private _tryPlayerAutoDodge(playerX: number): void {
    const threatSide = this.waveCombat.findIncomingThreatSide(playerX);
    if (threatSide === 0) return;
    if (!this.player.triggerAutoDodge(threatSide, this.bonds.getAutoDodgeCooldown())) return;
    this.audio.play('jump');
    this.dustPuffs.spawnBurst(playerX, 0.15, 0, 6, 1.0, 2.4);
  }

  private _stepRoadPropImpacts(dt: number): void {
    const crates = this.environment.sampleMovingRoadCrates(dt);
    for (const crate of crates) {
      if (crate.emitDust) this.dustPuffs.spawnBurst(crate.x, 0.16, crate.z, 3, 0.75, 1.8);
    }
    this.waveCombat.applyPropImpacts(crates).forEach((k) => this._spawnKillJuice(k.x));
  }

  private _spawnKillJuice(x: number): void {
    this.enemyVisuals.spawnFirework(x);
    this.dustPuffs.spawnBurst(x, 0.25, 0, 4, 1.1, 2.6);
    this.lootDrops.spawnBurst('shards', 1, x, 0, this.inventory);
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
    if (target.type === 'defense') {
      this._interactDefense(target.slotIndex);
      return;
    }
    if (target.type === 'resource') {
      this._harvestNode(target.id);
      return;
    }
    this._scrubMound(target.id);
  }

  private _interactDefense(slotIndex: number): void {
    const resLv = this.bonds.getEngineerResearchLevel();
    const state = this.defenses.getSlotState(slotIndex);
    const outcome = this.defenses.interactSlot(slotIndex, this.inventory, resLv);
    if (!outcome) {
      this._showDefenseBlockToast(state.kind !== DEFENSE_KIND.EMPTY && state.hp >= state.maxHp, state.level, resLv);
      return;
    }
    this.environment.syncDefenseVisual(outcome.slotIndex, outcome.x, outcome.level, outcome.kind);
    this.audio.play('build');
    this.hud.showToast(this._formatDefenseOutcomeLabel(outcome), HUD_THEME.accentSage);
  }

  private _showDefenseBlockToast(fullOccupied: boolean, level: number, resLv: number): void {
    if (fullOccupied && level >= 3) {
      this.hud.showToast('Defense Max Lv 3', HUD_THEME.accentAmber);
      return;
    }
    const locked = fullOccupied && level < 3 && level >= resLv;
    this.hud.showToast(locked ? `Need Pip Bond Lv ${level + 1}` : 'Need Wood/Stone/Shards', HUD_THEME.accentAmber);
  }

  private _handleWorkshopAction(slotIndex: number, action: WorkshopActionKind): void {
    const outcome = this._executeWorkshopAction(slotIndex, action);
    if (!outcome) {
      this.hud.showToast('Need Wood/Stone/Shards or Pip Lv', HUD_THEME.accentAmber);
      return;
    }
    this.environment.syncDefenseVisual(outcome.slotIndex, outcome.x, outcome.level, outcome.kind);
    if (action === 'salvage') this.engineerQueue.cancel(slotIndex);
    else this.engineerQueue.enqueue(outcome.slotIndex, outcome.x);
    this.audio.play('build');
    this.hud.showToast(this._formatDefenseOutcomeLabel(outcome), HUD_THEME.accentSage);
    this._refreshDollhouseHud();
  }

  private _refreshDollhouseHud(): void {
    if (!this.focusedDollhouse) return;
    const target: InteractionTarget = {
      type: 'dollhouse',
      plot: this.focusedDollhouse,
      icon: '🏠',
      label: this.focusedDollhouse.npcName,
    };
    this._refreshFocusedHud(target, this.player.getX());
  }

  private _executeWorkshopAction(slotIndex: number, action: WorkshopActionKind): DefenseBuildOutcome | null {
    const resLv = this.bonds.getEngineerResearchLevel();
    if (action === 'barricade') return this.defenses.buildStructure(slotIndex, DEFENSE_KIND.BARRICADE, this.inventory);
    if (action === 'turret') return this.defenses.buildStructure(slotIndex, DEFENSE_KIND.TURRET, this.inventory);
    if (action === 'upgrade') return this.defenses.upgradeSlot(slotIndex, this.inventory, resLv);
    if (action === 'repair') return this.defenses.repairSlot(slotIndex, this.inventory);
    return this.defenses.salvageSlot(slotIndex, this.inventory);
  }

  private _formatDefenseOutcomeLabel(outcome: DefenseBuildOutcome): string {
    const noun = outcome.kind === DEFENSE_KIND.BARRICADE ? 'Wall' : 'Turret';
    if (outcome.action === 'salvaged') return 'Plinth Salvaged (+🪵1 🪨1)';
    if (outcome.action === 'repaired') return `${noun} Repaired!`;
    if (outcome.action === 'upgraded') return `${noun} Lv ${outcome.level}!`;
    return `${noun} Built!`;
  }

  private _buildWorkshopSnapshot(): WorkshopPanelSnapshot | null {
    if (this.focusedDollhouse?.roleId !== 'engineer') return null;
    const slots = this.defenses.getAllSlotStates();
    return {
      researchLevel: this.bonds.getEngineerResearchLevel(),
      slots,
      canAffordBarricade: this.inventory.canAfford(BARRICADE_BUILD_COST),
      canAffordTurret: this.inventory.canAfford(TURRET_BUILD_COST),
      canAffordRepair: this.inventory.canAfford(TURRET_REPAIR_COST),
      canAffordUpgradeBySlot: slots.map((s) => this.inventory.canAfford(this.defenses.getUpgradeCostForSlot(s.slotIndex))),
    };
  }

  private _stepEngineerQueue(dt: number): void {
    if (!this.engineerQueue.isBusy()) this._dispatchAutoRepair();
    const step = this.engineerQueue.step(dt);
    this.environment.setEngineerPatrolX(step.patrolX);
    if (step.hammerDir === 0 || step.completedX === null || step.completedSlot === null) return;
    this.environment.triggerNpcAttack('engineer', step.hammerDir);
    this.dustPuffs.spawnBurst(step.completedX, 0.35, 1.3, 6, 1.0, 2.2);
    this.audio.play('build');
    if (step.completedKind === 'repair') this._applyEngineerAutoRepair(step.completedSlot);
  }

  private _dispatchAutoRepair(): void {
    const pipX = this.engineerQueue.getCurrentX();
    let best: { slotIndex: number; x: number } | null = null;
    let bestDist = Infinity;
    for (const slot of this.defenses.getAllSlotStates()) {
      if (slot.kind === DEFENSE_KIND.EMPTY || slot.hp >= slot.maxHp) continue;
      if (this.waveCombat.hasEnemyNear(slot.x, GameApp.ENGINEER_SAFE_REPAIR_RADIUS)) continue;
      const dist = Math.abs(slot.x - pipX);
      if (dist < bestDist) {
        bestDist = dist;
        best = slot;
      }
    }
    if (best) this.engineerQueue.enqueue(best.slotIndex, best.x, 'repair');
  }

  private _applyEngineerAutoRepair(slotIndex: number): void {
    const fixed = this.defenses.repairSlotFree(slotIndex);
    if (!fixed) return;
    const noun = fixed.kind === DEFENSE_KIND.BARRICADE ? 'Wall' : 'Turret';
    this.hud.showToast(`Pip Repaired ${noun}!`, HUD_THEME.accentSage);
    this._refreshDollhouseHud();
  }

  private _syncAllDefenseVisuals(toastMessage?: string): void {
    this.strip.getDefenseSlots().forEach((slotX, idx) => {
      const slot = this.defenses.getSlotState(idx);
      if (slot.kind === DEFENSE_KIND.EMPTY) this.engineerQueue.cancel(idx);
      this.environment.syncDefenseVisual(idx, slotX, slot.level, slot.kind);
    });
    if (toastMessage) this.hud.showToast(toastMessage, HUD_THEME.accentNeon);
  }

  private _harvestNode(id: string): void {
    const outcome = this.resourceNodes.hitNode(id);
    if (!outcome) return;
    if (outcome.depleted) this.ecs.setInteractableActive(id, false);
    this.environment.animateNodeHit(id, outcome.depleted);
    this.audio.play('harvest');
    const dropCount = outcome.dropAmount + this.bonds.getHarvestBonus();
    this.lootDrops.spawnBurst(outcome.dropResource, dropCount, outcome.x, outcome.z, this.inventory);
  }

  private _scrubMound(id: string): void {
    const outcome = this.corruption.hitMound(id, this.bonds.getMoundHitDamage(), MOUND_BORDER_PUSH);
    if (!outcome) return;
    if (outcome.scrubbed) this.ecs.setInteractableActive(id, false);
    this.environment.animateMoundHit(id, outcome.scrubbed);
    this.audio.play('scrub');
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
      this.audio.play('plant');
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
    this.audio.play(outcome.leveledUp ? 'levelUp' : 'bond');
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
    this.audio.play(outcome.leveledUp ? 'levelUp' : 'bond');
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
    this.audio.play(outcome.leveledUp ? 'levelUp' : 'build');
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
      this.audio.play('pickup');
      this.hud.showToast(parts.join(' · '), HUD_THEME.accentAmber);
    }
  }

  private _checkPhaseTransitions(phase: DayPhase, dayNumber: number): void {
    if (phase !== this.lastPhase) {
      if (phase === 'night') this.audio.play('nightDrum');
      if (phase === 'dawn' && this.defenses.healSmartBarricadesAtDawn() > 0) {
        this._syncAllDefenseVisuals('Rune Walls Regenerated!');
      }
      this.lastPhase = phase;
    }
    this._checkDayRegrowth(dayNumber);
  }

  private _checkDayRegrowth(dayNumber: number): void {
    if (dayNumber <= this.lastDayNumber) return;
    this.lastDayNumber = dayNumber;
    this.waveCombat.healTownHeart(TOWN_HEART_DAWN_HEAL);
    this.audio.play('dawnChime');
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

  private _restartIsland(): void {
    this.focusedDollhouse = null;
    this.waveCombat.reset();
    this.engineerQueue.reset();
    this.environment.setEngineerPatrolX(null);
    this.environment.setDefenderPatrolX(null);
    this.defenses.resetAll();
    this._syncAllDefenseVisuals();
    this.hud.setGameOver(false);
    this.lastPhase = 'day';
    this.timeCycle.jumpToPhase('day');
    this.audio.play('dawnChime');
    this.hud.showToast('Island Restored — Defend Dawn!', HUD_THEME.accentSage);
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
