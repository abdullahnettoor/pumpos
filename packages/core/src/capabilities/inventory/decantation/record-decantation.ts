import { z } from 'zod';
import {
  computeDecantationFlags,
  decantationFlagKey,
  type DecantationFlag,
  type DecantationWarning,
} from '@pump/shared';
import {
  BusinessEvents,
  err,
  eventFromContext,
  invariantViolation,
  notFoundError,
  ok,
  relatedEventFromContext,
  validationError,
} from '../../../kernel/index.js';
import type {
  DocumentNumberGenerator,
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import {
  resolveBusinessDayWrite,
  type BusinessDayWriteRepository,
} from '../../station-ops/business-days/index.js';
import type { TankRepository } from '../../station-setup/tanks/index.js';
import type {
  Decantation,
  DecantationChamber,
  DecantationRepository,
  DecantationTankLine,
  DensityReading,
  DensityReadingRepository,
} from './ports.js';

/** Fallback when the caller supplies no station settings (#464). */
export const DEFAULT_DECANTATION_TOLERANCES = {
  densityToleranceKgM3: 3,
  settlingTimeMinutes: 30,
} as const;

const optNum = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().finite().optional(),
);
const optDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'must be a valid date-time')
    .optional(),
);

const lineSchema = z.object({
  /** Existing line id when updating; keeps identity (and flag identity) stable. */
  id: z.string().min(1).optional(),
  tankId: z.string().min(1),
  beforeDip: z.coerce.number().finite().min(0),
  beforeDipAt: optDate,
  observedDensity: optNum,
  observedTempC: optNum,
  /** RO Density at 15 °C. */
  roDensity: optNum,
  afterDip: optNum,
  afterDipAt: optDate,
  salesDuring: optNum,
  /**
   * Invoice density at 15 °C for this line's product. Not stored on the
   * Decantation: #469 feeds it from the linked purchase_items.invoice_density.
   */
  invoiceDensity: optNum,
});

const chamberSchema = z.object({
  chamberNo: z.coerce.number().int().min(1),
  capacityL: optNum,
  sealOk: z.boolean().nullish(),
  mark: z.enum(['OK', 'SHORT', 'EXCESS']).nullish(),
  dipMm: optNum,
  emptied: z.boolean().nullish(),
  /** Index into `lines` of the tank this chamber unloads into. */
  tankLineIndex: z.coerce.number().int().min(0).nullish(),
});

const schema = z.object({
  /** Present when updating an existing Decantation. */
  decantationId: z.string().min(1).optional(),
  stationId: z.string().min(1, 'stationId is required'),
  tankerNumber: z.string().trim().min(1, 'tankerNumber is required').max(50),
  driverName: z.string().trim().max(100).nullish(),
  unloadStartedAt: optDate,
  unloadEndedAt: optDate,
  chambersChecked: z.boolean().optional(),
  notes: z.string().max(500).nullish(),
  /** Save as DRAFT (incomplete). Otherwise PENDING_MEASUREMENT. */
  draft: z.boolean().optional(),
  /** Total invoice quantity (litres) when known; used for the chamber-capacity warning. */
  invoiceQuantity: optNum,
  lines: z.array(lineSchema).min(1, 'At least one tank line is required'),
  chambers: z.array(chamberSchema).optional(),
});

export type RecordDecantationCommand = z.input<typeof schema>;

/**
 * #468 hook. Called inside the same transaction with the saved Decantation when
 * any line carries an after dip. Measurement posts the Decantation stock
 * movement, marks lines MEASURED and returns the updated aggregate.
 */
export interface DecantationMeasurement {
  measureLinesWithAfterDip(
    ctx: ExecutionContext,
    decantation: Decantation,
    anchor: { businessDayId: string; businessDate: string },
  ): Promise<Result<Decantation>>;
}

export interface RecordDecantationDeps {
  decantations: DecantationRepository;
  densityReadings: DensityReadingRepository;
  tanks: TankRepository;
  businessDays: BusinessDayWriteRepository;
  docNumbers: DocumentNumberGenerator;
  events: EventPublisher;
  /** Station tolerances (#464); defaults apply when omitted. */
  settings?: { densityToleranceKgM3: number; settlingTimeMinutes: number };
  measurement?: DecantationMeasurement;
}

export interface RecordDecantationResult {
  decantation: Decantation;
  /** Advisory only (chamber excess, capacity mismatch); never persisted. */
  warnings: DecantationWarning[];
}

const iso = (v: string | undefined | null): string | null => (v ? new Date(v).toISOString() : null);

