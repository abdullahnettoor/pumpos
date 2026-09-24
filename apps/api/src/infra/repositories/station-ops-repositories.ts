import { and, eq, gte, inArray, desc, ne, or, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  BusinessDay,
  BusinessDayRepository,
  BusinessDayLock,
  BusinessDayStatusReader,
  BusinessDayStatusQuery,
  BusinessDayStatusSlices,
  BusinessDayStatusItem,
  Shift,
  ShiftRepository,
  StaffAssignmentInput,
  TerminalLinkInput,
  NozzleReading,
  NozzleReadingRepository,
  NozzleClosingUpdate,
  StockMovementInput,
  StockMovementWriter,
  ShiftSummaryStore,
  AcceptedHandoverReading,
  AttendantHandover,
  HandoverContext,
  HandoverContextReader,
  HandoverRepository,
  HandoverTerminalEntry,
  CloseShiftContext,
  CloseShiftContextReader,
} from '@pump/core';
import { rowJson, tsIso } from '../sql-json.js';
import {
  assembleReconTotals,
  creditSaleLinesJson,
  reconTotalsJson,
  toCreditSaleRecord,
  updateReadingColumns,
  type CreditSaleLineRow,
} from './shift-recon-sql.js';

export class DrizzleBusinessDayStatusReader implements BusinessDayStatusReader {
  constructor(private readonly db: DbClient) {}

