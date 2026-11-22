// @vitest-environment happy-dom
import type { Button } from '@babylonjs/gui/2D/controls/button.js';
import type { TextBlock } from '@babylonjs/gui/2D/controls/textBlock.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { renderCallbacks } = vi.hoisted(() => ({
  renderCallbacks: [] as Array<() => void>,
}));

vi.mock('@babylonjs/core/Engines/engine.js', async () => {
  const { NullEngine } = await import('@babylonjs/core/Engines/nullEngine.js');
  const createCanvasCtxStub = () => {
    const ctx = {
      save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {},
      beginPath() {}, closePath() {}, rect() {}, ellipse() {}, moveTo() {}, lineTo() {},
      arc() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, clip() {},
      translate() {}, scale() {}, rotate() {}, setTransform() {},
      fillText() {}, strokeText() {},
      measureText: (t: string) => ({ width: t.length * 7 }),
      createLinearGradient: () => ({ addColorStop() {} }),
    };
    return { width: 512, height: 512, getContext: () => ctx };
  };
  class MockEngine extends NullEngine {
    public constructor() {
      super();
      (this as unknown as { createCanvas: () => unknown }).createCanvas = createCanvasCtxStub;
    }
    public override setHardwareScalingLevel(): void {}
    public override runRenderLoop(cb: () => void): void {
      renderCallbacks.push(cb);
    }
  }
  return { Engine: MockEngine };
});

vi.mock('@babylonjs/havok', async (importOriginal) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const actual = await importOriginal<{ default: (opts?: unknown) => Promise<unknown> }>();
  const wasmPath = path.resolve('node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm');
  const bytes = fs.readFileSync(wasmPath);
  const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return {
    default: () => actual.default({ wasmBinary }),
  };
});

