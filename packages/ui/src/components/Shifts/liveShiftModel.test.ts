import { describe, expect, it } from 'vitest';
import {
  beforeCloseChecklist,
  drawerFigures,
  fuelTotals,
  liveShiftFigures,
  liveShiftState,
  nozzleGroups,
  productSales,
  takings,
  type NozzleReadingInput,
  type NozzleRow,
  type ShiftInput,
} from './liveShiftModel.js';

const TZ = 'Asia/Kolkata';
const OPENED = '2026-10-14T08:30:00.000Z'; // 14:00 IST
const BEFORE_END = Date.parse('2026-10-14T15:00:00.000Z'); // 20:30 IST
const AFTER_END = Date.parse('2026-10-14T17:00:00.000Z'); // 22:30 IST

const reading = (
  nozzleId: string,
  duId: string,
  product: string,
  opening: number,
  closing: number,
  rate: number,
) => ({
  nozzleId,
  nozzleName: nozzleId.toUpperCase(),
  duId,
  duCode: duId.toUpperCase(),
  productId: `p-${product}`,
  productName: product,
  unit: 'L',
  openingReading: opening.toFixed(3),
  closingReading: closing.toFixed(3),
  unitPrice: rate.toFixed(2),
});

const shift = (over: Partial<ShiftInput> = {}): ShiftInput => ({
  openedAt: OPENED,
  scheduledEndTime: '22:00',
  nozzleReadings: [
    reading('n3', 'du2', 'Petrol', 87420.6, 87420.6, 102.5),
    reading('n1', 'du1', 'Petrol', 124530.42, 124710.82, 102.5),
    reading('n2', 'du1', 'Diesel', 98210.115, 98510.365, 94.2),
    reading('n4', 'du2', 'Diesel', 65110.04, 65110.04, 94.2),
    reading('n9', 'du9', 'Diesel', 10, 12, 94.2),
  ],
  staffAssignments: [
    { userId: 'u2', userName: 'Suresh', duId: 'du2', duCode: 'DU2' },
    { userId: 'u1', userName: 'Ravi', duId: 'du1', duCode: 'DU1' },
  ],
  handovers: [
    {
      id: 'h1',
      userId: 'u1',
      duId: 'du1',
      cashHandedOver: '22500.00',
      cardHandedOver: '8500.10',
      upiHandedOver: '4524.55',
      creditHandedOver: '4000.00',
      varianceAmount: '120.00',
      cashDrops: '10000.00',
    },
  ],
  reconciliation: null,
  ...over,
});

describe('nozzleGroups', () => {
  it('groups the nozzles by Drawer in dispenser order, with unassigned nozzles last', () => {
    const groups = nozzleGroups(shift(), { now: BEFORE_END, timeZone: TZ });
    expect(groups.map((g) => g.label)).toEqual(['DU1 · Ravi', 'DU2 · Suresh', 'Unassigned']);
    expect(groups[0].rows.map((r) => r.nozzle)).toEqual(['N1', 'N2']);
    expect(groups[0].status).toBe('handover-recorded');
    expect(groups[1].status).toBe('handover-pending');
    expect(groups[2].status).toBeNull();
  });

  it('works out volume = closing − opening and value = volume × rate, to the paisa', () => {
    const [du1] = nozzleGroups(shift(), { now: BEFORE_END, timeZone: TZ });
    expect(du1.rows[0]).toMatchObject({ litres: 180.4, value: 18491, closing: 124710.82 });
    expect(du1.rows[1]).toMatchObject({ litres: 300.25, value: 28283.55 });
  });

  it('blanks an unmoved meter on a Drawer that has not handed over', () => {
    const [, du2] = nozzleGroups(shift(), { now: BEFORE_END, timeZone: TZ });
    expect(du2.rows[0]).toMatchObject({ closing: null, litres: null, value: null });
  });

  it('keeps a moved meter on a pending Drawer', () => {
    const groups = nozzleGroups(shift(), { now: BEFORE_END, timeZone: TZ });
    expect(groups[2].rows[0]).toMatchObject({ litres: 2, value: 188.4 });
  });

  it('reads a pending Drawer as Handover due after the scheduled end', () => {
    const [, du2] = nozzleGroups(shift(), { now: AFTER_END, timeZone: TZ });
    expect(du2.status).toBe('handover-due');
  });
});

