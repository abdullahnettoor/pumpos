import { z } from 'zod';
import {
  BusinessEvents,
  err,
  eventFromContext,
  invariantViolation,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type {
  AcceptedHandoverReading,
  AttendantHandover,
  HandoverContextReader,
  HandoverRepository,
  HandoverTerminalEntry,
  ShiftRepository,
} from './ports.js';

export interface RecordHandoverCommand {
  shiftId: string;
  attendantId: string;
  duId: string;
  cashHandedOver: number | string;
  cardHandedOver?: number | string;
  upiHandedOver?: number | string;
  nozzleReadings: Array<{ nozzleId: string; closingReading: number | string; testingVolume?: number | string }>;
  terminalEntries?: Array<{
    terminalId: string;
    duId?: string | null;
    cardAmount: number | string;
    upiAmount: number | string;
    batchRef?: string | null;
  }>;
}

export interface RecordHandoverDeps {
  shifts: ShiftRepository;
  context: HandoverContextReader;
  handovers: HandoverRepository;
  events: EventPublisher;
}

export interface RecordHandoverResult {
  handover: AttendantHandover;
  terminalEntries: HandoverTerminalEntry[];
  nozzleReadings: AcceptedHandoverReading[];
  expectedFuelSales: number;
  merchandiseCash: number;
  expectedSales: number;
  expectedTotal: number;
  creditSales: number;
  omcCardSales: number;
  declaredTotal: number;
  varianceAmount: number;
  replaced: boolean;
}

const amount = z.coerce.number().finite().min(0);
const commandSchema = z.object({
  shiftId: z.string().min(1),
  attendantId: z.string().min(1),
  duId: z.string().min(1),
  cashHandedOver: amount,
  cardHandedOver: amount.optional(),
  upiHandedOver: amount.optional(),
  nozzleReadings: z.array(z.object({
    nozzleId: z.string().min(1),
    closingReading: z.coerce.number().finite().min(0),
    testingVolume: z.coerce.number().finite().min(0).optional(),
  })).min(1),
  terminalEntries: z.array(z.object({
    terminalId: z.string().min(1),
    duId: z.string().min(1).nullish(),
    cardAmount: amount,
    upiAmount: amount,
    batchRef: z.string().max(100).nullish(),
  })).optional(),
});

const roundPaise = (value: number) => Math.round(value * 100) / 100 || 0;

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export class RecordHandover implements UseCase<RecordHandoverCommand, RecordHandoverResult> {
  constructor(private readonly deps: RecordHandoverDeps) {}

  async execute(input: RecordHandoverCommand, ctx: ExecutionContext): Promise<Result<RecordHandoverResult>> {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) return err(validationError('Invalid RecordHandover command', { issues: parsed.error.flatten() }));
    const cmd = parsed.data;

    if (hasDuplicates(cmd.nozzleReadings.map((reading) => reading.nozzleId))) {
      return err(validationError('Duplicate Nozzle IDs are not allowed'));
    }
    if (hasDuplicates((cmd.terminalEntries ?? []).map((entry) => entry.terminalId))) {
      return err(validationError('Duplicate Payment Terminal IDs are not allowed'));
    }

    const shift = await this.deps.shifts.findById(cmd.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
    if (ctx.stationId && shift.stationId !== ctx.stationId) return err(notFoundError('Shift', cmd.shiftId));
    if (shift.status !== 'OPEN') {
      return err(invariantViolation('Shift is not open', { shiftId: shift.id, status: shift.status }));
    }

    const source = await this.deps.context.load(ctx.organizationId, shift.stationId, shift.id, cmd.attendantId, cmd.duId);
    if (!source.attendant || source.attendant.organizationId !== ctx.organizationId) return err(notFoundError('Attendant', cmd.attendantId));
    if (source.attendant.role !== 'Attendant') return err(validationError('Assigned user is not an Attendant', { attendantId: cmd.attendantId }));
    if (source.attendant.status !== 'ACTIVE') return err(invariantViolation('Attendant is not active', { attendantId: cmd.attendantId }));
    if (!source.dispenser || source.dispenser.organizationId !== ctx.organizationId || source.dispenser.stationId !== shift.stationId) {
      return err(notFoundError('Dispenser', cmd.duId));
    }
    if (source.dispenser.status !== 'ACTIVE') return err(invariantViolation('Dispenser is not active', { duId: cmd.duId }));
    if (!source.assigned) {
      return err(invariantViolation('Attendant is not assigned to this Dispenser for the Shift', {
        shiftId: shift.id,
        attendantId: cmd.attendantId,
        duId: cmd.duId,
      }));
    }

    if (source.missingReadingNozzleIds.length > 0) {
      return err(invariantViolation('Shift is missing Opening Readings for this Dispenser', {
        shiftId: shift.id,
        nozzleIds: source.missingReadingNozzleIds,
      }));
    }
    const expectedNozzles = source.nozzleReadings.filter((reading) =>
      reading.organizationId === ctx.organizationId && reading.stationId === shift.stationId && reading.duId === cmd.duId);
    const expectedIds = new Set(expectedNozzles.map((reading) => reading.nozzleId));
    const submittedIds = new Set(cmd.nozzleReadings.map((reading) => reading.nozzleId));
    if (expectedIds.size !== submittedIds.size || [...expectedIds].some((id) => !submittedIds.has(id))) {
      return err(validationError('Nozzle Readings must include every Nozzle assigned to this Dispenser', {
        expectedNozzleIds: [...expectedIds],
        submittedNozzleIds: [...submittedIds],
      }));
    }

    const submittedByNozzle = new Map(cmd.nozzleReadings.map((reading) => [reading.nozzleId, reading]));
    const acceptedReadings: AcceptedHandoverReading[] = [];
    let expectedFuelSales = 0;
    let testingVolume = 0;
    for (const persisted of expectedNozzles) {
      const submitted = submittedByNozzle.get(persisted.nozzleId)!;
      const openingReading = Number(persisted.openingReading);
      const closingReading = Number(submitted.closingReading);
      if (closingReading < openingReading) {
        return err(validationError('Closing Reading cannot be below Opening Reading', {
          nozzleId: persisted.nozzleId,
          openingReading,
          closingReading,
        }));
      }
      const grossVolume = closingReading - openingReading;
      const acceptedTesting = submitted.testingVolume === undefined ? Number(persisted.testingVolume ?? 0) : Number(submitted.testingVolume);
      if (acceptedTesting > grossVolume) {
        return err(validationError('Testing volume cannot exceed gross metered volume', {
          nozzleId: persisted.nozzleId,
          grossVolume,
          testingVolume: acceptedTesting,
        }));
      }
      const unitPrice = Number(persisted.unitPrice ?? 0);
      const netVolume = grossVolume - acceptedTesting;
      const nozzleSales = netVolume * unitPrice;
      expectedFuelSales += nozzleSales;
      testingVolume += acceptedTesting;
      acceptedReadings.push({
        id: persisted.id,
        nozzleId: persisted.nozzleId,
        openingReading,
        closingReading,
        grossVolume,
        testingVolume: acceptedTesting,
        netVolume,
        unitPrice,
        expectedSales: nozzleSales,
      });
    }

    const activeTerminals = source.terminals.filter((terminal) => terminal.isActive);
    const submittedTerminals = cmd.terminalEntries ?? [];
    const terminalById = new Map(
      activeTerminals.filter((terminal) => terminal.linkedDuId === null || terminal.linkedDuId === cmd.duId).map((terminal) => [terminal.id, terminal]),
    );
    for (const entry of submittedTerminals) {
      const terminal = terminalById.get(entry.terminalId);
      if (!terminal || terminal.organizationId !== ctx.organizationId || terminal.stationId !== shift.stationId) {
        return err(validationError('Payment Terminal is not assigned to this Dispenser for the Shift', { terminalId: entry.terminalId }));
      }
      if (entry.duId && entry.duId !== cmd.duId) return err(validationError('Payment Terminal entry has the wrong Dispenser', { terminalId: entry.terminalId }));
      if (entry.cardAmount > 0 && !terminal.supportsCard) return err(validationError('Payment Terminal does not support card payments', { terminalId: entry.terminalId }));
      if (entry.upiAmount > 0 && !terminal.supportsUpi) return err(validationError('Payment Terminal does not support UPI payments', { terminalId: entry.terminalId }));
    }

    const hasTerminalDetails = submittedTerminals.length > 0;
    const hasConfiguredTerminals = activeTerminals.length > 0;
    if (hasConfiguredTerminals && !hasTerminalDetails && (Number(cmd.cardHandedOver ?? 0) > 0 || Number(cmd.upiHandedOver ?? 0) > 0)) {
      return err(validationError('Payment Terminal detail is required for card or UPI declarations'));
    }
    const cardHandedOver = hasTerminalDetails
      ? submittedTerminals.reduce((sum, entry) => sum + entry.cardAmount, 0)
      : Number(cmd.cardHandedOver ?? 0);
    const upiHandedOver = hasTerminalDetails
      ? submittedTerminals.reduce((sum, entry) => sum + entry.upiAmount, 0)
      : Number(cmd.upiHandedOver ?? 0);

    const cashHandedOver = Number(cmd.cashHandedOver);
    const expectedTotal = expectedFuelSales + source.merchandiseCash;
    const declaredTotal = cashHandedOver + cardHandedOver + upiHandedOver + source.creditSales + source.omcCardSales;
    const varianceAmount = roundPaise(declaredTotal - expectedTotal);
    const now = ctx.clock.now().toISOString();
    const handover: AttendantHandover = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: shift.stationId,
      shiftId: shift.id,
      attendantId: cmd.attendantId,
      duId: cmd.duId,
      cashHandedOver: String(cashHandedOver),
      cardHandedOver: String(cardHandedOver),
      upiHandedOver: String(upiHandedOver),
      creditHandedOver: String(source.creditSales),
      testingVolume: String(testingVolume),
      expectedSales: String(expectedFuelSales),
      varianceAmount: String(varianceAmount),
      createdAt: now,
    };
    const entries: HandoverTerminalEntry[] = submittedTerminals.map((entry) => ({
      id: ctx.ids.newId(),
      handoverId: handover.id,
      terminalId: entry.terminalId,
      duId: cmd.duId,
      cardAmount: String(entry.cardAmount),
      upiAmount: String(entry.upiAmount),
      batchRef: entry.batchRef ?? null,
      createdAt: now,
    }));

    const saved = await this.deps.handovers.replaceCurrent(handover, entries);
    await this.deps.handovers.updateReadings(acceptedReadings);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.HANDOVER_RECORDED,
        aggregateType: 'AttendantHandover',
        aggregateId: saved.handover.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        groupingRole: 'primary',
        payload: {
          handoverId: saved.handover.id,
          shiftId: shift.id,
          attendantId: cmd.attendantId,
          attendantName: source.attendant.fullName,
          dispenserId: cmd.duId,
          dispenserName: source.dispenser.name,
          disposition: saved.replaced ? 'REPLACED' : 'CREATED',
          cashHandedOver,
          cardHandedOver,
          upiHandedOver,
          creditSales: source.creditSales,
          omcCardSales: source.omcCardSales,
          expectedSales: expectedFuelSales,
          expectedTotal,
          declaredTotal,
          varianceAmount,
        },
        presentation: {
          templateId: 'handover-recorded.v1',
          values: { attendantName: source.attendant.fullName, duName: source.dispenser.name },
        },
      }),
    ]);

    return ok({
      handover: saved.handover,
      terminalEntries: saved.terminalEntries,
      nozzleReadings: acceptedReadings,
      expectedFuelSales,
      merchandiseCash: source.merchandiseCash,
      expectedSales: expectedFuelSales,
      expectedTotal,
      creditSales: source.creditSales,
      omcCardSales: source.omcCardSales,
      declaredTotal,
      varianceAmount,
      replaced: saved.replaced,
    });
  }
}