  private projection() {
    return {
      id: schema.businessDays.id,
      businessDate: schema.businessDays.businessDate,
      status: schema.businessDays.status,
      openedAt: schema.businessDays.openedAt,
      closedAt: schema.businessDays.closedAt,
      // The correlation MUST be qualified as business_days.id: Drizzle renders
      // a bare column reference unqualified inside a raw sql`` fragment, so an
      // unqualified `id` resolves to the subquery's own `s.id` / `e.id` scope —
      // `s.business_day_id = s.id` is never true (#225).
      openShiftCount: sql<number>`(SELECT COUNT(*)::int FROM shifts s WHERE s.business_day_id = business_days.id AND s.status = 'OPEN')`,
      closedShiftCount: sql<number>`(SELECT COUNT(*)::int FROM shifts s WHERE s.business_day_id = business_days.id AND s.status IN ('CLOSED', 'LOCKED'))`,
      // Rendered as ISO-8601 UTC in SQL: the raw fragment bypasses Drizzle's
      // column mapper, and postgres-js would hand back a zone-less string that
      // `new Date()` mis-parses as local time.
      lastActivityAt: sql<string>`to_char(GREATEST(
        ${schema.businessDays.updatedAt},
        COALESCE((SELECT MAX(s.updated_at) FROM shifts s WHERE s.business_day_id = business_days.id), ${schema.businessDays.updatedAt}),
        COALESCE((SELECT MAX(e.occurred_at) FROM events e WHERE e.business_day_id = business_days.id), ${schema.businessDays.updatedAt})
      ), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
    };
  }

  private toItem(row: any): BusinessDayStatusItem {
    // Raw SQL fragments (e.g. the GREATEST(...) lastActivityAt) bypass Drizzle's
    // column mappers and arrive as strings from postgres-js, so normalize both.
    const toIso = (v: Date | string | null | undefined): string | null =>
      v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();
    return {
      ...row,
      status: row.status as BusinessDayStatusItem['status'],
      openedAt: toIso(row.openedAt)!,
      closedAt: toIso(row.closedAt),
      openShiftCount: Number(row.openShiftCount),
      closedShiftCount: Number(row.closedShiftCount),
      lastActivityAt: toIso(row.lastActivityAt)!,
    };
  }

  async loadSlices({
    organizationId,
    stationId,
    requestedBusinessDate,
    currentBusinessDate,
    recentFromBusinessDate,
  }: BusinessDayStatusQuery): Promise<BusinessDayStatusSlices> {
    // ONE query for all four slices (#155): the requested date's day, every
    // OPEN day, and every day inside the recent window. Classification happens
    // here, not in SQL — the slices overlap heavily, and four queries would be
    // four round-trips of Worker CPU for one panel.
    //
    // `business_date` is varchar(10) YYYY-MM-DD, so `>=` is a lexicographic
    // comparison that coincides with chronological order. That is only true
    // because the format is zero-padded and fixed-width.
    const rows = await this.db
      .select(this.projection())
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, organizationId),
          eq(schema.businessDays.stationId, stationId),
          or(
            eq(schema.businessDays.businessDate, requestedBusinessDate),
            eq(schema.businessDays.status, 'OPEN'),
            gte(schema.businessDays.businessDate, recentFromBusinessDate),
          ),
        ),
      )
      .orderBy(desc(schema.businessDays.businessDate));
    const items = rows.map((row) => this.toItem(row));
    const open = items.filter((i) => i.status === 'OPEN');
    return {
      requested: items.find((i) => i.businessDate === requestedBusinessDate) ?? null,
      open,
      pastOpen: open.filter((i) => i.businessDate < currentBusinessDate),
      // The window, plus any open day outside it. The window is bounded at
      // BOTH ends: a future-dated day pulled in for the `requested` slice is
      // one the operator navigated to, not a recent one. An OPEN day is kept
      // at any age — including a future-dated one — because it still needs
      // closing and this list replaced the panel that was showing it.
      recent: items.filter(
        (i) =>
          (i.businessDate >= recentFromBusinessDate && i.businessDate <= currentBusinessDate) ||
          i.status === 'OPEN',
      ),
    };
  }
}

export class DrizzleBusinessDayRepository implements BusinessDayRepository, BusinessDayLock {
  constructor(private readonly db: DbClient) {}

  private toEntity(r: typeof schema.businessDays.$inferSelect): BusinessDay {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      businessDate: r.businessDate,
      status: r.status as BusinessDay['status'],
      openedBy: r.openedBy,
      openedAt: r.openedAt.toISOString(),
      closedBy: r.closedBy,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async findById(id: string): Promise<BusinessDay | null> {
    const [r] = await this.db
      .select()
      .from(schema.businessDays)
      .where(eq(schema.businessDays.id, id))
      .limit(1);
    return r ? this.toEntity(r) : null;
  }

  async lockById(organizationId: string, businessDayId: string): Promise<void> {
    await this.db
      .select({ id: schema.businessDays.id })
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.id, businessDayId),
          eq(schema.businessDays.organizationId, organizationId),
        ),
      )
      .for('update');
  }

  async lockStation(organizationId: string, stationId: string): Promise<void> {
    await this.db
      .select({ id: schema.stations.id })
      .from(schema.stations)
      .where(
        and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, organizationId)),
      )
      .for('update');
  }

  async lockByStationAndDate(
    organizationId: string,
    stationId: string,
    businessDate: string,
  ): Promise<void> {
    await this.db
      .select({ id: schema.businessDays.id })
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, organizationId),
          eq(schema.businessDays.stationId, stationId),
          eq(schema.businessDays.businessDate, businessDate),
        ),
      )
      .for('update');
  }

  async save(d: BusinessDay): Promise<void> {
    await this.db
      .insert(schema.businessDays)
      .values({
        id: d.id,
        organizationId: d.organizationId,
        stationId: d.stationId,
        businessDate: d.businessDate,
        status: d.status,
        openedBy: d.openedBy,
        openedAt: new Date(d.openedAt),
        closedBy: d.closedBy,
        closedAt: d.closedAt ? new Date(d.closedAt) : null,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.businessDays.id,
        set: {
          status: d.status,
          closedBy: d.closedBy,
          closedAt: d.closedAt ? new Date(d.closedAt) : null,
          updatedAt: new Date(d.updatedAt),
        },
      });
  }

  async findOpenByStation(organizationId: string, stationId: string): Promise<BusinessDay | null> {
    const [r] = await this.db
      .select()
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, organizationId),
          eq(schema.businessDays.stationId, stationId),
          eq(schema.businessDays.status, 'OPEN'),
        ),
      )
      .orderBy(desc(schema.businessDays.businessDate))
      .limit(1);
    return r ? this.toEntity(r) : null;
  }

  async findByStationAndDate(
    organizationId: string,
    stationId: string,
    businessDate: string,
  ): Promise<BusinessDay | null> {
    const [r] = await this.db
      .select()
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, organizationId),
          eq(schema.businessDays.stationId, stationId),
          eq(schema.businessDays.businessDate, businessDate),
        ),
      )
      .limit(1);
    return r ? this.toEntity(r) : null;
  }
}

// ---------------- Shifts ----------------
export class DrizzleShiftRepository implements ShiftRepository {
  constructor(private readonly db: DbClient) {}
  async hasOpenShift(businessDayId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.shifts.id })
      .from(schema.shifts)
      .where(and(eq(schema.shifts.businessDayId, businessDayId), eq(schema.shifts.status, 'OPEN')))
      .limit(1);
    return Boolean(row);
  }
  private toEntity(r: typeof schema.shifts.$inferSelect): Shift {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      businessDayId: r.businessDayId,
      shiftTemplateId: r.shiftTemplateId,
      status: r.status as Shift['status'],
      openedBy: r.openedBy,
      openedAt: r.openedAt.toISOString(),
      closedBy: r.closedBy,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
      openingCash: '0', // TODO(#274): shifts.opening_cash dropped (ADR 0005, #280)
      closingCash: r.closingCash,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<Shift | null> {
    const [r] = await this.db
      .select()
      .from(schema.shifts)
      .where(eq(schema.shifts.id, id))
      .limit(1)
      .for('update');
    return r ? this.toEntity(r) : null;
  }
  async findByIdWithoutLock(id: string): Promise<Shift | null> {
    const [r] = await this.db.select().from(schema.shifts).where(eq(schema.shifts.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(s: Shift): Promise<void> {
    await this.db
      .insert(schema.shifts)
      .values({
        id: s.id,
        organizationId: s.organizationId,
        stationId: s.stationId,
        businessDayId: s.businessDayId,
        shiftTemplateId: s.shiftTemplateId,
        status: s.status,
        openedBy: s.openedBy,
        openedAt: new Date(s.openedAt),
        closedBy: s.closedBy,
        closedAt: s.closedAt ? new Date(s.closedAt) : null,
        lockedAt: s.lockedAt ? new Date(s.lockedAt) : null,
        // TODO(#274): openingCash no longer persisted (per-attendant floats).
        closingCash: s.closingCash,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.shifts.id,
        set: {
          status: s.status,
          closedBy: s.closedBy,
          closedAt: s.closedAt ? new Date(s.closedAt) : null,
          lockedAt: s.lockedAt ? new Date(s.lockedAt) : null,
          closingCash: s.closingCash,
          updatedAt: new Date(s.updatedAt),
        },
      });
  }
  async findOpenByStation(organizationId: string, stationId: string): Promise<Shift | null> {
    const [r] = await this.db
      .select()
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.organizationId, organizationId),
          eq(schema.shifts.stationId, stationId),
          eq(schema.shifts.status, 'OPEN'),
        ),
      )
      .limit(1);
    return r ? this.toEntity(r) : null;
  }
  async addStaffAssignments(shiftId: string, assignments: StaffAssignmentInput[]): Promise<void> {
    if (assignments.length === 0) return;
    await this.db
      .insert(schema.shiftStaffAssignments)
      .values(assignments.map((a) => ({ shiftId, userId: a.userId, duId: a.duId })));
  }
  async addTerminalLinks(shiftId: string, links: TerminalLinkInput[]): Promise<void> {
    if (links.length === 0) return;
    await this.db
      .insert(schema.shiftTerminalLinks)
      .values(links.map((l) => ({ shiftId, terminalId: l.terminalId, duId: l.duId ?? null })));
  }
}

// ---------------- Nozzle Readings ----------------
export class DrizzleNozzleReadingRepository implements NozzleReadingRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.nozzleReadings.$inferSelect): NozzleReading {
    return {
      id: r.id,
      shiftId: r.shiftId,
      nozzleId: r.nozzleId,
      openingReading: r.openingReading,
      closingReading: r.closingReading,
      volumeSold: r.volumeSold,
      testingVolume: r.testingVolume,
      unitPrice: r.unitPrice,
      createdAt: r.createdAt.toISOString(),
    };
  }
  async lastClosingByNozzleIds(nozzleIds: string[]): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    if (nozzleIds.length === 0) return m;
    const rows = await this.db
      .select()
      .from(schema.nozzleReadings)
      .where(inArray(schema.nozzleReadings.nozzleId, nozzleIds))
      .orderBy(desc(schema.nozzleReadings.createdAt));
    for (const r of rows) {
      if (!m.has(r.nozzleId)) m.set(r.nozzleId, Number(r.closingReading));
    }
    return m;
  }
  async saveMany(readings: NozzleReading[]): Promise<void> {
    if (readings.length === 0) return;
    await this.db.insert(schema.nozzleReadings).values(
      readings.map((r) => ({
        id: r.id,
        shiftId: r.shiftId,
        nozzleId: r.nozzleId,
        openingReading: r.openingReading,
        closingReading: r.closingReading,
        volumeSold: r.volumeSold,
        testingVolume: r.testingVolume,
        unitPrice: r.unitPrice,
        createdAt: new Date(r.createdAt),
      })),
    );
  }
  async listByShift(shiftId: string): Promise<NozzleReading[]> {
    const rows = await this.db
      .select()
      .from(schema.nozzleReadings)
      .where(eq(schema.nozzleReadings.shiftId, shiftId));
    return rows.map((r) => this.toEntity(r));
  }
  async updateClosingMany(updates: NozzleClosingUpdate[]): Promise<void> {
    await updateReadingColumns(
      this.db,
      updates.map((u) => ({
        id: u.id,
        closingReading: u.closingReading,
        volumeSold: u.volumeSold,
      })),
    );
  }
}

// ---------------- Attendant Handover ----------------
export class DrizzleHandoverContextReader implements HandoverContextReader {
  constructor(private readonly db: DbClient) {}

  async load(
    organizationId: string,
    stationId: string,
    shiftId: string,
    attendantId: string,
    duId: string,
  ): Promise<HandoverContext> {
    // ONE statement for the whole handover context (#231): the previous eight
    // Promise.all selects were serialized on the wire by the max:1 driver —
    // eight round-trips inside the handover transaction.
    const [row] = (await this.db.execute(sql`
      SELECT
        (SELECT jsonb_build_object(
            'id', u.id,
            'organizationId', u.organization_id,
            'fullName', u.full_name,
            'role', u.role,
            'status', u.status)
          FROM users u
          WHERE u.id = ${attendantId} AND u.organization_id = ${organizationId}) AS attendant,
        (SELECT jsonb_build_object(
            'id', d.id,
            'organizationId', d.organization_id,
            'stationId', d.station_id,
            'name', d.name,
            'code', d.code,
            'status', d.status)
          FROM dispenser_units d
          WHERE d.id = ${duId} AND d.organization_id = ${organizationId}
            AND d.station_id = ${stationId}) AS dispenser,
        EXISTS(SELECT 1
          FROM shift_staff_assignments sa
          JOIN shifts sh ON sh.id = sa.shift_id
            AND sh.organization_id = ${organizationId} AND sh.station_id = ${stationId}
          WHERE sa.shift_id = ${shiftId} AND sa.user_id = ${attendantId}
            AND sa.du_id = ${duId}) AS assigned,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'reading', CASE WHEN nr.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', nr.id,
              'shiftId', nr.shift_id,
              'nozzleId', nr.nozzle_id,
              'openingReading', nr.opening_reading::text,
              'closingReading', nr.closing_reading::text,
              'volumeSold', nr.volume_sold::text,
              'testingVolume', nr.testing_volume::text,
              'unitPrice', nr.unit_price::text,
              'createdAt', ${tsIso('nr.created_at')}) END,
            'nozzleId', nz.id,
            'organizationId', nz.organization_id,
            'stationId', nz.station_id,
            'duId', nz.du_id,
            'nozzleName', nz.name
          ))
          FROM nozzles nz
          LEFT JOIN nozzle_readings nr
            ON nr.nozzle_id = nz.id AND nr.shift_id = ${shiftId}
          WHERE nz.organization_id = ${organizationId} AND nz.station_id = ${stationId}
            AND nz.du_id = ${duId}), '[]'::jsonb) AS reading_rows,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', pt.id,
            'organizationId', pt.organization_id,
            'stationId', pt.station_id,
            'label', pt.label,
            'supportsCard', pt.supports_card,
            'supportsUpi', pt.supports_upi,
            'isActive', pt.is_active,
            'linkedDuId', l.du_id
          ))
          FROM payment_terminals pt
          LEFT JOIN shift_terminal_links l
            ON l.terminal_id = pt.id AND l.shift_id = ${shiftId}
          WHERE pt.organization_id = ${organizationId} AND pt.station_id = ${stationId}
            AND pt.is_active = true), '[]'::jsonb) AS terminals,
        (SELECT COALESCE(SUM(ct.amount), 0)::float8
          FROM customer_transactions ct
          JOIN shifts sh ON sh.id = ct.shift_id
            AND sh.organization_id = ${organizationId} AND sh.station_id = ${stationId}
          WHERE ct.shift_id = ${shiftId} AND ct.attendant_id = ${attendantId}
            AND ct.du_id = ${duId}
            AND ct.transaction_type = 'Credit Sale'
            AND ct.reference_type = 'CREDIT_SALE') AS credit_sales,
        (SELECT COALESCE(SUM(ct.amount), 0)::float8
          FROM customer_transactions ct
          JOIN shifts sh ON sh.id = ct.shift_id
            AND sh.organization_id = ${organizationId} AND sh.station_id = ${stationId}
          WHERE ct.shift_id = ${shiftId} AND ct.attendant_id = ${attendantId}
            AND ct.du_id = ${duId}
            AND ct.transaction_type = 'OMC Sale'
            AND ct.reference_type = 'OMC_CARD_SALE') AS omc_card_sales,
        (SELECT COALESCE(SUM(s.total_amount - COALESCE(s.non_cash_amount, 0)), 0)::float8
          FROM sales s
          JOIN shifts sh ON sh.id = s.shift_id
            AND sh.organization_id = ${organizationId} AND sh.station_id = ${stationId}
          WHERE s.shift_id = ${shiftId} AND s.attendant_id = ${attendantId}
            AND s.sale_type <> 'Fuel' AND s.payment_method = 'Cash') AS merchandise_cash
    `)) as unknown as [Record<string, any>];

    const readingRows: Array<{
      reading: Record<string, any> | null;
      nozzleId: string;
      organizationId: string;
      stationId: string;
      duId: string;
      nozzleName: string;
    }> = row.reading_rows ?? [];

    return {
      attendant: (row.attendant as HandoverContext['attendant']) ?? null,
      dispenser: (row.dispenser as HandoverContext['dispenser']) ?? null,
      assigned: Boolean(row.assigned),
      nozzleReadings: readingRows
        .filter((r) => r.reading !== null)
        .map(({ reading, ...nozzle }) => ({
          ...(reading as Record<string, any>),
          organizationId: nozzle.organizationId,
          stationId: nozzle.stationId,
          duId: nozzle.duId,
          nozzleName: nozzle.nozzleName,
        })) as HandoverContext['nozzleReadings'],
      missingReadingNozzleIds: readingRows.filter((r) => r.reading === null).map((r) => r.nozzleId),
      terminals: (row.terminals as HandoverContext['terminals']) ?? [],
      creditSales: Number(row.credit_sales ?? 0),
      omcCardSales: Number(row.omc_card_sales ?? 0),
      merchandiseCash: Number(row.merchandise_cash ?? 0),
    };
  }
}

export class DrizzleHandoverRepository implements HandoverRepository {
  constructor(private readonly db: DbClient) {}

  async replaceCurrent(handover: AttendantHandover, terminalEntries: HandoverTerminalEntry[]) {
    await this.db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${handover.organizationId}:${handover.stationId}:${handover.shiftId}:${handover.attendantId}:${handover.duId}`}, 0))`,
    );
    // Upsert in one statement; xmax <> 0 on the returned row tells us whether
    // an existing handover was replaced (#231 — was a select + upsert pair).
    const [row] = (await this.db.execute(sql`
      INSERT INTO attendant_handovers (
        id, organization_id, station_id, shift_id, user_id, du_id,
        cash_handed_over, card_handed_over, upi_handed_over, credit_handed_over,
        testing_volume, expected_sales, variance_amount, created_at
      ) VALUES (
        ${handover.id}, ${handover.organizationId}, ${handover.stationId},
        ${handover.shiftId}, ${handover.attendantId}, ${handover.duId},
        ${handover.cashHandedOver}::numeric, ${handover.cardHandedOver}::numeric,
        ${handover.upiHandedOver}::numeric, ${handover.creditHandedOver}::numeric,
        ${handover.testingVolume}::numeric, ${handover.expectedSales}::numeric,
        ${handover.varianceAmount}::numeric, ${handover.createdAt}::timestamp
      )
      ON CONFLICT (organization_id, station_id, shift_id, user_id, du_id)
      DO UPDATE SET
        cash_handed_over = EXCLUDED.cash_handed_over,
        card_handed_over = EXCLUDED.card_handed_over,
        upi_handed_over = EXCLUDED.upi_handed_over,
        credit_handed_over = EXCLUDED.credit_handed_over,
        testing_volume = EXCLUDED.testing_volume,
        expected_sales = EXCLUDED.expected_sales,
        variance_amount = EXCLUDED.variance_amount,
        created_at = EXCLUDED.created_at
      RETURNING
        id,
        organization_id AS "organizationId",
        station_id AS "stationId",
        shift_id AS "shiftId",
        user_id AS "userId",
        du_id AS "duId",
        cash_handed_over::text AS "cashHandedOver",
        card_handed_over::text AS "cardHandedOver",
        upi_handed_over::text AS "upiHandedOver",
        credit_handed_over::text AS "creditHandedOver",
        testing_volume::text AS "testingVolume",
        expected_sales::text AS "expectedSales",
        variance_amount::text AS "varianceAmount",
        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        (xmax <> 0) AS replaced
    `)) as unknown as [Record<string, any>];

    // Swap the terminal entries in one data-modifying-CTE statement
    // (was a delete followed by an insert).
    let savedEntries: Array<Record<string, any>> = [];
    if (terminalEntries.length > 0) {
      const entryRows = sql.join(
        terminalEntries.map(
          (entry) => sql`(
            ${entry.id}, ${handover.organizationId}, ${handover.stationId}, ${row.id},
            ${handover.shiftId}, ${entry.terminalId}, ${entry.duId},
            ${entry.cardAmount}::numeric, ${entry.upiAmount}::numeric,
            ${entry.batchRef}, ${entry.createdAt}::timestamp
          )`,
        ),
        sql`, `,
      );
      savedEntries = await this.db.execute(sql`
        WITH removed AS (
          DELETE FROM handover_terminal_entries WHERE handover_id = ${row.id}
        )
        INSERT INTO handover_terminal_entries (
          id, organization_id, station_id, handover_id, shift_id, terminal_id,
          du_id, card_amount, upi_amount, batch_ref, created_at
        ) VALUES ${entryRows}
        RETURNING
          id,
          handover_id AS "handoverId",
          terminal_id AS "terminalId",
          du_id AS "duId",
          card_amount::text AS "cardAmount",
          upi_amount::text AS "upiAmount",
          batch_ref AS "batchRef",
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      `);
    } else {
      await this.db
        .delete(schema.handoverTerminalEntries)
        .where(eq(schema.handoverTerminalEntries.handoverId, row.id));
    }

    const saved: AttendantHandover = {
      id: row.id,
      organizationId: row.organizationId,
      stationId: row.stationId,
      shiftId: row.shiftId,
      attendantId: row.userId,
      duId: row.duId,
      cashHandedOver: row.cashHandedOver,
      cardHandedOver: row.cardHandedOver,
      upiHandedOver: row.upiHandedOver,
      creditHandedOver: row.creditHandedOver,
      testingVolume: row.testingVolume,
      expectedSales: row.expectedSales,
      varianceAmount: row.varianceAmount,
      createdAt: row.createdAt,
    };
    return {
      handover: saved,
      replaced: Boolean(row.replaced),
      terminalEntries: savedEntries.map((entry) => ({
        id: entry.id,
        handoverId: entry.handoverId,
        terminalId: entry.terminalId,
        duId: entry.duId ?? handover.duId,
        cardAmount: entry.cardAmount,
        upiAmount: entry.upiAmount,
        batchRef: entry.batchRef,
        createdAt: entry.createdAt,
      })),
    };
  }

  async updateReadings(readings: AcceptedHandoverReading[]): Promise<void> {
    await updateReadingColumns(
      this.db,
      readings.map((r) => ({
        id: r.id,
        closingReading: String(r.closingReading),
        volumeSold: String(r.grossVolume),
        testingVolume: String(r.testingVolume),
      })),
    );
  }
}

// ---------------- Shift Reconciliation (drawer model) ----------------
// The shared SQL (recon totals, credit-sale lines, batched reading updates)
// lives in shift-recon-sql.ts, used by close, status, and the projection.

/**
 * Consolidated close-shift read (#229): shift row (locked FOR UPDATE), nozzle
 * readings, station nozzles, drawer totals, and credit sales — ONE statement
 * instead of five sequential port reads under the station advisory lock.
 */
export class DrizzleCloseShiftContextReader implements CloseShiftContextReader {
  constructor(private readonly db: DbClient) {}

  async load(organizationId: string, shiftId: string): Promise<CloseShiftContext> {
    const [row] = (await this.db.execute(sql`
      WITH locked_shift AS (
        SELECT * FROM shifts WHERE id = ${shiftId} FOR UPDATE
      )
      SELECT
        (SELECT ${rowJson(schema.shifts, 's')} FROM locked_shift s) AS shift,
        COALESCE((SELECT jsonb_agg(${rowJson(schema.nozzleReadings, 'nr')} ORDER BY nr.created_at, nr.id)
          FROM nozzle_readings nr WHERE nr.shift_id = ${shiftId}), '[]'::jsonb) AS readings,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', n.id, 'productId', n.product_id, 'tankId', n.tank_id))
          FROM nozzles n
          WHERE n.organization_id = ${organizationId}
            AND n.station_id = (SELECT station_id FROM locked_shift)), '[]'::jsonb) AS nozzles,
        ${reconTotalsJson(shiftId)} AS recon,
        ${creditSaleLinesJson(shiftId)} AS credit_sales
    `)) as unknown as [Record<string, any>];

    return {
      shift: (row.shift as CloseShiftContext['shift']) ?? null,
      readings: (row.readings as CloseShiftContext['readings']) ?? [],
      nozzles: (row.nozzles as CloseShiftContext['nozzles']) ?? [],
      totals: assembleReconTotals(row.recon ?? {}),
      creditSales: ((row.credit_sales as CreditSaleLineRow[]) ?? []).map(toCreditSaleRecord),
    };
  }
}

// ---------------- Stock Movements ----------------
export class DrizzleStockMovementWriter implements StockMovementWriter {
  constructor(private readonly db: DbClient) {}
  async saveMany(movements: StockMovementInput[]): Promise<void> {
    if (movements.length === 0) return;
    await this.db.insert(schema.stockMovements).values(
      movements.map((m) => ({
        shiftId: m.shiftId,
        businessDayId: m.businessDayId,
        productId: m.productId,
        tankId: m.tankId,
        movementType: m.movementType,
        quantity: m.quantity,
        referenceType: m.referenceType ?? null,
        referenceId: m.referenceId ?? null,
        notes: m.notes ?? null,
        createdAt: new Date(),
      })),
    );
  }
}

// ---------------- Shift Summaries ----------------
export class DrizzleShiftSummaryWriter implements ShiftSummaryStore {
  constructor(private readonly db: DbClient) {}
  async save(shiftId: string, snapshot: Record<string, unknown>): Promise<void> {
    // Replace-in-one-statement: shift_summaries has no unique index on shift_id,
    // so the swap is a data-modifying CTE instead of a delete + insert pair (#229).
    await this.db.execute(sql`
      WITH removed AS (
        DELETE FROM shift_summaries WHERE shift_id = ${shiftId}
      )
      INSERT INTO shift_summaries (shift_id, snapshot_data, generated_at)
      VALUES (${shiftId}, ${JSON.stringify(snapshot)}::jsonb, now())
    `);
  }
  async deleteForShift(shiftId: string): Promise<void> {
    await this.db.delete(schema.shiftSummaries).where(eq(schema.shiftSummaries.shiftId, shiftId));
  }
  async findByShift(shiftId: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db
      .select({ snapshotData: schema.shiftSummaries.snapshotData })
      .from(schema.shiftSummaries)
      .where(eq(schema.shiftSummaries.shiftId, shiftId))
      .limit(1);
    return (row?.snapshotData as Record<string, unknown>) ?? null;
  }
}
