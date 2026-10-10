import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import {
  ListBusinessDays,
  businessDayListStatus,
  monthBounds,
  weekWindows,
} from './list-business-days.js';
import type {
  BusinessDayListQuery,
  BusinessDayListReader,
  BusinessDayListSource,
  BusinessDayListSourceDay,
} from './ports.js';

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  stationId: 'station-1',
  businessDayId: null,
  actorId: 'user-1',
  correlationId: null,
  clock: new FixedClock(new Date('2026-10-09T10:00:00Z')),
  ids: new SequentialIdGenerator(),
};

const day = (
  businessDate: string,
  over: Partial<BusinessDayListSourceDay> = {},
): BusinessDayListSourceDay => ({
  businessDate,
  dayStatus: 'CLOSED',
  fuelSales: 40000,
  productSales: 1000,
  volume: 450,
  cashVariance: 0,
  shiftCount: 2,
  ...over,
});

class Reader implements BusinessDayListReader {
  query: BusinessDayListQuery | null = null;
  constructor(private readonly source: Partial<BusinessDayListSource>) {}
  async load(query: BusinessDayListQuery): Promise<BusinessDayListSource> {
    this.query = query;
    return { days: [], openPastDays: 0, olderBusinessDate: null, ...this.source };
  }
}

const run = (
  reader: Reader,
  input: { month?: string; currentBusinessDate?: string } = {},
  context = ctx,
) =>
  new ListBusinessDays(reader).execute(
    { stationId: 'station-1', currentBusinessDate: '2026-10-09', ...input },
    context,
  );

describe('businessDayListStatus', () => {
  it('is Sealed for a closed day, whatever its date', () => {
    expect(businessDayListStatus('CLOSED', '2026-10-09', '2026-10-09')).toBe('SEALED');
    expect(businessDayListStatus('CLOSED', '2026-10-01', '2026-10-09')).toBe('SEALED');
  });
  it('is Live for the open Current Business Date', () => {
    expect(businessDayListStatus('OPEN', '2026-10-09', '2026-10-09')).toBe('LIVE');
  });
  it('is Draft for a Past Open Business Day', () => {
    expect(businessDayListStatus('OPEN', '2026-10-08', '2026-10-09')).toBe('DRAFT');
    expect(businessDayListStatus('OPEN', '2025-12-31', '2026-10-09')).toBe('DRAFT');
  });
  it('treats an open day after the Current Business Date as Live, never Draft', () => {
    expect(businessDayListStatus('OPEN', '2026-10-10', '2026-10-09')).toBe('LIVE');
  });
});

