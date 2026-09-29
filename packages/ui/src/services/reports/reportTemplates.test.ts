import { describe, expect, it } from 'vitest';
import {
  REPORT_TEMPLATES,
  applyPreset,
  canMoveSection,
  enabledCount,
  moveSection,
  presetOf,
  reportConfigSettings,
  sectionsFromStation,
  templateById,
  toggleSection,
} from './reportTemplates.js';

const ss = templateById('shiftSummary');
const station = (report_config?: Record<string, unknown>) => ({
  id: 'st-1',
  settings: { legal: { gstin: 'X' }, ...(report_config ? { report_config } : {}) },
});

describe('sectionsFromStation', () => {
  it('lists every section, enabled first in saved order, header pinned first', () => {
    const list = sectionsFromStation(ss, station({ shiftSummary: ['nozzles', 'header', 'meta'] }));
    expect(list.map((s) => s.key).slice(0, 3)).toEqual(['header', 'nozzles', 'meta']);
    expect(list).toHaveLength(ss.defaults.length);
    expect(list.filter((s) => s.enabled).map((s) => s.key)).toEqual(['header', 'nozzles', 'meta']);
  });

  it('falls back to the defaults when nothing is saved', () => {
    const list = sectionsFromStation(ss, station());
    expect(list.every((s) => s.enabled)).toBe(true);
    expect(list.map((s) => s.key)).toEqual(ss.defaults);
  });
});

describe('presets', () => {
  it('sets the toggles and the default order', () => {
    const moved = moveSection(sectionsFromStation(ss, station()), 'signatures', -1);
    expect(moved.map((s) => s.key)).not.toEqual(ss.defaults);
    const compact = applyPreset(ss, 'compact');
    expect(compact.map((s) => s.key)).toEqual(ss.defaults);
    expect(compact.filter((s) => s.enabled).map((s) => s.key)).toEqual([
      'header',
      'meta',
      'nozzles',
      'cashRecon',
      'signatures',
    ]);
    expect(presetOf(ss, compact)).toBe('compact');
  });

  it('reads Full for the defaults and Custom after any edit', () => {
    const full = sectionsFromStation(ss, station());
    expect(presetOf(ss, full)).toBe('full');
    expect(presetOf(ss, toggleSection(full, 'warnings'))).toBeNull();
    expect(presetOf(ss, moveSection(full, 'warnings', 1))).toBeNull();
  });

  it('keeps the letterhead on in every preset', () => {
    for (const template of REPORT_TEMPLATES) {
      for (const preset of ['full', 'compact', 'cashDesk'] as const) {
        const list = applyPreset(template, preset);
        expect(list[0]).toEqual({ key: 'header', enabled: true });
      }
    }
  });
});

describe('locked letterhead', () => {
  it('cannot be turned off', () => {
    const list = sectionsFromStation(ss, station());
    expect(toggleSection(list, 'header')).toBe(list);
  });

  it('cannot be moved, and nothing can move above it', () => {
    const list = sectionsFromStation(ss, station());
    expect(canMoveSection(list, 'header', 1)).toBe(false);
    expect(moveSection(list, 'header', 1)).toBe(list);
    expect(canMoveSection(list, 'meta', -1)).toBe(false);
    expect(moveSection(list, 'meta', -1)).toBe(list);
  });
});

describe('reorder bounds', () => {
  it('moves one step and stops at the last row', () => {
    const list = sectionsFromStation(ss, station());
    const down = moveSection(list, 'meta', 1);
    expect(down.map((s) => s.key).slice(0, 3)).toEqual(['header', 'warnings', 'meta']);
    const last = list[list.length - 1].key;
    expect(canMoveSection(list, last, 1)).toBe(false);
    expect(moveSection(list, last, 1)).toBe(list);
    expect(canMoveSection(list, last, -1)).toBe(true);
  });
});

describe('save payload', () => {
  it('stores enabled keys in order and keeps the rest of settings and report_config', () => {
    const current = station({ dssr: ['header', 'kpis'], paper: 'A4', showLogo: true });
    const list = toggleSection(moveSection(sectionsFromStation(ss, current), 'meta', 1), 'drawers');
    const settings = reportConfigSettings(current, { shiftSummary: list, paper: 'LETTER' });
    expect(settings.legal).toEqual({ gstin: 'X' });
    expect(settings.report_config).toEqual({
      dssr: ['header', 'kpis'],
      shiftSummary: [
        'header',
        'warnings',
        'meta',
        'nozzles',
        'handovers',
        'terminals',
        'creditSales',
        'cashRecon',
        'signatures',
      ],
      paper: 'LETTER',
      showLogo: true,
    });
    expect(enabledCount(list)).toBe(9);
  });

  it('defaults paper to A4 and the logo to shown', () => {
    const settings = reportConfigSettings(station(), {});
    expect(settings.report_config).toEqual({ paper: 'A4', showLogo: true });
  });
});
