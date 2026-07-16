import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, conflictError, err, eventFromContext, ok, validationError } from '../../../kernel/index.js';
import type { DomainEvent, EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { BusinessDay, BusinessDayRepository } from '../business-days/index.js';
import type { NozzleRepository } from '../../station-setup/nozzles/index.js';
import type { FuelPriceRepository } from '../../station-setup/pricing/index.js';
import type {
  NozzleReading,
  NozzleReadingRepository,
  Shift,
  ShiftRepository,
  StaffAssignmentInput,
  TerminalLinkInput,
} from './ports.js';

export interface OpenShiftCommand {
  stationId: string;
  shiftTemplateId: string;
  openingCash: number | string;
  /** Business day this shift anchors to (YYYY-MM-DD). Defaults to today. */
  businessDate?: string;
  staffAssignments?: StaffAssignmentInput[];
  terminalLinks?: TerminalLinkInput[];
  initialReadings?: { nozzleId: string; openingReading: number }[];
}

const schema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  shiftTemplateId: z.string().min(1, 'shiftTemplateId is required'),
  openingCash: z.coerce.number().min(0, 'openingCash must be >= 0'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'businessDate must be YYYY-MM-DD').optional(),
  staffAssignments: z.array(z.object({ userId: z.string().min(1), duId: z.string().min(1) })).optional(),
  terminalLinks: z.array(z.object({ terminalId: z.string().min(1), duId: z.string().nullish() })).optional(),
  initialReadings: z.array(z.object({ nozzleId: z.string().min(1), openingReading: z.coerce.number().min(0) })).optional(),
});

export interface OpenShiftDeps {
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  nozzles: NozzleRepository;
  nozzleReadings: NozzleReadingRepository;
  fuelPrices: FuelPriceRepository;
  events: EventPublisher;
}

export interface OpenShiftResult {
  shift: Shift;
  businessDay: BusinessDay;
}

/**
 * Open an operating shift for a station. Ensures an OPEN business day exists
 * (opening the first shift of the day opens the day), rejects a second open
 * shift, links staff DUs + payment terminals, and seeds each nozzle's opening
 * reading from its last closing reading (or the provided initial reading).
 *
 * Run inside a transaction (runInTransaction) so all writes + events are atomic.
 */
export class OpenShift implements UseCase<OpenShiftCommand, OpenShiftResult> {
  constructor(private readonly deps: OpenShiftDeps) {}

  async execute(input: OpenShiftCommand, ctx: ExecutionContext): Promise<Result<OpenShiftResult>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid OpenShift command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const existingOpen = await this.deps.shifts.findOpenByStation(ctx.organizationId, cmd.stationId);
    if (existingOpen) {
      return err(conflictError('A shift is already open at this station', { shiftId: existingOpen.id }));
    }

    const events: DomainEvent[] = [];
    const now = ctx.clock.now();
    const nowIso = now.toISOString();

    // Anchor to TODAY's business day (calendar-date model): find it for this
    // date, or lazily open it. Business days are per (station, date); several
    // may stay open at once — an earlier day can be closed later (e.g. close
    // day 1 while on day 5) without blocking today's day from being opened.
    // The operator may back-date (e.g. forgot to open yesterday); future dates
    // are rejected.
    const today = resolveBusinessDate({ now, timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
    if (cmd.businessDate && cmd.businessDate > today) {
      return err(validationError('Business date cannot be in the future', { businessDate: cmd.businessDate }));
    }
    const businessDate = cmd.businessDate ?? today;
    let businessDay = await this.deps.businessDays.findByStationAndDate(ctx.organizationId, cmd.stationId, businessDate);
    if (!businessDay) {
      businessDay = {
        id: ctx.ids.newId(),
        organizationId: ctx.organizationId,
        stationId: cmd.stationId,
        businessDate,
        status: 'OPEN',
        openedBy: ctx.actorId ?? 'system',
        openedAt: nowIso,
        closedBy: null,
        closedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await this.deps.businessDays.save(businessDay);
      events.push(
        eventFromContext(ctx, {
          eventType: BusinessEvents.BUSINESS_DAY_OPENED,
          aggregateType: 'BusinessDay',
          aggregateId: businessDay.id,
          stationId: businessDay.stationId,
          businessDayId: businessDay.id,
          payload: { businessDayId: businessDay.id, businessDate: businessDay.businessDate },
        }),
      );
    }

    // Create the shift.
    const shift: Shift = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: cmd.stationId,
      businessDayId: businessDay.id,
      shiftTemplateId: cmd.shiftTemplateId,
      status: 'OPEN',
      openedBy: ctx.actorId ?? 'system',
      openedAt: nowIso,
      closedBy: null,
      closedAt: null,
      lockedAt: null,
      openingCash: String(cmd.openingCash),
      closingCash: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.deps.shifts.save(shift);

    if (cmd.staffAssignments && cmd.staffAssignments.length > 0) {
      await this.deps.shifts.addStaffAssignments(shift.id, cmd.staffAssignments);
    }
    if (cmd.terminalLinks && cmd.terminalLinks.length > 0) {
      await this.deps.shifts.addTerminalLinks(shift.id, cmd.terminalLinks);
    }

    // Seed nozzle opening readings.
    const nozzles = await this.deps.nozzles.listByStation(ctx.organizationId, cmd.stationId);
    if (nozzles.length > 0) {
      const lastClosing = await this.deps.nozzleReadings.lastClosingByNozzleIds(nozzles.map((n) => n.id));
      const prices = await this.deps.fuelPrices.listByStation(ctx.organizationId, cmd.stationId);
      const latestPriceByProduct = new Map<string, string>();
      for (const pr of prices) {
        if (!latestPriceByProduct.has(pr.productId)) latestPriceByProduct.set(pr.productId, pr.price);
      }
      const initialByNozzle = new Map<string, number>();
      for (const ir of cmd.initialReadings ?? []) initialByNozzle.set(ir.nozzleId, ir.openingReading);

      const readings: NozzleReading[] = nozzles.map((n) => {
        const opening =
          lastClosing.get(n.id) ??
          initialByNozzle.get(n.id) ??
          Number(n.currentReading);
        return {
          id: ctx.ids.newId(),
          shiftId: shift.id,
          nozzleId: n.id,
          openingReading: String(opening),
          closingReading: String(opening),
          volumeSold: '0',
          testingVolume: '0',
          unitPrice: latestPriceByProduct.get(n.productId) ?? '0',
          createdAt: nowIso,
        };
      });
      await this.deps.nozzleReadings.saveMany(readings);
    }

    events.push(
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_OPENED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: businessDay.id,
        payload: { shiftId: shift.id, openingCash: shift.openingCash, openedBy: shift.openedBy },
      }),
    );

    await this.deps.events.publish(events);

    return ok({ shift, businessDay });
  }
}
