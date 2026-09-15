import {
  err,
  invariantViolation,
  notFoundError,
  type EventPublisher,
  type ExecutionContext,
  type Result,
  type UseCase,
} from '../../../kernel/index.js';
import {
  CloseBusinessDay,
  type BusinessDay,
  type BusinessDayWriteRepository,
} from '../../station-ops/business-days/index.js';
import { GenerateDssr } from './generate-dssr.js';
import type { DssrDataReader, DssrSnapshotRepository } from './ports.js';

export interface BusinessDayOpenShiftReader {
  hasOpenShift(businessDayId: string): Promise<boolean>;
}

export interface CloseBusinessDayAndGenerateDssrCommand {
  businessDayId: string;
  stationId: string;
}

export interface CloseBusinessDayAndGenerateDssrDeps {
  businessDays: BusinessDayWriteRepository;
  openShifts: BusinessDayOpenShiftReader;
  snapshots: DssrSnapshotRepository;
  dssrData: DssrDataReader;
  events: EventPublisher;
}

/** Close one Business Day and create its immutable DSSR in the same transaction. */
export class CloseBusinessDayAndGenerateDssr implements UseCase<
  CloseBusinessDayAndGenerateDssrCommand,
  BusinessDay
> {
  constructor(private readonly deps: CloseBusinessDayAndGenerateDssrDeps) {}

  async execute(
    input: CloseBusinessDayAndGenerateDssrCommand,
    ctx: ExecutionContext,
  ): Promise<Result<BusinessDay>> {
    await this.deps.businessDays.lockStation(ctx.organizationId, input.stationId);
    await this.deps.businessDays.lockById(ctx.organizationId, input.businessDayId);
    const day = await this.deps.businessDays.findById(input.businessDayId);
    if (!day || day.organizationId !== ctx.organizationId || day.stationId !== input.stationId) {
      return err(notFoundError('BusinessDay', input.businessDayId));
    }
    if (await this.deps.openShifts.hasOpenShift(day.id)) {
      return err(
        invariantViolation('Close the open Shift before closing this Business Day', {
          businessDayId: day.id,
        }),
      );
    }

    const closed = await new CloseBusinessDay({
      repository: this.deps.businessDays,
      events: this.deps.events,
    }).execute({ businessDayId: day.id }, ctx);
    if (!closed.success) return closed;

    const generated = await new GenerateDssr({
      businessDays: this.deps.businessDays,
      snapshots: this.deps.snapshots,
      reader: this.deps.dssrData,
      events: this.deps.events,
    }).execute(
      { businessDayId: day.id, force: true },
      { ...ctx, stationId: day.stationId, businessDayId: day.id },
    );

    return generated.success ? closed : err(generated.error);
  }
}
