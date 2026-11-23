import { describe, expect, it } from 'vitest';
import { BalanceSheet } from '../../src/config/BalanceSheet.ts';
import { EngineerBuildQueue } from '../../src/systems/EngineerBuildQueue.ts';

describe('EngineerBuildQueue', () => {
  it('walks Pip briskly to commissioned plinths, hammers on arrival, processes queues, and returns home', () => {
    const balance = new BalanceSheet();
    const queue = new EngineerBuildQueue(-12.5, balance);

    expect(queue.isBusy()).toBe(false);
    expect(queue.getCurrentX()).toBe(-12.5);
    expect(queue.step(0.1)).toEqual({
      patrolX: null,
      hammerDir: 0,
      completedSlot: null,
      completedX: null,
      completedKind: null,
    });

    // Enqueue slot 0 (-27.5) and deduplicate duplicate slot 0, then add slot 2 (+20)
    queue.enqueue(0, Number.NaN);
    queue.enqueue(0, -27.5);
    expect(queue.isBusy()).toBe(true);
    queue.enqueue(0, -27.5);
    queue.enqueue(2, 20, 'repair');

    // Walk left toward -27.5
    let arrived = null;
    for (let i = 0; i < 40; i++) {
      const step = queue.step(0.1);
      expect(step.patrolX).not.toBeNull();
      if (step.completedSlot !== null) {
        arrived = step;
        break;
      }
    }
    expect(arrived).toMatchObject({
      hammerDir: -1,
      completedSlot: 0,
      completedX: -27.5,
      completedKind: 'commission',
    });

    // Finish 0.35s hammer swing then head right toward slot 2 (+20)
    expect(queue.step(0.2).hammerDir).toBe(0);
    expect(queue.step(0.2).patrolX).not.toBeNull();

    let arrivedSecond = null;
    for (let i = 0; i < 120; i++) {
      const step = queue.step(0.1);
      if (step.completedSlot !== null) {
        arrivedSecond = step;
        break;
      }
    }
    expect(arrivedSecond).toMatchObject({
      hammerDir: 1,
      completedSlot: 2,
      completedX: 20,
      completedKind: 'repair',
    });

    // Finish second hammer swing and return home to -12.5
    queue.step(0.4);
    let returned = false;
    for (let i = 0; i < 100; i++) {
      if (queue.step(0.1).patrolX === null) {
        returned = true;
        break;
      }
    }
    expect(returned).toBe(true);

    // Reset clears pending trips cleanly
    queue.enqueue(1, -20);
    expect(queue.step(0.1).patrolX).not.toBeNull();
    queue.reset();
    expect(queue.step(0.1).patrolX).toBeNull();
  });

  it('clamps non-finite dt, interrupts return walks, and cancels queued or active jobs cleanly', () => {
    const balance = new BalanceSheet();
    const queue = new EngineerBuildQueue(-12.5, balance);

    // Non-finite and negative dt behave safely as 0
    queue.enqueue(0, -27.5);
    const nanStep = queue.step(Number.NaN);
    expect(nanStep).toEqual({ patrolX: -12.5, hammerDir: 0, completedSlot: null, completedX: null, completedKind: null });
    expect(queue.step(-0.5).patrolX).toBe(-12.5);

    // Enqueue second and third job, then cancel queued job 1
    queue.enqueue(1, -20);
    queue.enqueue(2, 20);
    queue.cancel(1);

    // Cancel active job 0 mid-walk -> promotes job 2 immediately
    queue.step(0.2);
    queue.cancel(0);
    let reachedSlot2 = false;
    for (let i = 0; i < 150; i++) {
      const s = queue.step(0.1);
      if (s.completedSlot === 2) {
        reachedSlot2 = true;
        break;
      }
    }
    expect(reachedSlot2).toBe(true);

    // Duplicate enqueue while hammerTimer > 0 is ignored; cancelling active job during hammer starts return home
    queue.enqueue(2, 20);
    queue.cancel(2);
    const returnStep = queue.step(0.1);
    expect(returnStep.patrolX).not.toBeNull();
    expect(returnStep.completedSlot).toBeNull();

    // Enqueue while returning interrupts return walk toward new job
    queue.enqueue(3, 27.5);
    const interrupted = queue.step(0.1);
    expect(interrupted.patrolX).toBeGreaterThan(returnStep.patrolX!);
  });
});
