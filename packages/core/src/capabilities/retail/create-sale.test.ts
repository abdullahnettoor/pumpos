import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../kernel/index.js';
import type { DocumentNumberGenerator, ExecutionContext } from '../../kernel/index.js';
import { CreateSale } from './index.js';
import type { Sale, SaleLine, SaleRepository } from './index.js';
import type { StockMovement, StockMovementRepository } from '../inventory/index.js';
import type { CustomerLedgerEntry, CustomerLedgerRepository } from '../crm/collections/index.js';
import type { Customer, CustomerRepository } from '../crm/customers/index.js';
import type { Shift, ShiftRepository } from '../station-ops/shifts/index.js';

class SaleRepo implements SaleRepository {
  saved: { sale: Sale; lines: SaleLine[] } | null = null;
  async save(sale: Sale, lines: SaleLine[]) { this.saved = { sale, lines }; }
}
class StockRepo implements StockMovementRepository {
  readonly movements: StockMovement[] = [];
  async save(m: StockMovement) { this.movements.push(m); }
  async saveMany(m: StockMovement[]) { this.movements.push(...m); }
  async currentQuantityForTank() { return 0; }
  async currentQuantityForProduct() { return 0; }
}
class LedgerRepo implements CustomerLedgerRepository {
  readonly rows: CustomerLedgerEntry[] = [];
  async save(e: CustomerLedgerEntry) { this.rows.push(e); }
}
class CustomerRepo implements CustomerRepository {
  constructor(readonly rows: Customer[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async existsByName() { return false; }
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
const docNumbers: DocumentNumberGenerator = { async next() { return 'SALE-000001'; } };

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd-1', actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('s') };
}
function shift(): Shift {
  return { id: 'sh-1', organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd-1', shiftTemplateId: 't', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, lockedAt: null, openingCash: '0', closingCash: null, createdAt: '', updatedAt: '' };
}
function customer(): Customer {
  return { id: 'cust-1', organizationId: 'org-1', stationId: null, customerType: 'Credit', name: 'Ravi', phone: null, creditLimit: '100000', fleetCode: null, isPrepaid: false, prepaidBalance: '0', metadata: null, isActive: true, createdAt: '', updatedAt: '' };
}

function deps(over: Partial<{ sales: SaleRepo; stock: StockRepo; ledger: LedgerRepo; customers: CustomerRepo; shifts: ShiftRepo; store: InMemoryEventStore }> = {}) {
  const store = over.store ?? new InMemoryEventStore();
  return {
    sales: over.sales ?? new SaleRepo(),
    stock: over.stock ?? new StockRepo(),
    ledger: over.ledger ?? new LedgerRepo(),
    customers: over.customers ?? new CustomerRepo([customer()]),
    shifts: over.shifts ?? new ShiftRepo([shift()]),
    docNumbers,
    events: new InProcessEventDispatcher({ store }),
    store,
  };
}

describe('CreateSale', () => {
  it('a cash merchandise sale decrements item stock and emits RETAIL_SALE_CREATED', async () => {
    const d = deps();
    const result = await new CreateSale(d).execute(
      { shiftId: 'sh-1', paymentMethod: 'Cash', lines: [{ productId: 'oil-1', quantity: 2, unitPrice: 250 }] },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sale.saleType).toBe('Product');
      expect(result.data.sale.totalAmount).toBe('500');
      expect(result.data.sale.shiftId).toBe('sh-1');
    }
    expect(d.stock.movements).toHaveLength(1);
    expect(d.stock.movements[0].quantity).toBe('-2');
    expect(d.stock.movements[0].movementType).toBe('Sale');
    expect(d.ledger.rows).toHaveLength(0);
    expect(d.store.events.map((e) => e.eventType)).toContain(BusinessEvents.RETAIL_SALE_CREATED);
  });

  it('a credit sale debits the customer ledger and emits CREDIT_SALE_CREATED', async () => {
    const d = deps();
    const result = await new CreateSale(d).execute(
      { shiftId: 'sh-1', paymentMethod: 'Credit', customerId: 'cust-1', lines: [{ productId: 'oil-1', quantity: 1, unitPrice: 1000, taxAmount: 180 }] },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sale.totalAmount).toBe('1180');
      expect(result.data.sale.customerId).toBe('cust-1');
    }
    expect(d.ledger.rows).toHaveLength(1);
    expect(d.ledger.rows[0].transactionType).toBe('Credit Sale');
    expect(d.ledger.rows[0].amount).toBe('1180');
    expect(d.store.events.map((e) => e.eventType)).toContain(BusinessEvents.CREDIT_SALE_CREATED);
  });

  it('rejects a credit sale without a customer', async () => {
    const result = await new CreateSale(deps()).execute(
      { shiftId: 'sh-1', paymentMethod: 'Credit', lines: [{ productId: 'oil-1', quantity: 1, unitPrice: 100 }] },
      ctx(),
    );
    expect(result.success).toBe(false);
  });

  it('a fuel line yields saleType Fuel and emits FUEL_SALE_RECORDED', async () => {
    const d = deps();
    const result = await new CreateSale(d).execute(
      { shiftId: 'sh-1', paymentMethod: 'Cash', lines: [{ productId: 'petrol-1', quantity: 10, unitPrice: 100, tankId: 'tank-1' }] },
      ctx(),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sale.saleType).toBe('Fuel');
    expect(d.stock.movements[0].tankId).toBe('tank-1');
    expect(d.store.events.map((e) => e.eventType)).toContain(BusinessEvents.FUEL_SALE_RECORDED);
  });
});
