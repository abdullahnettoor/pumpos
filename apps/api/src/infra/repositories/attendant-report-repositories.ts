import { and, eq, gte, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  AttendantCreditSaleSourceRow,
  AttendantHandoverReportQuery,
  AttendantHandoverReportReader,
  AttendantHandoverReportSource,
  AttendantHandoverSourceRow,
  AttendantNozzleReadingSourceRow,
  AttendantSaleSourceRow,
  AttendantTerminalEntrySourceRow,
} from '@pump/core';

const num = (v: string | number | null | undefined): number => Number(v ?? 0) || 0;

/**
 * Reads Attendant Handovers of finalized Shifts for a Business-Date range.
 *
 * Shifts carry no date column, so the range filters the Shift's Business Day.
 * Only CLOSED and LOCKED Shifts contribute: an open Shift's declarations can
 * still change, and the report exists to show final accountability.
 */
export class DrizzleAttendantHandoverReportReader implements AttendantHandoverReportReader {
  constructor(private readonly db: DbClient) {}

  async read(query: AttendantHandoverReportQuery): Promise<AttendantHandoverReportSource> {
    const filters = [
      eq(schema.attendantHandovers.organizationId, query.organizationId),
      eq(schema.attendantHandovers.stationId, query.stationId),
      inArray(schema.shifts.status, ['CLOSED', 'LOCKED']),
      gte(schema.businessDays.businessDate, query.from),
      lte(schema.businessDays.businessDate, query.to),
    ];
    if (query.attendantId) {
      filters.push(eq(schema.attendantHandovers.userId, query.attendantId));
    }

    const rows = await this.db
      .select({
        handoverId: schema.attendantHandovers.id,
        shiftId: schema.attendantHandovers.shiftId,
        businessDate: schema.businessDays.businessDate,
        shiftTemplateName: schema.shiftTemplates.name,
        closedAt: schema.shifts.closedAt,
        attendantId: schema.attendantHandovers.userId,
        attendantName: schema.users.fullName,
        duId: schema.attendantHandovers.duId,
        duName: schema.dispenserUnits.name,
        cashHandedOver: schema.attendantHandovers.cashHandedOver,
        cardHandedOver: schema.attendantHandovers.cardHandedOver,
        upiHandedOver: schema.attendantHandovers.upiHandedOver,
        creditHandedOver: schema.attendantHandovers.creditHandedOver,
        expectedSales: schema.attendantHandovers.expectedSales,
        varianceAmount: schema.attendantHandovers.varianceAmount,
        testingVolume: schema.attendantHandovers.testingVolume,
      })
      .from(schema.attendantHandovers)
      .innerJoin(schema.shifts, eq(schema.attendantHandovers.shiftId, schema.shifts.id))
      .innerJoin(schema.businessDays, eq(schema.shifts.businessDayId, schema.businessDays.id))
      .leftJoin(schema.shiftTemplates, eq(schema.shifts.shiftTemplateId, schema.shiftTemplates.id))
      .innerJoin(schema.users, eq(schema.attendantHandovers.userId, schema.users.id))
      .innerJoin(
        schema.dispenserUnits,
        eq(schema.attendantHandovers.duId, schema.dispenserUnits.id),
      )
      .where(and(...filters));

    const handovers: AttendantHandoverSourceRow[] = rows.map((r) => ({
      handoverId: r.handoverId,
      shiftId: r.shiftId,
      businessDate: r.businessDate,
      shiftTemplateName: r.shiftTemplateName ?? null,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      attendantId: r.attendantId,
      attendantName: r.attendantName,
      duId: r.duId,
      duName: r.duName,
      cashHandedOver: num(r.cashHandedOver),
      cardHandedOver: num(r.cardHandedOver),
      upiHandedOver: num(r.upiHandedOver),
      creditHandedOver: num(r.creditHandedOver),
      expectedFuelSales: num(r.expectedSales),
      varianceAmount: num(r.varianceAmount),
      testingVolume: num(r.testingVolume),
    }));

    // Components are attributed to the (Shift, Attendant) pairs the handovers
    // already established, so an unrelated attendant's sales never leak in.
    const shiftIds = [...new Set(handovers.map((h) => h.shiftId))];
    if (shiftIds.length === 0) {
      return { handovers, sales: [], creditSales: [], terminalEntries: [], nozzleReadings: [] };
    }

    const handoverIds = handovers.map((h) => h.handoverId);
    const duIds = [...new Set(handovers.map((h) => h.duId))];

    const [sales, creditSales, terminalEntries, nozzleReadings] = await Promise.all([
      this.readSales(shiftIds, query),
      this.readCreditSales(shiftIds, query),
      this.readTerminalEntries(handoverIds, query.organizationId),
      this.readNozzleReadings(shiftIds, duIds, query),
    ]);

    return { handovers, sales, creditSales, terminalEntries, nozzleReadings };
  }

  /** Per-terminal card/UPI detail declared inside those Handovers. */
  private async readTerminalEntries(
    handoverIds: string[],
    organizationId: string,
  ): Promise<AttendantTerminalEntrySourceRow[]> {
    const rows = await this.db
      .select({
        handoverId: schema.handoverTerminalEntries.handoverId,
        terminalId: schema.handoverTerminalEntries.terminalId,
        terminalName: schema.paymentTerminals.label,
        cardAmount: schema.handoverTerminalEntries.cardAmount,
        upiAmount: schema.handoverTerminalEntries.upiAmount,
        batchRef: schema.handoverTerminalEntries.batchRef,
      })
      .from(schema.handoverTerminalEntries)
      .innerJoin(
        schema.paymentTerminals,
        eq(schema.handoverTerminalEntries.terminalId, schema.paymentTerminals.id),
      )
      .where(
        and(
          inArray(schema.handoverTerminalEntries.handoverId, handoverIds),
          eq(schema.handoverTerminalEntries.organizationId, organizationId),
        ),
      );

    return rows.map((r) => ({
      handoverId: r.handoverId,
      terminalId: r.terminalId,
      terminalName: r.terminalName,
      cardAmount: num(r.cardAmount),
      upiAmount: num(r.upiAmount),
      batchRef: r.batchRef ?? null,
    }));
  }

