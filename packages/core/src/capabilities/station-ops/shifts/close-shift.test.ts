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
  CloseShiftContext,
  CloseShiftContextReader,
  NozzleReading,
  NozzleReadingRepository,
  Shift,
  ShiftReconciliationTotals,
  ShiftRepository,
  ShiftSummaryWriter,
  CreditSaleRecord,
  StockMovementInput,
  StockMovementWriter,
} from './ports.js';

/** Consolidated context fake: serves the same rows the five old ports did. */
class ContextReader implements CloseShiftContextReader {
  constructor(
    private readonly shifts: Shift[],
    private readonly readings: NozzleReading[],
    private readonly nozzles: { id: string; productId: string; tankId: string | null }[],
    private readonly totals: ShiftReconciliationTotals,
    private readonly creditSales: CreditSaleRecord[] = [],
  ) {}
  async load(_organizationId: string, shiftId: string): Promise<CloseShiftContext> {
    return {
      shift: this.shifts.find((r) => r.id === shiftId) ?? null,
      readings: this.readings.filter((r) => r.shiftId === shiftId),
      nozzles: this.nozzles,
      totals: this.totals,
      creditSales: this.creditSales,
    };
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
  async save(s: Shift) {
    const i = this.rows.findIndex((r) => r.id === s.id);
    if (i >= 0) this.rows[i] = s;
    else this.rows.push(s);
  }
  async findOpenByStation() {
    return null;
  }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class ReadingRepo implements NozzleReadingRepository {
  constructor(readonly rows: NozzleReading[]) {}
  async lastClosingByNozzleIds() {
    return new Map();
  }
  async saveMany() {}
  async listByShift(shiftId: string) {
    return this.rows.filter((r) => r.shiftId === shiftId);
  }
  async updateClosingMany(updates: { id: string; closingReading: string; volumeSold: string }[]) {
    for (const u of updates) {
      const r = this.rows.find((x) => x.id === u.id);
      if (r) {
        r.closingReading = u.closingReading;
        r.volumeSold = u.volumeSold;
      }
    }
  }
}
class StockWriter implements StockMovementWriter {
  readonly saved: StockMovementInput[] = [];
  async saveMany(m: StockMovementInput[]) {
    this.saved.push(...m);
  }
}
class SummaryWriter implements ShiftSummaryWriter {
  saved: { shiftId: string; snapshot: Record<string, unknown> } | null = null;
  deleted = false;
  async save(shiftId: string, snapshot: Record<string, unknown>) {
    this.saved = { shiftId, snapshot };
  }
  async deleteForShift() {
    this.deleted = true;
  }
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: 'bd',
    actorId: 'user-1',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-15T14:00:00.000Z')),
    ids: new SequentialIdGenerator('c'),
  };
}

function openShiftRow(): Shift {
  return {
    id: 'sh-1',
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: 'bd',
    shiftTemplateId: 't',
    status: 'OPEN',
    openedBy: 'u',
    openedAt: '',
    closedBy: null,
    closedAt: null,
    lockedAt: null,
    openingCash: '5000',
    closingCash: null,
    createdAt: '',
    updatedAt: '',
  };
}
function reading(): NozzleReading {
  return {
    id: 'r1',
    shiftId: 'sh-1',
    nozzleId: 'n1',
    openingReading: '1000',
    closingReading: '1000',
    volumeSold: '0',
    testingVolume: '0',
    unitPrice: '100',
    createdAt: '',
  };
}
function nozzle() {
  return { id: 'n1', productId: 'pet', tankId: 'tk1' };
}

describe('CloseShift', () => {
  it('finalizes readings, records sale movement, reconciles drawer (variance 0)', async () => {
    const shifts = new ShiftRepo([openShiftRow()]);
    const readings = new ReadingRepo([reading()]);
    const context = new ContextReader(shifts.rows, readings.rows, [nozzle()], {
      cashSales: 0,
      cashCollections: 2000,
      cardCollections: 0,
      upiCollections: 0,
      creditCollections: 0,
      drawerExpenses: 300,
      drawerSupplierPayments: 0,
    });
    const stock = new StockWriter();
    const summaries = new SummaryWriter();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });

    // expected = 5000 + 2000 - 300 = 6700; declare 6700 -> variance 0
    const result = await new CloseShift({
      context,
      shifts,
      nozzleReadings: readings,
      stockMovements: stock,
      summaries,
      events,
    }).execute(
      {
        shiftId: 'sh-1',
        closingCash: 6700,
        nozzleReadings: [{ nozzleId: 'n1', closingReading: 1100 }],
      },
      makeContext(),
    );

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
    expect(summaries.saved?.snapshot).not.toHaveProperty('dipReadings');
    expect(summaries.saved?.snapshot).not.toHaveProperty('stockVariances');
    const types = store.events.map((e) => e.eventType);
    expect(types).toContain(BusinessEvents.CASH_DECLARED);
    expect(types).toContain(BusinessEvents.SHIFT_CLOSED);
  });

  const emptyTotals: ShiftReconciliationTotals = {
    cashSales: 0,
    cashCollections: 0,
    cardCollections: 0,
    upiCollections: 0,
    creditCollections: 0,
    drawerExpenses: 0,
    drawerSupplierPayments: 0,
  };

  it('rejects closing an already-closed shift', async () => {
    const closed = { ...openShiftRow(), status: 'CLOSED' as const };
    const result = await new CloseShift({
      context: new ContextReader([closed], [], [], emptyTotals),
      shifts: new ShiftRepo([closed]),
      nozzleReadings: new ReadingRepo([]),
      stockMovements: new StockWriter(),
      summaries: new SummaryWriter(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', closingCash: 0 }, makeContext());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
  });

  it('rejects Tank Dip input because stock counts are a separate post-close action', async () => {
    const result = await new CloseShift({
      context: new ContextReader([openShiftRow()], [], [], emptyTotals),
      shifts: new ShiftRepo([openShiftRow()]),
      nozzleReadings: new ReadingRepo([]),
      stockMovements: new StockWriter(),
      summaries: new SummaryWriter(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute(
      {
        shiftId: 'sh-1',
        closingCash: 0,
        dipReadings: [{ tankId: 'tank-1', actualQuantity: 100 }],
      } as any,
      makeContext(),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