/**
 * Record or update one tanker visit (Decantation). Anchored to the Business Day
 * through the STOCK anchor (no shift). Saves tank lines and chambers atomically,
 * writes an RO-density reading per line, computes flags and never rejects for
 * density, chamber or settling-time problems. Stock is not touched here: only a
 * measurement (#468) posts the Decantation movement.
 */
export class RecordDecantation implements UseCase<
  RecordDecantationCommand,
  RecordDecantationResult
> {
  constructor(private readonly deps: RecordDecantationDeps) {}

  async execute(
    input: RecordDecantationCommand,
    ctx: ExecutionContext,
  ): Promise<Result<RecordDecantationResult>> {
    const p = schema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid RecordDecantation command', { issues: p.error.flatten() }),
      );
    const cmd = p.data;
    if (ctx.stationId && ctx.stationId !== cmd.stationId)
      return err(notFoundError('Station', cmd.stationId));

    const existing = cmd.decantationId
      ? await this.deps.decantations.findById(ctx.organizationId, cmd.decantationId)
      : null;
    if (cmd.decantationId) {
      if (!existing || existing.stationId !== cmd.stationId)
        return err(notFoundError('Decantation', cmd.decantationId));
      const ownDay = await this.deps.businessDays.findById(existing.businessDayId);
      if (ownDay?.status === 'CLOSED') return this.addAfterDipToSealedDay(cmd, existing, ctx);
      if (existing.status === 'MEASURED' || existing.lines.some((l) => l.status === 'MEASURED'))
        return err(
          invariantViolation('A measured Decantation can no longer be edited', {
            decantationId: existing.id,
          }),
        );
    }

    const tankIds = cmd.lines.map((l) => l.tankId);
    if (new Set(tankIds).size !== tankIds.length)
      return err(validationError('A tank can appear on only one line of a Decantation'));
    const chamberNos = (cmd.chambers ?? []).map((c) => c.chamberNo);
    if (new Set(chamberNos).size !== chamberNos.length)
      return err(validationError('Chamber numbers must be unique'));
    for (const c of cmd.chambers ?? []) {
      if (c.tankLineIndex != null && c.tankLineIndex >= cmd.lines.length)
        return err(validationError(`Chamber ${c.chamberNo} refers to an unknown tank line`));
    }

    const tankById = new Map<string, { productId: string }>();
    for (const tankId of tankIds) {
      const tank = await this.deps.tanks.findById(tankId);
      if (
        !tank ||
        tank.organizationId !== ctx.organizationId ||
        tank.stationId !== cmd.stationId ||
        tank.status !== 'ACTIVE'
      )
        return err(notFoundError('Tank', tankId));
      tankById.set(tankId, { productId: tank.productId });
    }

    // Stock anchor: lazy-open the current Business Day (or reuse the stored day on
    // update). A sealed (closed) day refuses the write, like other stock events.
    const eligibility = await resolveBusinessDayWrite(this.deps.businessDays, ctx, {
      stationId: cmd.stationId,
      kind: 'STOCK',
      ...(existing ? { businessDayId: existing.businessDayId } : {}),
    });
    if (!eligibility.success) return eligibility;
    const bd = eligibility.data.businessDay;

    const now = ctx.clock.now();
    const nowIso = now.toISOString();
    const decantationId = existing?.id ?? ctx.ids.newId();
    const existingLineIds = new Set(existing?.lines.map((l) => l.id));

    const lines: DecantationTankLine[] = cmd.lines.map((l) => {
      const hasAfter = l.afterDip != null;
      return {
        id: l.id && existingLineIds.has(l.id) ? l.id : ctx.ids.newId(),
        decantationId,
        tankId: l.tankId,
        productId: tankById.get(l.tankId)!.productId,
        beforeDip: l.beforeDip,
        beforeDipAt: iso(l.beforeDipAt),
        observedDensity: l.observedDensity ?? null,
        observedTempC: l.observedTempC ?? null,
        roDensity: l.roDensity ?? null,
        afterDip: l.afterDip ?? null,
        afterDipAt: hasAfter ? (iso(l.afterDipAt) ?? nowIso) : iso(l.afterDipAt),
        salesDuring: l.salesDuring ?? 0,
        receivedQty: null,
        measuredBy: null,
        measurementRefId: null,
        measuredAt: null,
        status: 'PENDING_MEASUREMENT',
      };
    });
    const chambers: DecantationChamber[] = (cmd.chambers ?? []).map((c) => ({
      id: ctx.ids.newId(),
      decantationId,
      tankLineId: c.tankLineIndex != null ? lines[c.tankLineIndex].id : null,
      chamberNo: c.chamberNo,
      capacityL: c.capacityL ?? null,
      sealOk: c.sealOk ?? null,
      mark: c.mark ?? null,
      dipMm: c.dipMm ?? null,
      emptied: c.emptied ?? null,
    }));
    const chambersChecked = cmd.chambersChecked ?? chambers.length > 0;
    const unloadEndedAt = iso(cmd.unloadEndedAt);

    const settings = this.deps.settings ?? DEFAULT_DECANTATION_TOLERANCES;
    const { flags, warnings } = computeDecantationFlags({
      lines: lines.map((l, i) => ({
        id: l.id,
        roDensity: l.roDensity,
        invoiceDensity: cmd.lines[i].invoiceDensity ?? null,
        afterDipAt: l.afterDipAt,
      })),
      chambers,
      chambersChecked,
      unloadEndedAt,
      invoiceQuantity: cmd.invoiceQuantity ?? null,
      densityToleranceKgM3: settings.densityToleranceKgM3,
      settlingTimeMinutes: settings.settlingTimeMinutes,
    });

    let decantation: Decantation = {
      id: decantationId,
      organizationId: ctx.organizationId,
      stationId: cmd.stationId,
      businessDayId: bd.id,
      businessDate: bd.businessDate,
      documentNumber: existing?.documentNumber ?? (await this.deps.docNumbers.next('DECANTATION')),
      tankerNumber: cmd.tankerNumber,
      driverName: cmd.driverName ?? null,
      unloadStartedAt: iso(cmd.unloadStartedAt),
      unloadEndedAt,
      chambersChecked,
      status: cmd.draft ? 'DRAFT' : 'PENDING_MEASUREMENT',
      flags,
      notes: cmd.notes ?? null,
      recordedBy: existing?.recordedBy ?? ctx.actorId ?? null,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
      lines,
      chambers,
    };

    if (existing) await this.deps.decantations.replace(decantation);
    else await this.deps.decantations.insert(decantation);

    // One RO-density reading per line (replaced on update by `replace`).
    const readings: DensityReading[] = lines
      .filter((l) => l.roDensity != null)
      .map((l) => ({
        id: ctx.ids.newId(),
        organizationId: ctx.organizationId,
        stationId: cmd.stationId,
        businessDate: bd.businessDate,
        productId: l.productId,
        kind: 'DECANTATION',
        sampledFrom: 'TANK',
        tankId: l.tankId,
        nozzleId: null,
        entryMethod:
          l.observedDensity != null && l.observedTempC != null ? 'HYDROMETER' : 'DIRECT_15',
        observedDensity: l.observedDensity,
        observedTempC: l.observedTempC,
        density15: l.roDensity as number,
        decantationTankLineId: l.id,
        flags: [],
        recordedBy: ctx.actorId ?? null,
        recordedAt: nowIso,
      }));
    await this.deps.densityReadings.saveMany(readings);

    // #468: measure lines that already carry an after dip (posts stock movements).
    if (this.deps.measurement && !cmd.draft && lines.some((l) => l.afterDip != null)) {
      const measured = await this.deps.measurement.measureLinesWithAfterDip(ctx, decantation, {
        businessDayId: bd.id,
        businessDate: bd.businessDate,
      });
      if (!measured.success) return measured;
      decantation = measured.data;
    }

    const previous = new Set((existing?.flags ?? []).map(decantationFlagKey));
    const newFlags: DecantationFlag[] = flags.filter((f) => !previous.has(decantationFlagKey(f)));

    const common = { stationId: cmd.stationId, businessDayId: bd.id };
    const events: DomainEvent[] = [
      eventFromContext(ctx, {
        eventType: BusinessEvents.DECANTATION_RECORDED,
        aggregateType: 'Decantation',
        aggregateId: decantationId,
        ...common,
        payload: {
          decantationId,
          documentNumber: decantation.documentNumber,
          tankerNumber: decantation.tankerNumber,
          status: decantation.status,
          updated: !!existing,
          unloadStartedAt: decantation.unloadStartedAt,
          unloadEndedAt: decantation.unloadEndedAt,
          chambersChecked,
          lines: decantation.lines,
          chambers: decantation.chambers,
          flags,
        },
      }),
    ];
    if (newFlags.length > 0) {
      events.push(
        relatedEventFromContext(ctx, {
          eventType: BusinessEvents.DECANTATION_FLAGGED,
          aggregateType: 'Decantation',
          aggregateId: decantationId,
          ...common,
          payload: { decantationId, reasons: newFlags },
        }),
      );
    }
    for (const r of readings) {
      events.push(
        relatedEventFromContext(ctx, {
          eventType: BusinessEvents.DENSITY_RECORDED,
          aggregateType: 'DensityReading',
          aggregateId: r.id,
          ...common,
          payload: {
            densityReadingId: r.id,
            decantationId,
            tankLineId: r.decantationTankLineId,
            productId: r.productId,
            tankId: r.tankId,
            kind: r.kind,
            entryMethod: r.entryMethod,
            density15: r.density15,
          },
        }),
      );
    }
    await this.deps.events.publish(events);

    return ok({ decantation, warnings });
  }

  /**
   * The Decantation's own Business Day is closed (sealed). Only the after-dip
   * measurement fields (`afterDip`, `afterDipAt`, `salesDuring`) of still
   * PENDING lines may be added, matched by line id (or tank); every other field
   * in the command is ignored and the stored record stays as sealed. Lines that
   * get an after dip are measured at once; the stock movement is booked on the
   * current open Business Day, never on the sealed one.
   */
  private async addAfterDipToSealedDay(
    cmd: z.output<typeof schema>,
    existing: Decantation,
    ctx: ExecutionContext,
  ): Promise<Result<RecordDecantationResult>> {
    if (!this.deps.measurement)
      return err(invariantViolation('Business day is closed; the Decantation is sealed'));
    const nowIso = ctx.clock.now().toISOString();
    let touched = 0;
    const decantation: Decantation = {
      ...existing,
      lines: existing.lines.map((l) => ({ ...l })),
    };
    for (const input of cmd.lines) {
      const line = decantation.lines.find((l) =>
        input.id ? l.id === input.id : l.tankId === input.tankId,
      );
      if (!line || line.status !== 'PENDING_MEASUREMENT' || input.afterDip == null) continue;
      line.afterDip = input.afterDip;
      line.afterDipAt = iso(input.afterDipAt) ?? nowIso;
      line.salesDuring = input.salesDuring ?? line.salesDuring;
      touched++;
    }
    if (touched === 0)
      return err(
        invariantViolation('Business day is closed; only an after dip can be added', {
          decantationId: existing.id,
        }),
      );

    const day = await resolveBusinessDayWrite(this.deps.businessDays, ctx, {
      stationId: existing.stationId,
      kind: 'STOCK',
    });
    if (!day.success) return day;
    const bd = day.data.businessDay;

    const measured = await this.deps.measurement.measureLinesWithAfterDip(ctx, decantation, {
      businessDayId: bd.id,
      businessDate: bd.businessDate,
    });
    if (!measured.success) return measured;
    const result = measured.data;

    // Early-after-dip flags for the newly entered after dips; other flags are kept.
    const settings = this.deps.settings ?? DEFAULT_DECANTATION_TOLERANCES;
    const { flags: fresh } = computeDecantationFlags({
      lines: result.lines.map((l) => ({
        id: l.id,
        roDensity: null,
        invoiceDensity: null,
        afterDipAt: l.afterDipAt,
      })),
      chambers: [],
      chambersChecked: false,
      unloadEndedAt: result.unloadEndedAt,
      invoiceQuantity: null,
      densityToleranceKgM3: settings.densityToleranceKgM3,
      settlingTimeMinutes: settings.settlingTimeMinutes,
    });
    const known = new Set(result.flags.map(decantationFlagKey));
    const added = fresh.filter(
      (f) => f.code === 'EARLY_AFTER_DIP' && !known.has(decantationFlagKey(f)),
    );
    if (added.length > 0) {
      result.flags = [...result.flags, ...added];
      await this.deps.decantations.updateMeasurement(result);
    }

    const common = { stationId: existing.stationId, businessDayId: existing.businessDayId };
    const events: DomainEvent[] = [
      eventFromContext(ctx, {
        eventType: BusinessEvents.DECANTATION_RECORDED,
        aggregateType: 'Decantation',
        aggregateId: result.id,
        ...common,
        payload: {
          decantationId: result.id,
          documentNumber: result.documentNumber,
          tankerNumber: result.tankerNumber,
          status: result.status,
          updated: true,
          measuredBy: 'AFTER_DIP',
          measuredOnBusinessDayId: bd.id,
          lines: result.lines,
          flags: result.flags,
        },
      }),
    ];
    if (added.length > 0)
      events.push(
        relatedEventFromContext(ctx, {
          eventType: BusinessEvents.DECANTATION_FLAGGED,
          aggregateType: 'Decantation',
          aggregateId: result.id,
          ...common,
          payload: { decantationId: result.id, reasons: added },
        }),
      );
    await this.deps.events.publish(events);
    return ok({ decantation: result, warnings: [] });
  }
}
