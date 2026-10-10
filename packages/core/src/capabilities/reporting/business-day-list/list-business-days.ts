import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import {
  isValidBusinessDate,
  monthBounds,
  MONTH_KEY,
  round2,
  resolveBusinessDate,
  shiftBusinessDate,
} from '@pump/shared';
import type {
  BusinessDayList,
  BusinessDayListComparison,
  BusinessDayListItem,
  BusinessDayListReader,
  BusinessDayListStatus,
} from './ports.js';

/** Days in the week window the Reports tiles compare (this one and the one before). */
const WEEK_DAYS = 7;

export interface ListBusinessDaysCommand {
  stationId: string;
  /** `YYYY-MM`; defaults to the month of the Current Business Date. */
  month?: string;
}

/**
 * A Business Day's status. The Draft boundary is the Current Business Date, so
 * Day Start moves a day from Live to Draft with no stored flag: a Past Open
 * Business Day is exactly an OPEN day strictly before the current date.
 *
 * Sealed means closed AND its DSSR snapshot exists (a snapshot is created iff a
 * day is closed). A closed day without one is `REPORT_MISSING`, never Sealed.
 */
export function businessDayListStatus(
  dayStatus: 'OPEN' | 'CLOSED',
  businessDate: string,
  currentBusinessDate: string,
  hasSnapshot = true,
): BusinessDayListStatus {
  if (dayStatus === 'CLOSED') return hasSnapshot ? 'SEALED' : 'REPORT_MISSING';
  return businessDate < currentBusinessDate ? 'DRAFT' : 'LIVE';
}

/**
 * The Reports tiles' windows: the 7 Business Dates BEFORE the current one, and
 * the 7 before those. The current date is still Live, so it is never part of a
 * comparison; both windows are whole completed weeks of days, a trailing window
 * rather than a calendar week so it is like-for-like on every weekday.
 */
export function weekWindows(currentBusinessDate: string) {
  return {
    current: {
      from: shiftBusinessDate(currentBusinessDate, -WEEK_DAYS),
      to: shiftBusinessDate(currentBusinessDate, -1),
    },
    previous: {
      from: shiftBusinessDate(currentBusinessDate, -2 * WEEK_DAYS),
      to: shiftBusinessDate(currentBusinessDate, -(WEEK_DAYS + 1)),
    },
  };
}

const within = (date: string, window: { from: string; to: string }) =>
  date >= window.from && date <= window.to;

/**
 * The week tiles from Sealed days only (a Draft day may still have an unclosed
 * Shift, so its figure is not final). The comparison pairs each day of the
 * current window with the same weekday 7 days earlier and counts a pair only
 * when both are Sealed: equal coverage on both sides, so a day waiting to be
 * closed cannot read as a sales drop.
 */
function weekTiles(sealed: ReadonlyMap<string, number>, currentBusinessDate: string) {
  const windows = weekWindows(currentBusinessDate);
  let total = 0;
  let sealedDays = 0;
  const comparison: BusinessDayListComparison = { total: 0, previousTotal: 0, days: 0 };
  for (const [date, sales] of sealed) {
    if (!within(date, windows.current)) continue;
    total += sales;
    sealedDays += 1;
    const before = sealed.get(shiftBusinessDate(date, -WEEK_DAYS));
    if (before === undefined) continue;
    comparison.total += sales;
    comparison.previousTotal += before;
    comparison.days += 1;
  }
  return {
    total: round2(total),
    sealedDays,
    comparison: {
      total: round2(comparison.total),
      previousTotal: round2(comparison.previousTotal),
      days: comparison.days,
    },
  };
}

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
    const currentBusinessDate = resolveBusinessDate({
      now: ctx.clock.now(),
      timeZone: ctx.timeZone,
      dayStartsAt: ctx.businessDayStartsAt,
    });
    if (!input.stationId || !isValidBusinessDate(currentBusinessDate)) {
      return err(validationError('Business Day list requires a Station'));
    }
    const month = input.month ?? currentBusinessDate.slice(0, 7);
    if (!MONTH_KEY.test(month)) {
      return err(validationError('month must be YYYY-MM'));
    }

    const bounds = monthBounds(month);
    const weeks = weekWindows(currentBusinessDate);
    const source = await this.reader.load({
      organizationId: ctx.organizationId,
      stationId: input.stationId,
      monthFrom: bounds.from,
      monthTo: bounds.to,
      weekFrom: weeks.previous.from,
      currentBusinessDate,
    });

    const sealed = new Map<string, number>();
    const days: BusinessDayListItem[] = [];
    for (const row of source.days) {
      const status = businessDayListStatus(
        row.dayStatus,
        row.businessDate,
        currentBusinessDate,
        row.hasSnapshot,
      );
      // No snapshot, no figures: a REPORT_MISSING day reports zeros, not a roll-up.
      const figures =
        status === 'REPORT_MISSING'
          ? { fuel: 0, product: 0, volume: 0, cash: 0, shifts: 0 }
          : {
              fuel: row.fuelSales,
              product: row.productSales,
              volume: row.volume,
              cash: row.cashVariance,
              shifts: row.shiftCount,
            };
      const totalSales = round2(figures.fuel + figures.product);
      if (status === 'SEALED') sealed.set(row.businessDate, totalSales);
      if (!within(row.businessDate, bounds)) continue;
      days.push({
        businessDate: row.businessDate,
        status,
        totalSales,
        fuelSales: round2(figures.fuel),
        productSales: round2(figures.product),
        volume: round2(figures.volume),
        cashVariance: round2(figures.cash),
        shiftCount: figures.shifts,
      });
    }
    days.sort((a, b) => b.businessDate.localeCompare(a.businessDate));

    return ok({
      month,
      week: { ...weekTiles(sealed, currentBusinessDate), openPastDays: source.openPastDays },
      days,
      olderMonth: source.olderBusinessDate ? source.olderBusinessDate.slice(0, 7) : null,
    });
  }
}
