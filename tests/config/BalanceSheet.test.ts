import { describe, expect, it, vi } from 'vitest';
import { BalanceSheet, defaultBalanceSheet } from '../../src/config/BalanceSheet.ts';
import {
  BALANCE_DEFAULTS,
  GRID_UNIT_M,
  gridToWorld,
  worldToGrid,
} from '../../src/config/constants.ts';

describe('Grid units & BalanceSheet', () => {
  it('converts cleanly between grid tiles and world meters', () => {
    expect(GRID_UNIT_M).toBe(2.5);
    expect(gridToWorld(2)).toBe(5);
    expect(worldToGrid(5)).toBe(2);
    expect(worldToGrid(5, 0)).toBe(5);
    expect(defaultBalanceSheet.get('bowRangeTiles')).toBe(BALANCE_DEFAULTS.bowRangeTiles);
  });

  it('supports live overrides, clamping, subscriptions, reset, and CSV/JSON sync', () => {
    const sheet = new BalanceSheet({ bowRangeTiles: 4.0, gridUnitMeters: 2.5, bowDamage: undefined });
    expect(sheet.getWorld('bowRangeTiles')).toBeCloseTo(10.0, 4);
    expect(sheet.getWorld('bowDamage')).toBe(BALANCE_DEFAULTS.bowDamage);
    expect(sheet.getSchema().length).toBeGreaterThan(20);

    // Dynamic gridUnitMeters rescales spatial fields cleanly
    sheet.set('gridUnitMeters', 3.0);
    expect(sheet.getWorld('bowRangeTiles')).toBeCloseTo(12.0, 4);
    sheet.set('gridUnitMeters', 2.5);

    const onUpdate = vi.fn();
    const unsub = sheet.subscribe(onUpdate);

    // Clamps out-of-range values and ignores NaN / identical writes
    sheet.set('bowRangeTiles', 999);
    expect(sheet.get('bowRangeTiles')).toBe(8.0);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    sheet.set('bowRangeTiles', Number.NaN);
    sheet.set('bowRangeTiles', Number.POSITIVE_INFINITY);
    sheet.set('bowRangeTiles', 8.0);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    // CSV export includes header and spatial world meters column
    const csv = sheet.toCsv();
    expect(csv).toContain('Group,Key,Value,Unit,WorldMeters');
    expect(csv).toContain('Player,bowRangeTiles,8,tiles,20');

    // JSON & CSV import updates multiple fields cleanly and ignores malformed/non-numeric entries
    expect(sheet.importCsvOrJson('')).toBe(0);
    expect(sheet.importCsvOrJson('{bad')).toBe(0);
    expect(sheet.importCsvOrJson('[1,2]')).toBe(0);
    expect(sheet.importCsvOrJson('null')).toBe(0);
    expect(sheet.importCsvOrJson(JSON.stringify({ bowDamage: '20', bowRangeTiles: null, __proto__: 99 }))).toBe(0);
    expect(sheet.importCsvOrJson(JSON.stringify({ spriteSpeedTiles: 1.5, bowDamage: 20 }))).toBe(2);
    expect(sheet.getWorld('spriteSpeedTiles')).toBeCloseTo(3.75, 4);
    expect(sheet.get('bowDamage')).toBe(20);

    expect(sheet.importCsvOrJson('Group,Key,Value,Unit,WorldMeters\n"Player","bowRangeTiles","3.0","tiles","7.5"\nbramSpearDamage,18\nbadKey,NaN\nbowDamage,Infinity')).toBe(2);
    expect(sheet.get('bowRangeTiles')).toBe(3.0);
    expect(sheet.get('bramSpearDamage')).toBe(18);

    // Reset restores canonical defaults and unsub stops notifications
    sheet.reset();
    expect(sheet.get('bowRangeTiles')).toBe(BALANCE_DEFAULTS.bowRangeTiles);
    unsub();
    const beforeCalls = onUpdate.mock.calls.length;
    sheet.set('bowDamage', 25);
    expect(onUpdate).toHaveBeenCalledTimes(beforeCalls);
  });
});
