import {
  RecordDecantation,
  RecordPurchase,
  RecordStockCount,
  type RecordDecantationCommand,
} from '@pump/core';
import { resolveDecantationSettings } from '@pump/shared';
import {
  createDecantationLinker,
  createDecantationMeasurement,
  DrizzleDecantationRepository,
  DrizzleDensityReadingRepository,
} from '../../infra/repositories/decantation-repositories.js';
import {
  DrizzlePurchaseItemRepository,
  DrizzlePurchaseRepository,
  DrizzleSupplierTransactionRepository,
} from '../../infra/repositories/purchasing-repositories.js';
import { DrizzleSupplierRepository } from '../../infra/repositories/crm-repositories.js';
import { DrizzleProductRepository } from '../../infra/repositories/product.repo.js';
import {
  DrizzleStationRepository,
  DrizzleTankRepository,
} from '../../infra/repositories/setup-repositories.js';
import { DrizzleStockVarianceRepository } from '../../infra/repositories/inventory-repositories.js';
import { must, type DemoContext } from './demo-context.js';
import type { DensityHelpers } from './demo-density.js';

/** Indian Oil invoices fuel at ~96% of the pole price (tax-inclusive). */
const PURCHASE_RATE = 0.96;

export interface TankerLoad {
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

export interface TankerChamber {
  /** Index into `loads` of the product this chamber unloads. */
  load: number;
  capacityL: number;
  sealOk?: boolean;
  mark?: 'OK' | 'SHORT' | 'EXCESS';
}

/** Fuel invoices, tanker visits (Decantations) and routine tank dips. */
export function createDecantationHelpers(ctx: DemoContext, density: DensityHelpers) {
  const {
    tx,
    events,
    ids,
    docNumbers,
    stationId,
    managerId,
    accountantId,
    supplierId,
    context,
    shifts,
    businessDays,
    stockMovements,
    tanksOf,
    bookOf,
    priceOf,
  } = ctx;
  const { hydrometer, standardDensity } = density;
  const decantationSettings = resolveDecantationSettings(ctx.stationSettings);
  const settings = {
    densityToleranceKgM3: decantationSettings.densityToleranceKgM3,
    settlingTimeMinutes: decantationSettings.settlingTimeMinutes,
  };
  const iso = (date: Date) => date.toISOString();

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
          supplierId: supplierId,
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
        context(input.at, accountantId),
      ),
      'fuel invoice',
    ).purchase;

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
    const lines: RecordDecantationCommand['lines'] = [];
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
    const chambers: NonNullable<RecordDecantationCommand['chambers']> = (input.chambers ?? []).map(
      (chamber, index) => {
        const lineIndex = lineIndexes[chamber.load];
        return {
          chamberNo: index + 1,
          capacityL: chamber.capacityL,
          sealOk: chamber.sealOk ?? true,
          mark: chamber.mark ?? 'OK',
          emptied: true,
          tankLineIndex: lineIndex[index % lineIndex.length],
        };
      },
    );
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
        },
        context(input.recordAt, managerId),
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
      }).execute({ stationId, tankId, actualQuantity, reason }, context(at, managerId)),
      'routine tank dip',
    );

  return { fuelInvoice, tanker, routineDip };
}
