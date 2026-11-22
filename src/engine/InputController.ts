export type HoldAction = 'left' | 'right';
export type TapAction = 'jump' | 'interact' | 'toss' | 'plant';

export interface InputSnapshot {
  readonly moveX: number;
  readonly jumpPressed: boolean;
  readonly interactPressed: boolean;
  readonly tossPressed: boolean;
  readonly plantPressed: boolean;
}

/**
 * UI-agnostic input aggregator unifying desktop keyboard events and
 * Babylon GUI touch/pointer button controls into a per-frame `InputSnapshot`.
 */
export class InputController {
  private static readonly LEFT_KEYS = new Set(['ArrowLeft', 'KeyA', 'KeyQ']);
  private static readonly RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
  private static readonly JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ']);
  private static readonly INTERACT_KEYS = new Set(['KeyE', 'KeyF', 'Enter']);
  private static readonly TOSS_KEYS = new Set(['KeyJ', 'KeyK', 'ShiftLeft', 'ShiftRight']);
  private static readonly PLANT_KEYS = new Set(['KeyP']);

  private readonly activeKeys = new Set<string>();
  private readonly activeHolds = new Set<HoldAction>();
  private jumpQueued = false;
  private interactQueued = false;
  private tossQueued = false;
  private plantQueued = false;
  private readonly cleanups: Array<() => void> = [];

  /**
   * Attaches global keyboard listeners on the provided window target.
   *
   * @param target Global `Window` event target. Defaults to `window`.
   * @example
   * input.attachKeyboard(window);
   */
  public attachKeyboard(target: Window = window): void {
    const onDown = (e: KeyboardEvent) => this._handleKeyDown(e);
    const onUp = (e: KeyboardEvent) => this.activeKeys.delete(e.code);
    const onBlur = () => this._clearAll();
    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    target.addEventListener('blur', onBlur);
    this.cleanups.push(() => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    });
  }

  /**
   * Updates directional hold state driven by HUD pointer/touch buttons.
   *
   * @param action Directional hold action (`'left' | 'right'`).
   * @param active Whether the control is currently pressed.
   * @example
   * input.setHoldState('left', true);
   */
  public setHoldState(action: HoldAction, active: boolean): void {
    if (active) {
      this.activeHolds.add(action);
      return;
    }
    this.activeHolds.delete(action);
  }

  /**
   * Queues a single-frame discrete action tap (`'jump' | 'interact' | 'toss' | 'plant'`).
   *
   * @param action Action identifier to queue for the next frame snapshot.
   * @example
   * input.triggerTap('jump');
   */
  public triggerTap(action: TapAction): void {
    if (action === 'jump') this.jumpQueued = true;
    else if (action === 'interact') this.interactQueued = true;
    else if (action === 'plant') this.plantQueued = true;
    else this.tossQueued = true;
  }

  /**
   * Reads horizontal movement axis and consumes queued one-shot button taps.
   *
   * @returns Current frame `InputSnapshot`.
   * @example
   * const frameInput = input.consumeSnapshot();
   */
  public consumeSnapshot(): InputSnapshot {
    const snapshot: InputSnapshot = {
      moveX: this._computeMoveX(),
      jumpPressed: this.jumpQueued,
      interactPressed: this.interactQueued,
      tossPressed: this.tossQueued,
      plantPressed: this.plantQueued,
    };
    this.jumpQueued = false;
    this.interactQueued = false;
    this.tossQueued = false;
    this.plantQueued = false;
    return snapshot;
  }

  /**
   * Detaches all registered keyboard listeners and resets active holds.
   *
   * @example
   * input.dispose();
   */
  public dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this._clearAll();
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    this.activeKeys.add(e.code);
    if (InputController.JUMP_KEYS.has(e.code)) this.triggerTap('jump');
    if (InputController.INTERACT_KEYS.has(e.code)) this.triggerTap('interact');
    if (InputController.TOSS_KEYS.has(e.code)) this.triggerTap('toss');
    if (InputController.PLANT_KEYS.has(e.code)) this.triggerTap('plant');
  }

  private _computeMoveX(): number {
    const left = this.activeHolds.has('left') || this._hasAnyKey(InputController.LEFT_KEYS);
    const right = this.activeHolds.has('right') || this._hasAnyKey(InputController.RIGHT_KEYS);
    return (right ? 1 : 0) - (left ? 1 : 0);
  }

  private _hasAnyKey(codes: Set<string>): boolean {
    for (const code of codes) {
      if (this.activeKeys.has(code)) return true;
    }
    return false;
  }

  private _clearAll(): void {
    this.activeKeys.clear();
    this.activeHolds.clear();
  }
}
