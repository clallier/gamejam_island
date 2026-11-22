import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { Button } from '@babylonjs/gui/2D/controls/button.js';
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
    hud.bindControls(input, onCycle, onClose);

    const cycleBtn = hud.getControlByName('btn-cycle-phase') as Button;
    const closeBtn = hud.getControlByName('btn-close-card') as Button;
    const leftBtn = hud.getControlByName('btn-left') as Button;
    const tossBtn = hud.getControlByName('btn-toss') as Button;
    const plantBtn = hud.getControlByName('btn-plant') as Button;

    cycleBtn.onPointerClickObservable.notifyObservers(null as never);
    closeBtn.onPointerClickObservable.notifyObservers(null as never);
    leftBtn.onPointerDownObservable.notifyObservers(null as never);
    tossBtn.onPointerDownObservable.notifyObservers(null as never);
    plantBtn.onPointerDownObservable.notifyObservers(null as never);

    const snap = input.consumeSnapshot();
    expect(onCycle).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(snap.moveX).toBe(-1);
    expect(snap.tossPressed).toBe(true);
    expect(snap.plantPressed).toBe(true);
  });
});
