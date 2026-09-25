import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../kernel/index.js';
import type { DocumentNumberGenerator, ExecutionContext } from '../../kernel/index.js';
import { AccountRepo, eventBus, officeCtx } from '../finance/__tests__/office.js';
import { RecordPurchase, RecordSupplierPayment } from './index.js';
import type {
  Purchase,
  PurchaseItem,
  PurchaseItemRepository,
  PurchaseRepository,
  SupplierTransaction,
  SupplierTransactionRepository,
} from './index.js';
import type { StockMovement, StockMovementRepository } from '../inventory/index.js';
import type { Supplier, SupplierRepository } from '../crm/suppliers/index.js';
import type { Product, ProductRepository } from '../station-setup/products/index.js';
import type { Station, StationRepository } from '../station-setup/stations/index.js';
import type { Shift, ShiftRepository } from '../station-ops/shifts/index.js';
import type {
  BusinessDay,
  BusinessDayWriteRepository,
} from '../station-ops/business-days/index.js';

class PurchaseRepo implements PurchaseRepository {
  readonly rows: Purchase[] = [];
  async save(p: Purchase) {
    this.rows.push(p);
  }
}
class PurchaseItemRepo implements PurchaseItemRepository {
  readonly rows: PurchaseItem[] = [];
  async saveMany(items: PurchaseItem[]) {
    this.rows.push(...items);
  }
}
class SupplierTxnRepo implements SupplierTransactionRepository {
  readonly rows: SupplierTransaction[] = [];
  async save(t: SupplierTransaction) {
    this.rows.push(t);
  }
}
class StockRepo implements StockMovementRepository {
  readonly movements: StockMovement[] = [];
  constructor(private readonly onHand = 0) {}
  async save(m: StockMovement) {
    this.movements.push(m);
  }
  async saveMany(m: StockMovement[]) {
    this.movements.push(...m);
  }
  async currentQuantityForTank() {
    return 0;
  }
  async currentQuantityForProduct() {
    return this.onHand;
  }
}
class SupplierRepo implements SupplierRepository {
  constructor(readonly rows: Supplier[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save() {}
  async existsByName() {
    return false;
  }
  async listByOrganization() {
    return this.rows;
  }
}
class ProductRepo implements ProductRepository {
  constructor(readonly rows: Product[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save() {}
  async existsByCode() {
    return false;
  }
  async listByOrganization() {
    return this.rows;
  }
  async updateCostBasis(productId: string, costBasis: string) {
    const r = this.rows.find((x) => x.id === productId);
    if (r) r.costBasis = costBasis;
  }
}
class StationRepo implements StationRepository {
  constructor(readonly rows: Station[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save() {}
  async listByOrganization() {
    return this.rows;
  }
}
class ShiftRepo implements ShiftRepository {
  constructor(readonly rows: Shift[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async findByIdWithoutLock(id: string) {
    return this.findById(id);
  }
  async save() {}
  async findOpenByStation() {
    return null;
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class BdRepo implements BusinessDayWriteRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return (
      this.rows.find(
        (r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN',
      ) ?? null
    );
  }
  async findByStationAndDate(orgId: string, stationId: string, _date: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId) ?? null;
  }
  async lockStation() {}
  async lockById() {}
  async lockByStationAndDate() {}
}
const docNumbers: DocumentNumberGenerator = {
  async next() {
    return 'PUR-000001';
  },
};

function ctx(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T10:00:00Z')),
    ids: new SequentialIdGenerator('p'),
  };
}
function supplier(): Supplier {
  return {
    id: 'sup-1',
    organizationId: 'org-1',
    stationId: null,
    name: 'IOCL',
    phone: null,
    metadata: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}
function fuelProduct(): Product {
  return {
    id: 'petrol-1',
    organizationId: 'org-1',
    name: 'Petrol',
    code: 'MS',
    productType: 'FUEL',
    inventoryType: 'BULK',
    stockTracked: true,
    isTaxable: false,
    taxCategory: 'FUEL_VAT',
    unit: 'Liters',
    brand: null,
    category: null,
    sellingPrice: null,
    costBasis: '0',
    taxConfig: {},
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}
function lubeProduct(): Product {
  return {
    id: 'lube-1',
    organizationId: 'org-1',
    name: 'Engine Oil',
    code: 'EO',
    productType: 'LUBRICANT',
    inventoryType: 'ITEM',
    stockTracked: true,
    isTaxable: true,
    taxCategory: 'GST',
    unit: 'Litre',
    brand: null,
    category: null,
    sellingPrice: null,
    costBasis: '0',
    taxConfig: { gst_rate: 18 },
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}
function station(): Station {
  return {
    id: 'st-1',
    organizationId: 'org-1',
    name: 'St',
    code: 'ST',
    address: null,
    phone: null,
    settings: {},
    onboardingStatus: 'READY_FOR_OPERATIONS',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}
function bday(): BusinessDay {
  return {
    id: 'bd-9',
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDate: '2026-03-15',
    status: 'OPEN',
    openedBy: 'u',
    openedAt: '',
    closedBy: null,
    closedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('RecordPurchase', () => {
  it('rejects a purchase on a closed Business Day before writing anything', async () => {
    const purchases = new PurchaseRepo();
    const items = new PurchaseItemRepo();
    const stock = new StockRepo();
    const supplierTxns = new SupplierTxnRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordPurchase({
      purchases,
      purchaseItems: items,
      stock,
      supplierTxns,
      suppliers: new SupplierRepo([supplier()]),
      products: new ProductRepo([fuelProduct()]),
      stations: new StationRepo([station()]),
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([{ ...bday(), status: 'CLOSED', closedAt: '2026-03-15T09:00:00Z' }]),
      docNumbers,
      events: new InProcessEventDispatcher({ store }),
    }).execute(
      {
        supplierId: 'sup-1',
        productId: 'petrol-1',
        quantity: 5000,
        unitPrice: 90,
        stationId: 'st-1',
      },
      ctx(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
    expect(purchases.rows).toHaveLength(0);
    expect(items.rows).toHaveLength(0);
    expect(stock.movements).toHaveLength(0);
    expect(supplierTxns.rows).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it('raises a payable and increments tank stock, anchored to the business day with no shift', async () => {
    const purchases = new PurchaseRepo();
    const stock = new StockRepo();
    const supplierTxns = new SupplierTxnRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordPurchase({
      purchases,
      stock,
      supplierTxns,
      suppliers: new SupplierRepo([supplier()]),
      purchaseItems: new PurchaseItemRepo(),
      products: new ProductRepo([fuelProduct()]),
      stations: new StationRepo([station()]),
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      docNumbers,
      events: new InProcessEventDispatcher({ store }),
    }).execute(
      {
        supplierId: 'sup-1',
        productId: 'petrol-1',
        quantity: 5000,
        unitPrice: 90,
        invoiceNumber: 'INV-1',
        stationId: 'st-1',
        tankAllocations: [{ tankId: 'tank-1', quantity: 5000 }],
      },
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
    // The payable moves no money and is dated on the purchase's Business Date.
    expect(supplierTxns.rows[0].fundingAccountId).toBeNull();
    expect(supplierTxns.rows[0].entryDate).toBe('2026-03-15');
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.GOODS_RECEIVED);
  });

  // ADR 0005 / #308: a purchase never stores a Shift, even when the client
  // (e.g. a queued legacy payload) still sends one.
  it.each([
    ['station + date with a stale shiftId', { stationId: 'st-1', shiftId: 'sh-1' }],
    ['a legacy shiftId-only payload', { shiftId: 'sh-1' }],
  ])('stores shift_id null and the business day for %s', async (_label, anchor) => {
    const openShift: Shift = {
      id: 'sh-1',
      organizationId: 'org-1',
      stationId: 'st-1',
      businessDayId: 'bd-9',
      shiftTemplateId: 't',
      status: 'OPEN',
      openedBy: 'u',
      openedAt: '',
      closedBy: null,
      closedAt: null,
      lockedAt: null,
      openingCash: '0',
      closingCash: null,
      createdAt: '',
      updatedAt: '',
    };
    const purchases = new PurchaseRepo();
    const result = await new RecordPurchase({
      purchases,
      stock: new StockRepo(),
      supplierTxns: new SupplierTxnRepo(),
      suppliers: new SupplierRepo([supplier()]),
      purchaseItems: new PurchaseItemRepo(),
      products: new ProductRepo([fuelProduct()]),
      stations: new StationRepo([station()]),
      shifts: new ShiftRepo([openShift]),
      businessDays: new BdRepo([bday()]),
      docNumbers,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      {
        supplierId: 'sup-1',
        productId: 'petrol-1',
        quantity: 1000,
        unitPrice: 90,
        transactionDate: '2026-03-15',
        tankAllocations: [{ tankId: 'tank-1', quantity: 1000 }],
        ...anchor,
      },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.purchase.shiftId).toBeNull();
      expect(result.data.purchase.businessDayId).toBe('bd-9');
    }
  });

  it('updates the product cost basis as a weighted average of existing stock and the purchase', async () => {
    const products = new ProductRepo([{ ...fuelProduct(), costBasis: '88' }]);
    const stock = new StockRepo(10000); // 10,000 L already on hand @ ₹88
    const result = await new RecordPurchase({
      purchases: new PurchaseRepo(),
      stock,
      supplierTxns: new SupplierTxnRepo(),
      suppliers: new SupplierRepo([supplier()]),
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      purchaseItems: new PurchaseItemRepo(),
      products,
      stations: new StationRepo([station()]),
      docNumbers,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      // Buy 5,000 L @ ₹90.50 → (10000·88 + 5000·90.50) / 15000 = 88.8333
      {
        supplierId: 'sup-1',
        productId: 'petrol-1',
        quantity: 5000,
        unitPrice: 90.5,
        stationId: 'st-1',
        tankAllocations: [{ tankId: 'tank-1', quantity: 5000 }],
      },
      ctx(),
    );
    expect(result.success).toBe(true);
    expect(products.rows[0].costBasis).toBe('88.8333');
  });

  it('sets cost basis to the purchase price when there is no prior stock', async () => {
    const products = new ProductRepo([{ ...fuelProduct(), costBasis: '0' }]);
    const stock = new StockRepo(0);
    const result = await new RecordPurchase({
      purchases: new PurchaseRepo(),
      stock,
      supplierTxns: new SupplierTxnRepo(),
      suppliers: new SupplierRepo([supplier()]),
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      purchaseItems: new PurchaseItemRepo(),
      products,
      stations: new StationRepo([station()]),
      docNumbers,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      {
        supplierId: 'sup-1',
        productId: 'petrol-1',
        quantity: 5000,
        unitPrice: 90.5,
        stationId: 'st-1',
        tankAllocations: [{ tankId: 'tank-1', quantity: 5000 }],
      },
      ctx(),
    );
    expect(result.success).toBe(true);
    expect(products.rows[0].costBasis).toBe('90.5');
  });

  it('rejects tank allocations that do not sum to the quantity', async () => {
    const result = await new RecordPurchase({
      purchases: new PurchaseRepo(),
      stock: new StockRepo(),
      supplierTxns: new SupplierTxnRepo(),
      suppliers: new SupplierRepo([supplier()]),
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      purchaseItems: new PurchaseItemRepo(),
      products: new ProductRepo([fuelProduct()]),
      stations: new StationRepo([station()]),
      docNumbers,
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      {
        supplierId: 'sup-1',
        productId: 'petrol-1',
        quantity: 5000,
        unitPrice: 90,
        stationId: 'st-1',
        tankAllocations: [{ tankId: 'tank-1', quantity: 4000 }],
      },
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
      purchases,
      stock,
      supplierTxns,
      suppliers: new SupplierRepo([supplier()]),
      purchaseItems: items,
      products: new ProductRepo([fuelProduct(), lubeProduct()]),
      stations: new StationRepo([station()]),
      shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]),
      docNumbers,
      events: new InProcessEventDispatcher({ store }),
    }).execute(
      {
        supplierId: 'sup-1',
        invoiceNumber: 'INV-2',
        stationId: 'st-1',
        lines: [
          {
            productId: 'petrol-1',
            quantity: 5000,
            unitPrice: 90,
            tankAllocations: [{ tankId: 'tank-1', quantity: 5000 }],
          },
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

describe('RecordSupplierPayment (Office Record, ADR 0005)', () => {
  function pay(input: Record<string, unknown>) {
    const supplierTxns = new SupplierTxnRepo();
    const { store, events } = eventBus();
    const result = new RecordSupplierPayment({
      supplierTxns,
      suppliers: new SupplierRepo([supplier()]),
      accounts: new AccountRepo(),
      events,
    }).execute({ supplierId: 'sup-1', amount: 10000, ...input } as any, officeCtx());
    return { result, supplierTxns, store };
  }

  it('pays from the Funding Account on the Entry Date, with no shift or business day', async () => {
    const { result, supplierTxns, store } = pay({ fundingAccountId: 'hdfc' });
    const r = await result;
    expect(r.success).toBe(true);
    expect(supplierTxns.rows[0]).toMatchObject({
      transactionType: 'Payment',
      stationId: 'st-1',
      entryDate: '2026-03-15',
      fundingAccountId: 'hdfc',
    });
    expect(store.events.map((e) => e.eventType)).toEqual([
      BusinessEvents.SUPPLIER_PAID,
      BusinessEvents.PAYMENT_MADE,
    ]);
    for (const e of store.events) {
      expect(e.businessDayId).toBeNull();
      expect(e.payload).toMatchObject({ entryDate: '2026-03-15', fundingAccountId: 'hdfc' });
    }
    expect((store.events[0].metadata as any).presentation).toMatchObject({
      templateId: 'supplier-paid.v2',
      values: { accountName: 'HDFC Current' },
    });
  });

  it('rejects a future Entry Date', async () => {
    const r = await pay({ fundingAccountId: 'cash', entryDate: '2027-01-01' }).result;
    expect(r.success).toBe(false);
  });

  it('requires a Funding Account', async () => {
    const r = await pay({}).result;
    expect(r.success).toBe(false);
  });
});
