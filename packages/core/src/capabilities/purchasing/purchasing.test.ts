import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../kernel/index.js';
import type { DocumentNumberGenerator, ExecutionContext } from '../../kernel/index.js';
import { RecordPurchase, RecordSupplierPayment } from './index.js';
import type { Purchase, PurchaseItem, PurchaseItemRepository, PurchaseRepository, SupplierTransaction, SupplierTransactionRepository } from './index.js';
import type { StockMovement, StockMovementRepository } from '../inventory/index.js';
import type { Supplier, SupplierRepository } from '../crm/suppliers/index.js';
import type { Product, ProductRepository } from '../station-setup/products/index.js';
import type { Station, StationRepository } from '../station-setup/stations/index.js';
import type { Shift, ShiftRepository } from '../station-ops/shifts/index.js';
import type { BusinessDay, BusinessDayRepository } from '../station-ops/business-days/index.js';

class PurchaseRepo implements PurchaseRepository {
  readonly rows: Purchase[] = [];
  async save(p: Purchase) { this.rows.push(p); }
}
class PurchaseItemRepo implements PurchaseItemRepository {
  readonly rows: PurchaseItem[] = [];
  async saveMany(items: PurchaseItem[]) { this.rows.push(...items); }
}
class SupplierTxnRepo implements SupplierTransactionRepository {
  readonly rows: SupplierTransaction[] = [];
  async save(t: SupplierTransaction) { this.rows.push(t); }
}
class StockRepo implements StockMovementRepository {
  readonly movements: StockMovement[] = [];
  async save(m: StockMovement) { this.movements.push(m); }
  async saveMany(m: StockMovement[]) { this.movements.push(...m); }
  async currentQuantityForTank() { return 0; }
  async currentQuantityForProduct() { return 0; }
}
class SupplierRepo implements SupplierRepository {
  constructor(readonly rows: Supplier[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async existsByName() { return false; }
  async listByOrganization() { return this.rows; }
}
class ProductRepo implements ProductRepository {
  constructor(readonly rows: Product[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async existsByCode() { return false; }
  async listByOrganization() { return this.rows; }
}
class StationRepo implements StationRepository {
  constructor(readonly rows: Station[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async listByOrganization() { return this.rows; }
}
class ShiftRepo implements ShiftRepository {
  constructor(readonly rows: Shift[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation() { return null; }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class BdRepo implements BusinessDayRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN') ?? null;
  }
  async findByStationAndDate(orgId: string, stationId: string, _date: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId) ?? null;
  }
}
const docNumbers: DocumentNumberGenerator = { async next() { return 'PUR-000001'; } };

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('p') };
}
function supplier(): Supplier {
  return { id: 'sup-1', organizationId: 'org-1', stationId: null, name: 'IOCL', phone: null, metadata: null, isActive: true, createdAt: '', updatedAt: '' };
}
function fuelProduct(): Product {
  return { id: 'petrol-1', organizationId: 'org-1', name: 'Petrol', code: 'MS', productType: 'FUEL', inventoryType: 'BULK', stockTracked: true, isTaxable: false, taxCategory: 'FUEL_VAT', unit: 'Liters', brand: null, category: null, sellingPrice: null, taxConfig: {}, isActive: true, createdAt: '', updatedAt: '' };
}
function lubeProduct(): Product {
  return { id: 'lube-1', organizationId: 'org-1', name: 'Engine Oil', code: 'EO', productType: 'LUBRICANT', inventoryType: 'ITEM', stockTracked: true, isTaxable: true, taxCategory: 'GST', unit: 'Litre', brand: null, category: null, sellingPrice: null, taxConfig: { gst_rate: 18 }, isActive: true, createdAt: '', updatedAt: '' };
}
function station(): Station {
  return { id: 'st-1', organizationId: 'org-1', name: 'St', code: 'ST', address: null, phone: null, settings: {}, onboardingStatus: 'READY_FOR_OPERATIONS', isActive: true, createdAt: '', updatedAt: '' };
}
function shift(): Shift {
  return { id: 'sh-1', organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd-1', shiftTemplateId: 't', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, lockedAt: null, openingCash: '0', closingCash: null, createdAt: '', updatedAt: '' };
}
function bday(): BusinessDay {
  return { id: 'bd-9', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' };
}

describe('RecordPurchase', () => {
  it('raises a payable and increments tank stock, anchored to the business day with no shift', async () => {
    const purchases = new PurchaseRepo();
    const stock = new StockRepo();
    const supplierTxns = new SupplierTxnRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordPurchase({
      purchases, stock, supplierTxns, suppliers: new SupplierRepo([supplier()]),
      purchaseItems: new PurchaseItemRepo(), products: new ProductRepo([fuelProduct()]), stations: new StationRepo([station()]),
      shifts: new ShiftRepo([]), businessDays: new BdRepo([bday()]), docNumbers,
      events: new InProcessEventDispatcher({ store }),
    }).execute(
      { supplierId: 'sup-1', productId: 'petrol-1', quantity: 5000, unitPrice: 90, invoiceNumber: 'INV-1', stationId: 'st-1', tankAllocations: [{ tankId: 'tank-1', quantity: 5000 }] },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.purchase.amount).toBe('450000');
      expect(result.data.purchase.shiftId).toBeNull();
      expect(result.data.purchase.businessDayId).toBe('bd-9');
    }
    expect(stock.movements).toHaveLength(1);
    expect(stock.movements[0].quantity).toBe('5000');
    expect(stock.movements[0].tankId).toBe('tank-1');
    expect(supplierTxns.rows[0].transactionType).toBe('Purchase');
    expect(supplierTxns.rows[0].affectsDrawer).toBe(false);
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.GOODS_RECEIVED);
  });

  it('rejects tank allocations that do not sum to the quantity', async () => {
    const result = await new RecordPurchase({
      purchases: new PurchaseRepo(), stock: new StockRepo(), supplierTxns: new SupplierTxnRepo(),
      suppliers: new SupplierRepo([supplier()]), shifts: new ShiftRepo([]), businessDays: new BdRepo([bday()]),
      purchaseItems: new PurchaseItemRepo(), products: new ProductRepo([fuelProduct()]), stations: new StationRepo([station()]),
      docNumbers, events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      { supplierId: 'sup-1', productId: 'petrol-1', quantity: 5000, unitPrice: 90, stationId: 'st-1', tankAllocations: [{ tankId: 'tank-1', quantity: 4000 }] },
      ctx(),
    );
    expect(result.success).toBe(false);
  });

  it('records a multi-line invoice with per-line GST and one stock movement per line', async () => {
    const purchases = new PurchaseRepo();
    const items = new PurchaseItemRepo();
    const stock = new StockRepo();
    const supplierTxns = new SupplierTxnRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordPurchase({
      purchases, stock, supplierTxns, suppliers: new SupplierRepo([supplier()]),
      purchaseItems: items, products: new ProductRepo([fuelProduct(), lubeProduct()]), stations: new StationRepo([station()]),
      shifts: new ShiftRepo([]), businessDays: new BdRepo([bday()]), docNumbers,
      events: new InProcessEventDispatcher({ store }),
    }).execute(
      {
        supplierId: 'sup-1',
        invoiceNumber: 'INV-2',
        stationId: 'st-1',
        lines: [
          { productId: 'petrol-1', quantity: 5000, unitPrice: 90, tankAllocations: [{ tankId: 'tank-1', quantity: 5000 }] },
          { productId: 'lube-1', quantity: 10, unitPrice: 200 },
        ],
      },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      // Fuel line: 450000 taxable, no VAT configured. Lube line: 2000 + 18% GST (intra-state, no buyer state) = 2360.
      expect(result.data.items).toHaveLength(2);
      expect(result.data.purchase.taxableAmount).toBe('452000');
      expect(result.data.purchase.cgstTotal).toBe('180');
      expect(result.data.purchase.sgstTotal).toBe('180');
      expect(result.data.purchase.amount).toBe('452360');
      // One movement per line.
      expect(result.data.movements).toHaveLength(2);
    }
    expect(items.rows).toHaveLength(2);
  });
});

describe('RecordSupplierPayment', () => {
  it('a SHIFT_CASH payment touches the drawer (shiftId set)', async () => {
    const supplierTxns = new SupplierTxnRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordSupplierPayment({
      supplierTxns, suppliers: new SupplierRepo([supplier()]), shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([]), events: new InProcessEventDispatcher({ store }),
    }).execute({ supplierId: 'sup-1', amount: 10000, paidFrom: 'SHIFT_CASH', shiftId: 'sh-1' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBe('sh-1');
      expect(result.data.affectsDrawer).toBe(true);
    }
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.SUPPLIER_PAID);
  });

  it('a BANK payment is business-day anchored with no drawer impact', async () => {
    const supplierTxns = new SupplierTxnRepo();
    const result = await new RecordSupplierPayment({
      supplierTxns, suppliers: new SupplierRepo([supplier()]), shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ supplierId: 'sup-1', amount: 10000, paidFrom: 'BANK', stationId: 'st-1' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeNull();
      expect(result.data.affectsDrawer).toBe(false);
      expect(result.data.businessDayId).toBe('bd-9');
    }
  });
});
