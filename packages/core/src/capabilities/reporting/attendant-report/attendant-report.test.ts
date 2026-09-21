import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { GetAttendantHandoverReport } from './get-attendant-handover-report.js';
import type {
  AttendantCreditSaleSourceRow,
  AttendantHandoverReportQuery,
  AttendantHandoverReportReader,
  AttendantHandoverSourceRow,
  AttendantNozzleReadingSourceRow,
  AttendantSaleSourceRow,
  AttendantTerminalEntrySourceRow,
} from './ports.js';

const ORG = 'org-1';
const STATION = 'station-1';

function ctx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    organizationId: ORG,
    stationId: STATION,
    actorId: 'user-owner',
    role: 'Owner',
    clock: new FixedClock(new Date('2026-03-10T06:00:00.000Z')),
    ids: new SequentialIdGenerator('id'),
    ...overrides,
  } as ExecutionContext;
}

function row(over: Partial<AttendantHandoverSourceRow> = {}): AttendantHandoverSourceRow {
  return {
    handoverId: 'h-1',
    shiftId: 'shift-1',
    businessDate: '2026-03-01',
    shiftTemplateName: 'Morning',
    closedAt: '2026-03-01T14:00:00.000Z',
    attendantId: 'att-1',
    attendantName: 'Ravi',
    duId: 'du-1',
    duName: 'DU 1',
    cashHandedOver: 1000,
    cardHandedOver: 200,
    upiHandedOver: 300,
    creditHandedOver: 100,
    expectedFuelSales: 1650,
    varianceAmount: -50,
    testingVolume: 5,
    ...over,
  };
}

interface SourceOverrides {
  sales?: AttendantSaleSourceRow[];
  creditSales?: AttendantCreditSaleSourceRow[];
  terminalEntries?: AttendantTerminalEntrySourceRow[];
  nozzleReadings?: AttendantNozzleReadingSourceRow[];
}

/** Records the query it was asked for, so scoping can be asserted. */
class Reader implements AttendantHandoverReportReader {
  lastQuery: AttendantHandoverReportQuery | null = null;
  constructor(
    private readonly rows: AttendantHandoverSourceRow[],
    private readonly extra: SourceOverrides = {},
  ) {}
  async read(query: AttendantHandoverReportQuery) {
    this.lastQuery = query;
    return {
      handovers: this.rows,
      sales: this.extra.sales ?? [],
      creditSales: this.extra.creditSales ?? [],
      terminalEntries: this.extra.terminalEntries ?? [],
      nozzleReadings: this.extra.nozzleReadings ?? [],
    };
  }
}

function run(
  rows: AttendantHandoverSourceRow[],
  input?: Partial<Record<string, unknown>>,
  extra: SourceOverrides = {},
) {
  const reader = new Reader(rows, extra);
  const useCase = new GetAttendantHandoverReport({ reader });
  return {
    reader,
    result: useCase.execute(
      { stationId: STATION, from: '2026-03-01', to: '2026-03-31', ...input } as never,
      ctx(),
    ),
  };
}

