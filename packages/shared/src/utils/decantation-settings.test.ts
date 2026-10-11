import { describe, expect, it } from 'vitest';
import {
  DECANTATION_REFERENCE_TEMPERATURE_C,
  resolveDecantationSettings,
} from './decantation-settings.js';

const DEFAULTS = {
  densityMethod: 'API_MPMS_11_1_ADJUNCT',
  densityToleranceKgM3: 3,
  quantityTolerance: 0.2,
  settlingTimeMinutes: 30,
  densitySpecBands: {},
};

describe('resolveDecantationSettings', () => {
  it('applies the station defaults for an unset configuration', () => {
    expect(resolveDecantationSettings(undefined)).toEqual(DEFAULTS);
    expect(DECANTATION_REFERENCE_TEMPERATURE_C).toBe(15);
  });

  it('keeps valid station overrides and ignores malformed values', () => {
    expect(
      resolveDecantationSettings({
        densityMethod: 'OMC_TABLE_53B',
        densityToleranceKgM3: 4,
        quantityTolerance: 0.15,
        settlingTimeMinutes: 'soon',
        densitySpecBands: {
          'product-1': { minKgM3: 815, maxKgM3: 845 },
          'product-2': { minKgM3: 'low', maxKgM3: 860 },
        },
      }),
    ).toEqual({
      densityMethod: 'OMC_TABLE_53B',
      densityToleranceKgM3: 4,
      quantityTolerance: 0.15,
      settlingTimeMinutes: 30,
      densitySpecBands: {
        'product-1': { minKgM3: 815, maxKgM3: 845 },
      },
    });
  });

  it('applies defaults independently when stored settings are partially invalid', () => {
    expect(
      resolveDecantationSettings({ densityToleranceKgM3: -1, settlingTimeMinutes: 45 }),
    ).toEqual({
      ...DEFAULTS,
      settlingTimeMinutes: 45,
    });
  });
});
