import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { BusinessDayRepository } from '../../station-ops/business-days/index.js';
import { composeDssr } from './compose.js';
import type { DssrDataReader, DssrSnapshot, DssrSnapshotRepository } from './ports.js';

export interface GenerateDssrCommand {
  businessDayId: string;
  /** Regenerate even if a snapshot already exists (default false — DSSR is immutable). */
  force?: boolean;
}

const schema = z.object({
  businessDayId: z.string().min(1, 'businessDayId is required'),
  force: z.boolean().optional(),
});

export interface GenerateDssrDeps {
  businessDays: BusinessDayRepository;
  snapshots: DssrSnapshotRepository;
  reader: DssrDataReader;
  events: EventPublisher;
}

/**
 * Generate the Daily Station Sales Report — an immutable snapshot of a business
 * day composed from its closed-shift summaries plus all business-day-anchored
 * financials. Idempotent: re-running returns the existing snapshot unless
 * `force` is set. Run inside runInTransaction.
 */
export class GenerateDssr implements UseCase<GenerateDssrCommand, DssrSnapshot> {
  constructor(private readonly deps: GenerateDssrDeps) {}

  async execute(input: GenerateDssrCommand, ctx: ExecutionContext): Promise<Result<DssrSnapshot>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid GenerateDssr command', { issues: p.error.flatten() }));

    const businessDay = await this.deps.businessDays.findById(p.data.businessDayId);
    if (!businessDay || businessDay.organizationId !== ctx.organizationId) return err(notFoundError('BusinessDay', p.data.businessDayId));

    const existing = await this.deps.snapshots.findByStationDate(ctx.organizationId, businessDay.stationId, businessDay.businessDate);
    if (existing && !p.data.force) return ok(existing);

    const source = await this.deps.reader.readBusinessDay(businessDay.id);
    const now = ctx.clock.now().toISOString();
    const snapshotData: Record<string, unknown> = {
      generatedAt: now,
      businessDayId: businessDay.id,
      businessDate: businessDay.businessDate,
      stationId: businessDay.stationId,
      organizationId: ctx.organizationId,
      status: businessDay.status,
      ...composeDssr(source),
    };

    const snapshot: DssrSnapshot = {
      id: existing?.id ?? ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: businessDay.stationId,
      businessDate: businessDay.businessDate,
      snapshotData,
      generatedAt: now,
    };
    await this.deps.snapshots.save(snapshot);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.DSSR_GENERATED,
        aggregateType: 'BusinessDay',
        aggregateId: businessDay.id,
        stationId: businessDay.stationId,
        businessDayId: businessDay.id,
        payload: { businessDayId: businessDay.id, businessDate: businessDay.businessDate, shiftsIncluded: source.shiftSummaries.length },
      }),
    ]);

    return ok(snapshot);
  }
}
