import type { BalanceFieldSpec, BalanceKey } from '../config/constants.ts';
import type { BalanceSheet } from '../config/BalanceSheet.ts';

interface RowBinding {
  readonly spec: BalanceFieldSpec;
  readonly rangeInput: HTMLInputElement;
  readonly numInput: HTMLInputElement;
  readonly worldLabel: HTMLSpanElement;
}

/**
 * Collapsible HTML/CSS live balance spreadsheet overlay allowing real-time
 * tweaking of grid units, speeds, ranges, and damages while playing,
 * plus CSV/JSON copy-paste sync with external spreadsheets.
 */
export class BalanceSheetDrawer {
  private static readonly ROOT_CLASS = 'balance-drawer';

  private readonly balance: BalanceSheet;
  private readonly host: HTMLElement | null;
  private readonly root: HTMLElement | null = null;
  private readonly rows: RowBinding[] = [];
  private readonly statusEl: HTMLSpanElement | null = null;
  private readonly pasteArea: HTMLTextAreaElement | null = null;
  private readonly pasteBox: HTMLElement | null = null;
  private readonly unsubBalance: () => void;
  private visible = false;

  /**
   * Mounts the hidden balance tuning drawer into `container` (or `document.body`).
   *
   * @param balance Shared live `BalanceSheet`.
   * @param container Optional DOM host element; defaults to `document.body` when in browser.
   * @throws Error Never thrown; safely no-ops when `document` is unavailable.
   * @example
   * const drawer = new BalanceSheetDrawer(balanceSheet);
   */
  public constructor(balance: BalanceSheet, container?: HTMLElement | null) {
    this.balance = balance;
    this.host = container ?? (typeof document !== 'undefined' ? document.body : null);
    this.unsubBalance = this.balance.subscribe(() => this._syncAllRows());
    if (!this.host || typeof document === 'undefined') return;
    const built = this._buildDom();
    this.root = built.root;
    this.statusEl = built.statusEl;
    this.pasteArea = built.pasteArea;
    this.pasteBox = built.pasteBox;
    this.host.appendChild(this.root);
    window.addEventListener('keydown', this._handleKeyDown);
  }

  /**
   * Toggles visibility of the balance spreadsheet drawer.
   *
   * @throws Error Never thrown.
   * @example
   * drawer.toggle();
   */
  public toggle(): void {
    this.setVisible(!this.visible);
  }

  /**
   * Explicitly shows or hides the balance spreadsheet drawer.
   *
   * @param nextVisible `true` to show the drawer, `false` to hide.
   * @throws Error Never thrown.
   * @example
   * drawer.setVisible(true);
   */
  public setVisible(nextVisible: boolean): void {
    this.visible = nextVisible;
    if (!this.root) return;
    this.root.hidden = !nextVisible;
    if (nextVisible) this._syncAllRows();
  }

