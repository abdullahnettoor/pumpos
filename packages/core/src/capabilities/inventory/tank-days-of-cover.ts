import { z } from 'zod';
import { DAYS_OF_COVER_WINDOW } from '@pump/shared';
import { err, ok, validationError } from '../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../kernel/index.js';

/**
 * Tank days of cover = current tank stock ÷ average daily volume sold.
 *
 * Averaging window (documented here, pinned by tests):
 * - The Station's last `DAYS_OF_COVER_WINDOW` (7) CLOSED Business Days: the 7
 *   newest by business date, not "the last 7 calendar days". Open days are
 *   excluded, so the rate never changes once its days are closed.
 * - Sold volume per tank = Σ Sale stock movements booked to THAT tank in the
 *   window (metered fuel, written from the nozzle readings when a Shift closes; stock_movements is the
 *   inventory source of truth). Per tank, not per product: with several tanks
 *   of one product each is judged by what it actually dispensed through its
 *   nozzles, so a product average is never divided over the wrong tank.
 * - The divisor is the number of closed days found (1..7), zero-sale days
 *   included: a Station closed on Sundays sells less on average, and a Station
 *   with only 3 closed days is averaged over 3.
 *
 * Edge cases: no closed Business Day, or a tank that sold nothing in the window
 * (new tank, idle tank, no sales) has NO figure (`daysOfCover` null: the UI
 * hides it); an empty tank that does sell has 0 days of cover.
 */

export interface TankCover {
  /** Average daily volume over the window; null when the Station has no closed Business Day. */
  avgDailyVolume7d: number | null;
  /** Days the current stock lasts at that rate; null without sales history. */
  daysOfCover: number | null;
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export function computeTankCover(input: {
  currentVolume: number;
  /** Σ volume sold from this tank over the window's closed Business Days. */
  soldVolume: number;
  /** Closed Business Days in the window (0..7). */
  closedDays: number;
}): TankCover {
  const { currentVolume, soldVolume, closedDays } = input;
  if (!(closedDays > 0)) return { avgDailyVolume7d: null, daysOfCover: null };
  const avg = Math.max(0, Number.isFinite(soldVolume) ? soldVolume : 0) / closedDays;
  if (avg <= 0) return { avgDailyVolume7d: 0, daysOfCover: null };
  const stock = Math.max(0, Number.isFinite(currentVolume) ? currentVolume : 0);
  return { avgDailyVolume7d: round(avg, 3), daysOfCover: round(stock / avg, 2) };
}

export interface TankSalesWindowQuery {
  organizationId: string;
  stationId: string;
  /** How many of the newest closed Business Days to read. */
  days: number;
}

export interface TankSalesWindow {
  /** Closed Business Days found in the window (0..days). */
  closedDays: number;
  /** Volume sold per tank over those days; tanks that sold nothing are absent. */
  sold: ReadonlyArray<{ tankId: string; volume: number }>;
}

/** Reads one Station's per-tank sold volume over its newest closed Business Days (ONE statement). */
export interface TankSalesWindowReader {
  read(query: TankSalesWindowQuery): Promise<TankSalesWindow>;
}

export interface GetTankDaysOfCoverCommand {
  stationId: string;
  tanks: ReadonlyArray<{ tankId: string; currentVolume: number }>;
}

const schema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  tanks: z.array(z.object({ tankId: z.string().min(1), currentVolume: z.number() })),
});

export interface GetTankDaysOfCoverDeps {
  reader: TankSalesWindowReader;
}

/**
 * Days of cover for each of a Station's tanks, keyed by tank id. Read-only: no
 * state, no Business Event. One reader statement however many tanks there are
 * (none at all when the Station has no tanks).
 */
export class GetTankDaysOfCover implements UseCase<
  GetTankDaysOfCoverCommand,
  Record<string, TankCover>
> {
  constructor(private readonly deps: GetTankDaysOfCoverDeps) {}

  async execute(
    input: GetTankDaysOfCoverCommand,
    ctx: ExecutionContext,
  ): Promise<Result<Record<string, TankCover>>> {
    const p = schema.safeParse(input);
    if (!p.success) {
      return err(
        validationError('Invalid GetTankDaysOfCover query', { issues: p.error.flatten() }),
      );
    }
    if (p.data.tanks.length === 0) return ok({});

    const window = await this.deps.reader.read({
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      days: DAYS_OF_COVER_WINDOW,
    });
    const soldByTank = new Map(window.sold.map((s) => [s.tankId, s.volume]));
    const out: Record<string, TankCover> = {};
    for (const t of p.data.tanks) {
      out[t.tankId] = computeTankCover({
        currentVolume: t.currentVolume,
        soldVolume: soldByTank.get(t.tankId) ?? 0,
        closedDays: window.closedDays,
      });
    }
    return ok(out);
  }
}
