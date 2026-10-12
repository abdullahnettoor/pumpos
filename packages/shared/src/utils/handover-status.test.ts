import { describe, expect, it } from 'vitest';
import { deriveDuHandoverStatuses, handoverStatus, isHandoverDue } from './handover-status.js';

const tz = 'Asia/Kolkata';
const opened = '2026-10-09T08:30:00.000Z'; // 2:00 pm IST
const at = (iso: string) => Date.parse(iso);

describe('isHandoverDue', () => {
  it('is due once the Shift runs past its scheduled end', () => {
    expect(isHandoverDue(opened, at('2026-10-09T16:29:00Z'), '22:00', tz)).toBe(false);
    expect(isHandoverDue(opened, at('2026-10-09T16:30:00Z'), '22:00', tz)).toBe(true);
  });
  it('ends a night Shift on the next morning', () => {
    const night = '2026-10-09T16:30:00.000Z';
    expect(isHandoverDue(night, at('2026-10-09T20:00:00Z'), '06:00', tz)).toBe(false);
    expect(isHandoverDue(night, at('2026-10-10T00:30:00Z'), '06:00', tz)).toBe(true);
  });
  it('is never due without a schedule', () => {
    expect(isHandoverDue(opened, at('2026-10-12T00:00:00Z'), undefined, tz)).toBe(false);
  });
});

describe('handoverStatus', () => {
  it('Recorded beats due; due beats pending', () => {
    expect(handoverStatus(true, true)).toBe('recorded');
    expect(handoverStatus(false, true)).toBe('due');
    expect(handoverStatus(false, false)).toBe('pending');
  });
});

describe('deriveDuHandoverStatuses', () => {
  const shift = {
    openedAt: opened,
    scheduledEndTime: '22:00',
    staffAssignments: [
      { userId: 'u1', duId: 'd1' },
      { userId: 'u2', duId: 'd2' },
    ],
    handovers: [{ userId: 'u2', duId: 'd2' }],
  };
  it('statuses per assignment', () => {
    expect(deriveDuHandoverStatuses(shift, at('2026-10-09T11:00:00Z'), tz)).toEqual([
      'pending',
      'recorded',
    ]);
    expect(deriveDuHandoverStatuses(shift, at('2026-10-09T17:00:00Z'), tz)).toEqual([
      'due',
      'recorded',
    ]);
  });
});