describe('nozzle order (#244, carried over from the readings grid)', () => {
  const order = (rows: Partial<NozzleReadingInput>[]) =>
    nozzleGroups(
      {
        openedAt: OPENED,
        nozzleReadings: rows.map((r, i) => ({
          ...reading(`x${i}`, 'du', 'Petrol', 0, 0, 1),
          ...r,
        })),
      },
      { now: BEFORE_END },
    )[0].rows.map((r) => r.nozzle);

  it('orders by dispenser first, then nozzles naturally', () => {
    expect(
      order([
        { nozzleName: 'N10', duCode: 'DU-1' },
        { nozzleName: 'N1', duCode: 'DU-2' },
        { nozzleName: 'N2', duCode: 'DU-1' },
      ]),
    ).toEqual(['N2', 'N10', 'N1']);
  });

  it('keys the dispenser on its code, falling back to its name', () => {
    expect(
      order([
        { nozzleName: 'N1', duCode: 'DU-2', duName: 'Alpha' },
        { nozzleName: 'N2', duCode: 'DU-1', duName: 'Zulu' },
      ]),
    ).toEqual(['N2', 'N1']);
    expect(
      order([
        { nozzleName: 'N1', duCode: null, duName: 'DU-2' },
        { nozzleName: 'N2', duCode: null, duName: 'DU-1' },
      ]),
    ).toEqual(['N2', 'N1']);
  });

  it('ignores case', () => {
    expect(
      order([
        { nozzleName: 'n10', duCode: 'du-1' },
        { nozzleName: 'N2', duCode: 'DU-1' },
      ]),
    ).toEqual(['N2', 'n10']);
  });

  it('rounds a value to the paisa (₹1,02,078.13, not .132)', () => {
    const [g] = nozzleGroups(
      {
        openedAt: OPENED,
        nozzleReadings: [
          { ...reading('n1', 'du', 'Petrol', 1000, 0, 100), closingReading: '2020.78132' },
        ],
      },
      { now: BEFORE_END },
    );
    expect(g.rows[0].value).toBe(102078.13);
  });
});

describe('fuelTotals', () => {
  it('sums litres per unit and product, and the value in paise', () => {
    const rows = nozzleGroups(shift(), { now: BEFORE_END, timeZone: TZ }).flatMap((g) => g.rows);
    const t = fuelTotals(rows);
    expect(t.byUnit).toEqual([{ unit: 'L', litres: 482.65 }]);
    expect(t.byProduct.map((p) => [p.product, p.litres])).toEqual([
      ['Petrol', 180.4],
      ['Diesel', 302.25],
    ]);
    expect(t.value).toBe(46962.95);
  });

  it('sums 0.1 + 0.2 as 0.30', () => {
    const row = (value: number): NozzleRow => ({
      nozzleId: `n${value}`,
      nozzle: 'N',
      product: 'Petrol',
      productKey: 'p',
      unit: 'L',
      opening: 0,
      closing: 1,
      litres: 1,
      rate: value,
      value,
    });
    const t = fuelTotals([row(0.1), row(0.2)]);
    expect(t.value).toBe(0.3);
  });
});

describe('drawerFigures', () => {
  it('reads the server reconciliation when it lists the Drawers', () => {
    const d = drawerFigures(
      shift({
        reconciliation: {
          drawers: [
            { attendantId: 'u1', duId: 'du1', variance: -350, cashDrops: 8000 },
            { attendantId: 'u2', duId: 'du2', variance: null, cashDrops: 0 },
          ],
        },
      }),
    );
    expect(d).toMatchObject({
      expected: 2,
      recorded: 1,
      variance: -350,
      short: 1,
      surplus: 0,
      drops: 8000,
      dropDrawers: 1,
    });
    expect(d.flagged).toEqual([{ key: 'u1|du1', variance: -350 }]);
  });

  it('falls back to the Handovers before the reconciliation lists any Drawer', () => {
    const d = drawerFigures(shift());
    expect(d).toMatchObject({ variance: 120, surplus: 1, drops: 10000, recorded: 1 });
  });

  it('counts a half-paisa variance as balanced', () => {
    const d = drawerFigures(
      shift({
        reconciliation: { drawers: [{ attendantId: 'u1', duId: 'du1', variance: 0.004 }] },
      }),
    );
    expect(d.balanced).toBe(1);
    expect(d.flagged).toEqual([]);
  });
});

describe('takings', () => {
  it('reads card, UPI and credit from the Handovers and cash from the close summary', () => {
    expect(takings(shift(), 30500, { card: 1, upi: 1, credit: 1 })).toEqual({
      cash: 30500,
      card: 8500.1,
      upi: 4524.55,
      credit: 4000,
      nonCash: 17024.65,
      total: 47524.65,
    });
  });

  it('uses the shift totals before any Handover', () => {
    const t = takings(shift({ handovers: [] }), 0, { card: 100, upi: 50.5, credit: 0 });
    expect(t).toMatchObject({ card: 100, upi: 50.5, nonCash: 150.5, total: 150.5 });
  });
});

