import {
  BALANCE_DEFAULTS,
  BALANCE_FIELDS,
  type BalanceFieldSpec,
  type BalanceKey,
  gridToWorld,
} from './constants.ts';

/**
 * Live runtime balance sheet storing grid-normalized gameplay parameters,
 * unit-to-world conversion, listener subscriptions, and CSV/JSON spreadsheet sync.
 */
export class BalanceSheet {
  private static readonly SPEC_BY_KEY = new Map<BalanceKey, BalanceFieldSpec>(
    BALANCE_FIELDS.map((spec) => [spec.key, spec]),
  );

  private readonly values: Record<BalanceKey, number>;
  private readonly listeners = new Set<() => void>();

  /**
   * Initializes a live `BalanceSheet` seeded with `BALANCE_DEFAULTS` and optional overrides.
   *
   * @param overrides Partial initial field overrides clamped to schema bounds.
   * @throws Error Never thrown.
   * @example
   * const sheet = new BalanceSheet({ bowRangeTiles: 4.0 });
   */
  public constructor(overrides?: Partial<Record<BalanceKey, number>>) {
    this.values = { ...BALANCE_DEFAULTS };
    if (overrides) {
      for (const [rawKey, rawVal] of Object.entries(overrides)) {
        if (rawVal !== undefined) this._writeField(rawKey as BalanceKey, rawVal);
      }
    }
  }

  /**
   * Reads the raw configured value (grid units, HP, seconds, or toggle flag) for `key`.
   *
   * @param key Registered `BalanceKey`.
   * @returns Current configured numeric value.
   * @throws Error Never thrown.
   * @example
   * const tiles = sheet.get('bowRangeTiles');
   */
  public get(key: BalanceKey): number {
    return this.values[key];
  }

  /**
   * Reads `key` converted into Babylon world meters when spatial (`isSpatial`), else raw value.
   *
   * @param key Registered `BalanceKey`.
   * @returns Value ready for simulation physics and combat math.
   * @throws Error Never thrown.
   * @example
   * const metersPerSec = sheet.getWorld('spriteSpeedTiles');
   */
  public getWorld(key: BalanceKey): number {
    const spec = BalanceSheet.SPEC_BY_KEY.get(key);
    const val = this.values[key];
    return spec?.isSpatial ? gridToWorld(val, this.values.gridUnitMeters) : val;
  }

  /**
   * Updates `key` with a finite value clamped to schema bounds and notifies subscribers if changed.
   *
   * @param key Target `BalanceKey`.
   * @param value Candidate numeric value (`NaN`/Infinity ignored).
   * @throws Error Never thrown.
   * @example
   * sheet.set('bowRangeTiles', 4.5);
   */
  public set(key: BalanceKey, value: number): void {
    if (!this._writeField(key, value)) return;
    this._emit();
  }

  /**
   * Resets all fields back to `BALANCE_DEFAULTS` and notifies subscribers.
   *
   * @throws Error Never thrown.
   * @example
   * sheet.reset();
   */
  public reset(): void {
    Object.assign(this.values, BALANCE_DEFAULTS);
    this._emit();
  }

  /**
   * Registers a callback invoked whenever any balance parameter changes or resets.
   *
   * @param listener Change listener callback.
   * @returns Unsubscribe function.
   * @throws Error Never thrown.
   * @example
   * const off = sheet.subscribe(() => refreshUi());
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Exports all balance rows in CSV format (`Group,Key,Value,Unit,WorldMeters`) for spreadsheets.
   *
   * @returns Multi-line CSV string.
   * @throws Error Never thrown.
   * @example
   * const csv = sheet.toCsv();
   */
  public toCsv(): string {
    const lines = ['Group,Key,Value,Unit,WorldMeters'];
    for (const spec of BALANCE_FIELDS) {
      const val = this.values[spec.key];
      const world = this.getWorld(spec.key);
      lines.push(`${spec.group},${spec.key},${val},${spec.unit},${Number(world.toFixed(3))}`);
    }
    return lines.join('\n');
  }

  /**
   * Imports balance overrides from a JSON object or CSV text (`Group,Key,Value,...` or `Key,Value`).
   *
   * @param raw CSV or JSON string pasted from a spreadsheet or backup.
   * @returns Count of recognized fields successfully updated.
   * @throws Error Never thrown; malformed input safely returns `0`.
   * @example
   * const count = sheet.importCsvOrJson('bowRangeTiles,4.2');
   */
  public importCsvOrJson(raw: string): number {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const applied = trimmed.startsWith('{')
      ? this._applyJsonText(trimmed)
      : this._applyCsvLines(trimmed.split(/\r?\n/));
    if (applied > 0) this._emit();
    return applied;
  }

  /**
   * Returns the immutable field schema list used by tuning UI and CSV tools.
   *
   * @returns Read-only array of `BalanceFieldSpec`.
   * @throws Error Never thrown.
   * @example
   * const fields = sheet.getSchema();
   */
  public getSchema(): readonly BalanceFieldSpec[] {
    return BALANCE_FIELDS;
  }

  private _writeField(key: BalanceKey, value: number): boolean {
    const spec = BalanceSheet.SPEC_BY_KEY.get(key);
    if (!spec || !Number.isFinite(value)) return false;
    const clamped = Math.max(spec.min, Math.min(spec.max, value));
    if (this.values[key] === clamped) return false;
    this.values[key] = clamped;
    return true;
  }

  private _applyJsonText(raw: string): number {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
      let count = 0;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && this._writeField(k as BalanceKey, v)) count++;
      }
      return count;
    } catch {
      return 0;
    }
  }

  private _applyCsvLines(lines: readonly string[]): number {
    let count = 0;
    for (const line of lines) {
      const cells = line.split(/[,\t]/).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
      const [keyCell, valCell] = cells.length >= 3 && !BalanceSheet.SPEC_BY_KEY.has(cells[0] as BalanceKey)
        ? [cells[1], cells[2]]
        : [cells[0], cells[1]];
      if (!keyCell || !valCell) continue;
      if (this._writeField(keyCell as BalanceKey, Number(valCell))) count++;
    }
    return count;
  }

  private _emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const defaultBalanceSheet = new BalanceSheet();
