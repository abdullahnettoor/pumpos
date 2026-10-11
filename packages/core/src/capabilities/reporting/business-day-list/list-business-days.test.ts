import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { ListBusinessDays, businessDayListStatus, weekWindows } from './list-business-days.js';
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
  timeZone: 'Asia/Kolkata',
  businessDayStartsAt: '06:00',
  // 15:30 IST on 2026-10-09: the Current Business Date is 2026-10-09.
  clock: new FixedClock(new Date('2026-10-09T10:00:00Z')),
  ids: new SequentialIdGenerator(),
};
const at = (iso: string): ExecutionContext => ({ ...ctx, clock: new FixedClock(new Date(iso)) });

const day = (
  businessDate: string,
  over: Partial<BusinessDayListSourceDay> = {},
): BusinessDayListSourceDay => ({
  businessDate,
  dayStatus: 'CLOSED',
  hasSnapshot: true,
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

const run = (reader: Reader, input: { month?: string } = {}, context = ctx) =>
  new ListBusinessDays(reader).execute({ stationId: 'station-1', ...input }, context);

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
  it('is Report missing, never Sealed, for a closed day without a DSSR snapshot', () => {
    expect(businessDayListStatus('CLOSED', '2026-10-01', '2026-10-09', false)).toBe(
      'REPORT_MISSING',
    );
    expect(businessDayListStatus('CLOSED', '2026-10-01', '2026-10-09', true)).toBe('SEALED');
  });
  it('treats an open day after the Current Business Date as Live, never Draft', () => {
    expect(businessDayListStatus('OPEN', '2026-10-10', '2026-10-09')).toBe('LIVE');
  });
});

describe('windows', () => {
  it('takes the 7 completed Business Dates before the current one, then the 7 before', () => {
    expect(weekWindows('2026-10-09')).toEqual({
      current: { from: '2026-10-02', to: '2026-10-08' },
      previous: { from: '2026-09-25', to: '2026-10-01' },
    });
  });
  it('rolls a month and year boundary', () => {
    expect(weekWindows('2027-01-03').previous).toEqual({ from: '2026-12-20', to: '2026-12-26' });
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
      weekFrom: '2026-09-25',
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

  it('resolves the Current Business Date from the Station clock, so Day Start moves Live to Draft', async () => {
    const days = [day('2026-10-09', { dayStatus: 'OPEN' })];
    // 05:30 IST on the 10th is still business date 2026-10-09 (Day Start 06:00).
    const before = await run(new Reader({ days }), {}, at('2026-10-10T05:30:00+05:30'));
    // 06:00 IST rolls the Current Business Date to the 10th: the 9th is a Past Open Day.
    const reader = new Reader({ days });
    const after = await run(reader, {}, at('2026-10-10T06:00:00+05:30'));
    if (!before.success || !after.success) throw new Error('expected ok');
    expect(before.data.days[0]?.status).toBe('LIVE');
    expect(after.data.days[0]?.status).toBe('DRAFT');
    expect(after.data.month).toBe('2026-10');
    expect(reader.query?.currentBusinessDate).toBe('2026-10-10');
  });

  it('defaults the month to the Business Date month, not the UTC month', async () => {
    // 2026-11-01 00:30 IST is 2026-10-31 business-wise (before the 06:00 Day Start).
    const result = await run(new Reader({}), {}, at('2026-11-01T00:30:00+05:30'));
    expect(result.success && result.data.month).toBe('2026-10');
  });

  it('shows a closed day without a DSSR snapshot as Report missing, with no figures', async () => {
    const reader = new Reader({
      days: [
        day('2026-10-07', {
          hasSnapshot: false,
          fuelSales: 99999,
          productSales: 1,
          cashVariance: -5,
        }),
        day('2026-10-06'),
      ],
    });
    const result = await run(reader);
    if (!result.success) throw new Error('expected ok');
    expect(result.data.days[0]).toEqual({
      businessDate: '2026-10-07',
      status: 'REPORT_MISSING',
      totalSales: 0,
      fuelSales: 0,
      productSales: 0,
      volume: 0,
      cashVariance: 0,
      shiftCount: 0,
    });
    expect(result.data.days[1]?.status).toBe('SEALED');
    // Not a sealed figure, so it is not in the week tiles either.
    expect(result.data.week.total).toBe(41000);
    expect(result.data.week.sealedDays).toBe(1);
  });

  it('sums only Sealed days of the 7 completed dates into the week total, leaving Live out', async () => {
    // Current = 2026-10-09: this window 10-02..10-08.
    const reader = new Reader({
      days: [
        day('2026-10-09', { dayStatus: 'OPEN', fuelSales: 5000, productSales: 250 }), // Live
        day('2026-10-08', { dayStatus: 'OPEN', fuelSales: 7000, productSales: 0 }), // Draft
        day('2026-10-05', { fuelSales: 30000, productSales: 1000 }),
        day('2026-10-02', { fuelSales: 20000, productSales: 500 }),
        day('2026-10-01', { fuelSales: 99999 }), // previous window
      ],
    });
    const result = await run(reader);
    if (!result.success) throw new Error('expected ok');
    expect(result.data.week.total).toBe(51500);
    expect(result.data.week.sealedDays).toBe(2);
  });

  it('compares like-for-like: only weekdays where both this and last week are Sealed', async () => {
    const reader = new Reader({
      days: [
        // this window 10-02..10-08
        day('2026-10-08', { fuelSales: 100, productSales: 0 }), // pair of 10-01
        day('2026-10-07', { fuelSales: 200, productSales: 0 }), // 09-30 not Sealed (Draft below)
        day('2026-10-06', { fuelSales: 300, productSales: 0 }), // 09-29 missing entirely
        day('2026-10-05', { fuelSales: 400, productSales: 0 }), // pair of 09-28
        // previous window 09-25..10-01
        day('2026-10-01', { fuelSales: 80, productSales: 0 }),
        day('2026-09-30', { dayStatus: 'OPEN', fuelSales: 5000, productSales: 0 }),
        day('2026-09-28', { fuelSales: 500, productSales: 0 }),
      ],
    });
    const result = await run(reader);
    if (!result.success) throw new Error('expected ok');
    expect(result.data.week.total).toBe(1000);
    expect(result.data.week.comparison).toEqual({ total: 500, previousTotal: 580, days: 2 });
  });

  it('has an empty comparison when no day pairs up', async () => {
    const result = await run(new Reader({ days: [day('2026-10-05')] }));
    if (!result.success) throw new Error('expected ok');
    expect(result.data.week.comparison).toEqual({ total: 0, previousTotal: 0, days: 0 });
  });

  it('feeds the week tiles across a month boundary and leaves the page to the month', async () => {
    const reader = new Reader({
      days: [
        day('2026-09-25', { fuelSales: 99999 }), // previous window, older month page
        day('2026-10-02', { fuelSales: 20000, productSales: 500 }),
        day('2026-10-04', { fuelSales: 30000, productSales: 1000 }),
      ],
    });
    const result = await run(reader);
    if (!result.success) throw new Error('expected ok');
    expect(result.data.week.total).toBe(51500);
    expect(result.data.days.map((d) => d.businessDate)).toEqual(['2026-10-04', '2026-10-02']);
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
    for (const input of [{ month: '2026-13' }, { month: '2026-1' }, { month: 'October' }]) {
      const result = await run(new Reader({}), input);
      expect(result.success).toBe(false);
    }
    const noStation = await new ListBusinessDays(new Reader({})).execute({ stationId: '' }, ctx);
    expect(noStation.success).toBe(false);
  });
});
