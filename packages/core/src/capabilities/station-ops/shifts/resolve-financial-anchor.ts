import { err, invariantViolation, validationError } from '../../../kernel/index.js';
import { ok } from '../../../kernel/index.js';
import type { ExecutionContext, Result } from '../../../kernel/index.js';
import { resolveBusinessDate } from '@pump/shared';
import { resolveBusinessDayWrite } from '../business-days/index.js';
import type { BusinessDayWriteKind, BusinessDayWriteRepository } from '../business-days/index.js';
import { resolveShiftBusinessDayWrite } from './resolve-shift-write.js';
import type { ShiftRepository } from './ports.js';

/** Where a financial/stock record is anchored, plus its late-entry markers. */
export interface FinancialAnchor {
  stationId: string;
  businessDayId: string;
  /** The anchoring Business Day's date (YYYY-MM-DD). */
  businessDate: string;
  shiftId: string | null;
  lateEntry: boolean;
  /** Persist on the record: `{ lateEntry: true }` when late, `{}` otherwise. */
  recordMetadata: Record<string, unknown>;
  /**
   * Attach to the primary business event: `lateEntryPrimary` marks the one
   * event per record counted in the closed-day DSSR late-entry badge.
   */
  eventMetadata: Record<string, unknown> | undefined;
}

export interface FinancialAnchorCommand {
  shiftId?: string | null;
  stationId?: string | null;
  /** Explicit business date (YYYY-MM-DD) for station-anchored entries. */
  transactionDate?: string;
}

export interface FinancialAnchorOptions {
  kind?: BusinessDayWriteKind;
  /** When true, the write moves physical drawer cash and requires an OPEN shift + day. */
  affectsDrawer?: boolean;
  /** Human label for drawer-guard error messages, e.g. "Drawer expenses". */
  drawerLabel?: string;
}

/**
 * Resolve where a money movement is anchored — shift-anchored (drawer
 * accountability) or business-day-anchored — locking Station → Business Day →
 * Shift and computing late-entry status. Single home for the drawer guard:
 * drawer-affecting writes require an open Shift and an open Business Day;
 * non-drawer writes on a CLOSED day are allowed and flagged as late entries.
 */
export async function resolveFinancialAnchor(
  deps: { shifts: ShiftRepository; businessDays: BusinessDayWriteRepository },
  ctx: ExecutionContext,
  cmd: FinancialAnchorCommand,
  opts: FinancialAnchorOptions = {},
): Promise<Result<FinancialAnchor>> {
  const kind = opts.kind ?? 'FINANCIAL';
  const affectsDrawer = opts.affectsDrawer ?? false;
  const drawerLabel = opts.drawerLabel ?? 'Drawer entries';

  if (cmd.shiftId) {
    const eligibility = await resolveShiftBusinessDayWrite(
      deps.shifts,
      deps.businessDays,
      ctx,
      cmd.shiftId,
      kind,
    );
    if (!eligibility.success) return eligibility;
    const { shift, businessDay, lateEntry } = eligibility.data;
    if (affectsDrawer && (lateEntry || shift.status !== 'OPEN')) {
      return err(
        invariantViolation(`${drawerLabel} require an open Shift and open Business Day`, {
          shiftId: shift.id,
          shiftStatus: shift.status,
          businessDayId: businessDay.id,
        }),
      );
    }
    return ok(anchor(shift.stationId, businessDay, shift.id, lateEntry));
  }

  if (cmd.stationId) {
    if (affectsDrawer) return err(validationError(`${drawerLabel} require shiftId`));
    const businessDate =
      cmd.transactionDate ??
      resolveBusinessDate({
        now: ctx.clock.now(),
        timeZone: ctx.timeZone,
        dayStartsAt: ctx.businessDayStartsAt,
      });
    const eligibility = await resolveBusinessDayWrite(deps.businessDays, ctx, {
      stationId: cmd.stationId,
      businessDate,
      kind,
    });
    if (!eligibility.success) return eligibility;
    return ok(
      anchor(cmd.stationId, eligibility.data.businessDay, null, eligibility.data.lateEntry),
    );
  }

  return err(validationError('Either shiftId or stationId is required'));
}

function anchor(
  stationId: string,
  businessDay: { id: string; businessDate: string },
  shiftId: string | null,
  lateEntry: boolean,
): FinancialAnchor {
  return {
    stationId,
    businessDayId: businessDay.id,
    businessDate: businessDay.businessDate,
    shiftId,
    lateEntry,
    recordMetadata: lateEntry ? { lateEntry: true } : {},
    eventMetadata: lateEntry ? { lateEntry: true, lateEntryPrimary: true } : undefined,
  };
}