import type { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { ENEMY_KIND } from '../../src/ecs/constants.ts';
import { GameApp } from '../../src/game/GameApp.ts';

describe('GameApp (composition root)', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    renderCallbacks.length = 0;
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  function stepFrames(count: number): void {
    const tick = renderCallbacks[renderCallbacks.length - 1]!;
    for (let i = 0; i < count; i++) tick();
  }

  it('boots, handles dollhouse bonds, planting, defense building, harvesting, scrubbing, day regrowth, game over, and restart', async () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 1280, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 720, configurable: true });
    const app = new GameApp(canvas);
    cleanups.push(() => app.dispose());

    await app.start();
    expect(renderCallbacks).toHaveLength(1);

    const internal = app as unknown as {
      engine: NullEngine;
      hud: {
        getControlByName: (name: string) => unknown;
      };
      input: {
        triggerTap: (a: 'jump' | 'interact' | 'toss' | 'plant') => void;
      };
      player: {
        collider: { position: { x: number } };
      };
      inventory: {
        add: (k: 'wood' | 'stone' | 'petals' | 'shards', n: number) => number;
        spend: (cost: Partial<Record<'wood' | 'stone' | 'petals' | 'shards', number>>) => boolean;
        getSnapshot: () => Record<'wood' | 'stone' | 'petals' | 'shards', number>;
      };
      ecs: {
        spawnEnemyEntity: (k: number, x: number, s: -1 | 1, hp: number, spd: number) => number;
        getEntityId: (id: string) => number | undefined;
        getComponents: () => { Defense: { hp: Float32Array } };
      };
      timeCycle: { advance: (dt: number) => unknown; jumpToPhase: (p: 'day' | 'dusk' | 'night' | 'dawn') => unknown };
      bonds: { hangOut: (role: 'medic', inv: unknown) => unknown; giveGift: (role: 'medic', inv: unknown) => unknown };
      environment: { roadCrates: Array<{ mesh: { physicsBody?: { setLinearVelocity: (v: unknown) => void } } }> };
    };
    vi.spyOn(internal.engine, 'getDeltaTime').mockReturnValue(25);
    internal.inventory.add('wood', 20);
    internal.inventory.add('stone', 20);
    internal.inventory.add('petals', 20);
    internal.inventory.add('shards', 20);

    // Resize, mute toggle, & cycle phase preview button
    window.dispatchEvent(new Event('resize'));
    const muteBtn = internal.hud.getControlByName('btn-mute-audio') as Button;
    muteBtn.onPointerClickObservable.notifyObservers(null as never);
    expect((internal.hud.getControlByName('btn-mute-audio-label') as TextBlock).text).toBe('🔇');
    muteBtn.onPointerClickObservable.notifyObservers(null as never);
    (internal.hud.getControlByName('btn-cycle-phase') as Button).onPointerClickObservable.notifyObservers(null as never);
    stepFrames(1);

    // Plant blocked in town center; empty inventory blocks gift & defense build & petal planting
    internal.player.collider.position.x = 0;
    internal.input.triggerTap('plant');
    stepFrames(1);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Walk past Town Center');

    const snapshot = internal.inventory.getSnapshot();
    internal.inventory.spend(snapshot);
    internal.player.collider.position.x = -13;
    internal.input.triggerTap('interact');
    stepFrames(1);
    (internal.hud.getControlByName('btn-card-gift') as Button).onPointerClickObservable.notifyObservers(null as never);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Need');
    // Walking away from dollhouse auto-clears focus
    internal.player.collider.position.x = -26;
    stepFrames(1);
    internal.input.triggerTap('interact');
    stepFrames(1);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Need Wood/Stone/Shards');
    internal.player.collider.position.x = 20;
    internal.input.triggerTap('plant');
    stepFrames(1);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Need 2 🌸 Petals');

    // Restore abundant resources for build/upgrade/bond/plant testing
    internal.inventory.add('wood', snapshot.wood + 20);
    internal.inventory.add('stone', snapshot.stone + 20);
    internal.inventory.add('petals', snapshot.petals + 20);
    internal.inventory.add('shards', snapshot.shards + 20);

    // Focus Engineer dollhouse, hang out, gift, furnish, and exit via close button
    internal.player.collider.position.x = -13;
    internal.input.triggerTap('interact');
    stepFrames(1);
    (internal.hud.getControlByName('btn-card-hangout') as Button).onPointerClickObservable.notifyObservers(null as never);
    (internal.hud.getControlByName('btn-card-gift') as Button).onPointerClickObservable.notifyObservers(null as never);
    (internal.hud.getControlByName('btn-card-furnish') as Button).onPointerClickObservable.notifyObservers(null as never);
    (internal.hud.getControlByName('btn-close-card') as Button).onPointerClickObservable.notifyObservers(null as never);

    // Build and upgrade defense slot 0
    internal.player.collider.position.x = -26;
    internal.input.triggerTap('interact');
    stepFrames(1);
    internal.input.triggerTap('interact');
    stepFrames(1);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Turret Lv 2');

    // Harvest right pine tree (x=32, away from defense slots and mounds) to depletion, then plant at x=24
    internal.player.collider.position.x = 32;
    for (let i = 0; i < 3; i++) {
      internal.input.triggerTap('interact');
      stepFrames(1);
    }
    internal.player.collider.position.x = 24;
    internal.input.triggerTap('plant');
    stepFrames(1);
    internal.input.triggerTap('plant');
    stepFrames(1);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Too close');

    // Scrub mound-right-inner (x=37) to completion
    internal.player.collider.position.x = 37;
    for (let i = 0; i < 3; i++) {
      internal.input.triggerTap('interact');
      stepFrames(1);
    }
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Corruption Scrubbed');

    // Level Medic to Lv 3 then advance past day wrap to trigger dawn regrowth + dawn petals toast
    for (let i = 0; i < 4; i++) internal.bonds.giveGift('medic', (internal as unknown as { inventory: unknown }).inventory);
    internal.timeCycle.advance(125);
    stepFrames(1);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Frontier Regrew');
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('+2 🌸');

    // Night combat: Defender spear attack + turret destruction toast + auto-dodge + crate impact
    internal.timeCycle.jumpToPhase('night');
    const slot0Eid = internal.ecs.getEntityId('slot-0')!;
    internal.ecs.getComponents().Defense.hp[slot0Eid] = 1;
    internal.ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, -26, -1, 100, 0);
    internal.ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, 5, 1, 24, 0);
    stepFrames(1);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Defense Destroyed');

    // Auto-dodge & crate impact during night combat
    internal.player.collider.position.x = 0;
    internal.ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, 1.5, 1, 24, 0);
    const { Vector3 } = await import('@babylonjs/core/Maths/math.vector.js');
    internal.environment.roadCrates[2]?.mesh.physicsBody?.setLinearVelocity(new Vector3(5, 0, 0));
    stepFrames(2);

    // Player toss hit + unguarded Town Heart breach while away -> game over freeze -> restart island
    internal.player.collider.position.x = 0;
    internal.ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_SPRITE, 3, 1, 10, 0);
    internal.input.triggerTap('toss');
    stepFrames(1);

    internal.player.collider.position.x = 30;
    internal.ecs.spawnEnemyEntity(ENEMY_KIND.GLOOM_BRUTE, 0.5, 1, 500, 0);
    vi.spyOn(internal.engine, 'getDeltaTime').mockReturnValue(50);
    for (let i = 0; i < 240; i++) stepFrames(1);
    expect((internal.hud.getControlByName('hud-gameover-banner') as { isVisible: boolean }).isVisible).toBe(true);
    // Game-over frozen frame tick renders HUD without advancing combat
    stepFrames(1);

    // Restart button restores active play
    (internal.hud.getControlByName('btn-restart-island') as Button).onPointerClickObservable.notifyObservers(null as never);
    expect((internal.hud.getControlByName('hud-gameover-banner') as { isVisible: boolean }).isVisible).toBe(false);
    expect((internal.hud.getControlByName('hud-toast-text') as TextBlock).text).toContain('Island Restored');
    stepFrames(1);
    expect((internal.hud.getControlByName('hud-gameover-banner') as { isVisible: boolean }).isVisible).toBe(false);
  });
});
