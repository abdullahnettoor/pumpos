import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { isValidBusinessDate, shiftBusinessDate } from '@pump/shared';
import type {
  BusinessDayList,
  BusinessDayListItem,
  BusinessDayListReader,
  BusinessDayListStatus,
} from './ports.js';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Days in the week window the Reports tiles compare (this one and the one before). */
const WEEK_DAYS = 7;

export interface ListBusinessDaysCommand {
  stationId: string;
  /** Resolved with the Station clock (timezone + Day Start) by the caller. */
  currentBusinessDate: string;
  /** `YYYY-MM`; defaults to the month of the Current Business Date. */
  month?: string;
}

/**
 * A Business Day's status. The Draft boundary is the Current Business Date, so
 * Day Start moves a day from Live to Draft with no stored flag: a Past Open
 * Business Day is exactly an OPEN day strictly before the current date.
 */
export function businessDayListStatus(
  dayStatus: 'OPEN' | 'CLOSED',
  businessDate: string,
  currentBusinessDate: string,
): BusinessDayListStatus {
  if (dayStatus === 'CLOSED') return 'SEALED';
  return businessDate < currentBusinessDate ? 'DRAFT' : 'LIVE';
}

/** First and last Business Date of a `YYYY-MM` month. */
export function monthBounds(month: string): { from: string; to: string } {
  const match = MONTH.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * The Reports tiles' windows: the last 7 Business Dates ending on the current
 * one, and the 7 before. A trailing window rather than a calendar week, so the
 * comparison is like-for-like on every weekday.
 */
export function weekWindows(currentBusinessDate: string) {
  return {
    current: {
      from: shiftBusinessDate(currentBusinessDate, -(WEEK_DAYS - 1)),
      to: currentBusinessDate,
    },
    previous: {
      from: shiftBusinessDate(currentBusinessDate, -(2 * WEEK_DAYS - 1)),
      to: shiftBusinessDate(currentBusinessDate, -WEEK_DAYS),
    },
  };
}

const within = (date: string, window: { from: string; to: string }) =>
  date >= window.from && date <= window.to;

/**
 * One page (a calendar month) of a Station's Business Days, newest first, with
 * the week tiles. Read-only; emits no Business Event.
 *
 * The reader returns bounded rows built in SQL from stored snapshots and closed
 * Shift Summaries, so the cost of this use-case does not grow with the number of
 * Shifts, Sales or days a station has ever had. It never composes a DSSR.
 */
export class ListBusinessDays implements UseCase<ListBusinessDaysCommand, BusinessDayList> {
  constructor(private readonly reader: BusinessDayListReader) {}

  async execute(
    input: ListBusinessDaysCommand,
    ctx: ExecutionContext,
  ): Promise<Result<BusinessDayList>> {
    if (!input.stationId || !isValidBusinessDate(input.currentBusinessDate)) {
      return err(validationError('Business Day list requires a Station and a valid Business Date'));
    }
    const month = input.month ?? input.currentBusinessDate.slice(0, 7);
    if (!MONTH.test(month)) {
      return err(validationError('month must be YYYY-MM'));
    }

    const bounds = monthBounds(month);
    const weeks = weekWindows(input.currentBusinessDate);
    const source = await this.reader.load({
      organizationId: ctx.organizationId,
      stationId: input.stationId,
      monthFrom: bounds.from,
      monthTo: bounds.to,
      weekFrom: weeks.previous.from,
      currentBusinessDate: input.currentBusinessDate,
    });

    let total = 0;
    let previousTotal = 0;
    const days: BusinessDayListItem[] = [];
    for (const row of source.days) {
      const totalSales = round2(row.fuelSales + row.productSales);
      if (within(row.businessDate, weeks.current)) total += totalSales;
      else if (within(row.businessDate, weeks.previous)) previousTotal += totalSales;
      if (!within(row.businessDate, bounds)) continue;
      days.push({
        businessDate: row.businessDate,
        status: businessDayListStatus(row.dayStatus, row.businessDate, input.currentBusinessDate),
        totalSales,
        fuelSales: round2(row.fuelSales),
        productSales: round2(row.productSales),
        volume: round2(row.volume),
        cashVariance: round2(row.cashVariance),
        shiftCount: row.shiftCount,
      });
    }
    days.sort((a, b) => b.businessDate.localeCompare(a.businessDate));

    return ok({
      month,
      week: {
        total: round2(total),
        previousTotal: round2(previousTotal),
        openPastDays: source.openPastDays,
      },
      days,
      olderMonth: source.olderBusinessDate ? source.olderBusinessDate.slice(0, 7) : null,
    });
  }
}