describe('windows', () => {
  it('bounds a month, including February in a leap year', () => {
    expect(monthBounds('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('takes the last 7 Business Dates ending on the current one, then the 7 before', () => {
    expect(weekWindows('2026-10-09')).toEqual({
      current: { from: '2026-10-03', to: '2026-10-09' },
      previous: { from: '2026-09-26', to: '2026-10-02' },
    });
  });
  it('rolls a month and year boundary', () => {
    expect(weekWindows('2027-01-03').previous).toEqual({ from: '2026-12-21', to: '2026-12-27' });
  });
});

describe('ListBusinessDays', () => {
  it('defaults to the month of the Current Business Date and asks for the week window too', async () => {
    const reader = new Reader({});
    const result = await run(reader);
    expect(result.success && result.data.month).toBe('2026-10');
    expect(reader.query).toEqual({
      organizationId: 'org-1',
      stationId: 'station-1',
      monthFrom: '2026-10-01',
      monthTo: '2026-10-31',
      weekFrom: '2026-09-26',
      currentBusinessDate: '2026-10-09',
    });
  });

  it('lists the month newest first with status, totals and figures per day', async () => {
    const reader = new Reader({
      days: [
        day('2026-10-07', { dayStatus: 'OPEN', cashVariance: -1250.5 }),
        day('2026-10-09', { dayStatus: 'OPEN', fuelSales: 21000, productSales: 500 }),
        day('2026-10-08', { dayStatus: 'OPEN' }),
        day('2026-10-06'),
      ],
    });
    const result = await run(reader);
    if (!result.success) throw new Error('expected ok');
    expect(result.data.days.map((d) => [d.businessDate, d.status])).toEqual([
      ['2026-10-09', 'LIVE'],
      ['2026-10-08', 'DRAFT'],
      ['2026-10-07', 'DRAFT'],
      ['2026-10-06', 'SEALED'],
    ]);
    expect(result.data.days[0]).toEqual({
      businessDate: '2026-10-09',
      status: 'LIVE',
      totalSales: 21500,
      fuelSales: 21000,
      productSales: 500,
      volume: 450,
      cashVariance: 0,
      shiftCount: 2,
    });
    expect(result.data.days[2]?.cashVariance).toBe(-1250.5);
  });

  it('keeps several simultaneously open past days Draft and only today Live', async () => {
    const reader = new Reader({
      days: ['03', '04', '05', '09'].map((d) => day(`2026-10-${d}`, { dayStatus: 'OPEN' })),
      openPastDays: 3,
    });
    const result = await run(reader);
    if (!result.success) throw new Error('expected ok');
    expect(result.data.days.map((d) => d.status)).toEqual(['LIVE', 'DRAFT', 'DRAFT', 'DRAFT']);
    expect(result.data.week.openPastDays).toBe(3);
  });

  it('follows the Current Business Date it is given, so Day Start moves Live to Draft', async () => {
    const days = [day('2026-10-09', { dayStatus: 'OPEN' })];
    const before = await run(new Reader({ days }), { currentBusinessDate: '2026-10-09' });
    const after = await run(new Reader({ days }), { currentBusinessDate: '2026-10-10' });
    if (!before.success || !after.success) throw new Error('expected ok');
    expect(before.data.days[0]?.status).toBe('LIVE');
    expect(after.data.days[0]?.status).toBe('DRAFT');
  });

  it('sums the week windows across a month boundary and leaves the page to the month', async () => {
    // Current = 2026-10-09: this window 10-03..10-09, previous 09-26..10-02.
    const reader = new Reader({
      days: [
        day('2026-09-25', { fuelSales: 99999 }), // outside both windows (older month page)
        day('2026-09-28', { fuelSales: 10000, productSales: 0 }),
        day('2026-10-01', { fuelSales: 20000, productSales: 500 }),
        day('2026-10-04', { fuelSales: 30000, productSales: 1000 }),
        day('2026-10-09', { dayStatus: 'OPEN', fuelSales: 5000, productSales: 250 }),
      ],
    });
    const result = await run(reader);
    if (!result.success) throw new Error('expected ok');
    expect(result.data.week.total).toBe(36250);
    expect(result.data.week.previousTotal).toBe(30500);
    // Only October rows are on the page; the September ones fed the tiles.
    expect(result.data.days.map((d) => d.businessDate)).toEqual([
      '2026-10-09',
      '2026-10-04',
      '2026-10-01',
    ]);
  });

  it('computes the week tiles from the Current Business Date even for an older month page', async () => {
    const reader = new Reader({
      days: [day('2026-08-15'), day('2026-10-08', { fuelSales: 1000, productSales: 0 })],
    });
    const result = await run(reader, { month: '2026-08' });
    if (!result.success) throw new Error('expected ok');
    expect(result.data.month).toBe('2026-08');
    expect(result.data.days.map((d) => d.businessDate)).toEqual(['2026-08-15']);
    expect(result.data.week.total).toBe(1000);
  });

  it('rounds money and volume to two decimals', async () => {
    const reader = new Reader({
      days: [
        day('2026-10-08', { fuelSales: 100.1, productSales: 200.2, volume: 12.3456 }),
        day('2026-10-09', { fuelSales: 0.1, productSales: 0.2 }),
      ],
    });
    const result = await run(reader);
    if (!result.success) throw new Error('expected ok');
    expect(result.data.days[1]?.totalSales).toBe(300.3);
    expect(result.data.days[1]?.volume).toBe(12.35);
    expect(result.data.days[0]?.totalSales).toBe(0.3);
  });

  it('maps the older Business Date to a month, or null', async () => {
    const some = await run(new Reader({ olderBusinessDate: '2026-08-31' }));
    const none = await run(new Reader({ olderBusinessDate: null }));
    if (!some.success || !none.success) throw new Error('expected ok');
    expect(some.data.olderMonth).toBe('2026-08');
    expect(none.data.olderMonth).toBeNull();
  });

  it('rejects a bad month, a bad Current Business Date and a missing station', async () => {
    for (const input of [
      { month: '2026-13' },
      { month: '2026-1' },
      { month: 'October' },
      { currentBusinessDate: '2026-02-30' },
      { currentBusinessDate: '' },
    ]) {
      const result = await run(new Reader({}), input);
      expect(result.success).toBe(false);
    }
    const noStation = await new ListBusinessDays(new Reader({})).execute(
      { stationId: '', currentBusinessDate: '2026-10-09' },
      ctx,
    );
    expect(noStation.success).toBe(false);
  });
});
