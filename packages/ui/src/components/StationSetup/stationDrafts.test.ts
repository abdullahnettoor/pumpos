import { describe, expect, it } from 'vitest';
import { brandingDraftOf, draftDiffers, generalDraftOf } from './stationDrafts.js';

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  code: 'HF',
  address: null,
  phone: '+91 98470 12345',
  onboardingStatus: 'READY_FOR_OPERATIONS',
  settings: {
    timezone: 'Asia/Dubai',
    business_day_starts_at: '05:00',
    shift_grace_minutes: 10,
    legal: { legalName: 'Highway Fuels LLP', gstin: '32ABCDE1234F1Z5' },
  },
} as any;

describe('Station form drafts (#604)', () => {
  it('builds each draft from the saved station, with the same defaults the form shows', () => {
    expect(generalDraftOf(station)).toEqual({
      name: 'Highway Fuels',
      code: 'HF',
      address: '',
      phone: '+91 98470 12345',
      graceMinutes: 10,
      timezone: 'Asia/Dubai',
      businessDayStartsAt: '05:00',
      onboardingStatus: 'READY_FOR_OPERATIONS',
    });
    expect(generalDraftOf(null)).toMatchObject({
      graceMinutes: 15,
      timezone: 'Asia/Kolkata',
      businessDayStartsAt: '06:00',
      onboardingStatus: 'NOT_STARTED',
    });
    expect(brandingDraftOf(station)).toMatchObject({
      legalName: 'Highway Fuels LLP',
      gstin: '32ABCDE1234F1Z5',
      stateCode: '',
      logoDataUrl: null,
    });
  });

  it('is clean until a value differs from the saved one', () => {
    const saved = generalDraftOf(station);
    expect(draftDiffers({ ...saved }, saved)).toBe(false);
    expect(draftDiffers({ ...saved, phone: '+91 98470 00000' }, saved)).toBe(true);
    // Typing a value back to what was saved makes the form clean again.
    expect(draftDiffers({ ...saved, phone: '+91 98470 12345' }, saved)).toBe(false);
    expect(draftDiffers({ ...saved, graceMinutes: Number.NaN }, saved)).toBe(true);
  });

  it('compares nested plain values regardless of key order, ignoring unset keys', () => {
    const a = { method: 'X', bands: { p1: { minKgM3: 720, maxKgM3: 775 } } };
    const b = { bands: { p1: { maxKgM3: 775, minKgM3: 720 } }, method: 'X', extra: undefined };
    expect(draftDiffers(a, b)).toBe(false);
    expect(draftDiffers(a, { ...b, bands: { p1: { minKgM3: 720 } } })).toBe(true);
    expect(draftDiffers(a, { ...b, bands: {} })).toBe(true);
    expect(draftDiffers([1, 2], { 0: 1, 1: 2 })).toBe(true);
    expect(draftDiffers(null, {})).toBe(true);
  });
});