  /**
   * Readings of the Nozzles belonging to the Handovers' Dispensers. A Handover
   * is accountable for one Dispenser, so the reading reaches it through
   * (Shift, Dispenser) rather than through the Handover row itself.
   */
  private async readNozzleReadings(
    shiftIds: string[],
    duIds: string[],
    query: AttendantHandoverReportQuery,
  ): Promise<AttendantNozzleReadingSourceRow[]> {
    const rows = await this.db
      .select({
        shiftId: schema.nozzleReadings.shiftId,
        duId: schema.nozzles.duId,
        nozzleId: schema.nozzleReadings.nozzleId,
        nozzleName: schema.nozzles.name,
        productName: schema.products.name,
        openingReading: schema.nozzleReadings.openingReading,
        closingReading: schema.nozzleReadings.closingReading,
        volumeSold: schema.nozzleReadings.volumeSold,
        testingVolume: schema.nozzleReadings.testingVolume,
        unitPrice: schema.nozzleReadings.unitPrice,
      })
      .from(schema.nozzleReadings)
      .innerJoin(schema.nozzles, eq(schema.nozzleReadings.nozzleId, schema.nozzles.id))
      .leftJoin(schema.products, eq(schema.nozzles.productId, schema.products.id))
      .where(
        and(inArray(schema.nozzleReadings.shiftId, shiftIds), inArray(schema.nozzles.duId, duIds)),
      );

    return rows.map((r) => ({
      shiftId: r.shiftId,
      duId: r.duId,
      nozzleId: r.nozzleId,
      nozzleName: r.nozzleName,
      productName: r.productName ?? null,
      openingReading: num(r.openingReading),
      closingReading: num(r.closingReading),
      volumeSold: num(r.volumeSold),
      testingVolume: num(r.testingVolume),
      unitPrice: r.unitPrice === null ? null : num(r.unitPrice),
    }));
  }

  /**
   * Non-fuel Sales for those Shifts. `MERCH_HANDOVER` captures the one bulk
   * end-of-shift declaration; every other capture is an individually Billed
   * Sale. Fuel is excluded — it is metered through nozzle readings and already
   * carried by the Handover's expected sales.
   */
  private async readSales(
    shiftIds: string[],
    query: AttendantHandoverReportQuery,
  ): Promise<AttendantSaleSourceRow[]> {
    const filters = [
      inArray(schema.sales.shiftId, shiftIds),
      // Scoped explicitly rather than trusting the caller's id list: a tenant
      // predicate must not depend on an invariant held somewhere else.
      eq(schema.businessDays.organizationId, query.organizationId),
      ne(schema.sales.saleType, 'Fuel'),
      isNotNull(schema.sales.attendantId),
    ];
    if (query.attendantId) filters.push(eq(schema.sales.attendantId, query.attendantId));

    const rows = await this.db
      .select({
        shiftId: schema.sales.shiftId,
        attendantId: schema.sales.attendantId,
        captureMechanism: schema.sales.captureMechanism,
        totalAmount: schema.sales.totalAmount,
      })
      .from(schema.sales)
      .innerJoin(schema.businessDays, eq(schema.sales.businessDayId, schema.businessDays.id))
      .where(and(...filters));

    return rows.map((r) => ({
      shiftId: r.shiftId,
      attendantId: r.attendantId as string,
      captureMechanism: r.captureMechanism,
      totalAmount: num(r.totalAmount),
    }));
  }

  /**
   * Fuel-on-credit chits raised within those Shifts (receivables, not drawer cash).
   *
   * Restricted to `CREDIT_SALE` references. A merchandise Sale settled on
   * credit also writes a customer-ledger row, referencing its Sale — counting
   * that here as well would double-count it against the Billed Sale it mirrors.
   */
  private async readCreditSales(
    shiftIds: string[],
    query: AttendantHandoverReportQuery,
  ): Promise<AttendantCreditSaleSourceRow[]> {
    const filters = [
      inArray(schema.customerTransactions.shiftId, shiftIds),
      eq(schema.businessDays.organizationId, query.organizationId),
      eq(schema.customerTransactions.transactionType, 'Credit Sale'),
      eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
      isNotNull(schema.customerTransactions.attendantId),
    ];
    if (query.attendantId) {
      filters.push(eq(schema.customerTransactions.attendantId, query.attendantId));
    }

    const rows = await this.db
      .select({
        shiftId: schema.customerTransactions.shiftId,
        attendantId: schema.customerTransactions.attendantId,
        amount: schema.customerTransactions.amount,
      })
      .from(schema.customerTransactions)
      .innerJoin(
        schema.businessDays,
        eq(schema.customerTransactions.businessDayId, schema.businessDays.id),
      )
      .where(and(...filters));

    return rows.map((r) => ({
      shiftId: r.shiftId as string,
      attendantId: r.attendantId as string,
      amount: num(r.amount),
    }));
  }
}
