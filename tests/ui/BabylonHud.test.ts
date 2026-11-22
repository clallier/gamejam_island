import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { Button } from '@babylonjs/gui/2D/controls/button.js';
import { Control } from '@babylonjs/gui/2D/controls/control.js';
import type { Rectangle } from '@babylonjs/gui/2D/controls/rectangle.js';
import type { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel.js';
import type { TextBlock } from '@babylonjs/gui/2D/controls/textBlock.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputController } from '../../src/engine/InputController.ts';
import { BabylonHud } from '../../src/ui/BabylonHud.ts';
import { HUD_THEME } from '../../src/ui/constants.ts';
import { DOLLHOUSE_PLOTS, INITIAL_INVENTORY } from '../../src/world/constants.ts';
import { TimeCycle } from '../../src/world/TimeCycle.ts';

function createCanvasStub() {
  const ctx = {
    save() {},
    restore() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    rect() {},
    ellipse() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    quadraticCurveTo() {},
    fill() {},
    stroke() {},
    clip() {},
    translate() {},
    scale() {},
    rotate() {},
    setTransform() {},
    fillText() {},
    strokeText() {},
    measureText: (t: string) => ({ width: t.length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return { width: 512, height: 512, getContext: () => ctx };
}

describe('BabylonHud (@babylonjs/gui)', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  function createHudHarness() {
    const engine = new NullEngine();
    (engine as unknown as { createCanvas: () => unknown }).createCanvas = createCanvasStub;
    const scene = new Scene(engine);
    new FreeCamera('cam', new Vector3(0, 5, -10), scene);
    const hud = new BabylonHud(scene);
    hud.resize(390, 844);
    const input = new InputController();
    cleanups.push(() => {
      hud.dispose();
      input.dispose();
      scene.dispose();
      engine.dispose();
    });
    return { scene, hud, input };
  }

  it('updates phase, zone, purity bar, and resource counters inside Babylon GUI', () => {
    const { scene, hud } = createHudHarness();
    const clock = new TimeCycle();
    const nightSnap = clock.jumpToPhase('night');
    hud.updateStatus(nightSnap, 'frontier', 0.72, { ...INITIAL_INVENTORY, wood: 14 });
    scene.render();

    expect((hud.getControlByName('hud-phase') as TextBlock).text).toBe('Day 1 · Night');
    expect((hud.getControlByName('phase-btn-label') as TextBlock).text).toBe('☀ Preview Dawn');
    expect((hud.getControlByName('hud-zone') as TextBlock).text).toBe('Frontier Wilds');
    expect((hud.getControlByName('purity-text') as TextBlock).text).toBe('72%');
    expect((hud.getControlByName('purity-label') as TextBlock).fontSizeInPixels).toBe(
      (hud.getControlByName('purity-text') as TextBlock).fontSizeInPixels,
    );
    expect((hud.getControlByName('btn-toss-icon') as TextBlock).color).toBe(HUD_THEME.textPrimary);
    expect((hud.getControlByName('res-wood') as TextBlock).text).toBe('🪵14');
  });

  it('toggles contextual action button, plant button, dollhouse card, and toast fade', () => {
    const { hud } = createHudHarness();
    const engineerPlot = DOLLHOUSE_PLOTS[0]!;

    hud.updateInteractionContext(null, null, false);
    const inspectBtn = hud.getControlByName('btn-inspect') as Button;
    const plantBtn = hud.getControlByName('btn-plant') as Button;
    const card = hud.getControlByName('dollhouse-card') as Rectangle;
    const cardStack = hud.getControlByName('dollhouse-card-stack') as StackPanel;
    expect(inspectBtn.isEnabled).toBe(false);
    expect(plantBtn.alpha).toBeLessThan(0.8);
    expect(card.isVisible).toBe(false);
    expect(cardStack.widthInPixels).toBeLessThan(card.widthInPixels);

    hud.updateInteractionContext({ type: 'resource', id: 'n1', x: 24, kind: 'tree_pine', icon: '🪓', label: 'Chop' }, null, true);
    expect(inspectBtn.isEnabled).toBe(true);
    expect(plantBtn.alpha).toBe(1);
    expect((hud.getControlByName('btn-inspect-label') as TextBlock).text).toBe('Chop');

    hud.updateInteractionContext({ type: 'dollhouse', plot: engineerPlot, icon: '🏠', label: engineerPlot.npcName }, engineerPlot, false);
    expect(card.isVisible).toBe(true);
    expect((hud.getControlByName('card-room-title') as TextBlock).text).toBe('Cozy Workshop');
    expect((hud.getControlByName('btn-inspect-label') as TextBlock).text).toBe('Exit');

    hud.showToast('+2 Wood');
    const toast = hud.getControlByName('hud-toast') as Rectangle;
    expect(toast.isVisible).toBe(true);
    hud.tick(2.2);
    expect(toast.isVisible).toBe(false);
  });

  it('triggers callbacks and InputController actions from GUI pointer observables', () => {
    const { hud, input } = createHudHarness();
    const onCycle = vi.fn();
    const onClose = vi.fn();
    const onTune = vi.fn();
    hud.bindControls(input, onCycle, onClose);
    hud.setOnToggleTune(onTune);

    const cycleBtn = hud.getControlByName('btn-cycle-phase') as Button;
    const tuneBtn = hud.getControlByName('btn-tune-sheet') as Button;
    const closeBtn = hud.getControlByName('btn-close-card') as Button;
    const leftBtn = hud.getControlByName('btn-left') as Button;
    const tossBtn = hud.getControlByName('btn-toss') as Button;
    const plantBtn = hud.getControlByName('btn-plant') as Button;

    cycleBtn.onPointerClickObservable.notifyObservers(null as never);
    tuneBtn.onPointerClickObservable.notifyObservers(null as never);
    closeBtn.onPointerClickObservable.notifyObservers(null as never);
    leftBtn.onPointerDownObservable.notifyObservers(null as never);
    tossBtn.onPointerDownObservable.notifyObservers(null as never);
    plantBtn.onPointerDownObservable.notifyObservers(null as never);

    const snap = input.consumeSnapshot();
    expect(onCycle).toHaveBeenCalledTimes(1);
    expect(onTune).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(snap.moveX).toBe(-1);
    expect(snap.tossPressed).toBe(true);
    expect(snap.plantPressed).toBe(true);
  });

  it('renders live bond metadata and triggers hang-out, gift, and furnish callbacks on dollhouse card', () => {
    const { hud, input } = createHudHarness();
    const engineerPlot = DOLLHOUSE_PLOTS[0]!;
    const onHangOut = vi.fn();
    const onGift = vi.fn();
    const onFurnish = vi.fn();
    hud.bindControls(input, vi.fn(), vi.fn(), { onHangOut, onGift, onFurnish });

    hud.updateInteractionContext(
      { type: 'dollhouse', plot: engineerPlot, icon: '🏠', label: engineerPlot.npcName },
      engineerPlot,
      false,
      {
        roleId: 'engineer',
        level: 2,
        xp: 40,
        xpText: '40/80 XP',
        furnitureStage: 1,
        hangoutLabel: 'Tinker',
        giftLabel: 'Gift 🪵2',
        canGift: true,
        furnishLabel: 'Decorate (2/2)',
        canFurnish: false,
        isFurnishMaxed: false,
        activePerkLabel: '✓ Lv2: +1 Harvest Drop · Next Lv3: +1 Harvest & +25% Turrets',
      },
    );

    expect((hud.getControlByName('card-npc-meta') as TextBlock).text).toContain('♥ Lv 2 (40/80 XP)');
    expect((hud.getControlByName('btn-card-hangout-label') as TextBlock).text).toBe('Tinker');
    expect((hud.getControlByName('btn-card-furnish') as Button).isEnabled).toBe(false);

    (hud.getControlByName('btn-card-hangout') as Button).onPointerClickObservable.notifyObservers(null as never);
    (hud.getControlByName('btn-card-gift') as Button).onPointerClickObservable.notifyObservers(null as never);
    (hud.getControlByName('btn-card-furnish') as Button).onPointerClickObservable.notifyObservers(null as never);

    expect(onHangOut).toHaveBeenCalledTimes(1);
    expect(onGift).toHaveBeenCalledTimes(1);
    expect(onFurnish).toHaveBeenCalledTimes(1);
  });

  it('displays Town Heart HP, night enemy counts, and triggers onRestart from the game-over banner', () => {
    const { hud } = createHudHarness();
    const onRestart = vi.fn();
    hud.setOnRestart(onRestart);

    const nightSnap = new TimeCycle().jumpToPhase('night');
    hud.updateStatus(nightSnap, 'defense', 0.6, INITIAL_INVENTORY, 45, 4);
    expect((hud.getControlByName('hud-heart') as TextBlock).text).toBe('❤ 45');
    expect((hud.getControlByName('hud-phase') as TextBlock).text).toContain('👾 4');

    hud.setGameOver(true);
    const banner = hud.getControlByName('hud-gameover-banner') as Rectangle;
    expect(banner.isVisible).toBe(true);
    (hud.getControlByName('btn-restart-island') as Button).onPointerClickObservable.notifyObservers(null as never);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('adapts compact vs desktop layout, handles NaN resize/metrics, and renders fallback or maxed dollhouse cards', () => {
    const { hud } = createHudHarness();
    const tossBtn = hud.getControlByName('btn-toss') as Button;
    const promptPill = hud.getControlByName('dock-prompt') as Rectangle;
    const card = hud.getControlByName('dollhouse-card') as Rectangle;
    const metricsRow = hud.getControlByName('hud-metrics-row') as StackPanel;

    // Compact portrait (320px) hides toss & desktop keyboard prompt and left-aligns metrics row
    hud.resize(320, 640);
    expect(tossBtn.isVisible).toBe(false);
    expect(promptPill.isVisible).toBe(false);
    expect(card.horizontalAlignment).toBe(Control.HORIZONTAL_ALIGNMENT_CENTER);
    expect(metricsRow.horizontalAlignment).toBe(Control.HORIZONTAL_ALIGNMENT_LEFT);

    // Desktop (1280px) shows toss & prompt and right-aligns card & metrics row
    hud.resize(1280, 720);
    expect(tossBtn.isVisible).toBe(true);
    expect(promptPill.isVisible).toBe(true);
    expect(card.horizontalAlignment).toBe(Control.HORIZONTAL_ALIGNMENT_RIGHT);
    expect(metricsRow.horizontalAlignment).toBe(Control.HORIZONTAL_ALIGNMENT_RIGHT);

    // Non-finite resize & status metrics never throw or render NaN text
    expect(() => hud.resize(Number.NaN, Number.POSITIVE_INFINITY)).not.toThrow();
    hud.updateStatus(new TimeCycle().getSnapshot(), 'town', Number.NaN, INITIAL_INVENTORY, Number.NaN, 0);
    expect((hud.getControlByName('hud-heart') as TextBlock).text).toBe('❤ 0');
    expect((hud.getControlByName('purity-text') as TextBlock).text).toBe('0%');

    // DollhouseCardView fallback when bond is null and maxed furnish state when bond is Lv 3
    const plot = DOLLHOUSE_PLOTS[1]!;
    hud.updateInteractionContext({ type: 'dollhouse', plot, icon: '🏠', label: plot.npcName }, plot, false, null);
    expect((hud.getControlByName('card-npc-meta') as TextBlock).text).toContain('Bond Lv 1');
    expect((hud.getControlByName('btn-card-hangout') as Button).isEnabled).toBe(false);

    hud.updateInteractionContext(
      { type: 'dollhouse', plot, icon: '🏠', label: plot.npcName },
      plot,
      false,
      {
        roleId: 'medic',
        level: 3,
        xp: 90,
        xpText: 'MAX',
        furnitureStage: 2,
        hangoutLabel: 'Sun-Tea',
        giftLabel: 'Gift 🌸2',
        canGift: false,
        furnishLabel: 'Decor Maxed',
        canFurnish: false,
        isFurnishMaxed: true,
        activePerkLabel: '★ Lv3: 1.8× Push & +2 Dawn 🌸',
      },
    );
    expect((hud.getControlByName('btn-card-hangout') as Button).isEnabled).toBe(true);
    expect((hud.getControlByName('btn-card-gift') as Button).isEnabled).toBe(false);
    expect((hud.getControlByName('btn-card-furnish') as Button).isEnabled).toBe(false);
    expect((hud.getControlByName('btn-card-furnish-label') as TextBlock).text).toBe('Decor Maxed');

    // Toast alpha fades smoothly before disappearing
    hud.showToast('Saved');
    const toast = hud.getControlByName('hud-toast') as Rectangle;
    hud.tick(1.55);
    expect(toast.isVisible).toBe(true);
    expect(toast.alpha).toBeCloseTo(0.5, 2);
    hud.tick(1.0);
    expect(toast.isVisible).toBe(false);
    // Tick when toast hidden is a safe no-op
    hud.tick(0.5);

    // Clearing focused plot hides dollhouse card
    hud.updateInteractionContext(null, null, false, null);
    expect(card.isVisible).toBe(false);
  });

  it('releases directional holds on pointer up/out and ignores disabled interact taps', () => {
    const { hud, input } = createHudHarness();
    const onClose = vi.fn();
    hud.bindControls(input, vi.fn(), onClose);

    const rightBtn = hud.getControlByName('btn-right') as Button;
    const inspectBtn = hud.getControlByName('btn-inspect') as Button;

    // Disabled inspect button does not queue interact tap
    hud.updateInteractionContext(null, null, false);
    inspectBtn.onPointerDownObservable.notifyObservers(null as never);
    expect(input.consumeSnapshot().interactPressed).toBe(false);

    // Right hold activates on down and releases on up and out
    rightBtn.onPointerDownObservable.notifyObservers(null as never);
    expect(input.consumeSnapshot().moveX).toBe(1);
    rightBtn.onPointerUpObservable.notifyObservers(null as never);
    expect(input.consumeSnapshot().moveX).toBe(0);

    rightBtn.onPointerDownObservable.notifyObservers(null as never);
    rightBtn.onPointerOutObservable.notifyObservers(null as never);
    expect(input.consumeSnapshot().moveX).toBe(0);
  });

  it('toggles audio mute glyph and invokes onToggleMute callback from btn-mute-audio', () => {
    const { hud } = createHudHarness();
    const onMute = vi.fn();
    hud.setOnToggleMute(onMute);

    const muteBtn = hud.getControlByName('btn-mute-audio') as Button;
    const muteLabel = hud.getControlByName('btn-mute-audio-label') as TextBlock;
    expect(muteLabel.text).toBe('🔊');

    muteBtn.onPointerClickObservable.notifyObservers(null as never);
    expect(onMute).toHaveBeenCalledTimes(1);

    hud.setMuted(true);
    expect(muteLabel.text).toBe('🔇');
    hud.setMuted(false);
    expect(muteLabel.text).toBe('🔊');
  });
});
