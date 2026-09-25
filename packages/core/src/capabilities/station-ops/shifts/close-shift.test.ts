import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { CloseShift, computeShiftCloseCash } from './close-shift.js';
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

const emptyTotals: ShiftReconciliationTotals = {
  cashSales: 0,
  openingFloat: 0,
  handoverCashDrops: 0,
  drawers: [],
};

/** Worked example pinned by #287 (owner decision, two-level variance). */
function workedExampleTotals(): ShiftReconciliationTotals {
  const drawers: ShiftReconciliationTotals['drawers'] = [
    {
      attendantId: 'a',
      attendantName: 'A',
      duId: 'du1',
      duName: 'DU-1',
      openingFloat: 1000,
      cashSales: 20000,
      cashDrops: 10000,
      expectedCash: 11000,
      cashHandedOver: 10800,
      variance: -200,
    },
    {
      attendantId: 'b',
      attendantName: 'B',
      duId: 'du2',
      duName: 'DU-2',
      openingFloat: 1000,
      cashSales: 15000,
      cashDrops: 0,
      expectedCash: 16000,
      cashHandedOver: 16000,
      variance: 0,
    },
  ];
  // Derived from the Handovers, as the reader does: Σ (declared − float + drops).
  // (The raw-row path is pinned in apps/api shift-recon-sql.test.ts.)
  const sum = (f: (d: (typeof drawers)[number]) => number) => drawers.reduce((s, d) => s + f(d), 0);
  return {
    cashSales: sum((d) => (d.cashHandedOver ?? 0) - d.openingFloat + d.cashDrops),
    openingFloat: sum((d) => d.openingFloat),
    handoverCashDrops: sum((d) => d.cashDrops),
    drawers,
  };
}

function closeWith(totals: ShiftReconciliationTotals) {
  const shifts = new ShiftRepo([openShiftRow()]);
  const readings = new ReadingRepo([reading()]);
  return new CloseShift({
    context: new ContextReader(shifts.rows, readings.rows, [nozzle()], totals),
    shifts,
    nozzleReadings: readings,
    stockMovements: new StockWriter(),
    summaries: new SummaryWriter(),
    events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
  });
}

describe('two-level cash variance (#287)', () => {
  it('pins the worked example: attendant −200, office −100, ledger 34,800', async () => {
    const result = await closeWith(workedExampleTotals()).execute(
      { shiftId: 'sh-1', closingCash: 26700 },
      makeContext(),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.snapshot).toMatchObject({
      expectedDrawerCash: 26800,
      attendantVariance: -200,
      cashVariance: -100,
      officeCountVariance: -100,
    });
    expect(result.data.cashSales).toBe(34800);
    expect(result.data.snapshot.cashVarianceModel).toBe(2);
  });

  it('a drop at close naming a Drawer reduces that Drawer expected cash', () => {
    const r = computeShiftCloseCash(workedExampleTotals(), 26800, [
      { attendantId: 'a', duId: 'du1', amount: 200 },
    ]);
    expect(r.drawers[0]).toMatchObject({ expectedCash: 10800, variance: 0, closeCashDrops: 200 });
    expect(r.attendantVariance).toBe(0);
    expect(r.expectedDrawerCash).toBe(26800);
    expect(r.cashVariance).toBe(0);
    expect(r.cashSales).toBe(35000);
  });

  it('a drop at close naming no Drawer goes to the office variance', () => {
    const r = computeShiftCloseCash(workedExampleTotals(), 26700, [{ amount: 100 }]);
    expect(r.attendantVariance).toBe(-200);
    expect(r.expectedDrawerCash).toBe(26700);
    expect(r.cashVariance).toBe(0);
    expect(r.cashSales).toBe(34800);
  });

  it('blocks close while a Drawer is not handed over', async () => {
    const totals = workedExampleTotals();
    totals.drawers[1] = {
      ...totals.drawers[1],
      cashSales: null,
      expectedCash: null,
      cashHandedOver: null,
      variance: null,
    };
    const result = await closeWith(totals).execute(
      { shiftId: 'sh-1', closingCash: 26700 },
      makeContext(),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a drop naming only the attendant or only the DU', async () => {
    for (const drop of [
      { attendantId: 'a', amount: 5 },
      { duId: 'du1', amount: 5 },
    ]) {
      const result = await closeWith(workedExampleTotals()).execute(
        { shiftId: 'sh-1', closingCash: 1, closeCashDrops: [drop] },
        makeContext(),
      );
      expect(result.success).toBe(false);
    }
  });

  it('rejects a drop naming a Drawer not on the shift', async () => {
    const result = await closeWith(workedExampleTotals()).execute(
      {
        shiftId: 'sh-1',
        closingCash: 1,
        closeCashDrops: [{ attendantId: 'z', duId: 'x', amount: 5 }],
      },
      makeContext(),
    );
    expect(result.success).toBe(false);
  });
});

describe('CloseShift', () => {
  it('sums four Drawers with different floats and one drop (#278)', async () => {
    const drawer = (i: number, openingFloat: number, cashSales: number, cashDrops = 0) => {
      const expectedCash = openingFloat + cashSales - cashDrops;
      return {
        attendantId: `a${i}`,
        attendantName: `A${i}`,
        duId: `du${i}`,
        duName: `DU-${i}`,
        openingFloat,
        cashSales,
        cashDrops,
        expectedCash,
        cashHandedOver: expectedCash,
        variance: 0,
      };
    };
    const drawers = [
      drawer(1, 500, 4000),
      drawer(2, 1000, 3000, 2000),
      drawer(3, 0, 1500),
      drawer(4, 250, 800),
    ];
    const shifts = new ShiftRepo([openShiftRow()]);
    const readings = new ReadingRepo([reading()]);
    const context = new ContextReader(shifts.rows, readings.rows, [nozzle()], {
      ...emptyTotals,
      cashSales: 9300,
      openingFloat: 1750,
      handoverCashDrops: 2000,
      drawers,
    });
    const result = await new CloseShift({
      context,
      shifts,
      nozzleReadings: readings,
      stockMovements: new StockWriter(),
      summaries: new SummaryWriter(),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ shiftId: 'sh-1', closingCash: 9050 }, makeContext());
    expect(result.success).toBe(true);
    if (!result.success) return;
    // 1750 floats + 9300 cash sales − 2000 dropped = 9050, the Σ of the Drawers.
    expect(result.data.snapshot).toMatchObject({
      openingCash: 1750,
      cashDrops: 2000,
      expectedDrawerCash: 9050,
      cashVariance: 0,
      drawers,
    });
    expect(drawers.reduce((s, d) => s + d.expectedCash, 0)).toBe(9050);
    // The ledger still receives true cash sales, never the floats.
    expect(result.data.cashSales).toBe(9300);
  });

  it('finalizes readings, records sale movement, reconciles drawer (variance 0)', async () => {
    const shifts = new ShiftRepo([openShiftRow()]);
    const readings = new ReadingRepo([reading()]);
    const context = new ContextReader(shifts.rows, readings.rows, [nozzle()], {
      ...emptyTotals,
      cashSales: 1700,
      openingFloat: 5000,
    });
    const stock = new StockWriter();
    const summaries = new SummaryWriter();
    const store = new InMemoryEventStore();
    const events = new InProcessEventDispatcher({ store });

    // expected = floats 5000 + cash sales 1700 = 6700; declare 6700 -> variance 0
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
