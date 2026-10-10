import { describe, expect, it } from 'vitest';
import { deriveShiftHistory } from './history.js';

const ctx = { timeZone: 'Asia/Kolkata', today: '2026-10-09' };

const summary = (
  shiftId: string,
  businessDate: string | null,
  openedAt: string,
  extra: Record<string, unknown> = {},
) => ({
  shiftId,
  businessDate,
  shiftSequence: 1,
  templateName: 'Shift 1',
  openedAt,
  closedAt: openedAt,
  snapshotData: { totalFuelSalesValue: 1000, cashVarianceModel: 2, attendantVariance: 0, ...extra },
});

describe('deriveShiftHistory', () => {
  it('groups by the Shift Business Date, not the day it opened, newest first', () => {
    const days = deriveShiftHistory(
      [
        // 'c' opens at 3:30 am IST on the 9th yet belongs to the 8th's Business Date.
        summary('a', '2026-10-08', '2026-10-08T20:00:00Z'),
        summary('b', '2026-10-09', '2026-10-09T01:00:00Z'),
        summary('c', '2026-10-08', '2026-10-08T22:00:00Z'),
      ],
      ctx,
    );
    expect(days.map((d) => d.businessDate)).toEqual(['2026-10-09', '2026-10-08']);
    expect(days[1].rows.map((r) => r.shiftId)).toEqual(['c', 'a']);
  });

  it("totals each day's sales and labels today", () => {
    const days = deriveShiftHistory(
      [
        summary('a', '2026-10-09', '2026-10-09T01:00:00Z', { totalFuelSalesValue: 216120 }),
        summary('b', '2026-10-08', '2026-10-08T01:00:00Z', { totalFuelSalesValue: 259010 }),
        summary('c', '2026-10-08', '2026-10-08T09:00:00Z', { totalFuelSalesValue: 206530 }),
      ],
      ctx,
    );
    expect(days[0].label).toBe('Today · Fri, 9 Oct');
    expect(days[0].total).toBe(216120);
    expect(days[1].label).toBe('Thu, 8 Oct');
    expect(days[1].total).toBe(465540);
  });

  it('shows the variance badge and the window on each row', () => {
    const [day] = deriveShiftHistory(
      [
        summary('a', '2026-10-09', '2026-10-09T00:30:00Z', {
          attendantVariance: -340,
          drawers: [{ duName: 'DU3', variance: -340 }],
        }),
      ],
      ctx,
    );
    expect(day.rows[0]).toMatchObject({
      title: 'Shift 1',
      window: '6:00 am – 6:00 am',
      badge: { tone: 'bad', text: '−₹340' },
    });
  });

  it('files a summary with no Business Date under the day it opened', () => {
    const days = deriveShiftHistory([summary('a', null, '2026-10-08T20:00:00Z')], ctx);
    // 8 Oct 20:00Z is 9 Oct 1:30 am IST
    expect(days[0].businessDate).toBe('2026-10-09');
  });

  it('returns nothing for no summaries', () => {
    expect(deriveShiftHistory([], ctx)).toEqual([]);
  });
});
