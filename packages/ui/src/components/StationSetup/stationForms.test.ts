import { describe, expect, it } from 'vitest';
import type { Station } from '@pump/shared';
import {
  decantationGuidanceSchema,
  stationBrandingBody,
  stationBrandingSchema,
  stationBrandingValues,
  stationGeneralBody,
  stationGeneralSchema,
  stationGeneralValues,
  withDensityBand,
} from './stationForms.js';

const station: Station = {
  id: 'st-1',
  organizationId: 'org-1',
  name: 'Highway Fuels',
  code: 'HF',
  address: null,
  phone: '+91 98470 12345',
  onboardingStatus: 'READY_FOR_OPERATIONS',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  settings: {
    timezone: 'Asia/Dubai',
    business_day_starts_at: '05:00',
    shift_grace_minutes: 10,
    shift_lock_grace_days: 3,
    offline_warning_days: 3,
    offline_critical_days: 7,
    legal: { legalName: 'Highway Fuels LLP', gstin: '32ABCDE1234F1Z5' },
  },
};

describe('Station forms (#604)', () => {
  it('starts each form from the saved station, with the page defaults', () => {
    expect(stationGeneralValues(station)).toEqual({
      name: 'Highway Fuels',
      code: 'HF',
      address: '',
      phone: '+91 98470 12345',
      graceMinutes: 10,
      timezone: 'Asia/Dubai',
      businessDayStartsAt: '05:00',
    });
    expect(stationGeneralValues(null)).toMatchObject({
      graceMinutes: 15,
      timezone: 'Asia/Kolkata',
      businessDayStartsAt: '06:00',
    });
    expect(stationBrandingValues(station)).toMatchObject({
      legalName: 'Highway Fuels LLP',
      gstin: '32ABCDE1234F1Z5',
      stateCode: '',
      logoDataUrl: null,
    });
  });

  it('validates General: name and code, whole non-negative minutes, HH:MM', () => {
    const ok = stationGeneralValues(station);
    expect(stationGeneralSchema.parse({ ...ok, code: 'hf2' }).code).toBe('HF2');
    const issues = (v: object) =>
      stationGeneralSchema.safeParse({ ...ok, ...v }).error?.issues.map((i) => i.path[0]);
    expect(issues({ name: 'H' })).toEqual(['name']);
    expect(issues({ code: '' })).toEqual(['code']);
    expect(issues({ graceMinutes: -1 })).toEqual(['graceMinutes']);
    expect(issues({ graceMinutes: Number.NaN })).toEqual(['graceMinutes']);
    expect(issues({ businessDayStartsAt: '25:00' })).toEqual(['businessDayStartsAt']);
  });

  it('validates Branding: blanks allowed, else GSTIN 15, state 2 digits, pincode 6 digits', () => {
    const ok = stationBrandingValues(null);
    expect(stationBrandingSchema.safeParse(ok).success).toBe(true);
    expect(stationBrandingSchema.parse({ ...ok, gstin: '32abcde1234f1z5' }).gstin).toBe(
      '32ABCDE1234F1Z5',
    );
    const bad = (v: object) => stationBrandingSchema.safeParse({ ...ok, ...v }).success;
    expect(bad({ gstin: '32ABC' })).toBe(false);
    expect(bad({ stateCode: 'K' })).toBe(false);
    expect(bad({ pincode: '5600' })).toBe(false);
  });

  it('builds the bodies the API already takes, settings merged over the saved ones', () => {
    const general = stationGeneralBody(station, {
      ...stationGeneralValues(station),
      graceMinutes: 20,
    });
    expect(general.settings).toMatchObject({
      timezone: 'Asia/Dubai',
      shift_grace_minutes: 20,
      legal: station.settings.legal,
      shift_lock_grace_days: 3,
    });
    // The onboarding status is read-only on this page: never sent from it.
    expect('onboardingStatus' in general).toBe(false);
    const branding = stationBrandingBody(
      station,
      stationBrandingSchema.parse(stationBrandingValues(station)),
    );
    expect(branding.settings.legal).toMatchObject({ stateCode: null, pincode: null });
    expect(branding.settings.timezone).toBe('Asia/Dubai');
  });

  it('keeps density bands tidy and refuses a minimum above the maximum', () => {
    expect(withDensityBand({}, 'p', 'minKgM3', '720')).toEqual({ p: { minKgM3: 720 } });
    expect(withDensityBand({ p: { minKgM3: 720 } }, 'p', 'minKgM3', '')).toEqual({});
    const base = {
      densityMethod: 'API_MPMS_11_1_ADJUNCT',
      densityEntryMethod: 'HYDROMETER',
      densityToleranceKgM3: 3,
      quantityTolerance: 0.2,
      settlingTimeMinutes: 30,
    };
    expect(
      decantationGuidanceSchema.safeParse({
        ...base,
        densitySpecBands: { p: { minKgM3: 780, maxKgM3: 720 } },
      }).success,
    ).toBe(false);
    expect(
      decantationGuidanceSchema.safeParse({ ...base, densitySpecBands: { p: { minKgM3: 720 } } })
        .success,
    ).toBe(true);
  });
});
