import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { GetAttendantHandoverReport } from './get-attendant-handover-report.js';
import type {
  AttendantHandoverReportQuery,
  AttendantHandoverReportReader,
  AttendantHandoverSourceRow,
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

/** Records the query it was asked for, so scoping can be asserted. */
class Reader implements AttendantHandoverReportReader {
  lastQuery: AttendantHandoverReportQuery | null = null;
  constructor(private readonly rows: AttendantHandoverSourceRow[]) {}
  async read(query: AttendantHandoverReportQuery) {
    this.lastQuery = query;
    return { handovers: this.rows };
  }
}

function run(rows: AttendantHandoverSourceRow[], input?: Partial<Record<string, unknown>>) {
  const reader = new Reader(rows);
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
});
