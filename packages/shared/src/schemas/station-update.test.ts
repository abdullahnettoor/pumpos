import { describe, expect, it } from 'vite-plus/test';
import { stationSchema, stationUpdateSchema, userUpdateSchema } from './validation.js';

describe('Station PUT validation (#716)', () => {
  it('keeps omitted settings omitted, without applying creation defaults', () => {
    expect(stationUpdateSchema.parse({ settings: { report_config: { paper: 'LETTER' } } })).toEqual(
      {
        settings: { report_config: { paper: 'LETTER' } },
      },
    );
    expect(stationUpdateSchema.parse({ name: 'Updated Station' })).toEqual({
      name: 'Updated Station',
    });
    expect(stationSchema.parse({ name: 'New Station', code: 'NEW' }).settings).toEqual({
      shift_grace_minutes: 15,
      shift_lock_grace_days: 3,
      offline_warning_days: 3,
      offline_critical_days: 7,
    });
    expect(stationUpdateSchema.safeParse({ settings: { shift_grace_minutes: -1 } }).success).toBe(
      false,
    );
  });
});

describe('User PUT validation (#722)', () => {
  it('keeps an omitted status omitted, so an edit never reactivates a member', () => {
    expect(userUpdateSchema.parse({ fullName: 'Ravi K' })).toEqual({ fullName: 'Ravi K' });
    expect(userUpdateSchema.parse({ status: 'INACTIVE' })).toEqual({ status: 'INACTIVE' });
  });
});