describe('GetAttendantHandoverReport', () => {
  it('groups handovers per attendant and sums the period totals', async () => {
    const { result } = run([
      row({ handoverId: 'h-1', shiftId: 's-1', cashHandedOver: 1000, varianceAmount: -50 }),
      row({
        handoverId: 'h-2',
        shiftId: 's-2',
        businessDate: '2026-03-02',
        cashHandedOver: 500,
        varianceAmount: 20,
      }),
      row({
        handoverId: 'h-3',
        shiftId: 's-1',
        attendantId: 'att-2',
        attendantName: 'Suresh',
        cashHandedOver: 700,
        varianceAmount: 0,
      }),
    ]);
    const res = await result;
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.attendants).toHaveLength(2);
    const ravi = res.data.attendants.find((a) => a.attendantId === 'att-1');
    expect(ravi?.attendantName).toBe('Ravi');
    expect(ravi?.shiftsWorked).toBe(2);
    expect(ravi?.handoverCount).toBe(2);
    expect(ravi?.totals.cashHandedOver).toBe(1500);
    expect(ravi?.totals.varianceAmount).toBe(-30);
    expect(ravi?.shifts).toHaveLength(2);
  });

  it('counts distinct shifts once when an attendant hands over two dispensers in one shift', async () => {
    const { result } = run([
      row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-1', cashHandedOver: 100 }),
      row({ handoverId: 'h-2', shiftId: 's-1', duId: 'du-2', cashHandedOver: 200 }),
    ]);
    const res = await result;
    if (!res.success) throw new Error('expected success');
    expect(res.data.attendants[0].shiftsWorked).toBe(1);
    expect(res.data.attendants[0].handoverCount).toBe(2);
    expect(res.data.attendants[0].totals.cashHandedOver).toBe(300);
    expect(res.data.attendants[0].shifts).toHaveLength(1);
    expect(res.data.attendants[0].shifts[0].dispensers).toHaveLength(2);
  });

  it('returns an empty attendant list when no handovers fall in the range', async () => {
    const { result } = run([]);
    const res = await result;
    if (!res.success) throw new Error('expected success');
    expect(res.data.attendants).toEqual([]);
    expect(res.data.from).toBe('2026-03-01');
    expect(res.data.to).toBe('2026-03-31');
  });

  it('scopes the read to the context organization and the requested station', async () => {
    const { reader, result } = run([row()]);
    await result;
    expect(reader.lastQuery).toMatchObject({
      organizationId: ORG,
      stationId: STATION,
      from: '2026-03-01',
      to: '2026-03-31',
    });
  });

  it('passes the attendant filter through to the reader', async () => {
    const { reader, result } = run([row()], { attendantId: 'att-1' });
    await result;
    expect(reader.lastQuery?.attendantId).toBe('att-1');
  });

  it('rejects a station the execution context is not scoped to', async () => {
    const useCase = new GetAttendantHandoverReport({ reader: new Reader([row()]) });
    const res = await useCase.execute(
      { stationId: 'other-station', from: '2026-03-01', to: '2026-03-31' },
      ctx({ stationId: STATION }),
    );
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe('FORBIDDEN');
  });

  it('rejects an inverted or malformed date range', async () => {
    const useCase = new GetAttendantHandoverReport({ reader: new Reader([]) });
    const inverted = await useCase.execute(
      { stationId: STATION, from: '2026-03-31', to: '2026-03-01' },
      ctx(),
    );
    expect(inverted.success).toBe(false);
    if (!inverted.success) expect(inverted.error.code).toBe('VALIDATION_ERROR');

    const malformed = await useCase.execute(
      { stationId: STATION, from: '01-03-2026', to: '2026-03-31' },
      ctx(),
    );
    expect(malformed.success).toBe(false);
    if (!malformed.success) expect(malformed.error.code).toBe('VALIDATION_ERROR');
  });

  it('orders attendants by name and their shifts by business date', async () => {
    const { result } = run([
      row({ attendantId: 'att-2', attendantName: 'Suresh', shiftId: 's-9' }),
      row({ handoverId: 'h-2', shiftId: 's-2', businessDate: '2026-03-05' }),
      row({ handoverId: 'h-3', shiftId: 's-3', businessDate: '2026-03-02' }),
    ]);
    const res = await result;
    if (!res.success) throw new Error('expected success');
    expect(res.data.attendants.map((a) => a.attendantName)).toEqual(['Ravi', 'Suresh']);
    expect(res.data.attendants[0].shifts.map((s) => s.businessDate)).toEqual([
      '2026-03-02',
      '2026-03-05',
    ]);
  });

  describe('sales components', () => {
    const sale = (over: Partial<AttendantSaleSourceRow>): AttendantSaleSourceRow => ({
      shiftId: 's-1',
      attendantId: 'att-1',
      captureMechanism: 'POS',
      totalAmount: 0,
      ...over,
    });

    it('splits non-fuel sales into billed and handover product sales', async () => {
      const { result } = run([row({ shiftId: 's-1' })], undefined, {
        sales: [
          sale({ captureMechanism: 'POS', totalAmount: 250 }),
          sale({ captureMechanism: 'POS', totalAmount: 150 }),
          sale({ captureMechanism: 'MERCH_HANDOVER', totalAmount: 900 }),
        ],
      });
      const res = await result;
      if (!res.success) throw new Error('expected success');
      const totals = res.data.attendants[0].totals;
      expect(totals.billedSales).toBe(400);
      expect(totals.handoverProductSales).toBe(900);
      // The bulk declaration is never also counted as a billed sale.
      expect(totals.billedSales + totals.handoverProductSales).toBe(1300);
    });

    it('attributes fuel-on-credit chits to the attendant who raised them', async () => {
      const { result } = run(
        [row({ shiftId: 's-1' }), row({ handoverId: 'h-2', shiftId: 's-2' })],
        undefined,
        {
          creditSales: [
            { shiftId: 's-1', attendantId: 'att-1', duId: 'du-1', amount: 800 },
            { shiftId: 's-2', attendantId: 'att-1', duId: 'du-1', amount: 200 },
            { shiftId: 's-1', attendantId: 'att-2', duId: 'du-1', amount: 999 },
          ],
        },
      );
      const res = await result;
      if (!res.success) throw new Error('expected success');
      const ravi = res.data.attendants.find((a) => a.attendantId === 'att-1');
      expect(ravi?.totals.creditSales).toBe(1000);
      expect(ravi?.shifts.find((s) => s.shiftId === 's-1')?.creditSales).toBe(800);
    });

    it('attributes a credit chit to the dispenser it was dispensed from', async () => {
      const { result } = run(
        [
          row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-1', duName: 'DU 1' }),
          row({ handoverId: 'h-2', shiftId: 's-1', duId: 'du-2', duName: 'DU 2' }),
        ],
        undefined,
        {
          creditSales: [
            { shiftId: 's-1', attendantId: 'att-1', duId: 'du-1', amount: 800 },
            { shiftId: 's-1', attendantId: 'att-1', duId: 'du-2', amount: 200 },
          ],
        },
      );
      const res = await result;
      if (!res.success) throw new Error('expected success');
      const [du1, du2] = res.data.attendants[0].shifts[0].dispensers;
      expect(du1.creditSales).toBe(800);
      expect(du2.creditSales).toBe(200);
      // The shift line still totals the attendant's chits once.
      expect(res.data.attendants[0].shifts[0].creditSales).toBe(1000);
    });

    it('counts a chit with no dispenser toward the shift but under no dispenser', async () => {
      const { result } = run(
        [row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-1' })],
        undefined,
        {
          creditSales: [{ shiftId: 's-1', attendantId: 'att-1', duId: null, amount: 500 }],
        },
      );
      const res = await result;
      if (!res.success) throw new Error('expected success');
      expect(res.data.attendants[0].shifts[0].creditSales).toBe(500);
      expect(res.data.attendants[0].shifts[0].dispensers[0].creditSales).toBe(0);
    });

    it('counts a shift component once even when the attendant worked two dispensers', async () => {
      const { result } = run(
        [
          row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-1' }),
          row({ handoverId: 'h-2', shiftId: 's-1', duId: 'du-2' }),
        ],
        undefined,
        {
          sales: [sale({ captureMechanism: 'POS', totalAmount: 500 })],
          creditSales: [{ shiftId: 's-1', attendantId: 'att-1', duId: 'du-1', amount: 300 }],
        },
      );
      const res = await result;
      if (!res.success) throw new Error('expected success');
      expect(res.data.attendants[0].totals.billedSales).toBe(500);
      expect(res.data.attendants[0].totals.creditSales).toBe(300);
    });

    it('reports zero components for a shift with none, without inventing a grand total', async () => {
      const { result } = run([row({ expectedFuelSales: 1650 })]);
      const res = await result;
      if (!res.success) throw new Error('expected success');
      const totals = res.data.attendants[0].totals;
      expect(totals.billedSales).toBe(0);
      expect(totals.handoverProductSales).toBe(0);
      expect(totals.creditSales).toBe(0);
      // Fuel expected stays its own component.
      expect(totals.expectedFuelSales).toBe(1650);
    });
  });

  describe('per-shift detail', () => {
    const reading = (
      over: Partial<AttendantNozzleReadingSourceRow>,
    ): AttendantNozzleReadingSourceRow => ({
      shiftId: 's-1',
      duId: 'du-1',
      nozzleId: 'n-1',
      nozzleName: 'N1',
      productName: 'Petrol',
      openingReading: 1000,
      closingReading: 1100,
      volumeSold: 100,
      testingVolume: 2,
      unitPrice: 100,
      ...over,
    });

    it('attaches each dispenser only the nozzle readings of that dispenser', async () => {
      const { result } = run(
        [
          row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-1', duName: 'DU 1' }),
          row({ handoverId: 'h-2', shiftId: 's-1', duId: 'du-2', duName: 'DU 2' }),
        ],
        undefined,
        {
          nozzleReadings: [
            reading({ duId: 'du-1', nozzleId: 'n-1', nozzleName: 'N1' }),
            reading({ duId: 'du-2', nozzleId: 'n-2', nozzleName: 'N2' }),
          ],
        },
      );
      const res = await result;
      if (!res.success) throw new Error('expected success');
      const dispensers = res.data.attendants[0].shifts[0].dispensers;
      expect(dispensers.map((d) => d.nozzles.map((n) => n.nozzleId))).toEqual([['n-1'], ['n-2']]);
    });

    it('lists nozzles in natural order, so N10 follows N2 rather than N1', async () => {
      // #218: lexicographic order printed N1, N10, N2 on the statement PDF
      // while the drawer showed raw row order — three surfaces, three answers.
      const { result } = run(
        [row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-1' })],
        undefined,
        {
          nozzleReadings: [
            reading({ nozzleId: 'n-10', nozzleName: 'N10' }),
            reading({ nozzleId: 'n-2', nozzleName: 'N2' }),
            reading({ nozzleId: 'n-1', nozzleName: 'N1' }),
          ],
        },
      );
      const res = await result;
      if (!res.success) throw new Error('expected success');

      expect(
        res.data.attendants[0].shifts[0].dispensers[0].nozzles.map((n) => n.nozzleName),
      ).toEqual(['N1', 'N2', 'N10']);
    });

    it('orders dispenser groups naturally too', async () => {
      const { result } = run([
        row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-10', duName: 'DU 10' }),
        row({ handoverId: 'h-2', shiftId: 's-1', duId: 'du-2', duName: 'DU 2' }),
      ]);
      const res = await result;
      if (!res.success) throw new Error('expected success');

      expect(res.data.attendants[0].shifts[0].dispensers.map((d) => d.duName)).toEqual([
        'DU 2',
        'DU 10',
      ]);
    });

    it('attaches terminal declarations to the handover that declared them', async () => {
      const { result } = run(
        [
          row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-1', duName: 'DU 1' }),
          row({ handoverId: 'h-2', shiftId: 's-1', duId: 'du-2', duName: 'DU 2' }),
        ],
        undefined,
        {
          terminalEntries: [
            {
              handoverId: 'h-1',
              terminalId: 't-1',
              terminalName: 'HDFC 01',
              cardAmount: 200,
              upiAmount: 300,
              batchRef: 'B-77',
            },
          ],
        },
      );
      const res = await result;
      if (!res.success) throw new Error('expected success');
      const [du1, du2] = res.data.attendants[0].shifts[0].dispensers;
      expect(du1.terminals).toHaveLength(1);
      expect(du1.terminals[0]).toMatchObject({ terminalName: 'HDFC 01', batchRef: 'B-77' });
      expect(du2.terminals).toEqual([]);
    });

    it('leaves terminals empty at a station that declares aggregates only', async () => {
      const { result } = run([row({ cardHandedOver: 200, upiHandedOver: 300 })]);
      const res = await result;
      if (!res.success) throw new Error('expected success');
      const dispenser = res.data.attendants[0].shifts[0].dispensers[0];
      expect(dispenser.terminals).toEqual([]);
      // The aggregate declaration still stands on the handover itself.
      expect(dispenser.cardHandedOver).toBe(200);
      expect(dispenser.upiHandedOver).toBe(300);
    });

    it('sums a shift variance across its dispensers', async () => {
      const { result } = run([
        row({ handoverId: 'h-1', shiftId: 's-1', duId: 'du-1', varianceAmount: -50 }),
        row({ handoverId: 'h-2', shiftId: 's-1', duId: 'du-2', varianceAmount: 20 }),
      ]);
      const res = await result;
      if (!res.success) throw new Error('expected success');
      expect(res.data.attendants[0].shifts[0].varianceAmount).toBe(-30);
      expect(res.data.attendants[0].totals.varianceAmount).toBe(-30);
    });
  });
});