describe('productSales', () => {
  const assignments = shift().staffAssignments!;

  it('lists every attendant, then other sellers, then Unassigned', () => {
    const p = productSales({
      assignments,
      handoverSales: [
        { id: 'm1', attendantId: 'u1', attendantName: 'Ravi', totalAmount: '750.00' },
      ],
      billed: [
        { attendantId: 'u5', attendantName: 'Anita', totalAmount: '450.10' },
        { attendantId: null, totalAmount: '200.20' },
        { attendantId: 'u1', attendantName: 'Ravi', totalAmount: '300.00' },
      ],
    });
    expect(p.rows.map((r) => [r.name, r.billed, r.handover, r.total, r.onDrawer])).toEqual([
      ['Ravi', 300, 750, 1050, true],
      ['Suresh', 0, 0, 0, true],
      ['Anita', 450.1, 0, 450.1, false],
      ['Unassigned', 200.2, 0, 200.2, false],
    ]);
    expect(p.rows[0].handoverSale?.id).toBe('m1');
    expect(p).toMatchObject({ billed: 950.3, handover: 750, total: 1700.3 });
  });
});

describe('beforeCloseChecklist', () => {
  const money = (v: number) => `₹${v}`;

  it('is pending while a Drawer has not handed over, and links to its Handover', () => {
    const s = shift();
    const groups = nozzleGroups(s, { now: BEFORE_END, timeZone: TZ });
    const items = beforeCloseChecklist(groups, drawerFigures(s), money);
    expect(items.map((i) => [i.id, i.state, i.meta])).toEqual([
      ['readings', 'pending', '2 of 5 nozzles'],
      ['handovers', 'pending', '1 of 2 recorded'],
      ['drops', 'pending', '₹10000 · 1 drawer'],
      ['variances', 'warn', '1 over ₹100'],
      ['office-count', 'pending', 'At close'],
    ]);
    expect(items[1].action).toEqual({
      kind: 'handover',
      groupKey: 'u2|du2',
      label: 'Record DU2 · Suresh handover',
    });
    expect(items[3].action).toMatchObject({ kind: 'handover', groupKey: 'u1|du1' });
    expect(items[4].action).toMatchObject({ kind: 'close' });
  });

  it('is done once every Drawer handed over within the flag', () => {
    const s = shift({
      nozzleReadings: shift().nozzleReadings!.filter((r) => r.duId === 'du1'),
      staffAssignments: [{ userId: 'u1', userName: 'Ravi', duId: 'du1', duCode: 'DU1' }],
      handovers: [{ ...shift().handovers![0], varianceAmount: '0', cashDrops: '0' }],
    });
    const items = beforeCloseChecklist(
      nozzleGroups(s, { now: BEFORE_END, timeZone: TZ }),
      drawerFigures(s),
      money,
    );
    expect(items.map((i) => i.state)).toEqual(['done', 'done', 'done', 'done', 'pending']);
    expect(items[2].meta).toBe('None recorded');
    expect(items[3].meta).toBe('Within ₹100');
  });
});

describe('liveShiftFigures', () => {
  it('adds fuel and product sales into the Sales figure, in paise', () => {
    const f = liveShiftFigures({
      shift: shift(),
      cashDeclared: 30500,
      before: { card: 0, upi: 0, credit: 0 },
      handoverSales: [{ id: 'm1', attendantId: 'u1', totalAmount: '0.05' }],
      billed: [{ attendantId: null, totalAmount: '0.10' }],
      now: BEFORE_END,
      timeZone: TZ,
      formatMoney: String,
    });
    expect(f.fuel.value).toBe(46962.95);
    expect(f.sales).toBe(46963.1);
    expect(f.pending.map((g) => g.du)).toEqual(['DU2']);
    expect(f.checklist).toHaveLength(5);
  });
});

describe('liveShiftState', () => {
  it('is Live until the scheduled end, then Past scheduled end', () => {
    expect(liveShiftState({ openedAt: OPENED, scheduledEndTime: '22:00' }, BEFORE_END, TZ)).toBe(
      'shift-live',
    );
    expect(liveShiftState({ openedAt: OPENED, scheduledEndTime: '22:00' }, AFTER_END, TZ)).toBe(
      'shift-past-end',
    );
  });
});
