import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import {
  CloseBusinessDayAndGenerateDssr,
  CloseShift,
  FixedClock,
  OpenShift,
  RecordCollection,
  RecordCreditSale,
  RecordDecantation,
  RecordDensityReading,
  RecordExpense,
  RecordFuelPrice,
  RecordHandover,
  RecordPurchase,
  RecordStockCount,
  RecordSupplierPayment,
  UuidGenerator,
  type EventPublisher,
  type ExecutionContext,
  type Result,
} from '@pump/core';
import {
  density15FromObserved,
  resolveBusinessDate,
  resolveDecantationSettings,
  roundDensity,
  vcf,
} from '@pump/shared';
import { createDispatcher } from '../../infra/events.js';
import { LedgerPostingService } from '../../infra/ledger-posting.js';
import { TimestampDocumentNumberGenerator } from '../../infra/doc-numbers.js';
import { DrizzleShiftSummaryProjector } from '../../infra/shift-summary-projection.js';
import {
  DrizzleBusinessDayRepository,
  DrizzleCloseShiftContextReader,
  DrizzleHandoverContextReader,
  DrizzleHandoverRepository,
  DrizzleNozzleReadingRepository,
  DrizzleShiftRepository,
  DrizzleShiftSummaryWriter,
  DrizzleStaffDirectory,
  DrizzleStockMovementWriter,
} from '../../infra/repositories/station-ops-repositories.js';
import {
  DrizzleDispenserRepository,
  DrizzleFuelPriceRepository,
  DrizzleNozzleRepository,
  DrizzleStationRepository,
  DrizzleTankRepository,
} from '../../infra/repositories/setup-repositories.js';
import {
  DrizzleDssrDataReader,
  DrizzleDssrSnapshotRepository,
} from '../../infra/repositories/reporting-repositories.js';
import {
  DrizzlePurchaseItemRepository,
  DrizzlePurchaseRepository,
  DrizzleSupplierTransactionRepository,
} from '../../infra/repositories/purchasing-repositories.js';
import {
  DrizzleCollectionRepository,
  DrizzleCustomerLedgerRepository,
  DrizzleCustomerRepository,
  DrizzleSupplierRepository,
} from '../../infra/repositories/crm-repositories.js';
import {
  DrizzleFinancialAccountRepository,
  DrizzlePaymentTerminalLookup,
} from '../../infra/repositories/finance-account-repositories.js';
import { DrizzleExpenseRepository } from '../../infra/repositories/finance-repositories.js';
import {
  DrizzleStockMovementRepository,
  DrizzleStockVarianceRepository,
} from '../../infra/repositories/inventory-repositories.js';
import {
  createDecantationLinker,
  createDecantationMeasurement,
  DrizzleDecantationRepository,
  DrizzleDensityReadingRepository,
} from '../../infra/repositories/decantation-repositories.js';
import { DrizzleProductRepository } from '../../infra/repositories/product.repo.js';

/** Closed days of history before today. */
export const DEMO_HISTORY_DAYS = 7;
/** KSRTC credit sales across the history; ~94% of its ₹1,00,000 limit. */
const KSRTC_CREDIT_SALES = [13_000, 14_000, 13_500, 13_500, 13_000, 14_000, 13_000];
const PRICES = { petrol: 102.5, diesel: 89.7 } as const;
const OPENING_FLOAT = 5_000;
/** Litres per fuel tank at onboarding (the very first day's opening stock). */
const OPENING_STOCK_PER_TANK = 4_000;
/** Indian Oil invoices fuel at ~96% of the pole price (tax-inclusive). */
const PURCHASE_RATE = 0.96;
/** 15 °C density of each product's tank on the morning of age 7 … 1 (kg/m³). */
const MORNING_DENSITY = {
  petrol: [747.4, 747.1, 747.5, 747.5, 747.3, 747.6, 748.4],
  diesel: [833.0, 832.7, 833.1, 833.0, 834.2, 834.1, 834.0],
} as const;
/** Today's MS morning reading; the HSD reading is deliberately missing. */
const TODAY_PETROL_DENSITY = 748.3;
/** Shortage declared on today's pending evening handover (Anitha S · DU-2). */
export const DEMO_PENDING_SHORTAGE = -350;
/** HSD dip variance recorded today. */
export const DEMO_DIP_VARIANCE_LITRES = -18;

export interface DemoHistoryOptions {
  organizationId: string;
  stationId: string;
  /** Business date treated as today (defaults to the station's current business date). */
  today?: string;
  /** Instant treated as "now" (defaults to the system clock). */
  now?: Date;
}

export interface DemoHistoryResult {
  businessDayId: string;
  morningShiftId: string;
  eveningShiftId: string;
  pendingHandoverId: string;
  closedBusinessDays: number;
}

class DemoSeedError extends Error {}