  /**
   * Reports whether the balance spreadsheet drawer is currently open.
   *
   * @returns `true` when open, else `false`.
   * @throws Error Never thrown.
   * @example
   * if (drawer.isVisible()) drawer.toggle();
   */
  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Unsubscribes listeners and removes the drawer DOM node cleanly.
   *
   * @throws Error Never thrown.
   * @example
   * drawer.dispose();
   */
  public dispose(): void {
    this.visible = false;
    this.unsubBalance();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this._handleKeyDown);
    this.root?.remove();
    this.rows.length = 0;
  }

  private readonly _handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
    if (event.code === 'F2' || event.code === 'Backquote') {
      event.preventDefault();
      this.toggle();
    }
  };

  private _buildDom(): {
    root: HTMLElement;
    statusEl: HTMLSpanElement;
    pasteBox: HTMLElement;
    pasteArea: HTMLTextAreaElement;
  } {
    const root = this._el('aside', BalanceSheetDrawer.ROOT_CLASS);
    root.hidden = true;
    const pasteArea = document.createElement('textarea');
    const pasteBox = this._buildPasteBox(pasteArea);
    const header = this._buildHeader(pasteBox);
    root.appendChild(header.bar);
    root.appendChild(pasteBox);
    root.appendChild(this._buildRowsContainer());
    return { root, statusEl: header.statusEl, pasteBox, pasteArea };
  }

  private _buildHeader(pasteBox: HTMLElement): { bar: HTMLElement; statusEl: HTMLSpanElement } {
    const bar = this._el('div', 'balance-drawer__header');
    const title = this._el('strong', 'balance-drawer__title', '⚙ Live Balance Sheet');
    const statusEl = this._el('span', 'balance-drawer__status');
    const actions = this._el('div', 'balance-drawer__actions');
    actions.append(
      this._makeBtn('Copy CSV', () => this._copyCsv()),
      this._makeBtn('Import', () => { pasteBox.hidden = !pasteBox.hidden; }),
      this._makeBtn('Reset', () => { this.balance.reset(); this._setStatus('Reset!'); }),
      this._makeBtn('✕', () => this.setVisible(false)),
    );
    bar.append(title, statusEl, actions);
    return { bar, statusEl };
  }

  private _buildPasteBox(textarea: HTMLTextAreaElement): HTMLElement {
    const box = this._el('div', 'balance-drawer__paste');
    box.hidden = true;
    textarea.className = 'balance-drawer__textarea';
    textarea.placeholder = 'Paste CSV rows or JSON overrides...';
    const applyBtn = this._makeBtn('Apply CSV/JSON', () => this._applyPaste());
    box.append(textarea, applyBtn);
    return box;
  }

  private _buildRowsContainer(): HTMLElement {
    const body = this._el('div', 'balance-drawer__body');
    let currentGroup = '';
    for (const spec of this.balance.getSchema()) {
      if (spec.group !== currentGroup) {
        currentGroup = spec.group;
        body.appendChild(this._el('div', 'balance-drawer__group', currentGroup));
      }
      body.appendChild(this._buildRow(spec));
    }
    return body;
  }

  private _buildRow(spec: BalanceFieldSpec): HTMLElement {
    const row = this._el('div', 'balance-drawer__row');
    const label = this._el('label', 'balance-drawer__label', `${spec.label} (${spec.unit})`);
    const rangeInput = this._makeInput('range', spec);
    const numInput = this._makeInput('number', spec);
    const worldLabel = this._el('span', 'balance-drawer__world');
    const binding: RowBinding = { spec, rangeInput, numInput, worldLabel };
    numInput.addEventListener('change', () => this._syncRow(binding, true));
    this.rows.push(binding);
    this._syncRow(binding, true);
    row.append(label, rangeInput, numInput, worldLabel);
    return row;
  }

  private _makeInput(type: 'range' | 'number', spec: BalanceFieldSpec): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.className = type === 'range' ? 'balance-drawer__range' : 'balance-drawer__num';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.addEventListener('input', () => this._onRawFieldEdit(spec.key, input.value));
    return input;
  }

  private _onRawFieldEdit(key: BalanceKey, rawValue: string): void {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    this.balance.set(key, parsed);
    this._setStatus('');
  }

  private _syncAllRows(): void {
    for (const binding of this.rows) this._syncRow(binding);
  }

  private _syncRow(binding: RowBinding, forceNum = false): void {
    const val = this.balance.get(binding.spec.key);
    binding.rangeInput.value = String(val);
    if (forceNum || typeof document === 'undefined' || document.activeElement !== binding.numInput) {
      binding.numInput.value = String(val);
    }
    binding.worldLabel.textContent = binding.spec.isSpatial
      ? `= ${this.balance.getWorld(binding.spec.key).toFixed(2)}m`
      : '';
  }

  private _copyCsv(): void {
    const csv = this.balance.toCsv();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(csv).catch(() => {});
    }
    if (this.pasteArea && this.pasteBox) {
      this.pasteArea.value = csv;
      this.pasteBox.hidden = false;
    }
    this._setStatus('CSV ready!');
  }

  private _applyPaste(): void {
    if (!this.pasteArea || !this.pasteBox) return;
    const count = this.balance.importCsvOrJson(this.pasteArea.value);
    this._setStatus(count > 0 ? `Applied ${count}` : 'No valid keys');
    if (count > 0) this.pasteBox.hidden = true;
  }

  private _setStatus(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  private _makeBtn(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'balance-drawer__btn';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private _el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = '',
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
  }
}
