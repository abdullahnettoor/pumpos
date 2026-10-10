import { describe, expect, it } from 'vitest';
import { deriveLiveShift, elapsedLabel, sinceLabel } from './live.js';

const opened = '2026-10-09T08:30:00.000Z'; // 2:00 pm IST
const tz = 'Asia/Kolkata';

describe('elapsedLabel', () => {
  it('prints hours and minutes, like the console', () => {
    expect(elapsedLabel(opened, Date.parse('2026-10-09T11:42:00.000Z'))).toBe('3h 12m');
    expect(elapsedLabel(opened, Date.parse('2026-10-09T08:35:00.000Z'))).toBe('0h 5m');
  });
  it('never goes negative', () => {
    expect(elapsedLabel(opened, Date.parse('2026-10-09T08:00:00.000Z'))).toBe('0h 0m');
  });
});

describe('sinceLabel', () => {
  it('uses the station clock', () => {
    expect(sinceLabel(opened, Date.parse('2026-10-09T11:42:00.000Z'), tz)).toBe('2:00 pm');
  });
  it('adds the date for a Shift opened on an earlier day', () => {
    expect(sinceLabel(opened, Date.parse('2026-10-10T04:00:00.000Z'), tz)).toBe('9 Oct, 2:00 pm');
  });
});

describe('deriveLiveShift', () => {
  const now = Date.parse('2026-10-09T11:42:00.000Z');
  const status = {
    activeShift: {
      templateName: 'Shift 2',
      openedAt: opened,
      businessDate: '2026-10-09',
      staffAssignments: [
        { userId: 'u1', duId: 'd1' },
        { userId: 'u2', duId: 'd2' },
        { userId: 'u1', duId: 'd3' },
      ],
    },
  };

  it('describes the running Shift', () => {
    expect(deriveLiveShift(status, '2026-10-09', now, tz)).toEqual({
      name: 'Shift 2',
      detail: 'Since 2:00 pm · 2 attendants',
      elapsed: '3h 12m',
      inCurrentDay: true,
    });
  });

  it('flags a Shift that belongs to an earlier Business Day', () => {
    expect(deriveLiveShift(status, '2026-10-10', now, tz)?.inCurrentDay).toBe(false);
  });

  it('is null when no Shift is open', () => {
    expect(deriveLiveShift({ activeShift: null }, '2026-10-09', now, tz)).toBeNull();
    expect(deriveLiveShift(undefined, '2026-10-09', now, tz)).toBeNull();
  });

  it('copes with a Shift that has no one assigned yet', () => {
    const r = deriveLiveShift(
      { activeShift: { openedAt: opened, businessDate: '2026-10-09' } },
      '2026-10-09',
      now,
      tz,
    );
    expect(r).toMatchObject({ name: 'Shift', detail: 'Since 2:00 pm · No attendants yet' });
  });
});
