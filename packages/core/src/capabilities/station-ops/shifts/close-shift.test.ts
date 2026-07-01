import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { CloseShift } from './close-shift.js';
import type {
  NozzleReading,
  NozzleReadingRepository,
  Shift,
  ShiftReconciliationReader,
  ShiftReconciliationTotals,
  ShiftRepository,
  ShiftSummaryWriter,
  CreditSalesReader,
  CreditSaleRecord,
  StockMovementInput,
  StockMovementWriter,
} from './ports.js';
import type { Nozzle, NozzleRepository } from '../../station-setup/nozzles/index.js';

class ShiftRepo implements ShiftRepository {
  constructor(readonly rows: Shift[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save(s: Shift) { const i = this.rows.findIndex((r) => r.id === s.id); if (i >= 0) this.rows[i] = s; else this.rows.push(s); }
  async findOpenByStation() { return null; }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class NozzleRepo implements NozzleRepository {
  constructor(readonly rows: Nozzle[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async deleteById() { return true; }
  async listByStation() { return this.rows; }
}
class ReadingRepo implements NozzleReadingRepository {
  constructor(readonly rows: NozzleReading[]) {}
  async lastClosingByNozzleIds() { return new Map(); }
  async saveMany() {}
  async listByShift(shiftId: string) { return this.rows.filter((r) => r.shiftId === shiftId); }
  async updateClosing(id: string, closing: string, vol: string) {
    const r = this.rows.find((x) => x.id === id);
    if (r) { r.closingReading = closing; r.volumeSold = vol; }
  }
}
class ReconReader implements ShiftReconciliationReader {
  constructor(private readonly totals: ShiftReconciliationTotals) {}
  async totalsForShift() { return this.totals; }
}
class CreditSalesReaderMock implements CreditSalesReader {
  constructor(private readonly records: CreditSaleRecord[] = []) {}
  async listByShift(shiftId: string) { return this.records.filter((r) => r.customerId); }
}
class StockWriter implements StockMovementWriter {
  readonly saved: StockMovementInput[] = [];
  async saveMany(m: StockMovementInput[]) { this.saved.push(...m); }
}
class SummaryWriter implements ShiftSummaryWriter {
  saved: { shiftId: string; snapshot: Record<string, unknown> } | null = null;
  deleted = false;
  async save(shiftId: string, snapshot: Record<string, unknown>) { this.saved = { shiftId, snapshot }; }
  async deleteForShift() { this.deleted = true; }
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd', actorId: 'user-1', correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T14:00:00.000Z')), ids: new SequentialIdGenerator('c'),
  };
}

function openShiftRow(): Shift {
  return { id: 'sh-1', organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd', shiftTemplateId: 't', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, lockedAt: null, openingCash: '5000', closingCash: null, createdAt: '', updatedAt: '' };
}
function reading(): NozzleReading {
  return { id: 'r1', shiftId: 'sh-1', nozzleId: 'n1', openingReading: '1000', closingReading: '1000', volumeSold: '0', testingVolume: '0', unitPrice: '100', createdAt: '' };
}
function nozzle(): Nozzle {
  return { id: 'n1', organizationId: 'org-1', stationId: 'st-1', duId: 'du', tankId: 'tk1', productId: 'pet', name: 'n1', currentReading: '1000', createdAt: '', updatedAt: '' };
}

describe('CloseShift', () => {
  it('finalizes readings, records sale movement, reconciles drawer (variance 0)', async () => {
    const shifts = new ShiftRepo([openShiftRow()]);
    const nozzles = new NozzleRepo([nozzle()]);
    const readings = new ReadingRepo([reading()]);
    const recon = new ReconReader({ cashSales: 0, cashCollections: 2000, cardCollections: 0, upiCollections: 0, creditCollections: 0, drawerExpenses: 300, drawerSupplierPayments: 0 });
    const stock = new StockWriter();
    const summaries = new SummaryWriter();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });
    const creditSales = new CreditSalesReaderMock([]);

    // expected = 5000 + 2000 - 300 = 6700; declare 6700 -> variance 0
    const result = await new CloseShift({ shifts, nozzles, nozzleReadings: readings, reconciliation: recon, creditSales, stockMovements: stock, summaries, events })
      .execute({ shiftId: 'sh-1', closingCash: 6700, nozzleReadings: [{ nozzleId: 'n1', closingReading: 1100 }] }, makeContext());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shift.status).toBe('CLOSED');
      expect(result.data.snapshot.expectedDrawerCash).toBe(6700);
      expect(result.data.snapshot.cashVariance).toBe(0);
      expect(result.data.snapshot.totalVolume).toBe(100);
      expect(result.data.snapshot.totalFuelSalesValue).toBe(10000);
    }
    expect(stock.saved).toHaveLength(1);
    expect(stock.saved[0].quantity).toBe('-100');
    expect(summaries.saved).not.toBeNull();
    const types = store.events.map((e) => e.eventType);
    expect(types).toContain(BusinessEvents.CASH_DECLARED);
    expect(types).toContain(BusinessEvents.SHIFT_CLOSED);
  });

  it('rejects closing an already-closed shift', async () => {
    const closed = { ...openShiftRow(), status: 'CLOSED' as const };
    const result = await new CloseShift({
      shifts: new ShiftRepo([closed]), nozzles: new NozzleRepo([]), nozzleReadings: new ReadingRepo([]),
      reconciliation: new ReconReader({ cashSales: 0, cashCollections: 0, cardCollections: 0, upiCollections: 0, creditCollections: 0, drawerExpenses: 0, drawerSupplierPayments: 0 }),
      creditSales: new CreditSalesReaderMock([]),
      stockMovements: new StockWriter(), summaries: new SummaryWriter(), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', closingCash: 0 }, makeContext());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
  });
});
