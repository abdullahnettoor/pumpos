import { z } from 'zod';
import {
  DEFAULT_DENSITY_METHOD,
  DEFAULT_DENSITY_TOLERANCE_KG_M3,
  density15FromObserved,
  densityChangeExceedsTolerance,
  resolveBusinessDate,
  roundDensity,
  type DensityMethod,
} from '@pump/shared';
import {
  BusinessEvents,
  err,
  eventFromContext,
  notFoundError,
  ok,
  validationError,
  type EventPublisher,
  type ExecutionContext,
  type Result,
  type UseCase,
} from '../../../kernel/index.js';
import type { DensityReading, DensityReadingRepository } from './ports.js';

export const recordDensityReadingSchema = z
  .object({
    stationId: z.string().min(1, 'stationId is required'),
    productId: z.string().min(1, 'productId is required'),
    businessDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
      .optional(),
    kind: z.enum(['MORNING', 'ADHOC']),
    sampledFrom: z.enum(['NOZZLE', 'TANK']).nullable().optional(),
    tankId: z.string().nullable().optional(),
    nozzleId: z.string().nullable().optional(),
    entryMethod: z.enum(['HYDROMETER', 'DIRECT_15']),
    observedDensity: z.number().finite().positive().optional(),
    observedTempC: z.number().finite().optional(),
    density15: z.number().finite().positive().optional(),
    recordedAt: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.entryMethod === 'HYDROMETER') {
        return data.observedDensity != null && data.observedTempC != null;
      }
      if (data.entryMethod === 'DIRECT_15') {
        return data.density15 != null;
      }
      return false;
    },
    {
      message:
        'Hydrometer entry requires observedDensity and observedTempC; Direct entry requires density15',
    },
  );

export type RecordDensityReadingCommand = z.infer<typeof recordDensityReadingSchema>;

export interface RecordDensityReadingDeps {
  densityReadings: DensityReadingRepository;
  events: EventPublisher;
  ids?: { generate(): string };
  settings?: {
    densityToleranceKgM3?: number;
    densityMethod?: DensityMethod;
  };
}

/**
 * Record a product density reading (daily morning check or ad-hoc).
 *
 * Density is recorded per PRODUCT. Computes 15 °C density server-side if entered
 * as hydrometer + temperature. Detects UNEXPLAINED_JUMP if Δ vs previous reading
 * of the product exceeds tolerance without an intervening Decantation of that product.
 * Never blocks on jump; flags and emits DENSITY_RECORDED.
 */
export class RecordDensityReading implements UseCase<RecordDensityReadingCommand, DensityReading> {
  constructor(private readonly deps: RecordDensityReadingDeps) {}

  async execute(
    input: RecordDensityReadingCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DensityReading>> {
    const p = recordDensityReadingSchema.safeParse(input);
    if (!p.success) {
      return err(
        validationError('Invalid RecordDensityReading command', { issues: p.error.flatten() }),
      );
    }
    const cmd = p.data;
    if (ctx.stationId && ctx.stationId !== cmd.stationId) {
      return err(notFoundError('Station', cmd.stationId));
    }

    const recordedAtIso = cmd.recordedAt ?? ctx.clock.now().toISOString();
    const businessDate =
      cmd.businessDate ??
      resolveBusinessDate({
        now: new Date(recordedAtIso),
        timeZone: ctx.timeZone,
        dayStartsAt: ctx.businessDayStartsAt,
      });

    const tolerance = this.deps.settings?.densityToleranceKgM3 ?? DEFAULT_DENSITY_TOLERANCE_KG_M3;
    const method = this.deps.settings?.densityMethod ?? DEFAULT_DENSITY_METHOD;

    let density15Val: number;
    let observedDensityVal: number | null;
    let observedTempCVal: number | null;

    if (cmd.entryMethod === 'HYDROMETER') {
      // `tolerance` here would be the solver's convergence tolerance; the station's
      // density tolerance is the jump threshold only, so it is not passed in.
      const calc15 = density15FromObserved(cmd.observedDensity!, cmd.observedTempC!, { method });
      density15Val = roundDensity(calc15, 2);
      observedDensityVal = roundDensity(cmd.observedDensity!, 2);
      observedTempCVal = roundDensity(cmd.observedTempC!, 2);
    } else {
      density15Val = roundDensity(cmd.density15!, 2);
      observedDensityVal = null;
      observedTempCVal = null;
    }

    // Check for unexplained jump vs prior reading for this product
    const prev = await this.deps.densityReadings.findLatestForProduct(
      ctx.organizationId,
      cmd.stationId,
      cmd.productId,
      { businessDate, recordedAt: recordedAtIso },
    );

    const flags: unknown[] = [];
    let isUnexplainedJump = false;
    let deltaVsPrevious: number | null = null;

    if (prev) {
      deltaVsPrevious = roundDensity(density15Val - prev.density15, 2);
      // The client's jump rule (#556): judged on the change as shown (1 dp), so
      // a +3.04 at tolerance 3 reads "+3.0" and is not a jump on either side.
      if (densityChangeExceedsTolerance(deltaVsPrevious, tolerance)) {
        const wasDecantation = prev.kind === 'DECANTATION';
        let hasInterveningDecantation = wasDecantation;
        if (!hasInterveningDecantation) {
          hasInterveningDecantation = await this.deps.densityReadings.hasInterveningDecantation(
            ctx.organizationId,
            cmd.stationId,
            cmd.productId,
            prev.recordedAt <= recordedAtIso ? prev.recordedAt : recordedAtIso,
            prev.recordedAt <= recordedAtIso ? recordedAtIso : prev.recordedAt,
          );
        }
        if (!hasInterveningDecantation) {
          flags.push('UNEXPLAINED_JUMP');
          isUnexplainedJump = true;
        }
      }
    }

    const reading: DensityReading = {
      id: this.deps.ids?.generate() ?? crypto.randomUUID(),
      organizationId: ctx.organizationId,
      stationId: cmd.stationId,
      businessDate,
      productId: cmd.productId,
      kind: cmd.kind,
      sampledFrom: cmd.sampledFrom ?? null,
      tankId: cmd.tankId ?? null,
      nozzleId: cmd.nozzleId ?? null,
      entryMethod: cmd.entryMethod,
      observedDensity: observedDensityVal,
      observedTempC: observedTempCVal,
      density15: density15Val,
      decantationTankLineId: null,
      flags,
      recordedBy: ctx.actorId ?? null,
      recordedAt: recordedAtIso,
    };

    await this.deps.densityReadings.saveMany([reading]);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.DENSITY_RECORDED,
        aggregateType: 'DensityReading',
        aggregateId: reading.id,
        stationId: reading.stationId,
        payload: {
          readingId: reading.id,
          stationId: reading.stationId,
          productId: reading.productId,
          businessDate: reading.businessDate,
          kind: reading.kind,
          entryMethod: reading.entryMethod,
          density15: reading.density15,
          deltaVsPrevious,
          isUnexplainedJump,
          flags: reading.flags,
          recordedBy: reading.recordedBy,
          recordedAt: reading.recordedAt,
        },
      }),
    ]);

    return ok(reading);
  }
}
