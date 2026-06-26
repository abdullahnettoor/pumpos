import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { NozzleReadingRepository, ShiftRepository } from './ports.js';

export interface RecordNozzleReadingsCommand {
  shiftId: string;
  readings: { nozzleId: string; closingReading: number }[];
}

const schema = z.object({
  shiftId: z.string().min(1, 'shiftId is required'),
  readings: z.array(z.object({ nozzleId: z.string().min(1), closingReading: z.coerce.number().min(0) })).min(1, 'at least one reading is required'),
});

export interface RecordNozzleReadingsDeps {
  shifts: ShiftRepository;
  nozzleReadings: NozzleReadingRepository;
  events: EventPublisher;
}

export interface RecordNozzleReadingsResult {
  shiftId: string;
  updated: number;
  totalVolume: number;
}

/** Record/refresh closing readings for an open shift; volume = closing - opening. */
export class RecordNozzleReadings implements UseCase<RecordNozzleReadingsCommand, RecordNozzleReadingsResult> {
  constructor(private readonly deps: RecordNozzleReadingsDeps) {}

  async execute(input: RecordNozzleReadingsCommand, ctx: ExecutionContext): Promise<Result<RecordNozzleReadingsResult>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordNozzleReadings command', { issues: p.error.flatten() }));

    const shift = await this.deps.shifts.findById(p.data.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', p.data.shiftId));
    if (shift.status !== 'OPEN') return err(invariantViolation('Shift is not open', { shiftId: shift.id, status: shift.status }));

    const dbReadings = await this.deps.nozzleReadings.listByShift(shift.id);
    const byNozzle = new Map(dbReadings.map((r) => [r.nozzleId, r]));

    let updated = 0;
    let totalVolume = 0;
    for (const rd of p.data.readings) {
      const existing = byNozzle.get(rd.nozzleId);
      if (!existing) continue;
      const opening = Number(existing.openingReading);
      if (rd.closingReading < opening) {
        return err(validationError(`Closing reading (${rd.closingReading}) is below opening (${opening}) for a nozzle`, { nozzleId: rd.nozzleId }));
      }
      const volume = rd.closingReading - opening;
      await this.deps.nozzleReadings.updateClosing(existing.id, String(rd.closingReading), String(volume));
      updated += 1;
      totalVolume += volume;
    }

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.NOZZLE_READING_RECORDED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { shiftId: shift.id, updated, totalVolume },
      }),
    ]);

    return ok({ shiftId: shift.id, updated, totalVolume });
  }
}