function must<T>(result: Result<T>, step: string): T {
  if (!result.success) {
    throw new DemoSeedError(
      `Demo history step "${step}" failed: ${result.error.code} ${result.error.message}`,
    );
  }
  return result.data;
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Offset (ms) of `timeZone` from UTC at `instant`. */
function zoneOffset(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which the station's wall clock reads `date` `time`. */
export function stationInstant(date: string, time: string, timeZone: string): Date {
  const naive = new Date(`${date}T${time}:00Z`);
  const first = new Date(naive.getTime() - zoneOffset(naive, timeZone));
  return new Date(naive.getTime() - zoneOffset(first, timeZone));
}

interface StationClock {
  timeZone: string;
  dayStartsAt: string;
}

function readStationClock(settings: unknown): StationClock {
  const value = (settings ?? {}) as Record<string, unknown>;
  return {
    timeZone: typeof value.timezone === 'string' ? value.timezone : 'Asia/Kolkata',
    dayStartsAt:
      typeof value.business_day_starts_at === 'string' ? value.business_day_starts_at : '00:00',
  };
}

/**
 * Write a demo station's operational story through the core use-cases:
 * seven closed business days (morning + evening shifts, handovers with cash
 * drops, purchases, office records, Shift Summaries and DSSRs) and today
 * (morning closed, evening open with one handover waiting for the office).
 *
 * Every step runs with a fixed clock at a sensible station-local time on its
 * own day, so `closedAt`, `occurredAt` and event timestamps fall on that day.
 * The caller owns the transaction (`tx`).
 */
export async function seedDemoHistory(
  tx: DbClient,
  options: DemoHistoryOptions,
): Promise<DemoHistoryResult> {
  const { organizationId, stationId } = options;
  const events: EventPublisher = createDispatcher(tx);
  const ids = new UuidGenerator();
  const docNumbers = new TimestampDocumentNumberGenerator();
  const ledger = new LedgerPostingService(tx);

  const [station] = await tx
    .select()
    .from(schema.stations)
    .where(
      and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, organizationId)),
    )
    .limit(1);
  if (!station) throw new DemoSeedError('Demo station not found');
  const { timeZone, dayStartsAt } = readStationClock(station.settings);

  const users = await tx
    .select()
    .from(schema.users)
    .where(eq(schema.users.organizationId, organizationId));
  const manager = users.find((user) => user.role === 'Manager');
  const accountant = users.find((user) => user.role === 'Accountant') ?? manager;
  const attendants = users
    .filter((user) => user.role === 'Attendant')
    .sort((a, b) =>
      a.fullName === 'Anitha S'
        ? -1
        : b.fullName === 'Anitha S'
          ? 1
          : a.fullName.localeCompare(b.fullName),
    );
  if (!manager || !accountant || attendants.length === 0)
    throw new DemoSeedError('Demo station needs a Manager, an Accountant and an Attendant');
  const anitha = attendants[0];

  const products = await tx
    .select()
    .from(schema.products)
    .where(eq(schema.products.organizationId, organizationId));
  const petrol = products.find((product) => product.name === 'Petrol');
  const diesel = products.find((product) => product.name === 'Diesel');
  if (!petrol || !diesel) throw new DemoSeedError('Demo fuels are missing');
  const priceOf = (productId: string) => (productId === diesel.id ? PRICES.diesel : PRICES.petrol);

  const tanks = await tx.select().from(schema.tanks).where(eq(schema.tanks.stationId, stationId));
  const dieselTank = tanks.find((tank) => tank.productId === diesel.id);
  if (!dieselTank) throw new DemoSeedError('Demo station has no HSD tank');
  const dispensers = (
    await tx
      .select()
      .from(schema.dispenserUnits)
      .where(eq(schema.dispenserUnits.stationId, stationId))
  ).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const nozzles = (
    await tx.select().from(schema.nozzles).where(eq(schema.nozzles.stationId, stationId))
  ).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const terminals = (
    await tx
      .select()
      .from(schema.paymentTerminals)
      .where(eq(schema.paymentTerminals.stationId, stationId))
  ).sort((a, b) => a.label.localeCompare(b.label));
  const templates = await tx
    .select()
    .from(schema.shiftTemplates)
    .where(eq(schema.shiftTemplates.organizationId, organizationId));
  const morning = templates.find((template) => template.name === 'Morning');
  const evening = templates.find((template) => template.name === 'Evening');
  const customers = await tx
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.organizationId, organizationId));
  const ksrtc = customers.find((customer) => customer.name === 'KSRTC Depot Aluva');
  const malabar = customers.find((customer) => customer.name === 'Malabar Transports');
  const suppliers = await tx
    .select()
    .from(schema.suppliers)
    .where(eq(schema.suppliers.organizationId, organizationId));
  const oilCompany = suppliers.find((supplier) => supplier.name === 'Indian Oil Corporation');
  const accounts = await tx
    .select()
    .from(schema.financialAccounts)
    .where(eq(schema.financialAccounts.organizationId, organizationId));
  const bank = accounts.find((account) => account.accountType === 'BANK');
  const cashInHand = accounts.find((account) => account.accountType === 'CASH_IN_HAND');
  const [category] = await tx
    .select()
    .from(schema.expenseCategories)
    .where(eq(schema.expenseCategories.organizationId, organizationId))
    .limit(1);
  if (
    !morning ||
    !evening ||
    !ksrtc ||
    !malabar ||
    !oilCompany ||
    !bank ||
    !cashInHand ||
    !category
  )
    throw new DemoSeedError('Demo station master data is incomplete');

  const du2 = dispensers[Math.min(1, dispensers.length - 1)];
  // Anitha S works DU-2; the other attendants cover the remaining DUs.
  const others = attendants.length > 1 ? attendants.slice(1) : attendants;
  const attendantFor = (duIndex: number) =>
    dispensers[duIndex].id === du2.id ? anitha : others[duIndex % others.length];
  const terminalFor = (duIndex: number) => terminals[duIndex];

  const now = options.now ?? new Date();
  const today = options.today ?? resolveBusinessDate({ now, timeZone, dayStartsAt });

  const context = (
    at: Date,
    actorId: string,
    businessDayId: string | null = null,
  ): ExecutionContext => ({
    organizationId,
    stationId,
    businessDayId,
    actorId,
    correlationId: ids.newId(),
    actorSnapshot: (() => {
      const actor = users.find((user) => user.id === actorId);
      return {
        kind: 'tenant_user' as const,
        displayName: actor?.fullName ?? 'Demo user',
        role: actor?.role ?? null,
        subjectId: actorId,
      };
    })(),
    groupingRole: 'primary',
    timeZone,
    businessDayStartsAt: dayStartsAt,
    clock: new FixedClock(at),
    ids,
  });

  const shifts = new DrizzleShiftRepository(tx);
  const businessDays = new DrizzleBusinessDayRepository(tx);
  const readings = new DrizzleNozzleReadingRepository(tx);

  // Fuel prices take effect before the first historical shift.
  const firstDay = shiftDate(today, -DEMO_HISTORY_DAYS);
  for (const product of [petrol, diesel]) {
    must(
      await new RecordFuelPrice({ repository: new DrizzleFuelPriceRepository(tx), events }).execute(
        { stationId, productId: product.id, price: priceOf(product.id) },
        context(stationInstant(firstDay, '05:30', timeZone), manager.id),
      ),
      'fuel price',
    );
  }

  const openShift = async (date: string, templateId: string, at: Date) =>
    must(
      await new OpenShift({
        shifts,
        businessDays,
        nozzles: new DrizzleNozzleRepository(tx),
        nozzleReadings: readings,
        fuelPrices: new DrizzleFuelPriceRepository(tx),
        dispensers: new DrizzleDispenserRepository(tx),
        staff: new DrizzleStaffDirectory(tx),
        events,
      }).execute(
        {
          stationId,
          shiftTemplateId: templateId,
          businessDate: date,
          staffAssignments: dispensers.map((du, index) => ({
            userId: attendantFor(index).id,
            duId: du.id,
            openingFloat: OPENING_FLOAT,
          })),
          terminalLinks: dispensers
            .map((du, index) => ({ terminal: terminalFor(index), duId: du.id }))
            .filter((link) => link.terminal)
            .map((link) => ({ terminalId: link.terminal.id, duId: link.duId })),
        },
        context(at, manager.id),
      ),
      'open shift',
    );

  const openingReadings = async (shiftId: string) =>
    new Map(
      (
        await tx
          .select()
          .from(schema.nozzleReadings)
          .where(eq(schema.nozzleReadings.shiftId, shiftId))
      ).map((reading) => [reading.nozzleId, Number(reading.openingReading)]),
    );

  const stockMovements = new DrizzleStockMovementRepository(tx);
  const bookOf = (tankId: string) => stockMovements.currentQuantityForTank(tankId);
  const tanksOf = (productId: string) => tanks.filter((tank) => tank.productId === productId);
  const decantationSettings = resolveDecantationSettings(station.settings);
  const settings = {
    densityToleranceKgM3: decantationSettings.densityToleranceKgM3,
    settlingTimeMinutes: decantationSettings.settlingTimeMinutes,
  };
  const iso = (date: Date) => date.toISOString();
  const minutes = (base: Date, delta: number) => new Date(base.getTime() + delta * 60_000);

  /** Hydrometer reading (0.5 kg/m³ resolution) of a sample at `tempC`. */
  const hydrometer = (density15: number, tempC: number) => ({
    observedDensity: Math.round(density15 * vcf(density15, tempC) * 2) / 2,
    observedTempC: tempC,
  });
  const standardDensity = (reading: { observedDensity: number; observedTempC: number }) =>
    roundDensity(
      density15FromObserved(reading.observedDensity, reading.observedTempC, {
        method: decantationSettings.densityMethod,
      }),
      2,
    );

  /** A product's density reading (Morning or Ad-hoc) from a hydrometer sample. */
  const recordDensity = async (input: {
    productId: string;
    date: string;
    at: Date;
    kind: 'MORNING' | 'ADHOC';
    density15: number;
    tempC: number;
    tankId?: string;
  }) =>
    must(
      await new RecordDensityReading({
        densityReadings: new DrizzleDensityReadingRepository(tx),
        events,
        ids: { generate: () => ids.newId() },
        settings: {
          densityToleranceKgM3: decantationSettings.densityToleranceKgM3,
          densityMethod: decantationSettings.densityMethod,
        },
      }).execute(
        {
          stationId,
          productId: input.productId,
          businessDate: input.date,
          kind: input.kind,
          sampledFrom: 'TANK',
          tankId: input.tankId ?? null,
          entryMethod: 'HYDROMETER',
          ...hydrometer(input.density15, input.tempC),
          recordedAt: iso(input.at),
        },
        context(input.at, manager.id),
      ),
      'density reading',
    );

  /** A fuel invoice (Office Record on its entry date): never moves stock. */
  const fuelInvoice = async (input: {
    date: string;
    at: Date;
    productId: string;
    quantity: number;
    invoiceDensity: number;
  }) =>
    must(
      await new RecordPurchase({
        purchases: new DrizzlePurchaseRepository(tx),
        purchaseItems: new DrizzlePurchaseItemRepository(tx),
        stock: stockMovements,
        supplierTxns: new DrizzleSupplierTransactionRepository(tx),
        suppliers: new DrizzleSupplierRepository(tx),
        products: new DrizzleProductRepository(tx),
        stations: new DrizzleStationRepository(tx),
        shifts,
        businessDays,
        docNumbers,
        events,
      }).execute(
        {
          supplierId: oilCompany.id,
          stationId,
          transactionDate: input.date,
          invoiceNumber: `IOC-${ids.newId().slice(0, 8).toUpperCase()}`,
          lines: [
            {
              productId: input.productId,
              quantity: input.quantity,
              unitPrice: Math.round(priceOf(input.productId) * PURCHASE_RATE * 100) / 100,
              invoiceDensity: input.invoiceDensity,
            },
          ],
        },
        context(input.at, accountant.id),
      ),
      'fuel invoice',
    ).purchase;

  interface TankerLoad {
    productId: string;
    purchaseId: string;
    /** Invoice quantity (round KL). */
    invoiceQty: number;
    invoiceDensity: number;
    /** Measured litres minus invoice litres (negative = Short). */
    variance: number;
    /** RO Density at 15 °C (hydrometer sample at `tempC`). */
    roDensity: number;
    tempC: number;
  }
  interface TankerChamber {
    capacityL: number;
    load: number;
    sealOk?: boolean;
    mark?: 'OK' | 'SHORT' | 'EXCESS';
  }

  /**
   * One tanker visit through RecordDecantation: tank lines split per product
   * over its tanks, optional chamber checks, RO density, and the Fuel Purchase
   * linked per product. Without `afterAt` the lines stay pending (or the whole
   * visit stays a DRAFT while still unloading). Returns the tanks' dip targets
   * so a later routine dip can resolve a pending visit.
   */
  const tanker = async (input: {
    arriveAt: Date;
    startAt: Date;
    endAt?: Date;
    afterAt?: Date;
    recordAt: Date;
    tankerNumber: string;
    driverName: string;
    loads: TankerLoad[];
    chambers?: TankerChamber[];
    draft?: boolean;
  }) => {
    const lines: Record<string, unknown>[] = [];
    const lineIndexes: number[][] = [];
    const dipTargets: Array<{ tankId: string; productId: string; actual: number }> = [];
    for (const load of input.loads) {
      const loadTanks = tanksOf(load.productId);
      const share = load.invoiceQty / loadTanks.length;
      const varianceShare = load.variance / loadTanks.length;
      const reading = hydrometer(load.roDensity, load.tempC);
      lineIndexes.push([]);
      for (const tank of loadTanks) {
        const before = await bookOf(tank.id);
        const actual = Math.round((before + share + varianceShare) * 1000) / 1000;
        lineIndexes[lineIndexes.length - 1].push(lines.length);
        dipTargets.push({ tankId: tank.id, productId: load.productId, actual });
        lines.push({
          tankId: tank.id,
          beforeDip: before,
          beforeDipAt: iso(input.arriveAt),
          ...reading,
          roDensity: standardDensity(reading),
          invoiceDensity: load.invoiceDensity,
          salesDuring: 0,
          ...(input.afterAt ? { afterDip: actual, afterDipAt: iso(input.afterAt) } : {}),
        });
      }
    }
    const chambers = (input.chambers ?? []).map((chamber, index) => {
      const lineIndex = lineIndexes[chamber.load];
      return {
        chamberNo: index + 1,
        capacityL: chamber.capacityL,
        sealOk: chamber.sealOk ?? true,
        mark: chamber.mark ?? 'OK',
        emptied: true,
        tankLineIndex: lineIndex[index % lineIndex.length],
      };
    });
    const recorded = must(
      await new RecordDecantation({
        decantations: new DrizzleDecantationRepository(tx),
        densityReadings: new DrizzleDensityReadingRepository(tx),
        tanks: new DrizzleTankRepository(tx),
        businessDays,
        docNumbers,
        events,
        settings,
        measurement: createDecantationMeasurement(tx, events),
        linking: createDecantationLinker(tx, events, settings),
      }).execute(
        {
          stationId,
          tankerNumber: input.tankerNumber,
          driverName: input.driverName,
          unloadStartedAt: iso(input.startAt),
          ...(input.endAt ? { unloadEndedAt: iso(input.endAt) } : {}),
          chambersChecked: chambers.length > 0,
          invoiceQuantity: input.loads.reduce((sum, load) => sum + load.invoiceQty, 0),
          ...(input.draft ? { draft: true } : {}),
          lines,
          chambers,
          links: input.loads.map((load) => ({
            productId: load.productId,
            purchaseId: load.purchaseId,
          })),
        } as never,
        context(input.recordAt, manager.id),
      ),
      'decantation',
    );
    return { decantation: recorded.decantation, dipTargets };
  };

  /** A routine Tank Dip between shifts (resolves pending Decantation lines). */
  const routineDip = async (tankId: string, actualQuantity: number, at: Date, reason: string) =>
    must(
      await new RecordStockCount({
        movements: stockMovements,
        variances: new DrizzleStockVarianceRepository(tx),
        tanks: new DrizzleTankRepository(tx),
        shifts,
        businessDays,
        events,
        decantationMeasurement: createDecantationMeasurement(tx, events),
      }).execute({ stationId, tankId, actualQuantity, reason }, context(at, manager.id)),
      'routine tank dip',
    );

  const creditSale = async (
    shiftId: string,
    at: Date,
    customerId: string,
    amount: number,
    duIndex: number,
  ) =>
    must(
      await new RecordCreditSale({
        ledger: new DrizzleCustomerLedgerRepository(tx),
        customers: new DrizzleCustomerRepository(tx),
        shifts,
        businessDays,
        events,
      }).execute(
        {
          customerId,
          amount,
          shiftId,
          productId: diesel.id,
          quantity: Math.round((amount / PRICES.diesel) * 100) / 100,
          unitPrice: PRICES.diesel,
          attendantId: attendantFor(duIndex).id,
          duId: dispensers[duIndex].id,
          notes: 'Fleet fuel on credit',
        },
        context(at, attendantFor(duIndex).id),
      ),
      'credit sale',
    );

  /**
   * Hand over one Drawer. Closing readings add `volume(nozzleIndex)` litres;
   * card/UPI go through the DU's terminal; the declared cash equals the
   * Drawer's expected cash plus `variance`.
   */
  const handover = async (
    shiftId: string,
    at: Date,
    duIndex: number,
    opening: Map<string, number>,
    volume: (nozzleIndex: number) => number,
    creditOnDu: number,
    variance = 0,
  ) => {
    const du = dispensers[duIndex];
    const duNozzles = nozzles
      .map((nozzle, index) => ({ nozzle, index }))
      .filter(({ nozzle }) => nozzle.duId === du.id);
    let sales = 0;
    const nozzleReadings = duNozzles.map(({ nozzle, index }) => {
      const litres = volume(index);
      sales += litres * priceOf(nozzle.productId);
      return { nozzleId: nozzle.id, closingReading: (opening.get(nozzle.id) ?? 0) + litres };
    });
    const terminal = terminalFor(duIndex);
    const card = terminal ? Math.round(sales * 0.15) : 0;
    const upi = terminal ? Math.round(sales * 0.2) : 0;
    const cashSales = sales - card - upi - creditOnDu;
    const cashDrops = cashSales > 15_000 ? 10_000 : 0;
    const expectedCash = OPENING_FLOAT + cashSales - cashDrops;
    const attendant = attendantFor(duIndex);
    return must(
      await new RecordHandover({
        shifts,
        businessDays,
        context: new DrizzleHandoverContextReader(tx),
        handovers: new DrizzleHandoverRepository(tx),
        events,
      }).execute(
        {
          shiftId,
          attendantId: attendant.id,
          duId: du.id,
          cashHandedOver: Math.round((expectedCash + variance) * 100) / 100,
          cashDrops,
          nozzleReadings,
          ...(terminal
            ? {
                terminalEntries: [
                  { terminalId: terminal.id, duId: du.id, cardAmount: card, upiAmount: upi },
                ],
              }
            : {}),
        },
        context(at, attendant.id),
      ),
      'handover',
    );
  };

  const closeShift = async (shiftId: string, at: Date, closingCash: number) => {
    const closed = must(
      await new CloseShift({
        context: new DrizzleCloseShiftContextReader(tx),
        shifts,
        nozzleReadings: readings,
        stockMovements: new DrizzleStockMovementWriter(tx),
        summaries: new DrizzleShiftSummaryWriter(tx),
        projector: new DrizzleShiftSummaryProjector(tx),
        events,
      }).execute({ shiftId, closingCash }, context(at, manager.id)),
      'close shift',
    );
    const closedAt = closed.shift.closedAt;
    if (!closedAt) throw new DemoSeedError('Closed demo shift has no closedAt');
    await ledger.postShiftClose(
      organizationId,
      { id: closed.shift.id, stationId, businessDayId: closed.shift.businessDayId, closedAt },
      { cashSales: closed.cashSales },
    );
    return closed;
  };

  /** Run one shift end to end: open → (purchase) → credit sales → handovers → close. */
  const runShift = async (input: {
    date: string;
    templateId: string;
    openAt: Date;
    handoverAt: Date;
    closeAt: Date;
    volume: (nozzleIndex: number) => number;
    credit?: { customerId: string; amount: number; duIndex: number; at: Date };
    /** Onboarding opening stock per fuel tank (first day only). */
    openingStockPerTank?: number;
  }) => {
    const opened = await openShift(input.date, input.templateId, input.openAt);
    if (input.openingStockPerTank)
      // Genuine onboarding opening stock: the station's stock before PumpOS.
      await stockMovements.saveMany(
        tanks.map((tank) => ({
          id: ids.newId(),
          shiftId: null,
          businessDayId: opened.shift.businessDayId,
          productId: tank.productId,
          tankId: tank.id,
          movementType: 'OpeningBalance' as const,
          quantity: String(input.openingStockPerTank),
          referenceType: 'onboarding-opening-stock',
          referenceId: null,
          notes: 'Onboarding opening stock',
          createdAt: minutes(input.openAt, -5).toISOString(),
        })),
      );
    if (input.credit)
      await creditSale(
        opened.shift.id,
        input.credit.at,
        input.credit.customerId,
        input.credit.amount,
        input.credit.duIndex,
      );
    const opening = await openingReadings(opened.shift.id);
    let declared = 0;
    for (let duIndex = 0; duIndex < dispensers.length; duIndex += 1) {
      const credit = input.credit?.duIndex === duIndex ? input.credit.amount : 0;
      const result = await handover(
        opened.shift.id,
        input.handoverAt,
        duIndex,
        opening,
        input.volume,
        credit,
      );
      declared += Number(result.handover.cashHandedOver);
    }
    await closeShift(opened.shift.id, input.closeAt, declared);
    return opened;
  };

  const volumeFor = (age: number, part: number) => (nozzleIndex: number) =>
    160 + ((age * 37 + nozzleIndex * 23 + part * 11) % 90);
  const ksrtcDu = 0;

  let closedBusinessDays = 0;
  const pendingDips: Array<{ tankId: string; productId: string; actual: number }> = [];
  for (let age = DEMO_HISTORY_DAYS; age >= 1; age -= 1) {
    const date = shiftDate(today, -age);
    const at = (time: string) => stationInstant(date, time, timeZone);
    const dayIndex = DEMO_HISTORY_DAYS - age;

    // The morning after the HSD tanker with no after dip: a routine Tank Dip
    // between shifts (none open) measures it.
    if (pendingDips.length > 0 && age === 3) {
      for (const target of pendingDips)
        await routineDip(
          target.tankId,
          target.actual,
          at('05:30'),
          'Routine morning dip (also measures yesterday’s HSD tanker)',
        );
      pendingDips.length = 0;
    }

    // Morning density register, per product, before the day starts.
    for (const [product, series, tempC] of [
      [petrol, MORNING_DENSITY.petrol, 27.5],
      [diesel, MORNING_DENSITY.diesel, 28.0],
    ] as const)
      await recordDensity({
        productId: product.id,
        date,
        at: at('05:40'),
        kind: 'MORNING',
        density15: series[dayIndex],
        tempC: tempC + (dayIndex % 3) * 0.5,
        tankId: tanksOf(product.id)[0]?.id,
      });

    const morningShift = await runShift({
      date,
      templateId: morning.id,
      openAt: at('06:00'),
      handoverAt: at('13:50'),
      closeAt: at('13:58'),
      volume: volumeFor(age, 0),
      ...(age === DEMO_HISTORY_DAYS ? { openingStockPerTank: OPENING_STOCK_PER_TANK } : {}),
    });
    await runShift({
      date,
      templateId: evening.id,
      openAt: at('14:00'),
      handoverAt: at('21:50'),
      closeAt: at('21:58'),
      volume: volumeFor(age, 1),
      credit: {
        customerId: ksrtc.id,
        amount: KSRTC_CREDIT_SALES[DEMO_HISTORY_DAYS - age] ?? 13_000,
        duIndex: ksrtcDu,
        at: at('18:30'),
      },
    });

    // Ad-hoc density check after a customer complaint about pickup.
    if (age === 5)
      await recordDensity({
        productId: petrol.id,
        date,
        at: at('16:10'),
        kind: 'ADHOC',
        density15: 747.4,
        tempC: 30.5,
        tankId: tanksOf(petrol.id)[0]?.id,
      });

    // Tanker visits (ADR 0007): invoice = Office Record, Decantation = stock.
    if (age === 6) {
      // MS + HSD tanker, after dip taken after settling: measured, small transit loss.
      const ms = await fuelInvoice({
        date,
        at: at('17:00'),
        productId: petrol.id,
        quantity: 12_000,
        invoiceDensity: 746.9,
      });
      const hsd = await fuelInvoice({
        date,
        at: at('17:05'),
        productId: diesel.id,
        quantity: 12_000,
        invoiceDensity: 832.6,
      });
      await tanker({
        arriveAt: at('22:05'),
        startAt: at('22:10'),
        endAt: at('22:45'),
        afterAt: at('23:20'),
        recordAt: at('23:20'),
        tankerNumber: 'KL-07-BX-4412',
        driverName: 'Suresh Kumar',
        loads: [
          {
            productId: petrol.id,
            purchaseId: ms.id,
            invoiceQty: 12_000,
            invoiceDensity: 746.9,
            variance: -32,
            roDensity: 747.8,
            tempC: 29.5,
          },
          {
            productId: diesel.id,
            purchaseId: hsd.id,
            invoiceQty: 12_000,
            invoiceDensity: 832.6,
            variance: -24,
            roDensity: 833.1,
            tempC: 29.5,
          },
        ],
        chambers: [
          ...[0, 1, 2].map(() => ({ capacityL: 4_000, load: 0 })),
          ...[0, 1, 2].map(() => ({ capacityL: 4_000, load: 1 })),
        ],
      });
    }
    if (age === 4) {
      // HSD-only tanker, no after dip: stays pending until the next routine dip.
      const hsd = await fuelInvoice({
        date,
        at: at('16:30'),
        productId: diesel.id,
        quantity: 6_000,
        invoiceDensity: 834.1,
      });
      const visit = await tanker({
        arriveAt: at('22:05'),
        startAt: at('22:10'),
        endAt: at('22:50'),
        recordAt: at('22:55'),
        tankerNumber: 'KL-08-CD-7731',
        driverName: 'Babu Thomas',
        loads: [
          {
            productId: diesel.id,
            purchaseId: hsd.id,
            invoiceQty: 6_000,
            invoiceDensity: 834.1,
            variance: 15,
            roDensity: 834.6,
            tempC: 30,
          },
        ],
        chambers: [
          { capacityL: 3_000, load: 0 },
          { capacityL: 3_000, load: 0 },
        ],
      });
      pendingDips.push(...visit.dipTargets);
    }
    if (age === 2) {
      // MS tanker with a short chamber and a broken seal: flagged for the owner.
      const ms = await fuelInvoice({
        date,
        at: at('17:10'),
        productId: petrol.id,
        quantity: 8_000,
        invoiceDensity: 748.2,
      });
      await tanker({
        arriveAt: at('22:00'),
        startAt: at('22:10'),
        endAt: at('22:40'),
        afterAt: at('23:15'),
        recordAt: at('23:15'),
        tankerNumber: 'KL-11-AE-2093',
        driverName: 'Joseph Mathew',
        loads: [
          {
            productId: petrol.id,
            purchaseId: ms.id,
            invoiceQty: 8_000,
            invoiceDensity: 748.2,
            variance: -60,
            roDensity: 748.9,
            tempC: 29,
          },
        ],
        chambers: [
          { capacityL: 4_000, load: 0 },
          { capacityL: 4_000, load: 0, sealOk: false, mark: 'SHORT' },
        ],
      });
    }

    // Office records, dated by entry date (no shift, no business day).
    if (age === 5) {
      const expense = must(
        await new RecordExpense({
          expenses: new DrizzleExpenseRepository(tx),
          accounts: new DrizzleFinancialAccountRepository(tx),
          events,
        }).execute(
          {
            stationId,
            entryDate: date,
            fundingAccountId: bank.id,
            categoryId: category.id,
            amount: 18_450,
            description: 'KSEB electricity bill',
          },
          context(at('11:00'), accountant.id),
        ),
        'expense',
      );
      await ledger.postExpense(expense);
    }
    if (age === 2) {
      const payment = must(
        await new RecordSupplierPayment({
          supplierTxns: new DrizzleSupplierTransactionRepository(tx),
          suppliers: new DrizzleSupplierRepository(tx),
          accounts: new DrizzleFinancialAccountRepository(tx),
          events,
        }).execute(
          {
            supplierId: oilCompany.id,
            stationId,
            entryDate: date,
            amount: 250_000,
            fundingAccountId: bank.id,
            notes: 'RTGS against IOC invoices',
          },
          context(at('11:30'), accountant.id),
        ),
        'supplier payment',
      );
      await ledger.postSupplierPayment(payment);
    }

    must(
      await new CloseBusinessDayAndGenerateDssr({
        businessDays,
        openShifts: shifts,
        snapshots: new DrizzleDssrSnapshotRepository(tx),
        dssrData: new DrizzleDssrDataReader(tx),
        events,
      }).execute(
        { businessDayId: morningShift.businessDay.id, stationId },
        context(at('23:55'), manager.id, morningShift.businessDay.id),
      ),
      'close business day',
    );
    closedBusinessDays += 1;
  }

  // Today: spread the work between Day Start and now so nothing is in the future.
  const dayStart = stationInstant(today, dayStartsAt, timeZone);
  const span = Math.max(now.getTime() - dayStart.getTime(), 60_000);
  const todayAt = (fraction: number) => new Date(dayStart.getTime() + Math.floor(span * fraction));
  const todayVolume = (part: number) => (nozzleIndex: number) =>
    120 + ((nozzleIndex * 17 + part * 7) % 60);

  // Today's density register: MS recorded, HSD still missing ("readings 1/2").
  await recordDensity({
    productId: petrol.id,
    date: today,
    at: todayAt(0.01),
    kind: 'MORNING',
    density15: TODAY_PETROL_DENSITY,
    tempC: 28.5,
    tankId: tanksOf(petrol.id)[0]?.id,
  });
  // This morning's IOC diesel invoice, still awaiting its tanker.
  const todaysInvoice = await fuelInvoice({
    date: today,
    at: todayAt(0.02),
    productId: diesel.id,
    quantity: 6_000,
    invoiceDensity: 834.3,
  });

  const morningToday = await runShift({
    date: today,
    templateId: morning.id,
    openAt: todayAt(0.05),
    handoverAt: todayAt(0.4),
    closeAt: todayAt(0.42),
    volume: todayVolume(0),
    credit: { customerId: malabar.id, amount: 20_000, duIndex: ksrtcDu, at: todayAt(0.2) },
  });

  // −18 L HSD dip, measured between shifts so book stock is reconciled.
  const book = await bookOf(dieselTank.id);
  await routineDip(
    dieselTank.id,
    book + DEMO_DIP_VARIANCE_LITRES,
    todayAt(0.44),
    'Dip 18 L below book stock — evaporation and meter drift suspected',
  );

  // Exactly one bank collection from Malabar Transports today.
  const collection = must(
    await new RecordCollection({
      collections: new DrizzleCollectionRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      accounts: new DrizzleFinancialAccountRepository(tx),
      terminals: new DrizzlePaymentTerminalLookup(tx),
      docNumbers,
      events,
    }).execute(
      {
        customerId: malabar.id,
        amount: 15_000,
        paymentMethod: 'BankTransfer',
        stationId,
        entryDate: today,
        fundingAccountId: bank.id,
        notes: 'NEFT against fleet credit',
      },
      context(todayAt(0.46), accountant.id),
    ),
    'collection',
  );
  await ledger.postCollection(collection);

  // Evening: open, and Anitha S · DU-2 has handed over ₹350 short. The other
  // drawers are still on duty, so the shift stays open.
  const eveningToday = await openShift(today, evening.id, todayAt(0.5));
  const eveningOpening = await openingReadings(eveningToday.shift.id);
  // The tanker is on site and still unloading: a DRAFT linked to the invoice.
  await tanker({
    arriveAt: todayAt(0.66),
    startAt: todayAt(0.68),
    recordAt: todayAt(0.7),
    tankerNumber: 'KL-07-BZ-9086',
    driverName: 'Rajan Pillai',
    draft: true,
    loads: [
      {
        productId: diesel.id,
        purchaseId: todaysInvoice.id,
        invoiceQty: 6_000,
        invoiceDensity: 834.3,
        variance: 0,
        roDensity: 834.8,
        tempC: 29.5,
      },
    ],
  });
  const du2Index = dispensers.findIndex((du) => du.id === du2.id);
  const pending = await handover(
    eveningToday.shift.id,
    todayAt(0.9),
    du2Index,
    eveningOpening,
    todayVolume(1),
    0,
    DEMO_PENDING_SHORTAGE,
  );

  return {
    businessDayId: morningToday.businessDay.id,
    morningShiftId: morningToday.shift.id,
    eveningShiftId: eveningToday.shift.id,
    pendingHandoverId: pending.handover.id,
    closedBusinessDays,
  };
}
