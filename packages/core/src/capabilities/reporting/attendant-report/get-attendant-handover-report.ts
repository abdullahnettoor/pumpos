import { z } from 'zod';
import { err, forbiddenError, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { composeAttendantHandoverReport } from './compose.js';
import type { AttendantHandoverReport, AttendantHandoverReportReader } from './ports.js';

export interface GetAttendantHandoverReportCommand {
  stationId: string;
  /** Inclusive Business Date (YYYY-MM-DD). */
  from: string;
  /** Inclusive Business Date (YYYY-MM-DD). */
  to: string;
  attendantId?: string;
}

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD Business Date');

const schema = z
  .object({
    stationId: z.string().min(1, 'stationId is required'),
    from: businessDate,
    to: businessDate,
    attendantId: z.string().min(1).optional(),
  })
  .refine((v) => v.from <= v.to, { message: '`from` must not be after `to`', path: ['from'] });

export interface GetAttendantHandoverReportDeps {
  reader: AttendantHandoverReportReader;
}

/**
 * Compose one Station's Attendant Handover Report for a Business-Date range.
 *
 * Read-only: it derives no state and emits no Business Event. Only CLOSED (and
 * LOCKED) Shifts contribute, so every figure the report shows is final.
 */
export class GetAttendantHandoverReport
  implements UseCase<GetAttendantHandoverReportCommand, AttendantHandoverReport>
{
  constructor(private readonly deps: GetAttendantHandoverReportDeps) {}

  async execute(
    input: GetAttendantHandoverReportCommand,
    ctx: ExecutionContext,
  ): Promise<Result<AttendantHandoverReport>> {
    const p = schema.safeParse(input);
    if (!p.success) {
      return err(
        validationError('Invalid GetAttendantHandoverReport query', { issues: p.error.flatten() }),
      );
    }
    if (ctx.stationId && ctx.stationId !== p.data.stationId) {
      return err(forbiddenError('No access to this station'));
    }

    const source = await this.deps.reader.read({
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      from: p.data.from,
      to: p.data.to,
      attendantId: p.data.attendantId,
    });

    return ok(
      composeAttendantHandoverReport(source.handovers, {
        stationId: p.data.stationId,
        from: p.data.from,
        to: p.data.to,
        generatedAt: ctx.clock.now().toISOString(),
      }),
    );
  }
}
