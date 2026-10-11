import { describe, expect, it } from 'vitest';
import { pastOpenDates } from './pastOpenDays.js';

describe('pastOpenDates', () => {
  it('lists every past open day, oldest first, once', () => {
    expect(
      pastOpenDates({
        pastOpenBusinessDays: [
          { businessDate: '2026-10-08' },
          { businessDate: '2026-10-06' },
          { businessDate: '2026-10-08' },
        ],
      }),
    ).toEqual(['2026-10-06', '2026-10-08']);
  });

  it('is empty without a status or without past open days', () => {
    expect(pastOpenDates(undefined)).toEqual([]);
    expect(pastOpenDates({ pastOpenBusinessDays: [] })).toEqual([]);
  });
});
