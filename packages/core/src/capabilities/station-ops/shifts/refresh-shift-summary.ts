import { BusinessEvents, err, eventFromContext, notFoundError, ok } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { ShiftRepository, ShiftSummaryProjector, ShiftSummaryStore } from './ports.js';

export interface RefreshShiftSummaryCommand {
  shiftId: string;
}

export interface RefreshShiftSummaryDeps {
  shifts: ShiftRepository;
  summaries: ShiftSummaryStore;
  projector: ShiftSummaryProjector;
  events: EventPublisher;
}

export interface RefreshShiftSummaryResult {
  /** false when there was nothing to refresh (open shift / no summary yet). */
  refreshed: boolean;
  snapshot: Record<string, unknown> | null;
}

/**
 * Regenerate a closed shift's stored Shift Summary snapshot after a
 * late-attributed transaction (a non-drawer expense / collection / supplier
 * payment / credit sale recorded against the shift inside the attribution
 * grace window; drawer-affecting writes are blocked on closed shifts by
 * resolveFinancialAnchor, so the close-time drawer reconciliation stays valid).
 *
 * The stored snapshot is the single read source: this re-projects the full
 * presentation shape from the current transactional truth so reads never
 * re-enrich. Explicit and idempotent — replaying it against unchanged data
 * writes the same snapshot.
 *
 * No-ops (refreshed: false) for open shifts and for shifts without a stored
 * summary, so callers may invoke it unconditionally after any shift-attributed
 * financial write. Run inside runInTransaction with the write it follows.
 */
export class RefreshShiftSummary implements UseCase<
  RefreshShiftSummaryCommand,
  RefreshShiftSummaryResult
> {
  constructor(private readonly deps: RefreshShiftSummaryDeps) {}

  async execute(
    input: RefreshShiftSummaryCommand,
    ctx: ExecutionContext,
  ): Promise<Result<RefreshShiftSummaryResult>> {
    const shift = await this.deps.shifts.findById(input.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId)
      return err(notFoundError('Shift', input.shiftId));
    if (shift.status === 'OPEN') return ok({ refreshed: false, snapshot: null });

    const existing = await this.deps.summaries.findByShift(shift.id);
    if (!existing) return ok({ refreshed: false, snapshot: null });

    const snapshot = await this.deps.projector.project(shift, existing);
    snapshot.refreshedAt = ctx.clock.now().toISOString();
    await this.deps.summaries.save(shift.id, snapshot);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_SUMMARY_REFRESHED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { shiftId: shift.id },
        groupingRole: 'related',
      }),
    ]);

    return ok({ refreshed: true, snapshot });
  }
}
